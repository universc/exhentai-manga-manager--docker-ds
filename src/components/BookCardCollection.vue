<template>
  <div class="book-card">
    <el-tag effect="dark" type="warning" class="book-collection-tag">{{$t('m.collection')}}</el-tag>
    <p class="book-title" v-if="!setting.hideTitle" :title="book.title">{{book.title}}</p>
    <div class="book-cover-frame">
      <img class="book-cover" :src="book.coverPath" @click="$emit('openCollection')"/>
      <el-tag class="book-card-language" size="small" v-if="!setting.hideReadCount" :type="isChineseTranslatedManga(book) ? 'danger' : 'info'"
      >{{book.readCount}}</el-tag>
      <el-icon v-if="!setting.hideBookmarkButton" :size="30" :color="book.mark ? '#E6A23C' : '#666666'" class="book-card-mark"><BookmarkTwotone /></el-icon>
      <el-tag class="book-card-pagecount" size="small" type="info" v-if="!setting.hidePageCount">{{ book.chapterCount }}C</el-tag>
    </div>
    <el-rate v-if="!setting.hideRating" :model-value="book.rating" size="small" allow-half disabled/>
  </div>
</template>

<script setup>
import { BookmarkTwotone } from '@vicons/material'

import { useAppStore } from '../pinia.js'
import { storeToRefs } from 'pinia'
const appStore = useAppStore()
const { setting } = storeToRefs(appStore)
const { isChineseTranslatedManga } = appStore

const emit = defineEmits(['openCollection'])

const props = defineProps({
  book: Object
})

</script>

<style lang="stylus">
.book-collection-tag
  position: absolute
  right: 1px
  top: 1px
</style>