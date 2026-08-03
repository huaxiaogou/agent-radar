import { createHash, randomUUID } from "node:crypto";
import { normalizeSourceContentRoles } from "./catalog.mjs";
import { normalizeEngineeringThemes } from "./concept-themes.mjs";

export const CONCEPT_RELATION_TYPES = [
  "depends-on",
  "enables",
  "implements",
  "extends",
  "complements",
  "conflicts-with",
  "supersedes",
  "constrained-by",
  "operationalizes",
  "often-confused-with",
];

export const CONCEPT_KNOWLEDGE_SCHEMA_VERSION = "concept-knowledge-v1";
// v2 is the first extractor that can emit more than one independently
// validated concept from a single article. Keeping the version explicit makes
// deployment reprocess rows produced by the legacy single-concept analyzer.
export const CONCEPT_ANALYZER_VERSION = "concept-analyzer-v2";

const REQUIRED_CONCEPT_TEXT = [
  "canonicalName", "definition", "nonDefinition", "problem", "whyNow", "origin",
  "mechanism", "architecture", "dailyDelta", "lastMeaningfulChange",
];
const REQUIRED_CONCEPT_ARRAYS = [
  "aliases", "themes", "evolution", "designConstraints", "implementationPatterns", "antiPatterns",
  "tradeoffs", "failureModes", "securityRisks", "operationalConcerns", "applicability",
  "nonApplicability", "controversies",
];
const CORE_CONCEPT_ARRAYS = [
  "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability",
];
const CHINESE_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
];
const CONCEPT_DOMAIN_FIELDS = [
  "slug", "canonicalName", "name", "stage", "heat", "temperature", "maturity",
  "independentSourceGroups", "createdAt", "lastMeaningfulChange", "supersededBy", "revision",
  ...REQUIRED_CONCEPT_TEXT,
  ...REQUIRED_CONCEPT_ARRAYS,
];
const CITABLE_TEXT_FIELDS = [
  "definition", "nonDefinition", "problem", "whyNow", "origin", "mechanism", "architecture", "dailyDelta",
];
const CITABLE_ARRAY_FIELDS = [
  "aliases", "evolution", "designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs",
  "failureModes", "securityRisks", "operationalConcerns", "applicability", "nonApplicability", "controversies",
];
const FORMAL_DEPTH_FIELDS = [
  "implementationPatterns", "designConstraints", "antiPatterns", "tradeoffs", "failureModes",
  "operationalConcerns", "applicability", "nonApplicability",
];
const FORMAL_EXCLUDED_STAGES = new Set(["candidate", "archived"]);
const IDENTITY_ACTIONS = new Set(["reuse-existing", "create-new", "needs-review"]);
const MAX_REPORTED_ISSUES = 40;
const MAX_REPORTED_WARNINGS = 20;

function bound(value, minimum = 0, maximum = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function normalizedArticleContentRoles(value) {
  const parsed = Array.isArray(value)
    ? value
    : safeJson(typeof value === "string" ? value : "[]", []);
  return normalizeSourceContentRoles(parsed);
}

export function conceptArticleInputContractHash(row) {
  return payloadHash({
    contentHash: String(row?.content_hash || ""),
    contentRoles: normalizedArticleContentRoles(row?.content_roles_json),
  });
}

export function safeOperationalArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "https://invalid-article-reference.invalid/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "https://invalid-article-reference.invalid/";
  }
}

export function conceptAnalysisFailureCategory(message, status = "failed") {
  const value = String(message || "");
  if (status === "conflict") return "article-input-conflict";
  if (status === "superseded") return "analysis-superseded";
  if (/HTTP\s+(401|403)\b|unauthorized|forbidden/iu.test(value)) return "provider-auth";
  if (/HTTP\s+429\b|rate.?limit|限流/iu.test(value)) return "provider-rate-limit";
  if (/HTTP\s+5\d\d\b|insufficient_system_resource/iu.test(value)) return "provider-server-error";
  if (/fetch failed|timeout|超时|ECONN|ENET|socket|network/iu.test(value)) return "provider-transport";
  if (/不是有效 JSON|invalid JSON|返回空|被截断|响应未完成/iu.test(value)) return "invalid-json";
  if (/中文|汉字|Chinese/iu.test(value)) return "chinese-editorial";
  if (/关系|relation|targetSlug/iu.test(value)) return "relation-contract";
  if (/theme|主题/iu.test(value)) return "theme-contract";
  if (/identityDecision|身份裁决|reuse-existing|create-new|needs-review/iu.test(value)) return "identity-contract";
  if (/证据|evidence|引用|citation|链接|URL|原标题|originalTitle|supports/iu.test(value)) return "evidence-contract";
  if (/claim|主张/iu.test(value)) return "claim-contract";
  if (/缺少|无效|必须|枚举|数组|对象|字段/iu.test(value)) return "schema-contract";
  return "concept-analysis-failed";
}

function safeOperationalFailure(item) {
  const status = String(item?.status || "failed");
  const internalMessage = String(item?.error || "");
  const errorCategory = conceptAnalysisFailureCategory(internalMessage, status);
  const safeError = status === "conflict"
    ? "article input contract changed during analysis"
    : status === "superseded"
      ? "concept analysis superseded"
      : /claim|key|主张|声明|复用|语义/iu.test(internalMessage)
        ? "concept claim semantic conflict"
        : /evidence|citation|证据|引文|引用/iu.test(internalMessage)
          ? "concept evidence contract failed"
          : "concept analysis failed";
  return {
    url: safeOperationalArticleUrl(item?.url),
    status,
    error: safeError,
    errorCategory,
  };
}

function chineseLed(value) {
  const text = String(value || "").trim();
  const han = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  const latin = (text.match(/[A-Za-z]/gu) || []).length;
  return han >= 4 && han / Math.max(1, han + latin) >= 0.2;
}

function conceptDomainFields(value) {
  const source = value && typeof value === "object" ? value : {};
  const output = {};
  for (const field of CONCEPT_DOMAIN_FIELDS) {
    if (!Object.hasOwn(source, field)) continue;
    const item = source[field];
    if (Array.isArray(item)) {
      output[field] = unique(item.map((entry) => typeof entry === "string" ? entry.trim() : entry));
    } else if (typeof item === "string") {
      output[field] = item.trim();
    } else {
      output[field] = item;
    }
  }
  output.themes = normalizeEngineeringThemes(source.themes, { allowMissing: true });
  return output;
}

function normalizedStoredPayload(value) {
  if (!value?.concept) return null;
  return {
    ...(value.identityDecision ? { identityDecision: structuredClone(value.identityDecision) } : {}),
    concept: conceptDomainFields(value.concept),
    claims: Array.isArray(value.claims) ? value.claims : [],
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
    citations: Array.isArray(value.citations) ? value.citations : [],
    relations: Array.isArray(value.relations) ? value.relations : [],
  };
}

function isoValue(value, fallback = new Date().toISOString()) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function timeValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function isFormalConceptStage(stage) {
  return !FORMAL_EXCLUDED_STAGES.has(String(stage || "").toLowerCase());
}

function isExistingFormalConcept(database, slug) {
  if (!slug) return false;
  const row = database.prepare(`
    SELECT stage, merged_into
    FROM concept_knowledge
    WHERE slug = ?
  `).get(slug);
  return Boolean(row && !row.merged_into && isFormalConceptStage(row.stage));
}

export function normalizeConceptAliasKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015_./\\:：·•]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function validateIdentityDecision(value, { required = false } = {}) {
  const decision = value?.identityDecision;
  if (!decision) {
    if (required) throw new Error("概念知识缺少 identityDecision 身份裁决");
    return null;
  }
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("identityDecision 必须是对象");
  if (!IDENTITY_ACTIONS.has(decision.action)) throw new Error(`identityDecision.action 无效：${decision.action || "空"}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(decision.canonicalSlug || ""))) {
    throw new Error("identityDecision.canonicalSlug 必须是 kebab-case");
  }
  const confidence = Number(decision.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("identityDecision.confidence 必须在 0-1 之间");
  if (typeof decision.reason !== "string" || decision.reason.trim().length < 12) throw new Error("identityDecision.reason 必须说明身份裁决依据");
  if (!chineseLed(decision.reason)) throw new Error("identityDecision.reason 必须是中文主导内容");
  if (!Array.isArray(decision.comparedSlugs)) throw new Error("identityDecision.comparedSlugs 必须是数组");
  for (const slug of decision.comparedSlugs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ""))) throw new Error(`identityDecision.comparedSlugs 含非法 slug：${slug || "空"}`);
  }
  if (decision.action === "create-new" && decision.canonicalSlug !== value.concept?.slug) {
    throw new Error("create-new 的 canonicalSlug 必须与 concept.slug 一致");
  }
  return decision;
}

function validateShape(value, { allowLegacySparseCoreArrays = false, requireIdentityDecision = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("概念知识 JSON 必须是对象");
  if (!value.concept || typeof value.concept !== "object") throw new Error("概念知识缺少 concept");
  validateIdentityDecision(value, { required: requireIdentityDecision });
  if (!Array.isArray(value.claims) || value.claims.length === 0) throw new Error("概念知识必须包含主张 claims");
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) throw new Error("概念知识必须包含证据 evidence");
  if (!Array.isArray(value.citations)) throw new Error("概念知识 citations 必须是数组");
  if (!Array.isArray(value.relations)) throw new Error("概念知识 relations 必须是数组");
  const concept = value.concept;
  concept.themes = normalizeEngineeringThemes(concept.themes, { allowMissing: true });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(concept.slug || ""))) throw new Error("概念 slug 无效");
  for (const field of REQUIRED_CONCEPT_TEXT) {
    if (typeof concept[field] !== "string" || !concept[field].trim()) throw new Error(`概念知识缺少 ${field}`);
  }
  for (const field of REQUIRED_CONCEPT_ARRAYS) {
    if (!Array.isArray(concept[field])) throw new Error(`概念知识 ${field} 必须是数组`);
    for (const [index, item] of concept[field].entries()) {
      if (typeof item !== "string" || !item.trim()) throw new Error(`概念知识 ${field} 含空白项：${index + 1}`);
    }
  }
  if (!allowLegacySparseCoreArrays && CORE_CONCEPT_ARRAYS.every((field) => concept[field].length === 0)) {
    throw new Error("核心工程知识不能全部为空，概念不能是空壳");
  }
  for (const field of CORE_CONCEPT_ARRAYS) {
    for (const item of concept[field]) {
      if (!chineseLed(item)) throw new Error(`${field} 的每一项必须是中文主导内容`);
    }
  }
  for (const field of CHINESE_FIELDS) {
    if (!chineseLed(concept[field])) throw new Error(`${field} 必须是中文主导内容`);
  }
  const claimKeys = new Set();
  for (const claim of value.claims) {
    if (!claim || typeof claim !== "object" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(claim.key || ""))) {
      throw new Error("主张 key 无效");
    }
    if (claimKeys.has(claim.key)) throw new Error(`主张重复：${claim.key}`);
    claimKeys.add(claim.key);
    if (!chineseLed(claim.text)) throw new Error(`主张 ${claim.key} 必须是中文主导内容`);
    if (!Number.isFinite(Number(claim.confidence)) || Number(claim.confidence) < 0 || Number(claim.confidence) > 1) {
      throw new Error(`主张 ${claim.key} confidence 无效`);
    }
  }
  const supported = new Set();
  const evidenceUrls = new Set();
  for (const evidence of value.evidence) {
    if (!evidence?.url || !evidence?.originalTitle || !Array.isArray(evidence.supports) || evidence.supports.length === 0) {
      throw new Error("证据必须包含 URL、原标题和 supports");
    }
    if (!["official", "practitioner", "community"].includes(evidence.sourceLayer)) throw new Error("证据 sourceLayer 无效");
    if (!["support", "conflict", "context"].includes(evidence.stance)) throw new Error("证据 stance 无效");
    evidenceUrls.add(evidence.url);
    for (const key of evidence.supports) {
      if (!claimKeys.has(key)) throw new Error(`证据引用未知主张：${key}`);
      supported.add(key);
    }
  }
  for (const key of claimKeys) {
    if (!supported.has(key)) throw new Error(`主张没有绑定证据：${key}`);
  }
  const requiredCitationFields = new Set([
    ...CITABLE_TEXT_FIELDS,
    ...CITABLE_ARRAY_FIELDS.filter((field) => Array.isArray(concept[field]) && concept[field].length > 0),
  ]);
  const citedFields = new Set();
  for (const citation of value.citations) {
    const field = String(citation?.field || "");
    if (!requiredCitationFields.has(field)) throw new Error(`字段引文 field 无效或对应内容为空：${field || "空"}`);
    if (citedFields.has(field)) throw new Error(`字段引文重复：${field}`);
    if (!Array.isArray(citation.evidenceUrls) || citation.evidenceUrls.length === 0) throw new Error(`字段引文缺少证据：${field}`);
    for (const url of citation.evidenceUrls) {
      if (!evidenceUrls.has(url)) throw new Error(`字段引文链接不在 payload evidence 中：${field} -> ${url}`);
    }
    citedFields.add(field);
  }
  for (const field of requiredCitationFields) {
    if (!citedFields.has(field)) throw new Error(`非空知识字段缺少原文引文：${field}`);
  }
  return value;
}

export function parseConceptKnowledgeAnalysis(raw, {
  allowedEvidenceUrls = [],
  knownConceptSlugs = [],
  knownRelationTargetSlugs = knownConceptSlugs,
  requireIdentityDecision = false,
} = {}) {
  let value;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("概念知识输出不是有效 JSON");
    }
  } else {
    value = structuredClone(raw);
  }
  validateShape(value, { requireIdentityDecision });
  const allowed = new Set(allowedEvidenceUrls);
  for (const evidence of value.evidence) {
    if (allowed.size && !allowed.has(evidence.url)) throw new Error(`证据链接不在允许来源中：${evidence.url}`);
  }
  for (const citation of value.citations) {
    for (const url of citation.evidenceUrls) {
      if (allowed.size && !allowed.has(url)) throw new Error(`字段引文链接不在允许来源中：${citation.field} -> ${url}`);
    }
  }
  const known = new Set(knownRelationTargetSlugs);
  for (const relation of value.relations) {
    if (!CONCEPT_RELATION_TYPES.includes(relation?.type)) throw new Error(`关系类型无效：${relation?.type || "空"}`);
    if (!relation.targetSlug || relation.targetSlug === value.concept.slug || !known.has(relation.targetSlug)) {
      throw new Error(`关系 targetSlug 不是已知正式概念：${relation.targetSlug || "空"}`);
    }
    if (!Array.isArray(relation.evidenceUrls) || relation.evidenceUrls.length === 0) throw new Error("关系必须绑定证据链接");
    for (const url of relation.evidenceUrls) {
      if (allowed.size && !allowed.has(url)) throw new Error(`关系证据链接不在允许来源中：${url}`);
    }
  }
  const identity = value.identityDecision;
  if (identity) {
    const knownIdentities = new Set(knownConceptSlugs);
    for (const slug of identity.comparedSlugs) {
      if (!knownIdentities.has(slug)) throw new Error(`identityDecision 比较了未知概念：${slug}`);
    }
    if (identity.action === "reuse-existing" && !knownIdentities.has(identity.canonicalSlug)) {
      throw new Error(`identityDecision.canonicalSlug 不是已知概念：${identity.canonicalSlug}`);
    }
    if (identity.action === "needs-review"
        && identity.canonicalSlug !== value.concept.slug
        && !knownIdentities.has(identity.canonicalSlug)) {
      throw new Error(`identityDecision.canonicalSlug 不是已知概念：${identity.canonicalSlug}`);
    }
    if (["reuse-existing", "create-new"].includes(identity.action) && Number(identity.confidence) < 0.8) {
      throw new Error(`${identity.action} 身份裁决置信度不足，应使用 needs-review`);
    }
    if (identity.action === "needs-review") value.concept.stage = "candidate";
  }
  return value;
}

export function evaluateConceptLifecycle({
  currentStage = "candidate",
  evidence = [],
  hasStableDefinition = false,
  hasMechanism = false,
  hasEngineeringDepth = true,
  now = new Date().toISOString(),
  lastMeaningfulChangeAt = null,
  supersededBy = null,
  effectiveEvidenceDecisions = ["publish", "watch"],
  currentStageChangedAt = null,
} = {}) {
  // Formal maturity is evidence of engineering consensus, not merely evidence
  // that gives the concept more context. Keep this gate deliberately strict:
  // watch records are unpublished, while conflict/context records describe a
  // boundary or disagreement rather than support for the concept's maturity.
  const publishedSupportEvidence = evidence.filter((item) => (
    item?.publishDecision === "publish"
      && item?.stance === "support"
  ));
  const supportGroups = new Set(publishedSupportEvidence.map((item) => item.independentGroup).filter(Boolean));
  const officialGroups = new Set(publishedSupportEvidence.filter((item) => item.sourceLayer === "official").map((item) => item.independentGroup).filter(Boolean));
  const practitionerGroups = new Set(publishedSupportEvidence.filter((item) => item.sourceLayer === "practitioner").map((item) => item.independentGroup).filter(Boolean));
  const nowTime = timeValue(now);
  const acceptedEvidenceDecisions = new Set(effectiveEvidenceDecisions);
  const effectiveEvidence = [...new Map(evidence
    .filter((item) => acceptedEvidenceDecisions.has(item?.publishDecision))
    .map((item) => [item.url || canonicalJson(item), item])).values()];
  const evidenceGroups = new Map();
  let mostRecentTime = 0;
  let recentEvidenceCount = 0;
  let engagementScore = 0;
  for (const item of effectiveEvidence) {
    const group = item.independentGroup || `ungrouped:${item.sourceLayer || "unknown"}`;
    const sourceScore = item.sourceLayer === "official" ? 8 : item.sourceLayer === "practitioner" ? 7 : 4;
    const decisionScore = item.publishDecision === "publish" ? 4 : 1;
    const stanceScore = item.stance === "support" ? 3 : item.stance === "conflict" ? 4 : 1;
    evidenceGroups.set(group, Math.max(evidenceGroups.get(group) || 0, sourceScore + decisionScore + stanceScore));
    const publishedTime = timeValue(item.publishedAt);
    if (publishedTime > 0) {
      mostRecentTime = Math.max(mostRecentTime, publishedTime);
      const ageDays = Math.max(0, (nowTime - publishedTime) / 86_400_000);
      if (ageDays <= 30) recentEvidenceCount += 1;
    }
    engagementScore += Math.max(0, Number(item.engagementCount || 0));
  }
  const newestAgeDays = mostRecentTime > 0 && nowTime > 0
    ? Math.max(0, (nowTime - mostRecentTime) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const recencyScore = newestAgeDays <= 3 ? 18
    : newestAgeDays <= 7 ? 14
      : newestAgeDays <= 30 ? 10
        : newestAgeDays <= 90 ? 6
          : newestAgeDays <= 180 ? 3 : 0;
  const normalizedHeat = Math.round(bound(
    5
      + Math.min(16, evidenceGroups.size * 4)
      + [...evidenceGroups.values()].reduce((sum, score) => sum + score, 0)
      + recencyScore
      + Math.min(10, recentEvidenceCount * 2)
      + Math.min(12, Math.log10(engagementScore + 1) * 2.4),
  ) * 10) / 10;
  const maturity = Math.round(bound(
    (hasStableDefinition ? 25 : 0)
      + (hasMechanism ? 25 : 0)
      + Math.min(25, officialGroups.size * 25)
      + Math.min(25, practitionerGroups.size * 25),
  ) * 10) / 10;
  const lastChangeTime = new Date(lastMeaningfulChangeAt || now).getTime();
  const oldDays = Number.isFinite(nowTime) && Number.isFinite(lastChangeTime)
    ? Math.max(0, (nowTime - lastChangeTime) / 86_400_000)
    : 0;
  const stageChangeTime = timeValue(currentStageChangedAt);
  const stageAgeDays = stageChangeTime > 0 && nowTime > 0
    ? Math.max(0, (nowTime - stageChangeTime) / 86_400_000)
    : 0;
  const publishedConflictEvidence = evidence.filter((item) => (
    item?.publishDecision === "publish" && item?.stance === "conflict"
  ));
  // A published conflict is itself the lifecycle signal. `controversies`
  // supplies the editorial explanation, but its absence must not silently
  // turn conflict evidence into consensus evidence.
  const hasFormalSupportBase = hasStableDefinition
    && hasMechanism
    && hasEngineeringDepth
    && supportGroups.size >= 2
    && (officialGroups.size > 0 || practitionerGroups.size > 0);
  const materialConflict = hasFormalSupportBase && publishedConflictEvidence.length > 0;
  let stage;
  if (currentStage === "archived") stage = "archived";
  else if (supersededBy && (oldDays > 365 || (currentStage === "cooling" && stageAgeDays >= 1))) stage = "archived";
  else if (materialConflict) stage = "contested";
  else if (["validated", "contested", "cooling"].includes(currentStage) && oldDays > 180 && newestAgeDays > 180) stage = "cooling";
  else if (!hasFormalSupportBase) stage = "candidate";
  else if (supportGroups.size >= 3 && practitionerGroups.size >= 1) stage = "validated";
  else stage = "emerging";
  return {
    stage,
    heat: normalizedHeat,
    maturity,
    independentGroupCount: supportGroups.size,
    officialGroupCount: officialGroups.size,
    practitionerGroupCount: practitionerGroups.size,
  };
}

function articleRowsForEvidence(database, evidence, { includeRejected = false } = {}) {
  const select = database.prepare(includeRejected ? `
    SELECT url, original_title, source_name, source_layer, source_class, independent_group,
           published_at, discovered_at, engagement_count, publish_decision
    FROM articles
    WHERE url = ? AND publish_decision IN ('publish', 'watch', 'reject')
  ` : `
    SELECT url, original_title, source_name, source_layer, source_class, independent_group,
           published_at, discovered_at, engagement_count, publish_decision
    FROM articles
    WHERE url = ? AND publish_decision IN ('publish', 'watch')
  `);
  return evidence.map((item) => {
    const row = select.get(item.url);
    if (!row) throw new Error(`公开证据链接不存在或不可发布：${item.url}`);
    const sourceLayer = ["official", "practitioner", "community"].includes(row.source_layer)
      ? row.source_layer
      : (/实践者|概念雷达|研究/.test(row.source_class || "") ? "practitioner" : /社区/.test(row.source_class || "") ? "community" : "official");
    return {
      ...item,
      originalTitle: row.original_title,
      sourceName: row.source_name,
      sourceLayer,
      independentGroup: row.independent_group,
      publishedAt: row.published_at || row.discovered_at,
      engagementCount: Number(row.engagement_count || 0),
      publishDecision: row.publish_decision,
      supports: unique(item.supports),
      stance: ["support", "conflict", "context"].includes(item.stance) ? item.stance : "context",
    };
  });
}

function nonEmptyKnowledgeField(value) {
  if (Array.isArray(value)) return value.some((item) => String(item || "").trim());
  return typeof value === "string" && Boolean(value.trim());
}

function formalPublicationQuality({ concept, claims = [], evidence = [], citations = [] } = {}) {
  const slug = String(concept?.slug || "unknown");
  const issues = [];
  const publishedEvidence = evidence.filter((item) => item?.publishDecision === "publish" && item?.url);
  const publishedEvidenceByUrl = new Map(publishedEvidence.map((item) => [item.url, item]));
  const publishedUrls = new Set(publishedEvidenceByUrl.keys());
  if (publishedUrls.size === 0) issues.push({ slug, code: "NO_PUBLIC_PUBLISH_EVIDENCE" });

  if (!Array.isArray(claims) || claims.length === 0) {
    issues.push({ slug, code: "NO_PUBLIC_CLAIMS" });
  } else {
    for (const claim of claims) {
      const evidenceUrls = Array.isArray(claim?.evidenceUrls) ? claim.evidenceUrls : [];
      if (!evidenceUrls.some((url) => publishedUrls.has(url))) {
        issues.push({ slug, code: "CLAIM_WITHOUT_PUBLIC_EVIDENCE", claimKey: String(claim?.key || "unknown") });
      }
    }
  }

  const citationsByField = new Map();
  for (const citation of Array.isArray(citations) ? citations : []) {
    const field = String(citation?.field || "");
    const validUrls = unique((Array.isArray(citation?.evidenceUrls) ? citation.evidenceUrls : [])
      .filter((url) => publishedUrls.has(url)));
    if (validUrls.length > 0) citationsByField.set(field, validUrls);
  }
  for (const field of REQUIRED_CONCEPT_TEXT) {
    if (!nonEmptyKnowledgeField(concept?.[field])) {
      issues.push({ slug, code: "MISSING_PUBLIC_FIELD", field });
    }
  }
  for (const field of [...CITABLE_TEXT_FIELDS, ...CITABLE_ARRAY_FIELDS]) {
    if (!nonEmptyKnowledgeField(concept?.[field])) continue;
    if (!citationsByField.has(field)) issues.push({ slug, code: "MISSING_PUBLIC_CITATION", field });
  }

  let engineeringDepthReady = true;
  for (const field of FORMAL_DEPTH_FIELDS) {
    if (!nonEmptyKnowledgeField(concept?.[field])) {
      engineeringDepthReady = false;
      issues.push({ slug, code: "MISSING_FORMAL_ENGINEERING_DEPTH", field });
      continue;
    }
    if (!citationsByField.has(field)) {
      engineeringDepthReady = false;
      issues.push({ slug, code: "FORMAL_DEPTH_WITHOUT_PUBLIC_CITATION", field });
    }
  }
  const practitionerImplementationEvidence = (citationsByField.get("implementationPatterns") || [])
    .some((url) => publishedEvidenceByUrl.get(url)?.sourceLayer === "practitioner");
  if (!practitionerImplementationEvidence) {
    engineeringDepthReady = false;
    issues.push({ slug, code: "NO_PRACTITIONER_IMPLEMENTATION_EVIDENCE", field: "implementationPatterns" });
  }

  return {
    issues,
    publicReady: issues.length === 0,
    engineeringDepthReady,
    publishedEvidenceUrls: publishedUrls,
    citationsByField,
  };
}

function changedFields(previous, next) {
  if (!previous) return [...Object.keys(next.concept || {}), ...(next.identityDecision ? ["identityDecision"] : []), "claims", "evidence", "citations", "relations"];
  const fields = [];
  for (const key of Object.keys(next.concept || {})) {
    if (canonicalJson(previous.concept?.[key]) !== canonicalJson(next.concept[key])) fields.push(key);
  }
  for (const key of ["identityDecision", "claims", "evidence", "citations", "relations"]) {
    if (canonicalJson(previous[key]) !== canonicalJson(next[key])) fields.push(key);
  }
  return fields;
}

function revisionFieldDiff(previous, next) {
  const diff = {};
  const previousConcept = previous?.concept || {};
  for (const key of new Set([...Object.keys(previousConcept), ...Object.keys(next.concept || {})])) {
    if (key === "revision") continue;
    if (canonicalJson(previousConcept[key]) !== canonicalJson(next.concept?.[key])) {
      diff[key] = { before: previousConcept[key] ?? null, after: next.concept?.[key] ?? null };
    }
  }
  for (const key of ["identityDecision", "claims", "evidence", "citations", "relations"]) {
    const fallback = key === "identityDecision" ? null : [];
    if (canonicalJson(previous?.[key] ?? fallback) !== canonicalJson(next[key] ?? fallback)) {
      diff[key] = { before: previous?.[key] ?? fallback, after: next[key] ?? fallback };
    }
  }
  return diff;
}

function semanticClaims(claims = []) {
  return claims
    .map((claim) => ({
      key: claim?.key || "",
      text: claim?.text || "",
      kind: claim?.kind || "",
      confidence: Number(claim?.confidence || 0),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function revisionDelta(previous, next) {
  if (!previous) return { materialChange: true, categories: ["created", "definition", "mechanism"] };
  const categories = new Set();
  const conceptFields = {
    definition: ["definition", "nonDefinition", "problem", "whyNow"],
    mechanism: ["mechanism", "architecture"],
    history: ["origin", "evolution"],
    patterns: ["designConstraints", "implementationPatterns", "antiPatterns", "tradeoffs"],
    boundaries: ["applicability", "nonApplicability", "failureModes", "securityRisks", "operationalConcerns"],
    controversies: ["controversies"],
    identity: ["canonicalName", "aliases", "themes"],
  };
  for (const [category, fields] of Object.entries(conceptFields)) {
    if (fields.some((field) => canonicalJson(previous.concept?.[field]) !== canonicalJson(next.concept?.[field]))) categories.add(category);
  }
  // Claim evidence URLs are derived from the current evidence set. Adding a
  // context-only source must remain visible in fieldDiff, but it is not a
  // semantic claim revision unless the claim itself changed.
  if (canonicalJson(semanticClaims(previous.claims)) !== canonicalJson(semanticClaims(next.claims))) categories.add("claims");
  if (canonicalJson(previous.identityDecision || null) !== canonicalJson(next.identityDecision || null)) categories.add("identity");
  if (canonicalJson(previous.relations || []) !== canonicalJson(next.relations || [])) categories.add("relationships");
  if (["stage", "maturity"].some((field) => canonicalJson(previous.concept?.[field]) !== canonicalJson(next.concept?.[field]))) categories.add("lifecycle");
  const materialChange = categories.size > 0;
  if (!materialChange && canonicalJson(previous.evidence || []) !== canonicalJson(next.evidence || [])) categories.add("evidence");
  return { materialChange, categories: [...categories] };
}

function revisionReview(payload) {
  const publishedSupportEvidence = payload.evidence.filter((item) => (
    item.publishDecision === "publish" && item.stance === "support"
  ));
  const publishedConflictEvidence = payload.evidence.filter((item) => (
    item.publishDecision === "publish" && item.stance === "conflict"
  ));
  const groups = new Set(publishedSupportEvidence.map((item) => item.independentGroup).filter(Boolean));
  const blockingReasons = [];
  if (payload.concept.stage === "contested" || publishedConflictEvidence.length > 0) blockingReasons.push("证据冲突需要人工复核");
  if (groups.size < 2) blockingReasons.push("独立来源不足，需要继续验证");
  if (payload.concept.stage === "candidate") blockingReasons.push("候选概念尚未满足正式晋升条件");
  const identityDecision = payload.identityDecision;
  const identityAuditReasons = identityDecision && ["reuse-existing", "needs-review"].includes(identityDecision.action)
    ? [`概念身份裁决（${identityDecision.action}）：${identityDecision.reason}`]
    : [];
  const reasons = [...blockingReasons, ...identityAuditReasons];
  const confidence = payload.claims.length
    ? Math.round((payload.claims.reduce((sum, claim) => sum + Number(claim.confidence || 0), 0) / payload.claims.length) * 1000) / 1000
    : 0;
  return { confidence, needsReview: blockingReasons.length > 0, reviewReasons: reasons };
}

function resolveIdentityDecisionForWrite(database, input, { knownIdentitySlugs = [] } = {}) {
  const decision = input.identityDecision;
  if (!decision) return input;
  const proposedSlug = input.concept.slug;
  const proposedCanonicalName = input.concept.canonicalName;
  if (decision.action === "reuse-existing") {
    const canonicalRow = database.prepare(`
      SELECT * FROM concept_knowledge
      WHERE slug = ? AND merged_into IS NULL
    `).get(decision.canonicalSlug);
    if (!canonicalRow) {
      const allowedBootstrapIdentity = decision.canonicalSlug === proposedSlug
        && new Set(knownIdentitySlugs).has(decision.canonicalSlug);
      if (!allowedBootstrapIdentity) throw new Error(`reuse-existing 的 canonicalSlug 不存在：${decision.canonicalSlug}`);
      return input;
    }
    const stored = recoverStoredPayload(database, canonicalRow).payload;
    const storedAliases = database.prepare(`
      SELECT alias_text FROM concept_aliases WHERE concept_slug = ? ORDER BY alias_text
    `).all(canonicalRow.slug).map((row) => row.alias_text);
    input.concept.slug = canonicalRow.slug;
    input.concept.canonicalName = canonicalRow.canonical_name;
    input.concept.aliases = unique([
      canonicalRow.slug,
      canonicalRow.canonical_name,
      ...(stored?.concept?.aliases || []),
      ...storedAliases,
      proposedSlug,
      proposedCanonicalName,
      ...(input.concept.aliases || []),
    ]).slice(0, 16);
    return input;
  }
  if (decision.action === "needs-review") {
    if (decision.canonicalSlug !== proposedSlug) {
      const possibleCanonical = database.prepare(`
        SELECT 1 FROM concept_knowledge WHERE slug = ? AND merged_into IS NULL
      `).get(decision.canonicalSlug);
      if (!possibleCanonical) throw new Error(`needs-review 的 canonicalSlug 不存在：${decision.canonicalSlug}`);
    }
    input.concept.stage = "candidate";
    return input;
  }

  if (decision.canonicalSlug !== proposedSlug) throw new Error("create-new 的 canonicalSlug 必须与 concept.slug 一致");
  if (database.prepare("SELECT 1 FROM concept_knowledge WHERE slug = ?").get(proposedSlug)) {
    throw new Error(`create-new 与已有概念 slug 冲突：${proposedSlug}`);
  }
  for (const alias of [proposedSlug, proposedCanonicalName, ...(input.concept.aliases || [])]) {
    const key = normalizeConceptAliasKey(alias);
    if (!key) continue;
    const owner = database.prepare("SELECT concept_slug FROM concept_aliases WHERE alias_key = ?").get(key);
    if (owner) throw new Error(`create-new 与已有概念 alias 冲突：${alias} -> ${owner.concept_slug}`);
  }
  return input;
}

function insertRevisionDetails(database, slug, revision, payload) {
  const claimStatement = database.prepare(`
    INSERT INTO concept_revision_claims
      (concept_slug, revision, claim_key, claim_text, claim_kind, confidence, evidence_urls_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const claim of payload.claims) {
    claimStatement.run(slug, revision, claim.key, claim.text, claim.kind, Number(claim.confidence), JSON.stringify(claim.evidenceUrls));
  }
  const evidenceStatement = database.prepare(`
    INSERT INTO concept_revision_evidence
      (concept_slug, revision, evidence_url, original_title, source_name, source_layer,
       independent_group, stance, published_at, engagement_count, supports_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const evidence of payload.evidence) {
    evidenceStatement.run(
      slug, revision, evidence.url, evidence.originalTitle, evidence.sourceName, evidence.sourceLayer,
      evidence.independentGroup, evidence.stance, evidence.publishedAt || null,
      Number(evidence.engagementCount || 0), JSON.stringify(evidence.supports),
    );
  }
  const relationStatement = database.prepare(`
    INSERT INTO concept_revision_relations
      (concept_slug, revision, relation_type, target_slug, explanation, confidence, evidence_urls_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const relation of payload.relations) {
    relationStatement.run(
      slug, revision, relation.type, relation.targetSlug, relation.explanation,
      Number(relation.confidence || 0), JSON.stringify(relation.evidenceUrls || []),
    );
  }
  const citationStatement = database.prepare(`
    INSERT INTO concept_revision_citations (concept_slug, revision, field_name, evidence_urls_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const citation of payload.citations) {
    citationStatement.run(slug, revision, citation.field, JSON.stringify(unique(citation.evidenceUrls)));
  }
}

export function applyConceptKnowledgeRevision(database, rawPayload, {
  provider = "unknown",
  model = "unknown",
  analyzedAt = new Date().toISOString(),
  reason = "概念知识更新",
  transactional = true,
  forceRevision = false,
  lifecycleEvidenceDecisions = null,
  allowLifecycleRetirement = false,
  preserveLastMeaningfulChange = false,
  revisionAuditPayload = null,
  lifecycleStageChangedAt = null,
  enforceIdentityDecision = null,
  knownIdentitySlugs = [],
} = {}) {
  if (!database || typeof database.prepare !== "function") throw new Error("概念知识更新需要有效 database");
  const input = typeof rawPayload === "string" ? parseConceptKnowledgeAnalysis(rawPayload) : structuredClone(rawPayload);
  validateShape(input);
  const shouldEnforceIdentity = enforceIdentityDecision == null
    ? !String(provider || "").startsWith("system-")
    : Boolean(enforceIdentityDecision);
  if (shouldEnforceIdentity) resolveIdentityDecisionForWrite(database, input, { knownIdentitySlugs });
  validateShape(input);
  const existingRow = database.prepare("SELECT * FROM concept_knowledge WHERE slug = ?").get(input.concept.slug);
  if (existingRow?.merged_into) throw new Error(`概念已合并到 ${existingRow.merged_into}，不能追加旧 slug`);
  const canReadRetiredEvidenceForAudit = allowLifecycleRetirement
    && input.concept.stage === "archived"
    && Boolean(existingRow);
  const authoritativeEvidence = articleRowsForEvidence(database, input.evidence, {
    includeRejected: canReadRetiredEvidenceForAudit,
  });
  const allowedUrls = new Set(authoritativeEvidence.map((item) => item.url));
  for (const relation of input.relations) {
    if (!CONCEPT_RELATION_TYPES.includes(relation?.type)) throw new Error(`关系类型无效：${relation?.type || "空"}`);
    if (!relation.targetSlug || relation.targetSlug === input.concept.slug) throw new Error("关系 targetSlug 无效");
    if (!isExistingFormalConcept(database, relation.targetSlug)) {
      throw new Error(`关系 targetSlug 不是数据库中的正式概念：${relation.targetSlug}`);
    }
    for (const url of relation.evidenceUrls || []) if (!allowedUrls.has(url)) throw new Error(`关系证据链接无效：${url}`);
  }
  const claimEvidence = new Map(input.claims.map((claim) => [claim.key, []]));
  for (const evidence of authoritativeEvidence) {
    for (const key of evidence.supports) {
      if (!claimEvidence.has(key)) throw new Error(`证据引用未知主张：${key}`);
      claimEvidence.get(key).push(evidence.url);
    }
  }
  const claims = input.claims.map((claim) => {
    const evidenceUrls = unique(claimEvidence.get(claim.key));
    if (!evidenceUrls.length) throw new Error(`主张没有绑定公开或候选证据：${claim.key}`);
    return { ...claim, confidence: bound(claim.confidence, 0, 1), evidenceUrls };
  });
  if (!claims.length) throw new Error("概念知识没有任何绑定证据的主张");
  const citations = input.citations.map((citation) => ({
    field: citation.field,
    evidenceUrls: unique(citation.evidenceUrls),
  }));
  const authoritativePayload = {
    ...(input.identityDecision ? { identityDecision: structuredClone(input.identityDecision) } : {}),
    concept: conceptDomainFields(input.concept),
    claims,
    evidence: authoritativeEvidence,
    citations,
    relations: input.relations,
  };
  const publishCurrentPayload = projectMergedPayloadToPublishCurrent(database, authoritativePayload);
  const publicationQuality = formalPublicationQuality({
    concept: publishCurrentPayload.concept,
    claims: publishCurrentPayload.claims,
    evidence: publishCurrentPayload.evidence,
    citations: publishCurrentPayload.citations,
  });
  const previous = existingRow ? recoverStoredPayload(database, existingRow).payload : null;
  const analysisTime = isoValue(analyzedAt);
  const evaluatedLifecycle = evaluateConceptLifecycle({
    currentStage: existingRow?.stage || input.concept.stage,
    evidence: authoritativeEvidence,
    hasStableDefinition: chineseLed(input.concept.definition) && chineseLed(input.concept.nonDefinition),
    hasMechanism: chineseLed(input.concept.mechanism),
    hasEngineeringDepth: publicationQuality.engineeringDepthReady,
    now: analysisTime,
    lastMeaningfulChangeAt: previous?.concept?.lastMeaningfulChange || input.concept.lastMeaningfulChange,
    supersededBy: input.concept.supersededBy || null,
    effectiveEvidenceDecisions: lifecycleEvidenceDecisions || ["publish", "watch"],
    currentStageChangedAt: lifecycleStageChangedAt,
  });
  let lifecycle = input.identityDecision?.action === "needs-review"
    ? { ...evaluatedLifecycle, stage: "candidate" }
    : evaluatedLifecycle;
  const retiresUnsupportedConcept = canReadRetiredEvidenceForAudit
    && authoritativeEvidence.length > 0
    && authoritativeEvidence.every((item) => !["publish", "watch"].includes(item.publishDecision));
  if (retiresUnsupportedConcept) lifecycle = { ...evaluatedLifecycle, stage: "archived" };
  const existingWasFormal = Boolean(existingRow && isFormalConceptStage(existingRow.stage));
  const isAllowedLifecycleRetirement = allowLifecycleRetirement && lifecycle.stage === "archived";
  if (existingWasFormal && !isAllowedLifecycleRetirement
      && (!isFormalConceptStage(lifecycle.stage) || !publicationQuality.publicReady)) {
    const reasonCodes = publicationQuality.issues.map((issue) => issue.code).join(", ") || "FORMAL_LIFECYCLE_REGRESSION";
    throw new Error(`正式概念更新缺少当前 publish 证据，已保留 last-good revision：${reasonCodes}`);
  }
  if (isFormalConceptStage(lifecycle.stage) && !publicationQuality.publicReady) {
    throw new Error(`正式概念不满足公开证据与引文门禁：${publicationQuality.issues.map((issue) => issue.code).join(", ")}`);
  }
  if (input.relations.length > 0 && !isFormalConceptStage(lifecycle.stage) && !isAllowedLifecycleRetirement) {
    throw new Error(`关系 sourceSlug 尚未成为正式概念：${input.concept.slug}`);
  }
  const aliases = unique([input.concept.canonicalName, input.concept.slug, ...input.concept.aliases]);
  const formalCurrentPayload = isFormalConceptStage(lifecycle.stage)
    ? publishCurrentPayload
    : authoritativePayload;
  const concept = {
    ...conceptDomainFields(input.concept),
    canonicalName: input.concept.canonicalName.trim(),
    name: input.concept.canonicalName.trim(),
    aliases,
    stage: lifecycle.stage,
    heat: lifecycle.heat,
    temperature: lifecycle.heat,
    maturity: lifecycle.maturity,
    independentSourceGroups: lifecycle.independentGroupCount,
    createdAt: previous?.concept?.createdAt || analysisTime,
    lastMeaningfulChange: preserveLastMeaningfulChange
      ? (previous?.concept?.lastMeaningfulChange || input.concept.lastMeaningfulChange)
      : analysisTime,
  };
  let nextBase = {
    ...(formalCurrentPayload.identityDecision ? { identityDecision: structuredClone(formalCurrentPayload.identityDecision) } : {}),
    concept,
    claims: formalCurrentPayload.claims,
    evidence: formalCurrentPayload.evidence,
    citations: formalCurrentPayload.citations,
    relations: formalCurrentPayload.relations,
  };
  const hasImplicitAuditPayload = isFormalConceptStage(lifecycle.stage)
    && payloadHash(authoritativePayload) !== payloadHash(formalCurrentPayload);
  const initialDelta = revisionDelta(previous, nextBase);
  if (previous && !initialDelta.materialChange) {
    concept.lastMeaningfulChange = previous.concept.lastMeaningfulChange;
    nextBase = { ...nextBase, concept };
  }
  const comparablePrevious = previous ? structuredClone(previous) : null;
  if (comparablePrevious?.concept) delete comparablePrevious.concept.revision;
  const comparableNext = structuredClone(nextBase);
  if (comparableNext.concept) delete comparableNext.concept.revision;
  if (!forceRevision && !revisionAuditPayload && !hasImplicitAuditPayload
      && previous && payloadHash(comparablePrevious) === payloadHash(comparableNext)) {
    return { slug: concept.slug, revision: Number(existingRow.current_revision), changed: false, concept: previous.concept };
  }
  const revision = Number(existingRow?.current_revision || 0) + 1;
  const payload = { ...nextBase, concept: { ...concept, revision } };
  let revisionPayload = payload;
  const effectiveRevisionAuditPayload = revisionAuditPayload
    || (hasImplicitAuditPayload
      ? authoritativePayload
      : null);
  if (effectiveRevisionAuditPayload) {
    const auditInput = normalizedStoredPayload(structuredClone(effectiveRevisionAuditPayload));
    if (!auditInput) throw new Error("概念修订审计载荷无效");
    auditInput.concept = { ...conceptDomainFields(auditInput.concept), ...payload.concept };
    const auditEvidence = articleRowsForEvidence(database, auditInput.evidence);
    const auditEvidenceByClaim = new Map(auditInput.claims.map((claim) => [claim.key, []]));
    for (const evidence of auditEvidence) {
      for (const claimKey of evidence.supports) {
        if (!auditEvidenceByClaim.has(claimKey)) throw new Error(`审计证据引用未知主张：${claimKey}`);
        auditEvidenceByClaim.get(claimKey).push(evidence.url);
      }
    }
    const auditClaims = auditInput.claims.map((claim) => ({
      ...claim,
      confidence: bound(claim.confidence, 0, 1),
      evidenceUrls: unique(auditEvidenceByClaim.get(claim.key)),
    }));
    revisionPayload = {
      ...(auditInput.identityDecision ? { identityDecision: structuredClone(auditInput.identityDecision) } : {}),
      concept: { ...payload.concept },
      claims: auditClaims,
      evidence: auditEvidence,
      citations: auditInput.citations.map((citation) => ({
        field: citation.field,
        evidenceUrls: unique(citation.evidenceUrls),
      })),
      relations: auditInput.relations.map((relation) => ({
        ...relation,
        evidenceUrls: unique(relation.evidenceUrls),
      })),
    };
    validateShape(revisionPayload);
  }
  const fields = changedFields(previous, revisionPayload);
  const fieldDiff = revisionFieldDiff(previous, revisionPayload);
  const delta = revisionDelta(previous, revisionPayload);
  const review = revisionReview(revisionPayload);
  const createdAt = new Date().toISOString();
  if (transactional) database.exec("BEGIN IMMEDIATE");
  try {
    if (!existingRow) {
      database.prepare(`
        INSERT INTO concept_knowledge
          (slug, canonical_name, stage, heat, maturity, current_revision, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(concept.slug, concept.canonicalName, concept.stage, concept.heat, concept.maturity, revision, JSON.stringify(payload), analysisTime);
    } else {
      database.prepare(`
        UPDATE concept_knowledge SET canonical_name = ?, stage = ?, heat = ?, maturity = ?,
          current_revision = ?, payload_json = ?, updated_at = ?
        WHERE slug = ? AND current_revision = ? AND merged_into IS NULL
      `).run(
        concept.canonicalName, concept.stage, concept.heat, concept.maturity, revision,
        JSON.stringify(payload), analysisTime, concept.slug, existingRow.current_revision,
      );
    }
    database.prepare(`
      INSERT INTO concept_revisions
        (concept_slug, revision, previous_revision, payload_json, changed_fields_json, field_diff_json,
         confidence, needs_review, review_reasons_json, material_change, delta_json,
         provider, model, change_reason, analyzed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      concept.slug, revision, existingRow ? Number(existingRow.current_revision) : null,
      JSON.stringify(revisionPayload), JSON.stringify(fields), JSON.stringify(fieldDiff), review.confidence,
      review.needsReview ? 1 : 0, JSON.stringify(review.reviewReasons), delta.materialChange ? 1 : 0,
      JSON.stringify(delta), provider, model, reason, analysisTime, createdAt,
    );
    insertRevisionDetails(database, concept.slug, revision, revisionPayload);
    const aliasStatement = database.prepare(`
      INSERT INTO concept_aliases (alias_key, alias_text, concept_slug, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(alias_key) DO UPDATE SET
        alias_text = excluded.alias_text,
        concept_slug = CASE WHEN concept_aliases.concept_slug = excluded.concept_slug THEN excluded.concept_slug ELSE concept_aliases.concept_slug END
    `);
    for (const alias of aliases) {
      const key = normalizeConceptAliasKey(alias);
      if (!key) continue;
      const owner = database.prepare("SELECT concept_slug FROM concept_aliases WHERE alias_key = ?").get(key);
      if (owner && owner.concept_slug !== concept.slug) throw new Error(`概念别名已属于 ${owner.concept_slug}：${alias}`);
      aliasStatement.run(key, alias, concept.slug, analysisTime);
    }
    if (transactional) database.exec("COMMIT");
  } catch (error) {
    if (transactional) database.exec("ROLLBACK");
    throw error;
  }
  return {
    slug: concept.slug,
    revision,
    changed: true,
    changedFields: fields,
    fieldDiff,
    materialChange: delta.materialChange,
    delta,
    ...review,
    concept: payload.concept,
  };
}

export function maintainConceptKnowledgeLifecycles(database, {
  now = new Date().toISOString(),
} = {}) {
  if (!database || typeof database.prepare !== "function") {
    throw new Error("概念生命周期维护需要有效 database");
  }
  const maintenanceTime = isoValue(now);
  const rows = database.prepare(`
    SELECT *
    FROM concept_knowledge
    WHERE merged_into IS NULL
    ORDER BY slug
  `).all();
  const result = {
    analyzedAt: maintenanceTime,
    scannedCount: rows.length,
    updatedCount: 0,
    unchangedCount: 0,
    failedCount: 0,
    failures: [],
  };
  const currentEvidenceDecision = database.prepare(`
    SELECT publish_decision
    FROM articles
    WHERE url = ?
  `);

  const storedBySlug = new Map(rows.map((row) => [row.slug, recoverStoredPayload(database, row)]));
  const unsupportedSlugs = new Set(rows.filter((row) => {
    const payload = storedBySlug.get(row.slug)?.payload;
    return payload?.evidence?.length > 0 && payload.evidence.every((evidence) => (
      !["publish", "watch"].includes(currentEvidenceDecision.get(evidence.url)?.publish_decision)
    ));
  }).map((row) => row.slug));
  const currentFormalSlugs = new Set(rows
    .filter((row) => isFormalConceptStage(row.stage) && !unsupportedSlugs.has(row.slug))
    .map((row) => row.slug));

  for (const row of rows) {
    const stored = storedBySlug.get(row.slug);
    if (!stored.payload) {
      result.failedCount += 1;
      result.failures.push({ slug: row.slug, error: "没有可恢复的有效知识修订" });
      continue;
    }
    try {
      const currentPayload = structuredClone(stored.payload);
      if (unsupportedSlugs.has(row.slug)) currentPayload.concept.stage = "archived";
      currentPayload.relations = currentPayload.relations.filter((relation) => (
        currentFormalSlugs.has(relation.targetSlug)
      ));
      const currentRevision = database.prepare(`
        SELECT analyzed_at
        FROM concept_revisions
        WHERE concept_slug = ? AND revision = ?
      `).get(row.slug, row.current_revision);
      const applied = applyConceptKnowledgeRevision(database, currentPayload, {
        provider: "system-lifecycle",
        model: "lifecycle-maintenance-v1",
        analyzedAt: maintenanceTime,
        reason: "基于当前公开证据与时间窗口维护概念生命周期",
        lifecycleEvidenceDecisions: ["publish"],
        allowLifecycleRetirement: true,
        preserveLastMeaningfulChange: true,
        lifecycleStageChangedAt: currentRevision?.analyzed_at || row.updated_at,
      });
      if (applied.changed) result.updatedCount += 1;
      else result.unchangedCount += 1;
    } catch (error) {
      result.failedCount += 1;
      result.failures.push({
        slug: row.slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

export function listConceptKnowledgeRevisions(database, slug) {
  return database.prepare(`
    SELECT revision, previous_revision, payload_json, changed_fields_json, field_diff_json,
           confidence, needs_review, review_reasons_json, material_change, delta_json,
           provider, model, change_reason, analyzed_at, created_at
    FROM concept_revisions WHERE concept_slug = ? ORDER BY revision DESC
  `).all(slug).map((row) => ({
    revision: Number(row.revision),
    previousRevision: row.previous_revision == null ? null : Number(row.previous_revision),
    provider: row.provider,
    model: row.model,
    changeReason: row.change_reason,
    analyzedAt: row.analyzed_at,
    createdAt: row.created_at,
    changedFields: safeJson(row.changed_fields_json, []),
    fieldDiff: safeJson(row.field_diff_json, {}),
    confidence: Number(row.confidence || 0),
    needsReview: Boolean(row.needs_review),
    reviewReasons: safeJson(row.review_reasons_json, []),
    materialChange: Boolean(row.material_change),
    delta: safeJson(row.delta_json, { materialChange: Boolean(row.material_change), categories: [] }),
    payload: safeJson(row.payload_json, null),
  }));
}

function resolveConceptRow(database, identifier) {
  const text = String(identifier || "").trim();
  let row = database.prepare("SELECT * FROM concept_knowledge WHERE slug = ?").get(text);
  if (row) return row;
  const alias = database.prepare("SELECT concept_slug FROM concept_aliases WHERE alias_key = ?").get(normalizeConceptAliasKey(text));
  return alias ? database.prepare("SELECT * FROM concept_knowledge WHERE slug = ?").get(alias.concept_slug) : null;
}

function structurallyValidStoredPayload(value, expectedSlug, {
  allowLegacySparseCoreArrays = false,
} = {}) {
  const payload = normalizedStoredPayload(value);
  if (!payload || payload.concept.slug !== expectedSlug) return null;
  try {
    validateShape(payload, { allowLegacySparseCoreArrays });
    return payload;
  } catch {
    return null;
  }
}

function recoverStoredPayload(database, row) {
  const current = structurallyValidStoredPayload(safeJson(row.payload_json, null), row.slug);
  if (current) {
    return {
      payload: current,
      integrityStatus: "healthy",
      recoveredRevision: null,
      corruptRevision: null,
    };
  }
  const revisions = database.prepare(`
    SELECT revision, payload_json, provider
    FROM concept_revisions
    WHERE concept_slug = ?
    ORDER BY revision DESC
  `).all(row.slug);
  for (const revision of revisions) {
    // 新分析和新 revision 写入始终满足完整工程知识门禁。只有带明确
    // legacy-migration 来源的存量 revision 可在读取恢复时容忍核心数组
    // 全空；其余中文、主张、证据与引用绑定仍复用同一校验。
    const payload = structurallyValidStoredPayload(
      safeJson(revision.payload_json, null),
      row.slug,
      { allowLegacySparseCoreArrays: revision.provider === "legacy-migration" },
    );
    if (!payload) continue;
    return {
      payload,
      integrityStatus: "recovered",
      recoveredRevision: Number(revision.revision),
      corruptRevision: Number(row.current_revision || 0) || null,
    };
  }
  return {
    payload: null,
    integrityStatus: "corrupt",
    recoveredRevision: null,
    corruptRevision: Number(row.current_revision || 0) || null,
  };
}

function recoverLatestAuditPayload(database, row) {
  const latest = database.prepare(`
    SELECT payload_json, provider
    FROM concept_revisions
    WHERE concept_slug = ?
    ORDER BY revision DESC
    LIMIT 1
  `).get(row.slug);
  const payload = structurallyValidStoredPayload(
    safeJson(latest?.payload_json, null),
    row.slug,
    { allowLegacySparseCoreArrays: latest?.provider === "legacy-migration" },
  );
  return payload || recoverStoredPayload(database, row).payload;
}

function storedKnowledge(database, identifier) {
  const row = resolveConceptRow(database, identifier);
  if (!row) return null;
  if (row.merged_into) {
    return { redirectTo: row.merged_into, mergeReason: row.merge_reason || "概念已合并", mergedAt: row.merged_at };
  }
  const integrity = recoverStoredPayload(database, row);
  return { row, ...integrity };
}

function projectPayloadToEvidenceUrls(value, allowedUrls) {
  const payload = normalizedStoredPayload(value);
  if (!payload) return null;
  const evidence = payload.evidence.filter((item) => allowedUrls.has(item.url));
  const claims = payload.claims
    .map((claim) => ({ ...claim, evidenceUrls: unique((claim.evidenceUrls || []).filter((url) => allowedUrls.has(url))) }))
    .filter((claim) => claim.evidenceUrls.length > 0);
  const citations = payload.citations
    .map((citation) => ({ ...citation, evidenceUrls: unique((citation.evidenceUrls || []).filter((url) => allowedUrls.has(url))) }))
    .filter((citation) => citation.evidenceUrls.length > 0);
  const relations = payload.relations
    .map((relation) => ({ ...relation, evidenceUrls: unique((relation.evidenceUrls || []).filter((url) => allowedUrls.has(url))) }))
    .filter((relation) => relation.evidenceUrls.length > 0);
  return {
    ...(payload.identityDecision ? { identityDecision: payload.identityDecision } : {}),
    concept: payload.concept,
    claims,
    evidence,
    citations,
    relations,
  };
}

function currentEvidenceUrls(database, payload, decisions) {
  const accepted = new Set(decisions);
  const select = database.prepare("SELECT publish_decision FROM articles WHERE url = ?");
  return new Set((payload?.evidence || [])
    .filter((item) => accepted.has(item.publishDecision) && accepted.has(select.get(item.url)?.publish_decision))
    .map((item) => item.url));
}

function publicRevisionMetadata(revision, isFormal, allowedUrls) {
  if (!isFormal) return revision;
  const metadata = { ...revision };
  const fieldDiff = metadata.fieldDiff;
  metadata.payload = projectPayloadToEvidenceUrls(metadata.payload, allowedUrls);
  delete metadata.fieldDiff;
  const publicFieldDiff = Object.fromEntries(Object.entries(fieldDiff || {})
    .filter(([field]) => !["claims", "evidence", "citations", "relations"].includes(field)));
  return { ...metadata, fieldDiff: publicFieldDiff };
}

export function getConceptKnowledge(database, identifier) {
  const stored = storedKnowledge(database, identifier);
  if (!stored || stored.redirectTo) return stored;
  const { row, payload, integrityStatus, recoveredRevision, corruptRevision } = stored;
  if (!payload) {
    return {
      slug: row.slug,
      integrityStatus,
      corruptRevision,
    };
  }
  const aliases = database.prepare("SELECT alias_text FROM concept_aliases WHERE concept_slug = ? ORDER BY alias_text").all(row.slug).map((item) => item.alias_text);
  const isFormal = isFormalConceptStage(payload.concept.stage);
  const allowedUrls = currentEvidenceUrls(database, payload, isFormal ? ["publish"] : ["publish", "watch"]);
  const projected = projectPayloadToEvidenceUrls(payload, allowedUrls);
  const revisions = listConceptKnowledgeRevisions(database, row.slug)
    .map((revision) => publicRevisionMetadata(revision, isFormal, allowedUrls));
  return {
    concept: {
      ...payload.concept,
      ...(payload.identityDecision ? { identityDecision: payload.identityDecision } : {}),
      aliases: unique([...payload.concept.aliases, ...aliases]),
      claims: projected.claims,
      evidence: projected.evidence,
      citations: projected.citations,
      relations: projected.relations,
      revisions,
      integrityStatus,
      ...(recoveredRevision == null ? {} : { recoveredRevision }),
      ...(corruptRevision == null ? {} : { corruptRevision }),
    },
  };
}

export function listConceptKnowledge(database, { includeMerged = false } = {}) {
  const rows = database.prepare(`SELECT slug FROM concept_knowledge ${includeMerged ? "" : "WHERE merged_into IS NULL"} ORDER BY updated_at DESC`).all();
  return rows.map((row) => getConceptKnowledge(database, row.slug)).filter((value) => value?.concept);
}

export function listConceptRedirects(database) {
  return Object.fromEntries(database.prepare(`
    SELECT slug, merged_into, merge_reason, merged_at
    FROM concept_knowledge
    WHERE merged_into IS NOT NULL
    ORDER BY merged_at DESC, slug
  `).all().map((row) => [row.slug, {
    redirectTo: row.merged_into,
    reason: row.merge_reason || "同义概念合并",
    mergedAt: row.merged_at,
  }]));
}

function mergeEquivalentConceptPayloads(canonicalPayload, sourcePayload, { fromSlug, intoSlug } = {}) {
  const canonical = normalizedStoredPayload(canonicalPayload);
  const source = normalizedStoredPayload(sourcePayload);
  if (!canonical || !source) throw new Error("概念合并载荷无效或不可恢复");

  const concept = conceptDomainFields(canonical.concept);
  for (const field of REQUIRED_CONCEPT_ARRAYS) {
    concept[field] = unique([...(canonical.concept[field] || []), ...(source.concept[field] || [])]);
  }
  concept.slug = intoSlug;
  concept.aliases = unique([
    ...(concept.aliases || []),
    source.concept.canonicalName,
    source.concept.name,
    fromSlug,
    ...(source.concept.aliases || []),
  ]);

  const evidenceByUrl = new Map();
  const stanceRank = { context: 0, support: 1, conflict: 2 };
  for (const evidence of [...canonical.evidence, ...source.evidence]) {
    const existing = evidenceByUrl.get(evidence.url);
    if (!existing) {
      evidenceByUrl.set(evidence.url, { ...evidence, supports: unique(evidence.supports) });
      continue;
    }
    evidenceByUrl.set(evidence.url, {
      ...existing,
      supports: unique([...(existing.supports || []), ...(evidence.supports || [])]),
      stance: stanceRank[evidence.stance] > stanceRank[existing.stance] ? evidence.stance : existing.stance,
    });
  }

  const claimsByKey = new Map();
  for (const claim of [...canonical.claims, ...source.claims]) {
    const existing = claimsByKey.get(claim.key);
    const normalize = (value) => String(value || "").trim().replace(/\s+/gu, " ");
    if (existing && (
      normalize(existing.text) !== normalize(claim.text)
        || normalize(existing.kind) !== normalize(claim.kind)
    )) {
      throw new Error(`主张 claim key 语义冲突：${claim.key}；合并前必须先归一主张身份`);
    }
    claimsByKey.set(claim.key, existing ? {
      ...existing,
      confidence: Math.max(Number(existing.confidence || 0), Number(claim.confidence || 0)),
      evidenceUrls: unique([...(existing.evidenceUrls || []), ...(claim.evidenceUrls || [])]),
    } : { ...claim, evidenceUrls: unique(claim.evidenceUrls) });
  }

  const canonicalCitationByField = new Map(canonical.citations.map((item) => [item.field, item]));
  const sourceCitationByField = new Map(source.citations.map((item) => [item.field, item]));
  const citations = [];
  for (const field of new Set([...canonicalCitationByField.keys(), ...sourceCitationByField.keys()])) {
    const canonicalCitation = canonicalCitationByField.get(field);
    const sourceCitation = sourceCitationByField.get(field);
    const isMergedArray = REQUIRED_CONCEPT_ARRAYS.includes(field);
    const sameMeaning = canonicalJson(canonical.concept[field]) === canonicalJson(source.concept[field]);
    const evidenceUrls = unique([
      ...(canonicalCitation?.evidenceUrls || []),
      ...((isMergedArray || sameMeaning) ? (sourceCitation?.evidenceUrls || []) : []),
    ]);
    if (evidenceUrls.length > 0) citations.push({ field, evidenceUrls });
  }

  const relationByKey = new Map();
  for (const relation of [...canonical.relations, ...source.relations]) {
    const targetSlug = relation.targetSlug === fromSlug ? intoSlug : relation.targetSlug;
    if (!targetSlug || targetSlug === intoSlug) continue;
    const key = `${relation.type}:${targetSlug}`;
    const existing = relationByKey.get(key);
    const existingConfidence = Number(existing?.confidence || 0);
    const incomingConfidence = Number(relation.confidence || 0);
    const preferred = existing && existingConfidence >= incomingConfidence ? existing : relation;
    relationByKey.set(key, existing ? {
      ...preferred,
      targetSlug,
      confidence: Math.max(existingConfidence, incomingConfidence),
      evidenceUrls: unique([...(existing.evidenceUrls || []), ...(relation.evidenceUrls || [])]),
    } : { ...relation, targetSlug, evidenceUrls: unique(relation.evidenceUrls) });
  }

  return {
    concept,
    claims: [...claimsByKey.values()],
    evidence: [...evidenceByUrl.values()],
    citations,
    relations: [...relationByKey.values()],
  };
}

function canonicalizeMergedRelations(database, payload, sourceSlug, { fromSlug, intoSlug } = {}) {
  const relationByKey = new Map();
  for (const relation of payload.relations || []) {
    let targetSlug = relation.targetSlug === fromSlug ? intoSlug : relation.targetSlug;
    const visited = new Set();
    while (targetSlug && !visited.has(targetSlug)) {
      visited.add(targetSlug);
      const target = database.prepare("SELECT stage, merged_into FROM concept_knowledge WHERE slug = ?").get(targetSlug);
      if (!target) {
        targetSlug = null;
        break;
      }
      if (!target.merged_into) {
        if (!isFormalConceptStage(target.stage)) targetSlug = null;
        break;
      }
      targetSlug = target.merged_into;
    }
    if (!targetSlug || targetSlug === sourceSlug) continue;
    const key = `${relation.type}:${targetSlug}`;
    const existing = relationByKey.get(key);
    const existingConfidence = Number(existing?.confidence || 0);
    const incomingConfidence = Number(relation.confidence || 0);
    const preferred = existing && existingConfidence >= incomingConfidence ? existing : relation;
    relationByKey.set(key, existing ? {
      ...preferred,
      targetSlug,
      confidence: Math.max(existingConfidence, incomingConfidence),
      evidenceUrls: unique([...(existing.evidenceUrls || []), ...(relation.evidenceUrls || [])]),
    } : {
      ...relation,
      targetSlug,
      evidenceUrls: unique(relation.evidenceUrls),
    });
  }
  return { ...payload, relations: [...relationByKey.values()] };
}

function projectMergedPayloadToPublishCurrent(database, payload) {
  const currentDecision = database.prepare("SELECT publish_decision FROM articles WHERE url = ?");
  const publishEvidence = payload.evidence.filter((evidence) => (
    currentDecision.get(evidence.url)?.publish_decision === "publish"
  ));
  const publishedClaimKeys = new Set(publishEvidence.flatMap((evidence) => evidence.supports || []));
  const claims = payload.claims.filter((claim) => publishedClaimKeys.has(claim.key));
  const claimKeys = new Set(claims.map((claim) => claim.key));
  const evidence = publishEvidence
    .map((item) => ({ ...item, supports: unique((item.supports || []).filter((key) => claimKeys.has(key))) }))
    .filter((item) => item.supports.length > 0);
  const publishUrls = new Set(evidence.map((item) => item.url));
  return {
    ...(payload.identityDecision ? { identityDecision: payload.identityDecision } : {}),
    concept: payload.concept,
    claims,
    evidence,
    citations: payload.citations
      .map((citation) => ({
        ...citation,
        evidenceUrls: unique((citation.evidenceUrls || []).filter((url) => publishUrls.has(url))),
      }))
      .filter((citation) => citation.evidenceUrls.length > 0),
    relations: payload.relations
      .map((relation) => ({
        ...relation,
        evidenceUrls: unique((relation.evidenceUrls || []).filter((url) => publishUrls.has(url))),
      }))
      .filter((relation) => relation.evidenceUrls.length > 0),
  };
}

function rewriteInboundRelations(database, {
  fromSlug,
  intoSlug,
  reason,
  mergedAt,
  provider,
  model,
} = {}) {
  const rows = database.prepare(`
    SELECT *
    FROM concept_knowledge
    WHERE merged_into IS NULL AND slug NOT IN (?, ?)
    ORDER BY slug
  `).all(fromSlug, intoSlug);
  let updatedCount = 0;
  for (const row of rows) {
    const stored = recoverStoredPayload(database, row);
    if (!stored.payload || !(stored.payload.relations || []).some((relation) => relation.targetSlug === fromSlug)) continue;
    const next = canonicalizeMergedRelations(database, stored.payload, row.slug, { fromSlug, intoSlug });
    const applied = applyConceptKnowledgeRevision(database, next, {
      provider,
      model,
      analyzedAt: mergedAt,
      reason,
      transactional: false,
    });
    if (applied.changed) updatedCount += 1;
  }
  return updatedCount;
}

export function mergeConceptKnowledge(database, {
  fromSlug,
  intoSlug,
  reason,
  mergedAt = new Date().toISOString(),
  provider = "system-merge",
  model = "concept-merge-v1",
} = {}) {
  if (!fromSlug || !intoSlug || fromSlug === intoSlug) throw new Error("概念合并 slug 无效");
  const mergeReason = String(reason || "同义概念合并").trim();
  const mergeTime = isoValue(mergedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    const from = database.prepare("SELECT * FROM concept_knowledge WHERE slug = ?").get(fromSlug);
    const into = database.prepare("SELECT * FROM concept_knowledge WHERE slug = ? AND merged_into IS NULL").get(intoSlug);
    if (!from || !into) throw new Error("概念合并对象不存在或规范目标已经合并");
    if (from.merged_into) {
      if (from.merged_into !== intoSlug) throw new Error(`概念已经合并到其他目标：${from.merged_into}`);
      database.exec("COMMIT");
      return {
        fromSlug,
        intoSlug,
        redirectTo: intoSlug,
        revision: Number(into.current_revision),
        changed: false,
        resumed: true,
      };
    }
    const sourcePayload = recoverLatestAuditPayload(database, from);
    const canonicalPayload = recoverLatestAuditPayload(database, into);
    if (!sourcePayload || !canonicalPayload) throw new Error("概念合并对象没有可恢复的有效知识修订");

    const sourceAliases = database.prepare(`
      SELECT alias_key, alias_text
      FROM concept_aliases
      WHERE concept_slug = ?
    `).all(fromSlug);
    const transferAlias = database.prepare(`
      INSERT INTO concept_aliases (alias_key, alias_text, concept_slug, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(alias_key) DO UPDATE SET
        alias_text = excluded.alias_text,
        concept_slug = excluded.concept_slug
    `);
    for (const alias of sourceAliases) transferAlias.run(alias.alias_key, alias.alias_text, intoSlug, mergeTime);
    for (const alias of [fromSlug, from.canonical_name]) {
      const key = normalizeConceptAliasKey(alias);
      if (key) transferAlias.run(key, alias, intoSlug, mergeTime);
    }

    const mergedAuditPayload = canonicalizeMergedRelations(database, mergeEquivalentConceptPayloads(
      canonicalPayload,
      sourcePayload,
      { fromSlug, intoSlug },
    ), intoSlug, { fromSlug, intoSlug });
    const mergedCurrentPayload = projectMergedPayloadToPublishCurrent(database, mergedAuditPayload);
    const applied = applyConceptKnowledgeRevision(database, mergedCurrentPayload, {
      provider,
      model,
      analyzedAt: mergeTime,
      reason: mergeReason,
      transactional: false,
      forceRevision: true,
      revisionAuditPayload: mergedAuditPayload,
    });
    const redirectedInboundRelationCount = rewriteInboundRelations(database, {
      fromSlug,
      intoSlug,
      reason: mergeReason,
      mergedAt: mergeTime,
      provider,
      model,
    });
    const redirected = database.prepare(`
      UPDATE concept_knowledge
      SET merged_into = ?, merge_reason = ?, merged_at = ?
      WHERE slug = ? AND merged_into IS NULL
    `).run(intoSlug, mergeReason, mergeTime, fromSlug);
    if (Number(redirected.changes || 0) !== 1) throw new Error("概念合并重定向写入冲突");
    database.exec("COMMIT");
    return {
      fromSlug,
      intoSlug,
      redirectTo: intoSlug,
      revision: applied.revision,
      changed: applied.changed,
      resumed: false,
      redirectedInboundRelationCount,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function mergeKnowledgePayload(previousKnowledge, incoming) {
  const previous = previousKnowledge?.concept ? {
    identityDecision: previousKnowledge.identityDecision || previousKnowledge.concept.identityDecision || null,
    concept: conceptDomainFields(previousKnowledge.concept),
    claims: previousKnowledge.claims || previousKnowledge.concept.claims || [],
    evidence: previousKnowledge.evidence || previousKnowledge.concept.evidence || [],
    citations: previousKnowledge.citations || previousKnowledge.concept.citations || [],
    relations: previousKnowledge.relations || previousKnowledge.concept.relations || [],
  } : null;
  if (!previous) return incoming;
  const mergedConcept = {
    ...conceptDomainFields(previous.concept),
    ...conceptDomainFields(incoming.concept),
    aliases: unique([...(previous.concept.aliases || []), ...(incoming.concept.aliases || [])]),
    controversies: unique([...(previous.concept.controversies || []), ...(incoming.concept.controversies || [])]),
  };
  const evidenceByUrl = new Map((previous.evidence || []).map((item) => [item.url, item]));
  for (const evidence of incoming.evidence || []) evidenceByUrl.set(evidence.url, evidence);
  const claimsByKey = new Map((previous.claims || []).map((item) => [item.key, { ...item, evidenceUrls: undefined }]));
  for (const claim of incoming.claims || []) {
    const existing = claimsByKey.get(claim.key);
    const normalizedText = (value) => String(value || "").trim().replace(/\s+/gu, " ");
    if (existing && (
      normalizedText(existing.text) !== normalizedText(claim.text)
        || normalizedText(existing.kind) !== normalizedText(claim.kind)
    )) {
      throw new Error(`主张 claim key 语义冲突：${claim.key}；文本或类型变化时必须使用新的 key`);
    }
    claimsByKey.set(claim.key, claim);
  }
  const relationByKey = new Map((previous.relations || []).map((item) => [`${item.type}:${item.targetSlug}`, item]));
  for (const relation of incoming.relations || []) relationByKey.set(`${relation.type}:${relation.targetSlug}`, relation);
  const previousCitationByField = new Map((previous.citations || []).map((item) => [item.field, item]));
  const citationByField = new Map();
  for (const citation of incoming.citations || []) {
    const existing = previousCitationByField.get(citation.field);
    const fieldChanged = canonicalJson(previous.concept?.[citation.field]) !== canonicalJson(mergedConcept[citation.field]);
    citationByField.set(citation.field, {
      ...citation,
      // A citation proves one concrete field meaning, not merely the field
      // name. Preserve accumulated evidence only while that meaning is
      // unchanged. When it changes, the incoming analysis must explicitly
      // re-cite every URL that still supports the new wording.
      evidenceUrls: fieldChanged
        ? unique(citation.evidenceUrls)
        : unique([...(existing?.evidenceUrls || []), ...(citation.evidenceUrls || [])]),
    });
  }
  for (const [field, citation] of previousCitationByField) {
    if (citationByField.has(field)) continue;
    if (canonicalJson(previous.concept?.[field]) !== canonicalJson(mergedConcept[field])) continue;
    citationByField.set(field, { ...citation, evidenceUrls: unique(citation.evidenceUrls) });
  }
  return {
    ...(incoming.identityDecision || previous.identityDecision
      ? { identityDecision: incoming.identityDecision || previous.identityDecision }
      : {}),
    concept: mergedConcept,
    claims: [...claimsByKey.values()],
    evidence: [...evidenceByUrl.values()],
    citations: [...citationByField.values()],
    relations: [...relationByKey.values()],
  };
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(values.length, limit) }, worker));
  return output;
}

function isCompletedBackfillBoundary(state, row, knowledgeSchemaVersion, analyzerVersion) {
  return state?.status === "completed"
    && state.content_hash === row.content_hash
    && state.input_contract_hash === conceptArticleInputContractHash(row)
    && state.knowledge_schema_version === knowledgeSchemaVersion
    && state.analyzer_version === analyzerVersion;
}

function analyzedPayloads(analyzed) {
  const values = Array.isArray(analyzed?.payloads)
    ? analyzed.payloads
    : Array.isArray(analyzed)
      ? analyzed
      : [analyzed?.payload || analyzed];
  if (values.length < 1 || values.length > 8) throw new Error("概念回填每篇文章必须产生 1-8 个概念对象");
  const slugs = new Set();
  for (const value of values) {
    const slug = String(value?.concept?.slug || "").trim();
    if (!slug) throw new Error("概念回填输出缺少 concept.slug");
    if (slugs.has(slug)) throw new Error(`同一文章重复输出概念：${slug}`);
    slugs.add(slug);
  }
  return values;
}

export function getConceptBackfillAudit(database, articleUrl) {
  if (!database || typeof database.prepare !== "function") throw new Error("概念回填审计需要有效 database");
  const url = String(articleUrl || "").trim();
  if (!url) throw new Error("概念回填审计需要 articleUrl");
  const state = database.prepare(`
    SELECT article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version,
           status, attempted_at, completed_at, last_error, concept_slug, revision, current_attempt_id
    FROM concept_backfill
    WHERE article_url = ?
  `).get(url);
  if (!state) return null;
  const attemptCount = Number(database.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_backfill_attempts
    WHERE article_url = ?
  `).get(url)?.count || 0);
  let outputs = [];
  if (state.current_attempt_id) {
    outputs = database.prepare(`
      SELECT concept_slug AS slug, revision
      FROM concept_backfill_outputs
      WHERE attempt_id = ?
      ORDER BY output_index, concept_slug
    `).all(state.current_attempt_id).map((item) => ({
      slug: item.slug,
      revision: Number(item.revision),
    }));
  }
  if (outputs.length === 0 && state.status === "completed" && state.concept_slug && state.revision) {
    outputs = [{ slug: state.concept_slug, revision: Number(state.revision) }];
  }
  return {
    articleUrl: state.article_url,
    contentHash: state.content_hash,
    inputContractHash: state.input_contract_hash,
    knowledgeSchemaVersion: state.knowledge_schema_version,
    analyzerVersion: state.analyzer_version,
    status: state.status,
    attemptedAt: state.attempted_at,
    completedAt: state.completed_at,
    lastError: state.last_error,
    attemptCount: attemptCount || 1,
    outputs,
  };
}

export async function runConceptKnowledgeBackfill({
  database,
  analyzeArticle,
  batchSize = 20,
  concurrency = 1,
  now = new Date().toISOString(),
  articleUrls = null,
  force = false,
  knowledgeSchemaVersion = CONCEPT_KNOWLEDGE_SCHEMA_VERSION,
  analyzerVersion = CONCEPT_ANALYZER_VERSION,
  leaseMs = Number(process.env.RADAR_CONCEPT_BACKFILL_LEASE_MS || 15 * 60 * 1000),
} = {}) {
  if (!database || typeof database.prepare !== "function") throw new Error("概念回填需要有效 database");
  if (typeof analyzeArticle !== "function") throw new Error("概念回填需要 analyzeArticle");
  const limit = Number(batchSize);
  const workers = Number(concurrency);
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(workers) || workers < 1) throw new Error("概念回填 batchSize/concurrency 必须是正整数");
  if (!Number.isFinite(Number(leaseMs)) || Number(leaseMs) < 1_000) throw new Error("概念回填 leaseMs 必须不小于 1000");
  const schemaVersion = String(knowledgeSchemaVersion || "").trim();
  const extractorVersion = String(analyzerVersion || "").trim();
  if (!schemaVersion || !extractorVersion) throw new Error("概念回填 knowledgeSchemaVersion/analyzerVersion 不能为空");
  const claimedAt = isoValue(now);
  const leaseExpiresAt = new Date(new Date(claimedAt).getTime() + Number(leaseMs)).toISOString();
  let rows;
  if (Array.isArray(articleUrls)) {
    const orderedUrls = unique(articleUrls.map((url) => String(url || "").trim()).filter(Boolean));
    if (orderedUrls.length === 0) {
      rows = [];
    } else {
      const placeholders = orderedUrls.map(() => "?").join(", ");
      const priority = new Map(orderedUrls.map((url, index) => [url, index]));
      rows = database.prepare(`
        SELECT *
        FROM articles
        WHERE publish_decision IN ('publish', 'watch')
          AND url IN (${placeholders})
      `).all(...orderedUrls).sort((left, right) => priority.get(left.url) - priority.get(right.url));
    }
  } else {
    rows = database.prepare(`
      SELECT a.*
      FROM articles a
      LEFT JOIN concept_backfill b ON b.article_url = a.url
      WHERE a.publish_decision IN ('publish', 'watch')
      ORDER BY
        CASE
          WHEN b.article_url IS NULL THEN 0
          WHEN b.status IN ('failed', 'conflict') THEN 1
          ELSE 2
        END,
        COALESCE(b.attempted_at, a.discovered_at),
        a.discovered_at,
        a.url
    `).all();
  }
  const state = database.prepare(`
    SELECT content_hash, input_contract_hash, knowledge_schema_version, analyzer_version, status
    FROM concept_backfill
    WHERE article_url = ?
  `);
  const completed = force ? [] : rows.filter((row) => (
    isCompletedBackfillBoundary(state.get(row.url), row, schemaVersion, extractorVersion)
  ));
  const candidates = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    const lease = database.prepare("SELECT content_hash, owner_token, lease_expires_at FROM concept_backfill_leases WHERE article_url = ?");
    const claim = database.prepare(`
      INSERT INTO concept_backfill_leases (article_url, content_hash, owner_token, claimed_at, lease_expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(article_url) DO UPDATE SET
        content_hash = excluded.content_hash,
        owner_token = excluded.owner_token,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at
    `);
    const supersedeAttempt = database.prepare(`
      UPDATE concept_backfill_attempts
      SET status = 'superseded', completed_at = ?, last_error = 'lease superseded by a newer backfill attempt'
      WHERE article_url = ? AND owner_token = ? AND status = 'running'
    `);
    const insertAttempt = database.prepare(`
      INSERT INTO concept_backfill_attempts
        (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version,
         owner_token, status, attempted_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
    `);
    for (const row of rows) {
      if (candidates.length >= limit) break;
      const item = state.get(row.url);
      if (!force && isCompletedBackfillBoundary(item, row, schemaVersion, extractorVersion)) continue;
      const active = lease.get(row.url);
      if (active && active.content_hash === row.content_hash && timeValue(active.lease_expires_at) > timeValue(claimedAt)) continue;
      if (active?.owner_token) supersedeAttempt.run(claimedAt, row.url, active.owner_token);
      const ownerToken = randomUUID();
      const inputContractHash = conceptArticleInputContractHash(row);
      claim.run(row.url, row.content_hash, ownerToken, claimedAt, leaseExpiresAt);
      const inserted = insertAttempt.run(
        row.url, row.content_hash, inputContractHash, schemaVersion, extractorVersion, ownerToken, claimedAt,
      );
      candidates.push({ ...row, inputContractHash, ownerToken, attemptId: Number(inserted.lastInsertRowid) });
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const results = await mapLimit(candidates, workers, async (row) => {
    try {
      const analyzed = await analyzeArticle(row);
      const incomingPayloads = analyzedPayloads(analyzed);
      database.exec("BEGIN IMMEDIATE");
      try {
        const lease = database.prepare("SELECT owner_token, content_hash FROM concept_backfill_leases WHERE article_url = ?").get(row.url);
        if (!lease || lease.owner_token !== row.ownerToken || lease.content_hash !== row.content_hash) {
          database.prepare(`
            UPDATE concept_backfill_attempts
            SET status = 'superseded', completed_at = ?, last_error = 'lease ownership changed before commit'
            WHERE id = ? AND status = 'running'
          `).run(claimedAt, row.attemptId);
          database.exec("COMMIT");
          return { url: row.url, status: "superseded" };
        }
        const currentRow = database.prepare(`
          SELECT content_hash, content_roles_json, publish_decision
          FROM articles
          WHERE url = ?
        `).get(row.url);
        if (!currentRow
          || !["publish", "watch"].includes(currentRow.publish_decision)
          || conceptArticleInputContractHash(currentRow) !== row.inputContractHash) {
          const message = "article input contract changed during analysis";
          database.prepare(`
            UPDATE concept_backfill_attempts
            SET status = 'conflict', completed_at = ?, last_error = ?
            WHERE id = ? AND status = 'running'
          `).run(claimedAt, message, row.attemptId);
          database.prepare(`
            INSERT INTO concept_backfill
              (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version, status,
               attempted_at, completed_at, last_error, concept_slug, revision, current_attempt_id)
            VALUES (?, ?, ?, ?, ?, 'conflict', ?, NULL, ?, NULL, NULL, ?)
            ON CONFLICT(article_url) DO UPDATE SET
              content_hash = excluded.content_hash,
              input_contract_hash = excluded.input_contract_hash,
              knowledge_schema_version = excluded.knowledge_schema_version,
              analyzer_version = excluded.analyzer_version,
              status = 'conflict', attempted_at = excluded.attempted_at, completed_at = NULL,
              last_error = excluded.last_error, concept_slug = NULL, revision = NULL,
              current_attempt_id = excluded.current_attempt_id
          `).run(
            row.url, row.content_hash, row.inputContractHash, schemaVersion, extractorVersion,
            claimedAt, message, row.attemptId,
          );
          database.prepare("DELETE FROM concept_backfill_leases WHERE article_url = ? AND owner_token = ?").run(row.url, row.ownerToken);
          database.exec("COMMIT");
          return { url: row.url, status: "conflict", error: message };
        }

        const metadata = (analyzed && typeof analyzed === "object" && !Array.isArray(analyzed)) ? analyzed : {};
        const appliedOutputs = [];
        for (const incoming of incomingPayloads) {
          const existing = storedKnowledge(database, incoming.concept.slug);
          const reachableExisting = existing?.payload
            ? projectPayloadToEvidenceUrls(
              existing.payload,
              currentEvidenceUrls(database, existing.payload, ["publish", "watch"]),
            )
            : null;
          const merged = mergeKnowledgePayload(reachableExisting, incoming);
          const applied = applyConceptKnowledgeRevision(database, merged, {
            provider: metadata.provider || incoming?.analysisMetadata?.provider || "injected",
            model: metadata.model || incoming?.analysisMetadata?.model || "injected",
            analyzedAt: metadata.analyzedAt || incoming?.analysisMetadata?.analyzedAt || claimedAt,
            reason: metadata.reason || "历史概念证据回溯",
            knownIdentitySlugs: metadata.knownIdentitySlugs || [],
            transactional: false,
          });
          appliedOutputs.push({ slug: applied.slug, revision: applied.revision });
        }
        const first = appliedOutputs[0];
        database.prepare(`
          INSERT INTO concept_backfill
            (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version, status,
             attempted_at, completed_at, last_error, concept_slug, revision, current_attempt_id)
          VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, NULL, ?, ?, ?)
          ON CONFLICT(article_url) DO UPDATE SET
            content_hash = excluded.content_hash,
            input_contract_hash = excluded.input_contract_hash,
            knowledge_schema_version = excluded.knowledge_schema_version,
            analyzer_version = excluded.analyzer_version,
            status = 'completed', attempted_at = excluded.attempted_at,
            completed_at = excluded.completed_at, last_error = NULL,
            concept_slug = excluded.concept_slug, revision = excluded.revision,
            current_attempt_id = excluded.current_attempt_id
        `).run(
          row.url, row.content_hash, row.inputContractHash, schemaVersion, extractorVersion,
          claimedAt, claimedAt, first.slug, first.revision, row.attemptId,
        );
        const insertOutput = database.prepare(`
          INSERT INTO concept_backfill_outputs (attempt_id, output_index, concept_slug, revision)
          VALUES (?, ?, ?, ?)
        `);
        appliedOutputs.forEach((output, index) => {
          insertOutput.run(row.attemptId, index, output.slug, output.revision);
        });
        database.prepare(`
          UPDATE concept_backfill_attempts
          SET status = 'completed', completed_at = ?, last_error = NULL
          WHERE id = ? AND status = 'running'
        `).run(claimedAt, row.attemptId);
        database.prepare("DELETE FROM concept_backfill_leases WHERE article_url = ? AND owner_token = ?").run(row.url, row.ownerToken);
        database.exec("COMMIT");
        return { url: row.url, status: "updated", outputs: appliedOutputs };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let releasedOwnLease = false;
      database.exec("BEGIN IMMEDIATE");
      try {
        const released = database.prepare("DELETE FROM concept_backfill_leases WHERE article_url = ? AND owner_token = ?").run(row.url, row.ownerToken);
        releasedOwnLease = Number(released.changes || 0) > 0;
        if (releasedOwnLease) {
          database.prepare(`
            UPDATE concept_backfill_attempts
            SET status = 'failed', completed_at = ?, last_error = ?
            WHERE id = ? AND status = 'running'
          `).run(claimedAt, message, row.attemptId);
          database.prepare(`
            INSERT INTO concept_backfill
              (article_url, content_hash, input_contract_hash, knowledge_schema_version, analyzer_version, status,
               attempted_at, completed_at, last_error, concept_slug, revision, current_attempt_id)
            VALUES (?, ?, ?, ?, ?, 'failed', ?, NULL, ?, NULL, NULL, ?)
            ON CONFLICT(article_url) DO UPDATE SET
              content_hash = excluded.content_hash,
              input_contract_hash = excluded.input_contract_hash,
              knowledge_schema_version = excluded.knowledge_schema_version,
              analyzer_version = excluded.analyzer_version,
              status = 'failed', attempted_at = excluded.attempted_at, completed_at = NULL,
              last_error = excluded.last_error, concept_slug = NULL, revision = NULL,
              current_attempt_id = excluded.current_attempt_id
          `).run(
            row.url, row.content_hash, row.inputContractHash, schemaVersion, extractorVersion,
            claimedAt, message, row.attemptId,
          );
        } else {
          database.prepare(`
            UPDATE concept_backfill_attempts
            SET status = 'superseded', completed_at = ?, last_error = ?
            WHERE id = ? AND status = 'running'
          `).run(claimedAt, message, row.attemptId);
        }
        database.exec("COMMIT");
      } catch (releaseError) {
        database.exec("ROLLBACK");
        throw releaseError;
      }
      // 租约已经被更新的 owner 取代时，旧 owner 的失败不能污染权威 backlog 状态。
      if (!releasedOwnLease) return { url: row.url, status: "superseded" };
      return { url: row.url, status: "failed", error: message };
    }
  });
  const processedCount = results.filter((item) => item.status === "updated").length;
  const conflictCount = results.filter((item) => item.status === "conflict").length;
  const failedCount = results.filter((item) => item.status === "failed").length;
  const resultByUrl = new Map(results.map((item) => [item.url, item]));
  const remaining = rows.filter((row) => {
    if (force) return resultByUrl.get(row.url)?.status !== "updated";
    return !isCompletedBackfillBoundary(state.get(row.url), row, schemaVersion, extractorVersion);
  }).length;
  return {
    processedCount,
    processedUrls: results.filter((item) => item.status === "updated").map((item) => item.url),
    skippedCount: completed.length,
    conflictCount,
    failedCount,
    hasMore: remaining > 0,
    failures: results.filter((item) => item.status !== "updated").map(safeOperationalFailure),
  };
}

export function getConceptKnowledgeStatus(database) {
  const conceptCounts = database.prepare(`
    SELECT
      SUM(CASE WHEN merged_into IS NULL AND stage NOT IN ('candidate', 'archived') THEN 1 ELSE 0 END) AS formal,
      SUM(CASE WHEN merged_into IS NULL AND stage = 'candidate' THEN 1 ELSE 0 END) AS candidates
    FROM concept_knowledge
  `).get();
  const revisionCount = Number(database.prepare("SELECT COUNT(*) AS count FROM concept_revisions").get().count || 0);
  const evidenceCount = Number(database.prepare("SELECT COUNT(*) AS count FROM concept_revision_evidence").get().count || 0);
  const claimCount = Number(database.prepare("SELECT COUNT(*) AS count FROM concept_revision_claims").get().count || 0);
  const pendingRows = database.prepare(`
    SELECT a.content_hash, a.content_roles_json,
           b.content_hash AS backfill_content_hash,
           b.input_contract_hash, b.knowledge_schema_version, b.analyzer_version, b.status
    FROM articles a
    LEFT JOIN concept_backfill b ON b.article_url = a.url
    WHERE a.publish_decision IN ('publish', 'watch')
  `).all();
  const pendingArticleCount = pendingRows.filter((row) => !isCompletedBackfillBoundary({
    status: row.status,
    content_hash: row.backfill_content_hash,
    input_contract_hash: row.input_contract_hash,
    knowledge_schema_version: row.knowledge_schema_version,
    analyzer_version: row.analyzer_version,
  }, row, CONCEPT_KNOWLEDGE_SCHEMA_VERSION, CONCEPT_ANALYZER_VERSION)).length;
  const failureRows = database.prepare(`
    SELECT b.article_url, b.input_contract_hash, b.status, b.attempted_at, b.last_error,
           a.content_hash AS article_content_hash, a.content_roles_json
    FROM concept_backfill b
    INNER JOIN articles a
      ON a.url = b.article_url AND a.content_hash = b.content_hash
    WHERE a.publish_decision IN ('publish', 'watch')
      AND b.status IN ('failed', 'conflict')
      AND b.knowledge_schema_version = ?
      AND b.analyzer_version = ?
    ORDER BY b.attempted_at DESC, b.article_url
  `).all(CONCEPT_KNOWLEDGE_SCHEMA_VERSION, CONCEPT_ANALYZER_VERSION);
  const currentFailures = failureRows.filter((row) => (
    row.input_contract_hash === conceptArticleInputContractHash({
      content_hash: row.article_content_hash,
      content_roles_json: row.content_roles_json,
    })
  ));
  const failedArticleCount = currentFailures.length;
  const recentFailures = currentFailures.slice(0, 10).map((row) => ({
    articleUrl: safeOperationalArticleUrl(row.article_url),
    status: row.status,
    attemptedAt: row.attempted_at,
    errorCategory: conceptAnalysisFailureCategory(row.last_error, row.status),
  }));
  const integrityCounts = database.prepare(`
    SELECT slug
    FROM concept_knowledge
    WHERE merged_into IS NULL
  `).all().reduce((counts, row) => {
    const status = storedKnowledge(database, row.slug)?.integrityStatus || "corrupt";
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, { healthy: 0, recovered: 0, corrupt: 0 });
  return {
    formalConceptCount: Number(conceptCounts.formal || 0),
    candidateConceptCount: Number(conceptCounts.candidates || 0),
    revisionCount,
    evidenceCount,
    claimCount,
    pendingArticleCount,
    failedArticleCount,
    recentFailures,
    healthyConceptCount: integrityCounts.healthy,
    recoveredConceptCount: integrityCounts.recovered,
    corruptConceptCount: integrityCounts.corrupt,
  };
}

export function getConceptPublicationReadiness(database, {
  snapshot = null,
  requireFormalConcept = false,
  includeOperationalBacklog = false,
} = {}) {
  const knowledgeStatus = getConceptKnowledgeStatus(database);
  const rows = database.prepare(`
    SELECT slug, stage
    FROM concept_knowledge
    WHERE merged_into IS NULL
    ORDER BY slug
  `).all();
  const formalRows = rows.filter((row) => isFormalConceptStage(row.stage));
  const issues = [];
  const qualityFailureSlugs = new Set();
  const publicKnowledgeBySlug = new Map();

  for (const row of rows) {
    const knowledge = getConceptKnowledge(database, row.slug);
    publicKnowledgeBySlug.set(row.slug, knowledge);
    if (!knowledge?.concept && knowledge?.integrityStatus === "corrupt") {
      issues.push({ slug: row.slug, code: "CORRUPT_CONCEPT_PAYLOAD" });
    }
  }

  for (const row of formalRows) {
    const knowledge = publicKnowledgeBySlug.get(row.slug);
    if (!knowledge?.concept) continue;
    if (!isFormalConceptStage(knowledge.concept.stage)) {
      issues.push({ slug: row.slug, code: "INVALID_FORMAL_STAGE" });
      qualityFailureSlugs.add(row.slug);
      continue;
    }
    const quality = formalPublicationQuality({
      concept: knowledge.concept,
      claims: knowledge.concept.claims,
      evidence: knowledge.concept.evidence,
      citations: knowledge.concept.citations,
    });
    if (quality.issues.length > 0) qualityFailureSlugs.add(row.slug);
    issues.push(...quality.issues);
  }

  if (snapshot) {
    const snapshotConcepts = new Map((Array.isArray(snapshot.concepts) ? snapshot.concepts : [])
      .map((concept) => [String(concept?.slug || ""), concept]));
    for (const row of formalRows) {
      const concept = snapshotConcepts.get(row.slug);
      if (!concept) {
        issues.push({ slug: row.slug, code: "FORMAL_CONCEPT_MISSING_FROM_SNAPSHOT" });
        qualityFailureSlugs.add(row.slug);
        continue;
      }
      const quality = formalPublicationQuality({
        concept,
        claims: concept.claims,
        evidence: concept.evidence,
        citations: concept.citations,
      });
      if (quality.issues.length > 0) qualityFailureSlugs.add(row.slug);
      for (const issue of quality.issues) issues.push({ ...issue, scope: "prospective-snapshot" });
    }
  }

  const warnings = [];
  for (const row of rows) {
    if (warnings.length >= MAX_REPORTED_WARNINGS) break;
    const knowledge = publicKnowledgeBySlug.get(row.slug);
    if (knowledge?.concept?.integrityStatus !== "recovered") continue;
    warnings.push({
      slug: row.slug,
      code: "CURRENT_PAYLOAD_RECOVERED",
      recoveredRevision: knowledge.concept.recoveredRevision ?? null,
      corruptRevision: knowledge.concept.corruptRevision ?? null,
      message: "当前 payload 已损坏，服务正在读取最后有效修订；请修复 concept_knowledge.payload_json。",
    });
  }

  const qualityFailureCount = qualityFailureSlugs.size;
  const blocking = (requireFormalConcept && knowledgeStatus.formalConceptCount === 0)
    || (includeOperationalBacklog && knowledgeStatus.pendingArticleCount > 0)
    || (includeOperationalBacklog && knowledgeStatus.failedArticleCount > 0)
    || knowledgeStatus.corruptConceptCount > 0
    || qualityFailureCount > 0;
  const status = blocking ? "not-ready"
    : knowledgeStatus.recoveredConceptCount > 0 ? "warning"
      : "ok";

  return {
    service: "agent-radar",
    task: "concept-knowledge-readiness",
    status,
    recoveryStatus: knowledgeStatus.corruptConceptCount > 0 ? "corrupt"
      : knowledgeStatus.recoveredConceptCount > 0 ? "recovered"
        : "healthy",
    ...knowledgeStatus,
    qualityFailureCount,
    issueCount: issues.length,
    issues: issues.slice(0, MAX_REPORTED_ISSUES),
    issuesTruncated: issues.length > MAX_REPORTED_ISSUES,
    warnings,
    warningsTruncated: knowledgeStatus.recoveredConceptCount > warnings.length,
  };
}

export function assertConceptPublicationReady(database, snapshot) {
  const readiness = getConceptPublicationReadiness(database, { snapshot });
  if (readiness.status !== "not-ready") return readiness;
  const preview = readiness.issues.slice(0, 5)
    .map((issue) => `${issue.slug || "unknown"}:${issue.code}`)
    .join("、");
  throw new Error(`概念公开质量门禁失败，快照发布已阻断：${preview || "存在不可恢复概念知识"}`);
}
