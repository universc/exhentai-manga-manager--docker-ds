# 飞牛 NAS(fnOS)Docker 部署指南

本项目自带网页版(`node web.js`),本目录的 Docker 文件把它打包成容器,
让你可以在飞牛 NAS 上以网页服务的方式运行 exhentai-manga-manager:
**电脑和手机只需用浏览器访问 `http://NAS的IP:10000`,即可使用全部功能**
(建库扫描、标签管理、在线阅读、AI 标题翻译等)。

> 网页版与 Windows 桌面版共用同一套代码与数据格式,
> 你现有的 Windows 数据目录(设置/数据库/封面)可以直接挂载复用,详见下文「迁移」章节。

> Docker 版针对 NAS 场景做了裁剪:桌面版专属的「最小化到托盘 / 启动后最小化 /
> 关闭时最小化到托盘 / 局域网浏览 API(23786)」等功能已移除——网页版本身就是
> 通过浏览器/局域网访问的,无需再开一个 API 端口。

---

## 一、文件说明

| 文件 | 作用 |
|---|---|
| `Dockerfile` | 多阶段构建镜像(Node 18 + p7zip + 前端构建产物) |
| `docker-compose.yml` | 一键部署编排(端口、数据卷、漫画库映射) |
| `docker/entrypoint.sh` | 容器入口:首次启动自动初始化 `setting.json`,漫画库默认指向挂载目录 |
| `.dockerignore` | 构建上下文过滤 |

另外有几处针对容器化/跨平台的小改动:

- `fileLoader/archive.js` — 7z 程序按平台选择:Windows 用随附的 `7z.exe`,
  Linux 用系统 PATH 中的 `7z`(镜像内置 p7zip/7zz),rar/7z/cb7/cbr 解压照常工作;
  并修复了 7z 输出行尾解析(`\r\n` → `\r?\n`),否则 Linux 上无法解析压缩包内容;
- `index.js` — 网页模式下跳过托盘/最小化逻辑,且不再启动局域网浏览 API;
- `modules/translate.js` — 新增 AI 标题翻译(本地 Ollama / 在线 OpenAI 兼容 API)。

---

## 二、快速开始

### 方案 A(推荐,无需命令):导入现成镜像

项目根目录的 `docker-镜像/` 文件夹里已有构建好的镜像文件
(`exhentai-manga-manager-1.6.16.tar.gz`,x86_64 架构):

1. 把 `docker-镜像/exhentai-manga-manager-1.6.16.tar.gz` 上传到 NAS;
2. 飞牛OS → 容器管理 → 镜像 → 添加/导入 → 选择该文件 → 导入;
3. 镜像列表出现 `exhentai-manga-manager:1.6.16` 后点「创建容器」;
4. 端口映射 `10000:10000`(网页);
5. 存储挂载:NAS 数据文件夹 → `/data`,漫画文件夹 → `/library`;
6. 启动后浏览器访问 `http://NAS的IP:10000`。

> 全程图形界面,不需要敲任何命令。详细步骤见 `docker-镜像/飞牛NAS部署说明.txt`。
> 该镜像已通过 QEMU 虚拟机实机验证:node/sqlite3/sharp/7z 全部可用,
> 扫描(7z/zip/folder)、封面生成、web 服务、阅读器图片提取均正常。

### 方案 B:SSH + docker compose

1. 把整个项目文件夹传到 NAS,例如:
   `/vol1/1000/docker/exhentai-manga-manager`

2. 编辑 `docker-compose.yml`,把漫画库映射改成你的真实目录:

   ```yaml
   volumes:
     - ./data:/data
     - /vol3/1000/01/01-漫画:/library   # ← 改成你的漫画目录
   ```

3. SSH 登录 NAS,进入项目目录后构建并启动:

   ```bash
   cd /vol1/1000/docker/exhentai-manga-manager
   docker compose up -d --build
   ```

4. 浏览器访问 `http://NAS的IP:10000`。

> 首次构建需下载依赖(约几分钟),之后启动只需几秒。
> 更新代码后重新执行 `docker compose up -d --build` 即可,数据不会丢失。

### 方案 B:飞牛应用商店「自定义应用」

1. 先在 NAS 上构建好镜像(SSH 执行):

   ```bash
   cd /vol1/1000/docker/exhentai-manga-manager
   docker build -t exhentai-manga-manager:1.6.16 .
   ```

2. 打开飞牛 应用商店 → 自定义应用 → 添加应用:

   - **镜像**: `exhentai-manga-manager:1.6.16`
   - **端口映射**:
     - 容器端口 `10000` → 宿主端口 `10000`(网页界面)
   - **存储空间**(挂载):
     - `./data`(或 NAS 上的任意 docker 目录)→ 容器路径 `/data`
     - 你的漫画目录 → 容器路径 `/library`
   - **环境变量**:
     - `WEB_DATA_DIR=/data`
     - `LIBRARY_DIR=/library`
     - `TZ=Asia/Shanghai`(可选)

3. 保存并启动,访问 `http://NAS的IP:10000`。

---

## 三、首次使用

1. 打开 `http://NAS的IP:10000`,进入 **设置(Settings)**:
   - **漫画库(Library)**:首次启动已默认指向 `/library`;
     若你的漫画在挂载目录的子文件夹里,可在这里重新选择(网页文件夹选择器里
     能看到容器内的 `/library` 与 `/data` 等目录)。
   - 填入你的 **ExHentai 账号 Cookie**(igneous / ipb_pass_hash / ipb_member_id),
     用于获取标签、评论;如走代理可在「代理」中填写 `http://ip:port`。
2. 回到主页点击「加载漫画库」开始扫描,封面与数据库生成在 `/data` 中。
3. 阅读漫画直接点击封面进入内置阅读器;手机浏览器同样适用。

### AI 标题翻译(可选)

网页 设置 → 标题翻译,二选一:

- **本地AI(Ollama)**:在 NAS 或内网机器上部署 Ollama(如 `qwen2.5:7b`),
  填写接口地址(`http://NAS的IP:11434`)与模型名,标题翻译全程在内网完成;
- **在线AI API(OpenAI 兼容)**:填写任意 OpenAI 兼容接口
  (DeepSeek / OpenAI / Moonshot / 通义 等)、模型名与 API 密钥。

配置好后点击「测试」验证连通性,再点「翻译全部缺失标题」批量翻译。
翻译结果保存为「中文标题」,在 设置 → 高级 → 显示标题 中选择「中文标题」即可在界面上显示;
漫画详情页的编辑模式里也有单本翻译按钮。

---

## 四、配置说明

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `WEB_DATA_DIR` | `/data` | 数据目录:setting.json、database.sqlite、metadata.sqlite、封面、缓存、日志、users.json |
| `LIBRARY_DIR` | `/library` | 首次启动写入 setting.json 的漫画库路径 |
| `WEB_PORT` | `10000` | 网页服务端口 |
| `WEB_ADMIN_USER` | `admin` | 账户系统:首次启动创建的管理员用户名 |
| `WEB_ADMIN_PASSWORD` | — | 账户系统:管理员密码。**设置后账户系统启用**,未设置则保持匿名访问 |
| `TZ` | — | 时区,如 `Asia/Shanghai` |

### 账户系统(普通账户只读 / 管理员全部功能)

在 `docker-compose.yml` 的 environment 中设置 `WEB_ADMIN_USER` / `WEB_ADMIN_PASSWORD` 后,
首次启动会创建管理员账户,此后浏览器访问需要登录:

- **管理员(admin)**:全部功能(扫描建库、标签/元数据、设置、AI 等);
- **普通账户(viewer)**:只能浏览/搜索/阅读漫画库,写操作(扫描、删除、移动、批量元数据、
  修改设置等)会被服务端拒绝,设置中也不会显示敏感信息(cookie / API 密钥 / 代理)。

账户由管理员在网页 设置 → 账户 中管理:添加/删除普通账户、重置任意账户密码。
账户与密码以加盐哈希保存在 `WEB_DATA_DIR/users.json`,会话 Cookie 有效期 7 天。
登录失败连续 5 次会锁定 60 秒。旧部署不配置上述变量则行为与之前完全一致(匿名访问)。

数据卷:

- `/data` — **必须持久化**(数据库和封面都在这里,丢了要重新扫描建库);
- `/library` — 漫画库,按需映射,可只读(但「移动/删除漫画」功能需要写权限)。

---

## 五、从 Windows 桌面版迁移

桌面版数据目录位于 `%APPDATA%\exhentai-manga-manager`
(或便携版文件夹下的 `data/`)。迁移步骤:

1. 把该目录整个拷贝到 NAS,例如 `/vol1/1000/docker/exhentai-manga-manager/data`;
2. 编辑 `docker-compose.yml` 把 `./data:/data` 改为指向该目录
   (或把 `WEB_DATA_DIR` 改为对应容器内路径);
3. 修改 `data/setting.json` 中的 `"library"` 为容器内漫画库路径
   (如 `"/library"`),Windows 路径(`C:\...`)在容器里无效;
4. 启动容器后进入 设置 → 漫画库 确认路径,重新扫描一次即可。
   > 提示:启动时如检测到 Windows 路径,日志中会打印警告。

---

## 六、常见问题

**Q: 扫描后一本漫画都没有?**
漫画库路径不对。确认 `setting.json` 中 `library` 指向容器内路径(如 `/library` 或
`/library/子目录`),再到网页 设置 里重新选择后扫描。

**Q: rar / 7z 压缩包无法读取?**
镜像内置 p7zip-full(提供 `7z` 命令)。若你自行修改过镜像,需保证 PATH 中有 `7z`。

**Q: 端口被占用?**
改 `docker-compose.yml` 左侧宿主端口(如 `33787:10000`),或设置环境变量
`WEB_PORT` 并同步修改右侧容器端口。

**Q: 手机访问很慢/打不开?**
确认手机与 NAS 在同一局域网,访问的是 NAS 的 IP 而非 `127.0.0.1`;
NAS 防火墙需放行 `10000`。

**Q: 想通过外网访问?**
建议配合反代(如 fnOS 自带的 nginx / tailscale / frp)暴露 `10000`。
前端资源使用相对路径,挂在子路径下也能正常加载,但 SSE(`/api/events`)
与文件接口(`/api/file`)需保证反代正确转发 WebSocket/长连接。

**Q: 备份与升级?**
备份只需拷贝挂载的 `data` 目录。升级:拉取新代码 → `docker compose up -d --build`。
