<template>
  <div class="viewer-page-placeholder" :style="style">
    <!-- 照 JHenTai 阅读器的加载态:转圈 + 文案 + 页码,居中压在图片位置上 -->
    <el-progress
      v-if="state !== 'failed'"
      type="circle"
      :percentage="50"
      :width="54"
      :stroke-width="4"
      indeterminate
      :duration="1.4"
    />
    <el-icon v-else class="viewer-page-placeholder-icon" :size="30"><Warning /></el-icon>
    <div class="viewer-page-placeholder-text">{{ text }}</div>
    <div class="viewer-page-placeholder-page" v-if="index !== null && index !== undefined">{{ index + 1 }}</div>
    <el-button v-if="state === 'failed'" class="viewer-page-placeholder-retry" size="small" type="primary" plain @click="$emit('retry')">{{ $t('m.reload') }}</el-button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Warning } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  // resolving = 正在解析这一页的图片地址(在线) / loading = 地址已知、图还在下 / failed = 拿不到
  state: { type: String, default: 'loading' },
  index: { type: Number, default: null },
  style: { type: Object, default: () => ({}) }
})
defineEmits(['retry'])

const { t } = useI18n()
const text = computed(() => {
  if (props.state === 'resolving') return t('m.ehOnlineParsingPage')
  if (props.state === 'failed') return t('m.ehOnlinePageFailed')
  return t('m.loading')
})
</script>

<style lang="stylus">
.viewer-page-placeholder
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 8px
  width: 100%
  background-color: var(--el-fill-color-light)
  color: var(--el-text-color-regular)
.viewer-page-placeholder-icon
  color: var(--el-color-warning)
.viewer-page-placeholder-text
  font-size: 13px
.viewer-page-placeholder-page
  font-size: 12px
  color: var(--el-text-color-secondary)
.viewer-page-placeholder-retry
  margin-top: 2px
</style>
