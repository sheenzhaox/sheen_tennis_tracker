// Trial of the agreed Match Control Score (advanced_statistics/momentum.md) on an exported point log.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const GAMES_PER_SET = 6;
const SETS_TO_WIN = 2;
const KEY_GAME = 2 * GAMES_PER_SET - 3;

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const [header, ...data] = parseCsv(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const col = (name) => header.indexOf(name);
const nameA = data[0][col('Player A')], nameB = data[0][col('Player B')];
const side = (n) => (n === nameA ? 'A' : n === nameB ? 'B' : null);
const other = (s) => (s === 'A' ? 'B' : 'A');
const PTS = { '0': 0, '15': 1, '30': 2, '40': 3, AD: 4 };

const points = data.map((r) => {
  const parts = r[col('Score before (A-B)')].split(' · ');
  const last = parts[parts.length - 1];
  const tb = /^(MTB|TB) /.test(last);
  const completed = parts.slice(0, tb && last.startsWith('MTB') ? -1 : -2);
  const games = tb && last.startsWith('MTB') ? null : parts[parts.length - 2].split('-').map(Number);
  const [pa, pb] = last.replace(/^(MTB|TB) /, '').split('-');
  const setsWon = { A: 0, B: 0 };
  for (const s of completed) { const [a, b] = s.split('-').map(Number); setsWon[a > b ? 'A' : 'B']++; }
  const server = side(r[col('Server')]);
  const winner = side(r[col('Winner')]);
  const ending = r[col('Ending')];
  const rally = r[col('Rally')] ?? '';
  let event = null; // { by, type: W | U | DF | L }
  if (ending === 'Ace') event = { by: server, type: 'W' };
  else if (ending === 'Return Ace') event = { by: other(server), type: 'W' };
  else if (ending === 'Return error') event = { by: other(server), type: 'U' };
  else if (ending === 'Double fault') event = { by: server, type: 'DF' };
  else if (ending === 'Rally') {
    const m = rally.match(/(.+?) (unforced error|winner & forced error)/);
    const by = side(m[1].replace(/^Rally \d+, /, ''));
    event = { by, type: m[2] === 'unforced error' ? 'U' : rally.includes('Lucky ball') ? 'L' : 'W' };
  }
  return {
    n: Number(r[col('Point')]), label: r[col('Score before (A-B)')], ending, server, winner, event,
    set: completed.length, tb, mtb: last.startsWith('MTB'), games, setsWon,
    pa: tb ? Number(pa) : PTS[pa], pb: tb ? Number(pb) : PTS[pb],
  };
});

function keyPoint(p) {
  if (p.tb) return true;
  const s = p.server === 'A' ? p.pa : p.pb, r = p.server === 'A' ? p.pb : p.pa;
  const bp = r === 4 || (r === 3 && s < 3);
  const gameFor = s === 4 || (s === 3 && r < 3) ? p.server : bp ? other(p.server) : null;
  let setPoint = false;
  if (gameFor) {
    const g = { A: p.games[0], B: p.games[1] };
    setPoint = g[gameFor] + 1 >= GAMES_PER_SET && g[gameFor] + 1 - g[other(gameFor)] >= 2;
  }
  return (s === 2 && r === 2) || (s === 3 && r === 3) || bp || s === 4 || (s === 3 && r === 2) || setPoint;
}

// Group consecutive points into games.
const games = [];
for (const p of points) {
  const key = `${p.set}|${p.tb ? 'TB' : p.games.join('-')}`;
  if (!games.length || games[games.length - 1].key !== key) games.push({ key, set: p.set, tb: p.tb, mtb: p.mtb, games: p.games, server: p.server, points: [] });
  games[games.length - 1].points.push(p);
}

const rows = [];
const gameRows = [];
const setRows = [];
const total = { A: 0, B: 0 };
let run, prevGame, setProcess, setOutcome, lastGames;
const resetSet = () => { run = { A: { type: null, n: 0 }, B: { type: null, n: 0 } }; prevGame = null; setProcess = { A: 0, B: 0 }; setOutcome = { A: 0, B: 0 }; lastGames = []; parts = { A: { W: 0, U: 0, base: 0, extra: 0, key: 0 }, B: { W: 0, U: 0, base: 0, extra: 0, key: 0 } }; };
let parts;
resetSet();

function pointDelta(p, X) {
  const r = run[X];
  const own = p.event && p.event.by === X && p.event.type !== 'L' ? p.event.type : null;
  let base = 0, extra = 0, key = 0;
  const isKey = keyPoint(p);
  if (own === 'W') {
    base = 1;
    if (r.type === 'W') extra = 1;
    run[X] = { type: 'W', n: r.type === 'W' ? r.n + 1 : 1 };
    if (isKey) key = 1;
  } else if (own === 'U' || own === 'DF') {
    base = own === 'DF' ? -2 : -1;
    const n = r.type === 'U' ? r.n + 1 : 1;
    if (n === 2) extra = -1; else if (n > 2) extra = -2;
    run[X] = { type: 'U', n };
    if (isKey) key = -1;
  } else if (p.winner === X ? r.type === 'U' : r.type === 'W') {
    run[X] = { type: null, n: 0 };
  }
  return { base, extra, key, d: base + extra + key, isKey };
}

for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi];
  const gameDelta = { A: 0, B: 0 };
  for (const p of g.points) {
    const dA = pointDelta(p, 'A'), dB = pointDelta(p, 'B');
    for (const [X, d] of [['A', dA], ['B', dB]]) {
      total[X] += d.d; gameDelta[X] += d.d; setProcess[X] += d.d;
      const q = parts[X]; q.base += d.base; q.extra += d.extra; q.key += d.key;
      if (d.base > 0) q.W++; if (d.base < 0) q.U++;
    }
    rows.push({ p, dA, dB, A: total.A, B: total.B });
  }
  const gw = g.points[g.points.length - 1].winner;
  const gl = other(gw);
  const out = { A: 0, B: 0 };
  const notes = [];
  let broken = false;
  if (g.tb) {
    out[gw] += 3; out[gl] -= 3; notes.push(`${g.mtb ? 'Match tiebreak' : 'Tiebreak'} won by ${gw}`);
  } else {
    const S = g.server, R = other(S);
    const keyStage = g.games[0] + g.games[1] + 1 >= KEY_GAME;
    broken = gw === R;
    if (broken) { out[R] += keyStage ? 3 : 2; out[S] -= keyStage ? 3 : 2; notes.push(`${R} breaks${keyStage ? ' (key stage)' : ''}`); }
    else { out[S] += keyStage ? 2 : 1; notes.push(`${S} holds${keyStage ? ' (key stage)' : ''}`); }
    const deuces = g.points.filter((p) => p.pa === 3 && p.pb === 3).length;
    if (deuces >= 4) { out[gw] += 3; out[gl] -= 3; notes.push(`long deuce x${deuces}`); }
    if (prevGame && prevGame.server === R && prevGame.broken && broken) { out[R] += 3; notes.push(`${R} breaks back`); }
    if (prevGame && prevGame.server === R && prevGame.broken) {
      if (broken) { out[S] -= 2; notes.push(`${S} broken straight back`); }
      else { out[S] += 2; notes.push(`${S} consolidates`); }
    }
    if (!broken) {
      const saved = g.points.filter((p) => p.winner === S && keyPointIsBp(p)).length;
      if (saved > 1) { out[S] += saved - 1; notes.push(`${S} saves ${saved} BPs`); }
    }
  }
  for (const X of ['A', 'B']) { total[X] += out[X]; gameDelta[X] += out[X]; setOutcome[X] += out[X]; }
  lastGames.push(gameDelta);
  prevGame = { server: g.server, broken };
  const setEnd = gi === games.length - 1 || games[gi + 1].set !== g.set;
  if (setEnd) {
    total[gw] += 3; total[gl] -= 3; setOutcome[gw] += 3; setOutcome[gl] -= 3;
    notes.push(`set won by ${gw}`);
  }
  Object.assign(rows[rows.length - 1], { A: total.A, B: total.B, game: { winner: gw, server: g.server, tb: g.tb, out: { ...out }, setWinner: setEnd ? gw : null } });
  gameRows.push({ set: g.set + 1, game: g.tb ? (g.mtb ? 'MTB' : 'TB') : `${g.games[0]}-${g.games[1]}`, server: g.server, notes, dA: gameDelta.A + (setEnd ? (gw === 'A' ? 3 : -3) : 0), dB: gameDelta.B + (setEnd ? (gw === 'B' ? 3 : -3) : 0), A: total.A, B: total.B });
  if (setEnd) {
    const F = lastGames.slice(-3).reduce((s, d) => ({ A: s.A + d.A, B: s.B + d.B }), { A: 0, B: 0 });
    const form = Math.max(-3, Math.min(3, 0.5 * (F.A - F.B)));
    const startA = (gw === 'A' ? 3 : -3) + form;
    setRows.push({ set: g.set + 1, winner: gw, process: { ...setProcess }, parts, outcome: { ...setOutcome }, end: { ...total }, F, nextStart: { A: startA, B: -startA } });
    resetSet();
    total.A = startA; total.B = -startA;
  }
}

function keyPointIsBp(p) {
  const s = p.server === 'A' ? p.pa : p.pb, r = p.server === 'A' ? p.pb : p.pa;
  return r === 4 || (r === 3 && s < 3);
}

const recorded = points.filter((p) => p.ending !== 'Not recorded (manual score)').length;
console.log(`A = ${nameA}, B = ${nameB}; ${points.length} points, ${recorded} with recorded ending (${(100 * recorded / points.length).toFixed(1)}%)`);
console.log('\nGames (deltas include process points in the game, outcome bonuses and set bonus):');
console.log('Set | Game | Srv | dA | dB | A | B | A-B | Notes');
for (const r of gameRows) console.log(`${r.set} | ${r.game} | ${r.server} | ${r.dA} | ${r.dB} | ${r.A} | ${r.B} | ${r.A - r.B} | ${r.notes.join('; ')}`);
console.log('\nSets:');
for (const s of setRows) console.log(JSON.stringify(s));

const out = ['Point,Score before,Server,Winner,Ending,Key,A delta,B delta,A,B,A-B'];
for (const r of rows) out.push([r.p.n, r.p.label, r.p.server, r.p.winner, r.p.ending, r.dA.isKey ? 'Y' : '', r.dA.d, r.dB.d, r.A, r.B, r.A - r.B].join(','));
writeFileSync(file.replace(/\.csv$/, '-control-score.csv'), out.join('\n'));

// Chart per player: own score minus opponent's, one segment per set (starting at the set start score), with zigzag turning points.
const REVERSAL = 10; // minimum swing that confirms a turning point

function turningPoints(pts) {
  const v = pts.map((q) => q.v), pivots = [];
  let dir = 0, ext = 0, hi = 0, lo = 0;
  for (let i = 1; i < v.length; i++) {
    if (dir === 0) {
      if (v[i] > v[hi]) hi = i;
      if (v[i] < v[lo]) lo = i;
      if (v[i] - v[lo] >= REVERSAL) { if (lo > 0) pivots.push({ i: lo, type: 'trough' }); dir = 1; ext = i; }
      else if (v[hi] - v[i] >= REVERSAL) { if (hi > 0) pivots.push({ i: hi, type: 'peak' }); dir = -1; ext = i; }
    } else if (dir === 1) {
      if (v[i] >= v[ext]) ext = i;
      else if (v[ext] - v[i] >= REVERSAL) { pivots.push({ i: ext, type: 'peak' }); dir = -1; ext = i; }
    } else {
      if (v[i] <= v[ext]) ext = i;
      else if (v[i] - v[ext] >= REVERSAL) { pivots.push({ i: ext, type: 'trough' }); dir = 1; ext = i; }
    }
  }
  // Swing that follows each pivot: to the next pivot, or to the end of the set.
  return pivots.map((pv, k) => {
    const to = k + 1 < pivots.length ? pivots[k + 1].i : v.length - 1;
    return { ...pv, v: v[pv.i], swing: v[to] - v[pv.i], to };
  });
}

const scoreInSet = (p) => p.label.split(' · ').slice(p.set).join(' ');
const gameOf = (p) => gameRows.find((g) => g.set === p.set + 1 && g.game === (p.tb ? (p.mtb ? 'MTB' : 'TB') : p.games.join('-')));
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

// Attribute the change in (X - opponent) over pts (i, j] to point endings and game outcomes.
function explain(pts, i, j, X) {
  const Y = other(X), me = X === 'A' ? nameA : nameB, opp = X === 'A' ? nameB : nameA;
  const f = { myW: [0, 0, 0], myE: [0, 0, 0], oppW: [0, 0, 0], oppE: [0, 0, 0] }; // [count, value, streak extra]
  const add = (k, v, extra) => { f[k][0]++; f[k][1] += v; f[k][2] += extra; };
  let myDF = 0, oppDF = 0, games = 0, set = 0, tbWinner = null;
  const g = { [X]: { hold: 0, brk: 0 }, [Y]: { hold: 0, brk: 0 } };
  for (let k = i + 1; k <= j; k++) {
    const r = pts[k].r, dm = r[`d${X}`], dy = r[`d${Y}`];
    if (dm.base > 0) add('myW', dm.d, dm.extra);
    if (dm.base < 0) { add('myE', dm.d, dm.extra); if (dm.base === -2) myDF++; }
    if (dy.base > 0) add('oppW', -dy.d, -dy.extra);
    if (dy.base < 0) { add('oppE', -dy.d, -dy.extra); if (dy.base === -2) oppDF++; }
    if (r.game) {
      games += r.game.out[X] - r.game.out[Y];
      if (r.game.tb) tbWinner = r.game.winner;
      else g[r.game.winner][r.game.winner === r.game.server ? 'hold' : 'brk']++;
      if (r.game.setWinner) set += r.game.setWinner === X ? 6 : -6;
    }
  }
  const streak = (e) => (e ? `, streaks ${signed(e)}` : '');
  const plural = (n, w) => (n ? `${n} ${w}${n > 1 ? 's' : ''}` : '');
  const gameText = (name, s) => { const t = [plural(s.hold, 'hold'), plural(s.brk, 'break')].filter(Boolean).join(', '); return t && `${name} ${t}`; };
  const gameLabel = tbWinner ? `Tiebreak won by ${tbWinner === X ? me : opp}` : `Games: ${[gameText(me, g[X]), gameText(opp, g[Y])].filter(Boolean).join('; ')}`;
  const factors = [
    { label: `${me} winners ×${f.myW[0]}${streak(f.myW[2])}`, short: `${me} winners (${f.myW[0]})`, v: f.myW[1] },
    { label: `${me} errors ×${f.myE[0]}${myDF ? ` (${myDF} DF)` : ''}${streak(f.myE[2])}`, short: `${me} errors (${f.myE[0]})`, v: f.myE[1] },
    { label: `${opp} winners ×${f.oppW[0]}${streak(f.oppW[2])}`, short: `${opp} winners (${f.oppW[0]})`, v: f.oppW[1] },
    { label: `${opp} errors ×${f.oppE[0]}${oppDF ? ` (${oppDF} DF)` : ''}${streak(f.oppE[2])}`, short: `${opp} errors (${f.oppE[0]})`, v: f.oppE[1] },
    { label: gameLabel, short: gameLabel.replace(/^Games: /, ''), v: games },
    { label: 'Set bonus', short: 'Set result', v: set },
  ].filter((q) => q.v !== 0);
  const change = pts[j].v - pts[i].v;
  const total = factors.reduce((s, q) => s + q.v, 0);
  if (total !== change) console.warn(`Attribution mismatch: ${total} vs ${change}`);
  const dir = Math.sign(change) || 1;
  const drivers = factors.filter((q) => Math.sign(q.v) === dir).sort((a, b) => dir * (b.v - a.v));
  const against = factors.filter((q) => Math.sign(q.v) === -dir).sort((a, b) => dir * (a.v - b.v));
  return { change, drivers, against };
}
const fmt = (list) => list.map((q) => `${q.label} (${signed(q.v)})`).join('; ');

for (const X of ['A', 'B']) {
const sign = X === 'A' ? 1 : -1;
const me = X === 'A' ? nameA : nameB, opp = X === 'A' ? nameB : nameA;
const sets = [];
let startDiff = 0;
for (const r of rows) {
  if (!sets.length || sets[sets.length - 1].set !== r.p.set) {
    if (sets.length) { const s = setRows[sets.length - 1].nextStart; startDiff = sign * (s.A - s.B); }
    sets.push({ set: r.p.set, pts: [{ v: startDiff, r: null }] });
  }
  sets[sets.length - 1].pts.push({ v: sign * (r.A - r.B), r });
}

console.log(`\nTurning points for ${me} (zigzag, reversal >= ${REVERSAL}):`);
const segments = [];
for (const s of sets) {
  s.turns = turningPoints(s.pts);
  for (const t of s.turns) {
    const p = s.pts[t.i].r.p, pTo = s.pts[t.to].r.p;
    console.log(`Set ${s.set + 1} ${t.type} at pt ${p.n} (${scoreInSet(p)}): ${t.v}, then ${signed(t.swing)} to pt ${pTo.n} (${scoreInSet(pTo)}) [${gameOf(p).notes.join('; ')}]`);
  }
  const bounds = [0, ...s.turns.map((t) => t.i), s.pts.length - 1];
  const at = (idx) => (idx === 0 ? 'set start' : idx === s.pts.length - 1 ? 'set end' : scoreInSet(s.pts[idx].r.p));
  // Tiebreaks count as one game, so use 6-point blocks there.
  const unit = (p) => (p.tb ? `TB${Math.floor((p.pa + p.pb) / 6)}` : p.games.join('-'));
  for (let k = 0; k + 1 < bounds.length; k++) {
    const i = bounds[k], j = bounds[k + 1];
    const units = new Set(s.pts.slice(i + 1, j + 1).map((q) => unit(q.r.p)));
    if (units.size < 2) continue;
    segments.push({ s, i, j, n: segments.length + 1, from: at(i), to: at(j), ...explain(s.pts, i, j, X) });
  }
}
console.log(`\nSegments for ${me}:`);
for (const g of segments) console.log(`${g.n}. Set ${g.s.set + 1} ${g.from} -> ${g.to}: ${signed(g.change)} | drivers: ${fmt(g.drivers)} | against: ${fmt(g.against)}`);

const W = 1100, H = 460, padL = 64, padR = 60, padT = 84, padB = 40;
const slots = sets.reduce((n, s) => n + s.pts.length, 0) + sets.length - 1;
const all = sets.flatMap((s) => s.pts.map((q) => q.v));
const lo = Math.min(0, ...all) - 14, hi = Math.max(0, ...all) + 16;
const x = (slot) => padL + (slot * (W - padL - padR)) / (slots - 1);
const y = (v) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);
let slot = 0, body = '', bands = '', gameLabels = '';
const half = (x(1) - x(0)) / 2;
for (const s of sets) {
  const first = slot;
  s.pts.forEach((q) => { q.x = x(slot++); q.y = y(q.v); });
  slot++; // gap between sets
  let shade = false, gameStart = null;
  s.pts.forEach((q, i) => {
    if (!q.r) return;
    const key = q.r.p.tb ? 'TB' : q.r.p.games.join('-'), next = s.pts[i + 1];
    if (!gameStart) {
      gameStart = q;
      if (!q.r.p.tb) gameLabels += `<text x="${q.x - half + 2}" y="${padT + 10}" font-size="9" fill="#555">${q.r.p.games.join('-')}</text>`;
    }
    if (q.r.p.tb && (q.r.p.pa + q.r.p.pb) % 6 === 0) {
      gameLabels += `<line x1="${q.x - half}" x2="${q.x - half}" y1="${padT}" y2="${H - padB}" stroke="#999" stroke-dasharray="2,3"/>`
        + `<text x="${q.x - half + 2}" y="${padT + 10}" font-size="9" fill="#555">${q.r.p.pa}-${q.r.p.pb}</text>`;
    }
    if (!next || (next.r.p.tb ? 'TB' : next.r.p.games.join('-')) !== key) {
      if (shade) bands += `<rect x="${gameStart.x - half}" y="${padT}" width="${q.x - gameStart.x + 2 * half}" height="${H - padT - padB}" fill="#ececec"/>`;
      shade = !shade; gameStart = null;
    }
  });
  const d = s.pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('');
  const winner = setRows[sets.indexOf(s)].winner;
  body += `<text x="${x(first)}" y="${padT - 40}" font-size="12" font-weight="bold">${s.pts[1].r.p.mtb ? 'MTB' : `Set ${s.set + 1}`} (won by ${winner === 'A' ? nameA : nameB})</text>`;
  if (first) body += `<line x1="${x(first - 1)}" x2="${x(first - 1)}" y1="${padT - 54}" y2="${H - padB}" stroke="#bbb" stroke-dasharray="4"/>`;
  body += `<circle cx="${s.pts[0].x}" cy="${s.pts[0].y}" r="3" fill="#fff" stroke="#1565c0"><title>Set start ${s.pts[0].v}</title></circle>`;
  body += `<path d="${d}" fill="none" stroke="#1565c0" stroke-width="2"/>`;
  for (const t of s.turns) {
    const q = s.pts[t.i], p = q.r.p, up = t.type === 'peak';
    const color = up ? '#c62828' : '#2e7d32';
    const tri = up ? `${q.x - 6},${q.y - 12} ${q.x + 6},${q.y - 12} ${q.x},${q.y - 3}` : `${q.x - 6},${q.y + 12} ${q.x + 6},${q.y + 12} ${q.x},${q.y + 3}`;
    const ty = up ? q.y - 30 : q.y + 26;
    const tip = `Pt ${p.n}, ${scoreInSet(p)}: ${t.v}, then ${signed(t.swing)}. ${gameOf(p).notes.join('; ')}`;
    body += `<g><title>${tip}</title><polygon points="${tri}" fill="${color}"/>`
      + `<text x="${q.x}" y="${ty}" font-size="11" text-anchor="middle" fill="${color}">${scoreInSet(p)}</text>`
      + `<text x="${q.x}" y="${ty + 12}" font-size="11" text-anchor="middle" fill="${color}">${t.v} → ${signed(t.swing)}</text></g>`;
  }
}
for (const g of segments) {
  const a = g.s.pts[g.i], b = g.s.pts[g.j], color = g.change >= 0 ? '#2e7d32' : '#c62828';
  body += `<g><title>${g.n}. ${signed(g.change)}: ${g.drivers[0].short} ${signed(g.drivers[0].v)}</title><line x1="${a.x}" x2="${b.x}" y1="${H - padB + 8}" y2="${H - padB + 8}" stroke="${color}" stroke-width="4"/>`
    + `<text x="${(a.x + b.x) / 2}" y="${H - padB + 24}" font-size="11" text-anchor="middle" fill="${color}">${g.n}</text></g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
${bands}${gameLabels}
<text x="${padL}" y="18" font-size="14">Match Control Score ${me} (vs ${opp})</text>
<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="#333"/>
<text transform="translate(16 ${(padT + H - padB) / 2}) rotate(-90)" font-size="12" text-anchor="middle">Match Control Score</text>
${[Math.max(...all), 0, Math.min(...all)].map((v) => `<text x="${padL - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end">${v}</text>`).join('')}
${body}</svg>`;
const setName = (s) => (s.pts[1].r.p.mtb ? 'MTB' : `Set ${s.set + 1}`);
const table = `<table><tr><th>#</th><th>Set</th><th>From → to</th><th>Change</th><th>Biggest factor</th></tr>
${segments.map((g) => `<tr><td>${g.n}</td><td>${setName(g.s)}</td><td>${g.from} → ${g.to}</td><td class="${g.change >= 0 ? 'up' : 'down'}">${signed(g.change)}</td><td>${g.drivers[0].short} <b>${signed(g.drivers[0].v)}</b></td></tr>`).join('\n')}
</table>`;
const style = '<style>body{font-family:sans-serif;font-size:13px}table{border-collapse:collapse;max-width:1100px}th,td{border:1px solid #ddd;padding:4px 8px;vertical-align:top;text-align:left}.up{color:#2e7d32;font-weight:bold}.down{color:#c62828;font-weight:bold}</style>';
writeFileSync(file.replace(/\.csv$/, X === 'A' ? '-control-score.html' : '-control-score-B.html'), `<!doctype html><meta charset="utf-8"><title>Match Control Score ${me}</title>${style}${svg}${table}`);
}
