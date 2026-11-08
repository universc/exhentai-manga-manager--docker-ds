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
import { attachGlobalInertia } from './inertia-scroll.js'
import { useAppStore } from './pinia.js'

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

// 惯性滚动全局兜底:文档级一个滚轮监听,鼠标落在哪个可滚动容器上就滚哪个。
// 这样侧边详情栏 / 下载记录栏 / 文件夹树 / 各种弹窗 / 下拉 / 嵌套列表都自动有惯性,
// 不用每加一个滚动区就回各个组件里挂一次(以前只挂了主界面、管理面板、设置页、阅读器四处)。
// 单独挂过 attachInertiaScroll 的容器优先,全局层看到事件标记会跳过,不会滚两次。
// 参数统一取自 pinia 里的 setting,开关与三个滑块改完立刻生效(不用重启)。
attachGlobalInertia({
  getParams: () => {
    const s = useAppStore(pinia).setting || {}
    return {
      enabled: s.inertiaEnabled !== false,
      friction: s.inertiaFriction,
      maxVelocity: s.inertiaMaxVelocity,
      follow: s.inertiaFollow,
    }
  }
})

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
    // ★ 2026-11 修:IntersectionObserver 只在「相交状态**变化**」时回调。
    //   元素刚挂载的那一帧,祖先容器(管理界面的 .book-manage-view 是 v-if 新建的)
    //   还没完成布局,IO 首帧会算成「未相交」= false;之后只要用户不滚动,
    //   状态一直不变,enter 就永远不触发 —— 卡片整片空白(二次进入管理界面必现)。
    //   实测:手动改一下 scrollTop 卡片立刻出现 20 张,证实就是这个原因。
    //   处理:等两帧布局稳定后 unobserve+observe 强制重算一次,
    //   让 IO 用正确的几何重新送一遍「初始相交状态」。
    el._lazyReobserve = () => {
      observer.unobserve(el)
      observer.observe(el)
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof el._lazyReobserve === 'function') el._lazyReobserve()
      })
    })
  },
  unmounted(el) {
    observer.unobserve(el)
    delete el._lazyEnterCallback
    delete el._lazyLeaveCallback
    delete el._lazyArg
    delete el._lazyReobserve
  }
})


app.mount('#app')