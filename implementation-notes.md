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
