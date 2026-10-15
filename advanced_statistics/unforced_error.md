# Unforced Error Statistics

## Scope

Record ideas and definitions for analysing shots recorded as unforced errors. Keep recorded classifications separate from interpretations of their causes. Follow the [general design checklist](statistics_design.md#metric-documentation-checklist).

## Agreed Model

**Agreed 2026-10-13.** Apply the [shared outcome and shot-count model](statistics_design.md#agreed-outcome-and-shot-count-model).

- UE is separate from the combined winner/forced-error category. Attribute a UE to the player making the error, not to the player winning the point.
- A return error (`return_error`) is a receiver UE at shot 2. An unreturnable serve or forced return error belongs to the server-winner category, not return UE.
- **Serve-filter clarification, 2026-10-14:** a recorded return UE also qualifies for the broader Serve winner, Serve advantage and Serve win filters from the server's perspective. This does not remove its receiver UE attribution or add a server winner shot to Winner Statistics/Summary.
- Rally `server_error` and `returner_error` identify the erring player. Total count includes the ending UE stroke: a server UE at shot 3 is an odd-shot ending even though the receiver wins; a receiver UE at shot 4 is even even though the server wins.
- UEs at shots 2-6 are serve-related; rally UEs at 7+ are neutralised. This does not prove the serve caused any individual error.
- Inputs: `end`, `server`, `winner`, conditional `serves[].return.error`, and `rally.ending` / `rally.count` / `rally.error`. Optional error direction being `none` does not erase an explicitly recorded UE outcome.
- **Updated 2026-10-15:** rally UEs now take their phase from `rally.impact` ([Serve Impact State](statistics_design.md#serve-impact-state-replaces-rally-count)) rather than a count. Normal stats rows Short/Long rally UE became Serve-phase UE (double faults, return errors and rally UEs in Serve + 1 / advantage / disadvantage points) and Neutralised UE. Because the state records initiative independently of the ending, a UE by the player holding the advantage is representable.
- **Serve advantage / disadvantage statistics agreed 2026-10-15:** receiver UEs (return errors, and receiver UEs in Serve advantage points) count in [Serve advantage](statistics_design.md#serve-advantage-statistic); double faults and server UEs in Serve disadvantage points count in [Serve disadvantage](statistics_design.md#serve-disadvantage-statistic). A UE by the player holding the initiative (server UE in Serve advantage, receiver UE in Serve disadvantage) counts in neither. Server UEs in Return advantage points also count in the receiver's Return advantage row; double faults do not. UE attribution and totals are unchanged.
- **UE inclusion agreed 2026-10-14:** double fault counts as one UE of the server, with known total shot count 1 and a serve-related phase. Retain the `double_fault` subtype within the total; it is not a shot-2 return UE or rally UE. Two fault attempts do not contribute two UEs. This resolves the previously open combined-UE inclusion question and agrees with existing Summary behavior.
- A rally forced error is credited as the causing player's winner, not as an additional UE by the opponent; it must not be counted in both categories.

## Ideas and Open Questions

- **Proposed question:** Which recorded shot and incoming-ball contexts are associated with unforced errors?
- **Proposed question:** How should classification subjectivity, missing context, and unavailable shot-opportunity counts limit comparisons?

## Metric Definitions

Pending design. For each metric, document its rationale, inputs, eligibility, formula, denominator, filters, aggregation, and missing-data handling before claiming implementation.

## Implementation and Validation

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Unforced Error Statistics section. General Statistics preserves the existing Summary UE total, which includes double faults. The later 2026-10-14 clarification also agrees double-fault inclusion in advanced server UE totals. See the [reused Summary contract](statistics_design.md#reused-summary-contract). No new advanced UE metric is implemented.

No new UE calculation is implemented here. Future checks must cover double fault counted once as server UE at 1, return UE at 2 even when included in the Serve winner filter, server/receiver ending-shot parity versus point winner, the 6/7 threshold, conditional error metadata and unknown/legacy counts. Phase-specific UE rates need explicit eligible-point or shot-opportunity denominators; do not invent unrecorded opportunities. Report excluded/unknown-phase counts separately.

No implementation is introduced by this document. Add source/test references, worked examples, validation results, and interpretation limits as unforced-error statistics are developed. Existing unforced-error statistics still need to be inventoried.

## Decision History

- **2026-10-15 - Serve advantage / disadvantage statistics agreed:** receiver UEs feed Serve advantage; double faults and server UEs in Serve disadvantage feed Serve disadvantage; UEs by the player holding the initiative feed neither.
- **2026-10-15 - Serve Impact State:** UE phase rows use the recorded state (legacy counts mapped). Implemented; deployed 2026-10-15 (version `6506990f`).
- **2026-10-14 - UE inclusion resolved:** Double fault contributes one UE to the server's total with its subtype retained. Return error stays receiver UE despite inclusion in the broader Serve winner filter. Supersedes the earlier open double-fault rollup question; no application changes.
- **2026-10-13 - Agreed clarification:** Double fault counts as 1; forced errors remain winners credited to the causing player, not UEs. Combined UE-rollup inclusion of double faults is a separate metric decision.
- **2026-10-13 - Agreed:** Recorded UE attribution, total-shot counting and serve-related / neutralised context while keeping forced errors in the winner category.
- **2026-10-13:** Established the unforced-error-specific design record. The questions above are proposals, not agreed calculations.
