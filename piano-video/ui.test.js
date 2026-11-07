// node piano-video/ui.test.js — 用 Playwright 跑真页面的冒烟测试（发布前跑一下，输出 ui ok）
// 覆盖：旧版 localStorage 数据搬到 IndexedDB、曲库、练习画面、编辑+撤销、声音检查的“漏音”点一下加进来、等我弹的错音提示、备份内容、重新载入后数据还在
const assert = require("assert"), path = require("path"), http = require("http"), fs = require("fs");
const {chromium} = require("playwright");
const root = __dirname, types = {".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".webmanifest": "application/json", ".png": "image/png", ".wasm": "application/wasm"};
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {"content-type": types[path.extname(f)] || "application/octet-stream"}); fs.createReadStream(f).pipe(r); });

(async () => {
  await new Promise(ok => srv.listen(0, "127.0.0.1", ok)); const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 844, height: 390}, acceptDownloads: true, serviceWorkers: "block"}), p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  // 旧版数据：曲子和练习记录都在 localStorage
  const notes = Array.from({length: 40}, (_, i) => ({t: 2 + i * .4, d: .35, m: 55 + (i * 5) % 20, h: i % 3 ? "R" : "L", f: 1 + i % 5, v: .75}));
  await p.goto(url); await p.evaluate(n => { localStorage.clear(); localStorage.setItem("pv-songs", JSON.stringify([{id: "t1", title: "测试曲", notes: n, colors: {L: 95, R: 355}, dur: 18}]));
    localStorage.setItem("pv-att-t1", JSON.stringify([{date: Date.now() - 864e5, acc: 87, mode: "wait", hand: "R", rate: 1, from: 0, to: 5, ev: [], hits: 5, wrong: 1, miss: 0, waits: [], errs: [], wrongAt: [3], missAt: []}])); }, notes);
  await p.reload(); await p.waitForFunction(() => document.querySelector("#songList .song"));
  assert.ok((await p.textContent("#songList")).includes("最好 87%"));
  assert.strictEqual(await p.evaluate(() => localStorage.getItem("pv-songs")), null, "旧数据搬走后要从 localStorage 删掉");
  assert.ok(await p.evaluate(() => DB && CACHE.has("songs") && CACHE.has("att-t1")));

  // 练习：放一会儿
  await p.click("[data-open='0']"); await p.waitForTimeout(300);
  await p.click("#playBtn"); await p.waitForTimeout(800); await p.click("#playBtn");
  assert.ok(await p.evaluate(() => S.t > 0));

  // 编辑：删一个音 → 撤销；声音检查的漏音点一下加进来
  await p.click("#editBtn"); assert.ok(await p.isVisible("#ebar"));
  const n0 = await p.evaluate(() => S.song.notes.length);
  await p.evaluate(() => { S.sel = S.song.notes[0]; ACT.eDel(); }); assert.strictEqual(await p.evaluate(() => S.song.notes.length), n0 - 1);
  await p.click("#undoBtn"); assert.strictEqual(await p.evaluate(() => S.song.notes.length), n0);
  await p.evaluate(() => { const s = S.song; s.ghosts = [{t: 2.2, d: .3, m: 72}]; s.notes[3].q = 1; resetFrom(1.5); ebarSync(); });
  assert.strictEqual(await p.textContent("#chkNext"), "可疑 2 ›");
  await p.waitForTimeout(200);
  const g = await p.evaluate(() => { const r = S.L.ghosts[0], c = cv.getBoundingClientRect(); return {x: c.left + (r[0] + r[2] / 2) / S.L.dpr, y: c.top + (r[1] + r[3] / 2) / S.L.dpr}; });
  await p.mouse.click(g.x, g.y);
  assert.ok(await p.evaluate(() => S.song.notes.some(n => n.m === 72 && n.t === 2.2) && !S.song.ghosts.length));
  await p.click("#ebar [data-act=edit]"); // 完成 → 存一个版本

  // 等我弹：弹错音 → 键盘上提示
  await p.evaluate(() => { S.mode = "wait"; S.hand = "both"; resetFrom(1.9); play(); });
  await p.waitForTimeout(400); await p.evaluate(() => noteOn(30, "tap"));
  assert.strictEqual(await p.evaluate(() => S.hint?.m), 30); await p.evaluate(() => pause());

  // 备份带版本记录和原始版本
  await p.click("#pbar [data-go=lib]"); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("[data-act=backup]")]);
  const bak = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  assert.ok(bak.vers.t1?.length >= 1 && bak.orig.t1?.length === n0 && bak.att.t1.length >= 1);

  // 重新载入：数据在 IndexedDB 里
  await p.reload(); await p.waitForFunction(() => document.querySelector("#songList .song"));
  assert.ok(await p.evaluate(() => songs[0].notes.some(n => n.m === 72) && store.get("ver-t1", []).length >= 1));

  assert.deepStrictEqual(errs, []);
  await b.close(); srv.close(); console.log("ui ok");
})().catch(e => { console.error(e); process.exit(1); });
