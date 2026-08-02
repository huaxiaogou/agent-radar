#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { getSnapshotPath } from "../radar/database.mjs";

try {
  const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
  console.log(JSON.stringify({
    ...snapshot.status,
    modelLandscape: snapshot.modelLandscape ? {
      source: snapshot.modelLandscape.sourceName,
      itemCount: snapshot.modelLandscape.itemCount,
      lastAttemptAt: snapshot.modelLandscape.lastAttemptAt,
      lastSuccessAt: snapshot.modelLandscape.lastSuccessAt,
      lastError: snapshot.modelLandscape.lastError,
      stale: snapshot.modelLandscape.stale,
    } : null,
  }, null, 2));
} catch (error) {
  console.error(`Agent Radar 尚无正式采集快照：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
