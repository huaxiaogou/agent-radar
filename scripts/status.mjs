#!/usr/bin/env node

import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  getDatabasePath,
  getSnapshotPath,
  openDatabase,
} from "../radar/database.mjs";
import { getConceptKnowledgeStatus } from "../radar/concept-knowledge.mjs";
import { projectRoot } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function modelLandscapeStatus(modelLandscape) {
  return modelLandscape ? {
    source: modelLandscape.sourceName,
    itemCount: modelLandscape.itemCount,
    lastAttemptAt: modelLandscape.lastAttemptAt,
    lastSuccessAt: modelLandscape.lastSuccessAt,
    lastError: modelLandscape.lastError,
    stale: modelLandscape.stale,
  } : null;
}

let database;
try {
  const snapshotPath = getSnapshotPath();
  const databasePath = getDatabasePath();
  await access(snapshotPath, constants.R_OK);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!snapshot || typeof snapshot !== "object" || !snapshot.status || typeof snapshot.status !== "object") {
    throw new Error("原子快照缺少 status 对象");
  }

  await access(databasePath, constants.R_OK | constants.W_OK).catch((error) => {
    throw new Error(`SQLite 权威数据库不可读写：${databasePath}（${error instanceof Error ? error.message : String(error)}）`);
  });
  const databaseStats = await stat(databasePath);
  if (!databaseStats.isFile() || databaseStats.size === 0) {
    throw new Error(`SQLite 权威数据库无效：${databasePath}`);
  }

  database = openDatabase();
  const conceptKnowledgeStatus = getConceptKnowledgeStatus(database);
  console.log(JSON.stringify({
    snapshotStatus: snapshot.status,
    conceptKnowledgeStatus,
    modelLandscape: modelLandscapeStatus(snapshot.modelLandscape),
  }, null, 2));
} catch (error) {
  console.error(`Agent Radar 状态不可用：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  database?.close();
}
