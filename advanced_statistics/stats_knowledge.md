# Statistics Knowledge

## Purpose and Status

This is the coaching interpretation guide for statistics implemented in this project. It explains what each statistic measures, why it is useful, and how to read it alongside game and match results. Detailed design decisions remain in [statistics_design.md](statistics_design.md) and [serve.md](serve.md).

**Inventory date: 2026-10-17.** The serve metrics below are implemented; the latest recorded serve release was deployed on 2026-10-15. Definitions were checked against the calculation and rendering code. Coaching interpretations are reasoned explanations, not measured causal effects or validated match-win predictions. No real-match impact study has been performed.

**Maintenance rule:** whenever statistics are added, changed or removed, update this guide in the same task. Record the definition, denominator, purpose, game/match interpretation, limitations and implementation references. Mark proposed metrics separately from implemented ones; preserve superseded interpretations when a definition changes.

## Reading Serve Statistics

- All definitions use the selected player's perspective as server unless stated otherwise. UE means unforced error. Winner includes a clean winner or a shot forcing an opponent error.
- Ace means the recorded **Ace (Unreturnable)** category, not necessarily an untouched ace. Return error is the receiver's UE; including it in Serve winners does not turn it into a server winner shot in Summary.
- Serve in control (`serve_advantage`) and Return in control (`serve_disadvantage`) describe recorded initiative, not necessarily the point winner. A player can have control and still lose. Serve + 1 means the server wins with the shot after the return, including a forced error.
- Advanced serve subsections have independent Player/Set selectors and default to Player A/all sets. Other selectors default to All. Compare tables only after aligning their filters; selecting a filter in one does not update the others.
- Performance and impact use each point's **last serve attempt** for attempt, location and type. A first fault followed by a second serve counts as one second-serve point, not a first-serve point too. Distribution and faults instead count individual attempts.
- Detailed serve metrics exclude Lucky balls and manual/unrecorded points. Hold and break-point calculations include them because only scoring outcomes are needed. All points still participate in score replay.
- Unrecorded serve location counts as **Body** and unrecorded type as **Flat** in these serve tables. Those categories include defaults, not just observed Body/Flat serves. Fault type retains Not recorded.
- A recorded impact state takes priority over legacy rally counts. Without a recorded state, legacy 3-shot server winners map to Serve + 1; other counts 3-6 map by ending-shot player; 7+ maps to Neutralised; missing/counts below 3 are unknown. This is an approximation, not observed historical initiative.
- Percentages below mean $100$ times the stated ratio. Advanced percentages use one decimal when needed; Summary ratios use whole percentages. Zero denominators display `-`; counts can still be zero.

### Filters and Required Data

| Surface | Filters that apply | Main inputs |
| --- | --- | --- |
| Location distribution | Player, Set, Court side, Serve attempt, Key points | `server`, `serves[].location/type`, attempt order |
| Serve performance / Serve impact | Above plus Serve location, using the last attempt | Above plus `end`, `winner`, `rally.impact/ending/count` |
| Faults | Player, Set, Court side, Serve attempt, Key points | `serves[].result/fault/location` |
| Service games held | Player and Set only | Ordered point winners, saved match rules and first server |
| Break points saved | Player, Set and Court side only | Replayed pre-point score, server and point winner |
| Location repeats | Player, Set, Court side and Serve attempt | Ordered attempts and their locations |
| Summary serve ratios | Summary's independent Set selection; both players shown | `server`, `winner`, `serves[].result`, attempt order |

Court side and key points are derived from replayed score, not directly recorded observations. First point, Game points and Break points apply to regular games; Tiebreak includes tiebreak and match-tiebreak points. No-ad deciding points can be both game and break points. Accuracy depends on the saved rules, first server and complete point order.

## Location Distribution

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Serves total | Number of eligible attempts, including faults; with All serves a two-attempt point contributes twice | Show sample size and serving workload | More attempts do not mean more points won. Extra second attempts can indicate first-serve inconsistency. |
| Wide / Body / T count and share | Attempts at that location / all eligible attempts | Describe placement mix | Can reveal reliance on one target. It is not a serve-in rate or win rate, and more Wide or T serves is not inherently better. |
| Flat / Slice / Kick totals | Number of eligible attempts of each type | Show tactical mix and comparison sample sizes | Useful context for type-specific outcomes, not evidence that the most-used type is strongest. |
| Location share within each type | Attempts of a type at a location / all attempts of that type | Show where each serve type is used | Pair with performance under matching filters to explore effective combinations; faults and defaulted Body/Flat observations can distort interpretation. |

Each location column sums to 100% before rounding. Example: 8 Wide attempts out of 20 Flat attempts gives 40% in the Wide/Flat cell, not 40% of all serves and not a 40% point-win rate.

## Serve Performance

Let $N$ be eligible service points under this table's filters. Each Total/Flat/Slice/Kick column has its **own** $N$; ordinary row percentages are count divided by that column's $N$.

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Service points | $N$ | Establish the sample behind all rates | Counts exposure, not quality. Small type/pressure samples make comparisons unstable. |
| Serve winners | Ace + return error | Measure immediate successful serve/return endings | Every qualifying point is won by the server, helping progression towards a hold without further rally play. Does not separate serve quality from returner error quality. |
| Serve + 1 | Points recorded/mapped as Serve + 1 | Measure serve-plus-next-shot finishing | Every valid recorded Serve + 1 is a server win. It reflects the serve/next-shot combination, not the serve alone. |
| Win due to serve | Ace + return error + Serve + 1 + server winners + receiver UEs in Serve in control rallies | Summarise successful serve-associated outcomes | Higher share means more service points won in these categories. It is a model label, not a claim that the serve caused every point win. |
| UE during Serve advantage | Server UEs in Serve in control rallies | Identify opportunities lost despite initiative | These are lost points that can undermine holds. A lower rate can indicate better finishing, but compare control exposure and opponent/context too. Denominator here is $N$, not only controlled rallies. |
| Double faults | Points ending in double fault | Identify direct service failures | Each costs one point before a return. On break point it immediately loses the service game; elsewhere the scoring consequence depends on score. A first fault alone is not a double fault. |
| Lost due to serve | Double fault + return winner + receiver winners + server UEs in Return in control rallies | Summarise unsuccessful serve-associated outcomes | Higher share means more points lost in these categories, potentially increasing break risk. It omits losses while Serve in control, Neutralised or unknown. |
| Serve score | Win due to serve minus Lost due to serve | Compare successful and unsuccessful serve-associated outcomes in one count | Positive means more classified successes than failures. It is not total service points won minus lost, games won, or a match-winning threshold. |
| Serve score per 100 | $100 \times \text{Serve score}/N$ | Compare different sample sizes | A descriptive net balance, not a win probability. Scaling does not remove opponent, pressure, sample-size or recording differences. |
| Performance by serve type | The same metrics within the last attempt's Flat/Slice/Kick column | Compare tactical outcomes by type | Useful for investigating choices, but type is not randomly assigned: second serves, locations and opponents can explain differences. |

Rows overlap: Serve winners and Serve + 1 are already included in Win due to serve; Double faults are already included in Lost due to serve. Do not add them as independent contributions. Example: 14 wins due to serve and 9 losses due to serve from 40 service points gives Serve score +5, or +12.5 per 100. It does not imply 14 total service points won or predict a hold percentage.

## Serve Impact

This table separates **how often a state occurs** from **what happens once in that state**. It uses the same service-point eligibility and last-attempt attribution as Serve performance, but has independent filters.

Let $C$ = Ace + Return error + Serve + 1 + all Serve in control rallies; $R$ = Double fault + Return winner + all Return in control rallies; $Z$ = Neutralised points; $U$ = State not recorded. These top-level groups partition the sample: $C+R+Z+U=N$.

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Serve in control count/rate | $C$ and $C/N$ | Measure frequency of server initiative or immediate success | More initiative can create winning opportunities, but only conversion shows whether they became points won. |
| Serve in control Won/conversion | Server wins within $C$, divided by $C$ for Won % | Measure finishing once in the favourable group | Higher conversion means fewer lost opportunities. Its won count equals Win due to serve when filters match. A lower value can reflect server UEs or receiver winners despite server control. |
| Ace sub-row | Ace count, count/$N$, server wins and Won % | Isolate immediate wins via Ace (Unreturnable) | All valid aces are won, so 100% Won is structural, not an independently measured skill rate. |
| Return error sub-row | Return-error count, count/$N$, server wins and Won % | Isolate immediate wins from receiver UEs | All are server wins; they remain receiver UEs for shot attribution. |
| Serve + 1 sub-row | Serve + 1 count, count/$N$, server wins and Won % | Show this component within the control group | The share duplicates the performance row under identical filters; valid recordings are always won. |
| Serve in control rally | All `serve_advantage` rallies, their share of $N$, server wins and server wins / these rallies | Separate rally finishing from direct endings and Serve + 1 | A more specific conversion measure than the parent group, whose aces/direct endings raise its conversion automatically. |
| Return in control count/rate | $R$ and $R/N$ | Measure frequency of receiver initiative or immediate service failure | A large share can indicate vulnerability, but includes DF where no return occurred. It is broader than receiver-created advantage. |
| Return in control Won/save rate | Server wins within $R$, divided by $R$ for Won % | Measure recovery in the unfavourable group | Saved points help protect service games. DF and return winners cannot be saved, so they lower the group rate as well as increasing its count. |
| Double fault sub-row | DF count and count/$N$; Won/Won % blank | Expose direct losses within $R$ | Always lost; blank does not mean outcome unknown. Same count as performance DF with matching filters. |
| Return winner sub-row | Return-winner count and count/$N$; Won/Won % blank | Expose immediate receiver wins, including forced errors | Always lost by the server; indicates unsuccessful serve/return outcomes, not necessarily a service error. |
| Lost return in control rally | Points = all Return in control rallies $D$; share = $D/N$; displayed Won = receiver winners + server UEs $L$; Won % = $L/D$ | Measure losses while the receiver held initiative | Higher percentage means worse recovery for the server. This row uses **lost points**, unlike the group's Won/save rate. Its Points are all such rallies, not only losses. |
| Neutralised count/rate | $Z$ and $Z/N$ | Measure how often play escapes the recorded serve advantage | More neutralisation is not automatically good or bad; it matters whether the server is successful in those rallies. |
| Neutralised Won/winning rate | Server wins in Neutralised / $Z$ | Evaluate the server after serve influence is judged reduced | Strong neutral-rally results can compensate for fewer direct serve wins. They do not prove serve influence was absent. |
| State not recorded | $U$, $U/N$, server wins and server wins/$U$ | Keep unclassified rallies and their results visible | A high share weakens state-based conclusions; missing state is not evidence of neutral play. |

**Important display exception:** the red Lost return in control rally row's Won column counts server losses. The group row still counts server wins, so these Won cells must not be summed. Points in sub-rows do sum to their group. Example: three Return in control rallies with two server losses gives 2/3 (66.7%) in that rally row and 1/3 (33.3%) group saves if there are no DF/return winners.

With matching filters, Return in control points minus its group Won equals Lost due to serve. Control conversion and recovery are conditional rates; control frequency is a different question. Raising one does not guarantee a higher overall service-point win rate if the mix of states changes.

## Faults

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Net / Long / Wide / Not recorded by location | Faulted attempts in each location/error-type cell; percentage = cell count / **all faults shown** | Locate recurring miss patterns | Can guide technical or target review. A first fault removes the first-serve opportunity; a second fault costs a point. Their scoring consequences differ. |
| Total faults per location | Sum of fault types for that location, divided by all faults shown | Identify where the recorded misses concentrate | A large share can simply reflect frequent use of that location. This is not faults / all attempts at the location. |
| First-/second-serve fault views | Same table restricted by attempt selector | Distinguish first-serve misses from point-losing second faults | Second faults directly lose points; first faults can expose a weaker second serve but do not alone lose the point. |

Serve location Wide and fault type Wide are different fields. A double-fault point contributes two faults under All serves, but only one lost point. Not recorded fault type preserves missingness. No location-specific fault probability or fault-rate table is currently displayed.

## Serving Summary and General Statistics

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Service games held / Service games won | Completed regular service games won by the server / completed regular service games served | Measure the actual game-level serving outcome | Most direct serve-related result metric: a failed hold is a break. High holds protect sets but do not establish match victory; return games, tiebreaks and match rules still matter. |
| Break points saved | Break points the server won / break points faced | Evaluate point outcomes when a break was immediately possible | Losing a break point loses that service game. Saving one prevents the immediate break but does not guarantee the eventual hold. Several saves may occur in the same game. |
| Location repeats | Attempts matching the previous eligible serve's location on the same court side and attempt number / comparable attempts | Describe repetition of placement patterns | High repetition can be effective targeting or predictability; low repetition can be variety or inconsistency. No direction is inherently better, and the app does not measure whether the receiver anticipated the serve. |

Holds exclude tiebreaks and unfinished games, including an unfinished final game in a manually finalised match. Break points exclude tiebreaks; a no-ad deciding point is a break point too. Manual and Lucky ball points count in both metrics. General Statistics shows Service games won and Break points saved for both players under its independent set selection; Serving summary shows the selected server with the row-specific filters above.

Location repeats counts attempts including faults, excludes manual/Lucky points, and skips those excluded points rather than treating them as observations. The first eligible attempt in each side/attempt chain has no predecessor and is not in the denominator. Chains run within the selected set or through all sets when All sets is selected. Missing location defaults to Body, which can artificially raise repetition.

## Existing Summary Serve Ratios

These remain available in normal stats and Advanced General Statistics. They exclude Lucky balls; manual points with no serves supply no attempt denominator.

| Statistic | Definition | Purpose | Game and match interpretation |
| --- | --- | --- | --- |
| Aces / Double faults | Recorded direct-ending counts, also shown in service-game stroke stats | Show immediate positive/negative service outcomes | Each ace wins a point; each DF loses one. Their raw difference omits return errors, return winners and rallies. |
| 1st serve in | Non-fault first attempts / recorded first attempts | Measure first-serve consistency | More first serves in reduces exposure to the second serve, but a safer first serve may produce weaker outcomes. Higher alone is not sufficient. |
| 1st serve pts won | Server wins after a non-fault first attempt / non-fault first attempts | Measure complete point success behind the first serve | Includes rallies, not only direct serve outcomes. A useful hold-related indicator, but mixes serve quality with return and rally performance. |
| 2nd serve pts won | Server wins after a first fault with a recorded second attempt / those second-serve points, including DF | Measure success when the first serve fails | Low values indicate vulnerability after first faults; reducing DF or improving subsequent play can help. It is not second-serve-in percentage. |

On a consistent recorded sample with complete attempts, overall service-point wins can be decomposed as first-serve-in share times first-serve points-won rate plus second-serve-point share times second-serve points-won rate. This is an explanatory identity, **not a newly displayed statistic**. Missing second attempts can break the assumption that these shares sum to one.

### Existing Service-Game Stroke Rows

The Forehand/backhand table's Service games view also shows **Serve +1 winners**, **Serve advantage**, and **Serve disadvantage**. These reuse the definitions of Serve + 1, Win due to serve, and Lost due to serve respectively, under that table's own set/player/game filters. They are counts, not rates.

Their purpose is to connect serve-associated results with ending-shot execution. Serve advantage's Forehand/Backhand columns count only the server's own ending shots; receiver UEs add to the total only. Serve disadvantage's stroke columns count only receiver winners; server UEs and DF add to the total only. Consequently stroke columns need not sum to the row total. These are not all-shot forehand/backhand success probabilities.

## Connecting Points to Games and Matches

1. **Start with the result:** service games held describes actual game outcomes; break points saved identifies outcomes at immediate break risk. Neither describes return-game strength or tiebreak success.
2. **Explain the point pattern:** compare first/second-serve point results, control frequency and conversion, recovery, and neutralised winning rates. A player can serve many aces yet lose service games through DF and rally losses.
3. **Investigate the tactical pattern:** use location, type, fault mix and repetition with comparable filters. Frequency alone is not effectiveness, and repeated rows must not be counted as separate evidence.
4. **Respect scoring:** the same number of points won or lost can produce different game/set results depending on their sequence and score. A DF at 40-0 and a DF on break point each lose one point, but only the latter immediately loses the game. A match winner need not win the most total points.
5. **Avoid causal or predictive claims:** these logs do not estimate how many extra games a changed serve would win. Opponent strength, surface, score pressure, tactical selection, incomplete logging and subjective states can all explain associations. A high percentage from two points is weak evidence; inspect counts and multiple comparable matches before changing tactics.

No win-probability model, per-stat match-result contribution, benchmark target, confidence interval or cross-match advanced serve dashboard has been implemented. Service-point percentages cannot be converted directly into hold or match-win probabilities without additional modelling assumptions.

## Implementation and Verification

### Serve Location Impact

**Implemented locally 2026-10-17 at the user's request; not deployed.** Two views investigate recorded serve location versus point outcomes: (1) Wide / Body / T horizontal point-win-rate bars, split by first/second serve, with wins/points and a dashed same-sample overall reference; (2) Deuce/Ad service-box heatmaps with the same wins/points by location, separate attempt panels, a common 0-100% percentage scale and an expandable equivalent table. Bars support quick comparison; heatmaps expose court-side differences but create smaller samples. The schematic is the receiver's court viewed from the server: Deuce left, Ad right, T in the centre and Wide at the outside edges.

For either view, the numerator is selected server points won and denominator is eligible recorded service points at that final-attempt location, not all serves or only won points. Overall pools counts, not location percentages. First faults followed by second serves belong only to the second-serve sample; double faults are second-serve losses. Exclude Lucky/manual/missing-serve/post-match points. Existing defaults remain missing-location = Body and missing-type = Flat, with defaulted counts shown so they are not mistaken for explicit observations. Empty cells show unavailable, not 0%. Each view has independent optional Player (default none = both separately), Set, Key points and Serve type selectors; bars additionally filter Court side. Other filters default All; a single set displays its own chip. Tiebreak and match-tiebreak points remain included by default, unlike the regular-game impact chart.

These views describe association, not placement causing wins, reliable coaching targets, or hold/match-win probability. First-serve results condition on a successful first attempt and do not measure target-specific first-fault risk. Recorded zones are categories, not measured landing coordinates. Opponent, serve quality/type, score context, defaults and small samples limit interpretation. Formulas and implementation checks are in [the serve-location design](serve.md#serve-location-and-point-winning-outcomes). Source: `serveLocationImpact` in [matchStats.ts](../src/stats/matchStats.ts) and `ServeLocationImpact` in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx). Tests: [matchStats.test.ts](../src/stats/matchStats.test.ts), [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx), [StatsAnalysis.test.tsx](../src/ui/pages/StatsAnalysis.test.tsx); browser fixtures check filters and responsive output, not real-match effects.

### First Serve Rate Impact

**Implemented locally 2026-10-17; not deployed.** Compare each completed regular service game's first serves in / recorded first attempts with its Held/Broken outcome. Both views use the whole match; each has an independent player toggle, with none selected displaying both players. All tiebreak games and match-tiebreak sets, unfinished games and post-match points are excluded.

| Statistic/view | Definition and purpose | Game/match interpretation and limits |
| --- | --- | --- |
| Game-by-Game Chart | Chronological set/game labels versus first serves in / first attempts, including first faults. Player colours, ticks for Held and crosses for Broken identify server and outcome; selected points and Game details show counts and recording coverage. | Investigates whether broken games coincide with lower first-serve-in rates and exposes counterexamples. Final whole-game rates are retrospective, not live forecasts. Few attempts make each percentage unstable. |
| P75 hold-rate cutoff | For each player, find the lowest observed first-serve-in rate such that eligible games at or above it have held / played at least 75%. Plot a horizontal player-coloured short-dashed line with cutoff and held/played sample. Ties enter together; exact rates, no interpolation. No eligible games or no qualifying cutoff: Not reached, no line. P50 removed at the user's request. | User-confirmed observed hold-rate interpretation, not a percentile, statistical confidence level or predicted win probability. A single game can determine a cutoff; no minimum sample or confidence claim. Cumulative hold rates can be nonmonotonic, so higher cutoffs may not retain the target. Coincident player lines remain separately identified in the summary. Descriptive, not causal or validated coaching targets. |
| Hold Rate by First-Serve Threshold (formerly Band) | Overlapping cumulative groups: below 40%, 40%+, 60%+, 80%+; each cell is held games / eligible games matching that row. '+' includes the exact boundary through 100%; use unrounded rates. Each game has equal weight; empty groups display `-`. | Describes observed association, not a predicted hold probability. Rows overlap and must not be summed. Separate player columns avoid pooling opponent differences. Sparse groups can look extreme by chance. |
| Overall hold rate and sample counts | Held / eligible games for each displayed player, counting each eligible game once, plus eligible/omitted counts. | Reference for cumulative comparisons, not necessarily the same as Serving summary's hold rate because incomplete games are omitted here. |

Game results include all scoring points. Rates exclude Lucky points; games require first-attempt records for every non-Lucky point and at least one eligible attempt. Missing/manual serve records make a game ineligible for plotted rates and bands, but Game details retains the completed game and coverage. Lucky exclusion counts are shown. This conservative completeness policy was selected at implementation, not separately user-confirmed. No final point-score detail, cross-match pooling, numeric correlation coefficient or causal model is implemented. Opponent, second-serve quality, pressure and unequal game lengths can explain associations. See [the serve design](serve.md#first-serve-in-rate-and-service-game-outcome) for history and checks.

Implementation: `firstServeGames`, `completeFirstServeGame`, `firstServeBands`, `firstServeHoldThresholds` in [matchStats.ts](../src/stats/matchStats.ts), and `FirstServeRateImpact` in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx). Tests in [matchStats.test.ts](../src/stats/matchStats.test.ts) and [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx) cover cumulative boundaries, threshold targets, ties, missing/empty samples, fractional cutoffs, chart symbols/lines and both-player defaults. Browser fixtures check interactive toggling and mobile/desktop layout, not real-match impact.

### Existing Implementation

- Calculations: [matchStats.ts](../src/stats/matchStats.ts), especially `summary`, `serveImpact`, `wonDueToServe`, `lostDueToServe`, `strokeStats`, `serveDistribution`, `servePerformance`, `serveImpactStats`, `serveFaults`, `serviceGamesHeld`, `breakPointsSaved`, and `locationRepeats`.
- Display and filters: [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx) and [StatsPage.tsx](../src/ui/pages/StatsPage.tsx). Serve performance is shared with normal match/shared/player stats; the five-part Advanced Analysis is for completed authenticated match views.
- Existing tests: [matchStats.test.ts](../src/stats/matchStats.test.ts), [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx), and [StatsAnalysis.test.tsx](../src/ui/pages/StatsAnalysis.test.tsx). They cover counting units, attribution, exclusions, filters, defaults, unfinished games, repeat chains and the lost-rally display exception.
- Baseline verified on 2026-10-17 before this documentation task: 222 tests across 19 files and app/Worker/migration type checks plus production build passed. This guide adds no runtime behavior and does not validate its coaching interpretations against real match results.
