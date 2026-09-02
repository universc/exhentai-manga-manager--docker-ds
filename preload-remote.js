// 远程 NAS 模式专用 preload:故意不暴露本地 IPC。
// 此时前端(src/web-ipc.js)检测不到 window.ipcRenderer,
// 会自动启用网页版桥(全部请求走服务器同源的 /api/* + SSE),
// 使窗口直连 NAS 上的网页版/Docker 服务,封面与阅读图片均从服务器加载。
