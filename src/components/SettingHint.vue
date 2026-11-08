<template>
  <!-- 「感叹号」说明图标(设置页统一用它)。
       ① 多行模式(lines 有内容):保持「标签设置」里原来那个 el-popover 的观感,
          悬停弹出多条说明 —— 用于原有的「标签页用法」说明。
       ② 单行模式(默认):el-tooltip 一句话说明,用于各个设置项后面的解释。 -->
  <el-popover
    v-if="hasLines"
    :placement="placement"
    :width="380"
    trigger="hover"
    :show-after="120"
    popper-class="emm-hint-popover"
  >
    <template #reference>
      <span class="tag-help-dot" :title="title || text">!</span>
    </template>
    <div class="tag-help-body">
      <div class="tag-help-title" v-if="title">{{ title }}</div>
      <div class="tag-help-line" v-for="(line, i) in lines" :key="i">{{ line }}</div>
    </div>
  </el-popover>
  <el-tooltip
    v-else
    :content="text"
    :placement="placement"
    :show-after="120"
    popper-class="emm-hint-popover"
  >
    <span class="tag-help-dot">!</span>
  </el-tooltip>
</template>

<script setup>
/**
 * SettingHint —— 设置项后面的「!」说明图标。
 *
 * 由来:原来「标签设置」里手写了一个 el-popover + span.tag-help-dot,
 * 本轮把它抽成组件,让所有设置项的说明长得一模一样(class 名保持不变,观感不变)。
 *
 * props:
 *   · text      —— 必填,已经翻译好的说明文本(单行模式直接作为 tooltip 内容)
 *   · placement —— tooltip/popover 的方向,默认 top
 *   · lines     —— 可选,多行说明(给了它就渲染成 el-popover 的多行样式)
 *   · title     —— 可选,多行模式的标题
 */
import { computed } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  placement: { type: String, default: 'top' },
  lines: { type: Array, default: () => [] },
  title: { type: String, default: '' },
})

const hasLines = computed(() => Array.isArray(props.lines) && props.lines.filter(l => !!String(l || '').trim()).length > 0)
</script>

<style lang="stylus">
/* 这两个类名照抄「设置 → 标签设置」里原来的实现(class 名不变 → 观感不变) */
.tag-help-dot
  flex: none
  width: 13px
  height: 13px
  line-height: 12px
  text-align: center
  border-radius: 50%
  border: 1px solid var(--el-text-color-secondary)
  color: var(--el-text-color-secondary)
  font-size: 10px
  font-weight: 700
  cursor: help
  user-select: none
  // 正间距,不再贴边:只有在「标签设置」那个标题行里才允许贴边,那里由标题行的 gap 控制
  margin: 0 0 0 4px
  vertical-align: middle
  display: inline-flex
  align-items: center
  justify-content: center
.tag-help-body
  font-size: 12px
  line-height: 1.7
  .tag-help-title
    font-weight: 600
    margin-bottom: 4px
  .tag-help-line
    color: var(--el-text-color-regular)
</style>
