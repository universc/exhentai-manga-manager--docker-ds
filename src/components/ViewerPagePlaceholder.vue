<template>
  <div class="viewer-page-placeholder" :style="style">
    <!-- 照 JHenTai 阅读器的加载态:转圈 + 文案 + 页码,居中压在图片位置上 -->
    <!-- ⚠️ 以前这里用 el-progress 的 indeterminate 圆环 + 硬编码 :percentage="50" ——
         Element Plus 的圆环在 indeterminate 下**照样渲染百分比字面值**,于是永远显示一个
         停在 50% 的假进度条。换成 el-icon 的真正旋转动画(与阅读器加载遮罩同一个转圈),
         百分比相关的假象一并去掉。 -->
    <el-icon v-if="state !== 'failed'" class="is-loading viewer-page-placeholder-spinner" :size="34"><Loading /></el-icon>
    <el-icon v-else class="viewer-page-placeholder-icon" :size="30"><Warning /></el-icon>
    <div class="viewer-page-placeholder-text">{{ text }}</div>
    <div class="viewer-page-placeholder-page" v-if="index !== null && index !== undefined">
      {{ total ? (index + 1) + ' / ' + total : (index + 1) }}
    </div>
    <el-button v-if="state === 'failed'" class="viewer-page-placeholder-retry" size="small" type="primary" plain @click="$emit('retry')">{{ $t('m.reload') }}</el-button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Warning, Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  // resolving = 正在解析这一页的图片地址(在线) / loading = 地址已知、图还在下 / failed = 拿不到
  state: { type: String, default: 'loading' },
  index: { type: Number, default: null },
  // 这一本的总页数(在线画廊解析出页链接后就知道了):给了就显示「第 N / M 页」
  total: { type: Number, default: 0 },
  style: { type: Object, default: () => ({}) }
})
defineEmits(['retry'])

const { t } = useI18n()
const text = computed(() => {
  if (props.state === 'resolving') return t('m.ehOnlineParsingPageN', { n: (props.index == null ? 1 : props.index) + 1 })
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
.viewer-page-placeholder-spinner
  color: var(--el-color-primary)
.viewer-page-placeholder-icon
  color: var(--el-color-warning)
.viewer-page-placeholder-text
  font-size: 13px
.viewer-page-placeholder-page
  font-size: 12px
  color: var(--el-text-color-secondary)
  font-variant-numeric: tabular-nums
.viewer-page-placeholder-retry
  margin-top: 2px
</style>
