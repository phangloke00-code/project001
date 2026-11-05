// node piano-video/core.test.js
const assert = require("assert");
const PV = require("./core.js");

// 88-key layout
const keys = PV.layout(21, 108, 0, 1040);
assert.strictEqual(keys.length, 88);
assert.strictEqual(keys.filter(k => k.black).length, 36);
assert.strictEqual(keys[0].x, 10); // 52 whites * 20px
// detected black-key centers are used when the count matches
const bx = keys.filter(k => k.black).map(k => Math.round(k.x) + 1);
assert.deepStrictEqual(PV.layout(21, 108, 0, 1040, bx).filter(k => k.black).map(k => k.x), bx);

// black-key detection on a synthetic keyboard row
const row = new Array(1040).fill(230); keys.filter(k => k.black).forEach(k => { for (let x = Math.round(k.x - 5); x <= Math.round(k.x + 5); x++) row[x] = 20; });
assert.strictEqual(PV.detectBlacks(row, 0, 1040).length, 36);

// probes: dark background inactive, green/red bars active
const rowOf = (paint) => { const d = new Uint8ClampedArray(1040 * 4); for (let x = 0; x < 1040; x++) d.set([60, 45, 50, 255], x * 4); paint((x0, x1, rgb) => { for (let x = Math.round(x0); x < x1; x++) d.set([...rgb, 255], x * 4); }); return d; };
const K = m => keys.find(k => k.m === m), lit = (d, m) => PV.sampleKeys(d, 1040, keys)[keys.indexOf(K(m))];
const LIGHT = [235, 110, 120], DARK = [190, 40, 55];
// dark background -> nothing; full-width white bar on B4 lights B4 but not A#4 next to it
let px = rowOf(f => f(K(71).x - 10, K(71).x + 10, LIGHT));
assert.strictEqual(lit(px, 70), -1); assert.ok(PV.hueDist(lit(px, 71), 355) < 5); assert.strictEqual(lit(px, 72), -1);
// A4 + B4 together, full width: still no A#4
px = rowOf(f => { f(K(69).x - 10, K(69).x + 10, LIGHT); f(K(71).x - 10, K(71).x + 10, LIGHT); });
assert.strictEqual(lit(px, 70), -1);
// Are You Lost: see-through lilac bar (sat .18, v .64) on brown-grey (sat .15, v .38) lights its key; a white spark does not
{ const bg = d => { for (let x = 0; x < 1040; x++) d.set([97, 83, 82, 255], x * 4); return d; };
  const lil = bg(rowOf(() => {})); for (let x = Math.round(K(72).x - 9); x < K(72).x + 9; x++) lil.set([163, 133, 152, 255], x * 4);
  for (let x = Math.round(K(60).x - 9); x < K(60).x + 9; x++) lil.set([250, 250, 250, 255], x * 4);
  assert.ok(PV.hueDist(lit(lil, 72), 322) < 10); assert.strictEqual(lit(lil, 71), -1); assert.strictEqual(lit(lil, 60), -1); assert.strictEqual(lit(bg(rowOf(() => {})), 72), -1); }
// lineBg: a lilac bar dimmer than vMin (v .38 on v .25) lights its key against the background; the light a hit throws over
// a cyan background (same hue, less saturated) does not
{ const fill = rgb => { const d = new Uint8ClampedArray(1040 * 4); for (let x = 0; x < 1040; x++) d.set([...rgb, 255], x * 4); return d; };
  const bar = (d, m, rgb) => { for (let x = Math.round(K(m).x - 9); x < K(m).x + 9; x++) d.set([...rgb, 255], x * 4); return d; };
  const rows = Array.from({length: 40}, () => fill([64, 56, 61])); rows[20] = bar(fill([64, 56, 61]), 72, [97, 77, 95]);
  const bg = PV.lineBg(rows), at = (d, b, m) => PV.sampleKeys(d, 1040, keys, .4, .25, null, b)[keys.indexOf(K(m))];
  assert.strictEqual(at(rows[20], null, 72), -1); assert.ok(PV.hueDist(at(rows[20], bg[20], 72), 306) < 15); assert.strictEqual(at(rows[3], bg[3], 72), -1);
  const cy = Array.from({length: 40}, () => fill([45, 62, 69])); cy[20] = bar(fill([45, 62, 69]), 72, [80, 95, 100]);
  assert.strictEqual(at(cy[20], PV.lineBg(cy)[20], 72), -1); }
// A#4 center right on the soft (darker) edge of a full-width B4 bar: still not lit
px = rowOf(f => { f(K(71).x - 10, K(71).x + 10, LIGHT); f(K(70).x - 1, K(70).x + 1, DARK); });
assert.strictEqual(lit(px, 70), -1);
// a full-width A4 bar with a darker outline whose left edge reaches just past G#4's center: G#4 not lit (失眠的夜 bar 28)
px = rowOf(f => { f(K(68).x - 2, K(69).x + 10, [170, 220, 90]); f(K(68).x - 2, K(68).x + 3, [120, 170, 50]); });
assert.strictEqual(lit(px, 68), -1); assert.ok(lit(px, 69) >= 0);
// a narrow A#4 bar in the other hand's color next to a B4 bar: both lit
px = rowOf(f => { f(K(71).x - 10, K(71).x + 10, LIGHT); f(K(70).x - 6, K(70).x + 6, [100, 140, 30]); });
assert.ok(lit(px, 70) >= 0 && lit(px, 71) >= 0);
// a narrow F#4 bar alone: F#4 lit, F4 and G4 next to it are not, even where the bar's edge reaches F4's center
px = rowOf(f => f(K(66).x - 6, K(66).x + 7, LIGHT)); assert.ok(lit(px, 66) >= 0); assert.strictEqual(lit(px, 65), -1); assert.strictEqual(lit(px, 67), -1);
px = rowOf(f => f(K(65).x - 1, K(66).x + 6, LIGHT)); assert.strictEqual(lit(px, 65), -1);
// the rounded end of an F4 bar (narrower, off-center toward F#4's side reaches F#4's center): F#4 not lit
px = rowOf(f => f(K(65).x - 6, K(66).x + 1, LIGHT)); assert.strictEqual(lit(px, 66), -1); assert.ok(lit(px, 65) >= 0);
// a single stray lit pixel at G#2's center next to an A2 bar: G#2 not lit
px = rowOf(f => { f(K(45).x - 8, K(45).x + 8, LIGHT); f(K(44).x, K(44).x + 1, LIGHT); }); assert.strictEqual(lit(px, 44), -1);
// F4 + F#4 by the SAME hand (one merged bar, wider than a key): both lit
px = rowOf(f => { f(K(65).x - 8, K(65).x + 8, LIGHT); f(K(66).x - 6, K(66).x + 6, DARK); }); assert.ok(lit(px, 65) >= 0 && lit(px, 66) >= 0, "merged F4+F#4");
// F4 + F#4 by different hands: both lit
px = rowOf(f => { f(K(65).x - 10, K(65).x + 10, LIGHT); f(K(66).x - 6, K(66).x + 6, [100, 140, 30]); }); assert.ok(lit(px, 65) >= 0 && lit(px, 66) >= 0);
// green bar reads as green
px = rowOf(f => f(K(60).x - 9, K(60).x + 9, [160, 215, 100])); assert.ok(Math.abs(lit(px, 60) - 88) < 5);

// frames -> notes: key0 green 0..0.3 then gap then green again; key1 red 0.1..0.2
const times = [0, .1, .2, .3, .4, .5], G = 90, R = 355;
const frames = [[G, -1], [G, R], [G, -1], [-1, -1], [G, -1], [-1, -1]];
const notes = PV.extractNotes(times, frames, [48, 72]);
assert.deepStrictEqual(notes.map(n => [n.m, n.t, n.d]), [[48, 0, .3], [72, .1, .1], [48, .4, .1]]);
// a 5-second hole in the frame times must not join the lit frames on either side into one long note
assert.deepStrictEqual(PV.extractNotes([0, .1, 5.1, 5.2], [[G], [G], [G], [-1]], [60]).map(n => [n.t, n.d]), [[0, .13], [5.1, .1]]);
// with an upper line: a bar seen above first is kept; something lit on both lines at once (static title) is dropped
const lower = [[-1, G], [G, G], [G, G], [-1, -1]], up = [[G, G], [G, G], [-1, G], [-1, -1]];
assert.deepStrictEqual(PV.extractNotes([0, .1, .2, .3], lower, [60, 62], .25, up).map(n => n.m), [60]);
// 1-frame black key inside the same-hand white note next to it = that bar's edge (失眠的夜 bar 28: A3 + ghost G#3); a real one stays
{ const T = [0, .033, .067, .1, .133, .167], fr = [[-1, -1], [-1, 75], [70, 75], [-1, 75], [-1, -1], [-1, -1]];
  assert.deepStrictEqual(PV.extractNotes(T, fr, [56, 57]).map(n => n.m), [57]);
  assert.deepStrictEqual(PV.extractNotes(T, [[-1, -1], [70, 75], [70, 75], [70, 75], [70, -1], [-1, -1]], [56, 57]).map(n => n.m).sort(), [56, 57]); }
const cols = PV.assignHands(notes);
assert.deepStrictEqual(notes.map(n => n.h), ["L", "R", "L"]);
assert.ok(PV.hueDist(cols.L, G) < 2 && PV.hueDist(cols.R, R) < 2);

// four colors (Falling Tears): red bass = left hand; white chords + cyan + pink = right hand (red + white together often span
// two octaves, so white can't be the left hand there either). Average pitches as measured: 47.5, 62.5, 72, 76
{ const ns = [], add = (hue, ms) => { for (let i = 0; i < 20; i++) ns.push({m: ms[i % ms.length], t: i, d: .2, hue}); };
  add(5, [41, 48, 54]); add(60, [58, 62, 67]); add(185, [69, 72, 75]); add(320, [72, 76, 80]);
  const c = PV.assignHands(ns);
  assert.deepStrictEqual([5, 60, 185, 320].map(h => ns.find(n => n.hue === h).h), ["L", "R", "R", "R"]);
  assert.ok(PV.hueDist(c.L, 5) < 15); }

// bright busy background + white/whitish bars (TOYOKI Falling Tears): the default rule lights the wood (v .45, s .3) as a
// note; paleNotes' brightness rule drops it, sees white and whitish-pink bars, and cuts repeated notes at the dim glow between bars
{ const WOOD = [110, 93, 77], row = paint => { const d = rowOf(paint); for (let x = 0; x < 1040; x++) if (d[x * 4] === 60) d.set([...WOOD, 255], x * 4); return d; };
  const pk = (d, m, v = .7) => PV.sampleKeys(d, 1040, keys, v, .25, v)[keys.indexOf(K(m))];
  assert.ok(lit(row(() => {}), 60) >= 0); // the old rule: a ghost note everywhere
  assert.strictEqual(pk(row(() => {}), 60), -1);
  assert.strictEqual(pk(row(f => f(K(60).x - 8, K(60).x + 8, [250, 249, 238])), 60), 60); // white bar = hue 60
  assert.ok(PV.hueDist(pk(row(f => f(K(60).x - 8, K(60).x + 8, [218, 189, 203])), 60), 330) < 20); // whitish pink keeps its hue
  // a 10 px red bar on F#4 with a wide red glow (v .7-.85) around it: only F#4, not F4 / G4 under the glow
  const glow = row(f => { f(K(66).x - 13, K(66).x + 13, [180, 65, 60]); f(K(66).x - 5, K(66).x + 5, [255, 165, 150]); });
  assert.ok(pk(glow, 66) >= 0); assert.strictEqual(pk(glow, 65), -1); assert.strictEqual(pk(glow, 67), -1);
  const BAR = [255, 170, 150], GLOW = [194, 74, 72], line = [], ups = [], T = [];
  const seq = [0, 0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0, 0, 3, 0, 0]; // 1 bar, 2 glow between two repeated bars, 3 a one-frame spark
  seq.forEach((c, i) => { T.push(i / 30); line.push(row(f => c && f(K(60).x - 8, K(60).x + 8, [0, BAR, GLOW, BAR][c])));
    ups.push(row(f => (seq[i + 2] || seq[i + 3]) && f(K(60).x - 8, K(60).x + 8, BAR))); });
  const ns = PV.paleNotes(T, line, ups, 1040, keys);
  assert.deepStrictEqual(ns.map(n => [n.m, Math.round(n.t * 30), Math.round(n.d * 30)]), [[60, 2, 5], [60, 7, 4]]); } // the glow frame stays with the first note; the spark is gone

// keyColors (Falling Tears): a see-through bar's color is unreliable; its key's light, a fall time later, isn't.
// Lit magenta -> hue ~305; no light and long = a white note (hue 60); no light and short = a spark, dropped
{ const T = Array.from({length: 40}, (_, i) => i / 30), KEY = [255, 60, 230], blank = () => rowOf(() => {});
  const kw = T.map(() => blank()), kb = T.map(() => blank());
  for (let i = 8; i < 16; i++) kw[i] = rowOf(f => f(K(64).x - 4, K(64).x + 4, KEY)); // E4's key lit 8 frames after its bar hit the line
  for (let i = 24; i < 30; i++) kw[i] = rowOf(f => [64, 67, 72].forEach(m => f(K(m).x - 4, K(m).x + 4, [255, 40, 30]))); // more notes, so the fall time is found
  const ns = [{m: 64, t: 0, d: .3, hue: 200}, {m: 60, t: 0, d: .4, hue: 200}, {m: 62, t: .2, d: .05, hue: 240},
    {m: 64, t: 16 / 30, d: .2, hue: 0}, {m: 67, t: 16 / 30, d: .2, hue: 0}, {m: 72, t: 16 / 30, d: .2, hue: 0}];
  const out = PV.keyColors(ns, T, kw, kb, 1040, keys);
  assert.deepStrictEqual(out.map(n => n.m), [64, 60, 64, 67, 72]);
  assert.ok(PV.hueDist(out[0].hue, 305) < 10); assert.strictEqual(out[1].hue, 60); assert.ok(PV.hueDist(out[2].hue, 3) < 10); }

// fingering: C major triad RH 1-3-5, LH 5-3-1; scale RH has no illegal crossings
const chord = h => [60, 64, 67].map(m => ({m, t: 0, d: 1, h}));
assert.deepStrictEqual(PV.fingering(chord("R")).map(n => n.f), [1, 3, 5]);
assert.deepStrictEqual(PV.fingering(chord("L")).map(n => n.f), [5, 3, 1]);
const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => ({m, t: i * .4, d: .35, h: "R"}));
PV.fingering(scale);
assert.strictEqual(scale.map(n => n.f).join(""), "12312345");
for (let i = 1; i < scale.length; i++) assert.ok(scale[i].f > scale[i - 1].f || scale[i].f === 1, "only the thumb may pass under going up");

// MIDI round trip keeps pitch, time, length and hand
const song = [{m: 60, t: 0, d: .5, h: "R", v: .5}, {m: 48, t: 0, d: 1, h: "L", v: 1}, {m: 64, t: .5, d: .5, h: "R", v: .8}];
const back = PV.fromMidi(PV.toMidi(song).buffer);
assert.deepStrictEqual(back.map(n => [n.m, n.t, n.d, n.h]), [[48, 0, 1, "L"], [60, 0, .5, "R"], [64, .5, .5, "R"]]);
assert.deepStrictEqual(back.map(n => n.v), [1, .5, .8]); // velocity kept (to 1/127)

// audio: two notes, the second played softer and released dry; the first rings 1 s past its release (pedal)
{ const sr = 8000, x = new Float32Array(sr * 4), add = (m, t0, a, ring) => { const f = 440 * 2 ** ((m - 69) / 12);
    for (let i = Math.round(t0 * sr); i < x.length; i++) { const t = i / sr - t0; if (t > ring) break; x[i] += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * .5); } };
  add(60, .5, .8, 1.5); add(64, 2, .2, .3);
  const ns = [{m: 60, t: .3, d: .5}, {m: 64, t: 1.8, d: .3}]; // note times 0.2 s early vs the audio
  const off = PV.alignAudio(x, sr, ns); assert.ok(Math.abs(off - .2) < .03, "align " + off);
  ns.forEach(n => n.t += off); PV.audioDynamics(x, sr, ns);
  assert.ok(ns[0].v > ns[1].v, "softer note gets lower velocity"); assert.ok(ns[0].s >= .8 && ns[1].s <= .2, "ring " + ns.map(n => n.s)); }

// beat grid: 100 BPM, bass on each downbeat starting at 1.3 s, melody on every beat and some off-beats
{ const p = .6, ns = []; for (let b = 0; b < 32; b++) { const t = 1.3 + b * p; ns.push({m: 72, t, d: .2}); if (b % 4 === 0) ns.push({m: 40, t, d: 1}); if (b % 2) ns.push({m: 76, t: t + p / 2, d: .1}); }
  const g = PV.beatGrid(ns); assert.ok(Math.abs(g.p - p) < .01 && g.bpm === 100, "tempo " + JSON.stringify(g));
  assert.ok(Math.abs(((g.t0 - 1.3) % (4 * p) + 4 * p) % (4 * p)) < .03 || Math.abs(((g.t0 - 1.3) % (4 * p) + 4 * p) % (4 * p) - 4 * p) < .03, "downbeat " + g.t0);
  assert.strictEqual(PV.barOf(g, PV.barTime(g, 5) + .01), 5); }

{ // a black key lit in the calibration frame (missed) plus a stray dark run must not shift the other black keys
  const ref = PV.layout(21, 108, 0, 960, []).filter(k => k.black).map(k => k.x);
  const C4 = PV.layout(21, 108, 0, 960, []).find(k => k.m === 60), det = ref.filter((_, i) => i !== 10).concat([C4.x - C4.w / 2]).sort((a, b) => a - b).map(x => x + 1);
  const got = PV.layout(21, 108, 0, 960, det).filter(k => k.black).map(k => k.x);
  got.forEach((x, i) => assert.ok(Math.abs(x - ref[i]) <= 1, "black " + i + " " + x + " vs " + ref[i]));
  // useKeys: fragmented line result vs clean key-surface result
  const fr = [...Array(100)].map((_, i) => ({d: i < 60 ? .05 : .5})), ok = [...Array(100)].map(() => ({d: .4}));
  assert.ok(PV.useKeys(fr, ok) && !PV.useKeys(ok, ok) && !PV.useKeys(fr, [])); }

{ // stripeShift: lit stripes drawn 4 px right of the white keys' centers -> white keys move +4, black keys stay
  const keys = PV.layout(21, 108, 0, 960, []), W = 960, rows = [], times = [], notes = [];
  for (let i = 0; i < 20; i++) { const r = new Uint8ClampedArray(W * 4).fill(200); for (let x = 0; x < W; x++) r[x * 4 + 3] = 255;
    const k = keys.filter(q => !q.black)[i + 10]; for (let x = Math.round(k.x + 1); x <= k.x + 7; x++) { r[x * 4] = 255; r[x * 4 + 1] = 160; r[x * 4 + 2] = 0; }
    rows.push(r); times.push(i); notes.push({m: k.m, t: i - .1, d: .2}); }
  const k2 = PV.stripeShift(rows, times, W, keys, notes);
  assert.ok(Math.abs(k2[0].x - keys[0].x - 4) < .6 && k2[1].x === keys[1].x, "shift " + (k2[0].x - keys[0].x)); }

{ // pedalMarks: chord 1 rings into chord 2 briefly -> change; overlapping long ring -> one pedal; dry notes -> none
  const pm = PV.pedalMarks([{t: 0, d: .5, s: 1}, {t: 0, d: .5, s: 1}, {t: 1.4, d: .5, s: .8}, {t: 1.6, d: .3, s: 1.5}, {t: 5, d: .4, s: 0}]); // no left-hand notes -> no bass changes
  assert.deepStrictEqual(pm.map(x => x.map(v => +v.toFixed(2))), [[0, 1.4], [1.4, 3.4]]); }
{ // MIDI sustain pedal (CC64) -> n.s
  const b = [0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,0,96, 0x4d,0x54,0x72,0x6b,0,0,0,0];
  const ev = [0,0x90,60,80, 0,0xb0,64,127, 48,0x80,60,0, 0,0x90,62,80, 48,0x80,62,0, 48,0xb0,64,0, 0,0xff,0x2f,0];
  b.push(...ev); b[21] = ev.length; const ns = PV.fromMidi(new Uint8Array(b).buffer);
  assert.deepStrictEqual(ns.map(n => n.s), [.5, .3]); } // 120 BPM: pedal up at .75 s
{ // bass change splits a long pedal
  const pm = PV.pedalMarks([{t: 0, d: 4, s: 1, m: 48, h: "L"}, {t: 2, d: 2, s: 1, m: 43, h: "L"}]);
  assert.deepStrictEqual(pm, [[0, 2], [2, 5]]); }
{ // song audio -> piano: melody on top goes to the right hand, chords under it become a left-hand bass/broken chord
  const raw = [], q = .5; // 120 BPM, 4 bars: C C Am Am; melody quarter notes, chord pad + bass under it, a little noise
  const mel = [72, 74, 76, 77, 79, 77, 76, 74, 72, 76, 81, 79, 76, 72, 69, 72];
  mel.forEach((m, i) => raw.push({t: i * q, d: q * .9, m, v: .8}));
  for (let b = 0; b < 4; b++) { const ch = b < 2 ? [48, 60, 64, 67] : [45, 57, 60, 64]; ch.forEach(m => raw.push({t: b * 2, d: 1.9, m, v: .5})); }
  raw.push({t: 1.01, d: .03, m: 90, v: .9}, {t: 3.3, d: .4, m: 99, v: .05}); // a click (too short) and a whisper (too quiet): dropped
  const easy = PV.arrange(raw, "easy"), full = PV.arrange(raw, "full"), R = full.filter(n => n.h === "R"), L = full.filter(n => n.h === "L");
  assert.deepStrictEqual(R.map(n => n.m), mel); // melody kept, pad tones under it are not melody
  assert.ok(L.every(n => n.m < 72) && L.length >= 12); // broken chord every beat
  const roots = t => L.filter(n => n.t >= t && n.t < t + 4).map(n => n.m);
  assert.ok(roots(0).every(m => [0, 4, 7].includes(m % 12)) && roots(0).some(m => m % 12 === 0)); // C major
  assert.ok(roots(4).every(m => [9, 0, 4].includes(m % 12)) && roots(4).some(m => m % 12 === 9)); // A minor
  assert.ok(L.filter(n => n.m === Math.min(...L.map(x => x.m))).length >= 2 && Math.min(...L.map(n => n.m)) >= 40);
  assert.ok(L.some(n => n.s >= .3) && PV.pedalMarks(full).length >= 2); // pedal held per chord, changed at the chord change
  const eL = easy.filter(n => n.h === "L"); assert.ok(eL.length >= 4 && eL.every(n => [0, 9].includes(n.m % 12))); // easy: just the root
  const r = PV.arrange(raw, "raw"); assert.ok(r.length === raw.length - 2 && r.every(n => n.h === (n.m < 60 ? "L" : "R")));
  // a low melody (sung around C4) is lifted an octave so it sits above the left hand
  // the model also hears overtones (2 octaves / an octave+5th up, quieter) and chord tones where the melody holds: not melody
  const noisy = [...raw, ...mel.map((m, i) => ({t: i * q + .01, d: .3, m: m + (i % 2 ? 24 : 19), v: .45})), {t: 4.02, d: .4, m: 57, v: .6}, {t: 6.01, d: .3, m: 59, v: .5}, {t: 3 * q + .2, d: .25, m: 98, v: .7}];
  noisy.filter(n => n.m === 69 || n.m === 72).forEach(n => { if (n.t === 14 * q) n.d = q * 1.9; }); // hold the A4 over the next onset
  assert.deepStrictEqual(PV.arrange(noisy, "full").filter(n => n.h === "R").map(n => n.m), mel);
  assert.strictEqual(L[0].m % 12, 0); // each chord starts its broken pattern on the root
  const low = PV.arrange(mel.map((m, i) => ({t: i * q, d: q * .9, m: m - 12, v: .8})), "full");
  assert.deepStrictEqual(low.filter(n => n.h === "R").map(n => n.m), mel);
}
console.log("core ok");
