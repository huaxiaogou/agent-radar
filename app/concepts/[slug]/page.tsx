import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "../../components/AppShell";
import type { CandidateConcept, ConceptCitation, ConceptClaim, ConceptEvidence, ConceptRevision, RadarStatus } from "../../lib/radar-data";
import { getRadarSnapshot } from "../../lib/radar-store";

export const dynamic = "force-dynamic";

const toc = [
  ["three-minute", "三分钟理解"], ["definition", "精确定义与边界"], ["origin", "起源与演化"],
  ["why-now", "为什么现在重要"], ["mechanism", "核心机制"], ["patterns", "工程实现模式"],
  ["applicability", "适用与不适用"], ["failure-modes", "失败模式与反模式"],
  ["controversies", "争议与不同观点"], ["evidence", "证据与原始链接"],
  ["recent-changes", "最近变化"], ["revisions", "修订记录"],
] as const;

const relationLabels: Record<string, string> = {
  "depends-on": "依赖",
  enables: "促成",
  implements: "实现",
  extends: "扩展",
  complements: "互补",
  "conflicts-with": "冲突",
  supersedes: "取代",
  "constrained-by": "约束于",
  operationalizes: "工程化",
  "often-confused-with": "易混淆",
};

function safeHostname(href: string) {
  try { return new URL(href).hostname; } catch { return href; }
}

function isSafeEvidenceUrl(href: string) {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "时间待回溯";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function DossierSection({ id, number, title, note, children }: { id: string; number: string; title: string; note: string; children: ReactNode }) {
  return <section className="knowledge-section" id={id}><header><span>{number}</span><div><h2>{title}</h2><p>{note}</p></div></header><div className="knowledge-section-body">{children}</div></section>;
}

function TextList({ items, empty }: { items?: string[]; empty?: string }) {
  if (!items?.length) return empty ? <p className="muted-note">{empty}</p> : null;
  return <ul className="knowledge-list">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
}

function ClaimLedger({ claims, evidence }: { claims: ConceptClaim[]; evidence: ConceptEvidence[] }) {
  if (!claims.length) return null;
  const evidenceByUrl = new Map(evidence.map((item) => [item.url, item]));
  const claimRows = claims.map((claim) => ({
    claim,
    evidenceUrls: [...new Set(claim.evidenceUrls)].filter(isSafeEvidenceUrl),
  }));
  return <div className="claim-ledger" data-concept-evidence-ledger><h3>关键主张与证据绑定</h3>{claimRows.map(({ claim, evidenceUrls }) => {
    return <div className="claim-ledger-entry" data-claim-key={claim.key} key={claim.key}><div><span>{claim.kind}</span><b>{Math.round(claim.confidence * 100)}% 置信</b></div><p>{claim.text}</p>{evidenceUrls.length ? <div className="claim-evidence-links" aria-label="支持该主张的原始证据">{evidenceUrls.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{evidenceByUrl.get(url)?.originalTitle?.trim() || safeHostname(url)} <span aria-hidden="true">↗</span></a>)}</div> : <small>证据绑定待恢复</small>}</div>;
  })}</div>;
}

function FieldCitations({ fields, citations, evidence }: { fields: string[]; citations: ConceptCitation[]; evidence: ConceptEvidence[] }) {
  const evidenceByUrl = new Map(evidence.map((item) => [item.url, item]));
  const urls = [...new Set(citations.filter((item) => fields.includes(item.field)).flatMap((item) => item.evidenceUrls))];
  if (!urls.length) return null;
  return (
    <div className="field-citations" aria-label="本节原始证据">
      <span>原始证据</span>
      {urls.map((url, index) => (
        <a href={url} target="_blank" rel="noreferrer" key={url}>
          [{index + 1}] {evidenceByUrl.get(url)?.originalTitle || safeHostname(url)} ↗
        </a>
      ))}
    </div>
  );
}

function stageLabel(stage?: string) {
  if (!stage) return "待回溯";
  return stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase();
}

function revisionValue(value: unknown) {
  if (value == null || value === "") return "无";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function RevisionEntry({ revision }: { revision: ConceptRevision }) {
  const differences = Object.entries(revision.fieldDiff || {});
  return (
    <article>
      <div>
        <span>REV {String(revision.revision).padStart(2, "0")}</span>
        <b>{formatDate(revision.analyzedAt || revision.createdAt)}</b>
        <small>{revision.previousRevision ? `基于 REV ${String(revision.previousRevision).padStart(2, "0")}` : "初始版本"}</small>
      </div>
      <div className="revision-ledger-summary">
        <h3>{revision.changeReason || revision.reason || "修订原因待记录"}</h3>
        <p>{revision.materialChange === false ? "证据补充" : "实质修订"} · 置信度 {Math.round(Number(revision.confidence || 0) * 100)}%</p>
        {differences.length > 0 && <dl>{differences.map(([field, diff]) => <div key={field}><dt>{field}</dt><dd><del>{revisionValue(diff.before)}</del><span aria-hidden="true">→</span><ins>{revisionValue(diff.after)}</ins></dd></div>)}</dl>}
      </div>
      <div className="revision-ledger-review">
        <p>{revision.provider}{revision.model ? ` · ${revision.model}` : ""}</p>
        {revision.needsReview ? <strong>需要复核</strong> : <span>自动门禁通过</span>}
        {Boolean(revision.reviewReasons?.length) && <small>{revision.reviewReasons?.join("；")}</small>}
        {Boolean(revision.delta?.categories?.length) && <small>变化类型：{revision.delta?.categories?.join(" · ")}</small>}
      </div>
    </article>
  );
}

function candidateLayerLabel(layer: string) {
  if (layer === "official") return "官方";
  if (layer === "practitioner") return "实践者";
  return "社区";
}

function candidateCriterionStatus(status: "ready" | "missing" | "review") {
  if (status === "ready") return "已具备";
  if (status === "missing") return "待补齐";
  return "待确认";
}

function CandidateDossier({ candidate, status }: { candidate: CandidateConcept; status: RadarStatus }) {
  const latestRevision = candidate.latestRevision || candidate.revisions?.[0];
  const evidenceLayers = candidate.evidenceLayers?.length
    ? candidate.evidenceLayers
    : [...new Set(candidate.sources.map((source) => source.layer))];
  const independentSourceGroups = Number(candidate.independentSourceGroups || new Set(
    candidate.sources.map((source) => source.independentGroup).filter(Boolean),
  ).size);
  return (
    <AppShell active="concepts" status={status}>
      <div className="candidate-dossier" data-concept-stage="candidate">
        <nav className="breadcrumb" aria-label="面包屑"><Link href="/concepts">Concepts</Link><span>/</span><span>{candidate.name}</span></nav>
        <header className="candidate-dossier-title">
          <div><span className="mono-label">DISCOVERY DOSSIER / NOT YET CANONICAL</span><h1>{candidate.name}</h1><p>{candidate.definition || "这是一个正在核验独立工程含义的概念候选；当前内容只陈述已经绑定的原始证据。"}</p>{Boolean(candidate.aliases?.length) && <small>别名：{candidate.aliases?.join(" · ")}</small>}</div>
          <dl aria-label="候选概念状态"><div><dt>生命周期</dt><dd>Candidate · 候选</dd></div><div><dt>证据广度</dt><dd>{independentSourceGroups} 个独立来源</dd></div><div><dt>热度 / 成熟度</dt><dd>{Math.round(Number(candidate.heat || 0))} / {Math.round(Number(candidate.maturity || 0))}</dd></div></dl>
        </header>

        <section className="candidate-dossier-section" aria-labelledby="candidate-boundary-title">
          <header><span>01</span><div><h2 id="candidate-boundary-title">当前认识与边界</h2><p>候选不会因为讨论热度自动晋级。</p></div></header>
          <div className="candidate-boundary-grid"><article><h3>当前定义</h3><p>{candidate.definition || "稳定定义仍待补齐。"}</p></article><article><h3>它不是什么</h3><p>{candidate.nonDefinition || "与相近概念的非定义边界仍待确认。"}</p></article><article><h3>待解决问题</h3><p>{candidate.problem || "工程问题边界仍待更多来源核验。"}</p></article><article><h3>当前机制</h3><p>{candidate.mechanism || "当前证据尚不足以形成稳定机制说明。"}</p></article></div>
        </section>

        <section className="candidate-dossier-section" aria-labelledby="candidate-promotion-title">
          <header><span>02</span><div><h2 id="candidate-promotion-title">晋级检查面</h2><p>四项条件分别计算，不用文章数量代替知识成熟度。</p></div></header>
          <div className="candidate-promotion-grid">{(candidate.promotionCriteria || []).map((criterion) => <article data-promotion-status={criterion.status} key={criterion.key}><span>{candidateCriterionStatus(criterion.status)}</span><h3>{criterion.label}</h3><p>{criterion.detail}</p></article>)}</div>
        </section>

        <section className="candidate-dossier-section" aria-labelledby="candidate-evidence-title">
          <header><span>03</span><div><h2 id="candidate-evidence-title">当前证据</h2><p>{evidenceLayers.map(candidateLayerLabel).join(" · ") || "证据层待建立"} · {independentSourceGroups} 个独立来源</p></div></header>
          <div className="candidate-evidence-list">{candidate.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><span>{candidateLayerLabel(source.layer)} · {source.name}</span><b>{source.originalTitle || source.name}</b><small>{formatDate(source.publishedAt)} · {safeHostname(source.href)}</small><i aria-hidden="true">↗</i></a>)}</div>
        </section>

        <section className="candidate-dossier-section" aria-labelledby="candidate-revision-title">
          <header><span>04</span><div><h2 id="candidate-revision-title">最近修订</h2><p>保留权威分析原因，不把候选静默覆盖成正式知识。</p></div></header>
          {latestRevision ? <div className="candidate-latest-revision"><span>REV {String(latestRevision.revision).padStart(2, "0")}</span><h3>{latestRevision.changeReason || latestRevision.reason || "最近分析"}</h3><p>最近分析：{formatDate(latestRevision.analyzedAt || latestRevision.createdAt)} · {latestRevision.provider}{latestRevision.model ? ` · ${latestRevision.model}` : ""}</p>{Boolean(latestRevision.reviewReasons?.length) && <small>{latestRevision.reviewReasons?.join("；")}</small>}</div> : <p className="muted-note">最近分析尚未形成可公开的权威 revision。</p>}
        </section>
      </div>
    </AppShell>
  );
}

export default async function ConceptDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getRadarSnapshot();
  const redirect = snapshot.conceptRedirects?.[slug];
  if (redirect?.redirectTo) permanentRedirect(`/concepts/${redirect.redirectTo}`);
  const concept = snapshot.concepts.find((item) => item.slug === slug && item.stage.toLowerCase() !== "candidate");
  if (!concept) {
    const candidate = snapshot.candidateConcepts.find((item) => item.slug === slug);
    if (candidate) return <CandidateDossier candidate={candidate} status={snapshot.status} />;
    notFound();
  }
  const conceptSlug = concept.slug;
  const relatedSignals = snapshot.signals.filter((item) => item.conceptSlug === conceptSlug || item.slug === conceptSlug || item.slug.startsWith(`${conceptSlug}-`));

  const title = concept.canonicalName ?? concept.name;
  const definition = concept.definition;
  const heat = Math.round(Number(concept.heat ?? concept.temperature));
  const maturity = typeof concept.maturity === "number" ? Math.round(concept.maturity) : null;
  const claims = concept.claims || [];
  const evidence = concept.evidence || [];
  const citations = concept.citations || [];
  const signalRows = relatedSignals.map((item) => ({ item, sources: item.sources.filter((source, index, values) => values.findIndex((candidate) => candidate.href === source.href) === index) }));
  const evidenceUrls = evidence.map((item) => item.url);
  const ledgerCarrierIndex = evidenceUrls.length
    ? signalRows.findIndex(({ sources }) => evidenceUrls.every((url) => sources.some((source) => source.href === url)))
    : signalRows.reduce((found, row, index) => row.sources.length ? index : found, -1);
  const revisionLabel = String(concept.revision || concept.revisions?.[0]?.revision || 0).padStart(2, "0");
  const relationItems = concept.knowledgeRelations || concept.relationships || [];
  const conceptsBySlug = new Map(snapshot.concepts.map((item) => [item.slug, item]));

  return (
    <AppShell active="concepts" status={snapshot.status}>
      <div className="concept-detail knowledge-dossier">
        <nav className="breadcrumb" aria-label="面包屑"><Link href="/concepts">Concepts</Link><span>/</span><span>{title}</span></nav>
        <header className="concept-title knowledge-title">
          <div><span className="mono-label">ENGINEERING DOSSIER / REVISION {revisionLabel}</span><h1>{title}</h1><p>{definition}</p>{Boolean(concept?.aliases?.length) && <small>别名：{concept?.aliases?.join(" · ")}</small>}</div>
          <dl className="knowledge-dimensions" aria-label="概念状态">
            <div><dt>热度 Heat</dt><dd>{heat}</dd><small>近期变化强度</small></div>
            <div><dt>成熟度 Maturity</dt><dd>{maturity ?? "—"}</dd><small>独立证据与机制共识</small></div>
            <div><dt>生命周期</dt><dd>{stageLabel(concept.stage)}</dd><small>不由热度自动晋升</small></div>
          </dl>
        </header>

        <div className="knowledge-layout">
          <aside className="knowledge-rail">
            <nav className="knowledge-toc" aria-label="概念目录"><span className="mono-label">ON THIS PAGE</span>{toc.map(([anchor, label]) => <a href={`#${anchor}`} key={anchor}>{label}</a>)}</nav>
            <div className="revision-rail"><span>LAST MEANINGFUL CHANGE</span><b>{formatDate(concept?.lastMeaningfulChange)}</b><p>{concept?.dailyDelta || "尚未记录新的实质性变化。"}</p></div>
          </aside>

          <div className="knowledge-content">
            <DossierSection id="three-minute" number="01" title="三分钟理解" note="先建立问题、机制与当前证据边界">
              <div className="three-minute-read"><p>{definition}</p>{concept?.problem && <p><b>解决的问题</b>{concept.problem}</p>}{concept?.whyNow && <p><b>当前判断</b>{concept.whyNow}</p>}<div className="inline-status"><span>{stageLabel(concept?.stage)}</span><span>{evidence.length || relatedSignals.reduce((sum, item) => sum + item.evidenceCount, 0)} 条来源证据</span><span>知识修订 {revisionLabel}</span></div></div>
              <FieldCitations fields={["definition", "problem", "whyNow"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="definition" number="02" title="精确定义与边界" note="定义它，也明确它不是什么">
              <div className="boundary-grid"><article><span>精确定义</span><p>{definition}</p></article>{concept?.nonDefinition && <article><span>不是</span><p>{concept.nonDefinition}</p></article>}</div>
              {relationItems.length > 0 && <div className="knowledge-relations"><h3>与相邻概念的关系</h3>{relationItems.map((item, index) => {
                const relationType = item.relationType || item.type;
                const targetSlug = item.targetSlug || item.toSlug;
                const target = targetSlug ? conceptsBySlug.get(targetSlug) : undefined;
                const targetName = target?.canonicalName || target?.name || item.to || targetSlug || "目标概念待确认";
                const urls = [...new Set((item.evidenceUrls || []).filter(isSafeEvidenceUrl))];
                return <p key={`${relationType}-${targetSlug || index}`}>
                  <b>{relationLabels[relationType] || relationType}{relationLabels[relationType] && relationLabels[relationType] !== relationType ? `（${relationType}）` : ""}</b>
                  <span>
                    {targetSlug && target ? <Link href={`/concepts/${targetSlug}`}>{targetName}</Link> : <strong>{targetName}</strong>}
                    {(item.explanation || item.note) && <span>：{item.explanation || item.note}</span>}
                    {typeof item.confidence === "number" && <small> · 置信度 {Math.round(item.confidence * 100)}%</small>}
                    {urls.length > 0 && <span> · 原始证据 {urls.map((url, evidenceIndex) => <a href={url} target="_blank" rel="noreferrer" key={url}>[{evidenceIndex + 1}] {safeHostname(url)} ↗</a>)}</span>}
                  </span>
                </p>;
              })}</div>}
              <FieldCitations fields={["definition", "nonDefinition"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="origin" number="03" title="起源与演化" note="区分命名起源、思想先例与网站抓取时间">
              {concept?.origin && <p className="lead-copy">{concept.origin}</p>}<TextList items={concept?.evolution} empty="当前证据不足，尚无可公开的概念演化证据。" />
              <FieldCitations fields={["origin", "evolution"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="why-now" number="04" title="为什么现在重要" note="解释工程条件的变化，而不是重复行业热度">
              {concept?.whyNow && <p className="lead-copy">{concept.whyNow}</p>}{concept?.problem && <div className="knowledge-callout"><span>旧工程问题</span><p>{concept.problem}</p></div>}
              <FieldCitations fields={["whyNow", "problem"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="mechanism" number="05" title="核心机制" note="从运行结构理解概念，而不是记住名词">
              {concept?.mechanism && <p className="lead-copy">{concept.mechanism}</p>}{concept?.architecture && <div className="architecture-note"><span>ARCHITECTURE</span><p>{concept.architecture}</p></div>}
              <FieldCitations fields={["mechanism", "architecture"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="patterns" number="06" title="工程实现模式" note="模式、设计约束与代价必须一起阅读">
              <div className="pattern-columns"><div><h3>实现模式</h3><TextList items={concept.implementationPatterns} empty="当前证据不足，尚无可公开的实现模式证据。" /></div><div><h3>设计约束</h3><TextList items={concept.designConstraints} empty="当前证据不足，尚无可公开的设计约束证据。" /></div><div><h3>工程权衡</h3><TextList items={concept.tradeoffs} empty="当前证据不足，尚无可公开的工程权衡证据。" /></div></div>
              <FieldCitations fields={["implementationPatterns", "designConstraints", "tradeoffs"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="applicability" number="07" title="适用与不适用" note="提供可自行映射的边界，不给项目级处方">
              <div className="boundary-grid"><article><span>适用条件</span><TextList items={concept.applicability} empty="当前证据不足，尚无可公开的适用条件证据。" /></article><article><span>不适用条件</span><TextList items={concept.nonApplicability} empty="当前证据不足，尚无可公开的不适用边界证据。" /></article></div>
              <FieldCitations fields={["applicability", "nonApplicability"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="failure-modes" number="08" title="失败模式与反模式" note="只保留已被来源或工程机制支持的风险">
              <div className="failure-groups"><div><h3>失败模式</h3><TextList items={concept.failureModes} empty="当前证据不足，尚无可公开的失败模式证据。" /></div><div><h3>反模式</h3><TextList items={concept.antiPatterns} empty="当前证据不足，尚无可公开的反模式证据。" /></div><div><h3>安全与运维边界</h3><TextList items={[...(concept.securityRisks || []), ...(concept.operationalConcerns || [])]} empty="当前证据不足，尚无可公开的安全与运维证据。" /></div></div>
              <FieldCitations fields={["failureModes", "antiPatterns", "securityRisks", "operationalConcerns"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="controversies" number="09" title="争议与不同观点" note="分歧保持可见，不用单一结论抹平不确定性">
              {concept?.controversies?.length ? <TextList items={concept.controversies} /> : <p className="muted-note">当前版本未记录材料之间的实质冲突；这不等于概念已经完全形成共识。</p>}
              <FieldCitations fields={["controversies"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="evidence" number="10" title="证据与原始链接" note="中文结论与原文就地绑定，保留原标题、来源与立场">
              {ledgerCarrierIndex < 0 && evidence.length > 0 && <div className="concept-evidence-ledger"><ClaimLedger claims={claims} evidence={evidence} /><div className="evidence-source-list">{evidence.map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={item.url}><span>{item.sourceLayer} · {item.stance}</span><b>{item.originalTitle}</b><small>{item.sourceName} · {formatDate(item.publishedAt)}</small><i aria-hidden="true">↗</i></a>)}</div></div>}
              <div className="related-signal-list">
                {signalRows.map(({ item, sources }, index) => <article key={item.slug}>
                  <header><span className="stage">{item.stage}</span><small>{item.recency} · {item.analysisMode === "deepseek" ? "DeepSeek 分析" : item.analysisMode === "openai" ? "OpenAI 分析" : item.analysisMode === "rules" ? "规则分析" : "编辑分析"}</small></header>
                  <h3>{item.title}</h3><p>{item.summary}</p><p className="signal-engineering-read"><b>工程解读</b>{item.implication}</p>
                  {index === ledgerCarrierIndex && <ClaimLedger claims={claims} evidence={evidence} />}
                  <footer className="signal-source-map"><b>本条原始来源</b>{sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.originalTitle || source.name}<small>{safeHostname(source.href)}</small><span aria-hidden="true">↗</span><i className="sr-only">（在新窗口打开）</i></a>)}</footer>
                </article>)}
                {!relatedSignals.length && <p className="muted-note">当前知识版本没有可以公开展示的关联信号。</p>}
              </div>
            </DossierSection>

            <DossierSection id="recent-changes" number="11" title="最近变化" note="没有实质变化时，不制造每日更新">
              <div className="change-note"><span>{formatDate(concept?.lastMeaningfulChange)}</span><p>{concept?.dailyDelta || "当前快照未记录新的机制、边界或证据变化。"}</p></div>
              <FieldCitations fields={["dailyDelta"]} citations={citations} evidence={evidence} />
            </DossierSection>

            <DossierSection id="revisions" number="12" title="修订记录" note="每次知识变化都保留供应商、模型、原因与字段范围">
              <div className="revision-ledger" data-concept-revision-ledger>{concept?.revisions?.length ? concept.revisions.map((revision) => <RevisionEntry revision={revision} key={revision.revision} />) : <p className="muted-note">旧快照尚未包含结构化修订记录；当前内容仍保留，不会因回溯失败被清空。</p>}</div>
            </DossierSection>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
