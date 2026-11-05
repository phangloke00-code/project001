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
const cols = PV.assignHands(notes);
assert.deepStrictEqual(notes.map(n => n.h), ["L", "R", "L"]);
assert.ok(PV.hueDist(cols.L, G) < 2 && PV.hueDist(cols.R, R) < 2);

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
console.log("core ok");
