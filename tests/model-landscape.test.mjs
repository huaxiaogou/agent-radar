import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  discoverModelLandscape,
  isModelLandscapeDue,
  normalizeModelLandscape,
} from "../radar/model-landscape.mjs";
import {
  getModelLandscapeState,
  markModelLandscapeFailure,
  openDatabase,
  replaceModelLandscape,
} from "../radar/database.mjs";

let temporaryDirectory;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
  delete process.env.RADAR_DATA_DIR;
});

function rawModel(index) {
  return {
    id: `model-${index}`,
    slug: `model-${index}`,
    name: `Model ${index} (high)`,
    shortName: `Model ${index}`,
    deprecated: false,
    codingIndex: 30 + index / 2,
    intelligenceIndex: 20 + index / 3,
    intelligenceIndexCostPerTask: { cost: { total: 0.01 + index / 100 } },
    isReasoning: index % 2 === 0,
    isOpenWeights: index % 3 === 0,
    releaseDate: "2026-08-01",
    contextWindowTokens: 128000,
    creator: { name: index % 2 ? "OpenAI" : "DeepSeek", slug: index % 2 ? "openai" : "deepseek", color: "#315fc3" },
  };
}

async function encryptedManifest(payload, keyHex) {
  const keyBytes = Buffer.from(keyHex, "hex");
  const iv = createHash("sha256").update(keyBytes).digest().subarray(0, 12);
  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  return Buffer.from(await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    gzipSync(JSON.stringify(payload)),
  ));
}

test("dynamic landscape decrypts the public manifest and keeps dozens of traceable models", async () => {
  const key = "42".repeat(32);
  const encrypted = await encryptedManifest({ models: Array.from({ length: 45 }, (_, index) => rawModel(index)) }, key);
  const page = `<script>{\\"manifest\\":{\\"path\\":\\"/data/abcdef1234.txt\\",\\"key\\":\\"${key}\\"}}</script>`;
  const fetchImpl = async (url) => url.endsWith("/models")
    ? new Response(page, { status: 200, headers: { "content-type": "text/html" } })
    : new Response(encrypted, { status: 200, headers: { "content-type": "application/octet-stream" } });
  const models = await discoverModelLandscape({
    fetchImpl,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    createDispatcher: () => ({ close: async () => {} }),
  });
  assert.equal(models.length, 45);
  assert.deepEqual(new Set(models.map((model) => model.providerName)), new Set(["OpenAI", "DeepSeek"]));
  assert.match(models[0].href, /^https:\/\/artificialanalysis\.ai\/models\//);
  assert.ok(models.every((model) => model.codingIndex > 0 && model.intelligenceIndex > 0 && model.costPerTask > 0));
});

test("an implausibly small manifest is rejected before it can replace the prior snapshot", () => {
  assert.throws(
    () => normalizeModelLandscape(Array.from({ length: 12 }, (_, index) => rawModel(index)), { minimumModels: 40 }),
    /低于安全阈值/,
  );
});

test("database failure metadata preserves the last successful model payload", async () => {
  temporaryDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-models-`);
  process.env.RADAR_DATA_DIR = temporaryDirectory;
  const database = openDatabase();
  try {
    const models = normalizeModelLandscape(Array.from({ length: 45 }, (_, index) => rawModel(index)), { minimumModels: 40 });
    replaceModelLandscape(database, {
      sourceName: "Artificial Analysis",
      sourceUrl: "https://artificialanalysis.ai/models",
      methodologyUrl: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/",
      attemptedAt: "2026-08-02T00:00:00.000Z",
      models,
    });
    markModelLandscapeFailure(database, { attemptedAt: "2026-08-02T04:00:00.000Z", error: "ETIMEDOUT" });
    const state = getModelLandscapeState(database);
    assert.equal(state.models.length, 45);
    assert.equal(state.lastSuccessAt, "2026-08-02T00:00:00.000Z");
    assert.equal(state.lastAttemptAt, "2026-08-02T04:00:00.000Z");
    assert.equal(state.lastError, "ETIMEDOUT");
  } finally {
    database.close();
  }
});

test("systemd refreshes the model landscape daily while manual runs always refresh", () => {
  const now = "2026-08-02T12:00:00.000Z";
  assert.equal(isModelLandscapeDue({ trigger: "manual", lastSuccessAt: now, now }), true);
  assert.equal(isModelLandscapeDue({ trigger: "systemd", lastSuccessAt: "2026-08-02T00:00:00.000Z", now }), false);
  assert.equal(isModelLandscapeDue({ trigger: "systemd", lastSuccessAt: "2026-08-01T11:59:00.000Z", now }), true);
});
