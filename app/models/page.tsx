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

function CapabilityMeter({ value, label }: { value: CapabilityBand; label: string }) {
  return (
    <div className="capability-meter" aria-label={`${label} ${value}/5，${capabilityBandLabels[value]}`}>
      <span>{label}</span>
      <div aria-hidden="true">{[1, 2, 3, 4, 5].map((band) => <i className={band <= value ? "is-filled" : ""} key={band} />)}</div>
      <b>{value}/5</b>
    </div>
  );
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
            <span className="mono-label">01 / CAPABILITY TELEMETRY RAIL</span>
            <h2 id="capability-map-title">全称能力轨道</h2>
          </div>
          <p>每个模型完整显示名称、两个能力档、输出价格和讨论脉冲；1–5 只是选型起点，不可跨厂商直接相减。</p>
        </div>

        <div className="model-atlas-layout">
          <figure className="model-rail-figure" aria-label="模型完整名称、编程能力、日常能力、输出价格与社区讨论脉冲">
            <div className="model-rail-head" aria-hidden="true">
              <span>模型</span><span>能力轨道</span><span>成本</span><span>讨论脉冲</span>
            </div>
            <div className="model-rails">
              {displayModels.map((model) => (
                <article className={`model-rail provider-${model.provider.toLowerCase()}${activeRadarModelId === model.id ? " is-current" : ""}`} key={model.id}>
                  <header>
                    <small translate="no">{model.provider}</small>
                    <h3 translate="no">{model.name}</h3>
                    {activeRadarModelId === model.id && <b>本站分析模型</b>}
                  </header>
                  <div className="model-capability-pair">
                    <CapabilityMeter value={model.coding} label="编程" />
                    <CapabilityMeter value={model.everyday} label="日常" />
                  </div>
                  <div className="model-rail-cost">
                    <small>输出 / 百万 tokens</small>
                    <b>{formatTokenPrice(model.effectivePrice.output)}</b>
                    <span>输入 {formatTokenPrice(model.effectivePrice.input)}</span>
                  </div>
                  <div className="model-pulse-cell">
                    <span><b>{model.pulse.windows.days7.total}</b><small>近 7 日</small></span>
                    <span><b>{model.pulse.windows.days30.total}</b><small>近 30 日</small></span>
                    <i aria-label={`30 日证据：官方 ${model.pulse.windows.days30.official}，实践者 ${model.pulse.windows.days30.practitioner}，社区 ${model.pulse.windows.days30.community}`}>
                      官 {model.pulse.windows.days30.official} · 实 {model.pulse.windows.days30.practitioner} · 社 {model.pulse.windows.days30.community}
                    </i>
                  </div>
                </article>
              ))}
            </div>
            <figcaption>左侧是带核验日期的编辑档位；右侧是四小时采集生成的讨论计数。脉冲只说明被讨论，不说明更强。</figcaption>
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
