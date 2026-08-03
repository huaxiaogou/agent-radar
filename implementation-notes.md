# Implementation notes

## Concept graph geometry session

### Deviations

- The original graph used independently positioned HTML nodes and CSS line segments. The fix moves the whole visualization into one responsive SVG coordinate system and derives its nodes and edges from the same runtime relation data used by the accessible list.

### Discovered edge cases

- Percentage-based line origins cannot stay attached to fixed-size ellipses as the container width changes. Edge endpoints are now calculated from node centers and clipped to the ellipse equation.
- Production snapshots can contain more relations than the original hard-coded six-node/five-edge illustration. Node and edge counts, layout columns, and canvas dimensions now derive from every current relation.
- Small screens previously hid every relationship line. The SVG keeps the complete graph and uses horizontal scrolling so the accessible list and the visual map remain consistent.

### Questions for review

- None. This is a read-only rendering change; ingestion, snapshots, relation semantics, and the relationship list are unchanged.

### Session summary

- Deviations count: 1.
- Most likely revisit: replace the deterministic layered layout with collision-aware routing only when relation density produces overlapping labels, not merely when node count grows.
- Edge cases found: 3; responsive attachment, snapshot cardinality drift, and mobile edge visibility are covered.
- Questions awaiting review: 0.
- Next session should read this section, `app/graph/geometry.js`, and `tests/graph-geometry.test.mjs` before changing graph layout or routing.

## DeepSeek production enum repair session

### Deviations

- Production proved that stable JSON Output preserved JSON syntax but not the site's enum contract. Instead of moving the scheduled pipeline to DeepSeek's Beta strict-tool endpoint, valid model prose is retained while invalid categorical fields are repaired by the existing deterministic classifier.

### Discovered edge cases

- All 16 model-eligible articles can return usable prose with invalid `conceptSlug`, `topic`, `stage`, or `accent`; treating each categorical mismatch as a total AI failure makes the entire batch silently become rules analysis.
- Category repair must remain visible without turning a successful model response into an ingestion error. Runs now report `AI repairs`, while missing core prose, malformed JSON, timeouts, and provider failures still count as fallbacks and can make the run partial.

### Questions for review

- None. The fix does not change credentials, source fetching, history, database schema, timer units, or the public write surface.

### Session summary

- Deviations count: 1.
- Most likely revisit: move to DeepSeek strict tool calls only after its Beta endpoint is suitable for unattended scheduled production work.
- Edge cases found: 2; batch-wide enum drift and the distinction between repairable categories and unusable model prose are handled.
- Questions awaiting review: 0; historical rules articles intentionally remain unchanged.
- Next session should read this session, the production log from 2026-08-01 16:03, and `validateAnalysis` before changing provider validation.

## AI provider session

### Deviations

- DeepSeek JSON Output guarantees JSON syntax but does not replace the existing strict field and enum contract. The adapter keeps local validation and one retry instead of treating provider compatibility as schema equivalence; revisit only if the provider exposes stable strict JSON Schema output.

### Discovered edge cases

- Existing servers may already contain an OpenAI Key. `auto` preserves that behavior, while an explicit `deepseek` selection prevents a second installed key from silently changing providers.
- Historical articles retain their original `rules`, `openai`, or `deepseek` marker. New provider configuration only analyzes newly accepted URLs, so the public snapshot can correctly report `mixed` instead of silently rewriting history.
- DeepSeek documents occasional empty JSON content. Empty, truncated, malformed, timed-out, rate-limited, and server-error responses retry once before the per-item rules fallback keeps ingestion available.

### Questions for review

- None. Provider selection and credentials remain server-owned runtime configuration; no key or historical backfill is included in this change.

### Session summary

- Deviations count: 1.
- Most likely revisit: replace JSON Output plus local validation only if DeepSeek later offers a stable strict JSON Schema contract for this endpoint.
- Edge cases found: 3; existing OpenAI deployments, mixed historical provider markers, and transient/invalid DeepSeek responses are handled.
- Questions awaiting review: 0; the production credential remains intentionally unavailable locally.
- Next session should read this session, `radar/analyze.mjs`, and the AI provider section in `README.md` before changing model behavior.

## Deviations

- The generated UI database recommendation was an AI-purple chatbot/landing pattern. It was replaced with the reversible “signal cartography” direction because the product is an evidence dashboard, not a conversational product; revisit by replacing the master tokens only.

## Discovered edge cases

- The first release is a curated, read-only intelligence experience: live ingestion, authentication, and persistent review actions remain out of this visual implementation.
- A graph view cannot be the sole representation of concept relationships; the implementation must include a readable relationship list for accessibility and mobile use.
- Static seed signals must identify themselves as a curated snapshot so the interface never implies a live connector is already running.
- The first generated social card invented a date and coordinates. The single allowed correction pass removed all ungrounded metadata before the asset was wired into the site.
- A production-dependency audit after the first private deployment found the starter's pinned Next.js 16.2.6 plus transitive PostCSS/Sharp versions in active high-severity advisories. Next.js was patched to 16.2.12 and the two transitive packages were pinned to fixed releases before rebuilding.

## Questions for review

- The GitHub repository URL is pending; the user will create an empty `agent-radar` repository before the remote is configured and pushed.

## Self-host deployment session

### Deviations

- The earlier Sites deployment is no longer the production target. The project now uses plain Next.js on the user's server; the Sites URL remains only a temporary preview.
- An initial Docker proposal was rejected by the user and removed completely. Deployment now mirrors the sibling loan and Agent sites with PID/log shell scripts and Nginx.
- The original starter used vinext, Vite, Cloudflare Worker, D1/Drizzle examples, Wrangler and Sites metadata. Those unused adapters were removed so the production build has no platform binding.

### Discovered edge cases

- The sibling loan and Agent sites already use 3000 and 3001. The user selected 3002 for Agent Radar, and `start.sh` refuses to launch when it is occupied.
- `agent.jayjp.com` and `lona.jayjp.com` are explicit no-touch boundaries; the new Nginx script manages only `radar.jayjp.com`.
- The rendered-HTML tests previously imported a Cloudflare Worker bundle. They now launch the real Next.js production server on an ephemeral test port.
- Standard Next.js prerendering rejected root-level `useSearchParams` calls that vinext had accepted. Query values now enter through server page props while the existing client interactions remain unchanged.
- Local validation found an unrelated service bound to `*:3002`; the start script's macOS fallback now detects any listener on 3002 and refuses to touch it. Server availability remains a deployment precondition.
- A transient Google Fonts request broke one production build, so `next/font/google` was removed in favor of the existing system font stacks; server builds no longer fetch fonts.
- The repository was moved from the dated Codex workspace to `/Users/kiperjing/github/huaxiaogou/agent-radar`, alongside the loan and Agent coursebook projects as requested.

### Questions for review

- Confirm the GitHub repository URL after the empty `agent-radar` repository is created.

### Session summary

- Deviations count: 3.
- Most likely revisit: none; the runtime now matches the two sibling websites.
- Edge cases found: 7; fixed-port ownership, Nginx ownership, platform-specific test coupling, query prerendering, local port detection, build-time font fetches, and repository relocation are handled.
- Questions awaiting review: 1, the GitHub remote URL.
- Next session should read this deployment session, then `README.md` and the scripts under `scripts/` before pushing.

## Session summary

- Deviations count: 1.
- Most likely revisit: replace the signal-cartography token system only if the product later shifts from personal intelligence desk to public media site.
- Edge cases found: 5; all handled without expanding V1 into live ingestion or authentication.
- Questions awaiting review: 0.
- Next session should read `design-system/agent-radar/MASTER.md` first, then this file before adding live connectors.

## Formal ingestion session

### Deviations

- The earlier plan assumed AI analysis as a mandatory pipeline stage. Production now treats it as an optional enhancement with a deterministic rules fallback, because a missing key, quota, or API incident must not stop collection or blank the site; revisit by making the provider mandatory only with an explicit availability budget.
- The original static arrays remain only as a last-known bootstrap when no valid runtime snapshot exists. After the first successful ingest, every data-facing page reads the atomic runtime snapshot instead of the bundled replay.

### Discovered edge cases

- Several high-value sources do not publish usable RSS feeds. The collector supports both RSS/Atom and controlled same-site HTML discovery, including heading sections on changelog-style pages.
- Feed content is untrusted input. Optional model analysis explicitly treats source text as data and ignores embedded instructions; provider errors fall back per item.
- A source can fail while the other sources succeed. Health is tracked per source, the run becomes partial, and the last complete snapshot stays available.
- Repeated timers and manual runs can overlap. A PID-bearing filesystem lock rejects concurrency and only clears a stale lock after its owner is gone and the two-hour safety window has elapsed.
- Release feeds often have nearly identical titles across versions. The clusterer refuses to merge entries when both titles contain different semantic versions.

### Questions for review

- None. Git transport and repository publication are explicitly owned by the user and are outside this implementation session.

### Session summary

- Deviations count: 2.
- Most likely revisit: the optional OpenAI provider model and cost ceiling when real API usage begins.
- Edge cases found: 5; non-feed sources, untrusted source content, partial source failure, overlapping timers, and release-version clustering are handled.
- Questions awaiting review: 0.
- Next session should read this formal ingestion session, then `README.md`, `config/sources.json`, and `scripts/install-scheduler.sh` before changing collection behavior.

## HTTPS routing recovery session

### Deviations

- The first Nginx helper configured only HTTP and left TLS as a separate documented Certbot step. Production access used HTTPS immediately, so the helper now reuses a matching active wildcard certificate and configures both ports in one guarded transaction.

### Discovered edge cases

- An HTTPS request without an exact `radar.jayjp.com` TLS virtual host can be served by the existing default financial virtual host even when the HTTP proxy is correct. A live TLS probe confirmed the Radar root returned `LoanRisk Coursebook` and `/api/health` returned that app's 404.
- An unrelated 3001 outage appears as an Agent-domain 502 and must be repaired at the Agent upstream; changing Radar routing must not hide it. The helper now refuses to modify Nginx unless all three local upstream identities pass.
- Syntax-valid Nginx configuration is not enough. Reload and post-reload SNI identity checks can still fail, so the helper restores the prior Radar file when either stage fails.
- Production showed a post-reload 404 without identifying which SNI check failed. HTTPS verification now labels every domain and retries for up to ten seconds so a graceful-reload handoff cannot cause an immediate false rollback.

### Questions for review

- None. The active server already presents a valid `*.jayjp.com` certificate; the helper discovers and cryptographically validates the matching certificate/key pair without printing the private key.

### Session summary

- Deviations count: 1.
- Most likely revisit: explicit certificate paths if the TLS terminator moves away from this Nginx instance.
- Edge cases found: 4; default TLS fallback, independent Agent upstream failure, post-reload identity drift, and graceful-reload propagation delay are guarded.
- Questions awaiting review: 0.
- Next session should read this recovery session and `scripts/configure-nginx.sh` before changing virtual-host behavior.

## Model atlas and concept evidence session

### Deviations

- The requested programming and everyday capability dimensions are represented as Radar editorial bands from 1–5, not as invented benchmark scores. Official model names, context windows and API prices remain visually and semantically separate from these judgments.
- Model metadata is curated and timestamped rather than mutated by the four-hour article ingestion timer. Provider pages, regional prices and promotions need a verified publishing step; revisit with a stale-data alert before considering automated updates.
- Source-registry expansion, generated Chinese article pages and image generation were audited but not added to this release. They require separate source adapters, provenance rules and publishing controls rather than an unreviewed broad crawl.

### Discovered edge cases

- A provider price changed during implementation; the current official page was re-opened, the value corrected, and every table row now links to its vendor evidence.
- A temporary Claude Sonnet price has an explicit end date and preserves the standard price in the same record so the promotion cannot be mistaken for a permanent rate.
- DeepSeek input prices depend on cache status; the page states that it uses the cache-miss basis and does not publish a future peak multiplier before it is effective.
- Snapshot serialization previously removed `conceptSlug`, while signal URLs contain an event hash. Concept detail pages therefore could not recover their signals or original article links. The snapshot now retains the field, and the reader also supports old snapshots through a slug-prefix fallback.
- One concept can contain several signals pointing to the same article. Concept pages deduplicate a URL within each signal but keep it clickable under every signal it supports, preserving claim-to-source mapping.
- The exact comparison table is wider than a phone viewport. It has a keyboard-focusable horizontal scroll region, while the capability map itself stays within the mobile viewport.
- Version-number clustering previously ran before the concept boundary check. Two releases such as `1.0.0` from one vendor group could therefore merge across concepts; concept equality is now a precondition for every reuse path.
- A historical DeepSeek snapshot does not prove that the current server still has a DeepSeek key. The active-model label now follows the same provider, key and disable-switch precedence as ingestion instead of inferring from historical articles.
- A signal with more than eight source articles previously retained the oldest eight. The snapshot now keeps the newest eight, and a nine-article regression test protects the window.
- Several model markers can share one capability cell. The chart shows at most two named markers plus an aggregate marker after density exceeds three; the exact table always preserves every model.

### Questions for review

- Expand the official source registry in staged groups and use community channels only for discovery; a candidate should not publish until a primary source confirms it.
- Add an unknown-concept candidate queue before allowing the analyzer to extend the fixed taxonomy automatically.
- Prefer source-backed Chinese editorial synthesis—fact, Radar reading, engineering action and uncertainty—with the original link. Full article translation and generated images need explicit rights and provenance policies.

### Session summary

- Deviations count: 3.
- Most likely revisit: add an automated freshness detector that flags model records for human verification without auto-publishing changed prices.
- Edge cases found: 10; live price drift, promotions, cache-sensitive pricing, lost concept identity, duplicate sources, mobile overflow, cross-concept version clustering, stale active-provider inference, source-window ordering and marker density are handled.
- Questions awaiting review: 3; staged source expansion, taxonomy candidates and the Chinese editorial publishing contract.
- Next session should read this session, `app/lib/model-data.ts`, and the evidence boundaries on `/models` before changing comparisons or automation.

## Multilingual intelligence quality session

### Confirmed product decisions

- Source expansion is not staged as a future P0. This session must ship a complete first production registry spanning global official sources, Chinese official/team sources, English community, Chinese community and independent practitioners.
- Community discussion is a first-class discovery signal, not a substitute for an official fact. The product must show which layer supports a claim and must never promote community repetition alone to high confidence.
- `/models` must expose full model names in its primary visualization. Short codes such as `O·SOL` and `A·FAB` are not acceptable as the main reading language.
- The four-hour job may update model discussion pulse and source health. Capability bands, context and prices remain dated editorial facts and must not silently change from community text or an LLM response.

### Audit findings before implementation

- The current pre-filter runs before article enrichment and only recognizes a narrow English vocabulary, so Chinese engineering discussion is systematically missed.
- DeepSeek/OpenAI currently summarize only the first configured subset of new items. Their output does not participate in a publish/watch/reject decision or final signal ranking; calling this “AI 精排” would be inaccurate.
- The fixed taxonomy silently defaults unmatched material to `coding-agent`, which hides genuinely new concept candidates and creates misleading clusters.
- Source classes currently have no explicit official/practitioner/community layer, and the confidence calculation can treat several community groups as “较高” without any primary evidence.
- The model capability chart encodes names as private abbreviations, and `/models` has no dynamic field tied to ingestion even though the surrounding site advertises live collection.

### Risk boundaries

- Only public, no-login feeds and APIs may be integrated. Login walls, access-control bypasses, copied cookies and unofficial scraping workarounds remain out of scope.
- Broad community feeds are noisy and can contain prompt injection, spam or coordinated repetition. They must pass deterministic recall, content enrichment, structured editorial analysis and layer-aware evidence rules before publication.
- Generated Chinese analysis must remain a concise source-backed synthesis with original links; it must not republish full copyrighted articles or present an LLM inference as source fact.

### Deviations

- The user-provided broad source list was adopted selectively instead of being imported with equal weight. Stable public feeds enter the registry, but finance, generic model rankings, strong-login communities and podcasts without text transcripts remain outside the automated publishing chain.
- The product does not divide sources into domestic and international sections. `language` remains internal metadata for parsing, Chinese synthesis and original-language labels; evidence responsibility is defined only by official, practitioner/technical-media and community layers.
- Source `cadence` is now enforced for systemd runs instead of being display-only. The four-hour timer wakes the job, then each source is checked against its 4h/8h/12h/24h interval; manual ingestion intentionally scans all enabled sources.

### Discovered edge cases

- A public GitHub Issues JSON endpoint can exhaust the unauthenticated shared-IP quota. The connector therefore uses the public issue-list HTML with an exact issue-URL allowlist; it neither signs in nor bypasses access controls.
- The documented Bluesky `public.api` host returned 403 in one probe while `api.bsky.app` returned a public JSON response. The enabled connector uses the verified AppView host and remains isolated by per-source health handling.
- Reddit's `/new.rss` and `old.reddit.com` variants were intermittently blocked; the public subreddit `.rss?raw_json=1` endpoint was the stable no-login variant in the current probe.
- The first model alias catalog retained historical Claude/Gemini IDs, which would have made most current model pulses permanently zero. A bidirectional test now requires exact parity between the eight model records and pulse aliases.
- Re-scoring after enrichment was initially nominal because relevance inspected only title and feed excerpt. It now includes `contentText`, and a regression test proves that engineering terms found only in the fetched body can enter the candidate set.
- Older source-window tests compared the exact `{name, href}` object shape. They now preserve the same latest-eight ordering and URL deduplication contract while also checking evidence layer, original title, language and publication time.
- A removed or disabled source remained in historical SQLite health rows and incorrectly changed a successful 39/39 run into a 40/41 status. The catalog now atomically marks only the current enabled set active; historical rows remain for article foreign keys but are excluded from live health counts.
- `candidate_concept` was persisted but never consumed, while `watch` items were discarded before persistence. A watch item with a non-empty candidate is now retained as an isolated discovery record: it appears only in `/concepts` under “待溯源概念候选”, preserves evidence-layered original links, and cannot enter signals or the canonical concept grid.
- A 375px browser check found that the hidden accessible text inside the wide model table could enlarge the document scroll geometry even though the table had its own scroll container. Root horizontal overflow is clipped while the navigation and exact table retain their explicit horizontal scroll regions.
- A first SSRF guard validated DNS before calling `fetch`, which left a rebinding window and missed hexadecimal IPv4-mapped IPv6 forms such as `::ffff:7f00:1`. Every HTTPS hop now parses IPv6 into bytes, rejects mapped private/loopback ranges, and passes the already-validated address set to a pinned Undici dispatcher used by the real TLS connection. Test-only fetch injection is explicit and cannot fabricate a public resolver. Each dispatcher is intentionally closed after its bounded response instead of sharing address state across source lifecycles; non-success and oversized bodies are cancelled, and unframed streams stop at the 5 MiB boundary.
- The enrichment cap originally doubled as the final publication cap. Once enabled sources outgrow that cap, later sources could be starved before their article bodies were inspected. Fair selection now takes at least the first candidate from every due source. Historical note: the later LLM Chinese editorial session superseded the AI-call cap entirely; the final publication cap remains, but every selected relevant candidate now enters the configured LLM.
- A persisted `watch` candidate could be promoted in place but could not be withdrawn after a later `reject` decision. Rejection now refreshes the same audit row with the reviewed body, hash and scores, clears its candidate name, and removes it from public/candidate snapshot queries without deleting history. `reject` is terminal for that URL, while `watch` remains re-reviewable; only published rows may seed signal clustering.

### Session summary

- The registry now covers 39 public no-login sources across official/team releases, practitioners and technical media, targeted research, and Chinese/English developer communities.
- The pipeline performs multilingual recall, body enrichment, deterministic re-scoring, structured AI publish/watch/reject analysis, editorial ranking, event-key clustering, evidence-layer confidence and atomic publication.
- `/discussions` exposes community discovery with original links; `/models` uses full names and separates dated capability/price facts from timer-updated 7/30-day discussion pulses.
- Real no-key ingestion probes against the expanded registry completed after connector repair. The final pinned-DNS transport probe reported 39/39 enabled sources healthy, 453 fetched items, eight accepted articles and zero source errors; it also correctly excluded retired source records from status.
- Remaining external validation is production-host network health and the configured DeepSeek account's real batch latency/quota; local tests cannot prove either.

## Model landscape reference session

### Deviations

- The reference chart uses a weighted per-task cost and a proprietary intelligence index. Radar has neither a shared token budget nor comparable benchmark runs, so the implementation preserves the visual semantics but uses verified API output price on the log axis and the existing dated coding capability band on the vertical axis. Everyday capability is encoded by point size and written into every label.
- The reference highlights DeepSeek Flash with a dashed competition rectangle and arrow. Both are intentionally omitted; every provider uses the same point, label and portfolio-line grammar.

### Discovered edge cases

- Four current models share the highest coding band. Their plotted points remain on the exact band while label offsets are staggered, so readability does not falsify the coordinate.
- A phone viewport cannot preserve full model names and a meaningful log axis at once. The figure uses a keyboard-focusable horizontal scroll region with an explicit mobile cue; the exact comparison table remains the accessible numerical fallback.

### Questions for review

- None. Automatically estimating cost per task remains prohibited until one shared harness, token budget and repeatable task set exist for every model.

### Session summary

- Deviations count: 2.
- Most likely revisit: replace editorial capability bands only after a reproducible first-party task suite exists.
- Edge cases found: 2; shared top-band labels and mobile chart width are handled.
- Questions awaiting review: 0.
- Next session should read this section and `app/models/page.tsx` before changing chart axes or introducing a derived score.
## Ingestion IPv6 resilience and provider status session

### Deviations

- The first implementation hard-locked IPv4 whenever an A record existed. Reviewer evidence showed that this removed fallback to a second A or AAAA, so the final policy uses asynchronous pinned lookup plus Undici multi-address selection whenever DNS returned more than one verified address; only a single verified address is family-locked.
- Legacy snapshots have no authoritative provider or per-run analysis record. Their `configuredProvider` is resolved from the current server environment through the same lightweight resolver used by ingestion, while `runAnalysisMode` is conservatively normalized to `none`; historical article analysis never stands in for either runtime fact.

### Discovered edge cases

- A host may resolve to both public IPv6 and IPv4 addresses while the deployment host has no IPv6 route. The validated-address pinning layer must not let an IPv6 connection failure escape the per-source promise boundary.
- A synchronous custom lookup callback on Node 22 can reject the fetch promise and still allow a later socket error to escape. Deferring the pinned callback to a microtask keeps an unreachable single IPv6 address inside the normal rejected-promise path.
- More than one verified address is a fallback set even when every address has the same family. The transport policy keeps multi-address selection for multiple A records as well as mixed A/AAAA records.
- A completed run can discover only already-known or filtered items. In that case there is no per-article analysis mode, which must not be reported as evidence that the configured provider is `rules`.
- SQLite may contain the new nullable provider column with NULL values if an earlier migration was interrupted. Startup now performs idempotent transactional repair whether the column is newly added or already present.

### Questions for review

- None. Source registry contents, ranking thresholds, credentials and scheduler cadence remain unchanged.

### Session summary

- Deviations count: 2.
- Most likely revisit: remove the legacy snapshot normalization after every supported deployment has produced a snapshot containing both new status fields.
- Edge cases found: 5; IPv6-only failure, async socket containment, multi-address fallback, zero-analysis runs and interrupted SQLite migration are covered.
- Questions awaiting review: 0.
- Next session should read this section, `radar/fetch.mjs`, `radar/database.mjs` and the new ingestion/status tests before changing transport or status semantics.

## LLM Chinese editorial backfill session

### Deviations

- Earlier sessions intentionally left historical `rules` articles unchanged. The product requirement is now corrected: every public card must use an LLM-produced Chinese editorial title, summary and engineering reading, while the original-language text remains evidence metadata behind the original link. This session therefore adds an explicit historical backfill instead of treating provider history as immutable.
- The previous cost guard allowed enriched candidates beyond `RADAR_MAX_AI_ITEMS` to fall back to rules. That is incompatible with the corrected publication contract, so every discovered candidate is eligible for body enrichment, every relevant enriched candidate is sent through the configured LLM, and only final publication remains capped; revisit cost controls only as explicit queue admission, never as a raw-prose publishing fallback.

### Discovered edge cases

- `runAnalysisMode=deepseek` describes only articles analyzed during one run; it cannot prove that previously published `rules` rows have been re-edited.
- The existing published-URL terminal deduplication prevents normal ingestion from revisiting historical `rules` rows, so a dedicated idempotent backfill path is required.
- Evidence source priority and editorial-display priority are different concerns: official/practitioner/community weighting may affect confidence, but must not allow a raw-language fallback to become the card title or summary.
- A provider outage may preserve collection availability, but its rules fallback is not publication-ready. The item must stay unpublished and retryable instead of leaking original-language prose into the public snapshot.
- A signal may contain an unedited official article and an edited community article. The LLM-ready article supplies the card prose, while every article still contributes its original link and evidence layer to confidence; editorial readiness must not rewrite evidence authority.
- Backfill and ingestion can each produce a valid atomic snapshot yet still race by publication order. They now hold the same process lock for their full run, while individual model calls never hold a SQLite transaction.
- A stale-lock observer can resume after another process has already installed a new owner at the same path. Reclaim now takes an observation-bound claim and rechecks directory identity plus PID/start time/token before moving anything, so an obsolete observer cannot delete the new owner.
- Counting only Han and Latin characters lets Korean, Cyrillic or Arabic prose plus a short Chinese suffix pass. The editorial ratio now uses every Unicode letter as its denominator while still allowing product names, acronyms and semantic versions.
- A partial backfill updates successful SQLite rows before returning nonzero. The global readiness gate therefore lives in the only snapshot writer, not only in the backfill CLI, so a later ingestion run cannot publish a half-migrated projection.
- Missing, corrupt or seed snapshots previously exposed curated starter signals. Runtime fallback now keeps only static navigation/reference material and fails closed with zero public signals; process startup requires a nonempty database and a valid live snapshot.
- A publication limit applied before enrichment silently starves additional relevant items from one source. All discovered candidates now receive fair full enrichment and every relevant enriched item reaches the LLM; the limit is applied only to final publication.
- A signal with more than eight evidence rows can choose an older high-quality representative whose URL falls outside the normal source window. The public source window keeps evidence-authority ordering and, only when necessary, replaces its final slot with the representative article so the displayed synthesis always retains its exact original link.
- PID liveness alone is not lock ownership because the operating system can reuse a crashed owner's PID. New owners and reclaim claims persist a process-start identity (`/proc` starttime on Linux, controlled `ps` lstart on Unix); a mismatched identity is stale, while legacy or unverifiable identities fail safe as live.

### Questions for review

- None. The user explicitly approved unrestricted LLM use for the backfill; credentials remain server-owned and original URLs/text must be retained.

### Session summary

- Deviations count: 2.
- Most likely revisit: add prompt/model version metadata only when a future editorial contract requires explicitly reprocessing already-valid LLM rows; the current migration deliberately targets only `analysis_mode=rules` without adding a job schema.
- Edge cases found: 13; historical terminal URL deduplication, provider-status ambiguity, evidence/editorial priority, provider failure, resumable CAS updates, snapshot writer races, stale-lock ABA, PID reuse, non-Latin language bypass, partial-migration publication, unavailable snapshot fallback, pre-analysis publication caps and representative-link truncation are handled.
- Questions awaiting review: 0.
- Next session should read this section, `radar/editorial.mjs`, `radar/backfill.mjs` and `scripts/backfill-analysis.mjs` before changing publication readiness or historical migration.

## Editorial retry and legacy LLM repair session

### Deviations

- The earlier migration deliberately selected only `analysis_mode=rules`. Production evidence showed that some legacy DeepSeek/OpenAI rows also predated the current Chinese editorial gate, while readiness already treated them as backlog. The corrected migration now selects every public row that fails `isLlmEditorialReady`, regardless of its historical provider, and still leaves already-valid LLM rows byte-for-byte unchanged.
- Signal source order expresses evidence authority and only guarantees that the editorial representative appears somewhere in the first eight links. The adjacent “阅读原文” action requires an exact provenance target without moving a community representative ahead of official evidence, so snapshots now expose a separate `representativeSource`; `sources` retains its authority ordering, URL deduplication and eight-link cap.

### Discovered edge cases

- Retrying the same provider request after a deterministic Chinese validation failure repeats the same invalid title. The single retry now receives only the bounded local validation reason plus explicit Chinese-led title guidance; raw model output, credentials and source content are not echoed into the correction.
- A legacy LLM provider label does not prove that its stored prose satisfies today's editorial contract. Eligibility is therefore based on the current readiness predicate, not on `analysis_mode` alone.
- A displayed summary may already end in `…` or `...` because truncation happened before rendering; the browser has no hidden longer string to expand. Signal cards now put explicit “查看完整分析” and representative “阅读原文” actions immediately after the summary instead of presenting a fake disclosure.
- In a multi-source event cluster, the highest-quality editorial representative may differ from the newest or highest-authority source. Using the first evidence-sorted URL for “阅读原文” can therefore open a different article from the one that produced the displayed synthesis.

### Questions for review

- None. The current contract intentionally reprocesses only invalid historical LLM rows; prompt/model-version migrations for already-valid rows remain a separate future decision.

### Session summary

- Deviations count: 2.
- Most likely revisit: make `representativeSource` required after every supported deployment has regenerated a post-migration live snapshot; it remains optional only for old snapshot compatibility.
- Edge cases found: 4; deterministic retry feedback, invalid legacy LLM rows, irreversible summary truncation and representative/source mismatch are covered.
- Questions awaiting review: 0.
- Next session should read this section, `radar/analyze.mjs`, `radar/backfill.mjs`, `radar/snapshot.mjs` and `app/components/SignalCard.tsx` before changing editorial retry, migration or source-link behavior.

## Field-aware Chinese correction session

### Deviations

- The initial implementation scoped the fix to retry feedback. Review showed that prevention belongs in the first provider instruction as well: the base prompt now defines Chinese-led behavior for every editorial field, while retries still target the field named by the unchanged local validator.

### Discovered edge cases

- A `summary` or `implication` failure must not receive title-only guidance; otherwise the single retry can repeat the invalid field even though the local gate reported it precisely.
- A generic request for “Chinese structured analysis” does not prevent a model from copying English release-note prose. The first request now forbids English titles, sentences and paragraphs except for irreducible technical names.
- Stronger language requirements must not encourage ratio gaming. The correction forbids meaningless Han padding and fabricated facts while retaining necessary product names, framework names, acronyms and versions.

### Questions for review

- None. Chinese thresholds, provider retry count, source content, publication readiness and fallback behavior remain unchanged.

### Session summary

- Deviations count: 1.
- Most likely revisit: add provider-side language constraints only if a stable structured-output contract can express them directly.
- Edge cases found: 3; under-specified first-pass language, wrong-field retry guidance and Han-ratio gaming are covered.
- Questions awaiting review: 0.
- Next session should read this section and `retryCorrection` in `radar/analyze.mjs` before changing editorial prompts or validation feedback.

## Mainland ingestion resilience session

### Deviations

- A universal public proxy was considered as the fastest way to recover blocked community feeds. It was rejected because it would create an unowned availability and evidence-integrity dependency; the implementation uses verified official/same-community fallback endpoints plus an opt-in operator-owned HTTPS relay.
- A stale `running` repair inside `openDatabase()` would have been mechanically simpler. It was rejected because the web process also opens SQLite while ingestion may legitimately be active; reconciliation now requires the current module-held exclusive task-lock capability and runs before a new ingestion row is created.
- The initial red test assumed Bluesky `public.api.bsky.app` was a usable `searchPosts` fallback. A real endpoint probe returned HTTP 403 while the existing `api.bsky.app` endpoint returned 200, so the known-broken fallback was removed and Bluesky remains eligible for the operator-owned relay instead.

### Discovered edge cases

- A fallback or relay success is availability, not primary health. It updates `last_success_at` but persists `last_status=degraded`, marks the run partial and is counted separately from direct health.
- Fetch errors often expose the actionable network code only at `error.cause.code`. Structured diagnostics walk the bounded cause chain while removing URL query strings and known source/relay query values.
- A relay response may contain relative article links. Those links must resolve against the original source endpoint rather than the relay transport URL.
- Endpoint overrides may change parser kind, parser, URL filters and the parser's discovery homepage, but cannot change the catalog source identity, evidence layer or public homepage.
- An invalid relay template must fail before any relay request: HTTPS is mandatory, URL credentials are forbidden and exactly one `{url}` placeholder is required.
- More than one abandoned `running` row can survive repeated process interruption. Reconciliation updates every unfinished running row in one immediate transaction and is idempotent on later starts.
- HTML search pages can link back to their own filter URLs. The Google fallback whitelist excludes `/search/` and query-only matches so discovery cannot publish the search UI as an Antigravity article.
- A WAF challenge or parser drift may return HTTP 200 while producing zero source items. When fallback or relay is available, `EMPTY_RESULT` is recorded and the next endpoint is attempted; empty fallback and relay responses never count as availability.
- DNS lookup failures previously replaced the resolver exception and lost codes such as `EAI_AGAIN`. The public-target guard now preserves the bounded cause chain for diagnostics.
- A relay template can place `{url}` in a fragment that is never sent to the relay server. Fragment templates are rejected before any relay request.
- A degraded source may outlive its cadence window if scheduling stops. Once stale, it becomes delayed and leaves both degraded and available counts instead of remaining permanently available.

### Questions for review

- Production mainland reachability still depends on the server ISP and any configured operator relay. Built-in fallbacks reduce single-host failures but cannot guarantee that every foreign domain is reachable from every mainland route.

### Session summary

- Deviations count: 3.
- Most likely revisit: add per-source relay routing only if one operator relay should intentionally cover a strict subset of sources.
- Edge cases found: 11; degraded semantics, nested network and DNS codes, relay-relative links, bounded endpoint overrides, relay template validation, multi-row stale-run recovery, search-page self-links, empty successful responses and stale degraded health are covered.
- Questions awaiting review: 1 production-network validation item.
- Next session should read this section, `radar/fetch.mjs`, `radar/catalog.mjs`, `radar/pipeline.mjs` and `scripts/task-lock.mjs` before changing source transport or run lifecycle.

## Dynamic model landscape session

### Confirmed product decisions

- The supplied chart is a visual-density and interaction reference, not a data fixture. No model name, score, price or point position is copied from the screenshot.
- `/models` now separates a scheduled independent-benchmark landscape from the eight-model editorial comparison and the 7/30-day discussion pulse. These clocks and evidence contracts remain explicit on the page.
- The systemd timer still wakes every four hours. The model landscape has its own 24-hour success cadence, while a manual `npm run ingest` always refreshes it immediately.

### Deviations

- An earlier session deliberately kept every capability field editorial and static. That boundary remains true for the eight-model exact comparison, but it no longer applies to the new market-wide landscape: Coding Index, Intelligence Index and benchmark cost per task now refresh from Artificial Analysis as structured external data.
- The reference image contains provider-wide connecting lines. Connecting every model from one provider would imply a false evolution path, so the implementation only connects variants sharing the same normalized provider and short model family.
- Rendering every model label at once would make the chart unreadable. All points are rendered and keyboard reachable, while deterministic collision placement labels up to 92 high-scoring candidates when space allows; an expandable exact table preserves every model and value.

### Discovered edge cases

- The public page exposes more than one encrypted manifest descriptor. The loader tries descriptors in reverse order and accepts only the decrypted object containing a `models` array.
- The manifest path and key rotate. The page is fetched on every due refresh; only same-origin `/data/<hex>.txt` paths and 256-bit hexadecimal keys are accepted.
- HTTP success does not prove schema stability. Missing benchmark fields, non-positive cost, deprecated rows and duplicate IDs are filtered, then a configurable minimum count gate rejects implausibly small results before SQLite replacement.
- A model-source failure must not blank a valid public chart. Failure updates only `last_attempt_at` and `last_error`; the previous payload and `last_success_at` remain unchanged and the run is marked partial.
- Encrypted manifests are binary. The SSRF-safe fetch path now has a bounded byte mode while preserving HTTPS-only target validation, redirect validation, DNS pinning and the existing 5 MiB transport cap; decompression has a separate 20 MiB output cap.
- Provider color alone is inaccessible. Point shape distinguishes open weights and reasoning/non-reasoning forms, every point has a complete accessible label and native title, and the exact table exposes the same values without SVG interpretation.
- On 375 px screens the full-density chart must remain legible instead of shrinking labels. The page keeps a 1320 px plot in an explicit, keyboard-focusable horizontal scroll region and shows a visible scroll cue without increasing root document width.
- Old snapshots do not contain `modelLandscape`. The runtime reader normalizes them to an explicit waiting state instead of rejecting the otherwise valid article snapshot.

### Questions for review

- Artificial Analysis is an independent benchmark dependency, not a provider fact source. If its public manifest contract changes permanently, a second benchmark adapter should be added rather than weakening the count/schema gate.

### Session summary

- Deviations count: 3.
- Most likely revisit: add a second independent structured benchmark source and a field-level disagreement view if the product later needs cross-benchmark comparison.
- Edge cases found: 8; rotating manifests, multi-manifest selection, schema drift, fail-safe retention, bounded binary transport, color-only encoding, mobile density and old-snapshot compatibility are handled.
- Questions awaiting review: 1 external-source durability item.
- Next session should read this section, `radar/model-landscape.mjs`, `radar/database.mjs`, `radar/pipeline.mjs` and `app/models/page.tsx` before changing dynamic model metrics or scheduling.

## Model landscape legibility session

### Deviations

- None. The agreed boundary remains intact: every model keeps its true metric coordinates while only labels move or become interaction-only.

### Discovered edge cases

- The existing label collision check treats prior labels as obstacles but ignores every visible model marker; a legal label box can therefore cover its own marker or a neighboring marker.
- The current fixed 10 px label offset is smaller than the largest dynamic marker radius, so overlap can happen before density is considered.
- Ninety-five live points cannot all carry persistent two-line labels in the high-score cluster; complete access must be preserved through focus, hover and the exact data table instead of forcing every label on screen.
- The existing 1040 px exact-comparison table exposed its min-content width through the mobile page even though its wrapper had `overflow-x: auto`; the model sections and both horizontal scrollers now explicitly shrink to the viewport.
- Live model names can exceed the estimated label rail. Persistent labels are capped at 32 characters with a real ellipsis; the inspector, native picker, point title and exact table retain the full name.

### Questions for review

- None. This is a reversible presentation-only change; ingestion, model metrics, scheduling and stored snapshots are out of scope.

### Session summary

- Deviations count: 0.
- Most likely revisit: tune the 18-candidate ceiling if a future benchmark payload changes provider or score density substantially.
- Edge cases found: 5; marker obstacles, marker radius, impossible all-label density, mobile min-content overflow and long names are handled.
- Questions awaiting review: 0.
- Next session should read this section, `app/lib/model-landscape-layout.mjs` and `app/models/ModelLandscapeChart.tsx` before changing chart density or interaction.

## Model landscape direct-read session

### Deviations

- The prior interaction-first design kept complete metrics in the inspector. The revised design moves representative models' programming, intelligence and cost values back into the plot because the chart's primary job is direct comparison, while the inspector remains a secondary lookup surface.
- A strict 18-candidate label set could leave usable whitespace empty when high-priority labels failed collision checks. Placement now explores a broader ranked pool but stops at 12 accepted two-line callouts.

### Discovered edge cases

- SVG paint order can hide a selected marker under a later overlapping point even when it has an active ring. Points now render from lower to higher capability, with the active point painted last.
- Selecting a model from the full native picker does not guarantee its coordinate is inside a horizontally scrolled viewport. Selection now recenters the chart on that point.
- Dimming all non-active points to 30% destroys the global distribution while inspecting one model. The context layer now stays at 58% opacity and the active point receives a local callout.
- The first two-line pass was structurally correct but remained too small at a 1920 px desktop viewport. Persistent names and values now use a larger data type scale, and the collision rectangles were expanded to match the actual rendered glyphs.

### Questions for review

- None. Data, coordinates, ingestion and update cadence remain unchanged; this session only changes information hierarchy and chart interaction.

### Session summary

- Deviations count: 2.
- Most likely revisit: tune the 12-callout ceiling if a later data payload materially changes chart density.
- Edge cases found: 4; SVG paint order, off-screen picker selection, over-aggressive context dimming and wide-screen label legibility are handled.
- Questions awaiting review: 0.
- Next session should read this section and the preceding legibility session before changing the model chart again.

## Frontier discovery and source coverage session

### Deviations

- The former registry treated evidence layer as the only source taxonomy. The expanded design adds `family` for discovery responsibility while preserving official/practitioner/community as the only confidence-bearing Evidence Layer.
- Generic high-engagement discussions previously failed the fixed-term gate before model review. They now enter a separate exploration path only when recent and sufficiently active; heat never mutates deterministic relevance or evidence scores.

### Discovered edge cases

- Repository releases and repository issue discussions belong to the same discovery family but different evidence layers. Their `independentGroup` values prevent the same organization or platform from appearing as independent corroboration.
- Daily Papers and research indexes return nested JSON fields. Daily Papers heat sums upvotes and discussion counts; the OpenReview challenge endpoint is disabled and replaced by a DBLP JSON parser that prefers the canonical paper/DOI link, falls back to DBLP, and never invents engagement.
- A high AI relevance score for an explored new term needs a bounded final-score path to become watch/publish; the floor comes only from the LLM relevance output, never from raw engagement, and `reject` remains terminal.
- Signal heat must stay finite with empty, missing or malformed engagement/date fields. Log-bounded engagement, exponential freshness and bounded velocity/participation components are normalized to 0–100.
- Old snapshots have no family coverage. Runtime normalization derives only legacy totals and leaves historical by-layer/by-family maps empty instead of inventing classifications.
- An hourly timer can overlap a slow mainland scan if every foreign endpoint reaches its timeout. The existing exclusive lock remains authoritative and the systemd task timeout is extended to 2 hours; per-source cadence still prevents all 89 sources from running every hour.

## 2026-08-03 · Deterministic exploration and public discussion pulses

- High participation is an admission signal only. It is removed from LLM input; a candidate admitted solely through the exploration gate can be downgraded from model `publish` to `watch`, while model `reject` remains terminal.
- Missing, invalid, future or older-than-seven-days timestamps cannot open the exploration gate.
- Only community watch rows that pass the existing OpenAI/DeepSeek Chinese editorial readiness gate become `discussionPulses`. Each pulse keeps the original title and URL, computes heat from its own row, and remains `community-only / 待溯源`; it never enters signal evidence or confidence.
- Source coverage now reports channel counts and deduplicated independent groups. Effective coverage includes sources represented by public signals and public discussion pulses.
- Successful HTTP responses with zero parsed items are unavailable by default. Generic HTML directories use per-site article URL allowlists to stop navigation, archive, category and signup links entering analysis.
- Optional GitHub API credentials are scoped to primary direct requests whose exact host is `api.github.com`; fallback, relay and cross-host redirect requests are uncredentialed.
- Linux.do exposes a public RSS URL but may return a Cloudflare challenge on some routes. The collector uses only the public URL and normal relay chain, and does not automate login or challenge bypass.

### Questions for review

- The 89 configured endpoints are structurally valid public HTTPS sources, but availability varies by ISP, WAF and anonymous GitHub/API quotas. Production server health after one full manual scan remains required external evidence.

### Session summary

- Deviations count: 2.
- Registry: 89 enabled sources — official 27, repository 26, practitioner 12, community 13, research 11.
- Edge cases found: 7; family/layer separation, research JSON shapes, explored-candidate scoring, finite heat, legacy coverage, hourly overlap and public-WAF behavior are handled.
- Questions awaiting review: 1 production-network validation item.
- Next session should read this section, `config/sources.json`, `radar/analyze.mjs`, `radar/fetch.mjs`, `radar/snapshot.mjs` and `scripts/install-scheduler.sh` before changing discovery breadth or coverage semantics.

## 2026-08-03 · Frontier discovery final risk review

- DBLP records that expose only a publication year now keep `publishedAt=null`. Treating the year as January 1 created false precision and caused the 120-day age gate to reject every current DBLP result; unknown month/day is now admitted without pretending it is recent.
- `github-agents-discussions` shares `independentGroup=openai` with OpenAI releases and official channels. A vendor's own issue tracker can contribute discovery and community evidence, but it cannot cross-verify that vendor's official claim.
- Effective coverage is calculated from sources retained by the final public signal slice plus public discussion pulses. Articles beyond the 80-signal public boundary no longer inflate the “current snapshot effective” count.
- Internal `sourceId` metadata is used to calculate coverage and then removed from both public signal sources and `representativeSource`, preserving the existing public snapshot contract.
- GitHub API 401/403 responses retry the primary once without an invalid optional token. Cline and OpenHands issue collectors also have same-repository HTML fallbacks restricted to numeric issue URLs; the OpenHands endpoint follows the canonical `OpenHands/OpenHands` repository.
- A local real-network audit with an 8-second endpoint timeout checked 89 enabled channels: 85 were available and yielded 1,028 parsed items. Official (27/27), repository (26/26) and research (11/11) were fully available; Linux.do returned 403, two Reddit feeds returned 429 and Qbitai exceeded the short audit timeout.

### Final verification

- Targeted frontier contract: 20/20 passed.
- Full unit and integration suite: 142/142 passed.
- Server-rendered route suite: 15/15 passed.
- Next.js production build, TypeScript, ESLint and `git diff --check` passed.
- Remaining external risk is route-specific WAF/rate limiting from the mainland server; failures remain explicit source-health errors and never count an empty parse as healthy.

## 2026-08-03 · Living concept knowledge base rebuild

### Locked scope and risk boundaries

- The authoritative path is `source ingestion -> article analysis -> SQLite articles -> atomic snapshot -> /concepts`. Static `config/concepts.json` may bootstrap canonical names, but it must not remain the public source of truth for knowledge content, evidence maturity or revisions.
- Heat and maturity are independent dimensions. Community engagement may raise heat and discovery priority; it cannot increase maturity, confidence or independent verification.
- Independence is keyed by `independent_group`, not endpoint count. A vendor blog, repository and issue tracker from the same organization remain one evidentiary group.
- Concept synthesis is append-only and versioned. Invalid model JSON, fabricated evidence URLs, failed Chinese editorial checks, stale compare-and-swap writes and interrupted backfills must leave the current public revision and snapshot unchanged.
- Historical work must be resumable and idempotent under the existing exclusive task lock. No destructive migration or silent overwrite is allowed.

### Four-quadrant scan

- Known knowns: the local database has 48 historical published articles across seven concept slugs; production has a larger live corpus. Existing article editorial backfill already demonstrates concurrency, CAS and atomic publication patterns.
- Known unknowns: DeepSeek latency/shape drift, production backfill duration, legacy rows missing source-layer metadata and sparse concepts with only one independent group. These require strict validation, bounded concurrency, deterministic evidence computation and explicit backlog/status output.
- Unknown knowns: aliases hidden in original titles, repeated vendor endpoints that look independent, community heat that can accidentally leak into maturity and old rules-only English edits. Tests must encode these boundaries before production changes.
- Unknown unknowns: future concept merges, contested claims, new relationship types and partial corruption during a long batch. Redirects, typed relation allowlists, revision history, transaction boundaries and last-good retention contain these failures.

### Visual direction

- Palette stays inside the existing Radar system: canvas `#F2F6F8`, surface `#FFFFFF`, ink `#10243E`, evidence blue `#2251FF`, engineering teal `#0B7285`, conflict red `#B42318`.
- UI typography remains the current sans/data-mono pairing. Large display type is reserved for the page thesis and concept name; evidence metadata, revision IDs and maturity readings use the mono role.
- Concepts home wireframe: learning thesis and daily delta ledger; status/search/filter rail; changed/contested/new learning queue; domain-grouped knowledge atlas; candidate observatory.
- Concept detail wireframe: breadcrumb and identity; sticky maturity/evidence rail; anchored long-form dossier; mechanism and implementation patterns; constraints/failure modes; typed claim-evidence ledger; relationships and revision history.
- Signature element: a revision ledger that answers “今天理解发生了什么变化” before showing inventory counts. Generic stat-card grids and decorative AI imagery are explicitly excluded.

### Baseline evidence

- Before this session, `npm test` passed 142 unit/integration tests, the production build and 15 rendered-route tests. The worktree was clean at `ebdb52a`.

## 2026-08-03 · Living concept knowledge base finalization

### Deviations

- The first lifecycle implementation allowed one official group to become Emerging. The final rule requires at least two independent publish-support groups, with at least one official or practitioner; Contested additionally requires that formal support base before a publish conflict.
- A UI resilience fixture originally wrote an all-empty engineering shell through the normal revision API. The production gate remains strict; the test now injects an explicitly marked `legacy-migration` record to verify fail-soft rendering without weakening new writes.
- The initial merge function only moved aliases and installed a redirect. It now creates a transactional canonical revision that folds valid claims, evidence and citations before redirect publication.
- The original snapshot stayed on generic `version=1`. A separate `knowledgeSchemaVersion=1` marker was added so legacy static concept snapshots fail closed without coupling unrelated snapshot fields to the knowledge protocol.

### Discovered edge cases

- Read models were being spread back into persisted concepts, recursively embedding revisions, claims and evidence; seven revisions grew from roughly 4 KB to 6.59 MB. Persisted concept fields now use a strict domain allowlist and grow near-linearly.
- A current concept payload can be corrupt even when append-only revisions remain valid. Reads now recover the latest structurally valid revision, expose `integrityStatus` and `recoveredRevision`, and readiness reports a warning instead of silently dropping the concept.
- Formal concepts were leaking watch/reject evidence through claims, citations and revision payloads. Public projection now follows the article's current publish decision and filters every dependent object while append-only history remains intact.
- New articles and historical concept retries previously had separate effective budgets, and permanent failures could monopolize retry slots. They now share one total budget; new current-hash pending records take priority and failures rotate by oldest attempt.
- An active lease on every remaining article made the backfill CLI loop without progress until `max-batches`. A zero-progress batch now exits partial immediately and preserves the old snapshot.
- Raw model validation errors could echo an attacker-controlled URL into the correction prompt. Concept correction now emits only fixed categories and safe field names for both DeepSeek and OpenAI.
- SQLite revision child tables were mutable even though the parent ledger was append-only. Claims, evidence, relations and citations now reject UPDATE and DELETE.
- A relation parser treated an empty known-concept set as “validation disabled.” Empty is now authoritative: non-empty relations are rejected unless both endpoints already exist as formal knowledge objects.
- Signal-only slugs could render a twelve-section pseudo-concept dossier. They now return 404 and search links to a stable `/signals#slug` anchor.
- Historical high-heat concepts could occupy “learning priority” indefinitely. The queue now first requires a real evidence or material-revision event within seven days.

### Questions for review

- The local repository has no production DeepSeek/OpenAI key and its current database does not contain the production corpus. Structural real-history rehearsal is possible locally, but final content-quality approval still requires running the idempotent backfill on the server and reading generated dossiers rather than relying only on schema/tests.
- Mainland source availability remains external and route-specific. Relay/proxy configuration may improve coverage, but the knowledge maturity rules must continue to count independent organizations rather than endpoint availability.

### Session summary

- Deviations count: 4.
- Most likely revisit: the exact two-group/three-group lifecycle thresholds after enough production evidence has accumulated; changing them must remain a deterministic rule and migration, never an LLM suggestion.
- Edge cases found: 10; recursive payloads, corruption recovery, publication leakage, budget starvation, lease spin, prompt echo, mutable audit rows, empty-known relations, pseudo-concepts and historical-heat ranking are handled.
- Questions awaiting review: 2 external validation items—production LLM content quality and mainland network coverage.
- Next session should read this section, `radar/concept-knowledge.mjs`, `radar/concept-analyze.mjs`, `radar/pipeline.mjs`, `radar/snapshot.mjs`, `scripts/check-concepts.mjs` and `scripts/merge-concepts.mjs` before changing concept semantics or operations.
## Dynamic concept knowledge system session

### Confirmed product decisions

- `/concepts` is a general upper-layer knowledge system for advanced AI Coding engineers, not a static glossary, news view or project-specific recommender.
- The controlled engineering-theme taxonomy is navigation metadata, not a fixed concept allowlist. High-quality official and practitioner material may propose previously unknown concepts.
- One article may establish or revise several independently nameable mechanisms. Identity is decided before persistence as `reuse-existing`, `create-new` or `needs-review` and remains visible in the append-only audit record.
- Candidate knowledge stays separate from formal knowledge but is still learnable: it has a stable slug, internal detail page, evidence layers, independent-source breadth, latest revision and explicit promotion gaps.

### Deviations

- The first knowledge extractor accepted a single concept object. Analyzer v2 uses a bounded `concepts` array and atomically applies every validated output from one article; the legacy single-object shape remains read-compatible only for controlled migration and tests.
- Historical idempotency originally used only article URL and content hash. It now includes knowledge-schema and analyzer versions, so an extractor upgrade reprocesses old successful rows once without requiring a database purge.
- The existing static concept catalog remains an identity/bootstrap comparison input but cannot populate the public concept directory. A first evidence-backed revision may reuse one of those known identities before a SQLite knowledge row exists; that bootstrap identity must have been included in the analyzer's validated known set.

### Discovered edge cases

- A model can return two individually valid concepts plus one invalid concept from the same article. Publishing only the valid subset would make retries nondeterministic, so the whole article result commits in one transaction or rolls back completely.
- Exact slug matching is insufficient for bilingual aliases, while an external embedding service would add an unavailable correctness dependency. The provider makes a structured semantic decision from canonical names, aliases, definitions and mechanisms; local deterministic collision checks remain authoritative.
- `reuse-existing` is valid for a known bootstrap identity even before that identity has an evidence-backed SQLite revision. The analyzer now carries its validated known-slug set into the transactional writer; arbitrary direct writes cannot use this exception.
- Stored candidate knowledge and an article-level candidate can describe the same identity. The public projection normalizes slug/name/aliases before rendering so the homepage shows one candidate and its stable internal detail link.
- Long-form source responsibilities cannot be inferred from source names. `contentRoles` is a validated allowlist persisted through catalog, SQLite and snapshot; current practitioner coverage explicitly includes podcast transcripts, interviews and engineering postmortems.
- Empty or unknown themes must fail closed. Legacy payloads that genuinely predate the field receive a controlled compatibility theme, but an explicit empty/invalid model result is rejected rather than silently repaired.
- A multi-concept response can select a second existing identity that was not implied by the article's old single classification. The analyzer now reloads every newly selected canonical dossier and performs a bounded preservation pass before accepting the rewrite; validation retry budget and preservation refinement are tracked separately.
- Keeping `force=true` across explicit URL batches without removing already processed URLs repeatedly claimed the first article. The backfill result now reports updated URLs so the CLI advances an explicit remaining-URL set while keeping every unprocessed URL forced.

### Verification

- Full unit/integration suite: 257/257.
- Next.js production build and TypeScript: passed.
- Server-rendered route contracts: 39/39.
- ESLint and `git diff --check`: passed.
- Real production history still requires the server LLM key and SQLite corpus; deployment must run editorial backfill, analyzer-v2 concept backfill, `concepts:check`, and a manual content-quality sample before this session can be considered operationally complete.

## 2026-08-03 · Concept learning and incremental compensation closeout

### Confirmed decisions

- A completed history row is current only when its article content hash, knowledge-schema version and analyzer version all match. Normal cadence-aware ingestion gradually compensates stale protocol rows inside the existing retry budget; a first deployment or major protocol upgrade still runs the explicit full backfill to reach readiness promptly.
- Source `contentRoles` are authoritative controlled metadata, not a name-based heuristic. They survive catalog synchronization and article persistence, and are present in the untrusted source context passed to concept analysis; unknown or corrupt values fail closed to an empty list.
- `/concepts` is a daily learning surface as well as a ledger. Five formal-only categories are bounded to three entries, use Asia/Shanghai day boundaries, require recent evidence or material revisions for weekly queues, and expose honest empty states instead of static filler.

### Discovered edge cases

- A historical completed row with a current content hash but an old analyzer version was previously invisible to normal ingestion and could remain stale forever unless an operator remembered a full backfill. Version-aware bounded retry closes that gap without allowing migration work to starve new articles.
- Existing article rows predated `content_roles_json`. Catalog upsert now synchronizes the current controlled roles into those rows so a historical backfill receives the same content responsibilities as new ingestion.
- Initial concept creation contains a field diff that can mention controversies; treating it as a controversy revision would place a brand-new concept in two learning categories. The controversy queue therefore requires a material revision after revision 1 or current conflict evidence.
- Global SSR selectors for formal concepts also matched the new learning items, and old timezone fixtures expected a fourth result despite the explicit three-item cap. Tests now scope formal ledger assertions and preserve Shanghai boundary coverage while still proving that a fourth eligible item is excluded.
- A readiness failure while opening a corrupt, locked or inaccessible SQLite file previously returned only `READINESS_CHECK_FAILED`. The CLI now adds a fixed safe category and actionable storage/permission/lock/integrity guidance without echoing exception text, credentials, environment names or internal absolute paths.

### Verification and external boundary

- Unit/integration suite: 257/257.
- Server-rendered route contracts: 39/39.
- Local `radar:status` still describes the old 16-source, 48-article rules snapshot; local concept status is 0 formal, 0 candidate, 0 revision, 0 evidence, 0 claim and 48 pending articles.
- This proves the implementation and migration contracts locally, but not production content quality. Operational completion still requires the server LLM credentials and production SQLite corpus, successful editorial and concept backfills, `concepts:check`, atomic restart, and manual dossier/evidence sampling.

## 2026-08-03 · Concept authority, learning semantics and operations closeout

### Correctness decisions

- A watched candidate whose current article decision becomes `reject` is retired through a system-only archival path. The rejected URL remains only in append-only audit history; the current candidate projection has no public evidence, claims or citations, and snapshot publication remains available.
- The source catalog is authoritative for historical article identity. Catalog upsert synchronizes source name, class, independent group, evidence layer, language and controlled content roles in the same transaction; lifecycle maintenance then appends a reprojected revision instead of mutating old revisions or preserving false independence.
- Historical concept idempotency now includes a SHA-256 input-contract fingerprint over article content hash and normalized controlled content roles. A role change re-enters backfill even when body/schema/analyzer are unchanged; commit-time CAS rejects body or role drift and retains last-good knowledge.
- Detail enrichment failure is not a silent success. Feed excerpts remain usable as `excerpt-only`, while the item, deduplicated source health and run become degraded/partial with a fixed safe diagnostic code. Discovery fallback plus enrichment fallback for the same source counts as one degraded source.
- `recentFailures` exposes at most ten newest current-boundary failed/conflict articles as URL, status and attempted time. It excludes stale body/role/schema/analyzer boundaries and never selects or serializes stored model error text.

### Product semantics corrected

- Shared evidence may appear beside every claim it actually supports; deduplication is local to one claim and to the separate source inventory, not global across claims.
- Missing evolution evidence renders an explicit evidence-insufficient state. Signal recency and titles can no longer masquerade as concept origin or evolution.
- “Today revised” finds the latest material revision within the Shanghai day even when a later context-only revision exists.
- “Weekly warming” requires positive heat/temperature field diffs within seven days and ranks by cumulative increase, largest single increase and latest increase. Current high heat or a generic recent event cannot fill the queue.
- Promoted canonical identities are removed from the candidate projection by slug, normalized name, alias and merge redirect. Formal relations include navigable targets, confidence and adjacent source links; unavailable/corrupt snapshots fail the relation graph closed.

### Verification and external gate

- Unit/integration suite: 265/265.
- Server-rendered route contracts: 46/46.
- Next.js production build, TypeScript, ESLint, shell syntax and `git diff --check`: passed.
- The local database remains the old 16-source/48-article rules corpus: 0 formal concepts, 0 candidates and 48 pending concept analyses. `recentFailures=[]` is expected because no current concept attempt has run locally.
- Code and migration contracts are complete locally. Operational acceptance remains external until the production DeepSeek/OpenAI credentials and production SQLite corpus complete editorial backfill, analyzer-v2 concept backfill, readiness checks, atomic restart and the documented manual sample of formal dossiers, candidates, multi-concept articles, revisions and claim-to-evidence bindings.

## 2026-08-03 · Final authority and operational hardening review

### Correctness closeout

- Incremental retry selection and readiness now use the same input-contract boundary as the backfill worker: article body hash plus normalized `contentRoles`, knowledge schema and analyzer version. A catalog role correction becomes pending exactly once, is selected inside the bounded retry budget, and returns to completed only after the new contract commits.
- Lifecycle maintenance can append an `archived` revision for a formerly formal concept after all current evidence becomes non-public. In the same deterministic projection it appends source-concept revisions that remove inbound relations to the retiring target; historical revisions and old edges remain immutable audit evidence.
- Operational failure projections strip URL query and fragment data and reduce provider errors to fixed safe categories. Authoritative article and evidence URLs are unchanged, while backfill results, readiness, CLI output, pipeline logs, snapshots and `/api/status` expose only a safe HTTPS host+path locator.
- `recentFailures` survives the server normalization boundary, including an explicit empty array for current and legacy snapshots. Raw or hand-edited snapshots receive the same defense-in-depth URL and error-field cleanup before the public status API.
- The scheduler validates the resolved Node binary as the final systemd `APP_USER` before writing units, rejects runtimes below Node 22.13.0, and performs a real `node:sqlite` capability import; `radar:status` loads the project `.env.production` before resolving SQLite or snapshot paths. Concept evidence cards use `h3` inside dossier `h2` sections.

### Verification and remaining external gate

- Unit/integration suite: 272/272.
- Server-rendered route contracts: 46/46.
- Next.js production build and TypeScript: passed.
- The final external gate is unchanged: run the analyzer-v2 concept backfill against the production corpus with the configured provider, pass `concepts:check`, publish/restart atomically, then manually sample formal dossiers, candidates, multi-concept articles, revisions and claim-to-evidence links. Until that content audit is complete, operational acceptance remains open.

## 2026-08-03 · Production concept-output convergence repair

- Production evidence: the first 20 DeepSeek history rows completed network/auth requests but produced 0 valid revisions. Safe classification showed 9 relation, 5 Chinese editorial, 3 schema, 1 evidence, 1 theme and 1 invalid-JSON failure. This rules out proxy, key and provider availability as the primary cause.
- The repair deliberately keeps the parser, evidence allowlist, identity rules, Chinese core-field gate, per-article atomic transaction and snapshot publication gate strict. It adds a pre-validation normalization boundary only for reversible mechanical drift: fenced JSON extraction, controlled theme alias mapping, bounded numeric/date normalization, missing empty arrays, authoritative metadata for an exact allowed evidence URL, current-source citation completion, and removal of optional invalid relations or English-only list entries.
- Fabricated evidence URLs remain fatal and trigger a sanitized retry; required Chinese prose cannot be synthesized locally and therefore also retries. Corrections now name the exact safe field without echoing the rejected model value, URL or provider body. Default concept attempts rise from 2 to 3 and DeepSeek output budget from 12K runtime fallback / 6K example configuration to 32K, while remaining under the provider's documented maximum.
- Operational failures now expose a fixed `errorCategory` through the backfill result, readiness snapshot, `concepts:check` and `/api/status`; raw SQLite `last_error`, model text, URL query/fragment and credentials remain internal.
- Production acceptance remains open until the fixed commit is deployed, the failed backlog is rerun to `pending=0 / failed=0`, at least one formal concept passes readiness, and the documented manual dossier/evidence sample is completed.
- Local verification after the repair: 277/277 unit/integration tests, 46/46 rendered-route contracts, lint, TypeScript and the Next.js production build all pass. Focused fixtures cover the six production failure families, safe retry convergence, fabricated-evidence rejection and operational redaction.

## 2026-08-03 · Staged concept extraction optimization

### Deviations

- The initial design allowed one article to emit up to eight complete dossiers. Production achieved only 11/40 successful articles after two batches, so the implementation is being changed to a compact evidence extraction contract followed by deterministic local dossier assembly; the append-only revision and publication contracts remain unchanged.

### Discovered edge cases

- `concept_backfill_attempts` currently marks the whole claimed batch as `running` before the concurrency-limited workers start, and uses the batch claim time as completion time. This makes queued work indistinguishable from active provider calls and prevents trustworthy progress diagnosis.
- A new concept can be evidence-sparse without being invalid, while a formal concept must still satisfy the existing multi-source public-quality gate. The staged adapter therefore needs sparse candidate semantics without weakening formal publication.

### Questions for review

- Production evidence is sufficient to cap per-article extraction at three concepts and exclude relation synthesis from the article pass. Relation enrichment can be reintroduced as a separate evidence-accumulation job when formal concept coverage is nonzero.

### Completed implementation

- Concept analysis now uses `concept-analyzer-v3`: the provider returns at most three compact evidence deltas, while the application attaches authoritative article metadata, claim support, field citations, existing dossier fields and existing relations locally. Evidence-poor release notes may return zero concepts and become a completed audit row instead of a permanent retry.
- Sparse candidates may keep unsupported fields empty; formal publication still requires the existing complete engineering depth, publish evidence, field citations, atomic revision, lifecycle and independent-source gates. Fabricated URLs, English-led knowledge and invalid identities remain failures.
- Backfill attempts become `running` only when a worker actually begins provider work. Per-article start/completion events expose safe URL, position, elapsed time and fixed error category; queued leased rows no longer look like active requests.
- The compact response budget is 8K and both historical and incremental concept concurrency default to four. The public configuration and deployment documentation use the same values.

### Final verification summary

- Full unit/integration suite: 281/281.
- Server-rendered route contracts: 46/46.
- Next.js production build and TypeScript: passed.
- ESLint, syntax checks and `git diff --check`: passed.
- Production acceptance still requires deploying analyzer-v3, stopping or letting any analyzer-v2 foreground worker finish, rerunning the resumable concept backfill, passing `concepts:check`, and manually sampling the resulting candidates and formal dossiers.

## 2026-08-04 · Concept tail-backlog convergence repair

### Production evidence and risk boundary

- The production backlog converged from hundreds of articles to 12 repeat failures. The remaining failures were dominated by `evidence-contract` and `chinese-editorial`, so the repair targets compact-response normalization and revision merging rather than provider connectivity, source discovery or database leasing.
- Formal publication gates remain strict: no fabricated evidence URL, English-led public knowledge, unsupported formal field or non-publish citation is accepted. Historical revisions remain append-only and no failed row is deleted.

### Correctness repairs

- Compact DeepSeek output is now salvaged field by field. Invalid English prose, list items and claims are discarded while valid Chinese evidence survives; an invalid identity explanation is conservatively downgraded to `needs-review`, and a missing Chinese daily delta is deterministically derived only from a valid Chinese atomic claim.
- A completely unusable compact result receives the configured correction retry. If every attempt still contains no valid Chinese substantive field and no valid claim, the article completes with zero extracted concepts instead of fabricating knowledge or permanently blocking the resumable backlog.
- Compact analysis now carries a non-public extraction-delta contract. Revision merging applies only the fields, claims, citations and current evidence URL extracted from this article, preventing a provider-carried historical dossier from overwriting authoritative claim bindings or relations.
- Watch evidence remains in the append-only revision audit but cannot replace a formal concept's published last-good field without a publish-eligible citation. An identity uncertainty on a new watch item also cannot silently demote an already formal concept.

### Discovered edge case

- Last-good preservation must not restore a field that the publish projection intentionally cleared. It therefore restores only a non-empty projected value that lacks publish support; a deliberate, valid empty update such as clearing resolved controversies remains authoritative.

### Final verification summary

- Focused compact/backfill/lifecycle suite: 81/81.
- Full unit/integration suite: 284/284.
- Server-rendered route contracts: 46/46.
- ESLint, TypeScript, Next.js production build and `git diff --check`: passed.
- Production acceptance requires deploying this revision, rerunning `concepts:backfill` until no worker remains, and confirming `pendingArticleCount=0`, `failedArticleCount=0`, healthy recovery status and readable formal/candidate dossiers.

## 2026-08-04 · Formal official-only implementation delta repair

### Production evidence and reproduced root cause

- After the first tail-backlog repair, production processed 2/12 articles and rejected 10/12 as `evidence-contract`. A production-shaped local fixture reproduced the exact internal reason: `NO_PRACTITIONER_IMPLEMENTATION_EVIDENCE`.
- The failing materials add official/vendor implementation details to existing formal concepts. A changed `implementationPatterns` value correctly cannot inherit an old practitioner's citation, but the writer incorrectly treated the resulting official-only delta as a fatal regression instead of an auditable pending cross-validation.

### Correctness decisions and edge cases

- The current formal projection now retains the previous practitioner-backed `implementationPatterns` field and citation when a new wording has only official evidence. New official evidence and source-bound claims remain in the current evidence set; the unverified new field wording remains in the append-only revision audit.
- The audit writer previously overlaid the entire public last-good concept onto the audit concept twice, silently erasing the official/watch knowledge delta. It now overlays only stable identity and lifecycle metadata and persists the actual analyzed knowledge fields in `concept_revisions`.
- The formal publication requirement for practitioner implementation evidence remains unchanged. No evidence URL, claim binding, Chinese editorial, identity, lifecycle or snapshot gate was weakened.

### Final five-line summary

- Deviations: 1; a broad `evidence-contract` diagnosis was replaced by a production-shaped exact-code reproduction before changing the writer.
- Most likely revisit: official-only implementation deltas remain non-public until practitioner evidence validates the new wording.
- Edge cases found: a valid official delta could fail a formal dossier, and the audit payload could then erase that same delta.
- Verification: concept/revision/publication suite 99/99; full unit/integration suite 285/285; ESLint, TypeScript and production build passed.
- Next session: read this section, `preserveFormalLastGoodFields`, the audit branch in `applyConceptKnowledgeRevision`, and the production backfill output before changing formal evidence rules.
