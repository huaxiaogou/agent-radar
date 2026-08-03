#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const REQUIRED_OPTIONS = ["--from", "--into", "--reason"];

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const option = arguments_[index];
    if (!REQUIRED_OPTIONS.includes(option)) {
      throw new Error(`未知参数：${option || "（空）"}；仅支持 ${REQUIRED_OPTIONS.join("、")}`);
    }
    if (values.has(option)) throw new Error(`参数 ${option} 不能重复`);
    const value = String(arguments_[index + 1] || "").trim();
    if (!value || value.startsWith("--")) throw new Error(`参数 ${option} 缺少有效值`);
    values.set(option, value);
    index += 1;
  }

  const missing = REQUIRED_OPTIONS.filter((option) => !values.has(option));
  if (missing.length) throw new Error(`缺少必填参数：${missing.join("、")}`);

  const from = values.get("--from");
  const into = values.get("--into");
  const reason = values.get("--reason");
  if (from === into) throw new Error("参数 --from 与 --into 不能是同一个 slug");
  if (!/\p{Script=Han}/u.test(reason)) throw new Error("参数 --reason 必须包含明确的中文合并原因");
  return { from, into, reason };
}

async function run() {
  // 参数错误必须在加载部署环境、创建数据库或竞争全局任务锁之前失败。
  const options = parseArguments(process.argv.slice(2));

  try {
    process.loadEnvFile(path.join(projectRoot, ".env.production"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const [
    {
      assertConceptPublicationReady,
      maintainConceptKnowledgeLifecycles,
      mergeConceptKnowledge,
    },
    { openDatabase },
    { assertPublicEditorialReady, buildSnapshot, writeSnapshotAtomic },
    { acquireTaskLock, releaseTaskLock },
  ] = await Promise.all([
    import("../radar/concept-knowledge.mjs"),
    import("../radar/database.mjs"),
    import("../radar/snapshot.mjs"),
    import("./task-lock.mjs"),
  ]);

  let lockHandle;
  let database;
  try {
    lockHandle = await acquireTaskLock();
    database = openDatabase();

    // 内容/编辑门禁先在当前已提交状态上完成，避免可预见的质量失败发生在
    // SQLite merge 之后；文件系统 rename 等只能在原子发布时最终确认。
    const preflightSnapshot = await buildSnapshot(database);
    assertPublicEditorialReady(database);
    assertConceptPublicationReady(database, preflightSnapshot);
    const operationTime = new Date().toISOString();
    const lifecycleMaintenance = maintainConceptKnowledgeLifecycles(database, { now: operationTime });
    if (lifecycleMaintenance.failedCount > 0) {
      const preview = lifecycleMaintenance.failures.slice(0, 3)
        .map((failure) => `${failure.slug}:${failure.error}`).join("、");
      throw new Error(`概念生命周期维护失败，未执行合并：${preview}`);
    }
    const merged = mergeConceptKnowledge(database, {
      fromSlug: options.from,
      intoSlug: options.into,
      reason: options.reason,
      mergedAt: operationTime,
    });
    const snapshot = await buildSnapshot(database);
    await writeSnapshotAtomic(snapshot);

    console.log(JSON.stringify({
      service: "agent-radar",
      task: "concept-knowledge-merge",
      status: "ok",
      from: options.from,
      into: options.into,
      revision: merged.revision,
      redirectTo: merged.redirectTo,
      resumed: Boolean(merged.resumed),
      redirectedInboundRelationCount: Number(merged.redirectedInboundRelationCount || 0),
      snapshot: snapshot.status,
    }, null, 2));
  } finally {
    database?.close();
    if (lockHandle) await releaseTaskLock(lockHandle);
  }
}

try {
  await run();
} catch (error) {
  console.error(JSON.stringify({
    service: "agent-radar",
    task: "concept-knowledge-merge",
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
