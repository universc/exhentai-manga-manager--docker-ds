<template>
  <!-- 文件夹树：左侧入坞面板（T04+，原来是左抽屉）。
       与「任务记录 / 侧边详细信息」同款交互：右缘拖宽、宽度持久化（localStorage）。
       数据与筛选逻辑一行未改。 -->
  <div class="dock-panel dock-panel--left" v-show="sideVisibleFolderTree" :style="{ width: (Number(width) || 300) + 'px' }">
    <div class="dock-panel-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="startResize"></div>
    <div class="dock-panel-header">
      <span class="dock-panel-title">{{ $t('m.folderTree') }}</span>
      <span class="dock-panel-actions">
        <el-button text @click="sideVisibleFolderTree = false">✕</el-button>
      </span>
    </div>
    <div class="dock-panel-body">
      <el-input
        class="folder-search"
        v-model="treeFilterText"
        clearable
      ></el-input>
      <el-tree
        ref="treeRef"
        :data="folderTreeData"
        node-key="folderPath"
        :default-expanded-keys="expandNodes"
        :expand-on-click-node="false"
        :filter-node-method="filterTreeNode"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        @current-change="selectFolderTreeNode"
      ></el-tree>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const appStore = useAppStore()
const { setting, bookList, pathSep, folderTreeData } = storeToRefs(appStore)

const props = defineProps({
  // 面板宽度(px)：App.vue 持有并持久化（localStorage），拖动时双向同步
  width: { type: Number, default: 300 }
})
const emit = defineEmits(['chunkList', 'update:width'])

const sideVisibleFolderTree = ref(false)

// 左侧面板：手柄在右缘，向右拖 = 变宽
const startResize = (e) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = Number(props.width) || 300
  const onMove = (ev) => {
    const next = startW + (ev.clientX - startX)
    emit('update:width', Math.max(220, Math.min(next, 600)))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const openFolderTree = () => {
  sideVisibleFolderTree.value = !sideVisibleFolderTree.value
  if (sideVisibleFolderTree.value && _.isEmpty(folderTreeData.value)) {
    geneFolderTree()
  }
}
const geneFolderTree = async () => {
  const bList = _.filter(bookList.value, book => !book.isCollection)
  const filePathList = bList.map(book => book.filepath)
  folderTreeData.value = await ipcRenderer.invoke('get-folder-tree', filePathList)
}
const selectFolderTreeNode = async (selectNode) => {
  if (selectNode.folderPath) {
    const clickLibraryPath = setting.value.library + pathSep.value + selectNode.folderPath + pathSep.value
    bookList.value.map(book => book.folderHide = !book.filepath.startsWith(clickLibraryPath))
  } else {
    bookList.value.map(book => book.folderHide = false)
  }
  emit('chunkList')
}

const expandNodes = ref([])
onMounted(() => {
  expandNodes.value = JSON.parse(localStorage.getItem('expandNodes')) || []
})
const handleNodeExpand = (nodeObject) => {
  let expandNodes = JSON.parse(localStorage.getItem('expandNodes')) || []
  expandNodes.push(nodeObject.folderPath)
  expandNodes = [...new Set(expandNodes)]
  localStorage.setItem('expandNodes', JSON.stringify(expandNodes))
}
const handleNodeCollapse = (nodeObject) => {
  let expandNodes = JSON.parse(localStorage.getItem('expandNodes')) || []
  expandNodes = expandNodes.filter(path => !path.includes(nodeObject.folderPath))
  localStorage.setItem('expandNodes', JSON.stringify(expandNodes))
}

const treeFilterText = ref('')
const treeRef = ref(null)
watch(treeFilterText, (value) => {
  treeRef.value.filter(value)
})
const filterTreeNode = (val, data) => {
  if (!val) return true
  return data.label.includes(val)
}

const resetSelect = () => {
  treeRef.value && treeRef.value.setCurrentKey('')
}

defineExpose({
  sideVisibleFolderTree,
  openFolderTree,
  geneFolderTree,
  resetSelect
})
</script>

<style lang="stylus">
.folder-search
  margin-bottom: 8px
</style>
