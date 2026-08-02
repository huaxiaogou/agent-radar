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

function sourceFixture(overrides = {}) {
  return {
    id: "resilient-source",
    name: "Resilient Source",
    kind: "feed",
    url: "https://primary.example/feed.xml",
    homepage: "https://primary.example/",
    class: "一手工程",
    family: "official",
    layer: "official",
    language: "en",
    priority: "P0",
    cadence: "4h",
    focus: "Agent engineering",
    independentGroup: "resilient-source",
    maxItems: 10,
    enabled: true,
    ...overrides,
  };
}

function emptyFeed(title = "Empty feed") {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title></channel></rss>`;
}

function staleFeed(title = "Historical feed") {
  const slug = encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"));
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><item><title>${title} archived agent item</title><link>https://archive.example/${slug}</link><description>Historical agent engineering archive.</description><pubDate>Wed, 01 Jan 2020 00:00:00 GMT</pubDate></item></channel></rss>`;
}

function staleJsonBody(source) {
  const slug = source.id.replace(/[^a-z0-9-]/gi, "-");
  if (source.parser === "github-issues") {
    return [{
      title: `${source.name} historical agent issue`,
      html_url: `https://github.com/example/${slug}/issues/1`,
      body: "Historical agent engineering issue.",
      created_at: "2020-01-01T00:00:00Z",
      comments: 1,
    }];
  }
  if (source.parser === "hacker-news") {
    return { hits: [{ objectID: slug, title: `${source.name} historical agent discussion`, story_text: "Historical agent discussion.", created_at: "2020-01-01T00:00:00Z", points: 1, num_comments: 1 }] };
  }
  if (source.parser === "bluesky-search") {
    return { posts: [{ uri: `at://did:plc:radartest/app.bsky.feed.post/${slug}`, author: { handle: "radar-test.example.com" }, record: { text: `${source.name} historical agent discussion`, createdAt: "2020-01-01T00:00:00Z" }, likeCount: 1 }] };
  }
  if (source.parser === "huggingface-daily-papers") {
    return [{ paper: { id: "2001.00001", title: `${source.name} historical agent paper`, summary: "Historical agent research." }, publishedAt: "2020-01-01T00:00:00Z" }];
  }
  if (source.parser === "dblp-publications") {
    return { result: { hits: { hit: [{ info: { title: `${source.name} historical agent paper`, url: `https://dblp.org/rec/journals/test/${slug}`, year: "2020" } }] } } };
  }
  throw new Error(`缺少 JSON 测试夹具：${source.parser}`);
}

function timeoutError() {
  const cause = new Error("");
  cause.code = "ETIMEDOUT";
  return new Error("fetch failed", { cause });
}

test("ordered source endpoints fall back without losing source identity or original article links", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  assert.equal(
    typeof discoverSourceItemsWithDiagnostics,
    "function",
    "生产发现入口必须提供向后兼容的详细结果 API；旧 discoverSourceItems 仍可只返回 items",
  );

  const source = sourceFixture({
    fallbacks: [{
      url: "https://fallback.example/releases.xml",
      kind: "feed",
    }],
  });
  const requested = [];
  const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.startsWith(source.url)) throw timeoutError();
    if (url.startsWith(source.fallbacks[0].url)) {
      return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Fallback</title><item><title>Agent Harness fallback release</title><link>/articles/agent-harness</link><description>Agent tools, checkpoints and durable recovery.</description></item></channel></rss>`, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }));

  assert.equal(result.sourceId, source.id, "fallback 只能替换传输端点，不能改变 catalog 来源身份");
  assert.equal(result.status, "degraded", "fallback 成功必须显式标为 degraded，不能伪装 primary success");
  assert.equal(result.endpoint.role, "fallback");
  assert.equal(result.endpoint.index, 1);
  assert.equal(result.items.length, 1);
  assert.equal(
    result.items[0].url,
    "https://fallback.example/articles/agent-harness",
    "文章链接必须保留 fallback feed 声明的原始链接，而不是指向 relay 或主端点",
  );
  assert.ok(requested.filter((url) => url.startsWith(source.url)).length >= 1, "必须先尝试 primary");
  assert.ok(requested.at(-1).startsWith(source.fallbacks[0].url), "primary 失败后才允许尝试 fallback");
  assert.ok(result.diagnostics.some((entry) => entry.code === "ETIMEDOUT"), "降级成功也必须保留主端点失败诊断");
});

test("a primary HTTP 200 with zero parsed items records EMPTY_RESULT and continues to fallback", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const source = sourceFixture({
    fallbacks: [{ url: "https://fallback.example/releases.xml", kind: "feed" }],
  });
  const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
    if (String(input).startsWith(source.url)) {
      return new Response(emptyFeed("WAF shell"), { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><item><title>Recovered agent release</title><link>https://fallback.example/releases/recovered</link><description>Recovered through the official fallback.</description></item></channel></rss>`, {
      status: 200,
      headers: { "content-type": "application/rss+xml" },
    });
  }));
  assert.equal(result.status, "degraded");
  assert.equal(result.items.length, 1);
  assert.equal(result.diagnostics[0].code, "EMPTY_RESULT");
  assert.match(result.diagnostics[0].message, /未解析出任何来源条目/);
});

test("all endpoint failures expose safe per-endpoint diagnostics including nested cause codes and HTTP status", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  assert.equal(typeof discoverSourceItemsWithDiagnostics, "function");
  const primarySecret = "PRIMARY_SUPER_SECRET";
  const fallbackSecret = "FALLBACK_SUPER_SECRET";
  const source = sourceFixture({
    url: `https://primary.example/feed.xml?api_key=${primarySecret}`,
    fallbacks: [{
      url: `https://fallback.example/releases.xml?token=${fallbackSecret}`,
      kind: "feed",
    }],
  });

  await assert.rejects(
    discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
      if (String(input).includes("primary.example")) throw timeoutError();
      return new Response("unavailable", { status: 503 });
    })),
    (error) => {
      assert.match(error.message, /primary\.example/i, "聚合错误必须指出 primary 的安全标识");
      assert.match(error.message, /fallback\.example/i, "聚合错误必须指出 fallback 的安全标识");
      assert.match(error.message, /ETIMEDOUT/i, "嵌套 cause.code 不能丢失");
      assert.match(error.message, /HTTP 503/i, "HTTP 错误必须保留状态码");
      assert.doesNotMatch(error.message, new RegExp(primarySecret), "错误消息不得泄露 primary query secret");
      assert.doesNotMatch(error.message, new RegExp(fallbackSecret), "错误消息不得泄露 fallback query secret");
      assert.equal(error.diagnostics?.length, 2, "每个直接端点都必须有一条结构化诊断");
      assert.ok(error.diagnostics.every((entry) => !JSON.stringify(entry).includes("SUPER_SECRET")));
      return true;
    },
  );
});

test("DNS resolver codes survive the public-target guard and reach source diagnostics", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  const dnsError = new Error("temporary DNS failure");
  dnsError.code = "EAI_AGAIN";
  await assert.rejects(
    discoverSourceItemsWithDiagnostics(sourceFixture(), {
      fetchImpl: async () => {
        throw new Error("fetch must not run when DNS resolution failed");
      },
      resolveHostname: async () => {
        throw dnsError;
      },
      createDispatcher: () => ({ close: async () => {} }),
    }),
    (error) => {
      assert.match(error.message, /EAI_AGAIN/);
      assert.equal(error.diagnostics?.[0]?.code, "EAI_AGAIN");
      return true;
    },
  );
});

test("operator relay is attempted only after direct endpoints and resolves relative links against the original endpoint", async () => {
  const previousRelay = process.env.RADAR_FETCH_RELAY_TEMPLATE;
  process.env.RADAR_FETCH_RELAY_TEMPLATE = "https://relay.example/fetch?target={url}";
  try {
    const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
    assert.equal(typeof discoverSourceItemsWithDiagnostics, "function");
    const source = sourceFixture({
      url: "https://blocked.example/news/feed.xml",
      fallbacks: [{ url: "https://fallback.example/news/feed.xml", kind: "feed" }],
    });
    const requested = [];
    const result = await discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith(source.url)) throw timeoutError();
      if (url.startsWith("https://relay.example/")) {
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Relayed</title><item><title>Agent runtime recovery through relay</title><link>../posts/runtime-recovery</link><description>Agent runtime checkpoints and tool-call recovery.</description></item></channel></rss>`, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }));

    const firstRelay = requested.findIndex((url) => url.startsWith("https://relay.example/"));
    const lastPrimary = requested.findLastIndex((url) => url.startsWith(source.url));
    const firstFallback = requested.findIndex((url) => url.startsWith(source.fallbacks[0].url));
    const lastFallback = requested.findLastIndex((url) => url.startsWith(source.fallbacks[0].url));
    assert.ok(firstRelay > 0, "relay 之前必须至少完成一次直接端点尝试");
    assert.ok(firstFallback > lastPrimary, "必须先耗尽 primary 重试，再进入 catalog fallback");
    assert.ok(firstRelay > lastFallback, "必须耗尽所有 catalog fallback 后才允许进入 relay");
    assert.ok(requested.slice(0, firstRelay).every((url) => !url.startsWith("https://relay.example/")), "relay 不得与直接端点并发抢跑");
    assert.equal(result.status, "degraded");
    assert.equal(result.endpoint.role, "relay");
    assert.equal(result.items[0].url, "https://blocked.example/posts/runtime-recovery", "relay body 必须按原端点 URL 解析相对链接");
  } finally {
    if (previousRelay === undefined) delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    else process.env.RADAR_FETCH_RELAY_TEMPLATE = previousRelay;
  }
});

test("relay template is opt-in and rejects insecure, credentialed or ambiguous templates", async () => {
  const { discoverSourceItemsWithDiagnostics } = await import("../radar/fetch.mjs");
  assert.equal(typeof discoverSourceItemsWithDiagnostics, "function");
  const previousRelay = process.env.RADAR_FETCH_RELAY_TEMPLATE;
  const source = sourceFixture();
  try {
    for (const template of [
      "http://relay.example/fetch?target={url}",
      "https://user:secret@relay.example/fetch?target={url}",
      "https://relay.example/fetch",
      "https://relay.example/fetch?a={url}&b={url}",
      "https://relay.example/fetch#{url}",
    ]) {
      process.env.RADAR_FETCH_RELAY_TEMPLATE = template;
      let directCalls = 0;
      let relayCalls = 0;
      await assert.rejects(
        discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
          if (String(input).startsWith(source.url)) directCalls += 1;
          if (String(input).includes("relay.example")) relayCalls += 1;
          throw timeoutError();
        })),
        /relay|模板|HTTPS|凭据|\{url\}/i,
        `无效 relay 模板必须失败关闭：${template}`,
      );
      assert.ok(directCalls >= 1, "无效 relay 配置不能阻止已经可用的 direct 顺序先执行");
      assert.equal(relayCalls, 0, "无效 relay 模板不得发起网络请求");
    }

    delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    const requested = [];
    await assert.rejects(discoverSourceItemsWithDiagnostics(source, trustedFetchOptions(async (input) => {
      requested.push(String(input));
      throw timeoutError();
    })));
    assert.ok(requested.length >= 1);
    assert.ok(requested.every((url) => url.startsWith(source.url)), "未配置 relay 时必须保持直接抓取失败的旧行为");
  } finally {
    if (previousRelay === undefined) delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
    else process.env.RADAR_FETCH_RELAY_TEMPLATE = previousRelay;
  }
});

test("catalog validates every fallback endpoint kind, parser and public HTTPS URL", async () => {
  const { validateSourceCatalog } = await import("../radar/catalog.mjs");
  assert.equal(typeof validateSourceCatalog, "function", "catalog 校验应导出纯函数供测试和 loadSourceCatalog 共用");

  const valid = sourceFixture({
    fallbacks: [
      { url: "https://mirror.example/feed.xml", kind: "feed" },
      { url: "https://mirror.example/search.json", kind: "json", parser: "bluesky-search" },
    ],
  });
  assert.doesNotThrow(() => validateSourceCatalog([valid]));

  for (const [label, fallback] of [
    ["insecure", { url: "http://mirror.example/feed.xml", kind: "feed" }],
    ["credentialed", { url: "https://user:secret@mirror.example/feed.xml", kind: "feed" }],
    ["missing kind", { url: "https://mirror.example/feed.xml" }],
    ["invalid kind", { url: "https://mirror.example/feed.xml", kind: "ftp" }],
    ["invalid JSON parser", { url: "https://mirror.example/search.json", kind: "json", parser: "unknown" }],
    ["parser/kind mismatch", { url: "https://mirror.example/feed.xml", kind: "feed", parser: "hacker-news" }],
  ]) {
    assert.throws(
      () => validateSourceCatalog([sourceFixture({ fallbacks: [fallback] })]),
      /fallback|kind|parser|HTTPS|凭据/i,
      `${label} fallback 必须在启动加载 catalog 时失败关闭`,
    );
  }
});

test("built-in catalog declares mainland-tolerant official and community fallback endpoints", async () => {
  const catalog = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  const byId = new Map(catalog.map((source) => [source.id, source]));
  const fallbackUrls = (id) => (byId.get(id)?.fallbacks || []).map((endpoint) => new URL(endpoint.url));

  assert.ok(
    fallbackUrls("claude-code-changelog").some((url) => url.hostname === "github.com" && /anthropics\/claude-code\/releases/i.test(url.pathname)),
    "Claude Changelog 必须有官方 GitHub releases fallback",
  );
  assert.ok(
    fallbackUrls("hugging-face-blog").some((url) => url.hostname === "github.com" && /huggingface\/blog/i.test(url.pathname)),
    "Hugging Face Blog 必须有官方 blog repo fallback",
  );
  assert.ok(
    fallbackUrls("google-antigravity").some((url) => url.hostname === "developers.googleblog.com"),
    "Google Antigravity 必须有 Google Developers Blog fallback",
  );
  const googleFallback = byId.get("google-antigravity").fallbacks.find((endpoint) => new URL(endpoint.url).hostname === "developers.googleblog.com");
  const googlePatterns = googleFallback.includeUrlPatterns.map((pattern) => new RegExp(pattern, "i"));
  assert.ok(
    googlePatterns.some((pattern) => pattern.test("https://developers.googleblog.com/build-with-google-antigravity/")),
    "Google fallback 白名单必须接收真实 Antigravity 文章 URL",
  );
  assert.equal(
    googlePatterns.some((pattern) => pattern.test("https://developers.googleblog.com/search/?query=antigravity")),
    false,
    "Google fallback 不能把搜索页自身当成文章",
  );
  for (const id of ["v2ex-programmer", "v2ex-tech"]) {
    assert.ok(fallbackUrls(id).some((url) => url.hostname === "global.v2ex.com"), `${id} 必须有 V2EX global fallback`);
  }
  assert.equal(
    fallbackUrls("bluesky-agentic").some((url) => url.hostname === "public.api.bsky.app"),
    false,
    "searchPosts 在 public.api host 上返回 403，不能把已知不可用入口登记成 fallback；应由 operator relay 承接",
  );
  assert.equal(
    (byId.get("reddit-local-llama")?.fallbacks || []).some((endpoint) => !new URL(endpoint.url).hostname.endsWith("reddit.com")),
    false,
    "Reddit 不得偷偷依赖不可控第三方公共代理；大陆网络兼容应使用 operator relay",
  );
});

test("only an exclusive task-lock owner reconciles abandoned running rows before a new run", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-abandoned-run-"));
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-run-lock-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  const previousRunDirectory = process.env.RADAR_RUN_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  process.env.RADAR_RUN_DIR = runDirectory;
  let lockHandle;
  try {
    const { beginRun, finishRun, openDatabase } = await import("../radar/database.mjs");
    const { acquireTaskLock, reconcileAbandonedRuns } = await import("../scripts/task-lock.mjs");
    assert.equal(typeof reconcileAbandonedRuns, "function", "锁拥有者需要一个显式的遗留 run 收敛入口");
    let database = openDatabase();
    const abandonedId = beginRun(database, "manual", "2026-08-02T03:00:00.000Z", "deepseek");
    const completedId = beginRun(database, "manual", "2026-08-02T04:00:00.000Z", "deepseek");
    finishRun(database, completedId, {
      finishedAt: "2026-08-02T04:01:00.000Z",
      status: "success",
      fetchedCount: 1,
      acceptedCount: 1,
      skippedCount: 0,
      errorCount: 0,
      runAnalysisMode: "deepseek",
      configuredProvider: "deepseek",
      message: "completed",
    });
    database.close();

    database = openDatabase();
    assert.equal(database.prepare("SELECT status FROM runs WHERE id = ?").get(abandonedId).status, "running", "web/普通 openDatabase 不能越权收敛真实运行中的任务");
    await assert.rejects(
      reconcileAbandonedRuns({ database, lockHandle: null, finishedAt: "2026-08-02T05:00:00.000Z" }),
      /lock|锁|owner|持有/i,
      "没有独占任务锁时不得修改 running rows",
    );

    lockHandle = await acquireTaskLock();
    const first = await reconcileAbandonedRuns({
      database,
      lockHandle,
      finishedAt: "2026-08-02T05:00:00.000Z",
    });
    assert.equal(first.reconciledCount, 1);
    const reconciled = database.prepare("SELECT * FROM runs WHERE id = ?").get(abandonedId);
    assert.equal(reconciled.status, "failed");
    assert.equal(reconciled.finished_at, "2026-08-02T05:00:00.000Z");
    assert.ok(reconciled.error_count >= 1);
    assert.match(reconciled.message, /异常终止|遗留|abandon/i);
    assert.equal(database.prepare("SELECT status FROM runs WHERE id = ?").get(completedId).status, "success", "已完成 run 不能被修改");

    const second = await reconcileAbandonedRuns({
      database,
      lockHandle,
      finishedAt: "2026-08-02T05:01:00.000Z",
    });
    assert.equal(second.reconciledCount, 0, "重复收敛必须幂等");
    const newRunId = beginRun(database, "manual", "2026-08-02T05:02:00.000Z", "deepseek");
    assert.ok(newRunId > abandonedId, "生产入口应在收敛完成后再创建新 run");
    database.close();
  } finally {
    if (lockHandle) {
      const { releaseTaskLock } = await import("../scripts/task-lock.mjs");
      await releaseTaskLock(lockHandle);
    }
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    if (previousRunDirectory === undefined) delete process.env.RADAR_RUN_DIR;
    else process.env.RADAR_RUN_DIR = previousRunDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test("pipeline persists degraded source health, counts it as available, and marks the run partial", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-degraded-source-"));
  const previous = Object.fromEntries([
    "RADAR_DATA_DIR",
    "RADAR_AI_PROVIDER",
    "RADAR_DISABLE_AI",
    "RADAR_SOURCE_CONCURRENCY",
    "RADAR_FETCH_CONCURRENCY",
    "RADAR_FETCH_RELAY_TEMPLATE",
  ].map((key) => [key, process.env[key]]));
  process.env.RADAR_DATA_DIR = dataDirectory;
  process.env.RADAR_AI_PROVIDER = "rules";
  process.env.RADAR_DISABLE_AI = "1";
  process.env.RADAR_SOURCE_CONCURRENCY = "1";
  process.env.RADAR_FETCH_CONCURRENCY = "1";
  delete process.env.RADAR_FETCH_RELAY_TEMPLATE;
  try {
    const { loadSourceCatalog } = await import("../radar/catalog.mjs");
    const sources = await loadSourceCatalog();
    const target = sources.find((source) => source.id === "claude-code-changelog");
    assert.ok(target?.fallbacks?.length, "pipeline 测试依赖内置 Claude 官方 fallback");
    const fallbackUrl = target.fallbacks[0].url;
    const primaryKinds = new Map(sources.map((source) => [source.url, source]));

    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.startsWith(target.url)) return new Response("primary unavailable", { status: 503 });
      if (url.startsWith(fallbackUrl)) {
        return new Response(staleFeed("Claude fallback"), { status: 200, headers: { "content-type": "application/rss+xml" } });
      }
      const source = primaryKinds.get(url);
      if (source?.kind === "json") {
        const body = staleJsonBody(source);
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(staleFeed(), { status: 200, headers: { "content-type": "application/rss+xml" } });
    };

    const { runIngestion } = await import("../radar/pipeline.mjs");
    const result = await runIngestion({
      trigger: "test",
      logger: { info() {}, warn() {}, error() {} },
      fetchOptions: trustedFetchOptions(fetchImpl),
    });
    assert.equal(result.status, "partial", "fallback success 仍须把本轮标为 partial，向运维暴露主端点退化");
    assert.equal(result.degradedSourceCount, 1, "运行汇总必须单独暴露 degraded 数量");
    assert.equal(result.snapshot.degradedSourceCount, 1, "网站状态快照也必须暴露 degraded 数量");
    assert.equal(result.snapshot.healthySourceCount, sources.length - 1, "healthy 只能统计 direct success，不能把备用链路伪装成主链路健康");
    assert.equal(result.snapshot.availableSourceCount, sources.length, "available 必须统计 direct success + degraded，单独表达实际可用性");

    const { openDatabase } = await import("../radar/database.mjs");
    const database = openDatabase();
    try {
      const health = database.prepare("SELECT * FROM source_health WHERE source_id = ?").get(target.id);
      assert.equal(health.last_status, "degraded");
      assert.ok(health.last_success_at, "fallback 成功仍是一次可用采集，必须刷新 last_success_at");
      assert.match(health.last_error, /primary|code\.claude\.com|HTTP 503/i, "source_health 必须保存可诊断的主端点失败信息");
    } finally {
      database.close();
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("an expired degraded success is delayed rather than counted as currently available", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-radar-stale-degraded-"));
  const previousDataDirectory = process.env.RADAR_DATA_DIR;
  process.env.RADAR_DATA_DIR = dataDirectory;
  try {
    const { openDatabase, updateSourceHealth, upsertSourceCatalog } = await import("../radar/database.mjs");
    const { buildSnapshot } = await import("../radar/snapshot.mjs");
    const database = openDatabase();
    try {
      const source = sourceFixture();
      upsertSourceCatalog(database, [source]);
      updateSourceHealth(database, source, {
        attemptedAt: "2026-01-01T00:00:00.000Z",
        status: "degraded",
        error: "primary[0] primary.example/feed.xml [ETIMEDOUT] fetch failed",
        itemCount: 0,
      });
      const snapshot = await buildSnapshot(database);
      assert.equal(snapshot.sources[0].status, "延迟");
      assert.equal(snapshot.status.healthySourceCount, 0);
      assert.equal(snapshot.status.degradedSourceCount, 0);
      assert.equal(snapshot.status.availableSourceCount, 0);
    } finally {
      database.close();
    }
  } finally {
    if (previousDataDirectory === undefined) delete process.env.RADAR_DATA_DIR;
    else process.env.RADAR_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
