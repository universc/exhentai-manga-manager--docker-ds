<template>
  <div class="book-card" :class="{'cover-only': coverOnly}">
    <p class="book-title" v-if="!setting.hideTitle"
      @click="$emit('openBookDetail')"
      @contextmenu="onMangaTitleContextMenu($event, book)"
      :title="getDisplayTitle(book)"
    >{{getDisplayTitle(book)}}</p>
    <div class="book-cover-frame">
      <img
        class="book-cover"
        :src="book.coverPath"
        @click="$emit('handleClickCover')"
        @contextmenu="$emit('onBookContextMenu', $event, book)"
        @error="onCoverError"
      />
      <el-tag class="book-card-language" size="small" v-if="!setting.hideReadCount"
        :type="isChineseTranslatedManga(book) ? 'danger' : 'info'"
        @click="$emit('handleSearchString', `:count=${book.readCount}`)"
      >{{book.readCount}}</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="danger" v-if="!setting.hidePageCount && book.pageDiff" @click="$emit('handleSearchString', 'pageDiff')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="info" v-else-if="!setting.hidePageCount">{{ book.pageCount }}P</el-tag>
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
        @click="$emit('searchFromTag', tag.tag, tag.cat)"
        class="book-collect-tag"
        :color="tag.color"
        size="small"
        effect="dark"
      >{{tag.letter}}:{{resolvedTranslation[tag.cat]?.[tag.tag]?.name || tag.tag}}</el-tag>
    </div>
    <div class="book-card-footer">
      <el-button-group class="outer-read-button-group" v-if="!setting.hideReadButton">
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('openLocalBook')">{{$t('m.re')}}</el-button>
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('viewManga')">{{$t('m.ad')}}</el-button>
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
  </div>
</template>

<script setup>
import { ref, watchEffect, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone } from '@vicons/material'
import ContextMenu from '@imengyu/vue3-context-menu'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, ensureBookCover } from '../utils.js'
const appStore = useAppStore()
const { setting, resolvedTranslation } = storeToRefs(appStore)
const { getDisplayTitle, isChineseTranslatedManga, saveBook, switchMark } = appStore

const { t } = useI18n()

// 纯图片模式:所有隐藏项都勾选时,封面铺满卡片
const coverOnly = computed(() => {
  const s = setting.value
  return !!(s.hideBookmarkButton && s.hidePageCount && s.hideReadCount && s.hideReadButton && s.hideNonTag && s.hideTitle)
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
])

const props = defineProps({
  book: Object
})

const bookRating = ref(props.book.rating)

watchEffect(() => {
  bookRating.value = props.book.rating
})

// 封面懒加载:路径为空(扫描未生成)或加载失败时,按需生成封面
const onCoverError = () => ensureBookCover(props.book)
watch(() => props.book.coverPath, (v) => {
  if (!v) ensureBookCover(props.book)
}, { immediate: true })

const filterCollectTag = (tagObject) => {
  if (setting.value.showCollectTag) {
    const collectTag = setting.value.collectTag || []
    return collectTag.filter(tag => tagObject[tag.cat] && tagObject[tag.cat].includes(tag.tag))
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
  ].filter(item => isContextMenuItemEnabled(setting.value, 'title', item.id))
  // 全部项都被取消勾选时不弹出空白菜单
  if (items.length === 0) return
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
}

</script>

<style lang="stylus">
.book-card
  display: inline-block
  width: var(--emm-cover-size, 220px)
  padding-bottom: 4px
  border: solid 1px var(--el-border-color)
  border-radius: 6px
  margin: var(--emm-card-gap, 6px)
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
.book-title
  height: 36px
  overflow-y: hidden
  margin: 8px 6px
  font-size: 14px
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
  height: calc((var(--emm-cover-size, 220px) - 20px) * 1.415)
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
      height: calc((var(--emm-cover-size, 220px) - 2px) * 1.415)
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
</style>