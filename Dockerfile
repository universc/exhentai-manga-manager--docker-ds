# ============================================================
# exhentai-manga-manager 网页版 Docker 镜像(多阶段构建)
# 最终镜像只包含运行所需内容:前端 dist + 运行时 node_modules + 源码
# 构建: docker build -t exhentai-manga-manager:1.6.16 .
# 运行: docker compose up -d   (见 docker-compose.yml 与 docker/README.md)
# 注意:不使用 # syntax=docker/dockerfile:1 指令,避免镜像加速器
#       无法拉取 dockerfile 前端时导致构建失败(本文件均为标准语法)。
# ============================================================

# ---------- Stage 1: 安装运行时依赖 ----------
FROM node:18-bookworm-slim AS deps

# 国内镜像加速:npm registry + sharp 的 libvips / 预编译二进制 与 sqlite3 预编译二进制走 npmmirror
# (GitHub releases 直连在国内网络经常超时,导致 npm ci 失败;electron 二进制下载同理)
ENV npm_config_registry=https://registry.npmmirror.com \
    npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips \
    SHARP_LIBVIPS_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips \
    npm_config_sharp_binary_host=https://registry.npmmirror.com/-/binary/sharp \
    npm_config_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3 \
    ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
    ELECTRON_CUSTOM_DIR="{{ version }}"

# sqlite3 需要编译工具链,作为其预编译二进制下载失败时的兜底
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

# 只安装运行时依赖。
# 另外需要保留 electron 的 JS 包本体(web.js 里 require.resolve('electron') 依赖它),
# 但用 ELECTRON_SKIP_BINARY_DOWNLOAD 跳过其 ~100MB 二进制下载(网页版用不到桌面运行时)。
# 注意:显式安装 electron 时不能再带 --omit=dev,否则 npm 会因为它属于 devDependencies
# 而把它一并省略,导致容器内 require.resolve('electron') 失败(MODULE_NOT_FOUND)。
RUN npm ci --omit=dev \
    && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-save electron@26.2.3

# ---------- Stage 2: 构建前端 ----------
FROM node:18-bookworm-slim AS build

# 同样走 npmmirror(本阶段 npm ci 也会安装 sharp 等依赖)
ENV npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips \
    SHARP_LIBVIPS_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips \
    npm_config_sharp_binary_host=https://registry.npmmirror.com/-/binary/sharp \
    npm_config_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3

# vite 构建不需要 electron 二进制,跳过下载加速构建
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json ./
# 前端构建只需要 JS/CSS 产物,不需要 sharp/sqlite3 等原生模块的二进制,
# 用 --ignore-scripts 跳过 install 脚本,避免 GitHub 下载超时导致构建失败
RUN npm ci --ignore-scripts

# secret_key.json 被 Setting.vue 构建期引用(gh_token),必须进入构建上下文
COPY index.html vite.config.mjs secret_key.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# ---------- Stage 3: 运行镜像 ----------
FROM node:18-bookworm-slim AS runtime

# 7z:rar / 7z / cb7 / cbr 等压缩包的解压、封面生成、删页功能必需
# (Linux 下 fileLoader/archive.js 改用系统 PATH 中的 7z)
RUN apt-get update \
    && apt-get install -y --no-install-recommends p7zip-full \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# 运行时代码。
# 注意:绝对不能复制/创建 /app/data 或 /app/portable 目录,
# 否则 init_folder_setting.js 会触发"便携模式",把 WEB_DATA_DIR 数据目录覆盖掉。
COPY index.js web.js web-server.js web-electron-shim.js preload.js package.json ./
COPY modules ./modules
COPY fileLoader ./fileLoader

# 网页版环境配置:
#   WEB_DATA_DIR  数据目录(设置、数据库、封面、缓存)
#   LIBRARY_DIR   默认漫画库路径(首次启动写入 setting.json)
#   WEB_PORT      网页服务端口(web-server.js,默认 10000)
# 注:桌面版的「局域网浏览 API / 托盘 / 最小化」等功能在网页版中已移除
# (网页版本身就是通过浏览器/局域网访问的)。
ENV WEB_MODE=1 \
    WEB_DATA_DIR=/data \
    LIBRARY_DIR=/library \
    WEB_PORT=10000 \
    NODE_ENV=production

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10000

VOLUME ["/data"]

HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.WEB_PORT||23787)+'/api/info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
