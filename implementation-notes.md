# Implementation notes

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
