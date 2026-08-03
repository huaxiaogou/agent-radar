import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const PUBLIC_DNS = async () => [{ address: "93.184.216.34", family: 4 }];

function trustedFetchOptions(fetchImpl) {
  return {
    fetchImpl,
    resolveHostname: PUBLIC_DNS,
    createDispatcher: () => ({ close: async () => {} }),
  };
}

function emptyFeed() {
  return "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Empty</title></channel></rss>";
}

function chineseWatchAnalysis(candidateConcept, eventKey) {
  return {
    title: "社区出现值得继续观察的新型工程工作流",
    summary: "高参与讨论描述了一种新的开发工作流，但目前仍缺少官方与独立实践证据。",
    implication: "先保留原始讨论并寻找复现、实现细节与跨来源证据，不应把热度直接当成事实。",
    topic: "概念",
    conceptSlug: "coding-agent",
    stage: "Spark",
    accent: "concept",
    tags: ["community-signal"],
    publishDecision: "watch",
    editorialScore: 72,
    relevanceScore: 70,
    noveltyScore: 88,
    evidenceScore: 28,
    eventKey,
    candidateConcept,
  };
}

function persistedArticle(source, overrides = {}) {
  const now = new Date().toISOString();
  return {
    url: `https://${source.id}.example.com/discussion`,
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.class,
    independentGroup: source.independentGroup,
    sourceLayer: source.layer,
    sourceLanguage: source.language,
    engagementCount: 800,
    originalTitle: "A highly active community discussion",
    originalExcerpt: "Developers are discussing an unfamiliar workflow and reporting concrete observations.",
    contentText: "Developers are discussing an unfamiliar workflow and reporting concrete observations.",
    publishedAt: now,
    discoveredAt: now,
    contentHash: `${source.id}-hash`,
    relevanceScore: 8,
    signalSlug: "community-heat-must-not-become-truth",
    conceptSlug: "coding-agent",
    title: "社区高热讨论仍需事实溯源",
    summary: "该讨论参与度很高，但目前只有社区层证据，尚不能确认其事实结论。",
    implication: "热度只应用于发现排序，结论仍需官方或独立工程证据交叉验证。",
    topic: "概念",
    stage: "Spark",
    accent: "concept",
    tags: ["community-signal"],
    analysisMode: "deepseek",
    publishDecision: "publish",
    editorialScore: 78,
    aiRelevanceScore: 72,
    noveltyScore: 90,
    evidenceScore: 20,
    eventKey: "community:new-workflow",
    candidateConcept: "",
    ...overrides,
  };
}

function deepSeekRequestText(request) {
  return String(request.messages?.findLast((message) => message.role === "user")?.content || request.input || "");
}

function isConceptKnowledgeRequest(request) {
  const system = String(request.messages?.find((message) => message.role === "system")?.content || request.instructions || "");
  return system.includes("证据型知识编辑")
    && system.includes("本轮只做文章证据提取");
}

function conceptSourceFromRequest(request) {
  const input = deepSeekRequestText(request);
  const match = input.match(/<untrusted-source>\s*(\{[\s\S]*?\})\s*<\/untrusted-source>/u);
  assert.ok(match, "概念知识请求必须保留边界明确的原始来源对象，测试才能验证它没有分析门禁外文章");
  return JSON.parse(match[1]);
}

function conceptKnowledgeAnalysis(source) {
  const isResearch = /papers|dblp/u.test(source.url);
  const slug = isResearch ? "reliable-coding-agents-under-tool-failures" : "build-queue-replacement-workflow";
  const claimKey = isResearch ? "tool-failure-recovery-observation" : "build-queue-workflow-observation";
  const concept = {
    slug,
    canonicalName: isResearch ? "工具故障下的代码智能体可靠性" : "构建队列替代工作流",
    aliases: [],
    themes: isResearch
      ? ["evaluation-verification", "durable-execution"]
      : ["ai-coding-engineering", "agent-runtime"],
    stage: "candidate",
    heat: 64,
    maturity: 18,
    definition: isResearch
      ? "该候选概念关注代码智能体遭遇工具故障时，如何记录失败并恢复尚未完成的工程步骤。"
      : "该候选概念描述开发者以新的执行工作流替代传统构建队列，并观察任务调度行为的变化。",
    nonDefinition: "它目前只是需要继续验证的工程线索，不能代表已经形成行业共识或成熟实践。",
    problem: "当前单一来源只能说明相关工程现象已经出现，仍不足以确定它的适用边界和可重复效果。",
    whyNow: "近期材料提供了新的实现观察，因此值得保留原始证据并寻找跨来源复现与边界说明。",
    origin: "现有证据只支持本站首次观察到该工程线索，命名起源与思想来源仍有待继续溯源。",
    evolution: [],
    mechanism: "现有材料描述了工作流中的执行与恢复行为，但具体状态转换、失败处理和验收机制仍需更多证据。",
    architecture: "目前只能确认材料涉及任务执行与工具交互，完整的控制面、状态层和验证层结构尚未得到证明。",
    designConstraints: [],
    implementationPatterns: [],
    antiPatterns: [],
    tradeoffs: [],
    failureModes: [],
    securityRisks: [],
    operationalConcerns: [],
    applicability: [],
    nonApplicability: [],
    controversies: [],
    dailyDelta: "本次仅新增一条值得跟踪的候选证据，尚未形成可公开确认的成熟概念。",
    lastMeaningfulChange: new Date().toISOString(),
  };
  return {
    identityDecision: {
      action: "create-new",
      canonicalSlug: slug,
      confidence: 0.91,
      reason: "当前候选描述了可独立命名、实现和继续验证的工程机制，且与已知概念不存在精确身份冲突。",
      comparedSlugs: ["coding-agent", "agent-harness"],
    },
    concept: {
      slug: concept.slug,
      canonicalName: concept.canonicalName,
      aliases: concept.aliases,
      themes: concept.themes,
    },
    fields: {
      definition: concept.definition,
      nonDefinition: concept.nonDefinition,
      problem: concept.problem,
      whyNow: concept.whyNow,
      origin: concept.origin,
      mechanism: concept.mechanism,
      architecture: concept.architecture,
      dailyDelta: concept.dailyDelta,
      evolution: concept.evolution,
      designConstraints: concept.designConstraints,
      implementationPatterns: concept.implementationPatterns,
      antiPatterns: concept.antiPatterns,
      tradeoffs: concept.tradeoffs,
      failureModes: concept.failureModes,
      securityRisks: concept.securityRisks,
      operationalConcerns: concept.operationalConcerns,
      applicability: concept.applicability,
      nonApplicability: concept.nonApplicability,
      controversies: concept.controversies,
    },
    claims: [{
      key: claimKey,
      text: isResearch
        ? "该材料研究了代码智能体在工具故障条件下的恢复行为。"
        : "该讨论报告了以新工作流替代构建队列的工程观察。",
      kind: isResearch ? "mechanism" : "pattern",
      confidence: 0.62,
    }],
  };
}

test("source catalog covers five discovery families and the critical coding, agent, community and research landscape", async () => {
  const rawCatalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  const catalog = rawCatalog.filter((source) => source.enabled !== false);
  assert.ok(catalog.every((source) => source.family), "每个启用来源都必须显式声明 discovery family，不能按 Evidence Layer 静默猜测");
  const families = new Set(catalog.map((source) => source.family));
  for (const family of ["official", "repository", "practitioner", "community", "research"]) {
    assert.ok(families.has(family), `来源目录缺少 ${family} family，不能用其他来源数量代替该证据职责`);
  }

  const searchable = catalog.map((source) => [
    source.id,
    source.name,
    source.focus,
    source.homepage,
    source.url,
  ].join(" ").toLowerCase()).join("\n");
  for (const name of [
    "cursor", "cline", "roo", "continue", "aider", "openhands",
    "crewai", "smolagents", "llamaindex", "dify", "mastra",
    "linux.do", "v2ex", "hacker news", "bluesky", "reddit", "lobsters",
    "daily papers", "arxiv",
  ]) {
    assert.match(searchable, new RegExp(name.replace(".", "\\."), "i"), `关键来源 family 未覆盖：${name}`);
  }
  assert.match(searchable, /openreview|dblp/i, "研究索引必须覆盖 OpenReview 或稳定的 DBLP 替代入口");

  const repositorySources = catalog.filter((source) => source.family === "repository");
  assert.ok(repositorySources.length >= 2, "工程仓库讨论必须是独立 family，不能只监控 release feed");
  assert.ok(
    repositorySources.some((source) => /github-(?:issues|discussions)/.test(source.parser || "")),
    "至少需要一个受测的 GitHub issues/discussions collector",
  );
  assert.ok(catalog.some((source) => source.family === "community" && source.language === "zh"), "缺少中文社区");
  assert.ok(catalog.some((source) => source.family === "community" && source.language === "en"), "缺少英文社区");
  for (const [issuesId, siblingIds] of [
    ["cline-issues", ["cline-releases", "cline-blog"]],
    ["openhands-issues", ["openhands-releases", "openhands-blog"]],
  ]) {
    const issues = catalog.find((source) => source.id === issuesId);
    assert.ok(issues, `缺少工程讨论来源：${issuesId}`);
    for (const siblingId of siblingIds) {
      const sibling = catalog.find((source) => source.id === siblingId);
      if (sibling) assert.equal(issues.independentGroup, sibling.independentGroup, `${issuesId} 与 ${siblingId} 属同一组织，不能自证为独立来源`);
    }
  }

  const enabledUrls = new Set(catalog.map((source) => source.url));
  for (const deadUrl of [
    "https://www.crewai.com/changelog",
    "https://blogs.microsoft.com/ai/feed/",
    "https://vercel.com/blog/category/ai",
  ]) {
    assert.ok(!enabledUrls.has(deadUrl), `实网已确认失效的端点不得继续标记为启用：${deadUrl}`);
  }
  const crewAiBlog = catalog.find((source) => source.independentGroup === "crewai" && source.kind === "html" && /\/blog\/?$/.test(new URL(source.url).pathname));
  assert.equal(crewaiBlogUrl(crewAiBlog), "https://crewai.com/blog", "CrewAI 应切换到官方 Blog HTML 目录");
  assert.ok(articlePathIsWhitelisted(crewAiBlog, "https://crewai.com/blog/agent-workflows"), "CrewAI Blog 必须只收文章路径");
  assert.ok(!articlePathIsWhitelisted(crewAiBlog, "https://crewai.com/pricing"), "CrewAI 导航页不得进入候选");
  assert.equal(catalog.find((source) => source.id === "microsoft-ai-blog")?.url, "https://news.microsoft.com/source/topics/ai/feed/", "Microsoft AI 必须使用仍可用的官方 feed");
  assert.equal(catalog.find((source) => source.id === "vercel-ai-blog")?.url, "https://vercel.com/atom", "Vercel AI 必须使用官方 Atom");
  const openReview = rawCatalog.find((source) => source.id === "openreview-agent-research");
  assert.ok(
    openReview?.enabled === false || new URL(openReview?.url || "https://invalid.example").hostname === "dblp.org",
    "返回 challenge 的 OpenReview JSON 入口不得继续启用；可禁用或替换为稳定 DBLP JSON",
  );
});

test("catalog validation requires every source to declare its discovery family explicitly", async () => {
  const { validateSourceCatalog } = await import("../radar/catalog.mjs");
  assert.throws(() => validateSourceCatalog([{
    id: "missing-family",
    name: "Missing family",
    url: "https://example.com/feed.xml",
    homepage: "https://example.com/",
    kind: "feed",
    layer: "official",
    language: "en",
  }]), /family/u, "family 是来源职责，不得按 Evidence Layer 静默猜测");
});

test("source catalog statically declares controlled long-form engineering content roles", async () => {
  const { loadSourceCatalog, validateSourceCatalog } = await import("../radar/catalog.mjs");
  const requiredRoles = ["podcast-transcript", "interview", "engineering-postmortem"];
  const catalog = await loadSourceCatalog();
  const coveredRoles = new Set(catalog.flatMap((source) => source.contentRoles || []));

  for (const role of requiredRoles) {
    assert.ok(
      coveredRoles.has(role),
      `启用来源目录必须显式覆盖 ${role}，不能依赖 name/focus 文案让运行时猜测长内容职责`,
    );
    assert.ok(
      catalog.some((source) => source.contentRoles?.includes(role) && source.family === "practitioner"),
      `${role} 至少需要一个实践者来源承担该职责，新闻、Release 或社区热帖不能替代长篇工程材料`,
    );
  }

  const validRoleSource = {
    id: "long-form-role-contract",
    name: "Long-form Role Contract",
    url: "https://example.com/feed.xml",
    homepage: "https://example.com/",
    kind: "feed",
    layer: "practitioner",
    family: "practitioner",
    language: "en",
    contentRoles: requiredRoles,
  };
  assert.deepEqual(
    validateSourceCatalog([validRoleSource])[0].contentRoles,
    requiredRoles,
    "目录解析必须保留受控 contentRoles，供覆盖审计与后续精排使用",
  );
  assert.throws(
    () => validateSourceCatalog([{ ...validRoleSource, contentRoles: ["marketing-roundup"] }]),
    /content.?role|内容职责|marketing-roundup/iu,
    "未知内容职责必须在静态目录门禁被拒绝，不能悄悄变成无法审计的自由文本",
  );
  assert.throws(
    () => validateSourceCatalog([{ ...validRoleSource, contentRoles: "interview" }]),
    /content.?role|内容职责/iu,
    "contentRoles 必须是受控数组，不能让单值字符串被逐字符解析",
  );
});

function crewaiBlogUrl(source) {
  if (!source) return null;
  const url = new URL(source.url);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

function articlePathIsWhitelisted(source, url) {
  return Boolean(source?.includeUrlPatterns?.some((pattern) => new RegExp(pattern, "i").test(url)));
}

test("community engagement opens an exploration gate without changing semantic relevance", async () => {
  const { scoreRelevance, shouldExploreCandidate } = await import("../radar/analyze.mjs");
  assert.equal(typeof shouldExploreCandidate, "function", "互动召回必须使用独立探索闸门，不能偷偷抬高相关性");
  const source = { layer: "community", family: "community", alwaysRelevant: false };
  const genericText = {
    title: "Show HN: We replaced the build queue",
    excerpt: "Developers are comparing an unfamiliar workflow and reporting mixed results.",
    contentText: "The thread contains implementation observations but none of the radar fixed terms.",
  };
  const now = Date.parse("2026-08-02T12:00:00.000Z");
  const recent = "2026-08-02T11:00:00.000Z";
  const stale = "2026-07-25T11:00:00.000Z";
  const high = scoreRelevance({ ...genericText, engagementCount: 420 }, source);
  const low = scoreRelevance({ ...genericText, engagementCount: 2 }, source);
  assert.equal(high, 0, "热度不得提高语义相关性分数");
  assert.equal(low, 0, "低互动无关键词内容仍保持零相关性");
  assert.equal(shouldExploreCandidate({ ...genericText, sourceLayer: "community", engagementCount: 420, publishedAt: recent }, source, { now }), true, "近期高互动社区候选应进入 LLM 探索");
  assert.equal(shouldExploreCandidate({ ...genericText, sourceLayer: "community", engagementCount: 2 }, source), false, "低互动泛 AI 不得进入 LLM");
  assert.equal(shouldExploreCandidate({ ...genericText, sourceLayer: "community", engagementCount: 420 }, source, { now }), false, "缺失时间的互动记录不能冒充近期线索");
  assert.equal(shouldExploreCandidate({ ...genericText, sourceLayer: "community", engagementCount: 420, publishedAt: "invalid" }, source, { now }), false, "非法时间的互动记录不能冒充近期线索");
  assert.equal(shouldExploreCandidate({ ...genericText, sourceLayer: "community", engagementCount: 420, publishedAt: stale }, source, { now }), false, "超过七天的高互动记录不得进入探索门");
});

test("manual production ingestion sends only the high-engagement generic discussion and new research collector to DeepSeek", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-frontier-manual-"));
  const previousFetch = globalThis.fetch;
  const envKeys = [
    "RADAR_DATA_DIR", "RADAR_AI_PROVIDER", "DEEPSEEK_API_KEY", "RADAR_DISABLE_AI",
    "RADAR_SOURCE_CONCURRENCY", "RADAR_FETCH_CONCURRENCY", "RADAR_ANALYSIS_CONCURRENCY",
    "RADAR_MAX_ITEM_AGE_DAYS", "RADAR_FETCH_RELAY_TEMPLATE",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.RADAR_DATA_DIR = dataDirectory;
  process.env.RADAR_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "frontier-test-key";
  delete process.env.RADAR_DISABLE_AI;
  delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
  process.env.RADAR_SOURCE_CONCURRENCY = "8";
  process.env.RADAR_FETCH_CONCURRENCY = "4";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";
  process.env.RADAR_MAX_ITEM_AGE_DAYS = "365";

  try {
    const { loadSourceCatalog } = await import("../radar/catalog.mjs");
    const sources = await loadSourceCatalog();
    const hackerNews = sources.find((source) => source.id === "hacker-news-agentic");
    const dailyPapers = sources.find((source) => /daily-papers/i.test(source.id));
    assert.ok(hackerNews, "测试需要生产 HN collector");
    assert.ok(dailyPapers && dailyPapers.parser === "huggingface-daily-papers", "测试需要新 HF Daily Papers collector");
    const now = new Date().toISOString();
    const primaryByUrl = new Map(sources.map((source) => [source.url, source]));
    const highHnUrl = "https://news.ycombinator.com/item?id=9001";
    const lowHnUrl = "https://news.ycombinator.com/item?id=9002";
    const paperUrl = "https://huggingface.co/papers/2608.00001";
    const sourceFetch = async (input) => {
      const url = String(input);
      if (url === hackerNews.url) {
        return new Response(JSON.stringify({ hits: [
          {
            objectID: "9001",
            title: "Show HN: We replaced the build queue",
            story_text: "Developers compare an unfamiliar workflow and report implementation observations.",
            created_at: now,
            points: 320,
            num_comments: 100,
          },
          {
            objectID: "9002",
            title: "A generic AI assistant launch",
            story_text: "A low-participation generic announcement.",
            created_at: now,
            points: 1,
            num_comments: 1,
          },
        ] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === dailyPapers.url) {
        return new Response(JSON.stringify([{
          paper: { id: "2608.00001", title: "Reliable Coding Agents Under Tool Failures", summary: "A study of coding agents, tool failures and recovery." },
          publishedAt: now,
          upvotes: 75,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if ([highHnUrl, lowHnUrl, paperUrl].includes(url)) {
        return new Response("<html><body><article><h1>Frontier item</h1><p>Developers report workflow behavior, implementation details, evaluation and reproducible observations.</p></article></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      const source = primaryByUrl.get(url);
      if (source?.kind === "json") {
        const body = source.parser === "bluesky-search" ? { posts: [] }
          : source.parser === "hacker-news" ? { hits: [] }
            : source.parser === "openreview-notes" ? { notes: [] }
              : [];
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(emptyFeed(), { status: 200, headers: { "content-type": "application/rss+xml" } });
    };

    const editorialInputs = [];
    const conceptSources = [];
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init.body);
      const text = deepSeekRequestText(request);
      if (isConceptKnowledgeRequest(request)) {
        const source = conceptSourceFromRequest(request);
        conceptSources.push(source);
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(conceptKnowledgeAnalysis(source)) } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      editorialInputs.push(text);
      const isPaper = /Daily Papers|2608\.00001|Reliable Coding Agents/i.test(text);
      const analysis = chineseWatchAnalysis(
        isPaper ? "工具失败下的可靠代码智能体" : "构建队列替代工作流",
        isPaper ? "research:reliable-coding-agents" : "community:build-queue-workflow",
      );
      if (!isPaper) {
        analysis.publishDecision = "publish";
        analysis.relevanceScore = 100;
        analysis.evidenceScore = 100;
      }
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "manual",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetch),
      modelLandscapeFetcher: async () => [],
    });
    assert.equal(result.acceptedCount, 0, "规则相关性为零的 exploration candidate 不能因模型返回 publish 而公开");
    assert.equal(result.watchedCount, 2, "模型误判 publish 的 exploration candidate 必须被强制降为 watch");
    assert.equal(editorialInputs.length, 2, "低互动泛 AI 不得调用文章编辑 LLM，高互动无关键词候选和研究候选必须调用");
    assert.ok(editorialInputs.some((input) => input.includes("Show HN: We replaced the build queue")), "高互动 HN 讨论必须进入文章编辑分析");
    assert.ok(editorialInputs.some((input) => input.includes("Reliable Coding Agents Under Tool Failures")), "新研究必须进入文章编辑分析");
    assert.ok(!editorialInputs.some((input) => input.includes("A generic AI assistant launch")), "低互动泛 AI 不得进入文章编辑分析");
    assert.ok(!editorialInputs.some((input) => /互动量|engagementCount|\b420\b/.test(input)), "互动量只负责打开探索门，不得进入 LLM 输入影响发布判断");
    assert.deepEqual(
      conceptSources.map((source) => source.url).sort(),
      [highHnUrl, paperUrl].sort(),
      "概念知识分析只能消费已经通过发现门禁并持久化的两条文章，不能把低互动泛 AI 带入下游",
    );
    assert.ok(!conceptSources.some((source) => source.url === lowHnUrl || /generic AI assistant launch/i.test(source.originalTitle)), "低互动泛 AI 不得进入概念知识分析");

    const { openDatabase } = await import("../radar/database.mjs");
    const database = openDatabase();
    try {
      const rows = database.prepare("SELECT url, source_id, engagement_count, publish_decision, evidence_score FROM articles ORDER BY source_id").all();
      assert.equal(rows.length, 2);
      const explored = rows.find((row) => row.url === highHnUrl);
      assert.ok(explored && explored.source_id === hackerNews.id && explored.engagement_count === 420);
      assert.equal(explored.publish_decision, "watch", "确定性发布守卫必须覆盖不可靠的模型 publish 决策");
      assert.ok(explored.evidence_score <= 55, "社区互动量不能越过社区证据分上限");
      assert.ok(rows.some((row) => row.url === paperUrl && row.source_id === dailyPapers.id), "新 collector 必须保留原始论文链接与来源身份");
      assert.ok(rows.every((row) => row.publish_decision === "watch"));
      assert.ok(!rows.some((row) => row.url === lowHnUrl), "低互动泛 AI 不得进入权威 articles 候选阶段");
      assert.ok(!result.snapshot.signals.some((signal) => signal.sources.some((source) => source.href === highHnUrl)), "watch exploration 不能进入公开 signals/evidence/confidence");
      const pulse = result.snapshot.discussionPulses?.find((entry) => entry.href === highHnUrl);
      assert.ok(pulse, "watch 社区探索线索必须由正式 snapshot DTO 投影到讨论页数据");
      assert.equal(pulse.originalTitle, "Show HN: We replaced the build queue");
      assert.equal(pulse.summary, "高参与讨论描述了一种新的开发工作流，但目前仍缺少官方与独立实践证据。");
      assert.equal(pulse.verificationState, "community-only");
      assert.equal(pulse.confidence, "待溯源");
    } finally {
      database.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("new research parsers preserve canonical original links and participation metadata", async () => {
  const { parseJsonSource } = await import("../radar/fetch.mjs");
  const hf = parseJsonSource(JSON.stringify([{
    paper: { id: "2608.00001", title: "Reliable Coding Agents", summary: "Evaluation under tool failures.", upvotes: 73 },
    publishedAt: "2026-08-02T00:00:00Z",
    numComments: 11,
  }]), {
    id: "hugging-face-daily-papers",
    parser: "huggingface-daily-papers",
    homepage: "https://huggingface.co/papers",
    url: "https://huggingface.co/api/daily_papers",
  });
  assert.equal(hf[0].url, "https://huggingface.co/papers/2608.00001");
  assert.equal(hf[0].engagementCount, 84, "Daily Papers 热度必须累加赞同与讨论数，而不是二选一");

  const openReview = parseJsonSource(JSON.stringify({ notes: [{
    id: "note-123",
    forum: "forum-456",
    content: { title: { value: "Agent Evaluation in Open Environments" }, abstract: { value: "A reproducible agent study." } },
    cdate: Date.parse("2026-08-02T00:00:00Z"),
    replyCount: 12,
  }] }), {
    id: "openreview-agent-research",
    parser: "openreview-notes",
    homepage: "https://openreview.net/",
    url: "https://api2.openreview.net/notes?content.venueid=agent",
  });
  assert.equal(openReview[0].url, "https://openreview.net/forum?id=forum-456");
  assert.equal(openReview[0].engagementCount, 12);
});

test("manual ingestion sends a year-only DBLP publication through the production age gate into candidate analysis", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-dblp-year-only-"));
  const previousFetch = globalThis.fetch;
  const envKeys = [
    "RADAR_DATA_DIR", "RADAR_AI_PROVIDER", "DEEPSEEK_API_KEY", "RADAR_DISABLE_AI",
    "RADAR_SOURCE_CONCURRENCY", "RADAR_FETCH_CONCURRENCY", "RADAR_ANALYSIS_CONCURRENCY",
    "RADAR_MAX_ITEM_AGE_DAYS", "RADAR_FETCH_RELAY_TEMPLATE", "GITHUB_TOKEN",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.RADAR_DATA_DIR = dataDirectory;
  process.env.RADAR_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "dblp-year-only-test-key";
  delete process.env.RADAR_DISABLE_AI;
  delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
  delete process.env.GITHUB_TOKEN;
  process.env.RADAR_SOURCE_CONCURRENCY = "100";
  process.env.RADAR_FETCH_CONCURRENCY = "4";
  process.env.RADAR_ANALYSIS_CONCURRENCY = "1";
  process.env.RADAR_MAX_ITEM_AGE_DAYS = "120";

  try {
    const { loadSourceCatalog } = await import("../radar/catalog.mjs");
    const sources = await loadSourceCatalog();
    const dblp = sources.find((source) => source.id === "dblp-agentic-coding");
    assert.ok(dblp && dblp.parser === "dblp-publications", "测试需要生产 DBLP collector");
    const paperUrl = "https://dblp.org/rec/conf/icse/year-only-agentic-coding";
    const primaryByUrl = new Map(sources.map((source) => [source.url, source]));
    const sourceFetch = async (input) => {
      const url = String(input);
      if (url === dblp.url) {
        return new Response(JSON.stringify({ result: { hits: { hit: [{ info: {
          title: "Agentic Coding Agents with Tool Orchestration and Multi-Agent Workflows",
          year: "2025",
          url: paperUrl,
          venue: "ICSE",
          authors: { author: [{ text: "Example Researcher" }] },
        } }] } } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === paperUrl) {
        return new Response("<html><body><article><h1>Agentic Coding Systems</h1><p>This paper evaluates coding agents, tool orchestration, recovery, and reproducible software engineering workflows.</p></article></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      const source = primaryByUrl.get(url);
      if (source?.kind === "json") {
        const body = source.parser === "bluesky-search" ? { posts: [] }
          : source.parser === "hacker-news" ? { hits: [] }
            : source.parser === "openreview-notes" ? { notes: [] }
              : source.parser === "dblp-publications" ? { result: { hits: { hit: [] } } }
                : [];
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(emptyFeed(), { status: 200, headers: { "content-type": "application/rss+xml" } });
    };

    const editorialInputs = [];
    const conceptSources = [];
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init.body);
      const text = deepSeekRequestText(request);
      if (isConceptKnowledgeRequest(request)) {
        const source = conceptSourceFromRequest(request);
        conceptSources.push(source);
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(conceptKnowledgeAnalysis(source)) } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      editorialInputs.push(text);
      const analysis = chineseWatchAnalysis("年份精度不足但值得分析的研究", "research:dblp-year-only");
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "manual",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(sourceFetch),
      modelLandscapeFetcher: async () => [],
    });
    assert.equal(result.fetchedCount, 1, "DBLP collector 应发现 year-only 研究记录");
    assert.equal(editorialInputs.length, 1, "year-only DBLP 记录不得被 120 天年龄门禁提前淘汰");
    assert.match(editorialInputs[0], /Agentic Coding Agents with Tool Orchestration/u);
    assert.deepEqual(conceptSources.map((source) => source.url), [paperUrl], "year-only DBLP 通过文章门禁后，概念知识阶段只能分析这一条已持久化研究");
    assert.equal(result.watchedCount, 1, "通过年龄门禁后的研究应进入正式候选分析与 watch 持久化阶段");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("a 200 response with zero parsed items is unavailable unless the source explicitly allows emptiness", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const source = {
    id: "empty-feed",
    name: "Empty feed",
    kind: "feed",
    url: "https://empty.example.com/feed.xml",
    homepage: "https://empty.example.com/",
    maxItems: 10,
  };
  const options = trustedFetchOptions(async () => new Response(emptyFeed(), {
    status: 200,
    headers: { "content-type": "application/rss+xml" },
  }));
  await assert.rejects(
    discoverSourceItemsWithDiagnostics(source, options),
    /EMPTY_RESULT|未解析出任何来源条目/u,
    "HTTP 200 但 0 items 不能标为 Available",
  );
  const allowed = await discoverSourceItemsWithDiagnostics({ ...source, id: "intentional-empty", allowEmpty: true }, options);
  assert.equal(allowed.status, "success");
  assert.deepEqual(allowed.items, []);
});

test("generic HTML directories whitelist article paths and never emit navigation links", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const catalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  const expectedIds = ["llamaindex-blog", "openhands-blog", "aider-blog", "dify-blog", "mastra-blog"];
  const crewAi = catalog.find((source) => source.independentGroup === "crewai" && source.kind === "html" && /\/blog\/?$/.test(new URL(source.url).pathname));
  const sources = [crewAi, ...expectedIds.map((id) => catalog.find((source) => source.id === id))];
  for (const source of sources) {
    assert.ok(source, "缺少应受路径白名单保护的 HTML 目录");
    assert.ok(source.includeUrlPatterns?.length, `${source.id} 必须声明文章路径 includeUrlPatterns`);
    const origin = new URL(source.homepage).origin;
    const articleUrl = source.id === "aider-blog"
      ? `${origin}/2026/08/02/reliable-agent-workflows.html`
      : `${origin}/blog/reliable-agent-workflows`;
    const navigationUrl = source.id === "aider-blog"
      ? `${origin}/2026/08/`
      : ["llamaindex-blog", "openhands-blog", "mastra-blog"].includes(source.id)
        ? `${origin}/blog/category/agents`
        : `${origin}/pricing`;
    assert.ok(articlePathIsWhitelisted(source, articleUrl), `${source.id} 白名单必须接纳真实文章路径`);
    assert.ok(!articlePathIsWhitelisted(source, navigationUrl), `${source.id} 白名单不得接纳导航路径`);
    const body = `<html><body><main>
      <a href="${navigationUrl}">Enterprise pricing and platform overview</a>
      <a href="${articleUrl}">Reliable agent workflows in production systems</a>
    </main></body></html>`;
    const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    })));
    assert.deepEqual(result.items.map((item) => item.url), [articleUrl], `${source.id} 必须只产出文章原链`);
  }
});

test("critical GitHub issue collectors declare same-repository HTML fallbacks restricted to numeric issue links", async () => {
  const catalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  for (const [sourceId, repositoryPath] of [
    ["cline-issues", "/cline/cline"],
    ["openhands-issues", "/OpenHands/OpenHands"],
  ]) {
    const source = catalog.find((entry) => entry.id === sourceId);
    assert.ok(source, `缺少关键工程讨论来源：${sourceId}`);
    assert.equal(
      source.url,
      `https://api.github.com/repos${repositoryPath}/issues?state=open&sort=updated&direction=desc&per_page=20`,
      `${sourceId} primary 必须使用 GitHub canonical owner/repo，旧 owner 的 200/redirect 不能视为稳定采集契约`,
    );
    assert.equal(source.homepage, `https://github.com${repositoryPath}/issues`, `${sourceId} homepage 必须使用 canonical Issues 地址`);
    const fallback = source.fallbacks?.find((endpoint) => endpoint.kind === "html");
    assert.ok(fallback, `${sourceId} 必须内置 GitHub Issues HTML fallback，不能只依赖 api.github.com`);
    const fallbackUrl = new URL(fallback.url);
    assert.equal(fallbackUrl.origin, "https://github.com");
    assert.equal(fallbackUrl.pathname.replace(/\/$/, ""), `${repositoryPath}/issues`, `${sourceId} fallback 必须留在同一仓库 Issues 页`);
    assert.equal(fallback.discoveryHomepage, `https://github.com${repositoryPath}/issues`, `${sourceId} fallback 解析基准必须使用 canonical Issues 地址`);
    assert.ok(fallback.includeUrlPatterns?.length, `${sourceId} fallback 必须声明 issue 原链白名单`);
    assert.ok(articlePathIsWhitelisted(fallback, `https://github.com${repositoryPath}/issues/123`), `${sourceId} 必须接纳对应仓库的数字 issue 原链`);
    for (const rejectedUrl of [
      `https://github.com${repositoryPath}/issues`,
      `https://github.com${repositoryPath}/issues?q=is%3Aopen`,
      `https://github.com${repositoryPath}/issues/labels/bug`,
      `https://github.com${repositoryPath}/pull/123`,
      "https://github.com/another/repository/issues/123",
    ]) {
      assert.ok(!articlePathIsWhitelisted(fallback, rejectedUrl), `${sourceId} 不得把导航或其他仓库链接当作 issue：${rejectedUrl}`);
    }
  }
});

test("built-in GitHub issue collectors degrade to their HTML fallback after API rate limiting without changing source identity", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const catalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  const previousToken = process.env.GITHUB_TOKEN;
  const previousRelay = process.env.RADAR_FETCH_RELAY_TEMPLATE;
  delete process.env.GITHUB_TOKEN;
  delete process.env.RADAR_FETCH_RELAY_TEMPLATE;

  try {
    for (const [sourceId, repositoryPath] of [
      ["cline-issues", "/cline/cline"],
      ["openhands-issues", "/OpenHands/OpenHands"],
    ]) {
      const source = catalog.find((entry) => entry.id === sourceId);
      assert.ok(source, `缺少关键工程讨论来源：${sourceId}`);
      const fallback = source.fallbacks?.find((endpoint) => endpoint.kind === "html");
      assert.ok(fallback, `${sourceId} 必须使用内置 catalog fallback 走完整生产采集链路`);
      const issueUrl = `https://github.com${repositoryPath}/issues/321`;
      const calls = [];
      const fetchImpl = async (input) => {
        const url = String(input);
        calls.push(url);
        if (new URL(url).hostname === "api.github.com") {
          return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-remaining": "0",
            },
          });
        }
        assert.equal(url, fallback.url, `${sourceId} API 失败后必须访问内置同仓库 HTML fallback`);
        return new Response(`<html><body><main>
          <a href="${repositoryPath}/issues">Browse all repository issues</a>
          <a href="${repositoryPath}/issues?q=is%3Aopen">Filter open issues navigation</a>
          <a href="${repositoryPath}/issues/321">Agent reliability regression with reproducible tool failures</a>
          <a href="${repositoryPath}/pull/321">Pull request navigation must not be collected</a>
          <a href="/another/repository/issues/999">Unrelated repository issue must not be collected</a>
        </main></body></html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      };

      const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(fetchImpl));
      assert.equal(result.status, "degraded", `${sourceId} fallback 成功必须明确标为 degraded，而不能冒充 primary success`);
      assert.equal(result.sourceId, source.id, `${sourceId} fallback 不能改变来源身份`);
      assert.equal(result.endpoint.role, "fallback");
      assert.deepEqual(result.items.map((item) => item.url), [issueUrl], `${sourceId} HTML fallback 只能产出对应仓库数字 issue 原链`);
      assert.ok(calls.some((url) => new URL(url).hostname === "api.github.com"), `${sourceId} 必须先尝试 primary API`);
      assert.equal(calls.at(-1), fallback.url, `${sourceId} 最后应落到内置 HTML fallback`);
    }
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousRelay === undefined) delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    else process.env.RADAR_FETCH_RELAY_TEMPLATE = previousRelay;
  }
});

test("GITHUB_TOKEN is attached only to direct api.github.com requests and never leaks to other hosts, fallback or relay", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const previousToken = process.env.GITHUB_TOKEN;
  const previousRelay = process.env.RADAR_FETCH_RELAY_TEMPLATE;
  process.env.GITHUB_TOKEN = "github-secret-for-test";
  process.env.RADAR_FETCH_RELAY_TEMPLATE = "https://relay.example.com/fetch?target={url}";
  const calls = [];
  const issue = [{
    title: "Agent issue discussion",
    html_url: "https://github.com/example/repo/issues/1",
    body: "A concrete issue about agent recovery.",
    created_at: "2026-08-02T00:00:00Z",
    comments: 40,
  }];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init.headers).get("authorization") });
    if (url.includes("relay.example.com")) return new Response(JSON.stringify(issue), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://api.github.com/repos/example/direct/issues") return new Response(JSON.stringify(issue), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://api.github.com/repos/example/fallback/issues") return new Response("blocked", { status: 503 });
    if (url === "https://github.com/example/fallback/issues.atom") return new Response("<?xml version=\"1.0\"?><feed><entry><title>Fallback issue update</title><link href=\"https://github.com/example/repo/issues/2\"/><updated>2026-08-02T00:00:00Z</updated></entry></feed>", { status: 200, headers: { "content-type": "application/atom+xml" } });
    if (url === "https://api.github.com/repos/example/relay/issues") return new Response("blocked", { status: 503 });
    throw new Error(`unexpected URL ${url}`);
  };
  const options = trustedFetchOptions(fetchImpl);
  const githubSource = (id, url, fallbacks = []) => ({ id, name: id, kind: "json", parser: "github-issues", url, homepage: "https://github.com/example/repo", fallbacks });
  try {
    await discoverSourceItemsWithDiagnostics(githubSource("direct", "https://api.github.com/repos/example/direct/issues"), options);
    await discoverSourceItemsWithDiagnostics(githubSource("fallback", "https://api.github.com/repos/example/fallback/issues", [{
      kind: "feed", url: "https://github.com/example/fallback/issues.atom", discoveryHomepage: "https://github.com/example/repo/issues",
    }]), options);
    await discoverSourceItemsWithDiagnostics(githubSource("relay", "https://api.github.com/repos/example/relay/issues"), options);
    const direct = calls.find((call) => call.url === "https://api.github.com/repos/example/direct/issues");
    assert.match(direct?.authorization || "", /github-secret-for-test/u, "GitHub API direct 请求应使用可选 token 提升限额");
    for (const call of calls.filter((entry) => new URL(entry.url).hostname !== "api.github.com")) {
      assert.equal(call.authorization, null, `GitHub token 泄漏到非 API host：${new URL(call.url).hostname}`);
    }
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousRelay === undefined) delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    else process.env.RADAR_FETCH_RELAY_TEMPLATE = previousRelay;
  }
});

test("an invalid GitHub token retries the same api.github.com primary once without Authorization", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const previousToken = process.env.GITHUB_TOKEN;
  const previousRelay = process.env.RADAR_FETCH_RELAY_TEMPLATE;
  process.env.GITHUB_TOKEN = "expired-github-token-for-test";
  delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
  const issue = [{
    title: "Anonymous GitHub issue remains publicly readable",
    html_url: "https://github.com/example/repo/issues/42",
    body: "A public issue about agent recovery and tool orchestration.",
    created_at: "2026-08-02T00:00:00Z",
    comments: 18,
  }];
  const source = {
    id: "github-expired-token",
    name: "GitHub expired token",
    kind: "json",
    parser: "github-issues",
    url: "https://api.github.com/repos/example/repo/issues",
    homepage: "https://github.com/example/repo",
    fallbacks: [],
  };

  try {
    for (const rejectedStatus of [401, 403]) {
      const calls = [];
      const fetchImpl = async (input, init = {}) => {
        const url = String(input);
        const authorization = new Headers(init.headers).get("authorization");
        calls.push({ url, authorization });
        assert.equal(url, source.url, "Token 失效后必须先对同一 primary 做匿名重试，不能改投其他 host");
        if (authorization) return new Response("invalid token", { status: rejectedStatus });
        return new Response(JSON.stringify(issue), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(fetchImpl));
      assert.equal(result.status, "success", `GitHub API ${rejectedStatus} 后匿名 primary 成功时来源应恢复`);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].url, issue[0].html_url, "匿名重试必须保留公开 issue 原链");
      assert.deepEqual(calls, [
        { url: source.url, authorization: "Bearer expired-github-token-for-test" },
        { url: source.url, authorization: null },
      ], `GitHub API ${rejectedStatus} 只能进行一次带 token 请求和一次匿名重试`);
    }
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousRelay === undefined) delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    else process.env.RADAR_FETCH_RELAY_TEMPLATE = previousRelay;
  }
});

test("signal heat is monotonic across engagement, freshness, discussion velocity and independent participation", async () => {
  const { computeSignalHeat } = await import("../radar/snapshot.mjs");
  assert.equal(typeof computeSignalHeat, "function", "热度应由可独立验证的纯函数生成");
  const now = Date.parse("2026-08-02T12:00:00Z");
  const row = (overrides = {}) => ({
    source_id: "community-a",
    independent_group: "community-a",
    source_layer: "community",
    engagement_count: 2,
    published_at: "2026-07-25T12:00:00Z",
    discovered_at: "2026-07-25T12:00:00Z",
    ...overrides,
  });
  const baseline = computeSignalHeat([row()], { now });
  const engaged = computeSignalHeat([row({ engagement_count: 500 })], { now });
  const fresh = computeSignalHeat([row({ engagement_count: 500, published_at: "2026-08-02T11:00:00Z" })], { now });
  const fastAndBroad = computeSignalHeat([
    row({ engagement_count: 500, published_at: "2026-08-02T11:00:00Z" }),
    row({ source_id: "community-b", independent_group: "community-b", engagement_count: 120, published_at: "2026-08-02T11:30:00Z" }),
  ], { now });
  assert.ok(engaged.score > baseline.score, "互动量必须提高热度");
  assert.ok(fresh.score > engaged.score, "同互动量下，新鲜讨论必须更热");
  assert.ok(fastAndBroad.score > fresh.score, "短时间跨独立来源参与必须体现讨论速度与参与广度");
  for (const field of ["engagement", "freshness", "velocity", "participation", "score"]) {
    assert.equal(typeof fastAndBroad[field], "number", `热度缺少可解释维度：${field}`);
  }
});

test("OpenAI official plus its own GitHub issues remains official-only instead of becoming cross-verified", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-openai-source-group-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  try {
    const { loadSourceCatalog } = await import("../radar/catalog.mjs");
    const catalog = await loadSourceCatalog();
    const official = catalog.find((source) => source.id === "openai-codex-releases");
    const discussions = catalog.find((source) => source.id === "github-agents-discussions");
    assert.ok(official && discussions, "测试需要 OpenAI 官方发布与自有 issues 两个生产来源");
    const { beginRun, finishRun, insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot } = await import("../radar/snapshot.mjs");
    const database = openDatabase();
    const signalSlug = "openai-owned-evidence-must-not-self-verify";
    try {
      upsertSourceCatalog(database, [official, discussions]);
      assert.equal(insertArticle(database, persistedArticle(official, {
        url: "https://github.com/openai/codex/releases/tag/example",
        contentHash: "openai-official-release",
        signalSlug,
        sourceLayer: "official",
        independentGroup: official.independentGroup,
      })), true);
      assert.equal(insertArticle(database, persistedArticle(discussions, {
        url: "https://github.com/openai/openai-agents-python/issues/123",
        contentHash: "openai-owned-issue",
        signalSlug,
        sourceLayer: "community",
        independentGroup: discussions.independentGroup,
      })), true);
      const runId = beginRun(database, "manual", new Date().toISOString(), "deepseek");
      finishRun(database, runId, {
        finishedAt: new Date().toISOString(), status: "success", fetchedCount: 2, acceptedCount: 2,
        skippedCount: 0, errorCount: 0, runAnalysisMode: "deepseek", configuredProvider: "deepseek", message: "ok",
      });
      const snapshot = await buildSnapshot(database);
      const signal = snapshot.signals.find((entry) => entry.slug === signalSlug);
      assert.ok(signal, "同事件的 OpenAI release 与自有 issue 应形成公开 signal");
      assert.equal(signal.independentSources, 1, "同一厂商的官方发布与自有 issue 只能算一个独立来源组");
      assert.deepEqual(signal.sourceMix, { official: 1, practitioner: 0, community: 0 });
      assert.equal(signal.verificationState, "official-only", "厂商自有 issue 不能把官方信号升级为 cross-verified");
      assert.equal(signal.confidence, "中等");
      assert.equal(discussions.independentGroup, "openai", "厂商自有 GitHub issues 必须显式归入 OpenAI independent group");
    } finally {
      database.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("community heat never upgrades evidence mix, verification state or confidence", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-heat-evidence-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  try {
    const { beginRun, finishRun, insertArticle, openDatabase, updateSourceHealth, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot } = await import("../radar/snapshot.mjs");
    const database = openDatabase();
    const sources = ["community-a", "community-b"].map((id) => ({
      id,
      name: id,
      homepage: `https://${id}.example.com/`,
      class: "英文社区",
      layer: "community",
      family: "community",
      language: "en",
      priority: "P1",
      cadence: "1h",
      focus: "Frontier community discovery",
      independentGroup: id,
    }));
    try {
      upsertSourceCatalog(database, sources);
      for (const [index, source] of sources.entries()) {
        updateSourceHealth(database, source, { attemptedAt: new Date().toISOString(), status: "success", error: null, itemCount: 1 });
        insertArticle(database, persistedArticle(source, {
          url: `https://${source.id}.example.com/discussion-${index}`,
          contentHash: `${source.id}-${index}`,
          engagementCount: 10_000 - index,
        }));
      }
      const runId = beginRun(database, "manual", new Date().toISOString(), "deepseek");
      finishRun(database, runId, {
        finishedAt: new Date().toISOString(), status: "success", fetchedCount: 2, acceptedCount: 2,
        skippedCount: 0, errorCount: 0, runAnalysisMode: "deepseek", configuredProvider: "deepseek", message: "ok",
      });
      const snapshot = await buildSnapshot(database);
      const signal = snapshot.signals.find((entry) => entry.slug === "community-heat-must-not-become-truth");
      assert.ok(signal?.heat?.score > 0, "snapshot 必须公开热度解释");
      assert.deepEqual(signal.sourceMix, { official: 0, practitioner: 0, community: 2 });
      assert.equal(signal.verificationState, "community-only");
      assert.equal(signal.confidence, "待溯源", "再高热度也不得把社区线索升级成权威事实");
    } finally {
      database.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("discussion pulse heat is computed from its own watch discussions, not official or practitioner rows sharing the signal", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-discussion-pulse-heat-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  try {
    const { beginRun, finishRun, insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot, computeSignalHeat } = await import("../radar/snapshot.mjs");
    const database = openDatabase();
    const official = {
      id: "same-event-official", name: "Same Event Official", homepage: "https://official.example.com/", class: "官方团队",
      layer: "official", family: "official", language: "en", priority: "P0", cadence: "4h", focus: "Agent workflow", independentGroup: "same-vendor",
    };
    const community = {
      id: "same-event-community", name: "Same Event Community", homepage: "https://community.example.com/", class: "英文社区",
      layer: "community", family: "community", language: "en", priority: "P1", cadence: "1h", focus: "Agent workflow", independentGroup: "community-group",
    };
    const publishedAt = "2026-08-02T11:00:00.000Z";
    const signalSlug = "same-event-signal";
    try {
      upsertSourceCatalog(database, [official, community]);
      assert.equal(insertArticle(database, persistedArticle(official, {
        url: "https://official.example.com/announcement",
        sourceLayer: "official",
        engagementCount: 10_000,
        publishedAt,
        signalSlug,
        publishDecision: "publish",
      })), true);
      assert.equal(insertArticle(database, persistedArticle(community, {
        url: "https://community.example.com/thread/1",
        sourceLayer: "community",
        engagementCount: 100,
        publishedAt,
        signalSlug,
        originalTitle: "A community thread about an unverified workflow",
        title: "社区观察到待验证的新型工作流",
        summary: "社区讨论提出一个待验证工作流，但尚无独立事实证据。",
        publishDecision: "watch",
        candidateConcept: "待验证工作流",
      })), true);
      const runId = beginRun(database, "manual", new Date().toISOString(), "deepseek");
      finishRun(database, runId, {
        finishedAt: new Date().toISOString(), status: "success", fetchedCount: 2, acceptedCount: 1,
        skippedCount: 0, errorCount: 0, runAnalysisMode: "deepseek", configuredProvider: "deepseek", message: "ok",
      });
      const snapshot = await buildSnapshot(database);
      const pulse = snapshot.discussionPulses?.find((entry) => entry.href === "https://community.example.com/thread/1");
      assert.ok(pulse, "watch discussion 必须形成独立 discussion pulse");
      const expected = computeSignalHeat([{
        engagement_count: 100,
        source_id: community.id,
        independent_group: community.independentGroup,
        source_layer: "community",
        published_at: publishedAt,
        discovered_at: publishedAt,
      }]);
      assert.deepEqual(pulse.heat, expected, "discussion pulse 热度不能借用同 signal 的官方 10000 互动量");
      assert.equal(pulse.confidence, "待溯源");
    } finally {
      database.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("snapshot status exposes configured, available and effective coverage by layer and family with old-snapshot fallback", async () => {
  const { buildSourceCoverage, normalizeSourceCoverage } = await import("../radar/snapshot.mjs");
  assert.equal(typeof buildSourceCoverage, "function");
  assert.equal(typeof normalizeSourceCoverage, "function");
  const sources = [
    { id: "official-a", layer: "official", family: "official", status: "正常", independentGroup: "vendor-a" },
    { id: "repo-a", layer: "community", family: "repository", status: "降级", independentGroup: "vendor-a" },
    { id: "research-a", layer: "official", family: "research", status: "异常", independentGroup: "research-a" },
    { id: "community-a", layer: "community", family: "community", status: "正常", independentGroup: "community-a" },
    { id: "practitioner-a", layer: "practitioner", family: "practitioner", status: "待首次采集", independentGroup: "practitioner-a" },
  ];
  const coverage = buildSourceCoverage(sources, new Set(["official-a", "community-a"]));
  assert.deepEqual(coverage.total, { configured: 5, available: 3, effective: 2 });
  assert.deepEqual(coverage.byLayer.official, { configured: 2, available: 1, effective: 1 });
  assert.deepEqual(coverage.byLayer.community, { configured: 2, available: 2, effective: 1 });
  assert.deepEqual(coverage.byFamily.repository, { configured: 1, available: 1, effective: 0 });
  assert.deepEqual(coverage.byFamily.research, { configured: 1, available: 0, effective: 0 });
  assert.deepEqual(coverage.independentGroups, { configured: 4, available: 2, effective: 2 }, "同组织 blog/release/issues 只能算一个独立来源组");

  const legacy = normalizeSourceCoverage(undefined, {
    sourceCount: 40,
    healthySourceCount: 30,
    degradedSourceCount: 2,
    availableSourceCount: 32,
  });
  assert.deepEqual(legacy.total, { configured: 40, available: 32, effective: 0 });
  assert.deepEqual(legacy.byLayer, {});
  assert.deepEqual(legacy.byFamily, {});
  assert.deepEqual(legacy.independentGroups, { configured: 0, available: 0, effective: 0 });
});

test("snapshot effective coverage counts only sources retained by public signals plus public discussion pulses", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-public-coverage-"));
  const envKeys = ["RADAR_DATA_DIR", "RADAR_SNAPSHOT_SIGNALS", "RADAR_SNAPSHOT_ARTICLES", "RADAR_SNAPSHOT_DISCUSSIONS"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.RADAR_DATA_DIR = dataDirectory;
  process.env.RADAR_SNAPSHOT_SIGNALS = "80";
  process.env.RADAR_SNAPSHOT_ARTICLES = "320";
  process.env.RADAR_SNAPSHOT_DISCUSSIONS = "160";
  try {
    const { beginRun, finishRun, insertArticle, openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot } = await import("../radar/snapshot.mjs");
    const database = openDatabase();
    const publishedSources = Array.from({ length: 81 }, (_, index) => ({
      id: `coverage-official-${String(index).padStart(2, "0")}`,
      name: `Coverage Official ${index}`,
      homepage: `https://coverage-official-${index}.example.com/`,
      class: "一手工程",
      layer: "official",
      family: "official",
      language: "en",
      priority: "P1",
      cadence: "4h",
      focus: "Coverage boundary",
      independentGroup: `coverage-group-${index}`,
    }));
    const discussionSource = {
      id: "coverage-public-discussion",
      name: "Coverage Public Discussion",
      homepage: "https://coverage-discussion.example.com/",
      class: "英文社区",
      layer: "community",
      family: "community",
      language: "en",
      priority: "P1",
      cadence: "1h",
      focus: "Coverage discussion",
      independentGroup: "coverage-discussion-group",
    };
    const urlToSourceId = new Map();
    try {
      upsertSourceCatalog(database, [...publishedSources, discussionSource]);
      const base = Date.now();
      for (const [index, source] of publishedSources.entries()) {
        const url = `${source.homepage}signals/${index}`;
        urlToSourceId.set(url, source.id);
        const eventAt = new Date(base - index * 3_600_000).toISOString();
        assert.equal(insertArticle(database, persistedArticle(source, {
          url,
          contentHash: `coverage-published-${index}`,
          signalSlug: `coverage-signal-${String(index).padStart(2, "0")}`,
          publishedAt: eventAt,
          discoveredAt: eventAt,
          sourceLayer: "official",
          independentGroup: source.independentGroup,
        })), true);
      }
      const discussionUrl = `${discussionSource.homepage}thread/1`;
      assert.equal(insertArticle(database, persistedArticle(discussionSource, {
        url: discussionUrl,
        contentHash: "coverage-discussion-watch",
        signalSlug: "coverage-watch-signal",
        publishDecision: "watch",
        candidateConcept: "公开讨论覆盖边界",
        sourceLayer: "community",
        independentGroup: discussionSource.independentGroup,
      })), true);
      const runId = beginRun(database, "manual", new Date().toISOString(), "deepseek");
      finishRun(database, runId, {
        finishedAt: new Date().toISOString(), status: "success", fetchedCount: 82, acceptedCount: 81,
        skippedCount: 0, errorCount: 0, runAnalysisMode: "deepseek", configuredProvider: "deepseek", message: "ok",
      });

      const snapshot = await buildSnapshot(database);
      assert.equal(snapshot.signals.length, 80, "fixture 必须真实触发 public signal slice");
      assert.equal(snapshot.discussionPulses.length, 1, "公开 discussion pulse 必须参与 effective coverage");
      const publicSourceIds = new Set(snapshot.signals.flatMap((signal) => signal.sources)
        .map((source) => urlToSourceId.get(source.href))
        .filter(Boolean));
      for (const pulse of snapshot.discussionPulses) publicSourceIds.add(pulse.sourceId);
      assert.equal(publicSourceIds.size, 81, "80 个公开 signal 来源加 1 个公开 discussion 来源应形成 81 个有效来源");
      assert.ok(publishedSources.some((source) => !publicSourceIds.has(source.id)), "fixture 必须包含被 80-signal slice 截掉的 article/source");
      assert.equal(snapshot.status.sourceCoverage.total.effective, publicSourceIds.size, "被公开 slice 截掉的 article/source 不得计入当前快照有效来源");
      assert.equal(snapshot.status.sourceCoverage.byFamily.official.effective, 80);
      assert.equal(snapshot.status.sourceCoverage.byFamily.community.effective, 1);
      assert.equal(snapshot.status.sourceCoverage.byLayer.official.effective, 80);
      assert.equal(snapshot.status.sourceCoverage.byLayer.community.effective, 1);
      assert.equal(snapshot.status.sourceGroupCoverage.effective, publicSourceIds.size, "有效独立来源组也必须以最终公开 DTO 为边界");
    } finally {
      database.close();
    }
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("openDatabase migrates a legacy source_health table without source_family and preserves the existing row", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-source-family-migration-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  const { DatabaseSync } = await import("node:sqlite");
  const databasePath = path.join(dataDirectory, "agent-radar.sqlite");
  const legacy = new DatabaseSync(databasePath);
  try {
    legacy.exec(`
      CREATE TABLE source_health (
        source_id TEXT PRIMARY KEY, name TEXT NOT NULL, homepage TEXT NOT NULL, source_class TEXT NOT NULL,
        priority TEXT NOT NULL, cadence TEXT NOT NULL, focus TEXT NOT NULL, independent_group TEXT NOT NULL,
        source_layer TEXT, language TEXT, active INTEGER NOT NULL DEFAULT 1, last_attempt_at TEXT,
        last_success_at TEXT, last_error TEXT, last_status TEXT NOT NULL DEFAULT 'never', item_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO source_health (source_id, name, homepage, source_class, priority, cadence, focus, independent_group, source_layer, language)
      VALUES ('legacy-source', 'Legacy Source', 'https://legacy.example.com/', '一手工程', 'P1', '4h', 'Agent', 'legacy-group', 'official', 'en');
    `);
  } finally {
    legacy.close();
  }
  try {
    const { openDatabase, upsertSourceCatalog } = await import("../radar/database.mjs");
    const migrated = openDatabase();
    try {
      assert.ok(migrated.prepare("PRAGMA table_info(source_health)").all().some((column) => column.name === "source_family"));
      assert.equal(migrated.prepare("SELECT name FROM source_health WHERE source_id = 'legacy-source'").get().name, "Legacy Source");
      upsertSourceCatalog(migrated, [{
        id: "legacy-source", name: "Legacy Source", homepage: "https://legacy.example.com/", class: "一手工程",
        priority: "P1", cadence: "4h", focus: "Agent", independentGroup: "legacy-group", layer: "official", family: "repository", language: "en",
      }]);
      assert.equal(migrated.prepare("SELECT source_family FROM source_health WHERE source_id = 'legacy-source'").get().source_family, "repository");
    } finally {
      migrated.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("1h and 2h cadence are reachable from systemd while manual remains full-scan", async () => {
  const { isSourceDue } = await import("../radar/pipeline.mjs");
  const now = "2026-08-02T12:00:00.000Z";
  for (const hours of [1, 2]) {
    const exact = new Date(Date.parse(now) - hours * 3_600_000).toISOString();
    const early = new Date(Date.parse(now) - hours * 3_600_000 + 60_000).toISOString();
    assert.equal(isSourceDue({ cadence: `${hours}h` }, { trigger: "systemd", lastAttemptAt: exact, now }), true);
    assert.equal(isSourceDue({ cadence: `${hours}h` }, { trigger: "systemd", lastAttemptAt: early, now }), false);
    assert.equal(isSourceDue({ cadence: `${hours}h` }, { trigger: "manual", lastAttemptAt: now, now }), true, "manual 必须绕过 cadence 全量扫描");
  }
});
