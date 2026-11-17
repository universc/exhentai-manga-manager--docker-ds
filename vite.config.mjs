import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
// 注:曾用 manualChunks 分包(主包 2MB→744KB),但桌面 file:// 下多 chunk 曾导致整页白屏,
// 已回退为单一构建(与历史稳定版一致);如需分包需先在网页模式充分验证。
export default defineConfig({
  plugins: [vue()],
  base: './',
  // 依赖预构建缓存固定放到项目内(cacheDir):Windows 上 node_modules/.vite 常被占用/清理失败
  cacheDir: '.vite-cache',
  server: {
    port: 5374,
    // npm run dev(Vite 热更新)时:接口与图片由 `node web.js` 提供(端口见 web-server.js:
    // process.env.WEB_PORT || 10000),前端走 Vite 的 HMR —— 改代码即时生效,不用重新 build。
    proxy: {
      '/api': { target: 'http://127.0.0.1:10000', changeOrigin: true },
      // 绅士漫画登录页反向代理(网页版登录弹窗里的 iframe)。
      // 少这条:iframe 请求会落到 Vite 的 SPA 兜底上,拿到的是 index.html —— 登录页永远出不来。
      '/wnacg-proxy': { target: 'http://127.0.0.1:10000', changeOrigin: true }
    }
  }
})
