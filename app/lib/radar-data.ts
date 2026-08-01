export type EvidenceNode = {
  label: string;
  kind: "origin" | "independent" | "implementation" | "conflict";
};

export type SourceLayer = "official" | "practitioner" | "community";

export type SignalSource = {
  name: string;
  href: string;
  layer?: SourceLayer;
  language?: "zh" | "en";
  originalTitle?: string;
  publishedAt?: string;
};

export type Signal = {
  slug: string;
  conceptSlug?: string;
  eyebrow: string;
  title: string;
  summary: string;
  implication: string;
  stage: "Spark" | "Emerging" | "Validated" | "Cooling";
  topic: "概念" | "产品" | "工程" | "迁移";
  recency: string;
  evidenceCount: number;
  independentSources: number;
  confidence: "待溯源" | "中等" | "较高";
  accent: "signal" | "evidence" | "engineering" | "conflict";
  evidence: EvidenceNode[];
  sources: SignalSource[];
  sourceMix?: Record<SourceLayer, number>;
  verificationState?: "community-only" | "official-only" | "cross-verified" | "independently-observed" | "practitioner-only";
  publishedAt?: string;
  discoveredAt?: string;
  analysisMode?: "curated" | "rules" | "openai" | "deepseek";
};

export type Concept = {
  slug: string;
  name: string;
  definition: string;
  stage: string;
  temperature: number;
  relation: string;
  signalCount?: number;
};

export type CandidateConcept = {
  name: string;
  signalCount: number;
  evidenceCount: number;
  highestEvidenceLayer: SourceLayer;
  lastSeenAt: string;
  sources: Array<SignalSource & { layer: SourceLayer }>;
};

export type RadarSource = {
  id?: string;
  name: string;
  class: string;
  priority: string;
  cadence: string;
  status: string;
  focus: string;
  href: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  itemCount?: number;
  layer?: SourceLayer;
  language?: "zh" | "en";
};

export type ModelPulseWindow = Record<SourceLayer, number> & { total: number };

export type ModelPulse = {
  modelId: string;
  windows: {
    days7: ModelPulseWindow;
    days30: ModelPulseWindow;
  };
  sources: Array<SignalSource & { layer: SourceLayer }>;
};

export type RadarDigest = {
  period: string;
  title: string;
  summary: string;
  signals: number;
  state: "自动生成" | "样本";
};

export type RadarStatus = {
  mode: "live" | "seed";
  generatedAt: string;
  lastRunAt: string | null;
  lastSuccessfulAt: string | null;
  runStatus: "success" | "partial" | "failed" | "never";
  analysisMode: "rules" | "openai" | "deepseek" | "mixed" | "curated";
  sourceCount: number;
  healthySourceCount: number;
  signalCount: number;
  articleCount: number;
  stale: boolean;
};

export type RadarSnapshot = {
  version: 1;
  status: RadarStatus;
  signals: Signal[];
  concepts: Concept[];
  candidateConcepts: CandidateConcept[];
  sources: RadarSource[];
  relations: Array<{ from: string; type: string; to: string; note: string }>;
  playbooks: Array<{ title: string; description: string; steps: number; maturity: string }>;
  digests: RadarDigest[];
  modelPulses: ModelPulse[];
};

export const signals: Signal[] = [
  {
    slug: "graph-engineering",
    conceptSlug: "graph-engineering",
    eyebrow: "概念雷达 · Origin tracer running",
    title: "Graph Engineering：把 Agent 工作流变成可审计的执行结构",
    summary:
      "这个新标签正在把状态、分支、检查点、人工介入和失败恢复重新组织为一门工程实践。值得追踪的不是词本身，而是它是否沉淀出可复用的设计约束。",
    implication:
      "先把图当成运行契约，而不是可视化：节点输入输出、状态归属、重试语义和人工关口必须可测试。",
    stage: "Emerging",
    topic: "概念",
    recency: "本周升温",
    evidenceCount: 4,
    independentSources: 3,
    confidence: "待溯源",
    accent: "signal",
    evidence: [
      { label: "术语出现", kind: "origin" },
      { label: "实践者讨论", kind: "independent" },
      { label: "图式运行时", kind: "implementation" },
      { label: "机制新颖性待判断", kind: "conflict" },
    ],
    sources: [
      { name: "Latent Space", href: "https://www.latent.space/" },
      {
        name: "Microsoft Agent Framework",
        href: "https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/",
      },
      {
        name: "Anthropic Engineering",
        href: "https://www.anthropic.com/engineering",
      },
    ],
  },
  {
    slug: "agent-manager",
    conceptSlug: "agent-manager",
    eyebrow: "产品范式 · 多 Agent 管理",
    title: "Agent Manager 正从 IDE 的辅助面板变成独立工作界面",
    summary:
      "Google Antigravity 2.0 将 Agent Manager 的核心形态拆成独立应用：同时管理异步任务、动态子 Agent、计划任务和跨项目工作。",
    implication:
      "下一代 AI Coding 界面更像任务控制台：人的主要动作从连续对话转为委派、观察、验收和介入。",
    stage: "Validated",
    topic: "产品",
    recency: "产品已验证",
    evidenceCount: 5,
    independentSources: 2,
    confidence: "较高",
    accent: "evidence",
    evidence: [
      { label: "实践者命名", kind: "origin" },
      { label: "产品形态", kind: "implementation" },
      { label: "异步任务", kind: "implementation" },
      { label: "动态子 Agent", kind: "implementation" },
      { label: "管理心法", kind: "independent" },
    ],
    sources: [
      {
        name: "Google Antigravity 2.0",
        href: "https://antigravity.google/blog/introducing-google-antigravity-2?hl=en",
      },
      {
        name: "Addy Osmani",
        href: "https://addyosmani.com/blog/coding-agents-manager/",
      },
    ],
  },
  {
    slug: "agent-framework-declarative",
    conceptSlug: "multi-agent-orchestration",
    eyebrow: "工程变化 · 2026-07-23",
    title: "Microsoft 将多 Agent 编排从代码调用图移入可版本化工作流",
    summary:
      "Agent Framework 的声明式工作流在 Python 与 .NET 到达 1.0。分支、Agent handoff、状态变化和人工介入可以用 YAML 审阅和版本管理。",
    implication:
      "编排配置会进入代码评审和变更审计；但复杂业务逻辑仍应留在可测试代码中，避免把 YAML 变成第二种编程语言。",
    stage: "Validated",
    topic: "工程",
    recency: "官方发布",
    evidenceCount: 3,
    independentSources: 1,
    confidence: "较高",
    accent: "engineering",
    evidence: [
      { label: "1.0 发布", kind: "origin" },
      { label: "Python 包", kind: "implementation" },
      { label: ".NET 包", kind: "implementation" },
    ],
    sources: [
      {
        name: "Microsoft Agent Framework",
        href: "https://devblogs.microsoft.com/agent-framework/move-agent-orchestration-workflows-out-of-code-with-agent-framework-declarative-workflows-1-0/",
      },
    ],
  },
  {
    slug: "autogen-maintenance",
    conceptSlug: "multi-agent-orchestration",
    eyebrow: "项目状态 · Migration",
    title: "AutoGen 进入维护模式，新增项目转向 Microsoft Agent Framework",
    summary:
      "AutoGen 官方仓库已明确进入维护模式，不再接收新功能；新用户被建议使用 Microsoft Agent Framework，现有用户则进入迁移周期。",
    implication:
      "技术雷达不能只监控新版本，也必须把维护、继任和迁移关系作为一等事件。框架选型需要重新检查长期支持假设。",
    stage: "Validated",
    topic: "迁移",
    recency: "状态变化",
    evidenceCount: 2,
    independentSources: 1,
    confidence: "较高",
    accent: "conflict",
    evidence: [
      { label: "维护模式", kind: "origin" },
      { label: "继任框架", kind: "implementation" },
    ],
    sources: [
      { name: "AutoGen repository", href: "https://github.com/microsoft/autogen" },
      {
        name: "Agent Framework 1.0",
        href: "https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/",
      },
    ],
  },
  {
    slug: "managed-agent-harness",
    conceptSlug: "agent-harness",
    eyebrow: "Agent Harness · 工程证据",
    title: "Agent Harness 成为产品能力：循环、上下文、审批和遥测开始打包",
    summary:
      "Microsoft 发布完整 Harness，Anthropic 也持续讨论长任务与 Managed Agents。行业关注点正从单次提示迁向运行环境和治理边界。",
    implication:
      "评估 Agent 系统时应拆开模型、Harness、工具权限和工作流层；只比较模型会遗漏大部分工程差异。",
    stage: "Emerging",
    topic: "工程",
    recency: "多方验证",
    evidenceCount: 4,
    independentSources: 2,
    confidence: "中等",
    accent: "engineering",
    evidence: [
      { label: "Harness 发布", kind: "origin" },
      { label: "Managed Agents", kind: "independent" },
      { label: "审批与遥测", kind: "implementation" },
      { label: "长任务设计", kind: "implementation" },
    ],
    sources: [
      {
        name: "Microsoft Agent Framework Harness",
        href: "https://devblogs.microsoft.com/agent-framework/the-microsoft-agent-framework-harness-is-now-released/",
      },
      { name: "Anthropic Engineering", href: "https://www.anthropic.com/engineering" },
    ],
  },
];

export const concepts = [
  {
    slug: "graph-engineering",
    name: "Graph Engineering",
    definition: "围绕 Agent 执行图的状态、分支、恢复、可观测性与人机协作进行工程化设计。",
    stage: "Emerging",
    temperature: 87,
    relation: "建立在 Durable execution 与 Orchestration 之上",
  },
  {
    slug: "agent-manager",
    name: "Agent Manager",
    definition: "以委派、并行观察、反馈与验收为中心的 Agent-first 工作界面和管理心法。",
    stage: "Validated",
    temperature: 82,
    relation: "产品化 Multi-agent orchestration",
  },
  {
    slug: "agent-harness",
    name: "Agent Harness",
    definition: "包裹模型的工具循环、上下文、权限、记忆、审批和遥测运行层。",
    stage: "Validated",
    temperature: 78,
    relation: "承载 Coding agent 与 Managed agent",
  },
  {
    slug: "context-engineering",
    name: "Context Engineering",
    definition: "系统性组织 Agent 在每一步可见的指令、状态、工具结果和外部知识。",
    stage: "Mainstream",
    temperature: 72,
    relation: "Agent Harness 的核心设计面",
  },
  {
    slug: "durable-execution",
    name: "Durable Execution",
    definition: "让长任务能够检查点恢复、暂停、重试，并跨进程保存明确运行状态。",
    stage: "Validated",
    temperature: 68,
    relation: "支撑 Graph Engineering",
  },
  {
    slug: "multi-agent-orchestration",
    name: "Multi-agent Orchestration",
    definition: "为多个专门 Agent 定义边界、协调模式、共享状态、验收与冲突处理。",
    stage: "Mainstream",
    temperature: 65,
    relation: "被 Agent Manager 操作，被执行图约束",
  },
];

export const sources = [
  { name: "Anthropic Engineering", class: "一手工程", priority: "P0", cadence: "2h", status: "已核验", focus: "Harness · Context · Multi-agent", href: "https://www.anthropic.com/engineering" },
  { name: "OpenAI Engineering", class: "一手工程", priority: "P0", cadence: "2h", status: "已核验", focus: "Codex · Agents · Sandbox", href: "https://openai.com/news/engineering/" },
  { name: "Google Antigravity", class: "产品原始源", priority: "P0", cadence: "2h", status: "已核验", focus: "Agent Manager · Async agents", href: "https://www.antigravity.google/blog" },
  { name: "Claude Code Changelog", class: "更新日志", priority: "P0", cadence: "1h", status: "已核验", focus: "Hooks · Skills · Subagents", href: "https://code.claude.com/docs/en/changelog" },
  { name: "GitHub Changelog", class: "更新日志", priority: "P0", cadence: "1h", status: "RSS", focus: "Copilot · Coding agent", href: "https://github.blog/changelog/" },
  { name: "Microsoft Agent Framework", class: "一手工程", priority: "P1", cadence: "4h", status: "已核验", focus: "Graph workflow · Orchestration", href: "https://devblogs.microsoft.com/agent-framework/" },
  { name: "Latent Space", class: "概念雷达", priority: "P0", cadence: "30m", status: "RSS", focus: "新概念 · 行业信号", href: "https://www.latent.space/" },
  { name: "Simon Willison", class: "实践者", priority: "P0", cadence: "2h", status: "RSS", focus: "Agentic engineering · Security", href: "https://feeds.simonwillison.net/tags/agentic-engineering/" },
  { name: "Addy Osmani", class: "实践者", priority: "P0", cadence: "4h", status: "已核验", focus: "Agent Manager · Verification", href: "https://addyosmani.com/blog/" },
  { name: "MCP Blog / Spec", class: "协议", priority: "P1", cadence: "4h", status: "RSS", focus: "Tools · Security · Protocol", href: "https://blog.modelcontextprotocol.io/" },
];

export const relations = [
  { from: "Agent Manager", type: "操作", to: "Multi-agent Orchestration", note: "人的控制平面" },
  { from: "Multi-agent Orchestration", type: "约束于", to: "Graph Engineering", note: "协调策略进入执行图" },
  { from: "Graph Engineering", type: "依赖", to: "Durable Execution", note: "检查点、重试、暂停" },
  { from: "Agent Harness", type: "承载", to: "Context Engineering", note: "运行时组织可见上下文" },
  { from: "Agent Manager", type: "观察", to: "Agent Harness", note: "任务状态、审批与遥测" },
];

export const playbooks = [
  { title: "从单 Agent 到 Agent Manager", description: "判断何时值得并行、如何拆边界，以及主 Agent 应保留哪些决策。", steps: 6, maturity: "可执行" },
  { title: "执行图设计检查表", description: "为节点契约、状态归属、重试、人工审批和失败恢复建立最小约束。", steps: 9, maturity: "草案" },
  { title: "新概念溯源协议", description: "区分最早抓取、最早命名、机制先例和首次规模化采用。", steps: 7, maturity: "可执行" },
];

export const digests: RadarDigest[] = [
  { period: "2026 / W31", title: "从 Agent Manager 到独立 Agent 工作面", summary: "Google 将 Agent Manager 的核心范式从 IDE 拆出；管理多个异步 Agent 正成为独立产品问题。", signals: 3, state: "样本" },
  { period: "2026 / W30", title: "声明式编排与 Harness 同时进入稳定层", summary: "Microsoft Agent Framework 连续发布 Harness 与声明式工作流，工程重心从 Agent 角色转向运行契约。", signals: 4, state: "样本" },
];

export const seedRadarSnapshot: RadarSnapshot = {
  version: 1,
  status: {
    mode: "seed",
    generatedAt: "2026-08-01T02:18:00.000Z",
    lastRunAt: null,
    lastSuccessfulAt: null,
    runStatus: "never",
    analysisMode: "curated",
    sourceCount: sources.length,
    healthySourceCount: sources.length,
    signalCount: signals.length,
    articleCount: signals.reduce((total, signal) => total + signal.evidenceCount, 0),
    stale: true,
  },
  signals,
  concepts,
  candidateConcepts: [],
  sources,
  relations,
  playbooks,
  digests,
  modelPulses: [],
};
