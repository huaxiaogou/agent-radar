import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAnalysisProvider } from "../../radar/provider.mjs";
import { seedRadarSnapshot, type Concept, type ConceptReadiness, type RadarSnapshot } from "./radar-data";

function snapshotPath() {
  if (process.env.RADAR_DATA_DIR) {
    return path.join(/* turbopackIgnore: true */ path.resolve(process.env.RADAR_DATA_DIR), "radar-snapshot.json");
  }
  return path.join(process.cwd(), ".data", "radar-snapshot.json");
}

function isSnapshot(value: unknown): value is RadarSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RadarSnapshot>;
  return snapshot.version === 1 &&
    snapshot.knowledgeSchemaVersion === 1 &&
    Array.isArray(snapshot.signals) &&
    Array.isArray(snapshot.sources) &&
    Array.isArray(snapshot.concepts) &&
    Array.isArray(snapshot.relations) &&
    Array.isArray(snapshot.playbooks) &&
    Array.isArray(snapshot.digests) &&
    typeof snapshot.status?.generatedAt === "string";
}

function normalizedConfiguredProvider(status: RadarSnapshot["status"]): NonNullable<RadarSnapshot["status"]["configuredProvider"]> {
  if (["openai", "deepseek", "rules"].includes(status.configuredProvider || "")) {
    return status.configuredProvider as NonNullable<RadarSnapshot["status"]["configuredProvider"]>;
  }
  return resolveAnalysisProvider();
}

function normalizedRunAnalysisMode(status: RadarSnapshot["status"]): NonNullable<RadarSnapshot["status"]["runAnalysisMode"]> {
  return ["none", "openai", "deepseek", "rules", "mixed"].includes(status.runAnalysisMode || "")
    ? status.runAnalysisMode as NonNullable<RadarSnapshot["status"]["runAnalysisMode"]>
    : "none";
}

function normalizedModelLandscape(snapshot: Partial<RadarSnapshot>): RadarSnapshot["modelLandscape"] {
  const landscape = snapshot.modelLandscape;
  if (!landscape || !Array.isArray(landscape.models)) return seedRadarSnapshot.modelLandscape;
  const lastSuccess = landscape.lastSuccessAt ? new Date(landscape.lastSuccessAt).getTime() : 0;
  return {
    ...landscape,
    itemCount: Number(landscape.itemCount || landscape.models.length),
    stale: !lastSuccess || Date.now() - lastSuccess > 48 * 60 * 60 * 1000,
  };
}

function normalizedConcept(concept: Concept): Concept {
  const heat = Math.max(0, Math.min(100, Number(concept.heat ?? concept.temperature ?? 0)));
  const maturity = typeof concept.maturity === "number"
    ? Math.max(0, Math.min(100, Number(concept.maturity)))
    : undefined;
  const revisions = Array.isArray(concept.revisions) ? concept.revisions : [];
  if (!revisions.length && concept.revision && concept.provider) {
    revisions.push({
      revision: concept.revision,
      provider: concept.provider,
      model: concept.model,
      changeReason: concept.changeReason,
      reason: concept.changeReason,
      analyzedAt: concept.lastMeaningfulChange || undefined,
    });
  }
  return {
    ...concept,
    name: concept.canonicalName || concept.name,
    canonicalName: concept.canonicalName || concept.name,
    stage: concept.stage || "candidate",
    temperature: heat,
    heat,
    maturity,
    relation: concept.relation || "由来源绑定的工程主张持续修订",
    aliases: Array.isArray(concept.aliases) ? concept.aliases : [],
    themes: Array.isArray(concept.themes) ? concept.themes : [],
    evolution: Array.isArray(concept.evolution) ? concept.evolution : [],
    designConstraints: Array.isArray(concept.designConstraints) ? concept.designConstraints : [],
    implementationPatterns: Array.isArray(concept.implementationPatterns) ? concept.implementationPatterns : [],
    antiPatterns: Array.isArray(concept.antiPatterns) ? concept.antiPatterns : [],
    tradeoffs: Array.isArray(concept.tradeoffs) ? concept.tradeoffs : [],
    failureModes: Array.isArray(concept.failureModes) ? concept.failureModes : [],
    securityRisks: Array.isArray(concept.securityRisks) ? concept.securityRisks : [],
    operationalConcerns: Array.isArray(concept.operationalConcerns) ? concept.operationalConcerns : [],
    applicability: Array.isArray(concept.applicability) ? concept.applicability : [],
    nonApplicability: Array.isArray(concept.nonApplicability) ? concept.nonApplicability : [],
    controversies: Array.isArray(concept.controversies) ? concept.controversies : [],
    claims: Array.isArray(concept.claims) ? concept.claims.map((claim) => ({
      ...claim,
      evidenceUrls: Array.isArray(claim.evidenceUrls) ? claim.evidenceUrls : [],
    })) : [],
    evidence: Array.isArray(concept.evidence) ? concept.evidence.map((evidence) => ({
      ...evidence,
      supports: Array.isArray(evidence.supports) ? evidence.supports : [],
    })) : [],
    citations: Array.isArray(concept.citations) ? concept.citations.map((citation) => ({
      ...citation,
      evidenceUrls: Array.isArray(citation.evidenceUrls) ? citation.evidenceUrls : [],
    })) : [],
    knowledgeRelations: Array.isArray(concept.knowledgeRelations)
      ? concept.knowledgeRelations
      : Array.isArray(concept.relationships)
        ? concept.relationships
        : Array.isArray(concept.relations)
          ? concept.relations
          : [],
    revisions,
  };
}

function normalizedSourceCoverage(status: RadarSnapshot["status"]): RadarSnapshot["status"]["sourceCoverage"] {
  if (status.sourceCoverage?.total && status.sourceCoverage.byLayer && status.sourceCoverage.byFamily) {
    return {
      total: status.sourceCoverage.total,
      byLayer: status.sourceCoverage.byLayer,
      byFamily: status.sourceCoverage.byFamily,
    };
  }
  return {
    total: {
      configured: Number(status.sourceCount || 0),
      available: Number(status.availableSourceCount ?? (
        Number(status.healthySourceCount || 0) + Number(status.degradedSourceCount || 0)
      )),
      effective: 0,
    },
    byLayer: {},
    byFamily: {},
  };
}

function normalizedSourceGroupCoverage(status: RadarSnapshot["status"]): RadarSnapshot["status"]["sourceGroupCoverage"] {
  const legacyCoverage = status.sourceCoverage as RadarSnapshot["status"]["sourceCoverage"] & {
    independentGroups?: RadarSnapshot["status"]["sourceGroupCoverage"];
  };
  const value = status.sourceGroupCoverage || legacyCoverage?.independentGroups;
  return value || { configured: 0, available: 0, effective: 0 };
}

function normalizedConceptReadiness(snapshot: RadarSnapshot): ConceptReadiness {
  const readiness = snapshot.status.conceptReadiness;
  const safeFailureUrl = (value: unknown) => {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || url.username || url.password) return "https://invalid-article-reference.invalid/";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "https://invalid-article-reference.invalid/";
    }
  };
  const recentFailures = Array.isArray(readiness?.recentFailures)
    ? readiness.recentFailures.slice(0, 10).map((failure) => ({
      articleUrl: safeFailureUrl(failure?.articleUrl),
      status: String(failure?.status || "failed"),
      attemptedAt: typeof failure?.attemptedAt === "string" ? failure.attemptedAt : null,
    }))
    : [];
  const numericFields = [
    "formalConceptCount",
    "candidateConceptCount",
    "pendingArticleCount",
    "failedArticleCount",
    "corruptConceptCount",
    "recoveredConceptCount",
  ] as const;
  if (readiness
      && ["ok", "warning", "not-ready"].includes(readiness.status)
      && numericFields.every((field) => typeof readiness[field] === "number" && Number(readiness[field]) >= 0)) {
    return {
      status: readiness.status,
      formalConceptCount: Number(readiness.formalConceptCount),
      candidateConceptCount: Number(readiness.candidateConceptCount),
      pendingArticleCount: Number(readiness.pendingArticleCount),
      failedArticleCount: Number(readiness.failedArticleCount),
      recentFailures,
      corruptConceptCount: Number(readiness.corruptConceptCount),
      recoveredConceptCount: Number(readiness.recoveredConceptCount),
    };
  }
  return {
    status: "unknown",
    formalConceptCount: (snapshot.concepts || []).filter((concept) => (
      !["candidate", "archived"].includes(String(concept.stage || "").toLowerCase())
    )).length,
    candidateConceptCount: (snapshot.candidateConcepts || []).length,
    pendingArticleCount: null,
    failedArticleCount: null,
    recentFailures: [],
    corruptConceptCount: null,
    recoveredConceptCount: null,
  };
}

function unavailableRadarSnapshot(runStatus: RadarSnapshot["status"]["runStatus"]): RadarSnapshot {
  return {
    ...seedRadarSnapshot,
    status: {
      ...seedRadarSnapshot.status,
      generatedAt: new Date().toISOString(),
      runStatus,
      analysisMode: "rules",
      configuredProvider: resolveAnalysisProvider(),
      runAnalysisMode: "none",
      sourceCount: 0,
      healthySourceCount: 0,
      degradedSourceCount: 0,
      availableSourceCount: 0,
      sourceCoverage: { total: { configured: 0, available: 0, effective: 0 }, byLayer: {}, byFamily: {} },
      sourceGroupCoverage: { configured: 0, available: 0, effective: 0 },
      signalCount: 0,
      articleCount: 0,
      conceptReadiness: {
        status: "unknown",
        formalConceptCount: 0,
        candidateConceptCount: 0,
        pendingArticleCount: null,
        failedArticleCount: null,
        recentFailures: [],
        corruptConceptCount: null,
        recoveredConceptCount: null,
      },
      stale: true,
    },
    signals: [],
    discussionPulses: [],
    concepts: [],
    conceptRedirects: {},
    candidateConcepts: [],
    relations: [],
    modelPulses: [],
    sources: [],
    digests: [],
  };
}

export async function getRadarSnapshot(): Promise<RadarSnapshot> {
  try {
    const parsed: unknown = JSON.parse(await readFile(snapshotPath(), "utf8"));
    if (!isSnapshot(parsed)) throw new Error("快照结构无效");
    if (parsed.status.mode !== "live") return unavailableRadarSnapshot("never");
    const lastSuccessfulAt = parsed.status.lastSuccessfulAt ? new Date(parsed.status.lastSuccessfulAt).getTime() : 0;
    return {
      ...parsed,
      status: {
        ...parsed.status,
        configuredProvider: normalizedConfiguredProvider(parsed.status),
        runAnalysisMode: normalizedRunAnalysisMode(parsed.status),
        degradedSourceCount: Number(parsed.status.degradedSourceCount || 0),
        availableSourceCount: Number(parsed.status.availableSourceCount ?? parsed.status.healthySourceCount ?? 0),
        sourceCoverage: normalizedSourceCoverage(parsed.status),
        sourceGroupCoverage: normalizedSourceGroupCoverage(parsed.status),
        conceptReadiness: normalizedConceptReadiness(parsed),
        stale: !lastSuccessfulAt || Date.now() - lastSuccessfulAt > 12 * 60 * 60 * 1000,
      },
      concepts: parsed.concepts.map(normalizedConcept),
      conceptRedirects: parsed.conceptRedirects || {},
      // A validated live snapshot is authoritative even when no formal relation
      // has been published yet. Seed relations are reserved for the explicit
      // unavailable/invalid-snapshot fallback above.
      relations: parsed.relations,
      playbooks: parsed.playbooks?.length ? parsed.playbooks : seedRadarSnapshot.playbooks,
      digests: parsed.digests || [],
      modelPulses: parsed.modelPulses || [],
      discussionPulses: parsed.discussionPulses || [],
      candidateConcepts: parsed.candidateConcepts || [],
      modelLandscape: normalizedModelLandscape(parsed),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return unavailableRadarSnapshot("never");
    return unavailableRadarSnapshot("failed");
  }
}
