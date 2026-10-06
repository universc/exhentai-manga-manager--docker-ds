<template>
  <el-dialog v-model="dialogVisibleSetting"
    width="55em"
    :modal="false"
    append-to-body
    top="60px"
    class="setting-dialog"
    @open="attachSettingInertiaScroll"
  >
    <template #header><p class="setting-title">{{$t('m.setting')}}</p></template>
    <el-tabs v-model="activeSettingPanel" class="setting-tabs">
      <!-- 网页版只读账户仅显示「账户」页(可查看当前账户并退出登录);管理员/桌面版显示全部 -->
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.general')" name="general">
        <!-- 运行模式:本地 / 服务器(NAS) -->
        <el-row :gutter="8" v-if="showDesktopUI">
          <el-col :span="24">
            <div class="setting-line">
              <span class="setting-label" style="margin-right: 14px;">{{$t('m.runMode')}}</span>
              <el-radio-group v-model="runMode" @change="handleRunModeChange">
                <el-radio-button label="local">{{$t('m.localMode')}}</el-radio-button>
                <el-radio-button label="remote">{{$t('m.serverMode')}}</el-radio-button>
              </el-radio-group>
            </div>
          </el-col>
        </el-row>
        <!-- 本地模式:数据文件位置(漫画库位置见下方) -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'local'">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="dataPathText">
                <template #prepend><span class="setting-label">{{$t('m.dataPath')}}</span></template>
                <template #append>
                  <el-button-group>
                    <el-button @click="selectDataPath">{{$t('m.select')}}</el-button>
                    <el-button type="primary" @click="saveDataPath">{{$t('m.dataPathSaveRestart')}}</el-button>
                  </el-button-group>
                </template>
              </el-input>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.dataPathHint')}}</div>
          </el-col>
        </el-row>
        <!-- 服务器模式:服务器 IP / 端口 + 账户 + 连接/退出 -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'remote'">
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="remoteIp" :placeholder="$t('m.remoteIpPlaceholder')" @change="syncRemoteServer">
                <template #prepend><span class="setting-label">{{$t('m.remoteIp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="remotePort" placeholder="10000" @change="syncRemoteServer">
                <template #prepend><span class="setting-label">{{$t('m.remotePort')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="setting.remoteUsername" :placeholder="$t('m.loginUsername')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.remoteUsername')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="setting.remotePassword" type="password" show-password :placeholder="$t('m.loginPassword')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.remotePassword')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button class="function-button" plain @click="testRemoteServer">{{$t('m.testConnection')}}</el-button>
              <el-button class="function-button" type="primary" plain :disabled="!remoteIp" @click="relaunchRemoteMode">{{$t('m.relaunchConnect')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button class="function-button" type="danger" plain @click="exitServerMode">{{$t('m.exitServerMode')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.webModeHint')}}</div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.appName" :placeholder="$t('m.appNamePlaceholder')" @change="handleAppNameChange">
                <template #prepend><span class="setting-label">{{$t('m.appNameSetting')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.library">
                <template #prepend><span class="setting-label">{{$t('m.library')}}</span></template>
                <template #append><el-button @click="selectLibraryPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.metadataPath" :placeholder="$t('m.metadataPathDefault')">
                <template #prepend><span class="setting-label">{{$t('m.metadataPath')}}</span></template>
                <template #append><el-button @click="selectMetadataPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.imageExplorer" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.imageViewer')}}</span></template>
                <template #append>
                  <el-button-group>
                    <el-button :icon="MdRefresh" @click="resetImageExplorer" style="border-right: solid 1px"></el-button>
                    <el-button @click="selectImageExplorerPath">{{$t('m.select')}}</el-button>
                  </el-button-group>
                </template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.theme')}}</span></template>
                <el-select placeholder=" " v-model="setting.theme" @change="handleThemeChange">
                  <el-option label="Default Dark" value="dark"></el-option>
                  <el-option label="Default Light" value="light"></el-option>
                  <el-option label="ExHentai" value="dark exhentai"></el-option>
                  <el-option label="E-Hentai" value="light e-hentai"></el-option>
                  <el-option label="nHentai" value="dark nhentai"></el-option>
                  <el-option :label="$t('m.customTheme')" value="custom"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.igneous" @change="saveSetting">
                <template #prepend><span class="setting-label">igneous</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_pass_hash" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_pass_hash</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_member_id" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_member_id</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.star" @change="saveSetting">
                <template #prepend><span class="setting-label">star</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.proxy" @change="saveSetting" :placeholder="$t('m.like') + ' http://127.0.0.1:7890'">
                <template #prepend><span class="setting-label">{{$t('m.proxy')}}</span></template>
                <template #append><el-button @click="testProxy">{{$t('m.test')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
        </el-row>
        <!-- 回收站:删除的漫画先移到这里,可随时恢复(桌面版/网页版都显示 —— 网页版正是以前永久删除的重灾区) -->
        <el-row :gutter="8">
          <!-- 回收站:删除的漫画先移到这里,可随时恢复 -->
          <el-col :span="24">
            <el-divider content-position="left">{{$t('m.trashSection')}}</el-divider>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.trashHint')}}</div>
          </el-col>
          <el-col :span="24" v-if="trashList.length">
            <el-table :data="trashList" size="small" max-height="240" style="width:100%">
              <el-table-column prop="deletedAtText" :label="$t('m.trashDeletedAt')" width="170" />
              <el-table-column :label="$t('m.trashName')">
                <template #default="{ row }">{{ trashRowName(row) }}</template>
              </el-table-column>
              <el-table-column :label="$t('m.trashState')" width="96">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.exists ? 'success' : 'info'">{{ row.exists ? $t('m.trashStateOk') : $t('m.trashStateLost') }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('m.trashActions')" width="160">
                <template #default="{ row }">
                  <el-button size="small" @click="restoreTrashItem(row)" :disabled="!row.exists">{{$t('m.trashRestore')}}</el-button>
                  <el-button size="small" type="danger" plain @click="purgeTrashItem(row)">{{$t('m.trashPurge')}}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="24" v-else>
            <div class="setting-line toolbar-tip">{{$t('m.trashEmpty')}}</div>
          </el-col>
          <el-col :span="24">
            <el-button size="small" @click="loadTrashList">{{$t('m.trashRefresh')}}</el-button>
            <el-button size="small" type="danger" plain :disabled="!trashList.length" @click="purgeAllTrash">{{$t('m.trashPurgeAll')}}</el-button>
            <el-button size="small" plain @click="loadTrashLog">{{$t('m.trashLog')}}</el-button>
            <span class="setting-hint" style="margin-left:10px">{{ trashDir }}</span>
          </el-col>
        </el-row>
        <!-- 删除记录(delete-log.jsonl):记录每一次删除/还原/彻底删除,删错了能查是谁、什么时候、从哪删的 -->
        <el-dialog v-model="trashLogVisible" :title="$t('m.trashLog')" width="52em" append-to-body>
          <div class="setting-line toolbar-tip" style="margin-bottom:6px">{{ trashLogFile }}</div>
          <el-table :data="trashLogList" size="small" max-height="360" style="width:100%">
            <el-table-column :label="$t('m.trashDeletedAt')" width="150">
              <template #default="{ row }">{{ row.timeText }}</template>
            </el-table-column>
            <el-table-column :label="$t('m.trashLogAction')" width="90">
              <template #default="{ row }">{{ row.actionText }}</template>
            </el-table-column>
            <el-table-column :label="$t('m.trashName')">
              <template #default="{ row }">{{ row.title || row.name }}{{ row.image ? ' / ' + row.image : '' }}</template>
            </el-table-column>
            <el-table-column :label="$t('m.trashLogPath')">
              <template #default="{ row }">
                <span class="setting-hint">{{ row.pathText }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('m.trashState')" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.ok ? 'success' : 'danger'">{{ row.ok ? $t('m.trashLogOk') : $t('m.trashLogFail') }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!trashLogList.length" class="setting-line toolbar-tip">{{$t('m.trashLogEmpty')}}</div>
          <template #footer>
            <el-button size="small" @click="trashLogVisible = false">{{$t('m.close')}}</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.readerSettings')" name="internalViewer">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend>
                  <span class="setting-label">{{$t('m.viewerType')}}</span>
                </template>
                <el-select placeholder=" " v-model="setting.viewerType" @change="saveSetting">
                  <el-option :label="$t('m.originalViewer')" value="original"></el-option>
                  <el-option label="ComicRead" value="comicread"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <!-- 阅读器:选择类设置在上,开关两列并排在下(与「高级」页一致) -->
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.viewerEndAction')}}</span></template>
                <el-select v-model="setting.viewerEndAction" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.viewerEndActionNone')" value="none"></el-option>
                  <el-option :label="$t('m.viewerEndActionExit')" value="exit"></el-option>
                  <el-option :label="$t('m.viewerEndActionNext')" value="next"></el-option>
                  <el-option :label="$t('m.viewerEndActionRandom')" value="random"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="setting.thumbnailColumn" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.thumbnailColumn')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="setting.widthLimit" :placeholder="$t('m.widthLimitInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.widthLimit')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="setting.viewerImageGap" :placeholder="$t('m.viewerImageGapPlaceholder')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.viewerImageGap')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="setting.viewerThumbnailGap" :placeholder="$t('m.viewerThumbnailGapPlaceholder')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.viewerThumbnailGap')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.viewerToolbarHover" :active-text="$t('m.viewerToolbarHover')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.viewerToolbarClick" :active-text="$t('m.viewerToolbarClick')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.viewerEndTip" :active-text="$t('m.viewerEndTip')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.viewerButtonTips" :active-text="$t('m.viewerButtonTips')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.autoUpscale" :active-text="$t('m.autoUpscale')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.hidePageNumber" :active-text="$t('m.hidePageNumber')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.keepReadingProgress" :active-text="$t('m.keepReadingProgress')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.reverseLeftRight" :active-text="$t('m.reverseLeftRight')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.defaultInsertEmptyPage" :active-text="$t('m.defaultInsertEmptyPage')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.showNextMangaButtons" :active-text="$t('m.showNextMangaButtons')" @change="saveSetting" />
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.viewerToolbarHoverHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.viewerToolbarClickHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.viewerEndTipHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.autoUpscaleHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.hidePageNumberHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.keepReadingProgressHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.reverseLeftRightHint')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.thumbnailColumnHint')}}</div>
          </el-col>
          <!-- 阅读时设置栏里显示哪些按钮:点击切换显示、按住拖动排序(退出按钮固定常驻,不在这里) -->
          <el-col :span="24">
            <div class="setting-line">
              <div class="context-menu-title">{{$t('m.viewerToolbarButtons')}}</div>
              <draggable
                :model-value="orderedViewerToolbarItems"
                @update:model-value="onViewerToolbarReorder"
                item-key="id"
                animation="200"
                class="context-menu-sort-list"
              >
                <template #item="{ element }">
                  <div
                    class="context-menu-sort-item"
                    :class="{ 'context-menu-sort-item-off': !isViewerToolbarChecked(element.id) }"
                  >
                    <span class="drag-handle">⠿</span>
                    <span class="context-menu-sort-label" @click="toggleViewerToolbar(element.id, !isViewerToolbarChecked(element.id))">{{ $t(element.labelKey) }}</span>
                  </div>
                </template>
              </draggable>
            </div>
            <div class="setting-hint">{{$t('m.viewerToolbarButtonsHint')}}</div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.tagSettings')" name="collectTag">
        <el-row :gutter="8">
          <!-- 当前库中的全部标签:分类在上,标签在下;点击收藏、色点改色、双击重命名 -->
          <el-col :span="24" class="setting-line collect-tag">
            <div class="context-menu-title">{{$t('m.allTags')}}</div>
            <div class="tag-cat-list">
              <el-tag
                v-for="g in allTagsGroups"
                :key="g.cat"
                class="tag-cat-chip"
                :effect="selectedTagCat === g.cat ? 'dark' : 'plain'"
                :type="selectedTagCat === g.cat ? 'primary' : 'info'"
                @click="selectedTagCat = selectedTagCat === g.cat ? null : g.cat"
              >{{ categoryLabel(g.cat) }} ({{ g.tags.length }})</el-tag>
            </div>
            <div class="all-tags-list">
              <template v-for="g in allTagsGroups" :key="g.cat">
                <div v-if="!selectedTagCat || selectedTagCat === g.cat" class="tag-group">
                  <div class="tag-group-title">{{ categoryLabel(g.cat) }}</div>
                  <el-tag
                    v-for="tag in g.tags"
                    :key="tag.id"
                    class="all-tag-item"
                    :effect="collectedTagMap[tag.id] ? 'dark' : 'plain'"
                    :color="collectedTagMap[tag.id]?.color"
                    :closable="!!collectedTagMap[tag.id]"
                    @close="removeTag(tag.id)"
                    @pointerdown="startLongPressCollect(tag)"
                    @pointerup="cancelLongPressCollect"
                    @pointerleave="cancelLongPressCollect"
                    @dblclick="openTagNameEditor(tag)"
                    :title="$t('m.editTagNames')"
                  >
                    <el-popover
                      v-if="collectedTagMap[tag.id]"
                      trigger="click"
                      placement="top"
                      width="210"
                      :visible="tagColorPopupId === tag.id"
                      @hide="tagColorPopupId = null"
                    >
                      <template #reference>
                        <span class="tag-color-dot" :style="{background: collectedTagMap[tag.id].color}" @click.stop="tagColorPopupId = tag.id"></span>
                      </template>
                      <el-color-picker
                        :model-value="collectedTagMap[tag.id]?.color"
                        :predefine="moderateSoftColors"
                        @update:model-value="(c) => applyTagColor(tag, c)"
                      />
                    </el-popover>
                    {{ tagLabelWithSets(tag) }}
                  </el-tag>
                </div>
              </template>
            </div>
          </el-col>
          <!-- 已收藏标签:拖动排序 -->
          <el-col :span="24" class="setting-line collect-tag">
            <div class="context-menu-title">{{$t('m.collectedTags')}}</div>
            <draggable
              v-model="setting.collectTag"
              item-key="id"
              animation="200"
              @change="saveSetting"
            >
              <template #item="{element}">
                <el-tag :color="element.color" effect="dark" closable @close="removeTag(element.id)">
                  <span class="tag-color-dot" :style="{background: element.color}" @click.stop="pickTagColor(element)"></span>
                  {{element.letter}}:{{resolvedTranslation[element.cat]?.[element.tag]?.name || element.tag}}
                </el-tag>
              </template>
            </draggable>
          </el-col>
          <el-col :span="24" class="setting-line collect-tag">
            <el-form :inline="true" :model="formTagAdd" :show-message="false">
              <el-form-item :label="$t('m.tag')">
                <el-select-v2
                  v-model="formTagAdd.tag"
                  filterable clearable :height="340"
                  style="width: 500px"
                  :options="tagListForCollect"
                ></el-select-v2>
              </el-form-item>
              <el-form-item :label="$t('m.tagColor')">
                <el-color-picker v-model="formTagAdd.color" show-alpha :predefine="moderateSoftColors"/>
              </el-form-item>
              <el-form-item>
                <el-button plain @click="addTagToCollect">{{$t('m.addTag')}}</el-button>
              </el-form-item>
            </el-form>
          </el-col>
          <el-col :span="5" class="setting-switch">
            <el-switch
              v-model="setting.showCollectTag"
              :active-text="$t('m.showCollectTag')"
              @change="onShowCollectTagChange"
            />
          </el-col>
          <el-col :span="5" class="setting-switch">
            <el-switch
              v-model="setting.randomTagsEnabled"
              :active-text="$t('m.randomTagsEnabled')"
              @change="onRandomTagsChange"
            />
          </el-col>
          <el-col :span="7" class="setting-switch tag-lang-col">
            <span class="setting-label">{{$t('m.tagTranslate')}}</span>
            <el-select v-model="setting.tagTargetLang" size="small" class="tag-target-lang" @change="onTagLangChange">
              <el-option :label="$t('m.langDefault')" value=""></el-option>
              <el-option :label="$t('m.langZhCn')" value="zh-CN"></el-option>
              <el-option :label="$t('m.langZhTw')" value="zh-TW"></el-option>
              <el-option :label="$t('m.langEn')" value="en"></el-option>
              <el-option :label="$t('m.langJa')" value="ja"></el-option>
            </el-select>
          </el-col>
</el-row>
        <!-- 双击标签:编辑多语言名称(中/日/英),按「目标语言标签」显示 -->
        <el-dialog v-model="tagEditVisible" :title="$t('m.editTagNames')" width="380px" append-to-body>
          <div class="tag-name-editor">
            <p class="tag-edit-raw">{{ tagEditItem ? (tagEditItem.cat + ' : ' + tagEditItem.tag) : '' }}</p>
            <el-input v-model="tagEditLangs['default']" size="small" :placeholder="$t('m.tagNameDefault')" />
            <el-input v-model="tagEditLangs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
            <el-input v-model="tagEditLangs['zh-TW']" size="small" :placeholder="$t('m.tagNameZhTw')" />
            <el-input v-model="tagEditLangs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
            <el-input v-model="tagEditLangs.en" size="small" :placeholder="$t('m.tagNameEn')" />
          </div>
          <!-- 关联标签:包含 / 被包含 -->
          <div class="tag-relation-editor">
            <div class="tag-relation-title">{{ $t('m.tagRelations') }}</div>
            <div class="tag-relation-add">
              <el-select v-model="tagRelationCat" size="small" :placeholder="$t('m.pickCategory')" style="width: 104px;">
                <el-option v-for="c in tagRelationCats" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
              <el-select v-model="tagRelationPick" size="small" filterable clearable :placeholder="$t('m.pickTag')" style="width: 156px;">
                <el-option v-for="o in tagRelationOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select v-model="tagRelationKind" size="small" style="width: 104px;">
                <el-option :label="$t('m.relationContains')" value="contains"></el-option>
                <el-option :label="$t('m.relationContainedBy')" value="containedBy"></el-option>
              </el-select>
              <el-button size="small" type="primary" plain :disabled="!tagRelationPick" @click="addTagRelation">{{ $t('m.addRelation') }}</el-button>
            </div>
            <div class="tag-relation-list">
              <el-tag v-for="r in tagRelationList" :key="r.kind + r.key" size="small" closable class="tag-relation-item" @close="removeTagRelation(r)">
                {{ r.kind === 'contains' ? $t('m.relationContains') : $t('m.relationContainedBy') }} · {{ r.label }}
              </el-tag>
              <span v-if="!tagRelationList.length" class="tag-relation-empty">—</span>
            </div>
          </div>
          <template #footer>
            <el-button size="small" @click="tagEditVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="saveTagNames">{{ $t('m.saveTagNames') }}</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.advanced')" name="advanced">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.language')}}</span></template>
                <el-select placeholder=" " v-model="setting.language" @change="handleLanguageChange(setting.language)">
                  <el-option :label="$t('m.systemDefault')" value="default"></el-option>
                  <el-option label="zh-CN" value="zh-CN"></el-option>
                  <el-option label="zh-TW" value="zh-TW"></el-option>
                  <el-option label="en-US" value="en-US"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.displayTitle')}}</span></template>
                <el-select :placeholder="$t('m.displayTitleInfo')" v-model="setting.displayTitle" @change="saveSetting">
                  <el-option :label="$t('m.englishTitle')" value="englishTitle"></el-option>
                  <el-option :label="$t('m.japaneseTitle')" value="japaneseTitle"></el-option>
                  <el-option :label="$t('m.chineseTitle')" value="chineseTitle"></el-option>
                  <el-option :label="$t('m.filename')" value="filename"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.defaultScraper')}}</span></template>
                <el-select v-model="setting.defaultScraper" @change="saveSetting">
                  <el-option v-for="searchType in searchTypeList" :key="searchType.value" :label="searchType.label" :value="searchType.value" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.requireGap" :placeholder="$t('m.requireGapInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.requestGap')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px">
              <template #prepend>{{$t('m.customOptions')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customOptions" :placeholder="$t('m.customOptionsPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.trimTitleRegExp" :placeholder="$t('m.trimTitleRegExpInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.trimTitleRegExp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.searchKeySuffix" :placeholder="$t('m.searchKeySuffixInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.searchKeySuffix')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.excludeFile" :placeholder="$t('m.excludeFileInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.excludeFile')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.folderTreeWidth" :placeholder="$t('m.folderTreeWidthInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.folderTreeWidth')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <!-- 每页数量 + 惯性滑动(放在自定义CSS上方,只保留设置框) -->
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.customPageSizes" :placeholder="$t('m.pageSizeCustomPlaceholder')" @change="handlePageSizesChange">
                <template #prepend><span class="setting-label">{{$t('m.pageSizeCustom')}}</span></template>
                <template #append>
                  <el-button @click="appendPageSizeComma">,</el-button>
                </template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.scrollInertia')}}</span></template>
                <el-select placeholder=" " v-model="setting.scrollInertiaLevel" @change="saveSetting">
                  <el-option :label="$t('m.scrollInertiaOff')" value="off"></el-option>
                  <el-option :label="$t('m.scrollInertiaLow')" value="low"></el-option>
                  <el-option :label="$t('m.scrollInertiaMedium')" value="medium"></el-option>
                  <el-option :label="$t('m.scrollInertiaHigh')" value="high"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.scrollInertiaTip')}}</div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px" appendWidth="0">
              <template #prepend>{{$t('m.customCss')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customCss" :placeholder="$t('m.customCssPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
              <template #append>
                <el-button text :icon="MdRefresh" @click="reloadWindow"></el-button>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-popconfirm
                placement="top-start"
                :title="$t('m.rebuildWarning')"
                @confirm="forceGeneBookList"
              >
                <template #reference>
                  <el-button class="function-button" plain>{{$t('m.rebuildLibrary')}}</el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                placement="top-start"
                :title="$t('m.patchWarning')"
                @confirm="patchLocalMetadata"
              >
                <template #reference>
                  <el-button class="function-button" type="primary" plain>{{$t('m.patchLocalMetadata')}}</el-button>
                </template>
              </el-popconfirm>
              <el-button class="function-button" type="primary" plain @click="exportDatabase">{{$t('m.exportMetadata')}}</el-button>
              <el-button class="function-button" type="primary" plain @click="importDatabase">{{$t('m.importMetadata')}}</el-button>
              <el-button class="function-button" type="primary" plain @click="importMetadataFromSqlite">{{$t('m.importMetadataFromSqlite')}}</el-button>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.loadOnStart"
              :active-text="$t('m.onStartScan')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.showComment"
              :active-text="$t('m.showComment')"
              @change="saveSetting"
            />
          </el-col>
          
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.skipDeleteConfirm"
              :active-text="$t('m.skipDeleteConfirm')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.showFullscreenButton"
              :active-text="$t('m.showFullscreenButton')"
              @change="saveSetting"
            />
          </el-col>
          
        </el-row>
        <!-- Windows 窗口开关:开机启动 / 置顶 / 托盘 -->
        <el-row :gutter="8" v-if="showDesktopUI">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.startOnLogin"
              :active-text="$t('m.startOnLogin')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.alwaysOnTop"
              :active-text="$t('m.alwaysOnTop')"
              @change="handleAlwaysOnTopChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeOnStart"
              :active-text="$t('m.minimizeOnStart')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeToTray"
              :active-text="$t('m.minimizeToTray')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.closeToTray"
              :active-text="$t('m.closeToTray')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.batchTagfailedBook"
              :active-text="$t('m.batchTagfailedBook')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.onlyGetMetadataOfSelectedFolder"
              :active-text="$t('m.onlyGetMetadataOfSelectedFolder')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>


        <!-- ================= 卡片样式 ================= -->
        <div class="advanced-section-title">{{$t('m.cardStyle')}}</div>
        <!-- 卡片相关开关(自其它分区归并到此):各元素显隐独立 + 填充封面 -->
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideBookmarkButton"
              :active-text="$t('m.hideBookmarkButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hidePageCount"
              :active-text="$t('m.hidePageCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadCount"
              :active-text="$t('m.hideReadCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadButton"
              :active-text="$t('m.hideReadButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideNonTag"
              :active-text="$t('m.hideNonTag')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideTitle"
              :active-text="$t('m.hideTitle')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideRating"
              :active-text="$t('m.hideRating')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.fillCover"
              :active-text="$t('m.fillCover')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <!-- 封面大小(整体百分比,宽高等比)/ 封面宽度 / 封面高度 -->
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.uiZoom')}}</span></template>
                <el-input-number v-model="uiZoomPercent" :min="50" :max="300" :step="10" :value-on-clear="100" controls-position="right" placeholder="100" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverWidth')}}</span></template>
                <el-input-number v-model="setting.coverWidth" :min="80" :max="800" :step="10" :value-on-clear="220" controls-position="right" placeholder="220" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverHeight')}}</span></template>
                <el-input-number v-model="setting.coverHeight" :min="100" :max="1200" :step="10" :value-on-clear="360" controls-position="right" placeholder="360" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>
        <!-- 卡片间距:上下 / 左右 分别调整 -->
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapV')}}</span></template>
                <el-input-number v-model="setting.cardGapV" :min="0" :max="40" :step="2" :value-on-clear="6" controls-position="right" placeholder="6" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapH')}}</span></template>
                <el-input-number v-model="setting.cardGapH" :min="0" :max="40" :step="2" :value-on-clear="6" controls-position="right" placeholder="6" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>

        <!-- 工具栏按钮自定义(设置按钮始终保留) -->
        <div class="advanced-section-title">{{$t('m.toolbarButtons')}}</div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <draggable
                :model-value="orderedToolbarItems"
                @update:model-value="onToolbarReorder"
                item-key="id"
                animation="200"
                class="context-menu-sort-list"
              >
                <template #item="{ element }">
                  <div
                    class="context-menu-sort-item"
                    :class="{ 'context-menu-sort-item-off': !isToolbarItemShown(element.id) }"
                  >
                    <span class="drag-handle">⠿</span>
                    <span class="context-menu-sort-label" @click="toggleToolbarItem(element.id, !isToolbarItemShown(element.id))">
                      <el-icon :size="14" class="toolbar-item-icon"><component :is="toolbarIconMap[element.id]" /></el-icon>
                      {{$t(toolbarLabelKey(element.id))}}
                      <span v-if="TOOLBAR_ALWAYS_ITEMS.includes(element.id)" class="toolbar-item-always">{{$t('m.toolbarAlwaysShown')}}</span>
                    </span>
                  </div>
                </template>
              </draggable>
            </div>
            <div class="setting-hint">{{$t('m.toolbarButtonsHint')}}</div>
          </el-col>
        </el-row>

        <!-- 自定义主题 -->
        <div class="advanced-section-title">{{$t('m.customTheme')}}</div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="custom-theme-panel">
              <div class="setting-hint theme-hint-full">{{$t('m.themeAlphaHint')}}</div>
              <!-- 颜色设置:单独一排 -->
              <div class="theme-group">
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomBg')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomBg" :show-alpha="true" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomBg" class="theme-clear-btn" size="small" text type="danger" @click="clearThemeColor('bg')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomPrimary')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomPrimary" :show-alpha="true" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomPrimary && setting.themeCustomPrimary !== '#409EFF'" class="theme-clear-btn" size="small" text type="danger" @click="resetThemeColor('primary')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontColor')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomFontColor" :show-alpha="true" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomFontColor" class="theme-clear-btn" size="small" text type="danger" @click="clearThemeColor('font')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomCardBg')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomCardBg" :show-alpha="true" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomCardBg" class="theme-clear-btn" size="small" text type="danger" @click="clearThemeColor('card')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomButtonBg')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomButtonBg" :show-alpha="true" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomButtonBg" class="theme-clear-btn" size="small" text type="danger" @click="clearThemeColor('button')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              </div>
              <!-- 字体设置:单独一排(字号留在这一组,不挪到颜色那排) -->
              <div class="theme-group">
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontSize')}}</span>
                <div class="theme-value">
                  <el-input-number v-model="setting.themeCustomFontSize" :min="1" :max="999" :value-on-clear="14" size="small" controls-position="right" placeholder="14" @change="handleCustomThemeChange" />
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontStyle')}}</span>
                <div class="theme-value">
                  <el-select v-model="setting.themeCustomFontStyle" size="small" placeholder=" " @change="handleCustomThemeChange">
                    <el-option v-for="fs in customFontStyles" :key="fs.value" :label="$t(fs.labelKey)" :value="fs.value" />
                  </el-select>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontWeight')}}</span>
                <div class="theme-value">
                  <el-input-number v-model="setting.themeCustomFontWeight" :min="100" :max="900" :step="100" :value-on-clear="400" size="small" controls-position="right" placeholder="400" @change="handleCustomThemeChange" />
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeFontEffect')}}</span>
                <div class="theme-value">
                  <el-checkbox v-model="setting.themeCustomFontItalic" @change="handleCustomThemeChange">{{$t('m.themeFontItalic')}}</el-checkbox>
                  <el-checkbox v-model="setting.themeCustomFontUnderline" @change="handleCustomThemeChange">{{$t('m.themeFontUnderline')}}</el-checkbox>
                </div>
              </div>
              </div>
              <div class="theme-row theme-row-wide">
                <span class="theme-label">{{$t('m.themeCustomBgImage')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.themeCustomBgImage" size="small" :placeholder="$t('m.themeCustomBgImagePlaceholder')" @change="handleCustomThemeChange" />
                  <el-button size="small" @click="selectCustomImage('bg')">{{$t('m.select')}}</el-button>
                  <el-button v-if="setting.themeCustomBgImage" size="small" text type="danger" @click="clearCustomImage('bg')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row theme-row-wide">
                <span class="theme-label">{{$t('m.customIcon')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.customIconPath" size="small" :placeholder="$t('m.customIconPlaceholder')" @change="handleCustomIconChange" />
                  <el-button size="small" @click="selectCustomImage('icon')">{{$t('m.select')}}</el-button>
                  <el-button v-if="setting.customIconPath" size="small" text type="danger" @click="clearCustomImage('icon')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
            </div>
          </el-col>
        </el-row>

        <!-- 右键菜单自定义:拖动排序 + 点击 ✕ 取消 / 点击标签加回 -->
        <div class="advanced-section-title">{{$t('m.contextMenu')}}</div>
        <div class="setting-hint">{{$t('m.contextMenuSortHint')}}</div>
        <el-row :gutter="8">
          <el-col :span="24" v-for="group in contextMenuGroups" :key="group.id">
            <div class="setting-line context-menu-group">
              <div class="context-menu-title">{{ group.title }}</div>
              <draggable
                :model-value="orderedMenuItems(group)"
                @update:model-value="(val) => onMenuReorder(group.id, val)"
                item-key="id"
                animation="200"
                class="context-menu-sort-list"
              >
                <template #item="{ element }">
                  <div
                    class="context-menu-sort-item"
                    :class="{ 'context-menu-sort-item-off': !isMenuChecked(group, element.id) }"
                  >
                    <span class="drag-handle">⠿</span>
                    <span class="context-menu-sort-label" @click="toggleMenuItem(group.id, element.id, !isMenuChecked(group, element.id))">{{ element.label }}</span>
                  </div>
                </template>
              </draggable>
            </div>
          </el-col>
        </el-row>

        <!-- 点击策略:单击封面 / 阅 / 读 / 页数 分别进入哪个界面 -->
        <div class="advanced-section-title">{{$t('m.clickPolicy')}}</div>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickCover')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickCoverAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.dblClickCover')}}</span></template>
                <el-select placeholder=" " v-model="setting.dblClickCoverAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickYue')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickYueAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickDu')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickDuAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickPageCount')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickPageCountAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.clickPolicyHint')}}</div>
          </el-col>
        </el-row>

        <!-- 恢复全部默认(放在最下方) -->
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line reset-all-row">
              <el-button type="danger" plain @click="resetAllSettings">{{$t('m.resetAll')}}</el-button>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>
            <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.aiFeatures')" name="translation">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.imageUpscale')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">使用的模型</span></template>
                <el-select v-model="upscaleEngine" clearable placeholder=" ">
                  <el-option-group label="本地模型(离线运行,需先下载)">
                    <el-option
                      v-for="m in localModels"
                      :key="'up-' + m.id"
                      :label="m.name + (m.installed ? '' : '(未安装)')"
                      :value="'local:' + m.id"
                      :disabled="!m.installed" />
                  </el-option-group>
                  <el-option-group label="API 服务">
                    <el-option v-for="p in (setting.aiApiProfiles || [])" :key="'api-' + p.id" :label="p.name || p.baseUrl" :value="'api:' + p.id" />
                  </el-option-group>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
            <div class="setting-hint">{{$t('m.localModelComicReadHint')}}</div>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.saveMode')}}</span></template>
                <el-select v-model="setting.upscaleSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveModeSame')" value="same"></el-option>
                  <el-option :label="$t('m.saveModeReplace')" value="replace"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <!-- 过滤设置:阈值 + 「启用过滤」开关(开关与自动超分并排放在下面) -->
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.upscaleFilter')}}</span></template>
                <div class="upscale-filter-row">
                  <el-input-number
                    v-model="setting.upscaleSkipWidth"
                    :min="0" :max="20000" :step="100" :value-on-clear="1200" :disabled="!setting.upscaleSkipHighRes"
                    size="small" controls-position="right" @change="saveSetting" />
                  <span class="upscale-filter-sep">×</span>
                  <el-input-number
                    v-model="setting.upscaleSkipHeight"
                    :min="0" :max="20000" :step="100" :value-on-clear="2000" :disabled="!setting.upscaleSkipHighRes"
                    size="small" controls-position="right" @change="saveSetting" />
                  <span class="upscale-filter-unit">px</span>
                </div>
              </NameFormItem>
            </div>
            <div class="setting-hint">{{$t('m.upscaleFilterHint')}}</div>
          </el-col>
          <!-- 两个开关并排:启用过滤 / 自动超分(阅读) -->
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.upscaleSkipHighRes" :active-text="$t('m.upscaleSkipHighRes')" @change="saveSetting" />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch v-model="setting.autoUpscale" :active-text="$t('m.autoUpscaleSection')" @change="saveSetting" />
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.autoUpscaleHint')}}</div>
          </el-col>
          <!-- 清理超分替换原文件时留下的 .bak 备份 -->
          <el-col :span="24">
            <div class="setting-line">
              <el-button type="danger" plain size="small" @click="deleteAllBakFiles">{{$t('m.deleteAllBak')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.imageColorize')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.useApi')}}</span></template>
                <el-select v-model="setting.colorizeApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.saveMode')}}</span></template>
                <el-select v-model="setting.colorizeSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveModeSame')" value="same"></el-option>
                  <el-option :label="$t('m.saveModeReplace')" value="replace"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.aiInfoProcessing')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.textExtractModel')}}</span></template>
                <el-select v-model="setting.ocrApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.textProcessModel')}}</span></template>
                <el-select v-model="setting.infoProcessApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.tagGenCategories')}}</span></template>
                <el-select v-model="setting.tagGenCategories" multiple collapse-tags clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="c in tagCategoryKeys" :key="c" :label="tagCategoryLabel(c)" :value="c" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.storyGenTypes')}}</span></template>
                <el-select v-model="setting.storyGenTypes" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.storySummaryOpt')" value="summary"></el-option>
                  <el-option :label="$t('m.storyFullOpt')" value="full"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.translateTargetLang')}}</span></template>
                <el-select v-model="setting.translateTargetLang" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.langZhCn')" value="zh-CN"></el-option>
                  <el-option :label="$t('m.langZhTw')" value="zh-TW"></el-option>
                  <el-option :label="$t('m.langEn')" value="en"></el-option>
                  <el-option :label="$t('m.langJa')" value="ja"></el-option>
                  <el-option :label="$t('m.langKo')" value="ko"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.translateSaveMode')}}</span></template>
                <el-select v-model="setting.translateSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveToMangaFolder')" value="folder"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.ocrSaveMode')}}</span></template>
                <el-select v-model="setting.ocrSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveToMangaFolder')" value="folder"></el-option>
                  <el-option :label="$t('m.saveNone')" value="none"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.aiProcessTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.imageApiTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.apiProfiles')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24" v-for="p in (setting.aiApiProfiles || [])" :key="p.id">
            <div class="setting-line api-profile-row">
              <el-input v-model="p.name" class="api-profile-name" :placeholder="$t('m.apiName')" @change="saveSetting" />
              <el-input v-model="p.baseUrl" class="api-profile-url" :placeholder="$t('m.apiBaseUrl')" @change="saveSetting" />
              <el-select
                v-model="p.model"
                class="api-profile-model"
                filterable
                allow-create
                default-first-option
                :placeholder="$t('m.apiModel')"
                @change="saveSetting"
              >
                <el-option v-for="mid in (p.models || [])" :key="mid" :label="mid" :value="mid" />
              </el-select>
              <el-input v-model="p.apiKey" class="api-profile-key" type="password" show-password :placeholder="$t('m.apiKey')" @change="saveSetting" />
              <el-button :loading="!!p._loading" @click="fetchApiModels(p)">{{$t('m.fetchModels')}}</el-button>
              <el-button :loading="!!p._testing" @click="testApiProfile(p)">{{$t('m.testApi')}}</el-button>
              <el-button text type="danger" @click="removeApiProfile(p.id)">{{$t('m.deleteApi')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-button type="primary" plain @click="addApiProfile">{{$t('m.addApi')}}</el-button>
            </div>
          </el-col>

          <!-- 本地模型:下载到本机后离线推理,不需要 API 服务 -->
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">本地模型</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">本地模型直接在本机运行,下载后离线可用。下载完成后,在<div style="display:inline;color:#409eff;margin:0 4px;">图片超分 → 使用的模型</div>里选择即可。</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">下载源</span></template>
                <el-input v-model="setting.localModelMirror" placeholder="留空用 GitHub 官方地址;国内可填镜像前缀,如 https://ghproxy.net/" @change="saveSetting" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">下载失败时:可在 设置 → 常用 → 代理 里填本机代理(会用于模型下载),或在上面填镜像前缀。当前代理:{{ setting.proxy || "未设置" }}</div>
          </el-col>
          <el-col :span="24" v-for="m in localModels" :key="m.id">
            <div class="setting-line api-profile-row local-model-row">
              <span class="local-model-name">{{ m.name }}</span>
              <el-tag :type="m.installed ? 'success' : 'info'" size="small">{{ m.installed ? '已安装 ' + m.installedSizeText : '未安装' }}</el-tag>
              <template v-if="m.downloading">
                <el-progress :percentage="m.percent || 0" :stroke-width="14" style="width: 180px;" />
                <span class="local-model-status">{{ m.message }}</span>
                <el-button text type="danger" @click="cancelLocalModel(m.id)">取消</el-button>
              </template>
              <template v-else>
                <span class="local-model-status">{{ m.desc }}</span>
                <span style="flex: 1;"></span>
                <el-button type="primary" plain @click="downloadLocalModel(m.id)">{{ m.installed ? '重新下载' : '下载' }}</el-button>
                <el-button text :disabled="!m.installed" @click="openLocalModelDir(m.id)">打开目录</el-button>
                <el-button text type="danger" :disabled="!m.installed" @click="deleteLocalModel(m.id)">删除</el-button>
              </template>
            </div>
            <!-- 该模型自己的参数(权重/倍数/降噪/分块/显卡等),schema 由后端 OPTION_SCHEMA 提供 -->
            <div v-if="m.installed && localModelMeta[m.id] && (localModelMeta[m.id].schema || []).length" class="local-model-options">
              <div class="local-model-option" v-for="f in localModelMeta[m.id].schema" :key="f.key">
                <span class="local-model-option-label">{{ f.label }}</span>
                <el-select
                  v-if="f.type === 'weights'"
                  class="local-model-option-control"
                  :model-value="localModelOptions(m.id)[f.key]"
                  @update:model-value="(val) => setLocalModelOption(m.id, f.key, val)"
                  filterable allow-create default-first-option>
                  <el-option v-for="w in (localModelMeta[m.id].weights || [])" :key="w" :label="w" :value="w" />
                </el-select>
                <el-select
                  v-else-if="f.type === 'select'"
                  class="local-model-option-control"
                  :model-value="localModelOptions(m.id)[f.key]"
                  @update:model-value="(val) => setLocalModelOption(m.id, f.key, val)">
                  <el-option v-for="o in f.options" :key="String(o)" :label="String(o)" :value="o" />
                </el-select>
                <el-input-number
                  v-else-if="f.type === 'number'"
                  class="local-model-option-control"
                  :model-value="localModelOptions(m.id)[f.key]"
                  :min="f.min" :max="f.max"
                  @update:model-value="(val) => setLocalModelOption(m.id, f.key, val)" />
                <el-switch
                  v-else-if="f.type === 'bool'"
                  :model-value="localModelOptions(m.id)[f.key]"
                  @update:model-value="(val) => setLocalModelOption(m.id, f.key, val)" />
                <span class="local-model-option-hint">{{ f.hint }}</span>
              </div>
            </div>
            <div v-if="m.installed && !(localModelMeta[m.id] && (localModelMeta[m.id].schema || []).length)" class="setting-line toolbar-tip">该模型没有额外参数</div>
            <div v-if="m.error" class="setting-line" style="color: #f56c6c;">{{ m.error }}</div>
            <div v-else-if="!m.available" class="setting-line" style="color: #e6a23c;">{{ m.unavailableReason }}</div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <!-- 账户(网页版/Docker,所有登录用户可见;管理员另有账户管理/IP 控制) -->
      <el-tab-pane v-if="isWebMode" :label="$t('m.accounts')" name="accounts">
        <el-row :gutter="8">
          <el-col :span="24">
            <!-- 未登录(网页版已启用鉴权但无会话):在设置内直接登录,避免整页空白 -->
            <template v-if="!isWebLoggedIn">
              <div class="setting-line toolbar-tip">{{$t('m.loginSub')}}</div>
              <div class="setting-line" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <el-input v-model="webLoginUsername" :placeholder="$t('m.loginUsername')" style="width: 200px;" @keyup.enter="doWebLogin" />
                <el-input v-model="webLoginPassword" type="password" show-password :placeholder="$t('m.loginPassword')" style="width: 200px;" @keyup.enter="doWebLogin" />
                <el-button type="primary" plain :loading="webLoginLoading" @click="doWebLogin">{{$t('m.loginButton')}}</el-button>
              </div>
              <div v-if="webLoginError" class="setting-line" style="color: #f56c6c;">{{webLoginError}}</div>
            </template>
            <template v-else>
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px;">
              <span>{{$t('m.loginUsername')}}: <b>{{authUsername}}</b></span>
              <el-tag :type="isAdmin ? 'danger' : 'info'" size="small">{{isAdmin ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
              <span style="flex: 1"></span>
              <el-button type="danger" plain size="small" @click="logout">{{$t('m.logout')}}</el-button>
            </div>
            <template v-if="isAdmin">
              <div class="setting-line toolbar-tip" style="margin-top: 14px;">{{$t('m.accountsTip')}}</div>
              <div class="account-list">
              <div class="account-row" v-for="user in accountList" :key="user.username">
                <span class="account-name">{{user.username}}</span>
                <el-tag :type="user.role === 'admin' ? 'danger' : 'info'" size="small">{{user.role === 'admin' ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text @click="resetAccountPassword(user.username)">{{$t('m.resetPassword')}}</el-button>
                  <el-button v-if="user.role !== 'admin'" size="small" text type="danger" @click="removeAccount(user.username)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 14px;">
              <el-input v-model="newAccountUsername" :placeholder="$t('m.loginUsername')" style="width: 200px; margin-right: 8px;" />
              <el-input v-model="newAccountPassword" type="password" show-password :placeholder="$t('m.loginPassword')" style="width: 200px; margin-right: 8px;" @keyup.enter="addAccount" />
              <el-select v-model="newAccountRole" style="width: 130px; margin-right: 8px;">
                <el-option :label="$t('m.viewerRole')" value="viewer"></el-option>
                <el-option :label="$t('m.adminRole')" value="admin"></el-option>
              </el-select>
              <el-button type="primary" plain @click="addAccount">{{$t('m.addAccount')}}</el-button>
            </div>
            <!-- IP 访问控制:白名单免登录 / 黑名单禁止连接 -->
            <div class="advanced-section-title" style="margin-top: 20px;">{{$t('m.ipAccessControl')}}</div>
            <div class="setting-line toolbar-tip">{{$t('m.ipWhitelistHint')}}</div>
            <div class="account-list">
              <div class="account-row" v-for="ip in ipWhitelist" :key="'w' + ip">
                <span class="account-name">{{ip}}</span>
                <el-tag type="success" size="small">{{$t('m.ipWhitelist')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text type="danger" @click="removeIpRule('whitelist', ip)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 8px;">
              <el-input v-model="ipWhitelistInput" :placeholder="$t('m.ipRulePlaceholder')" style="width: 280px; margin-right: 8px;" @keyup.enter="addIpRule('whitelist')" />
              <el-button plain @click="addIpRule('whitelist')">{{$t('m.addIpRule')}}</el-button>
            </div>
            <div class="setting-line toolbar-tip" style="margin-top: 14px;">{{$t('m.ipBlacklistHint')}}</div>
            <div class="account-list">
              <div class="account-row" v-for="ip in ipBlacklist" :key="'b' + ip">
                <span class="account-name">{{ip}}</span>
                <el-tag type="danger" size="small">{{$t('m.ipBlacklist')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text type="danger" @click="removeIpRule('blacklist', ip)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 8px;">
              <el-input v-model="ipBlacklistInput" :placeholder="$t('m.ipRulePlaceholder')" style="width: 280px; margin-right: 8px;" @keyup.enter="addIpRule('blacklist')" />
              <el-button plain @click="addIpRule('blacklist')">{{$t('m.addIpRule')}}</el-button>
            </div>
            <div class="setting-line" style="margin-top: 12px;">
              <el-button type="primary" plain @click="saveIpRules">{{$t('m.ipRulesSave')}}</el-button>
              <span class="setting-line toolbar-tip" style="display: inline-block; margin-left: 10px;">{{$t('m.ipRulesNote')}}</span>
            </div>
            </template>
            </template>
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.usageGuide')" name="usageGuide">
        <!-- 1. 快捷键 -->
        <div class="guide-section">
          <h3 class="guide-title">{{$t('m.accelerator')}}</h3>
          <el-descriptions
            :column="2" size="small" style="margin-top: 8px;"
            v-for="group in acceleratorInfo" :key="group.group"
            :title="$t(`ac.${group.group}`)"
          >
            <el-descriptions-item v-for="(value, key) in group.accelerators" :key="value" width="22em">
              <template #label><span style="display: inline-block; min-width: 10em;">{{ $t(`ac.${group.group}_${key}`) }}</span></template>
              <el-tag>{{ value }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
        <!-- 2. 使用说明 -->
        <div class="guide-section">
          <h3 class="guide-title">{{$t('m.usageGuide')}}</h3>
          <div class="guide-text">{{$t('c.guideContent')}}</div>
        </div>
        <!-- 3. 关于(放在最底部) -->
        <div class="guide-section guide-about-section">
          <h3 class="guide-title">{{$t('m.about')}}</h3>
          <el-descriptions :column="1">
            <el-descriptions-item :label="$t('m.appName')+':'">exhentai-manga-manager</el-descriptions-item>
            <el-descriptions-item :label="$t('m.appPage')+':'">
              <a href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager')">github(原作者)</a>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.updatedVersion')+':'">
              <a href="#" @click="openLink('https://github.com/universc/exhentai-manga-manager--docker-ds')">github.com/universc/exhentai-manga-manager--docker-ds</a>
            </el-descriptions-item>
          </el-descriptions>
          <!-- 更新日志 -->
          <el-divider />
          <div class="guide-section">
            <h3 class="guide-title">{{$t('m.changelog')}}</h3>
            <!-- 默认收缩,点击版本标题展开 -->
            <el-collapse class="changelog-collapse" :model-value="[]">
              <el-collapse-item
                v-for="log in changelog"
                :key="log.version"
                :name="log.version"
              >
                <template #title>
                  <span class="changelog-version">{{ log.version }}</span>
                  <span class="changelog-summary" v-if="log.summary">{{ log.summary }}</span>
                </template>
                <ul class="changelog-list">
                  <li v-for="(line, i) in log.items" :key="i">{{ line }}</li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>
          <img :src="appIcon" class="about-logo">
          <!-- 致谢:大肥鱼 / universc -->
          <el-divider />
          <div class="credits-section">
            <div class="credit-person">
              <img :src="dayuAvatar" class="credit-avatar" alt="大肥鱼" />
              <a href="https://www.deepseek.com/" target="_blank" rel="noopener noreferrer">大肥鱼</a>
            </div>
            <div class="credit-person">
              <img :src="universcAvatar" class="credit-avatar" alt="universc" />
              <a href="https://space.bilibili.com/315660852" target="_blank" rel="noopener noreferrer">universc</a>
            </div>
          </div>
          <div class="credit-note">{{$t('m.creditNote')}}</div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import dayuAvatar from '../assets/dayu.png'
import appIcon from '../assets/icon.png'
import universcAvatar from '../assets/universc.png'
import { ref, onMounted, h, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { MdRefresh, MdSync, MdShuffle, MdCodeDownload, MdBook, MdColorPalette, MdPhonePortrait, MdFunnel } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup, Maximize } from '@vicons/carbon'
import { Search32Filled, ArrowTrendingLines20Filled } from '@vicons/fluent'

import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import zhTw  from 'element-plus/dist/locale/zh-tw.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import { version } from '../../package.json'
import { gh_token } from '../../secret_key.json'
import { acceleratorInfo, defaultContextMenuOptions, mergeContextMenuOptions, applyCustomTheme, clearCustomTheme, applyFavicon, applyCoverStyle, applyAppName, customFontStyles, toolbarButtonDefinitions, defaultToolbarButtons, ensureToolbarButtons, TOOLBAR_NEW_ITEMS, TOOLBAR_ALWAYS_ITEMS, defaultUiSettings, parsePageSizes , catDisplayName, contextMenuDefinitions, resolveCatKey , markContextMenuItemDisabled } from '../utils.js'
import { attachInertiaScroll } from '../inertia-scroll.js'
import NameFormItem from './NameFormItem.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const appStore = useAppStore()
const { searchTypeList, setting, bookList, resolvedTranslation, localeFile, tagListRaw ,
} = storeToRefs(appStore)
const { printMessage } = appStore

const { t, locale } = useI18n()

// 网页版(Docker)标志:由 web-ipc.js 从 /api/info 读取
const isWebMode = computed(() => !!window.__WEB_MODE__)
// Windows 客户端远程桌面模式(数据来自 NAS,界面按桌面模式显示)
const isRemoteDesktop = computed(() => !!window.__REMOTE_DESKTOP__)
// 桌面风格界面:本地模式 或 远程桌面模式(设置界面与本地模式一致,仅无账户栏)
const showDesktopUI = computed(() => !isWebMode.value || isRemoteDesktop.value)

// 标题翻译相关
const translationBaseUrlPlaceholder = computed(() => {
  return setting.value.titleTranslationMode === 'ollama'
    ? 'http://192.168.1.10:11434'
    : setting.value.titleTranslationMode === 'openai'
      ? 'https://api.deepseek.com/v1'
      : ''
})
const translationModelPlaceholder = computed(() => {
  return setting.value.titleTranslationMode === 'ollama'
    ? 'qwen2.5:7b'
    : setting.value.titleTranslationMode === 'openai'
      ? 'deepseek-chat'
      : ''
})

// 翻译是否启用(off 时禁用模型选择)
const translationEnabled = computed(() => {
  return !!setting.value.titleTranslationMode && setting.value.titleTranslationMode !== 'off'
})

// ---------- 显示选项 ----------
// 卡片为"填充封面 + 文字浮层"布局;各隐藏开关互相独立,不再有
// "纯图片模式"式的一键联动(每个元素是否显示由各自的开关控制)

// ---------- 工具栏按钮自定义 ----------
const toolbarIconMap = {
  searchInput: Search32Filled,
  searchButton: Search32Filled,
  sortSelect: MdFunnel,
  uiMode: MdPhonePortrait,
  folderTree: TreeViewAlt,
  shuffle: MdShuffle,
  manualScan: MdRefresh,
  incrementalScan: MdSync,
  batchMetadata: MdCodeDownload,
  tagAnalysis: ArrowTrendingLines20Filled,
  manageCollection: CicsSystemGroup,
  manageTag: TagGroup,
  viewerSwitch: MdBook,
  themeSwitch: MdColorPalette,
  fullscreen: Maximize,
}
const toolbarButtonsShown = computed({
  get: () => {
    // ensureToolbarButtons:老配置里没有的新元素(搜索框/排序框等)默认算作已显示,
    // 与主界面工具栏的判断保持一致,否则设置里显示未勾选、界面上却还在
    return ensureToolbarButtons(setting.value.toolbarButtons, setting.value.toolbarButtonsHidden)
  },
  set: (val) => {
    setting.value.toolbarButtons = val
  }
})
const toolbarLabelKey = (id) => {
  return toolbarButtonDefinitions.find(b => b.id === id)?.labelKey || id
}
const toolbarButtonsAvailable = computed(() => {
  return toolbarButtonDefinitions.filter(b => !toolbarButtonsShown.value.includes(b.id))
})
// 新元素(搜索框/搜索按钮/排序框/界面模式框)在旧配置里不存在,单看 toolbarButtons 分不清
// 「老配置没这一项」和「用户主动关掉」,所以显式关掉时在 toolbarButtonsHidden 里记一笔(随设置保存)
const markToolbarItemHidden = (id, hidden) => {
  if (!TOOLBAR_NEW_ITEMS.includes(id)) return
  const list = Array.isArray(setting.value.toolbarButtonsHidden) ? setting.value.toolbarButtonsHidden : []
  setting.value.toolbarButtonsHidden = hidden
    ? Array.from(new Set([...list, id]))
    : list.filter(x => x !== id)
}
const addToolbarButton = (id) => {
  if (!id || toolbarButtonsShown.value.includes(id)) return
  toolbarButtonsShown.value = [...toolbarButtonsShown.value, id]
  markToolbarItemHidden(id, false)
  saveSetting()
}
const removeToolbarButton = (id) => {
  toolbarButtonsShown.value = toolbarButtonsShown.value.filter(b => b !== id)
  markToolbarItemHidden(id, true)
  saveSetting()
}
const saveToolbarButtons = () => {
  saveSetting()
}
// 工具栏按钮:一个列表包含全部(已显示在前),点击切换显示、长按拖动排序
// 列表顺序:拖过就按拖出来的完整顺序(隐藏项留在原地),没拖过就按定义顺序
const orderedToolbarItems = computed(() => {
  const saved = setting.value.toolbarButtonOrder
  const ids = Array.isArray(saved) && saved.length ? saved : toolbarButtonDefinitions.map(b => b.id)
  const map = new Map(toolbarButtonDefinitions.map(b => [b.id, b]))
  const out = ids.map(id => map.get(id)).filter(Boolean)
  for (const b of toolbarButtonDefinitions) if (!ids.includes(b.id)) out.push(b)
  return out
})
const onToolbarReorder = (list) => {
  const ids = list.map(b => b.id)
  setting.value.toolbarButtonOrder = ids
  // 主界面工具栏的排列只取「已显示」的那些,顺序沿用完整顺序
  const shownSet = new Set(toolbarButtonsShown.value)
  toolbarButtonsShown.value = ids.filter(id => shownSet.has(id))
  saveSetting()
}
// 常驻元素(设置按钮)只能排在某个位置,不能关掉
const isToolbarItemShown = (id) => TOOLBAR_ALWAYS_ITEMS.includes(id) || toolbarButtonsShown.value.includes(id)
const toggleToolbarItem = (id, enable) => {
  if (TOOLBAR_ALWAYS_ITEMS.includes(id)) return
  if (enable) addToolbarButton(id)
  else removeToolbarButton(id)
}

// 每页条数:追加逗号,方便输入
const appendPageSizeComma = () => {
  const current = String(setting.value.customPageSizes || '')
  if (current && !current.endsWith(',') && !current.endsWith('，')) {
    setting.value.customPageSizes = current + ','
  }
  saveSetting()
}

// 每页数量选项变化:若当前每页数量不在列表中,就近切换到列表内的值,避免整页空白
const handlePageSizesChange = () => {
  const sizes = parsePageSizes(setting.value.customPageSizes)
  const current = Number(setting.value.pageSize)
  if (sizes.length && !sizes.includes(current)) {
    setting.value.pageSize = sizes.reduce((best, s) => Math.abs(s - current) < Math.abs(best - current) ? s : best, sizes[0])
  }
  saveSetting()
}

// ---------- 应用名称 ----------
const handleAppNameChange = () => {
  applyAppName(setting.value)
  saveSetting()
}

// ---------- 自定义主题 / 图标 ----------
// 输入框被清空(没填数字)时回填默认值,不让设置项变成空的
const fillNumberDefault = (key, def, min, max) => {
  const v = Number(setting.value[key])
  if (!Number.isFinite(v) || String(setting.value[key]).trim() === '') {
    setting.value[key] = def
    return
  }
  if (v < min || v > max) setting.value[key] = Math.min(max, Math.max(min, v))
}
const handleCustomThemeChange = () => {
  fillNumberDefault('themeCustomFontSize', 14, 1, 999)
  fillNumberDefault('themeCustomFontWeight', '', 100, 900)
  if (setting.value.themeCustomFontWeight === '' || setting.value.themeCustomFontWeight === null) setting.value.themeCustomFontWeight = ''
  if (setting.value.theme === 'custom') {
    applyCustomTheme(setting.value)
  }
  saveSetting()
}
// 封面尺寸 / 间距(清空即回到默认:宽 220、高 360、间距 6)
const handleCoverStyleChange = () => {
  fillNumberDefault('coverWidth', 220, 80, 800)
  fillNumberDefault('coverHeight', 360, 100, 1200)
  fillNumberDefault('cardGapV', 6, 0, 40)
  fillNumberDefault('cardGapH', 6, 0, 40)
  applyCoverStyle(setting.value)
  saveSetting()
}
// 界面缩放:和 Ctrl + 鼠标滚轮是同一套(Electron 的 zoom level,每级 ×1.2)
//   百分比 = 1.2^level,反解 level = log(百分比 / 100) / log(1.2)
const ZOOM_STEP = 1.2
const zoomPercentOf = (level) => Math.round(Math.pow(ZOOM_STEP, Number(level) || 0) * 100)
const readZoomPercent = () => {
  try { return zoomPercentOf(electronFunction['get-zoom-level']()) } catch (e) { return 100 }
}
const zoomPercentRef = ref(readZoomPercent())
const uiZoomPercent = computed({
  get: () => zoomPercentRef.value,
  set: (val) => {
    // 清空输入框 → 回到 100%
    const raw = String(val == null ? '' : val).trim()
    let p = raw === '' ? 100 : Number(raw)
    if (!Number.isFinite(p) || p < 20 || p > 800) return
    // setZoomLevel 支持小数,直接用对数换算,百分比才能精确还原
    try { electronFunction['set-zoom-level'](Math.log(p / 100) / Math.log(ZOOM_STEP)) } catch (e) {}
    zoomPercentRef.value = p
  }
})
// 清空主题颜色
const clearThemeColor = (kind) => {
  if (kind === 'bg') setting.value.themeCustomBg = ''
  if (kind === 'font') setting.value.themeCustomFontColor = ''
  if (kind === 'card') setting.value.themeCustomCardBg = ''
  if (kind === 'button') setting.value.themeCustomButtonBg = ''
  handleCustomThemeChange()
}
// 字体粗细(经典字重档位)
// 字体粗细:直接给数字档位(100–900),'' = 默认不设置
const fontWeightOptions = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map(v => ({ value: v, label: v }))
const resetThemeColor = (kind) => {
  if (kind === 'primary') setting.value.themeCustomPrimary = '#409EFF'
  handleCustomThemeChange()
}
const handleCustomIconChange = () => {
  applyFavicon(setting.value)
  saveSetting()
}
const selectCustomImage = async (kind) => {
  const path = await ipcRenderer.invoke('select-file', kind === 'bg' ? t('m.themeCustomBgImage') : t('m.customIcon'))
  if (!path) return
  const imported = await ipcRenderer.invoke('import-custom-asset', path)
  if (imported?.ok) {
    if (kind === 'bg') {
      setting.value.themeCustomBgImage = imported.path
      handleCustomThemeChange()
    } else {
      setting.value.customIconPath = imported.path
      handleCustomIconChange()
    }
  } else {
    printMessage('error', imported?.error || t('c.importCustomAssetFailed'))
  }
}
const clearCustomImage = (kind) => {
  if (kind === 'bg') {
    setting.value.themeCustomBgImage = ''
    handleCustomThemeChange()
  } else {
    setting.value.customIconPath = ''
    handleCustomIconChange()
  }
}

// 可用模型列表(打开下拉时自动从 AI 服务拉取)
const translationModelOptions = ref([])
const modelsLoading = ref(false)
const testingTranslation = ref(false)
const translatingAll = ref(false)

const loadTranslationModels = async () => {
  if (!translationEnabled.value) return
  modelsLoading.value = true
  try {
    const res = await ipcRenderer.invoke('list-title-translation-models', _.cloneDeep(setting.value))
    if (res?.ok) {
      translationModelOptions.value = res.models || []
    } else {
      printMessage('warning', res?.error || t('c.modelsLoadFailed'))
    }
  } catch (e) {
    printMessage('warning', t('c.modelsLoadFailed') + ':' + (e?.message || ''))
  } finally {
    modelsLoading.value = false
  }
}

// 下拉打开时自动弹出可用模型列表
const handleModelsVisibleChange = (visible) => {
  if (visible) loadTranslationModels()
}

// ---------- AI API 配置(可命名保存多套,各功能下拉选用) ----------
const normApiBase = (u) => {
  let v = String(u || '').trim().replace(/\/+$/, '')
  if (!v) return ''
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v
  return v
}
const apiHeaders = (p) => (p.apiKey ? { Authorization: 'Bearer ' + p.apiKey } : {})
const withTimeout = (ms) => {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  return { signal: c.signal, done: () => clearTimeout(id) }
}
const addApiProfile = () => {
  if (!Array.isArray(setting.value.aiApiProfiles)) setting.value.aiApiProfiles = []
  setting.value.aiApiProfiles.push({
    id: 'api_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: 'API ' + (setting.value.aiApiProfiles.length + 1),
    baseUrl: '', model: '', apiKey: '', models: [],
  })
  saveSetting()
}
const removeApiProfile = (id) => {
  setting.value.aiApiProfiles = (setting.value.aiApiProfiles || []).filter(p => p.id !== id)
  for (const k of ['infoApiProfileId', 'infoProcessApiProfileId', 'upscaleApiProfileId', 'colorizeApiProfileId', 'ocrApiProfileId']) {
    if (setting.value[k] === id) setting.value[k] = ''
  }
  saveSetting()
}

// ---------- 本地模型(Real-ESRGAN / waifu2x) ----------
// 下载/删除都由主进程做真实文件操作;进度通过 'local-model-progress' 事件推送
// (桌面版走 webContents.send,网页版走 SSE,前端统一用 ipcRenderer.on 接收)
const localModels = ref([])
let localModelListenerBound = false

const normalizeLocalModels = (list) => (list || []).map(m => Object.assign({}, m, {
  percent: 0, message: '', error: '', downloading: !!m.downloading,
}))

// 每个模型自己的参数(schema + 已安装的可用权重),由主进程 local-model-weights 提供
const localModelMeta = ref({})
const localModelOptions = (id) => {
  if (!setting.value.localUpscaleOptions) setting.value.localUpscaleOptions = {}
  if (!setting.value.localUpscaleOptions[id]) setting.value.localUpscaleOptions[id] = {}
  return setting.value.localUpscaleOptions[id]
}
const setLocalModelOption = (id, key, val) => {
  localModelOptions(id)[key] = val
  saveSetting()
}
const loadLocalModelMeta = async () => {
  const meta = {}
  for (const m of localModels.value) {
    if (!m.installed) continue
    try {
      const r = await ipcRenderer.invoke('local-model-weights', m.id)
      if (r && r.ok) {
        meta[m.id] = { weights: r.weights || [], schema: r.schema || [] }
        // 补齐缺失项(旧配置升级后新增的参数)
        const opts = localModelOptions(m.id)
        for (const f of (r.schema || [])) {
          if (opts[f.key] === undefined) opts[f.key] = (r.options && r.options[f.key] !== undefined) ? r.options[f.key] : f.default
        }
      }
    } catch (e) { /* 忽略:旧服务端没有该通道 */ }
  }
  localModelMeta.value = meta
}

const loadLocalModels = async () => {
  try {
    const res = await ipcRenderer.invoke('local-model-list')
    if (res && res.ok) {
      localModels.value = normalizeLocalModels(res.models)
      loadLocalModelMeta()
    }
  } catch (e) {
    // 旧版服务端没有该通道:静默忽略,不影响设置页其它功能
  }
}

const bindLocalModelProgress = () => {
  if (localModelListenerBound) return
  localModelListenerBound = true
  ipcRenderer.on('local-model-progress', (event, payload) => {
    if (!payload || !payload.id) return
    const m = localModels.value.find(x => x.id === payload.id)
    if (!m) return
    if (payload.phase === 'start') {
      m.downloading = true; m.percent = 0; m.message = '准备下载…'; m.error = ''
    } else if (payload.phase === 'download' || payload.phase === 'extract') {
      m.downloading = true
      m.percent = payload.percent || 0
      m.message = payload.message || ''
    } else if (payload.phase === 'installed' || payload.phase === 'cancelled') {
      m.downloading = false; m.percent = 0; m.message = ''
      loadLocalModels()
    } else if (payload.phase === 'error') {
      m.downloading = false; m.percent = 0; m.message = ''
      m.error = payload.error || payload.message || '下载失败'
    }
  })
}

const downloadLocalModel = async (id) => {
  const m = localModels.value.find(x => x.id === id)
  if (m) { m.error = ''; m.message = '准备下载…' }
  try {
    const res = await ipcRenderer.invoke('local-model-download', id)
    if (!res || !res.ok) {
      if (m) m.message = ''
      printMessage('error', (res && res.error) || '下载启动失败')
    }
  } catch (e) {
    if (m) m.message = ''
    printMessage('error', String((e && e.message) || e))
  }
}

const cancelLocalModel = async (id) => {
  try { await ipcRenderer.invoke('local-model-cancel', id) } catch (e) { /* 忽略 */ }
}

const deleteLocalModel = async (id) => {
  const m = localModels.value.find(x => x.id === id)
  const name = m ? m.name : id
  try {
    await ElMessageBox.confirm('确定删除本地模型「' + name + '」?已下载的文件会被移除,之后可以重新下载。', '删除模型', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch (e) { return }
  try {
    const res = await ipcRenderer.invoke('local-model-delete', id)
    if (res && res.ok) {
      printMessage('success', '已删除 ' + name)
      loadLocalModels()
    } else {
      printMessage('error', (res && res.error) || '删除失败')
    }
  } catch (e) {
    printMessage('error', String((e && e.message) || e))
  }
}

const openLocalModelDir = async (id) => {
  try { await ipcRenderer.invoke('local-model-open-dir', id) } catch (e) { /* 忽略 */ }
}

// 超分引擎选择:一个下拉同时承载「本地模型」与「API 服务」,内部用前缀区分,
// 分别落到 localUpscaleEngine / upscaleApiProfileId 两个键(保持数据结构不变,兼容旧配置)
const upscaleEngine = computed({
  get () {
    const local = setting.value.localUpscaleEngine
    if (local) return 'local:' + local
    const api = setting.value.upscaleApiProfileId
    if (api) return 'api:' + api
    return ''
  },
  set (val) {
    if (!val) {
      setting.value.localUpscaleEngine = ''
      setting.value.upscaleApiProfileId = ''
    } else if (val.startsWith('local:')) {
      setting.value.localUpscaleEngine = val.slice(6)
      setting.value.upscaleApiProfileId = ''
    } else if (val.startsWith('api:')) {
      setting.value.upscaleApiProfileId = val.slice(4)
      setting.value.localUpscaleEngine = ''
    }
    saveSetting()
  },
})
// 自动超分用的模型:空 = 跟随「图片超分」设置
const autoUpscaleEngine = computed({
  get: () => setting.value.autoUpscaleEngine || '',
  set: (val) => {
    setting.value.autoUpscaleEngine = val || ''
    saveSetting()
  },
})

// ---------- 阅读时设置栏显示哪些按钮(可勾选 + 拖动排序) ----------
// 阅读时设置栏里可配置的按钮:「退出」固定常驻右上角,不在这里
const VIEWER_TOOLBAR_ITEMS = [
  { id: 'scroll', labelKey: 'm.viewerBtnScroll' },
  { id: 'singleDouble', labelKey: 'm.viewerBtnSingleDouble' },
  { id: 'direction', labelKey: 'm.viewerBtnDirection' },
  { id: 'fit', labelKey: 'm.viewerBtnFit' },
  { id: 'zoom', labelKey: 'm.viewerBtnZoom' },
  { id: 'thumbnail', labelKey: 'm.thumbnail' },
  { id: 'sidebar', labelKey: 'm.showSidebar' },
  { id: 'pin', labelKey: 'm.pinToolbar' },
]
// 旧配置里没有这些核心按钮时补上(否则升级后它们会从设置栏消失)
const VIEWER_TOOLBAR_CORE = ['scroll', 'singleDouble', 'direction', 'fit', 'zoom']
// 旧配置里的 zoomIn / zoomOut 归一成 zoom
const normalizeViewerToolbarId = (id) => (id === 'zoomIn' || id === 'zoomOut' ? 'zoom' : id)
// 空数组 = 全部显示(与阅读器里的判断保持一致)
const viewerToolbarIds = () => {
  const list = setting.value.viewerToolbarButtons
  // 旧配置里的 zoomIn / zoomOut 归一成 zoom,否则取消勾选「缩放」不生效
  const base = Array.isArray(list) && list.length
    ? list.map(normalizeViewerToolbarId)
    : VIEWER_TOOLBAR_ITEMS.map(i => i.id)
  return [...new Set(base)]
}
const isViewerToolbarChecked = (id) => viewerToolbarIds().includes(id)
// 同上:隐藏的按钮留在原地,不会跑到末尾
const orderedViewerToolbarItems = computed(() => {
  const saved = setting.value.viewerToolbarOrder
  const ids = Array.isArray(saved) && saved.length ? saved : VIEWER_TOOLBAR_ITEMS.map(i => i.id)
  const map = new Map(VIEWER_TOOLBAR_ITEMS.map(i => [i.id, i]))
  const out = ids.map(id => map.get(id)).filter(Boolean)
  for (const item of VIEWER_TOOLBAR_ITEMS) if (!ids.includes(item.id)) out.push(item)
  return out
})
const onViewerToolbarReorder = (list) => {
  const ids = list.map(i => i.id).map(normalizeViewerToolbarId)
  setting.value.viewerToolbarOrder = ids
  // 阅读时显示哪些按钮 = 已勾选项(按完整顺序排列)
  const checkedSet = new Set(viewerToolbarIds())
  setting.value.viewerToolbarButtons = ids.filter(id => checkedSet.has(id))
  saveSetting()
}
const toggleViewerToolbar = (id, enable) => {
  let ids = [...viewerToolbarIds()]
  if (enable) { if (!ids.includes(id)) ids.push(id) } else { ids = ids.filter(x => x !== id) }
  setting.value.viewerToolbarButtons = ids
  // 同时写一份完整顺序:既能记住位置,也让「一个都不勾」与「从未配置」区分开
  if (!Array.isArray(setting.value.viewerToolbarOrder) || !setting.value.viewerToolbarOrder.length) {
    setting.value.viewerToolbarOrder = VIEWER_TOOLBAR_ITEMS.map(i => i.id)
  }
  saveSetting()
}

const fetchApiModels = async (p) => {
  const base = normApiBase(p.baseUrl)
  if (!base) return printMessage('warning', t('m.apiNeedUrl'))
  p._loading = true
  const tm = withTimeout(12000)
  try {
    const res = await fetch(base + '/models', { headers: apiHeaders(p), signal: tm.signal })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    const list = (json.data || json.models || []).map(x => (typeof x === 'string' ? x : (x.id || x.name))).filter(Boolean)
    if (!list.length) throw new Error('empty list')
    p.models = list
    if (!p.model) p.model = list[0]
    saveSetting()
    printMessage('success', t('m.apiModelsOk').replace('{n}', list.length))
  } catch (e) {
    printMessage('error', t('m.apiModelsFail') + ': ' + (e && e.message ? e.message : e))
  } finally {
    tm.done(); p._loading = false
  }
}
const testApiProfile = async (p) => {
  const base = normApiBase(p.baseUrl)
  if (!base) return printMessage('warning', t('m.apiNeedUrl'))
  p._testing = true
  const t0 = Date.now()
  let ok = false, detail = ''
  try {
    const tm = withTimeout(15000)
    try {
      const res = await fetch(base + '/models', { headers: apiHeaders(p), signal: tm.signal })
      ok = res.ok; detail = 'GET /models -> HTTP ' + res.status
    } catch (e) { detail = String(e && e.message ? e.message : e) } finally { tm.done() }
    if (!ok) {
      const tm2 = withTimeout(20000)
      try {
        const res2 = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiHeaders(p) },
          body: JSON.stringify({ model: p.model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
          signal: tm2.signal,
        })
        ok = res2.ok; detail = 'POST /chat/completions -> HTTP ' + res2.status
      } catch (e) { detail = String(e && e.message ? e.message : e) } finally { tm2.done() }
    }
    const ms = Date.now() - t0
    if (ok) printMessage('success', t('m.apiTestOk').replace('{ms}', ms) + ' (' + detail + ')')
    else printMessage('error', t('m.apiTestFail') + ' (' + detail + ')')
  } finally {
    p._testing = false
  }
}

const handleTranslationModeChange = (mode) => {
  // 本地/在线分别填充默认地址与模型
  if (mode === 'ollama') {
    if (!setting.value.ollamaBaseUrl) setting.value.ollamaBaseUrl = 'http://127.0.0.1:11434'
    if (!setting.value.ollamaModel) setting.value.ollamaModel = 'qwen2.5:7b'
  } else if (mode === 'openai') {
    if (!setting.value.openaiBaseUrl) setting.value.openaiBaseUrl = 'https://api.deepseek.com/v1'
    if (!setting.value.openaiModel) setting.value.openaiModel = 'deepseek-chat'
  }
  saveSetting()
  // 切换模式后自动拉取一次模型列表
  loadTranslationModels()
}

const testTitleTranslation = async () => {
  if (testingTranslation.value) return
  if (setting.value.titleTranslationMode === 'off' || !setting.value.titleTranslationMode) {
    printMessage('warning', t('c.titleTranslationNotEnabled'))
    return
  }
  testingTranslation.value = true
  try {
    const res = await ipcRenderer.invoke('test-title-translation', _.cloneDeep(setting.value))
    if (res?.ok) {
      printMessage('success', t('c.titleTranslationTestOk') + (res.result ? `:「${res.result}」` : ''))
    } else {
      printMessage('error', t('c.titleTranslationTestFailed') + (res?.error ? `:${res.error}` : ''))
    }
  } finally {
    testingTranslation.value = false
  }
}

const translateAllTitles = async (force = false) => {
  if (translatingAll.value) return
  translatingAll.value = true
  try {
    const res = await ipcRenderer.invoke('translate-book-titles-batch', force)
    if (res?.success > 0 || res?.total > 0) {
      emit('loadBookList')
      printMessage('success', t('c.titleTranslationBatchDone', { total: res.total, success: res.success, failed: res.failed }))
    } else if (res?.error) {
      printMessage('warning', res.error)
    } else if (res && res.total === 0) {
      printMessage('info', t('c.titleTranslationNoNeed'))
    }
  } finally {
    translatingAll.value = false
  }
}

// ---------- AI 角色出处查询 ----------
const characterNamesInput = ref('')
const queryingOrigins = ref(false)
const queryCharacterOrigins = async () => {
  if (queryingOrigins.value) return
  const names = characterNamesInput.value.trim()
  if (!names) {
    printMessage('warning', t('c.characterNamesEmpty'))
    return
  }
  queryingOrigins.value = true
  try {
    const res = await ipcRenderer.invoke('query-character-origins', names)
    if (res?.ok) {
      ElMessageBox.alert(
        h('pre', { style: 'white-space: pre-wrap; text-align: left; max-height: 50vh; overflow: auto; margin: 0' }, res.result || t('c.characterOriginEmpty')),
        t('m.queryCharacterOrigins'),
        { confirmButtonText: t('c.close'), showClose: true }
      )
    } else {
      printMessage('error', res?.error || t('c.characterOriginFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.characterOriginFailed') + ':' + (e?.message || ''))
  } finally {
    queryingOrigins.value = false
  }
}

// ---------- AI 综合信息处理(可暂停) ----------
const aiProcessing = ref(false)
const aiTaskPaused = ref(false)
const aiProcessBatch = async (force) => {
  if (aiProcessing.value) return
  if (force) {
    try {
      await ElMessageBox.confirm(t('c.aiProcessForceWarning'), t('m.aiProcessBatchForce'), { type: 'warning' })
    } catch {
      return
    }
  }
  aiProcessing.value = true
  aiTaskPaused.value = false
  try {
    const res = await ipcRenderer.invoke('ai-process-books-batch', force)
    if (res?.success > 0 || res?.total > 0) {
      emit('loadBookList')
      printMessage('success', t('c.aiProcessBatchDone', { total: res.total, success: res.success, failed: res.failed }))
    } else if (res?.error) {
      printMessage('warning', res.error)
    } else if (res && res.total === 0) {
      printMessage('info', t('c.titleTranslationNoNeed'))
    }
  } finally {
    aiProcessing.value = false
    aiTaskPaused.value = false
    ipcRenderer.invoke('set-ai-task-paused', false)
  }
}
const toggleAiPause = async () => {
  aiTaskPaused.value = !aiTaskPaused.value
  await ipcRenderer.invoke('set-ai-task-paused', aiTaskPaused.value)
}

// ---------- 恢复全部默认 ----------
// 图片超分:删除漫画库中所有 .bak 备份(超分「替换原文件」时留下的旧文件)
const deleteAllBakFiles = async () => {
  try {
    await ElMessageBox.confirm(t('c.deleteBakConfirm'), t('m.deleteAllBak'), { type: 'warning' })
  } catch (e) {
    return
  }
  try {
    const res = await ipcRenderer.invoke('delete-all-bak-files')
    if (res && res.ok) {
      if (res.count) printMessage('success', t('c.deleteBakDone', { n: res.count }))
      else printMessage('info', t('c.deleteBakNone'))
    } else {
      printMessage('error', (res && res.error) || t('c.deleteBakNone'))
    }
  } catch (e) {
    printMessage('error', String((e && e.message) || e))
  }
}

const resetAllSettings = async () => {
  try {
    await ElMessageBox.confirm(t('c.resetAllWarning'), t('m.resetAll'), {
      type: 'warning',
      confirmButtonText: t('c.resetAllConfirm'),
      cancelButtonText: t('c.cancel'),
    })
  } catch {
    return
  }
  // 保留个人数据(账户 Cookie / 库路径 / 元数据目录 / 代理等)
  const keep = {}
  for (const key of ['library', 'metadataPath', 'imageExplorer', 'igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'proxy']) {
    if (setting.value[key] !== undefined) keep[key] = setting.value[key]
  }
  const defaults = defaultUiSettings()
  Object.assign(setting.value, defaults, keep)
  saveSetting()
  printMessage('success', t('c.resetAllDone'))
  setTimeout(() => window.location.reload(), 800)
}

const reTranslateAllTitles = () => {
  ElMessageBox.confirm(
    t('c.reTranslateAllTitlesWarning'),
    t('m.reTranslateAllTitles'),
    {}
  )
  .then(() => translateAllTitles(true))
  .catch(() => {})
}

// ---------- 右键菜单自定义 ----------
const contextMenuGroups = computed(() => [
  {
    id: 'title',
    title: t('cm.title'),
    items: [
      { id: 'copyTitle', label: t('c.copyTitleToClipboard') },
      { id: 'copyLink', label: t('c.copyLinkToClipboard') },
      { id: 'copyTitleAndLink', label: t('c.copyTitleAndLinkToClipboard') },
      { id: 'translateTitle', label: t('m.translateTitle') },
    ]
  },
  {
    id: 'cover',
    title: t('cm.cover'),
    items: [
      { id: 'getMetadata', label: t('m.getMetadata') },
      { id: 'resetMetadata', label: t('m.resetMetadata') },
      { id: 'openFileLocation', label: t('m.openMangaFileLocation') },
      { id: 'moveFile', label: t('m.moveFile') },
      { id: 'deleteFile', label: t('m.deleteFile') },
      { id: 'toggleHidden', label: `${t('m.hideManga')}/${t('m.showManga')}` },
      { id: 'copyTag', label: t('m.copyTagClipboard') },
      { id: 'pasteTag', label: t('m.pasteTagClipboard') },
      { id: 'getMetadataFromLink', label: t('m.getMetadataFromClipboardLink') },
      { id: 'translateBook', label: t('m.translateBook') },
      { id: 'upscaleBook', label: t('m.upscaleBook') },
      { id: 'restoreBookBak', label: t('c.restoreBookBak') },
      { id: 'deleteBookBak', label: t('c.deleteBookBak') },
      { id: 'colorizeBook', label: t('m.colorizeBook') },
    ]
  },
  {
    id: 'image',
    title: t('cm.image'),
    items: [
      { id: 'copyImage', label: t('c.copyImageToClipboard') },
      { id: 'setCover', label: t('c.designateAsCover') },
      { id: 'deleteImage', label: t('c.deleteImage') },
      { id: 'renameImage', label: t('m.renameImage') },
      { id: 'upscaleImage', label: t('m.upscaleImage') },
      { id: 'restoreImageBak', label: t('c.restoreImageBak') },
      { id: 'ocrImage', label: t('m.extractImageText') },
      { id: 'translateImage', label: t('m.translateImage') },
      { id: 'colorizeImage', label: t('m.colorize') },
      { id: 'imageProperties', label: t('m.imageProperties') },
    ]
  },
  {
    id: 'comment',
    title: t('cm.comment'),
    items: [
      { id: 'openLink', label: t('c.redirect') },
    ]
  },
])

const updateContextMenuOptions = (menuId, val) => {
  if (!setting.value.contextMenuOptions) setting.value.contextMenuOptions = defaultContextMenuOptions()
  setting.value.contextMenuOptions[menuId] = val
  saveSetting()
}

// ---------- 右键菜单:拖动排序 / 取消 / 加回 ----------
// contextMenuOptions[menuId] 同时承载「显示了哪些项」与「顺序」;
// 设置页只列出该组已勾选的项(可拖动),未勾选的项以标签形式放在下面,点一下就加回来。
const menuItemIds = (group) => {
  const saved = setting.value.contextMenuOptions?.[group.id]
  return Array.isArray(saved) ? saved : group.items.map(i => i.id)
}
const isMenuChecked = (group, itemId) => menuItemIds(group).includes(itemId)
// 列表顺序 = 用户拖出来的完整顺序(隐藏的项留在原地,不会被挤到后面)
const orderedMenuItems = (group) => {
  const saved = setting.value.contextMenuOrder?.[group.id]
  // 还没拖动过 → 用定义顺序:所有项(含隐藏的)都保持在原位
  if (!Array.isArray(saved) || !saved.length) return group.items
  const map = new Map(group.items.map(i => [i.id, i]))
  const ordered = saved.map(id => map.get(id)).filter(Boolean)
  for (const item of group.items) if (!saved.includes(item.id)) ordered.push(item)
  return ordered
}
const onMenuReorder = (groupId, list) => {
  if (!setting.value.contextMenuOrder) setting.value.contextMenuOrder = {}
  setting.value.contextMenuOrder[groupId] = list.map(i => i.id)
  saveSetting()
}
const toggleMenuItem = (groupId, itemId, enable) => {
  const group = contextMenuGroups.value.find(g => g.id === groupId)
  if (!group) return
  let ids = [...menuItemIds(group)]
  if (enable) {
    if (!ids.includes(itemId)) ids.push(itemId)
  } else {
    ids = ids.filter(id => id !== itemId)
  }
  if (!setting.value.contextMenuOptions) setting.value.contextMenuOptions = defaultContextMenuOptions()
  setting.value.contextMenuOptions[groupId] = ids
  // 本版新增项:记住用户是否显式取消过(取消后不再默认恢复显示)
  markContextMenuItemDisabled(itemId, !enable)
  saveSetting()
}

const resetContextMenuOptions = () => {
  setting.value.contextMenuOptions = defaultContextMenuOptions()
  saveSetting()
  printMessage('success', t('c.contextMenuResetDone'))
}

const emit = defineEmits([
  'loadBookList',
  'loadCollectionList',
])

onMounted(() => {
  // 打开设置时刷新回收站列表
  loadTrashList()
  ipcRenderer.invoke('load-setting')
    .then(async (res) => {
      setting.value = res
      // 网页版:管理员打开设置时加载账户列表与 IP 规则
      loadAccountList()
      loadIpRules()
      // 本地模型:加载模型清单,并监听下载进度(桌面版/网页版同一条事件通道)
      bindLocalModelProgress()
      loadLocalModels()
      // 桌面版:同步运行模式(本地/网页)与数据目录显示
      syncRunMode()
      loadDataPath()

      // set default value
      if (res.autoCheckUpdates === undefined) setting.value.autoCheckUpdates = true
      if (res.trimTitleRegExp === undefined) setting.value.trimTitleRegExp = '^\\d+[-]?\\s*|\\s*(\\[[^\\]]*\\]|\\([^\\)]*\\)|【[^】]*】|（[^）]*）)\\s*'
      if (res.defaultScraper === undefined) setting.value.defaultScraper = 'exhentai'
      if (res.defaultInsertEmptyPage === undefined) setting.value.defaultInsertEmptyPage = true
      if (res.viewerType === undefined) setting.value.viewerType = 'original'
      // 阅读器浮层设置栏 / 阅读结束行为 / 自动超分(旧配置没有这些键)
      if (res.viewerToolbarHover === undefined) setting.value.viewerToolbarHover = true
      if (res.viewerToolbarClick === undefined) setting.value.viewerToolbarClick = true
      if (res.viewerEndAction === undefined) setting.value.viewerEndAction = 'none'
      if (res.autoUpscale === undefined) setting.value.autoUpscale = false
      if (res.autoUpscaleRatio === undefined) setting.value.autoUpscaleRatio = 1.05
      if (res.autoUpscaleEngine === undefined) setting.value.autoUpscaleEngine = ''
      if (res.autoUpscaleSaveMode === undefined) setting.value.autoUpscaleSaveMode = 'preview'
      if (res.readingDirection === undefined) setting.value.readingDirection = 'vertical'
      if (res.scrollDoubleMode === undefined) setting.value.scrollDoubleMode = false
      if (!Array.isArray(res.viewerToolbarButtons)) setting.value.viewerToolbarButtons = []
      if (!Array.isArray(res.viewerToolbarOrder)) setting.value.viewerToolbarOrder = []
      // 「退出」按钮已固定常驻:从旧配置里去掉;核心按钮缺失时补上(升级不丢按钮)
      if (Array.isArray(setting.value.viewerToolbarButtons) && setting.value.viewerToolbarButtons.length) {
        const list = [...new Set(setting.value.viewerToolbarButtons.map(normalizeViewerToolbarId).filter(id => id !== 'exit'))]
        for (const id of VIEWER_TOOLBAR_CORE) if (!list.includes(id)) list.push(id)
        setting.value.viewerToolbarButtons = list
      }
      if (Array.isArray(setting.value.viewerToolbarOrder) && setting.value.viewerToolbarOrder.length) {
        const list = [...new Set(setting.value.viewerToolbarOrder.map(normalizeViewerToolbarId).filter(id => id !== 'exit'))]
        for (const id of VIEWER_TOOLBAR_CORE) if (!list.includes(id)) list.push(id)
        setting.value.viewerToolbarOrder = list
      }
      if (res.showNextMangaButtons === undefined) setting.value.showNextMangaButtons = true
      if (res.viewerImageGap === undefined) setting.value.viewerImageGap = 0
      if (res.viewerThumbnailGap === undefined) setting.value.viewerThumbnailGap = 0
      if (res.viewerButtonTips === undefined) setting.value.viewerButtonTips = true
      if (!Array.isArray(res.toolbarButtonOrder)) setting.value.toolbarButtonOrder = []
      if (res.viewerEndTip === undefined) setting.value.viewerEndTip = true
      if (res.showFullscreenButton === undefined) setting.value.showFullscreenButton = true
      // 「自动跳转到下一本」已并入「阅读完成后」:老配置里开着的话迁移成打开下一本
      if (res.viewerEndAction === undefined && res.autoNextManga === true) setting.value.viewerEndAction = 'next'
      // 标题翻译设置默认值(旧版 setting.json 没有这些键)
      if (res.titleTranslationMode === undefined) setting.value.titleTranslationMode = 'off'
      if (res.titleTranslationBaseUrl === undefined) setting.value.titleTranslationBaseUrl = ''
      if (res.titleTranslationModel === undefined) setting.value.titleTranslationModel = ''
      if (res.titleTranslationApiKey === undefined) setting.value.titleTranslationApiKey = ''
      // AI 配置:本地/在线分开填写(旧版共用字段自动迁移)
      if (res.ollamaBaseUrl === undefined) setting.value.ollamaBaseUrl = res.titleTranslationBaseUrl || 'http://127.0.0.1:11434'
      if (res.ollamaModel === undefined) setting.value.ollamaModel = res.titleTranslationModel || 'qwen2.5:7b'
      if (res.openaiBaseUrl === undefined) setting.value.openaiBaseUrl = res.titleTranslationBaseUrl || 'https://api.deepseek.com/v1'
      if (res.openaiModel === undefined) setting.value.openaiModel = res.titleTranslationModel || 'deepseek-chat'
      if (res.openaiApiKey === undefined) setting.value.openaiApiKey = res.titleTranslationApiKey || ''
      // 应用名称默认值
      if (res.appName === undefined) setting.value.appName = 'EX漫画管理器(exhentai-manga-manager)'
      // 右键菜单设置:旧配置没有这个键时用默认全量;
      // 已有配置只并入「本版本新增」的项,绝不把用户取消勾选的项加回来
      // (历史 bug:每次打开设置都会变回全选)
      if (res.contextMenuOptions === undefined) setting.value.contextMenuOptions = defaultContextMenuOptions()
      if (!res.contextMenuOrder || typeof res.contextMenuOrder !== 'object') setting.value.contextMenuOrder = {}
      {
        const mergedMenuOptions = mergeContextMenuOptions(setting.value.contextMenuOptions)
        setting.value.contextMenuOptions = mergedMenuOptions.options
        if (mergedMenuOptions.changed && !viewerRole.value) saveSetting()
      }
      // 卡片显示设置默认值
      if (res.hideBookmarkButton === undefined) setting.value.hideBookmarkButton = false
      if (res.hidePageCount === undefined) setting.value.hidePageCount = false
      if (res.hideReadCount === undefined) setting.value.hideReadCount = false
      if (res.hideReadButton === undefined) setting.value.hideReadButton = false
      if (res.hideNonTag === undefined) setting.value.hideNonTag = false
      if (res.hideTitle === undefined) setting.value.hideTitle = false
      if (res.hideRating === undefined) setting.value.hideRating = false
      if (res.coverWidth === undefined) setting.value.coverWidth = 220
      if (res.coverHeight === undefined) setting.value.coverHeight = 360
      // 卡片间距:旧版单值 cardGap → 拆分为 上下/左右 两个方向
      if (res.cardGapV === undefined) setting.value.cardGapV = res.cardGap !== undefined ? res.cardGap : 6
      if (res.cardGapH === undefined) setting.value.cardGapH = res.cardGap !== undefined ? res.cardGap : 6
      // 封面懒加载已是固定行为;旧"只显示封面(coverOnly)"改为独立开关「填充封面」:
      // - 曾开启 coverOnly 的用户:还原其联动隐藏项,并把新开关置为开(延续大图偏好)
      // - 其余用户:开关默认关(经典卡片布局)
      if (res.fillCover === undefined) setting.value.fillCover = !!res.coverOnly
      if (res.coverOnly) {
        for (const key of ['hideBookmarkButton', 'hidePageCount', 'hideReadCount', 'hideReadButton', 'hideNonTag', 'hideTitle', 'hideRating']) {
          setting.value[key] = false
        }
        setting.value.coverOnly = false
      }
      // 自定义主题/图标/工具栏/分页默认值
      if (res.themeCustomBg === undefined) setting.value.themeCustomBg = ''
      if (res.themeCustomBgImage === undefined) setting.value.themeCustomBgImage = ''
      if (res.themeCustomPrimary === undefined) setting.value.themeCustomPrimary = '#409EFF'
      if (res.themeCustomFontSize === undefined) setting.value.themeCustomFontSize = 14
      if (res.themeCustomFontColor === undefined) setting.value.themeCustomFontColor = ''
      if (res.themeCustomFontStyle === undefined) setting.value.themeCustomFontStyle = ''
      if (res.themeCustomFontBold === undefined) setting.value.themeCustomFontBold = false
      // 旧的「加粗」开关迁移成「粗细」下拉
      if (res.themeCustomFontWeight === undefined) setting.value.themeCustomFontWeight = res.themeCustomFontBold ? '700' : ''
      if (res.themeCustomCardBg === undefined) setting.value.themeCustomCardBg = ''
      if (res.themeCustomButtonBg === undefined) setting.value.themeCustomButtonBg = ''
      if (res.themeCustomFontItalic === undefined) setting.value.themeCustomFontItalic = false
      if (res.themeCustomFontUnderline === undefined) setting.value.themeCustomFontUnderline = false
      if (res.customIconPath === undefined) setting.value.customIconPath = ''
      if (!Array.isArray(res.toolbarButtonsHidden)) setting.value.toolbarButtonsHidden = []
      setting.value.toolbarButtons = ensureToolbarButtons(res.toolbarButtons, res.toolbarButtonsHidden)
      if (res.customPageSizes === undefined) setting.value.customPageSizes = '12,24,42,72,500,5000,1000000'
      if (res.scrollInertiaLevel === undefined) setting.value.scrollInertiaLevel = 'medium'
      if (res.enableImageUpscale === undefined) setting.value.enableImageUpscale = false
      if (res.enableImageOcr === undefined) setting.value.enableImageOcr = false
      // 图片 AI 本地模型 API(旧配置无这些键时补默认值)
      if (res.upscaleApiUrl === undefined) setting.value.upscaleApiUrl = ''
      if (res.ocrApiUrl === undefined) setting.value.ocrApiUrl = ''
  if (!Array.isArray(res.aiApiProfiles)) setting.value.aiApiProfiles = []
  if (res.infoApiProfileId === undefined) setting.value.infoApiProfileId = ''
  if (res.infoProcessApiProfileId === undefined) setting.value.infoProcessApiProfileId = ''
  if (!Array.isArray(res.infoProcessTasks)) setting.value.infoProcessTasks = ['tags', 'story', 'translate']
  if (res.upscaleApiProfileId === undefined) setting.value.upscaleApiProfileId = ''
  if (res.localUpscaleEngine === undefined) setting.value.localUpscaleEngine = ''
  if (res.localUpscaleOptions === undefined) setting.value.localUpscaleOptions = {}
  if (res.colorizeApiProfileId === undefined) setting.value.colorizeApiProfileId = ''
  if (res.ocrApiProfileId === undefined) setting.value.ocrApiProfileId = ''
  if (res.upscaleSaveMode === undefined) setting.value.upscaleSaveMode = 'same'
    if (res.upscaleSizeMode === undefined) setting.value.upscaleSizeMode = 'scale'
    if (res.upscaleTargetWidth === undefined) setting.value.upscaleTargetWidth = 2000
    // 超分过滤设置(旧配置没有这些键):默认开启,阈值 1200×2000
    if (res.upscaleSkipHighRes === undefined) setting.value.upscaleSkipHighRes = true
    if (res.upscaleSkipWidth === undefined) setting.value.upscaleSkipWidth = 1200
    if (res.upscaleSkipHeight === undefined) setting.value.upscaleSkipHeight = 2000
  if (res.colorizeSaveMode === undefined) setting.value.colorizeSaveMode = 'same' 
      if (res.ocrApiModel === undefined) setting.value.ocrApiModel = 'qwen2.5-vl:7b'
      saveSetting()

      // default action
      if (res.theme) {
        changeTheme(res.theme)
        if (res.theme === 'custom') {
          document.documentElement.classList.add('theme-custom')
          applyCustomTheme(setting.value)
        }
      }
      await handleLanguageSet(res.language)
      if (res.showTranslation) loadTranslationFromEhTagTranslation()
      if (res.customCss) electronFunction['insert-css'](res.customCss)
      attachSettingInertiaScroll()
    })
})

const selectLibraryPath = () => {
  ipcRenderer.invoke('select-folder', t('m.library'))
  .then(res => {
    if (res) {
      setting.value.library = res
      saveSetting()
    }
  })
}

// ---------- 回收站 ----------
const trashList = ref([])
const trashDir = ref('')
const loadTrashList = async () => {
  try {
    const res = await ipcRenderer.invoke('trash-list')
    if (res && res.ok) {
      trashList.value = res.list || []
      trashDir.value = res.trashDir || ''
    }
  } catch (e) { /* 忽略 */ }
}
// 回收站列表里的名字:整本用书名,单张图片用「书名 / 图片名」,压缩包备份标注清楚
const trashRowName = (row) => {
  const base = String((row && row.src) || '').split(/[\\/]/).pop() || ''
  if (row.kind === 'archive-backup') return (row.title || base) + '(' + t('m.trashKindArchiveBackup') + ')'
  if (row.kind === 'image') return (row.title ? row.title + ' / ' : '') + (row.image || base)
  return row.title || base
}
const restoreTrashItem = async (row) => {
  try {
    await ElMessageBox.confirm(row.overwriteOnRestore ? t('m.trashRestoreOverwriteConfirm') : t('m.trashRestoreConfirm'), t('m.trashRestore'), { type: 'warning' })
  } catch (e) { return }
  try {
    const res = await ipcRenderer.invoke('trash-restore', row.id)
    if (res && res.ok) {
      ElMessage.success(t('m.trashRestoreDone'))
      await loadTrashList()
    } else {
      ElMessage.error((res && res.error) || t('m.trashRestoreFail'))
    }
  } catch (e) {
    ElMessage.error(t('m.trashRestoreFail') + ':' + ((e && e.message) || e))
  }
}
const purgeTrashItem = async (row) => {
  try {
    await ElMessageBox.confirm(t('m.trashPurgeConfirm'), t('m.trashPurge'), { type: 'warning' })
  } catch (e) { return }
  try {
    const res = await ipcRenderer.invoke('trash-purge', row.id)
    if (res && res.ok) { ElMessage.success(t('m.trashPurgeDone')); await loadTrashList() }
  } catch (e) { /* 忽略 */ }
}
const purgeAllTrash = async () => {
  try {
    await ElMessageBox.confirm(t('m.trashPurgeAllConfirm'), t('m.trashPurgeAll'), { type: 'warning' })
  } catch (e) { return }
  try {
    const res = await ipcRenderer.invoke('trash-purge')
    if (res && res.ok) { ElMessage.success(t('m.trashPurgeDone')); await loadTrashList() }
  } catch (e) { /* 忽略 */ }
}

// ---------- 删除记录(delete-log.jsonl) ----------
const trashLogVisible = ref(false)
const trashLogFile = ref('')
const trashLogList = ref([])
const trashLogActionText = (a) => a === 'restore' ? t('m.trashLogRestore') : (a === 'purge' ? t('m.trashLogPurge') : t('m.trashLogDelete'))
const loadTrashLog = async () => {
  try {
    const res = await ipcRenderer.invoke('trash-log')
    trashLogFile.value = (res && res.logFile) || ''
    const nameOf = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || ''
    trashLogList.value = ((res && res.list) || []).map(e => ({
      ok: e.ok !== false,
      title: e.title || nameOf(e.src),
      name: nameOf(e.src),
      pathText: e.src || '',
      timeText: e.deletedAtText || e.restoredAtText || e.purgedAtText || '',
      actionText: trashLogActionText(e.action),
    }))
  } catch (e) { trashLogList.value = [] }
  trashLogVisible.value = true
}

const selectMetadataPath = () => {
  ipcRenderer.invoke('select-folder', t('m.metadataPath'))
  .then(res => {
    setting.value.metadataPath = res
    saveSetting()
  })
}

const selectImageExplorerPath = () => {
  ipcRenderer.invoke('select-file', t('m.imageViewer'))
  .then(res => {
    if (res) {
      setting.value.imageExplorer = `"${res}"`
      saveSetting()
    }
  })
}

const resetImageExplorer = async () => {
  setting.value.imageExplorer = await ipcRenderer.invoke('get-default-manga-reader')
  saveSetting()
}

const loadTranslationFromEhTagTranslation = async () => {
  const resultObject = {}
  const translationCache = JSON.parse(localStorage.getItem('translationCache') || "{}")
  resolvedTranslation.value = translationCache
  ipcRenderer.invoke('update-tag-translation', translationCache)
  await fetch('https://github.com/EhTagTranslation/Database/releases/latest/download/db.text.json')
  .then(res => res.json())
  .then(res => {
    const database = Array.isArray(res) ? res : (res.data || [])

    database.forEach(namespaceObj => {
      const namespace = namespaceObj.namespace
      resultObject[namespace] = {}
      if (namespaceObj.frontMatters) {
        resultObject[namespace]._name = namespaceObj.frontMatters.name
      }
      _.forIn(namespaceObj.data, (value, key) => {
        resultObject[namespace][key] = _.pick(value, ['name', 'intro'])
      })
    })

    resolvedTranslation.value = resultObject
    ipcRenderer.invoke('update-tag-translation', resultObject)
    localStorage.setItem('translationCache', JSON.stringify(resultObject))
  })
  .catch((error) => {
    console.log(error)
    printMessage('warning', t('c.useTranslationCache'))
  })
}

const handleTranslationSettingChange = (val) => {
  if (val) {
    loadTranslationFromEhTagTranslation()
  } else {
    resolvedTranslation.value =  {}
  }
  saveSetting()
}

const testProxy = async () => {
  await fetch('https://e-hentai.org')
  .then((res) => {
    if (res.status === 200) {
      printMessage('success', t('c.proxyWorking'))
    } else {
      printMessage('error', `Error ${res.status}: ` + t('c.proxyNotWorking'))
    }
  })
  .catch((error) => {
    printMessage('error', t('c.proxyNotWorking'))
  })
}

const autoCheckUpdates = async (forceShowDialog) => {
  await fetch('https://api.github.com/repos/universc/exhentai-manga-manager--docker-ds/releases/latest', {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + gh_token,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  .then(res => res.json())
  .then(res => {
    const { tag_name, html_url, body } = res
    const skipVersion = localStorage.getItem('skipVersion')
    if (tag_name && tag_name !== 'v' + version && tag_name !== skipVersion) {
      ElMessageBox.confirm(
        h('pre', { innerHTML: body, style: 'font-family: Avenir, Helvetica, Arial, sans-serif; text-wrap: balance;' }),
        t('c.newVersion') + tag_name,
        {
          distinguishCancelAndClose: true,
          confirmButtonText: t('c.downloadUpdate'),
          cancelButtonText: t('c.skipVersion')
        }
      )
      .then(() => {
        ipcRenderer.invoke('open-url', html_url)
      })
      .catch((action) => {
        if (action === 'cancel') {
          localStorage.setItem('skipVersion', tag_name)
        }
      })
    } else if (forceShowDialog) {
      ElMessageBox.confirm(
        t('c.notNewVersion'),
        {
          type: 'info',
          showCancelButton: false
        }
      )
    }
  })
}

const handleThemeChange = (val) => {
  changeTheme(val)
  if (val === 'custom') {
    document.documentElement.classList.add('theme-custom')
    applyCustomTheme(setting.value)
  } else {
    document.documentElement.classList.remove('theme-custom')
    // 切到别的主题:清掉自定义主题写在 <html> 上的内联变量(内联优先级高于主题类)
    clearCustomTheme()
  }
  saveSetting()
}

const changeTheme = (classValue) => {
  document.documentElement.setAttribute('class', classValue)
}

const handleLanguageChange = async (languageCode) => {
  await handleLanguageSet(languageCode)
  saveSetting()
}

const handleLanguageSet = async (languageCode) => {
  if (!languageCode || (languageCode === 'default')) {
    languageCode = await ipcRenderer.invoke('get-locale')
  }
  switch (languageCode) {
    case 'zh-CN':
      localeFile.value = zhCn
      locale.value = 'zh-CN'
      break
    case 'zh-TW':
      localeFile.value = zhTw
      locale.value = 'zh-TW'
      break
    case 'en-US':
    default:
      localeFile.value = en
      locale.value = 'en-US'
      break
  }
}

// 随机标签与「显示收藏标签」互斥:开启一个自动关闭另一个
// 立即落盘(绕过 500ms 防抖):这两个开关直接影响主界面,丢失会让人误以为"没生效"
const saveSettingNow = () => {
  try { ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value))) } catch (e) {}
}
const onRandomTagsChange = (val) => {
  if (val) setting.value.showCollectTag = false
  saveSettingNow()
}
const onShowCollectTagChange = (val) => {
  if (val) setting.value.randomTagsEnabled = false
  saveSettingNow()
}
// 「语言」下拉:选具体语言即启用标签翻译(供分类名/标签名显示翻译),选「默认」则关闭
const onTagLangChange = (val) => {
  setting.value.showTranslation = !!val
  if (val && typeof loadTranslationFromEhTagTranslation === 'function') loadTranslationFromEhTagTranslation()
  saveSetting()
}

const saveSetting = _.debounce(() => {
  ipcRenderer.invoke('save-setting', _.cloneDeep(setting.value))
}, 500)

// ---------- 窗口置顶开关 ----------
const handleAlwaysOnTopChange = async (val) => {
  if (!showDesktopUI.value) return
  await ipcRenderer.invoke('window-set-always-on-top', !!val)
  saveSetting()
}

// ---------- 运行模式:本地 / 网页(NAS) ----------
const runMode = ref('local')
const remoteIp = ref('')
const remotePort = ref(10000)
const syncRunMode = () => {
  const url = String(setting.value?.remoteServer || '')
  runMode.value = url ? 'remote' : 'local'
  const m = url.match(/^https?:\/\/([^:/]+)(?::(\d+))?/i)
  remoteIp.value = m ? m[1] : ''
  remotePort.value = (m && m[2]) ? Number(m[2]) : 10000
}
const handleRunModeChange = (val) => {
  // 仅切换面板预览;连接/退出由面板按钮完成
}
// 退出服务器模式:清空服务器配置并重启回本地模式
const exitServerMode = async () => {
  if (!showDesktopUI.value) return
  await ipcRenderer.invoke('switch-to-local-mode')
}
const syncRemoteServer = () => {
  const ip = (remoteIp.value || '').trim()
  const port = Number(remotePort.value)
  if (ip && port > 0 && port < 65536) {
    setting.value.remoteServer = `http://${ip}:${port}`
    saveSetting()
  }
}

// ---------- 本地模式:数据文件位置 ----------
const dataPathText = ref('')
const loadDataPath = async () => {
  if (!showDesktopUI.value) return
  const info = await ipcRenderer.invoke('get-data-path')
  if (info) dataPathText.value = info.dataPath
}
const selectDataPath = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('m.dataPath'))
  if (folder) dataPathText.value = folder
}
const saveDataPath = async () => {
  if (!dataPathText.value.trim()) return
  await ipcRenderer.invoke('set-data-path', dataPathText.value.trim())
}

// ---------- NAS 远程漫画库 ----------
const testRemoteServer = async () => {
  if (!showDesktopUI.value) return
  const url = (setting.value.remoteServer || '').trim()
  if (!url) {
    printMessage('info', t('m.remoteServerEmpty'))
    return
  }
  const res = await ipcRenderer.invoke('test-remote-server', url)
  if (res?.ok) {
    printMessage('success', t('m.remoteServerOk') + (res.version ? ` v${res.version}` : '') + (res.auth ? ` · ${t('m.remoteServerAuth')}` : ''))
  } else {
    printMessage('error', t('m.remoteServerFail') + (res?.error && res.error !== 'empty' ? `: ${res.error}` : ''))
  }
}
const relaunchRemoteMode = async () => {
  if (!showDesktopUI.value) return
  // 先把 IP/端口/账户写入配置(不走防抖),确保重启后生效
  syncRemoteServer()
  await ipcRenderer.invoke('save-setting', _.cloneDeep(setting.value))
  await ipcRenderer.invoke('relaunch-app')
}

// ---------- 网页版(Docker)账户管理:仅管理员 ----------
const isAdmin = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'admin'
})
// 只读账户(viewer):只能看账户页
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})
// 网页版已登录(管理员或普通账户)
const isWebLoggedIn = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && !!auth.role
})
const authUsername = computed(() => {
  const auth = window.__AUTH__ || {}
  return auth.username || ''
})
// 网页版登录(设置 → 账户:未登录时直接在此登录,避免设置页整页空白)
const webLoginUsername = ref('')
const webLoginPassword = ref('')
const webLoginLoading = ref(false)
const webLoginError = ref('')
const doWebLogin = async () => {
  if (!webLoginUsername.value.trim() || !webLoginPassword.value) {
    webLoginError.value = '请输入账户与密码'
    return
  }
  webLoginLoading.value = true
  webLoginError.value = ''
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: webLoginUsername.value.trim(), password: webLoginPassword.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) throw new Error(data.error || '登录失败')
    window.location.reload()
  } catch (e) {
    webLoginError.value = String((e && e.message) || e)
  } finally {
    webLoginLoading.value = false
  }
}

// 网页版退出登录(设置 → 账户)
const logout = () => {
  fetch('/api/auth/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => {
      window.location.reload()
    })
}
const accountList = ref([])
const newAccountUsername = ref('')
const newAccountPassword = ref('')
const newAccountRole = ref('viewer')
const loadAccountList = async () => {
  if (!isAdmin.value) return
  try {
    accountList.value = await ipcRenderer.invoke('auth-list-users') || []
  } catch {
    accountList.value = []
  }
}
const addAccount = async () => {
  const res = await ipcRenderer.invoke('auth-add-user', {
    username: newAccountUsername.value,
    password: newAccountPassword.value,
    role: newAccountRole.value
  })
  if (res?.ok) {
    printMessage('success', t('m.accountAdded'))
    newAccountUsername.value = ''
    newAccountPassword.value = ''
    loadAccountList()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}
const removeAccount = async (username) => {
  try {
    await ElMessageBox.confirm(t('m.confirmDeleteAccount').replace('{name}', username), t('m.deleteAccount'), { type: 'warning' })
  } catch {
    return
  }
  const res = await ipcRenderer.invoke('auth-remove-user', username)
  if (res?.ok) {
    printMessage('success', t('m.accountDeleted'))
    loadAccountList()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}
const resetAccountPassword = async (username) => {
  let newPassword
  try {
    const { value } = await ElMessageBox.prompt(t('m.newPasswordFor').replace('{name}', username), t('m.resetPassword'), {
      inputType: 'password',
      inputValidator: (v) => (v && v.length >= 4) ? true : t('m.passwordTooShort')
    })
    newPassword = value
  } catch {
    return
  }
  const res = await ipcRenderer.invoke('auth-change-password', { username, newPassword })
  if (res?.ok) {
    printMessage('success', t('m.passwordChanged'))
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}

// ---------- IP 访问控制(白名单免登录 / 黑名单禁止连接) ----------
const ipWhitelist = ref([])
const ipBlacklist = ref([])
const ipWhitelistInput = ref('')
const ipBlacklistInput = ref('')
const loadIpRules = async () => {
  if (!isAdmin.value) return
  let rules = null
  try {
    rules = await ipcRenderer.invoke('auth-get-ip-rules')
  } catch {
    rules = null
  }
  if (rules) {
    ipWhitelist.value = [...rules.whitelist]
    ipBlacklist.value = [...rules.blacklist]
  }
}
const addIpRule = (kind) => {
  const input = kind === 'whitelist' ? ipWhitelistInput : ipBlacklistInput
  const list = kind === 'whitelist' ? ipWhitelist : ipBlacklist
  const value = input.value.trim()
  if (!value) return
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)) {
    printMessage('error', t('m.ipRuleInvalid'))
    return
  }
  if (!list.value.includes(value)) list.value.push(value)
  input.value = ''
}
const removeIpRule = (kind, ip) => {
  const list = kind === 'whitelist' ? ipWhitelist : ipBlacklist
  list.value = list.value.filter(item => item !== ip)
}
const saveIpRules = async () => {
  const res = await ipcRenderer.invoke('auth-set-ip-rules', {
    whitelist: ipWhitelist.value,
    blacklist: ipBlacklist.value
  })
  if (res?.ok) {
    printMessage('success', t('m.ipRulesSaved'))
    loadIpRules()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}

const openLink = (link) => {
  ipcRenderer.invoke('open-url', link)
}

const forceGeneBookList = async () => {
  dialogVisibleSetting.value = false
  localStorage.setItem('viewerReadingProgress', JSON.stringify([]))
  bookList.value = await ipcRenderer.invoke('force-gene-book-list')
  emit('loadCollectionList')
  printMessage('success', t('c.rebuildMessage'))
}
const patchLocalMetadata = async () => {
  await ipcRenderer.invoke('patch-local-metadata')
  emit('loadBookList')
}


const exportDatabase = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('c.exportFolder'))
  const result = await ipcRenderer.invoke('export-database', folder)
  if (result) printMessage('success', t('c.exportMessage'))
}

const importDatabase = async () => {
  const collectionListPath = await ipcRenderer.invoke('select-file', t('c.selectCollectionList'), [{name: 'JSON', extensions: ['json']}])
  const metadataSqlitePath = await ipcRenderer.invoke('select-file', t('c.selectMetadataSqlite'), [{name: 'SQLite', extensions: ['sqlite']}])
  await ipcRenderer.invoke('import-database', {collectionListPath, metadataSqlitePath})
}

const importMetadataFromSqlite = async () => {
  const {success, bList} = await ipcRenderer.invoke('import-sqlite', _.cloneDeep(bookList.value))
  if (success) {
    bookList.value = bList
    printMessage('success', t('c.importMessage'))
  } else {
    printMessage('info', t('c.canceled'))
  }
}

const formTagAdd = ref({
  tag: null,
  color: '#42A5F5'
})

const tagListForCollect = computed(() => {
  if (setting.value.showTranslation) {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      const labelHeader = resolvedTranslation.value[cat]?._name || cat
      const labelTail = resolvedTranslation.value[cat]?.[tag]?.name || tag
      return {
        label: `${labelHeader}:${labelTail} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  } else {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      return {
        label: `${cat}:${tag} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  }
})

const moderateSoftColors = [
  '#FF6F61', // 略微柔和但鲜艳的珊瑚红
  '#F48FB1', // 鲜明的粉红色
  '#42A5F5', // 鲜艳的蓝色
  '#66BB6A', // 鲜艳的绿色
  '#FFCA28', // 亮黄色
  '#AB47BC', // 鲜亮的紫色
  '#26A69A', // 热带青色
  '#FFA726', // 鲜亮的橙色
  '#8D6E63', // 保存自然的棕色
  '#78909C'  // 鲜明的灰蓝色
]

const addTagToCollect = () => {
  const tag = tagListRaw.value.find(tag => tag.id === formTagAdd.value.tag)
  if (!setting.value.collectTag) setting.value.collectTag = []
  setting.value.collectTag.push({
    id: tag.id,
    letter: tag.letter,
    cat: tag.cat,
    tag: tag.tag,
    color: formTagAdd.value.color
  })
  setting.value.collectTag = _.uniqBy(setting.value.collectTag, 'id')
  formTagAdd.value.tag = null
  saveSetting()
}

const removeTag = (id) => {
  setting.value.collectTag = setting.value.collectTag.filter(tag => tag.id !== id)
  saveSetting()
}

// ---------- 标签设置:当前库中的全部标签 ----------
const tagColorPopupId = ref(null)
const selectedTagCat = ref(null)
const allTagsGroups = computed(() => {
  const groups = []
  const map = {}
  const seen = new Set()
  for (const tag of tagListRaw.value) {
    // 去重:同一「分类::标签」只保留一项;分类名中英混用(角色/character)统一后合并
    const uniqKey = resolveCatKey(tag.cat) + '::' + tag.tag
    if (seen.has(uniqKey)) continue
    seen.add(uniqKey)
    // 分组同样按英文分类名归一:「parody」与「作品」合并为一个分组,避免出现两个同名分组
    const normCat = resolveCatKey(tag.cat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const labelTail = setting.value.showTranslation ? (resolvedTranslation.value[tag.cat]?.[tag.tag]?.name || tag.tag) : tag.tag
    map[normCat].tags.push({ id: tag.id, cat: tag.cat, tag: tag.tag, letter: tag.letter, label: labelTail })
  }
  return groups
})
const categoryLabel = (cat) => {
  return setting.value.showTranslation ? (resolvedTranslation.value[cat]?._name || cat) : cat
}
// 标签名后加括号显示前 3 个所属集合(被哪些集合包含),如 光辉(碧蓝航线,女)
const tagLabelWithSets = (tag) => {
  if (!tag) return ''
  const key = tag.cat + '::' + tag.tag
  const all = setting.value.tagRelations || {}
  const sets = []
  for (const [k, v] of Object.entries(all)) {
    if (k !== key && v && Array.isArray(v.contains) && v.contains.includes(key)) {
      const nm = k.split('::')[1]
      if (nm) sets.push(nm)
    }
  }
  const direct = all[key]
  if (direct && Array.isArray(direct.containedBy)) {
    for (const k of direct.containedBy) { const nm = k.split('::')[1]; if (nm) sets.push(nm) }
  }
  const uniq = [...new Set(sets)]
  return uniq.length ? tag.label + '(' + uniq.slice(0, 3).join(',') + ')' : tag.label
}
// 双击标签 → 编辑多语言名称(中/日/英),按「目标语言标签」显示
const tagEditVisible = ref(false)
const tagEditItem = ref(null)
const tagEditLangs = ref({ 'default': '', 'zh-CN': '', 'zh-TW': '', ja: '', en: '' })
const openTagNameEditor = (tag) => {
  tagRelationPick.value = ''
  if (!tag || !tag.cat || !tag.tag) return
  const rec = (setting.value.tagNameLangs || {})[tag.cat + '::' + tag.tag] || {}
  tagEditLangs.value = { 'default': rec['default'] || '', 'zh-CN': rec['zh-CN'] || '', 'zh-TW': rec['zh-TW'] || '', ja: rec.ja || '', en: rec.en || '' }
  tagEditItem.value = tag
  tagEditVisible.value = true
}
// ---------- 关联标签(包含 / 被包含) ----------
const tagRelationPick = ref('')
const tagRelationKind = ref('contains')
const keyLabel = (k) => { const p = String(k).split('::'); return p.length === 2 ? categoryLabel(p[0]) + ':' + p[1] : k }
const tagRelationCat = ref('')
const tagRelationCats = computed(() => (allTagsGroups.value || []).map(g => ({ value: g.cat, label: categoryLabel(g.cat) })))
const tagRelationOptions = computed(() => {
  const it = tagEditItem.value
  const selfKey = it ? it.cat + '::' + it.tag : ''
  const out = []
  for (const g of (allTagsGroups.value || [])) {
    if (tagRelationCat.value && g.cat !== tagRelationCat.value) continue
    for (const t of (g.tags || [])) {
      const k = t.cat + '::' + t.tag
      if (k === selfKey) continue
      out.push({ value: k, label: t.tag })
    }
  }
  return out
})
const containedByLocal = (key) => {
  const all = setting.value.tagRelations || {}
  const direct = all[key]
  if (direct && Array.isArray(direct.containedBy) && direct.containedBy.length) return direct.containedBy
  const out = []
  for (const [k, v] of Object.entries(all)) {
    if (k !== key && v && Array.isArray(v.contains) && v.contains.includes(key)) out.push(k)
  }
  return out
}
const tagRelationList = computed(() => {
  const it = tagEditItem.value
  if (!it) return []
  const key = it.cat + '::' + it.tag
  const rel = (setting.value.tagRelations || {})[key] || {}
  const list = []
  for (const k of (rel.contains || [])) list.push({ kind: 'contains', key: k, label: keyLabel(k) })
  for (const k of containedByLocal(key)) list.push({ kind: 'containedBy', key: k, label: keyLabel(k) })
  return list
})
const saveRelations = async () => {
  if (!setting.value.tagRelations) setting.value.tagRelations = {}
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  emit('loadBookList')
}
const addTagRelation = async () => {
  const it = tagEditItem.value
  const pick = tagRelationPick.value
  if (!it || !pick) return
  const selfKey = it.cat + '::' + it.tag
  if (!setting.value.tagRelations) setting.value.tagRelations = {}
  if (tagRelationKind.value === 'contains') {
    const rel = setting.value.tagRelations[selfKey] || {}
    const arr = Array.isArray(rel.contains) ? rel.contains.slice() : []
    if (!arr.includes(pick)) arr.push(pick)
    setting.value.tagRelations[selfKey] = { ...rel, contains: arr }
  } else {
    const other = setting.value.tagRelations[pick] || {}
    const arr = Array.isArray(other.contains) ? other.contains.slice() : []
    if (!arr.includes(selfKey)) arr.push(selfKey)
    setting.value.tagRelations[pick] = { ...other, contains: arr }
  }
  tagRelationPick.value = ''
  await saveRelations()
}
const removeTagRelation = async (r) => {
  const it = tagEditItem.value
  if (!it || !r) return
  const selfKey = it.cat + '::' + it.tag
  if (!setting.value.tagRelations) return
  if (r.kind === 'contains') {
    const rel = setting.value.tagRelations[selfKey] || {}
    const arr = (rel.contains || []).filter(k => k !== r.key)
    if (arr.length) setting.value.tagRelations[selfKey] = { ...rel, contains: arr }
    else delete setting.value.tagRelations[selfKey]
  } else {
    const other = setting.value.tagRelations[r.key] || {}
    const arr = (other.contains || []).filter(k => k !== selfKey)
    if (arr.length) setting.value.tagRelations[r.key] = { ...other, contains: arr }
    else delete setting.value.tagRelations[r.key]
  }
  await saveRelations()
}

const saveTagNames = async () => {
  const it = tagEditItem.value
  if (!it) return
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const key = it.cat + '::' + it.tag
  const lang = {
    'default': (tagEditLangs.value['default'] || '').trim(),
    'zh-CN': (tagEditLangs.value['zh-CN'] || '').trim(),
    'zh-TW': (tagEditLangs.value['zh-TW'] || '').trim(),
    ja: (tagEditLangs.value.ja || '').trim(),
    en: (tagEditLangs.value.en || '').trim(),
  }
  if (!lang['default'] && !lang['zh-CN'] && !lang['zh-TW'] && !lang.ja && !lang.en) delete setting.value.tagNameLangs[key]
  else setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  tagEditVisible.value = false
  printMessage('success', t('m.saveTagNamesDone'))
  emit('loadBookList')
}
// 双击重命名标签(全库更新)
const renameTag = async (tag) => {
  try {
    const { value } = await ElMessageBox.prompt(t('c.renameTagPrompt'), t('m.renameTag'), { inputValue: tag.tag })
    const newName = String(value || '').trim()
    if (!newName || newName === tag.tag) return
    const res = await ipcRenderer.invoke('rename-tag', { cat: tag.cat, oldName: tag.tag, newName })
    if (res?.ok) {
      // 同步已收藏的标签条目
      if (setting.value.collectTag) {
        setting.value.collectTag = setting.value.collectTag.map(item => {
          return item.id === tag.id ? { ...item, id: `${tag.cat}:${newName}`, tag: newName } : item
        })
      }
      saveSetting()
      emit('loadBookList')
      printMessage('success', t('c.renameTagDone', { count: res.count }))
    } else {
      printMessage('error', res?.error || t('c.renameTagFailed'))
    }
  } catch (e) {
    // 用户取消
  }
}
const collectedTagMap = computed(() => {
  const map = {}
  for (const item of setting.value.collectTag || []) map[item.id] = item
  return map
})
const toggleCollectTag = (tag) => {
  if (!setting.value.collectTag) setting.value.collectTag = []
  const idx = setting.value.collectTag.findIndex(t => t.id === tag.id)
  if (idx >= 0) {
    setting.value.collectTag.splice(idx, 1)
  } else {
    setting.value.collectTag.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color: '#42A5F5' })
  }
  saveSetting()
}
// 长按收藏:按住标签 600ms 触发收藏/取消收藏
let longPressCollectTimer = null
const startLongPressCollect = (tag) => {
  cancelLongPressCollect()
  longPressCollectTimer = setTimeout(() => {
    longPressCollectTimer = null
    toggleCollectTag(tag)
  }, 600)
}
const cancelLongPressCollect = () => {
  if (longPressCollectTimer) {
    clearTimeout(longPressCollectTimer)
    longPressCollectTimer = null
  }
}
const applyTagColor = (tag, color) => {
  const list = setting.value.collectTag || []
  const item = list.find(t => t.id === tag.id)
  if (item) {
    item.color = color
  } else {
    list.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color })
  }
  setting.value.collectTag = [...list]
  tagColorPopupId.value = null
  saveSetting()
}

const reloadWindow = () => {
  window.location.reload()
}

// 信息处理:可生成标签的分类(取自现有标签栏)
const tagCategoryKeys = computed(() => {
  const set = new Set()
  for (const t of (tagListRaw.value || [])) { if (t && t.cat) set.add(t.cat) }
  for (const b of (bookList.value || [])) { for (const k of Object.keys(b.tags || {})) set.add(k) }
  return [...set]
})
const tagCategoryLabel = (c) => ((resolvedTranslation.value && resolvedTranslation.value[c] && resolvedTranslation.value[c]._name) || catDisplayName(c))

const dialogVisibleSetting = ref(false)
// Ctrl+滚轮 改过缩放后,再打开设置时同步显示当前的百分比
// (必须放在 dialogVisibleSetting 定义之后,否则 setup 阶段会 ReferenceError → 整个设置面板打不开)
watch(dialogVisibleSetting, (visible) => {
  if (!visible) return
  // 每次打开设置:同步界面缩放 + 自动刷新一次回收站(文件可能被外部移动/删除,状态会变)
  zoomPercentRef.value = readZoomPercent()
  loadTrashList()
})
// 更新日志(关于页展示;新版本加在数组最前面)
const changelog = [
  {
    version: 'v1.10.6',
    summary: '回收站与删除记录:删错了能救回来(单张图片也算),每一次删除都有据可查',
    items: [
      '【新增】回收站(软删除):删除漫画不再直接抹盘,整本移入 <数据目录>/.trash/,可在 设置 → 常用 → 回收站 里恢复',
      '【新增】回收站支持「彻底删除」与「清空回收站」;文件缺失的条目会标注并禁用恢复;恢复时原路径被占用会拒绝覆盖',
      '【新增】删除记录:每次删除 / 恢复 / 彻底删除都写入 <数据目录>/delete-log.jsonl,回收站底部点「删除记录」查看最近 200 条',
      '【修复】Linux / Docker 下删除漫画会永久删除(shell.trashItem 在容器里必然失败,旧版本 catch 里直接 rm),且失败也会删掉数据库行',
      '【修复】删除确认文案改为「移入回收站」;删除时保留数据库 / 元数据 / 封面 / 缩略图 / 扫描快照,恢复后重新扫描即可回到书架',
      '【说明】回收站只能保住升级到 1.10.6 之后删掉的书;老版本直接删除的文件不在回收站里',
      '【新增】单张图片删除也进回收站:文件夹漫画把这张图本身移入 <数据目录>/.trash/(条目名「书名 / 图片名」),可单独恢复',
      '【新增】压缩包漫画删除图片时,先把整个压缩包的原样备份放进回收站(条目名「书名(压缩包备份)」),同一本只保留最早一份,还原即整体回滚',
      '【变更】设置 → 常用 的回收站区块移到该页最下方;回收站与删除记录的名称会显示「书名 / 图片名」「书名(压缩包备份)」',
      '【修复】Linux / Docker 下删除单张图片会永久删除(文件夹走 shell.trashItem,容器里必然失败后旧代码直接 rm)',
      '【修复】删除图片失败也会提示成功(旧代码把返回对象当布尔值判断),现在失败会显示具体原因',
    ]
  },

  {
    version: 'v1.10.5',
    summary: '阅读器大版本:渲染矩阵重做 + 自动超分修复 + 恢复 .bak + 性能重构 + 一批界面整理',
    items: [
      '【阅读器】渲染矩阵 12 种组合(卷轴开关 x 单页/双页 x 上下/左右/右左)全部重做;缩放与适应方式对所有模式生效',
      '【阅读器】新增横向整排(方向=左右/右左):整排连续滚动、右左时整排反向并自动贴最右;键盘翻页/滚动按阅读方向生效',
      '【阅读器】性能重构:缩略图按需生成 + 持久缓存 + 后台限流,超宽图不再重编码(实测加载快约 12 倍)',
      '【超分】自动超分修复:按「图片超分 → 保存位置」执行(替换原文件会生成 .bak)、分页模式也触发、完成后立即显示、全程无提示',
      '【超分】新增右键「恢复 .bak 文件」(图片)与「恢复全部 .bak 文件」(封面):超分坏了可一键回滚,只处理确实存在 .bak 的文件',
      '【超分】新增「删除全部 .bak 备份」与封面右键「删除本书的 .bak 备份」;全本超分在「仅预览」下会直接取消',
      '【超分】本地模型支持 Real-ESRGAN / waifu2x(与 ComicRead 的「无损放大」同一个模型),含下载/删除/权重选择',
      '【设置栏】按钮可勾选显隐、拖动排序(顺序真的生效);放大/缩小合并为一项「缩放」;退出按钮固定右上角',
      '【设置栏】新增「按钮操作提示」:点按钮弹一句当前状态与用法(可在设置里关掉)',
      '【阅读器】新增「图片间距」「缩略图间距」(默认 0);「双页模式单独封面」;隐藏页码同时管住缩略图页码',
      '【阅读器】底部「上一本 / 随机 / 下一本」可隐藏(默认隐藏,鼠标移到画面底部才出现);「阅读完成后」新增「打开下一本(随机)」',
      '【界面】设置 → 本地阅读器重排;高级页删除「恢复默认」、卡片样式分开、小字统一',
      '【修复】工具栏缩略图按钮点了没反应、设置栏缩放取消勾选不生效、点击弹出区域改中央 1/5、右键菜单拖动排序等一批问题',
      '【新增】图片间距 / 缩略图间距(设置 → 内置阅读器,默认 0 = 紧贴)',
      '【新增】阅读完成后 →「打开下一本(随机)」',
      '【新增】设置 → 高级 → 工具栏按钮:全屏按钮(可勾选、可拖动排序)',
      '【新增】内置阅读器每一项设置都配了说明(对着渲染矩阵写的)',
      '【修复】自动超分:按「图片超分 → 保存位置」执行(替换原文件会生成 .bak);超分完立即显示;分页模式也能触发;全程无提示',
      '【修复】设置栏「缩放」取消勾选不生效;设置栏按钮拖动排序不生效;工具栏缩略图按钮点了没反应;隐藏页码管不住缩略图页码',
      '【界面】放大 / 缩小合并为一项「缩放」;卷轴 / 单双按钮去掉蓝色高亮;退出按钮固定右上角不参与配置',
      '【界面】点击弹出设置栏的区域由中央 1/4 改为中央 1/5;底部「上一本 / 随机 / 下一本」隐藏 0%、鼠标到底部才显示',
      '【界面】设置 → 内置阅读器重排:选择项置顶、开关两列并排;高级页删除「恢复默认」、卡片样式分开、小字统一',
      '【文案】「双页模式默认在首页插入空白页」→「双页模式单独封面」;「自动超分放大」→「自动超分」',
      '【说明】ComicRead 的「无损放大」用的就是 Real-ESRGAN(网页版);本地模型已内置同一个模型,装好即可通用',
    ]
  },


  {
    version: 'v1.10.4',
    summary: '图片右键「属性」+ 超分「过滤设置」',
    items: [
      '阅读器图片右键新增「属性」:名称 / 大小 / 分辨率 / 编码(含通道数与位深) / 修改时间 / 路径',
      '「属性」可在 设置 → 高级 → 右键菜单 里勾选;网页版只读账户也能查看',
      '超分新增「过滤设置」:图片宽和高都 ≥ 阈值(默认 1200×2000)时跳过超分,不生成任何文件',
      '过滤在超分入口统一判定,单张超分与全本超分同样生效;全本结束提示会显示跳过张数',
    ]
  },
  {
    version: 'v1.10.3',
    summary: '本地超分模型(Real-ESRGAN / waifu2x)+ 超分结果落盘 + 一批修复',
    items: [
      '【新增】本地超分模型:设置 → 功能 → 本地模型,下载后完全离线运行(带进度、可取消、可删除、可打开目录)',
      '【新增】可用权重自动扫描;每个模型有自己的参数(权重 / 放大倍数 / 降噪等级 / 分块 / GPU / TTA),以后加模型前端零改动',
      '【新增】下载支持走「常用 → 代理」或填镜像前缀(国内直连 GitHub 大文件会被重置)',
      '【新增】Docker / NAS 同样可用:镜像加入 libvulkan1 + mesa-vulkan-drivers,无 GPU 时用 lavapipe 做 CPU 软件渲染',
      '【新增】超分结果落盘:保存方式支持「同一文件夹(另存)/ 替换原文件(旧文件备份为 .bak)/ 仅预览」,另存文件名格式 原名_模型_倍数',
      '【修复】「保存到文件夹」从来没有真正生效(upscaleSaveMode 在后端从未被读取,结果永远只写到预览临时目录)',
      '【修复】阅读器图片右键的「超分图片」「提取文字」永远不显示(额外依赖了两个从来没有开关的配置项)',
      '【变更】「图片超分」移除「输出尺寸」与「超分倍数」:不同引擎能力不同,倍数改为每个本地模型自己的参数',
    ]
  },
  {
    version: 'v1.10.2',
    summary: '修复右键菜单勾选每次打开都变回默认(全选)',
    items: [
      '【修复】右键菜单 / 长按菜单的勾选每次打开软件都变回默认(全选)',
      '【根因】加载设置时的「自动并入」写法把定义里的全部菜单项无条件并回已保存值,App.vue 启动时又把这份全选结果写回服务器',
      '【修复】改为 mergeContextMenuOptions():只并入 (当前定义 − 上次定义) 的真正新增项;没有记录时完全信任已保存值',
      '【注意】受影响用户需要重新设置一次右键菜单 —— 被覆盖掉的勾选无法自动还原',
    ]
  },
  {
    version: 'v1.10.1',
    summary: '修复「设置反复丢失」(严重) + 接口鉴权加固',
    items: [
      '【修复】「设置反复丢失」:前端在加载设置之前就保存了空设置,后端又把收到的局部对象当完整配置整份落盘,两者叠加导致 setting.json 每次打开页面都被清空',
      '【修复】后端 applySetting 先合并再落盘:前端没传的键一律保留原值;前端把「右键菜单合并保存」移到拿到完整设置之后',
      '【修复】容器内漫画库 / 元数据目录被重置(容器分支会用局部对象覆盖 fileSetting)',
      '【安全】/api/file、/api/list-dir、/browse 增加登录鉴权:启用账户系统后未登录访问一律 401',
    ]
  },
  {
    version: 'v1.10.0',
    summary: 'AI 功能改造修复批次:双击封面 / 收藏标签 / 标签去重 / 超分尺寸 / 标签多语言 / 标签关联',
    items: [
      '修复双击封面无反应(事件名大小写不匹配)',
      '修复设置页显示原始 key(locale 命名空间错位 + 补齐 5 个缺失键)',
      '修复收藏标签在主界面不显示(分类名中英文映射兼容)',
      '修复标签栏重复项(按 分类::标签 去重,中英分类名合并)',
      '收藏标签 / 随机标签开关改为立即保存,避免勾选后未落盘',
      '非管理员 / 未登录时设置页显示账户页(可在设置内登录或退出)',
      '修复重启后服务无法启动(sqlite3 原生模块被 electron-builder 误删)',
      '图片超分:新增「输出尺寸」(按倍数 / 按目标宽度),倍数扩展为 1.5 / 2 / 3 / 4 / 6 / 8',
      '标签多语言名称:默认 / 简体 / 繁体 / 英文 / 日文 五种,双击标签即可编辑',
      '标签关联(包含 / 被包含):标签名后自动括号显示前 3 个所属集合',
      '收藏标签 / 随机标签 / 语言 三项同排;「目标语言标签」改为「语言」;「AI 基础功能」改为「功能」',
    ]
  },
  {
    version: 'v1.9.8',
    summary: '扫描优化 / 详情页重构 / 标签网格选择 / 移动端适配',
    items: [
      '扫描优化:压缩包只解压一次、去掉冗余整文件复制、同一文件只算一次哈希(封面懒加载)',
      '封面加载动画只覆盖封面区域,不再遮挡标题与角标',
      '详情页:故事简介字段(可编辑,随元数据同步)',
      '详情页:封面 / 标题 / 按钮 / 评分统一宽度并居中对齐,窗口缩放不再错位',
      '点击策略可配置:单击封面、双击封面、阅、读、页数 → 详细界面 / 内容界面 / 缩略图',
      '标签选择:框与原选择框一致(可直接打字筛选、回车新建),下拉里标签按一排一排网格平铺,宽度与输入框一致',
      '标签分类名内置中文兜底(角色 / 作品 / 社团 …),不再依赖联网词库',
      '长按卡片上的收藏标签(或右键)打开简易标签编辑器:按标签筛选 / 重命名(全库) / 删除(全库) / 从本书移除',
      '打开所在目录:网页版与远程桌面模式改为新标签页浏览 NAS 文件夹',
      '编辑信息按钮调整:移除「AI 信息处理」,改为「查询角色出处 / 翻译」,新增「超分辨率 / 上色」(占位)',
      '界面模式(自动 / 手机 / 平板 / 桌面)文案补全;手机端两列布局、分页不再横向溢出',
      '版本号 1.9.8;关于页移除帮助/捐赠入口,新增本仓库链接与更新日志',
    ]
  },
  {
    version: 'v1.9.7',
    summary: '封面懒加载 / 跨平台共享数据库(上游 v1.9.7 基线)',
    items: [
      '封面懒加载(默认开启):扫描建库不再批量生成封面,浏览到哪本按需生成',
      '跨平台共享数据库:Windows 桌面版与 Docker 网页版读写同一份数据库与封面目录',
      '封面清理修复:按文件名统一对比,避免误删另一端路径引用的封面',
    ]
  },
]
const activeSettingPanel = ref('general')

// 设置页内容区惯性滚动(对话框打开/挂载后各尝试一次)
let settingInertiaDetach = null
const attachSettingInertiaScroll = () => {
  const el = document.querySelector('.setting-tabs .el-tabs__content')
  if (el && !settingInertiaDetach) {
    settingInertiaDetach = attachInertiaScroll(el)
  }
  // 网页版只读账户 / 未登录:强制停留在「账户」页(仅此页可见,含登录或退出登录)
  if (viewerRole.value || (isWebMode.value && !isWebLoggedIn.value)) {
    activeSettingPanel.value = 'accounts'
  }
  // 每次打开对话框都刷新账户列表与 IP 规则(网页版管理员)
  loadAccountList()
  loadIpRules()
  // 同步运行模式与数据目录(桌面版)
  syncRunMode()
  loadDataPath()
}

defineExpose({
  dialogVisibleSetting,
  activeSettingPanel,
  saveSetting
})

</script>

<style lang="stylus">

/* 本地模型行(设置 → 功能 → 本地模型) */
.local-model-options { margin: 0 0 10px 0; padding: 6px 10px; border-radius: 6px; background: rgba(127, 127, 127, 0.07); }
.local-model-option { display: flex; align-items: center; gap: 10px; padding: 4px 0; flex-wrap: wrap; }
.local-model-option-label { min-width: 78px; font-size: 13px; color: #606266; }
.local-model-option-control { width: 190px; }
.local-model-option-hint { font-size: 12px; color: #a0a4ab; }
.local-model-row { align-items: center; gap: 10px; flex-wrap: wrap; }
.local-model-name { font-weight: 600; min-width: 96px; }
.local-model-status { color: #909399; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; }

.setting-title
  margin:0
  text-align: center
.setting-line
  margin: 6px 0
  .el-input-group__prepend
    width: 110px
.setting-line.regexp
  .el-input__inner
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace
.setting-line.collect-tag
  .el-form-item
    margin-bottom: 0
  .el-tag
    margin-right: 8px
    margin-bottom: 8px
    border-width: 0
// 标签设置:当前库中的全部标签
.tag-cat-list
  display: flex
  flex-wrap: wrap
  gap: 6px
  margin-bottom: 8px
  .tag-cat-chip
    cursor: pointer
.all-tags-list
  max-height: 260px
  overflow-y: auto
  text-align: left
  padding: 4px 2px
  .tag-group
    margin-bottom: 8px
    .tag-group-title
      font-size: 12px
      font-weight: 600
      color: var(--el-text-color-secondary)
      margin: 6px 0 4px
  .all-tag-item
    cursor: pointer
    margin-right: 8px
    margin-bottom: 8px
    transition: transform .15s ease
    &:hover
      transform: scale(1.05)
.tag-color-dot
  display: inline-block
  width: 10px
  height: 10px
  border-radius: 50%
  margin-right: 5px
  vertical-align: middle
  cursor: pointer
.setting-switch
  text-align: left
  margin-top: 6px
.translation-tip
  color: var(--el-text-color-secondary)
  font-size: 12px
  line-height: 1.6
  white-space: pre-line
// 功能按钮行:等宽弹性排列,自动换行
.function-button-row
  display: flex
  flex-wrap: wrap
  gap: 8px
  .function-button, > .el-button
    flex: 1 1 130px
    width: auto
    margin: 0
.label-input>.el-input__wrapper
  display: none
.label-input
  .el-input-group__append
    width: calc(100% - 140px)
    padding: 0
    background-color: transparent
    border-left: solid 1px var(--el-border-color)
    .el-select
      width: 100%
.about-logo
  width: 160px
  display: block
  margin: 12px auto 0

// 致谢区:大肥鱼 / universc
.credits-section
  display: flex
  justify-content: center
  gap: 48px
  margin-top: 8px
  .credit-person
    display: flex
    flex-direction: column
    align-items: center
    gap: 8px
    .credit-avatar
      width: 72px
      height: 72px
      border-radius: 50%
      object-fit: cover
      border: solid 2px var(--el-border-color)
    a
      font-size: 14px
      color: var(--el-color-primary, #409eff)
      text-decoration: none
      &:hover
        text-decoration: underline
.credit-note
  margin-top: 14px
  text-align: center
  font-size: 13px
  color: var(--el-text-color-secondary, #888)

// 使用说明页排版
.guide-section
  text-align: left
  margin-top: 14px
  padding: 0 4px 12px
  border-bottom: solid 1px var(--el-border-color-lighter, var(--el-border-color))
  &:last-child
    border-bottom: none
  .guide-title
    margin: 0 0 4px
    font-size: 15px
    color: var(--el-text-color-primary)
  .guide-text
    color: var(--el-text-color-regular)
    font-size: 13px
    line-height: 1.8
    white-space: pre-line
.guide-about-section
  .el-descriptions
    margin-top: 8px

.setting-tabs
  // 标签栏均分居中
  .el-tabs__header
    .el-tabs__nav-wrap
      .el-tabs__nav
        display: flex
        width: 100%
        .el-tabs__item
          flex: 1
          justify-content: center
          padding: 0 4px
  .el-tabs__content
    max-height: 70vh
    overflow-y: auto
    padding-right: 10px
    scroll-behavior: smooth
    overscroll-behavior: contain
    -webkit-overflow-scrolling: touch
  .context-menu-group
    border: solid 1px var(--el-border-color)
    border-radius: 6px
    padding: 10px 12px
    margin-bottom: 8px
    .context-menu-title
      font-weight: 600
      margin-bottom: 8px
      text-align: left
    .el-checkbox-group
      display: flex
      flex-wrap: wrap
      gap: 4px 16px
      text-align: left
    .el-checkbox
      margin-right: 0
  // 关于页:更新日志(默认收缩,点击展开)
  .changelog-collapse
    border-top: none
    .el-collapse-item__header
      height: auto
      min-height: 36px
      line-height: 1.5
      padding: 6px 0
      font-weight: 600
    .changelog-version
      color: var(--el-color-primary)
    .changelog-summary
      margin-left: 8px
      font-size: 12px
      font-weight: 400
      color: var(--el-text-color-secondary)
    .el-collapse-item__content
      padding-bottom: 8px
    .changelog-list
      margin: 0
      padding-left: 18px
      li
        font-size: 12px
        line-height: 1.7
        color: var(--el-text-color-regular)
        list-style: disc
  .changelog-box
    margin-top: 6px
    border: 1px solid var(--el-border-color-lighter)
    border-radius: 8px
    padding: 10px 12px
    background-color: var(--el-fill-color-extra-light, transparent)
    text-align: left
    max-height: 320px
    overflow-y: auto
    .changelog-item + .changelog-item
      margin-top: 10px
      border-top: 1px dashed var(--el-border-color-lighter)
      padding-top: 10px
    .changelog-version
      font-weight: 600
      font-size: 13px
      color: var(--el-color-primary)
      margin-bottom: 4px
    .changelog-list
      margin: 0
      padding-left: 18px
      li
        font-size: 12px
        line-height: 1.7
        color: var(--el-text-color-regular)
        list-style: disc
  // 高级页分区标题(与下方行距统一,视觉更整齐)
  .advanced-section-title
    font-weight: 600
    font-size: 13px
    color: var(--el-text-color-primary)
    border-left: 3px solid var(--el-color-primary)
    padding-left: 8px
    margin: 18px 0 10px
    line-height: 18px
    text-align: left
    &:first-child
      margin-top: 4px
  // 设置项说明文字(灰字小提示)
  .setting-hint
    font-size: 12px
    line-height: 1.6
    color: var(--el-text-color-secondary)
    margin: 2px 0 6px
    text-align: left
  // 高级页里的行:统一左右对齐与间距
  .el-tab-pane > .el-row
    .el-col
      padding-bottom: 2px
  // 工具栏按钮编辑
  .toolbar-section-label
    font-size: 12px
    color: var(--el-text-color-secondary)
    margin-bottom: 6px
    text-align: left
  .toolbar-sort-list
    display: flex
    flex-wrap: wrap
    gap: 8px
    .toolbar-sort-item
      display: flex
      align-items: center
      gap: 6px
      padding: 4px 8px 4px 10px
      border: solid 1px var(--el-border-color)
      border-radius: 16px
      background-color: var(--el-fill-color-light)
      cursor: grab
      transition: box-shadow .2s ease, transform .2s ease
      &:hover
        box-shadow: 0 2px 8px rgba(0, 0, 0, .1)
      .drag-handle
        color: var(--el-text-color-secondary)
        font-size: 14px
        cursor: grab
      .toolbar-item-icon
        color: var(--el-color-primary)
      // 常驻元素(设置按钮)的标记:能排序但不能关
      .toolbar-item-always
        margin-left: 6px
        padding: 0 4px
        font-size: 11px
        border: 1px solid var(--el-border-color-lighter)
        border-radius: 3px
        color: var(--el-text-color-secondary)
      .toolbar-sort-label
        font-size: 13px
      .toolbar-remove-btn
        margin: 0
        padding: 2px 4px
  .toolbar-hidden-list
    display: flex
    flex-wrap: wrap
    gap: 8px
    .toolbar-hidden-tag
      cursor: pointer
      transition: transform .2s ease
      &:hover
        transform: scale(1.05)
  .toolbar-tip
    color: var(--el-text-color-secondary)
    font-size: 12px
    text-align: left
  // 右键菜单排序:已显示的项可拖动,未显示的项是标签
  // 设置界面内的按钮 / 标签 / 拖拽项一律不可选中,避免拖动时把文字框选成蓝色
  .el-button, .el-tag, .el-switch__label, .el-checkbox, .context-menu-sort-item, .context-menu-title, .setting-label
    user-select: none
  // 菜单项 / 设置栏按钮:点击切换显示,直接拖动排序(⿻ 手柄或整项都可以)
  .context-menu-sort-list
    display: flex
    flex-wrap: wrap
    gap: 8px
    margin-top: 6px
  .context-menu-sort-item
    display: flex
    align-items: center
    gap: 6px
    padding: 4px 12px
    cursor: grab
    .drag-handle
      color: var(--el-text-color-secondary)
      cursor: grab
    .context-menu-sort-label
      display: inline-flex
      align-items: center
      gap: 3px
      cursor: pointer
    border: solid 1px var(--el-border-color)
    border-radius: 16px
    background-color: var(--el-fill-color-light)
    color: var(--el-text-color-primary)
    font-size: 13px
    cursor: pointer
    user-select: none
    transition: box-shadow .2s ease, opacity .2s ease
    &:hover
      box-shadow: 0 2px 8px rgba(0, 0, 0, .1)
  // 已隐藏的项:灰色(点击可重新启用)
  .context-menu-sort-item-off
    opacity: .45
    color: var(--el-text-color-secondary)
    background-color: transparent
  // 自定义主题面板
  // 自定义主题面板:横排紧凑布局(每项「标签 + 控件」并排,自动换行)
  .custom-theme-panel
    border: solid 1px var(--el-border-color)
    border-radius: 8px
    padding: 6px 14px 10px
    display: flex
    flex-wrap: wrap
    align-items: center
    gap: 8px 18px
    .theme-hint-full
      flex: 1 1 100%
      margin: 4px 0 0
    // 分组:颜色一排、字体一排(每组独占一行,内部再自动换行)
    .theme-group
      flex: 1 1 100%
      display: flex
      flex-wrap: wrap
      align-items: center
      gap: 8px 18px
    // 「清除」按钮:框窄一点,别占地方
    .theme-clear-btn
      padding: 0 4px
      min-width: 0
      height: 22px
    .theme-row
      display: inline-flex
      align-items: center
      gap: 8px
      padding: 2px 0
      flex: 0 0 auto
      .theme-label
        flex: 0 0 auto
        text-align: left
        font-size: 13px
        white-space: nowrap
        color: var(--el-text-color-regular)
      .theme-value
        flex: 0 0 auto
        display: inline-flex
        align-items: center
        gap: 6px
        min-width: 0
        .el-input-number
          width: 104px
        .el-select
          width: 160px
        .el-checkbox
          margin-right: 0
        .el-color-picker
          flex: 0 0 auto
    // 背景图 / 自定义图标:内容较长,独占一行
    .theme-row-wide
      flex: 1 1 100%
      .theme-value
        flex: 1 1 auto
        .el-input
          flex: 1 1 auto
  // 超分过滤设置(开关 + 宽×高阈值)
  .upscale-filter-row
    display: flex
    align-items: center
    flex-wrap: wrap
    gap: 8px
    .upscale-filter-sep, .upscale-filter-unit
      font-size: 12px
      color: var(--el-text-color-secondary)
    .el-input-number
      width: 120px
  // 恢复全部默认
  .reset-all-row
    margin-top: 18px
    padding-top: 12px
    border-top: solid 1px var(--el-border-color-lighter, var(--el-border-color))
  // 账户管理
  .account-list
    .account-row
      display: flex
      align-items: center
      gap: 10px
      padding: 7px 4px
      border-bottom: dashed 1px var(--el-border-color-lighter, var(--el-border-color))
      .account-name
        min-width: 160px
        font-weight: 500
      .account-actions
        margin-left: auto
    text-align: center
</style>