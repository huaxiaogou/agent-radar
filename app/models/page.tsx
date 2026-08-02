import type { Metadata } from "next";
import { AppShell } from "../components/AppShell";
import {
  capabilityRubric,
  capabilityBandLabels,
  formatContext,
  formatTokenPrice,
  modelDataVerifiedAt,
  modelRecords,
  resolveActiveRadarModelId,
  resolveModelPrice,
  type CapabilityBand,
} from "../lib/model-data";
import type { ModelLandscapePoint, ModelPulse } from "../lib/radar-data";
import { getRadarSnapshot } from "../lib/radar-store";
import { ModelLandscapeChart, type LandscapePlotModel } from "./ModelLandscapeChart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "模型坐标",
  description: "按编程能力、日常能力、上下文、价格与近期讨论观察主流模型，不做单一总排行。",
};

function priceCell(price: ReturnType<typeof resolveModelPrice>, kind: "input" | "output") {
  const value = price[kind];
  const standard = kind === "input" ? price.standardInput : price.standardOutput;
  return (
    <span className="price-cell">
      <b>{formatTokenPrice(value)}</b>
      {price.isPromotion && standard !== undefined && <small>标准 {formatTokenPrice(standard)}</small>}
    </span>
  );
}

function capabilityLabel(value: CapabilityBand) {
  return `${capabilityBandLabels[value]} · ${value}/5`;
}

function emptyPulse(modelId: string): ModelPulse {
  const empty = { total: 0, official: 0, practitioner: 0, community: 0 };
  return { modelId, windows: { days7: empty, days30: empty }, sources: [] };
}

function formattedTime(value: string | null) {
  if (!value) return "等待首次采集";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const landscape = { left: 112, right: 1518, top: 74, bottom: 710 };
const providerPalette = ["#27323b", "#bc684b", "#339466", "#315fc3", "#8a55a7", "#d08a23", "#167f89", "#d24c68", "#6b7f2a", "#825f49", "#526cc7", "#a4422a", "#477281", "#8a6d1f"];
const fixedProviderColors: Record<string, string> = {
  OpenAI: "#27323b", Anthropic: "#bc684b", Google: "#339466", DeepSeek: "#315fc3",
  SpaceXAI: "#526cc7", Alibaba: "#d08a23", Meta: "#167f89", Mistral: "#8a55a7",
  Amazon: "#c47728", Kimi: "#6b7f2a", NVIDIA: "#825f49", Xiaomi: "#a4422a", Arcee: "#477281",
};

function logTicks(minimum: number, maximum: number) {
  const candidates = [0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10];
  return candidates.filter((value) => value >= minimum && value <= maximum);
}

function costLabel(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 2 : 0,
    maximumFractionDigits: value < 0.01 ? 3 : value < 1 ? 2 : 1,
  }).format(value);
}

function familyKey(model: ModelLandscapePoint) {
  return `${model.providerSlug}:${model.shortName.toLowerCase().replace(/\s*\((?:low|medium|high|max|xhigh|thinking|reasoning)[^)]*\)\s*$/i, "").trim()}`;
}

function providerShape(model: ModelLandscapePoint): LandscapePlotModel["shape"] {
  if (model.isOpenWeights) return "diamond";
  if (model.isReasoning) return "circle";
  return "square";
}

export default async function ModelsPage() {
  const snapshot = await getRadarSnapshot();
  const now = new Date();
  const activeRadarModelId = resolveActiveRadarModelId({
    provider: process.env.RADAR_AI_PROVIDER,
    deepseekModel: process.env.RADAR_DEEPSEEK_MODEL,
    openaiModel: process.env.RADAR_OPENAI_MODEL,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    disableAi: process.env.RADAR_DISABLE_AI === "1",
    disableOpenAI: process.env.RADAR_DISABLE_OPENAI === "1",
  });
  const pulseByModel = new Map(snapshot.modelPulses.map((pulse) => [pulse.modelId, pulse]));
  const displayModels = modelRecords.map((model) => ({
    ...model,
    effectivePrice: resolveModelPrice(model.price, now),
    pulse: pulseByModel.get(model.id) || emptyPulse(model.id),
  }));
  const sonnetPrice = displayModels.find((model) => model.id === "claude-sonnet-5")?.effectivePrice;
  const verifiedDate = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(modelDataVerifiedAt));
  const pulseAt = snapshot.status.lastSuccessfulAt;
  const marketModels = snapshot.modelLandscape.models;
  const costs = marketModels.map((model) => model.costPerTask);
  const codingScores = marketModels.map((model) => model.codingIndex);
  const intelligenceScores = marketModels.map((model) => model.intelligenceIndex);
  const costDomain = {
    min: Math.max(0.001, (Math.min(...costs, 0.01) || 0.01) * 0.72),
    max: Math.max(1, (Math.max(...costs, 1) || 1) * 1.32),
  };
  const codingDomain = {
    min: Math.max(0, Math.floor((Math.min(...codingScores, 0) || 0) / 10) * 10),
    max: Math.max(10, Math.ceil((Math.max(...codingScores, 10) || 10) / 10) * 10),
  };
  const intelligenceDomain = {
    min: Math.min(...intelligenceScores, 0) || 0,
    max: Math.max(...intelligenceScores, 1) || 1,
  };
  const xForCost = (value: number) => {
    const ratio = (Math.log(value) - Math.log(costDomain.min)) / (Math.log(costDomain.max) - Math.log(costDomain.min));
    return landscape.left + Math.max(0, Math.min(1, ratio)) * (landscape.right - landscape.left);
  };
  const yForCoding = (value: number) => landscape.bottom -
    ((value - codingDomain.min) / (codingDomain.max - codingDomain.min)) * (landscape.bottom - landscape.top);
  const radiusForIntelligence = (value: number) => 4.5 +
    Math.max(0, Math.min(1, (value - intelligenceDomain.min) / (intelligenceDomain.max - intelligenceDomain.min || 1))) * 7.5;
  const providerCounts = [...marketModels.reduce((counts, model) => {
    counts.set(model.providerName, (counts.get(model.providerName) || 0) + 1);
    return counts;
  }, new Map<string, number>())].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const primaryProviders = providerCounts.slice(0, 13).map(([name]) => name);
  const providerColor = (name: string) => {
    if (!primaryProviders.includes(name)) return providerPalette.at(-1)!;
    if (fixedProviderColors[name]) return fixedProviderColors[name];
    const hash = [...name].reduce((total, character) => total + character.codePointAt(0)!, 0);
    return providerPalette[hash % (providerPalette.length - 1)];
  };
  const providerLegend = [
    ...primaryProviders.map((name) => ({ name, color: providerColor(name), count: providerCounts.find(([provider]) => provider === name)?.[1] || 0 })),
    ...(providerCounts.length > primaryProviders.length
      ? [{ name: "Other", color: providerPalette.at(-1)!, count: providerCounts.slice(primaryProviders.length).reduce((total, [, count]) => total + count, 0) }]
      : []),
  ];
  const plottedModels = marketModels.map((model) => ({
    ...model,
    x: xForCost(model.costPerTask),
    y: yForCoding(model.codingIndex),
    radius: radiusForIntelligence(model.intelligenceIndex),
    color: providerColor(model.providerName),
    shape: providerShape(model),
    family: familyKey(model),
    costLabel: costLabel(model.costPerTask),
  }));
  const costTicks = logTicks(costDomain.min, costDomain.max);
  const codingTicks = Array.from(
    { length: Math.floor((codingDomain.max - codingDomain.min) / 10) + 1 },
    (_, index) => codingDomain.min + index * 10,
  );
  const chartModels: LandscapePlotModel[] = plottedModels.map((model) => ({
    id: model.id,
    name: model.name,
    shortName: model.shortName,
    providerName: model.providerName,
    codingIndex: model.codingIndex,
    intelligenceIndex: model.intelligenceIndex,
    costPerTask: model.costPerTask,
    costLabel: model.costLabel,
    href: model.href,
    x: model.x,
    y: model.y,
    radius: model.radius,
    color: model.color,
    shape: model.shape,
    family: model.family,
  }));

  return (
    <AppShell active="models" status={snapshot.status}>
      <header className="page-hero model-hero">
        <div>
          <span className="mono-label">MODEL ATLAS / TWO CLOCKS, NO FAKE LEADERBOARD</span>
          <h1>模型坐标</h1>
          <p>这不是单一排行榜。能力与价格有核验日期；社区讨论脉冲随定时采集更新。两者并列观察，但讨论热度绝不充当能力分数。</p>
        </div>
        <div className="model-verification-grid">
          <div className="model-verification">
            <span>市场全景更新</span>
            <time dateTime={snapshot.modelLandscape.lastSuccessAt || undefined}>{formattedTime(snapshot.modelLandscape.lastSuccessAt)}</time>
            <small>{marketModels.length || "—"} 个动态模型</small>
          </div>
          <div className="model-verification">
            <span>精确对照核验</span>
            <time dateTime={modelDataVerifiedAt}>{verifiedDate}</time>
            <small>{displayModels.length} 个编辑核验模型</small>
          </div>
          <div className="model-verification is-pulse">
            <span>社区脉冲更新</span>
            <time dateTime={pulseAt || undefined}>{formattedTime(pulseAt)}</time>
            <small>7 日 / 30 日窗口</small>
          </div>
        </div>
      </header>

      <section className="model-atlas-section" aria-labelledby="capability-map-title">
        <div className="section-heading model-section-heading">
          <div>
            <span className="mono-label">01 / COST × CODING LANDSCAPE</span>
            <h2 id="capability-map-title">能力—成本全景</h2>
          </div>
          <p>横轴是 Intelligence Index 基准中的单任务成本，纵轴是编程指数，点面积表示通用智能指数。开源权重用菱形表示，避免只靠颜色识别。</p>
        </div>

        <div className="model-atlas-layout">
          <figure className="model-landscape-figure">
            <div className="model-landscape-key" aria-label="模型厂商图例">
              <div>
                {providerLegend.map((provider) => <span key={provider.name}><i style={{ backgroundColor: provider.color }} aria-hidden="true" />{provider.name} <small>{provider.count}</small></span>)}
              </div>
              <p><i aria-hidden="true" />点越大，通用智能指数越高</p>
            </div>
            {marketModels.length > 0 && <>
              <ModelLandscapeChart
                models={chartModels}
                bounds={landscape}
                codingTicks={codingTicks.map((score) => ({ value: score, label: String(score), position: yForCoding(score) }))}
                costTicks={costTicks.map((price) => ({ value: price, label: costLabel(price), position: xForCost(price) }))}
              />
            </>}
            <figcaption>
              数据源：<a href={snapshot.modelLandscape.sourceUrl} target="_blank" rel="noreferrer">{snapshot.modelLandscape.sourceName} ↗</a>，
              <a href={snapshot.modelLandscape.methodologyUrl} target="_blank" rel="noreferrer">指标方法 ↗</a>。
              最后成功更新 {formattedTime(snapshot.modelLandscape.lastSuccessAt)}；细实线只连接同一模型家族变体，不表示演进顺序。
              {snapshot.modelLandscape.lastError && <span className="model-landscape-warning"> 本轮失败，已保留上次快照。</span>}
            </figcaption>
            {marketModels.length > 0 && <details className="model-market-data">
              <summary>查看全部 {marketModels.length} 个模型的精确数据</summary>
              <div><table><caption>动态模型全景原始指标表</caption><thead><tr><th scope="col">模型</th><th scope="col">厂商</th><th scope="col">编程指数</th><th scope="col">通用智能指数</th><th scope="col">单任务成本</th><th scope="col">开源权重</th></tr></thead><tbody>
                {marketModels.map((model) => <tr key={`market-${model.id}`}><th scope="row"><a href={model.href} target="_blank" rel="noreferrer">{model.name} ↗</a></th><td>{model.providerName}</td><td>{model.codingIndex}</td><td>{model.intelligenceIndex}</td><td>{costLabel(model.costPerTask)}</td><td>{model.isOpenWeights ? "是" : "否"}</td></tr>)}
              </tbody></table></div>
            </details>}
            {marketModels.length === 0 && <p className="model-landscape-empty">等待首次动态模型采集；下方 8 个模型的编辑核验对照仍可使用。</p>}
          </figure>

          <aside className="evidence-boundary" aria-labelledby="evidence-boundary-title">
            <span className="mono-label">EVIDENCE BOUNDARY</span>
            <h2 id="evidence-boundary-title">证据口径</h2>
            <dl>
              <div><dt>动态全景</dt><dd>独立基准的 Coding Index、Intelligence Index 与每任务成本；随定时采集更新。</dd></div>
              <div><dt>编辑对照</dt><dd>下方 8 个重点模型的官方价格、上下文与场景判断按核验日期维护。</dd></div>
              <div><dt>能力判断</dt><dd>{capabilityRubric.coding} {capabilityRubric.everyday}</dd></div>
              <div><dt>社区脉冲</dt><dd>按模型名称匹配近期已收录来源，拆分官方、实践者和社区；它不是模型评测。</dd></div>
              <div><dt>禁止误读</dt><dd>不同 harness、工具权限、提示词和 token 预算下的成绩不可硬比较。</dd></div>
            </dl>
            <p><b>建议：</b>先按成本和场景缩小候选，再用你的真实仓库、真实工具链做并排回放。</p>
          </aside>
        </div>
      </section>

      <section className="model-table-section" aria-labelledby="model-table-title">
        <div className="section-heading model-section-heading">
          <div><span className="mono-label">02 / EXACT VALUES</span><h2 id="model-table-title">可核验对照</h2></div>
          <p>API 文本价格均为美元 / 每百万 tokens；未计缓存、批处理、区域税费与工具调用附加成本。</p>
        </div>
        <p className="table-scroll-cue" id="model-table-scroll-cue"><span aria-hidden="true">↔</span> 左右滑动查看价格、上下文、讨论与官方证据</p>
        <div className="model-table-scroll" tabIndex={0} aria-label="模型精确对比表，可横向滚动" aria-describedby="model-table-scroll-cue">
          <table className="model-table">
            <caption>主流模型编程能力、日常能力、价格、上下文、近期讨论与官方证据对比</caption>
            <thead><tr><th scope="col">模型</th><th scope="col">编程能力</th><th scope="col">日常能力</th><th scope="col">输入价</th><th scope="col">输出价</th><th scope="col">上下文</th><th scope="col">7 日 / 30 日讨论</th><th scope="col">证据</th></tr></thead>
            <tbody>
              {displayModels.map((model) => (
                <tr key={model.id}>
                  <th scope="row"><span className="model-name"><b translate="no">{model.name}</b><small translate="no">{model.provider}{activeRadarModelId === model.id ? " · 本站当前分析模型" : ""}</small></span></th>
                  <td><span className="capability-value"><b>{model.coding}</b><small>{capabilityLabel(model.coding)}</small></span></td>
                  <td><span className="capability-value"><b>{model.everyday}</b><small>{capabilityLabel(model.everyday)}</small></span></td>
                  <td>{priceCell(model.effectivePrice, "input")}</td>
                  <td>{priceCell(model.effectivePrice, "output")}</td>
                  <td><span className="context-value">{formatContext(model.contextTokens)}</span></td>
                  <td><span className="model-pulse-value"><b>{model.pulse.windows.days7.total} / {model.pulse.windows.days30.total}</b><small>官 {model.pulse.windows.days30.official} · 实 {model.pulse.windows.days30.practitioner} · 社 {model.pulse.windows.days30.community}</small></span></td>
                  <td><span className="model-source-links">{model.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={`${model.id}-${source.href}`}><b>{source.label}<span aria-hidden="true"> ↗</span></b><small>{new URL(source.href).hostname}</small><span className="sr-only">（在新窗口打开）</span></a>)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="promotion-note">{sonnetPrice?.isPromotion ? "Claude Sonnet 5 当前展示 2026-08-31 前限时价；表内同时保留标准价。" : "Claude Sonnet 5 限时价已结束；当前自动展示标准价。"} DeepSeek 输入价统一采用缓存未命中口径。</p>
      </section>

      <section className="model-notes-section" aria-labelledby="model-notes-title">
        <div className="section-heading model-section-heading">
          <div><span className="mono-label">03 / FIELD NOTES</span><h2 id="model-notes-title">场景读法</h2></div>
          <p>这些判断用于设计验证任务，不替代你自己的质量、时延和失败率数据。</p>
        </div>
        <div className="model-note-grid">
          {displayModels.map((model) => (
            <article key={model.id} className={activeRadarModelId === model.id ? "model-note is-current" : "model-note"}>
              <header><span translate="no">{model.provider}</span>{activeRadarModelId === model.id && <b>RADAR ACTIVE</b>}</header>
              <h3 translate="no">{model.name}</h3>
              <dl>
                <div><dt>编程档依据</dt><dd>{model.assessment.codingRationale}</dd></div>
                <div><dt>日常档依据</dt><dd>{model.assessment.everydayRationale}</dd></div>
                <div><dt>适配观察</dt><dd>{model.fit}</dd></div>
                <div><dt>验证前提</dt><dd>{model.tradeoff}</dd></div>
              </dl>
              {model.pulse.sources.length > 0 && <div className="model-pulse-links"><span>近期相关原文</span>{model.pulse.sources.slice(0, 3).map((source) => <a href={source.href} target="_blank" rel="noreferrer" lang={source.language === "zh" ? "zh-CN" : "en"} key={source.href}><span>{source.originalTitle || source.name}<span aria-hidden="true"> ↗</span></span><small>{new URL(source.href).hostname}</small><span className="sr-only">（在新窗口打开）</span></a>)}</div>}
              <footer className="model-assessment-meta">
                <time dateTime={model.assessment.evaluatedAt}>编辑判断 · {verifiedDate}</time>
                <a className="model-assessment-source" href={model.assessment.evidenceHref} target="_blank" rel="noreferrer">官方定位 · {new URL(model.assessment.evidenceHref).hostname}<span aria-hidden="true"> ↗</span><span className="sr-only">（在新窗口打开）</span></a>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
