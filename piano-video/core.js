// Pure logic for the falling-notes trainer: keyboard layout, video-frame -> notes, hand split, fingering, MIDI.
// Works as a browser global (window.PV) and as a Node module (for core.test.js).
(function (G) {
const BLACK = [0,1,0,1,0,0,1,0,1,0,1,0];
const isBlack = m => BLACK[((m % 12) + 12) % 12] === 1;
const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const nameOf = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// Keys lo..hi (both white) spread over [x0,x1]. blackXs: detected black-key centers from the video, used if the count matches.
function layout(lo, hi, x0, x1, blackXs) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const W = (x1 - x0) / whites.length;
  const off = {1: -.1, 3: .1, 6: -.15, 8: 0, 10: .15}; // black keys sit a little off the white-key boundary
  const keys = []; let wi = 0;
  for (let m = lo; m <= hi; m++) {
    if (!isBlack(m)) { keys.push({m, x: x0 + (wi + .5) * W, w: W, black: false}); wi++; }
    else {
      // each black key takes the dark runs near where it should be (averaged: a lit stripe can split one in two); a key
      // lit in the calibration frame has none and keeps the expected spot, so one miss no longer shifts every key after it
      const ex = x0 + (wi + off[m % 12]) * W, near = (blackXs || []).filter(x => Math.abs(x - ex) < .35 * W);
      keys.push({m, x: near.length ? near.reduce((p, q) => p + q, 0) / near.length : ex, w: W * .6, black: true});
    }
  }
  return keys;
}

// Dark runs in a row of luma across the keyboard = black keys.
function detectBlacks(luma, x0, x1) {
  let mn = 255, mx = 0;
  for (let x = x0; x < x1; x++) { mn = Math.min(mn, luma[x]); mx = Math.max(mx, luma[x]); }
  const thr = (mn + mx) / 2, out = []; let s = -1;
  for (let x = x0; x <= x1; x++) {
    const dark = x < x1 && luma[x] < thr;
    if (dark && s < 0) s = x;
    if (!dark && s >= 0) { if (x - s > 2) out.push((s + x - 1) / 2); s = -1; }
  }
  return out;
}

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx / 255];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function circMean(hs) {
  let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// One row of RGBA pixels -> hue per key (-1 = nothing). A key is lit when the pixel at its center is a bright colored bar
// (the falling-area background is dark/grey). For a black key the lit stretch around it must also be narrow:
// white-key bars are often as wide as the key and reach right up to the black key's center.
function sampleKeys(d, width, keys, vMin = .4, sMin = .25) {
  const px = x => { const i = Math.max(0, Math.min(width - 1, Math.round(x))) * 4; return hsv(d[i], d[i + 1], d[i + 2]); };
  const lit = p => p[1] >= sMin && p[2] >= vMin, ww = keys.find(k => !k.black).w;
  return Int16Array.from(keys, (k, i) => {
    const c = px(k.x); if (!lit(c)) return -1;
    // measure the lit stretch by color only: a key's center often sits on the soft edge of a neighbour's bar
    const same = p => lit(p) && hueDist(p[0], c[0]) < 30;
    let l = 0, r = 0; while (r < 2 * ww && same(px(k.x + r + 1))) r++; while (l < 2 * ww && same(px(k.x - l - 1))) l++;
    const len = l + r + 1, wide = len >= .8 * ww, mid = k.x + (r - l) / 2;
    if (len < .3 * ww) return -1; // too narrow: a stray edge pixel, not a bar
    // a black key inside a wide stretch is usually just a white bar reaching its center -> not lit. But a white bar plus this
    // black key's bar by the same hand merge into one stretch; black-key bars are drawn darker, so a solidly darker patch
    // (5 px, not just a soft edge) under the black key's center, in a stretch under two keys wide, is the black key's note.
    // Its bar spans both sides of its center; a center only a few px inside the stretch is a white bar's darker outline.
    if (k.black && wide) {
      if (Math.min(l, r) < .2 * ww) return -1;
      const wn = [keys[i - 1], keys[i + 1]].find(w => w && !w.black && w.x >= k.x - l && w.x <= k.x + r), vw = wn && px(wn.x)[2];
      const dark = wn && len < 1.6 * ww && [-2, -1, 0, 1, 2].every(o => { const p = px(k.x + o); return same(p) && p[2] < .85 * vw; });
      return dark ? Math.round(c[0]) : -1;
    }
    // a narrow stretch belongs to whichever key its middle is nearest: a narrow bar centered on the black key next door is
    // that black key's note, and the rounded (narrower) end of a white bar is not the black key next to it
    const nb = [keys[i - 1], keys[i + 1]].find(b => b && b.black !== k.black && Math.abs(mid - b.x) < Math.abs(mid - k.x));
    return !wide && nb ? -1 : Math.round(c[0]);
  });
}

// times[i] = video time of frame i; frames[i][k] = hue at key k or -1. A run of lit frames on one key = one note.
// A jump of more than maxGap seconds between frames (browser skipped frames) ends every run, so no note is stretched across it.
// upper (optional): the same samples from a line a little higher up. A falling bar lights that line first; a title,
// watermark or glow that sits still lights both at once, so a note with no earlier light above it is dropped.
function extractNotes(times, frames, keyMs, maxGap = .25, upper = null) {
  const notes = [], N = times.length;
  for (let k = 0; k < keyMs.length; k++) {
    let s = -1, hs = [];
    const fell = k2 => { for (let j = s - 1; j >= 0 && times[s] - times[j] <= 1; j--) if (upper[j][k2] >= 0) return true; return false; };
    const close = (i, end = i < N ? times[i] : times[N - 1] + .03) => {
      if (!upper || fell(k)) notes.push({m: keyMs[k], t: +times[s].toFixed(3), d: +Math.max(.05, end - times[s]).toFixed(3), hue: Math.round(circMean(hs))});
      s = -1; hs = [];
    };
    for (let i = 0; i < N; i++) {
      const h = frames[i][k];
      if (s >= 0 && times[i] - times[i - 1] > maxGap) close(i, times[i - 1] + .03);
      if (h < 0) { if (s >= 0) close(i); continue; }
      if (s >= 0 && hueDist(h, hs[0]) > 40) close(i); // color change with no gap = other hand took over the key
      if (s < 0) s = i;
      hs.push(h);
    }
    if (s >= 0) close(N);
  }
  // a black key lit for a frame or two, wholly inside the same-colored note on the white key next to it, is that bar's
  // edge/outline, not a note: real bars stay on the line for several frames (失眠的夜 bar 28: A3 + a 1-frame G#3)
  const ghost = b => isBlack(b.m) && b.d <= .07 && notes.some(w => !isBlack(w.m) && Math.abs(w.m - b.m) === 1 &&
    hueDist(w.hue, b.hue) < 40 && w.t <= b.t + .001 && w.t + w.d >= b.t + b.d - .001);
  return notes.filter(n => !ghost(n)).sort((a, b) => a.t - b.t || a.m - b.m);
}

// Videos whose pressed keys light up: the key surface is a cleaner signal than the falling bars (hollow neon bars, sparks,
// glow). barHues: per key, hue of the most saturated bright pixel within half a key of its center (-1 = none); hollow
// bars still give their colored edges, so this tells the hands apart where the over-exposed key surface cannot.
function barHues(d, width, keys) {
  const ww = keys.find(k => !k.black).w;
  return Int16Array.from(keys, k => {
    let best = null; const hw = (k.black ? k.w : ww) / 2;
    for (let x = Math.max(0, Math.round(k.x - hw)); x <= Math.min(width - 1, k.x + hw); x++) {
      const p = hsv(d[x * 4], d[x * 4 + 1], d[x * 4 + 2]); if (p[1] >= .4 && p[2] >= .4 && (!best || p[1] * p[2] > best[1] * best[2])) best = p;
    }
    return best ? Math.round(best[0]) : -1;
  });
}
// give each note the hue of the last bar seen above its key in the second before it was pressed
function barHueNotes(notes, times, hues, keyMs) {
  for (const n of notes) {
    const k = keyMs.indexOf(n.m); let i = times.findIndex(t => t > n.t + .05); if (i < 0) i = times.length;
    for (let j = i - 1; j >= 0 && times[j] >= n.t - 1; j--) if (hues[j][k] >= 0) { n.hue = hues[j][k]; break; }
  }
  return notes;
}
// share of very short notes: a detection line that cuts bars into fragments gives far more of them
const fragFrac = ns => ns.length ? ns.filter(n => n.d < .1).length / ns.length : 1;
const useKeys = (line, key) => key.length >= 30 && fragFrac(key) < fragFrac(line) - .15;

// Some videos draw the lit stripe off the key's center (Final Season ED: white keys +3.5 px). Measure it from the notes
// found so far: median centroid of the bright saturated pixels around each key, white and black keys separately, then
// move the keys there. rows[i] = RGBA pixels of the key row at times[i].
function stripeShift(rows, times, width, keys, notes) {
  const ww = keys.find(k => !k.black).w, dev = {w: [], b: []};
  for (const n of notes) {
    const k = keys.find(q => q.m === n.m), i = times.findIndex(t => t >= n.t + n.d / 2); if (!k || i < 0) continue;
    let s = 0, w = 0;
    for (let x = Math.max(0, Math.round(k.x - ww / 2)); x <= Math.min(width - 1, k.x + ww / 2); x++) {
      const r = rows[i], p = hsv(r[x * 4], r[x * 4 + 1], r[x * 4 + 2]), q = p[1] > .5 && p[2] > .5 ? p[1] * p[2] : 0; s += q * x; w += q;
    }
    if (w) dev[k.black ? "b" : "w"].push(s / w - k.x);
  }
  const med = a => a.length >= 10 ? a.sort((x, y) => x - y)[a.length >> 1] : 0, sh = {w: med(dev.w), b: med(dev.b)};
  for (const c in sh) if (Math.abs(sh[c]) < 1 || Math.abs(sh[c]) > .3 * ww) sh[c] = 0;
  return keys.map(k => ({...k, x: k.x + sh[k.black ? "b" : "w"]}));
}

// Two color clusters (2-means on the hue circle); the one with lower average pitch is the left hand.
function assignHands(notes) {
  const res = {L: 95, R: 355};
  if (!notes.length) return res;
  const bins = new Array(36).fill(0); notes.forEach(n => bins[Math.floor(n.hue / 10) % 36]++);
  let c1 = bins.indexOf(Math.max(...bins)) * 10 + 5, c2 = null, best = notes.length * .03;
  bins.forEach((v, i) => { if (hueDist(i * 10 + 5, c1) >= 50 && v > best) { best = v; c2 = i * 10 + 5; } });
  if (c2 == null) { notes.forEach(n => n.h = n.m < 60 ? "L" : "R"); res.L = res.R = c1; return res; } // one color only: split at middle C
  for (let it = 0; it < 6; it++) {
    const A = [], B = []; notes.forEach(n => (hueDist(n.hue, c1) <= hueDist(n.hue, c2) ? A : B).push(n.hue));
    if (A.length) c1 = circMean(A); if (B.length) c2 = circMean(B);
  }
  let s1 = 0, n1 = 0, s2 = 0, n2 = 0;
  notes.forEach(n => { n.c = hueDist(n.hue, c1) <= hueDist(n.hue, c2) ? 1 : 2; if (n.c === 1) { s1 += n.m; n1++; } else { s2 += n.m; n2++; } });
  const oneIsLeft = s1 / (n1 || 1) < s2 / (n2 || 1);
  notes.forEach(n => { n.h = (n.c === 1) === oneIsLeft ? "L" : "R"; delete n.c; });
  res.L = Math.round(oneIsLeft ? c1 : c2); res.R = Math.round(oneIsLeft ? c2 : c1);
  return res;
}

// Notes starting within `tol` seconds of each other form one chord/group.
function groupByOnset(notes, tol = .05) {
  const gs = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const g = gs[gs.length - 1];
    if (g && n.t - g.t <= tol) g.notes.push(n); else gs.push({t: n.t, notes: [n]});
  }
  return gs;
}

// Auto fingering: Viterbi over each hand's notes (chords low->high), 5 fingers per note, cost = hand stretch + crossings.
// The left hand is mirrored (pitch negated) so the thumb is always on the "low" side.
const IDEAL = {12: 2, 13: 3.5, 14: 5.5, 15: 7.5, 23: 2, 24: 3.5, 25: 5.5, 34: 1.5, 35: 3.5, 45: 1.5}; // comfortable semitones between fingers
function moveCost(f1, f2, d, chord) {
  const ideal = (a, b) => IDEAL[a * 10 + b];
  if (chord) return f2 > f1 ? Math.abs(d - ideal(f1, f2)) : 50;
  if (d === 0) return f1 === f2 ? 0 : .5;
  if (f1 === f2) return 3 + .3 * Math.abs(d);
  if (d > 0 && f2 > f1) return Math.abs(d - ideal(f1, f2));
  if (d < 0 && f2 < f1) return Math.abs(-d - ideal(f2, f1));
  if (d > 0 && f2 === 1) return f1 === 5 ? 8 : 2 + (f1 === 4 ? .5 : 0) + .5 * Math.abs(d - 1.5);   // thumb passes under
  if (d < 0 && f1 === 1) return f2 === 5 ? 8 : 2 + (f2 === 4 ? .5 : 0) + .5 * Math.abs(-d - 1.5);  // finger crosses over thumb
  return 10;
}
function fingering(notes) {
  for (const h of ["L", "R"]) {
    const p = n => h === "R" ? n.m : -n.m, seq = [], chordStart = [];
    for (const g of groupByOnset(notes.filter(n => n.h === h))) { g.notes.sort((a, b) => p(a) - p(b)).forEach((n, i) => { seq.push(n); chordStart.push(i === 0); }); }
    if (!seq.length) continue;
    let cost = [0, 0, 0, 0, 0]; const back = [];
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i], d = p(b) - p(a), chord = !chordStart[i];
      const free = !chord && (Math.abs(d) > 12 || b.t - (a.t + a.d) > .8); // hand has time/room to reposition
      const nc = [], bk = [];
      for (let f2 = 1; f2 <= 5; f2++) {
        let best = Infinity, bf = 0;
        for (let f1 = 1; f1 <= 5; f1++) {
          let c = moveCost(f1, f2, d, chord) * (free ? .1 : 1) + cost[f1 - 1];
          if (f2 === 1 && isBlack(b.m)) c += 1.5;
          if (c < best) { best = c; bf = f1; }
        }
        nc.push(best); bk.push(bf);
      }
      cost = nc; back.push(bk);
    }
    let f = cost.indexOf(Math.min(...cost)) + 1;
    for (let i = seq.length - 1; i >= 0; i--) { seq[i].f = f; if (i) f = back[i - 1][f - 1]; }
  }
  return notes;
}

// ---- Standard MIDI file: write (R = track 1 / ch 1, L = track 2 / ch 2, 120 bpm) and read ----
function vlq(n) { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }
function toMidi(notes) {
  const TPS = 960; // 480 ticks per beat at 120 bpm
  const track = (h, ch, tempo) => {
    const ev = [];
    notes.filter(n => n.h === h).forEach(n => { ev.push([Math.round(n.t * TPS), 0x90 | ch, n.m, Math.round((n.v ?? .63) * 127)], [Math.round((n.t + n.d) * TPS), 0x80 | ch, n.m, 0]); });
    ev.sort((a, b) => a[0] - b[0] || (a[1] & 0xf0) - (b[1] & 0xf0)); // note-off before note-on on the same tick
    const out = tempo ? [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20] : []; let last = 0;
    for (const [t, ...msg] of ev) { out.push(...vlq(t - last), ...msg); last = t; }
    out.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, out.length >>> 24, (out.length >> 16) & 255, (out.length >> 8) & 255, out.length & 255, ...out];
  };
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0, ...track("R", 0, true), ...track("L", 1, false)]);
}
function fromMidi(buf) {
  const b = new Uint8Array(buf), u32 = i => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0, u16 = i => b[i] << 8 | b[i + 1];
  if (u32(0) !== 0x4d546864) throw new Error("不是 MIDI 文件");
  const ntr = u16(10), div = u16(12);
  if (div & 0x8000) throw new Error("不支持 SMPTE 时间格式的 MIDI");
  let pos = 8 + u32(4); const tempos = [], raw = [], ped = [];
  for (let tr = 0; tr < ntr && pos < b.length; tr++) {
    const len = u32(pos + 4); let i = pos + 8; const end = i + len; let tick = 0, rs = 0; const on = {};
    const rd = () => { let v = 0, c; do { c = b[i++]; v = v << 7 | c & 127; } while (c & 128 && i < end); return v; };
    while (i < end) {
      tick += rd(); let st = b[i];
      if (st & 128) i++; else st = rs;
      if (st === 0xff) { const type = b[i++], l = rd(); if (type === 0x51) tempos.push([tick, b[i] << 16 | b[i + 1] << 8 | b[i + 2]]); i += l; continue; }
      if (st === 0xf0 || st === 0xf7) { i += rd(); continue; }
      rs = st; const hi = st & 0xf0, ch = st & 15, d1 = b[i++], d2 = hi === 0xc0 || hi === 0xd0 ? 0 : b[i++];
      const k = ch * 128 + d1;
      if (hi === 0xb0 && d1 === 64) ped.push([tick, d2 >= 64]); // sustain pedal
      else if (hi === 0x90 && d2 > 0) (on[k] = on[k] || []).push([tick, d2]);
      else if ((hi === 0x80 || hi === 0x90) && on[k] && on[k].length) { const [a, v] = on[k].shift(); raw.push({tr, ch, m: d1, a, v, z: tick}); }
    }
    pos = end;
  }
  tempos.sort((x, y) => x[0] - y[0]); if (!tempos.length || tempos[0][0] > 0) tempos.unshift([0, 500000]);
  const sec = tick => { let s = 0, i = 0; for (; i + 1 < tempos.length && tempos[i + 1][0] <= tick; i++) s += (tempos[i + 1][0] - tempos[i][0]) * tempos[i][1]; return (s + (tick - tempos[i][0]) * tempos[i][1]) / div / 1e6; };
  ped.sort((x, y) => x[0] - y[0]);
  const pedRing = z => { let i = -1; while (i + 1 < ped.length && ped[i + 1][0] <= z) i++; if (i < 0 || !ped[i][1]) return 0;
    const up = ped.find(e => e[0] > z && !e[1]); return +Math.min(3, (up ? sec(up[0]) : sec(z) + 3) - sec(z)).toFixed(1); }; // seconds the pedal keeps it ringing
  const trs = [...new Set(raw.map(n => n.tr))].sort((x, y) => x - y);
  const notes = raw.map(n => ({m: n.m, t: +sec(n.a).toFixed(3), d: +Math.max(.05, sec(n.z) - sec(n.a)).toFixed(3), v: +(n.v / 127).toFixed(2),
    s: ped.length ? pedRing(n.z) : undefined,
    h: trs.length >= 2 && trs.indexOf(n.tr) < 2 ? (trs.indexOf(n.tr) === 0 ? "R" : "L") : n.m < 60 ? "L" : "R"})); // 1st track = right hand (Synthesia convention)
  return notes.sort((x, y) => x.t - y.t || x.m - y.m);
}

// ---- the video's own sound: line notes up with it, then read how hard each note was played and how long it rang ----
const HANN = {};
function bandAmp(x, sr, t, m) { // strength of pitch m (first 3 harmonics) in a ~46 ms window around time t
  const N = 1024, w = HANN[N] || (HANN[N] = Float32Array.from({length: N}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1))));
  const c = Math.round(t * sr) - N / 2; if (c < 0 || c + N > x.length) return 0;
  const f = 440 * 2 ** ((m - 69) / 12); let sum = 0;
  for (let h = 1; h <= 3 && f * h < sr / 2 - 200; h++) {
    const k = 2 * Math.cos(2 * Math.PI * f * h / sr); let s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) { const s0 = x[c + i] * w[i] + k * s1 - s2; s2 = s1; s1 = s0; }
    sum += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
  }
  return sum;
}
// seconds to add to note times so each note's own pitch starts sounding there (searched within +-range). Uses pitch, not
// overall loudness: in steady rhythms loudness jumps repeat every beat and would match at the wrong beat too.
function alignAudio(x, sr, notes, range = .6) {
  const pick = notes.filter((_, i) => i % Math.max(1, Math.floor(notes.length / 300)) === 0);
  let best = 0, bs = -Infinity;
  for (let o = -range; o <= range + 1e-9; o += .02) {
    let s = 0; for (const n of pick) s += bandAmp(x, sr, n.t + o + .03, n.m) - bandAmp(x, sr, n.t + o - .05, n.m);
    if (s > bs) { bs = s; best = o; }
  }
  return +best.toFixed(2);
}
// n.v = how hard (0.3..1, 0.75 = typical for that register), n.s = seconds it keeps ringing after release (pedal), from audio x
function audioDynamics(x, sr, notes) {
  const a0 = notes.map(n => Math.max(bandAmp(x, sr, n.t + .03, n.m), bandAmp(x, sr, n.t + .07, n.m)));
  const med = m => { const v = a0.filter((_, i) => Math.abs(notes[i].m - m) <= 6).sort((a, b) => a - b); return v[v.length >> 1] || 1; }, M = {};
  notes.forEach((n, i) => {
    const r = a0[i] / (M[n.m] ??= med(n.m));
    n.v = +Math.min(1, Math.max(.3, .75 * Math.sqrt(r))).toFixed(2);
    let s = 0; while (s < 3 && bandAmp(x, sr, n.t + n.d + s + .1, n.m) > .2 * a0[i]) s += .1;
    n.s = +s.toFixed(1);
  });
  return notes;
}

// Beat grid from note onsets: p = seconds per beat (60..160 BPM), t0 = time of a downbeat, 4 beats per bar.
// The period whose phase the onsets agree on most wins; the downbeat is the beat slot with the most (and lowest, loudest) notes.
function beatGrid(notes) {
  const on = groupByOnset(notes).map(g => ({t: g.t, w: g.notes.length + g.notes.filter(n => n.m < 55).length}));
  if (on.length < 8) return null;
  let best = null;
  const T = on[on.length - 1].t - on[0].t + 1;
  // fine steps: over a whole song a tiny tempo error adds up, so the true peak is very narrow (step ~ 1/20 cycle drift)
  for (let p = .375; p <= 1; p *= 1 + .05 * p / T) {
    let x = 0, y = 0, W = 0; for (const o of on) { const a = 2 * Math.PI * o.t / p; x += o.w * Math.cos(a); y += o.w * Math.sin(a); W += o.w; }
    const sc = Math.hypot(x, y) / W; if (!best || sc > best.sc + 1e-9) best = {sc, p, ph: Math.atan2(y, x)};
  }
  const {p} = best, t0 = ((best.ph / (2 * Math.PI)) * p + p) % p, slot = [0, 0, 0, 0];
  for (const g of groupByOnset(notes)) { const k = Math.round((g.t - t0) / p); if (Math.abs(g.t - t0 - k * p) < .25 * p) slot[((k % 4) + 4) % 4] += g.notes.length + 3 * g.notes.filter(n => n.m < 45).length; }
  const d = slot.indexOf(Math.max(...slot));
  return {p: +p.toFixed(4), t0: +(t0 + d * p).toFixed(3), bpb: 4, bpm: Math.round(60 / p)};
}
// Pedal hints [[down, up], ...] from n.s (seconds a note rings on after release = pedal held).
// At each onset: if most notes that were ringing only by the pedal stop right there, the player changed pedal (lift + press);
// if nothing pedaled is ringing any more, the pedal was up.
function pedalMarks(notes) {
  const P = notes.filter(n => n.s >= .3), out = []; let cur = null;
  for (const g of groupByOnset(P)) {
    const ring = P.filter(n => n.t + n.d <= g.t + .05 && n.t + n.d + n.s > g.t - .1), cut = ring.filter(n => n.t + n.d + n.s < g.t + .3).length;
    if (!cur || cur[1] < g.t - .1 || ring.length && cut >= .6 * ring.length) { if (cur) cur[1] = Math.min(cur[1], g.t); out.push(cur = [g.t, g.t]); }
    for (const n of g.notes) cur[1] = Math.max(cur[1], n.t + n.d + n.s);
  }
  // also change wherever the left-hand bass moves to a new note (the usual rule for pianists); drop slivers < .4 s
  let pb = -1; const ch = [];
  for (const g of groupByOnset(notes.filter(n => n.h === "L"))) { const b = Math.min(...g.notes.map(n => n.m)) % 12; if (b !== pb) ch.push(g.t); pb = b; }
  const res = [], add = (a, b) => { const p = res[res.length - 1]; if (p && p[1] === a && p[1] - p[0] < .4) p[1] = b; else res.push([a, b]); };
  for (const [a, b] of out) { let s0 = a; for (const c of ch) if (c > s0 + .5 && c < b - .3) { add(s0, c); s0 = c; } add(s0, b); }
  return res;
}
const barOf = (g, t) => Math.floor((t - g.t0) / (g.p * g.bpb) + 1e-6) + 1; // bar number (1 = the bar starting at t0)
const barTime = (g, b) => g.t0 + (b - 1) * g.p * g.bpb;

const PV = {isBlack, nameOf, NAMES, layout, detectBlacks, hsv, hueDist, sampleKeys, extractNotes, assignHands, groupByOnset, fingering, toMidi, fromMidi, bandAmp, alignAudio, audioDynamics, beatGrid, barOf, barTime, barHues, barHueNotes, fragFrac, useKeys, stripeShift, pedalMarks};
if (typeof module !== "undefined") module.exports = PV; else G.PV = PV;
})(typeof window !== "undefined" ? window : globalThis);
