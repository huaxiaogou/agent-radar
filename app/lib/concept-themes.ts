import themeCatalog from "../../config/concept-themes.json";

export type EngineeringTheme = {
  id: string;
  zhName: string;
  enName: string;
  aliases: string[];
};

export const ENGINEERING_THEMES = themeCatalog as EngineeringTheme[];
const themesById = new Map(ENGINEERING_THEMES.map((theme) => [theme.id, theme]));

export function getEngineeringTheme(id: string) {
  return themesById.get(id);
}

export function engineeringThemeSearchTerms(ids?: string[]) {
  return (ids || []).flatMap((id) => {
    const theme = getEngineeringTheme(id);
    return theme ? [theme.zhName, theme.enName, ...theme.aliases] : [];
  });
}
