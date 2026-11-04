#!/usr/bin/env python3
"""Local server for the piano-video trainer.

Serves this folder and adds GET /api/yt?url=<YouTube link>, which downloads the video with yt-dlp
(browsers can't fetch YouTube videos themselves). Needs: pip install yt-dlp

    python3 server.py        then open http://localhost:8000/
"""
import glob, http.server, os, shutil, subprocess, sys, tempfile, urllib.parse

HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
# Picture AND sound (the sound gives each note's loudness and pedal); prefer H.264 mp4 so every browser can decode it.
# Joining separate video+audio streams needs ffmpeg; without it take a single file that already has both.
FORMAT = ("bv*[ext=mp4][vcodec^=avc1][height<=720]+ba[ext=m4a]/b[ext=mp4]/b" if shutil.which("ffmpeg")
          else "b[ext=mp4][height<=720]/b[ext=mp4]/b")


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/yt":
            return super().do_GET()
        link = urllib.parse.parse_qs(u.query).get("url", [""])[0]
        p = urllib.parse.urlparse(link)
        if p.scheme not in ("http", "https") or (p.hostname or "") not in HOSTS:
            return self.send_error(400, "Only YouTube links are allowed")
        if not shutil.which("yt-dlp"):
            return self.send_error(500, "yt-dlp is not installed: pip install yt-dlp")
        with tempfile.TemporaryDirectory() as d:
            try:
                r = subprocess.run(["yt-dlp", "--no-playlist", "-f", FORMAT, "--merge-output-format", "mp4", "-o", os.path.join(d, "v.%(ext)s"), "--", link],
                                   capture_output=True, text=True, timeout=900)
            except subprocess.TimeoutExpired:
                return self.send_error(504, "Download timed out")
            files = glob.glob(os.path.join(d, "v.*"))
            if r.returncode or not files:
                msg = (r.stderr or "download failed").strip().splitlines()[-1:] or ["download failed"]
                return self.send_error(502, msg[0].encode("ascii", "replace").decode()[:300])
            path = files[0]
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4" if path.endswith(".mp4") else "video/webm")
            self.send_header("Content-Length", str(os.path.getsize(path)))
            self.end_headers()
            with open(path, "rb") as f:
                shutil.copyfileobj(f, self.wfile)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # 127.0.0.1 only: this endpoint runs downloads on your machine, don't expose it to the network.
    print(f"Open http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
