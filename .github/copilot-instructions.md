# Statistics Documentation

- Treat `advanced_statistics/` as the living design record for tennis statistics derived from recorded match logs.
- When proposing, creating, or changing statistics, update the documentation in the same task without waiting for a separate request.
- Whenever serve or rally recording factors are added, changed, or removed (including `src/ui/pages/MatchTracker.tsx`, `src/ui/components/RallyEntry.tsx`, and related options/types in `src/model/types.ts`), automatically update the recorded factor inventory in `advanced_statistics/statistics_design.md` in the same task, even if no statistics calculation changes. Verify UI labels/options, saved field paths, selection cardinality, defaults, conditional availability, and legacy-data implications; update affected topic designs when applicable.
- Record shared ideas, rationale, assumptions, model decisions, and cross-topic changes in `advanced_statistics/statistics_design.md`.
- Record topic-specific ideas and metric details in the relevant files: `return.md`, `serve.md`, `winner.md`, and `unforced_error.md` within that folder. Update every affected topic, not unrelated topics.
- Follow the documentation checklist in [the general design](../advanced_statistics/statistics_design.md). Include formulas and denominators, required log fields, filters, missing-data behavior, limitations, and implementation/test references when applicable.
- Clearly distinguish proposed ideas, agreed designs, implemented behavior, and validated results. Do not present ideas as implemented or infer unrecorded observations as facts.
- Preserve existing user ideas; explain revisions and their rationale. Keep documentation aligned when metrics are changed or removed.
- Read `workflow.md` when resuming work and record meaningful statistics decisions and completed changes there.