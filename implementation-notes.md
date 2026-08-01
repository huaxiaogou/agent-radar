# Implementation notes

## Deviations

- The generated UI database recommendation was an AI-purple chatbot/landing pattern. It was replaced with the reversible “signal cartography” direction because the product is an evidence dashboard, not a conversational product; revisit by replacing the master tokens only.

## Discovered edge cases

- The first release is a curated, read-only intelligence experience: live ingestion, authentication, and persistent review actions remain out of this visual implementation.
- A graph view cannot be the sole representation of concept relationships; the implementation must include a readable relationship list for accessibility and mobile use.
- Static seed signals must identify themselves as a curated snapshot so the interface never implies a live connector is already running.
- The first generated social card invented a date and coordinates. The single allowed correction pass removed all ungrounded metadata before the asset was wired into the site.
- A production-dependency audit after the first private deployment found the starter's pinned Next.js 16.2.6 plus transitive PostCSS/Sharp versions in active high-severity advisories. Next.js was patched to 16.2.12 and the two transitive packages were pinned to fixed releases before rebuilding.

## Questions for review

- None. The user approved the four V1 product defaults before implementation began.

## Session summary

- Deviations count: 1.
- Most likely revisit: replace the signal-cartography token system only if the product later shifts from personal intelligence desk to public media site.
- Edge cases found: 5; all handled without expanding V1 into live ingestion or authentication.
- Questions awaiting review: 0.
- Next session should read `design-system/agent-radar/MASTER.md` first, then this file before adding live connectors.
