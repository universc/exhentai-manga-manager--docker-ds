# exhentai-manga-manager 项目说明 · AI 维护指南

> 本文档面向接手的 AI/开发者,用结构化方式描述项目架构、关键机制、常见修改点与构建部署流程。
> 修改代码前请先通读本文,特别是「安全约束」与「远程代理」两章。

---

## 0. 项目一句话

一个「ExHentai 下载漫画的标签化管理与阅读器」,有 **Windows 桌面客户端**(Electron)
和 **Docker 网页版**(Node + Express)两种形态,共用同一套前端与数据格式。

当前版本:v1.9.3(源码在 `exhentai-manga-manager/` 目录)。

## 1. 三种运行形态(务必先理解)

| 形态 | 界面来源 | 数据来源 | 触发条件 |
|---|---|---|---|
| **本地模式**(Win) | 本地打包的 dist | 本机数据目录 | `setting.remoteServer` 为空 |
| **远程桌面模式**(Win) | 本地打包的 dist(永远最新) | NAS 服务器(经本地代理) | `setting.remoteServer` 非空 |
| **浏览器网页模式**(NAS) | NAS 上的 dist | NAS 本机 | 浏览器访问 NAS 端口 |

关键设计:Win 客户端**远程模式不加载 NAS 网页界面**,而是加载**自己打包的界面**,
由主进程内的**本地代理**(`startRemoteProxy`,见 `index.js`)把数据请求转发到 NAS。
因此 Win 版界面功能与 NAS 网页版版本无关,升级 Win 版即可获得新界面。

## 2. 技术栈

- **桌面**:Electron 26(main: `index.js`,preload: `preload.js` / `preload-remote.js`)
- **前端**:Vue 3(Options API + 少量 setup)、Vite 6、Element Plus、Pinia、vue-i18n
- **网页版服务**:Node + Express(`web-server.js`),前端通过 `web-ipc.js` 的 fetch 桥调用 IPC
- **数据**:SQLite(`sequelize` ORM)、sharp(图片)、sqlite3、express、node-fetch v2
- **打包**:electron-builder(NSIS + zip)

## 3. 目录结构

```
exhentai-manga-manager/
├── index.js                  # 桌面主进程:窗口/托盘/单实例/全局快捷键/IPC 注册/远程代理
├── preload.js                # 桌面 preload:暴露 window.ipcRenderer / electronFunction
├── preload-remote.js         # 远程模式 preload:空壳(让前端走 web-ipc 桥)
├── web.js                    # 网页版入口:设置 WEB_MODE=1 并把 require('electron') 替换为 shim
├── web-server.js             # 网页版 HTTP 服务:IPC 桥/登录/账户权限/IP 规则/SSE/静态文件
├── web-electron-shim.js      # Electron API 的 Node 兼容层(网页版无 Electron 时用)
├── modules/
│   ├── init_folder_setting.js  # 数据目录定位(STORE_PATH)+ setting.json 读写 + bootstrap.json
│   ├── auth.js                 # 网页版账户系统:users.json、scrypt 哈希、会话、增删改
│   ├── iprules.js              # IP 黑白名单:iprules.json、IPv4/CIDR 匹配
│   ├── database.js             # Sequelize 模型(Mangas / Metadata)
│   ├── translate.js            # AI 标题翻译(Ollama / OpenAI 兼容)
│   └── prepare_menu.js         # 桌面应用菜单
├── src/                      # Vue 前端
│   ├── App.vue               # 主界面:工具栏/卡片流/右键菜单/账户标记/响应式
│   ├── web-ipc.js            # 网页桥:window.ipcRenderer 模拟(fetch + SSE + 路径改写)
│   ├── pinia.js              # 全局状态
│   ├── utils.js              # 工具与默认设置
│   └── components/
│       ├── Setting.vue       # 设置对话框(常用/阅读器/合集/高级/AI/账户/使用说明)
│       ├── LoginDialog.vue   # 网页版登录框(含「使用本地模式」按钮)
│       ├── BookCard.vue / BookDetailDialog.vue / InternalViewer.vue / ...
├── dist/                     # 前端构建产物(打包时打进应用)
├── out/                      # electron-builder 输出(安装包/绿色版/win-unpacked)
├── docker-镜像/              # 现成 docker 镜像 tar(旧版)
├── 使用说明.md               # 用户向说明
└── 项目说明-AI维护指南.md     # 本文档
```

## 4. 配置与数据文件(重要)

| 文件 | 位置 | 用途 |
|---|---|---|
| `setting.json` | 数据目录 | 全部用户设置(库路径/主题/cookie/运行模式/服务器地址等) |
| `bootstrap.json` | `%APPDATA%\exhentai-manga-manager\` | 自定义数据目录指针(设置→常用→数据文件位置) |
| `users.json` | 数据目录(网页版) | 账户:用户名→{salt, hash(scrypt), role} |
| `iprules.json` | 数据目录(网页版) | `{whitelist:[], blacklist:[]}`,支持 IP 与 CIDR |
| `database.sqlite` | 数据目录 | 漫画库主数据库 |
| `metadata.sqlite` | 数据目录或 setting.metadataPath | 元数据 |

关键设置项(Setting.vue 与主进程共用):
- `remoteServer`:非空 = 远程桌面模式(如 `http://192.168.1.10:10000`)
- `webUsername` / `webPassword`:远程模式自动登录账户
- `startOnLogin` / `alwaysOnTop` / `globalHotkey` / `minimizeToTray` / `closeToTray` / `minimizeOnStart`:桌面窗口功能

## 5. 账户系统(网页版,modules/auth.js + web-server.js)

- 启用:环境变量 `WEB_ADMIN_USER` / `WEB_ADMIN_PASSWORD`(首次启动创建管理员;不配置=匿名访问)
- 角色:`admin`(全部功能)/ `viewer`(只读)
- 登录:`POST /api/auth/login` → `emm_token` HttpOnly Cookie(7 天)
- 会话:内存 Map;登录失败 5 次锁定 60 秒
- **权限拦截点(web-server.js 的 `/api/ipc/:channel`)**:未登录 401;viewer 只允许
  `VIEWER_ALLOWED_CHANNELS` 白名单内的只读通道;`load-setting` 对 viewer 自动脱敏
  (隐藏 igneous/ipb_pass_hash/proxy/openaiApiKey 等);`load-book-list(scan=true)` 也拒绝
- 管理接口:`auth-list-users` / `auth-add-user` / `auth-remove-user` / `auth-change-password` /
  `auth-get-ip-rules` / `auth-set-ip-rules`(均仅 admin 可达)

⚠️ **修改前端时注意**:viewer 的 UI 隐藏逻辑基于 `window.__AUTH__.role === 'viewer'`;
服务端拦截是最终防线,新增写操作 IPC 时必须同时:①加入白名单外的拒绝范围(默认拒绝,无需操作)
②前端按 viewerRole 隐藏入口。**不要把写操作加入 `VIEWER_ALLOWED_CHANNELS`**。

## 6. IP 黑白名单(modules/iprules.js)

- 黑名单:命中即全站 403(全局中间件,页面都打不开)
- 白名单:命中即免登录,视为 admin
- 匹配:单 IP 或 CIDR(`192.168.1.0/24`)
- 管理 UI:设置 → 账户 → IP 访问控制(仅 admin)

## 7. 远程桌面模式与本地代理(index.js 的 startRemoteProxy)

窗口加载 `http://127.0.0.1:<随机端口>/`(本地 dist),代理转发:

| 代理路由 | 行为 |
|---|---|
| `POST /api/ipc/:channel` | 大多数通道转发 NAS;**本地拦截**:load-setting/save-setting(设置存本机)、update-window-title、open-url、窗口控制(get-window-state/window-minimize/...) 等桌面通道 |
| `GET /api/file` | 流式转发(NAS 封面/图片) |
| `GET /api/events` | SSE 流式转发 |
| `POST /api/auth/login` | 转发并缓存 NAS 会话 Cookie(自动登录用 webUsername/webPassword) |
| `GET /api/info` | 转发并注入 `remoteDesktop: true`(前端据此按桌面风格显示设置界面) |

前端 `web-ipc.js` 从 `/api/info` 读取:设置 `__WEB_MODE__`、`__REMOTE_DESKTOP__`、`__AUTH__`。
Setting.vue 用 `showDesktopUI`(= 非网页模式 或 远程桌面模式)决定是否显示完整设置页;
**账户页只在纯浏览器网页模式显示**(`isWebMode && !isRemoteDesktop`)。

⚠️ 新增"需要本地处理"的 IPC 通道时,记得在代理的 `/api/ipc/:channel` 里加拦截分支,
否则会被转发到 NAS 而 404。

## 8. 网页版桥(web-ipc.js)

- 只在 `!window.ipcRenderer` 时安装(桌面 preload 已暴露则跳过)
- `invoke` → `POST /api/ipc/:channel`;`on` → SSE `/api/events`;`sendSync` → 缓存 pathSep
- 本地文件路径自动改写为 `/api/file?path=...`(封面/图片)
- 401 时触发 `emm-auth-required` 事件(LoginDialog 监听)

## 9. 构建与部署

### 9.1 Windows 客户端

```bash
npm install                 # 首次(sharp/sqlite3 需网络下载预编译二进制)
npm run build               # vite 构建 → dist/
npx electron-builder --win  # → out/ 生成 NSIS 安装包 + zip
```

- 安装包: `out/exhentai-manga-manager Setup <版本>.exe`
- 绿色版: `out/exhentai-manga-manager-<版本>-win.zip`
- 静默安装: `Setup.exe /S /D=D:\目标目录`
- 版本号改 `package.json` 的 `version` 字段

### 9.2 Docker 网页版(NAS)

```bash
# NAS 上执行(项目目录内)
docker compose up -d --build
```

- Dockerfile 已做**国内镜像加速**(ENV 指向 npmmirror:sharp libvips/prebuild、sqlite3)
- build 阶段用 `npm ci --ignore-scripts`(前端构建不需要原生二进制,避免 GitHub 超时)
- 环境变量:`WEB_DATA_DIR`(数据目录,必须持久化)、`LIBRARY_DIR`、`WEB_PORT`、
  `WEB_ADMIN_USER` / `WEB_ADMIN_PASSWORD`(启用账户系统)
- 数据卷:数据目录 → `/data`,漫画库 → `/library`
- 现成镜像:`docker-镜像/exhentai-manga-manager-1.6.16-port10000.tar.gz`(旧版,仅应急;
  新版请用 `docker compose up -d --build` 构建)

### 9.3 部署到用户机器

用户机器现状:D 盘安装版 + 绿色版(v1.9.3),服务器模式连 `http://192.168.1.10:10000`(NAS)。
用户数据目录:`%APPDATA%\exhentai-manga-manager`(setting.json 含 remoteServer 与账户)。

## 10. 安全约束(修改前必读)

1. **viewer 权限**:所有写操作 IPC 默认拒绝;只把纯读通道加入 `VIEWER_ALLOWED_CHANNELS`
2. **设置脱敏**:viewer 的 load-setting 响应会剔除敏感键,别把敏感数据放非脱敏键里
3. **远程代理**:新增桌面通道记得在代理加本地拦截;代理只监听 127.0.0.1
4. **密码存储**:scrypt 加盐哈希(modules/auth.js),任何地方不得明文存密码
5. **数据目录**:setting.json 用原子写入(tmp + rename);别在数据目录外硬编码路径
6. **文件/目录接口鉴权**:`/api/file`、`/api/list-dir`、`/browse` 必须带 `requireLogin` 中间件(1.10.1 起)。新增任何读取文件系统或数据目录的路由时,一律挂上它;公开路由只允许 `/api/info`、`/api/auth/*` 与登录页面本身

## 11. 常见修改点速查

| 需求 | 改哪里 |
|---|---|
| 新增设置项 | modules/init_folder_setting.js(默认值)+ Setting.vue(UI)+ index.js(应用逻辑) |
| 新增 IPC | index.js(注册)+ preload.js 或 web-ipc.js(前端调用) |
| 改 viewer 可见功能 | web-server.js 的 VIEWER_ALLOWED_CHANNELS + 前端组件 viewerRole 判断 |
| 改界面模式 | Setting.vue 的 showDesktopUI / runMode;index.js 的 remoteServer 判定 |
| 改托盘/窗口 | index.js 的 createTray/buildTrayMenu/createWindow |
| 改账户/IP 规则 | modules/auth.js / iprules.js + web-server.js 拦截 + Setting.vue 账户页 |
| 打包发布 | 改 version → npm run build → electron-builder --win;NAS 用 docker compose up -d --build |

## 12. 版本历史

| 版本 | 要点 |
|---|---|
| 1.6.x | 基础版(网页版无账户) |
| 1.7.x | Win 增强:开机启动/置顶/全局快捷键/托盘;NAS 远程模式(最初直接加载 NAS 界面) |
| 1.8.x | Docker 账户系统(admin/viewer)+ 权限拦截 + 设置脱敏 |
| 1.9.x | 退出登录入口、viewer 界面精简、IP 黑白名单、手机平板响应式、界面模式切换按钮 |
| 1.9.3 | **远程桌面模式重构**:本地界面 + 本地代理转发 NAS;设置界面与本地一致(无账户栏);登录框「使用本地模式」按钮;托盘菜单最小化到托盘 |
| 1.10.1(修复) | ①**修复「设置反复丢失」**:save-setting 与现有设置合并、前端不再在 load-setting 之前保存空设置;②`/api/file`、`/api/list-dir`、`/browse` 增加登录鉴权 |

## 13. 常见坑

- **打包失败 EBUSY**:客户端进程未关闭,sharp DLL 被占用 → 先关客户端再打包
- **NAS 构建失败**:多为 GitHub 下载超时(sharp/sqlite3)→ 检查 Dockerfile 镜像 ENV 是否还在
- **viewer 看不到漫画**:load-setting 必须在 VIEWER_ALLOWED_CHANNELS(历史 bug,勿回归)
- **远程模式设置不生效**:检查代理是否拦截了该通道;设置类通道(load/save-setting)是本地处理的
- **白名单失效**:iprules.json 被网页端保存操作覆盖;保存前先读回确认
- **设置反复丢失(高频坑,已修)**:根因是两处叠加 —— ① `src/App.vue` 的 `mounted()` 在 `load-setting` 之前就用还空着的 pinia `setting` 调 `save-setting`(载荷只有 `contextMenuOptions`);② `index.js` 的 `applySetting` 用 `setting = receiveSetting` 整份替换。结果每次打开页面/重启后 setting.json 被清成 `{"contextMenuOptions":...,"library":"/library"}`(NAS 上残留的 `setting.json.broken-20260930` 就是实证)。修复:① `applySetting` 开头 `receiveSetting = { ...setting, ...(receiveSetting || {}) }` 先合并;② 前端把 contextMenuOptions 的合并保存移到 `load-setting` 之后。**以后任何保存设置的路径,都不能让局部对象整份覆盖 setting。**
