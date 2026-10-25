# v1.16.2 — 种子磁力修复 · 自动生成合集

> 两个新功能的收尾版本:种子列表的磁力/直链修复,以及按名字与文件夹结构自动生成合集。

## 种子:磁力链接与直链修复

- **「打开种子」下载到的是坏链接**:解析用的正则少写了一个字母(`/\.torrent/` 实际是 `/.torrent/` 的笔误),
  把 `....torrent` 截成了 `.torren`。已修正为完整匹配 —— 直链现在以 `.torrent` 结尾,可以正常下载/交给下载器。
- **种子名里的 HTML 实体没解码**:界面显示成 `[FOE &amp; JINGG]`,现在是 `[FOE & JINGG]`。
- **磁力链接口径确认**:从 40 位 info-hash 生成 `magnet:?xt=urn:btih:<hash>`,
  与 `ehtracker.org/get/<gid>/<token>/<hash>.torrent` 一一对应。

## 新功能:自动生成合集

合集编辑视图的工具栏新增「魔杖」按钮,按**名字与文件夹结构**自动建议合集:

- **识别信号(按强度加权)**:同一容器目录 0.40 / 标题主干全等 0.35 / 卷号连续 0.15 /
  parody 与 artist 各 0.10 / 括号内命中标签 0.10 / character 0.05。
- **既能认「系列一个文件夹」,也能认「一卷一个文件夹」**:容器取父目录,所以
  `SomeSeries/1`、`SomeSeries/2` 能被正确归到同一系列(这一点之前会漏)。
- **作者专辑单独成组**:同一作者 ≥3 本会生成 `kind=artist` 的建议,置信度保守(默认不勾选),
  不与系列合集抢成员。
- **防误并**:跨库绝不合并;卷号全部相同判为「重复书」而非合集;
  「Download / 下载 / 漫画」这类通用目录名不会被当成合集名;泛名(無題/杂图/合集)降权。
- **不一把梭**:先弹窗预览,可改标题、按置信度滑块过滤、逐组勾选;
  点「应用」才写盘,同名合集会追加而不是重复建。

实测(纯函数单测 + 界面端到端):

| 输入 | 结果 |
|---|---|
| `Vol.1~4` 同目录 | `SomeSeries` 90% |
| 同 parody 标签 3 本 | `Touhou Project` 60% |
| 同 artist 3 本 | `ArtistY` 44%(作者专辑) |
| 无关书 | 未误并 |

算法本体在 `modules/collectionAuto.js`(纯函数、零磁盘 IO、可单测),
界面在 `src/components/AutoCollectionDialog.vue`。

## 同时包含 v1.16.1 的修复

- **H@H 按钮点了没有界面**:五条 H@H 文案里带字面量 `@`(`H@H 页面下载`),
  vue-i18n 的 linked-message 语法把 `@` 当链接起点,渲染期抛 `Invalid linked format`,
  整个弹窗 vnode 渲染中断。已改为 vue-i18n 规定的字面量转义 `H{'@'}H`。

## 升级说明

- **Windows**:直接覆盖安装,用户数据(设置/数据库/封面)保留。
- **Docker / NAS**:
  ```bash
  docker pull universc/exhentai-manga-manager--docker-ds:1.16.2
  ```
  或本地构建:`docker build -t exhentai-manga-manager:1.16.2 .`
- 无破坏性配置变更。
