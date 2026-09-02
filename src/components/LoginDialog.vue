<template>
  <!-- 网页版(Docker)账户登录:启用账户系统且未登录/会话失效时显示 -->
  <div class="login-mask" v-if="visible">
    <div class="login-box">
      <div class="login-title">{{ $t('m.loginTitle') }}</div>
      <div class="login-sub">{{ $t('m.loginSub') }}</div>
      <el-form @submit.prevent="doLogin" label-position="top">
        <el-form-item :label="$t('m.loginUsername')">
          <el-input v-model="username" :placeholder="$t('m.loginUsername')" autofocus @keyup.enter="doLogin" />
        </el-form-item>
        <el-form-item :label="$t('m.loginPassword')">
          <el-input v-model="password" type="password" show-password :placeholder="$t('m.loginPassword')" @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="primary" class="login-btn" :loading="loading" @click="doLogin">{{ $t('m.loginButton') }}</el-button>
        <!-- Windows 客户端远程桌面模式:登录失败时可切回本地模式 -->
        <el-button v-if="isRemoteDesktop" text class="local-mode-btn" @click="switchToLocalMode">{{ $t('m.useLocalMode') }}</el-button>
      </el-form>
      <div v-if="error" class="login-error">{{ error }}</div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
  name: 'LoginDialog',
  setup () {
    const visible = ref(false)
    const username = ref('')
    const password = ref('')
    const loading = ref(false)
    const error = ref('')

    const refresh = () => {
      const auth = window.__AUTH__ || {}
      visible.value = !!auth.enabled && !auth.role
    }

    // Windows 客户端远程桌面模式标志(登录框显示「使用本地模式」按钮)
    const isRemoteDesktop = !!window.__REMOTE_DESKTOP__

    // 切回本地模式:清空服务器地址并重启(由客户端主进程处理)
    const switchToLocalMode = async () => {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke('switch-to-local-mode')
      }
    }

    const doLogin = async () => {
      if (loading.value) return
      loading.value = true
      error.value = ''
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.value.trim(), password: password.value })
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.ok) {
          // 登录成功:刷新页面,让 /api/info 重新带出角色
          window.location.reload()
          return
        }
        error.value = data?.error || '登录失败'
      } catch (e) {
        error.value = String(e.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      refresh()
      window.addEventListener('emm-auth-required', refresh)
    })

    return { visible, username, password, loading, error, isRemoteDesktop, doLogin, refresh, switchToLocalMode }
  }
}
</script>

<style scoped lang="stylus">
.login-mask
  position: fixed
  inset: 0
  z-index: 3000
  display: flex
  align-items: center
  justify-content: center
  background: rgba(0, 0, 0, 0.45)
  backdrop-filter: blur(2px)
  .login-box
    width: 340px
    padding: 28px 30px 24px
    border-radius: 12px
    background: var(--el-bg-color, #fff)
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35)
    .login-title
      font-size: 19px
      font-weight: 600
      text-align: center
    .login-sub
      margin: 6px 0 18px
      font-size: 12px
      text-align: center
      color: var(--el-text-color-secondary, #888)
    .login-btn
      width: 100%
      margin-top: 4px
    .local-mode-btn
      width: 100%
      margin-top: 8px
      color: var(--el-text-color-secondary, #888)
    .login-error
      margin-top: 12px
      font-size: 13px
      color: var(--el-color-danger, #f56c6c)
      text-align: center
</style>
