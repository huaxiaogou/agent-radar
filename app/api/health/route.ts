export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    service: "agent-radar",
    status: "ok",
  });
}
