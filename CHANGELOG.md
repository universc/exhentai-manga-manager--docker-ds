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
