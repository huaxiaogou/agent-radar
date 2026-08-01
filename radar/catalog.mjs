import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const catalogUrl = new URL("../config/sources.json", import.meta.url);
const LAYERS = new Set(["official", "practitioner", "community"]);
const LANGUAGES = new Set(["zh", "en", "mixed"]);
const KINDS = new Set(["feed", "html", "json"]);
const JSON_PARSERS = new Set(["github-issues", "bluesky-search", "hacker-news"]);

export async function loadSourceCatalog() {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
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
    for (const key of ["url", "homepage"]) {
      const url = new URL(source[key]);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error(`来源 ${source.id} ${key} 必须是无凭据 HTTPS URL`);
    }
    if (source.kind === "json" && !JSON_PARSERS.has(source.parser)) {
      throw new Error(`来源 ${source.id} JSON parser 无效：${source.parser || "未配置"}`);
    }
    ids.add(source.id);
  }
  return catalog.filter((source) => source.enabled !== false);
}

export function getCatalogPath() {
  return fileURLToPath(catalogUrl);
}
