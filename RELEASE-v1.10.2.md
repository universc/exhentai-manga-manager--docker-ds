# v1.10.2 — 修复「右键菜单勾选每次打开都变回默认」

## 现象

在 设置 → 高级 → 右键菜单 里取消勾选某些菜单项,保存后只要**重新打开软件/刷新页面**,
所有菜单项又全部被勾上(恢复默认全选)。

## 根因

加载设置时有一段「自动并入新菜单项」的代码,写法是:

```js
for (const [menu, items] of Object.entries(contextMenuDefinitions)) {
  const saved = setting.contextMenuOptions[menu] || []
  setting.contextMenuOptions[menu] = [...new Set([...saved, ...items])]  // items = 定义里的全部项
}
```

`items` 是**当前版本的全部菜单项**,它被无条件并回已保存值 —— 于是用户主动取消的勾选每次加载都被重新勾上。
更糟的是 `App.vue` 在启动时执行同一段逻辑,并因为「值变了」而把这份全选结果 `save-setting` 写回服务器,
所以取消掉的勾选会被**持久化覆盖**,不只是界面显示问题。

## 修复

新增 `mergeContextMenuOptions()`(`src/utils.js`),改为只并入**真正新增**的项:

| 情况 | 行为 |
|---|---|
| localStorage 无记录(首次运行 / 清了浏览器数据) | **完全信任已保存值**,不做任何并入 |
| 有记录 | 只并入 `当前定义 − 上次定义` 的差集(即版本升级带来的新菜单项) |
| 某个菜单分组从未保存过(`undefined`) | 用默认全量(兼容旧配置) |

localStorage 里记录的「上次定义过的项 id」跟随界面版本,因此桌面客户端与网页版各自独立、互不干扰。
`App.vue`(启动时)与设置面板(打开时)统一调用该函数。

> ⚠️ **受影响用户需要重新设置一次右键菜单** —— 之前被覆盖掉的勾选没有历史记录,无法自动还原。
> 之后就不会再被改回去了。

## 本版本产物

| 文件 | 说明 |
|---|---|
| `exhentai-manga-manager Setup 1.10.2.exe` | Windows 安装版(NSIS,可自选目录,`/S /D=路径` 静默安装) |
| `exhentai-manga-manager-1.10.2-win.zip` | Windows 绿色版 |
| `exhentai-manga-manager-1.10.2-docker-x86_64.tar.gz` | Docker 镜像包(x86_64) |

## 升级方式

```bash
# Windows:直接安装/解压覆盖新版

# NAS / Docker
cd /vol1/1000/docker/exhentai-manga-manager
sudo docker compose up -d --build      # 从源码重建(推荐)
# 或
docker load -i exhentai-manga-manager-1.10.2-docker-x86_64.tar.gz
```

## 其他

- 版本号 1.10.1 → 1.10.2,Docker 镜像 tag 同步为 `exhentai-manga-manager:1.10.2`;
- 本次只改前端(`src/utils.js` / `src/App.vue` / `src/components/Setting.vue`),后端无改动。

完整变更见 [CHANGELOG.md](CHANGELOG.md)。