#!/usr/bin/env node

import path from "node:path";
import { acquireTaskLock, projectRoot, releaseTaskLock } from "./task-lock.mjs";

try {
  process.loadEnvFile(path.join(projectRoot, ".env.production"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function triggerFromArgs() {
  const index = process.argv.indexOf("--trigger");
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : "manual";
}

await acquireTaskLock();
try {
  const { runIngestion } = await import("../radar/pipeline.mjs");
  const result = await runIngestion({ trigger: triggerFromArgs() });
  console.log(JSON.stringify({ service: "agent-radar", task: "ingest", ...result }, null, 2));
} finally {
  await releaseTaskLock();
}
