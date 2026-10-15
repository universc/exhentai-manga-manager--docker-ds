## 未发布 (Unreleased) — 2026-10-16(第二轮)

### 用户第 16 轮(5 项):列表持久化 / 右栏可拖宽 / 下载预览 / 复制磁力 / 全部继续
- **①EH在线 列表「切界面回来不重拉」**:以前每次切库切回来、或刷新页面都要重新去 EH 拉一遍。
  现在:①切库/切界面回来直接用**手上那一份**(只有点「重新加载」、换搜索词、换「仅收藏」才真的重拉);
  ②列表镜像到 **sessionStorage**(只留最近 600 条),**刷新页面也还在,关掉网页/软件才消失** —— 正是要的语义。
  实测:切库来回 **0 次 EH 请求**;刷新后 **315ms** 就出 24 张卡(共 25 条),没有重新拉。
- **②下载记录与主界面同层、可拖宽**:不再是浮层,而是和书架并排的一栏,拖它左边缘可以调宽度
  (240px ~ 窗口-420px,记在本机 `emmDownloadPanelWidth`),书架会跟着变宽变窄。实测:397px → 626px,书架 883 → 654。
  ⚠️ 试过 el-drawer 的 `:modal="false"`,它会渲染一个铺满屏幕的容器把整个界面点击都吃掉;
  最后是「保留遮罩 + CSS 让遮罩透明且不吃点击」,实测右栏开着时左侧卡片与工具栏都能点。
- **③下载记录点封面 → 在右栏里预览**:已下好的出图,没下好的用**空白 + 进度圈**占位,标题栏显示 `已下/总数`;
  下载中会自动刷新(进度事件触发、节流 1.2s)。新 IPC `eh-download-files`(按文件名序号对应页码)。
  实测:hodgepodge 7/9 → 预览 9 格,**7 张出图(真实像素 800 宽)+ 2 个空白圈**。
- **④种子「复制磁力」以前点了一点反应都没有**:根因是局域网 http 页面**不是安全上下文**,
  `navigator.clipboard` 根本不存在,而旧的兜底只有 try/catch 静默失败。现在退回
  **textarea + `document.execCommand('copy')`**,并把成败返回给调用方(失败会明确提示)。
- **⑤下载记录加「全部继续」**:一键把所有「已暂停 / 失败 / 等待中」的任务接着下(已下好的页会跳过)。实测:7/9 → 点一下变 8/9。
- **顺手修掉两个真问题**(都是这一轮自己引出来的):
  1. **收页链接并发化**:一本 1229 页的画廊,原来串行翻缩略图页要 **115 秒**才开始下载;
     改成一次并发 4 页后 **32 秒**(实测同一本)。收链接阶段界面上会显示「正在收集页链接:N 页…」。
  2. ⚠️ 我改那段代码时把 `listGalleryPageLinks(url, options)` 的**第一个参数弄丢了**,options 被当成 url ——
     结果整本下载 4 秒就报 noPages,一本都下不了。已修(并在代码里留了注释提醒签名)。
  3. ⚠️ 预览里的 `toAssetUrl` 是 import 进来的函数,**Options API 的模板里不能直接用**
     (渲染直接报错、整块面板消失)→ 包成 method `assetUrl()`。
  4. 取页链接失败时不再误报「画廊可能已删除」,而是说「EH 可能在限速/网络不通,稍后点继续重试」+ 原始错误。
- 新增 IPC:`eh-download-files`、`eh-debug-links` / `eh-debug-download`(诊断用)。

## 未发布 (Unreleased) — 2026-10-16

### 用户第 15 轮(4 项):藤蔓位置 / 原图等待 / 记录按钮 / 记录与主界面同层
- **①藤蔓从「封面右下角」挪到「卡片框右下角」**,并且**不再显示数字**。
  现在它挂在 `.book-card`(卡片框)上、稍微出框 5px,看起来像藤蔓缠在框角上;两种卡片布局共用同一个按钮。
  实测:`parent = book-card`、`inCover = false`、距框右/下各 -5px、无数量角标。
- **②下载原图不再偷偷退回普通图**。以前原图失败会退回普通图(界面上只写「N 页退回了普通图」),等于装作成功;
  现在:EH 因为额度/配额拒绝原图时(实测回纯文本「Downloading original files … requires GP」),
  **整个任务立刻停下进「等待中」**,界面上写明原因,并给「继续任务」——
  等额度/网络恢复后点继续接着下,**已经下好的页会跳过**(断点续传)。
  实测容器内:原图下载 `done:0 failed:0 gpBlocked:2 stopped:true bytes:0`(一个文件都不写);
  界面上那条任务显示 `原图 等待中 9% 继续任务`。
  只有「这一页 EH 压根没给原图链接」时才用普通图(那不是失败)。
- **③下载记录改成两个删除按钮**:「**仅删除记录**」(不动文件,不弹确认)与
  「**删除记录和文件**」(带确认,会真删盘上的文件)。
- **④下载记录与主界面同层**:以前它盖着主界面(有遮罩,开着就没法浏览),现在把 el-drawer 的遮罩层
  改成「**不吃点击 + 完全透明**」(`modal-class="download-drawer-modal"` + 一段 CSS),
  右栏本体照常可点。实测:右栏开着时左侧卡片能点、工具栏按钮可达、无遮罩变暗。
  ⚠️ 试过 `:modal="false"`,但 element-plus 那种写法仍会渲染一个铺满屏幕的容器**把整个界面都吃掉点击**
  (连工具栏按钮都点不到),所以改用「透明遮罩 + pointer-events:none」这条。

## 未发布 (Unreleased) — 2026-10-15(第二轮)

### 用户第 14 轮(5 项):阅读器秒开 / 缩略图 / 种子按钮 / 下载设置归位
- **①点「读」卡很久才进阅读器 —— 已修,现在 106ms 就进(原来约 9 秒)**。
  以前是「先把 20 页的图片地址全解析完,再把阅读器打开」;现在照 JHenTai 分成三步:
  ①按卡片上已知的页数摆好占位**立刻打开阅读器** ②收页链接拿到真实总数 ③**并发 4 逐页解析**,
  谁先好谁先显示。新增两个 IPC:`eh-gallery-page-links`(只收页链接,很快)、`eh-page-image`(解析单页)。
  实测 NAS:点下去 106ms 出现 81 个页面框,其中 78 个是「正在解析页面 + 页码」的占位,随后逐页填图。
- **①阅读器进度圈的位置按 JHenTai 改了**:原来那个左下角浮层的进度圈删掉了,改成**每一页自己的居中占位**
  (转圈 + 「正在解析页面/加载中」+ 页码,与 JHenTai 阅读器的解析占位一致;分页模式压在图片上,
  滚动模式占住那一页的位置)。**拿不到地址的那一页会显示「这一页加载失败」+「重新加载」按钮**,可以单独重试。
- **②详细界面加「种子」按钮**:详情页按钮行现在是 在浏览器中打开 / **种子** / 下载整本 / 下载整本(原图)。
- **③下载设置挪到「自定义主题」下方**,并改成与「卡片样式」同款的独立分组面板(标题 + 面板 + 提示),
  不再挤在「每页数量」下面当一个孤零零的输入框。设置项不变:下载文件夹(带「选择」)、同时下载数、整本默认下原图。
- **④EH在线阅读器的缩略图(缩略图按钮)以前是空的 —— 现在能用了**。在线画廊没有本地缩略图流水线,
  所以改成**直接用已经解析出来的页图当缩略图**(和 EH 网站一样按页浏览);还没解析好的页显示转圈占位,
  随解析进度自己填上。左侧缩略图条与网格缩略图视图都是这套。
- **⑤卡片右下角的「种子」按钮**:用用户给的藤蔓图(白底抠成透明)做成按钮,**只有这个画廊确实有种子时出现**,
  按钮上带种子数量(例:`种子 (1)`),点一下打开种子列表。
  ⚠️ EH 的列表页不带种子信息,只能一本本问 `gallerytorrents.php`,所以做了限流与缓存:
  **只查当前渲染出来的在线卡片、并发 2、每次间隔 500ms、结果缓存在本机 7 天**(超过 30 天的缓存自动清)。
  实测:22 本里查出 14 本有种子,对应 14 张卡出现藤蔓按钮。
- 新增 IPC:`eh-gallery-page-links`、`eh-page-image`、`eh-torrent-count`;新增组件
  `src/components/ViewerPagePlaceholder.vue`、新增资源 `src/assets/vine-torrent.png`。

## 未发布 (Unreleased) — 2026-10-15

### 用户第 13 轮(11 项):列表体验 / 搜索历史 / 阅读器 / 下载 / 种子 / 收藏
- **①加载不再跳回顶部**:EH在线 追加下一页时,`chunkList` 会保住当前页与「已渲染数量」、不再回顶
  (根因:`bookList` watcher → `handleSortChange` → `chunkList()` 里无条件 `scrollMainPageTop()` + 把
  `renderedCount` 重置成一批,列表既弹回顶部又「缩回去」)。实测 NAS:滚到底后 24 → 50 张卡,
  `scrollTop` 停在 1286 没动。
- **③触底加载有底部状态了**(照 JHenTai 的 load-more footer):正在取下一页时转圈,取完写「没有更多了」。
- **②搜索栏显示搜索历史**(把上一轮没做完的补上):点一下空的搜索框就列出历史(JHenTai 是历史芯片墙),
  点一条**直接搜**、每条右侧 ✕ 删单条、末尾「清空搜索历史」;输入时历史排在最前。
  实测:点空框列出 3 条 + 清空项;输入 `fa` 只剩 `fate grand order`。
- **④封面右上角的 ☁️ 改成 `EH`**。
- **⑤加载遮罩可关闭**:在线解析画廊 / 本地取图片列表的加载层不再用 `ElLoading.service`(它没有按钮,
  解析卡住时整个阅读器锁死),改成自绘遮罩 + **「关闭」按钮** —— 关闭会作废这次加载(令牌)、退出阅读器。
- **⑥阅读器图片加载进度圈**(照 JHenTai):左下角一个进度圈 + `已加载/总数`,正在加载的图压暗;
  `@load` 才算加载完,`@error`(死图源)从分母里挪走,不会一直转。
- **⑦EH在线 的右键菜单与本地一致**:在线卡片右键不再「什么都不弹」,给出对在线有意义的六项 ——
  **下载整本 / 下载整本(原图) / 种子 / 复制标签 / 复制链接 / 在浏览器中打开**
  (移动文件/删除文件/超分/翻译/粘贴标签这些本地文件操作对在线画廊没意义,不列)。
- **⑧下载功能**:
  - 设置 → 高级 → **下载设置**:下载文件夹(带「选择」按钮)、同时下载数(1-10)、整本默认下原图;
  - 工具栏新增**「下载记录」**按钮(可在 高级 → 工具栏按钮 里隐藏),点开右侧滑出下载列表:
    封面 / 标题 / `已下/总数` / 状态 / 进度条 / 原图标记 / 失败原因,**暂停、继续、删除记录和文件**,
    顶部「打开下载文件夹」「清空记录」。任务与进度由主进程推送(`eh-download-progress` 事件),
    记录落 `<数据目录>/downloads.json`,重启后还在(上次没跑完的显示为「已暂停」,点继续接着下)。
  - **断点续传**:已下好的页(非空文件)直接跳过 —— 所以「继续」不会从头再来。
- **⑨下载入口**(EH在线专属):封面右键「下载整本 / 下载整本(原图)」、**详细界面同样两个按钮**、
  **阅读器里图片右键「下载本页 / 下载本页(原图)」**(另加「复制图片地址」)。
  「原图」的口径与 JHenTai 一致(`_downloadUrlFor`):取图片页里那句「Download original」的链接;
  拿不到就退回普通图并记一笔(实测 EH 高峰时段下原图要 GP,回的是
  `Downloading original files ... requires GP` —— 现在这种纯文本错误会被**识别为失败**,不会当漫画页存下来)。
- **⑩种子**:封面右键「种子」→ 列出该画廊的种子(名称 / 大小 / 做种 / 下载 / 发布者 / 发布时间 /
  过期标记),可**用种子下载**(交给系统默认 BT 客户端)或**复制磁力**。口径照 JHenTai 的
  `torrentPage2GalleryTorrent`(GET `gallerytorrents.php?gid=&t=`)。
- **⑪EH在线 的收藏 = 账号收藏**(不是本地收藏):
  - 卡片上的收藏星**显示出来了**,颜色跟随账号收藏状态(从列表页封面框的 `border-color` 反查分类索引,
    与 JHenTai 的 `favoriteTagIndex` 同表);点一下 → **收藏夹选择框**(EH 的 10 个收藏夹 + 数量) →
    走 EH 的 `gallerypopups.php?act=addfav`(POST `favcat/favnote/apply/update`);已收藏的点一下 = 取消收藏;
  - 排序下拉在 EH在线 下**去掉「仅合集」「仅隐藏」**(本地概念,在线用不上);
  - **「仅收藏」= 我账号的收藏**:换数据源去拉 EH 的 `/favorites.php`。实测:账号里 1 条收藏 →
    列表就 1 张卡,且卡片收藏星是「已收藏」色。
- **实测汇总(NAS 上跑的,不是只看构建成功)**:整本下载 [Luxu] Tsundere Malfoid → 5/5 完成、
  文件在 `/data/downloads/4254351 - [Luxu] Tsundere Malfoid (Harry Potter AU)/1..5.webp`;
  种子对话框列出「27.15 MiB / 做种 1 / 2026-10-10 23:38 / 已过期」;收藏夹选择列出 10 个分类
  (Favorites 0 = 1);仅收藏 → 1 张卡;单页下载在死节点上**换源成功**(214414 字节)。
- **踩到的坑(已修)**:①EH 的 H@H 节点里有死节点(实测同一本里奇数页 TLS 直接断)→ 按 JHenTai 的做法
  **重取图片页换节点重试**(最多 6 次),整本从 3/6 变成 6/6;②EH 的错误响应**状态码是 200**、
  内容是一句纯文本(原图要 GP)→ 加「图片魔数 + 体积」校验,不再把错误信息写成文件;
  ③有失败页的记录状态应可「继续」补齐(不是 done);④工具栏「下载记录」按钮同样要在
  `toolbarOrderIds` 的 `plainItems` 白名单里放行(与「筛选」按钮同一个坑)。

## 未发布 (Unreleased) — 2026-10-14

### 历史与筛选 都改成 JHenTai-8.0.16-334 的做法(用户第 12 轮)
- **「历史」修好了 —— 之前点了没反应**。根因是 `handleSortChange` 的 `recentRead` 分支用了花括号块,
  在块里 `break` 之后那行 `this.chunkList()` 是**死代码**,永远执行不到;而其它分支各自都调了它。
  结果就是 `displayBookList` 换成了历史记录,分页区块(`chunkDisplayBookList`)没跟着换 → 书架一块卡片都不显示。
  现在在块内调用 `chunkList()`,历史列表正常出图。
- **历史 = JHenTai 的 History**:阅读时把**画廊快照**(标题/封面/页数/评分/类别/标签/链接)一起存进记录,
  所以**换了库、文件被删、只在线看过一页的画廊,历史里依然能看到并点开**;
  按最近阅读时间倒序,卡片右上角原本显示阅读次数的那个格子改显示「阅读时间」(刚刚 / N 分钟前 / N 小时前 / N 天前)。
- **历史的两条删除动作**(照 JHenTai 的历史页):卡片右键 = **从历史中移除**单条;
  历史视图下工具栏出现红色垃圾桶按钮 = **清空历史**(带确认)。
  历史条目的右键菜单**只有这一项** —— 因为它可能已经不在库里(在线画廊 / 换过库),本地那套菜单对它没意义。
- **「筛选」按钮改成 JHenTai 的筛选对话框**(不再只是「排序/筛选」下拉的副本,见 `src/components/EhFilterDialog.vue`):
  分类 10 格两列(Doujinshi/Manga/Image Set/Game CG/Artist CG/Cosplay/Non-H/Asian Porn/Western/Misc,
  点=开关,**长按或右键=只看这一类**;等于 JHenTai 分类格的长按)、关键词、语言、页数范围、最低评分、
  以及「仅搜索移除了的画廊」「只显示有种子的画廊」两个开关;底部「重置 / 确定」。
- **筛选真的在筛**(`src/ehFilter.js`):
  - **本地库与 EH在线 的列表都就地过滤**(分类 / 语言 / 页数 / 最低评分),条件记在本机(`localStorage emmEhFilter`);
  - **EH在线 模式再把条件翻译成 EH 的查询参数发给 EH 自己筛**(`f_cats` 排除位掩码 / `f_search` 里并 `language:"xx"` /
    `f_spf`、`f_spt` 页数 / `f_srdd` 最低评分 / `f_sh`、`f_sto` 两个开关),与 JHenTai `SearchConfig.toQueryParameters` 同款;
  - 关键词不另存,直接写进软件原本的搜索栏(本地走本地语法、EH在线 走 EH 搜索);
  - 有筛选在生效时漏斗按钮变实心高亮,一眼能看出列表正被筛着。
- 实测(本机 6 本构造库):只看 Doujinshi → 1 本;语言=Chinese → 3 本;页数 30–50 → 1 本;最低评分 5 → 2 本;
  重置 → 6 本且高亮消失。历史:3 条记录(含 2 条**不在库里**的快照条目)全部出卡片、时间角标「刚刚 / 1 小时前 / 2 小时前」、
  右键单条移除、清空历史(0 条 + toast「历史已清空」)全部通过。

### EH在线:显示层与本地一致 + 详情页预览(第二轮)
### EH在线 细节调整(用户第 7 轮)
### EH在线 细节修正(用户第 8 轮)
### EH在线 改为完全走原版界面(用户第 10 轮)
### EH在线 加载 / 历史 / 搜索历史 / 筛选按钮 / 类别(用户第 11 轮)
- **加载逻辑抄 JHenTai**:不再一次囤一堆(原来还有 8 页上限,只能到 175 条),
  改成按 gid 游标**一次取一页**(EH 每页 20 条),滚到底或翻页时再追加下一页 —— 可以一直往下看。
  实测:滚动后从「共 25 条」涨到「共 75 条」。
- **「最近阅读」改名「历史」**(排序本来就是最近在前,与 JHenTai 的 History 一致)。
- **搜索框下方弹出「搜索历史」**:搜过的词记在本机(localStorage `emmSearchHistory`,最多 20 条),
  输入时优先出现在建议列表最前面(实测输入 `fa` 时首条是「搜索历史: fate」)。
- **工具栏新增「筛选」按钮**(漏斗图标):点开就是 排序/筛选 里那一组筛选条件;
  已登记进工具栏按钮定义(高级 → 工具栏按钮里可拖动排序 / 隐藏)。
  ⚠️ 踩坑:模板分支类按钮不在 `toolbarButtonMap` 里,必须在 `toolbarOrderIds` 的 `plainItems` 白名单放行,
  否则会被 `map[id]` 判空挡掉(筛选按钮一开始就是这么没渲染出来的)。
- **卡片标签按钮显示「所属类别」**:在线画廊不再另加角标,而是把类别当成一个标签喂给**原本的标签按钮**
  (实测卡片上就是一个 `Misc` 标签按钮;点它按类别搜,受「隐藏标签」设置控制)。
- ⚠️ 部署清单又漏了一个文件(`src/utils.js`,工具栏按钮定义在里面),已补 —— 这是第二次同类问题,
  现在清单按「本轮所有改动文件」逐个核对过。
- **删除自写的 `EhOnlineBrowser.vue`**(组件文件已从本地与 NAS 一并移除)。
- EH 的画廊改为映射成「书」塞进书架原本的数据流(`App.vue` 的 `bookList`):
  卡片网格、逐排加载、分页条、排序筛选、详情弹窗、阅读器全部走原版代码,不再有第二套界面。
  取数:`loadOnlineList()`(带 Cookie + 20s 超时,EX 拿不到退回 EH;EH 每页 20 条,按需拼页)。
  点击分发收在 `runClickAction`:在线书 内容/缩略图 → 在线阅读,详细界面照旧。
  搜索框在 EH在线 模式下把关键词交给 EH(结果同样进书架数据流)。
- **修正一处我自己引入的错误**:上一轮我说「卡片上的 tagged 是被『隐藏标签』设置藏掉的」是**错的**
  (实测 `hideNonTag: false`)。真正原因是 `BookCard.vue` 里我加的 `&& !book.online` —— 它把在线卡片的状态角标
  藏了。该条件已删除,在线卡片现在和本地一样显示状态角标。
- 卡片上的「所属类别」不再自造角标:改用本卡原有的标签按钮样式与点击/长按逻辑,
  并受设置「隐藏标签」控制(经典布局在标签行、填充布局与同排角标同款,不再错位)。
- **删掉在线视图里弹出的搜索框**:点标签/类别时搜索词写进**原本的搜索栏**再搜。
  (去掉来源切换按钮后,持久化的 source 可能停在「搜索」→ 没有搜索词时自动回到首页,不会卡在空搜索页。)
- 标题回退链按用户要求:**文件名 → 中文 → 日文 → 英文 → 默认标题**;在线画廊没有本地文件名,
  所以不再显示 URL。(根因之一见下:pinia.js 之前没在部署清单里 → 标题修复没到 NAS。)
- 故事简介为空时**整块不显示**(编辑模式仍显示以便填写)。
- ⚠️ 部署清单补上 `src/pinia.js` —— 之前漏了,导致「显示标题」的修复在 NAS 上一直没生效。
- 详情界面**只显示已有内容的标题行**(空标题不再显示成一栏「—」)。
- 在线视图去掉:来源切换(首页/收藏/搜索)、操作提示语、站点徽章(ExHentai/E-Hentai)、
  「Found N results.」与右上角「重新加载」按钮 —— 搜索仍由主工具栏的搜索框负责。
- 在线卡片:**标签位置改显示「所属类别」**(Misc / Western 等),**阅读次数角标显示 ☁️**。
- 「显示标题 = 文件名」时,在线卡片不再显示 URL(在线一律用画廊标题)。
- EH在线 模式下,工具栏「增量扫描 / 手动扫描」变成**「重新加载」**(切回本地库自动变回扫描)。
- **在线卡片改用软件自己的 `BookCard`**:外观、标签、页数、评分、阅/读 按钮与本地完全同款
  (在线书不碰本地封面生成 / 收藏 / 评分写回 / 本地右键菜单)。
- **在线详情改用软件自己的 `BookDetailDialog`**:标题、类别、标签、页数、评分、上传者、上传时间与本地一致;
  本地专有入口(文件名、所在目录、删除、重新扫描、获取元数据、编辑信息)在在线画廊下隐藏,另加「在浏览器中打开」。
- **详情页新增「预览」,放在「故事简介」上方**:本地书取这本书的前 N 张图(新 IPC `book-preview-images`;
  压缩包先用 7z **只列条目名**再**只解压前 12 张**,不为一个预览条解压整包;txt/epub 明确不支持);
  在线画廊用它自己的页预览缩略图(EH 详情页是**雪碧图**,按 `background-position: -Npx` 取页)。
- **在线阅读(未完成,见下)**:新 IPC `eh-gallery-pages` 解析各页真实图片地址(实测 20 页约 9 秒);
  新增图片代理 —— 桌面 `emm-eh://` 协议 / 网页版 `/api/ex-image` 路由,都带 Cookie 与代理取回,
  只放行 EH 的四个域名。实测原图主机 `*.hath.network` 浏览器直连不可达,所以必须走代理。
- ✅ **在线阅读可用**(实测:阅读器打开、页码 1 of 20、20 张页图、12 张已出像素)。
  踩过的坑:阅读器的 `<img>` 门槛是 `loadedImages[id]`,而它由 rAF 批量提交 ——
  被节流的标签页里永远不渲染;在线条目自带远程 src,不需要懒渲染,所以标记 `online: true`
  并在模板里放行(`loadedImages[image.id] || image.online`)。
- ⚠️ 已知限制:EH 部分图源是死节点(实测 4 个里 1 个超时),那几页会破图 ——
  要做稳得实现 EH 自己的「换图源(`?nl=`)」重试。
- ⚠️ 部署脚本之前漏传 `InternalViewer.vue` / `BookDetailDialog.vue` / `BookCard.vue` / `web-server.js`,
  已补齐并重新部署(否则 NAS 上一直是旧版组件)。

EH 在线漫画库:登录 EH 后书架多出一个「EH在线」,切过去直接浏览 EH 上的漫画。

### EH 登录(位置:设置 → 账户 → 「EH 设置」,整块平铺)
- **EH 设置从「常用」页搬到「账户」页,并取消折叠**:原来是一个「打开」按钮弹对话框,现在登录状态 /
  账号密码 / 四个 Cookie / EH在线 开关全部平铺在账户页里(用户要求)。
- 桌面端「登录」按钮 = **打开 EH 登录窗口 + 自动填账号密码提交**(`eh-login` 支持 `{username,password}`):
  必须等 Cloudflare 整页挑战过去**并且 Turnstile 出了 token** 再提交 —— 实测提交早了会被回一句
  「The captcha was not entered correctly」。用户自己在窗口里填过就不会插手。
- 新增**纯 HTTP 账号密码登录**(`eh-password-login`,逻辑在 `modules/ehLogin.js`):填 EH 账号密码即可,
  桌面版与网页版都注册了这个通道(纯 HTTP POST 到论坛登录表单),但见下方实测结论:
  (`forums.e-hentai.org/index.php?act=Login&CODE=01`,字段照 JHenTai `requestLogin`),
  成功后从 Set-Cookie 取 `ipb_member_id` / `ipb_pass_hash`,再访问一次站点补 `igneous` / `star`。
  密码不落盘(只存 ipb 两项);识别「账号密码不对」与「EH 要求验证码」两种失败。
  用 Node 原生 http/https 而不是 fetch:多个 Set-Cookie 必须是数组才解析得开。
  **实测结论:EH 论坛有两层 Cloudflare** —— ①整页人机挑战(裸 HTTP 请求一律 403,响应头
  `Cf-Mitigated: challenge`,页面 "Just a moment...");②登录表单上的 Turnstile 验证码
  (`cf-turnstile-response`)。所以纯 HTTP 登录在本机与 NAS 两条代理出口上**都被挡**
  (分别报 `cloudflare` / `captcha`),只有真浏览器窗口能过;网页版因此保留这条并给出明确提示,
  桌面端改走窗口。
- 新增「登录」按钮(桌面客户端):主进程开一个用独立分区(`persist:eh-login`)的窗口打开
  `forums.e-hentai.org` 登录页,轮询该分区的 Cookie;拿到 `ipb_member_id` + `ipb_pass_hash` 后
  再访问一次 `exhentai.org` 取 `igneous`,并用论坛 `showuser` 页取用户名。成功后四项 Cookie
  自动写入设置(不用再手抄四项),界面显示「已登录:用户名」。
- 新增「退出登录」「从剪贴板粘贴 Cookie」「清空 Cookie」;粘贴识别照
  JHenTai-8.0.16-334 的口径,可把浏览器里复制的整串 Cookie 直接丢进来。
- 纯网页版(Docker)不显示登录窗口入口(浏览器里开不了 Electron 窗口),仍可用粘贴 / 手工填写。
- 新增 IPC `eh-login` / `eh-logout`(仅非 WEB_MODE 注册);登录窗口 5 分钟超时,用户关窗即取消。
- 新增设置项:`ehOnlineEnabled` / `ehOnlineUser` / `ehOnlineSource`。

### EH在线 漫画库
- **「EH在线」进入「常用 → 库切换」框**:下拉里多出这一项,未配置(没登录 / 没打开开关)时置灰,
  配置好就能勾进某个框;勾进框之后**切换库完全按框走** —— 切到含「EH在线」的框就显示在线漫画,
  切回其它框显示本地书架。没勾进任何框时保留原来的行为(切换库循环末尾临时多一站)。
- 在线卡片补上**标签**与**评分**(标签按软件的惯例显示成 `字母:标签`,点标签直接去 EH 搜它)。
- 新增**画廊详情弹窗**(接进软件界面,点卡片打开):封面 / 分类 / 页数 / 评分 / 上传者 / 发布时间 / 文件大小 /
  **标签** / **页面预览** / 故事简介;按用户要求**页面预览放在「故事简介」之前**。
  页面预览的取法:EH 详情页是「雪碧图」(`#gdt class="gt200"`,所有页共用一张图),
  按每个缩略图 style 里的 `background-position: -Npx` 定位第几页,再用 `transform: scale()` 缩到 110px 宽。
- 解析器新增:`parseGalleryList` 每行补 `tags`(列表里的 `.gt[title="ns:tag"]`)、
  新增 `parseGalleryDetail()`(`#gn`/`#gj`/`#gdc`/`#gdd`/`#gdn`/`#grt2`/`#taglist`/`#gdt`)。
- 新增 i18n key 10 个(详情弹窗 + 库切换说明)。
- 「EH在线」是**前端虚拟库**(`{id:'eh-online', online:true}`),**不写进 `setting.libraries`** ——
  避免牵动后端的扫描 / 每库一个 sqlite / 缓存搬迁(那是本地书库的命脉)。
  出现条件:已填登录 Cookie 且 `ehOnlineEnabled`(登录成功后自动打开;EH设置 里有开关)。
- 工具栏「切换库」的循环尾部多一站:最后一个库切换框 → EH在线 → 回到第一个框。
  停在 EH在线 时按钮提示显示「当前库:EH在线」,本地书架与分页整体让位给在线浏览器。
- 关掉开关或清空 Cookie 时会自动切回本地书架,不会停在已经不存在的库上。

### 在线浏览(新增 `src/components/EhOnlineBrowser.vue` + `src/ehOnline.js`)
- 三种来源:首页 / 收藏 / 搜索;站点按 Cookie 选:有有效 `igneous` 走 exhentai.org,
  否则 e-hentai.org;EX 拉不到列表时自动退回 E-Hentai。
- 列表 HTML 解析口径照抄 JHenTai-8.0.16-334 的 `eh_spider_parser.dart`:四种版式
  (`.itg.gltm` / `.gltc` / `.glte` / `.gld`)、封面 `.glthumb img[data-src]`、分类 `.cn`、
  页数按版式取单元格、评分按 `.ir` 的 `background-position` 偏移换算(`5 + X/16`,Y=-21 时再 -0.5)、
  翻页用 gid 游标(`#uprev` / `#unext` 的 `prev` / `next`,前端维护游标栈以支持「上一页」)。
- 数据复用现成 IPC `get-ex-webpage`(带 Cookie 与代理),**不新增后端拉取通道**;
  点封面 / 标题用 `open-url` 在浏览器打开该画廊(在线阅读与下载入库不在本次范围)。
- 带 20 秒超时:网络不通 / 代理没配好时界面会自行恢复并提示「检查代理」,
  而不是永远停在「正在从 EH 取数据…」且重载按钮被禁用。
- 新增 i18n key 38 个(zh-CN / zh-TW / en-US)。

### 已在真实 EH 上验证
- **列表解析器**:用真实 e-hentai.org 页面(经代理)跑过 `parseGalleryList` —— 首页取到 25 条,
  标题 / 分类 / 封面(ehgt.org)/ 页数 / 评分 / `#unext` 游标 全部正确,`Found 1,665,318 results.` 也解析出来了。
- **登录窗口**:真实窗口打开论坛登录页 → Cloudflare 整页挑战自动过(标题从「请稍候…」变「Log In」)、
  Turnstile 自动出 token → 自动填表提交 → **登录成功**(拿到 `ipb_member_id` / `ipb_pass_hash` / `igneous`)。
- **NAS(Docker)全流程**:配置代理后,切到「EH在线」实测出 **25 张卡片(25 张封面)**;
  搜索 `f_search` 返回 25 条;收藏夹页是登录态页面。

### 发版注意
- 桌面端登录功能未在本机实测(需要真实 EH 账号与网络);网络可达性、Cookie 有效性均未验证。
  网页版(Docker)已跑通「登录后出现 EH在线 → 切过去渲染在线浏览器 → 切回本地书架」全流程。

## v1.11.0 (docker-ds fork) — 2026-10-07

多漫画库 · 每库独立数据目录 · 标签全局化。

### 多漫画库
- 新增库模型:\`setting.libraries = [{id,name,path,dataPath}]\` + \`setting.activeLibraryId\`;旧字段 \`setting.library\` 保留为活动库镜像。\`modules/libraries.js\` 负责规范化、迁移与唯一命名。
- 设置 → 常用:一行 = 一个库(库名可改、库文件夹只读、带删除按钮、库数据存放位置可手填或选择)。
- **库数据存放位置为空 = 该库不生效**(不加载、不扫描、不能设为当前库),界面显示「未生效」。
- 「库切换」区:一个框 = 一组库;工具栏「切换库」按钮**点一下切到下一个框**(循环),书架显示该框内所有库**合并**的漫画(同一本书不去重,各带 \`libraryId\`/\`libraryName\`)。
- 每库一个 sequelize 实例(\`modelForLibrary\`);扫描按钮**依次扫描每个已生效的库**,各写各的数据库。
- 删除记录按库写入(\`<库数据目录>/delete-log.jsonl\`),回收站与删除记录合并展示并标出所属库。

### 标签与元数据
- 新增 IPC \`get-all-tags\`:标签列表取自全局 \`metadata.sqlite\`,与当前库 / 切换框无关。
- \`rename-tag\` / \`delete-tag\` 改为遍历 \`Metadata\` 全表(对所有库生效),并用单个事务批处理。

### 写入路由(合并书架的正确性)
- 每本书带 \`libraryId\`;\`saveBookToDatabase\` 写回**它自己所属的库**,元数据始终写全局库。
- 新增 \`bookLibraryById\` / \`bookLibraryByHash\` / \`modelForBookId\` / \`findBookAcrossLibraries\`;封面写回、按 id 查书、按 filepath 查 / 删、按 hash 查(LAN 缩略图、AI 元数据)全部按库路由。
- 新增 \`libraryForPath(路径)\`:删除整本 / 单图、移动文件、文件夹树都按「路径属于哪个库」判断,不再依赖全局 \`setting.library\`。

### 封面与缓存
- 封面缓存按库:\`CURRENT_COVER_DIR = <库数据目录>/cover\`,随运行时切库同步;缩略图缓存、扫描快照、数据库同样落在各库自己的数据目录。

### SQLite(网络盘)
- 新增 \`applySqliteTuning()\`:\`journal_mode=PERSIST\`(提交后不再删除 journal)、\`synchronous=NORMAL\`、\`busy_timeout=8000\`。修复在 NAS/SMB 上 \`database.sqlite-journal\` 被反复增删刷爆 NAS 日志的问题。

### 稳定性修复
- \`setting.json\` 原子写改用唯一临时名(\`setting.json.<pid>.<seq>.tmp\`),修复并发写导致的 \`ENOENT: rename setting.json.tmp -> setting.json\`。
- 数据目录不可用**不再静默回退**:记录 \`dataPathFallback\`,启动后弹出明确警告;降级期间不迁移、不落盘。
- 工具栏新增「切换库」按钮(carbon \`Catalog\` 图标),可拖动 / 隐藏;修复 Options API 模板直接使用 import 图标导致按钮空白的问题。
- 增删库、改库数据目录、改切换框之后**立即重读书架**,不必等切库或重启。
- 版本号 1.10.6 → **1.11.0**;Docker 镜像 tag 同步为 \`1.11.0\`。

## v1.10.6 (docker-ds fork) — 2026-10-06

> 本版是「删除漫画没有任何后悔药」的修复版:**删除先移入回收站**,并且**每一次删除/恢复都留下日志**;单张图片的删除同样进回收站。

### 新增

- **回收站(软删除)**:删除漫画不再直接从磁盘抹掉,统一移到 `<数据目录>/.trash/`,可在 **设置 → 常用 → 回收站** 里**恢复**或**彻底删除**;
  - 桌面版与网页版**同一套逻辑**(网页版 `/api/ipc/<channel>` 派发到同一批处理器),网页版同样能看到回收站区块;
  - 文件缺失的条目会标成「文件缺失」并禁用「恢复」;恢复时原路径若已被占用会**拒绝覆盖**并提示;
  - 恢复后重新扫描漫画库即可回到书架(增量扫描会自动把快照里有、数据库里没有的目录/压缩包重新入库)。
- **删除记录(日志)**:所有「删除 / 恢复 / 彻底删除」都追加写入 `<数据目录>/delete-log.jsonl`(一行一条、永不轮转);
  设置 → 常用 → 回收站 底部点「**删除记录**」即可查看最近 200 条(时间 / 操作 / 漫画 / 路径 / 结果)。

- **单张图片删除也进回收站**:阅读器图片右键 → 「删除图片」不再直接抹盘;
  - **文件夹漫画**:把这张图**本身**移到 `<数据目录>/.trash/`(条目名 `书名 / 图片名`),可在回收站里单独恢复;
  - **压缩包漫画**:整包没法只搬一张图,改为先把**整个压缩包的原样备份**放进回收站(条目名 `书名(压缩包备份)`),再从包里删除这张图;
    同一本书只保留**最早的一份**备份(删第二张图时不会重复占空间),还原时会用备份**覆盖**现在的压缩包,等于把这本之后的所有删除一起撤销。

### 修复

- **删除漫画一删就没、事后查不到任何痕迹**:
  - 旧实现逐张图调用 `shell.trashItem()`,而 **Linux/Docker 容器没有 gio trash**,必然抛错后走 `catch` 里的 `fs.promises.rm()` → **永久删除**;
    整本目录那句 `shell.trashItem()` 连 `catch` 都没有;
  - 失败只在界面弹一句提示、**不落盘**,并且末尾**无条件**执行 `Manga.destroy()`,导致文件还在、数据库行却先被删掉;
  - 现在整本(目录或压缩包)**一次性**移入回收站,只有点「彻底删除 / 清空回收站」才真正从磁盘抹掉;移动失败会返回错误且**不会**删除数据库行。

- **阅读器里删除单张图片在 Linux / Docker 下是永久删除**:文件夹书走 `shell.trashItem()`,容器里没有 gio trash 必然抛错,旧代码在 `catch` 里直接 `fs.promises.rm()`;
- **删除图片失败也会提示成功**:旧代码把后端的返回对象当成布尔值(`if (deleteResult)`,对象恒为真),现在按 `deleteResult.ok` 判断,失败会显示具体原因。

### 变更

- 删除确认文案改为「将把漫画**移入回收站**(不会立刻永久删除),可在 设置 → 常用 → 回收站 里恢复」;
- 删除时**保留**数据库 / 元数据 / 封面 / 缩略图 / 扫描快照,恢复后不需要重新抓取元数据;
- 版本号 1.10.5 → **1.10.6**;Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.6`。

### 界面与工具栏(1.10.6 补充)

- **工具栏元素全面可排序**:搜索框、搜索按钮、排序框、界面模式框、**设置按钮**都进入 设置 → 高级 → 工具栏按钮 列表,可拖动排序;设置按钮**常驻不可隐藏**;
- **默认顺序**调整为:文件夹树 → 搜索框 → 搜索按钮 → 随机 → 增量扫描 → 手动扫描 → 批量获取元数据 → 标签分析 → 管理合集 → 管理标签 → 切换阅读器 → 切换主题 → 全屏 → 排序框 → 设置 → 界面模式框;
- **打开库文件夹按钮移除**,该位置改回**界面模式按钮**(Win 版同样可用);服务器配置按钮只在远程桌面模式保留;
- 设置页签「内置阅读器」→「**阅读器**」、「标签设置」→「**标签**」;
- 新增 **「高级主题」**:与主题下拉拼在同一个框里,点开是紧贴的浮层,目前包含 **像素风格** 与 **自动主题** 两个开关;
- **主界面防复制**:卡片区 / 工具栏 / 随机标签禁止选中与复制,搜索框与所有输入框不受影响。

### 自定义主题

- 面板改为**横排紧凑布局**,颜色类(背景色 / 主色调 / 字体颜色 / **卡片框内颜色** / **按钮框内颜色**)单独一排,字体类单独一排;
- 字体大小**去掉上下限**(1–999),字体样式扩到 **24 种**(思源黑体/思源宋体/霞鹜文楷/更纱黑体/阿里巴巴普惠体/鸿蒙/MiSans/OPPO Sans/得意黑/思源日文/Meiryo/Yu Gothic/Arial/Verdana/Tahoma/Trebuchet/Georgia/Times/Courier 等,全部为开源或系统自带,不含商业授权字体);
- 新增 **字体粗细(100–900 数字档位)**、**倾斜**、**下划线**;
- **切换主题时会清掉自定义主题写在页面上的变量**,不再出现「切到别的主题按钮还是自定义颜色」;
- 颜色选择器支持**透明度**。

### 卡片

- 「封面大小 / 封面宽度 / 封面高度」改名为 **卡片大小 / 卡片宽度 / 卡片高度**,取值范围放宽(宽 80–800、高 100–1200);
- 卡片宽 / 高 / 间距在**手机、平板界面模式下同样生效**;左右间距设 0 时卡片可以真正贴合;
- 所有数字输入框**清空后回填默认值**(卡片宽 220 / 高 360 / 间距 6 / 字号 14 / 字重 400 / 界面缩放 100),不再是「最小值」。

### 像素风格(高级主题,可叠加在任意主题上)

- **自带开源像素字体**(缝合像素字体 Fusion Pixel 12px,OFL-1.1,含简繁与日文假名),不依赖本机安装;全站字体(含设置对话框、浮层、右键菜单)一起像素化;
- **封面真降采样像素化**(不是简单缩放):块大小 2–20、颜色数量 2–64、算法(块平均 / 中心像素采样 / 块平均+抖动 / 不量化)、**显示网格**、封面清晰度(0 = 不处理);参数改动会立刻重刷封面;
- **自动主题**:按当前漫画封面取色,联动卡片框颜色、按钮框内颜色、按钮内文字颜色与主色调(浅底深字,对比明显);每页只取色一次,不随滚动反复变;
- **默认像素背景图**:未设置自定义背景图时使用内置像素底图;背景图**不做**像素化处理;
- **像素音效**:按钮点击、输入打字、评分、收藏、漫画翻页各自不同音色,任务完成另有完成音效 —— 全部只在像素风格下生效;
- 加载动画:普通模式保持原生转圈,**像素模式下封面加载与超分/翻译任务使用「音乐律动」柱子**,扫描进度改为光点闪烁;绿色扫描进度条已移除;
- **阅读器里的漫画图片不做像素化**。

### 点击策略

- 每个下拉新增 **「无效果」**;新增 **「单击标题」**;
- 默认值:单击封面 / 阅 / 读 = **内容界面**,单击标题 = **详细界面**。

### 修复(1.10.6 补充)

- **填充封面布局点击页数没反应**(经典布局的页数标签漏了点击事件);
- **设置按钮点击无反应**(组件初始化时的变量引用顺序错误导致整个设置面板初始化失败);
- **切换主题后像素风格失效**(主题切换会把附加样式类一起抹掉);
- 像素风格下**多余滚动条**与**收藏按钮被裁**;
- 像素风格下**评分点不到半星**、**自定义背景图被内置默认图覆盖**、**封面先显示原图再变像素**、**改参数后封面空白**;
- **工具栏宽度不随卡片尺寸重算**(两个重复的 watch 段互相覆盖);
- **Real-ESRGAN 跑在 CPU 上**:docker-compose 补回 `/dev/dri` 核显直通(此前同步源码时被覆盖),已在 Intel 核显上验证;
- **网页版(Docker)界面缩放不生效**:浏览器没有 webFrame,改用 CSS zoom 实现并持久化。


- 设置 → 常用 的**回收站区块移到了该页最下方**(以前夹在数据目录/代理中间,容易看不见);
- 回收站表格的名称列现在能区分普通书 / `书名 / 图片名` / `书名(压缩包备份)`,删除记录弹窗同样显示图片名;
- 压缩包备份条目的还原确认文案改为「还原会用备份覆盖现在的压缩包…」;回收站提示文案改为「删除漫画**或单张图片**时会先移到这里」。

## v1.10.5 (docker-ds fork) — 2026-10-05

> 本版把此前若干轮内部迭代(原 1.11.0 / 1.12.0 / 1.13.0 的开发内容)合并发布,版本号回到 1.10.x 序列。

### 阅读器:渲染矩阵重做

- **12 种组合**(卷轴开/关 × 单页/双页 × 上下/左右/右左)全部按矩阵重做并逐条实测;
- **缩放与适应对所有模式生效**:➖ / ➕(0.3×~3×)在分页单页、分页双页、纵向卷轴、横向整排下都可用;
  「适应窗口 / 宽度 / 高度」在所有模式下都有实际效果;Ctrl+滚轮以鼠标位置为锚点缩放;
- **横向整排**(方向 = 左右 / 右左):整排连续滚动,右左时整排反向、进入即贴最右并随加载保持贴边、滚轮反向;
- **键盘**翻页 / 滚动 / 缩放全部按阅读方向处理(旧版卷轴下键盘滚的是不滚动的容器);PageDown / PageUp 仍归主界面切书;
- 方向不再反过来强制切换卷轴开关;分页双页在「右左」下视觉顺序为 N+1、N。

### 超分(本地模型 / 自动超分 / 备份)

- **自动超分修复**:按「图片超分 → 保存位置」执行(**替换原文件会生成 .bak**)、分页模式也会触发、
  超分完**立即换成超分图**并重算排版、**全程不弹提示**;
- **新增右键「恢复 .bak 文件」**(单张图片)与「**恢复全部 .bak 文件**」(整本):超分出问题时一键回滚,
  **只处理确实存在 .bak 的文件,不会误伤其它图片**;
- 新增「删除全部 .bak 备份」与封面右键「删除本书的 .bak 备份」;全本超分在「仅预览」保存方式下直接取消;
- 本地模型支持 **Real-ESRGAN / waifu2x**(含模型下载 / 删除 / 权重选择 / 过滤设置);
  ComicRead 阅读器的「无损放大」用的就是 **Real-ESRGAN**,与本项目本地模型同源。

### 阅读器性能

- 缩略图改为**按需生成 + 后台限流 + 持久缓存**:不开侧栏就不生成,重复打开直接命中缓存;
- 主循环改预读窗口(并行准备、按顺序推送),不再被缩略图抢占线程池;本地直读默认不再对超宽图重编码;
- 切书 / 关闭阅读器后旧任务立即取消;网页版与远程模式的图片走长缓存(实测加载快约 12 倍)。

### 设置栏与界面

- 设置栏按钮**可勾选显隐、可拖动排序**(顺序真实生效);放大 / 缩小合并为一项「缩放」;退出按钮固定右上角不参与配置;
- 新增「**按钮操作提示**」:点按钮弹一句当前状态与用法(可在设置里关掉);
- 新增「**图片间距**」「**缩略图间距**」(默认 0);「**双页模式单独封面**」;隐藏页码同时管住缩略图页码;
- 底部「上一本 / 随机 / 下一本」默认隐藏,鼠标移到画面底部才出现;「阅读完成后」新增「**打开下一本(随机)**」;
- 点击弹出设置栏的区域改为中央 1/5;设置 → 本地阅读器整页重排(选择项置顶、开关两列并排);
- 高级页:删除工具栏「恢复默认」、卡片样式中封面大小/宽度/高度分开、小字统一为「拖动调整顺序;单击启用/取消显示」。

### 修复

- 工具栏「缩略图视图」按钮点了没反应(只调了请求逻辑、没切换状态);
- 设置栏「缩放」取消勾选不生效、设置栏按钮拖动排序不生效;
- 横向卷轴当前页判定、右左贴边、分页双页左右顺序、卷轴键盘失效;
- 右键菜单新增项对旧配置默认可见(不再需要手动去设置里勾)。

## v1.10.4 (docker-ds fork) — 2026-10-04

### 新增
- **阅读器图片右键「属性」**:查看**名称 / 大小 / 分辨率 / 编码格式(含通道数与位深) / 修改时间 / 完整路径**。
  - 主进程新增只读 IPC `image-file-info`(fs.stat + sharp metadata),网页版**只读账户(viewer)也允许调用**;
  - 显示与否由「设置 → 高级 → 右键菜单 → 阅读器图片右键/长按菜单」的 **属性** 勾选控制(与其他菜单项同一套机制);
  - 老用户升级时,该新项会由 `mergeContextMenuOptions()` 的「新增项并入」逻辑自动勾上,不影响已取消的其他勾选。
- **超分过滤设置**(设置 → 功能 → 图片超分 → 过滤设置):图片**宽和高都 ≥ 阈值**(默认 **1200×2000**)时**跳过超分**,
  避免对已经足够清晰的图白跑一次(本地模型一张图可达数分钟)。某一方向填 0 表示该方向不限制;开关默认开启。
  - 判定在主进程 `upscale-image` 入口完成,**单张超分**与**全本超分**共用同一逻辑,任何入口都无法绕过;
  - 命中的图片直接返回 `{ skipped: true }`,**不产生任何输出文件**;阅读器会提示「已跳过:图片 W×H 已达阈值 …」,
    全本超分结束时的提示会附带「跳过 N 张(已达过滤阈值)」。

### 变更
- 版本号 1.10.3 → **1.10.4**;Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.4`。

## v1.10.3 (docker-ds fork) — 2026-10-03

### 新增
- **本地超分模型(Real-ESRGAN / waifu2x)**:不需要任何 API 服务,在 设置 → 功能 → 本地模型 里下载后离线运行。
  - 下载(带进度、可取消)/ 删除 / 打开目录;可用权重**自动扫描**而非硬编码;
  - 每个模型有自己的参数(权重 / 放大倍数 / 降噪等级 / 分块大小 / GPU 编号 / TTA),
    由后端 `OPTION_SCHEMA` 驱动前端渲染 —— 以后加模型前端零改动;
  - 下载支持走「常用 → 代理」或填「下载源」镜像前缀(国内直连 GitHub 大文件会被重置);
  - **Docker/NAS 同样可用**:镜像加入 `libvulkan1 + mesa-vulkan-drivers`,无 GPU 时用 lavapipe 做 CPU 软件渲染。
- **超分结果落盘**:保存方式支持 同一文件夹(另存) / 替换原文件(旧文件备份 `.bak`) / 仅预览;
  另存文件名格式为 `原名_模型_倍数.扩展名`(如 `10_waifu2x_2x.jpg`)。

### 修复
- **「保存到文件夹」从来没有真正生效**:`upscaleSaveMode` 在后端**从未被读取**,超分结果永远只写到预览临时目录。
  现已实现三种保存模式,并在阅读器里提示**完整保存路径**(网页版可直接点开所在目录)。
  > 压缩包漫画内的图是解压产物,无法回写压缩包 → 统一另存到 `<数据目录>/upscaled/`,并给出提示。
- **阅读器图片右键的「超分图片」「提取文字」永远不显示**:这两个菜单项额外依赖 `enableImageUpscale` /
  `enableImageOcr`,但设置界面里**从来没有对应开关**(只存在于不参与构建的历史副本 `src/Setting.vue`),
  默认 `false` 导致无论怎么勾选都被过滤。现已移除该限制 —— 显示与否只由「高级 → 右键菜单」的勾选决定。

### 变更
- 「图片超分」移除「输出尺寸」与「超分倍数」:不同引擎能力不同,全局倍数没有意义,倍数改为每个本地模型自己的参数。
- 「使用的模型」合并为**一个下拉**(本地模型 / API 服务两组),内部仍是 `localUpscaleEngine` /
  `upscaleApiProfileId` 两个键,旧配置免迁移。
- 版本号 1.10.2 → **1.10.3**;Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.3`。
## v1.10.2 (docker-ds fork) — 2026-09-30

### 修复
- **右键菜单 / 长按菜单的勾选每次打开软件都变回默认(全选)**。
  根因是加载设置时的「自动并入」写法:
  `contextMenuOptions[menu] = [...new Set([...saved, ...items])]` 会把**定义里的全部菜单项**无条件并回已保存值,
  于是用户取消勾选的项每次加载都被重新勾上;`App.vue` 还在每次启动时把这份「全选」结果写回服务器。
  现改为 `mergeContextMenuOptions()`(`src/utils.js`):用 localStorage 记录「上次界面定义过的项 id」,
  只并入 (当前定义 − 上次定义) 的**真正新增项**;没有记录时(首次运行 / 清了浏览器数据)完全信任已保存值。
  该函数同时用于 `App.vue`(启动时)与设置面板(打开时)。
  > 受影响用户需要重新设置一次右键菜单 —— 被覆盖掉的勾选无法自动还原。

### 变更
- 版本号 1.10.1 → 1.10.2;Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.2`。
## v1.10.1 (docker-ds fork) — 2026-09-30

### 修复
- **「设置反复丢失」定位并修复(严重)**。根因是两处叠加,缺一不可:
  1. **前端抢跑**:`src/App.vue` 的 `mounted()` 在 `load-setting` **之前**就调用了 `save-setting`。
     此时 Pinia 里的 `setting` 还是初始的 `{}`,只被塞进了 `contextMenuOptions`,
     于是每次打开页面/启动客户端都会把一个只有 1~2 个键的对象发给后端(该段代码由 v1.9.8 批次引入,
     因此「之前的版本没问题」)。
  2. **后端整份替换**:`index.js` 的 `applySetting()` 用 `setting = receiveSetting` /
     `fileSetting = receiveSetting` 把收到的局部对象**当成完整配置整份落盘**,这次请求里没带的键全部丢弃。
  两者叠加的结果:每次打开页面/重启容器后,`setting.json` 被清成
  `{"contextMenuOptions": {…}, "library": "/library"}`(NAS 上残留的 `setting.json.broken-20260930` 即实证),
  漫画库路径、Cookie、主题、工具栏、每页数量、AI 配置等全部丢失。
  **修复**:后端 `applySetting` 开头先做 `receiveSetting = { ...setting, ...(receiveSetting || {}) }`
  (前端没传的键一律保留原值),内存与落盘都使用合并后的完整对象;前端把「右键菜单合并保存」移到
  `load-setting` 拿到完整设置**之后**,且只在确有新增菜单项时才保存。
- **容器内漫画库/元数据目录被重置**:`applySetting` 的容器分支会用局部对象覆盖 `fileSetting`
  (Linux 路径分支下先前的合并被丢弃),已一并修正;空/根目录才回退 `WEB_LIBRARY`。

### 安全
- **`/api/file`、`/api/list-dir`、`/browse` 增加登录鉴权**:启用账户系统(`WEB_ADMIN_USER`)后,
  未登录访问一律返回 401。此前这三个接口可被匿名访问,**局域网内任何人都能直接拉取封面、整库图片与目录列表**。
  白名单 IP 免登录(视为管理员)不受影响;未配置 `WEB_ADMIN_USER` 时账户系统未启用,行为与旧版一致。
  `/api/events`、`/api/ipc/*` 原本已有鉴权,本次一并审计确认。

### 变更
- 版本号 1.10.0 → **1.10.1**;Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.1`。
- 维护文档补充:该「设置丢失」已写入 `项目说明-AI维护指南.md` 的高频坑列表,避免回归。

# 更新日志

## v1.10.0 (docker-ds fork) — 2026-09-29

### 修复
- **双击封面无反应**:`emit('coverDblClick')` 与模板 `@cover-dbl-click` 事件名大小写不匹配,已统一为 `cover-dbl-click`
- **设置页显示原始 key**(如 `m.tagTranslate`):locale 中 9 个键错挂在 JSON 顶层,已移入 `m` 命名空间;并补齐 5 个缺失键(`m.cancel`/`c.close`/`m.colorize`/`m.viewerUnavailable`/`c.titleTranslationFailed`)
- **收藏标签在主界面标签条不显示**:标签条之前绑死 `randomTagsEnabled`,勾「收藏标签」时整条消失。现改为两开关任一开启都显示,且数据源按开关切换(收藏→显示自己收藏的标签;随机→随机 24 个)
- **详细界面标签栏出现"两个作品/两个角色"**:`BookDetailDialog` 的 `tagGroup` 按原始分类名分组,库中 `parody`/`作品`、`character`/`角色` 并存时会渲染两个同名标签栏。现按 `resolveCatKey` 归一分组(实测分类分组 11→9,标签条目 281→275)
- **收藏标签匹配失败**:`collectTag` 的 `cat` 可能是中文显示名,新增 `resolveCatKey()` 反查英文分类键
- **标签去重**:`tagListRaw`/`allTagsGroups` 去重键改用 `resolveCatKey`,合并中英文分类名
- **收藏标签/随机标签开关丢失**:改为立即落盘(绕过 500ms 防抖)
- **非管理员/未登录时设置页整页空白**:现显示「账户」页,可在设置内登录或退出
- **重启后服务无法启动**:`node_modules/sqlite3` 原生模块被 electron-builder 删除,已恢复

### 新增
- **「增加标签」按钮**(详细界面 →「增加类别」右侧):选类别 + 输入名称;同类别内重名(含中/英/日任一语言名称相同)必须指定「所属集合」才能创建,并自动写入 `tagRelations` 包含关系
- **编辑信息栏标签长按** → 打开标签多语言名称编辑
- **图片超分**:新增「输出尺寸」(按倍数 / 按目标宽度),倍数扩展 1.5/2/3/4/6/8
- **标签多语言名称**:默认 / 简体 / 繁体 / 英文 / 日文,双击标签编辑
- **标签关联(包含/被包含)**:标签名后自动括号显示前 3 个所属集合(如 `Cyrene(BB)`)

### 变更
- 「AI 基础功能」→「功能」;「目标语言标签」→「语言」;「显示收藏标签」→「收藏标签」;「随机标签默认禁用(勾选后启用)」→「随机标签」
- 「收藏标签」「随机标签」「语言」三项同排

## 2026-09-28 — AI 功能改造修复批次

### 修复
- **双击封面无反应**:`emit('coverDblClick')` 与模板 `@cover-dbl-click` 事件名大小写不匹配(全项目 34 个自定义事件中唯一一个),已统一。
- **设置页显示原始 key**(如 `m.tagTranslate`):locale 中有 9 个键错挂在 JSON 顶层而非 `m` 命名空间,已全部移入;并补齐 5 个缺失键(`m.cancel`/`c.close`/`m.colorize`/`m.viewerUnavailable`/`c.titleTranslationFailed`)。
- **收藏标签在主界面不显示**:`collectTag` 中 `cat` 可能存的是中文显示名(`角色`),而 `book.tags` 的键是英文(`character`)。新增 `resolveCatKey()` 做反向映射兼容。
- **标签栏出现重复标签**:按「分类::标签」唯一化,中文/英文分类名混用也能正确合并。
- **非管理员/未登录时设置页整页空白**:现在显示「账户」页,可在设置内直接登录或退出登录。
- **重启后服务无法启动**:`node_modules/sqlite3` 的原生模块 `node_sqlite3.node` 被 electron-builder 的打包流程删除(只剩 `.DELETE.<hash>` 标记文件),已恢复。

### 新增
- **图片超分**:新增「输出尺寸」设置 —— 按倍数放大 / 按目标宽度(px);倍数扩展为 1.5 / 2 / 3 / 4 / 6 / 8。
- **标签多语言名称**:支持 默认 / 简体 / 繁体 / 英文 / 日文 五种名称,双击标签即可编辑,按「语言」设置显示。
- **标签关联(包含 / 被包含)**:在标签编辑弹窗中设置;标签名后自动用括号显示前 3 个所属集合,如 `Cyrene(BB)`、`光辉(碧蓝航线,女)`。
- **标签设置页布局**:「收藏标签」「随机标签」「语言」三个控件同排,前两者互斥(勾选哪个主界面就显示哪个,都不勾选则不显示)。

### 变更
- 「AI 基础功能」→「功能」;「目标语言标签」→「语言」;「显示收藏标签」→「收藏标签」;「随机标签默认禁用(勾选后启用)」→「随机标签」。

### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

Generated by [`auto-changelog`](https://github.com/CookPete/auto-changelog).

#### v1.9.8 (docker-ds fork)

> 2026-09-11

- 扫描优化:压缩包只解压一次、去掉冗余整文件复制、同一文件只计算一次哈希(封面懒加载)
- 封面加载动画只覆盖封面区域,不再遮挡标题/角标
- 详情页:标题语言选择与就地编辑、故事简介字段、编辑信息(信息块可拖动排序、标题加号新增)
- 详情页标题与封面同宽居中;封面/标题在小窗口与缩放时自适应
- 点击策略可配置:单击封面 / 双击封面 / 阅 / 读 / 页数 → 详细界面 / 内容界面 / 缩略图
- 长按卡片收藏标签打开简易标签编辑器(筛选 / 全库重命名 / 全库删除 / 从本书移除)
- 打开所在目录:网页版与远程模式改为新标签页浏览 NAS 文件夹
- 新增按钮:查询角色出处、翻译、超分辨率、上色(后两者暂未实现)
- 移动端:界面模式文案补全、两列布局、分页不再横向溢出
- 修复评分/标签数据可恢复;高级设置布局与文案统一

#### [v1.6.15](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.14...v1.6.15)

> 21 March 2026

- Development [`#318`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/318)
- Add manga_reader Rust project [`51fe76d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/51fe76dfc40ed4d3384978ba583c0211cbe470bb)
- Async archive loading with memory cache [`96e9edf`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/96e9edfc9b7c9bc36fc6f16ae76586cd48183acb)
- Revert "Add double-page view mode" [`284d1ea`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/284d1ea46560507427fa7118ba676694b16ea209)

#### [v1.6.14](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.13...v1.6.14)

> 7 February 2026

- Development [`#311`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/311)
- update comic reader [`2a2f2ca`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2a2f2ca81686d9d7573738e1acc3dba5ba94a9fd)
- load first 10 image immediate [`b0023f6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b0023f662ed28947c4ca8fb1bd8150ccb36393e3)
- Add category to manga API responses [`0bf55f0`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0bf55f01abb999f7deaf5845610f3f6f85f5d6af)

#### [v1.6.13](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.12...v1.6.13)

> 29 November 2025

- Development [`#296`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/296)
- comicRead close clean, shortcut, skip thumb [`a315672`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a31567293d578521b364d890fe5af5334632d88c)
- Add unified action history and revert functionality [`c59a630`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c59a6309056bea095d052dbfa9c0c64c01b54340)
- Improve lazy loading and image handling in viewer [`a16a4c6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a16a4c620176156af3e841618cf5a762ec6b848e)

#### [v1.6.12](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.11...v1.6.12)

> 1 November 2025

- Development [`#289`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/289)
- add comicRead(not ready) [`bd3876b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/bd3876b2016a0e1b159006c8f2ef4e2e9a4b4ed0)
- remove double save when init setting [`ac21e29`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ac21e29077deebe63797e502a9a3c0f50e4b6e7a)
- Refactor language initialization logic in Setting.vue [`5a37b03`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5a37b039ed967646c6e0910d6e3cf58ccbbc8b53)

#### [v1.6.11](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.10...v1.6.11)

> 27 September 2025

- Development [`#284`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/284)
- feat: improve file writing safety by using temporary files [`#282`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/282)
- optimize bookList loading and sorting performance [`#280`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/280)
- perf: Optimize array uniqueness handling and folder tree generation [`#278`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/278)
- feat: enable mouse wheel zoom at `scroll` mode [`#267`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/267)
- Improve local book deletion to handle directories [`8d3bd39`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8d3bd39daa9f850e8ebbb80a0f3149da95b2aa1c)
- perf: Performance optimization for array operations and folder tree generation [`f9bcbe6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f9bcbe6697b852118f901b90a35055a5305e25ad)
- perf: optimize bookList loading and sorting performance [`485f921`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/485f92156e2bb62cbed9df94057f47c3656f566b)

#### [v1.6.10](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.9...v1.6.10)

> 28 June 2025

- fix tray icon miss [`#261`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/261)

#### [v1.6.9](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.8...v1.6.9)

> 28 June 2025

- Development [`#259`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/259)
- Revert "update package" [`bef10d4`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/bef10d4004ce86642c884a26de811326f8662eda)
- update package [`429a45f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/429a45fc914d3a619c2cedf2071b8dceb5c77e80)
- Add tray support and minimize options to app [`7e82245`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/7e822458e1dd0a7ac653d6900e3592c9fe173c77)

#### [v1.6.8](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.7...v1.6.8)

> 31 May 2025

- Development [`#251`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/251)
- uniq collection for recent read [`d5c136e`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d5c136e1c22dd1e3724e34bd7dcbca9ed91c3931)
- update package.json [`7c83c07`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/7c83c07e27484d3fe0134ef125612016ebcf2baa)
- remove buymeacoffee [`945ef6d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/945ef6d9404a81584f793bf4ef6a6495940d709c)

#### [v1.6.7](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.6...v1.6.7)

> 29 March 2025

- Development [`#242`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/242)
- Development [`#238`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/238)
- update portable cover update [`#233`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/233)
- update viewer side [`14088c5`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/14088c5fb0fb8dd979bd72b82903337f1a9946e6)
- update TagList [`499e721`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/499e7211e79c4ff7a4e3bb243cfd7ce281a2456a)
- update tagList, internalViewer shortcut [`a7dd2fd`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a7dd2fdebd5dd44c211d62ec4d0ff06eeed2a67f)

#### [v1.6.6](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.6-p1...v1.6.6)

> 1 March 2025

#### [v1.6.6-p1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.5...v1.6.6-p1)

> 4 March 2025

- update portable cover update [`#233`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/233)
- Development [`#232`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/232)
- 增加只显示最近阅读 [`#226`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/226)
- Development [`#223`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/223)
- fix: update reg for group add tag [`#222`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/222)
- 更新文件路径而不重新生成封面 [`#219`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/219)
- 根据文件名导入元数据 [`#218`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/218)
- LANBrowsing support tag translation [`#197`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/197)
- fix: use localstorage to keep read history [`2850d18`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2850d18b91d52c17256ffdea8620f4c067aff0b2)
- feat: add recent read filter [`f11cd99`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f11cd995cc26fff3657a6e02f16eec96215c8eb0)
- feat: LANBrowsing support tag translation [`6b41613`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6b41613bf7753e629f81c6a7fd5a45ca251bfa13)

#### [v1.6.5](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.4...v1.6.5)

> 25 December 2024

- Development [`#206`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/206)
- add pinia [`9925156`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/992515676e4d9c3119cf39c62cdbc0d7a7e06999)
- split EditView [`65c260e`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/65c260ee7e316d1d6fb418d83abfa8f9056428b1)
- split bookDetailView [`226da59`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/226da59c3ac5fb5863c04fd95eaa417873b93c29)

#### [v1.6.4](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.3...v1.6.4)

> 23 November 2024

- Development [`#196`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/196)
- update internalViewer css [`cebc659`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/cebc65978853421a6ffd0c875fc845cefc2053fc)
- add sort by pageCount [`b8f9496`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b8f94968a0988ea351398eb7f5e9cb111dea44dc)
- update resetMetadata [`db84c91`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/db84c9103e631816aeff3cc93fffb499213b0619)

#### [v1.6.3](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.2...v1.6.3)

> 26 October 2024

- Development [`#181`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/181)
- add ".ehviewer" metadata support #55 [`#174`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/174)
- add ".ehviewer" metadata support [`d631595`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d6315953aac051782a45a38e8fae05e70bf85db4)
- update collection card css [`b855387`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b85538738e7ae7b24b9ba760d01470ca26dc142c)
- Update index.js [`c67fcad`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c67fcad98008a268823f9631847760170e4f6551)

#### [v1.6.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.1...v1.6.2)

> 8 September 2024

- Development [`#170`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/170)
- Development [`#163`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/163)
- Revert "update electron" [`1802e9d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1802e9d820c268d5a64c6f0fa7cbd41912b50d88)
- update electron [`4c8a72f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/4c8a72f5aac1bd27398e30a9a94f0df3829cbab6)
- Fix the scan button loading indefinitely when launching new software. [`31ac9cc`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/31ac9cca739dfb79eb3dea4ad3770a6c95229164)

#### [v1.6.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.6.0...v1.6.1)

> 31 August 2024

- Development [`#162`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/162)
- update locale zh-tw [`#158`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/158)
- 繁體中文翻譯完成 [`#157`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/157)
- add eslint [`1f8d533`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1f8d53397d33de9db2eaae897682d597fd7a0da7)
- update lazy render [`b030641`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b030641129494a745ee7ce6db41ccb1e55fa6787)
- zh-TW localization translation WIP [`d99fbd0`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d99fbd0f49a08a0095782a168ed3c5ab814bfd6f)

#### [v1.6.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.17...v1.6.0)

> 26 July 2024

- Development [`#154`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/154)
- Development [`#153`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/153)
- add opds server [`6133e1b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6133e1b2ae2de44cca29712d9401ddbb52131a55)
- remove g6 [`399b6d7`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/399b6d7d2b6df467e48ab1f029e07c9ef927a52d)
- update manga server [`d52daf7`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d52daf7b0918317094200faa749441bd1256d1b8)

#### [v1.5.17](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.16...v1.5.17)

> 29 June 2024

- Development [`#148`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/148)
- update internal viewer [`c980c91`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c980c91dcd3a1ca8cd6ee943d66f746e3ce53aef)
- add box select, update import/export [`755b56d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/755b56d8e7855bbfc22d914a03e9b9bdf86ce48b)
- add groupTag [`1438ac7`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1438ac7013a6b0dcf0b7946c6b8378b253f62f9e)

#### [v1.5.16](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.15...v1.5.16)

> 1 June 2024

- Development [`#142`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/142)
- update search bar [`5938126`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5938126e9a489ce3b319711243da9afe7fde1e9e)
- add onlyGetMetadataOfSelectedFolder setting [`c203bc6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c203bc6f0ec90758154844a795c43e749677d618)
- Update CHANGELOG.md [`42f9c31`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/42f9c3140bfdd8a1117c6f83eac937687dafd04d)

#### [v1.5.15](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.14...v1.5.15)

> 27 April 2024

- Development [`#139`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/139)
- update editTag select options [`93ce96d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/93ce96d3d5882c46c06e1de02e5a231b756125de)
- add delete image [`d21972f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d21972f367fcd90c4d6cd1ca1a28aa714fbb444c)
- Continuously expand the folder tree state, fix the filename function error [`3ffb82d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3ffb82d92b4323f21e097f3c928aa8470a46a637)

#### [v1.5.14](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.13...v1.5.14)

> 30 March 2024

- Optimize loading manga content，fix some bugs [`#132`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/132)
- separate thumbnail generate and resize [`f8478c8`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f8478c8f898b739419d18b0de0fd514461cab0ee)
- props minor edits [`2229776`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2229776379c702f89d20a34071be4c053981b498)
- minor edits [`c2fb3e4`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c2fb3e484751984d517233503e739ac907fabcee)

#### [v1.5.13](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.12...v1.5.13)

> 7 March 2024

- Development [`#130`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/130)
- update batch scrape [`6a8bd22`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6a8bd22bc97f851c845d7f6d21cd0740b15bbbab)
- add current collection edit [`0ca84d8`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0ca84d85359df9e50627d4fd78c6e4c5617a6ff1)
- add trim title at searching [`3906c3f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3906c3fdd8936e60d768b9070364c8f60c801c93)

#### [v1.5.12](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.11...v1.5.12)

> 19 January 2024

- v1.5.12 [`#127`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/127)
- add Japanese README [`#126`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/126)
- Create CHANGELOG.md [`35a3c06`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/35a3c069518a18800ff1c4e7707d15da8d6ff8ea)
- add auto-changelog [`0ee0a69`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0ee0a692b9dfbfcb62d369bd763c2ae4029f60b0)
- update sort [`993789b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/993789be48faae0f5ca422664958d9350b5f3386)

#### [v1.5.11](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.10...v1.5.11)

> 9 December 2023

- Development [`#123`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/123)
- minor edits [`8c2056b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8c2056b19e121ba4372934c46af417f326cfd261)
- update clearFolder [`fd845ca`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/fd845ca09800610cfa1a9df5d432c48d051c1efb)
- disable gif resize [`cf7fe3a`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/cf7fe3afe5e757d605817047249226c658e40b79)

#### [v1.5.10](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.9...v1.5.10)

> 25 November 2023

- split setting, internal-viewer, and others [`#122`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/122)
- Development [`#121`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/121)
- split setting and graph [`85e9ec2`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/85e9ec2c01cc5bc079413ea7fd55cb6109445645)
- update split InternalViewer [`4a72665`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/4a72665f269e5f35fac877e77eba3ad797f7c98a)
- split search dialog [`0ddd682`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0ddd6829c4b95fe7dc69aa564690ce0e9a076362)

#### [v1.5.9](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.8...v1.5.9)

> 5 November 2023

- fix search bar keyboard bug [`#117`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/117)
- update keyboard shortcut [`3c8505b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3c8505b75545fc39d2019c69ee234831e748dad0)
- fix shortcut bug [`81388fb`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/81388fb3c73852bfd4ff545a3c8912e55441e518)

#### [v1.5.8](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.7...v1.5.8)

> 5 November 2023

- Development [`#116`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/116)
- add keyboard navigation [`bc19a06`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/bc19a06a89c08f85501b240d6aaa670294cc9407)
- add setting_accelerators [`fef9b7a`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/fef9b7ab5da60a56367853f8b1ac83edca2020db)
- update mouse shortcut and reverse setting [`39deaab`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/39deaab89ba9c97a33b3af32ac055db620042708)

#### [v1.5.7](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.6...v1.5.7)

> 6 October 2023

- update clipboard, add hentag support [`#114`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/114)
- refactor metadata function [`c56d396`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c56d3965de9de1faa98cfa15eee613cb65b8a96d)
- simplified menu and buttons [`5021bf4`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5021bf4dcb9d5c9b3ec0216da9022d582f4d2805)
- add hentag support [`26c74ba`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/26c74ba41f2d34822c656a00dd0d1db055fc11ea)

#### [v1.5.6](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.5...v1.5.6)

> 28 September 2023

- Update version number [`#113`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/113)
- Fixed a vulnerability occurring with WebP files (CVE-2023-4863) and so on [`#112`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/112)
- update electron builder and fetch [`66822e6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/66822e639aa11829876687f3e2fc8775d3f2efec)
- remove superagent [`2d31661`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2d31661f13db727def529987c72c42def0c4b802)
- update dependences [`1c53d95`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1c53d95f8ae618819daa640aab321200d24ecd12)

#### [v1.5.5](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.4...v1.5.5)

> 21 September 2023

- allow custom metadata database file locale [`#111`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/111)
- add mouse shortcut, minor edits [`5765f80`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5765f80bdfa4c29bc0e3ba176ee86ddbbbd87c73)
- add custom metadata path [`5874c06`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5874c0652030f98d8e50264e33ac70fcc7a67ff8)
- fix collection remove bug, update count display [`ac56a37`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ac56a378ce0e89b7df16297feff39610de440e83)

#### [v1.5.4](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.3...v1.5.4)

> 18 September 2023

- Separate metadata database and so on [`#109`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/109)
- update element-plus [`a7f85ed`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a7f85edc5f134993ea3238e496382340c8685e9a)
- add metadata.sqlite to library path [`8612521`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/86125210217fed3fa784ea78362cbb7fd20cdc60)
- update collection resolve [`ce4bdc9`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ce4bdc9c8ca5185387bac5156ea06a991e263cac)

#### [v1.5.3](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.2...v1.5.3)

> 8 September 2023

- reading progress，progress bar，sort，manga jump [`#106`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/106)
- update index.js format [`140586f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/140586f075b6a95cb6e653558035220dee8ef672)
- Update issue templates [`c2ea1df`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c2ea1dfcc6b67027e178df8ce83cfc58f8222e1e)
- previous manga, minor edits [`1ead48f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1ead48fbb6572b17b601297d37e4b4b907415ca3)

#### [v1.5.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.1...v1.5.2)

> 20 August 2023

- Development [`#102`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/102)
- Development [`#99`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/99)
- Development [`#97`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/97)
- viewer fit width and window [`08d0fb1`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/08d0fb19bac89d4cfa06c205862593d18401058c)
- update preload.js [`dc39600`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/dc3960018a77b8f1e3d2aadf172e85a6cae3d821)
- update book detail function [`7a878cd`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/7a878cde52ab95cc6f3bc4b444e461d809ee7e15)

#### [v1.5.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.5.0...v1.5.1)

> 5 August 2023

- Development [`#90`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/90)
- add menu, fix title_jpn bug [`036a6bd`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/036a6bdb21b2825e6ff66384809fd5a4d451a7e3)
- add delete confirm setting [`994f938`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/994f93810a223615e8330e16c5de200d1792b853)
- update menu [`1eff91f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/1eff91f64182a9fd078a4c92d155fd40f8e85846)

#### [v1.5.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.11...v1.5.0)

> 3 August 2023

- Development [`#88`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/88)
- update glob [`8df8d39`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8df8d3996a59e05ecaca43f9c88148cb772c1779)
- use sqlite for store metadata [`3ea4129`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3ea41291dd0976193fd2add80756d6c5b04cd189)
- detect import cancel [`c6c8ffd`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c6c8ffdde4b19aa618c494cedc57515ce4941a29)

#### [v1.4.11](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.10...v1.4.11)

> 16 July 2023

- Development [`#82`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/82)
- Development [`#70`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/70)
- fixed bug, add customOptions [`298f5d0`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/298f5d0f4d369beda6259640ced0900664727388)
- add display title setting [`ebd81b5`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ebd81b5e47ddfa036ee5fc044cb95b92cbc336b7)
- add chaika support [`c6e9277`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/c6e927742459a1bcf6bdd40acfc2c947e9ef1e70)

#### [v1.4.10](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.9...v1.4.10)

> 4 March 2023

#### [v1.4.9](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.8...v1.4.9)

> 4 March 2023

- Logical OR and UI adjust [`#64`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/64)
- about page and logical OR [`6711f17`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6711f17ec0ac490be403d4250bec1225e4f55858)
- update editTag option [`13a375b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/13a375b6d9012e677eaa6b49115b5118453c7c30)
- fixed duplicate file name error [`ed6a923`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ed6a923f9c66cbb544df0996a7bef5dacafaa052)

#### [v1.4.8](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.7...v1.4.8)

> 13 February 2023

- optimize sort, search [`#60`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/60)
- add mtime, update sort [`743ed05`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/743ed0595c775879a16fc07eb52608eed7cb1cc1)
- add translated autocomplete, remove search history [`af82936`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/af8293623909e74dbbb154978566ae21ddd142d8)
- add mtime [`586f77e`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/586f77ebd0a83cc99d55b88de498be2e45a9d08e)

#### [v1.4.7](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.6...v1.4.7)

> 7 February 2023

- tags analysis, inner viewer, bug fixed [`#57`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/57)
- update inner viewer [`ea80eba`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ea80eba357b2c94e0dafcfa8062891ad33b1434d)
- update tags analysis [`ca8da20`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ca8da20cf739f733e70528aaf9be92c3b76a34b3)
- update force graph [`4194d25`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/4194d25907b220d6aa745bc936513337190f0819)

#### [v1.4.6](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.5...v1.4.6)

> 31 January 2023

- optimize，update check，fix bug [`#52`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/52)
- update gene folderTree function [`ccff636`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ccff63689afd5dfa4bb622ad62b1a72633258d1c)
- add update check [`01fd595`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/01fd59503033fe118926f46d294a41d07acc4ee7)
- add star member support [`5e4f729`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5e4f7299971d07fb7b527f07c440d1f0b34b4b58)

#### [v1.4.5](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.4...v1.4.5)

> 7 January 2023

- doublePage mode and advanced search [`#48`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/48)
- add double page view mode [`ff93ca8`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ff93ca83faadcff6b7bcb7cdf3581180f6c65fdf)
- fixed doublePage mode bug [`654e3d2`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/654e3d2b7a06499a461e7ce3038bb5a2b20a3fb9)
- optimize uniq, add EhSyringe style autocomplete [`3a63300`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3a633004e0def4c8b506d547dc37921332742f67)

#### [v1.4.4](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.3...v1.4.4)

> 16 December 2022

- Development [`#44`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/44)
- optimize single book tag search [`96641e5`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/96641e5de3dcd1c8a7395460035c5e5a6168b74a)
- adjust exsearch function [`6350336`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/63503364fdce89661514fe6de4eb9a29f22e558e)
- customer folder tree width [`cecd92c`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/cecd92c726b58ed926b189aa3426354cf755bf75)

#### [v1.4.3](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.2...v1.4.3)

> 2 December 2022

- some minor edits [`#40`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/40)
- partial save booklist when import sqlite [`d99e122`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d99e122c1a2888c344d1e5841933cdd22210cdf3)
- add electron-window-state [`b200e59`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b200e59a3c34d66acb3646e0fa5a1acbf34b5125)
- setting: filename as title [`d396d89`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d396d89c1280432f261c4725611b2bb28a41548d)

#### [v1.4.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.1...v1.4.2)

> 21 November 2022

- ignore imageset, optimize folder scan [`#38`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/38)
- update readme [`cfb6af0`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/cfb6af044bc4514fe8f97812275522375c46e8e6)
- Update en-US.json [`4952c46`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/4952c46c79f9daf2b3a305ddf4ec06cf601d96f7)
- ignore image set category when searching [`9abeb63`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/9abeb63a819c4e43444bf8139d7b0743dbc9a818)

#### [v1.4.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.4.0...v1.4.1)

> 6 October 2022

- some UI update [`#35`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/35)
- organize App.vue [`d49e6f6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d49e6f638637877963ac3c5094c2779e199d5858)
- organize App.vue [`9b6d748`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/9b6d74827f0088c4ae4f2ca1a016bde7855ae26f)
- organize main process [`8cef2cf`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8cef2cf2d13584cff11621734f661d848326a8e4)

#### [v1.4.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.16...v1.4.0)

> 15 September 2022

- directEnter Switch，overall EX [`#28`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/28)
- partial import sqlite [`0236b56`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0236b56b79f0185ab453cdeb7f4ee507aaff4e13)
- add direct enter option [`07a8242`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/07a8242b885fe03d6da93c5b6ab3c0a0572d943c)
- update sqlite import [`42abf06`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/42abf06306a6b0fec5e8311fb16902bbc1f87561)

#### [v1.3.16](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.15...v1.3.16)

> 10 September 2022

- set 7z for main compression resolver [`#27`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/27)

#### [v1.3.15](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.14...v1.3.15)

> 9 September 2022

- fix zip error, copy/paste tag, fixed bug [`#26`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/26)
- optimize load，fix url error, fix contextmenu error [`#25`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/25)
- add adm-zip for  fix unicode filename in zip archive error [`af05a81`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/af05a81b2fea431bfcec668a4d1cf48807f197a9)
- optimize manga page loaded [`5eb1cec`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5eb1cec79d686b31bdcec5b8dca0ee85cf6879e3)
- copy/paste tag, collection, style adjust [`8cbad70`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8cbad70c550aecae9f5a146e2318ff3630e2f019)

#### [v1.3.14](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.13...v1.3.14)

> 24 August 2022

- bug fixed, i18n [`#23`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/23)
- add i18n [`6f935ab`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6f935ab5c1fe6d743a411d87edac6a71ff3a6dc6)
- update i18n [`bb047e6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/bb047e6f3adc51379bfa413adcdfd9505d87d50f)
- optimize log，part save scan data [`ae140d3`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ae140d375d7afd7fe7fd567ca54a685d0ca00da5)

#### [v1.3.13](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.12...v1.3.13)

> 17 August 2022

- progressbar, folder view, cover size [`#22`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/22)
- Cover adjust，add progressbar [`#21`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/21)
- update cover generate and display [`6aca8b9`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6aca8b9da189ce78f2def06f8257ea889e7ad58e)
- update folder tree [`f44e763`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f44e763815604a329c6e311758683577ef394590)
- minor edits [`764a072`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/764a0727285ff4f34786484d69903229a2ad5727)

#### [v1.3.12](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.11...v1.3.12)

> 14 July 2022

- update tag recommand，fix encrypted compressed package, and other [`#19`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/19)
- add patch local metadata [`24b7fa3`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/24b7fa3d541f3aca63a117a4f1708233ad5c8e53)
- add local pageCount, bundleSize [`face4ca`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/face4ca835d0402d8ac8f8a550073d07e590b608)
- add custom cover [`321e83c`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/321e83c7a17d82507822559fdb4525868a013cbe)

#### [v1.3.11](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.10...v1.3.11)

> 4 July 2022

- icon, theme, tag analysis [`#17`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/17)
- add icon, theme [`#14`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/14)
- add G6 graph, add url recommand [`623ab67`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/623ab6719ad0204644dfde63732a652d12593ce9)
- update tag analysis [`3461b1a`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3461b1ae7f41333e76c66321a0819fef6568a1e9)
- update theme，icon [`24c1ce6`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/24c1ce6626ddca34c79b6d6827f1abb26f4eb9ce)

#### [v1.3.10](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.9...v1.3.10)

> 28 June 2022

- context menu, setting, file loader [`#13`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/13)
- add title, comment context menu [`50e5bf8`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/50e5bf86cb7555f6b6223a0664084579c25feedd)
- translation setting, search history [`2032eca`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2032eca6f879c3fec76f58512585f00016863212)
- translation setting, search history [`875eace`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/875eacee4fde9e5342d605d5417b3df65d35b45a)

#### [v1.3.9](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.8...v1.3.9)

> 25 June 2022

- update 7z, remove adm-zip, add contextmenu [`#11`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/11)
- add contextmenu for cover, minor edits [`93a077b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/93a077b5566f5dae3ca2ab1525299bc271939611)
- remove adm-zip [`eb64669`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/eb646699d8d8f284de3235406102d4d3144fa6b6)
- update 7z, remove adm-zip [`aa2689d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/aa2689ded3ea279c8210a6a97cbfc8161c9569bc)

#### [v1.3.8](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.7...v1.3.8)

> 21 June 2022

- add tag translation, save file optimize, and other [`#10`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/10)
- Update App.vue [`fac35eb`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/fac35eb0e4ddaa3d299fc33843673cd5bcae7ec3)
- add tag translation [`fcf4975`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/fcf4975ca94cb809e08365b92a9db31839483857)
- use brotli resolve json [`b037b49`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b037b49fb3aec3d9d46ad93b0cb86d3d3009e550)

#### [v1.3.7](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.6...v1.3.7)

> 19 June 2022

- v1.3.7 [`#9`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/9)
- add hideBook and hiddenBookSort，update readme [`b7c2a76`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b7c2a7603fae0459da64537ba8addd5b3c8aa289)
- fixed delete book error [`9883872`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/988387237ff16748b3ccd116d2f84e493a45b197)
- add filepath to searchSource [`2a73322`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/2a73322024a18954317ee15653636cceab723437)

#### [v1.3.6](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.5...v1.3.6)

> 13 June 2022

- v1.3.6 [`#5`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/5)
- add rar,7z archive support [`60d1c96`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/60d1c96058e49889499f850247bccfcdbd80e399)
- update 7z, rar support [`63fdf06`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/63fdf0629c4eb140adb47134845c7cf92a1d8999)
- update zip fileLoader [`d31659d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d31659d29840d08a7ee911fc2d69f0ddba37b64d)

#### [v1.3.5](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.4...v1.3.5)

> 7 June 2022

- Development [`#4`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/4)
- Create index.md [`a90ee7b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a90ee7beb81ff103da97ceb75e140bff8d02b8b6)
- add folder manga, add avif, remove bmp support [`489343b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/489343bf8e82b99b7427e83b4c07e5eced596cf3)
- Set theme jekyll-theme-leap-day [`8722a33`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8722a3389ccf5a07787021466b8679e75b8bf144)

#### [v1.3.4](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.3...v1.3.4)

> 7 June 2022

- update collection UI [`adce322`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/adce3224a45c468cfc47601e1668ec571b12e9e9)
- some minor edit, partial add collection UI [`5bd9973`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/5bd997335697d6976ac917a49fc9b98f6c719ab7)
- finish collection UI [`4d7ab90`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/4d7ab90db3cd7bcc30f29ca3ce9e7da9a08090f8)

#### [v1.3.3](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.2...v1.3.3)

> 1 June 2022

- add exhentai comments, add thumbnail and navigate [`f369871`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f369871b4bf26764d882ad04a085f8bc6f796671)
- add require gap, increase metadata accuracy [`798d564`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/798d56471032bdf80ebe4c78528aaa0d8afaca49)
- add some hotkey, fixed some bugs [`9e7089b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/9e7089b97a480841fc9b437f9285371d8d618d42)

#### [v1.3.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.1...v1.3.2)

> 31 May 2022

- make solve file pluginable [`3403100`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/340310030542d080ebdcf2209d5046ae5a672db3)
- rm temp folder after scan [`35e2772`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/35e2772fe290b4bd6f71c178639fb2be5ce0ec28)
- fixed some bug, add error print [`f8f88e2`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f8f88e252b31ca28149f5aa3cc1614800aabd4cd)

#### [v1.3.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.3.0...v1.3.1)

> 28 May 2022

- add mark, sort, outer read, some description [`ef06930`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ef069307de3df6071852b5b4ee6ae95a82cafef3)
- adjust portable logic, fixed some error [`a109299`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/a10929922e939f8dd3128b2922d05bed0afa84da)
- Update README.md [`f46a8b3`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/f46a8b33c65f945e01d0eb5a715c412e4327a001)

#### [v1.3.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.2.2...v1.3.0)

> 25 May 2022

- add portable, add load setting and manual load [`52ce971`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/52ce971c13142f39172fe3f1f90b21da1033fff0)
- Update README.md [`7c6e38b`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/7c6e38bb0fcd5a1720bb5322bcb7ae0688391dd7)
- Update README.md [`76d80d1`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/76d80d19ca016d2ede6a66e552e05a200c037254)

#### [v1.2.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.2.1...v1.2.2)

> 11 May 2022

- add click view [`74c719e`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/74c719e7539d1827c7fe5e67e32f51518de9d276)
- update project name [`3c0b62f`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/3c0b62f49fb2140d7817efd56fc2847498d6e10f)
- Update README.md [`cb8d207`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/cb8d207d6e87376e1ad029e6a4fe23bf88eda32b)

#### [v1.2.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.2.0...v1.2.1)

> 11 May 2022

- enlarge cover resolution, official dark mode [`13dd7de`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/13dd7decc67a748f2e5ea94a4a837ef13df2c40e)
- add viewer [`551aac2`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/551aac275a75c38d89be5af82f064af814eb4d99)
- reverse manga default reivew, fix some bug [`73aa778`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/73aa7781f249acee37f756710b9c715548cfbb0c)

#### [v1.2.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.1.3...v1.2.0)

> 17 April 2022

- some style adjust [`d5be17d`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/d5be17d8099afbd571d0e9008a49257f351b00cd)

#### [v1.1.3](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.1.2...v1.1.3)

> 17 April 2022

- add import export database [`8a2cc5a`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/8a2cc5a4e4960e5dfcf01310e610feeeaf52c756)
- add delete book, sort tag options [`0259bb8`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0259bb864eb16c07cf37c4f032986e75d6b43935)
- add open url [`0001e53`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/0001e53c4d08b61f018ed12d15296b15196ba44f)

#### [v1.1.2](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.1.1...v1.1.2)

> 16 April 2022

#### [v1.1.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.1.0...v1.1.1)

> 16 April 2022

- v1.1.0, add exhentai support, fixed bug [`6e8c6ff`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/6e8c6fffd77a93f05da03a2b814c4c28cd0631e7)
- allow empty proxy, suspend when ip banned [`7ad2f58`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/7ad2f586c81746de84cb62d720d4d4c692cefcbd)

#### [v1.1.0](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.0.1...v1.1.0)

> 15 April 2022

#### [v1.0.1](https://github.com/SchneeHertz/exhentai-manga-manager/compare/v1.0.0...v1.0.1)

> 15 April 2022

- update readme [`e30f7d3`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/e30f7d3b1ff82acd25a2fcf81dce632b59403422)
- Update README.md [`b2bccf0`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/b2bccf0aee0617bef7d70d2095aa85584a44cd47)
- add cover [`ab28ea4`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/ab28ea4e213f65880bf428d867e6c3e9daf0e611)

#### v1.0.0

> 15 April 2022

- Create LICENSE [`#1`](https://github.com/SchneeHertz/exhentai-manga-manager/pull/1)
- init [`91090b1`](https://github.com/SchneeHertz/exhentai-manga-manager/commit/91090b1e433bacb99b343a42ae6fc21fdc6c24fb)
