<template>
  <!-- H@H 归档下载:照 JHenTai 的 EHDownloadHHDialog ——
       列出 6 种分辨率(各自体积 + 花费),选一个发起打包下载 -->
  <el-dialog v-model="visible" :title="'H@H ' + $t('m.download')" width="520px" append-to-body class="hh-dialog">
    <div v-if="loading" class="hh-loading">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
    </div>
    <div v-else-if="error" class="hh-error">
      <span>{{ error }}</span>
      <el-button size="small" @click="load">{{ $t('m.reload') }}</el-button>
    </div>
    <div v-else class="hh-body">
      <div class="hh-assets" v-if="gpCount != null || creditCount != null">
        <span v-if="creditCount != null">Credits {{ creditCount }}</span>
        <span v-if="gpCount != null">GP {{ gpCount }}</span>
      </div>
      <div class="hh-grid">
        <div
          v-for="(a, i) in archives"
          :key="i"
          class="hh-item"
          :class="{ 'is-disabled': !a.resolution || busy }"
          @click="pick(a)"
        >
          <div class="hh-res">{{ a.resolutionDesc }}</div>
          <div class="hh-meta">
            <span>{{ a.size }}</span>
            <span class="hh-cost">{{ a.cost }}</span>
          </div>
        </div>
      </div>
      <div v-if="resultMsg" class="hh-result">{{ resultMsg }}</div>
      <div class="setting-hint">{{ $t('m.hhHint') }}</div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  archivePageUrl: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const visible = ref(false)
watch(() => props.modelValue, (v) => { visible.value = v; if (v) load() }, { immediate: true })
watch(visible, (v) => emit('update:modelValue', v))

const loading = ref(false)
const error = ref('')
const archives = ref([])
const gpCount = ref(null)
const creditCount = ref(null)
const busy = ref(false)
const resultMsg = ref('')

const load = async () => {
  if (!props.archivePageUrl) { error.value = t('m.hhNoArchive'); return }
  loading.value = true
  error.value = ''
  resultMsg.value = ''
  try {
    const r = await ipcRenderer.invoke('eh-hh-info', { url: props.archivePageUrl })
    if (r && r.ok) {
      archives.value = r.archives || []
      gpCount.value = r.gpCount == null ? null : r.gpCount
      creditCount.value = r.creditCount == null ? null : r.creditCount
    } else if (r && r.error === 'needLogin') {
      error.value = t('m.hhNeedLogin')
    } else {
      error.value = (r && r.error) || t('m.hhFailed')
    }
  } catch (e) {
    error.value = String((e && e.message) || e)
  } finally {
    loading.value = false
  }
}

const pick = async (a) => {
  if (!a || !a.resolution || busy.value) return
  busy.value = true
  resultMsg.value = ''
  try {
    const r = await ipcRenderer.invoke('eh-hh-download', { url: props.archivePageUrl, resolution: a.resolution })
    if (r && r.ok) {
      resultMsg.value = r.message || t('m.hhStarted')
      ElMessage.success(t('m.hhStarted'))
    } else {
      resultMsg.value = (r && (r.error || r.message)) || t('m.hhFailed')
      ElMessage.error(resultMsg.value)
    }
  } catch (e) {
    resultMsg.value = String((e && e.message) || e)
  } finally {
    busy.value = false
  }
}
</script>

<style lang="stylus">
.hh-dialog
  .hh-loading
    display: flex
    align-items: center
    justify-content: center
    height: 140px
  .hh-error
    display: flex
    flex-direction: column
    align-items: center
    gap: 10px
    padding: 20px 0
    font-size: 13px
    color: var(--el-color-danger)
  .hh-assets
    display: flex
    gap: 16px
    justify-content: flex-end
    font-size: 12px
    color: var(--el-text-color-secondary)
    margin-bottom: 8px
  .hh-grid
    display: grid
    grid-template-columns: repeat(2, 1fr)
    gap: 8px
  .hh-item
    padding: 8px 10px
    border: 1px solid var(--el-border-color)
    border-radius: 6px
    cursor: pointer
    transition: border-color .15s ease, background-color .15s ease
    &:hover
      border-color: var(--el-color-primary)
      background: var(--el-fill-color-light)
    &.is-disabled
      opacity: .5
      cursor: not-allowed
    .hh-res
      font-size: 13px
      font-weight: 600
    .hh-meta
      display: flex
      justify-content: space-between
      margin-top: 4px
      font-size: 12px
      color: var(--el-text-color-secondary)
      .hh-cost
        color: var(--el-color-warning)
  .hh-result
    margin-top: 10px
    font-size: 12px
    color: var(--el-color-success)
</style>
