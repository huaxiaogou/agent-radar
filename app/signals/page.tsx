import { SignalsView } from "./SignalsView";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ stage?: string | string[] }> }) {
  const { stage } = await searchParams;
  const snapshot = await getRadarSnapshot();
  return <SignalsView initialStage={typeof stage === "string" ? stage : undefined} signals={snapshot.signals} status={snapshot.status} />;
}
