<template>
  <div class="viewer-page-placeholder" :style="style">
    <!-- 照 JHenTai 阅读器的加载态:转圈 + 文案 + 页码,居中压在图片位置上 -->
    <!-- ⚠️ 以前这里用 el-progress 的 indeterminate 圆环 + 硬编码 :percentage="50" ——
         Element Plus 的圆环在 indeterminate 下**照样渲染百分比字面值**,于是永远显示一个
         停在 50% 的假进度条。换成 el-icon 的真正旋转动画(与阅读器加载遮罩同一个转圈),
         百分比相关的假象一并去掉。 -->
    <!-- 照 JHenTai 的 _loadingProgressWidgetBuilder:
         环形进度(真实下载百分比) + 「loading」 + 页码 -->
    <template v-if="state !== 'failed'">
      <!-- progress < 0 = 还不知道总大小(EH 偶尔不返回 content-length):转圈即可 -->
      <el-progress
        v-if="progress >= 0"
        type="circle"
        :percentage="progressPercent"
        :width="44"
        :stroke-width="4"
        :show-text="false"
        class="viewer-page-placeholder-ring"
      />
      <el-icon v-else class="is-loading viewer-page-placeholder-spinner" :size="30"><Loading /></el-icon>
      <div class="viewer-page-placeholder-text">{{ text }}</div>
      <div class="viewer-page-placeholder-page" v-if="index !== null && index !== undefined">
        {{ total ? (index + 1) + ' / ' + total : (index + 1) }}
      </div>
    </template>
    <!-- 照 JHenTai 的 _failedWidgetBuilder:一个可点的错误按钮 + 页码 -->
    <template v-else>
      <div class="viewer-page-placeholder-fail" role="button" :title="$t('m.reload')" @click="$emit('retry')">
        <el-icon :size="28"><Warning /></el-icon>
        <span class="viewer-page-placeholder-fail-text">{{ $t('m.ehOnlinePageFailed') }}</span>
      </div>
      <div class="viewer-page-placeholder-page" v-if="index !== null && index !== undefined">{{ index + 1 }}</div>
    </template>
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
  // 下载进度:0~1;负数 = 未知(显示转圈而不是百分比)
  progress: { type: Number, default: -1 },
  style: { type: Object, default: () => ({}) }
})
defineEmits(['retry'])

const { t } = useI18n()
const progressPercent = computed(() => {
  const p = Number(props.progress)
  if (!Number.isFinite(p) || p < 0) return 0
  return Math.max(0, Math.min(100, Math.round(p * 100)))
})
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
  // 加载中/失败用深色底:以前浅色底在白背景里像「变白了」,在线图没出来时尤其明显
  background-color: var(--el-fill-color-dark)
  color: var(--el-text-color-secondary)
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
.viewer-page-placeholder-ring
  :deep(.el-progress-circle__track)
    stroke: var(--el-border-color-darker, #c0c4cc)
  :deep(.el-progress-circle__path)
    stroke: var(--el-color-primary)
// 失败态:照 JHenTai —— 图标 + 文案构成一个可点的按钮
.viewer-page-placeholder-fail
  display: flex
  flex-direction: column
  align-items: center
  gap: 6px
  padding: 6px 12px
  border-radius: 6px
  cursor: pointer
  color: var(--el-color-danger)
  transition: background-color .15s ease
  &:hover
    background-color: var(--el-fill-color)
.viewer-page-placeholder-fail-text
  font-size: 12px
</style>
