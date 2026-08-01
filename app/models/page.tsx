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
import type { ModelPulse } from "../lib/radar-data";
import { getRadarSnapshot } from "../lib/radar-store";

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

const landscape = { left: 92, right: 936, top: 98, bottom: 472 };
const outputPriceTicks = [0.25, 0.5, 1, 2, 5, 10, 20, 50];
const outputPriceDomain = { min: 0.2, max: 64 };
const providerLegend = [
  { name: "OpenAI", className: "provider-openai" },
  { name: "Anthropic", className: "provider-anthropic" },
  { name: "Google", className: "provider-google" },
  { name: "DeepSeek", className: "provider-deepseek" },
] as const;
const modelLabelOffsets: Record<string, { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  "gpt-5-6-sol": { dx: 0, dy: 62, anchor: "middle" },
  "gpt-5-6-terra": { dx: 13, dy: 31, anchor: "start" },
  "claude-fable-5": { dx: -8, dy: -48, anchor: "end" },
  "claude-opus-5": { dx: -18, dy: -20, anchor: "end" },
  "claude-sonnet-5": { dx: 12, dy: 32, anchor: "start" },
  "gemini-3-6-flash": { dx: -13, dy: -16, anchor: "end" },
  "deepseek-v4-pro": { dx: 13, dy: -16, anchor: "start" },
  "deepseek-v4-flash": { dx: 13, dy: -16, anchor: "start" },
};

function outputPriceX(value: number) {
  const ratio = (Math.log(value) - Math.log(outputPriceDomain.min)) /
    (Math.log(outputPriceDomain.max) - Math.log(outputPriceDomain.min));
  return landscape.left + Math.max(0, Math.min(1, ratio)) * (landscape.right - landscape.left);
}

function codingBandY(value: CapabilityBand) {
  return landscape.bottom - ((value - 1) / 4) * (landscape.bottom - landscape.top);
}

function everydayRadius(value: CapabilityBand) {
  return 4.5 + value * 1.45;
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
  const plottedModels = displayModels.map((model) => ({
    ...model,
    x: outputPriceX(model.effectivePrice.output),
    y: codingBandY(model.coding),
    radius: everydayRadius(model.everyday),
    providerClass: `provider-${model.provider.toLowerCase()}`,
    label: modelLabelOffsets[model.id],
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
            <span>能力 / 价格核验</span>
            <time dateTime={modelDataVerifiedAt}>{verifiedDate}</time>
            <small>{displayModels.length} 个当前模型</small>
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
          <p>横轴是输出价格的对数刻度，纵轴是编程能力档，圆点大小表示日常能力档；所有模型使用同一口径，不突出某个厂商。</p>
        </div>

        <div className="model-atlas-layout">
          <figure className="model-landscape-figure">
            <div className="model-landscape-key" aria-label="模型厂商图例">
              <div>
                {providerLegend.map((provider) => <span key={provider.name}><i className={provider.className} aria-hidden="true" />{provider.name}</span>)}
              </div>
              <p><i aria-hidden="true" />圆点越大，日常能力档越高</p>
            </div>
            <p className="model-landscape-scroll-cue"><span aria-hidden="true">↔</span> 横向滑动查看完整模型分布</p>
            <div className="model-landscape-scroll" tabIndex={0} aria-label="模型能力成本全景图，可横向滚动">
              <svg className="model-landscape-plot" viewBox="0 0 1000 548" role="img" aria-labelledby="model-landscape-title model-landscape-description">
                <title id="model-landscape-title">主流模型能力—成本全景</title>
                <desc id="model-landscape-description">横轴为每百万输出 tokens 的美元价格，对数刻度；纵轴为编程能力一至五档；圆点大小为日常能力档；颜色区分厂商。</desc>
                <g className="model-chart-grid" aria-hidden="true">
                  {([1, 2, 3, 4, 5] as CapabilityBand[]).map((band) => {
                    const y = codingBandY(band);
                    return <g key={band}><line x1={landscape.left} x2={landscape.right} y1={y} y2={y} /><text x={landscape.left - 14} y={y + 4} textAnchor="end">{band} · {capabilityBandLabels[band]}</text></g>;
                  })}
                  {outputPriceTicks.map((price) => {
                    const x = outputPriceX(price);
                    return <g key={price}><line x1={x} x2={x} y1={landscape.top} y2={landscape.bottom} /><text x={x} y={landscape.bottom + 28} textAnchor="middle">${price}</text></g>;
                  })}
                </g>
                <g className="model-chart-axes" aria-hidden="true">
                  <line x1={landscape.left} x2={landscape.left} y1={landscape.top} y2={landscape.bottom} />
                  <line x1={landscape.left} x2={landscape.right} y1={landscape.bottom} y2={landscape.bottom} />
                  <text x={(landscape.left + landscape.right) / 2} y="532" textAnchor="middle">输出价格 / 百万 tokens（USD，对数刻度）</text>
                  <text transform="rotate(-90 22 285)" x="22" y="285" textAnchor="middle">编程能力档</text>
                </g>
                <g className="model-provider-lines" aria-hidden="true">
                  {providerLegend.map((provider) => {
                    const points = plottedModels.filter((model) => model.provider === provider.name).sort((left, right) => left.x - right.x);
                    if (points.length < 2) return null;
                    return <polyline className={provider.className} points={points.map((point) => `${point.x},${point.y}`).join(" ")} key={provider.name} />;
                  })}
                </g>
                <g className="model-market-points">
                  {plottedModels.map((model) => (
                    <g
                      className={`model-market-point ${model.providerClass}`}
                      data-model-id={model.id}
                      data-provider={model.provider}
                      role="img"
                      aria-label={`${model.name}：编程 ${model.coding}/5，日常 ${model.everyday}/5，输出 ${formatTokenPrice(model.effectivePrice.output)} / 百万 tokens`}
                      key={model.id}
                    >
                      <circle cx={model.x} cy={model.y} r={model.radius} />
                      <text x={model.x + model.label.dx} y={model.y + model.label.dy} textAnchor={model.label.anchor}>
                        <tspan className="model-market-name" lang="en">{model.name}</tspan>
                        <tspan className="model-market-meta" x={model.x + model.label.dx} dy="15">编 {model.coding}/5 · 日 {model.everyday}/5 · {formatTokenPrice(model.effectivePrice.output)}</tspan>
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
            </div>
            <figcaption>细实线仅连接同厂商的当前产品线，不表示演进顺序。这里使用可核验的 API 输出价格，不虚构统一 token 预算下的“单任务成本”；精确输入价、上下文和近期讨论见下表。</figcaption>
          </figure>

          <aside className="evidence-boundary" aria-labelledby="evidence-boundary-title">
            <span className="mono-label">EVIDENCE BOUNDARY</span>
            <h2 id="evidence-boundary-title">证据口径</h2>
            <dl>
              <div><dt>官方事实</dt><dd>模型名称、上下文窗口、公开价格与促销期限来自厂商页面。</dd></div>
              <div><dt>编程能力档</dt><dd>{capabilityRubric.coding}</dd></div>
              <div><dt>日常能力档</dt><dd>{capabilityRubric.everyday}</dd></div>
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
