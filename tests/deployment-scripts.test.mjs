import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const nginxScriptUrl = new URL("../scripts/configure-nginx.sh", import.meta.url);
const projectRoot = path.resolve(new URL("../", import.meta.url).pathname);
const taskLockModule = new URL("../scripts/task-lock.mjs", import.meta.url).href;

const LOCK_CLIENT_SOURCE = String.raw`
const { acquireTaskLock, releaseTaskLock } = await import(process.env.RADAR_TEST_TASK_LOCK_MODULE);
const mode = process.env.RADAR_TEST_LOCK_MODE;
try {
  if (mode === "release-only") {
    await releaseTaskLock();
    console.log("RELEASE_ATTEMPTED");
  } else {
    await acquireTaskLock();
    console.log("ACQUIRED");
    if (mode === "hold") {
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.RADAR_TEST_LOCK_HOLD_MS || 1200)));
    }
    await releaseTaskLock();
    console.log("RELEASED");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 17;
}
`;

function lockClientEnvironment(runDirectory, mode, holdMilliseconds, extraEnvironment = {}) {
  return {
    ...process.env,
    RADAR_RUN_DIR: runDirectory,
    RADAR_TEST_TASK_LOCK_MODULE: taskLockModule,
    RADAR_TEST_LOCK_MODE: mode,
    RADAR_TEST_LOCK_HOLD_MS: String(holdMilliseconds || 1200),
    ...extraEnvironment,
  };
}

function spawnLockHolder(runDirectory, holdMilliseconds = 1200, extraEnvironment = {}) {
  const child = spawn(process.execPath, ["--input-type=module", "--eval", LOCK_CLIENT_SOURCE], {
    cwd: projectRoot,
    env: lockClientEnvironment(runDirectory, "hold", holdMilliseconds, extraEnvironment),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  let resolveAcquired;
  const acquired = new Promise((resolve) => { resolveAcquired = resolve; });
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    if (!settled && stdout.includes("ACQUIRED")) {
      settled = true;
      resolveAcquired(true);
    }
  });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("exit", () => {
    if (!settled) {
      settled = true;
      resolveAcquired(false);
    }
  });
  return { child, acquired, output: () => ({ stdout, stderr }) };
}

async function finishLockHolder(holder) {
  if (holder.child.exitCode !== null) return holder.child.exitCode;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      holder.child.kill("SIGTERM");
    }, 5_000);
    holder.child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

function runLockClient(runDirectory, mode = "once") {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", LOCK_CLIENT_SOURCE], {
    cwd: projectRoot,
    env: lockClientEnvironment(runDirectory, mode),
    encoding: "utf8",
    timeout: 10_000,
  });
}

async function waitForFile(filePath, timeoutMilliseconds = 2_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`等待任务锁测试同步点超时：${filePath}`);
}

test("Nginx deployment configures HTTPS and protects sibling sites", async () => {
  const source = await readFile(nginxScriptUrl, "utf8");

  assert.match(source, /listen 443 ssl;/u);
  assert.match(source, /return 301 https:\/\/\\\$host\\\$request_uri;/u);
  assert.match(source, /openssl x509[\s\S]*-checkhost "\$\{DOMAIN\}"/u);
  assert.match(source, /key_matches_certificate/u);
  assert.match(source, /127\.0\.0\.1:3000/u);
  assert.match(source, /LoanRisk Coursebook/u);
  assert.match(source, /127\.0\.0\.1:3001\/api\/health/u);
  assert.match(source, /127\.0\.0\.1:\$\{APP_PORT\}\/api\/health/u);
  assert.match(source, /"service":"agent-engineering-coursebook"/u);
  assert.match(source, /"service":"agent-radar"/u);
  assert.match(source, /rollback_config/u);
  assert.match(source, /for attempt in \{1\.\.10\}/u);
  assert.match(source, /最后 HTTP 状态/u);
  assert.match(
    source,
    /verify_https_identity "agent\.jayjp\.com" "\/api\/health"[\s\S]*"Agent 课程站"/u,
  );
  assert.match(
    source,
    /verify_https_identity "lona\.jayjp\.com" "\/"[\s\S]*"金融站"/u,
  );
});

test("start and restart run editorial readiness before changing service state", async () => {
  const startSource = await readFile(new URL("../scripts/start.sh", import.meta.url), "utf8");
  const restartSource = await readFile(new URL("../scripts/restart.sh", import.meta.url), "utf8");
  const readinessPattern = /check-editorial-readiness\.mjs|editorial:check/u;
  const startReadinessIndex = startSource.search(readinessPattern);
  const restartReadinessIndex = restartSource.search(readinessPattern);

  assert.ok(startReadinessIndex >= 0, "start.sh 必须执行 editorial readiness check");
  assert.ok(
    startReadinessIndex < startSource.indexOf("nohup node"),
    "readiness 失败必须发生在启动新服务进程之前",
  );
  assert.ok(restartReadinessIndex >= 0, "restart.sh 必须独立执行 editorial readiness check");
  assert.ok(
    restartReadinessIndex < restartSource.indexOf('/stop.sh"'),
    "restart readiness 失败必须发生在停止现有服务之前",
  );
});

test("scheduler installs an hourly systemd wake-up while source cadence remains inside ingestion", async () => {
  const scheduler = await readFile(new URL("../scripts/install-scheduler.sh", import.meta.url), "utf8");

  assert.match(
    scheduler,
    /ExecStart=.*scripts\/ingest\.mjs --trigger systemd/u,
    "systemd service 必须进入带 trigger=systemd 的生产采集入口，由 runIngestion 再按每个 source 的 cadence 过滤",
  );
  assert.match(scheduler, /\[Timer\][\s\S]*OnUnitActiveSec=1h/u, "最短 1h 来源要求 timer 每小时唤醒一次");
  assert.match(scheduler, /install -m 0644[\s\S]*SERVICE_FILE/u, "安装脚本必须真正写入 service unit");
  assert.match(scheduler, /install -m 0644[\s\S]*TIMER_FILE/u, "安装脚本必须真正写入 timer unit");
  assert.match(scheduler, /systemctl enable --now[\s\S]*TIMER_NAME/u, "安装后必须启用并立即启动 timer");
  const timeout = scheduler.match(/TimeoutStartSec=(\d+)(min|h)/u);
  assert.ok(timeout, "systemd oneshot 必须声明明确的启动超时");
  const timeoutMinutes = Number(timeout[1]) * (timeout[2] === "h" ? 60 : 1);
  assert.ok(
    timeoutMinutes >= 120,
    "大陆 concurrency=2、30 秒上游超时、89 来源及 relay/fallback/enrichment 的首轮预算不能被 45 分钟 systemd 提前杀死",
  );
  assert.match(scheduler, /每 1 小时|每小时/u, "运维文案必须说明新的每小时唤醒频率");
  assert.doesNotMatch(scheduler, /每 4 小时|every four hours/iu, "文案与 unit 不得继续声称四小时唤醒");
});

test("editorial readiness requires a valid live snapshot and a nonempty fully ready database", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-editorial-readiness-"));
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const readinessScript = path.join(projectRoot, "scripts", "check-editorial-readiness.mjs");
  const runReadiness = () => spawnSync(process.execPath, [readinessScript], {
    cwd: projectRoot,
    env: { ...process.env, RADAR_DATA_DIR: isolatedDataDirectory },
    encoding: "utf8",
    timeout: 10_000,
  });

  try {
    const { getSnapshotPath, insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot, writeSnapshotAtomic } = await import("../radar/snapshot.mjs");
    let result = runReadiness();
    assert.notEqual(result.status, 0, "首次启动的空库与缺失快照必须阻断服务启动");

    const database = openDatabase();
    const source = {
      id: "readiness-source",
      name: "Readiness Source",
      homepage: "https://readiness.example.com",
      class: "一手工程",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "readiness-source",
    };
    try {
      upsertSourceCatalog(database, [source]);
      assert.equal(insertArticle(database, {
        url: "https://readiness.example.com/rules-backlog",
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: "official",
        sourceLanguage: "en",
        originalTitle: "Agent Harness recovery backlog",
        originalExcerpt: "English recovery evidence.",
        contentText: "English recovery evidence with checkpoints and approvals.",
        publishedAt: "2026-08-02T01:00:00.000Z",
        discoveredAt: "2026-08-02T01:05:00.000Z",
        contentHash: "readiness-rules-backlog",
        relevanceScore: 10,
        signalSlug: "readiness-rules-backlog",
        conceptSlug: "agent-harness",
        title: "Agent Harness recovery backlog",
        summary: "English recovery evidence.",
        implication: "Validate recovery before production use.",
        topic: "工程",
        stage: "Emerging",
        accent: "engineering",
        tags: ["agent-harness"],
        analysisMode: "rules",
        publishDecision: "publish",
      }), true);
    } finally {
      database.close();
    }

    result = runReadiness();
    assert.notEqual(result.status, 0, "publish rules backlog 必须阻断 start/restart");

    const repairedDatabase = openDatabase();
    try {
      repairedDatabase.prepare(`
        UPDATE articles
        SET title = ?, summary = ?, implication = ?, analysis_mode = 'deepseek'
        WHERE url = ?
      `).run(
        "Agent Harness 增加可恢复任务能力",
        "官方材料说明了检查点、审批和工具调用恢复的工程机制。",
        "启动服务前应确认所有公开记录已经完成合格中文编辑。",
        "https://readiness.example.com/rules-backlog",
      );
    } finally {
      repairedDatabase.close();
    }
    result = runReadiness();
    assert.notEqual(result.status, 0, "DB 全 ready 但快照仍缺失时不能启动");

    const snapshotDatabase = openDatabase();
    try {
      await writeSnapshotAtomic(await buildSnapshot(snapshotDatabase));
    } finally {
      snapshotDatabase.close();
    }
    const liveSnapshot = await readFile(getSnapshotPath(), "utf8");
    result = runReadiness();
    assert.equal(result.status, 0, `非空 DB 全 ready 且合法 live snapshot 时必须允许启动：${result.stderr || result.stdout}`);

    const seedSnapshot = JSON.parse(liveSnapshot);
    seedSnapshot.status.mode = "seed";
    await writeFile(getSnapshotPath(), `${JSON.stringify(seedSnapshot)}\n`, "utf8");
    result = runReadiness();
    assert.notEqual(result.status, 0, "seed snapshot 不能作为生产启动依据");

    await rm(getSnapshotPath(), { force: true });
    result = runReadiness();
    assert.notEqual(result.status, 0, "快照缺失时必须失败关闭");

    await writeFile(getSnapshotPath(), "{corrupt-json", "utf8");
    result = runReadiness();
    assert.notEqual(result.status, 0, "快照损坏时必须失败关闭");

    await writeFile(getSnapshotPath(), liveSnapshot, "utf8");
    result = runReadiness();
    assert.equal(result.status, 0, "恢复合法 live snapshot 后才可重新启动");

    const invalidDatabase = openDatabase();
    try {
      assert.equal(insertArticle(invalidDatabase, {
        url: "https://readiness.example.com/non-chinese-llm",
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: "official",
        sourceLanguage: "ja",
        originalTitle: "Claude Code の復旧機能",
        originalExcerpt: "日本語の公式説明です。",
        contentText: "チェックポイントと承認の説明です。",
        publishedAt: "2026-08-02T02:00:00.000Z",
        discoveredAt: "2026-08-02T02:05:00.000Z",
        contentHash: "readiness-japanese-llm",
        relevanceScore: 10,
        signalSlug: "readiness-japanese-llm",
        conceptSlug: "agent-harness",
        title: "Claude Code が復旧可能なタスク実行を追加",
        summary: "公式チームは長時間のタスク向けに復旧機能を追加したと説明しています。",
        implication: "導入前に権限境界と中断からの復旧を検証する必要があります。",
        topic: "工程",
        stage: "Emerging",
        accent: "engineering",
        tags: ["agent-harness"],
        analysisMode: "deepseek",
        publishDecision: "publish",
      }), true);
    } finally {
      invalidDatabase.close();
    }
    result = runReadiness();
    assert.notEqual(result.status, 0, "非中文 LLM publish backlog 必须阻断 start/restart");
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});

test("shared task lock excludes another process and a non-owner cannot release the current owner", async () => {
  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-shared-lock-"));
  const runDirectory = path.join(isolatedDirectory, "run");
  const ownerFile = path.join(runDirectory, "ingest.lock", "owner.json");
  const holder = spawnLockHolder(runDirectory);
  try {
    assert.equal(await holder.acquired, true, `锁持有进程必须成功：${JSON.stringify(holder.output())}`);
    const ownerBefore = await readFile(ownerFile, "utf8");

    const nonOwnerRelease = runLockClient(runDirectory, "release-only");
    assert.ok([0, 17].includes(nonOwnerRelease.status), "非 owner release 必须明确完成或拒绝，不能挂起");
    assert.equal(await readFile(ownerFile, "utf8"), ownerBefore, "非 owner 进程不得删除或替换当前 owner 锁");

    const blocked = runLockClient(runDirectory);
    assert.notEqual(blocked.status, 0, "进程 A 持锁时进程 B 必须获取失败");
    assert.match(`${blocked.stderr}${blocked.stdout}`, /运行|lock|锁|PID|owner/i);
  } finally {
    await finishLockHolder(holder);
  }

  try {
    const afterRelease = runLockClient(runDirectory);
    assert.equal(afterRelease.status, 0, `owner 释放后另一进程必须可获取：${afterRelease.stderr || afterRelease.stdout}`);
  } finally {
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test("a reused live PID cannot keep a stale owner lock while a matching process identity still blocks", async () => {
  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-pid-reuse-lock-"));
  const runDirectory = path.join(isolatedDirectory, "run");
  const lockDirectory = path.join(runDirectory, "ingest.lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const staleProcessIdentity = "stale-owner-process-identity-that-cannot-match";
  let replacement;

  try {
    await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
    await writeFile(ownerFile, JSON.stringify({
      pid: process.pid,
      startedAt: "2000-01-01T00:00:00.000Z",
      ownerToken: "stale-owner-with-reused-live-pid",
      processIdentity: staleProcessIdentity,
    }), { mode: 0o600 });

    replacement = spawnLockHolder(runDirectory, 1_500);
    assert.equal(
      await replacement.acquired,
      true,
      `PID 仍存活但 processIdentity 不匹配时必须识别为 PID reuse 并安全回收 stale owner：${JSON.stringify(replacement.output())}`,
    );

    const currentOwner = JSON.parse(await readFile(ownerFile, "utf8"));
    assert.equal(currentOwner.pid, replacement.child.pid, "回收后必须由真实 contender 成为新 owner");
    assert.equal(typeof currentOwner.processIdentity, "string", "owner 必须持久化可验证的进程身份，不能只记录 PID");
    assert.ok(currentOwner.processIdentity.length > 0);
    assert.notEqual(currentOwner.processIdentity, staleProcessIdentity);

    const blocked = runLockClient(runDirectory);
    assert.notEqual(blocked.status, 0, "PID 与 processIdentity 都匹配的真实 live owner 仍必须阻断第二个进程");
    assert.match(`${blocked.stderr}${blocked.stdout}`, /运行|lock|锁|PID|owner/i);
  } finally {
    if (replacement?.child.exitCode === null) await finishLockHolder(replacement);
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test("concurrent stale-lock recovery elects at most one owner", async () => {
  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-stale-lock-"));
  const runDirectory = path.join(isolatedDirectory, "run");
  const lockDirectory = path.join(runDirectory, "ingest.lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  let isolationProbe;
  let contenders = [];
  try {
    isolationProbe = spawnLockHolder(runDirectory);
    assert.equal(await isolationProbe.acquired, true, `隔离锁探针必须成功：${JSON.stringify(isolationProbe.output())}`);
    await readFile(ownerFile, "utf8");
    await finishLockHolder(isolationProbe);

    await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
    await writeFile(ownerFile, JSON.stringify({
      pid: 99_999_999,
      startedAt: "2000-01-01T00:00:00.000Z",
      ownerToken: "stale-owner",
    }), { mode: 0o600 });

    contenders = [spawnLockHolder(runDirectory), spawnLockHolder(runDirectory)];
    const acquired = await Promise.all(contenders.map((contender) => contender.acquired));
    assert.equal(acquired.filter(Boolean).length, 1, `并发清理 stale lock 时只能有一个新 owner：${JSON.stringify(acquired)}`);
    const owner = JSON.parse(await readFile(ownerFile, "utf8"));
    assert.notEqual(owner.ownerToken, "stale-owner", "获胜进程必须用新 owner 身份替换 stale lock");
  } finally {
    if (isolationProbe?.child.exitCode === null) await finishLockHolder(isolationProbe);
    for (const contender of contenders) {
      if (contender.child.exitCode === null) await finishLockHolder(contender);
    }
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test("a delayed stale contender cannot replace a newer owner from an obsolete observation", async () => {
  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-stale-aba-"));
  const runDirectory = path.join(isolatedDirectory, "run");
  const lockDirectory = path.join(runDirectory, "ingest.lock");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const synchronizationDirectory = path.join(isolatedDirectory, "synchronization");
  const staleObservedFile = path.join(synchronizationDirectory, "stale-observed");
  const continueFile = path.join(synchronizationDirectory, "continue");
  let delayedContender;
  let newOwner;

  try {
    await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
    await mkdir(synchronizationDirectory, { recursive: true, mode: 0o700 });
    await writeFile(ownerFile, JSON.stringify({
      pid: 99_999_999,
      startedAt: "2000-01-01T00:00:00.000Z",
      ownerToken: "stale-owner-for-aba",
    }), { mode: 0o600 });

    delayedContender = spawnLockHolder(runDirectory, 800, {
      RADAR_TEST_TASK_LOCK_STALE_OBSERVED_FILE: staleObservedFile,
      RADAR_TEST_TASK_LOCK_CONTINUE_FILE: continueFile,
    });
    await waitForFile(staleObservedFile, 2_000);

    newOwner = spawnLockHolder(runDirectory, 1_500);
    assert.equal(await newOwner.acquired, true, `新 contender 必须先替换真实 stale owner：${JSON.stringify(newOwner.output())}`);
    const newOwnerIdentity = JSON.parse(await readFile(ownerFile, "utf8"));
    assert.equal(newOwnerIdentity.pid, newOwner.child.pid);
    assert.notEqual(newOwnerIdentity.ownerToken, "stale-owner-for-aba");

    await writeFile(continueFile, "continue", "utf8");
    assert.equal(
      await delayedContender.acquired,
      false,
      "延迟 contender 恢复后必须重新验证 owner，不能按旧 stale 观察删除新锁",
    );
    assert.deepEqual(
      JSON.parse(await readFile(ownerFile, "utf8")),
      newOwnerIdentity,
      "ABA 防护必须保持新 owner 的 PID 与不可伪造 token 不变",
    );
  } finally {
    await writeFile(continueFile, "continue", "utf8").catch(() => {});
    if (delayedContender?.child.exitCode === null) await finishLockHolder(delayedContender);
    if (newOwner?.child.exitCode === null) await finishLockHolder(newOwner);
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test("backfill CLI keeps the old snapshot byte-for-byte on partial failure and publishes only after full success", async () => {
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const isolatedDataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-backfill-cli-"));
  const runDirectory = path.join(isolatedDataDirectory, "run");
  process.env.RADAR_DATA_DIR = isolatedDataDirectory;
  const cliScript = path.join(projectRoot, "scripts", "backfill-analysis.mjs");
  const fetchHook = new URL("./fixtures/backfill-fetch-hook.mjs", import.meta.url).href;
  const oldSnapshot = '{"sentinel":"old-snapshot-must-survive-partial-failure"}\n';
  const rows = [
    {
      url: "https://backfill-cli.example.com/recovery-a",
      title: "Agent Harness recovery note A",
      publishedAt: "2026-08-02T01:00:00.000Z",
      contentHash: "backfill-cli-a",
      signalSlug: "backfill-cli-signal-a",
    },
    {
      url: "https://backfill-cli.example.com/recovery-b",
      title: "Agent Harness recovery note B",
      publishedAt: "2026-08-02T02:00:00.000Z",
      contentHash: "backfill-cli-b",
      signalSlug: "backfill-cli-signal-b",
    },
  ];
  const runCli = (plan) => spawnSync(process.execPath, ["--import", fetchHook, cliScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      RADAR_DATA_DIR: isolatedDataDirectory,
      RADAR_RUN_DIR: runDirectory,
      RADAR_AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test-deepseek-key",
      RADAR_BACKFILL_CONCURRENCY: "1",
      RADAR_TEST_BACKFILL_PLAN: JSON.stringify(plan),
    },
    encoding: "utf8",
    timeout: 15_000,
  });

  try {
    const { getSnapshotPath, insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const database = openDatabase();
    const source = {
      id: "backfill-cli-source",
      name: "Backfill CLI Source",
      homepage: "https://backfill-cli.example.com",
      class: "一手工程",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "backfill-cli-source",
      layer: "official",
      language: "en",
    };
    try {
      upsertSourceCatalog(database, [source]);
      for (const row of rows) {
        assert.equal(insertArticle(database, {
          url: row.url,
          sourceId: source.id,
          sourceName: source.name,
          sourceClass: source.class,
          independentGroup: source.independentGroup,
          sourceLayer: source.layer,
          sourceLanguage: source.language,
          originalTitle: row.title,
          originalExcerpt: "English recovery evidence.",
          contentText: "English checkpoints, approvals, and tool-call replay evidence.",
          publishedAt: row.publishedAt,
          discoveredAt: row.publishedAt,
          contentHash: row.contentHash,
          relevanceScore: 10,
          signalSlug: row.signalSlug,
          conceptSlug: "agent-harness",
          title: row.title,
          summary: "English recovery evidence.",
          implication: "Validate recovery before production use.",
          topic: "工程",
          stage: "Emerging",
          accent: "engineering",
          tags: ["agent-harness"],
          analysisMode: "rules",
          publishDecision: "publish",
        }), true);
      }
    } finally {
      database.close();
    }
    await writeFile(getSnapshotPath(), oldSnapshot, "utf8");

    const partial = runCli([
      { title: "第二条记录完成中文回填" },
      { status: 400, body: "planned terminal provider failure" },
    ]);
    assert.notEqual(partial.status, 0, "任一回填失败时 CLI 必须非零退出");
    assert.equal(await readFile(getSnapshotPath(), "utf8"), oldSnapshot, "部分失败不得发布半批快照");

    const afterPartial = openDatabase();
    try {
      const states = afterPartial.prepare("SELECT url, analysis_mode FROM articles ORDER BY url").all();
      assert.deepEqual(states.map((row) => ({ ...row })), [
        { url: rows[0].url, analysis_mode: "rules" },
        { url: rows[1].url, analysis_mode: "deepseek" },
      ], "部分失败只能保留成功 DB 更新，失败行不得被覆盖");
    } finally {
      afterPartial.close();
    }

    const subsequentPublisherDatabase = openDatabase();
    try {
      const { buildSnapshot, writeSnapshotAtomic } = await import("../radar/snapshot.mjs");
      const partialProjection = await buildSnapshot(subsequentPublisherDatabase);
      await assert.rejects(
        writeSnapshotAtomic(partialProjection),
        /readiness|backlog|未就绪|公开.*编辑|快照.*阻断/i,
        "任意后续 snapshot publisher（包括 ingest）都必须复用全库 backlog gate",
      );
      assert.equal(
        await readFile(getSnapshotPath(), "utf8"),
        oldSnapshot,
        "partial DB 状态下后续 publisher 仍必须逐字节保留旧快照",
      );
    } finally {
      subsequentPublisherDatabase.close();
    }

    const success = runCli([{ title: "第一条记录完成中文回填" }]);
    assert.equal(success.status, 0, `剩余 backlog 全成功时 CLI 必须成功：${success.stderr || success.stdout}`);
    const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
    assert.deepEqual(new Set(snapshot.signals.map((signal) => signal.title)), new Set([
      "第一条记录完成中文回填",
      "第二条记录完成中文回填",
    ]));
    assert.deepEqual(new Set(snapshot.signals.flatMap((signal) => signal.sources.map((item) => item.href))), new Set(rows.map((row) => row.url)));
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(isolatedDataDirectory, { recursive: true, force: true });
  }
});
