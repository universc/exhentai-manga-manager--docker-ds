> ## ⚠️ 本仓库为修改版(Fork)
>
> 本项目基于 [SchneeHertz/exhentai-manga-manager](https://github.com/SchneeHertz/exhentai-manga-manager)
> (MIT License, Copyright (c) 2022 SchneeHertz) 修改而来,原许可证文本见 [LICENSE](LICENSE),未做删改。
> 本修改版不是原项目的官方版本,与原版功能存在差异(见文末「本修改版新增功能」),
> 使用与支持请以本仓库为准。

<div align="center">

<img src="https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/public/icon.png" alt="icon.png" width="128"/>

# exhentai-manga-manager

**标签化管理, 阅读从ExHentai下载的短篇漫画**

<p>
  <a href="https://discord.gg/pS9jR8C8f6">
    <img src="https://img.shields.io/badge/Discord-purple?style=flat-square" alt="Discord" />
  </a>
</p>

<p>
  <a href="#">
    <img src="https://img.shields.io/badge/require-Windows_10-blue?style=flat-square" alt="Windows_10" />
  </a>
  <a href="https://github.com/SchneeHertz/exhentai-manga-manager/stargazers">
    <img src="https://img.shields.io/github/stars/SchneeHertz/exhentai-manga-manager?style=flat-square&color=cornflowerblue" alt="Github Stars" />
  </a>
  <a href="https://github.com/SchneeHertz/exhentai-manga-manager/releases/latest">
    <img src="https://img.shields.io/github/v/release/SchneeHertz/exhentai-manga-manager?label=latest&style=flat-square&color=cornflowerblue" alt="Github Stable Release" />
  </a>
</p>

中文介绍 | [English Readme](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/README_EN.md) | [日本語の説明](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/README_JA.md)


**[使用说明](https://github.com/SchneeHertz/exhentai-manga-manager/wiki/中文说明)** | **[FAQ](https://github.com/SchneeHertz/exhentai-manga-manager/wiki/FAQ)**

</div>

## Docker / NAS 部署

本项目支持以网页服务方式运行(无需桌面环境),可直接部署到飞牛 NAS 等 Docker 设备上,
电脑与手机通过浏览器访问全部功能。详见 [docker/README.md](docker/README.md)。

![cover.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/cover.jpg)
![detail.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/detail.jpg)
![edit_tag.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/edit_tag.jpg)
![viewer.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer.jpg)
![viewer2.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer2.jpg)
![thumbnails.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/thumbnails.jpg)


**欢迎加入[Discord讨论组](https://discord.gg/pS9jR8C8f6)**

## 功能
- 从一个文件夹建立漫画库
- 从漫画文件中提取封面，然后批量从ExHentai获取漫画的标签
- 编辑标签
- 基于标签，漫画名，文件路径，时间的搜索
- 关联外部图片浏览器
- 内置图片浏览器

## 更多功能
- 库元数据的导出和导入
- 可选免安装版
- 收藏漫画
- 按上传时间，添加时间，评分排序
- 显示ExHentai上的评论
- 漫画内容缩略图，进度定位与选择
- 支持已解压漫画文件夹，zip，rar，7z压缩包
- 多章节漫画的合集管理
- 隐藏指定漫画
- 标签翻译为中文
- AI 标题翻译为中文(本地 Ollama 或在线 OpenAI 兼容 API,Docker 网页版可用)
- 可选的多个配色主题
- 标签分析
- 支持自定义封面
- 展示库文件夹结构，按文件夹查看漫画
- 支持导入exhentai整体元数据数据库备份
- 内置图片浏览器支持单页，双页，卷轴式浏览
- 标签频率分析
- 局域网浏览(仅桌面版;Docker 网页版本身就是通过浏览器/局域网访问,已移除该功能)
- Windows 桌面客户端增强(设置 → 常用 → 运行模式):
  - 本地模式:可设置数据文件位置(数据库/封面/设置)与漫画库位置
  - 网页模式:填写 NAS 上网页版/Docker 服务的 IP+端口(如 `192.168.1.10:10000`)
    与账户,点「重启并连接」后客户端窗口直连服务器获取漫画,支持测试连接、自动登录;
    托盘菜单可退出远程模式
  - 开机自启动(启动后自动最小化/驻留托盘,不打扰)
  - 窗口置顶(设置、托盘菜单、一键按钮均可切换)
  - 全局快捷键显示/隐藏窗口(默认 Control+Alt+X,可自定义或留空禁用)
  - 托盘菜单:显示/隐藏窗口、窗口置顶、开机启动、退出
  - 单实例运行(重复启动时聚焦已有窗口)
  - 记住窗口大小/位置/最大化状态
  - 最小化到托盘、关闭时最小化到托盘
- 网页版(Docker)账户系统:环境变量 `WEB_ADMIN_USER` / `WEB_ADMIN_PASSWORD` 启用,
  管理员在 设置 → 账户 中管理账户;普通账户只能浏览(写操作服务端拒绝),管理员全部功能
- 配套脚本
  - [从ExHentai画廊页面复制元数据](https://sleazyfork.org/zh-CN/scripts/472321)
  - [EH高亮本地本子](https://greasyfork.org/zh-CN/scripts/510077)

## 贡献
- 请参考[贡献指南](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/CONTRIBUTING.md)

## 本修改版新增功能
- **封面懒加载**(设置 → 常用 → 封面懒加载,默认开启):
  - 扫描建库时不再批量生成封面,浏览到哪本书封面才按需生成,建库/重扫速度大幅提升
  - 生成的封面以**漫画名命名**存入封面目录(如 `[作者] 标题.webp`),同名漫画自动加序号,非法字符自动清洗
  - 封面缺失/图片加载失败时自动按需生成并修正数据库路径,旧数据无需重新扫描
- **跨平台共享数据库**:Windows 桌面版与 Docker 网页版可同时读写同一份 `database.sqlite`
  (漫画库、数据目录通过 SMB/NAS 共享),封面路径自动互译(Windows 盘符/UNC ↔ 容器内路径),
  封面清理按文件名统一对比,不再误删另一端引用的封面
- **Docker/NAS 部署增强**:账户系统、封面懒加载在网页版同样生效(详见 [docker/README.md](docker/README.md))
- **接口鉴权加固(v1.10.1)**:`/api/file`、`/api/list-dir`、`/browse` 在启用账户系统后必须登录才能访问
- **修复「设置反复丢失」(v1.10.1)**:早期版本每次打开页面会把 `setting.json` 覆盖成残缺文件,现已修复(详见 [CHANGELOG.md](CHANGELOG.md))

## Thanks
本项目受到了诸多开源项目的帮助

- [EhTagTranslation/Database](https://github.com/EhTagTranslation/Database)


## 赞助
[!["爱发电"](https://static.afdiancdn.com/static/img/logo/logo.png)](https://afdian.com/a/SeldonHorizon)
[如果这个软件帮到了你，可以请我喝杯奶茶](https://afdian.com/a/SeldonHorizon)