export type CapabilityBand = 1 | 2 | 3 | 4 | 5;

export type ModelSource = {
  label: string;
  href: string;
  scope: "model" | "price" | "model-and-price";
};

export type ModelPrice = {
  input: number;
  output: number;
  basis: string;
  standardInput?: number;
  standardOutput?: number;
  promotionEndsAt?: string;
};

export type ModelRecord = {
  id: string;
  code: string;
  provider: "OpenAI" | "Anthropic" | "Google" | "DeepSeek";
  name: string;
  coding: CapabilityBand;
  everyday: CapabilityBand;
  contextTokens: number;
  price: ModelPrice;
  costBand: "$" | "$$" | "$$$";
  assessment: {
    evaluatedAt: string;
    evidenceHref: string;
    codingRationale: string;
    everydayRationale: string;
  };
  fit: string;
  tradeoff: string;
  sources: ModelSource[];
};

export const modelDataVerifiedAt = "2026-08-01T22:20:00+08:00";

export const capabilityRubric = {
  coding: "观察模型在代码库理解、多文件修改、工具调用、长任务持续性与验证闭环中的候选适配度。",
  everyday: "观察模型在中文沟通、文档分析、通用推理、指令保持与日常工具任务中的候选适配度。",
};

const sources = {
  openaiModels: {
    label: "OpenAI 模型文档",
    href: "https://developers.openai.com/api/docs/models",
    scope: "model" as const,
  },
  anthropicModels: {
    label: "Claude 模型总览",
    href: "https://platform.claude.com/docs/en/about-claude/models/overview",
    scope: "model" as const,
  },
  anthropicPrice: {
    label: "Claude API 定价",
    href: "https://platform.claude.com/docs/en/about-claude/pricing",
    scope: "price" as const,
  },
  googleModels: {
    label: "Gemini 最新模型",
    href: "https://ai.google.dev/gemini-api/docs/latest-model",
    scope: "model" as const,
  },
  googlePrice: {
    label: "Gemini API 定价",
    href: "https://ai.google.dev/gemini-api/docs/pricing",
    scope: "price" as const,
  },
  deepseekModels: {
    label: "DeepSeek 模型与定价",
    href: "https://api-docs.deepseek.com/quick_start/pricing",
    scope: "model-and-price" as const,
  },
};

export const modelRecords: ModelRecord[] = [
  {
    id: "gpt-5-6-sol",
    code: "O·SOL",
    provider: "OpenAI",
    name: "GPT-5.6 Sol",
    coding: 5,
    everyday: 5,
    contextTokens: 1_050_000,
    price: { input: 5, output: 30, basis: "每百万 tokens" },
    costBand: "$$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.openaiModels.href,
      codingRationale: "官方定位覆盖复杂代理式编程与长上下文任务；Radar 将其列为大型仓库验证的最高候选档。",
      everydayRationale: "长上下文与高强度通用推理定位适合复杂知识工作，但高成本会限制日常全量路由。",
    },
    fit: "复杂代码库、长上下文工程任务与高要求通用分析。",
    tradeoff: "输出成本高，批量低价值任务应先做路由。",
    sources: [sources.openaiModels],
  },
  {
    id: "gpt-5-6-terra",
    code: "O·TER",
    provider: "OpenAI",
    name: "GPT-5.6 Terra",
    coding: 4,
    everyday: 4,
    contextTokens: 1_050_000,
    price: { input: 2, output: 12, basis: "每百万 tokens" },
    costBand: "$$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.openaiModels.href,
      codingRationale: "官方将其放在成本与能力均衡的长上下文档；Radar 视为高频编码候选，而非最难任务默认值。",
      everydayRationale: "1.05M 上下文与均衡定位适合文档、分析和通用协作，是需要真实回放确认的强档候选。",
    },
    fit: "成本敏感的日常编码、分析与长文档工作。",
    tradeoff: "极难工程任务应与更高能力档做真实任务回放。",
    sources: [sources.openaiModels],
  },
  {
    id: "claude-fable-5",
    code: "A·FAB",
    provider: "Anthropic",
    name: "Claude Fable 5",
    coding: 5,
    everyday: 5,
    contextTokens: 1_000_000,
    price: { input: 10, output: 50, basis: "每百万 tokens" },
    costBand: "$$$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.anthropicModels.href,
      codingRationale: "官方模型总览将其置于最高复杂度软件工程与 Agent 任务；Radar 因而列入最高候选档。",
      everydayRationale: "通用推理与 1M 上下文定位很强，但最高价格使它更像升级路由而不是日常默认。",
    },
    fit: "高复杂度软件工程、研究与需要长链路判断的任务。",
    tradeoff: "单次与长输出成本最高，需严格控制调用边界。",
    sources: [sources.anthropicModels, sources.anthropicPrice],
  },
  {
    id: "claude-opus-5",
    code: "A·OPU",
    provider: "Anthropic",
    name: "Claude Opus 5",
    coding: 5,
    everyday: 5,
    contextTokens: 1_000_000,
    price: { input: 5, output: 25, basis: "每百万 tokens" },
    costBand: "$$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.anthropicModels.href,
      codingRationale: "官方定位强调复杂代码与长链路 Agent 工作；Radar 将其作为大型重构和审查的最高候选档。",
      everydayRationale: "1M 上下文和高能力定位覆盖复杂日常知识工作，成本仍要求任务分流。",
    },
    fit: "大型重构、复杂审查与高精度知识工作。",
    tradeoff: "不适合无路由地承接所有轻量日常请求。",
    sources: [sources.anthropicModels, sources.anthropicPrice],
  },
  {
    id: "claude-sonnet-5",
    code: "A·SON",
    provider: "Anthropic",
    name: "Claude Sonnet 5",
    coding: 5,
    everyday: 4,
    contextTokens: 1_000_000,
    price: {
      input: 2,
      output: 10,
      standardInput: 3,
      standardOutput: 15,
      promotionEndsAt: "2026-08-31T23:59:59+08:00",
      basis: "每百万 tokens；当前为限时价",
    },
    costBand: "$$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.anthropicModels.href,
      codingRationale: "官方定位覆盖高频编码与 Agent 工作；Radar 将其列为生产编码的最高候选档，仍需仓库回放。",
      everydayRationale: "均衡速度、上下文和限时成本适合通用生产任务，因此列入强档而非绝对最高档。",
    },
    fit: "高频 Agent 编码、代码审查与通用生产工作流。",
    tradeoff: "限时价结束后必须按标准价重新计算预算。",
    sources: [sources.anthropicModels, sources.anthropicPrice],
  },
  {
    id: "gemini-3-6-flash",
    code: "G·FLA",
    provider: "Google",
    name: "Gemini 3.6 Flash",
    coding: 4,
    everyday: 4,
    contextTokens: 1_000_000,
    price: { input: 1.5, output: 7.5, basis: "每百万 tokens" },
    costBand: "$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.googleModels.href,
      codingRationale: "官方定位强调快速、高吞吐与工具任务；Radar 将其作为成本受限编码流程的强档候选。",
      everydayRationale: "多模态、长上下文与吞吐定位覆盖大量日常任务，但复杂质量仍需独立验证。",
    },
    fit: "高吞吐、多模态日常任务与成本约束下的编码辅助。",
    tradeoff: "复杂仓库任务需用自身工具链验证，不以厂商定位代替回归。",
    sources: [sources.googleModels, sources.googlePrice],
  },
  {
    id: "deepseek-v4-pro",
    code: "D·PRO",
    provider: "DeepSeek",
    name: "DeepSeek V4 Pro",
    coding: 4,
    everyday: 4,
    contextTokens: 1_000_000,
    price: { input: 0.435, output: 0.87, basis: "每百万 tokens；输入按缓存未命中" },
    costBand: "$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.deepseekModels.href,
      codingRationale: "基于官方 Pro 定位与当前站点中文结构化任务观察，Radar 将其作为成本敏感工程任务的强档候选。",
      everydayRationale: "中文处理、长上下文与低价格适合批量知识工作；跨场景稳定性仍需任务回放。",
    },
    fit: "成本敏感的中文分析、代码任务与批量结构化处理。",
    tradeoff: "价格比较需区分缓存命中与未命中，本页使用未命中口径。",
    sources: [sources.deepseekModels],
  },
  {
    id: "deepseek-v4-flash",
    code: "D·FLS",
    provider: "DeepSeek",
    name: "DeepSeek V4 Flash",
    coding: 3,
    everyday: 3,
    contextTokens: 1_000_000,
    price: { input: 0.14, output: 0.28, basis: "每百万 tokens；输入按缓存未命中" },
    costBand: "$",
    assessment: {
      evaluatedAt: modelDataVerifiedAt,
      evidenceHref: sources.deepseekModels.href,
      codingRationale: "官方 Flash 定位与本站结构化分析用途都偏高吞吐；Radar 将其作为常规代码辅助候选，不列入困难仓库高档。",
      everydayRationale: "低成本中文摘要、分类和批处理适合日常规模化使用，但不能替代高难推理路由。",
    },
    fit: "高频分类、中文摘要与可接受规则回退的批处理。",
    tradeoff: "不应仅因价格低而承接最高难度代码库任务。",
    sources: [sources.deepseekModels],
  },
];

export const capabilityBandLabels: Record<CapabilityBand, string> = {
  1: "有限",
  2: "基础",
  3: "稳健",
  4: "强",
  5: "前沿",
};

export function formatTokenPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatContext(tokens: number) {
  return tokens === 1_050_000 ? "1.05M" : `${tokens / 1_000_000}M`;
}

export function resolveCapabilityCellLayout<T>(records: T[]) {
  if (records.length <= 3) return { visibleRecords: records, overflowCount: 0 };
  return { visibleRecords: records.slice(0, 2), overflowCount: records.length - 2 };
}

export function resolveModelPrice(price: ModelPrice, at: Date | string | number = new Date()) {
  const now = new Date(at).getTime();
  const promotionEnd = price.promotionEndsAt ? new Date(price.promotionEndsAt).getTime() : Number.NaN;
  const hasPromotion = Number.isFinite(promotionEnd)
    && price.standardInput !== undefined
    && price.standardOutput !== undefined;
  const isPromotion = hasPromotion && now <= promotionEnd;
  return {
    ...price,
    input: isPromotion ? price.input : price.standardInput ?? price.input,
    output: isPromotion ? price.output : price.standardOutput ?? price.output,
    isPromotion,
  };
}

export function resolveActiveRadarModelId({
  provider,
  deepseekModel,
  openaiModel,
  deepseekApiKey,
  openaiApiKey,
  disableAi,
  disableOpenAI,
}: {
  provider?: string;
  deepseekModel?: string;
  openaiModel?: string;
  deepseekApiKey?: string;
  openaiApiKey?: string;
  disableAi?: boolean;
  disableOpenAI?: boolean;
}) {
  if (disableAi) return null;
  const configuredProvider = (provider || "auto").trim().toLowerCase();
  let selectedProvider: "openai" | "deepseek" | "rules" = "rules";
  if (configuredProvider === "openai") selectedProvider = openaiApiKey && !disableOpenAI ? "openai" : "rules";
  else if (configuredProvider === "deepseek") selectedProvider = deepseekApiKey ? "deepseek" : "rules";
  else if (configuredProvider === "auto") {
    if (openaiApiKey && !disableOpenAI) selectedProvider = "openai";
    else if (deepseekApiKey) selectedProvider = "deepseek";
  }
  if (selectedProvider === "deepseek") {
    const selectedModel = (deepseekModel || "deepseek-v4-flash").toLowerCase();
    return modelRecords.find((model) => model.provider === "DeepSeek" && model.name.toLowerCase().replaceAll(" ", "-") === selectedModel)?.id ?? null;
  }
  if (selectedProvider === "openai") {
    const selectedModel = (openaiModel || "gpt-5.6-terra").toLowerCase();
    return modelRecords.find((model) => model.provider === "OpenAI" && model.name.toLowerCase().replaceAll(" ", "-") === selectedModel)?.id ?? null;
  }
  return null;
}
