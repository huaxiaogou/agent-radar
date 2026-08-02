import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAnalysisProvider } from "../../radar/provider.mjs";
import { seedRadarSnapshot, type RadarSnapshot } from "./radar-data";

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
      signalCount: 0,
      articleCount: 0,
      stale: true,
    },
    signals: [],
    candidateConcepts: [],
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
        stale: !lastSuccessfulAt || Date.now() - lastSuccessfulAt > 12 * 60 * 60 * 1000,
      },
      concepts: parsed.concepts?.length ? parsed.concepts : seedRadarSnapshot.concepts,
      relations: parsed.relations?.length ? parsed.relations : seedRadarSnapshot.relations,
      playbooks: parsed.playbooks?.length ? parsed.playbooks : seedRadarSnapshot.playbooks,
      digests: parsed.digests || [],
      modelPulses: parsed.modelPulses || [],
      candidateConcepts: parsed.candidateConcepts || [],
      modelLandscape: normalizedModelLandscape(parsed),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return unavailableRadarSnapshot("never");
    return unavailableRadarSnapshot("failed");
  }
}
