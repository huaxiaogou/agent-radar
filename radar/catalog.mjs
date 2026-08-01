import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const catalogUrl = new URL("../config/sources.json", import.meta.url);

export async function loadSourceCatalog() {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  if (!Array.isArray(catalog)) throw new Error("config/sources.json 必须是数组");

  const ids = new Set();
  for (const source of catalog) {
    if (!source.id || !source.name || !source.url || !source.homepage) {
      throw new Error("来源配置缺少 id/name/url/homepage");
    }
    if (ids.has(source.id)) throw new Error(`来源 id 重复：${source.id}`);
    ids.add(source.id);
  }
  return catalog.filter((source) => source.enabled !== false);
}

export function getCatalogPath() {
  return fileURLToPath(catalogUrl);
}
