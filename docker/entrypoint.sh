#!/bin/sh
# ============================================================
# exhentai-manga-manager 网页版容器入口
# 职责:
#   1. 确保数据目录存在
#   2. 首次启动时初始化 setting.json(漫画库默认指向 LIBRARY_DIR)
#   3. 启动 node web.js
# ============================================================
set -e

DATA_DIR="${WEB_DATA_DIR:-/data}"
LIBRARY_DIR="${LIBRARY_DIR:-/library}"

mkdir -p "$DATA_DIR"

# ---------- 首次启动:初始化 setting.json ----------
# 与 modules/init_folder_setting.js 中 prepareSetting() 的默认值保持一致,
# 仅把漫画库默认路径改为挂载的 LIBRARY_DIR。
if [ ! -f "$DATA_DIR/setting.json" ]; then
  cat > "$DATA_DIR/setting.json" <<EOF
{
  "proxy": null,
  "library": "$LIBRARY_DIR",
  "metadataPath": null,
  "imageExplorer": "",
  "pageSize": 42,
  "loadOnStart": false,
  "igneous": "",
  "ipb_pass_hash": "",
  "ipb_member_id": "",
  "star": "",
  "showComment": true,
  "requireGap": 3000,
  "thumbnailColumn": 10,
  "showTranslation": false,
  "theme": "light e-hentai",
  "widthLimit": null,
  "directEnter": "detail",
  "language": "default",
  "folderTreeWidth": "",
  "advancedSearch": true,
  "autoCheckUpdates": false,
  "customOptions": "",
  "defaultExpandTree": true,
  "hidePageNumber": false,
  "skipDeleteConfirm": false,
  "displayTitle": "japaneseTitle",
  "keepReadingProgress": true,
  "titleTranslationMode": "off",
  "titleTranslationBaseUrl": "",
  "titleTranslationModel": "",
  "titleTranslationApiKey": "",
  "ollamaBaseUrl": "http://127.0.0.1:11434",
  "ollamaModel": "qwen2.5:7b",
  "openaiBaseUrl": "https://api.deepseek.com/v1",
  "openaiModel": "deepseek-chat",
  "openaiApiKey": "",
  "appName": "EX漫画管理器(exhentai-manga-manager)",
  "contextMenuOptions": {
    "title": ["copyTitle", "copyLink", "copyTitleAndLink"],
    "cover": ["getMetadata", "resetMetadata", "openFileLocation", "moveFile", "deleteFile", "toggleHidden", "copyTag", "pasteTag", "getMetadataFromLink"],
    "image": ["copyImage", "setCover", "deleteImage"],
    "comment": ["openLink"]
  },
  "hideBookmarkButton": false,
  "hidePageCount": false,
  "hideReadCount": false,
  "hideReadButton": false,
  "hideNonTag": false,
  "hideTitle": false,
  "hideRating": false,
  "coverOnly": false,
  "coverWidth": 220,
  "cardGap": 6,
  "themeCustomBg": "",
  "themeCustomBgImage": "",
  "themeCustomPrimary": "#409EFF",
  "themeCustomFontSize": 14,
  "themeCustomFontColor": "",
  "themeCustomFontStyle": "",
  "customIconPath": "",
  "toolbarButtons": ["folderTree", "search", "shuffle", "manualScan", "incrementalScan", "batchMetadata", "tagAnalysis", "manageCollection", "manageTag", "viewerSwitch", "themeSwitch"],
  "customPageSizes": "12,24,42,72,500,5000,1000000",
  "scrollInertiaLevel": "medium",
  "localUpscaleEngine": "",
  "localUpscaleOptions": {
    "realesrgan": { "model": "realesrgan-x4plus", "scale": 4, "tileSize": 0, "gpuId": 0, "tta": false },
    "waifu2x": { "model": "models-cunet", "scale": 2, "noiseLevel": 0, "tileSize": 0, "gpuId": 0, "tta": false }
  },
  "localModelMirror": "",
  "upscaleSkipHighRes": true,
  "upscaleSkipWidth": 1200,
  "upscaleSkipHeight": 2000,
  "viewerToolbarHover": true,
  "viewerToolbarClick": true,
  "viewerEndAction": "none",
  "viewerEndTip": true,
  "autoUpscale": false,
  "autoUpscaleRatio": 1.05,
  "showFullscreenButton": true,
  "enableImageUpscale": false,
  "enableImageOcr": false
}
EOF
  echo "[entrypoint] 已初始化 $DATA_DIR/setting.json (library=$LIBRARY_DIR)"
fi

# ---------- 兼容旧版桌面数据:提示修正 Windows 路径 ----------
if grep -q '"library"[[:space:]]*:[[:space:]]*"[A-Za-z]:' "$DATA_DIR/setting.json" 2>/dev/null; then
  echo "[entrypoint] 警告: setting.json 中的漫画库路径仍是 Windows 路径,"
  echo "[entrypoint]         请在网页 设置 → 漫画库 中重新选择挂载目录(如 /library/...)"
fi

echo "[entrypoint] 数据目录: $DATA_DIR"
echo "[entrypoint] 漫画库目录: $LIBRARY_DIR"
echo "[entrypoint] 网页端口: ${WEB_PORT:-10000}"

exec node /app/web.js
