import { SearchView } from "./SearchView";
import { getRadarSnapshot } from "../lib/radar-store";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const snapshot = await getRadarSnapshot();
  return <SearchView initialQuery={typeof q === "string" ? q : undefined} signals={snapshot.signals} concepts={snapshot.concepts} sources={snapshot.sources} status={snapshot.status} />;
}
