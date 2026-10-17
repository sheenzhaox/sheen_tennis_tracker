# Momentum Statistics Design

**Status: Proposed (research starting point, 2026-10-17).** Nothing here is agreed, implemented or validated. The factor list summarises published research to guide what this app should measure first; it is not evidence that momentum exists in any recorded match.

## Research Question

Does the outcome of recent points, games or sets change a player's chance of winning the next point, game, set or match, beyond what serve/return and player strength already explain? If so, in which situations and for which players?

## Definitions

- **Psychological momentum (PM):** a perceived positive or negative change in a player's state (confidence, control, energy) after a precipitating event, which may change subsequent performance (Iso-Ahola & Dotson, 2014; Taylor & Demick, 1994).
- **Strategic momentum:** rational changes in effort or tactics caused by the score and incentives, for example easing off with a set lead, or a trailing player raising effort (Malueg & Yates, 2010; Gauriot & Page, 2019; Meier et al., 2020).
- **Statistical dependence ("hot hand"):** point outcomes are not independent and identically distributed (iid). Recorded data can show dependence but cannot by itself separate psychological from strategic causes.

Points in tennis are close to iid. Klaassen & Magnus (2001) found small but significant deviations, and Newton & Aslam (2006) found match-level predictions robust to iid assumptions. Expect small effects that need many points to detect.

## Prioritised Factors

Ranked by evidence strength and by how directly this app can measure them. "Evidence" summarises abstracts only; full papers were not reviewed.

| # | Factor | What research reports | Measurable here? |
| --- | --- | --- | --- |
| 1 | **Serve/return baseline** (control, not a momentum factor) | Serving is the dominant driver of point outcomes. Any "after winning a point" effect must be compared within the same serve/return role, or it mostly measures who served. | Yes: `Point.server`, `Point.winner`. |
| 2 | **Previous point outcome** (point-to-point dependence) | Klaassen & Magnus (2001): winning the previous point has a positive effect on the current point; deviations are small, larger for weaker players. Gauriot & Page (2019): using close line calls as a quasi-experiment, winning a point causally raises the chance of winning the next one for men, not women. O'Donoghue (2009) and Moss & O'Donoghue (2015): no significant point-sequence effect in elite men's singles. | Yes: chronological `seq`, `winner`, `server`. |
| 3 | **Point importance and pressure** | Klaassen & Magnus (2001): servers find it harder to win important points. Cohen-Zada et al. (2017 working paper): men consistently choke under pressure; women's results mixed. González-Díaz et al. (2012) study individual performance on points that matter most (abstract not retrieved). | Yes: score replay gives break points, game points, deuce/30-30, tiebreaks (`PointContext.situations`, `before`). |
| 4 | **Break of serve and the next game** | Moss & O'Donoghue (2015): after breaking serve, players held the next service game more often (100% vs 74%, p < 0.001), and effects differed between players. | Yes: completed games from score replay. |
| 5 | **Set outcome and the next set** | Depken et al. (2021, 2022): first sets fit a rational-strength model; later sets do not, with evidence of both strategic and psychological momentum, including psychological reversal (the previous set winner underperforms) in best-of-five. Dietl & Nesseler (2017): players benefit while controlling the match; after losing control, they are less likely to win the next set ("anti-momentum"). Jackson & Mosurski (1997): heavy defeats may reflect set dependence or simply updated strength estimates. Page & Coates (2017) and Meier et al. (2020) study winner/loser effects between closely matched players (abstracts not retrieved). | Yes, but few sets per match; needs pooling across matches. |
| 6 | **Runs and streaks** (consecutive points or games) | O'Donoghue (2009): runs of service points no longer than chance. Miller & Sanjurjo (2018): conditioning on a streak in a finite sequence is biased toward finding no effect; correcting it reversed classic "hot hand fallacy" conclusions. | Yes; requires a bias-aware baseline (see Cautions). |
| 7 | **Early-set games and score state** | Richardson et al. (1988): winning early games of the first or second set predicted match success; in close matches specific games mattered more. They caution that this depends on how evenly matched the players are and does not prove PM. | Yes: game index within set. |
| 8 | **Negative shocks** (double faults, unforced errors) | Lackner & Weichselbaumer (2023): treating double faults as exogenous setbacks, men did not react to near setbacks, while women performed worse afterwards; effects varied by experience, ability and score. | Partly: `end === 'double_fault'`, rally UEs; missing for unrecorded points. |
| 9 | **Player strength and matchup** (confounder and moderator) | Weaker players showed stronger dependence (Klaassen & Magnus, 2001). Iso-Ahola (2024) proposes that skilled players create momentum more often, sustain it longer and recover faster. A stronger player naturally wins more streaks without any momentum. | Partly: no rating field; use the player's own baseline rates within the match. |
| 10 | **Individual and gender differences** | Effects differ between players (Moss & O'Donoghue, 2015) and by gender in several studies (Gauriot & Page, 2019; Lackner & Weichselbaumer, 2023; Iso-Ahola & Dotson, 2014, tentative). | Per-player in Player Stats; gender is not a recorded field. |
| 11 | **Breaks in play** (changeovers, time-outs) | Den Hartigh & Gernigon (2018, table tennis, analogous only): positive PM builds gradually, negative PM drops quickly; a time-out did not significantly help recovery. | No: save timestamps are not play time. |

**Recommended starting set:** factors 1-5, because they need only point winner, server and score context, which every point (including unrecorded/manual points) supplies.

## Data Mapping

| Need | Source | Coverage |
| --- | --- | --- |
| Point order | `Point.seq` within a match | All live points |
| Point winner / server | `Point.winner`, `Point.server` | All live points, including `end: 'unrecorded'` and Lucky balls |
| Score context, key points, game/set boundaries, tiebreaks | `pointContexts()` replay in [matchStats.ts](../src/stats/matchStats.ts) using match rules and first server | Derived for all points |
| Service-game holds/breaks | Existing `serviceGamesHeld` replay logic | Completed regular games only |
| Double fault, ace, return outcome | `Point.end` | Missing for unrecorded points |
| Winner / UE attribution | `pointOutcome()`, `rally.ending` | Missing for unrecorded points |
| Serve/return control | `rally.impact` | Optional; missing on older and many points |
| Fatigue, emotion, body language, real elapsed time, opponent rating, gender | Not recorded | Not available; do not infer |

## Candidate First Metrics (Proposed)

All metrics are per player, per match, with optional pooling across completed matches in Player Stats (pool counts, not percentages). Population: the live points the score engine replays. Show numerator/denominator and `-` for zero denominators.

### M1. Point win rate after winning vs losing the previous point

For player $X$ in role $r \in \{\text{serve}, \text{return}\}$, over points $t \geq 2$ in the match:

$$
P_r(W \mid W_{-1}) = \frac{\#\{t : \text{role}_t = r,\ w_t = X,\ w_{t-1} = X\}}{\#\{t : \text{role}_t = r,\ w_{t-1} = X\}}
\qquad
P_r(W \mid L_{-1}) = \frac{\#\{t : \text{role}_t = r,\ w_t = X,\ w_{t-1} \neq X\}}{\#\{t : \text{role}_t = r,\ w_{t-1} \neq X\}}
$$

Report the difference $\Delta_r = P_r(W \mid W_{-1}) - P_r(W \mid L_{-1})$. Open question: whether the previous point may cross a game, set or changeover boundary (proposed: allow it, and also report a within-game-only variant).

### M2. Hold after break and break-back rate

- Hold after break = service games held immediately after the player broke serve / such service games.
- Compare with the player's overall hold rate in the same match or pool.
- Break-back rate = return games won immediately after being broken / such return games.

### M3. Key-point performance relative to baseline

Serve-point win rate on break points faced, game points and deuce/30-30, compared with the same player's serve-point win rate on all other serve points; equivalently for return points. Break points saved already exists in General Statistics and supplies one numerator/denominator.

### M4. Next-set outcome

Next-set win rate after winning vs losing the previous set, split by whether the previous set went to a tiebreak. Usable mainly in pooled Player Stats.

### M5. Point win rate after a negative shock

Next-point win rate after the player double-faults, or after their unforced error, compared with their rate after other lost points in the same role. Excludes points whose previous point is unrecorded.

### M6. Runs compared with chance

Longest point run and number of runs per player, compared with a permutation baseline: shuffle point outcomes within the same server and match many times, and report where the observed value falls. The same baseline also corrects the streak-selection bias in M1.

## Match Control Score (User Heuristic)

**Proposed by the user 2026-10-17; rules agreed (revisions 1 and 2) the same day; implemented locally in Advanced Analysis 2026-10-17 (see [Implementation](#implementation-2026-10-17)); not validated.** A per-player running score of observed control. It is a coaching heuristic: weights are judgement-based, not estimated effects, and the score does not predict win probability.

### Original Proposal (2026-10-17)

Preserved as first written; superseded by the agreed rules below.

| Layer | Event | Points |
| --- | --- | --- |
| Basic point | Point won with own winner | +1 |
| | Point lost with own UE | -1 |
| | Point lost to opponent winner | 0 |
| Game | Win a game before the set key game (first 8 games of a 6-game set; first 3 games of a 4-game set) | +1 |
| | Hold after the key game starts | +2 |
| | Break after the key game starts | +3 |
| | Broken before the key game | -2 |
| | Broken after the key game starts | -3 |
| Continuity | Each consecutive winner after the first | +1 extra |
| | First consecutive UE (second UE in a row) | -1 extra |
| | Further consecutive UEs | -2 extra (that point totals -3) |
| Key points (30-all, deuce, break point, first point of the set) | Winner | +1 extra |
| | UE | -1 extra |
| Long deuce (4+ deuces) | Win the game | +3 |
| | Lose the game | -3 |
| Set | Win | +3 |
| | Lose | +3 as written |
| Break back | Broken in own previous service game, then break back immediately | +3 |

### Review Outcome

The review found it reasonable as a coaching heuristic: it combines shot quality with the score moments research links to momentum, and the growing UE-streak penalty fits evidence that negative momentum builds faster than positive (Den Hartigh & Gernigon, 2018, analogous). The user accepted these revisions:

1. Set loss is -3 (sign corrected).
2. Key stage is derived from `Rules.gamesPerSet` ($N$): it starts at game $2N-3$ of the set (6-game set: game 9; 4-game set: game 5, revising the original "after 3 games").
3. Tiebreak and no-ad cases need explicit rules (defaults below).
4. Before the key stage, a break is worth more than a hold.
5. Points won through opponent UEs, and lost to opponent winners, score 0 at point level, so the point layer measures own shot quality rather than point outcome. The score is not zero-sum: report each player's score and the difference A − B.
6. Continuity is defined by the user's examples below.
7. At most one key-point bonus per point; game, set and match points added.
8. All layers stack.
9. Keep the process layer separate from the outcome layer, because game/set outcomes would otherwise make any link with results circular.
10. Show a point-by-point A − B curve; a rolling window is an option.
11. Report recording coverage beside the score.

Agreed additions: break consolidation, heavier double faults, resilience bonus and adjustable weights. The Serve Impact State suggestion was not adopted.

### Agreed Rules (Revision 1)

All values are default weights and must be adjustable.

**Process layer (point level)**

| Event for player X | Points |
| --- | --- |
| Own winner (rally winner, ace, return winner) | +1 |
| Own UE (rally UE, return error) | -1 |
| Own double fault | -2 (replaces -1; still a UE for continuity and key points) |
| Point won through opponent UE, or lost to opponent winner | 0 |
| Consecutive own winner (see Continuity) | +1 extra each |
| Second UE in a UE run | -1 extra |
| Third and later UE in a UE run | -2 extra each |
| Own winner on a key point | +1 extra |
| Own UE on a key point | -1 extra |

**Outcome layer (game, set and transition level)**

| Event for player X | Points |
| --- | --- |
| Hold before the key stage | +1 |
| Break before the key stage | +2 |
| Broken before the key stage | -2 |
| Hold from the key stage | +2 |
| Break from the key stage | +3 |
| Broken from the key stage | -3 |
| Losing a return game (no break) | 0 |
| Long deuce game (4 or more deuces) won / lost | +3 / -3 |
| Break back: broken in own previous service game, then break the opponent's next service game | +3 |
| Consolidation: hold the service game immediately after breaking | +2 |
| Broken straight back: broken in the service game immediately after breaking | -2 |
| Resilience: in a held service game, each break point saved beyond the first | +1 each |
| Set won / lost | +3 / -3 |

Everything stacks. Example: breaking back from the key stage in a long deuce game earns +3 (break) +3 (long deuce) +3 (break back) = +9, while the opponent gets -3 (broken from key stage) -3 (long deuce) -2 (broken straight back) = -8.

Resilience covers both ideas agreed by the user: holding from 15-40 saves at least 2 break points (+1), and from 0-40 at least 3 (+2); repeated Ad-out saves also count.

**Continuity (user-defined 2026-10-17)**

Agreed examples, points for one player:

| Sequence (player's view) | Points | Continuous? |
| --- | --- | --- |
| winner, winner, winner | 1, 2, 2 | Yes |
| winner, opponent UE, winner | 1, 0, 2 | Yes |
| winner, own UE, winner | 1, -1, 1 | No |
| winner, opponent winner, winner | 1, 0, 1 | No |
| UE, UE, UE | -1, -2, -3 | Yes |
| UE, opponent winner, UE | -1, 0, -2 | Yes |
| UE, opponent UE, UE | -1, 0, -1 | No (confirmed revision 2) |

Generalised rule: a **winner run** continues through every point the player wins and breaks on any point the player loses; a **UE run** continues through every point the player loses and breaks on any point the player wins. Runs carry across games but reset at the start of each set.

Points without the player's own winner or UE affect runs only through the point winner (agreed revision 2):

- Lucky ball winner: the beneficiary scores 0, but the point keeps their winner run and breaks their UE run; for the opponent it is a point lost, so it breaks their winner run and keeps their UE run.
- Unrecorded point: treated the same way, by its winner.

**Key points**

30-all, deuce (including the no-ad deciding point), break point, game point at 40-30 or Ad-in, set point, match point and every tiebreak point. One bonus at most per point, however many categories apply.

- Easy game points (40-0, 40-15) are not key points (revision 2), unless they are also a set or match point.
- First point of the set was dropped (revision 2) because research does not support it; Richardson et al. (1988) concern early games, not the first point.

**Tiebreak and no-ad rules (agreed revision 2)**

- A tiebreak (including a match tiebreak) scores won +3 / lost -3 in the outcome layer instead of hold/break; break back, consolidation, resilience and long deuce do not apply.
- A match tiebreak also counts as a set (±3).
- No-ad games cannot reach a long deuce.

### Set Start Score (S4 Agreed Revision 2)

**Agreed: S4 closing-form carry.** Each set's curve restarts; runs reset. For player X and opponent Y entering set $k+1$:

$$
\text{start}_X = \begin{cases} +3 & X \text{ won set } k \\ -3 & X \text{ lost set } k \end{cases} + \operatorname{clamp}\left(\tfrac{1}{2}(F_X - F_Y),\ -3,\ +3\right)
$$

where $F$ is the score each player earned (both layers, excluding the set bonus) in the last 3 completed games of set $k$, counting a tiebreak as one game. $\text{start}_Y = -\text{start}_X$, so the starting A − B difference lies between -12 and +12. Half points are kept, not rounded. Example: X wins set 1 but Y outscored X by 6 over its last 3 games, so X starts set 2 on $+3 - 3 = 0$ and Y on 0.

Options considered (user request 2026-10-17):

| Option | Starting score for set $k+1$ | Strength | Weakness |
| --- | --- | --- | --- |
| S1 Full carry | Previous running total | Simplest | Grows with match length; an early lead dominates later sets |
| S2 Result carry | Winner +3, loser -3 (equal to the set bonus); everything else resets | Transparent, bounded, keeps sets comparable | Ignores how close or dominant the set was |
| S3 Margin carry | Dominant set (loser 0-2 games) ±4; normal ±3; close set (7-5 or tiebreak) ±2 | Reflects strength shown in the set | Margin mostly measures strength, not momentum (Jackson & Mosurski, 1997) |
| S4 Closing-form carry | S2 plus half of the A − B score over the last 3 games of the set, capped at ±3 | A player who loses the set but wins its last games starts with credit, matching the "controlling the match" idea (Dietl & Nesseler, 2017) | More complex; last-3-games sample is small |
| S5 Decayed carry | 50% of the previous end total, capped | Smooth transition | Weight has no evidence base |

Original recommendation was S2 as the default with S4 as a comparison series; the user chose S4 directly. Weights (3, one half, cap 3, 3 games) remain adjustable. Research shows set-to-set effects are mixed, including reversals where the previous set winner underperforms (Depken et al., 2021), so the carry should stay small. Tune it against perceived turning points in recorded matches.

### Presentation and Missing Data (Agreed Principles)

- Show each player's score, the A − B difference as a point-by-point curve, and process-layer and outcome-layer totals separately; a rolling window (for example, the last 3 games) is optional.
- Points without a recorded ending (`end: 'unrecorded'`) add 0 at point level; report the recorded-point coverage beside the score.
- Lucky ball winners score 0 at point level; their effect on runs follows the point winner (agreed revision 2).
- Unfinished final games and sets earn no game or set points.

### Placement and Weights (Agreed 2026-10-17)

- Advanced Analysis only, for a single match. Not added to Player Stats.
- Weight editing is on hold; implement with fixed default weights first.
- Chart (user request 2026-10-17): draw each set as a separate segment starting at its set start score; do not connect the last point of one set to the first point of the next. Shade the background alternately white and light grey by game, labelled at the top with the game score before the game; in a match tiebreak, mark and label the score every 6 points.
- Chart per player (user request 2026-10-17): plot the selected player's score minus the opponent's; title "Match Control Score {player} (vs {opponent})"; y-axis title "Match Control Score".

### Turning Points (Proposed 2026-10-17)

User request: mark key turning points within each set. Trial rule (zigzag), applied to the A − B curve separately in each set, starting from the set start score:

- A **peak** is the highest value of a rise that is followed by a fall of at least R points before the curve sets a new high; a **trough** is the mirror case. R = 10 in Trial 1.
- The last unconfirmed move of the set is not marked; the set start can be followed by a trough or peak only after a confirmed reversal.
- Label each marker with the score before that point, its A − B value, and the swing to the next turning point or the end of the set.

Limitations: R is a fixed, untuned threshold in score points, so it depends on the weights and on set length (short tiebreaks rarely reach it); an early dip (for example, Set 1 at 0-0 0-15) can be marked even if trivial in tennis terms. A turning point is a change in the score's direction, not evidence that momentum changed. Alternatives to compare: R as a share of the set's range, or game-level pivots instead of point-level.

**Segment drivers (user request 2026-10-17; proposed).** Split each set at its turning points (set start → first turning point → … → set end) and attribute the segment's change in the plotted difference (player minus opponent) exactly to:

- the player's winners and errors (errors include double faults), and the opponent's winners and errors (sign flipped);
- each including its streak extra and key-point bonus, with the streak part shown separately;
- game outcomes (holds, breaks and their bonuses, or tiebreak result) for games whose last point falls in the segment;
- the set bonus.

The parts sum to the segment change. Display (user revision 2026-10-17):

- Show only segments that span more than one game; a segment inside a single game is not shown (no bar, no row). In a tiebreak, which is one game, 6-point blocks count as games.
- Mark each shown segment with a numbered green (rise) or red (fall) bar under the axis.
- A short table lists, per shown segment, the change and only the biggest factor in the direction of the change (for example, "Talia Yang errors (14) +33"). The full breakdown is not shown to users.

This is an arithmetic breakdown of the score, not a causal explanation.

### Implementation (2026-10-17)

**Implemented locally (user request 2026-10-17); not committed or deployed; not validated.** Advanced Analysis section 7, renamed from Other Key Factors Statistics to **Momentum Impact (Match Control Score)**, shows the agreed rules (revision 2) with fixed default weights, the chart and turning points (R = 10) and segment display described above.

- A required player selector (two buttons; exactly one always selected, default Player A) chooses the plotted player − opponent view.
- Score context comes from the app's score replay (`pointContexts`), not the CSV labels. Game and set ends are detected from the replayed score, so unfinished final games and sets earn no outcome points; points after the match is decided are ignored.
- The table lists #, Set, From → to, Change and Biggest factor; notes show recorded-ending coverage and that the score is not causal or a win probability. Process/outcome totals and a rolling window are not shown yet.
- Verification: unit tests in [momentum.test.ts](../src/stats/momentum.test.ts); render tests in [StatsPage.test.tsx](../src/ui/pages/StatsPage.test.tsx) and [StatsAnalysis.test.tsx](../src/ui/pages/StatsAnalysis.test.tsx). A temporary test parsed the Trial 1 CSV into points and reproduced the trial exactly (set ends +63, −20, −19; starts 0, +12, −12; all 8 segments and biggest factors). Browser check of a real match was not possible because the local preview was logged out.
- Code: [momentum.ts](../src/stats/momentum.ts), `MomentumImpact` in [AdvancedAnalysisPage.tsx](../src/ui/pages/AdvancedAnalysisPage.tsx).

### Trial 1: Sample Match Log (2026-10-17)

**Trial, not validation.** A standalone script (`tmp/momentum_trial.mjs`, untracked) applied the agreed rules to the exported CSV of match `30d1c896` (Ellie Zhao A vs Talia Yang B: 6-1, 4-6, match tiebreak 10-12; best of 3, 6-game sets). Score context came from the CSV's "Score before" column, not the app's score engine. Game 1 was hand-checked (A +4, B -3).

- Coverage: 132 of 137 points (96.4%) have a recorded ending; 2 Lucky ball winners; the last two match-tiebreak points are unrecorded.
- Own endings: A 20 winners / 43 UEs (including double faults); B 19 winners / 48 UEs.

| Set | Start A / B | End A / B | End A − B | Process A / B | Outcome A / B (incl. set bonus) |
| --- | --- | --- | --- | --- | --- |
| 1 (A 6-1) | 0 / 0 | 8 / -55 | +63 | -10 / -46 | +18 / -9 |
| 2 (B 6-4) | 6 / -6 | -26 / -6 | -20 | -31 / -13 | -1 / +13 |
| 3 (MTB, B) | -6 / 6 | -19 / 0 | -19 | -7 / -12 | -6 / +6 |

Observations:

1. The A − B curve follows the match story. Set 1 climbs steadily to +63. In set 2 it peaked at +30 after A held for 3-1, fell to +14 when B broke back to 3-3 and to +2 when B held for 3-4, recovered to +8 when A held for 4-4, then turned negative (-3) when B held for 4-5; B broke to win the set (-20). The drops coincided with the scoreboard rather than preceding it, and one match cannot validate the score.
2. The within-set total lags: at 4-4 in set 2 the curve still favoured A (+8), carried by A's strong start, although B had won 3 of the last 4 games. A rolling window (for example, the last 3 games) would show the shift earlier.
3. Unforced errors dominate. Both players' own scores are mostly negative, so a single player's score mainly reflects error volume; A − B is the readable measure.
4. The process layer outweighs the outcome layer (for example, set 1 process -46 vs outcome -9 for B).
5. Long-deuce games with UE runs create very large single-game swings: set 1 game 2 (5 deuces, A breaks) moved A − B by +19.
6. The S4 cap bound at both set transitions: the closing-form term was +12 and -8 before capping at ±3, so starts were effectively ±6. With these weights the cap, not the form, sets the start.

Possible adjustments raised by the trial (not agreed): show A − B as the main curve, with an optional last-3-games rolling line; cap the UE streak extra per game or per run; revisit the S4 half weight and ±3 cap.

Turning points (R = 10; score before the point; A − B value → following swing):

| Set | Peak / trough | Score | A − B | Swing after |
| --- | --- | --- | --- | --- |
| 1 | Trough | 0-0 0-15 | -2 | +47 |
| 1 | Peak | 3-0 15-0 | 45 | -12 |
| 1 | Trough | 3-0 30-40 | 33 | +30 (to set end) |
| 2 | Peak | 1-0 0-0 | 21 | -13 |
| 2 | Trough | 1-1 15-15 | 8 | +23 |
| 2 | Peak | 3-1 0-0 | 31 | -51 (to set end) |
| MTB | Trough | 1-1 | -14 | +16 |
| MTB | Peak | 6-3 | 2 | -21 (to end) |

The two final peaks (set 2 at 3-1 and the match tiebreak at 6-3) match the match's decisive turnarounds: A led in both and lost both.

Biggest factor per shown segment (Ellie's view, A − B; single-game segments 0-0 start → 0-0 0-15, 3-0 15-0 → 3-0 30-40 and MTB start → 1-1 are hidden):

| # | Segment | Change | Biggest factor |
| --- | --- | --- | --- |
| 1 | Set 1, 0-0 0-15 → 3-0 15-0 | +47 | Talia errors (14) +33 |
| 2 | Set 1, 3-0 30-40 → set end | +30 | Talia errors (8) +17 |
| 3 | Set 2, start → 1-0 0-0 | +9 | Talia errors (3) +5 |
| 4 | Set 2, 1-0 0-0 → 1-1 15-15 | -13 | Talia 1 break (break back) -9 |
| 5 | Set 2, 1-1 15-15 → 3-1 0-0 | +23 | Ellie 1 hold, 1 break +12 |
| 6 | Set 2, 3-1 0-0 → set end | -51 | Ellie errors (19) -40 |
| 7 | MTB, 1-1 → 6-3 | +16 | Talia errors (5) +16 |
| 8 | MTB, 6-3 → end | -21 | Ellie errors (4) -9 |

In this match, swings were mostly driven by error runs (one player's errors in a short stretch), not by winners.

### Open Questions

- Resolved in revision 2: UE-run break rule, tiebreak/no-ad rules, Lucky ball handling, set start (S4), easy game points and first point of the set.
- Whether to adopt any of the Trial 1 adjustments before implementation.
- Turning-point threshold: fixed R = 10, R relative to the set's range, or game-level pivots.

## Cautions

- **Small samples:** one match has roughly 100-200 points; M1 cells per role may hold only 20-60 points. Single-match differences of 10-20 percentage points can be noise. Show $n$, and prefer pooled Player Stats.
- **Serve and strength confounding:** always split by serve/return; compare a player with their own baseline, not with 50%.
- **Streak-selection bias:** within finite sequences, naive conditional rates are biased (Miller & Sanjurjo, 2018). Use the permutation baseline before calling any effect "hot hand".
- **Endogenous events:** breaks and set wins are not random; a stronger player both breaks more and holds more. Higher hold-after-break rates do not prove PM (Richardson et al., 1988; Jackson & Mosurski, 1997).
- **Recreational and junior players** may differ from the professional samples in most studies; effects found there are hypotheses, not expectations, for this app's users.
- **No causal or win-probability claims** until a design (for example, quasi-random events) and enough data justify them.

## Missing-Data Rules (Proposed)

- M1-M4 and M6 use only `winner`, `server`, `seq` and score replay, so unrecorded/manual and Lucky ball points are included; do not apply the Summary's Lucky ball exclusion here, because those points changed the score.
- M5 requires a recorded previous-point ending; unrecorded previous points are excluded from both comparison groups and reported as excluded.
- Unfinished final games and sets are excluded from game- and set-level metrics.
- Tiebreak points are included in point-level metrics and can be filtered; tiebreak games are not service games for M2.

## Open Questions

- Which metrics to implement first, and whether in Advanced Analysis (single match), Player Stats (pooled) or both.
- Previous-point boundary rule for M1.
- Minimum sample before a metric displays, or show all with $n$.
- Whether to add any recording field (for example, a changeover/medical break marker) for later factors.

## References

Verified via Crossref/OpenAlex metadata; findings above come from abstracts where noted.

- Cohen-Zada, D., Krumer, A., Rosenboim, M. & Shapir, O. (2017). Choking under pressure and gender: Evidence from professional tennis. IZA DP 10587. https://docs.iza.org/dp10587.pdf
- Den Hartigh, R. J. R. & Gernigon, C. (2018). Time-out! How psychological momentum builds up and breaks down in table tennis. *Journal of Sports Sciences*, 36(23). https://doi.org/10.1080/02640414.2018.1477419
- Depken, C. A., Gandar, J. M. & Shapiro, D. A. (2021). Set-level strategic and psychological momentum in best-of-five matches in professional tennis. *Applied Economics Letters*. https://doi.org/10.1080/13504851.2021.2016582
- Depken, C. A., Gandar, J. M. & Shapiro, D. A. (2022). Set-level strategic and psychological momentum in best-of-three-set professional tennis matches. *Journal of Sports Economics*. https://doi.org/10.1177/15270025221085715
- Dietl, H. & Nesseler, C. (2017). Momentum in tennis: Controlling the match. *International Journal of Sport Psychology*, 48(4), 459. Working paper: https://doi.org/10.5167/uzh-174238
- Gauriot, R. & Page, L. (2019). Does success breed success? A quasi-experiment on strategic momentum in dynamic contests. *The Economic Journal*, 129(624), 3107. https://doi.org/10.1093/ej/uez040 (co-author not re-verified)
- González-Díaz, J., Gossner, O. & Rogers, B. W. (2012). Performing best when it matters most: Evidence from professional tennis. *Journal of Economic Behavior & Organization*. https://doi.org/10.1016/j.jebo.2012.09.021
- Iso-Ahola, S. E. (2024). A theory of the skill-performance relationship. *Frontiers in Psychology*. https://doi.org/10.3389/fpsyg.2024.1296014
- Iso-Ahola, S. E. & Dotson, C. O. (2014). Psychological momentum: Why success breeds success. *Review of General Psychology*, 18. https://doi.org/10.1037/a0036406
- Jackson, D. & Mosurski, K. (1997). Heavy defeats in tennis: Psychological momentum or random effect? *CHANCE*, 10(2), 27-34. https://doi.org/10.1080/09332480.1997.10542019
- Klaassen, F. J. G. M. & Magnus, J. R. (2001). Are points in tennis independent and identically distributed? Evidence from a dynamic binary panel data model. *Journal of the American Statistical Association*. https://doi.org/10.1198/016214501753168217
- Lackner, M. & Weichselbaumer, M. (2023). Can barely winning lead to losing? Gender and past performance. *Journal of Economic Behavior & Organization*. https://doi.org/10.1016/j.jebo.2023.02.018
- Malueg, D. A. & Yates, A. J. (2010). Testing contest theory: Evidence from best-of-three tennis matches. *Review of Economics and Statistics*, 92(3), 689. https://doi.org/10.1162/REST_a_00021 (co-author not re-verified)
- Meier, P., Flepp, R., Ruedisser, M. & Franck, E. (2020). Separating psychological momentum from strategic momentum: Evidence from men's professional tennis. *Journal of Economic Psychology*, 78, 102269. https://doi.org/10.1016/j.joep.2020.102269
- Miller, J. B. & Sanjurjo, A. (2018). Surprised by the hot hand fallacy? A truth in the law of small numbers. *Econometrica*, 86(6), 2019-2047. https://doi.org/10.3982/ECTA14943
- Moss, B. & O'Donoghue, P. (2015). Momentum in US Open men's singles tennis. *International Journal of Performance Analysis in Sport*. https://doi.org/10.1080/24748668.2015.11868838
- Newton, P. K. & Aslam, K. (2006). Monte Carlo tennis. *SIAM Review*. https://doi.org/10.1137/050640278 (author names not re-verified)
- O'Donoghue, P. (2009). Sequences of service points and the misperception of momentum in elite tennis. *International Journal of Performance Analysis in Sport*, 9(1), 113. https://doi.org/10.1080/24748668.2009.11868468
- Page, L. & Coates, J. (2017). Winner and loser effects in human competitions: Evidence from equally matched tennis players. *Evolution and Human Behavior*, 38, 530. https://doi.org/10.1016/j.evolhumbehav.2017.02.003 (co-author not re-verified; abstract not retrieved)
- Richardson, P. A., Adler, W. P. & Hankes, D. M. (1988). Game, set, match: Psychological momentum in tennis. *The Sport Psychologist*, 2(1), 69. https://doi.org/10.1123/tsp.2.1.69
- Silva, J. M., Hardy, C. J. & Crace, R. K. (1988). Analysis of psychological momentum in intercollegiate tennis. *Journal of Sport and Exercise Psychology*, 10(3), 346. https://doi.org/10.1123/jsep.10.3.346 (early empirical study; abstract not retrieved)
- Taylor, J. & Demick, A. (1994). A multidimensional model of momentum in sports. *Journal of Applied Sport Psychology*, 6, 51. https://doi.org/10.1080/10413209408406465 (co-author not re-verified)

Low-quality 2024-2025 modelling-competition papers on tennis momentum were found but are not used as evidence.
