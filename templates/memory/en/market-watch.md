# Competitive intelligence & trends

Last Updated: {{DATE}}

Source of truth for market watch. Three **isolated** sections: raw → candidate → promoted.
Rules: every observation is **sourced and dated**; the watch **never writes** to
`roadmap.md`; a topic only leaves the backlog through **human validation** into
`@ailed-brainstorm`. Maintained by `@ailed-scout`, `@ailed-seo-aso`, `@ailed-monetization`,
`@ailed-fact-check`, `@ailed-analyst`.

## Sources & cadence

- Watch channel: see `memory/config.md` (**Watch** integration). `{{DISABLED}}` = watch inactive.
- Tracked competitors / feeds: TODO
- Refresh cadence: TODO (e.g. monthly)

## Raw observations

Added by `@ailed-scout`, `@ailed-seo-aso`, `@ailed-monetization`; verified by `@ailed-fact-check`.
Confidence: `high` / `medium` / `low`. Categories: `feature`, `pricing`, `trend`, `ux`,
`seo`, `aso`, `monetization`… Decay beyond 6 months (faster for `seo`/`aso`/`monetization`,
volatile).
Rotation: rejected observations (with their reason) or decayed ones (> 6 months) are **moved**
to `memory/archive/market-watch.md` — never deleted (see `memory/process.md` § Memory rotation).
Keep a short active table here.

| Date | Source (URL) | Confidence | Observation | Category |
| ---- | ------------ | ---------- | ----------- | -------- |

## Specialised analyses

Detailed benchmarks acting as **evidence** for the observations above. Filled by the
specialist agents, sourced and dated. `@ailed-analyst` references them to derive topics;
these sections **never write** to the roadmap.

### SEO / ASO

Maintained by `@ailed-seo-aso` (internal audit + gaps vs competitors). `—` if the integration is off.

| Date | Type (SEO/ASO) | Keyword / asset | Us | Best competitor | Source (tool/URL) | Opportunity |
| ---- | -------------- | --------------- | -- | --------------- | ----------------- | ----------- |

### Monetization

Maintained by `@ailed-monetization` (current model vs competitors). `—` if the watch is off.

| Date | Player | Model | Tier / price | Packaging | Source (URL) | Gap vs us |
| ---- | ------ | ----- | ------------ | --------- | ------------ | --------- |

## Candidate topics backlog

Derived by `@ailed-analyst` from **verified** observations (all categories, including
`seo`/`aso`/`monetization`) and the specialised analyses. Scores 1-5.
Status: `candidate` · `dropped (reason)` · `validated→brainstorm`.
**Only a human** moves a topic to `validated→brainstorm`; it then enters the Feature workflow.

| ID | Topic | Value hypothesis | Evidence (obs. ref.) | Impact | Effort | Alignment | Confidence | Status |
| -- | ----- | ---------------- | -------------------- | ------ | ------ | --------- | ---------- | ------ |
