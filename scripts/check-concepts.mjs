#!/usr/bin/env node

import path from "node:path";
import { getConceptPublicationReadiness } from "../radar/concept-knowledge.mjs";
import { openDatabase } from "../radar/database.mjs";
import { projectRoot } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let database;
try {
  database = openDatabase();
  const result = getConceptPublicationReadiness(database, {
    requireFormalConcept: true,
    includeOperationalBacklog: true,
  });
  const output = JSON.stringify(result, null, 2);
  if (result.status === "not-ready") {
    console.error(output);
    process.exitCode = 1;
  } else {
    console.log(output);
  }
} catch {
  const safeDiagnostic = "SQLite 数据库或存储检查失败；请确认数据目录可访问、数据库文件权限与锁状态正常，执行 SQLite 完整性检查，修复后重试。";
  console.error(JSON.stringify({
    service: "agent-radar",
    task: "concept-knowledge-readiness",
    status: "not-ready",
    qualityFailureCount: 0,
    issueCount: 1,
    issues: [{
      code: "READINESS_CHECK_FAILED",
      category: "sqlite-database-or-storage",
      message: safeDiagnostic,
    }],
    warnings: [],
  }, null, 2));
  process.exitCode = 1;
} finally {
  database?.close();
}
