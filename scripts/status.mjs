#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { getSnapshotPath } from "../radar/database.mjs";

try {
  const snapshot = JSON.parse(await readFile(getSnapshotPath(), "utf8"));
  console.log(JSON.stringify(snapshot.status, null, 2));
} catch (error) {
  console.error(`Agent Radar 尚无正式采集快照：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
