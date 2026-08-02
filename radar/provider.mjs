export function resolveAnalysisProvider(environment = process.env) {
  if (environment.RADAR_DISABLE_AI === "1") return "rules";
  const configured = (environment.RADAR_AI_PROVIDER || "auto").trim().toLowerCase();
  if (!["auto", "rules", "openai", "deepseek"].includes(configured)) {
    throw new Error(`RADAR_AI_PROVIDER 不支持：${configured}`);
  }
  if (configured === "rules") return "rules";
  if (configured === "openai") {
    return environment.OPENAI_API_KEY && environment.RADAR_DISABLE_OPENAI !== "1" ? "openai" : "rules";
  }
  if (configured === "deepseek") return environment.DEEPSEEK_API_KEY ? "deepseek" : "rules";
  if (environment.OPENAI_API_KEY && environment.RADAR_DISABLE_OPENAI !== "1") return "openai";
  if (environment.DEEPSEEK_API_KEY) return "deepseek";
  return "rules";
}
