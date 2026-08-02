import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const catalogUrl = new URL("../config/sources.json", import.meta.url);
const LAYERS = new Set(["official", "practitioner", "community"]);
const LANGUAGES = new Set(["zh", "en", "mixed"]);
const KINDS = new Set(["feed", "html", "json"]);
const JSON_PARSERS = new Set(["github-issues", "bluesky-search", "hacker-news"]);
const HTML_PARSERS = new Set(["claude-changelog"]);

function assertPublicHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} 必须是有效 HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} 必须是无凭据 HTTPS URL`);
  }
}

function validateParser(kind, parser, label) {
  if (kind === "json") {
    if (!JSON_PARSERS.has(parser)) throw new Error(`${label} JSON parser 无效：${parser || "未配置"}`);
    return;
  }
  if (kind === "html") {
    if (parser && !HTML_PARSERS.has(parser)) throw new Error(`${label} HTML parser 无效：${parser}`);
    return;
  }
  if (parser) throw new Error(`${label} parser 与 kind=${kind} 不匹配`);
}

function validatePatterns(patterns, label) {
  if (patterns === undefined) return;
  if (!Array.isArray(patterns)) throw new Error(`${label} includeUrlPatterns 必须是数组`);
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || !pattern) throw new Error(`${label} includeUrlPatterns 包含无效 pattern`);
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error(`${label} includeUrlPatterns 包含无效正则`);
    }
  }
}

export function validateSourceCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new Error("config/sources.json 必须是数组");

  const ids = new Set();
  for (const source of catalog) {
    if (!source.id || !source.name || !source.url || !source.homepage) {
      throw new Error("来源配置缺少 id/name/url/homepage");
    }
    if (ids.has(source.id)) throw new Error(`来源 id 重复：${source.id}`);
    if (!KINDS.has(source.kind)) throw new Error(`来源 ${source.id} kind 无效：${source.kind}`);
    if (!LAYERS.has(source.layer)) throw new Error(`来源 ${source.id} 缺少有效 layer`);
    if (!LANGUAGES.has(source.language)) throw new Error(`来源 ${source.id} 缺少有效 language`);
    for (const key of ["url", "homepage"]) assertPublicHttpsUrl(source[key], `来源 ${source.id} ${key}`);
    validateParser(source.kind, source.parser, `来源 ${source.id}`);
    validatePatterns(source.includeUrlPatterns, `来源 ${source.id}`);
    if (source.fallbacks !== undefined) {
      if (!Array.isArray(source.fallbacks) || source.fallbacks.length > 8) {
        throw new Error(`来源 ${source.id} fallbacks 必须是至多 8 项的数组`);
      }
      for (const [index, fallback] of source.fallbacks.entries()) {
        const label = `来源 ${source.id} fallback[${index}]`;
        if (!fallback || typeof fallback !== "object" || Array.isArray(fallback)) throw new Error(`${label} 必须是对象`);
        if (!fallback.url) throw new Error(`${label} 缺少 url`);
        if (!fallback.kind || !KINDS.has(fallback.kind)) throw new Error(`${label} kind 无效：${fallback.kind || "未配置"}`);
        assertPublicHttpsUrl(fallback.url, `${label} url`);
        if (fallback.discoveryHomepage !== undefined) {
          assertPublicHttpsUrl(fallback.discoveryHomepage, `${label} discoveryHomepage`);
        }
        validateParser(fallback.kind, fallback.parser, label);
        validatePatterns(fallback.includeUrlPatterns, label);
      }
    }
    ids.add(source.id);
  }
  return catalog;
}

export async function loadSourceCatalog() {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  validateSourceCatalog(catalog);
  return catalog.filter((source) => source.enabled !== false);
}

export function getCatalogPath() {
  return fileURLToPath(catalogUrl);
}
