# Return Statistics

## Scope

Record ideas and definitions for analysing the receiving player's return performance from recorded match logs. Follow the [general design checklist](statistics_design.md#metric-documentation-checklist).

## Agreed Model

**Agreed 2026-10-13.** Apply the [shared outcome and shot-count model](statistics_design.md#agreed-outcome-and-shot-count-model).

- Return is shot 2. `return_winner` is a receiver winner, including forcing an opponent error; `return_error` is a receiver UE. Both terminate at total count 2 under the agreed model.
- **Serve-filter clarification, 2026-10-14:** `return_error` also belongs to the broader Serve winner filter, and therefore Serve advantage and Serve win, at its known count 2. It remains a receiver UE for return/shot attribution and the preserved Summary. `return_winner` belongs to Serve disadvantage and Serve loss from the server's perspective. These are overlapping analytical views, not additional point outcomes or reclassified shots.
- An ace or unreturnable serve is a server winner at shot 1, not a receiver UE at shot 2, even when the receiver cannot make a playable return.
- If the exchange continues, the server's next shot is shot 3. Subsequent receiver shots normally have even numbers; this identifies the ending-shot player, not necessarily the point winner.
- Return outcomes at shot 2 are serve-related. Later receiver endings at shot 6 are also serve-related; shot 8 is neutralised because the exchange reached 7.
- Inputs: `end`, `server`, `winner`, and `serves[].return` for direct return details; `rally.ending` / `rally.count` for later endings. Continuing returns have no dedicated return-detail record, so these factors cannot supply an all-return-opportunity success rate without further design.

## Ideas and Open Questions

- **Proposed question:** How should return-shot outcomes be distinguished from eventual point outcomes?
	- **Partly resolved 2026-10-13:** Direct return winner/UE classifications and count 2 are agreed; a later point win is not automatically a return winner. Rates and attribution for points continuing beyond the return remain to be designed.
- **Proposed question:** Which recorded serve and return context supports meaningful comparisons, and where is coverage incomplete?

## Metric Definitions

Pending design. For each metric, document its rationale, inputs, eligibility, formula, denominator, filters, aggregation, and missing-data handling before claiming implementation.

## Implementation and Validation

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Return Statistics section. Existing Summary return winner/error counts remain under General Statistics; see the [reused Summary contract](statistics_design.md#reused-summary-contract). No new advanced return metric is implemented.

No new return or phase calculation is implemented here. Future checks must cover count 2 for both direct return endings, receiver UE versus server winner attribution, the 6/7 threshold, and missing return attributes on continuing points. Apply the shared unknown-phase exclusions and report coverage; do not manufacture return observations from eventual results.

No implementation is introduced by this document. Add source/test references, worked examples, validation results, and interpretation limits as return statistics are developed. Existing return statistics still need to be inventoried.

## Decision History

- **2026-10-14 - Cross-topic clarification:** Return error is included in the new Serve winner filter while retaining receiver UE attribution and known shot count 2. Return winner maps to serve disadvantage/loss. No calculations or Summary behavior changed.
- **2026-10-13 - Agreed:** Recorded shot-2 return outcomes, winner/UE separation and early-versus-neutralised phase interpretation; no calculations changed.
- **2026-10-13:** Established the return-specific design record. The questions above are proposals, not agreed calculations.
