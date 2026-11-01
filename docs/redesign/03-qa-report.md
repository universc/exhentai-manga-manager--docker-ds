# UI 重构交付前 QA 回归报告

- 报告人：QA（Edward）
- 时间：2026-10-31
- 被测对象：`a40f994`（全站 UI 重构，阶段一~三完成）
- 目标库：`C:\Users\universc\Desktop\大肥鱼工作区\002\exhentai-manga-manager`
- 结论一句话：**样式层（令牌/主题/网格/卡片/页头/设置/阅读器外壳）回归基本通过；发现 1 个后端既有 Bug（写操作全线 500）、1 个 320px 横向溢出、2 处轻微对比度不达标。**

---

## 0. 环境与方法

- 构建：`vite build`（生产 minify）到 `.tmp/dist-prod`；调试构建（`--minify false`）到 `.tmp/dist-debug`，用 `.tmp/shots/serve-debug.js`（23901，反代 23899）供截图/探针。
- 主服务：`WEB_PORT=23899` 服务 `.tmp/ui-data`（隔离副本，40 本假书）。**未触碰真实用户数据**（`%APPDATA%\exhentai-manga-manager`）。
- 第二实例（仅用于把「后端 500」与「UI 功能」解耦）：`WEB_PORT=23898 WEB_DATA_DIR=.tmp/qa-data`，把 Metadata 的 `createdAt` 修正为合法值后验证写操作/阅读器。测试结束已 `kill` 并删除 `.tmp/qa-data`、`.tmp/qa-db`。
- 探针脚本（都在 `.tmp/shots/`）：`qa-lib.js`（登录/错误采集）、`qa-grid.js`、`qa-d5.js`、`qa-themes.js`、`qa-motion.js`、`qa-header.js`、`qa-settings.js`、`qa-persist.js`、`qa-cards.js`、`qa-reader.js`、`qa-dialogs.js`、`qa-val.js`、`qa-scroll.js`。
- 判定口径：WCAG AA（正文/小字 ≥4.5:1，大字号 ≥3:1）；「看起来正常」一律不算通过，必须有数值或响应体。

---

## 1. A. 构建与体积

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| build 通过 | PASS | `vite build` 12.4s，24763 modules，无 error |
| `dist/assets/*.css` ≤ 512,000 B | PASS | `index-ChdFbsJS.css` = **482,670 B**（gzip 70.59 kB） |
| CSS 文件数 = 1（不新增 chunk） | PASS | `ls assets/*.css | wc -l` = **1** |
| JS 无新增动态 chunk | PASS | 仅 2 个 js：`index-cKMoPkth.js`（2,488,915 B）+ `ComicReader.umd-0J-vwp4X.js`（动态 import，`InternalViewer.vue` 懒加载，**重构前既有**，非新增） |
| 无新增 `console.error` 调试残留 | PASS | `src/` 共 26 处 `console.error`、12 处 `console.log`，逐条核对**全部在 `try/catch` 错误处理内**（App.vue / EditView / InternalViewer / SearchDialog / pinia / web-ipc）；`src/styles/*` 内 **0 处** console |

---

## 2. B. 六主题 × 关键页面

切换 `html` class（与 `utils.js applyThemeClass` 一致：值即 class，`light e-hentai`→`light e-hentai`，`dark exhentai`→`dark exhentai`，`nhentai`→`nhentai`，`custom`→`custom theme-custom`）。

### 2.1 视觉截图（书架，1440）

| 主题 | 截图 | 白底黑字/深底深字/透明穿透 |
| --- | --- | --- |
| light | `qa-theme-light-1440.png` | 无 |
| dark | `qa-theme-dark-1440.png` | 无 |
| dark exhentai | `qa-theme-dark-exhentai-1440.png` | 无 |
| light e-hentai | `qa-theme-light-ehentai-1440.png` | 无 |
| dark nhentai | `qa-theme-dark-nhentai-1440.png` | 无 |
| custom（主色 #7C3AED） | `qa-theme-custom-1440.png` | 无 |

### 2.2 对比度抽样（正文阈值 4.5:1）

| 元素 | light | dark | dark exhentai | light e-hentai | nhentai | custom |
| --- | --- | --- | --- | --- | --- | --- |
| 卡片标题 `.book-title`（13px/500） | 17.33 | 16.0 | 10.94 | 13.06 | 17.39 | 17.33 |
| meta chip `.emm-chip--num`（11px） | 5.81 | 8.75 | 4.57 | 5.29 | 7.38 | 5.81 |
| 阅/读分段 `.emm-seg__btn`（12px） | 6.77 | 8.3 | **4.34 ✗** | 6.17 | 7.01 | 6.77 |
| 页头图标 `.emm-icon-btn` | 7.07 | 8.01 | 5.19 | 5.56 | 8.26 | 7.07 |
| 分页总数 `.el-pagination__total` | 7.07 | 8.01 | 5.19 | 5.56 | 8.26 | 6.11 |
| 当前页码 `.el-pager li`（12px/700） | 4.7 | 6.71 | 5.8 | 14.16 | **4.43 ✗** | 5.7 |
| 设置页标签（14px） | 7.38 | 7.05 | — | — | — | — |

- 结论：**dark exhentai 的阅/读分段按钮 4.34**、**dark nhentai 的当前页码 4.43** 两处低于 4.5:1（详见 §7 FAIL-3/4，轻微）。其余全部达标。
- 设置页标签在 light/dark 分别为 7.38 / 7.05，达标。

### 2.3 `prefers-reduced-motion: reduce`

Playwright `reducedMotion:'reduce'`（`qa-motion.js`）：

- 卡片 `.book-card`：`transition-duration` 全部被压到 **0.001s**，`animation-name: none`，`transform: none`。
- `.book-card-frame` / `.emm-header` / `.emm-icon-btn`：同上，均 1ms、无动画、无 transform。
- 判定：**PASS**（1ms 等价于无动画；无位移）。截图 `qa-reducedmotion-1440.png`。

---

## 3. C. 书架与性能（重点）

| 检查项 | 结果 | 证据 / 数值 |
| --- | --- | --- |
| C1 网格为 grid | PASS | `.book-card-list` `display: grid`；6/4/3 列（cover 220/300/420） |
| C1 frame.h == card.h（三档，≤2px） | PASS | 220→369/369（diff 0）；300→482/482（diff 0）；420→652/652（diff 0）。`contain-intrinsic-size` 精确命中（如 `auto 220px auto 369px`） |
| C2 滚动加载追加 | PASS | 滚动容器是 `.book-card-area`（`overflow-y:auto`）；卡片 24→40 追加，`scrollHeight` 1512→2655 **单调不减** |
| C2 滚动条长度不跳变 | PASS | 逐 500px 采样 15 次，`scrollHeight` 全程非递减（无回退） |
| C3 D5 离屏卸载 | PASS（有数据规模前提） | 220px 下 40 本总高仅 2655px <「视口+1600px×2」，几乎触发不到卸载；改用 420px（列表 9284px）：滚到 5000/8000 → `frames=40 / cards=28 / placeholders=12`（一次卸载 12，符合「单批上限 12」），滚回顶部 → cards 恢复到 24（首批保留） |
| C3 D5 编辑模式不卸载 | PASS | 进入「管理合集」后书架换成编辑视图（BookGrid frames=0），无 placeholder |
| C4 横向无滚动条 1440/1024/640 | PASS | `scrollWidth == clientWidth`（1440/1024/640） |
| C4 横向无滚动条 320 | **FAIL** | 载入 40 本后 320px：`scrollWidth=361 > clientWidth=320`（+41）。溢出元素：`.emm-header__section--center` right=442、`.search-input`/`.el-input__wrapper` 宽 280 right=402。截图 `qa-320-afterload.png`（底部可见横向滚动条 + 右侧红色溢出标）。 |

> 说明：320px **未载入数据时**不溢出（sw=320），**载入 40 本后**才溢出——与页头中段/搜索框在窄屏收缩不完全有关。详见 FAIL-2。

---

## 4. D. 功能零丢失（抽查）

> 注意：主库 `.tmp/ui-data` 因后端 Bug（见 §6 E1）导致**任何写操作返回 500**，故涉及「保存」的交互（收藏、阅读计数、打开阅读器、编辑信息）在 23901 上被 500 阻断。为把「UI 功能」与「后端 Bug」解耦，D3/D5 在第二实例（Metadata 已修正、写操作正常）上验证。

### 4.1 D1 设置页（175 字段）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 7 个主 Tab 全部可打开 | PASS | 常用 / 阅读器 / 标签 / 高级 / 功能设置 / 账户 / 使用说明，逐个打开 `visible:true`，**0 console error**，截图 `qa-setting-tab0..6.png` |
| 控件渲染 | PASS | 各 Tab 交互控件数 6 / 26 / 5 / 62 / 41 / 13 / 0 = **153 个顶层输入**（另有嵌套二级菜单/像素子弹窗） |
| 改动落盘 + 持久化 | PASS | 改 `imageExplorer` → 触发 `saveSetting` → `load-setting` 读回新值（equal:true）→ 还原 → 重开设置表单仍显示原值。另：先前经页头「切换主题」产生的 `theme="dark exhentai"` 已持久化并跨会话保留。 |

### 4.2 D2 页头 19 个图标按钮

- `emm-icon-btn` 共 **19** 个（含倒序按钮），逐个点击，均有响应、无 JS 报错：
  文件夹树(开抽屉)、当前库、搜索、随机排序、增量扫描(触发扫描并提示「漫画库目录不可访问」)、全库扫描、**批量获取元数据(弹 toast「获取元数据完成」)**、标签分析(全屏弹窗)、管理合集(进编辑)、管理标签、切换阅读器、切换主题(html class 变更)、全屏、筛选(弹窗)、**任务记录(开 `.download-panel`)**、侧边详细信息、倒序、设置(弹窗)、界面模式。
  > 首轮探针把「批量获取元数据」「任务记录」误判 FAIL，复核后确认**均有响应（PASS）**——前者是瞬时 toast 被漏检，后者是探针选择器不全（实际渲染 `.download-panel`，见 `qa-download-panel.png`）。
- 900px 溢出收纳：`.emm-overflow-btn` 出现（12 个可见 + `⋯`），菜单含 **14 项**（随机排序/增量扫描/全库扫描/批量获取元数据/标签分析/管理合集/管理标签/切换阅读器/切换主题/全屏/筛选/任务记录/侧边详细信息/自动），可读、定位正确，**无横向滚动**。截图 `qa-header-900-overflow.png`。

### 4.3 D3 卡片 15 事件（在健康实例验证）

| 事件 | 结果 |
| --- | --- |
| 标题点击 → 详情弹窗 | PASS（`dialogs:1`，内部 11 个按钮：关闭/阅/读/隐藏评论/编辑信息/种子/手动获取元数据/隐藏漫画/打开所在目录/删除文件/重扫） |
| 封面右键 → 右键菜单 | PASS（`.mx-context-menu`，10 项：手动/重置元数据、打开所在目录、移动文件、删除文件、隐藏/显示漫画、复制/粘贴标签、从链接取元数据、恢复 .bak） |
| 阅 / 读 → 阅读器 | PASS（健康实例，见 D5） |
| 页数 chip / 分类 chip / 收藏书签 | 点击有响应；但会触发 `save-book`——主库因 E1 报 500，健康实例正常 |
| 悬停 | PASS（`.book-card` hover 类切换） |
| 种子按钮 | 未覆盖（默认数据下卡片不显示种子按钮，未找到触发入口） |

> 另：主库点击封面/阅/读时，`save-book` 500 会**导致阅读器打不开**（见 §6 E1 影响面）。

### 4.4 D4 侧栏 / 下载栏 / 详情

| 项 | 结果 |
| --- | --- |
| 侧栏详情 | 打开 PASS（`.detail-panel` 宽 340）。但**未选中书籍时只有关闭按钮**，「9 个动作按钮」需先选中书籍才能出现，本轮未逐一点击（见 §8 未覆盖）。截图 `qa-side-panel.png` |
| 下载栏 | 打开 PASS（`.download-panel` + 空态 `emm-state--empty download-empty`）。逐条任务/「全部继续」等未覆盖（无下载任务数据） |
| 详情弹窗 | 打开 PASS，11 个按钮可见，含「获取元数据」可开搜索弹窗（PASS）。19 个动作未逐一执行（见 §8） |

### 4.5 D5 阅读器（健康实例，`viewerType=original` 内置外壳）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 通过「阅」打开 | PASS | `.viewer-container` 可见，`drawerVisible:true` |
| 画布固定 #0A0A0C | PASS | `viewer-container` 背景 `rgb(10,10,12)` = `#0A0A0C` |
| 底部胶囊浮条 11 工具项 | PASS | 13 个按钮：关闭/卷轴/单页·双页/阅读方向/适配/缩小/放大/缩略图/显示侧边栏/固定设置栏/上一本/下一本(随机)/下一本（11 个工具 + 关闭/上一下一本） |
| 翻页（滚动模式） | PASS | 默认卷轴模式，滚到底页标签推进到 `9,10 / 11,12 / 13 of 13`（13 页含封面） |
| 单双页切换 | PASS | 点「单页/双页」→ 标签由 `1 of 13` 变 `1, 2 of 13` |
| 退出 | PASS | Esc 关闭抽屉，回到书架（24 卡在架） |
| 报错 | 无 | 打开/滚动/切换全程 0 error |

> 键盘 `ArrowRight/ArrowDown/PageDown/Space` 在**卷轴模式**下不翻页属设计行为（连续滚动），非 Bug。
> 截图 `qa-reader-open.png`、`qa-reader-zoom.png`、`qa-reader-exit.png`。

### 4.6 D6 弹窗族（开 + Esc 关）

| 弹窗 | 打开 | Esc 关闭 | 证据 |
| --- | --- | --- | --- |
| 筛选 EhFilter | PASS | PASS | `qa-dlg-filter.png` |
| 标签分析 TagGraph | PASS | PASS | `qa-dlg-taggraph.png` |
| 文件夹树（抽屉） | PASS | PASS | `qa-dlg-foldertree.png` |
| 设置 | PASS | PASS | `qa-dlg-settings.png` |
| 搜索（详情内「获取元数据」） | PASS | PASS | `qa-dlg-search.png` |
| 移动文件（右键→移动，级联） | PASS | PASS | （探针输出 clicked=true open=true） |
| 下载 | 未覆盖（封面右键无「下载」项，本数据/设置下触发入口未找到） | — | — |
| 自动合集 | 未覆盖（编辑合集视图未找到「智能生成」按钮出口） | — | `qa-dlg-auto.png` |
| 登录 | PASS（启动即弹 `.login-mask`，admin/uitest12345 可登录） | — | — |

---

## 5. 结论汇总表

| 域 | 结果 | 备注 |
| --- | --- | --- |
| A 构建/体积 | PASS | CSS 482,670 B、1 个、无新 chunk、无残留 |
| B 六主题一致性 | PASS（2 处对比度轻微 FAIL） | 无白底黑字/深底深字/穿透 |
| B reduced-motion | PASS | 1ms 无动画无位移 |
| C1 网格/卡片高度 | PASS | 三档 diff=0 |
| C2 滚动加载/高度单调 | PASS | 24→40，单调 |
| C3 D5 卸载 | PASS（数据规模前提） | 12 上限、首批保留、编辑不卸载 |
| C4 320 无横向滚动 | **FAIL** | +41px |
| D1 设置 7 Tab/持久化 | PASS | 153 顶层控件 |
| D2 页头 19 按钮/溢出 | PASS | 19/19 有响应；900 溢出 14 项 |
| D3 卡片事件 | PASS（种子未覆盖） | 主库受 E1 影响 |
| D4 侧栏/下载/详情 | 部分覆盖 | 9/19 动作需选中书籍，未逐一 |
| D5 阅读器 | PASS | #0A0A0C、11 工具、翻页/单双页/退出 |
| D6 弹窗族 | PASS（下载/自动合集未覆盖） | 开+Esc 正常 |

---

## 6. E. 已知问题定性

### E1（重要）`/api/ipc/save-book` 500 `Validation error` —— 判定为**后端真 Bug**（非假数据字段不全）

**复现（用应用自身 API 产出的完整书籍对象，非手搓）：**
1. 登录后 `POST /api/ipc/load-book-list {"args":[]}` → 取 `result[0]`（含全部 Mangas 字段）。
2. `POST /api/ipc/save-book {"args":[book]}`（仅改 `title`）→ **`{"ok":false,"error":"Validation error"}`，HTTP 500**。

**证据链：**
- 数据库里 `Mangas.createdAt` 是**合法值**：`fake0001 → "2026-10-29T17:20:11.514Z"`；`Mangas` 表 **0 行** `createdAt IS NULL`。
- 但 `load-book-list` 返回的 40 本书**全部** `createdAt: null`（`qa-val`/`books.json` 实测 40/40）。
- 在数据库副本上复现底层异常（`qa-val.js`）：
  - `Manga.update(extBook,{where:{id}})` 抛 `SequelizeUniqueConstraintError`，
  - `e.parent.message = SQLITE_CONSTRAINT: NOT NULL constraint failed: Mangas.createdAt`。
- 根因定位（源码，非臆测）：
  1. `index.js loadBookListFromDatabase()` 里 `Object.assign(book, findMetadata)`——把 **Metadata 表**的 `toJSON()` 覆盖到书籍对象上；
  2. `metadata.sqlite` 的 `Metadata.createdAt` 存的是字符串 **`"Invalid date"`**（40/40 行）→ 读出 `new Date("Invalid date")` = `Invalid Date` → `JSON.stringify` 得 **`null`**；
  3. 于是 `book.createdAt` 被抹成 `null` 一路吐给前端；
  4. 前端把整本书回传 `save-book`，`saveBookToDatabase` 直接 `update(...)` 写入 `createdAt=null` → NOT NULL 约束失败 → 500。
- **对照实验（决定性）**：把 Metadata 的 `createdAt` 修正为合法值后（第二实例 23898，其余不变）：
  - `load-book-list` 返回 `createdAt` 合法（0/40 null）；
  - `save-book` → **`{"ok":true,"result":null}`，HTTP 200**。

**影响面**：`createdAt` 为 Invalid 的库上，**所有写操作**（收藏、阅读计数、状态变更、详情编辑）都会 500；且**打开阅读器会失败**（点封面/阅/读时先写阅读状态，500 中断，`viewer-container` 不出现）。截图 `qa-reader-fail.png`、`qa-reader-debug.png`。

**责任方**：后端（`buildLoadBookList` 的 metadata 合并覆盖时间戳 + `saveBookToDatabase` 未剔除客户端回传的只读时间戳 + Metadata `createdAt` 污染）。**本报告未改业务代码。**

> 提示：这是**既有后端问题，非本次 UI 重构引入**；但会掩盖 D 类 UI 功能验证，建议修复后重跑 D3/D5 主库部分。

### E2「当前使用的库」只读徽标 —— 工程师结论**成立**，但定性为**架构使然（非数据 Bug）**

- `ipcMain.handle('load-book-list', (event, scan))` **没有 libraryId 入参**；`loadBookListFromDatabase()` 用 `boxLibraries()` = 「当前切换框内所有已生效库」**合并**返回。
- 因此「切换某个库为当前」在**单库单选**语义下，`load-book-list` 返回的仍是整框合并集（在单库配置下就是那 40 本）→ 「界面切了、书架没换」是**预期行为**，不是查询写错。
- 结论：把「当前使用的库」做成**只读徽标**是**正确的缓解**。建议维持，不需要按后端 Bug 处理；若要支持单库切换，应改为「按库过滤书架」的产品需求。

---

## 7. FAIL 项（按严重度排序）

### FAIL-1【严重 / 受影响库阻断】`save-book` 500 `Validation error`（后端）
- 复现：见 §6 E1（`POST /api/ipc/save-book {"args":[book]}`，book 来自 `load-book-list`）。
- 期望：HTTP 200，字段落库。
- 实际：HTTP 500 `{"ok":false,"error":"Validation error"}`；底层 `NOT NULL constraint failed: Mangas.createdAt`。
- 附带：受影响库上**阅读器打不开**（`qa-reader-fail.png`）。
- 责任方：**后端**（非 UI 重构引入）。
- 证据：`qa-val.js` 输出、`books.json` 40/40 `createdAt:null`、23898 对照 200。

### FAIL-2【一般】320px 横向溢出（前端样式）
- 复现：装 40 本 → 视口 320 → `documentElement.scrollWidth=361 > clientWidth=320`。
- 期望：`scrollWidth <= clientWidth`（与 1440/1024/640 一致）。
- 实际：溢出 +41px；来源 `.emm-header__section--center`（right=442）与 `.search-input`（280px，right=402）；底部 `.el-pagination` 亦被截断。
- 责任方：**前端样式**（页头中段/搜索框未在极窄屏收缩；`--emm-search-min-width 280` 在 320 无兜底）。
- 证据：`qa-320-afterload.png`、`qa-scroll.js` OVERFLOW@320 输出。

### FAIL-3【轻微】dark exhentai 阅/读分段按钮对比度 4.34:1（前端样式）
- 复现：`html.class="dark exhentai"`，取 `.emm-seg__btn`（12px/500，fg `rgb(168,168,180)` on `rgb(61,65,75)`）。
- 期望：≥4.5:1。实际：4.34:1。
- 责任方：**前端样式**（`--emm-text-3` 在 exhentai 深灰底上偏低）。
- 证据：`qa-themes.js` 输出；截图 `qa-theme-dark-exhentai-1440.png`。

### FAIL-4【轻微】dark nhentai 当前页码对比度 4.43:1（前端样式）
- 复现：`html.class="nhentai"`，取激活 `.el-pager li`（12px/700，fg `rgb(255,255,255)` on `rgb(213,66,85)`）。
- 期望：≥4.5:1。实际：4.43:1（差 0.07，几乎达标）。
- 责任方：**前端样式**（品牌红 #D54255 上白字偏低）。
- 证据：`qa-themes.js` 输出；截图 `qa-theme-dark-nhentai-1440.png`。

---

## 8. 未覆盖项（明确未测，不算通过）

1. **下载弹窗**：本数据/设置下封面右键菜单无「下载」入口，未找到触发路径，未验证（截图 `qa-dlg-download.png` 为空）。
2. **自动合集弹窗**：进入编辑合集视图后未找到「智能生成」按钮文案出口，未打开（`qa-dlg-auto.png`）。
3. **侧栏 9 个动作按钮**：未选中书籍时侧栏只有关闭按钮；未先选中再逐一验证 9 个动作。
4. **详情弹窗 19 个动作**：仅验证「打开 + 11 按钮可见 + 获取元数据弹搜索」，未逐个点击 19 个动作（删除/重扫/移动等具破坏性，未在隔离库执行）。
5. **种子弹窗 / H@H 弹窗 / 收藏夹选择 / 移动选择（下载栏）/ 目录选择 / 标签快速编辑**：无对应数据或未找到可靠触发入口，未验证。
6. **右键菜单 14 项逐项行为**：仅验证菜单可打开（10 项可见），未逐项执行。
7. **编辑视图大量按钮（管理标签/合集）**：仅验证可进入，未逐按钮执行。
8. **真实全屏（Fullscreen API）**：headless 下无法确认真实全屏效果，仅确认点击无报错。
9. **一次偶发 `pageerror: this.getComments is not a function`**：在一次「打开阅读器后连按多键 + 切单双页」的快速操作中出现 1 次，随后用干净脚本（打开→滚动→切单双页→退出）**未能复现**，原因未定，暂记为观察项（非稳定失败）。
10. **320px 以外的手机档（360/375）**：在**未载入数据**时 OK；载入 40 本后仅在 320 复现溢出，360/375 未复测载入态。

---

## 9. 数据清理声明

- 未修改真实用户数据目录。
- 主库 `.tmp/ui-data` 在测试中因打开阅读器导致 `readCount` 被自增、`book0.title` 被改名；**已全部还原**：`title` 恢复为 `Autumn Rain Anthology`，40 本书 `readCount` 按 seed 规则 `(N-1)*3` 复位，`mark`/书目数量（40 本）与首屏 24 卡基线不变。
- 第二实例的临时数据 `.tmp/qa-data`、数据库副本 `.tmp/qa-db`、临时 `cookies*.txt / books*.json / save*.json / setting.json` 已删除；23898 进程已停止；23899/23901 共享服务保持运行。
- `.tmp/shots/` 下的探针脚本与 `qa-*.png` 截图保留作为证据。
