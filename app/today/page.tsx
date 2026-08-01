import { TodayView } from "../components/TodayView";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[] }> }) {
  const { topic } = await searchParams;
  const snapshot = await getRadarSnapshot();
  return <TodayView initialTopic={typeof topic === "string" ? topic : undefined} snapshot={snapshot} />;
}
