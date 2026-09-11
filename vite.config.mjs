import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
// 注:曾用 manualChunks 分包(主包 2MB→744KB),但桌面 file:// 下多 chunk 曾导致整页白屏,
// 已回退为单一构建(与历史稳定版一致);如需分包需先在网页模式充分验证。
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5374
  }
})
