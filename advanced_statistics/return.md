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
- **Updated 2026-10-15:** later endings now use `rally.impact` ([Serve Impact State](statistics_design.md#serve-impact-state-replaces-rally-count)) instead of a count. Serve disadvantage is the receiver's perspective of holding the initiative against the serve; its button is labelled **Return advantage** since 2026-10-15. The normal stats Return advantage row then counted the receiver's return aces plus their winners in those points (formerly winners at counts 2/4/6); **superseded the same day** by the [Return advantage statistic](#return-advantage). Legacy counts map to a state only when `rally.impact` is absent.
- **Serve advantage / disadvantage statistics agreed 2026-10-15:** from the server's perspective, a return error counts in [Serve advantage](statistics_design.md#serve-advantage-statistic), and a return ace, plus receiver winners in Return advantage points, count in [Serve disadvantage](statistics_design.md#serve-disadvantage-statistic). Receiver attribution is unchanged.
- **Return advantage statistic agreed 2026-10-15:** see [Metric Definitions](#return-advantage).

## Ideas and Open Questions

- **Proposed question:** How should return-shot outcomes be distinguished from eventual point outcomes?
	- **Partly resolved 2026-10-13:** Direct return winner/UE classifications and count 2 are agreed; a later point win is not automatically a return winner. Rates and attribution for points continuing beyond the return remain to be designed.
- **Proposed question:** Which recorded serve and return context supports meaningful comparisons, and where is coverage incomplete?

## Metric Definitions

For each metric, document its rationale, inputs, eligibility, formula, denominator, filters, aggregation, and missing-data handling before claiming implementation.

### Return Advantage

**Agreed 2026-10-15 (user definition); implemented in the normal stats Forehand / backhand table, Return games row. Deployed 2026-10-15.** Full definition in [the general design](statistics_design.md#return-advantage-statistic).

- **Rationale:** measures how often the receiver turned the return into a point won by holding the initiative, without crediting them for the server's double faults.
- **Counts:** return ace (`end: 'return_winner'`), or receiver winner / server UE in a point with Serve Impact State **Return advantage** (`rally.impact: 'serve_disadvantage'`, or a legacy count of 3-6 ending with a receiver shot).
- **Does not count:** double faults; return errors; receiver UEs or server winners in Return advantage points; Serve + 1, Serve advantage and Neutralised points; rallies with unknown state.
- **Inputs:** `end`, `server`, `winner`, `rally.ending`, `rally.impact` (else legacy `rally.count`), and the return stroke (`serves[].return.stroke`) or `rally.stroke` for Forehand / Backhand.
- **Formula:** count of qualifying points in the selected player's return games; no denominator. Forehand / Backhand count only the receiver's own ending shots, so server UEs appear in the total only.
- **Filters:** match / set / player selection of the stats page; Lucky balls excluded.
- **Relationship:** Return advantage = opponent's Serve disadvantage minus double faults on the same points.
- **Example:** return ace + receiver winner in Return advantage + server UE in Return advantage = 3; a double fault adds 0.
- **Limitations:** the state is the scorer's judgement of initiative; legacy-mapped points use the ending-shot player as a proxy. A count, not a rate: return-point totals are not used as a denominator.

## Implementation and Validation

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Return Statistics section. Existing Summary return winner/error counts remain under General Statistics; see the [reused Summary contract](statistics_design.md#reused-summary-contract). No new advanced return metric is implemented.

No new return or phase calculation is implemented here. Future checks must cover count 2 for both direct return endings, receiver UE versus server winner attribution, the 6/7 threshold, and missing return attributes on continuing points. Apply the shared unknown-phase exclusions and report coverage; do not manufacture return observations from eventual results.

Apart from the Return advantage row below, no return calculation is implemented by this document.

**2026-10-15 - Return advantage implemented (deployed 2026-10-15):** `strokeStats` in [matchStats.ts](../src/stats/matchStats.ts). **Validated:** [matchStats.test.ts](../src/stats/matchStats.test.ts) checks a total of 2 with forehand 1 / backhand 0 (receiver winner and server UE in Return advantage, double fault excluded) and a return ace in the first fixture; 215 tests and the build pass. Help and the stats-page footnote describe the definition.

Add source/test references, worked examples, validation results, and interpretation limits as return statistics are developed. Existing return statistics still need to be inventoried.

## Decision History

- **2026-10-15 - Return advantage statistic agreed:** return ace, or receiver winner / server UE in a Return advantage point; double faults excluded. Supersedes the winners-only row. Implemented; deployed 2026-10-15.
- **2026-10-15 - Serve advantage / disadvantage statistics agreed:** return error feeds Serve advantage; return ace and receiver winners in Serve disadvantage feed Serve disadvantage. Return advantage row unchanged at that point (resolved in the entry above).
- **2026-10-15 - Serve Impact State:** Return advantage row redefined from even shot counts to return aces plus receiver winners in Serve disadvantage points. Implemented; deployed 2026-10-15 (version `6506990f`).
- **2026-10-14 - Cross-topic clarification:** Return error is included in the new Serve winner filter while retaining receiver UE attribution and known shot count 2. Return winner maps to serve disadvantage/loss. No calculations or Summary behavior changed.
- **2026-10-13 - Agreed:** Recorded shot-2 return outcomes, winner/UE separation and early-versus-neutralised phase interpretation; no calculations changed.
- **2026-10-13:** Established the return-specific design record. The questions above are proposals, not agreed calculations.
