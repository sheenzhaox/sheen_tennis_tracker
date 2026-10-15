# Serve Statistics

## Scope

Record ideas and definitions for analysing serve performance from recorded match logs. Follow the [general design checklist](statistics_design.md#metric-documentation-checklist).

## Agreed Model

**Agreed 2026-10-13; serve outcome filters clarified 2026-10-14.** Apply the [shared outcome and shot-count model](statistics_design.md#agreed-outcome-and-shot-count-model), distinguishing shot attribution from the serve-analysis filters below.

- The **Serve winner filter** includes both ace/unreturnable serve (`Point.end: 'ace'`, shot count 1) and return error (`return_error`, shot count 2). This broadens the earlier serve-filter meaning. Return error remains attributed as a receiver UE, not reclassified as a server winner shot in Winner Statistics or the preserved Summary.
- A return winner (`return_winner`) is the receiver's winner at shot 2. These outcomes must not be collapsed merely because they all terminate in the serve-entry UI.
- Serve is shot 1 regardless of first-/second-serve attempt number. A preceding first-serve fault does not increase the return's shot number.
- Serve plus one is the server's next shot, shot 3; a winner on it follows serve (1) and return (2).
- Total counts 1-6 define the serve-related phase; 7+ define neutralised rallies. The latter imply reduced assumed serve influence, not proof of zero influence or causation in short points.
- Relevant inputs: `end`, `server`, `winner`, `serves[]`, and for rally outcomes `rally.ending` / `rally.count`. Counts absent from direct serve/return endings are derived from their outcome; missing or convention-uncertain rally counts must not be guessed.
- **Updated 2026-10-15:** new rally points record `rally.impact` ([Serve Impact State](statistics_design.md#serve-impact-state-replaces-rally-count)) instead of `rally.count`. Serve + 1 = server winner or forced error on shot 3; Serve advantage / Serve disadvantage = which player held the serve-created initiative to the end of the point; Neutralised = the point became a neutral rally. Serve + 1, advantage and disadvantage are serve-related; Neutralised replaces 7+. Legacy counts map to a state only when `rally.impact` is absent.

## Ideas and Open Questions

- **Proposed question:** Which metrics describe individual serve attempts, service points, or service games, and what denominator belongs to each?
- **Proposed question:** How should first- and second-serve performance be compared while distinguishing serve outcomes from eventual point outcomes?
- **Resolved count, 2026-10-13; UE inclusion agreed 2026-10-14:** Double fault has total shot count 1 and counts as one UE of the server. Two serve attempts do not mean a two-shot serve/return exchange or two UEs. Retain the `double_fault` subtype within UE totals.
- **Proposed metric work:** Compare outcomes in the serve-related and neutralised phases. Rates, filters, weighting and denominators still need design; report excluded/unknown-phase counts and use unavailable for a zero denominator.

## Metric Definitions

### Serve Location Distribution

**Agreed requirement, 2026-10-14; design only.** Show where a selected player serves, with both count and percentage for each serve location. This will belong in the Serve Statistics section of Advanced Analysis. Do not implement the page content yet; preserve the existing normal stats and General Statistics Summary.

The coaching question is: **Where does this player serve under the selected conditions?** This is a location distribution, not a serve-in rate or a point-win rate at each location.

#### Required Filters

The following dimensions and named choices are **agreed requirements**. Defaults, selection cardinality and combination rules below are **proposals**, not confirmed UI behavior.

| Dimension | Required choices | Data source | Proposed selection behavior |
| --- | --- | --- | --- |
| Player | Either match player, analysed as server | `Point.server` mapped to match player IDs | One player at a time; default Player A, using actual names. |
| Serve position | Deuce / Ad | Replayed score before the point, `PointContext.side` | All / Deuce / Ad, single choice; default All. This is service-court side, not a separately measured server standing position. |
| Serve attempt | 1st / 2nd serve | Attempt index in `Point.serves[]` | All / 1st / 2nd, single choice; default All. Attempt number is independent of total shot count. |
| Key points | First point / Game points / Break points | Replayed pre-point score and saved match rules | All / First point / Game points / Break points, single choice; default All. |
| Outcome | Serve winner / Serve advantage / Serve win / Double fault / Serve disadvantage / Serve loss | Agreed point-level classification below; attempt attribution remains open | All plus the six named choices, single choice; default All. |

**Proposed:** combine different dimensions with AND. Every count and percentage uses the same filtered population. Keep any future Serve-section set filter independent of General Statistics; default to the whole match. A new set filter is not part of the confirmed requirements here.

#### Counting Unit and Formula

**Proposed:** count recorded serve attempts, not service points. Use each eligible attempt's own `serves[index].location`, with rows Wide (`wide`), Body (`body`), T (`t`), and Not recorded (`none` or a missing/unusable location).

- Include recorded faults as attempts when no outcome restriction applies; a fault can still have a recorded location. The location is the recorder's category, not proof the serve landed inside that zone. Never infer location from `serves[].fault`: fault type Wide and serve location Wide are different fields.
- With All attempts selected, a point containing both first and second serves contributes two attempts. With 1st or 2nd selected, it contributes at most one. Both attempts share the point's pre-point score and court side.
- Apply player, court-side, attempt and key-point filters first. A selected outcome must then use its agreed classification and attempt-attribution rule; those rules are not yet complete. Do not assign the eventual point outcome to a preceding first-serve fault by default.

Let $E$ be the set of eligible attempts after all selected filters, $D = |E|$, and $C_L$ the number of attempts in location row $L$:

$$
C_L = |\{a \in E : \operatorname{location}(a) = L\}|,
\qquad P_L = 100 \times \frac{C_L}{D}.
$$

**Proposed denominator:** all eligible attempts, including Not recorded. This keeps missing location coverage visible rather than silently inflating the recorded-location shares. Wide + Body + T + Not recorded counts equal $D$; percentages sum to 100% before rounding. Display the filtered attempt count alongside the distribution. This is not $P(\text{point won} \mid \text{location})$; with an outcome selected, it describes locations within that outcome-filtered sample.

Example: Player A / Deuce / 1st / Break points / All outcomes yields 20 attempts: Wide 8 (40%), Body 3 (15%), T 7 (35%), Not recorded 2 (10%). Location coverage is 18/20 (90%). Proposed display precision is one decimal place when needed; rounding may prevent displayed percentages summing exactly to 100%. If $D=0$, show zero counts and unavailable percentages (`-`), not 0%.

Current scope is one completed match. No cross-match aggregation is requested. If added later, propose pooling eligible counts and denominators, not averaging match percentages.

#### Key-Point Definitions

**Proposed reuse of existing score-context semantics:** classify from the score before the point, not its eventual result.

- First point: the first point of a regular service game (0-0).
- Game point: the server would win the current game by winning this point.
- Break point: the receiver would win the current game by winning this point.
- Under no-ad rules, the deciding point can be both game point and break point. These are overlapping conditions, not disjoint outcome categories. With the proposed single-choice control, it appears in either corresponding filtered view.
- Existing `situationsOf` excludes tiebreaks and match tiebreaks from all three key-point tags. Propose retaining that behavior: they remain eligible under All key points, with court side derived by the score engine. Confirm this before implementation.
- Replay all prior points, including manual and Lucky ball points, before filtering the statistical sample; excluding them from a metric must not change the subsequent score context.

#### Agreed Outcome Definitions

**Agreed 2026-10-14; design only.** These are overlapping filters on service-point outcomes, not six mutually exclusive buckets. Let $W$ mean `Point.winner === Point.server`, and let $N$ be the known total shot count under the shared convention.

| Outcome filter | Agreed definition | Fields / condition |
| --- | --- | --- |
| Serve winner | Ace (including the existing unreturnable-serve category) or return error | `end` is `ace` or `return_error`; both award the point to the server. |
| Serve advantage | **Revised 2026-10-15:** ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point | See [Serve advantage statistic](statistics_design.md#serve-advantage-statistic). Formerly $W$ and a known $1 \leq N < 7$. |
| Serve win | Server wins the point, regardless of shot count | $W$; includes serve winners, serve advantages, wins at 7+ and wins with unknown count. |
| Double fault | Double fault by the server; also one UE of the server | `end: 'double_fault'`; count 1, regardless of the two attempts. |
| Serve disadvantage | **Revised 2026-10-15:** double fault, return ace, or receiver winner / server UE in a Serve disadvantage point | See [Serve disadvantage statistic](statistics_design.md#serve-disadvantage-statistic). Formerly not $W$ and a known $1 \leq N < 7$. |
| Serve loss | Server loses the point, regardless of shot count | Not $W$; includes double faults, serve disadvantages, losses at 7+ and losses with unknown count. |

Apply these definitions within the eligible serve-statistics population; the existing Lucky ball exclusion remains in force. A manual point's known winner alone does not supply a recorded serve attempt for the location distribution.

- Serve winner is a subset of Serve advantage and Serve win for valid direct endings with their known counts. Double fault is a subset of Serve disadvantage and Serve loss. Do not subtract these subsets from the broader win/loss filters, or add the six filtered counts together as a total. Since 2026-10-15, Serve advantage is a subset of Serve win and Serve disadvantage a subset of Serve loss.
- Advantage/disadvantage describe an early point result, not an observed advantageous/disadvantageous court position after the return and not proof of a causal serve effect. **Revised 2026-10-15:** for rallies they now rely on the recorded Serve Impact State (the scorer's judgement of initiative), still not proof of a causal serve effect.
- The Serve winner filter deliberately includes receiver return UEs. A return error remains a receiver UE in error/return analysis; membership in this serve filter does not also credit a server winner shot in the separate Winner Statistics or Summary. This preserves their agreed attribution rules.
- Double fault contributes once to the server's UE total, with its double-fault subtype separately identifiable. This resolves the previously open UE-inclusion decision and agrees with the existing Summary behavior.

#### Shot-Count Eligibility and Examples

**Agreed precedence, clarified 2026-10-14:** resolve the total shot count from the ending first. Direct-ending counts take priority over the unknown-rally-count rule.

1. `end: 'ace'` or `end: 'double_fault'`: use count **1**, even if `rally.count` is 0, null or missing, or no rally object exists.
2. `end: 'return_winner'` or `end: 'return_error'`: use count **2** under the same conditions.
3. Only for `end: 'rally'`, use a verified, convention-compatible recorded count of at least 3. A count of 0, null, missing or otherwise unusable/unverified means unknown. These rally points enter only Serve win or Serve loss among the six outcome filters, never Serve advantage or Serve disadvantage. They remain eligible for All outcomes if the required serve data exists. **Superseded 2026-10-15 for rallies:** use the Serve Impact State (`rally.impact`, else the legacy count mapping); rallies with no known state enter only Serve win or Serve loss.

Thus an ace or return error with an unset rally count still qualifies for Serve winner, Serve advantage and Serve win; a double fault or return winner still qualifies for Serve disadvantage and Serve loss (and the double fault also for its own filter). Do not apply the unknown-count exclusion before inspecting `Point.end`.

The current recording UI stores an untouched rally count as `null`, not 0. Support both unknown representations analytically; no storage or UI change is requested. This ending-based derivation is not guessing a missing rally count. Historical rally counts remain subject to the shared compatibility rules; do not silently repair them.

**Examples, revised 2026-10-15** (rally rows use the Serve Impact State instead of a count; the former count-6 / 7+ rally rows are superseded):

| Point result | Known count / state | Matching outcome filters |
| --- | --- | --- |
| Ace / unreturnable serve | 1 | Serve winner, Serve advantage, Serve win |
| Return error by receiver | 2 | Serve winner, Serve advantage, Serve win; also receiver UE attribution in the relevant error analysis |
| Return winner by receiver | 2 | Serve disadvantage, Serve loss |
| Double fault | 1 | Double fault, Serve disadvantage, Serve loss; also one server UE |
| Server winner | Serve + 1 | Serve advantage, Serve win |
| Server winner / receiver UE | Serve advantage | Serve advantage, Serve win |
| Server UE / receiver winner | Serve advantage | Serve loss |
| Receiver winner / server UE | Serve disadvantage | Serve disadvantage, Serve loss |
| Server winner / receiver UE | Serve disadvantage | Serve win |
| Server wins / loses a rally point | Neutralised, or no known state | Serve win / Serve loss respectively; excluded from advantage/disadvantage |

For an advantage/disadvantage-filtered location distribution, both numerator and denominator use only attempts attributed to qualifying points. Points with no known state remain in eligible win/loss-filtered populations. Report unknown-state coverage separately rather than presenting exclusions as zero observed advantages/disadvantages.

**Still open: attempt attribution, not outcome meaning.** Decide whether a selected point-outcome filter uses only the final serve attempt or also a preceding first fault. In particular, whether Double fault selects the second fault only or both attempts determines whether 1st serve + Double fault is non-empty. The proposed final-attempt attribution for Serve winner is not yet agreed. Point-level subset relationships do not by themselves settle this location-counting rule.

**Open since 2026-10-15: rally count removed.** New rally points have no count, so "known count below 7" cannot be evaluated for them. **Resolved 2026-10-15:** use the agreed [Serve advantage](statistics_design.md#serve-advantage-statistic) and [Serve disadvantage](statistics_design.md#serve-disadvantage-statistic) statistics. A server rally win counts as Serve advantage only via Serve + 1 or a server winner / receiver UE in a Serve advantage point; a server rally loss counts as Serve disadvantage only via a receiver winner / server UE in a Serve disadvantage point.

#### Inputs, Missing Data and Limits

- Required sources: live `Point` records for the match, `server`, `serves[].location`, attempt order and `serves[].result`; ordered point winners plus the match's saved rules/first server for court-side and key-point context. Outcome filters use `end`, `winner`, `server`, `rally.ending` and `rally.impact` (else legacy `rally.count` via the mapping) for rally advantage/disadvantage eligibility. `rally.ending` supports shot-attribution consistency checks, not a requirement to guess a missing count. No new recorded fields are agreed here.
- Preserve the existing Lucky ball policy: exclude those points' attempts from detailed serve statistics. Manual/unrecorded points have no serve attempts; do not manufacture a location or attempt number. Report missing serve records separately from attempts with Not recorded location.
- Missing location remains Not recorded, not Body, Wide or T. Missing optional serve type does not exclude an otherwise eligible location observation. Do not reconstruct missing attempt order or classify malformed records from point winner alone; report unusable records separately.
- Before outcome filtering, expose the count of candidate attempts whose outcome cannot be classified when applicable. A known location does not resolve an unknown outcome or legacy shot-count convention.
- Source completeness matters: replayed court side/key-point context assumes the match's rules, first server and prior point history are usable. Do not present defaulted/missing context as a verified observation; a missing-context policy must be finalised before implementing those filters.
- A small filtered sample describes the logged attempts only. Outcome-filtered distributions cannot demonstrate that a location caused success, measure every return's quality, or establish the player's intended target.

#### Implementation Boundary and Future Checks

**Not implemented.** Existing [serveLocationStats, pointContexts and situationsOf](../src/stats/matchStats.ts) provide nearby source references, but the current Serve location table displays in/won ratios, not this proposed distribution, and has no six-category outcome filter. Existing [statistics tests](../src/stats/matchStats.test.ts) do not validate the new design.

Before implementation, agree fault/attempt attribution, denominator, defaults/cardinality and key-point edge cases. Future tests should cover both players; deuce/ad; first/second attempts and two-attempt counting; location/fault-type separation; each combined filter; no-ad overlap; tiebreak exclusions; missing location, context, serves and legacy counts; Lucky/manual exclusions with preserved score replay; empty denominators and rounding. Outcome regressions must cover ace/return error in Serve winner, the overlapping win/loss subsets, each Serve Impact State × ending combination and the legacy count mapping, unknown states excluded only from advantage/disadvantage, fixed direct-ending counts without rally metadata, and double fault counted once as server UE. Preserve separate receiver-UE attribution and unchanged Summary totals. No new runtime validation is claimed by this design update.

## Implementation and Validation

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Serve Statistics section. General Statistics reuses the existing Summary serve ratios unchanged; see the [reused Summary contract](statistics_design.md#reused-summary-contract) for inputs, denominators and exclusions. No new advanced serve metric is implemented.

**2026-10-15 - Serve Impact State implemented (not deployed):** the normal stats Forehand / backhand table's service-game rows now use the state: Serve +1 winners; Serve advantage (ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point; agreed 2026-10-15); Serve disadvantage (double fault, return ace, or receiver winner / server UE in a Serve disadvantage point; agreed 2026-10-15). Definitions, legacy mapping, references and validation are in [the general design](statistics_design.md#serve-impact-state-replaces-rally-count). Advanced Analysis Serve Statistics remains heading-only.

The shared rules are agreed, not newly implemented here. Current rally entry does not enforce total counts starting at 3. Required future checks include aces and double faults at 1, return outcomes at 2 (including return error in the Serve winner filter), serve plus one at 3, the 6/7 boundary, and second-serve independence. A double fault is eligible for the serve-related phase without rally metadata. Resolve legacy rally counts before claiming complete phase coverage.

No implementation is introduced by this document. Add source/test references, worked examples, validation results, and interpretation limits as serve statistics are developed. Existing serve statistics still need to be inventoried.

## Decision History

- **2026-10-15 - Serve disadvantage agreed:** double fault, return ace, or receiver winner / server UE in a Serve disadvantage point. Replaces the before-shot-7 meaning for the outcome filter and the stats row. Outcome examples revised to the state.
- **2026-10-15 - Serve advantage agreed:** ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point. Replaces the before-shot-7 meaning for the outcome filter and the stats row.
- **2026-10-15 - Serve Impact State replaces rally count:** Recording and the service-game count rows switched to the four-state model. The serve-location advantage/disadvantage outcome filters need a count-free definition and distinct labels (proposal above, not agreed).
- **2026-10-14 - Count precedence confirmed:** Derive counts 1/2 from direct endings before checking for an unknown rally count. A stored 0, null or missing rally count cannot override a direct ending's known count or exclude it from advantage/disadvantage. Unknown-count win/loss-only behavior applies to unresolved rally endings. Documentation only.
- **2026-10-14 - Outcome definitions agreed:** Serve winner = ace/unreturnable serve or return error; advantage/disadvantage = server win/loss at known count below 7; win/loss = all eligible service points won/lost, including unknown-count points. Filters overlap. Zero/null/missing rally counts are excluded from advantage/disadvantage. Fixed direct-ending counts remain known. Double fault counts once as server UE. Return error remains receiver UE for shot attribution and the unchanged Summary; the broader serve-filter label does not redefine Winner Statistics. Supersedes the open outcome meanings and UE-inclusion question below. Attempt attribution remains open; documentation only.
- **2026-10-14 - Design requirement:** Added player serve-location distribution with counts and percentages and the requested court-side, attempt, key-point and six-label outcome filters. Attempt-based counting, a denominator including Not recorded, filter defaults/cardinality and score-context reuse are proposals. Advantage/disadvantage and win/loss meanings, category overlap and double-fault attribution remain open. Documentation only; no Advanced Analysis implementation.
- **2026-10-13 - Agreed clarification:** Double fault counts as shot 1 and is serve-related; the previously open count decision is resolved. No calculations changed.
- **2026-10-13 - Agreed:** Documented combined serve-winner semantics, total-shot convention and the serve-related / neutralised threshold; no calculations changed.
- **2026-10-13:** Established the serve-specific design record. The questions above are proposals, not agreed calculations.
