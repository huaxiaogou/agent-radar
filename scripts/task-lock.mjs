import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const LOCK_NAME = "ingest.lock";
const OWNER_FILE_NAME = "owner.json";
const OWNERLESS_STALE_AFTER_MS = 2 * 3_600_000;
const MAX_ACQUIRE_ATTEMPTS = 32;
const TEST_STALE_PAUSE_TIMEOUT_MS = 5_000;

let heldLock = null;

function lockPaths() {
  const configuredRunDirectory = String(process.env.RADAR_RUN_DIR || "").trim();
  const runDirectory = path.resolve(configuredRunDirectory || path.join(projectRoot, ".run"));
  const lockDirectory = path.join(runDirectory, LOCK_NAME);
  return {
    runDirectory,
    lockDirectory,
    lockFile: path.join(lockDirectory, OWNER_FILE_NAME),
  };
}

async function readOwner(lockFile) {
  try {
    const owner = JSON.parse(await readFile(lockFile, "utf8"));
    return owner && typeof owner === "object" ? owner : null;
  } catch {
    return null;
  }
}

function normalizedOwner(owner) {
  if (!owner || typeof owner !== "object") return null;
  return {
    pid: Number.isInteger(Number(owner.pid)) ? Number(owner.pid) : null,
    startedAt: typeof owner.startedAt === "string" ? owner.startedAt : null,
    ownerToken: typeof owner.ownerToken === "string" ? owner.ownerToken : null,
    processIdentity: typeof owner.processIdentity === "string" ? owner.processIdentity : null,
  };
}

async function observeLock(paths) {
  let before;
  try {
    before = await stat(paths.lockDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const owner = normalizedOwner(await readOwner(paths.lockFile));
  let after;
  try {
    after = await stat(paths.lockDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (before.dev !== after.dev || before.ino !== after.ino) return null;
  return {
    owner,
    directoryIdentity: `${after.dev}:${after.ino}`,
    mtimeMs: after.mtimeMs,
  };
}

function sameObservation(left, right) {
  return Boolean(left && right)
    && left.directoryIdentity === right.directoryIdentity
    && left.owner?.pid === right.owner?.pid
    && left.owner?.startedAt === right.owner?.startedAt
    && left.owner?.ownerToken === right.owner?.ownerToken
    && left.owner?.processIdentity === right.owner?.processIdentity;
}

function observationFingerprint(observation) {
  return createHash("sha256").update(JSON.stringify({
    directoryIdentity: observation.directoryIdentity,
    pid: observation.owner?.pid || null,
    startedAt: observation.owner?.startedAt || null,
    ownerToken: observation.owner?.ownerToken || null,
    processIdentity: observation.owner?.processIdentity || null,
  })).digest("hex").slice(0, 24);
}

async function maybePauseAfterStaleObservation(observation) {
  const observedFile = String(process.env.RADAR_TEST_TASK_LOCK_STALE_OBSERVED_FILE || "").trim();
  const continueFile = String(process.env.RADAR_TEST_TASK_LOCK_CONTINUE_FILE || "").trim();
  if (!observedFile || !continueFile) return;

  await mkdir(path.dirname(observedFile), { recursive: true, mode: 0o700 });
  let signalHandle;
  try {
    signalHandle = await open(observedFile, "wx", 0o600);
    await signalHandle.writeFile(JSON.stringify(observation));
    await signalHandle.sync();
    await signalHandle.close();
    signalHandle = undefined;
  } catch (error) {
    await signalHandle?.close().catch(() => {});
    throw error;
  }

  const deadline = Date.now() + TEST_STALE_PAUSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await readFile(continueFile, "utf8");
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("等待 stale lock 测试继续信号超时");
}

function executeFile(command, arguments_) {
  return new Promise((resolve, reject) => {
    execFile(command, arguments_, {
      env: { ...process.env, LC_ALL: "C" },
      timeout: 2_000,
      maxBuffer: 4_096,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

async function processIdentityForPid(pid) {
  if (process.platform === "linux") {
    const statLine = await readFile(`/proc/${pid}/stat`, "utf8");
    const commandEnd = statLine.lastIndexOf(")");
    if (commandEnd < 0) throw new Error(`无法解析 /proc/${pid}/stat`);
    const fieldsAfterCommand = statLine.slice(commandEnd + 2).trim().split(/\s+/);
    const startTime = fieldsAfterCommand[19];
    if (!startTime) throw new Error(`无法读取 PID ${pid} 的 starttime`);
    return `proc-starttime:${startTime}`;
  }
  if (process.platform !== "win32") {
    const startedAt = (await executeFile("ps", ["-o", "lstart=", "-p", String(pid)]))
      .trim()
      .replace(/\s+/g, " ");
    if (!startedAt) throw new Error(`无法读取 PID ${pid} 的 lstart`);
    return `ps-lstart:${startedAt}`;
  }
  throw new Error(`平台 ${process.platform} 不支持可靠的进程身份查询`);
}

async function ownerProcessIsAlive(owner) {
  const pid = Number(owner?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
  if (typeof owner.processIdentity !== "string" || !owner.processIdentity) return true;
  try {
    return await processIdentityForPid(pid) === owner.processIdentity;
  } catch {
    return true;
  }
}

function quarantinePath(lockDirectory, action) {
  return `${lockDirectory}.${action}-${process.pid}-${randomUUID()}`;
}

async function quarantineAndRemove(lockDirectory, action) {
  const quarantine = quarantinePath(lockDirectory, action);
  try {
    await rename(lockDirectory, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  await rm(quarantine, { recursive: true, force: true });
  return true;
}

async function acquireReclaimClaim(paths, observation, processIdentity) {
  const fingerprint = observationFingerprint(observation);
  const claimFile = path.join(paths.lockDirectory, `.reclaim-${fingerprint}.claim`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claim = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      ownerToken: randomUUID(),
      processIdentity,
      observedPid: observation.owner?.pid || null,
      observedStartedAt: observation.owner?.startedAt || null,
      observedOwnerToken: observation.owner?.ownerToken || null,
      observedDirectoryIdentity: observation.directoryIdentity,
    };
    let claimHandle;
    try {
      claimHandle = await open(claimFile, "wx", 0o600);
      await claimHandle.writeFile(JSON.stringify(claim));
      await claimHandle.sync();
      await claimHandle.close();
      return { ...claim, claimFile };
    } catch (error) {
      await claimHandle?.close().catch(() => {});
      if (error?.code !== "EEXIST") {
        await rm(claimFile, { force: true }).catch(() => {});
        throw error;
      }
      const existingClaim = await readOwner(claimFile);
      if (existingClaim?.pid && await ownerProcessIsAlive(existingClaim)) {
        throw new Error(`已有任务正在回收 stale 锁：PID ${existingClaim.pid}`);
      }
      if (!existingClaim?.pid) {
        let claimAge;
        try {
          claimAge = Date.now() - (await stat(claimFile)).mtimeMs;
        } catch (statError) {
          if (statError?.code === "ENOENT") continue;
          throw statError;
        }
        if (claimAge < OWNERLESS_STALE_AFTER_MS) {
          throw new Error("stale lock reclaim claim 尚未写入有效 owner，拒绝并发回收");
        }
      }
      const current = await observeLock(paths);
      if (!sameObservation(observation, current)) return null;
      await rm(claimFile, { force: true });
    }
  }
  throw new Error("未能安全获得 stale lock reclaim claim");
}

async function reclaimStaleLock(paths, observation, processIdentity) {
  const beforeClaim = await observeLock(paths);
  if (!sameObservation(observation, beforeClaim)) return false;
  const claim = await acquireReclaimClaim(paths, observation, processIdentity);
  if (!claim) return false;

  let moved = false;
  const quarantine = quarantinePath(paths.lockDirectory, "stale");
  try {
    const beforeMove = await observeLock(paths);
    if (!sameObservation(observation, beforeMove)) return false;
    await rename(paths.lockDirectory, quarantine);
    moved = true;
    const movedObservation = await observeLock({
      lockDirectory: quarantine,
      lockFile: path.join(quarantine, OWNER_FILE_NAME),
    });
    if (!sameObservation(observation, movedObservation)) {
      try {
        await rename(quarantine, paths.lockDirectory);
        moved = false;
      } catch {
        // 保留 quarantine 供人工检查，绝不删除身份不匹配的锁。
      }
      throw new Error("stale lock 身份在移动前发生变化，拒绝删除");
    }
    await rm(quarantine, { recursive: true, force: true });
    moved = false;
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  } finally {
    if (!moved) await rm(claim.claimFile, { force: true }).catch(() => {});
  }
}

async function cleanFailedAcquisition(handle) {
  const owner = await readOwner(handle.lockFile);
  if (owner && (Number(owner.pid) !== handle.pid || owner.ownerToken !== handle.ownerToken)) return;
  await quarantineAndRemove(handle.lockDirectory, "abandoned").catch(() => {});
}

export async function acquireTaskLock() {
  if (heldLock) throw new Error(`本进程已经持有任务锁：${heldLock.lockDirectory}`);

  const paths = lockPaths();
  const processIdentity = await processIdentityForPid(process.pid);
  await mkdir(paths.runDirectory, { recursive: true, mode: 0o700 });

  for (let attempt = 1; attempt <= MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    try {
      await mkdir(paths.lockDirectory, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const observation = await observeLock(paths);
      if (!observation) continue;
      const owner = observation.owner;
      if (owner?.pid && await ownerProcessIsAlive(owner)) {
        throw new Error(`已有采集或分析回填任务运行：PID ${owner.pid}`);
      }
      if (!owner?.pid) {
        const age = Date.now() - observation.mtimeMs;
        if (age < OWNERLESS_STALE_AFTER_MS) {
          throw new Error("共享任务锁缺少有效 owner，且未超过两小时安全失效时间");
        }
      }
      await maybePauseAfterStaleObservation(observation);
      await reclaimStaleLock(paths, observation, processIdentity);
      continue;
    }

    const handle = {
      ...paths,
      pid: process.pid,
      ownerToken: randomUUID(),
      processIdentity,
    };
    let ownerHandle;
    try {
      ownerHandle = await open(handle.lockFile, "wx", 0o600);
      await ownerHandle.writeFile(JSON.stringify({
        pid: handle.pid,
        startedAt: new Date().toISOString(),
        ownerToken: handle.ownerToken,
        processIdentity: handle.processIdentity,
      }));
      await ownerHandle.sync();
      await ownerHandle.close();
      ownerHandle = undefined;
      heldLock = handle;
      return handle;
    } catch (error) {
      await ownerHandle?.close().catch(() => {});
      await cleanFailedAcquisition(handle);
      throw error;
    }
  }

  throw new Error("任务锁竞争过于频繁，未能安全获得 owner");
}

export async function releaseTaskLock(handle = heldLock) {
  if (!handle || handle.pid !== process.pid) return false;
  const owner = await readOwner(handle.lockFile);
  if (Number(owner?.pid) !== handle.pid || owner?.ownerToken !== handle.ownerToken) {
    if (heldLock === handle) heldLock = null;
    return false;
  }

  const quarantine = quarantinePath(handle.lockDirectory, "release");
  try {
    await rename(handle.lockDirectory, quarantine);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (heldLock === handle) heldLock = null;
    return false;
  }
  if (heldLock === handle) heldLock = null;
  await rm(quarantine, { recursive: true, force: true });
  return true;
}
