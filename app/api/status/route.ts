import { getRadarSnapshot } from "../../lib/radar-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getRadarSnapshot();
  return Response.json({
    service: "agent-radar",
    ...snapshot.status,
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
