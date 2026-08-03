import { readFileSync } from "node:fs";

const themesUrl = new URL("../config/concept-themes.json", import.meta.url);
const themeCatalog = JSON.parse(readFileSync(themesUrl, "utf8"));

function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("受控工程主题目录不能为空");
  const ids = new Set();
  for (const theme of catalog) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) throw new Error("受控工程主题条目必须是对象");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(theme.id || ""))) throw new Error(`受控工程主题 id 无效：${theme.id || "空"}`);
    if (ids.has(theme.id)) throw new Error(`受控工程主题 id 重复：${theme.id}`);
    if (!String(theme.zhName || "").trim() || !String(theme.enName || "").trim()) throw new Error(`受控工程主题缺少中英文名称：${theme.id}`);
    if (!Array.isArray(theme.aliases) || theme.aliases.some((alias) => !String(alias || "").trim())) throw new Error(`受控工程主题 aliases 无效：${theme.id}`);
    ids.add(theme.id);
  }
  return catalog.map((theme) => Object.freeze({
    id: theme.id,
    zhName: theme.zhName.trim(),
    enName: theme.enName.trim(),
    aliases: Object.freeze([...new Set(theme.aliases.map((alias) => alias.trim()))]),
  }));
}

export const ENGINEERING_THEMES = Object.freeze(validateCatalog(themeCatalog));
export const ENGINEERING_THEME_IDS = Object.freeze(ENGINEERING_THEMES.map((theme) => theme.id));
export const DEFAULT_ENGINEERING_THEME = "ai-coding-engineering";
const engineeringThemeIds = new Set(ENGINEERING_THEME_IDS);

export function normalizeEngineeringThemes(value, { allowMissing = false } = {}) {
  if (value === undefined && allowMissing) return [DEFAULT_ENGINEERING_THEME];
  if (!Array.isArray(value)) throw new Error("concept.themes 必须是受控工程主题数组");
  const themes = [...new Set(value.map((theme) => String(theme || "").trim()).filter(Boolean))];
  if (themes.length === 0) throw new Error("concept.themes 至少需要一个受控工程主题");
  if (themes.length > 6) throw new Error("concept.themes 最多允许 6 个受控工程主题");
  for (const theme of themes) {
    if (!engineeringThemeIds.has(theme)) throw new Error(`concept.themes 包含未知工程主题：${theme}`);
  }
  return themes;
}

export function getEngineeringTheme(id) {
  return ENGINEERING_THEMES.find((theme) => theme.id === id) || null;
}
