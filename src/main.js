import { createApp } from 'vue'
import './web-ipc.js' // 网页版桥:在浏览器中模拟 window.ipcRenderer(Electron 下自动跳过)
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
// 废弃主题1（皮肤级主题）：必须排在 Element Plus 样式之后，
// 因为它要重映射 EP 的 --el-* 变量；用 html.deprecated1 提权，不依赖顺序也能生效，
// 但放在后面可以覆盖 App.vue 自带的浅色规则。
import './styles/deprecated1.css'
// 侧边详情 / 下载记录栏的皮肤（移植自 redesign/v1，只含这两块的面板样式）
import './styles/panels.css'
import App from './App.vue'
import _ from 'lodash'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import ContextMenu from '@imengyu/vue3-context-menu'

import { createI18n } from 'vue-i18n'
import zhCn from './locales/zh-CN.json'
import zhTw from './locales/zh-TW.json'
import enUs from './locales/en-US.json'
const messages = {
  'zh-CN': zhCn,
  'zh-TW': zhTw,
  'en-US': enUs
}

const app = createApp(App)

window._ = _

const pinia = createPinia()
app.use(pinia)

app.use(ElementPlus)
app.use(ContextMenu)
app.use(createI18n({
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  globalInjection: true,
  legacy: false,
  messages
}))

// 创建一个共享的 IntersectionObserver 实例
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const el = entry.target
    const enterCallback = el._lazyEnterCallback
    const leaveCallback = el._lazyLeaveCallback
    const arg = el._lazyArg

    if (entry.isIntersecting) {
      if (enterCallback && typeof enterCallback === 'function') {
        enterCallback(arg)
      }
    } else {
      if (leaveCallback && typeof leaveCallback === 'function') {
        leaveCallback(arg)
      }
    }
  })
}, {
  // 预加载范围:太大时滚动会频繁挂载/卸载卡片导致卡顿,1600px 平衡流畅度与滚动速度
  rootMargin: '1600px'
})

app.directive('lazy', {
  mounted(el, binding) {
    el._lazyEnterCallback = binding.value.enter
    el._lazyLeaveCallback = binding.value.leave
    el._lazyArg = binding.arg

    observer.observe(el)
  },
  unmounted(el) {
    observer.unobserve(el)
    delete el._lazyEnterCallback
    delete el._lazyLeaveCallback
    delete el._lazyArg
  }
})


app.mount('#app')