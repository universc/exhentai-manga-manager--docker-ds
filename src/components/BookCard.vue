<template>
  <div class="book-card" :class="{'fill-cover': fillCover}">
    <!-- ================= 经典卡片布局(默认;原版布局原样保留) ================= -->
    <template v-if="!fillCover">
    <p class="book-title" v-if="!setting.hideTitle"
      @click="$emit('titleClick')"
      @contextmenu="onMangaTitleContextMenu($event, book)"
      :title="getDisplayTitle(book)"
    >{{getDisplayTitle(book)}}</p>
    <div class="book-cover-frame">
      <div class="book-task-mask" v-if="bookTaskChar">
        <div class="book-task-ring"></div>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
        <span class="book-task-text">{{ bookTaskChar }}</span>
        <span class="book-task-progress" v-if="bookTaskTotal">{{ bookTaskDone }}/{{ bookTaskTotal }}</span>
      </div>
      <img
        class="book-cover"
        :src="book.coverPath"
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="$emit('onBookContextMenu', $event, book)"
        @load="coverLoading = false"
        @error="onCoverError"
      />
      <!-- 封面加载动画:只覆盖封面区域,加载完成自动消失 -->
      <div class="cover-loading" v-if="coverLoading">
        <el-icon class="is-loading" :size="26"><Loading /></el-icon>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
      </div>
      <el-tag class="book-card-language" size="small" v-if="!setting.hideReadCount"
        :type="isChineseTranslatedManga(book) ? 'danger' : 'info'"
        @click="$emit('handleSearchString', `:count=${book.readCount}`)"
      >{{book.readCount}}</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="danger" v-if="!setting.hidePageCount && book.pageDiff" @click="$emit('pageCountClick')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="info" v-else-if="!setting.hidePageCount" @click="$emit('pageCountClick')">{{ book.pageCount }}P</el-tag>
      <el-icon
        v-if="!setting.hideBookmarkButton && !viewerRole"
        :size="30"
        :color="book.mark ? '#E6A23C' : '#666666'"
        class="book-card-mark" @click="switchMark(book)"
      ><BookmarkTwotone /></el-icon>
    </div>
    <div class="collect-tag">
      <el-tag
        v-for="tag in filterCollectTag(book.tags)" :key="tag.id"
        @click="onCollectTagClick(tag)"
        @mousedown="startTagPress(tag)"
        @mouseup="cancelTagPress"
        @mouseleave="cancelTagPress"
        @touchstart.passive="startTagPress(tag)"
        @touchend="cancelTagPress"
        @touchmove.passive="cancelTagPress"
        @contextmenu="onCollectTagContextMenu($event, tag)"
        class="book-collect-tag"
        :color="tag.color"
        size="small"
        effect="dark"
      >{{tag.letter}}:{{ getDisplayTagName(setting, resolveCatKey(tag.cat), tag.tag) || resolvedTranslation[resolveCatKey(tag.cat)]?.[tag.tag]?.name || tag.tag }}</el-tag>
    </div>
    <div class="book-card-footer">
      <el-button-group class="outer-read-button-group" v-if="!setting.hideReadButton">
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('yueClick')">{{$t('m.re')}}</el-button>
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('duClick')">{{$t('m.ad')}}</el-button>
      </el-button-group>
      <el-tag
        v-if="!setting.hideNonTag"
        class="book-status-tag"
        effect="plain"
        :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'"
        @click="$emit('searchFromTag', book.status)"
      >{{book.status}}</el-tag>
      <el-rate v-if="!setting.hideRating" v-model="bookRating" size="small" allow-half :disabled="viewerRole" @change="saveBook(Object.assign({}, book, {rating: bookRating}))"/>
    </div>
    </template>
    <!-- ================= 填充封面布局(设置 → 显示选项「填充封面」打开后) ================= -->
    <!-- 封面铺满整卡;阅读数/页数/阅·读按钮/状态/评分/收藏标签全部透明浮在图上(无白底) -->
    <template v-else>
      <img
        class="book-cover-fill"
        :src="book.coverPath"
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="$emit('onBookContextMenu', $event, book)"
        @load="coverLoading = false"
        @error="onCoverError"
      />
      <div class="cover-loading" v-if="coverLoading">
        <el-icon class="is-loading" :size="26"><Loading /></el-icon>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
      </div>
      <!-- 任务进度遮罩:填充封面布局同样展示(旋转环 + 任务单字 + 已处理/总数) -->
      <div class="book-task-mask" v-if="bookTaskChar">
        <div class="book-task-ring"></div>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
        <span class="book-task-text">{{ bookTaskChar }}</span>
        <span class="book-task-progress" v-if="bookTaskTotal">{{ bookTaskDone }}/{{ bookTaskTotal }}</span>
      </div>
      <div class="fill-top" v-if="fillTopShown || (!setting.hideBookmarkButton && !viewerRole)">
        <el-tag class="fill-badge" size="small" v-if="!setting.hideReadCount"
          @click="$emit('handleSearchString', `:count=${book.readCount}`)"
        >{{book.readCount}}</el-tag>
        <p class="fill-title" v-if="!setting.hideTitle"
          @click="$emit('titleClick')"
          @contextmenu="onMangaTitleContextMenu($event, book)"
          :title="getDisplayTitle(book)"
        >{{getDisplayTitle(book)}}</p>
        <!-- 收藏按钮:与角标/标题同一行;标题在角标与收藏按钮之间居中,
             隐藏任一侧时标题自动伸展填补空位 -->
        <el-icon
          v-if="!setting.hideBookmarkButton && !viewerRole"
          :size="24"
          :color="book.mark ? '#F7BA2A' : '#ffffff'"
          class="fill-mark"
          @click="switchMark(book)"
        ><BookmarkTwotone /></el-icon>
      </div>
      <div class="fill-footer" v-if="fillFooterShown">
        <!-- 阅读/页数/标签/评分尽量排在一行,放不下自动换行,换出的行居中 -->
        <div class="footer-row" v-if="fillRow1Shown || !setting.hideRating">
          <el-tag
            v-for="tag in filterCollectTag(book.tags)" :key="tag.id"
            @click="onCollectTagClick(tag)"
            @mousedown="startTagPress(tag)"
            @mouseup="cancelTagPress"
            @mouseleave="cancelTagPress"
            @touchstart.passive="startTagPress(tag)"
            @touchend="cancelTagPress"
            @touchmove.passive="cancelTagPress"
            @contextmenu="onCollectTagContextMenu($event, tag)"
            class="book-collect-tag"
            :color="tag.color"
            size="small"
            effect="dark"
          >{{tag.letter}}:{{ getDisplayTagName(setting, resolveCatKey(tag.cat), tag.tag) || resolvedTranslation[resolveCatKey(tag.cat)]?.[tag.tag]?.name || tag.tag }}</el-tag>
          <el-tag class="fill-badge" size="small" v-if="!setting.hidePageCount && book.pageDiff" @click="$emit('pageCountClick')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
          <el-tag class="fill-badge" size="small" v-else-if="!setting.hidePageCount" @click="$emit('pageCountClick')">{{ book.pageCount }}P</el-tag>
          <el-button-group class="outer-read-button-group" v-if="!setting.hideReadButton">
            <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('yueClick')">{{$t('m.re')}}</el-button>
            <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('duClick')">{{$t('m.ad')}}</el-button>
          </el-button-group>
          <el-tag
            v-if="!setting.hideNonTag"
            class="fill-badge"
            @click="$emit('searchFromTag', book.status)"
          >{{book.status}}</el-tag>
          <el-rate v-if="!setting.hideRating" v-model="bookRating" size="small" allow-half :disabled="viewerRole" @change="saveBook(Object.assign({}, book, {rating: bookRating}))"/>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watchEffect, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone } from '@vicons/material'
import { Loading } from '@element-plus/icons-vue'
import ContextMenu from '@imengyu/vue3-context-menu'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, ensureBookCover, getDisplayTagName, resolveCatKey } from '../utils.js'
const appStore = useAppStore()
const TASK_CHARS = { translate: '翻', colorize: '色', upscale: '分', extract: '字' }
const bookTaskProgress = computed(() => (appStore.bookTaskProgress && appStore.bookTaskProgress[props.book && props.book.id]) || null)
const bookTaskDone = computed(() => (bookTaskProgress.value ? bookTaskProgress.value.done : 0))
const bookTaskTotal = computed(() => (bookTaskProgress.value ? bookTaskProgress.value.total : 0))
const bookTaskChar = computed(() => {
  const k = appStore.bookTasks && appStore.bookTasks[props.book && props.book.id]
  return k ? (TASK_CHARS[k] || '忙') : ''
})

const { setting, resolvedTranslation } = storeToRefs(appStore)
const { printMessage } = appStore
const { getDisplayTitle, isChineseTranslatedManga, saveBook, switchMark } = appStore

const { t } = useI18n()

// 填充封面开关(设置 → 显示选项「填充封面」):开 = 封面铺满卡片、文字/按钮透明浮层
const fillCover = computed(() => !!setting.value.fillCover)

// 填充布局:顶部/底部浮层是否有内容(各元素显隐由独立开关控制,互相不联动)
const fillTopShown = computed(() => {
  const s = setting.value
  return !s.hideTitle || !s.hideReadCount
})
const fillRow1Shown = computed(() => {
  const s = setting.value
  return filterCollectTag(props.book.tags).length > 0 || !s.hidePageCount || !s.hideReadButton || !s.hideNonTag
})
const fillFooterShown = computed(() => {
  const s = setting.value
  return fillRow1Shown.value || !s.hideRating
})

// 网页版(Docker)只读账户:隐藏收藏/评分(写操作)
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})

const emit = defineEmits([
  'openBookDetail',
  'handleClickCover',
  'onBookContextMenu',
  'handleSearchString',
  'searchFromTag',
  'openLocalBook',
  'viewManga',
  // 阅读器:进入缩略图模式(点击页数标签)
  'viewThumbnails',
  // 可配置点击策略:封面 / 阅 / 读 / 页数(由设置「点击策略」决定进入 详细/内容/缩略图)
  'coverClick',
  'cover-dblclick',
  'yueClick',
  'duClick',
  'pageCountClick',
  // 长按卡片上的收藏标签 → 弹出简易标签编辑器(筛选 / 全库重命名 / 全库删除 等)
  'tagLongPress',
])

const props = defineProps({
  book: Object
})

const bookRating = ref(props.book.rating)

watchEffect(() => {
  bookRating.value = props.book.rating
})

// 封面加载动画:封面路径变化 / 懒加载生成中保持转圈,<img> 加载完成由 @load 关闭
const coverLoading = ref(true)
// 封面懒加载:路径为空(扫描未生成)或加载失败时,按需生成封面
const onCoverError = () => { coverLoading.value = true; ensureBookCover(props.book) }
watch(() => props.book.coverPath, (v) => {
  coverLoading.value = true
  if (!v) ensureBookCover(props.book)
}, { immediate: true })

// ---------- 封面单击/双击分离:双击时取消单击动作 ----------
let coverClickTimer = null
const onCoverClickOnce = (e) => {
  // 长按已弹出右键菜单:抑制其后的 click,避免又进入阅读
  if (coverLongPressed) { coverLongPressed = false; return }
  // 双击的第二击不再触发单击动作(浏览器会把 detail 设为 2)
  if (e && e.detail > 1) return
  clearTimeout(coverClickTimer)
  // 窗口略大于常见双击间隔,避免慢速双击被拆成两次单击
  coverClickTimer = setTimeout(() => emit('coverClick'), 300)
}
// ---------- 移动端:长按封面 = 右键(触发同一套上下文菜单) ----------
let coverPressTimer = null
let coverLongPressed = false
const startCoverPress = (e) => {
  const t = e && e.touches && e.touches[0]
  if (!t) return
  const x = t.clientX, y = t.clientY
  clearTimeout(coverPressTimer)
  coverPressTimer = setTimeout(() => {
    coverPressTimer = null
    coverLongPressed = true
    clearTimeout(coverClickTimer)   // 取消待触发的单击
    // 合成与右键一致的事件对象(菜单只用到 x/y)
    emit('onBookContextMenu', { x, y, clientX: x, clientY: y, preventDefault () {} }, props.book)
  }, 500)
}
const endCoverPress = () => { clearTimeout(coverPressTimer); coverPressTimer = null }   // 保留 coverLongPressed,由 onCoverClickOnce 消费
const cancelCoverPress = () => { clearTimeout(coverPressTimer); coverPressTimer = null }

const onCoverDblClick = (e) => {
  if (e && e.preventDefault) e.preventDefault()
  clearTimeout(coverClickTimer)
  coverClickTimer = null
  emit('cover-dblclick')
}

// ---------- 收藏标签:点击筛选,长按(500ms)打开简易标签编辑器 ----------
let tagPressTimer = null
let tagLongPressed = false
const startTagPress = (tag) => {
  tagLongPressed = false
  clearTimeout(tagPressTimer)
  tagPressTimer = setTimeout(() => {
    tagLongPressed = true
    emit('tagLongPress', { tag, book: props.book })
  }, 500)
}
const cancelTagPress = () => { clearTimeout(tagPressTimer) }
const onCollectTagClick = (tag) => {
  // 长按已触发编辑器时,抑制随后的 click 误触发筛选
  if (tagLongPressed) { tagLongPressed = false; return }
  emit('searchFromTag', tag.tag, tag.cat)
}
// 右键标签:同一份简易编辑器(方便鼠标用户)
const onCollectTagContextMenu = (e, tag) => {
  e.preventDefault()
  cancelTagPress()
  emit('tagLongPress', { tag, book: props.book })
}

const filterCollectTag = (tagObject) => {
  if (setting.value.showCollectTag) {
    const collectTag = setting.value.collectTag || []
    // 兼容:collectTag 里 cat 可能是中文显示名("角色"),而 book.tags 的键是英文("character")
    return collectTag.filter(tag => {
      const key = resolveCatKey(tag.cat)
      return tagObject[key] && tagObject[key].includes(tag.tag)
    })
  } else {
    return []
  }
}

const onMangaTitleContextMenu = (e, book) => {
  e.preventDefault()
  const items = [
    {
      id: 'copyTitle',
      label: t('c.copyTitleToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.title_jpn || book.title)
      }
    },
    {
      id: 'copyLink',
      label: t('c.copyLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.url)
      }
    },
    {
      id: 'copyTitleAndLink',
      label: t('c.copyTitleAndLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', `${book.title_jpn || book.title}\n${book.url}\n`)
      }
    },
    {
      id: 'translateTitle',
      label: t('m.translateTitle'),
      onClick: async () => {
        appStore.setBookTask(book.id, 'translate')
        try {
          const res = await ipcRenderer.invoke('translate-book-title', book)
          if (res && res.title) printMessage('success', t('m.translateTitle') + ': ' + res.title)
          else printMessage('warning', res?.error || t('c.titleTranslationFailed'))
        } catch (err) {
          printMessage('error', String(err?.message || err))
        } finally {
          appStore.clearBookTask(book.id)
        }
      }
    },
  ].filter(item => isContextMenuItemEnabled(setting.value, 'title', item.id))
  // 全部项都被取消勾选时不弹出空白菜单
  if (items.length === 0) return
  // 顺序按「设置 → 高级 → 右键菜单」里拖动后的顺序
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items: sortContextMenuItems(setting.value, 'title', items) })
}

</script>

<style lang="stylus">
.book-task-mask
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  background: rgba(0, 0, 0, 0.45)
  border-radius: 4px
  z-index: 8
  pointer-events: none
  .book-task-ring
    width: 44px
    height: 44px
    border: 3px solid rgba(255, 255, 255, 0.25)
    border-top-color: #fff
    border-radius: 50%
    animation: book-task-spin 0.9s linear infinite
  .book-task-progress
    position: absolute
    margin-top: 56px
    font-size: 12px
    color: #fff
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6)
  .book-task-text
    position: absolute
    font-size: 18px
    font-weight: 700
    color: #fff
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6)
@keyframes book-task-spin
  to
    transform: rotate(360deg)

.book-card
  display: inline-block
  width: var(--emm-cover-size, 220px)
  padding-bottom: 4px
  border: solid 1px var(--el-border-color)
  border-radius: 6px
  margin: var(--emm-card-gap-v, var(--emm-card-gap, 6px)) var(--emm-card-gap-h, var(--emm-card-gap, 6px))
  position: relative
  // 悬停上浮 + 阴影,更丝滑
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease
  &:hover
    transform: translateY(-3px)
    box-shadow: 0 8px 22px rgba(0, 0, 0, .16)
    border-color: var(--el-border-color-hover, var(--el-border-color))
  .collect-tag
    overflow-x: hidden
    margin: 0 0 0 10px
    text-align: left
    .book-collect-tag
      cursor: pointer
      margin-right: 4px
      margin-bottom: 4px
      border-width: 0
      padding-left: 4px
      padding-right: 4px
// 封面加载动画遮罩(经典/填充布局共用)
.cover-loading
  position: absolute
  top: 0
  left: 0
  right: 0
  bottom: 0
  display: flex
  align-items: center
  justify-content: center
  background: var(--el-fill-color-light, rgba(0, 0, 0, .04))
  color: var(--el-text-color-secondary, #909399)
  border-radius: 6px
  pointer-events: none
.book-title
  height: 36px
  overflow-y: hidden
  margin: 8px 6px
  // 跟随自定义主题的字体大小(--emm-custom-font-size 只在该主题下存在,其它主题回退 14px)
  font-size: var(--emm-custom-font-size, 14px)
  cursor: pointer
  line-height: 18px
.book-card-mark, .book-card-language, .book-card-pagecount
  position: absolute
  cursor: pointer
.book-cover-frame
  position: relative
  width: calc(var(--emm-cover-size, 220px) - 20px)
  margin: 0 auto
  .book-card-language
    left: 0
    top: 0
    border-radius: 3px 0 3px 0
  .book-card-pagecount
    left: 0
    bottom: 0
    border-radius: 0 3px 0 3px
  .book-card-mark
    right: -14px
    top: -14px
.book-cover
  border-radius: 4px
  width: 100%
  // 「卡片高度」设置 → 封面高度(--emm-cover-height 由 applyCoverStyle 按 卡片高度-84px 算好)
  height: var(--emm-cover-height, calc((var(--emm-cover-size, 220px) - 20px) * 1.415))
  object-fit: cover
  display: block
.book-card-footer
  min-height: 26px
  padding-top: 4px
// 纯图片模式:封面铺满卡片,不再有"图片套小框"的错位感
.book-card.cover-only
  padding: 0
  .book-cover-frame
    width: calc(var(--emm-cover-size, 220px) - 2px)
    .book-cover
      height: var(--emm-card-height, calc((var(--emm-cover-size, 220px) - 2px) * 1.415))
      border-radius: 5px
  .book-card-mark, .book-card-language, .book-card-pagecount, .book-title, .book-card-footer, .collect-tag
    display: none
.outer-read-button-group
  margin: 0 6px
.outer-read-button:first-child
  padding: 0 0 0 6px
.outer-read-button + .outer-read-button
  padding: 0 6px 0 0
.book-status-tag
  padding: 0 2px
  margin-right: 6px
  cursor: pointer
  width: 56px
.el-rate
  display: inline-block
  height: 18px

// ============ 填充封面布局(设置「填充封面」打开后;经典布局不受影响) ============
// 封面铺满整卡,所有信息为透明浮层(无白底块),上/下缘黑色渐变兜底保证可读
.book-card.fill-cover
  // 高度来自「卡片高度」设置
  height: var(--emm-card-height, calc(var(--emm-cover-size, 220px) * 1.5 + 36px))
  padding: 0
  overflow: hidden
  background: #2b2d31
  border-radius: 8px
  .book-cover-fill
    // 封面放大铺满卡片框,再居中放大 ~15%:旧封面文件自带的深色边缘(黑边)
    // 会被推出画面裁掉,避免"内容小 + 四周黑"的观感
    position: absolute
    top: 0
    left: 0
    width: 100%
    height: 100%
    object-fit: cover
    display: block
    transform: scale(1.15)
  // 顶部浮层:阅读数角标 + 标题 + 收藏按钮同一行。
  // 标题始终在"角标 ~ 收藏按钮"之间的可用区居中;任一侧隐藏,标题自动伸展填补空位
  .fill-top
    position: absolute
    top: 0
    left: 0
    right: 0
    z-index: 2
    display: flex
    align-items: flex-start
    gap: 6px
    padding: 6px 8px 18px
    background: linear-gradient(180deg, rgba(0, 0, 0, .55), rgba(0, 0, 0, 0))
    pointer-events: none
    // 阅读数角标(左上,随开关显隐)
    .fill-badge
      flex: 0 0 auto
      pointer-events: auto
      margin-top: 1px
    .fill-title
      flex: 1 1 auto
      min-width: 0
      margin: 0
      color: #fff
      font-size: calc(var(--emm-custom-font-size, 14px) - 1px)
      line-height: 1.4
      cursor: pointer
      text-shadow: 0 1px 2px rgba(0, 0, 0, .85)
      pointer-events: auto
      text-align: center
      display: -webkit-box
      -webkit-box-orient: vertical
      -webkit-line-clamp: 2
      overflow: hidden
      word-break: break-all
      &:hover
        color: #ffd04b
    // 收藏按钮(右上,随开关显隐;与角标、标题同一行)
    .fill-mark
      flex: 0 0 auto
      pointer-events: auto
      cursor: pointer
      padding: 2px
      margin-top: 1px
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .8))
      transition: transform .15s ease
      &:hover
        transform: scale(1.15)
  // 底部浮层
  .fill-footer
    position: absolute
    bottom: 0
    left: 0
    right: 0
    z-index: 2
    padding: 18px 6px 6px
    background: linear-gradient(0deg, rgba(0, 0, 0, .6) 0%, rgba(0, 0, 0, .35) 55%, rgba(0, 0, 0, 0) 100%)
    .footer-row
      display: flex
      flex-wrap: wrap
      justify-content: center
      align-items: center
      gap: 4px 5px
      // 元素尽可能挤在一排;放不下自动换行,换出的行居中
  // 透明徽标(阅读数/页数/状态):半透明黑底 + 白字,无白底
  .fill-badge
    flex: 0 0 auto
    cursor: pointer
    background: rgba(0, 0, 0, .36) !important
    border: 1px solid rgba(255, 255, 255, .28) !important
    color: #fff !important
    font-weight: 600
    border-radius: 4px
    padding: 0 5px
    height: 20px
    line-height: 18px
    box-shadow: none
    text-shadow: 0 1px 1px rgba(0, 0, 0, .5)
    &:hover
      background: rgba(255, 255, 255, .25) !important
  // 收藏标签:保留自定义彩色信息色
  .book-collect-tag
    flex: 0 0 auto
    cursor: pointer
    border-width: 0
    opacity: .94
    box-shadow: 0 1px 3px rgba(0, 0, 0, .35)
  // 阅/读按钮:透明浮层(无白底)
  .outer-read-button-group
    flex: 0 0 auto
    .el-button.is-plain
      background: rgba(0, 0, 0, .22)
      border-color: rgba(255, 255, 255, .65)
      color: #fff
      text-shadow: 0 1px 1px rgba(0, 0, 0, .6)
      &:hover
        background: rgba(255, 255, 255, .3)
        border-color: #fff
    .outer-read-button:first-child
      padding: 0 0 0 6px
    .outer-read-button + .outer-read-button
      padding: 0 6px 0 0
  // 评分:透明,未选星半透明白,选中保持金色
  .el-rate
    height: 22px
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .7))
    .el-rate__item
      color: rgba(255, 255, 255, .8)
      cursor: pointer
    .el-rate__icon.is-active
      color: #f7ba2a
    &.is-disabled .el-rate__item
      color: rgba(255, 255, 255, .55)
      cursor: auto
</style>