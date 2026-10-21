<template>
  <!-- 本地库文件夹选择器:级联、按需加载子目录,只能选「已有库的目录及其子目录」。
       用途:下载记录的「移动」目标、设置里的默认移动路径。
       v-model 是绝对路径(库根目录或它的子目录)。 -->
  <el-cascader
    class="library-folder-picker"
    :model-value="modelValue ? pathToCascaderValue(modelValue) : []"
    :options="options"
    :props="cascaderProps"
    :placeholder="placeholder"
    filterable
    clearable
    size="small"
    popper-class="library-folder-picker-popper"
    @update:model-value="onChange"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])
const appStore = useAppStore()
const { setting } = storeToRefs(appStore)

// 根节点 = 每个库(库文件夹);children 懒加载
const options = computed(() => {
  const libs = Array.isArray(setting.value.libraries) ? setting.value.libraries.filter(l => l && l.path) : []
  const list = libs.length ? libs : (setting.value.library ? [{ name: setting.value.library, path: setting.value.library }] : [])
  return list.map(l => ({
    label: l.name || l.path,
    value: String(l.path).replace(/[\\/]+$/, ''),
    leaf: false
  }))
})

const sep = computed(() => (String(setting.value.library || '').includes('\\') ? '\\' : '/'))

const cascaderProps = {
  // 允许选任意一级(库根目录本身也能选)
  checkStrictly: true,
  lazy: true,
  lazyLoad: async (node, resolve) => {
    const value = node.value || node.data && node.data.value
    if (node.level === 0) { resolve(options.value); return }
    try {
      const r = await ipcRenderer.invoke('list-subfolders', value)
      const dirs = (r && r.ok && Array.isArray(r.dirs)) ? r.dirs : []
      resolve(dirs.map(name => ({
        label: name,
        value: value + sep.value + name,
        leaf: false
      })))
    } catch (e) { resolve([]) }
  }
}

// 绝对路径 → 级联需要的分段值(根 = 命中的库路径)
const libRoots = computed(() => {
  const libs = Array.isArray(setting.value.libraries) ? setting.value.libraries.filter(l => l && l.path) : []
  return libs.map(l => String(l.path).replace(/[\\/]+$/, ''))
})
const pathToCascaderValue = (p) => {
  const target = String(p || '').replace(/[\\/]+$/, '')
  const root = libRoots.value.slice().sort((a, b) => b.length - a.length).find(r => target === r || target.startsWith(r + '/') || target.startsWith(r + '\\'))
  if (!root) return []
  const rest = target.slice(root.length).replace(/^[\\/]+/, '')
  const parts = rest ? rest.split(/[\\/]+/).filter(Boolean) : []
  return [root, ...parts.map((_, i) => root + sep.value + parts.slice(0, i + 1).join(sep.value))]
}

const onChange = (val) => {
  if (!val || !val.length) { emit('update:modelValue', ''); return }
  // 取最后一级(所选目录)
  emit('update:modelValue', val[val.length - 1])
}
</script>

<style lang="stylus">
.library-folder-picker
  width: 100%
</style>
