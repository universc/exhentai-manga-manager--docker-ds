<template>
  <!-- 下载弹窗:位置 / 名称 / 原图
       - 位置:默认(设置里的下载目录)、每个库各一项、自定义文件夹
       - 名称:默认按「设置里的界面语言」挑标题(中文→中文名,日文→日文名,其它→原名),没有就中→日→英依次退;
               默认名是灰的,改过变黑,清空后自动填回默认名
       - 原图:勾上就是原图 -->
  <el-dialog
    v-model="visible"
    :show-close="true"
    width="380px"
    align-center
    append-to-body
    class="download-dialog"
  >
    <template #header>
      <div class="dl-title">{{ $t('m.downloadDialogTitle') }}</div>
      <div class="dl-subtitle" :title="displayTitle" v-if="displayTitle">{{ displayTitle }}</div>
    </template>

    <div class="dl-form">
      <div class="dl-row">
        <span class="dl-label">{{ $t('m.downloadLocation') }}</span>
        <div class="dl-value">
          <el-select v-model="location" size="small" class="dl-select" :teleported="true">
            <el-option :label="$t('m.downloadLocationDefault')" value="__default__" />
            <el-option v-for="lib in libraries" :key="'lib-' + lib.path" :label="lib.name" :value="lib.path" />
            <el-option :label="$t('m.downloadLocationCustom')" value="__custom__" />
          </el-select>
        </div>
      </div>
      <!-- 自定义位置:选了才出现这一行,不占地方 -->
      <div class="dl-row" v-if="location === '__custom__'">
        <span class="dl-label"></span>
        <div class="dl-value">
          <el-button size="small" class="dl-pick" @click="pickFolder">
            {{ customDir || $t('m.downloadLocationCustom') }}
          </el-button>
        </div>
      </div>
      <div class="dl-row">
        <span class="dl-label">{{ $t('m.downloadName') }}</span>
        <div class="dl-value">
          <el-input
            v-model="nameValue"
            size="small"
            :class="['dl-name', { 'is-default-name': !nameTouched }]"
            :placeholder="defaultName"
            @input="onNameInput"
            @blur="onNameBlur"
          />
        </div>
      </div>
      <div class="dl-row">
        <span class="dl-label">{{ $t('m.downloadOriginalOption') }}</span>
        <div class="dl-value">
          <el-checkbox v-model="original" />
        </div>
      </div>
      <div class="dl-hint" v-if="location === '__default__' && !defaultDownloadPath">
        {{ $t('m.downloadNeedPath') }}
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="visible = false">{{ $t('m.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="starting" :disabled="!canStart" @click="confirm">{{ $t('m.download') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'

const emit = defineEmits(['start'])
const appStore = useAppStore()
const { setting } = storeToRefs(appStore)
const { t } = useI18n()

const visible = ref(false)
const book = ref(null)
const location = ref('__default__')
const customDir = ref('')
const original = ref(false)
const nameValue = ref('')
const nameTouched = ref(false)
const starting = ref(false)

const defaultDownloadPath = computed(() => String(setting.value.downloadPath || '').trim())

// 库列表(一个库一项)
const libraries = computed(() => {
  const list = Array.isArray(setting.value.libraries) ? setting.value.libraries : []
  return list.filter(l => l && l.path).map(l => ({ name: l.name || l.path, path: l.path }))
})

// 弹窗副标题:显示当前这本的名字(太长省略)
const displayTitle = computed(() => {
  const b = book.value || {}
  return String(b.title || b.title_jpn || '')
})

// 默认名称:按界面语言挑对应标题,没有就中→日→英依次退
const defaultName = computed(() => {
  const b = book.value || {}
  const cn = String(b.title_cn || '').trim()
  const jp = String(b.title_jpn || '').trim()
  const raw = String(b.title || '').trim()
  const lang = String(setting.value.language || '').toLowerCase()
  if (lang.startsWith('zh')) return cn || jp || raw
  if (lang.startsWith('ja')) return jp || cn || raw
  return raw || jp || cn
})

const canStart = computed(() => {
  if (location.value === '__custom__') return !!customDir.value
  if (location.value === '__default__') return !!defaultDownloadPath.value
  return true
})

const open = (b) => {
  if (!b) return
  book.value = b
  location.value = '__default__'
  customDir.value = ''
  original.value = false
  nameValue.value = ''
  nameTouched.value = false
  starting.value = false
  visible.value = true
}
defineExpose({ open })

const onNameInput = () => { nameTouched.value = true }
// 清空后自动填回默认名(仍是灰的)
const onNameBlur = () => {
  if (!String(nameValue.value || '').trim()) {
    nameValue.value = ''
    nameTouched.value = false
  }
}
const pickFolder = async () => {
  try {
    const dir = await ipcRenderer.invoke('select-folder', t('m.downloadLocationCustom'))
    if (dir) customDir.value = dir
  } catch (e) { /* 取消 */ }
}

const confirm = () => {
  if (!canStart.value || starting.value) return
  const saveDir = location.value === '__custom__' ? customDir.value : (location.value === '__default__' ? '' : location.value)
  emit('start', {
    book: book.value,
    original: original.value,
    // 名字没改过就用默认名(后端按这个建目录)
    title: String(nameValue.value || '').trim() || defaultName.value,
    saveDir
  })
  starting.value = true
  setTimeout(() => { starting.value = false; visible.value = false }, 300)
}
</script>

<style lang="stylus">
.download-dialog
  border-radius: 10px
  .el-dialog__header
    padding: 12px 16px 6px
    margin-right: 0
  .el-dialog__body
    padding: 6px 16px 4px
  .el-dialog__footer
    padding: 8px 16px 12px
  .dl-title
    font-size: 14px
    font-weight: 600
    line-height: 1.3
    color: var(--el-text-color-primary)
  .dl-subtitle
    margin-top: 2px
    font-size: 11px
    line-height: 1.3
    color: var(--el-text-color-placeholder)
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
  .dl-form
    display: flex
    flex-direction: column
    gap: 8px
  .dl-row
    display: flex
    align-items: center
    gap: 8px
    min-height: 24px
  .dl-label
    flex: none
    width: 58px
    font-size: 12px
    line-height: 1.2
    color: var(--el-text-color-secondary)
  .dl-value
    flex: 1
    min-width: 0
    display: flex
    align-items: center
    gap: 6px
  .dl-select
    width: 100%
  .dl-pick
    max-width: 100%
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
  // 默认名字是灰的,改过就是黑的
  .dl-name .el-input__inner
    color: var(--el-text-color-primary)
  .dl-name.is-default-name .el-input__inner
    color: var(--el-text-color-placeholder)
  .dl-hint
    font-size: 11px
    line-height: 1.3
    color: var(--el-color-warning)
</style>
