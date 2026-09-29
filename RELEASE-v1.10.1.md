# v1.10.1 — 修复「设置反复丢失」+ 接口鉴权加固

## ⚠️ 强烈建议升级：v1.9.8 ~ v1.10.0 会清空你的设置

这两个版本存在一个严重缺陷：**每次打开网页(或启动客户端)都会把 `setting.json` 覆盖成一份残缺文件**，
漫画库路径、ExHentai Cookie、主题、工具栏、每页数量、AI 配置等会全部丢失。

根因是两处叠加：

1. **前端抢跑** —— `src/App.vue` 的 `mounted()` 在 `load-setting` 之前就用还是空的 Pinia `setting`
   调用了 `save-setting`，载荷只有 `contextMenuOptions`；
2. **后端整份替换** —— `index.js` 的 `applySetting()` 用 `setting = receiveSetting` 把这份局部对象
   当成完整配置整份写盘，这次请求里没带的键全部丢弃。

叠加结果就是每次打开页面后 `setting.json` 变成 `{"contextMenuOptions": …, "library": "/library"}`。

**修复方式**：后端先 `{ ...setting, ...receiveSetting }` 合并(前端没传的键一律保留)，内存与落盘都用合并结果；
前端把右键菜单的合并保存移到 `load-setting` 拿到完整设置之后。

> 已经丢过设置？到数据目录找 `_recover_backup_*/BASE_setting.json` 之类的备份覆盖回 `setting.json`，
> 再升级到本版本，否则下次打开页面还会被清空。

## 🔒 安全：三个接口补上登录鉴权

启用账户系统(`WEB_ADMIN_USER`)后，以下接口未登录一律 401：

| 接口 | 用途 |
|---|---|
| `/api/file` | 封面与阅读图片 |
| `/api/list-dir` | 网页版文件夹/文件选择器 |
| `/browse` | 「打开所在目录」目录浏览页 |

此前这三个接口**可以匿名访问** —— 局域网内任何人都能直接拉取封面、整库图片和目录列表。

- 白名单 IP 免登录(视为管理员)不受影响；
- 未配置 `WEB_ADMIN_USER` 时账户系统未启用，行为与旧版一致；
- `/api/events`、`/api/ipc/*` 原本已有鉴权，本次一并审计确认；
- 公开接口只剩 `/api/info`、`/api/auth/*` 与登录页面本身。

## 📦 本版本产物

| 文件 | 说明 |
|---|---|
| `exhentai-manga-manager Setup 1.10.1.exe` | Windows 安装版(NSIS，可自选目录，支持 `/S /D=路径` 静默安装) |
| `exhentai-manga-manager-1.10.1-win.zip` | Windows 绿色版(解压即用) |
| `exhentai-manga-manager-1.10.1-docker-x86_64.tar.gz` | Docker 镜像包(x86_64)，`docker load -i` 后即可用 |

## 🐳 NAS / Docker 升级方法

```bash
cd /vol1/1000/docker/exhentai-manga-manager
sudo docker compose up -d --build      # 从源码重建(推荐)
```

或使用镜像包：

```bash
docker load -i exhentai-manga-manager-1.10.1-docker-x86_64.tar.gz
# 然后 docker compose up -d(compose 中 image 已指向 1.10.1)
```

## 📝 其他

- 版本号 1.10.0 → 1.10.1，Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.1`；
- 修复容器模式下「漫画库/元数据目录被重置」：Linux 路径分支下先前的合并会被丢弃，已一并修正；
- 维护文档(`项目说明-AI维护指南.md`)补充该高频坑与接口鉴权约束，避免回归。

完整变更见 [CHANGELOG.md](CHANGELOG.md)。