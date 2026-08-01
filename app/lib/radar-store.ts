import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
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

export async function getRadarSnapshot(): Promise<RadarSnapshot> {
  try {
    const parsed: unknown = JSON.parse(await readFile(snapshotPath(), "utf8"));
    if (!isSnapshot(parsed)) throw new Error("快照结构无效");
    const lastSuccessfulAt = parsed.status.lastSuccessfulAt ? new Date(parsed.status.lastSuccessfulAt).getTime() : 0;
    return {
      ...parsed,
      status: {
        ...parsed.status,
        stale: !lastSuccessfulAt || Date.now() - lastSuccessfulAt > 12 * 60 * 60 * 1000,
      },
      concepts: parsed.concepts?.length ? parsed.concepts : seedRadarSnapshot.concepts,
      relations: parsed.relations?.length ? parsed.relations : seedRadarSnapshot.relations,
      playbooks: parsed.playbooks?.length ? parsed.playbooks : seedRadarSnapshot.playbooks,
      digests: parsed.digests || [],
      modelPulses: parsed.modelPulses || [],
      candidateConcepts: parsed.candidateConcepts || [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return seedRadarSnapshot;
    return {
      ...seedRadarSnapshot,
      status: {
        ...seedRadarSnapshot.status,
        runStatus: "failed",
        stale: true,
      },
    };
  }
}
