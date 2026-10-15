# Winner Statistics

## Scope

Record ideas and definitions for analysing shots recorded as winners, including forced errors, distinct from simply winning a point. Follow the [general design checklist](statistics_design.md#metric-documentation-checklist).

## Agreed Model

**Agreed 2026-10-13.** Apply the [shared outcome and shot-count model](statistics_design.md#agreed-outcome-and-shot-count-model).

- Winner and forced error are one category, credited to the player who produced the winning/forcing shot. An opponent UE awards a point but is not counted as a winner shot.
- **Serve-filter clarification, 2026-10-14:** the Serve Statistics filter named Serve winner includes `ace` and `return_error`. This is a broader service-outcome grouping, not the Winner Statistics shot category: a return error remains receiver UE and does not add a server winner shot to this topic or the unchanged Summary. A server win before shot 7 qualifies as Serve advantage whether it ended through a winner or an opponent UE.
- For a rally forced error, choose `server_winner` if the server caused it or `returner_winner` if the receiver caused it. Attribute the recorded final-shot factors to that causing player; do not record the opponent's forced error as a UE or count it as a second outcome.
- Map `ace` to a server winner at shot 1; `return_winner` to a receiver winner at shot 2; and rally `server_winner` / `returner_winner` to the respective player's winner at a recorded total of 3+.
- Server endings normally have odd counts and receiver endings even counts. Example: serve (1), return (2), server winner (3) is serve plus one. For forced-error contacts, the shared counting edge case must be resolved before parity can be enforced.
- Winner endings on shots 1-6 are serve-related; those at 7+ are neutralised. These are contextual categories, not causal claims or an agreed weighted winner score.
- Inputs: `end`, `server`, `winner`, `rally.ending`, `rally.count`, and applicable final-shot factors. Keep direct serve/return outcomes distinct from rally-only metadata when grouping winners.

## Ideas and Open Questions

- **Proposed question:** Which recorded shot and incoming-ball attributes help describe winner patterns?
- **Proposed question:** Can the logs measure success per opportunity, or only the distribution of recorded winners? Do not assume unrecorded shot opportunities are available.

## Metric Definitions

Pending design. For each metric, document its rationale, inputs, eligibility, formula, denominator, filters, aggregation, and missing-data handling before claiming implementation.

## Implementation and Validation

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Winner Statistics section. General Statistics reuses the existing Summary winner totals and subcounts, including the existing Lucky ball exception; see the [reused Summary contract](statistics_design.md#reused-summary-contract). No new advanced winner metric is implemented.

This update agrees definitions only. Future validation must cover winner-versus-opponent-UE attribution, fixed counts 1/2, serve plus one at 3, phase boundary 6/7 and missing/legacy counts. Winner rates still need explicit opportunity denominators; the final-shot sample does not contain all shots. Unknown-phase winners may remain in eligible overall winner counts but must be reported outside phase-specific denominators.

No implementation is introduced by this document. Add source/test references, worked examples, validation results, and interpretation limits as winner statistics are developed. Existing winner statistics still need to be inventoried.

## Decision History

- **2026-10-14 - Cross-topic clarification:** Distinguished the agreed ace + return error Serve winner filter from shot-winner attribution. Serve advantage/win filters describe point results and overlap; they do not redefine Winner Statistics or Summary counts. Documentation only.
- **2026-10-13 - Confirmed attribution:** A rally forced error is a winner credited to the player who caused it. Final unsuccessful-contact counting remains separate from winner attribution; no calculations changed.
- **2026-10-13 - Agreed:** Confirmed winner includes forced error and documented shot-count/phase interpretation without introducing a new metric.
- **2026-10-13:** Established the winner-specific design record. The questions above are proposals, not agreed calculations.
