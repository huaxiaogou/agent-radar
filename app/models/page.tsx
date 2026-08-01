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
  resolveCapabilityCellLayout,
  resolveModelPrice,
  type CapabilityBand,
} from "../lib/model-data";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "模型坐标",
  description: "按编程能力、日常能力、上下文与价格观察主流模型，不做单一总排行。",
};

const bands: CapabilityBand[] = [1, 2, 3, 4, 5];
const codingBands: CapabilityBand[] = [5, 4, 3, 2, 1];

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
  const displayModels = modelRecords.map((model) => ({ ...model, effectivePrice: resolveModelPrice(model.price, now) }));
  const sonnetPrice = displayModels.find((model) => model.id === "claude-sonnet-5")?.effectivePrice;
  const verifiedDate = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(modelDataVerifiedAt));

  return (
    <AppShell active="models" status={snapshot.status}>
      <header className="page-hero model-hero">
        <div>
          <span className="mono-label">MODEL ATLAS / EVIDENCE BEFORE RANK</span>
          <h1>模型坐标</h1>
          <p>能力不是一个总分。这里把编程能力、日常能力、上下文与价格拆开观察，不做单一总排行。</p>
        </div>
        <div className="model-verification">
          <span>DATA VERIFIED</span>
          <time dateTime={modelDataVerifiedAt}>{verifiedDate}</time>
          <small>{displayModels.length} 个当前模型</small>
        </div>
      </header>

      <section className="model-atlas-section" aria-labelledby="capability-map-title">
        <div className="section-heading model-section-heading">
          <div>
            <span className="mono-label">01 / DIRECTIONAL FIT</span>
            <h2 id="capability-map-title">能力坐标，不是统一基准分数</h2>
          </div>
          <p>1–5 是 Radar 对使用场景的方向性适配带；相邻档位只代表选型起点，不代表可跨厂商直接相减。</p>
        </div>

        <div className="model-atlas-layout">
          <figure className="capability-figure" aria-label="模型编程能力、日常能力与成本坐标图">
            <div className="capability-chart">
              <div className="capability-y-title">编程能力 <span aria-hidden="true">↑</span></div>
              <div className="capability-y-scale" aria-hidden="true">
                {codingBands.map((band) => <span key={band}>{band}</span>)}
              </div>
              <div className="capability-grid" aria-hidden="true">
                {codingBands.flatMap((coding) => bands.map((everyday) => {
                  const records = displayModels.filter((model) => model.coding === coding && model.everyday === everyday);
                  const { visibleRecords, overflowCount } = resolveCapabilityCellLayout(records);
                  return (
                    <div className="capability-cell" key={`${coding}-${everyday}`}>
                      {visibleRecords.map((model) => (
                        <span className={`model-marker cost-${model.costBand.length}`} key={model.id} title={`${model.name}；输入 ${formatTokenPrice(model.effectivePrice.input)} / 输出 ${formatTokenPrice(model.effectivePrice.output)}`}>
                          <b translate="no">{model.code}</b><i>{model.costBand}</i>
                        </span>
                      ))}
                      {overflowCount > 0 && <span className="model-marker density-marker" title={records.slice(2).map((model) => model.name).join("、")}><b>+{overflowCount}</b><i>见表</i></span>}
                    </div>
                  );
                }))}
              </div>
              <div className="capability-x-scale" aria-hidden="true">
                {bands.map((band) => <span key={band}>{band}</span>)}
              </div>
              <div className="capability-x-title">日常能力 <span aria-hidden="true">→</span></div>
            </div>
            <figcaption>
              <span><i className="cost-symbol cost-1">$</i> 输出价低于 $8</span>
              <span><i className="cost-symbol cost-2">$$</i> 输出价 $8–$30</span>
              <span><i className="cost-symbol cost-3">$$$</i> 输出价高于 $30</span>
              <small>点位文字是模型代号，符号数量编码输出成本，因此状态不只依赖颜色。</small>
            </figcaption>
          </figure>

          <aside className="evidence-boundary" aria-labelledby="evidence-boundary-title">
            <span className="mono-label">EVIDENCE BOUNDARY</span>
            <h2 id="evidence-boundary-title">证据口径</h2>
            <dl>
              <div><dt>官方事实</dt><dd>模型名称、上下文窗口、公开价格与促销期限来自厂商页面。</dd></div>
              <div><dt>编程能力档</dt><dd>{capabilityRubric.coding}</dd></div>
              <div><dt>日常能力档</dt><dd>{capabilityRubric.everyday}</dd></div>
              <div><dt>Radar 编辑判断</dt><dd>1–5 档综合厂商定位与工程场景形成，未在统一 harness 下实测，不是厂商声明或 benchmark。</dd></div>
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
        <p className="table-scroll-cue" id="model-table-scroll-cue"><span aria-hidden="true">↔</span> 左右滑动查看价格、上下文与官方证据</p>
        <div className="model-table-scroll" tabIndex={0} aria-label="模型精确对比表，可横向滚动" aria-describedby="model-table-scroll-cue">
          <table className="model-table">
            <caption>主流模型编程能力、日常能力、输入价、输出价、上下文与官方证据对比</caption>
            <thead><tr><th scope="col">模型</th><th scope="col">编程能力</th><th scope="col">日常能力</th><th scope="col">输入价</th><th scope="col">输出价</th><th scope="col">上下文</th><th scope="col">证据</th></tr></thead>
            <tbody>
              {displayModels.map((model) => (
                <tr key={model.id}>
                  <th scope="row"><span className="model-name"><b translate="no">{model.name}</b><small translate="no">{model.provider}{activeRadarModelId === model.id ? " · 本站当前分析模型" : ""}</small></span></th>
                  <td><span className="capability-value"><b>{model.coding}</b><small>{capabilityLabel(model.coding)}</small></span></td>
                  <td><span className="capability-value"><b>{model.everyday}</b><small>{capabilityLabel(model.everyday)}</small></span></td>
                  <td>{priceCell(model.effectivePrice, "input")}</td>
                  <td>{priceCell(model.effectivePrice, "output")}</td>
                  <td><span className="context-value">{formatContext(model.contextTokens)}</span></td>
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
              <header><span translate="no">{model.code}</span><small translate="no">{model.provider}</small>{activeRadarModelId === model.id && <b>RADAR ACTIVE</b>}</header>
              <h3 translate="no">{model.name}</h3>
              <dl>
                <div><dt>编程档依据</dt><dd>{model.assessment.codingRationale}</dd></div>
                <div><dt>日常档依据</dt><dd>{model.assessment.everydayRationale}</dd></div>
                <div><dt>适配观察</dt><dd>{model.fit}</dd></div>
                <div><dt>验证前提</dt><dd>{model.tradeoff}</dd></div>
              </dl>
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
