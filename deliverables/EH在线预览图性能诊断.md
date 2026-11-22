# EH 在线预览图为什么比原站慢 —— 代码级诊断

> 诊断对象：`exhentai-manga-manager`（Electron 26 桌面版 + web-server 网页版）  
> 对照样本：`https://e-hentai.org/g/4347685/4fee639e33/`  
> 对照实现：`JHenTai-8.0.16-334`（Flutter/Dart，同一网络下预览图为瞬时）  
> 结论日期：2026-11-22

---

## 0. 一句话结论

**不是图片多、也不是缓存没做，而是"取图通道"本身。**

EM 的每一张缩略图都要经历「渲染进程 → 自定义协议 → 主进程 → 代理 CONNECT → 上游」，而且**这条代理链路根本没有连接复用**——每个请求都要重新做一次 TCP + CONNECT + TLS 握手；打开详情时还会**主动把整本预览分页（最多 40 页）全部预取下来**。原站与 JHenTai 则是「一次连接拉完 + 只取视口可见」。

---

## 1. 链路对比（首屏 20~40 张缩略图）

| 环节     | 原站（浏览器）         | JHenTai                   | EM（桌面版）                                    |
| ------ | --------------- | ------------------------- | ------------------------------------------ |
| 图片由谁发起 | 渲染/网络进程         | Flutter 图片栈               | 渲染进程 → **主进程**（自定义协议）                      |
| 连接     | HTTP/2，一条连接多路复用 | 共享 HttpClient（keep-alive） | **每请求新建** TCP+CONNECT+TLS（见 B1）            |
| 抓多少    | 只抓视口内           | 只 build 视口内               | 首屏 + **整本分页预取**（见 B2）                      |
| 图片缓存   | 浏览器 HTTP + 解码缓存 | extended_image 内存/磁盘      | 已有 mem+disk（这块不弱）                          |
| 中间拷贝   | 0 次             | 0 次                       | 至少 2 次（chunk 列表 → Buffer → ReadableStream） |



---

## 2. 五个根因（按对首屏的影响排序）

### B1 🔴 代理链路没有连接复用（高，已证实）

`modules/ehLogin.js:110-119`：

```js
a = new HttpsProxyAgent(key, { keepAlive: true, maxSockets: 8, maxFreeSockets: 4 })
```

这三个选项**全是无效的**：

- `node_modules/agent-base/dist/src/index.js:24` 原文：`No pooling/keep-alive is implemented by default.`
- 同文件 `addRequest` 里写死 `req._last = true; req.shouldKeepAlive = false;`
- `node_modules/https-proxy-agent/dist/index.js:75-95` 每次 `connect()` 都 `net.connect()` / `tls.connect()`；`:106-109` 恒发 `Proxy-Connection: close`（`this.keepAlive` 永远是 undefined）

所以 `agentFor()` 的缓存只省了「对象构造」，省不掉握手：**每个 HTML / 每张图 = 1×TCP + 1×CONNECT 往返 + 1×TLS 握手**。

首屏 20 张缩略图 = 20 次握手；一本 1200 页的画廊预取 39 个分页 + 数百张图 = 数百到上千次握手。

### B2 🔴 打开详情就把整本分页全预取（高，已证实）

- `src/ehOnline.js:394-436`：`maxPages = 40`、并发 6，`?p=1..39` 一次飞 6 个。
- `src/components/BookDetailDialog.vue:1233-1251`：只判 `previewTotal > firstThumbs.length` 就启动，不 await。

EH 的预览分页每页张数由账号的「缩略图尺寸」决定（20/40/50/100/200/400），而 EM 在 `collectGalleryThumbs` 里把 `perPage` 写死成 20（`ehOnline.js:396`），页数会算多，实际抓取量在 **800～4000 张**之间（视设置）。

浏览器打开同一个 URL 只抓 **1 个** HTML。

### B3 🔴 侧边详情：同一张雪碧图被拆成 20 个 URL（高，仅侧栏）

`src/components/SideDetailPanel.vue:866`：

```js
backgroundImage: 'url(' + ehImageSrc(th.thumb, '', th.href || th.pageUrl || '') + ')'
```

雪碧图的 20 个格子共用同一张图，但每格的 `r=`（referer）不同 → 20 个不同 URL → 20 个请求同时发出，全部缓存 miss → **同一张图下载 20 遍**，每遍还要各自握手（B1）。

对照 `BookDetailDialog.vue:1174` 的 `ehImageSrc(th.thumb)` —— 弹窗那条是对的，**修的时候不要动它**。

### B4 🔴 一张失败的缩略图能钉死 1/12 并发槽近 60 秒（高，已证实）

`index.js:1821-1830`：图片被 403/429/509 拒绝时，走「回图片页换节点」分支，调用：

```js
await ehLogin.resolvePageImageInfo(pageRef, { proxy, cookie, reloadKey: '' })
```

- 弹窗场景前端**不带 `r=`** → `pageRef` 退化成 `https://e-hentai.org/`（`index.js:1799`）→ 拿**站点首页**当图片页解析，天然解析不出 `#img`，换了也白换；
- 该调用**没有传 `timeout` / `retries`** → 走默认 **20s × 3 次**（`ehLogin.js:663-666` + `requestOnce` 默认 `retries = 2`）→ 最坏 60s；
- 期间并发槽一直被占（`ehImgAcquire`），且失败后会再试一次同一个 URL。

后果：只要 EH 的缩略图 CDN 开始 429/509（12 并发裸握手很容易触发），首屏就会整段停住一分钟以上。这与「先一直转圈、然后突然全出来」的现象完全吻合。

**真因（M9）**：`index.js:1749` 的 `isEhImg` 用的是**宽正则** `EH_IMG_HOST_RE`（`index.js:83`，含 `ehgt.org` / `e-hentai.org` / `exhentai.org`），而「换 H@H 节点」这件事只有 `*.hath.network` 才有意义 —— `modules/ehLogin.js:83` 的 `isEhImageHost()` 才是那个窄判据。于是 `ehgt.org` 的雪碧图一旦 403，也会去「换节点」：拿站点根页解析必然拿不到 `#img`，白等 60s，再拿同一个地址撞一次。

**修法（一行）**：把 `index.js:1824`、`1840`（以及「200 但回 HTML」的 `1903`）的条件从 `isEhImg` 换成 `ehLogin.isEhImageHost(raw)`。**不要**按「给 20 格各带 referer」去修 —— 那会在弹窗里复刻 B3（同一张图 20 个 URL）。

### M2 🟡 桌面版图片并发槽：无超时、无上限、不可取消（中，已证实）

`index.js:130-136` 是裸 Promise（`ehImgWaiters.push(resolve)`）；网页版有 12s 超时 + 64 队列上限（`web-server.js:702-772`），桌面版没有。慢节点会把 12 个槽占死，队列无限增长，切书也不中断。

### M5 🟡 详情弹窗里「在线书」的加载更多是死路（中，功能性缺陷）

`BookDetailDialog.vue:1411`：`if (currentPreviewBook) loadLocalPreview(...)`，而在线分支从不给 `currentPreviewBook` 赋值 → 哨兵触发后什么也不做。结果：预取到 40 页就停，1200 页的漫画永远停在 `800/1200`，用户滑到底没有任何反应。

### M7 🟡 两套页面缓存，好的那套被绕开了（中，已证实）

- `modules/ehLogin.js:317-354`：`pageCache`，TTL **1 小时**、key **含 cookie**、忽略 `nl/keystamp/fileindex` —— 这套是对的。
- `index.js:4487-4520`：`exWebpageCache`，TTL **60 秒**、key **不含 cookie**。
- 但 `get-ex-webpage` 走的是 `node-fetch`（`index.js:4562`），**根本不经过 `ehLogin.request`**，所以那套 1 小时的缓存对「详情页 / 预览分页」完全不起作用。

后果：同一本漫画关掉再点开（超过 60s）就要把详情页 + 全部分页重新抓一遍；切账号后 60s 内还会串内容。

### M8 🟡 详情页请求的特征「一眼假」：UA 是 node-fetch/1.0、没有 Referer（中，已证实）

`index.js:4593-4595` 的 `fetchOnce` 只传了 `Cookie`：

- `node-fetch@2` 在调用方没给 `User-Agent` 时会填 `node-fetch/1.0 (+https://github.com/bitinn/node-fetch)`；
- 也没有 `Referer`。

EH 侧会按请求特征区别对待（`ehLogin.js:454-468` 的 `cf-mitigated` 分支就是被它触发的）。补 Chrome UA + `Referer: <站点根>` 是 2 行改动，能减少被限速/挑战页的概率。

（附带结论：`node-fetch` 默认 `compress: true`，会自动加 `Accept-Encoding: gzip,deflate` 并解压，所以详情页 HTML 线上只有 30–90KB —— **传输量从来不是瓶颈，请求条数与握手次数才是**。）

---

## 3. 为什么原站是「瞬间」

1. **HTTP/2**：20 张缩略图复用一条已建立的连接，并发多路复用，无握手。
2. **HTTP 缓存**：`ehgt.org` 的缩略图带长缓存头，第二次打开是 0 请求。
3. **只请求可见**：视口外的图不发请求。
4. **一次 TLS 会话**：同域多资源共用一个连接，不像 EM 每张图重开。

---

## 4. JHenTai 为什么也是「瞬间」

| 能力                                | 证据                                                                                            | 性质            |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| 图片由 App 图片栈直接发起，无中间进程             | `lib/src/widget/eh_image.dart:210-214` `ExtendedNetworkImageProvider`                         | Flutter 运行时红利 |
| 共享 HttpClient（默认 keep-alive、按需并发） | 同上（extended_image 内部单例 client）                                                                | Flutter 运行时红利 |
| 预览区按视口懒构建                         | `lib/src/pages/details/details_page.dart:1379-1435` `SliverGrid + SliverChildBuilderDelegate` | 策略            |
| 滚到底才拉下一页                          | `lib/src/pages/details/details_page_logic.dart:301-347`                                       | 策略            |
| 打开详情只解析首页                         | 同上 `nextPageIndexToLoadThumbnails = 1`                                                        | 策略            |
| 图片按 URL 去重（雪碧图 10 格只下一次）          | `lib/src/widget/eh_thumbnail.dart` + Flutter ImageCache                                       | 运行时红利         |

---

## 5. 能不能直接复用 JHenTai 的代码？

**不能直接复用。** Dart/Flutter 与 Electron/Vue 运行时不同，`extended_image`、`dio`、Sliver 布局都没有可 import 的 JS 对应物，零行可直接拷贝。

**能复用、而且值得复用的是它的三条策略：**

| JHenTai 概念                        | EM 落点                                               | 判定                               |
| --------------------------------- | --------------------------------------------------- | -------------------------------- |
| 连接复用（共享 HttpClient）               | `modules/ehLogin.js:110` agentFor / `index.js:4571` | **可移植（收益最大）**                    |
| 按视口懒构建                            | `BookDetailDialog.vue:465` 预览格子                     | **可移植（收益大）**                     |
| 滚到底再拉分页                           | `src/ehOnline.js:394` collectGalleryThumbs          | **可移植（收益大）**                     |
| 同 URL 去重                          | `SideDetailPanel.vue:866`                           | **可移植（修 B3）**                    |
| 磁盘/内存图片缓存                         | `modules/ehImageCache.js`                           | 已具备（比 JHenTai 更强）                |
| `#gdt` 解析（含 isLarge 判定）           | `src/ehOnline.js:275`                               | 已具备                              |
| sourceRect 裁图、Codec 暂停、ImageCache | —                                                   | 不值得（CSS background-position 已等价） |

---

## 6. 改造方案

### 先做哪一步：两类收益是互斥的

- 若先做 **B2 / B3 / B5**（把请求条数从「39 页 + 19 张背景图 + 20× 重复」砍到「1 页 + 1 张」），那么 **B1 的握手税几乎自动归零**——只剩 1 页 + 1 张图 ≈ 0.25–0.5s。
- 反之，如果因为产品原因保留「打开即看完整本缩略图」，那 **B1 必须提到最前**，否则没人替那 20–480 次握手买单。

不写清这一点，最容易出现的返工是：先花大力气换掉代理实现（B1，风险最高），做完发现首屏几乎没变——因为真正多出来的请求还在。

### P0（改动小、收益最大）

1. **换节点判据收窄（一行，最先做）**：`index.js:1824/1840/1903` 的 `isEhImg` → `ehLogin.isEhImageHost(raw)`。消除「一张 403 缩略图钉死槽位 60–90 秒」。改完再谈别的。
2. **让代理连接真正复用**（对应 B1）
   - 方案 A：引入 `undici`，用 `ProxyAgent({ uri, connections: 32 })` + `undici.request`；
   - 方案 B（推荐，无新依赖）：图片与 HTML 都改走 Electron `net.request`，配合  
     `session.setProxy({ proxyRules, proxyBypassRules: '*.hath.network' })` —— Chromium 自带 HTTP/2、连接池、磁盘缓存。
   - 预期：单张缩略图从「握手占大头」变成「复用连接」，首屏 20 张从 2 批 × 3~4 RTT 降到 1 批 1 RTT。
3. **预取改按需**（对应 B2/M5）：首屏只保留详情页返回的那一批；`?p=N` 由哨兵到底再拉 1 页、并发 2。
4. **侧栏去掉 per-cell `r=`**（对应 B3）：雪碧图不需要 referer，改成 `ehImageSrc(th.thumb)`。

### P1

1. 桌面版 `ehImgAcquire` 加 12s 超时 + 64 队列上限（照 `web-server.js:702`），并让首屏请求插队。
2. 图片超时改成「总时长」：现在 `reqOptions.timeout` 是 socket 空闲超时（`ehLogin.js:190/256`），慢节点可以占槽上百秒。
3. `exWebpageCache` 的 key 加上 cookie 摘要、TTL 提到 5–10 分钟（`index.js:4494`）。

### P2

1. 预览区虚拟化（`content-visibility: auto` 或只渲染前 N 段）。
2. 补上在线书的「加载更多」分支（`BookDetailDialog.vue:1411`）。

### 预期总账（三条一起做）

| 指标           | 现状       | 改后                           |
| ------------ | -------- | ---------------------------- |
| 首屏可见时间（估算）   | 0.8–2.3s | 0.4–0.9s（与原站 0.25–0.7s 同一量级） |
| 打开一次详情的页面请求数 | 1 + 39   | 1                            |
| 首屏字节         | 3–16MB   | 0.15–0.6MB                   |

单做「连接复用」约省 2.5–5.6s 握手税；单做「懒加载 + 按需分页」约省 20–50× 字节。

⚠️ 落地顺序：**先给哨兵补 online 分支，再改按需分页**。否则会把「在线分页」接到「本地解压」那条路径上（`loadMorePreview` 现在正是被这个耦合废掉的）。

---

## 7. 怎么验证（不用改业务代码）

1. **数请求**：网页版打开 DevTools → Network 筛 `ex-image`，看同一个 `url` 参数出现几次（弹窗应为 1，侧栏现在是 20）。
2. **看缓存**：响应头 `X-Img-Cache: mem|disk|miss`。
3. **验证 B1**（最直接）：请求前 `netstat -ano | findstr :7890` 数一下 ESTABLISHED，请求后再数一次——不复用的话连接数会随请求数线性增长。
4. **A/B 判定瓶颈在握手还是带宽**：把 `EH_IMG_MAX_CONCURRENCY` 从 12 临时改成 2，若总耗时几乎不变，说明瓶颈在每次请求的固定开销（握手），不是在带宽。

---

## 8. 实施记录（2026-11-22）

以下改动已落在工作区，`node --check` ×4 / `npx eslint` / `npx vite build` 均通过。

| 编号 | 落点 | 做法 |
|---|---|---|
| M9/B4 | `index.js`（图片协议 3 处）、`web-server.js`（3 处） | 换节点判据从宽（4 域名）收窄为 `ehLogin.isEhImageHost()`，只有 `*.hath.network` 才回图片页换节点 |
| B2/M5 | `src/ehOnline.js`、`BookDetailDialog.vue`、`SideDetailPanel.vue` | 新增 `fetchGalleryThumbsPage()`（一次一页）；删除 `collectGalleryThumbs`；弹窗补 online 分支，哨兵驱动逐页追加 |
| B3 | `SideDetailPanel.vue` | 雪碧图整本共用 `book.url` 当 referer（20 个 URL → 1 个）；wnacg 仍按每格，行为不变 |
| B5 | 两个组件的预览格 | `content-visibility: auto` + `contain-intrinsic-size: auto <w> <h>` |
| M2 | `index.js` `ehImgAcquire` | 12s 排队超时 + 64 队列上限，超时/满队列回 503 |
| M3 | `modules/ehImageCache.js` | `get()` 改 async（stat/readFile/utimes），两处调用点均 await |
| M4 | `index.js`、`web-server.js` | 内存 Map 只收 ≤512KB；整包攒下来落盘的上限改为磁盘单张上限（4MB） |
| M6 | `modules/ehLogin.js` + 图片路径 | 新增 `totalTimeout`（总时长，流式/缓冲都会清定时器），图片路径传 20s |

**关于总时长的最终口径（易被误读，记在这里）**：

- 预算在 `requestOnce` **入口**算一次，重试共用（`total-timeout` 不再重试），所以 20s 是「整个请求」而不是「每次尝试」。
- **拿到响应头之后**，流式响应按体积重算：`min(180s, max(20s, content-length / 50KB/s))`。
  300KB→20s、1.5MB→30.7s、4MB→80s、8MB→160s、更大或**体积未知（分块传输，代理可能剥掉 Content-Length）→ 封顶 180s**。
- 因此「传了 `totalTimeout: 20000` 却跑了 80 秒」不是 bug：那是一条按 50KB/s 以上速度在正常传的 4MB 大图。
  真正「完全不出数据」的坏节点由 `req.on('timeout')`（socket 空闲 15s）兜住，不受这条影响。
| M1/M7/M8 | `index.js` `get-ex-webpage` | 缓存键 = URL + cookie 的 md5，TTL 60s→5min；补 Chrome UA / Accept-Language / 站点根 Referer；`BROWSER_UA` 从 `ehLogin` 导出复用 |
| B1（直连半） | `modules/ehLogin.js` | 直连时挂 `https.Agent({keepAlive})`；代理隧道池化未做（`agent-base` 不池化，硬改会破坏隧道生命周期），已在注释里写明 |
| L2 | 两个组件 | `previewItems` 改增量 append；侧栏 `syncOnlinePreview` 返回真实新增条数 |
| L3 | `src/ehOnline.js` | 分页 URL 改用 `URL.searchParams.set('p', n)` |
| L4 | `modules/ehLogin.js` | 删除死代码 `EH_IMAGE_HOST_RE_JS` |
| 额外 | `modules/ehImageCache.js` `keyOf` | 修复「路径段形式的 keystamp 抹不掉」——这是「磁盘缓存跨会话有效」的前提；改后老缓存一次性失效 |

未做：**代理隧道连接池化**（B1 的另一半）。理由与触发条件见第 6 节「两类收益互斥」——先把请求条数砍到 1 页 + 1 图，它的收益已被摊薄；若后续仍要提速，再单独立项（需要改 Electron 网络栈或引入 undici，风险面是整个 EH 出网）。

---

## 9. 第二轮：结构性改造（去掉跨进程转发 + 连接复用）

第一轮把「请求条数」对齐到了 1 页 + 1 图，但取图路径仍是「渲染进程 → emm-eh 自定义协议 → 主进程 Node https → 代理隧道」。第二轮把这条路径整体交给 Chromium。

| 项 | 做法 | 效果 |
|---|---|---|
| 图片发起方 | `ehImageSrc()` 在「桌面 + 无 tracker + EH 三域（`hath.network`/`ehgt.org`/`e-hentai.org`）」时**直接返回原 https 地址**，由 `<img>` 交给 Chromium 网络栈 | 去掉一次跨进程转发；拿回 Chromium 的连接池、并发调度、HTTP 缓存 |
| 代理复用 | 复用已有的 `session.setProxy`，补 `proxyBypassRules: '*.hath.network'` | 缩略图走用户代理，H@H 原图仍直连，且由 Chromium 统一复用连接 |
| Referer | `webRequest.onBeforeSendHeaders`（仅 `types: ['image']`，仅 `ehgt.org` / `e-hentai.org`）补 `Referer: https://e-hentai.org/` | 图床校验收图来源；不碰导航/XHR |
| 失败回退 | 预览按 URL 记失败 → 切 `ehProxyImageSrc()`（老路径）；封面在 `BookCard` 里同样一次性切回代理 | 直连不通时退回改造前的行为，不会比原来差 |
| 不直连的两种 | 阅读器（带 tracker，需要进度回推）与 **exhentai 域**（需 sadpanda Cookie，`defaultSession` 无登录态，直连必 403） | 避免「注定失败再回退」的额外请求 |
| 正文流式 | `get-webpage` 改为边收边扫：用 `TextDecoder(stream)` 增量解码，命中 `#gdt` 里第一张缩略图就发 `eh-early-thumb`，渲染进程 `new Image()` 预热 | 首图请求不再等整页 HTML 收完（实测：命中 10ms / 全文 316ms） |

**保留不变**：`emm-eh://` 协议整体保留（阅读器进度 + 失败回退 + 网页版 `/api/ex-image` 共用同一套缓存与并发控制）。

**代价与取舍**：
- 直连的图不再进我们自建的 7 天磁盘缓存，改由 Chromium 的 HTTP 缓存负责——首屏更快，重复打开取决于 CDN 的缓存头。
- `session.setProxy` 是会话级设置，会影响该 session 的所有出网：因此 bypass 只放 `*.hath.network`，**不能**加 `<-loopback>`（它的语义是「让 localhost 也走代理」，会让远程模式的 `http://127.0.0.1:<port>` 打不开）。
