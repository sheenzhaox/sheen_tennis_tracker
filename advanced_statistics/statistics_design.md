# Advanced Tennis Statistics Design

## Purpose

Design a more advanced tennis statistics model using the match logs recorded by this application. This file records the general ideas, rationale, shared definitions, and model decisions. Topic-specific details belong in:

- [Return](return.md)
- [Serve](serve.md)
- [Winner](winner.md)
- [Unforced error](unforced_error.md)

## Documentation Workflow

Update this design and the affected topic files whenever statistics ideas are developed or calculations are created, changed, or removed. Include the reasoning, not just the final implementation.

Label each item as **Proposed**, **Agreed**, **Implemented**, or **Validated**. Validation claims must identify the checks performed. Preserve earlier ideas and explain decisions to revise or reject them.

Whenever either recording page gains, changes, or removes a factor, update the factor inventory below in the same task, without waiting for a separate documentation request. Check the visible controls, option constants, defaults, conditional fields, and saved payload together. Update affected topic designs when the change alters their inputs or interpretation.

## General Summary Retention

**Agreed 2026-10-14.** Keep the existing Summary statistics on the stats page as general match/player information. Advanced statistics supplement this overview; they must not replace or remove it.

- Preserve the Summary's existing metrics, calculations, and applicable filters unless a separate change is explicitly agreed.
- New advanced-statistics definitions do not implicitly redefine the existing Summary totals or their inclusion rules.
- Existing presentation reference: [Summary in the shared stats view](../src/ui/pages/StatsPage.tsx). This is a retention requirement, not a new metric or a completed inventory of existing calculations.
- Documentation only; no application behavior changed or runtime validation claimed.

## Advanced Analysis Page

**Agreed, implemented and deployed 2026-10-14 in release `358b109`.** A bottom-of-page Advanced Analysis link on normal authenticated match stats opens `#/match/:id/advanced-analysis` for `completed` matches, including manual finalisation. Scheduled, in-progress and abandoned matches have no link and cannot open the analysis content directly. The page uses the same locally accessible match/point records as normal match stats; it adds no permissions, public link, API or storage fields. Back returns to normal match stats and preserves the stats-directory return destination.

Sections appear in this order:

1. Match Information: player names, date, location, event, round, surface, format, recorded first server/recorder/notes, and manual finalisation when present. Existing date formatting uses the match day, falling back to start/create timestamps; unavailable fields are not inferred.
2. General Statistics: the existing Summary table and its independent set selection come first.
3. Serve Statistics.
4. Return Statistics.
5. Winner Statistics.
6. Unforced Error Statistics.
7. Other Key Factors Statistics.

Sections 3-7 contain headings only. No new metrics, phase calculations, charts, or detailed tables are implemented. Future topic sections follow their respective design documents; Other Key Factors remains undesigned. The normal stats page retains all its existing sections.

### Reused Summary Contract

**Existing calculations, reused without changes.** [SummaryStats](../src/ui/pages/StatsPage.tsx) renders the same [summary calculation](../src/stats/matchStats.ts) in normal stats and at the beginning of General Statistics on [Advanced Analysis](../src/ui/pages/AdvancedAnalysisPage.tsx).

- Population: this match's live points in the selected sets; no selected set means all sets. Score context is replayed under the match's saved rules. Counts are per player A/B, with no cross-match aggregation on Advanced Analysis.
- Points won counts `Point.winner`, including unrecorded/manual points but excluding Lucky balls. Winner and UE attribution uses `end`, `server`, and `rally.ending`. Winners retain ace/return/rally subcounts; UE totals retain double-fault/return/rally subcounts.
- Lucky balls (`end: rally`, `rally.lucky: true`) contribute only to the point winner's total Winners, not Points won, winner subcounts, errors or serve ratios. This deliberate exception means winner subcounts need not sum to the total.
- First serve in = non-fault first attempts / recorded first attempts. First serve points won = server wins on non-fault first attempts / non-fault first attempts. Second serve points won = server wins after a first fault with a recorded second attempt / such second attempts, including double faults. Example: 6 non-fault first attempts from 10 recorded first attempts displays `6/10 (60%)`.
- Ratios display numerator/denominator and rounded whole percentages; a zero denominator displays `-`. Empty samples retain zero count rows. No serve array means no serve contribution. Missing optional shot/serve attributes do not remove otherwise classifiable outcomes. Missing rally outcome details supply no winner/UE classification; no phase is inferred from missing/legacy rally counts.
- Summary double-fault inclusion is existing behavior and now also agrees with the 2026-10-14 decision to count a double fault once as server UE in advanced analysis. Summary serves as general information, not all-shot opportunity rates or causal evidence. Its Winner totals are not redefined by the broader Serve winner filter below.

**Validated:** 70 focused tests across `StatsAnalysis.test.tsx`, `StatsPage.test.tsx`, `PlayerStatsPage.test.tsx`, and `matchStats.test.ts` pass, covering route/status guards, section order, metadata, navigation, Summary parity including manual/Lucky/double-fault points, and existing statistics regressions. App/Worker/migration type checks and production build pass. Isolated browser fixtures verify Summary parity and set selection/clearing, with no horizontal overflow at 320/390/1280px; desktop/mobile screenshots were inspected. Full authenticated browser navigation/persistence remains untested because the local API proxy is unavailable. See the workflow for preview details.

## Agreed Outcome and Shot-Count Model

**Agreed 2026-10-13; design rules, not a claim of new implementation.** These definitions apply across serve, return, winner, and unforced-error analysis.

### Outcome Categories

- **Winner:** combines clean winners and shots that force an opponent error. Do not split forced errors into a third category. Credit the player who produced the winning/forcing shot.
- **Unforced error (UE):** attribute the error to the player who made it; the opponent wins the point. Winning a point through an opponent UE is not a winner shot by the point winner.
- For shot attribution, Ace (Unreturnable) represents a server winner, including both an ace and an unreturnable serve. Return error represents a receiver UE, not a server winner shot. A return winner is a winner by the receiver. The 2026-10-14 **Serve winner filter** is a broader serve-analysis grouping of `ace` plus `return_error`; it does not reclassify receiver UEs in Winner Statistics or the preserved Summary.
- Existing detailed outcome codes remain useful; the two categories are an analytical grouping, not a request to remove those codes. Unrecorded points cannot be assigned a category from their winner alone.

### Shot Number and Ending Player

Serve is **shot 1**, return is **shot 2**, and rally-stage play starts at **shot 3**. Each subsequent ball strike increases the count by one, including an ending UE stroke; successful shots alone are not the denominator of this count. First-/second-serve attempt number is separate from shot number: a preceding service fault must not shift the return to shot 3.

| Recorded ending | Analytical category and credited/erring player | Agreed total shot count |
| --- | --- | --- |
| `ace` (ace or unreturnable serve) | Winner, server | 1 |
| `return_winner` | Winner, receiver | 2 |
| `return_error` | UE, receiver | 2 |
| `rally` with `server_winner` | Winner, server | Recorded total, at least 3; normally odd |
| `rally` with `returner_winner` | Winner, receiver | Recorded total, at least 3; normally even |
| `rally` with `server_error` | UE, server | Recorded total, at least 3; normally odd |
| `rally` with `returner_error` | UE, receiver | Recorded total, at least 3; normally even |
| `double_fault` | One UE by the server; retain the double-fault subtype (UE inclusion agreed 2026-10-14) | 1, regardless of the two serve attempts |
| `unrecorded` | Unknown | Unknown |

Normally, odd shot numbers belong to the server and even shot numbers to the receiver. This concerns the ending-shot player, not necessarily `Point.winner`. For example, a server UE at shot 3 awards the point to the receiver; it does not become an even-shot ending.

**Serve plus one example:** serve (1), return (2), server winner (3). This is a server winner on shot 3, not a one-shot rally after dropping serve and return from the count.

**Confirmed forced-error attribution:** when a server shot forces an opponent error, record `server_winner`; when a receiver shot forces an opponent error, record `returner_winner`. Credit the causing player's shot and its attributes, not a UE to the opponent. For example, a server's serve-plus-one shot forcing an error is credited as a server winner.

**Remaining counting detail:** this attribution does not by itself specify whether a final unsuccessful opponent contact adds a shot or the total ends at the credited forcing shot. Resolve that detail before enforcing parity as a hard validation rule. The explicit counts of 1 for serve winners and double faults, and 2 for return winners/errors, remain agreed. Do not silently repair stored counts using parity.

### Serve-Related and Neutralised Phases

Let $N$ be the total shot count under the agreed convention:

$$
\operatorname{phase}(N) =
\begin{cases}
	ext{serve-related}, & 1 \leq N < 7 \\
	ext{neutralised}, & N \geq 7
\end{cases}
$$

- Shots 1-6 are **serve-related**, including early rally-stage points. Rally-stage entry at shot 3 does not itself mean the rally is neutralised.
- Reaching shot 7 marks a **neutralised rally**, where serve influence is considered reduced, not necessarily absent.
- This is an agreed modelling threshold, not measured proof that serve caused an outcome or that its effect disappears at shot 7.
- Examples: a receiver ending at shot 6 is serve-related; a server ending at shot 7 is neutralised; a receiver ending at shot 8 is neutralised.

### Data, Filters, and Implementation Gap

- Inputs for this model are `Point.end`, `Point.server`, `Point.winner`, `Point.rally.ending`, and `Point.rally.count`; `serves[]` supplies serve-attempt context, not the total shot count.
- For the intended analysis, derive counts of 1 for `ace` / `double_fault` and 2 for `return_winner` / `return_error`; these outcomes do not need a `rally` object. For rally outcomes, a convention-compatible recorded count must be an integer at least 3. Missing or incompatible counts have unknown phase, not zero shots or automatically serve-related.
- **Precedence confirmed 2026-10-14:** inspect `Point.end` first. Its fixed direct-ending count of 1 or 2 takes priority even when `rally.count` is 0, null or missing. Only unresolved rally endings receive the unknown-count exclusion from Serve advantage/disadvantage; a direct ending must not be excluded merely because its rally count is unset. This is analytical derivation, not a stored-data change.
- The current UI starts `rally.count` at `null` and increments from 1; it does not initialise or enforce the agreed 3+ total-shot convention or parity. No counter change, migration, or new phase metric is implemented by this design update.
  - **Superseded 2026-10-15:** the rally counter has been removed from recording; new rally points record a [Serve Impact State](#serve-impact-state-replaces-rally-count) instead. The shot-count convention above still governs direct endings and the interpretation of legacy counts.
- Historical non-null counts may use different conventions. Their meaning must be verified before phase comparisons; do not automatically add 2 or assume all historical counts already include serve and return. No recording-convention version is currently stored.
- Double faults have known count 1 and a known serve-related phase; do not exclude them from phase eligibility merely because they have no rally. Count each as one server UE and keep the double-fault subtype separately visible. Exclude unrecorded, unresolved-count, and unusable-count points from phase-based denominators and report their coverage separately. A rally count of 0, null or missing is unknown, not a point below shot 7; such points remain eligible for non-phase serve win/loss filters when usable serve data exists.
- Any future phase rate must specify player perspective, match/set filters, numerator, denominator, and aggregation. Its denominator must use eligible points with known phase in the same filtered population; zero eligible points means unavailable, not 0%. No particular performance rate is agreed here.
- Implementation checks still required: fixed counts 1/2, including double fault at 1 in the serve-related phase; rally minimum 3; threshold boundary 6/7; serve-plus-one at 3; server/receiver UE attribution; forced-error winner attribution to the causing player; second-serve independence; missing/legacy counts; and forced-error contact convention. The definitions above are not runtime validation results.

### Serve Impact State (replaces rally count)

**Agreed and implemented 2026-10-15 on branch `dev/serve-impact-state`; not deployed.** The rally-stage **+ Rally count** button is replaced by a **Serve Impact State** section with four buttons.

Rationale (user decision): exactly distinguishing rally lengths such as 5 versus 6 or 7, 8 and 9 has limited analytical value and adds recorder workload. What matters is **whether the serve created an advantage, whether that advantage lasted to the end of the point, and whether the point escaped serve influence into a neutral rally**. Serve + 1 is kept as its own state because of its strong correlation with the serve.

| UI label | Stored value | Meaning | Phase |
| --- | --- | --- | --- |
| Serve + 1 | `serve_plus_one` | The server ended the point on shot 3 (serve, return, server's next shot) with a winner or forced error; the server wins. | Serve-related |
| Neutralised | `neutralised` | The point lost serve influence and became a neutral rally before it ended. | Neutralised |
| Serve advantage | `serve_advantage` | The serve created the initiative for the server and it held until the point ended. | Serve-related |
| Return advantage (labelled Serve disadvantage until 2026-10-15) | `serve_disadvantage` | The receiver took the initiative against the serve and held it until the point ended. | Serve-related |

- **Label and layout (revised 2026-10-15, user request):** the `serve_disadvantage` button is labelled **Return advantage**; the stored value is unchanged, so existing data needs no migration. Buttons sit in a two-column grid in table order: row 1 Serve + 1 / Neutralised, row 2 Serve advantage / Return advantage. The point log and CSV show the new label. Elsewhere in these docs, "Serve disadvantage point" means a point with this state. The service-game statistic stays named **Serve disadvantage** (server's perspective).
- **Selection:** optional single choice, default `none`, tap again to clear. `none` means not recorded, not an observed absence of serve impact.
- **Independent of the ending:** Serve advantage / disadvantage / Neutralised describe who held the initiative, not who won. For example, Serve advantage followed by a server UE is valid.
- **Serve + 1 consistency:** selecting Serve + 1 also selects the server-winner ending; choosing another Point ending clears Serve + 1. Serve + 1 is therefore always saved with `rally.ending: 'server_winner'`.
- **Direct endings unchanged:** ace, double fault, return winner and return error never open rally entry. Analysis treats them as serve-related by their ending (fixed counts 1/2 remain).
- **Storage:** new rally points save `rally.impact`; `rally.count` is no longer written. The field stays optional in the model so older points keep their recorded counts. Points are stored as JSON, so no database migration is needed; public stats links pass `impact` through.

#### Legacy Count Mapping

**Agreed 2026-10-15; implemented analytically, stored data unchanged.** A recorded `rally.impact` always takes precedence. Otherwise a legacy `rally.count` maps as follows:

| Legacy count and ending | Mapped state |
| --- | --- |
| 3 with `server_winner` | Serve + 1 |
| 3-6 with `server_winner` / `server_error` (other than above) | Serve advantage |
| 3-6 with `returner_winner` / `returner_error` | Serve disadvantage |
| 7 or more | Neutralised |
| 0, 1, 2, null or missing | Unknown (excluded from state/phase rows; still in totals) |

Limitations: the mapping uses the ending-shot player as a proxy for initiative, so a legacy server UE at count 5 maps to Serve advantage although initiative was never observed. Legacy counts may follow an older convention (the counter started at 1 and did not enforce 3+), so mapped states for historical data are approximations, not observations. No stored record is rewritten.

#### Implemented Statistics

The normal stats **Forehand / backhand** table (match, shared and player stats) now derives its serve-phase rows from the state instead of shot counts. Winners include forced errors; Lucky balls stay excluded; points with unknown state appear only in the Winners / Unforced errors totals.

| Games filter | Row | Definition (for the selected player) |
| --- | --- | --- |
| Service games | Aces, Double faults | Unchanged |
| Service games | Serve +1 winners | Own winners in Serve + 1 points |
| Service games | Serve advantage | Points the server won through an ace, a return error, Serve + 1, or a server winner / receiver UE in a Serve advantage point (agreed 2026-10-15). Forehand / Backhand count only the server's own ending shots. |
| Service games | Serve disadvantage | Points the server lost through a double fault, a return ace, or a receiver winner / server UE in a Serve disadvantage point (agreed 2026-10-15). Forehand / Backhand count only the receiver's ending shots. |
| Return games | Return aces, Return errors | Unchanged |
| Return games | Return advantage | Points the receiver won through a return ace, or a receiver winner / server UE in a Return advantage point (agreed 2026-10-15). Excludes double faults. Forehand / Backhand count only the receiver's own ending shots. |
| All games | Serve-phase winners / UE | Own winners / UEs on direct endings or in Serve + 1 / advantage / disadvantage points |
| All games | Neutralised winners / UE | Own winners / UEs in Neutralised points |

These replace the former count rows (Serve +1 at shot 3, Serve advantage at 1/3/5, Serve disadvantage and Return advantage at 2/4/6, Short rally 1-6, Long rally 7+). The old parity rows assumed the ending-shot player held the advantage; the new rows use the recorded initiative.

References: [serveImpact, pointPhase, strokeStats](../src/stats/matchStats.ts), [rally entry](../src/ui/components/RallyEntry.tsx), [point log / CSV](../src/ui/components/PointLog.tsx), [public stats payload](../worker/publicStats.ts). **Validated 2026-10-15:** `matchStats.test.ts` covers recorded-state precedence, every legacy mapping row, unknown counts, direct-ending phase and each redefined row; `PointLog.test.ts` covers the exported state label. Full suite of 215 tests across 19 files, app/Worker/migration type checks and the production build pass. The recording screen was not browser-tested.

#### Serve Advantage Statistic

**Agreed 2026-10-15 (user definition); implemented in the Forehand / backhand Service games row.** In statistics, **Serve advantage** counts a service point when it ends with:

- an ace (including unreturnable serve, `end: 'ace'`),
- a return error (`end: 'return_error'`),
- Serve + 1 (`rally.impact: 'serve_plus_one'`, always a server winner), or
- a server winner (`server_winner`) or receiver UE (`returner_error`) in a point recorded as Serve advantage.

Every included point is won by the server. A server UE or receiver winner in a Serve advantage point is excluded, as are points the server wins in Serve disadvantage or Neutralised points. This replaces the earlier count-based definitions (winners at 1/3/5, and the serve-location filter's "server wins before shot 7") and the briefly implemented winners-only row. Legacy points use the mapped state. Return errors and receiver UEs are receiver strokes, so they add to the row total but not to its Forehand / Backhand columns; the receiver-UE attribution in Summary and UE analysis is unchanged.

Example: ace, return error, Serve + 1, server winner in Serve advantage and receiver UE in Serve advantage = 5. A server UE in Serve advantage, and a server winner in Serve disadvantage, add 0.

#### Serve Disadvantage Statistic

**Agreed 2026-10-15 (user definition); implemented in the Forehand / backhand Service games row.** The mirror of Serve advantage. In statistics, **Serve disadvantage** counts a service point when it ends with:

- a double fault (`end: 'double_fault'`),
- a return ace (`end: 'return_winner'`), or
- a receiver winner (`returner_winner`) or server UE (`server_error`) in a point recorded as Serve disadvantage.

Every included point is lost by the server. A receiver UE or server winner in a Serve disadvantage point is excluded, as are points the server loses in Serve advantage or Neutralised points. This replaces the earlier count-based definitions (opponent winners at 2/4/6, and the serve-location filter's "server loses before shot 7") and the briefly implemented row counting only opponent return aces plus opponent winners in Serve disadvantage points. Legacy points use the mapped state. Double faults have no forehand/backhand stroke, and server UEs are server strokes, so both add to the row total but not to its Forehand / Backhand columns, which show the receiver's winning shots. Double-fault and server-UE attribution in Summary and UE analysis is unchanged.

Example: double fault, return ace, receiver winner in Serve disadvantage and server UE in Serve disadvantage = 4. A receiver UE in Serve disadvantage, and a receiver winner in Serve advantage, add 0.

#### Return Advantage Statistic

**Agreed 2026-10-15 (user definition); implemented in the Forehand / backhand Return games row.** The receiver's view of the same initiative. In statistics, **Return advantage** counts a return point (the selected player receives) when it ends with:

- a return ace (`end: 'return_winner'`, including a forced error by the server on the return), or
- a receiver winner (`returner_winner`) or server UE (`server_error`) in a point recorded as Return advantage (`rally.impact: 'serve_disadvantage'`).

**Double faults are excluded:** a double fault is the server's own failure before any return, not an advantage the receiver created. Hence Return advantage = Serve disadvantage of the same points minus double faults.

- **Formula:** count of qualifying points for the selected player in their return games; it is a count, not a rate, so it has no denominator.
- **Forehand / Backhand:** only the receiver's own ending shots (the return stroke for return aces, `rally.stroke` for rally winners). Server UEs add to the total only.
- **Excluded:** double faults, return errors, receiver UEs and server winners in Return advantage points, and any point in Serve + 1 / Serve advantage / Neutralised states.
- **Filters and exclusions:** follows the stats page's match / set / player selection; Lucky balls are excluded; rallies with no recorded state and no usable legacy count are excluded (legacy counts 3-6 ending with a receiver shot map to this state).
- **Attribution unchanged:** a server UE counted here remains the server's UE in Summary and UE analysis; the receiver is not credited with a winner shot.
- **Limitations:** the state is the scorer's judgement of initiative, so it does not prove the return caused the outcome. Legacy-mapped points use the ending-shot player as a proxy.

This replaces the count-based definition (receiver winners at 2/4/6) and the briefly implemented winners-only row (return aces plus receiver winners in Return advantage points).

Example: return ace, receiver winner in Return advantage and server UE in Return advantage = 3. A double fault, a receiver UE in Return advantage, and a receiver winner in Serve advantage add 0.

References: `strokeStats` in [matchStats.ts](../src/stats/matchStats.ts); test "counts serve-impact rows from recorded states" in [matchStats.test.ts](../src/stats/matchStats.test.ts). **Validated 2026-10-15:** that test checks a total of 2 (receiver winner and server UE in Return advantage; the double fault excluded) with forehand 1 / backhand 0, and the first fixture checks a return ace counted with a double fault excluded; full suite of 215 tests and the build pass.

#### Open Questions

- **Serve-location outcome filters (agreed 2026-10-15):** the Serve advantage and Serve disadvantage outcome filters use the two definitions above instead of "server wins/loses before shot 7". Attempt attribution remains open. Serve winner, Double fault and Serve win/loss filters are unchanged.
- Whether to treat a Serve + 1 state with a non-server-winner ending as invalid if one is imported or edited outside the UI. The UI prevents it; analysis currently still counts it as serve-related.

## Recorded Factor Inventory

**Implemented; source-reviewed 2026-10-13, rally stage updated 2026-10-15.** This inventory describes the current recording UI and saved data, not proposed metrics. Sources: [serve entry and point persistence](../src/ui/pages/MatchTracker.tsx), [rally entry](../src/ui/components/RallyEntry.tsx), and [field types and option lists](../src/model/types.ts). Verification here is source inspection, not a new runtime test.

Paths below are relative to a saved `Point`; `serves[]` contains one entry per serve attempt. Labels are shown alongside stored values where they differ. Optional single-choice controls start at `none` and can be deselected; this means not recorded, not a negative observation.

### Serve Stage

| Recorded factor / UI label | Available choices (stored values) | Saved field | Requirement and availability |
| --- | --- | --- | --- |
| Outcome | Ace (Unreturnable) (`ace`); Fault (`fault`, labelled Fault (double) on second serve); Return Ace (`return_winner`); Return error (`return_error`); Serve in (`in`) | `serves[].result` | Required single choice per attempt. A first fault leads to second serve; a second fault ends the point; Serve in opens rally entry. |
| Serve location | Wide (`wide`), Body (`body`), T (`t`) | `serves[].location` | Optional single choice for any outcome; default `none`. |
| Fault type | Net (`net`), Long (`long`), Wide (`wide`) | `serves[].fault` | Only displayed and saved for Fault; optional, default `none` when applicable; otherwise absent. |
| Serve type | Flat (`flat`), Slice (`slice`), Kick (`kick`) | `serves[].type` | Optional single choice for any outcome; default `none`. |
| Return | Forehand return (`forehand`), Backhand return (`backhand`) | `serves[].return.stroke` | Only displayed and saved for Return Ace or Return error; optional, default `none`. |
| Return direction | Crosscourt (`crosscourt`), Down the line (`down_the_line`), Inside out (`inside_out`) | `serves[].return.direction` | Only displayed and saved for Return Ace or Return error; optional, default `none`. |
| Return error | Net (`net`), Long (`long`), Wide (`wide`) | `serves[].return.error` | Only displayed and saved for Return error; optional, default `none`; absent for Return Ace. |

The current form does not capture return-shot attributes for Serve in, Ace, or Fault: the entire `return` object is absent for those outcomes. Serve-stage Return error is modelled as an unforced return error. Ace (Unreturnable) is a broader UI category than a strict untouched-serve ace; analyses must preserve that distinction.

Selecting the last visible option row commits the serve when an outcome is selected: Serve type for Ace/Fault/Serve in, Return direction for Return Ace, or Return error for Return error. Next can commit with optional factors unset. A first fault remains in the in-memory draft; the complete `serves` array is persisted when the point ends.

### Rally Stage

Rally entry is reached only after Serve in. The shot factors describe the final shot, attributed to the player in Point ending; incoming factors describe the ball received for that shot. They are not a shot-by-shot rally sequence.

| Recorded factor / UI label | Available choices (stored values) | Saved field | Requirement and availability |
| --- | --- | --- | --- |
| Serve Impact State | Serve + 1 (`serve_plus_one`), Neutralised (`neutralised`), Serve advantage (`serve_advantage`), Return advantage (`serve_disadvantage`; labelled Serve disadvantage until 2026-10-15) | `rally.impact` | Optional single choice shown first, two-column grid (row 1 Serve + 1 / Neutralised, row 2 Serve advantage / Return advantage); default `none`; deselectable. Selecting Serve + 1 also selects the server-winner Point ending; choosing another ending clears Serve + 1. Added 2026-10-15; absent on older points. See [Serve Impact State](#serve-impact-state-replaces-rally-count). |
| Rally count (legacy, removed 2026-10-15) | Formerly None, then 1, 2, 3, ... per tap | `rally.count` | No longer displayed or written. Older points may hold a count (or `null`); analysis maps it to a Serve Impact State only when `rally.impact` is absent. Historical counts may not follow the 3+ total-shot convention. |
| Point ending | Server winner (`server_winner`); returner winner (`returner_winner`); server UE (`server_error`); returner UE (`returner_error`); UI uses player names | `rally.ending` | Required single choice. Identifies the final-shot player and winner/error classification; determines the point winner. |
| Stroke | Forehand (`forehand`), Backhand (`backhand`) | `rally.stroke` | Optional single choice; default `none`. |
| Error type | Net (`net`), Long (`long`), Wide (`wide`) | `rally.error` | Only displayed and saved for either UE ending; optional, default `none`; absent for winner endings. |
| Lucky ball | Selected / not selected | `rally.lucky` | Only displayed and saved for either winner ending; boolean, default `false`; absent for UE endings. Unticked does not prove the recorder explicitly assessed luck. |
| Shot direction | Cross court (`crosscourt`), Down line (`down_the_line`), Inside out (`inside_out`), Inside in (`inside_in`), Middle (`middle`), Short angle (`short_angle`) | `rally.direction` | Optional single choice; default `none`. |
| Shot type | Drive volley (`drive_volley`), Slice (`slice`), Volley (`volley`), Smash (`smash`), Lob (`lob`), Dropshot (`dropshot`) | `rally.shotType` | Optional single choice; default `none`. `topspin` is supported in legacy records but is not a current entry option. |
| Shot position | Baseline (`baseline`), Approach (`approach`), Net (`net`) | `rally.position` | Optional single choice; default `none`. |
| Incoming ball | Slow (`slow`), Fast (`fast`), Heavy (`heavy`), Slice (`slice`), Short (`short`), Deep (`deep`) | `rally.incomingBall` | Optional multi-choice; default `[]`. Toggles are independent, with no mutually exclusive pairs enforced. Older records may omit the field. |
| Incoming direction | Cross (`crosscourt`), Down line (`down_the_line`), Inside out (`inside_out`), Inside in (`inside_in`), Short angle (`short_angle`), Dropshot (`dropshot`) | `rally.incomingDirection` | Optional single choice; default `none`. Older records may omit the field. |

Save point requires only Point ending and explicitly commits the point. Winner endings also cover forced errors according to the model; there is no separate recorded choice to distinguish a clean winner from a forced error. Changing the ending saves only the applicable `error` or `lucky` field.

### Shared and Automatic Context

These fields supplement both stages; they are not additional serve/rally option rows.

| Factor / context | Values or derivation | Saved field / source | Recording limits |
| --- | --- | --- | --- |
| Point observation (Note) | Optional free text, trimmed on save | `notes` | Available in both stages; blank becomes absent. One note per point, not per serve or shot. |
| Server and returner | Server side A/B comes from the score engine; returner is the opposite side | `server`; match `playerAId` / `playerBId` | Server is saved; returner and player names are resolved, not independently selected here. |
| First / second serve | Attempt position 1 or 2 in the serve array | Index in `serves[]` | No separate serve-number field; a first fault precedes the second attempt. |
| Point winner | A or B, derived from the selected outcome/ending | `winner` | Rally server wins for `server_winner` or `returner_error`; returner wins for the other rally endings. |
| Point ending category | `ace`, `double_fault`, `return_winner`, `return_error`, `rally`, `unrecorded` | `end` | Derived from the recording path; a second Fault becomes `double_fault`. |
| Match association and point order | Match ID and zero-based sequence | `matchId`, `seq` | Enables linkage to match metadata and reconstruction of score context. |
| Deuce / Ad, score, set/game, tiebreak / match tiebreak | Computed from match rules, first server, and prior point winners | Score engine; not separate point fields | Displayed context is derived, not manually logged in these forms. |
| Save timestamps | Time when the point is saved | `createdAt`, `updatedAt` | Not serve speed, shot timing, or rally duration. |
| Unrecorded point shortcut | User selects the point winner in the score controls | `winner`, `server`, `end: 'unrecorded'`, `serves: []`; no `rally` | Keeps scoring context but supplies no serve/rally observations; an optional point note may still be saved. |

### Modelling Boundaries

- Distinguish not applicable (a conditional object/field is absent), not selected (`none`, `null`, or an empty array), and fields unavailable in older records. Never silently count these as observed negatives.
- Multi-choice Incoming ball counts can overlap and sum above the number of points. The labels are subjective categories, not measured speed, spin, or depth.
- The return and final-rally-shot samples are outcome-selected. They do not supply all return attempts' shot attributes or all rally-shot opportunities; distributions within these samples are not automatically shot success rates.
- Preserve the agreed combined winner category, including forced errors and Ace (Unreturnable); there is no intended winner-versus-forced-error split. Keep UE separate and do not infer either category from the point winner alone.
- Match metadata such as surface and player profiles are separate sources, not factors entered on these two pages. Any model using them must document the join and missing-data rules.

## Metric Documentation Checklist

- Question the statistic answers and why it is useful to players or coaches.
- Required recorded fields, unit of observation, player perspective, and eligibility criteria.
- Definition, formula, numerator, denominator, units, and a worked example.
- Match/set/point filters and aggregation across matches; explain any weighting.
- Treatment of missing or unknown values, legacy logs, excluded points, and zero denominators.
- Sample size, coverage, uncertainty, and interpretation limits. Do not equate association with causation.
- Status, relevant implementation and test references, validation results, and remaining questions.

## Shared Design Questions

These questions are open, not implemented model decisions:

- Which coaching questions can the recorded observations actually answer?
- Which metrics need additional recording fields rather than assumptions about missing observations?
- How should context, sample size, and incomplete logging affect comparisons?
- How should topic-specific statistics combine without double-counting or hiding their denominators?

### Serve Location Distribution Design

**Agreed requirement, 2026-10-14; not implemented.** The first advanced serve metric will describe a selected player's serve locations using counts and percentages, filterable by Deuce/Ad, first/second serve, first/game/break point, and Serve winner / Serve advantage / Serve win / Double fault / Serve disadvantage / Serve loss. Details live in [Serve location distribution](serve.md#serve-location-distribution).

Attempt-based counting, missing-location denominator treatment, filter defaults/cardinality and key-point edge cases remain proposals. Attribution of point outcomes to individual attempts also remains open; point-level outcome meanings are now agreed below. No recording factors or runtime statistics changed.

**Outcome clarification agreed 2026-10-14:** Serve winner includes ace/unreturnable serve and return error. Serve advantage/disadvantage mean server wins/loses before shot 7 with a known count. Serve win/loss include all eligible service points won/lost, regardless of count. These filters overlap, not partition: direct serve winners are also advantages and wins; double faults are also disadvantages and losses under the known count-1 convention. Unknown rally counts (including 0, null or missing) enter win/loss but not advantage/disadvantage. Direct endings keep their agreed known counts without requiring rally metadata. Preserve the existing Lucky ball exclusion and do not fabricate serve records for manual points.

The Serve winner filter is broader than shot-winner attribution: a return error remains a receiver UE in Return/UE analysis and does not become a server winner shot in Winner Statistics or Summary. Double fault counts once as a server UE, with its subtype retained; this resolves the earlier open combined-UE inclusion question. Detailed examples and remaining attempt-attribution questions are in [the serve design](serve.md#agreed-outcome-definitions).

**Revised 2026-10-15:** Serve advantage / disadvantage no longer mean server wins / loses before shot 7. They use the [Serve advantage](#serve-advantage-statistic) and [Serve disadvantage](#serve-disadvantage-statistic) statistics, based on the Serve Impact State. Both are now subsets of Serve win / Serve loss respectively; Serve winner remains a subset of Serve advantage and Double fault of Serve disadvantage. Points with no known state enter only win/loss.

## Decision Record

- **2026-10-15 - Return advantage statistic agreed:** Return advantage = return ace, or receiver winner / server UE in a Return advantage point; double faults excluded. Implemented in the Return games row (Forehand / Backhand from receiver shots only). Replaces the winners-only row.
- **2026-10-15 - Serve Impact State button relabelled and reordered (user request):** `serve_disadvantage` is shown as **Return advantage**; order is Serve + 1 / Neutralised, then Serve advantage / Return advantage. Stored values, legacy mapping and all statistic definitions are unchanged; the service-game statistic keeps the name Serve disadvantage.
- **2026-10-15 - Serve disadvantage statistic agreed:** Serve disadvantage = double fault, return ace, or receiver winner / server UE in a Serve disadvantage point. Implemented in the Service games row (Forehand / Backhand from receiver shots only). The serve-location Serve advantage / disadvantage outcome filters adopt both statistics. Return advantage then unchanged (resolved later the same day). Tests and build pass.
- **2026-10-15 - Serve advantage statistic agreed:** Serve advantage = ace, return error, Serve + 1, or server winner / receiver UE in a Serve advantage point. Implemented in the Service games row (Forehand / Backhand from server shots only). Tests and build pass.
- **2026-10-15 - Serve Impact State replaces rally count (implemented, not deployed):** Rally entry records one optional state, Serve + 1 / Serve advantage / Serve disadvantage / Neutralised, instead of tapping a rally count. Agreed with the user: Serve + 1 = server winner or forced error on shot 3; the other states record initiative independently of the ending; legacy counts map analytically (3 + server winner = Serve + 1, 3-6 by ending-shot player, 7+ = Neutralised); the count-based Forehand / backhand rows are redefined on the state. Supersedes count entry and the 6/7 threshold for new rally points; the shot-count convention remains for direct endings and legacy data. Serve-location outcome-filter labels need reconciling (open). 215 tests and the build pass.
- **2026-10-14 - Page structure deployed / design saved:** Release `358b109` publishes Advanced Analysis structure and unchanged Summary reuse. Serve-location distributions and the other advanced metric details remain design-only. Full release validation: 212 tests, all type checks, build and Worker dry run; live app/Help/Public Stats/CSS content and PWA assets verified, protected APIs reject anonymous requests. See `workflow.md` for deployment versions, verification limits and the next design decisions.
- **2026-10-14 - Count precedence confirmed:** Direct-ending counts 1/2 override unknown rally-count values for phase and serve-outcome eligibility. Resolve the ending before applying unknown-count exclusions. Updated serve design; no runtime changes.
- **2026-10-14 - Serve outcomes clarified:** Agreed ace + return error for Serve winner, overlapping early (<7, known count) advantage/disadvantage and all-count win/loss filters, unknown-count exclusion from early filters, and double fault as one server UE. Preserve receiver-UE/shot-winner attribution and the existing Summary. Updated all affected topics; no application implementation.
- **2026-10-14 - Serve design started:** Recorded location-distribution requirements and all requested filters in `serve.md`, with explicit proposed formulas, data/missingness rules and open outcome definitions. Design-only task; Advanced Analysis Serve Statistics remains heading-only.
- **2026-10-14 - Implemented page structure:** Added completed-match Advanced Analysis with match information, reused Summary under General Statistics, and heading-only topic sections. Normal stats remain intact; no new metric or recording change. Existing Summary behavior is partially inventoried above; the other existing statistics still need an inventory.
- **2026-10-14 - Agreed:** Retain the existing stats-page Summary for general information alongside advanced statistics. Preserve its current metrics, calculations, and filters unless separately agreed; advanced designs do not silently change Summary semantics. Documentation only.
- **2026-10-13 - Agreed clarification:** Double fault has total shot count 1 and is serve-related, resolving its previously unspecified count. Rally forced errors are credited as winners to the player who caused them, never as opponent UEs. Attribution is confirmed; unsuccessful final-contact counting and inclusion of double faults in future combined UE totals remain separate design details. Documentation only.
- **2026-10-13 - Agreed:** Winner includes forced error; UE remains separate. Serve/return occupy shots 1/2, rally begins at 3, and serve plus one is shot 3. Shots below 7 are serve-related; 7+ are neutralised with reduced assumed serve influence. This resolves the previously open intended count convention, but not legacy data compatibility. Forced-error final-contact counting and double-fault handling remain explicit edge cases. Updated all four topic designs; no application code changed.
- **2026-10-13 - Implemented inventory / source-reviewed:** Documented current serve/rally controls, stored fields, conditional defaults, shared context, and data limits from the entry components and model. Future factor changes must update this inventory automatically in the same task. No application calculations changed.
- **2026-10-13 - Agreed:** Use this folder as the living statistics design record; maintain general ideas here and details in the four topic files. Update documentation alongside future statistics work.
- **2026-10-13 - Documentation setup:** No application calculations changed. Existing statistics have not yet been inventoried into these documents; an empty implementation section does not imply that the app lacks that statistic.
