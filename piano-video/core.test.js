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
const song = [{m: 60, t: 0, d: .5, h: "R"}, {m: 48, t: 0, d: 1, h: "L"}, {m: 64, t: .5, d: .5, h: "R"}];
const back = PV.fromMidi(PV.toMidi(song).buffer);
assert.deepStrictEqual(back.map(n => [n.m, n.t, n.d, n.h]), [[48, 0, 1, "L"], [60, 0, .5, "R"], [64, .5, .5, "R"]]);

console.log("core ok");
