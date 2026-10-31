<template>
  <div class="emm-state emm-state--empty" role="status" aria-live="polite">
    <component :is="icon" v-if="icon" class="emm-state__icon" />
    <p class="emm-state__title">{{ title }}</p>
    <p class="emm-state__desc" v-if="desc">{{ desc }}</p>
    <el-button v-if="actionText" size="small" class="emm-state__action" @click="$emit('action')">
      {{ actionText }}
    </el-button>
  </div>
</template>

<script setup>
/**
 * 统一空态（P0-08）。
 *
 * 原来书架 / 侧栏 / 详情 / 下载栏各写一套「一句话 + 一点 padding」的提示，
 * 字号颜色各不相同；统一到这里后只有一份视觉口径。
 *
 * 只用 props + emit，不在组件内部做任何业务判断（判断留在调用方的 computed 里），
 * 这样调用方将来要换文案/换图标都不用改组件。
 */
defineProps({
  // 线性图标组件（@element-plus/icons-vue 或 @vicons/* 的组件对象）
  icon: { type: [Object, Function], default: null },
  // 主文案（必填）
  title: { type: String, default: '' },
  // 次要说明（可选）
  desc: { type: String, default: '' },
  // 操作按钮文案（可选；不传就不渲染按钮）
  actionText: { type: String, default: '' },
  // 数量提示（可选，用于「没有更多了」这类带数字的场合，如 0 条时不显示）
  count: { type: Number, default: null },
})

defineEmits(['action'])
</script>

<style scoped>
/* scoped 属于 §9.2 允许的 3 处例外之一（states/* 共享一套语义）。
   只消费令牌，不写裸色值。 */
.emm-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--emm-space-2);
  padding: var(--emm-space-5) var(--emm-space-3);
  text-align: center;
  color: var(--emm-text-3);
}

.emm-state__icon {
  width: var(--emm-space-6);
  height: var(--emm-space-6);
  color: var(--emm-text-4);
}

.emm-state__title {
  margin: 0;
  font-size: var(--emm-fs-body);
  font-weight: var(--emm-fw-medium);
  color: var(--emm-text-2);
  line-height: var(--emm-lh-normal);
}

.emm-state__desc {
  margin: 0;
  max-width: 42ch;
  font-size: var(--emm-fs-caption);
  color: var(--emm-text-3);
  line-height: var(--emm-lh-normal);
}

.emm-state__action {
  margin-top: var(--emm-space-1);
}
</style>
