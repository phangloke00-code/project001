// Offline support: the app works without a connection once opened. Page and code: network first (so a new version shows
// up right away), cache when offline. Piano samples and libraries never change: cache first.
const C = "pv-3.15"; // bump with the app version
const PRE = ["./", "index.html", "core.js", "lib/mp4box.all.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "piano/A0.mp3", "piano/A1.mp3", "piano/A2.mp3", "piano/A3.mp3", "piano/A4.mp3", "piano/A5.mp3", "piano/A6.mp3", "piano/A7.mp3", "piano/C1.mp3", "piano/C2.mp3", "piano/C3.mp3", "piano/C4.mp3", "piano/C5.mp3", "piano/C6.mp3", "piano/C7.mp3", "piano/C8.mp3", "piano/Ds1.mp3", "piano/Ds2.mp3", "piano/Ds3.mp3", "piano/Ds4.mp3", "piano/Ds5.mp3", "piano/Ds6.mp3", "piano/Ds7.mp3", "piano/Fs1.mp3", "piano/Fs2.mp3", "piano/Fs3.mp3", "piano/Fs4.mp3", "piano/Fs5.mp3", "piano/Fs6.mp3", "piano/Fs7.mp3"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(PRE))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/api/")) return;
  const keep = res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); } return res; };
  e.respondWith(/\/(piano|lib)\//.test(u.pathname)
    ? caches.match(r).then(hit => hit || fetch(r).then(keep))
    : fetch(r).then(keep).catch(() => caches.match(r, {ignoreSearch: true}).then(hit => hit || caches.match("index.html"))));
});
