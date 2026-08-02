import { createHash, webcrypto } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fetchPublicBytes, fetchPublicText } from "./fetch.mjs";

export const MODEL_LANDSCAPE_SOURCE = {
  name: "Artificial Analysis",
  url: "https://artificialanalysis.ai/models",
  methodologyUrl: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/",
};

const MANIFEST_PATTERN = /"manifest":\{"path":"([^"]+)","key":"([0-9a-f]{64})"\}/g;
const MANIFEST_PATH_PATTERN = /^\/data\/[a-f0-9]+\.txt$/;
const DEFAULT_MINIMUM_MODELS = 40;
const MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : null;
}

export function parseModelManifestDescriptors(pageHtml) {
  const normalized = String(pageHtml || "").replaceAll('\\"', '"');
  return [...normalized.matchAll(MANIFEST_PATTERN)].map((match) => ({
    path: match[1],
    key: match[2],
  }));
}

export async function decryptModelManifest(encryptedBody, keyHex) {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("模型清单密钥格式无效");
  const keyBytes = Buffer.from(keyHex, "hex");
  const iv = createHash("sha256").update(keyBytes).digest().subarray(0, 12);
  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encryptedBody,
  );
  const json = gunzipSync(Buffer.from(decrypted), { maxOutputLength: MAX_DECOMPRESSED_BYTES }).toString("utf8");
  return JSON.parse(json);
}

export function normalizeModelLandscape(rawModels, { minimumModels = DEFAULT_MINIMUM_MODELS } = {}) {
  if (!Array.isArray(rawModels)) throw new Error("模型清单缺少 models 数组");
  const seen = new Set();
  const models = [];
  for (const raw of rawModels) {
    const codingIndex = finiteNumber(raw?.codingIndex);
    const intelligenceIndex = finiteNumber(raw?.intelligenceIndex);
    const costPerTask = finiteNumber(raw?.intelligenceIndexCostPerTask?.cost?.total);
    const id = String(raw?.id || "").trim();
    const slug = String(raw?.slug || "").trim();
    const name = String(raw?.name || "").trim();
    const providerName = String(raw?.creator?.name || "Other").trim() || "Other";
    if (
      raw?.deprecated === true || raw?.deprecatedAt || !id || !slug || !name || seen.has(id) ||
      codingIndex === null || intelligenceIndex === null || costPerTask === null || costPerTask <= 0
    ) continue;
    seen.add(id);
    models.push({
      id,
      slug,
      name,
      shortName: String(raw?.shortName || name).trim() || name,
      providerName,
      providerSlug: String(raw?.creator?.slug || providerName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other",
      providerColor: safeColor(raw?.creator?.color),
      codingIndex: Math.round(codingIndex * 100) / 100,
      intelligenceIndex: Math.round(intelligenceIndex * 100) / 100,
      costPerTask: Math.round(costPerTask * 1_000_000) / 1_000_000,
      isReasoning: raw?.isReasoning === true,
      isOpenWeights: raw?.isOpenWeights === true,
      releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.releaseDate || "")) ? raw.releaseDate : null,
      contextWindowTokens: finiteNumber(raw?.contextWindowTokens),
      href: new URL(`/models/${encodeURIComponent(slug)}`, MODEL_LANDSCAPE_SOURCE.url).href,
    });
  }
  models.sort((left, right) => right.codingIndex - left.codingIndex || left.costPerTask - right.costPerTask || left.name.localeCompare(right.name));
  if (models.length < minimumModels) {
    throw new Error(`模型清单仅有 ${models.length} 个可用点，低于安全阈值 ${minimumModels}，拒绝覆盖上次快照`);
  }
  return models;
}

export function isModelLandscapeDue({ trigger = "manual", lastSuccessAt = null, now = new Date().toISOString() } = {}) {
  if (trigger !== "systemd") return true;
  if (!lastSuccessAt) return true;
  const last = new Date(lastSuccessAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(last) || !Number.isFinite(current)) return true;
  const cadenceHours = Number(process.env.RADAR_MODEL_LANDSCAPE_CADENCE_HOURS || 24);
  return current - last >= Math.max(4, cadenceHours) * 3_600_000;
}

export async function discoverModelLandscape(fetchOptions = {}) {
  const page = await fetchPublicText(MODEL_LANDSCAPE_SOURCE.url, fetchOptions);
  const descriptors = parseModelManifestDescriptors(page.body);
  if (!descriptors.length) throw new Error("公开页面未找到模型数据清单");
  const errors = [];
  for (const descriptor of descriptors.toReversed()) {
    try {
      if (!MANIFEST_PATH_PATTERN.test(descriptor.path)) throw new Error("清单路径不在允许范围");
      const manifestUrl = new URL(descriptor.path, MODEL_LANDSCAPE_SOURCE.url);
      if (manifestUrl.origin !== new URL(MODEL_LANDSCAPE_SOURCE.url).origin) throw new Error("清单跨域被拒绝");
      const encrypted = await fetchPublicBytes(manifestUrl.href, fetchOptions);
      const payload = await decryptModelManifest(encrypted.body, descriptor.key);
      if (!Array.isArray(payload?.models)) throw new Error("不是模型清单");
      const minimumModels = Number(process.env.RADAR_MODEL_LANDSCAPE_MIN_MODELS || DEFAULT_MINIMUM_MODELS);
      return normalizeModelLandscape(payload.models, { minimumModels });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`模型清单解析失败：${errors.join("; ")}`);
}
