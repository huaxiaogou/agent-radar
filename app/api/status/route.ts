import { getRadarSnapshot } from "../../lib/radar-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getRadarSnapshot();
  return Response.json({
    service: "agent-radar",
    ...snapshot.status,
    modelLandscape: {
      source: snapshot.modelLandscape.sourceName,
      itemCount: snapshot.modelLandscape.itemCount,
      lastAttemptAt: snapshot.modelLandscape.lastAttemptAt,
      lastSuccessAt: snapshot.modelLandscape.lastSuccessAt,
      lastError: snapshot.modelLandscape.lastError,
      stale: snapshot.modelLandscape.stale,
    },
    sources: snapshot.sources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
    })),
  }, {
    headers: { "cache-control": "no-store" },
  });
}
