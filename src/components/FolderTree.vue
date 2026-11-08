<template>
  <!-- 文件夹树：左侧入坞面板（T04+，原来是左抽屉）。
       与「任务记录 / 侧边详细信息」同款交互：右缘拖宽、宽度持久化（localStorage）。
       数据与筛选逻辑一行未改。 -->
  <div class="dock-panel dock-panel--left" v-show="sideVisibleFolderTree" :style="{ width: (Number(width) || 300) + 'px' }">
    <div class="dock-panel-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="startResize"></div>
    <div class="dock-panel-header">
      <span class="dock-panel-title">{{ $t('m.folderTree') }}</span>
      <span class="dock-panel-actions">
        <el-button text @click="closeFolderTree">✕</el-button>
      </span>
    </div>
    <div class="dock-panel-body">
      <el-input
        class="folder-search"
        v-model="treeFilterText"
        clearable
      ></el-input>
      <!-- node-key 用后端给的 uid(= rootPaths 排序后 join('|') + '::' + folderPath):
           跨库合并后两个库都有「R18」时 folderPath 会重名,用它当 key 会让 Element 报 duplicate key,
           且 default-expanded-keys / setCurrentKey 只能命中其中一颗子树。 -->
      <el-tree
        ref="treeRef"
        :data="folderTreeData"
        node-key="uid"
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
import { computed, ref, watch, onMounted } from 'vue'

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
// treeRef 要提前声明:closeFolderTree / clearFolderFilter 会用到它,
// 而 const 有暂时性死区(在声明之前访问会抛 ReferenceError)。
const treeRef = ref(null)

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

// 关闭面板 = 取消文件夹筛选。
// ★ 2026-11 修:以前关面板只把 sideVisibleFolderTree 置 false,
//   而 selectFolderTreeNode 给书打的 folderHide 标记还留着 ——
//   面板关了,书架却仍然只显示「上次点的那个文件夹」里的书,必须重启才恢复。
//   现在关闭时统一清掉 folderHide 并通知 App 重新分页。
const clearFolderFilter = () => {
  bookList.value.forEach(book => { if (book.folderHide) book.folderHide = false })
  // 树的选中态也一并清掉,下次打开是「未选中」的干净状态
  try { if (treeRef.value) treeRef.value.setCurrentKey(null) } catch (e) { /* 忽略 */ }
  emit('chunkList')
}

const closeFolderTree = () => {
  sideVisibleFolderTree.value = false
  clearFolderFilter()
}

const openFolderTree = () => {
  // 再点一次工具栏按钮 = 收起(同样要清筛选)
  if (sideVisibleFolderTree.value) { closeFolderTree(); return }
  sideVisibleFolderTree.value = true
  if (_.isEmpty(folderTreeData.value)) {
    geneFolderTree()
  }
}
const geneFolderTree = async () => {
  const bList = _.filter(bookList.value, book => !book.isCollection)
  const filePathList = bList.map(book => book.filepath)
  folderTreeData.value = await ipcRenderer.invoke('get-folder-tree', filePathList)
}
// 路径比较用:去掉末尾的一个或多个分隔符。
// (后端返回的库根可能带尾分隔符也可能不带 —— 不收拾的话会拼出 `Y:\03-小说\\R18\` 这种双斜杠)
const trimTrailingSep = (p) => String(p || '').replace(/[\\/]+$/, '')

// 点文件夹树节点 → 把 bookList 里不属于该节点的书标成 folderHide。
// ⚠ 旧实现用 `setting.library`(= **当前活动库**)去拼前缀,但树节点是按「它自己所属的库」切出来的
//   (后端 get-folder-tree 用 libraryForPath(fp) 决定根),于是非活动库的节点永远匹配不上 →
//   点「03-小说 / R18 / R18G」就是「共 0 条」。现在改用节点自带的两字段:
//   · rootPaths: string[] 该节点涉及的库根**绝对路径**(跨库合并的节点可能有多个)
//   · folderPath: string  相对库根的路径,顶层节点是 ''
const selectFolderTreeNode = async (selectNode) => {
  const rel = String((selectNode && selectNode.folderPath) || '')
  const rawRoots = selectNode ? selectNode.rootPaths : null
  // 兼容旧后端(还没返回 rootPaths):退回原来「按活动库拼前缀」的算法,
  // 否则在前后端没同时更新时整棵树会点什么都显示全部。后端补上后这条分支不会命中
  // —— 即使是 `[]` 也走下面的新逻辑。
  const legacyMode = !!selectNode && !Array.isArray(rawRoots)
  // 该节点涉及的库根;空数组 = 不属于任何库(或旧后端的顶层节点)
  const roots = (Array.isArray(rawRoots) ? rawRoots : [])
    .map(root => trimTrailingSep(root))
    .filter(root => !!root)

  bookList.value.map(book => {
    const filepath = String((book && book.filepath) || '')
    // ① 清空选择 / 点空白:全部显示(原有行为,原样保留)
    if (!selectNode) { book.folderHide = false; return }
    if (legacyMode) {
      // 老算法:rel 为空 → 全部显示;否则 活动库根 + rel + 分隔符
      book.folderHide = rel
        ? !filepath.startsWith(setting.value.library + pathSep.value + rel + pathSep.value)
        : false
      return
    }
    // ② 不属于任何库的节点:不隐藏任何书。
    //    (反过来说「全藏」会造出一颗看起来能点、点了 0 条的死节点)
    if (!roots.length) { book.folderHide = false; return }
    // ③ 顶层节点(rel === '')只按库根前缀过滤 → 点「03-小说」能看到该库全部书;
    //    非顶层按 库根 + rel + 分隔符 过滤 → 跨库合并的节点(roots 多个)只要命中任一库就算命中。
    const hit = roots.some(root => {
      const prefix = rel ? (root + pathSep.value + rel + pathSep.value) : (root + pathSep.value)
      return filepath.startsWith(prefix)
    })
    book.folderHide = !hit
  })
  // 分页/渲染交给 App(它自己会重置 currentPage),这里别动
  emit('chunkList')
}

// ---------- 展开状态持久化 ----------
// 以前存的是 folderPath 列表,而 folderPath 跨库会重名(两个库都有 R18)→ 收起一个库的 R18,
// 另一个库的同名目录也一起塌掉。现在存 uid(后端给的唯一稳定 key)。
// 老版本留下的 'expandNodes'(folderPath 列表)做**一次性翻译**:用当前树把 folderPath 映射成 uid,
// 同一个 folderPath 可能对应多个库 → 全部展开(反正用户当初就是想看这个目录)。
const EXPAND_KEY = 'expandNodeUids'
const LEGACY_EXPAND_KEY = 'expandNodes'

const readJsonArray = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

// 把树递归摊平(一次性索引,翻译存档 key 时不用每次重遍历)
const flatNodes = computed(() => {
  const out = []
  const walk = (nodes) => {
    (Array.isArray(nodes) ? nodes : []).forEach(node => {
      if (!node) return
      out.push(node)
      walk(node.children)
    })
  }
  walk(folderTreeData.value)
  return out
})

// 一条存档 key(folderPath 或 uid)→ 它对应的**所有** uid。
// 老存档存的是 folderPath,而 folderPath 跨库会重名(两个库都有 R18):
// 这里返回全部命中(全部展开)才符合用户当初的意图 —— 若用 `find` 只取第一个,
// 另一个库的同名目录会被漏掉。
const toUids = (key) => {
  // null/undefined 不是有意义的 key(存档里正常不会出现);空串 '' 是合法的 —— 那是顶层节点的 folderPath
  if (key === null || key === undefined) return []
  const raw = String(key)
  // 本来就是 uid(新格式,或半迁移的混合存档):原样返回,顺带丢掉树里已不存在的节点
  const byUid = raw ? flatNodes.value.filter(node => String(node.uid || '') === raw) : []
  if (byUid.length) return byUid.map(node => String(node.uid))
  // folderPath → 所有同路径节点的 uid
  return flatNodes.value
    .filter(node => String(node.folderPath || '') === raw && node.uid)
    .map(node => String(node.uid))
}

const readExpandKeys = () => {
  // 已经是新格式(uid):直接用,顺便丢掉树上已不存在的 uid(多库切来切去后存档不会越滚越大)
  if (localStorage.getItem(EXPAND_KEY) !== null) {
    const keys = [...new Set(readJsonArray(EXPAND_KEY).map(String))]
    // 树还没加载(挂载时 folderTreeData 往往还是空数组):原样返回,否则会把存档裁成空
    if (!flatNodes.value.length) return keys
    const alive = new Set(flatNodes.value.map(node => String(node.uid || '')))
    const kept = keys.filter(uid => alive.has(uid))
    if (kept.length || !keys.length) return kept
    // 全部失效 → 用 uid 里 `::` 之后的 folderPath 部分重新映射一次。
    // uid = `<rootPaths 排序后 join('|')>::<folderPath>`,所以「改库路径 / 换盘符 /
    // 新增或删除一个根目录同名的库」会让 roots 段变、uid 整批变,但 folderPath 段是稳的。
    // 不回退这一下的话,用户改一次库路径 = 展开状态清零,体验很差。
    // (只在新 key 一条都活不下来时兜底,不会覆盖用户当前的收起操作)
    const remapped = []
    keys.forEach(uid => {
      const at = uid.indexOf('::')
      if (at < 0) return
      toUids(uid.slice(at + 2)).forEach(next => remapped.push(next))
    })
    return [...new Set(remapped)]
  }
  // 老格式(folderPath):一次性翻译成 uid;树还没加载时 flatNodes 为空,等数据到了再翻(见下面的 watch)
  const legacy = readJsonArray(LEGACY_EXPAND_KEY)
  if (!legacy.length) return []
  const uids = []
  legacy.forEach(key => {
    toUids(key).forEach(uid => uids.push(uid))
  })
  return [...new Set(uids)]
}

const expandNodes = ref([])
const syncExpandKeys = () => {
  expandNodes.value = readExpandKeys()
}
onMounted(syncExpandKeys)
// 树是懒加载的(geneFolderTree 才去 invoke),挂载时 folderTreeData 往往还是空数组:
// 数据一到就重算一次 —— 老格式要靠树才能翻译,新格式要靠树才能裁掉已失效的 uid。
watch(folderTreeData, () => {
  const hasNewArchive = localStorage.getItem(EXPAND_KEY) !== null
  const hasLegacyArchive = readJsonArray(LEGACY_EXPAND_KEY).length > 0
  if (!hasNewArchive && !hasLegacyArchive) return
  syncExpandKeys()
})

const handleNodeExpand = (nodeObject) => {
  const uid = String((nodeObject && nodeObject.uid) || '')
  if (!uid) return
  const keys = readJsonArray(EXPAND_KEY).map(String)
  keys.push(uid)
  localStorage.setItem(EXPAND_KEY, JSON.stringify([...new Set(keys)]))
}
const handleNodeCollapse = (nodeObject) => {
  const uid = String((nodeObject && nodeObject.uid) || '')
  if (!uid) return
  // 收起节点 = 它自己 + **整棵子树**都不再是「展开中」。
  // 这里用节点对象递归收集子树 uid,而不是拿 uid 字符串拼前缀去猜父子关系:
  // uid 形如 `<roots>::<folderPath>`,顶层节点的 uid 结尾是 '::',它的子节点 uid 是
  // `<roots>::<子目录>`(中间**没有**分隔符),所以 `uid + 分隔符` 这种前缀判断在顶层会漏。
  const dropped = new Set()
  const collect = (node) => {
    if (!node) return
    if (node.uid) dropped.add(String(node.uid))
    ;(Array.isArray(node.children) ? node.children : []).forEach(collect)
  }
  collect(nodeObject)
  let keys = readJsonArray(EXPAND_KEY).map(String)
  keys = keys.filter(key => !dropped.has(key))
  localStorage.setItem(EXPAND_KEY, JSON.stringify(keys))
}

const treeFilterText = ref('')
watch(treeFilterText, (value) => {
  treeRef.value.filter(value)
})
const filterTreeNode = (val, data) => {
  if (!val) return true
  return data.label.includes(val)
}

const resetSelect = () => {
  // 保持 '' 不变:node-key 换成 uid 之后,uid 形如 `C:\manga::R18` 永远不可能是 '',
  // 所以 '' 只会「谁也不匹配」= 清空选中,不会再像 folderPath 时代那样误选第一个库根。
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
