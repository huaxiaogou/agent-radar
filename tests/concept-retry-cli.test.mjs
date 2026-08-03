import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mergeScript = path.join(repositoryRoot, "scripts", "merge-concepts.mjs");

function runMerge(arguments_) {
  const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "agent-radar-concept-retry-cli-"));
  try {
    return spawnSync(process.execPath, ["--no-warnings", mergeScript, ...arguments_], {
      cwd: repositoryRoot,
      env: { ...process.env, RADAR_DATA_DIR: dataDirectory },
      encoding: "utf8",
    });
  } finally {
    rmSync(dataDirectory, { recursive: true, force: true });
  }
}

test("package exposes the deployable concepts:merge command", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.match(
    String(packageJson.scripts?.["concepts:merge"] || ""),
    /scripts\/merge-concepts\.mjs/u,
    "package.json 必须提供 concepts:merge 并调用 scripts/merge-concepts.mjs",
  );
});

test("merge CLI parses --from, --into and --reason as required arguments", () => {
  const cases = [
    { missing: "--from", args: ["--into", "canonical", "--reason", "same mechanism"] },
    { missing: "--into", args: ["--from", "legacy", "--reason", "same mechanism"] },
    { missing: "--reason", args: ["--from", "legacy", "--into", "canonical"] },
  ];

  for (const { missing, args } of cases) {
    const result = runMerge(args);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    assert.notEqual(result.status, 0, `缺少 ${missing} 时必须非零退出`);
    assert.match(output, new RegExp(missing, "u"), `缺少参数错误必须明确指出 ${missing}`);
  }
});
