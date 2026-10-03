# v1.10.3 — 本地超分模型(Real-ESRGAN / waifu2x)

## 新增:本地超分,不再依赖 API 服务

设置 → 功能 → 本地模型,可以下载并管理两个离线超分引擎:

| 模型 | 说明 |
|---|---|
| **Real-ESRGAN** | 通用/写实风格,自带多套权重(x4plus / x4plus-anime / animevideov3 系列) |
| **waifu2x** | 动漫插画专用,降噪 + 放大,速度快、占用低 |

- 下载带进度、可取消;支持删除与打开目录;
- **可用权重自动扫描**,装好后在模型下方直接选;
- 每个模型有自己的参数:**权重模型 / 放大倍数 / 降噪等级 / 分块大小 / GPU 编号 / TTA**;
- 下载可走「常用 → 代理」或自定义**镜像前缀**(国内直连 GitHub 大文件会被重置);
- **NAS / Docker 也能跑**:镜像内置 Vulkan 运行时,无 GPU 时用 lavapipe 做 CPU 软件渲染。

## 修复

- **「保存到文件夹」从来没有真正生效**:`upscaleSaveMode` 在后端从未被读取,结果永远只写到预览临时目录。
  现在支持 **同一文件夹(另存)** / **替换原文件(备份 .bak)** / **仅预览**,并在阅读器里提示完整路径;
  另存文件名形如 `10_waifu2x_2x.jpg`(原名 + 模型 + 倍数)。
  压缩包漫画内的图无法回写压缩包,统一另存到 `<数据目录>/upscaled/` 并提示。
- **阅读器图片右键的「超分图片」「提取文字」永远不显示**:两者额外依赖的 `enableImageUpscale` /
  `enableImageOcr` 开关在设置界面里并不存在(只在历史副本里),默认 false 把菜单项一直过滤掉。已移除该限制。

## 变更

- 「图片超分」移除「输出尺寸」与「超分倍数」——倍数改为每个本地模型自己的参数;
- 「使用的模型」合并成一个下拉(本地模型 / API 服务),旧配置免迁移。

## 本版本产物

| 文件 | 说明 |
|---|---|
| `exhentai-manga-manager Setup 1.10.3.exe` | Windows 安装版(NSIS) |
| `exhentai-manga-manager-1.10.3-win.zip` | Windows 绿色版 |
| `exhentai-manga-manager-1.10.3-docker-x86_64.tar.gz` | Docker 镜像包(x86_64) |

## 升级方式

```bash
# Windows:安装新版覆盖

# NAS / Docker
cd /vol1/1000/docker/exhentai-manga-manager
sudo docker compose up -d --build        # 从源码重建(推荐)
# 或
docker load -i exhentai-manga-manager-1.10.3-docker-x86_64.tar.gz && docker compose up -d
```

> NAS 上首次构建会因为安装 `mesa-vulkan-drivers`(依赖 libllvm15 等约 60MB)慢一些,后续有层缓存。

完整变更见 [CHANGELOG.md](CHANGELOG.md)。