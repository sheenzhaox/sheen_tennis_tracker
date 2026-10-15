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

### Serve Statistics Section Plan

**Proposed by the user 2026-10-15; agreed the same day after clarification (answers below); implemented and deployed 2026-10-15 (see [Implementation and Validation](#implementation-and-validation)).** Three tables for the Advanced Analysis Serve Statistics section of one completed match: Serve location distribution, Serve performance and Serve impact, plus the agreed extra metrics. This revises the 2026-10-14 [Serve Location Distribution](#serve-location-distribution) requirement: it adds a Set filter and serve-type columns, keeps the Key points filter, and replaces the Outcome filter with the separate Serve impact table.

#### Shared Filters (agreed)

| Filter | Choices | Logic | Data source |
| --- | --- | --- | --- |
| Set | Each set of the match | One or none; none selected = all sets (revised 2026-10-15) | Replayed score (existing `setOptions` / `filterSets`) |
| Player | Player 1 / Player 2 (actual names) | Exactly one, as server | `Point.server` |
| Court side | Deuce / Ad | One or none; none selected = both | `PointContext.side` |
| Serve attempt | 1st / 2nd | One or none; none selected = both | Index in `Point.serves[]` |
| Key points | First point / Game points / Break points / Tiebreak | One or none; none selected = all points (revised 2026-10-15) | Replayed pre-point score (`situationsOf`); see [Key-Point Definitions](#key-point-definitions) |
| Serve location (performance and impact tables) | Wide / Body / T | One or none; none selected = all | `serves[].location` of the attributed attempt |

Different filters combine with AND. **Revised 2026-10-15 (user):** no filter allows multiple choices; tapping the selected choice clears it. This supersedes the earlier multi-select Set and Key points decisions.

**Revised again 2026-10-15 (user; implemented, deployed version `7654b3bb`):** there is no general filter row at the top of Serve Statistics. Each part (Location distribution, Serve performance, Serve impact, Faults, Serving summary) has its own selectors under its heading, with independent state. Instead of "one or none", every selector always has exactly one choice selected and offers an explicit "All" option, which is the default:

| Selector | Options (default first) | Parts |
| --- | --- | --- |
| Player | Player 1 / Player 2 (default Player 1) | All parts |
| Set | All sets / Set 1 / Set 2 / ... / MTB; with only one set the single set chip is shown selected and no All sets | All parts |
| Court side | All sides / Deuce / Ad | All parts |
| Serve attempt | All serves / 1st serve / 2nd serve | All parts |
| Key points | All points / First point / Game points / Break points / Tiebreak | Location distribution, Serve performance, Serve quality, Serve impact, Faults |
| Serve location | All locations / Wide / Body / T | Serve performance, Serve quality, Serve impact |

"All" means the filter is not applied (same calculation as an empty selection). The Serve location "All locations" option was added for consistency, beyond the request's set / side / serve / point list. Serving summary keeps its row-specific rules: Service games held uses Player and Set only; Break points saved uses Player, Set and Court side; Location repeats uses Player, Set, Court side and Serve attempt. The normal stats page filters are unchanged.

#### Table 1: Serve Location Distribution (agreed)

- Rows: serve location Wide, Body, T. ~~Not recorded~~ row removed 2026-10-15: an unrecorded location counts as Body (see [Unrecorded Location and Type Defaults](#unrecorded-location-and-type-defaults)).
- Columns: Total count and %; then count and % for each serve type Flat, Slice, Kick. Source: `serves[].type`. ~~Type not recorded~~ column removed 2026-10-15: an unrecorded type counts as Flat.
- Unit: serve attempts including faults; with both attempts selected, a point with a first fault contributes two attempts. The serve-location filter does not apply (location is the row).
- **Percentage basis (agreed):** column share, count / that column's total, so each column sums to 100% and shows where that serve type goes. Empty column shows `-`.

#### Table 2: Serve Performance (agreed)

- Unit: service points of the selected server, excluding Lucky balls and unrecorded points.
- **Attempt attribution (agreed):** each point belongs to its last serve attempt (the serve that started play, or the second fault of a double fault). 1st serve = points where the first serve went in; 2nd serve = points played on a second serve, including double faults; the location filter uses that attempt's location (Wide / Body / T). First-serve faults themselves do not appear in this table.

| Row | Colour | Agreed definition | Notes |
| --- | --- | --- | --- |
| Serve winners | Green | Ace + return error | Same as the agreed Serve winner filter. |
| Serve + 1 | Green | Serve + 1 points | `rally.impact: 'serve_plus_one'` (or legacy mapping). |
| Win due to serve | Green | Ace + return error + Serve + 1 + server winners in Serve advantage + receiver UEs in Serve advantage | Equals the agreed [Serve advantage statistic](statistics_design.md#serve-advantage-statistic). |
| UE during Serve advantage | Red | Server UEs in Serve advantage points | Initiative lost by the server's own error. |
| Double faults | Red | Double faults | Only under 2nd serve with the agreed attribution. |
| Lost due to serve | Red | Double fault + return winner + receiver winners in Return advantage + server UEs in Return advantage | Equals the agreed [Serve disadvantage statistic](statistics_design.md#serve-disadvantage-statistic). |
| Serve score | Green > 0, red < 0, blue = 0 | Win due to serve - Lost due to serve | Shown as a count and per 100 filtered service points (agreed). |

Each row shows count and % of the filtered service points $N$, with $N$ shown; Serve score per 100 = $100 \times \text{score} / N$, `-` when $N = 0$. Rows overlap (Serve winners and Serve + 1 are inside Win due to serve; Double faults inside Lost due to serve), so they must not be summed.

Example: $N = 40$, Win due to serve 14, Lost due to serve 9 gives Serve score +5 (green), +12.5 per 100 service points.

#### Table 2b: Serve Quality (user design 2026-10-15; superseded the same day, merged into Table 3)

**Superseded 2026-10-15 (user chose option (a) of the overlap review below):** the separate Serve quality part and `serveQuality` were removed; its rates now come from the Serve in control / Return in control / Neutralised group rows of [Table 3](#table-3-serve-impact-agreed-regrouped-2026-10-15). Mapping: Serve in control rate and Return in control rate = the group's % of $N$; conversion and save rate = the group's Won %; Serve + 1 rate = the Serve + 1 sub-row's %; Neutralised rate and winning rate = the Neutralised row. **Revision:** the original design counted Lucky balls in its total; the merged table keeps Table 2's denominator $N$ (Lucky balls excluded) so all serve tables share one total. The original design is kept below for reference.

Original design (no longer displayed): shown after Serve performance with its own selectors (same set as Serve performance: Player, Set, Court side, Serve attempt, Key points, Serve location) and the same last-attempt attribution. Unlike Table 2, the total includes Lucky ball points; a Lucky ball counts **only** in the total (no state, no won count). Unrecorded/manual points are excluded. "In control" names follow the renamed recording buttons (Serve in control = `serve_advantage`, Return in control = `serve_disadvantage`).

| Row | Formula | Denominator |
| --- | --- | --- |
| Total serve points | $T$ = service points under the current selectors, Lucky balls included | - |
| Serve in control | $C$ = ace + return error + Serve + 1 + Serve in control rallies (whoever won) | - |
| Serve in control rate | $C / T$ | $T$ |
| Serve in control conversion rate | (ace + return error + Serve + 1 + server winners / receiver UEs in Serve in control) / $C$ | $C$ |
| Serve + 1 rate | Serve + 1 / $T$ | $T$ |
| Return in control | $R$ = double fault + return ace + Return in control rallies (whoever won) | - |
| Return in control rate | $R / T$ | $T$ |
| Return in control save rate | (server winners + receiver UEs in Return in control) / $R$ | $R$ |
| Neutralised rate | Neutralised / $T$ | $T$ |
| Neutralised winning rate | (server winners + receiver UEs in Neutralised) / Neutralised | Neutralised |

- Rates display n/d (%) with one decimal when needed, `-` for a zero denominator.
- Rally points with no known state (no recorded state and no mappable legacy count) count only in $T$, so $C + R +$ Neutralised can be below $T$.
- Conversion numerator equals Win due to serve (Table 2); the save-rate complement within $R$ excludes double faults and return aces, which can never be saved.
- Legacy rally counts use the existing Serve Impact State mapping.
- Code (removed 2026-10-15): `serveQuality`, `ServeQualityPart` and its unit test.

**Overlap review (2026-10-15; option (a) chosen by the user the same day).** With $N$ = Table 2 service points (Lucky balls excluded) and $C$, $R$, $T$ as above:

- vs Table 2 (Serve performance), moderate overlap: Serve + 1 rate duplicates the Serve + 1 % (only the denominator differs by Lucky balls); the conversion numerator is exactly Win due to serve; Lost due to serve = $R$ - saved, so save rate = 1 - Lost due to serve / $R$; UE during Serve advantage is part of $C$ - Win due to serve. Table 2 alone has the serve-type columns, Serve winners, Double faults and Serve score.
- vs Table 3 (Serve impact), high overlap: every Serve quality row is a regrouping of Table 3 rows. $C$ = Ace + Return error + Serve + 1 + Serve advantage points and its conversion = their Won / $C$; $R$ = Double fault + Return winner + Return advantage points and save rate = Return advantage Won / $R$; Neutralised rate and winning rate equal Table 3's Neutralised % and Won %. Only the Lucky-ball total and the subtotals are new.
- Inconsistency: adjacent tables use different totals under the same selectors ($T$ includes Lucky balls, $N$ does not), and Table 3 still uses the old Serve advantage / Return advantage labels.
- Proposed options: (a) fold Serve quality into Serve impact as Serve in control / Return in control subtotal rows (Won % = conversion / save) and remove the separate part; or (b) keep Serve quality and remove Serve impact, adding a State not recorded row. In either case drop one of the two Serve + 1 % rows and use one total definition. **Chosen: (a)**, with Table 3 relabelled to "in control"; the duplicate Serve + 1 rate disappears with the Serve quality part (Table 2's Serve + 1 and Table 3's Serve + 1 sub-row remain, as before Serve quality was added).

#### Table 3: Serve Impact (agreed; regrouped 2026-10-15)

Replaces the 2026-10-14 Outcome filter (user decision): instead of filtering the location table by outcome, show how service points split by Serve Impact State. Same filters and attribution as Table 2.

**Regrouped 2026-10-15 (user; implemented, deployed version `7654b3bb`):** the Direct ending subtotal is replaced by control groups, and Serve advantage / Return advantage are relabelled Serve in control / Return in control (matching the recording buttons). Current layout:

| Row | Points | % of $N$ | Won by server | Won % |
| --- | --- | --- | --- | --- |
| **Serve in control** (group) | $C$ | Serve in control rate | | Conversion rate |
| - Ace | | | | 100% |
| - Return error | | | | 100% |
| - Serve + 1 | | Serve + 1 rate | | 100% |
| - Serve in control rally (`serve_advantage`) | | | | Advantage conversion % |
| **Return in control** (group, red: Double fault + Return winner + all Return in control rallies) | $R$ | Return in control rate | Won by server | Save rate |
| - Double fault | | | blank | blank |
| - Return winner | | | blank | blank |
| - Lost return in control rally (`serve_disadvantage`) | all Return in control rallies $D$ | | Lost by server $L$ | $L / D$ |
| **Neutralised** | | Neutralised rate | | Neutralised winning rate |
| State not recorded | | | | |

**Display revision 2026-10-15 (user; implemented, deployed version `43f7bc76`):** the Return in control group and its sub-rows use red font (`.stat-lost`); Won / Won % are blank for Double fault and Return winner (always 0).

**Second revision the same day (user; implemented, deployed version `43f7bc76`):** the interim group label "Return in control (lost point)" is reverted to **Return in control** (it includes double faults, return winners and every Return in control rally point, won or lost). The rally sub-row (interim label "Lost while return in control", originally "Return in control rally") is now **Lost return in control rally**; its Points stay all Return in control rallies $D$, but its Won column shows $L$ = receiver winners + server unforced errors in those rallies and Won % = $L / D$ (the server's lost rate, $1 -$ rally save rate). The group's Won / Won % remain server wins / save rate, so the sub-row's Won does not add up to the group's Won.

- Groups, Neutralised and State not recorded are mutually exclusive and sum to $N$; sub-rows sum to their group and must not be added again. Won = server wins (server winner or receiver UE in rallies; aces and return errors always won; double faults and return winners never).
- Serve in control Won = Win due to serve (Table 2); Return in control Points - Won = Lost due to serve (Table 2).
- The Direct ending subtotal is no longer shown; it equals Ace + Return error + Double fault + Return winner.
- Code: `ServeImpactPart` in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx) groups `serveImpactStats` rows (calculation unchanged). Tests: Advanced render tests in [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx) and [StatsAnalysis.test.tsx](../src/ui/pages/StatsAnalysis.test.tsx); 221 tests and build pass.

Original 2026-10-15 layout (superseded):
| Row | Points | % of $N$ | Won by server | Won % |
| --- | --- | --- | --- | --- |
| Direct ending (subtotal) | | | | |
| - Ace | | | | |
| - Return error | | | | |
| - Double fault | | | | |
| - Return winner | | | | |
| Serve + 1 | | | | |
| Serve advantage | | | | |
| Return advantage | | | | |
| Neutralised | | | | |
| State not recorded | | | | |

- **Agreed 2026-10-15:** Direct ending is kept as a subtotal row and also split into its four endings (indented sub-rows). Ace and return error are always won (100%), double fault and return winner always lost (0%).
- Top-level rows (Direct ending, Serve + 1, Serve advantage, Return advantage, Neutralised, State not recorded) are mutually exclusive and sum to $N$; the four sub-rows sum to Direct ending and must not be added to it again. Source: `end`, then `rally.impact` (else legacy mapping).
- **Advantage conversion %** (agreed extra) is the Serve advantage row's Won %: (server winners + receiver UEs in Serve advantage) / Serve advantage points. Serve + 1 points are a separate row (always won).
- **Neutralised points won %** (agreed extra) is the Neutralised row's Won %; compare with the serve-related rows.

#### Decisions (2026-10-15, user answers)

1. Court side: none selected = both sides (sometimes the side does not matter).
2. Win due to serve includes receiver UEs in Serve advantage; Lost due to serve includes server UEs in Return advantage. Both now equal the agreed Serve advantage / Serve disadvantage statistics.
3. Attempt attribution: last attempt, as above.
4. Table 1: column-share percentages; Not recorded location row and type column shown. **Superseded 2026-10-15:** unrecorded location = Body, unrecorded type = Flat; no Not recorded row or column.
5. Key points filter added; the Outcome filter becomes the new Serve impact table.
6. Serve score: count and per 100 service points.
7. Scope: one completed match first; cross-match player stats may follow later (pool counts, do not average percentages).
8. Key points filter: multi-select; none selected = all points. **Superseded 2026-10-15:** one or none (see Shared Filters).
9. Location predictability: compare a serve only with the previous serve on the same side (Deuce or Ad). The chain runs within the selected set, or continuously across all sets when none is selected.
10. Key points gains a Tiebreak option: every point of a tiebreak or match tiebreak. First point / Game points / Break points keep the existing regular-game-only meaning (`situationsOf` excludes tiebreaks), so tiebreak points are reached through the Tiebreak option or with no key point selected.
11. Table 3: Direct ending stays as a subtotal row and is also split into Ace / Return error / Double fault / Return winner.

#### Remaining Open Points

None for the design. Implementation details (layout, colours of Table 3) follow existing Advanced Analysis styling.

#### Agreed Extra Metrics (2026-10-15)

Selected by the user from the suggestions. Formulas and filter applicability are proposed.

| Metric | Formula (proposed) | Fields | Filters that apply |
| --- | --- | --- | --- |
| Advantage conversion % | (Server winners + receiver UEs in Serve advantage) / Serve advantage points | `rally.impact`, `rally.ending` | All Table 2 filters; shown in Table 3 |
| Neutralised points won % | Server wins / Neutralised service points | `rally.impact`, `winner` | All Table 2 filters; shown in Table 3 |
| Fault breakdown | Net / Long / Wide / Not recorded fault counts by location (rows Wide / Body / T; unrecorded location = Body since 2026-10-15); % = share of all faults shown | `serves[].fault`, `serves[].location` | Set, Player, Court side, Key points, Serve attempt (revised at implementation: the attempt filter replaces separate 1st / 2nd columns to keep the table narrow on phones); unit = fault attempts |
| Performance by serve type | Table 2 split into Flat / Slice / Kick columns (unrecorded type = Flat since 2026-10-15) | `serves[].type` of the attributed attempt | All Table 2 filters |
| Pressure serving | Key points filter applied to Tables 2-3, plus Break points saved % = break points won by server / break points faced | `situationsOf`, `winner` | Set, Player, Court side; no attempt/location filter for saved %. Manual and Lucky ball points count (only the winner is needed) |
| Service games held % | Completed service games won / completed service games | Replayed score | Set, Player only; unfinished games excluded |
| Location predictability | Share of serves whose location repeats the server's previous serve on the same court side (Deuce compared only with Deuce, Ad only with Ad) and the same attempt number | Ordered points, `serves[].location` | Set, Player, Court side, Serve attempt. Chain continuity follows the Set filter (agreed): the selected set only, or continuous across the whole match when none is selected. Not recorded breaks the chain (superseded 2026-10-15: an unrecorded location counts as Body and continues the chain) |

Not selected: 1st / 2nd serve in %, 1st / 2nd serve points won %, Return-advantage recovery % (remain ideas). The Serve impact distribution became Table 3.

#### Suggested Additional Serve Statistics

**Assistant suggestions 2026-10-15; the user selected seven (see [Agreed Extra Metrics](#agreed-extra-metrics-2026-10-15)).** All use already recorded fields.

| Metric | Formula | Fields | Why it helps |
| --- | --- | --- | --- |
| 1st / 2nd serve in % | Serves in (incl. ace / return outcomes) / attempts of that number | `serves[].result` | Consistency baseline; context for the performance rows. |
| 1st / 2nd serve points won % | Points won / points played on that serve | `winner`, attribution above | Standard comparison; shows total effect, not only serve-decided points. |
| Serve Impact distribution | Share of service points by Direct ending / Serve + 1 / Serve advantage / Return advantage / Neutralised / Unknown | `end`, `rally.impact` | How often the serve creates, loses or does not affect the initiative. |
| Advantage conversion % | (Server winners + receiver UEs in Serve advantage) / Serve advantage points | `rally.impact`, `rally.ending` | Whether the server finishes points once ahead. |
| Return-advantage recovery % | Points won by the server in Return advantage / Return advantage points | same | Defence after a weak serve. |
| Neutralised points won % | Server wins / Neutralised service points | same | Contrast serve-phase vs neutral rally strength. |
| Fault breakdown | Net / Long / Wide counts by attempt and location | `serves[].fault`, `serves[].location` | Which miss dominates and where. |
| Performance by serve type | Table 2 split by Flat / Slice / Kick | `serves[].type` | Which serve type earns the most. |
| Pressure serving | Table 2 on break points / game points; break points saved % | Replayed score (`situationsOf`) | Serving under pressure; reuses the 2026-10-14 key-point design. |
| Service games held % | Service games won / service games | Replayed score | Overall outcome of serving. |
| Location predictability | Share of serves repeating the previous location on the same side and attempt | Ordered points | Whether the returner can read a pattern. |

Limitations: one match gives small samples; Serve Impact State is the scorer's judgement; location and type are optional, so report Not recorded coverage. **Revised 2026-10-15:** Serve Statistics no longer shows coverage; see below.

#### Unrecorded Location and Type Defaults

**Agreed 2026-10-15 (user); implemented and deployed 2026-10-15 (version `202577ab`).** In Advanced Analysis Serve Statistics, a serve attempt with no recorded location (`serves[].location: 'none'`) counts as **Body**, and one with no recorded type (`serves[].type: 'none'`) counts as **Flat**. This applies to every serve table, the Serve location filter and Location repeats (an unrecorded location now continues the chain as Body instead of breaking it). Saved data and the recording screen are unchanged; the normal stats page keeps its own Not set handling. Fault type (`serves[].fault`) keeps its Not recorded column.

- Rationale (assumed): the user treats Body / Flat as the neutral default serve, so unrecorded serves are counted rather than shown separately.
- Limitation: Body and Flat counts include unrecorded serves, so they can be overstated when recording coverage is low; coverage is no longer visible on this page.
- Implementation: `spotOf` / `kindOf` in [matchStats.ts](../src/stats/matchStats.ts). Validation: [matchStats.test.ts](../src/stats/matchStats.test.ts) advanced serve tests (distribution, faults, repeats) and [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx).

### Serve Location Distribution

**Agreed requirement, 2026-10-14; design only.** **Revised 2026-10-15:** superseded where it differs by the [Serve Statistics Section Plan](#serve-statistics-section-plan) (Set filter and serve-type columns added, Outcome filter replaced by the Serve impact table, court side and attempt allow none = all). Counting unit, Not recorded handling and key-point definitions below still apply. Show where a selected player serves, with both count and percentage for each serve location. This will belong in the Serve Statistics section of Advanced Analysis. Do not implement the page content yet; preserve the existing normal stats and General Statistics Summary.

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
- Existing `situationsOf` excludes tiebreaks and match tiebreaks from all three key-point tags. **Agreed 2026-10-15:** retain that behavior and add a separate Tiebreak key-point option covering every tiebreak and match-tiebreak point; court side is derived by the score engine.
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

**Not implemented.** Existing [serveLocationStats, pointContexts and situationsOf](../src/stats/matchStats.ts) provide nearby source references, but the current Serve location table displays in/won ratios, not this proposed distribution, and has no six-category outcome filter. Existing [statistics tests](../src/stats/matchStats.test.ts) do not validate the new design. **Update 2026-10-15:** the normal-stats Serve location table and `serveLocationStats` were removed (see [Normal Stats Serve Performance](#normal-stats-serve-performance)).

Before implementation, agree fault/attempt attribution, denominator, defaults/cardinality and key-point edge cases. Future tests should cover both players; deuce/ad; first/second attempts and two-attempt counting; location/fault-type separation; each combined filter; no-ad overlap; tiebreak exclusions; missing location, context, serves and legacy counts; Lucky/manual exclusions with preserved score replay; empty denominators and rounding. Outcome regressions must cover ace/return error in Serve winner, the overlapping win/loss subsets, each Serve Impact State × ending combination and the legacy count mapping, unknown states excluded only from advantage/disadvantage, fixed direct-ending counts without rally metadata, and double fault counted once as server UE. Preserve separate receiver-UE attribution and unchanged Summary totals. No new runtime validation is claimed by this design update.

## Implementation and Validation

### Normal Stats Serve Performance

**User request 2026-10-15; implemented and deployed 2026-10-15 (version `202577ab`).** The normal stats page (match, shared-link and player stats) no longer has the **Serve location** section (1st / 2nd in and won ratios by location; `serveLocationStats` removed). In its place, a **Serve performance** section shows the same table as Advanced Analysis Table 2 (shared `ServePerformanceTable` in [StatsPage.tsx](../src/ui/pages/StatsPage.tsx), same `servePerformance` calculation and Body / Flat defaults). Advanced Analysis keeps its copy.

- Filters: the normal page's Set buttons (multi-select, none = all, as in the other normal sections; hidden in player stats where matches are pre-selected), Player (exactly one; hidden in player stats), then Court side, Serve attempt, Key points (incl. Tiebreak) and Serve location, each one or none (none = all). These replace the old All sides / All points chips; the old Game point / Break point labels are now Game points / Break points and Tiebreak is added.
- Limitation: the per-location serve-in % on the normal page is gone; the Advanced Analysis Location distribution and Faults tables cover location for completed matches only.
- Validation: [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx) checks the section heading, filter groups and Service points; the Lucky ball regressions in [matchStats.test.ts](../src/stats/matchStats.test.ts) now check `servePerformance` instead of `serveLocationStats`.

**2026-10-14 - Page structure implemented:** Advanced Analysis reserves a heading-only Serve Statistics section. General Statistics reuses the existing Summary serve ratios unchanged; see the [reused Summary contract](statistics_design.md#reused-summary-contract) for inputs, denominators and exclusions. No new advanced serve metric is implemented.

**2026-10-15 - Serve Impact State implemented (deployed 2026-10-15, version `6506990f`):** the normal stats Forehand / backhand table's service-game rows now use the state: Serve +1 winners; Serve advantage (ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point; agreed 2026-10-15); Serve disadvantage (double fault, return ace, or receiver winner / server UE in a Serve disadvantage point; agreed 2026-10-15). Definitions, legacy mapping, references and validation are in [the general design](statistics_design.md#serve-impact-state-replaces-rally-count).

**2026-10-15 - Serve Statistics section implemented (deployed 2026-10-15, version `c66bdd25`):** Advanced Analysis Serve Statistics implements the [section plan](#serve-statistics-section-plan).

- Filters: Player (exactly one); Set, Court side, Serve attempt, Key points (First point / Game points / Break points / Tiebreak) each one or none, none = all; Serve location (one or none) sits above the performance table and applies to performance and impact only.
- Tables: Location distribution (attempts, column share, plus a Serves total row); Serve performance (Total and serve-type columns, count and % of the column's service points, coloured rows, Serve score with per-100 value); Serve impact (Direct ending subtotal with four sub-rows, Points, % of $N$, Won, Won %); Faults (location x fault type, % of all faults shown); Serving summary (Service games held, Break points saved, Location repeats as n/d (%)).
- Percentages show one decimal when needed; a zero denominator shows `-`.
- Service games held counts completed regular games only; the last recorded game counts only when the replayed score shows it finished. Tiebreaks are not service games.
- Code: `ServeFilters`, `serveDistribution`, `servePerformance`, `serveImpactStats`, `serveFaults`, `breakPointsSaved`, `serviceGamesHeld`, `locationRepeats`, `wonDueToServe`, `lostDueToServe` in [matchStats.ts](../src/stats/matchStats.ts); UI `ServeStatistics` in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx). `strokeStats` now reuses `wonDueToServe` / `lostDueToServe` (no behaviour change).
- Validation: "advanced serve statistics" tests in [matchStats.test.ts](../src/stats/matchStats.test.ts) (attempt counting, last-attempt attribution, each filter, UE in advantage states, unknown state, faults, held / unfinished games, break points saved, repeat chains, tiebreak key point) and render tests in [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx) and [StatsAnalysis.test.tsx](../src/ui/pages/StatsAnalysis.test.tsx). 221 tests and the build pass. Not yet checked in a browser or on real match data.

The shared rules are agreed, not newly implemented here. Current rally entry does not enforce total counts starting at 3. Required future checks include aces and double faults at 1, return outcomes at 2 (including return error in the Serve winner filter), serve plus one at 3, the 6/7 boundary, and second-serve independence. A double fault is eligible for the serve-related phase without rally metadata. Resolve legacy rally counts before claiming complete phase coverage.

No implementation is introduced by this document. Add source/test references, worked examples, validation results, and interpretation limits as serve statistics are developed. Existing serve statistics still need to be inventoried.

## Decision History

- **2026-10-15 - Lost return in control rally (user):** group label back to "Return in control"; rally sub-row renamed "Lost return in control rally" with Won = receiver winners + server UEs and Won % = that / all Return in control rallies. Implemented; render test in [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx); 222 tests and build pass; deployed 2026-10-15 (commit `8e16478`, version `43f7bc76`).
- **2026-10-15 - Return in control display (user):** Serve impact Return in control rows in red, group renamed "Return in control (lost point)", Won / Won % blank for Double fault and Return winner, rally sub-row renamed "Lost while return in control"; counts unchanged. Implemented; 221 tests and build pass; never deployed in this form. Labels revised by the entry above.
- **2026-10-15 - Serve quality merged into Serve impact (user, option (a)):** separate Serve quality part removed; Serve impact regrouped into Serve in control / Return in control / Neutralised / State not recorded with sub-rows, and its Serve advantage / Return advantage rows relabelled "in control". One total (Lucky balls excluded) for all serve tables, revising the Serve quality Lucky-ball total. Implemented; 221 tests and build pass; deployed 2026-10-15 (commit `7f8ec38`, version `7654b3bb`).
- **2026-10-15 - Serve quality (user):** new Serve quality part after Serve performance with the same selectors: total (Lucky balls only here), Serve in control count / rate / conversion, Serve + 1 rate, Return in control count / rate / save rate, Neutralised rate / winning rate. See [Table 2b](#table-2b-serve-quality-user-design-2026-10-15-superseded-the-same-day-merged-into-table-3). Implemented; 222 tests and build pass; never deployed. Superseded the same day (merged into Serve impact; see above).
- **2026-10-15 - Per-part serve filters with All options (user):** the general Serve Statistics filter row is replaced by selectors inside each part; Set, Court side, Serve attempt, Key points (and Serve location) are exactly-one selectors with an "All ..." default instead of one-or-none; no All sets when the match has one set. Supersedes the one-or-none decision for Advanced Analysis only (normal stats unchanged). Code: `useServeFilters` / `PickChips` and part components in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx); render tests in [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx). Implemented; 221 tests and build pass; deployed 2026-10-15 (commit `7f8ec38`, version `7654b3bb`).

- **2026-10-15 - Normal stats Serve performance (user):** normal-stats Serve location section removed; Serve performance table copied into normal stats (kept in Advanced Analysis) with Set, Player, Court side, Serve attempt, Key points and Serve location filters. Implemented; deployed 2026-10-15 (commit `2c46926`, version `202577ab`).
- **2026-10-15 - Unrecorded location / type defaults (user):** Serve Statistics counts an unrecorded location as Body and an unrecorded type as Flat; Not recorded location row / type column removed; Location repeats no longer break on unrecorded locations. Supersedes Decision 4's Not recorded display and the 2026-10-14 "missing location remains Not recorded" rule for this section. Implemented; deployed 2026-10-15 (commit `2c46926`, version `202577ab`).
- **2026-10-15 - Single-choice filters (user):** every Serve Statistics filter except Player allows one choice or none (none = all); Player requires exactly one. Supersedes multi-select Set and Key points. UI changed; calculations unchanged.
- **2026-10-15 - Serve Statistics section deployed:** commit `b6065bb`, Worker version `c66bdd25`.
- **2026-10-15 - Serve Statistics section implemented:** see [Implementation and Validation](#implementation-and-validation). Fault breakdown applies the Serve attempt filter instead of separate attempt columns.
- **2026-10-15 - Tiebreak key point and Table 3 rows agreed:** Key points adds a Tiebreak option (all tiebreak / match-tiebreak points); First / Game / Break points stay regular-game only. Table 3 keeps Direct ending as a subtotal and splits it into Ace / Return error / Double fault / Return winner. Design complete; not implemented.
- **2026-10-15 - Key points and predictability agreed:** Key points filter is multi-select (none = all). Location predictability compares serves on the same side only; chain follows the Set filter (none selected = continuous across all sets). Not implemented.

- **2026-10-15 - Serve Statistics section plan agreed:** filters Set / Player / Court side / Serve attempt / Key points (none selected = all, except Player) plus location for performance; Table 1 location x serve type with column-share %; Table 2 Serve performance with last-attempt attribution, Win / Lost due to serve equal to Serve advantage / disadvantage, Serve score as count and per 100; Table 3 Serve impact replaces the Outcome filter. Extras agreed: Advantage conversion %, Neutralised points won %, Fault breakdown, Performance by serve type, Pressure serving, Service games held %, Location predictability. Not implemented.
- **2026-10-15 - Serve Statistics section plan proposed (user):** Serve location distribution (Set / Player / Deuce-Ad / 1st-2nd filters; location rows; total and serve-type columns) and Serve performance (plus location filter; Serve winners, Serve + 1, Win due to serve, UE during Serve advantage, Double faults, Lost due to serve, Serve score). Assistant added proposed attribution, percentage basis, open questions and additional metric suggestions. Under discussion; documentation only.
- **2026-10-15 - Serve disadvantage agreed:** double fault, return ace, or receiver winner / server UE in a Serve disadvantage point. Replaces the before-shot-7 meaning for the outcome filter and the stats row. Outcome examples revised to the state.
- **2026-10-15 - Serve advantage agreed:** ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point. Replaces the before-shot-7 meaning for the outcome filter and the stats row.
- **2026-10-15 - Serve Impact State replaces rally count:** Recording and the service-game count rows switched to the four-state model. The serve-location advantage/disadvantage outcome filters need a count-free definition and distinct labels (proposal above, not agreed).
- **2026-10-14 - Count precedence confirmed:** Derive counts 1/2 from direct endings before checking for an unknown rally count. A stored 0, null or missing rally count cannot override a direct ending's known count or exclude it from advantage/disadvantage. Unknown-count win/loss-only behavior applies to unresolved rally endings. Documentation only.
- **2026-10-14 - Outcome definitions agreed:** Serve winner = ace/unreturnable serve or return error; advantage/disadvantage = server win/loss at known count below 7; win/loss = all eligible service points won/lost, including unknown-count points. Filters overlap. Zero/null/missing rally counts are excluded from advantage/disadvantage. Fixed direct-ending counts remain known. Double fault counts once as server UE. Return error remains receiver UE for shot attribution and the unchanged Summary; the broader serve-filter label does not redefine Winner Statistics. Supersedes the open outcome meanings and UE-inclusion question below. Attempt attribution remains open; documentation only.
- **2026-10-14 - Design requirement:** Added player serve-location distribution with counts and percentages and the requested court-side, attempt, key-point and six-label outcome filters. Attempt-based counting, a denominator including Not recorded, filter defaults/cardinality and score-context reuse are proposals. Advantage/disadvantage and win/loss meanings, category overlap and double-fault attribution remain open. Documentation only; no Advanced Analysis implementation.
- **2026-10-13 - Agreed clarification:** Double fault counts as shot 1 and is serve-related; the previously open count decision is resolved. No calculations changed.
- **2026-10-13 - Agreed:** Documented combined serve-winner semantics, total-shot convention and the serve-related / neutralised threshold; no calculations changed.
- **2026-10-13:** Established the serve-specific design record. The questions above are proposals, not agreed calculations.
