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

</div>

## Docker / NAS 部署

本项目支持以网页服务方式运行(无需桌面环境),可直接部署到飞牛 NAS 等 Docker 设备上,
电脑与手机通过浏览器访问全部功能。详见 [docker/README.md](docker/README.md)。

镜像已发布到 Docker Hub,直接拉取即可:`docker pull universc/exhentai-manga-manager--docker-ds:1.10.6`
(国内直连会超时,挂加速源;也可以 `docker load -i` 导入 Release 里的镜像包)。

![cover.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/cover.jpg)
![detail.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/detail.jpg)
![edit_tag.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/edit_tag.jpg)
![viewer.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer.jpg)
![viewer2.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer2.jpg)
![thumbnails.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/thumbnails.jpg)


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

- **单张图片也进回收站(v1.10.6)**:阅读器图片右键「删除图片」不再直接抹盘 —— 文件夹漫画**单张图**进 `<数据目录>/.trash/` 可单独恢复;
  压缩包漫画会先备好**整包原样备份**(同一本只留最早一份)再从包里删除,还原即整体回滚;回收站区块移到 设置 → 常用 **最下方**
- **回收站与删除记录(v1.10.6)**:删除漫画**先移入** `<数据目录>/.trash/`(不再直接抹盘),可在 **设置 → 常用 → 回收站** 里恢复或彻底删除;
  删除 / 恢复 / 彻底删除全部写入 `<数据目录>/delete-log.jsonl`,设置页点「**删除记录**」即可查看;桌面版与网页版同一套逻辑
- **阅读器渲染矩阵重做(v1.10.5)**:卷轴开关 × 单页/双页 × 上下/左右/右左 共 **12 种组合**;缩放与适应方式(窗口/宽度/高度)对**所有模式**生效;
  横向整排支持右左反向与自动贴右;键盘/滚轮按阅读方向处理;设置栏按钮可勾选显隐 + 拖动排序
- **阅读器性能重构(v1.10.5)**:缩略图按需生成 + 持久缓存 + 后台限流;切书/关闭立即取消旧任务(实测加载快约 12 倍)
- **自动超分修复(v1.10.5)**:按「图片超分 → 保存位置」执行(替换原文件会生成 `.bak`)、分页模式也能触发、超分完成立即显示、全程不弹提示
- **`.bak` 一键回滚(v1.10.5)**:阅读器图片右键「**恢复 .bak 文件**」、封面右键「**恢复全部 .bak 文件**」,
  只处理确实存在 `.bak` 的文件、不会误伤其它图片 —— 超分 / 上色 / 翻译替换原图后都能回滚
- **阅读器设置增强(v1.10.5)**:图片间距 / 缩略图间距(默认 0)、按钮操作提示开关、阅读完成后「打开下一本(随机)」、
  工具栏全屏按钮、底部翻书按钮默认隐藏(鼠标移到底部才出现)、点击弹出设置栏区域改为中央 1/5
- **本地超分模型(v1.10.3)**:Real-ESRGAN / waifu2x **离线运行**(与 ComicRead 阅读器的「无损放大」同源),
  支持下载/删除/权重选择;NAS 上以 Vulkan + mesa 软渲染运行(无独显也能用 CPU 跑)
- **超分结果落盘(v1.10.3)**:同一文件夹(另存 `原名_模型_倍数`)/ 替换原文件(旧文件备份 `.bak`)/ 仅预览;
  超分过滤设置(宽高都 ≥ 阈值则跳过)
- **右键菜单修复(v1.10.2)**:菜单项勾选不再每次打开软件都变回默认全选
