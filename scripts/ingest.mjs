#!/usr/bin/env node

import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runDirectory = path.join(projectRoot, ".run");
const lockDirectory = path.join(runDirectory, "ingest.lock");
const lockFile = path.join(lockDirectory, "owner.json");

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

async function acquireLock() {
  await mkdir(runDirectory, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lockDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner = null;
    try { owner = JSON.parse(await readFile(lockFile, "utf8")); } catch {}
    const age = Date.now() - (await stat(lockDirectory)).mtimeMs;
    if (owner?.pid) {
      try {
        process.kill(owner.pid, 0);
        throw new Error(`已有采集任务运行：PID ${owner.pid}`);
      } catch (signalError) {
        if (signalError?.code !== "ESRCH") throw signalError;
      }
    } else if (age < 2 * 3_600_000) {
      throw new Error("采集锁缺少有效 owner，且未超过两小时安全失效时间");
    }
    await rm(lockDirectory, { recursive: true, force: true });
    await mkdir(lockDirectory, { mode: 0o700 });
  }
  const handle = await open(lockFile, "wx", 0o600);
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  await handle.close();
}

async function releaseLock() {
  await rm(lockDirectory, { recursive: true, force: true });
}

function triggerFromArgs() {
  const index = process.argv.indexOf("--trigger");
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : "manual";
}

await acquireLock();
try {
  const { runIngestion } = await import("../radar/pipeline.mjs");
  const result = await runIngestion({ trigger: triggerFromArgs() });
  console.log(JSON.stringify({ service: "agent-radar", task: "ingest", ...result }, null, 2));
} finally {
  await releaseLock();
}
