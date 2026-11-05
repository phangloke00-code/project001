# project001 交接说明

仓库里有两个独立的网页 app，都是纯前端、不需要构建：

| 目录 | app | 说明 |
|---|---|---|
| `piano-video/` | **落键练琴**（主力，当前 v3.3） | 把“音符从上往下掉”的钢琴教学视频识别成音符，再拿来练习 |
| `index.html`（根目录） | 琴键闯关 | 早期的竖屏闯关学琴页（麦克风听音），目标曲《失眠的夜》；现在基本不动 |

用户说中文，回复用中文。

## 落键练琴：文件

- `piano-video/index.html`：全部界面和流程（导入、校准、识别、播放练习、分析），一个文件。
- `piano-video/core.js`：纯逻辑（无 DOM），浏览器里是 `window.PV`，Node 里 `require`。识别、分手、指法、MIDI、音频对齐、拍子、踏板都在这里。
- `piano-video/core.test.js`：测试，`node piano-video/core.test.js`，输出 `core ok`。改 `core.js` 先在这里加一个能复现问题的用例。
- `piano-video/server.py`：本地服务器 `python3 server.py` → http://localhost:8000 ，多一个 `/api/yt?url=` 用 yt-dlp 下载 YouTube（需要 `pip install yt-dlp`，最好有 ffmpeg）。只监听 127.0.0.1。
- `piano-video/sw.js` + `manifest.webmanifest` + 图标：装到主屏幕、离线可用。
- `piano-video/piano/*.mp3`：Salamander 钢琴采样（每 3 个键一个，CC-BY 3.0）。`lib/mp4box.all.min.js`：极速识别用。

## 识别流程（core.js）

1. 校准：自动找键盘上沿、左右端、黑键位置（`detectBlacks` → `layout`），用户可拖滑块调。
2. 扫描：极速模式 = mp4box 拆帧 + WebCodecs 解码（3:43 的视频约 50 秒）；否则 1×/2×/4× 播放或后台逐帧跳。
3. 每帧取检测线一行像素，`sampleKeys` 判每个键亮不亮（颜色 = 哪只手）。这里规则最多、最容易出“幽灵音”：
   - 黑键在很宽的亮条里，一般是旁边白键的条，不算；同一只手白键+黑键连成一条时，靠黑键条颜色更暗来识别。
   - **v2.8**：黑键中心两边都要有至少 0.2 个白键宽度的亮条才算（修了《失眠的夜》第 28 小节，A3 的深色描边被当成 G#3）。
   - 窄亮条归中心最近的键；太窄（<0.3 键宽）是杂点。
4. `extractNotes`：连续亮的帧 = 一个音；要求上面第二条线先亮（排除静止标题/水印）。
5. 按键会发光的视频：改用琴键本身识别（`barHues`、`barHueNotes`、`stripeShift`、`useKeys`）。
6. `assignHands`（两种颜色 2-means，音高低的是左手）→ `fingering`（Viterbi 自动指法）。
7. 有声音时：`alignAudio` 对齐时间，`audioDynamics` 读力度和延音（踏板），`pedalMarks` 生成踏板提示。
8. 播放时：`beatGrid` 推算速度和小节线。

## 练习功能（index.html）

练习画面固定一屏：下面一条小 bar（‹ 曲库、播放、进度、☰），其它设置都在 ☰ 面板里，点面板外面收起。音符上可显示音名 C–B（“音名”开关），指法号显示在键盘上。画面可以两指捏合左右放大（1–4 倍）。左右手音量 0–200%。

看演示 / 等我弹 / 跟节奏；左手/右手/双手；速度 25–150%；A-B 循环、按小节循环、练熟自动加速；节拍器、预备拍、延音踏板、指法号、全键盘、全屏；输入可用 MIDI 键盘、麦克风、电脑键盘、点屏幕琴键；画面手势（上下拖=进度，单击=播放/暂停，双击左右=±5 秒）；暂停时点音符改指法/换手；练习记录、进步曲线、难点、回放；导出 MIDI；备份/恢复。

**v3.3**：✎ 编辑模式（点音符选中=黄色粗框，拖动 上下=时间/左右=音高/拖上端=长短，选中后点琴键改音，＋音/换手/指法/删除，↶↷ 撤销重做，方向键/Delete/Ctrl+Z/Y）；版本记录 `pv-ver-<id>`（完成编辑自动存，最多 8 个）+ 原始版本 `pv-orig-<id>`（第一次编辑前存）；左右手颜色（7 个低饱和预设 + 自定义，最近 5 个，存 `[色相,饱和度]`）；踏板提示条左/右；设置面板分 练习/声音/显示/曲子 四组、名称一列对齐；进入练习/校准/分析会 `pushState`，手机返回键回曲库。注意：备份文件还不包含版本记录。数据只存在浏览器 localStorage（键名前缀 `pv-`）。

## 发布（改完必须做）

1. **版本号三处一起改**：`index.html` 标题里的 `vX.Y · 日期`、`core.js?v=X.Y`、`sw.js` 里的 `C = "pv-X.Y"`。
2. 跑 `node piano-video/core.test.js`。
3. 提交，推到工作分支，**每次都同时推到默认分支** `claude/inspiring-gates-gza3ne`（用户要求的；手机用的 GitHub Pages 从这里发布；这个仓库没有 `main`）。
4. 更新网页：claude.ai 上的 artifact **落键练琴** https://claude.ai/artifact/3PMPNWuorkYQP8EuMEYQdZ 。
   用 Artifact 工具：先 `read` 这个 url，再 publish，`url` 填它，`file_path` = `piano-video/index.html`，`files` = `{"core.js": "piano-video/core.js"}`（piano/ 和 lib/ 已经在上面，没改就不用重传）。
   嵌在 claude.ai 里的页面不能下载文件、不能用麦克风，页面里已经有提示（让用户用 GitHub Pages / 本地 server.py 版本）。

## 调试识别问题的方法

用户通常发两张截图：我们的画面 vs 原视频，圈出多/漏的音。云端环境下载不了 YouTube（要登录验证），所以：
放大截图量出音符条的位置和宽度 → 在 `core.test.js` 里用 `rowOf` 画一行假像素复现 → 改 `sampleKeys` 等规则 → 测试通过。
提醒用户：已识别的曲子存的是旧结果，要删掉重新识别才会生效。
