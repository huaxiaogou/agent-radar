import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const projectRoot = new URL("../", import.meta.url);
const projectPath = fileURLToPath(projectRoot);
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
let serverProcess;
let baseUrl;
let serverOutput = "";
let dataDirectory;

const conceptFixture = {
  conceptSlug: "agent-harness",
  sourceName: "Agent Harness Official",
  sourceUrl: "https://example.com/official-agent-harness",
  secondSourceUrl: "https://example.com/official-agent-harness-telemetry",
};

const graphTargetConceptFixture = {
  slug: "durable-execution",
  name: "Durable Execution",
};

const promotedCandidateProjectionFixtures = [
  {
    candidateName: "Agent Harness",
    identityKind: "canonical name and slug",
  },
  {
    candidateName: "智能体运行支架",
    identityKind: "formal alias",
  },
  {
    candidateName: "Legacy Agent Runtime",
    identityKind: "merged redirect identity",
  },
];

const discussionFixture = {
  chineseTitle: "多智能体编排在真实代码库里如何验收？",
  chineseUrl: "https://github.com/example-cn/agent-coding/issues/88",
  englishTitle: "How we debug long-running agent harnesses",
  englishUrl: "https://news.ycombinator.com/item?id=424242",
};

const candidateConceptFixture = {
  slug: "agent-reliability-engineering",
  name: "Agent Reliability Engineering",
  communityUrl: "https://github.com/example-cn/agent-coding/issues/89",
  practitionerUrl: "https://practitioner.example.com/agent-reliability-engineering",
};

const signalOnlyFixture = {
  slug: "agent-reliability-engineering-candidate",
  title: "Agent Reliability Engineering 成为待溯源概念候选",
};

const projectionEvidenceFixture = {
  watchUrl: "https://github.com/example-cn/agent-coding/issues/90",
  watchTitle: "社区观察 Agent Harness 的审批边界",
  rejectUrl: "https://github.com/example-cn/agent-coding/issues/91",
  rejectTitle: "已否定的 Agent Harness 推测",
};

const sparseConceptFixture = {
  slug: "sparse-evidence-concept",
  name: "稀疏证据概念",
};

const themedConceptFixture = {
  slug: "theme-search-sentinel",
  name: "主题分类检索哨兵",
  theme: "evaluation-verification",
  chineseThemeName: "评测与验证",
  englishThemeAlias: "Evals",
};

const formalSupportFixture = {
  url: "https://research.example.org/durable-agent-runtime",
  title: "Independent field study of durable agent runtimes",
  sourceName: "Runtime Systems Research",
  sourceId: "rendered-runtime-research",
  independentGroup: "rendered-runtime-research",
};

const denseLearningQueueFixture = {
  todayNew: [
    { slug: "today-new-concept", name: "今日新增知识对象", analyzedAt: "2026-08-09T16:30:00.000Z" },
    { slug: "today-new-context-contract", name: "今日新增上下文契约", analyzedAt: "2026-08-09T16:01:00.000Z" },
    { slug: "today-new-tool-governance", name: "今日新增工具治理", analyzedAt: "2026-08-09T18:30:00.000Z" },
    { slug: "today-new-verification-loop", name: "今日新增验证闭环", analyzedAt: "2026-08-09T19:30:00.000Z" },
  ],
  todayRevised: [
    { slug: "today-material-revision", name: "今日实质修订对象", revisedAt: "2026-08-09T17:00:00.000Z" },
    { slug: "today-revised-runtime-boundary", name: "今日修订运行边界", revisedAt: "2026-08-09T16:15:00.000Z" },
    { slug: "today-revised-review-contract", name: "今日修订审查契约", revisedAt: "2026-08-09T19:00:00.000Z" },
    { slug: "today-revised-recovery-semantics", name: "今日修订恢复语义", revisedAt: "2026-08-09T20:00:00.000Z" },
  ],
  recentControversy: [
    { slug: "weekly-controversy-context-isolation", name: "上下文隔离争议", revisedAt: "2026-08-09T08:00:00.000Z" },
    { slug: "weekly-controversy-human-approval", name: "人工审批争议", revisedAt: "2026-08-09T09:00:00.000Z" },
    { slug: "weekly-controversy-agent-memory", name: "智能体记忆争议", revisedAt: "2026-08-09T10:00:00.000Z" },
    { slug: "weekly-controversy-parallel-agents", name: "并行智能体争议", revisedAt: "2026-08-09T11:00:00.000Z" },
  ],
};

async function seedConceptKnowledgeIfAvailable(database) {
  let knowledge;
  try {
    knowledge = await import("../radar/concept-knowledge.mjs");
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return false;
    throw error;
  }
  if (typeof knowledge.applyConceptKnowledgeRevision !== "function") return false;
  const citedFields = [
    "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
    "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs", "failureModes",
    "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
  ];
  const officialApprovalEvidence = {
    url: conceptFixture.sourceUrl,
    originalTitle: "Agent Harness adds durable approvals",
    sourceName: conceptFixture.sourceName,
    sourceLayer: "official",
    independentGroup: "agent-harness-official",
    supports: ["approval-boundary", "tool-trace"],
    stance: "support",
    publishedAt: "2026-08-01T07:00:00.000Z",
  };
  const officialTelemetryEvidence = {
    url: conceptFixture.secondSourceUrl,
    originalTitle: "Agent Harness exposes auditable tool telemetry",
    sourceName: conceptFixture.sourceName,
    sourceLayer: "official",
    independentGroup: "agent-harness-official",
    supports: ["approval-boundary", "tool-trace"],
    stance: "support",
    publishedAt: "2026-08-01T07:30:00.000Z",
  };
  const practitionerEvidence = {
    url: candidateConceptFixture.practitionerUrl,
    originalTitle: "A field note on Agent Reliability Engineering",
    sourceName: "Independent Agent Engineer",
    sourceLayer: "practitioner",
    independentGroup: "rendered-candidate-practitioner",
    supports: ["approval-boundary", "tool-trace"],
    stance: "context",
    publishedAt: "2026-08-01T06:55:00.000Z",
  };
  const independentSupportEvidence = {
    url: formalSupportFixture.url,
    originalTitle: formalSupportFixture.title,
    sourceName: formalSupportFixture.sourceName,
    sourceLayer: "practitioner",
    independentGroup: formalSupportFixture.independentGroup,
    supports: ["approval-boundary", "tool-trace"],
    stance: "support",
    publishedAt: "2026-08-01T06:57:00.000Z",
  };
  const basePayload = {
    concept: {
      slug: conceptFixture.conceptSlug,
      canonicalName: "Agent Harness",
      aliases: ["Agent Harness", "智能体运行支架"],
      themes: ["agent-runtime"],
      stage: "validated",
      heat: 78,
      maturity: 72,
      definition: "Agent Harness 是约束 Coding Agent 工具循环、权限、状态、恢复和验收证据的运行时边界。",
      nonDefinition: "它不是一组提示词，也不是只负责调用模型的 SDK 包装层。",
      problem: "长任务中的状态漂移、权限越界和失败恢复缺少统一运行契约。",
      whyNow: "Coding Agent 正在转向后台长任务，模型能力提升后，运行可靠性成为主要工程瓶颈。",
      origin: "现有官方材料把检查点、审批与工具遥测逐步收敛到同一运行时边界；命名起源仍待独立溯源。",
      evolution: ["从单轮工具循环演进到具有持久状态、权限关口和可审计验收的运行时。"],
      mechanism: "Harness 在每次工具调用前校验权限，在副作用前后记录检查点，并把验收结果写回权威任务状态。",
      architecture: "任务控制面连接上下文组装器、权限网关、工具执行器、状态存储和验收器。",
      designConstraints: ["状态写入早于不可逆副作用", "恢复路径复用同一权限规则"],
      implementationPatterns: ["检查点与幂等工具调用", "审批作为显式状态转换"],
      antiPatterns: ["只在对话历史中保存任务状态", "用无限重试代替恢复语义"],
      tradeoffs: ["增加状态与观测成本，换取长任务可恢复性"],
      failureModes: ["检查点和外部副作用不一致会重复执行"],
      securityRisks: ["恢复任务复用过期授权会造成权限越界"],
      operationalConcerns: ["需要控制 trace 与检查点的保留成本"],
      applicability: ["包含多阶段副作用、审批和验收的长任务"],
      nonApplicability: ["无状态且一次工具调用即可完成的短任务"],
      controversies: ["当前公开证据仍不足以证明所有 Harness 实现都具备原子恢复语义。"],
      dailyDelta: "本周新增工具遥测证据，强化了可审计性结论，但原子恢复仍待验证。",
      lastMeaningfulChange: "2026-08-01T08:00:00.000Z",
    },
    claims: [
      { key: "approval-boundary", text: "审批必须被建模为显式状态转换。", kind: "pattern", confidence: 0.82 },
      { key: "tool-trace", text: "工具输入、输出、权限决策和错误原因需要进入可查询 trace。", kind: "mechanism", confidence: 0.76 },
    ],
    evidence: [officialApprovalEvidence, officialTelemetryEvidence, independentSupportEvidence],
    citations: citedFields.map((field) => ({
      field,
      evidenceUrls: field === "implementationPatterns" ? [formalSupportFixture.url] : [conceptFixture.sourceUrl],
    })),
    relations: [],
  };

  const durableExecutionPayload = structuredClone(basePayload);
  durableExecutionPayload.concept = {
    ...durableExecutionPayload.concept,
    slug: graphTargetConceptFixture.slug,
    canonicalName: graphTargetConceptFixture.name,
    aliases: [graphTargetConceptFixture.name, "持久执行"],
    stage: "emerging",
    definition: "Durable Execution 通过持久检查点和幂等恢复，使长时间运行的智能体任务能够在中断后继续执行。",
    nonDefinition: "它不是给普通函数增加无限重试，也不是只把对话历史保存到数据库。",
    problem: "长时间任务在进程中断、工具失败或人工暂停后，容易丢失权威状态并重复产生外部副作用。",
    whyNow: "后台 Coding Agent 开始承担多阶段任务，持久状态与可验证恢复成为运行时的基础约束。",
    origin: "现有官方材料提供了检查点与恢复证据；这一术语的更早工程来源仍需独立溯源。",
    mechanism: "执行器在副作用边界保存检查点，并使用稳定幂等键从最后一个已确认状态恢复未完成步骤。",
    architecture: "持久状态存储、任务执行器、幂等工具网关和恢复协调器共同组成可中断后继续的执行链。",
    dailyDelta: "正式修订链建立 Durable Execution 端点，用于验证有证据支持的公开概念关系。",
    lastMeaningfulChange: "2026-08-01T08:10:00.000Z",
  };
  durableExecutionPayload.claims = [
    { key: "durable-checkpoint", text: "外部副作用前需要保存可恢复检查点。", kind: "mechanism", confidence: 0.84 },
    { key: "idempotent-resume", text: "恢复执行必须使用稳定幂等键避免重复副作用。", kind: "constraint", confidence: 0.78 },
  ];
  durableExecutionPayload.evidence = [officialApprovalEvidence, officialTelemetryEvidence, independentSupportEvidence].map((item) => ({
    ...item,
    supports: ["durable-checkpoint", "idempotent-resume"],
  }));
  durableExecutionPayload.relations = [];
  knowledge.applyConceptKnowledgeRevision(database, durableExecutionPayload, {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: "2026-08-01T08:10:00.000Z",
    reason: "建立正式关系目标概念",
  });

  knowledge.applyConceptKnowledgeRevision(database, basePayload, {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: "2026-08-01T08:00:00.000Z",
    reason: "rendered production-chain fixture",
  });

  const candidatePayload = structuredClone(basePayload);
  candidatePayload.concept = {
    ...candidatePayload.concept,
    slug: candidateConceptFixture.slug,
    canonicalName: candidateConceptFixture.name,
    aliases: [candidateConceptFixture.name, "智能体可靠性工程"],
    themes: ["evaluation-verification"],
    stage: "candidate",
    heat: 66,
    maturity: 28,
    definition: "Agent Reliability Engineering 是把长任务智能体的恢复、验收和运行证据作为独立工程对象持续验证的候选概念。",
    nonDefinition: "它不是给工具调用增加无限重试，也不是把一次成功演示包装为完整可靠性能力。",
    problem: "长时间运行的 Coding Agent 在中断、重试和人工介入后，缺少可以复现和审计的可靠性边界。",
    whyNow: "社区和独立实践正在共同讨论恢复与验收，但名称边界和跨组织验证仍未形成稳定共识。",
    origin: "当前只能确认社区提出了这一候选名称，独立实践补充了实现观察，最早命名来源仍待继续溯源。",
    mechanism: "候选机制把任务检查点、失败恢复、验收证据和人工责任组织为可以重复检验的运行闭环。",
    architecture: "任务控制面、检查点存储、恢复协调器和验收器构成当前材料可见的候选系统结构。",
    dailyDelta: "最近一次分析补充了独立实践证据，但与既有 Agent Harness 的概念差异仍待确认。",
    lastMeaningfulChange: "2026-08-03T10:20:00.000Z",
  };
  candidatePayload.claims = [{
    key: "candidate-reliability-boundary",
    text: "候选材料把恢复与验收证据视为长任务智能体可靠性的共同边界。",
    kind: "boundary",
    confidence: 0.68,
  }];
  candidatePayload.evidence = [
    {
      url: candidateConceptFixture.communityUrl,
      originalTitle: "社区提出 Agent Reliability Engineering 这一候选名称",
      sourceName: "中文 Agent 社区",
      sourceLayer: "community",
      independentGroup: "rendered-chinese-community",
      supports: ["candidate-reliability-boundary"],
      stance: "context",
      publishedAt: "2026-08-01T06:50:00.000Z",
    },
    {
      url: candidateConceptFixture.practitionerUrl,
      originalTitle: "A field note on Agent Reliability Engineering",
      sourceName: "Independent Agent Engineer",
      sourceLayer: "practitioner",
      independentGroup: "rendered-candidate-practitioner",
      supports: ["candidate-reliability-boundary"],
      stance: "support",
      publishedAt: "2026-08-01T06:55:00.000Z",
    },
  ];
  candidatePayload.citations = citedFields.map((field) => ({
    field,
    evidenceUrls: [field === "origin" ? candidateConceptFixture.communityUrl : candidateConceptFixture.practitionerUrl],
  }));
  candidatePayload.relations = [];
  knowledge.applyConceptKnowledgeRevision(database, candidatePayload, {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: "2026-08-03T10:20:00.000Z",
    reason: "建立候选详情并记录晋级缺口",
  });

  const evidenceOnly = structuredClone(basePayload);
  evidenceOnly.evidence.push(practitionerEvidence);
  evidenceOnly.concept.dailyDelta = "补充独立实践上下文，不改变 Agent Harness 的机制结论。";
  knowledge.applyConceptKnowledgeRevision(database, evidenceOnly, {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: "2026-08-02T09:00:00.000Z",
    reason: "补充独立实践上下文",
  });

  const materialRevision = structuredClone(evidenceOnly);
  materialRevision.concept.problem = "长任务中的状态漂移、权限越界、副作用确认与失败恢复需要同一个权威运行契约。";
  materialRevision.concept.whyNow = "Coding Agent 转向后台长任务后，副作用确认、恢复语义和审批追踪成为主要工程瓶颈。";
  materialRevision.concept.mechanism = "Harness 现在把权限校验、外部副作用确认与失败恢复统一建模为可审计状态转换。";
  materialRevision.concept.architecture = "任务控制面把权限网关、副作用确认器、持久状态、恢复协调器和验收器连成可追溯执行链。";
  materialRevision.concept.controversies = ["独立实践对外部副作用确认时机仍存在分歧。"];
  materialRevision.concept.dailyDelta = "新的独立实践证据修订了副作用确认边界。";
  materialRevision.evidence.find((item) => item.url === candidateConceptFixture.practitionerUrl).stance = "conflict";
  materialRevision.relations = [{
    type: "depends-on",
    targetSlug: graphTargetConceptFixture.slug,
    explanation: "Agent Harness 的中断恢复依赖 Durable Execution 提供的持久检查点与幂等恢复语义。",
    evidenceUrls: [conceptFixture.sourceUrl],
    confidence: 0.86,
  }];
  knowledge.applyConceptKnowledgeRevision(database, materialRevision, {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    analyzedAt: "2026-08-03T11:30:00.000Z",
    reason: "副作用确认边界发生实质修订",
  });

  function payloadFor({ slug, name, analyzedAt, dailyDelta, heat = 78 }) {
    const payload = structuredClone(basePayload);
    payload.concept = {
      ...payload.concept,
      slug,
      canonicalName: name,
      aliases: [name, `${name} 工程别名`],
      heat,
      definition: `${name} 是由可追溯证据维护、具有明确机制边界的高级 AI Coding 工程知识对象。`,
      dailyDelta,
      lastMeaningfulChange: analyzedAt,
    };
    payload.evidence = [officialApprovalEvidence, { ...practitionerEvidence, stance: "support" }];
    payload.citations = citedFields.map((field) => ({
      field,
      evidenceUrls: field === "implementationPatterns" ? [candidateConceptFixture.practitionerUrl] : [conceptFixture.sourceUrl],
    }));
    return payload;
  }

  knowledge.applyConceptKnowledgeRevision(database, payloadFor({
    slug: "old-single-revision",
    name: "旧单版本概念",
    analyzedAt: "2026-08-01T10:00:00.000Z",
    dailyDelta: "历史首次建立，不属于当前快照当天新增。",
  }), {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-01T10:00:00.000Z", reason: "历史首版",
  });

  for (const item of denseLearningQueueFixture.todayNew) {
    knowledge.applyConceptKnowledgeRevision(database, payloadFor({
      ...item,
      dailyDelta: `${item.name}在当前上海自然日首次建立正式知识对象。`,
    }), {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: item.analyzedAt, reason: "今日首版",
    });
  }

  const contextOnlyInitial = payloadFor({
    slug: "today-evidence-only",
    name: "今日仅补证据对象",
    analyzedAt: "2026-08-01T10:30:00.000Z",
    dailyDelta: "历史首次建立。",
  });
  knowledge.applyConceptKnowledgeRevision(database, contextOnlyInitial, {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-01T10:30:00.000Z", reason: "历史首版",
  });
  const contextOnlyRevision = structuredClone(contextOnlyInitial);
  contextOnlyRevision.evidence.push(officialTelemetryEvidence);
  contextOnlyRevision.concept.dailyDelta = "当天只补充上下文证据，没有改变语义。";
  knowledge.applyConceptKnowledgeRevision(database, contextOnlyRevision, {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-09T16:45:00.000Z", reason: "仅补充上下文证据",
  });

  for (const [index, item] of denseLearningQueueFixture.todayRevised.entries()) {
    const initialAt = `2026-08-01T${String(11 + index).padStart(2, "0")}:00:00.000Z`;
    const materialInitial = payloadFor({
      slug: item.slug,
      name: item.name,
      analyzedAt: initialAt,
      dailyDelta: "历史首次建立。",
    });
    knowledge.applyConceptKnowledgeRevision(database, materialInitial, {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: initialAt, reason: "历史首版",
    });
    const materialToday = structuredClone(materialInitial);
    materialToday.concept.definition = `${item.name}现在明确把状态恢复、外部副作用和验收证据纳入同一工程边界。`;
    materialToday.concept.dailyDelta = "当天定义边界发生实质修订。";
    materialToday.concept.lastMeaningfulChange = item.revisedAt;
    knowledge.applyConceptKnowledgeRevision(database, materialToday, {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: item.revisedAt, reason: "定义边界发生实质修订",
    });
  }

  for (const [index, item] of denseLearningQueueFixture.recentControversy.entries()) {
    const initialAt = `2026-07-30T${String(8 + index).padStart(2, "0")}:00:00.000Z`;
    const controversyInitial = payloadFor({
      slug: item.slug,
      name: item.name,
      analyzedAt: initialAt,
      dailyDelta: "历史首次建立，尚未发现公开工程分歧。",
      heat: 61 + index,
    });
    controversyInitial.concept.controversies = [];
    controversyInitial.citations = controversyInitial.citations.filter((citation) => citation.field !== "controversies");
    knowledge.applyConceptKnowledgeRevision(database, controversyInitial, {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: initialAt, reason: "历史首版",
    });
    const controversyRevision = structuredClone(controversyInitial);
    controversyRevision.concept.controversies = [`${item.name}出现新的、由来源支持的工程边界分歧。`];
    controversyRevision.concept.dailyDelta = "近七日材料引入新的工程争议，需要保留不同观点。";
    controversyRevision.concept.lastMeaningfulChange = item.revisedAt;
    controversyRevision.citations.push({ field: "controversies", evidenceUrls: [conceptFixture.sourceUrl] });
    knowledge.applyConceptKnowledgeRevision(database, controversyRevision, {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: item.revisedAt, reason: "争议边界发生实质修订",
    });
  }

  knowledge.applyConceptKnowledgeRevision(database, payloadFor({
    slug: "historical-high-heat",
    name: "历史高热概念",
    analyzedAt: "2026-08-01T13:00:00.000Z",
    dailyDelta: "历史阶段曾经高热，但近七天没有新增证据或实质修订。",
    heat: 100,
  }), {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-01T13:00:00.000Z", reason: "历史高热首版",
  });

  const recentWarmingInitial = payloadFor({
    slug: "recent-warming-concept",
    name: "近七日升温概念",
    analyzedAt: "2026-07-30T13:00:00.000Z",
    dailyDelta: "历史版本建立升温比较基线。",
    heat: 1,
  });
  knowledge.applyConceptKnowledgeRevision(database, recentWarmingInitial, {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-07-30T13:00:00.000Z", reason: "升温基线首版",
  });
  const recentWarmingRevision = structuredClone(recentWarmingInitial);
  recentWarmingRevision.concept.heat = 98;
  recentWarmingRevision.concept.dailyDelta = "近七日热度由 1 上升至 98，形成可审计的正增量。";
  recentWarmingRevision.concept.lastMeaningfulChange = "2026-08-08T13:00:00.000Z";
  knowledge.applyConceptKnowledgeRevision(database, recentWarmingRevision, {
    provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-08T13:00:00.000Z", reason: "近七日首版",
  });

  const sparsePayload = payloadFor({
    slug: sparseConceptFixture.slug,
    name: sparseConceptFixture.name,
    analyzedAt: "2026-08-08T14:00:00.000Z",
    dailyDelta: "当前只建立了定义、机制与证据边界，其他工程字段仍待补证。",
    heat: 42,
  });
  sparsePayload.concept.aliases = [];
  for (const field of [
    "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs", "failureModes",
    "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
  ]) sparsePayload.concept[field] = [];
  sparsePayload.citations = ["definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta"]
    .map((field) => ({ field, evidenceUrls: [conceptFixture.sourceUrl] }));
  assert.throws(
    () => knowledge.applyConceptKnowledgeRevision(database, sparsePayload, {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-08T14:00:00.000Z", reason: "新协议不得接受全空工程壳",
    }),
    /核心工程知识不能全部为空|概念不能是空壳/u,
    "新 revision 写入门禁必须拒绝全空工程壳；UI 容错 fixture 只能模拟历史迁移数据",
  );
  if (typeof knowledge.mergeConceptKnowledge === "function") {
    const oldSlug = "legacy-agent-runtime";
    knowledge.applyConceptKnowledgeRevision(database, payloadFor({
      slug: oldSlug,
      name: "旧版 Agent Runtime",
      analyzedAt: "2026-08-01T12:00:00.000Z",
      dailyDelta: "旧名称建立。",
    }), {
      provider: "deepseek", model: "deepseek-v4-flash", analyzedAt: "2026-08-01T12:00:00.000Z", reason: "旧名称首版",
    });
    knowledge.mergeConceptKnowledge(database, {
      fromSlug: oldSlug,
      intoSlug: conceptFixture.conceptSlug,
      reason: "运行机制与 Agent Harness 已归一",
      mergedAt: "2026-08-03T12:10:00.000Z",
    });
  }
  return { sparsePayload };
}

async function createProductionSnapshotFixture() {
  dataDirectory = await mkdtemp(`${os.tmpdir()}/agent-radar-rendered-`);
  process.env.RADAR_DATA_DIR = dataDirectory;

  const { chooseSignalSlug } = await import("../radar/analyze.mjs");
  const {
    beginRun,
    finishRun,
    insertArticle,
    openDatabase,
    replaceModelLandscape,
    updateSourceHealth,
    upsertSourceCatalog,
  } = await import("../radar/database.mjs");
  const { buildSnapshot, writeSnapshotAtomic } = await import("../radar/snapshot.mjs");

  const database = openDatabase();
  try {
    const source = {
      id: "agent-harness-official",
      name: conceptFixture.sourceName,
      homepage: "https://example.com/agent-harness",
      class: "一手工程",
      family: "official",
      priority: "P0",
      cadence: "4h",
      focus: "Agent Harness",
      independentGroup: "agent-harness-official",
    };
    const discussionSources = [
      {
        id: "rendered-chinese-community",
        name: "中文 Agent 社区",
        homepage: "https://github.com/example-cn/agent-coding/issues",
        class: "中文社区",
        family: "community",
        priority: "P1",
        cadence: "4h",
        focus: "多智能体编排 · AI Coding",
        independentGroup: "rendered-chinese-community",
      },
      {
        id: "rendered-english-community",
        name: "Hacker News",
        homepage: "https://news.ycombinator.com/",
        class: "英文社区",
        family: "community",
        priority: "P1",
        cadence: "4h",
        focus: "Agent Harness · Durable execution",
        independentGroup: "rendered-english-community",
      },
    ];
    const candidatePractitionerSource = {
      id: "rendered-candidate-practitioner",
      name: "Independent Agent Engineer",
      homepage: "https://practitioner.example.com",
      class: "实践者",
      family: "practitioner",
      priority: "P1",
      cadence: "8h",
      focus: candidateConceptFixture.name,
      independentGroup: "rendered-candidate-practitioner",
    };
    const formalSupportSource = {
      id: formalSupportFixture.sourceId,
      name: formalSupportFixture.sourceName,
      homepage: "https://research.example.org",
      class: "研究与实践",
      family: "research",
      priority: "P1",
      cadence: "24h",
      focus: "Durable agent runtimes · recovery · approval boundaries",
      independentGroup: formalSupportFixture.independentGroup,
    };
    upsertSourceCatalog(database, [source, ...discussionSources, candidatePractitionerSource, formalSupportSource]);
    const signalSlug = chooseSignalSlug(
      { title: "Agent Harness adds durable approvals" },
      { conceptSlug: conceptFixture.conceptSlug, tags: ["agent-harness", "durable-execution"] },
      [],
    );
    const secondSignalSlug = chooseSignalSlug(
      { title: "Agent Harness exposes auditable tool telemetry" },
      { conceptSlug: conceptFixture.conceptSlug, tags: ["agent-harness", "observability"] },
      [],
    );
    assert.match(signalSlug, /^agent-harness-[a-f0-9]{10}$/);
    assert.match(secondSignalSlug, /^agent-harness-[a-f0-9]{10}$/);
    assert.notEqual(secondSignalSlug, signalSlug);
    const collectedAt = "2026-08-01T08:00:00.000Z";
    assert.equal(insertArticle(database, {
      url: conceptFixture.sourceUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      originalTitle: "Agent Harness adds durable approvals",
      originalExcerpt: "Official evidence for approvals, checkpoints and telemetry.",
      contentText: "Official evidence for approvals, checkpoints and telemetry.",
      publishedAt: "2026-08-01T07:00:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "agent-harness-rendered-fixture",
      relevanceScore: 10,
      signalSlug,
      conceptSlug: conceptFixture.conceptSlug,
      title: "Agent Harness：把审批与恢复放进运行时",
      summary: "官方实现把审批、检查点和遥测纳入 Agent 运行时…",
      implication: "验证审批边界、恢复语义和运行证据，而不只看一次回答。",
      topic: "工程",
      stage: "Validated",
      accent: "engineering",
      tags: ["agent-harness", "durable-execution"],
      analysisMode: "deepseek",
    }), true);
    assert.equal(insertArticle(database, {
      url: discussionFixture.chineseUrl,
      sourceId: discussionSources[0].id,
      sourceName: discussionSources[0].name,
      sourceClass: discussionSources[0].class,
      independentGroup: discussionSources[0].independentGroup,
      sourceLayer: "community",
      sourceLanguage: "zh",
      engagementCount: 180,
      originalTitle: discussionFixture.chineseTitle,
      originalExcerpt: "中文开发者讨论多智能体任务拆分、验收和失败恢复。",
      contentText: "中文开发者讨论多智能体任务拆分、验收和失败恢复。",
      publishedAt: "2026-08-01T06:30:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-chinese-discussion",
      relevanceScore: 10,
      signalSlug: chooseSignalSlug(
        { title: discussionFixture.chineseTitle },
        { conceptSlug: "multi-agent-orchestration", tags: ["multi-agent-orchestration"] },
        [],
      ),
      conceptSlug: "multi-agent-orchestration",
      title: "中文社区正在验证多智能体编排的验收边界",
      summary: "讨论聚焦真实代码库中的角色拆分、验收责任和失败恢复。",
      implication: "社区讨论只能形成候选脉冲，需要官方或独立实践证据交叉验证。",
      topic: "工程",
      stage: "Spark",
      accent: "signal",
      tags: ["multi-agent-orchestration"],
      analysisMode: "deepseek",
      publishDecision: "watch",
      editorialScore: 68,
      aiRelevanceScore: 82,
      noveltyScore: 88,
      evidenceScore: 45,
      eventKey: "community:multi-agent-acceptance",
      candidateConcept: "真实代码库多智能体验收边界",
    }), true);
    assert.equal(insertArticle(database, {
      url: discussionFixture.englishUrl,
      sourceId: discussionSources[1].id,
      sourceName: discussionSources[1].name,
      sourceClass: discussionSources[1].class,
      independentGroup: discussionSources[1].independentGroup,
      sourceLayer: "community",
      sourceLanguage: "en",
      engagementCount: 420,
      originalTitle: discussionFixture.englishTitle,
      originalExcerpt: "An English discussion about checkpoints and traces for long-running coding agents.",
      contentText: "An English discussion about checkpoints and traces for long-running coding agents.",
      publishedAt: "2026-08-01T06:45:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-english-discussion",
      relevanceScore: 9,
      signalSlug: chooseSignalSlug(
        { title: discussionFixture.englishTitle },
        { conceptSlug: "coding-agent", tags: ["coding-agent", "agent-harness"] },
        [],
      ),
      conceptSlug: "coding-agent",
      title: "英文社区讨论长任务 Agent Harness 的调试方法",
      summary: "讨论聚焦检查点、运行 trace 和长任务失败定位。",
      implication: "把讨论沉淀为可重复故障注入和恢复验证，再判断是否具有生产价值。",
      topic: "工程",
      stage: "Spark",
      accent: "signal",
      tags: ["coding-agent", "agent-harness"],
      analysisMode: "deepseek",
      publishDecision: "watch",
      editorialScore: 70,
      aiRelevanceScore: 86,
      noveltyScore: 84,
      evidenceScore: 40,
      eventKey: "community:long-running-agent-debugging",
      candidateConcept: "长任务 Agent 调试工作流",
    }), true);
    const candidateSignalSlug = signalOnlyFixture.slug;
    assert.equal(insertArticle(database, {
      url: candidateConceptFixture.communityUrl,
      sourceId: discussionSources[0].id,
      sourceName: discussionSources[0].name,
      sourceClass: discussionSources[0].class,
      independentGroup: discussionSources[0].independentGroup,
      sourceLayer: "community",
      sourceLanguage: "zh",
      originalTitle: "社区提出 Agent Reliability Engineering 这一候选名称",
      originalExcerpt: "社区讨论长任务 Agent 的恢复、验收和可靠性工程。",
      contentText: "社区讨论长任务 Agent 的恢复、验收和可靠性工程。",
      publishedAt: "2026-08-01T06:50:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-candidate-community",
      relevanceScore: 9,
      signalSlug: candidateSignalSlug,
      conceptSlug: "coding-agent",
      title: "Agent Reliability Engineering 成为待溯源概念候选",
      summary: "模型从社区讨论中抽取这一名称，但尚未证明它已形成稳定定义。",
      implication: "保留原文和证据层级，等待独立工程材料交叉验证。",
      topic: "概念",
      stage: "Spark",
      accent: "signal",
      tags: ["coding-agent", "reliability"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 68,
      aiRelevanceScore: 76,
      noveltyScore: 78,
      evidenceScore: 50,
      eventKey: "agent-reliability-engineering:origin",
      candidateConcept: candidateConceptFixture.name,
    }), true);
    const projectionArticle = ({ url, title, hash, candidateConcept }) => ({
      url,
      sourceId: discussionSources[0].id,
      sourceName: discussionSources[0].name,
      sourceClass: discussionSources[0].class,
      independentGroup: discussionSources[0].independentGroup,
      sourceLayer: "community",
      sourceLanguage: "zh",
      engagementCount: 90,
      originalTitle: title,
      originalExcerpt: "用于验证正式概念与观察证据的公开投影边界。",
      contentText: "用于验证正式概念与观察证据的公开投影边界。",
      publishedAt: "2026-08-01T06:58:00.000Z",
      discoveredAt: collectedAt,
      contentHash: hash,
      relevanceScore: 9,
      signalSlug: `${conceptFixture.conceptSlug}-${hash}`,
      conceptSlug: conceptFixture.conceptSlug,
      title: `观察队列：${title}`,
      summary: "这是待交叉验证的观察材料，不能进入正式概念证据计数。",
      implication: "保留在候选观察区，直到独立正式证据完成验证。",
      topic: "概念",
      stage: "Spark",
      accent: "signal",
      tags: ["agent-harness", "projection-boundary"],
      analysisMode: "deepseek",
      publishDecision: "watch",
      editorialScore: 60,
      aiRelevanceScore: 78,
      noveltyScore: 72,
      evidenceScore: 35,
      eventKey: `projection:${hash}`,
      candidateConcept,
    });
    const watchProjectionArticle = projectionArticle({
      url: projectionEvidenceFixture.watchUrl,
      title: projectionEvidenceFixture.watchTitle,
      hash: "watch-evidence",
      candidateConcept: "Agent Harness Watch Boundary",
    });
    const rejectProjectionArticle = projectionArticle({
      url: projectionEvidenceFixture.rejectUrl,
      title: projectionEvidenceFixture.rejectTitle,
      hash: "reject-evidence",
      candidateConcept: "Agent Harness Rejected Guess",
    });
    assert.equal(insertArticle(database, watchProjectionArticle), true);
    assert.equal(insertArticle(database, rejectProjectionArticle), true);
    assert.equal(insertArticle(database, {
      url: candidateConceptFixture.practitionerUrl,
      sourceId: candidatePractitionerSource.id,
      sourceName: candidatePractitionerSource.name,
      sourceClass: candidatePractitionerSource.class,
      independentGroup: candidatePractitionerSource.independentGroup,
      sourceLayer: "practitioner",
      sourceLanguage: "en",
      originalTitle: "A field note on Agent Reliability Engineering",
      originalExcerpt: "An independent engineering note on recovery and acceptance evidence.",
      contentText: "An independent engineering note on recovery and acceptance evidence.",
      publishedAt: "2026-08-01T06:55:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "rendered-candidate-practitioner",
      relevanceScore: 10,
      signalSlug: candidateSignalSlug,
      conceptSlug: "coding-agent",
      title: "独立实践者补充 Agent Reliability Engineering 证据",
      summary: "实践文章给出恢复与验收方法，但候选名称仍需继续溯源。",
      implication: "把工程观察作为较高层证据展示，不自动晋升正式概念。",
      topic: "概念",
      stage: "Spark",
      accent: "evidence",
      tags: ["coding-agent", "reliability"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 74,
      aiRelevanceScore: 82,
      noveltyScore: 76,
      evidenceScore: 70,
      eventKey: "agent-reliability-engineering:origin",
      candidateConcept: candidateConceptFixture.name,
    }), true);
    assert.equal(insertArticle(database, {
      url: conceptFixture.secondSourceUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.class,
      independentGroup: source.independentGroup,
      originalTitle: "Agent Harness exposes auditable tool telemetry",
      originalExcerpt: "Official evidence for auditable tool-loop telemetry.",
      contentText: "Official evidence for auditable tool-loop telemetry.",
      publishedAt: "2026-08-01T07:30:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "agent-harness-telemetry-rendered-fixture",
      relevanceScore: 9,
      signalSlug: secondSignalSlug,
      conceptSlug: conceptFixture.conceptSlug,
      title: "Agent Harness：遥测让工具循环可审计",
      summary: "第二条中文分析说明工具调用、失败和审批轨迹如何被统一记录。",
      implication: "把每次工具调用的输入、输出、权限决策与错误原因写入可查询 trace。",
      topic: "工程",
      stage: "Validated",
      accent: "evidence",
      tags: ["agent-harness", "observability"],
      analysisMode: "deepseek",
    }), true);
    assert.equal(insertArticle(database, {
      url: formalSupportFixture.url,
      sourceId: formalSupportSource.id,
      sourceName: formalSupportSource.name,
      sourceClass: formalSupportSource.class,
      independentGroup: formalSupportSource.independentGroup,
      sourceLayer: "practitioner",
      sourceLanguage: "en",
      originalTitle: formalSupportFixture.title,
      originalExcerpt: "An independent study of checkpoints, approval boundaries and idempotent recovery in durable coding-agent runtimes.",
      contentText: "An independent study of checkpoints, approval boundaries and idempotent recovery in durable coding-agent runtimes.",
      publishedAt: "2026-08-01T06:57:00.000Z",
      discoveredAt: collectedAt,
      contentHash: "formal-independent-runtime-support",
      relevanceScore: 10,
      signalSlug: "durable-runtime-independent-study",
      conceptSlug: conceptFixture.conceptSlug,
      title: "独立研究验证持久 Agent 运行时的恢复边界",
      summary: "独立实践材料检验检查点、审批边界与幂等恢复。",
      implication: "用第二个独立来源组验证正式概念机制，不把同组官方渠道重复计数。",
      topic: "工程",
      stage: "Emerging",
      accent: "evidence",
      tags: ["agent-harness", "durable-execution", "recovery"],
      analysisMode: "deepseek",
      publishDecision: "publish",
      editorialScore: 82,
      aiRelevanceScore: 88,
      noveltyScore: 74,
      evidenceScore: 86,
      eventKey: "durable-runtime:independent-study",
    }), true);
    const runId = beginRun(database, "test", collectedAt, "deepseek");
    finishRun(database, runId, {
      finishedAt: collectedAt,
      status: "success",
      fetchedCount: 6,
      acceptedCount: 6,
      skippedCount: 0,
      errorCount: 0,
      analysisMode: "deepseek",
      message: "production-reachable rendered fixture",
    });
    updateSourceHealth(database, source, {
      attemptedAt: collectedAt,
      status: "success",
      error: null,
      itemCount: 2,
    });
    for (const discussionSource of discussionSources) {
      updateSourceHealth(database, discussionSource, {
        attemptedAt: collectedAt,
        status: "success",
        error: null,
        itemCount: 1,
      });
    }
    updateSourceHealth(database, candidatePractitionerSource, {
      attemptedAt: collectedAt,
      status: "success",
      error: null,
      itemCount: 1,
    });
    updateSourceHealth(database, formalSupportSource, {
      attemptedAt: collectedAt,
      status: "success",
      error: null,
      itemCount: 1,
    });
    replaceModelLandscape(database, {
      sourceName: "Artificial Analysis",
      sourceUrl: "https://artificialanalysis.ai/models",
      methodologyUrl: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1/",
      attemptedAt: collectedAt,
      models: Array.from({ length: 48 }, (_, index) => ({
        id: `rendered-model-${index}`,
        slug: `rendered-model-${index}`,
        name: `Rendered Model ${index} ${index % 3 === 0 ? "(high)" : ""}`.trim(),
        shortName: `Rendered Model ${index}`,
        providerName: ["OpenAI", "Anthropic", "Google", "DeepSeek", "Alibaba", "Meta", "Mistral", "Amazon", "NVIDIA", "Kimi"][index % 10],
        providerSlug: ["openai", "anthropic", "google", "deepseek", "alibaba", "meta", "mistral", "amazon", "nvidia", "kimi"][index % 10],
        providerColor: null,
        codingIndex: 22 + index,
        intelligenceIndex: 12 + index * .8,
        costPerTask: .008 + index * .035,
        isReasoning: index % 2 === 0,
        isOpenWeights: index % 3 === 0,
        releaseDate: "2026-08-01",
        contextWindowTokens: 128000,
        href: `https://artificialanalysis.ai/models/rendered-model-${index}`,
      })),
    });
    const seededConceptKnowledge = await seedConceptKnowledgeIfAvailable(database);
    for (const slug of [conceptFixture.conceptSlug, graphTargetConceptFixture.slug]) {
      const row = database.prepare("SELECT stage, payload_json FROM concept_knowledge WHERE slug = ?").get(slug);
      assert.ok(row, `fixture 必须产生 ${slug} 权威知识行`);
      const payload = JSON.parse(row.payload_json);
      const publishedSupportGroups = new Set(payload.evidence
        .filter((item) => item.publishDecision === "publish" && item.stance === "support")
        .map((item) => item.independentGroup));
      assert.ok(
        !["candidate", "archived"].includes(row.stage) && publishedSupportGroups.size >= 2,
        `${slug} 必须由至少两个独立 publish support 来源组形成正式知识；stage=${row.stage} groups=${[...publishedSupportGroups].join(",")}`,
      );
    }
    for (const [index, candidate] of promotedCandidateProjectionFixtures.entries()) {
      const source = discussionSources[0];
      const url = `https://github.com/example-cn/agent-coding/issues/promoted-candidate-${index + 1}`;
      assert.equal(insertArticle(database, {
        url,
        sourceId: source.id,
        sourceName: source.name,
        sourceClass: source.class,
        independentGroup: source.independentGroup,
        sourceLayer: "community",
        sourceLanguage: "zh",
        engagementCount: 12 + index,
        originalTitle: `历史候选投影：${candidate.candidateName}`,
        originalExcerpt: `该历史文章仍保留 ${candidate.identityKind} 候选字段，用于验证正式晋升后的身份隔离。`,
        contentText: `该历史文章仍保留 ${candidate.identityKind} 候选字段，用于验证正式晋升后的身份隔离。`,
        publishedAt: `2026-08-01T05:0${index}:00.000Z`,
        discoveredAt: collectedAt,
        contentHash: `promoted-candidate-projection-${index + 1}`,
        relevanceScore: 10,
        signalSlug: `promoted-candidate-projection-${index + 1}`,
        conceptSlug: conceptFixture.conceptSlug,
        title: `历史候选 ${candidate.candidateName} 已被正式身份吸收`,
        summary: "候选观察保留在历史文章中，但不得继续投影为独立候选概念。",
        implication: "正式身份、别名或重定向命中后，应只保留正式概念入口。",
        topic: "概念",
        stage: "Spark",
        accent: "signal",
        tags: ["candidate-identity-projection"],
        analysisMode: "deepseek",
        publishDecision: "watch",
        editorialScore: 68,
        aiRelevanceScore: 82,
        noveltyScore: 58,
        evidenceScore: 40,
        eventKey: `promoted-candidate-projection:${index + 1}`,
        candidateConcept: candidate.candidateName,
      }), true, `${candidate.identityKind} 历史候选必须通过生产 article upsert 进入 SQLite fixture`);
    }
    assert.equal(insertArticle(database, {
      ...rejectProjectionArticle,
      publishDecision: "reject",
      candidateConcept: "",
    }), true, "fixture 必须通过生产 article upsert 把曾经的 watch 证据退役为 reject");
    const snapshot = await buildSnapshot(database);
    const oldSnapshotSignal = snapshot.signals.find((item) => item.slug === secondSignalSlug);
    assert.ok(oldSnapshotSignal);
    const representativeSource = oldSnapshotSignal.sources.find((item) => item.href === conceptFixture.secondSourceUrl);
    assert.ok(representativeSource, "fixture 必须找到生成遥测信号文案的代表原文");
    oldSnapshotSignal.representativeSource = { ...representativeSource };
    delete oldSnapshotSignal.conceptSlug;
    oldSnapshotSignal.sources.unshift({
      name: "证据排序优先来源",
      href: conceptFixture.sourceUrl,
      layer: "official",
      language: "en",
      originalTitle: "Agent Harness adds durable approvals",
      publishedAt: "2026-08-01T07:00:00.000Z",
    });
    oldSnapshotSignal.sources.push({ name: "单条信号内重复引用", href: conceptFixture.secondSourceUrl });
    snapshot.status.generatedAt = "2026-08-10T12:00:00.000Z";
    await writeSnapshotAtomic(snapshot);
    const sparsePayload = seededConceptKnowledge?.sparsePayload;
    if (sparsePayload) {
      const template = structuredClone(snapshot.concepts.find((concept) => concept.slug === conceptFixture.conceptSlug));
      assert.ok(template, "fixture 必须先发布一个完整正式概念，才能验证历史稀疏投影的阅读容错");
      snapshot.concepts.push({
        ...template,
        ...sparsePayload.concept,
        name: sparsePayload.concept.canonicalName,
        stage: "emerging",
        heat: 42,
        temperature: 42,
        maturity: 75,
        independentSourceGroups: 2,
        createdAt: "2026-08-08T14:00:00.000Z",
        revision: 1,
        claims: sparsePayload.claims.map((claim) => ({
          ...claim,
          evidenceUrls: [conceptFixture.sourceUrl],
        })),
        evidence: sparsePayload.evidence.map((evidence) => ({
          ...evidence,
          publishDecision: "publish",
          engagementCount: 0,
        })),
        citations: sparsePayload.citations,
        relations: [],
        knowledgeRelations: [],
        revisions: [{
          revision: 1,
          previousRevision: null,
          provider: "legacy-migration",
          model: "legacy-v0",
          changeReason: "旧版迁移遗留稀疏修订",
          analyzedAt: "2026-08-08T14:00:00.000Z",
          createdAt: "2026-08-08T14:00:00.000Z",
          confidence: 0.78,
          needsReview: false,
          reviewReasons: [],
          materialChange: true,
          delta: { materialChange: true, categories: ["legacy-migration"] },
          fieldDiff: {},
        }],
      });
      await writeFile(`${dataDirectory}/radar-snapshot.json`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    }
  } finally {
    database.close();
  }
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

before(async () => {
  await createProductionSnapshotFixture();
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const serverEnv = {
    ...process.env,
    NODE_ENV: "production",
    RADAR_AI_PROVIDER: "rules",
    RADAR_DISABLE_AI: "1",
    RADAR_DISABLE_OPENAI: "",
  };
  delete serverEnv.OPENAI_API_KEY;
  delete serverEnv.DEEPSEEK_API_KEY;
  serverProcess = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectPath,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.on("data", (chunk) => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready:\n${serverOutput}`);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  delete process.env.RADAR_DATA_DIR;
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

async function render(path = "/", options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { accept: "text/html", ...(options.headers || {}) },
  });
}

async function renderWithSnapshot(path, mutateSnapshot) {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(liveSnapshotText);
  mutateSnapshot(snapshot);
  try {
    await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");
    const response = await render(path);
    return { response, html: await response.text() };
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
}

function addThemedConceptFixture(snapshot) {
  const template = structuredClone(snapshot.concepts.find((concept) => concept.slug === conceptFixture.conceptSlug));
  assert.ok(template, "主题筛选 fixture 必须基于一个真实公开概念投影");
  snapshot.concepts.push({
    ...template,
    slug: themedConceptFixture.slug,
    name: themedConceptFixture.name,
    canonicalName: themedConceptFixture.name,
    aliases: ["主题检索哨兵"],
    themes: [themedConceptFixture.theme],
    definition: "该样本只用于验证受控工程分类能够贯穿导航、筛选与检索，正文不会包含主题显示名。",
  });
}

function learningEntry($, label) {
  return $(".learning-entry").filter((_index, node) => (
    $(node).children("span").first().text().trim() === label
  )).first();
}

function semanticLearningQueue($, category) {
  return $(`[data-learning-category='${category}']`);
}

function semanticLearningItems($, category) {
  return semanticLearningQueue($, category).find("[data-learning-item][data-concept-slug][data-concept-stage]");
}

test("server-renders the Agent Radar experience and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Agent Radar — AI Coding 技术情报<\/title>/i);
  assert.match(html, /今天，不追新闻/);
  assert.match(html, /LIVE INGESTION/);
  assert.doesNotMatch(html, /V1 真实来源回放|实时采集尚未启用/);
  assert.match(html, /href="\/today"/);
  assert.match(html, /href="\/concepts"/);
  assert.match(html, /href="\/models"/);
  assert.match(html, /href="\/discussions"/);
  assert.match(html, /name="theme-color" content="#f2f6f8"/);
  assert.match(html, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/og.png"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("primary routes render with a heading and skip link", async () => {
  const routes = ["/today", "/signals", "/concepts", "/concepts/agent-harness", "/graph", "/models", "/discussions", "/playbooks", "/sources", "/digests", "/search"];
  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<h1[ >]/i, route);
    assert.match(html, /跳到主要内容/, route);
  }
});

test("signal summaries expose an adjacent accessible analysis or original-source action", async () => {
  const response = await render("/signals");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const cards = $(".signal-card");
  assert.ok(cards.length >= 1, "信号页 fixture 必须渲染至少一张真实 SignalCard");

  let originalSourceActionCount = 0;
  cards.each((_index, cardNode) => {
    const card = $(cardNode);
    const summary = card.find(".signal-summary").first();
    assert.equal(summary.length, 1, "每张信号卡必须有唯一摘要");
    const actions = summary.next();
    assert.equal(
      actions.hasClass("signal-summary-actions"),
      true,
      `摘要后必须紧邻明确操作，不能先经过证据图或其他内容：${card.find("h2").text().trim()}`,
    );

    const links = actions.find("a[href]");
    const internalAnalysisLinks = links.filter((_linkIndex, link) => (
      $(link).text().replace(/\s+/g, " ").trim().startsWith("查看完整分析")
    ));
    const originalSourceLinks = links.filter((_linkIndex, link) => (
      $(link).text().replace(/\s+/g, " ").trim().startsWith("阅读原文")
    ));
    assert.ok(
      internalAnalysisLinks.length + originalSourceLinks.length >= 1,
      "邻近操作必须明确命名为“查看完整分析”或“阅读原文”",
    );

    internalAnalysisLinks.each((_linkIndex, link) => {
      const href = $(link).attr("href") || "";
      if (href.startsWith("/concepts/")) {
        assert.match(href, /^\/concepts\/[^/?#]+$/, "正式 concept 分析必须使用真实 concept 路由");
      } else {
        assert.equal(href, `/signals#${card.attr("id")}`, "没有正式 concept 时只能回到当前 signal 的稳定锚点");
      }
      assert.notEqual($(link).attr("target"), "_blank", "站内分析不得无故打开新窗口");
    });

    const cardSourceHrefs = new Set(
      card.find(".source-links a[href]").toArray().map((link) => $(link).attr("href")),
    );
    originalSourceLinks.each((_linkIndex, link) => {
      originalSourceActionCount += 1;
      const href = $(link).attr("href") || "";
      assert.ok(cardSourceHrefs.has(href), "“阅读原文”必须复用该信号真实来源 href，不能生成占位链接");
      assert.equal($(link).attr("target"), "_blank", "外部原文应明确在新窗口打开");
      assert.match($(link).attr("rel") || "", /\b(?:noopener|noreferrer)\b/, "新窗口原文链接必须提供安全 rel");
    });
  });

  assert.ok(originalSourceActionCount >= 1, "信号页至少应提供一个邻近的真实原文入口");
  const truncatedCard = cards.filter((_index, card) => $(card).text().includes("把审批与恢复放进运行时")).first();
  assert.match(truncatedCard.find(".signal-summary").text().trim(), /(?:…|\.\.\.)$/, "fixture 必须覆盖被截断摘要场景");
  assert.equal(truncatedCard.find(".signal-summary").next().hasClass("signal-summary-actions"), true, "被截断摘要尤其不能成为死路");
  const telemetryCard = cards.filter((_index, card) => $(card).text().includes("遥测让工具循环可审计")).first();
  assert.equal(
    telemetryCard.find(".signal-summary-actions a").filter((_index, link) => $(link).text().includes("阅读原文")).attr("href"),
    conceptFixture.secondSourceUrl,
    "邻近“阅读原文”必须使用 representativeSource.href，不能误用证据排序第一项 sources[0]",
  );
});

test("signal cards keep exactly one internal detail entry targeting a real concept or their stable signal anchor", async () => {
  const response = await render("/signals");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const cards = $(".signal-card");
  assert.ok(cards.length >= 1);

  cards.each((_index, cardNode) => {
    const card = $(cardNode);
    const summaryAnalysisLink = card.find(".signal-summary-actions a[href^='/concepts/'], .signal-summary-actions a[href^='/signals#']");
    assert.equal(summaryAnalysisLink.length, 1, "摘要邻近区必须保留唯一站内详情入口");
    const href = summaryAnalysisLink.attr("href");
    assert.equal(card.find(`a[href='${href}']`).length, 1, "每张卡的同一站内详情路由只能出现一次");
    if (href?.startsWith("/signals#")) assert.equal(href, `/signals#${card.attr("id")}`, "signal 回链必须命中自己的稳定锚点");
    assert.equal(card.find("footer a.detail-link").length, 0, "页脚不得再重复渲染“打开分析”");
  });
});

test("model atlas compares coding, everyday capability and price with evidence instead of one leaderboard", async () => {
  const response = await render("/models");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text().replace(/\s+/g, " ");

  assert.equal($("h1").first().text().trim(), "模型坐标");
  assert.match(mainText, /编程能力/);
  assert.match(mainText, /日常能力/);
  assert.match(mainText, /输入价/);
  assert.match(mainText, /输出价/);
  assert.match(mainText, /不是.{0,12}(?:单一|总)排行|不做.{0,12}(?:单一|总)排行/);
  assert.match(mainText, /证据口径/);
  assert.ok($("time[datetime]").length >= 1, "模型数据应暴露机器可读的核验时间");

  const landscape = $(".model-landscape-plot");
  assert.equal(landscape.length, 1, "模型页必须提供能力—成本全景图");
  assert.match(landscape.attr("aria-labelledby") || "", /model-landscape-title/);
  const landscapeText = $(".model-landscape-figure").text().replace(/\s+/g, " ");
  for (const term of ["单任务成本", "对数刻度", "编程指数", "通用智能指数"]) assert.match(landscapeText, new RegExp(term));
  assert.equal(landscape.find("[data-model-id]").length, 48, "全景图必须完整绘制定时采集的所有动态模型");
  assert.equal(landscape.find("[data-model-id][role='img'][aria-label]").length, 48, "每个模型点必须有完整的无障碍说明");
  assert.equal($(".model-landscape-picker select[name='landscape-model']").length, 1, "重叠圆点必须提供全量模型定位器");
  assert.equal($(".model-landscape-picker option").length, 49, "定位器必须覆盖全部动态模型并保留空选项");
  assert.ok(landscape.find(".model-market-labels text").length <= 12, "常驻标签必须限制密度，完整数据由交互与表格承载");
  assert.ok(landscape.find(".model-market-labels text").length > 0, "全景图需要保留关键模型的常驻标签");
  assert.equal(landscape.find(".model-market-label-name").length, landscape.find(".model-market-label-value").length, "关键模型名称必须和坐标值成对呈现");
  assert.ok(landscape.find(".model-market-label-value").length > 0, "图内必须直接显示关键模型的编程、通用和成本坐标");
  assert.ok($(".model-landscape-key span").length >= 10, "厂商图例必须覆盖动态清单中的主要厂商");
  assert.equal($(".model-market-data tbody tr").length, 48, "动态 SVG 必须有全量精确数据表作为无障碍兜底");
  assert.equal(landscape.find("marker, [marker-end], [stroke-dasharray]").length, 0, "整体视图不得保留 DeepSeek 竞争范围虚线或箭头");
  assert.doesNotMatch($(".model-landscape-figure").text(), /竞争范围|本站分析模型/, "全景图不能特殊突出 DeepSeek Flash");

  const comparison = $("table.model-table").first();
  assert.equal(comparison.length, 1, "可视化必须有精确表格作为无障碍兜底");
  assert.ok(comparison.find("caption").text().trim(), "模型对比表需要 caption");
  const headers = comparison.find("th").text().replace(/\s+/g, " ");
  for (const heading of ["模型", "编程能力", "日常能力", "输入价", "输出价", "证据"]) {
    assert.match(headers, new RegExp(heading));
  }
  assert.equal(comparison.find("tbody tr").length, 8, "当前核验目录必须完整展示八个模型");
  const modelNames = comparison.find("tbody tr th[scope='row'] b").toArray().map((node) => $(node).text().trim());
  assert.deepEqual(modelNames, [
    "GPT-5.6 Sol",
    "GPT-5.6 Terra",
    "Claude Fable 5",
    "Claude Opus 5",
    "Claude Sonnet 5",
    "Gemini 3.6 Flash",
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash",
  ]);
  assert.equal($(".model-verification time[datetime='2026-08-01T22:20:00+08:00']").length, 1, "页面级数据核验时间应唯一位于模型页头");
  assert.equal($(".model-note time[datetime='2026-08-01T22:20:00+08:00']").length, 8, "八个模型判断必须分别暴露可核验的评估时间");
  const modelNotes = $(".model-note");
  assert.equal(modelNotes.length, 8);
  modelNotes.each((_index, note) => {
    const noteText = $(note).text();
    assert.match(noteText, /编程档依据/);
    assert.match(noteText, /日常档依据/);
    assert.ok($(note).find("a.model-assessment-source[href^='https://']").length === 1, "每个模型判断必须显示证据链接");
    assert.ok($(note).find("time[datetime]").text().trim(), "每个模型判断必须显示评估时间");
  });

  const officialHosts = new Set(
    $("a[href^='https://']")
      .toArray()
      .map((node) => new URL($(node).attr("href")).hostname)
      .filter((host) => /(?:openai\.com|anthropic\.com|ai\.google\.dev|deepseek\.com)$/.test(host)),
  );
  assert.ok(officialHosts.size >= 3, "至少用三个厂商的官方页面支撑模型与价格信息");
  for (const host of ["developers.openai.com", "platform.claude.com", "ai.google.dev", "api-docs.deepseek.com"]) {
    assert.ok($("a[href^='https://']").toArray().some((node) => new URL($(node).attr("href")).hostname === host), `缺少 ${host} 官方链接`);
  }
  assert.ok($("[aria-label*='模型'][aria-label*='能力']").length >= 1, "能力图需要可访问名称");
  assert.equal($("a[href='/models'][aria-current='page']").length, 1, "模型导航必须精确标记当前页");
  assert.doesNotMatch(mainText, /RADAR ACTIVE|本站当前分析模型/, "没有任何运行时 API key 时，旧 DeepSeek 快照不能冒充当前 active provider");
  assert.doesNotMatch(mainText, /O·SOL|O·TER|A·FAB|A·OPU|A·SON|G·FLA|D·PRO|D·FLS/, "可视图必须展示完整模型名，不能要求读者翻译内部代号");
  assert.match(mainText, /能力.{0,8}价格.{0,12}核验日期/);
  assert.match(mainText, /社区讨论脉冲.{0,12}定时采集更新/);
});

test("discussions page server-renders watch exploration pulses with Chinese LLM reads, original links and explicit evidence boundaries", async () => {
  const response = await render("/discussions");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text().replace(/\s+/g, " ");

  assert.match($("h1").first().text(), /社区讨论|Discussions/i);
  assert.equal($("a[href='/discussions'][aria-current='page']").length, 1);
  const chinese = $("[data-discussion-language='zh'][data-source-layer='community']");
  const english = $("[data-discussion-language='en'][data-source-layer='community']");
  assert.ok(chinese.length >= 1, "必须展示中文社区讨论");
  assert.ok(english.length >= 1, "必须展示英文社区讨论");
  assert.match(mainText, new RegExp(discussionFixture.chineseTitle));
  assert.match(mainText, new RegExp(discussionFixture.englishTitle));
  assert.match(mainText, /讨论聚焦真实代码库中的角色拆分、验收责任和失败恢复/);
  assert.match(mainText, /讨论聚焦检查点、运行 trace 和长任务失败定位/);
  assert.equal(chinese.find(`a[href='${discussionFixture.chineseUrl}']`).length, 1);
  assert.equal(english.find(`a[href='${discussionFixture.englishUrl}']`).length, 1);
  for (const card of [chinese, english]) {
    assert.match(card.attr("data-heat-score") || "", /^\d+(?:\.\d+)?$/, "社区卡片必须公开可解释热度分值");
    assert.match(card.text(), /热度|互动/, "社区卡片必须说明热度或参与线索，不能只在内部排序");
    assert.match(card.text(), /独立来源广度/, "参与维度必须明确表示独立来源组，而不是模糊的用户人数");
    assert.match(card.text(), /待交叉验证|待溯源/, "热度展示必须与证据边界同时出现");
  }
  assert.match(mainText, /官方|实践者|社区/);
});

test("sources page renders configured, available and effective coverage without replacing evidence layers", async () => {
  const response = await render("/sources");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const mainText = $("main").text().replace(/\s+/g, " ");
  assert.match(mainText, /Configured|已配置|正式注册/i);
  assert.match(mainText, /Available|当前可用/i);
  assert.match(mainText, /Effective|当前快照有效/i, "Effective 必须明确是当前公开快照口径，不能暗示历史曾产出即可");
  assert.match(mainText, /独立来源组/, "来源覆盖必须同时公开去重后的独立来源组口径");
  assert.match(mainText, /官方|工程仓库|实践者|社区|研究/);
  assert.match(mainText, /证据层|Evidence Layer/i, "发现 family 不能替代 official/practitioner/community 证据层");
});

test("concepts page renders traceable candidates separately from the established concept catalog", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const candidateSection = $("main section").filter((_index, section) => /待溯源概念候选/.test($(section).text())).first();
  const targetCandidate = candidateSection.find(".candidate-concept-list article").filter((_index, article) => (
    $(article).find("h3").text().trim() === candidateConceptFixture.name
  )).first();

  assert.equal(candidateSection.length, 1, "概念页必须有独立的“待溯源概念候选”区");
  assert.equal(targetCandidate.length, 1, "目标候选必须作为独立候选条目存在，而不是依赖全局候选数量");
  assert.equal(targetCandidate.find(`a[href='${candidateConceptFixture.communityUrl}']`).length, 1);
  assert.equal(targetCandidate.find(`a[href='${candidateConceptFixture.practitionerUrl}']`).length, 1);
  assert.doesNotMatch(
    $(".concept-grid").text(),
    new RegExp(candidateConceptFixture.name),
    "候选不得伪装成已建立概念卡片",
  );
});

test("candidate homepage deduplicates the stored candidate and links to its dedicated learning page", async () => {
  const homeResponse = await render("/concepts");
  assert.equal(homeResponse.status, 200);
  const home = load(await homeResponse.text());
  const candidateCards = home(".candidate-concept-list article").filter((_index, article) => (
    home(article).find("h3").text().trim() === candidateConceptFixture.name
  ));

  assert.equal(candidateCards.length, 1, "同一个存储候选与文章候选必须按规范 slug/别名归一，首页不能重复显示两张同名卡片");
  assert.equal(
    candidateCards.find(`a[href='/concepts/${candidateConceptFixture.slug}']`).length,
    1,
    "候选卡必须提供站内学习入口，原始来源链接不能替代候选详情",
  );
});

test("a promoted formal identity cannot remain in the public candidate projection through historical candidate fields", async () => {
  const snapshot = JSON.parse(await readFile(`${dataDirectory}/radar-snapshot.json`, "utf8"));
  const formal = snapshot.concepts.find((concept) => concept.slug === conceptFixture.conceptSlug);
  assert.ok(formal, "生产 SQLite→snapshot fixture 必须先形成 Agent Harness 正式概念");
  assert.ok(formal.aliases.includes("智能体运行支架"), "fixture 必须证明中文名称是正式概念别名，而不是偶然同名");
  assert.equal(
    snapshot.conceptRedirects["legacy-agent-runtime"]?.redirectTo,
    conceptFixture.conceptSlug,
    "fixture 必须证明旧身份已通过正式 merge redirect 归一到 Agent Harness",
  );

  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const candidateCards = $(".candidate-concept-list article");
  const leaks = [];

  for (const candidate of promotedCandidateProjectionFixtures) {
    const snapshotCandidates = snapshot.candidateConcepts.filter((item) => (
      item.name === candidate.candidateName
      || item.slug === candidate.candidateName.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "")
    ));
    const renderedCandidates = candidateCards.filter((_index, article) => (
      $(article).find("h3").text().trim() === candidate.candidateName
    ));
    if (snapshotCandidates.length || renderedCandidates.length) {
      leaks.push(`${candidate.identityKind}:${candidate.candidateName}:snapshot=${snapshotCandidates.length}:ssr=${renderedCandidates.length}`);
    }
  }
  assert.deepEqual(
    leaks,
    [],
    "canonical name/slug、正式别名和 merge redirect 已归入正式概念后，历史 candidate_concept 均不得同时出现在 snapshot 与 /concepts 候选区",
  );
});

test("candidate detail exposes lifecycle, evidence breadth, promotion gaps and its latest authoritative revision", async () => {
  const detailResponse = await render(`/concepts/${candidateConceptFixture.slug}`);
  assert.equal(detailResponse.status, 200, "权威候选 slug 应有独立详情，而不是沿用正式概念 404 契约");
  const detail = load(await detailResponse.text());
  const dossier = detail("main [data-concept-stage='candidate']").first();
  const text = dossier.text().replace(/\s+/g, " ");

  assert.equal(dossier.length, 1, "候选详情必须以机器可识别的真实 candidate stage 呈现");
  assert.match(text, /Candidate|候选/u, "页面必须明示真实生命周期，不能把候选伪装成 Emerging 或正式知识");
  assert.match(text, /实践者/u, "候选详情必须展示当前已有的实践者证据层");
  assert.match(text, /社区/u, "候选详情必须展示当前已有的社区证据层");
  assert.match(text, /2\s*个?独立来源|独立来源\s*2/u, "独立来源数必须按 independentGroup 去重后公开");
  for (const criterion of ["稳定定义", "独立来源", "实践证据", "与现有概念区分"]) {
    assert.match(text, new RegExp(criterion, "u"), `晋级检查面缺少“${criterion}”`);
  }
  assert.match(text, /已具备|待补齐|待确认/u, "每个晋级条件必须显示当前满足或缺口状态，不能只重复固定说明");
  assert.match(text, /最近分析|最近修订/u, "候选页必须公开最近一次分析或修订，而不是只展示累计原文");
  assert.match(text, /建立候选详情并记录晋级缺口/u, "最近修订需要保留权威 revision 的真实原因");
  assert.equal(detail(`a[href='${candidateConceptFixture.communityUrl}']`).length, 1);
  assert.equal(detail(`a[href='${candidateConceptFixture.practitionerUrl}']`).length, 1);
});

test("controlled engineering themes provide stable navigation and actually filter the formal catalog", async () => {
  const filtered = await renderWithSnapshot(
    `/concepts?theme=${encodeURIComponent(themedConceptFixture.theme)}`,
    addThemedConceptFixture,
  );
  assert.equal(filtered.response.status, 200);
  const concepts = load(filtered.html);
  const themeNavigation = concepts("nav[aria-label='按工程主题筛选']");
  assert.equal(themeNavigation.length, 1, "概念首页必须提供独立的受控工程主题导航，而不只支持生命周期筛选");
  const themeLink = themeNavigation.find(`a[href='/concepts?theme=${themedConceptFixture.theme}']`);
  assert.equal(themeLink.length, 1, "主题导航链接必须使用稳定 theme id，不能把中文显示名当作查询协议");
  assert.match(themeLink.text(), new RegExp(themedConceptFixture.chineseThemeName, "u"));
  assert.equal(concepts(`.concept-ledger-row[data-concept-slug='${themedConceptFixture.slug}']`).length, 1);
  assert.equal(
    concepts(`.concept-ledger-row[data-concept-slug='${conceptFixture.conceptSlug}']`).length,
    0,
    "theme 查询必须真正过滤正式目录，不能只是高亮导航但继续显示全部概念",
  );
});

test("formal concept search matches controlled theme Chinese names and English aliases", async () => {
  for (const query of [themedConceptFixture.chineseThemeName, themedConceptFixture.englishThemeAlias]) {
    const result = await renderWithSnapshot(
      `/search?q=${encodeURIComponent(query)}`,
      addThemedConceptFixture,
    );
    assert.equal(result.response.status, 200);
    const search = load(result.html);
    const match = search(`.search-results a[href='/concepts/${themedConceptFixture.slug}']`);
    assert.equal(match.length, 1, `主题中文名或英文别名“${query}”必须命中所属概念`);
  }
});

test("formal concept projection excludes watch and reject evidence while the watch candidate remains observable", async () => {
  const [detailResponse, conceptsResponse] = await Promise.all([
    render(`/concepts/${conceptFixture.conceptSlug}`),
    render("/concepts"),
  ]);
  assert.equal(detailResponse.status, 200);
  assert.equal(conceptsResponse.status, 200);
  const detailHtml = await detailResponse.text();
  const conceptsHtml = await conceptsResponse.text();
  const detail = load(detailHtml);
  const concepts = load(conceptsHtml);

  for (const [url, title, claim] of [
    [projectionEvidenceFixture.watchUrl, projectionEvidenceFixture.watchTitle, "社区观察提出审批边界"],
    [projectionEvidenceFixture.rejectUrl, projectionEvidenceFixture.rejectTitle, "已否定材料曾推测"],
  ]) {
    assert.equal(detail(`a[href='${url}']`).length, 0, `${url} 不得进入正式概念的证据链接或字段引用`);
    assert.doesNotMatch(detail("main").text(), new RegExp(title), `${title} 不得进入正式概念证据台账`);
    assert.doesNotMatch(detail("main").text(), new RegExp(claim), `${claim} 没有 publish 证据支撑，不得公开为正式主张`);
  }

  const established = concepts(`.concept-ledger-row[data-concept-slug='${conceptFixture.conceptSlug}']`).first();
  assert.equal(established.length, 1);
  assert.match(established.find(".concept-ledger-revision small").text(), /^4\s*条证据$/u, "首页正式概念证据数只能统计四条 publish 证据");

  const candidateSection = concepts("main section").filter((_index, section) => /待溯源概念候选/.test(concepts(section).text())).first();
  assert.equal(candidateSection.find(`a[href='${projectionEvidenceFixture.watchUrl}']`).length, 1, "watch 文章仍应保留在候选观察区");
  assert.equal(candidateSection.find(`a[href='${projectionEvidenceFixture.rejectUrl}']`).length, 0, "reject 文章不得保留在候选观察区");
});

test("signal-only routes never render an empty concept dossier and search links to a stable signal anchor", async () => {
  const conceptResponse = await render(`/concepts/${signalOnlyFixture.slug}`);
  assert.equal(conceptResponse.status, 404, "只有 signal、没有正式 concept 的 slug 必须 404，不能拼出 12 节空壳");

  const searchResponse = await render(`/search?q=${encodeURIComponent("Agent Reliability Engineering")}`);
  assert.equal(searchResponse.status, 200);
  const search = load(await searchResponse.text());
  const signalResult = search(`.search-results a[href='/signals#${signalOnlyFixture.slug}']`).first();
  assert.equal(signalResult.length, 1, "搜索 fixture 必须包含只有 signal 的结果");
  assert.equal(signalResult.attr("href"), `/signals#${signalOnlyFixture.slug}`, "signal 搜索结果必须返回真实 signal 入口，不能指向不存在的 concept");

  const signalsResponse = await render("/signals");
  assert.equal(signalsResponse.status, 200);
  const signals = load(await signalsResponse.text());
  const signalCard = signals(`.signal-card#${signalOnlyFixture.slug}`).first();
  assert.equal(signalCard.length, 1);
  assert.equal(signalCard.attr("id"), signalOnlyFixture.slug, "signal 卡片必须提供与搜索 href 一致的稳定锚点");
});

test("concepts search disables browser autocomplete and ends its example placeholder with a real ellipsis", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const input = $("form.concept-search input[type='search']");

  assert.equal(input.length, 1, "概念学习页必须只有一个明确的概念搜索输入");
  assert.equal(input.attr("autocomplete"), "off", "概念搜索不得让浏览器历史自动补全遮挡学习入口");
  assert.ok(input.attr("placeholder")?.endsWith("…"), "搜索示例 placeholder 必须以真正的 Unicode 省略号“…”结尾");
});

test("concept detail binds a hashed live signal to its concept and renders the original source", async () => {
  const response = await render(`/concepts/${conceptFixture.conceptSlug}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  const mainText = $("main").text();

  const relatedArticles = $(".related-signal-list article");
  assert.equal(relatedArticles.length, 3, "两个同组官方信号与一个独立实践信号都必须保留原文入口");
  assert.equal(relatedArticles.find(`a[href='${conceptFixture.sourceUrl}']`).length, 2, "同一原文属于两条信号时，两条信号内都必须保留可点击引用");
  assert.equal(relatedArticles.find(`a[href='${conceptFixture.secondSourceUrl}']`).length, 1);
  const approvalArticle = relatedArticles.filter((_index, article) => $(article).text().includes("把审批与恢复放进运行时"));
  const telemetryArticle = relatedArticles.filter((_index, article) => $(article).text().includes("遥测让工具循环可审计"));
  assert.equal(approvalArticle.find(`a[href='${conceptFixture.sourceUrl}']`).length, 1, "第一条中文结论必须就地绑定其原文");
  assert.equal(telemetryArticle.find(`a[href='${conceptFixture.secondSourceUrl}']`).length, 1, "第二条中文结论必须就地绑定其原文");
  assert.equal(telemetryArticle.find(`a[href='${conceptFixture.sourceUrl}']`).length, 1, "跨信号重复 URL 仍必须在第二条信号内可点击");
  assert.equal(relatedArticles.find(`a[href='${formalSupportFixture.url}']`).length, 1, "正式概念的第二独立 publish support 必须保留原文");
  assert.doesNotMatch(telemetryArticle.text(), /同页已引用/);
  for (const expected of [
    "把审批与恢复放进运行时",
    "官方实现把审批、检查点和遥测纳入 Agent 运行时",
    "验证审批边界、恢复语义和运行证据",
    "遥测让工具循环可审计",
    "第二条中文分析说明工具调用、失败和审批轨迹如何被统一记录",
    "把每次工具调用的输入、输出、权限决策与错误原因写入可查询 trace",
  ]) {
    assert.match(mainText, new RegExp(expected));
  }
  assert.doesNotMatch(mainText, /只有定义回放，等待加入绑定证据/);
  assert.doesNotMatch(mainText, /LABEL NOVELTY|MECHANISM NOVELTY|ADOPTION NOVELTY/);
  assert.doesNotMatch(mainText, /长任务、多阶段状态、并行执行|一次工具调用即可完成、没有持久状态/);
});

test("every formal concept relationship is navigable and keeps its confidence and source evidence adjacent in the dossier", async () => {
  const response = await render(`/concepts/${conceptFixture.conceptSlug}`);
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const relation = $("#definition .knowledge-relations").first();
  const missing = [];

  assert.equal(relation.length, 1, "正式详情必须从生产 revision 投影当前概念关系");
  if (!/依赖|depends-on/u.test(relation.text())) missing.push("relation type");
  if (relation.find(`a[href='/concepts/${graphTargetConceptFixture.slug}']`).length !== 1) missing.push("navigable target");
  if (!/置信度\s*86%|86%\s*置信/u.test(relation.text())) missing.push("0.86 confidence");
  if (relation.find(`a[href='${conceptFixture.sourceUrl}']`).length !== 1) missing.push("relation evidenceUrls");
  assert.deepEqual(
    missing,
    [],
    "每条正式关系必须在同一详情条目内显示类型、目标概念可导航链接、置信度和该关系原始证据",
  );
});

test("concepts home is a daily learning surface with heat and maturity shown as separate dimensions", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const mainText = $("main").text().replace(/\s+/g, " ");

  for (const requiredLearningView of ["今日新增", "实质修订", "本周升温", "争议", "学习优先"]) {
    assert.match(mainText, new RegExp(requiredLearningView), `概念首页必须提供“${requiredLearningView}”学习入口`);
  }
  assert.match(mainText, /Emerging/);
  assert.match(mainText, /Validated/);
  const establishedConcept = $(".concept-ledger-row[data-concept-slug='agent-harness']").first();
  assert.equal(establishedConcept.length, 1, "正式知识对象必须暴露稳定 concept slug");
  assert.match(establishedConcept.text(), /热度|Heat/i);
  assert.match(establishedConcept.text(), /成熟度|Maturity/i);
  assert.match(establishedConcept.text(), /最近.*变化|本周新增/);
  assert.equal(establishedConcept.find("a[href='/concepts/agent-harness']").length, 1);
  assert.equal(
    $("[data-concept-stage='candidate'][data-established='true']").length,
    0,
    "候选概念不能混入正式学习目录",
  );
});

test("daily learning categories expose up to three distinct formal concepts instead of a fixed single card", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const categories = [
    "today-new",
    "today-revised",
    "weekly-warming",
    "weekly-controversy",
    "learning-priority",
  ];

  for (const category of categories) {
    const queue = semanticLearningQueue($, category);
    assert.equal(queue.length, 1, `${category} 必须有唯一、稳定的语义队列容器`);
    const items = semanticLearningItems($, category);
    assert.equal(items.length, 3, `${category} 在至少三条有效变化时应展示三条，但必须有界为最多三条`);
    const slugs = items.map((_index, item) => $(item).attr("data-concept-slug")).get();
    assert.equal(new Set(slugs).size, items.length, `${category} 不能重复展示同一个概念`);
    items.each((_index, item) => {
      assert.notEqual($(item).attr("data-concept-stage"), "candidate", `${category} 不能把候选伪装成正式学习条目`);
      assert.equal($(item).find("a[href^='/concepts/']").length, 1, `${category} 每条学习项必须有唯一站内 dossier 入口`);
    });
    assert.ok(!slugs.includes(candidateConceptFixture.slug), `${category} 不能混入存储候选`);
    assert.ok(!slugs.includes(signalOnlyFixture.slug), `${category} 不能混入仅信号候选`);
  }

  const expectedTopThree = (items, timeField) => items
    .toSorted((left, right) => right[timeField].localeCompare(left[timeField]))
    .slice(0, 3)
    .map((item) => item.slug)
    .toSorted();
  assert.deepEqual(
    semanticLearningItems($, "today-new").map((_index, item) => $(item).attr("data-concept-slug")).get().toSorted(),
    expectedTopThree(denseLearningQueueFixture.todayNew, "analyzedAt"),
    "今日新增应同时保留当前上海自然日最晚的三条正式首版，第四条用于证明上限生效",
  );
  assert.deepEqual(
    semanticLearningItems($, "today-revised").map((_index, item) => $(item).attr("data-concept-slug")).get().toSorted(),
    expectedTopThree(denseLearningQueueFixture.todayRevised, "revisedAt"),
    "实质修订应同时保留当天最新的三条 material revisions，不能固定只选一条",
  );
  assert.deepEqual(
    semanticLearningItems($, "weekly-controversy").map((_index, item) => $(item).attr("data-concept-slug")).get().toSorted(),
    expectedTopThree(denseLearningQueueFixture.recentControversy, "revisedAt"),
    "争议队列应同时保留近七日最新的三条有证据实质争议修订",
  );
});

test("all daily learning categories keep a machine-readable empty state without filling from candidates or history", async () => {
  const { response, html } = await renderWithSnapshot("/concepts", (snapshot) => {
    snapshot.status = { ...snapshot.status, generatedAt: "2026-09-10T12:00:00.000Z" };
  });
  assert.equal(response.status, 200);
  const $ = load(html);

  for (const category of ["today-new", "today-revised", "weekly-warming", "weekly-controversy", "learning-priority"]) {
    const queue = semanticLearningQueue($, category);
    assert.equal(queue.length, 1, `${category} 空窗期仍必须保留唯一语义容器`);
    assert.equal(semanticLearningItems($, category).length, 0, `${category} 空窗期不能用历史热度或候选填位`);
    assert.equal(queue.find("[data-learning-empty]").length, 1, `${category} 必须提供机器可识别的明确空态`);
  }
});

test("today-new learning uses the Asia/Shanghai createdAt window instead of revision counts", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());

  const todayNew = learningEntry($, "今日新增");
  assert.equal(todayNew.length, 1);
  assert.equal(
    todayNew.find("a[href='/concepts/today-new-concept']").length,
    1,
    "2026-08-09T16:30Z 属于上海 08-10，当天首次建立的正式概念必须进入今日新增",
  );
  assert.doesNotMatch(todayNew.text(), /旧单版本概念/, "历史 revision=1 不能因仍是首版而混入今日新增");
});

test("today-revised learning requires a same-Shanghai-day material latest revision", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const meaningful = learningEntry($, "实质修订");
  assert.equal(meaningful.length, 1);
  assert.equal(
    meaningful.find("a[href='/concepts/today-material-revision']").length,
    1,
    "2026-08-09T17:00Z 属于上海 08-10，且最新 revision.materialChange=true，必须进入今日实质修订",
  );
  assert.doesNotMatch(meaningful.text(), /今日仅补证据对象/, "evidence-only revision 不得被描述为实质修订");
});

test("SSR contract: every claim keeps its shared original evidence link adjacent even when each claim also has a unique source", async () => {
  const sharedUrl = conceptFixture.sourceUrl;
  const firstUniqueUrl = conceptFixture.secondSourceUrl;
  const secondUniqueUrl = formalSupportFixture.url;
  const { response, html } = await renderWithSnapshot(`/concepts/${conceptFixture.conceptSlug}`, (snapshot) => {
    const concept = snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug);
    assert.ok(concept, "共享主张证据 fixture 必须基于真实正式概念投影");
    concept.claims = [
      {
        key: "shared-evidence-approval",
        text: "审批边界由共享原文与审批专属材料共同支撑。",
        kind: "pattern",
        confidence: 0.91,
        evidenceUrls: [sharedUrl, firstUniqueUrl],
      },
      {
        key: "shared-evidence-recovery",
        text: "恢复边界由同一共享原文与恢复专属材料共同支撑。",
        kind: "mechanism",
        confidence: 0.89,
        evidenceUrls: [sharedUrl, secondUniqueUrl],
      },
    ];
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const approvalClaim = $("[data-claim-key='shared-evidence-approval']");
  const recoveryClaim = $("[data-claim-key='shared-evidence-recovery']");
  assert.equal(approvalClaim.length, 1);
  assert.equal(recoveryClaim.length, 1);
  assert.equal(
    approvalClaim.find(`.claim-evidence-links a[href='${sharedUrl}']`).length,
    1,
    "第一条主张旁必须保留共享原始证据链接",
  );
  assert.equal(
    recoveryClaim.find(`.claim-evidence-links a[href='${sharedUrl}']`).length,
    1,
    "全局去重不得让第二条主张失去它同样声明的共享原始证据链接",
  );
});

test("SSR contract: empty evolution renders an explicit evidence-insufficient state instead of borrowing signal recency and title", async () => {
  const signalTitleSentinel = "站内信号标题绝不能冒充概念演化";
  const signalRecencySentinel = "刚刚抓取";
  const { response, html } = await renderWithSnapshot(`/concepts/${conceptFixture.conceptSlug}`, (snapshot) => {
    const concept = snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug);
    const signalTemplate = snapshot.signals[0];
    assert.ok(concept && signalTemplate, "空演化 fixture 必须基于真实正式概念与真实 signal 投影");
    concept.evolution = [];
    snapshot.signals.push({
      ...structuredClone(signalTemplate),
      slug: `${conceptFixture.conceptSlug}-evolution-signal-sentinel`,
      conceptSlug: conceptFixture.conceptSlug,
      title: signalTitleSentinel,
      recency: signalRecencySentinel,
    });
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const origin = $("section#origin");
  assert.equal(origin.length, 1);
  const emptyState = origin.find(".muted-note");
  assert.equal(emptyState.length, 1, "evolution=[] 必须渲染机器可定位的显式空态");
  assert.match(
    emptyState.text().replace(/\s+/g, " "),
    /(?:当前证据不足|尚无).{0,24}(?:演化|演进).{0,16}证据|(?:演化|演进).{0,16}(?:证据不足|尚待补证)/u,
    "空态必须明确说明演化证据不足",
  );
  assert.doesNotMatch(origin.text(), new RegExp(signalTitleSentinel));
  assert.doesNotMatch(origin.text(), new RegExp(signalRecencySentinel));
});

test("SSR contract: an earlier same-day material revision remains in today revised after a later non-material revision", async () => {
  const slug = "material-then-context-same-day";
  const { response, html } = await renderWithSnapshot("/concepts", (snapshot) => {
    const template = structuredClone(snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug));
    assert.ok(template, "同日修订 fixture 必须基于真实正式概念投影");
    snapshot.status.generatedAt = "2026-08-10T12:00:00.000Z";
    snapshot.concepts = [{
      ...template,
      slug,
      name: "同日先实质后补证据对象",
      canonicalName: "同日先实质后补证据对象",
      aliases: ["同日修订顺序契约"],
      createdAt: "2026-08-01T02:00:00.000Z",
      lastMeaningfulChange: "2026-08-10T09:00:00.000Z",
      revision: 3,
      revisions: [
        {
          revision: 3,
          previousRevision: 2,
          analyzedAt: "2026-08-10T10:00:00.000Z",
          createdAt: "2026-08-10T10:00:00.000Z",
          provider: "system-lifecycle",
          model: "lifecycle-maintenance-v1",
          changeReason: "追加上下文证据",
          confidence: 0.9,
          needsReview: false,
          reviewReasons: [],
          materialChange: false,
          delta: { materialChange: false, categories: ["evidence"] },
          fieldDiff: { evidence: { before: ["正式证据 A"], after: ["正式证据 A", "上下文证据 B"] } },
        },
        {
          revision: 2,
          previousRevision: 1,
          analyzedAt: "2026-08-10T09:00:00.000Z",
          createdAt: "2026-08-10T09:00:00.000Z",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          changeReason: "恢复责任边界发生实质修订",
          confidence: 0.88,
          needsReview: false,
          reviewReasons: [],
          materialChange: true,
          delta: { materialChange: true, categories: ["definition", "mechanism"] },
          fieldDiff: { mechanism: { before: "旧恢复边界", after: "新的可审计恢复责任边界" } },
        },
        {
          revision: 1,
          previousRevision: null,
          analyzedAt: "2026-08-01T02:00:00.000Z",
          createdAt: "2026-08-01T02:00:00.000Z",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          changeReason: "历史首版",
          confidence: 0.8,
          needsReview: false,
          reviewReasons: [],
          materialChange: true,
          delta: { materialChange: true, categories: ["initial"] },
          fieldDiff: {},
        },
      ],
    }];
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const revisedSlugs = semanticLearningItems($, "today-revised").toArray().map((node) => $(node).attr("data-concept-slug"));
  assert.deepEqual(revisedSlugs, [slug], "当天较晚的 non-material revision 不能遮住当天更早的 material revision");
});

test("SSR contract: weekly warming contains only positive seven-day heat revision deltas and sorts by delta rather than current heat", async () => {
  const expectedSlugs = ["weekly-heat-rise-large", "weekly-heat-rise-small"];
  const { response, html } = await renderWithSnapshot("/concepts", (snapshot) => {
    const template = structuredClone(snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug));
    assert.ok(template, "本周升温 fixture 必须基于真实正式概念投影");
    snapshot.status.generatedAt = "2026-08-10T12:00:00.000Z";
    const revision = ({ fieldDiff, materialChange = true }) => ([
      {
        revision: 2,
        previousRevision: 1,
        analyzedAt: "2026-08-08T08:00:00.000Z",
        createdAt: "2026-08-08T08:00:00.000Z",
        provider: "system-lifecycle",
        model: "lifecycle-maintenance-v1",
        changeReason: "近七日知识维护",
        confidence: 0.9,
        needsReview: false,
        reviewReasons: [],
        materialChange,
        delta: { materialChange, categories: Object.keys(fieldDiff) },
        fieldDiff,
      },
      {
        revision: 1,
        previousRevision: null,
        analyzedAt: "2026-07-20T08:00:00.000Z",
        createdAt: "2026-07-20T08:00:00.000Z",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        changeReason: "历史首版",
        confidence: 0.8,
        needsReview: false,
        reviewReasons: [],
        materialChange: true,
        delta: { materialChange: true, categories: ["initial"] },
        fieldDiff: {},
      },
    ]);
    const concept = ({ slug, name, heat, fieldDiff }) => ({
      ...structuredClone(template),
      slug,
      name,
      canonicalName: name,
      aliases: [name],
      heat,
      temperature: heat,
      createdAt: "2026-07-20T08:00:00.000Z",
      lastMeaningfulChange: "2026-08-08T08:00:00.000Z",
      revision: 2,
      revisions: revision({ fieldDiff }),
    });
    snapshot.concepts = [
      concept({
        slug: "weekly-heat-flat-recent-event",
        name: "近期事件但热度持平",
        heat: 100,
        fieldDiff: { definition: { before: "旧定义", after: "仅定义发生变化，热度未上升" } },
      }),
      concept({
        slug: "weekly-heat-decreased",
        name: "本周热度下降对象",
        heat: 95,
        fieldDiff: { heat: { before: 100, after: 95 } },
      }),
      concept({
        slug: "weekly-heat-rise-small",
        name: "本周小幅升温对象",
        heat: 90,
        fieldDiff: { temperature: { before: 80, after: 90 } },
      }),
      concept({
        slug: "weekly-heat-rise-large",
        name: "本周大幅升温对象",
        heat: 60,
        fieldDiff: { heat: { before: 20, after: 60 } },
      }),
    ];
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const warmingSlugs = semanticLearningItems($, "weekly-warming").toArray().map((node) => $(node).attr("data-concept-slug"));
  assert.deepEqual(
    warmingSlugs,
    expectedSlugs,
    "本周升温只能接纳近七日 heat/temperature 正增量，并按增量而非当前热度排序",
  );
});

test("weekly warming excludes historical heat leaders without a recent evidence or material-revision event", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const warming = learningEntry($, "本周升温");

  assert.equal(warming.length, 1);
  const selectedHref = warming.find("a[href]").attr("href");
  assert.match(selectedHref || "", /^\/concepts\//u, "本周升温必须选择一个可导航的正式概念");
  assert.notEqual(selectedHref, "/concepts/historical-high-heat", "陈旧高热对象没有近七日正 heat 增量，不能进入本周升温");
  assert.doesNotMatch(warming.text(), /历史高热概念/, "全历史 heat 第一名不能在没有近七日变化时冒充本周升温");
});

test("learning priority is limited to concepts with a recent evidence or material-revision event", async () => {
  const response = await render("/concepts");
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const priority = learningEntry($, "学习优先");

  const recentConceptHrefs = new Set([
    "/concepts/agent-harness",
    "/concepts/today-new-concept",
    "/concepts/today-evidence-only",
    "/concepts/today-material-revision",
    "/concepts/recent-warming-concept",
    `/concepts/${sparseConceptFixture.slug}`,
  ]);
  assert.ok(recentConceptHrefs.has(priority.find("a[href]").attr("href")), "学习优先必须先限定近 7 日证据/实质修订，再比较 heat/maturity");
  assert.doesNotMatch(priority.text(), /历史高热概念/, "历史高 heat 且近 7 日无事件的概念不得进入学习优先");
});

test("learning priority renders an explicit empty state when the seven-day event window is empty", async () => {
  const { response, html } = await renderWithSnapshot("/concepts", (snapshot) => {
    snapshot.status = { ...snapshot.status, generatedAt: "2026-09-10T12:00:00.000Z" };
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const priority = learningEntry($, "学习优先");

  assert.equal(priority.find("a[href]").length, 0, "近 7 日没有证据/实质修订时不得用历史概念填位");
  assert.match(priority.text(), /暂无|等待|近七日.{0,12}无/u, "空窗期必须显示明确空态");
});

test("weekly controversy only admits formal concepts with a recent publish-conflict evidence or a recent material controversy revision", async () => {
  async function renderControversyScenario(mode) {
    return renderWithSnapshot("/concepts", (snapshot) => {
      snapshot.status = { ...snapshot.status, generatedAt: "2026-08-10T12:00:00.000Z" };
      for (const concept of snapshot.concepts) {
        concept.stage = "emerging";
        concept.controversies = [];
        concept.createdAt = "2026-06-01T08:00:00.000Z";
        concept.lastMeaningfulChange = "2026-06-01T08:00:00.000Z";
        concept.evidence = (concept.evidence || []).map((evidence) => ({
          ...evidence,
          stance: "support",
          publishDecision: "publish",
          publishedAt: "2026-06-01T08:00:00.000Z",
        }));
        concept.revisions = (concept.revisions || []).map((revision) => ({
          ...revision,
          analyzedAt: "2026-06-01T08:00:00.000Z",
          createdAt: "2026-06-01T08:00:00.000Z",
          materialChange: false,
          delta: { materialChange: false, categories: [] },
          fieldDiff: {},
        }));
      }
      const historical = snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug);
      assert.ok(historical, "fixture 必须有一条历史争议概念");
      historical.stage = "contested";
      historical.controversies = ["这是一条很早以前已经记录的争议，不能永久占据本周入口。"];

      const recent = structuredClone(historical);
      recent.slug = mode === "evidence" ? "recent-publish-conflict" : "recent-material-controversy";
      recent.name = mode === "evidence" ? "近期冲突证据概念" : "近期实质争议修订概念";
      recent.canonicalName = recent.name;
      recent.stage = "emerging";
      recent.controversies = ["近期来源揭示了一个需要继续保留的工程分歧。"];
      recent.createdAt = "2026-07-01T08:00:00.000Z";
      recent.lastMeaningfulChange = mode === "revision" ? "2026-08-09T08:00:00.000Z" : "2026-07-01T08:00:00.000Z";
      recent.evidence = [{
        ...(historical.evidence?.[0] || {}),
        url: `https://example.com/${recent.slug}`,
        originalTitle: `${recent.name} 原始材料`,
        stance: mode === "evidence" ? "conflict" : "support",
        publishDecision: "publish",
        publishedAt: mode === "evidence" ? "2026-08-09T08:00:00.000Z" : "2026-06-01T08:00:00.000Z",
      }];
      recent.revisions = [{
        ...(historical.revisions?.[0] || {}),
        revision: 2,
        analyzedAt: mode === "revision" ? "2026-08-09T08:00:00.000Z" : "2026-06-01T08:00:00.000Z",
        createdAt: mode === "revision" ? "2026-08-09T08:00:00.000Z" : "2026-06-01T08:00:00.000Z",
        materialChange: mode === "revision",
        delta: { materialChange: mode === "revision", categories: mode === "revision" ? ["controversies"] : [] },
        fieldDiff: mode === "revision" ? {
          controversies: { before: "此前未记录可公开争议。", after: "近期材料明确提出新的工程分歧。" },
        } : {},
      }];
      snapshot.concepts.push(recent);
    });
  }

  for (const [mode, expectedHref] of [
    ["evidence", "/concepts/recent-publish-conflict"],
    ["revision", "/concepts/recent-material-controversy"],
  ]) {
    const { response, html } = await renderControversyScenario(mode);
    assert.equal(response.status, 200, mode);
    const $ = load(html);
    const controversy = learningEntry($, "争议");
    assert.equal(controversy.find("a[href]").attr("href"), expectedHref, `${mode}：本周争议只能进入近七日的有效争议事件`);
    assert.doesNotMatch(controversy.text(), /很早以前已经记录的争议/, `${mode}：历史争议不得因 stage=Contested 或残留文案长期入榜`);
  }
});

test("concept detail renders a source-bound engineering dossier, revision ledger and accessible section navigation", async () => {
  const response = await render(`/concepts/${conceptFixture.conceptSlug}`);
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const mainText = $("main").text().replace(/\s+/g, " ");

  for (const requiredSection of [
    "三分钟理解",
    "精确定义与边界",
    "起源与演化",
    "为什么现在重要",
    "核心机制",
    "工程实现模式",
    "设计约束",
    "适用与不适用",
    "失败模式与反模式",
    "争议与不同观点",
    "证据与原始链接",
    "最近变化",
    "修订记录",
  ]) {
    assert.match(mainText, new RegExp(requiredSection), `概念详情必须渲染“${requiredSection}”`);
  }
  const toc = $("nav[aria-label='概念目录'], nav[aria-label='本页目录']").first();
  assert.equal(toc.length, 1, "长篇工程知识必须提供可键盘访问的本页目录");
  for (const anchor of ["definition", "mechanism", "patterns", "failure-modes", "evidence", "revisions"]) {
    assert.equal(toc.find(`a[href='#${anchor}']`).length, 1, `本页目录缺少 #${anchor}`);
    assert.equal($(`#${anchor}`).length, 1, `正文缺少 #${anchor} 锚点`);
  }

  const evidenceLedger = $("[data-concept-evidence-ledger]");
  assert.ok(evidenceLedger.length >= 1, "关键主张必须邻接证据台账");
  const claimEntries = evidenceLedger.find("[data-claim-key]");
  assert.equal(claimEntries.length, 2, "fixture 的两条关键主张都必须进入邻接证据账本");
  claimEntries.each((_index, entryNode) => {
    const claim = $(entryNode);
    const links = claim.find("a[href^='https://']");
    assert.ok(links.length >= 1, `主张 ${claim.attr("data-claim-key")} 必须把邻接 evidence URL 渲染为可点击外链，而不是纯文本标题`);
    const hrefs = links.toArray().map((linkNode) => $(linkNode).attr("href"));
    assert.equal(
      hrefs.length,
      new Set(hrefs).size,
      `主张 ${claim.attr("data-claim-key")} 内同一 evidence URL 只能出现一次；不同主张允许各自引用同一原文`,
    );
    links.each((_linkIndex, linkNode) => {
      assert.equal($(linkNode).attr("target"), "_blank", "主张证据原链应在新窗口打开");
      assert.match($(linkNode).attr("rel") || "", /noreferrer/u, "主张证据外链必须隔离 referrer");
    });
  });
  assert.equal(
    evidenceLedger.find(`[data-claim-key='approval-boundary'] a[href='${conceptFixture.sourceUrl}']`).length,
    1,
    "审批边界主张必须直接链接到支持它的官方原文",
  );
  const sourceInventory = $("#evidence .evidence-source-list, #evidence .signal-source-map").first();
  assert.equal(sourceInventory.length, 1, "证据章节必须保留独立于 claim 绑定的来源清单");
  const evidenceSignalCards = $("#evidence .related-signal-list > article");
  assert.ok(evidenceSignalCards.length >= 1, "正式概念证据章节 fixture 必须渲染至少一条关联信号");
  evidenceSignalCards.each((_index, cardNode) => {
    const card = $(cardNode);
    assert.equal(card.children("h2").length, 0, "dossier 章节标题已经使用 h2，章节内 SignalCard 标题不得与其形成错误同级");
    assert.equal(card.children("h3").length, 1, "概念详情证据章节内每个 SignalCard 标题必须使用 h3");
  });
  for (const expected of [
    [conceptFixture.sourceUrl, "Agent Harness adds durable approvals"],
    [conceptFixture.secondSourceUrl, "Agent Harness exposes auditable tool telemetry"],
  ]) {
    const link = sourceInventory.find(`a[href='${expected[0]}']`);
    assert.equal(link.length, 1, "来源清单自身必须按 URL 去重，同时允许多个 claim 分别引用同一原文");
    assert.match(link.text(), new RegExp(expected[1]), "证据链接必须展示原标题，不能只显示来源名");
  }
  const dimensions = $(".knowledge-dimensions");
  assert.match(dimensions.text(), /热度\s*Heat\s*\d+/u, "详情必须展示由权威生命周期计算的热度数值");
  assert.match(dimensions.text(), /成熟度\s*Maturity\s*\d+/u, "详情必须把成熟度与热度分开展示");
  assert.match(mainText, /本周新增工具遥测证据/);
  const revisionLedger = $("[data-concept-revision-ledger]");
  assert.equal(revisionLedger.length, 1);
  assert.match(revisionLedger.text(), /DeepSeek|deepseek/i);
  assert.match(revisionLedger.text(), /rendered production-chain fixture|证据回溯|修订原因/);
  assert.doesNotMatch(mainText, /只有定义回放|尚未形成可引用的证据脉冲/);
});

test("concept revision ledger exposes materiality, confidence, review rationale and readable before-after diffs", async () => {
  const response = await render(`/concepts/${conceptFixture.conceptSlug}`);
  assert.equal(response.status, 200);
  const $ = load(await response.text());
  const ledger = $("[data-concept-revision-ledger]");
  const text = ledger.text().replace(/\s+/g, " ");

  assert.equal(ledger.length, 1);
  assert.ok(ledger.find("article").length >= 3, "fixture 必须通过正式追加写入形成创建、证据补充和实质修订三版");
  assert.match(text, /实质修订/, "账本必须区分实质修订");
  assert.match(text, /证据补充/, "账本必须区分不改变语义的证据补充");
  assert.match(text, /置信(?:度|水平).{0,8}79%|79%.{0,8}置信(?:度|水平)/, "账本必须显示结构化 revision confidence");
  assert.match(text, /需(?:要)?复核|人工复核/, "needsReview=true 必须有可见状态");
  assert.match(text, /证据冲突需要人工复核/, "复核状态必须同时显示具体 review reason");
  const mechanismDiff = ledger.find("dt").filter((_index, node) => $(node).text().trim() === "mechanism").first().parent();
  assert.equal(mechanismDiff.length, 1, "实质修订必须包含 mechanism 字段差异");
  assert.match(mechanismDiff.find("del").text(), /每次工具调用前校验权限/, "机制修订必须保留可读的前值");
  assert.match(mechanismDiff.find("ins").text(), /权限校验、外部副作用确认/, "机制修订必须显示可读的后值");

  const multiFieldRevision = ledger.find("article").filter((_index, node) => /\u526f\u4f5c\u7528\u786e\u8ba4\u8fb9\u754c\u53d1\u751f\u5b9e\u8d28\u4fee\u8ba2/u.test($(node).text())).first();
  assert.equal(multiFieldRevision.length, 1, "fixture 必须包含超过 4 个字段的实质修订");
  const visibleDiffCount = multiFieldRevision.find("dt").length;
  assert.ok(
    visibleDiffCount >= 6 || /另有\s*\d+\s*项|剩余\s*\d+\s*项|查看全部/u.test(multiFieldRevision.text()),
    `修订账本不得静默截断 4 项之后的字段；当前只显示 ${visibleDiffCount} 项`,
  );
});

test("long revision before-after values remain fully readable or expose a keyboard-operable disclosure", async () => {
  const beforeStart = "修订前：执行器在产生不可逆副作用之前必须先写入检查点，并把每个审批条件与重试原因纳入可审计状态机。";
  const beforeEnd = "修订前末尾：历史版本的完整边界不能因为版面限制而从读者视野中静默消失。";
  const afterStart = "修订后：执行器把检查点确认、外部副作用确认和人工验收合并为同一条可恢复执行链。";
  const afterEnd = "修订后末尾：工程师必须始终能够读取这一字段变化的完整前因后果。";
  const longBefore = `${beforeStart}${"旧机制细节。".repeat(80)}${beforeEnd}`;
  const longAfter = `${afterStart}${"新机制细节。".repeat(80)}${afterEnd}`;
  const { response, html } = await renderWithSnapshot(`/concepts/${conceptFixture.conceptSlug}`, (snapshot) => {
    const concept = snapshot.concepts.find((item) => item.slug === conceptFixture.conceptSlug);
    assert.ok(concept?.revisions?.length, "fixture 必须提供概念修订记录");
    concept.revisions[0] = {
      ...concept.revisions[0],
      fieldDiff: {
        ...(concept.revisions[0].fieldDiff || {}),
        mechanism: { before: longBefore, after: longAfter },
      },
    };
  });
  assert.equal(response.status, 200);
  const $ = load(html);
  const mechanismDiff = $("[data-concept-revision-ledger] article").find("dt").filter((_index, node) => (
    $(node).text().trim() === "mechanism"
  )).first().parent();
  assert.equal(mechanismDiff.length, 1, "长字段差异必须保留其结构化修订行");

  const readableInDocument = mechanismDiff.text().includes(beforeEnd) && mechanismDiff.text().includes(afterEnd);
  const nativeDisclosure = mechanismDiff.find("details > summary").filter((_index, node) => (
    /展开|完整|查看/u.test($(node).text())
  ));
  const ariaDisclosure = mechanismDiff.find("button[aria-expanded][aria-controls], a[role='button'][aria-expanded][aria-controls]").filter((_index, node) => (
    /展开|完整|查看/u.test($(node).text())
  ));
  assert.ok(
    readableInDocument || nativeDisclosure.length > 0 || ariaDisclosure.length > 0,
    "修订 before/after 的长文本不得在 120 字左右静默截断；必须全文可读，或提供可键盘操作的“展开/查看完整”入口",
  );
});

test("sparse-but-valid concept sections explain missing evidence instead of rendering empty columns", async () => {
  const response = await render(`/concepts/${sparseConceptFixture.slug}`);
  assert.equal(response.status, 200);
  const $ = load(await response.text());

  for (const anchor of ["patterns", "applicability", "failure-modes"]) {
    const section = $(`#${anchor}`);
    assert.equal(section.length, 1);
    assert.match(
      section.text(),
      /证据不足|待补.{0,6}证据|尚无.{0,8}证据|当前未记录/u,
      `#${anchor} 的合法空数组必须给出证据边界，不能只渲染空栏目`,
    );
  }
});

test("merged concept slugs return a permanent redirect from the public snapshot", async () => {
  const response = await render("/concepts/legacy-agent-runtime", { redirect: "manual" });
  assert.equal(response.status, 308, "概念合并后的旧 slug 必须使用永久重定向而不是普通 302/307 或 404");
  const location = response.headers.get("location");
  assert.ok(location, "永久重定向必须提供 Location");
  assert.equal(new URL(location, baseUrl).pathname, `/concepts/${conceptFixture.conceptSlug}`);
});

test("concept graph renders relations in one responsive SVG coordinate system", async () => {
  const response = await render("/graph");
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html);
  assert.match(html, /class="concept-graph"/);
  assert.match(html, /data-graph-node=/);
  assert.match(html, /data-graph-edge=/);
  assert.equal($("[data-graph-node='Agent Harness']").length, 1, "图节点必须来自正式概念修订链");
  assert.equal($("[data-graph-node='Durable Execution']").length, 1, "关系目标必须是第二个正式概念，而不是 seed 节点");
  assert.equal($("[data-graph-edge='Agent Harness:Durable Execution']").length, 1, "SVG 必须渲染正式 revision 中的受证据支持关系");
  for (const [name, slug] of [
    ["Agent Harness", conceptFixture.conceptSlug],
    ["Durable Execution", graphTargetConceptFixture.slug],
  ]) {
    const conceptHref = `/concepts/${slug}`;
    const linkedSvgNode = $(`.concept-graph a[href='${conceptHref}']`).filter((_index, node) => (
      $(node).is(`[data-graph-node='${name}']`) || $(node).find(`[data-graph-node='${name}']`).length === 1
    ));
    assert.equal(linkedSvgNode.length, 1, `SVG 概念节点 ${name} 必须链接到 ${conceptHref}`);
  }
  const accessibleRelation = $(".relation-list .relation-row").filter((_index, node) => (
    $(node).text().includes("Agent Harness") && $(node).text().includes("Durable Execution")
  )).first();
  assert.equal(accessibleRelation.length, 1, "无障碍关系列表必须包含当前正式关系");
  assert.match(
    accessibleRelation.find(`a[href='/concepts/${conceptFixture.conceptSlug}']`).text(),
    /Agent Harness/u,
    "无障碍关系列表的起点名称必须链接到起点概念详情",
  );
  assert.match(
    accessibleRelation.find(`a[href='/concepts/${graphTargetConceptFixture.slug}']`).text(),
    /Durable Execution/u,
    "无障碍关系列表的终点名称必须链接到终点概念详情",
  );
  assert.equal($(".relation-list a[href='https://example.com/official-agent-harness']").length, 1, "关系证据列表必须保留 publish 原链");
  assert.doesNotMatch(html, /graph-line line-a|node-manager/);
});

test("graph treats an explicit empty relations array in a valid live snapshot as authoritative", async () => {
  const { response, html } = await renderWithSnapshot("/graph", (snapshot) => {
    snapshot.status = { ...snapshot.status, mode: "live" };
    snapshot.relations = [];
  });
  assert.equal(response.status, 200);
  const $ = load(html);

  assert.equal($("[data-graph-node]").length, 0, "live snapshot 明确 relations=[] 时不得回填 seed 图节点");
  assert.equal($("[data-graph-edge]").length, 0, "live snapshot 明确 relations=[] 时不得回填 seed 图边");
  assert.match($("main").text(), /暂无.{0,12}概念关系|尚未形成.{0,12}概念关系|当前没有.{0,12}概念关系/u, "空关系图必须给出明确中文空状态");
  assert.doesNotMatch(html, /Agent Manager/u, "权威 live 空关系不得泄漏旧示例概念 Agent Manager");
});

test("missing or corrupt production snapshots fail the graph relation projection closed instead of exposing seed edges", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  const scenarios = [
    ["missing", () => rm(snapshotPath, { force: true })],
    ["corrupt", () => writeFile(snapshotPath, "{corrupt-live-snapshot", "utf8")],
  ];
  const leaks = [];

  try {
    for (const [name, prepare] of scenarios) {
      await prepare();
      const response = await render("/graph");
      assert.equal(response.status, 200, name);
      const html = await response.text();
      const $ = load(html);
      const nodeCount = $(`[data-graph-node]`).length;
      const edgeCount = $(`[data-graph-edge]`).length;
      const listCount = $(".relation-list .relation-row").length;
      const hasEmptyState = /暂无.{0,12}概念关系|尚未形成.{0,12}概念关系|当前没有.{0,12}概念关系/u.test($("main").text());
      const hasSeedIdentity = /Agent Manager|Multi-agent Orchestration/u.test(html);
      if (nodeCount || edgeCount || listCount || !hasEmptyState || hasSeedIdentity) {
        leaks.push(`${name}:nodes=${nodeCount}:edges=${edgeCount}:rows=${listCount}:empty=${hasEmptyState}:seed=${hasSeedIdentity}`);
      }
      await writeFile(snapshotPath, liveSnapshotText, "utf8");
    }
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
  assert.deepEqual(
    leaks,
    [],
    "missing/corrupt production snapshot 必须让 SVG、无障碍关系列表和静态身份一起失败关闭，并显示明确空状态",
  );
});

test("starter preview is removed and project assets are present", async () => {
  const [packageJson, layout] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../design-system/agent-radar/MASTER.md", import.meta.url));
  await access(projectRoot);
});

test("health endpoint identifies this service", async () => {
  const response = await render("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: "agent-radar", status: "ok" });
});

test("public status endpoint exposes ingestion health without a login", async () => {
  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.service, "agent-radar");
  assert.ok(["live", "seed"].includes(status.mode));
  assert.equal(typeof status.sourceCount, "number");
  assert.deepEqual(Object.keys(status.sourceCoverage).sort(), ["byFamily", "byLayer", "total"]);
  assert.equal(status.sourceCoverage.total.configured, status.sourceCount);
  assert.equal(typeof status.sourceCoverage.total.available, "number");
  assert.equal(typeof status.sourceCoverage.total.effective, "number");
  assert.ok(status.sourceCoverage.byFamily.community.configured >= 2);
  assert.ok(status.sourceCoverage.byLayer.community.configured >= 2);
  assert.ok(Array.isArray(status.sources));
  assert.equal(status.modelLandscape.itemCount, 48);
  assert.equal(status.modelLandscape.source, "Artificial Analysis");
  assert.equal(typeof status.modelLandscape.stale, "boolean");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("public status endpoint normalizes legacy snapshots that predate provider and run-mode fields", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const legacySnapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.equal(legacySnapshot.status.analysisMode, "deepseek", "fixture 必须保留旧版可迁移的 analysisMode 权威值");
  delete legacySnapshot.status.configuredProvider;
  delete legacySnapshot.status.runAnalysisMode;
  delete legacySnapshot.status.sourceCoverage;
  await writeFile(snapshotPath, `${JSON.stringify(legacySnapshot, null, 2)}\n`, "utf8");

  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configuredProvider, "rules", "当前服务已禁用 AI，旧快照的历史 DeepSeek 语料口径不得冒充当前 configuredProvider");
  assert.equal(status.runAnalysisMode, "none", "旧快照没有可验证的本轮执行记录，不能把历史文章口径冒充 runAnalysisMode");
  assert.deepEqual(status.sourceCoverage.total, {
    configured: legacySnapshot.status.sourceCount,
    available: legacySnapshot.status.availableSourceCount,
    effective: 0,
  }, "真实旧快照缺失 sourceCoverage 时，API 必须从旧总数字段安全回退");
  assert.deepEqual(status.sourceCoverage.byLayer, {});
  assert.deepEqual(status.sourceCoverage.byFamily, {});
});

test("public status exposes concept readiness counts and safely marks old snapshots as unknown instead of inventing backfill health", async () => {
  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  const readiness = status.conceptReadiness;
  assert.ok(readiness && typeof readiness === "object", "/api/status 必须公开机器可读的 conceptReadiness 对象");
  assert.ok(["ok", "warning", "not-ready"].includes(readiness.status), "当前动态快照必须明确概念发布就绪状态");
  for (const field of [
    "formalConceptCount",
    "candidateConceptCount",
    "pendingArticleCount",
    "failedArticleCount",
    "corruptConceptCount",
    "recoveredConceptCount",
  ]) {
    assert.equal(typeof readiness[field], "number", `当前动态快照必须暴露 ${field}`);
    assert.ok(readiness[field] >= 0, `${field} 不能是负数`);
  }
  assert.deepEqual(readiness.recentFailures, [], "当前 ready 动态快照必须经过 radar-store normalization 后稳定保留 recentFailures=[]");

  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  try {
    const legacySnapshot = JSON.parse(liveSnapshotText);
    const expectedFormal = legacySnapshot.concepts.filter((concept) => !["candidate", "archived"].includes(String(concept.stage || "").toLowerCase())).length;
    const expectedCandidates = legacySnapshot.candidateConcepts.length;
    const safeFailure = {
      articleUrl: "https://failure.example.com/agent-harness-repair",
      status: "failed",
      attemptedAt: "2026-08-03T12:34:56.000Z",
    };
    const unsafeFailure = {
      articleUrl: "https://failure.example.com/provider-retry?api_key=API_STATUS_QUERY_SECRET&token=API_STATUS_TOKEN_SECRET&signature=API_STATUS_SIGNATURE_SECRET#private-fragment",
      status: "failed",
      attemptedAt: "2026-08-03T12:35:56.000Z",
      error: "provider raw output contained API_STATUS_PROVIDER_SECRET",
    };
    legacySnapshot.status.conceptReadiness.recentFailures = [safeFailure, unsafeFailure];
    await writeFile(snapshotPath, `${JSON.stringify(legacySnapshot, null, 2)}\n`, "utf8");
    const failedResponse = await render("/api/status");
    assert.equal(failedResponse.status, 200);
    const failedStatus = await failedResponse.json();
    assert.deepEqual(failedStatus.conceptReadiness.recentFailures?.[0], safeFailure, "raw live snapshot 的安全 recentFailures 必须穿过 radar-store normalize 并由 /api/status 原样公开，不能只保留计数");
    assert.equal(failedStatus.conceptReadiness.recentFailures?.length, 2, "API normalization 不得在脱敏时静默丢失失败记录");
    const observableFailures = JSON.stringify(failedStatus.conceptReadiness.recentFailures);
    assert.doesNotMatch(
      observableFailures,
      /api_key|token|signature|fragment|API_STATUS_QUERY_SECRET|API_STATUS_TOKEN_SECRET|API_STATUS_SIGNATURE_SECRET|API_STATUS_PROVIDER_SECRET/iu,
      "/api/status 必须纵深清洗 raw snapshot 中的 query credential、fragment 和原始 provider 错误",
    );
    assert.equal(
      failedStatus.conceptReadiness.recentFailures?.[1]?.articleUrl,
      "https://failure.example.com/provider-retry",
      "/api/status 脱敏后仍需保留可定位的 HTTPS host+path",
    );

    delete legacySnapshot.status.conceptReadiness;
    await writeFile(snapshotPath, `${JSON.stringify(legacySnapshot, null, 2)}\n`, "utf8");
    const legacyResponse = await render("/api/status");
    assert.equal(legacyResponse.status, 200, "旧快照缺少 readiness 字段也必须保持状态接口可用");
    const legacyStatus = await legacyResponse.json();
    assert.deepEqual(legacyStatus.conceptReadiness, {
      status: "unknown",
      formalConceptCount: expectedFormal,
      candidateConceptCount: expectedCandidates,
      pendingArticleCount: null,
      failedArticleCount: null,
      recentFailures: [],
      corruptConceptCount: null,
      recoveredConceptCount: null,
    }, "旧快照只能从公开概念投影推导 formal/candidate；不能把不可知的回填、损坏和恢复状态伪造为零");
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
});

test("missing corrupt or seed snapshots never expose curated fallback signals in production", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  const curatedFallbackTitle = "Graph Engineering：把 Agent 工作流变成可审计的执行结构";
  const explicitSeedTitle = "绝不能公开的 CURATED SEED 信号";
  const seedSnapshot = JSON.parse(liveSnapshotText);
  seedSnapshot.status = {
    ...seedSnapshot.status,
    mode: "seed",
    runStatus: "never",
    analysisMode: "curated",
    signalCount: 1,
    stale: true,
  };
  seedSnapshot.signals = [{ ...seedSnapshot.signals[0], title: explicitSeedTitle, analysisMode: "curated" }];
  const scenarios = [
    {
      name: "missing",
      prepare: () => rm(snapshotPath, { force: true }),
    },
    {
      name: "corrupt",
      prepare: () => writeFile(snapshotPath, "{corrupt-json", "utf8"),
    },
    {
      name: "seed",
      prepare: () => writeFile(snapshotPath, `${JSON.stringify(seedSnapshot)}\n`, "utf8"),
    },
  ];

  try {
    for (const scenario of scenarios) {
      await scenario.prepare();
      const todayResponse = await render("/today");
      assert.equal(todayResponse.status, 200, scenario.name);
      const html = await todayResponse.text();
      assert.doesNotMatch(html, new RegExp(curatedFallbackTitle), `${scenario.name} 快照不能回退公开内置 curated signals`);
      assert.doesNotMatch(html, new RegExp(explicitSeedTitle), `${scenario.name} 快照不能公开 seed signals`);
      assert.match(load(html).text(), /0\s*条有效信号/, `${scenario.name} 快照必须以空公开信号失败关闭`);

      const statusResponse = await render("/api/status");
      assert.equal(statusResponse.status, 200, scenario.name);
      const status = await statusResponse.json();
      assert.equal(status.signalCount, 0, `${scenario.name} 数据层不得报告 curated signalCount`);
      assert.equal(status.stale, true, `${scenario.name} 数据层必须标记 stale`);

      await writeFile(snapshotPath, liveSnapshotText, "utf8");
    }
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
});

test("a valid live snapshot with an empty formal concept directory does not refill seed concepts", async () => {
  const snapshotPath = `${dataDirectory}/radar-snapshot.json`;
  const liveSnapshotText = await readFile(snapshotPath, "utf8");
  const emptyConceptSnapshot = JSON.parse(liveSnapshotText);
  emptyConceptSnapshot.status = { ...emptyConceptSnapshot.status, mode: "live" };
  emptyConceptSnapshot.concepts = [];
  try {
    await writeFile(snapshotPath, `${JSON.stringify(emptyConceptSnapshot)}\n`, "utf8");
    const response = await render("/concepts");
    assert.equal(response.status, 200);
    const html = await response.text();
    const $ = load(html);
    assert.match($(".concept-knowledge-state").text(), /0\s*个正式知识对象/);
    assert.equal($(".concept-ledger-row").length, 0, "live 空正式目录不得回填 seedRadarSnapshot.concepts");
    assert.match($(".concept-filter-empty").text(), /没有正式概念/);
    assert.doesNotMatch(html, /Graph Engineering：把 Agent 工作流变成可审计的执行结构/);
  } finally {
    await writeFile(snapshotPath, liveSnapshotText, "utf8");
  }
});
