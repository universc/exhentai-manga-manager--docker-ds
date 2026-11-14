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
        <!-- 运行模式选择已移除:本地 / 远程在「账户」页用「本地模式」「远程模式」两块直接操作 -->
        <!-- 数据文件位置(漫画库位置见下方) -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'local'">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="dataPathText" @change="applyDataPath">
                <template #prepend><span class="setting-label">{{$t('m.dataPath')}}</span></template>
                <template #append><el-button @click="selectDataPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.dataPathHint')}}</div>
          </el-col>
        </el-row>
        <!-- 元数据存放位置(只影响 metadata.sqlite 一个文件):和数据存放目录一样是「路径类」设置,
             所以从「高级」搬回「常用」,紧跟在数据存放目录后面 -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'local'">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.metadataPath" :placeholder="$t('m.metadataPathDefault')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.metadataPath')}}</span></template>
                <template #append>
                  <el-button-group>
                    <el-button @click="selectMetadataPath">{{$t('m.select')}}</el-button>
                    <el-button v-if="setting.metadataPath" @click="followDataPath">{{$t('m.metadataPathFollow')}}</el-button>
                  </el-button-group>
                </template>
              </el-input>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.metadataPathHint')}}</div>
          </el-col>
        </el-row>

        <!-- 漫画库 / 图片查看器 / 主题(应用名称已移到「高级 → 自定义主题」;远程模式的服务器设置已移到「账户」页) -->
        <el-row :gutter="8">
          <el-col :span="24">
            <!-- 一排 = 一个漫画库:库名(就是「库文件夹」这几个字,可改名)+ 库文件夹(只读,不能输入/清空)+ 库数据存放位置 -->
            <div v-for="lib in libraries" :key="lib.id" class="setting-line library-row">
              <el-input v-model="lib.name" class="library-name-input" @change="onLibraryNameChange" />
              <span v-if="!isLibActive(lib)" class="library-inactive">{{$t('m.libraryInactive')}}</span>
              <el-input class="library-path-input" :model-value="lib.path" readonly />
              <el-input class="library-data-input" v-model="lib.dataPath" :placeholder="libraryDataDirPlaceholder(lib)" @change="onLibraryDataPathChange(lib)">
                <template #prepend><span class="setting-label">{{$t('m.libraryDataPath')}}</span></template>
                <template #append><el-button @click="selectLibraryDataPath(lib)">{{$t('m.select')}}</el-button></template>
              </el-input>
              <!-- 重建这个库(只清这个库的书架数据/封面,磁盘上的漫画不动) -->
              <el-popconfirm
                placement="top-start"
                :title="$t('m.rebuildOneWarn', { name: lib.name })"
                @confirm="rebuildLibraryOf(lib)"
              >
                <template #reference>
                  <el-button class="library-rebuild-btn" plain :icon="MdRefresh" :loading="libraryBusy" :title="$t('m.rebuildLibrary')">{{ $t('m.rebuildShort') }}</el-button>
                </template>
              </el-popconfirm>
              <!-- 删除按钮在最右边(只从列表移除,不动磁盘文件) -->
              <el-button class="library-remove-btn" type="danger" plain :icon="Delete" :title="$t('m.libraryRemove')" @click="removeLibraryRow(lib)" />
            </div>
            <div class="setting-line library-actions">
              <el-button :loading="libraryBusy" @click="addLibrary">{{$t('m.libraryAdd')}}</el-button>
              <span class="toolbar-tip">{{$t('m.libraryHint')}}</span>
            </div>
            <!-- 库切换:一个框 = 一组库;工具栏「切换库」按钮点一下切到下一个框,书架显示该框内所有库合并 -->
            <!-- 说明统一收进右边的感叹号(多行 popover),下面不再重复小字 -->
            <div class="setting-line library-boxes-title">
              <span class="label-with-hint">
                {{$t('m.switchBoxes')}}
                <SettingHint
                  :title="$t('m.switchBoxes')"
                  :lines="[$t('m.hintSwitchBox'), $t('m.switchBoxHint'), $t('m.ehOnlineBoxHint')]"
                />
              </span>
            </div>
            <div v-for="(box, bi) in switchBoxes" :key="box.id" class="setting-line library-box-row">
              <span class="library-box-index">{{ bi + 1 }}</span>
              <el-select v-model="box.libraryIds" multiple class="library-box-select" :placeholder="$t('m.switchBoxLibraries')" @change="onBoxesChange">
                <el-option v-for="lib in boxSelectableLibraries" :key="lib.id" :label="lib.label" :value="lib.id" :disabled="!lib.selectable" />
              </el-select>
              <el-button type="danger" plain :icon="Delete" :disabled="switchBoxes.length <= 1" :title="$t('m.libraryRemove')" @click="removeSwitchBox(bi)" />
              <span v-if="activeBoxIndex === bi" class="library-box-current">{{$t('m.switchBoxCurrent')}}</span>
            </div>
            <div class="setting-line library-actions">
              <el-button @click="addSwitchBox">{{$t('m.switchBoxAdd')}}</el-button>
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
                <div class="theme-select-group">
                  <el-select placeholder=" " v-model="setting.theme" @change="handleThemeChange">
                    <el-option label="Default Dark" value="dark"></el-option>
                    <el-option label="Default Light" value="light"></el-option>
                    <el-option label="ExHentai" value="dark exhentai"></el-option>
                    <el-option label="E-Hentai" value="light e-hentai"></el-option>
                    <el-option label="nHentai" value="dark nhentai"></el-option>
                    <!-- 废弃主题1：把重构版的皮肤贴回旧版 DOM（皮肤级主题，不恢复新组件） -->
                    <el-option :label="$t('m.deprecatedTheme1')" value="light deprecated1"></el-option>
                    <el-option :label="$t('m.customTheme')" value="custom"></el-option>
                  </el-select>
                  <!-- 「高级主题」与主题下拉拼成同一个框,点开的也是紧贴的浮层(不再单独弹对话框) -->
                  <el-popover placement="bottom-end" :width="280" trigger="click" popper-class="advanced-theme-popover">
                    <template #reference>
                      <el-button class="advanced-theme-btn">{{$t('m.advancedTheme')}}</el-button>
                    </template>
                    <div class="setting-line">
                      <el-switch v-model="setting.pixelTheme" @change="handlePixelThemeChange" />
                      <span class="setting-label" style="margin-left:10px">{{$t('m.pixelTheme')}}</span>
                    </div>
                    <div class="setting-hint">{{$t('m.pixelThemeHint')}}</div>
                    <div class="setting-line" style="margin-top:8px">
                      <el-switch v-model="setting.autoTheme" :disabled="!setting.pixelTheme" @change="handleAutoThemeChange" />
                      <span class="setting-label" style="margin-left:10px">{{$t('m.autoTheme')}}</span>
                    </div>
                    <div class="setting-hint">{{$t('m.autoThemeHint')}}</div>

                  </el-popover>
                </div>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.proxy" @change="saveSetting" :placeholder="$t('m.like') + ' http://127.0.0.1:7890'">
                <template #prepend><span class="setting-label">{{$t('m.proxy')}}</span></template>
                <template #append><el-button :loading="proxyTesting" @click="testProxy">{{$t('m.test')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
        </el-row>
        <!-- 回收站:删除的漫画先移到这里,可随时恢复(桌面版/网页版都显示 —— 网页版正是以前永久删除的重灾区) -->
        <el-row :gutter="8">
          <!-- 回收站:删除的漫画先移到这里,可随时恢复 -->
          <el-col :span="24">
            <el-divider content-position="left">
              <span class="emm-divider-label label-with-hint">{{$t('m.trashSection')}}<SettingHint :title="$t('m.trashSection')" :lines="[$t('m.hintTrash'), $t('m.trashHint')]" /></span>
            </el-divider>
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
            <span class="setting-hint-value" style="margin-left:10px">{{ trashDir }}</span>
          </el-col>
        </el-row>
        <!-- 删除记录(delete-log.jsonl):记录每一次删除/还原/彻底删除,删错了能查是谁、什么时候、从哪删的 -->
        <!-- 像素风格设置:音效 / 封面清晰度 / 块大小 / 颜色数量 / 算法 / 网格 -->
    <el-dialog v-model="pixelSettingVisible" :title="$t('m.pixelSettings')" width="46em" append-to-body>
      <div class="setting-line">
        <el-switch v-model="setting.pixelSfx" @change="handlePixelThemeChange" />
        <span class="setting-label" style="margin-left:10px">{{$t('m.pixelSfx')}}</span>
      </div>
      <div class="setting-line" style="margin-top:10px">
        <span class="setting-label">{{$t('m.pixelCoverLevel')}}</span>
        <el-slider v-model="setting.pixelCoverLevel" :min="0" :max="100" :step="5" style="width:180px;margin-left:10px" @change="saveSetting" />
      </div>
      <div class="setting-hint">{{$t('m.pixelCoverLevelHint')}}</div>
      <div class="setting-line" style="margin-top:10px">
        <span class="setting-label">{{$t('m.pixelBlockSize')}}</span>
        <el-slider v-model="setting.pixelBlockSize" :min="2" :max="20" :step="1" :disabled="!setting.pixelCoverLevel" style="width:180px;margin-left:10px" @change="saveSetting" />
      </div>
      <div class="setting-line" style="margin-top:10px">
        <span class="setting-label">{{$t('m.pixelColorCount')}}</span>
        <el-slider v-model="setting.pixelColorCount" :min="2" :max="64" :step="2" :disabled="!setting.pixelCoverLevel" style="width:180px;margin-left:10px" @change="saveSetting" />
      </div>
      <div class="setting-line" style="margin-top:10px">
        <span class="setting-label">{{$t('m.pixelAlgorithm')}}</span>
        <el-select v-model="setting.pixelAlgorithm" size="small" style="width:180px;margin-left:10px" :disabled="!setting.pixelCoverLevel" @change="saveSetting">
          <el-option :label="$t('m.pixelAlgoAverage')" value="average" />
          <el-option :label="$t('m.pixelAlgoCenter')" value="center" />
          <el-option :label="$t('m.pixelAlgoDither')" value="dither" />
          <el-option :label="$t('m.pixelAlgoNone')" value="none" />
        </el-select>
      </div>
      <div class="setting-line" style="margin-top:10px">
        <el-switch v-model="setting.pixelShowGrid" :disabled="!setting.pixelCoverLevel" @change="saveSetting" />
        <span class="setting-label" style="margin-left:10px">{{$t('m.pixelShowGrid')}}</span>
      </div>
      <template #footer>
        <el-button @click="pixelSettingVisible = false">{{$t('m.close')}}</el-button>
      </template>
    </el-dialog>
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
                  <el-option :label="$t('m.viewerEndActionDetail')" value="detail"></el-option>
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
              <div class="context-menu-title">
                <span class="label-with-hint">
                  {{$t('m.viewerToolbarButtons')}}
                  <SettingHint :title="$t('m.viewerToolbarButtons')" :lines="[$t('m.hintSettingBar'), $t('m.viewerToolbarButtonsHint')]" />
                </span>
              </div>
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
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.tagSettings')" name="collectTag">
        <!-- ★ 整页标签设置现在是独立组件:设置页与管理界面共用同一个 TagSettingsSection,
             所以「类别胶囊 / 标签列表 / 已收藏标签 / 收藏与随机开关 / 语言 / 更新词库」在两边完全一致。 -->
        <TagSettingsSection ref="tagSectionRef" @refresh="emit('loadBookList')" />
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
            <div class="setting-line regexp">
              <el-input v-model="setting.trimTitleRegExp" :placeholder="$t('m.trimTitleRegExpInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.trimTitleRegExp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <!-- ★ 2026-11 移除(用户要求):「预定义搜索项」与「搜索关键词后缀」两个高级设置项。
               前者只是搜索框的候选词、后者是抓元数据时自动拼在关键词后面的尾巴,
               都不常用还占一整行,直接删掉;底层字段仍然保留(老配置不会报错)。 -->
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.excludeFile" :placeholder="$t('m.excludeFileInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.excludeFile')}}</span></template>
              </el-input>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.excludeFileAuto')}}</div>
          </el-col>
          <!-- ★ 2026-11 移除:「文件夹树宽度」这个设置项已经无效 ——
               文件夹树改成入坞面板后,宽度由面板右缘拖动决定并存在 localStorage
               ('emmFolderTreePanelWidth'),不再读 setting.folderTreeWidth。
               留着一个调了没反应的输入框只会误导用户,直接删掉。 -->
          <!-- 每页数量 + 惯性滑动(放在自定义CSS上方,只保留设置框) -->
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.customPageSizes" :placeholder="$t('m.pageSizeCustomPlaceholder')" @change="handlePageSizesChange">
                <!-- 这一行不再放感叹号(用户要求:行内/控件旁一律不放,只保留分区标题右侧的) -->
                <template #prepend>
                  <span class="setting-label">{{$t('m.pageSizeCustom')}}</span>
                </template>
                <template #append>
                  <el-button @click="appendPageSizeComma">,</el-button>
                </template>
              </el-input>
            </div>
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
            <!-- 不用 active-text:它的文字会溢出 el-switch 的盒子,和后面的文字叠在一起(用户截图 204)。
                 改成显式的 .switch-label 让开关与文字各占各的位置;
                 这一行不放感叹号(用户要求:行内一律不放,只保留分区标题右侧的) -->
            <el-switch v-model="setting.loadOnStart" @change="saveSetting" />
            <span class="switch-label">{{$t('m.onStartScan')}}</span>
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


        <!-- ================= 卡片样式 ================= -->
        <!-- 扫描与性能 -->
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.scanPerfSection')}}<SettingHint :title="$t('m.scanPerfSection')" :lines="[
          $t('m.hintScanPerf'),
          $t('m.hintScanConcurrency'), $t('m.scanConcurrencyHint'),
          $t('m.hintCoverConcurrency'), $t('m.coverConcurrencyHint'),
          $t('m.hintInertia'), $t('m.scrollInertiaTip'), $t('m.inertiaParamsTip')
        ]" /></span></div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.scanConcurrency')}}</span>
              <el-input-number v-model="setting.scanConcurrency" :min="1" :max="16" :step="1" @change="saveSetting" />
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.coverConcurrency')}}</span>
              <el-input-number v-model="setting.coverConcurrency" :min="1" :max="16" :step="1" @change="saveSetting" />
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.scrollInertia')}}</span>
              <el-switch v-model="setting.inertiaEnabled" @change="saveSetting"></el-switch>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.inertiaEnabled">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.inertiaFriction')}}</span>
              <el-slider style="flex: 1 1 220px; max-width: 380px;" v-model="setting.inertiaFriction" :min="0.5" :max="1" :step="0.01" :show-input="true" :show-input-controls="false" @change="saveSetting"></el-slider>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.inertiaEnabled">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.inertiaMaxVelocity')}}</span>
              <el-slider style="flex: 1 1 220px; max-width: 380px;" v-model="setting.inertiaMaxVelocity" :min="100" :max="12000" :step="100" :show-input="true" :show-input-controls="false" @change="saveSetting"></el-slider>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.inertiaEnabled">
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="setting-label">{{$t('m.inertiaFollow')}}</span>
              <el-slider style="flex: 1 1 220px; max-width: 380px;" v-model="setting.inertiaFollow" :min="0.05" :max="1" :step="0.01" :show-input="true" :show-input-controls="false" @change="saveSetting"></el-slider>
            </div>
          </el-col>
        </el-row>
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.cardStyle')}}<SettingHint :title="$t('m.cardStyle')" :lines="[$t('m.hintCardStyle')]" /></span></div>
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
          <!-- 二号样式:主界面只留「封面 + 标题」的密集网格(尺寸见下方第二套配置) -->
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.cardStyle2"
              :active-text="$t('m.cardStyle2')"
              @change="handleCoverStyleChange"
            />
          </el-col>
          <!-- 「合集」角标只出现在主界面的合集卡上 → 属于普通卡片开关(以前错放在合集界面分组里) -->
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideCollectionTag"
              :active-text="$t('m.hideCollectionTag')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <!-- 尺寸配置:普通样式一套、二号样式一套。启用二号样式后这里自动切换成第二套 -->
        <template v-if="!setting.cardStyle2">
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
        </template>
        <template v-else>
          <!-- 二号样式的第二套尺寸(默认值取用户给的参考图:140×210,间距 6/8) -->
          <el-row :gutter="8">
            <el-col :span="12">
              <div class="setting-line">
                <NameFormItem class="label-input" prependWidth="100px">
                  <template #prepend><span class="setting-label">{{$t('m.uiZoom')}}</span></template>
                  <el-input-number v-model="setting.style2UiZoom" :min="50" :max="300" :step="10" :value-on-clear="100" controls-position="right" placeholder="100" @change="handleCoverStyleChange" />
                </NameFormItem>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="setting-line">
                <NameFormItem class="label-input" prependWidth="100px">
                  <template #prepend><span class="setting-label">{{$t('m.coverWidth')}}</span></template>
                  <el-input-number v-model="setting.style2CoverWidth" :min="80" :max="800" :step="10" :value-on-clear="140" controls-position="right" placeholder="140" @change="handleCoverStyleChange" />
                </NameFormItem>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="setting-line">
                <NameFormItem class="label-input" prependWidth="100px">
                  <template #prepend><span class="setting-label">{{$t('m.coverHeight')}}</span></template>
                  <el-input-number v-model="setting.style2CoverHeight" :min="100" :max="1200" :step="10" :value-on-clear="220" controls-position="right" placeholder="220" @change="handleCoverStyleChange" />
                </NameFormItem>
              </div>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="12">
              <div class="setting-line">
                <NameFormItem class="label-input" prependWidth="100px">
                  <template #prepend><span class="setting-label">{{$t('m.cardGapV')}}</span></template>
                  <el-input-number v-model="setting.style2CardGapV" :min="0" :max="40" :step="2" :value-on-clear="6" controls-position="right" placeholder="6" @change="handleCoverStyleChange" />
                </NameFormItem>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="setting-line">
                <NameFormItem class="label-input" prependWidth="100px">
                  <template #prepend><span class="setting-label">{{$t('m.cardGapH')}}</span></template>
                  <el-input-number v-model="setting.style2CardGapH" :min="0" :max="40" :step="2" :value-on-clear="8" controls-position="right" placeholder="8" @change="handleCoverStyleChange" />
                </NameFormItem>
              </div>
            </el-col>
          </el-row>
        </template>
        <!-- 合集界面卡片:是「卡片样式」的分支(不是同级分区),只管打开合集后
             底部抽屉里那些卡片;主界面的合集卡跟普通卡片走同一套开关。
             带一个总开关:关掉时抽屉卡片完全跟随主界面样式,打开后才展开下面的设置。 -->
        <div class="advanced-subsection-title with-switch">
          <span class="label-with-hint">{{$t('m.collectionCardStyle')}}<SettingHint :title="$t('m.collectionCardStyle')" :lines="[$t('m.hintCollectionCardStyle')]" /></span>
          <el-switch
            v-model="setting.collectionCardStyleEnabled"
            :active-text="$t('m.collectionCardStyleEnable')"
            @change="handleCoverStyleChange"
          />
        </div>
        <template v-if="setting.collectionCardStyleEnabled">
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideBookmarkButton"
              :active-text="$t('m.hideBookmarkButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideCount"
              :active-text="$t('m.hidePageCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideReadCount"
              :active-text="$t('m.hideReadCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideReadButton"
              :active-text="$t('m.hideReadButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideNonTag"
              :active-text="$t('m.hideNonTag')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideTitle"
              :active-text="$t('m.hideTitle')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionHideRating"
              :active-text="$t('m.hideRating')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionFillCover"
              :active-text="$t('m.fillCover')"
              @change="saveSetting"
            />
          </el-col>
          <!-- 二号样式:抽屉里换成「封面 + 标题」的密集网格(尺寸沿用下面这套合集尺寸) -->
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.collectionCardStyle2"
              :active-text="$t('m.cardStyle2')"
              @change="handleCollectionStyle2Change"
            />
          </el-col>
        </el-row>
        <!-- 合集界面卡片的第二套尺寸(只作用在打开合集后的底部抽屉) -->
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.uiZoom')}}</span></template>
                <el-input-number v-model="setting.collectionUiZoom" :min="50" :max="300" :step="10" :value-on-clear="100" controls-position="right" placeholder="100" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverWidth')}}</span></template>
                <el-input-number v-model="setting.collectionCoverWidth" :min="80" :max="800" :step="10" :value-on-clear="220" controls-position="right" placeholder="220" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverHeight')}}</span></template>
                <el-input-number v-model="setting.collectionCoverHeight" :min="100" :max="1200" :step="10" :value-on-clear="360" controls-position="right" placeholder="360" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapV')}}</span></template>
                <el-input-number v-model="setting.collectionCardGapV" :min="0" :max="40" :step="2" :value-on-clear="6" controls-position="right" placeholder="6" @change="saveSetting" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapH')}}</span></template>
                <el-input-number v-model="setting.collectionCardGapH" :min="0" :max="40" :step="2" :value-on-clear="6" controls-position="right" placeholder="6" @change="saveSetting" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>
        </template>

        <!-- 工具栏按钮自定义(设置按钮始终保留) -->
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.toolbarButtons')}}<SettingHint :title="$t('m.toolbarButtons')" :lines="[$t('m.hintToolbarButtons'), $t('m.toolbarButtonsHint')]" /></span></div>
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
          </el-col>
        </el-row>

        <!-- 自定义主题 -->
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.customTheme')}}<SettingHint :title="$t('m.customTheme')" :lines="[$t('m.hintCustomTheme'), $t('m.themeAlphaHint'), $t('m.pixelSettingsHint')]" /></span></div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="custom-theme-panel">
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
                <el-button size="small" :disabled="!setting.pixelTheme" @click="pixelSettingVisible = true">{{$t('m.pixelSettings')}}</el-button>
              </div>
              <div class="theme-row theme-row-wide">
                <span class="theme-label">{{$t('m.customIcon')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.customIconPath" size="small" :placeholder="$t('m.customIconPlaceholder')" @change="handleCustomIconChange" />
                  <el-button size="small" @click="selectCustomImage('icon')">{{$t('m.select')}}</el-button>
                  <el-button v-if="setting.customIconPath" size="small" text type="danger" @click="clearCustomImage('icon')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <!-- 应用名称(浏览器标签页 / 窗口标题显示的名字):原来在「常用」,按用户要求移到这里 -->
              <div class="theme-row theme-row-wide">
                <!-- 本分区标题(自定义主题)右侧已经有一个感叹号,这里不再重复放 -->
                <span class="theme-label">{{$t('m.appNameSetting')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.appName" size="small" :placeholder="$t('m.appNamePlaceholder')" @change="handleAppNameChange" />
                </div>
              </div>
            </div>
          </el-col>
        </el-row>

<!-- 右键菜单自定义:拖动排序 + 点击 ✕ 取消 / 点击标签加回 -->
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.contextMenu')}}<SettingHint :title="$t('m.contextMenu')" :lines="[$t('m.hintContextMenu'), $t('m.contextMenuSortHint')]" /></span></div>
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
        <div class="advanced-section-title"><span class="label-with-hint">{{$t('m.clickPolicy')}}<SettingHint :title="$t('m.clickPolicy')" :lines="[$t('m.hintClickPolicy'), $t('m.clickPolicyHint')]" /></span></div>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickCover')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickCoverAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickTitle')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickTitleAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
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
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
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
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
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
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
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
                  <el-option :label="$t('m.clickActionSideDetail')" value="sideDetail"></el-option>
                  <el-option :label="$t('m.clickActionNone')" value="none"></el-option>
                </el-select>
              </NameFormItem>
            </div>
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
      <!-- 功能设置:左边内容、右边选项(图片超分 / 图片上色 / 信息处理 / 下载 / 文件移动) -->
      <div class="feature-settings">
        <!-- 左侧选项 -->
        <div class="feature-menu">
          <div
            v-for="f in featureTabs"
            :key="f.id"
            class="feature-menu-item"
            :class="{ active: activeFeature === f.id }"
            @click="activeFeature = f.id"
          >{{ f.label }}</div>
        </div>
        <div class="feature-content">
          <div class="feature-pane" v-show="activeFeature === 'upscale'">
            <el-row :gutter="8">
                        <el-col :span="24">
                          <div class="setting-line">
                            <el-divider content-position="left">
                              <span class="emm-divider-label label-with-hint">{{$t('m.imageUpscale')}}<SettingHint :title="$t('m.imageUpscale')" :lines="[
                                $t('m.hintUpscale'), $t('m.localModelComicReadHint'), $t('m.upscaleFilterHint'), $t('m.autoUpscaleHint')
                              ]" /></span>
                            </el-divider>
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
                        </el-col>
                        <!-- 两个开关并排:启用过滤 / 自动超分(阅读) -->
                        <el-col :span="12" class="setting-switch">
                          <el-switch v-model="setting.upscaleSkipHighRes" :active-text="$t('m.upscaleSkipHighRes')" @change="saveSetting" />
                        </el-col>
                        <el-col :span="12" class="setting-switch">
                          <el-switch v-model="setting.autoUpscale" :active-text="$t('m.autoUpscaleSection')" @change="saveSetting" />
                        </el-col>
                        <!-- 清理超分替换原文件时留下的 .bak 备份 -->
                        <el-col :span="24">
                          <div class="setting-line">
                            <el-button type="danger" plain size="small" @click="deleteAllBakFiles">{{$t('m.deleteAllBak')}}</el-button>
                          </div>
                        </el-col>
          
              <el-col :span="24">
                          <div class="setting-line">
                            <el-divider content-position="left">
                              <span class="emm-divider-label label-with-hint">{{$t('m.apiProfiles')}}<SettingHint :title="$t('m.apiProfiles')" :lines="[$t('m.hintApiProfile')]" /></span>
                            </el-divider>
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
                            <el-divider content-position="left">
                              <span class="emm-divider-label label-with-hint">本地模型<SettingHint title="本地模型" :lines="[$t('m.hintLocalModel'), $t('m.hintLocalModelOffline')]" /></span>
                            </el-divider>
                          </div>
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
                          <div class="setting-line toolbar-tip">当前代理:{{ setting.proxy || "未设置" }}</div>
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
          </div>
          <div class="feature-pane" v-show="activeFeature === 'colorize'">
            <el-row :gutter="8">
              <el-col :span="24">
                          <div class="setting-line">
                            <el-divider content-position="left">
                              <span class="emm-divider-label label-with-hint">{{$t('m.imageColorize')}}<SettingHint :title="$t('m.imageColorize')" :lines="[$t('m.hintColorize')]" /></span>
                            </el-divider>
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
          
            </el-row>
          </div>
          <div class="feature-pane" v-show="activeFeature === 'metadata'">
            <el-row :gutter="8">
              <el-col :span="24">
                          <div class="setting-line">
                            <el-divider content-position="left">
                              <span class="emm-divider-label label-with-hint">{{$t('m.aiInfoProcessing')}}<SettingHint :title="$t('m.aiInfoProcessing')" :lines="[$t('m.hintAiInfo'), $t('m.aiProcessTip'), $t('m.imageApiTip')]" /></span>
                            </el-divider>
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
          
            </el-row>
          </div>
          <div class="feature-pane" v-show="activeFeature === 'download'">
            <el-row :gutter="8">
              <el-col :span="24">
                <div class="custom-theme-panel download-setting-panel">
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadPath')}}</span>
                                  <div class="theme-value download-path-value">
                                    <el-input v-model="setting.downloadPath" size="small" :placeholder="$t('m.downloadPathPlaceholder')" @change="saveSetting">
                                      <template #append><el-button size="small" @click="pickDownloadPath">{{$t('m.select')}}</el-button></template>
                                    </el-input>
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadConcurrency')}}</span>
                                  <div class="theme-value">
                                    <el-input-number v-model="setting.downloadConcurrency" :min="1" :max="10" :step="1" size="small" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadPageRate')}}</span>
                                  <div class="theme-value rate-inputs">
                                    <el-input-number v-model="setting.downloadPageRate" :min="0" :max="1000" :step="1" size="small" controls-position="right" @change="saveSetting" />
                                    <span class="rate-sep">页 /</span>
                                    <el-input-number v-model="setting.downloadPageRateSec" :min="0" :max="3600" :step="5" size="small" controls-position="right" @change="saveSetting" />
                                    <span class="rate-sep">秒</span>
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadPageRateHint')}}</div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadOriginalDefault')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.downloadOriginal" @change="saveSetting" />
                                  </div>
                                </div>
                                <!-- 勾上后点「下载」不再弹窗,直接用下面的下载目录 + 默认名称 -->
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadUseDefault')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.downloadUseDefault" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadUseDefaultHint')}}</div>
                                <!-- 失败任务自动重试(主进程里定时跑,关掉网页也会继续) -->
                                <div class="download-subsection-title">{{$t('m.downloadRetryTitle')}}</div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadRetryEnabled')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.retryEnabled" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadRetryInterval')}}</span>
                                  <div class="theme-value">
                                    <el-input-number v-model="setting.retryIntervalMin" :min="1" :max="1440" :step="5" size="small" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadRetryTimes')}}</span>
                                  <div class="theme-value">
                                    <el-input-number v-model="setting.retryTimes" :min="0" :max="99" :step="1" size="small" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadRetryHint')}}</div>
                                <!-- 请求频率限制:照 JHenTai 的 Rate(maximum/period),防 EH 限速最有效 -->
                                <div class="download-subsection-title">{{$t('m.downloadRateTitle')}}</div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadMaxPerPeriod')}}</span>
                                  <div class="theme-value">
                                    <el-input-number v-model="setting.downloadMaxPerPeriod" :min="0" :max="20" :step="1" size="small" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadPeriodSec')}}</span>
                                  <div class="theme-value">
                                    <el-input-number v-model="setting.downloadPeriodSec" :min="0.1" :max="60" :step="0.5" size="small" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadRateHint')}}</div>
              
                </div>
              </el-col>
            </el-row>
          </div>
          <div class="feature-pane" v-show="activeFeature === 'fileMove'">
            <el-row :gutter="8">
              <el-col :span="24">
                <div class="custom-theme-panel download-setting-panel">
                  <!-- 默认移动路径:下载记录头部的「移动」用它(填了并启用就直接移,不再弹选择)。
                                     只能在「已有库的文件夹及其子文件夹」里选,不允许随便一个目录。 -->
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadMoveDefaultPath')}}</span>
                                  <div class="theme-value download-path-value">
                                    <LibraryFolderPicker v-model="setting.moveDefaultPath" :placeholder="$t('m.downloadMovePick')" @update:model-value="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadMoveDefaultPathEnabled')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.moveDefaultPathEnabled" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadMoveDefaultPathHint')}}</div>
                                <!-- 单本移动路径:记录上的移动按钮用它(同样只能选库里的目录) -->
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadMoveSinglePath')}}</span>
                                  <div class="theme-value download-path-value">
                                    <LibraryFolderPicker v-model="setting.moveSinglePath" :placeholder="$t('m.downloadMovePick')" @update:model-value="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadMoveSinglePathHint')}}</div>
                                <!-- 下载完成后自动移动:下完就搬到指定目录,不用再手点「移动」 -->
                                <div class="download-subsection-title">{{$t('m.downloadAutoMoveTitle')}}</div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadAutoMoveEnabled')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.downloadAutoMoveEnabled" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadAutoMovePath')}}</span>
                                  <div class="theme-value download-path-value">
                                    <LibraryFolderPicker v-model="setting.downloadAutoMovePath" :placeholder="$t('m.downloadMovePick')" @update:model-value="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadAutoMoveHint')}}</div>
                                <!-- 移动完成后移除记录:移进库里就把下载记录删掉,列表不会越积越多 -->
                                <div class="theme-row theme-row-wide">
                                  <span class="theme-label">{{$t('m.downloadRemoveAfterMove')}}</span>
                                  <div class="theme-value">
                                    <el-switch v-model="setting.downloadRemoveAfterMove" @change="saveSetting" />
                                  </div>
                                </div>
                                <div class="setting-hint">{{$t('m.downloadRemoveAfterMoveHint')}}</div>
                                <div class="setting-hint">{{$t('m.downloadSettingsHint')}}</div>
            
                </div>
              </el-col>
            </el-row>
          </div>
        </div>
      </div>
    </el-tab-pane><el-tab-pane v-if="isWebLoggedIn || !isWebMode" :label="$t('m.accounts')" name="accounts">
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
            <!-- ① 本地模式:本机账户(远程桌面模式下登录的是 NAS 账户,标题见下方「远程模式」) -->
            <template v-if="!isWebMode">
              <div class="account-section-title">{{$t('m.localMode')}}</div>
              <div class="setting-line toolbar-tip">{{$t('m.localAccountHint')}}</div>
            </template>
            <!-- ② 网页版:账户在 NAS 上 -->
            <template v-else>
              <div class="account-section-title">{{$t('m.accounts')}}</div>
            </template>
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px;">
              <span>{{$t('m.loginUsername')}}: <b>{{authUsername}}</b></span>
              <el-tag :type="isAdmin ? 'danger' : 'info'" size="small">{{isAdmin ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
              <span style="flex: 1"></span>
              <el-button type="danger" plain size="small" @click="logout">{{$t('m.logout')}}</el-button>
            </div>
            <template v-if="isAdmin && !isRemoteDesktop">
              <div class="setting-line toolbar-tip" style="margin-top: 14px;">{{$t('m.accountsTip')}}</div>
              <div class="account-list">
              <div class="account-row" v-for="user in accountList" :key="user.username">
                <span class="account-name">{{user.username}}</span>
                <el-tag :type="user.role === 'admin' ? 'danger' : 'info'" size="small">{{user.role === 'admin' ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text @click="resetAccountPassword(user.username)">{{$t('m.resetPassword')}}</el-button>
                  <!-- 管理员也能删:后端只要求「至少保留一个管理员」,所以最后一个管理员的按钮置灰 -->
                  <el-button size="small" text type="danger" :disabled="user.role === 'admin' && adminCount <= 1" @click="removeAccount(user.username)">{{$t('m.deleteAccount')}}</el-button>
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
            <!-- IP 访问控制:白名单免登录 / 黑名单禁止连接(仅网页版有「客户端 IP」的概念) -->
            <template v-if="isWebMode">
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
            <!-- EH 账号(ExHentai):登录方式 / 四项 Cookie / EH在线 漫画库 —— 全部平铺,不折叠 -->
            <div class="account-divider"></div>
            <div class="account-section-title">{{$t('m.ehSetting')}}</div>
            <!-- 登录状态 -->
            <div class="setting-line eh-login-bar">
              <span class="setting-label">{{$t('m.ehLoginStatus')}}</span>
              <el-tag size="small" :type="ehLoggedIn ? 'success' : 'info'" effect="plain">
                {{ ehLoggedIn ? $t('m.ehLoggedInAs', { name: setting.ehOnlineUser || setting.ipb_member_id || '-' }) : $t('m.ehNotLoggedIn') }}
              </el-tag>
            </div>
            <!-- ① 账号密码登录:纯 HTTP,桌面版与网页版(Docker)都能用 -->
            <div class="setting-line eh-login-bar">
              <el-input v-model="ehUsername" size="small" class="eh-login-input" :placeholder="$t('m.ehAccount')" clearable />
              <el-input v-model="ehPassword" size="small" class="eh-login-input" type="password" show-password :placeholder="$t('m.ehPassword')" @keyup.enter="doEhLogin" />
              <el-button type="primary" :loading="ehLoginLoading || ehPasswordLoginLoading" @click="doEhLogin">{{$t('m.ehLogin')}}</el-button>
            </div>
            <!-- ② 其余登录方式:登录窗口(桌面)/ 粘贴或手填 Cookie / 退出 -->
            <div class="setting-line">
              <el-button v-if="ehLoggedIn" size="small" plain @click="doEhLogout">{{$t('m.ehLogout')}}</el-button>
              <el-button size="small" @click="pasteEhCookie">{{$t('m.ehPasteCookie')}}</el-button>
              <el-button size="small" plain @click="clearEhCookie">{{$t('m.ehClearCookie')}}</el-button>
            </div>
            <div class="setting-line toolbar-tip">{{ isDesktopClient ? $t('m.ehLoginHint') : $t('m.ehLoginHintWeb') }}</div>
            <div class="setting-hint" style="margin-bottom:8px">{{$t('m.ehSettingHint')}}</div>
            <div class="setting-line">
              <el-input v-model="setting.igneous" @change="onEhCookieChange">
                <template #prepend><span class="setting-label">igneous</span></template>
              </el-input>
            </div>
            <div class="setting-line">
              <el-input v-model="setting.ipb_pass_hash" @change="onEhCookieChange">
                <template #prepend><span class="setting-label">ipb_pass_hash</span></template>
              </el-input>
            </div>
            <div class="setting-line">
              <el-input v-model="setting.ipb_member_id" @change="onEhCookieChange">
                <template #prepend><span class="setting-label">ipb_member_id</span></template>
              </el-input>
            </div>
            <div class="setting-line">
              <el-input v-model="setting.star" @change="onEhCookieChange">
                <template #prepend><span class="setting-label">star</span></template>
              </el-input>
            </div>
            <!-- EH 在线漫画库:登录后书架多出一个「EH在线」,切过去直接浏览 EH 上的漫画 -->
            <div class="advanced-section-title" style="margin-top: 18px;">{{$t('m.ehOnline')}}</div>
            <div class="setting-line">
              <el-switch v-model="setting.ehOnlineEnabled" :disabled="!ehLoggedIn" @change="saveSetting" />
              <span class="setting-label" style="margin-left:10px">{{$t('m.ehOnlineEnable')}}</span>
            </div>
            <div class="setting-line toolbar-tip">{{ ehLoggedIn ? $t('m.ehOnlineEnableHint') : $t('m.ehOnlineNeedLogin') }}</div>
            <!-- WebP 转码开关:默认关(直通更快);打开 = 老行为「先糊后清晰」 -->
            <div class="setting-line">
              <el-switch v-model="setting.ehWebpTranscode" @change="saveSetting" />
              <span class="setting-label" style="margin-left:10px">{{$t('m.ehWebpTranscode')}}</span>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.ehWebpTranscodeHint')}}</div>
            <!-- ③ 远程模式(桌面版):连接 NAS 上的网页版/Docker,像网页一样取 NAS 上的漫画。
                 本地模式与远程模式用一条分割线分开。 -->
            <template v-if="showDesktopUI">
              <div class="account-divider"></div>
              <div class="account-section-title">{{$t('m.serverMode')}}</div>
              <div class="setting-line toolbar-tip">{{$t('m.remoteModeSectionHint')}}</div>
              <!-- 已连接:显示当前服务器,可退回本地模式 -->
              <template v-if="isRemoteDesktop">
                <div class="setting-line">
                  <span class="setting-label">{{$t('m.remoteCurrentServer')}}</span>
                  <b style="margin-left: 8px;">{{setting.remoteServer}}</b>
                </div>
                <div class="setting-line function-button-row">
                  <el-button class="function-button" type="danger" plain @click="exitServerMode">{{$t('m.exitServerMode')}}</el-button>
                </div>
              </template>
              <!-- 未连接:填地址与账户后连接 -->
              <template v-else>
                <el-row :gutter="8">
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
                </el-row>
              </template>
              <div class="setting-line toolbar-tip">{{$t('m.webModeHint')}}</div>
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
            <el-descriptions-item :label="$t('m.updatedVersion')+':'">
              <a href="#" @click="openLink('https://github.com/universc/exhentai-manga-manager--docker-ds')">github.com/universc/exhentai-manga-manager--docker-ds</a>
            </el-descriptions-item>
          </el-descriptions>
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
  <!-- 「编辑标签」名称编辑器:放在模板根层级(不再嵌在设置弹窗里)。
       它是 append-to-body 的独立弹窗,嵌在设置弹窗内部时,设置弹窗只要没打开过就整个不会被创建,
       于是 App.vue 右键「编辑标签」调 openTagNameEditor 会「什么都没发生」。 -->
  <el-dialog v-model="tagEditVisible" :title="tagEditIsCategory ? $t('m.tagCatEditNames') : $t('m.editTag')" width="380px" append-to-body>
    <div class="tag-name-editor">
      <p class="tag-edit-raw">{{ tagEditTitle }}</p>
      <!-- 类别:标签可以换类别(保存时会把全库这条标签一起搬过去) -->
      <div class="tag-cat-editor" v-if="!tagEditIsCategory">
        <span class="tag-color-label">{{ $t('m.category') }}</span>
        <el-select v-model="tagEditCat" size="small" style="width: 150px;">
          <el-option v-for="g in allTagsGroups" :key="g.cat" :label="categoryLabel(g.cat)" :value="g.cat" />
        </el-select>
      </div>
      <div class="tag-name-hint">{{ $t('m.tagMultiNameHint') }}</div>
      <!-- 默认名称排在最上面:显示时「选了语言但该语言没填」就回退到这个名称 -->
      <el-input v-model="tagEditLangs['default']" size="small" :placeholder="$t('m.tagNameDefault')" />
      <el-input v-model="tagEditLangs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
      <el-input v-model="tagEditLangs['zh-TW']" size="small" :placeholder="$t('m.tagNameZhTw')" />
      <el-input v-model="tagEditLangs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
      <el-input v-model="tagEditLangs.en" size="small" :placeholder="$t('m.tagNameEn')" />
    </div>
    <!-- 标签颜色:以前放在下方表单里,现在合并到「编辑标签」弹窗(关联标签上方) -->
    <div class="tag-color-editor" v-if="!tagEditIsCategory">
      <span class="tag-color-label">{{ $t('m.tagColor') }}</span>
      <el-color-picker v-model="tagEditColor" show-alpha :predefine="moderateSoftColors" />
      <el-button v-if="tagEditColor" size="small" text @click="tagEditColor = ''">{{ $t('m.reset') }}</el-button>
    </div>
    <!-- 关联标签:包含 / 被包含。类别是最大的分类,不参与包含关系,所以只在编辑标签时显示 -->
    <div class="tag-relation-editor" v-if="!tagEditIsCategory">
      <div class="tag-relation-title">{{ $t('m.tagRelations') }}</div>
      <div class="tag-relation-add">
        <el-select v-model="tagRelationCat" size="small" :placeholder="$t('m.pickCategory')" style="width: 104px;">
          <el-option v-for="c in tagRelationCats" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <!-- 「选择标签」:点击才弹出下拉;下拉里的标签横排铺开(与详细信息里标签的排版一致) -->
        <el-select
          v-model="tagRelationPick"
          size="small"
          clearable
          style="width: 156px;"
          popper-class="tag-relation-dropdown"
          :placeholder="$t('m.pickTag')"
        >
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
      <!-- 删除放在最下方:类别删类别,标签删标签 -->
      <el-button
        size="small"
        type="danger"
        plain
        class="tag-edit-delete"
        @click="tagEditIsCategory ? deleteTagCategory() : deleteEditingTag()"
      >{{ tagEditIsCategory ? $t('m.deleteCategory') : $t('m.deleteTag') }}</el-button>
      <el-button size="small" @click="tagEditVisible = false">{{ $t('m.cancel') }}</el-button>
      <el-button size="small" type="primary" @click="saveTagNames">{{ $t('m.saveTagNames') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import dayuAvatar from '../assets/dayu.png'
import appIcon from '../assets/icon.png'
import universcAvatar from '../assets/universc.png'
import { ref, onMounted, h, computed, watch } from 'vue'
import LibraryFolderPicker from './LibraryFolderPicker.vue'
import TagSettingsSection from './TagSettingsSection.vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { MdRefresh, MdSync, MdShuffle, MdCodeDownload, MdBook, MdColorPalette, MdPhonePortrait, MdFunnel, MdOptions, MdCloudDownload, MdSettings } from '@vicons/ionicons4'
import { Delete, InfoFilled } from '@element-plus/icons-vue'
import { TreeViewAlt, CicsSystemGroup, Maximize, Catalog } from '@vicons/carbon'
import { sortCatsByOrder, tagCatRank, getDisplayTagName, tagColorOf, tagDisplayPrefix, tagNameVariants, categoryDisplayName, FALLBACK_CAT, isBuiltinCat } from '../utils.js'
import { Search32Filled, ArrowTrendingLines20Filled } from '@vicons/fluent'

import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import zhTw  from 'element-plus/dist/locale/zh-tw.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import { version } from '../../package.json'
import { gh_token } from '../../secret_key.json'
import { acceleratorInfo, defaultContextMenuOptions, mergeContextMenuOptions, applyCustomTheme, clearCustomTheme, applyPixelTheme, applyFavicon, applyCoverStyle, applyAppName, customFontStyles, toolbarButtonDefinitions, defaultToolbarButtons, ensureToolbarButtons, insertMissingToolbarItems, TOOLBAR_NEW_ITEMS, TOOLBAR_ALWAYS_ITEMS, defaultUiSettings, parsePageSizes , catDisplayName, contextMenuDefinitions, resolveCatKey , markContextMenuItemDisabled } from '../utils.js'
import { attachInertiaScroll } from '../inertia-scroll.js'
import NameFormItem from './NameFormItem.vue'
import SettingHint from './SettingHint.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { EH_ONLINE_ID, hasEhCookies, parseCookieString } from '../ehOnline.js'
const appStore = useAppStore()
const { searchTypeList, setting, bookList, resolvedTranslation, localeFile, tagListRaw, cat2letter,
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
  // 管理合集 / 管理标签已合并成一个「管理」按钮,图标沿用原来的合集图标
  manage: CicsSystemGroup,
  viewerSwitch: MdBook,
  themeSwitch: MdColorPalette,
  fullscreen: Maximize,
  detailPanel: InfoFilled,
  // 下面几项以前缺图标,「设置 → 高级 → 工具栏按钮」列表里是空白
  switchLibrary: Catalog,
  filter: MdOptions,
  downloads: MdCloudDownload,
  setting: MdSettings,
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
  // 新增元素插到定义顺序里前一个元素之后(与主界面共用 utils.js 的同一个函数)
  return insertMissingToolbarItems(ids).map(id => map.get(id)).filter(Boolean)
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

// 下载文件夹:选一个目录(与其它「选择文件夹」入口同一套 IPC)
const pickDownloadPath = async () => {
  try {
    const folder = await ipcRenderer.invoke('select-folder', t('m.downloadPath'))
    if (folder) {
      setting.value.downloadPath = folder
      saveSetting()
    }
  } catch (e) { /* 用户取消 */ }
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
  // 二号样式的第二套尺寸:清空时回到参考图的默认值(140×210,间距 6/8,缩放 100)
  const fill2 = (key, def, min, max) => {
    let v = Number(setting.value[key])
    if (!Number.isFinite(v) || v === 0) v = def
    setting.value[key] = Math.min(max, Math.max(min, v))
  }
  fill2('style2UiZoom', 100, 50, 300)
  fill2('style2CoverWidth', 140, 80, 800)
  fill2('style2CoverHeight', 220, 100, 1200)
  fill2('style2CardGapV', 6, 0, 40)
  fill2('style2CardGapH', 8, 0, 40)
  // 合集界面卡片的独立尺寸(抽屉):清空同样回到默认值
  fill2('collectionUiZoom', 100, 50, 300)
  fill2('collectionCoverWidth', 220, 80, 800)
  fill2('collectionCoverHeight', 360, 100, 1200)
  fill2('collectionCardGapV', 6, 0, 40)
  fill2('collectionCardGapH', 6, 0, 40)
  applyCoverStyle(setting.value)
  // 卡片尺寸 / 样式变了:主界面首屏要重新填满(二号样式一行能放十几张,24 张不到一屏时
  // 没有滚动条也滚不动) —— 通知 App 重新铺一次
  emit('cover-style-change')
  saveSetting()
}
// 合集界面卡片「二号样式」开关:
// 打开时如果合集尺寸还是旧默认(220×360、间距 6/6),顺手换成与主界面二号样式一致的密度
// (140×220、间距 6/8) —— 否则抽屉里一张卡比抽屉还高,标题直接被裁在可视区外。
const handleCollectionStyle2Change = () => {
  const s = setting.value
  if (s.collectionCardStyle2 &&
      Number(s.collectionCoverWidth) === 220 && Number(s.collectionCoverHeight) === 360 &&
      Number(s.collectionCardGapV) === 6 && Number(s.collectionCardGapH) === 6 &&
      Number(s.collectionUiZoom) === 100) {
    s.collectionCoverWidth = 140
    s.collectionCoverHeight = 220
    s.collectionCardGapH = 8
  }
  handleCoverStyleChange()
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
  // 文字阅读器专用(图片模式不会显示)
  { id: 'novelFont', labelKey: 'm.novelFont' },
  { id: 'novelLineHeight', labelKey: 'm.novelLineHeight' },
  { id: 'novelLetterSpacing', labelKey: 'm.novelLetterSpacing' },
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
      // 「重新生成封面」:紧跟在获取元数据之后(都是「按现有信息重建」类的操作)
      { id: 'regenerateCover', label: t('m.regenerateCover') },
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
  // 卡片样式/尺寸变了:App 要重新铺一次首屏(否则二号样式下 24 张不到一屏,
  // 没有滚动条 → 也滚不到下一批,看起来就是「加载数量不对」)
  'cover-style-change',
  // 库列表/切换框/活动库变了:App 必须清掉旧库的列表、数量、分页、选中态再重读
  'library-changed',
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
      // 多库:刷新库列表与每个库的「库数据目录」显示
      refreshLibraries()

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
      // 新增开关:老配置没有这个字段 → 默认关闭(继续显示「合集」标签,行为不变)
      if (res.hideCollectionTag === undefined) setting.value.hideCollectionTag = false
      // 合集卡片专属三项:老配置没有 → 沿用当前观感(成员数/阅读数都显示)
      if (res.collectionHideCount === undefined) setting.value.collectionHideCount = false
      if (res.collectionHideReadCount === undefined) setting.value.collectionHideReadCount = false
      if (res.coverWidth === undefined) setting.value.coverWidth = 220
      if (res.coverHeight === undefined) setting.value.coverHeight = 360
      // 卡片间距:旧版单值 cardGap → 拆分为 上下/左右 两个方向
      if (res.cardGapV === undefined) setting.value.cardGapV = res.cardGap !== undefined ? res.cardGap : 6
      if (res.cardGapH === undefined) setting.value.cardGapH = res.cardGap !== undefined ? res.cardGap : 6
      // 封面懒加载已是固定行为;旧"只显示封面(coverOnly)"改为独立开关「填充封面」:
      // - 曾开启 coverOnly 的用户:还原其联动隐藏项,并把新开关置为开(延续大图偏好)
      // - 其余用户:开关默认关(经典卡片布局)
      if (res.fillCover === undefined) setting.value.fillCover = !!res.coverOnly
      // 合集卡片的填充封面:老配置没有 → 跟随普通卡片此刻的值(观感不变),之后可单独改
      if (res.collectionFillCover === undefined) setting.value.collectionFillCover = !!setting.value.fillCover
      // 合集界面卡片:完整的一套开关 + 第二套尺寸(老配置没有 → 全部关/默认值)
      if (res.collectionHideBookmarkButton === undefined) setting.value.collectionHideBookmarkButton = false
      if (res.collectionHideReadButton === undefined) setting.value.collectionHideReadButton = false
      if (res.collectionHideNonTag === undefined) setting.value.collectionHideNonTag = false
      if (res.collectionHideTitle === undefined) setting.value.collectionHideTitle = false
      if (res.collectionHideRating === undefined) setting.value.collectionHideRating = false
      if (res.collectionUiZoom === undefined) setting.value.collectionUiZoom = 100
      if (res.collectionCoverWidth === undefined) setting.value.collectionCoverWidth = 220
      if (res.collectionCoverHeight === undefined) setting.value.collectionCoverHeight = 360
      if (res.collectionCardGapV === undefined) setting.value.collectionCardGapV = 6
      if (res.collectionCardGapH === undefined) setting.value.collectionCardGapH = 6
      // 合集界面卡片的总开关 / 二号样式:老配置没有 → 关(抽屉保持跟随主界面观感)
      if (res.collectionCardStyleEnabled === undefined) setting.value.collectionCardStyleEnabled = false
      if (res.collectionCardStyle2 === undefined) setting.value.collectionCardStyle2 = false
      // 二号样式:默认尺寸取「添加漫画」网格的观感(140 宽、3:4 封面 + 标题 = 220 高、间距 6/8)
      if (res.cardStyle2 === undefined) setting.value.cardStyle2 = false
      if (res.style2UiZoom === undefined) setting.value.style2UiZoom = 100
      if (res.style2CoverWidth === undefined) setting.value.style2CoverWidth = 140
      if (res.style2CardGapV === undefined) setting.value.style2CardGapV = 6
      if (res.style2CardGapH === undefined) setting.value.style2CardGapH = 8
      if (res.style2CoverHeight === undefined) setting.value.style2CoverHeight = 220
      // 上一版默认 210(封面不是 3:4):发布时间很短,统一挪到 220
      else if (Number(res.style2CoverHeight) === 210 && Number(res.style2CoverWidth) === 140) setting.value.style2CoverHeight = 220
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
      if (res.pixelTheme === undefined) setting.value.pixelTheme = false
      if (res.pixelSfx === undefined) setting.value.pixelSfx = true
      // 自动主题:像素风格打开时默认开启;封面清晰度默认 60
      if (res.autoTheme === undefined) setting.value.autoTheme = !!res.pixelTheme
      // 点击策略新默认值:单击封面/阅/读 = 内容界面,单击标题 = 详细界面(只迁移一次)
      if (!res.clickPolicyDefaultsV2) {
        setting.value.clickCoverAction = 'content'
        setting.value.clickYueAction = 'content'
        setting.value.clickTitleAction = 'detail'
        setting.value.clickPolicyDefaultsV2 = true
      }
      if (res.clickTitleAction === undefined) setting.value.clickTitleAction = 'detail'
      if (res.pixelCoverLevel === undefined) setting.value.pixelCoverLevel = 60
      if (res.pixelBlockSize === undefined) setting.value.pixelBlockSize = 4
      if (res.pixelColorCount === undefined) setting.value.pixelColorCount = 32
      if (res.pixelShowGrid === undefined) setting.value.pixelShowGrid = false
      if (res.pixelAlgorithm === undefined) setting.value.pixelAlgorithm = 'average'
      if (res.themeCustomButtonBg === undefined) setting.value.themeCustomButtonBg = ''
      if (res.themeCustomFontItalic === undefined) setting.value.themeCustomFontItalic = false
      if (res.themeCustomFontUnderline === undefined) setting.value.themeCustomFontUnderline = false
      if (res.customIconPath === undefined) setting.value.customIconPath = ''
      if (!Array.isArray(res.toolbarButtonsHidden)) setting.value.toolbarButtonsHidden = []
      setting.value.toolbarButtons = ensureToolbarButtons(res.toolbarButtons, res.toolbarButtonsHidden)
      if (res.customPageSizes === undefined) setting.value.customPageSizes = '12,24,42,72,500,5000,1000000'
      if (res.scrollInertiaLevel === undefined) setting.value.scrollInertiaLevel = 'medium'
      // 旧档位自动换算成物理参数(老配置升级后手感不变)
      const legacyInertia = {
        off: [false, 0.93, 1500], verylow: [true, 0.86, 600], low: [true, 0.9, 900],
        medium: [true, 0.93, 1500], high: [true, 0.95, 2400], veryhigh: [true, 0.965, 3300],
      }
      const lg = legacyInertia[res.scrollInertiaLevel] || legacyInertia.medium
      if (res.inertiaEnabled === undefined) setting.value.inertiaEnabled = lg[0]
      if (res.inertiaFriction === undefined) setting.value.inertiaFriction = lg[1]
      if (res.inertiaMaxVelocity === undefined) setting.value.inertiaMaxVelocity = lg[2]
      if (res.inertiaFollow === undefined) setting.value.inertiaFollow = 0.3
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

// ---------- 多库管理(第二十九轮) ----------
// 库列表来自 setting.libraries;所有增删改都提交给后端 apply-libraries,
// 由后端规范化、落盘,并在活动库变化时重建运行时(Manga 库数据库 / 快照 / 缩略图缓存)。
const libraries = computed(() => (setting.value && Array.isArray(setting.value.libraries)) ? setting.value.libraries : [])
const activeLibraryId = computed({
  get: () => (setting.value && setting.value.activeLibraryId) || (libraries.value[0] ? libraries.value[0].id : ''),
  set: (v) => { if (setting.value) setting.value.activeLibraryId = v }
})
const activeLibrary = computed(() => libraries.value.find(l => l.id === activeLibraryId.value) || libraries.value[0] || null)
// 库 id -> 后端解析出的「库数据目录」(仅用于显示;不写回设置,避免脏字段落盘)
const libraryDataDirs = ref({})
const libraryBusy = ref(false)
// 库切换框(工具栏「切换库」按框循环)
const switchBoxes = computed(() => (setting.value && Array.isArray(setting.value.switchBoxes)) ? setting.value.switchBoxes : [])
const activeBoxIndex = computed(() => Number.isInteger(setting.value?.activeBoxIndex) ? setting.value.activeBoxIndex : 0)
// 只有「已生效」的库(路径 + 库数据存放位置都填了)才能被选进框里
const activeLibraries = computed(() => libraries.value.filter(l => l.path && String(l.dataPath || '').trim()))
const isLibActive = (lib) => !!(lib && lib.path && String(lib.dataPath || '').trim())
// 「EH在线」是否已配置(登录 Cookie + 打开开关)
const ehOnlineAvailable = computed(() => !!setting.value.ehOnlineEnabled && hasEhCookies(setting.value))
// 「库切换」框里能勾的:真实库(已生效才可选)+ 前端虚拟库「EH在线」(配置好才可选,未配置置灰)
const boxSelectableLibraries = computed(() => {
  const real = libraries.value.map(l => ({
    id: l.id,
    label: isLibActive(l) ? l.name : l.name + ' ' + t('m.libraryInactive'),
    selectable: isLibActive(l)
  }))
  return [...real, {
    id: EH_ONLINE_ID,
    label: t('m.ehOnline') + (ehOnlineAvailable.value ? '' : ' ' + t('m.ehOnlineNotConfigured')),
    selectable: ehOnlineAvailable.value
  }]
})
const addSwitchBox = () => {
  setting.value.switchBoxes = [...switchBoxes.value, { id: 'box-' + Math.random().toString(16).slice(2, 12), libraryIds: [] }]
  applyLibraries()
}
const removeSwitchBox = (i) => {
  // 至少保留一个切换框(用户要求:默认那一条不能被删)
  if (switchBoxes.value.length <= 1) { ElMessage.warning(t('m.switchBoxKeepOne')); return }
  const boxes = switchBoxes.value.filter((_, idx) => idx !== i)
  setting.value.switchBoxes = boxes
  if (activeBoxIndex.value >= boxes.length) setting.value.activeBoxIndex = 0
  applyLibraries()
}
const onBoxesChange = () => { applyLibraries() }

// 每排「库数据存放位置」的 placeholder:显示后端解析出的默认目录(留空即用它)
const libraryDataDirPlaceholder = () => t('m.libraryDataPathDefault')

const applyLibrariesResponse = (res) => {
  // 双环境路径:界面上编辑的永远是「本端」那一组,另一端原值存在 pathOther/dataPathOther 里,
  // 提交时原样带回去 —— 这样两端共用一份 setting.json 也绝不会把对方的路径覆盖掉。
  const web = isWebMode.value
  const valid = res.libraries.map(l => {
    const deskPath = l.path || ''
    const deskData = l.dataPath || ''
    const webPath = l.pathWeb || ''
    const webData = l.dataPathWeb || ''
    return {
      id: l.id,
      name: l.name,
      path: web ? (webPath || deskPath) : deskPath,
      dataPath: web ? (webData || deskData) : deskData,
      pathOther: web ? deskPath : webPath,
      dataPathOther: web ? deskData : webData,
      // ⚠️ 必须把后端字段一起留在内存里:前端为了「不覆盖另一端」把它们转成了 pathOther,
      //    结果任何一次 save-setting(例如 App.vue 启动时的自动保存)都会把 pathWeb 抹掉,
      //    跨端路径翻译(封面/阅读)随之失效 —— 表现就是封面不加载、阅读一直转圈。
      pathWeb: webPath,
      dataPathWeb: webData
    }
  })
  const validIds = new Set(valid.map(l => l.id))
  // 保留还没填「库文件夹」的草稿行(点了添加但还没选目录),别让下一次提交把它冲掉
  const drafts = libraries.value.filter(l => !l.path && !validIds.has(l.id))
  setting.value.libraries = [...valid, ...drafts]
  setting.value.activeLibraryId = res.activeLibraryId
  setting.value.library = res.library
  if (Array.isArray(res.switchBoxes)) {
    setting.value.switchBoxes = res.switchBoxes.map(b => ({ id: b.id, libraryIds: Array.isArray(b.libraryIds) ? [...b.libraryIds] : [] }))
  }
  if (Number.isInteger(res.activeBoxIndex)) setting.value.activeBoxIndex = res.activeBoxIndex
  const map = {}
  res.libraries.forEach(l => { map[l.id] = l.dataDir })
  libraryDataDirs.value = map
}

// 用函数声明(会提升):onMounted 里也会调用它,避免 <script setup> 顶层的前向引用告警
async function refreshLibraries () {
  try {
    const res = await ipcRenderer.invoke('get-libraries')
    if (res && Array.isArray(res.libraries)) applyLibrariesResponse(res)
  } catch (e) { /* 忽略 */ }
}

// 提交整份库列表:只提交填了「库文件夹」的行(空行是前端草稿);
// 后端会按库名去重、落盘,并在活动库变化时重建运行时。
// ⚠ 快速连续操作(改库名 + 改数据目录、连点切换框)以前会被 libraryBusy 直接丢掉,
//   而前端 setting 已经改了 → 前后端库配置分叉(库混乱)。现在排队补一次提交。
let libraryApplyQueued = false
const applyLibraries = async () => {
  if (libraryBusy.value) { libraryApplyQueued = true; return }
  libraryBusy.value = true
  try {
    let rounds = 0
    do {
      libraryApplyQueued = false
      await applyLibrariesOnce()
      rounds++
    } while (libraryApplyQueued && rounds < 5)
  } finally {
    libraryBusy.value = false
  }
}

const applyLibrariesOnce = async () => {
  try {
    const web = isWebMode.value
    const payload = libraries.value
      .filter(l => l.path)
      .map(l => (web
        // 网页端:界面上的 path/dataPath 是容器路径 → 写进 pathWeb/dataPathWeb,桌面那组原样带回
        ? { id: l.id, name: l.name, path: l.pathOther || '', dataPath: l.dataPathOther || '', pathWeb: l.path, dataPathWeb: l.dataPath || '' }
        : { id: l.id, name: l.name, path: l.path, dataPath: l.dataPath || '', pathWeb: l.pathWeb || l.pathOther || '', dataPathWeb: l.dataPathWeb || l.dataPathOther || '' }))
    const activeId = payload.some(l => l.id === activeLibraryId.value) ? activeLibraryId.value : (payload[0] ? payload[0].id : '')
    const res = await ipcRenderer.invoke('apply-libraries', {
      libraries: JSON.parse(JSON.stringify(payload)),
      activeLibraryId: activeId,
      switchBoxes: JSON.parse(JSON.stringify(switchBoxes.value)),
      activeBoxIndex: activeBoxIndex.value
    })
    if (res && res.ok) {
      applyLibrariesResponse(res)
      // 增删库、改「库数据存放位置」、增删/改「库切换」框 —— 都会改变书架该显示哪些书。
      // 走 library-changed:主界面先清掉旧库的列表/数量/分页/选中态再重读,
      // 避免旧库的 displayBookList 残留导致切库后数量错误。
      emit('library-changed')
    } else {
      ElMessage.error((res && res.error) || t('m.librarySaveFailed'))
      refreshLibraries()
    }
  } catch (e) {
    ElMessage.error(String((e && e.message) || e))
    refreshLibraries()
  }
}

// 「添加库」:直接弹文件夹选择框,选完在列表末尾加一排
// (库文件夹是只读展示,不能再手输/清空,所以新增时必须先把目录选好)
const addLibrary = async () => {
  const picked = await ipcRenderer.invoke('select-folder', t('m.library'))
  if (!picked) return
  const p = String(picked)
  // 同一个文件夹可以建多个库(用户要求):各自有独立库名与库数据目录,互不覆盖
  const n = libraries.value.length + 1
  const lib = { id: 'lib-' + Math.random().toString(16).slice(2, 12), name: t('m.libraryDefaultName') + n, path: p, dataPath: '' }
  setting.value.libraries = [...libraries.value, lib]
  applyLibraries()
}

// 删除一排(每排右侧的删除按钮):只从列表移除,不动磁盘文件与库数据目录;至少保留一个库
const removeLibraryRow = async (lib) => {
  if (!lib) return
  // 不再限制「至少保留一个库」:可以全部删掉,书架就是空的(随时能再加回来)
  try {
    await ElMessageBox.confirm(t('m.libraryRemoveConfirm', { name: lib.name }), t('m.libraryRemove'), { type: 'warning' })
  } catch (e) { return }
  const next = libraries.value.filter(l => l.id !== lib.id)
  setting.value.libraries = next
  if (setting.value.activeLibraryId === lib.id) {
    const fallback = next.find(l => l.path) || next[0]
    setting.value.activeLibraryId = fallback ? fallback.id : ''
  }
  applyLibraries()
}

const onLibraryNameChange = () => { applyLibraries() }
const onActiveLibraryChange = () => { applyLibraries() }

// 库数据存放位置:v-model 直接绑到库里(可以手动输入,失焦/回车时提交)
const onLibraryDataPathChange = (lib) => {
  if (!lib) return
  lib.dataPath = String(lib.dataPath || '').trim()
  applyLibraries()
}
const selectLibraryDataPath = async (lib) => {
  if (!lib) return
  const picked = await ipcRenderer.invoke('select-folder', t('m.libraryDataPath'))
  if (!picked) return
  lib.dataPath = String(picked)
  applyLibraries()
}
const followLibraryDataPath = (lib) => {
  if (!lib || !lib.dataPath) return
  lib.dataPath = ''
  applyLibraries()
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
      // ★ 主进程已经把这本书直接写回库了,这里只要重新读书架(不扫描)
      if (res.added && res.added.id) emit('loadBookList', false)
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

// 清空元数据目录 = 跟随「数据文件位置」(和 Docker 版一样,元数据库放在数据目录里)
const followDataPath = () => {
  setting.value.metadataPath = ''
  saveSetting()
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

// 标签词库(EhTagTranslation):下载/缓存都交给主进程 —— 渲染进程直接 fetch GitHub
// 在 NAS / 国内网络下经常拿不到,拿不到就一直是原始英文标签。
const translationStatus = ref('')      // '' | 'loading' | 'ok' | 'fail'
const translationUpdatedAt = ref(0)
const translationUpdatedText = computed(() => {
  if (!translationUpdatedAt.value) return ''
  const d = new Date(translationUpdatedAt.value)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
})
// 把词库里的中文名写进「标签名称」(setting.tagNameLangs['分类::标签']['zh-CN'])。
// 只补空着的,不覆盖用户手填的;库里全部标签跑一遍,所以更新词库之后
// 双击任意标签都能看到对应名称(以前只有下载记录会写,库里标签永远空着)。
const backfillTagNames = async () => {
  const tr = resolvedTranslation.value || {}
  if (!tr || !Object.keys(tr).length) return 0
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const map = setting.value.tagNameLangs
  let changed = 0
  const put = (cat, tag) => {
    if (!cat || !tag) return
    const ck = resolveCatKey(cat)
    const hit = (tr[ck] || {})[tag]
    if (!hit || !hit.name) return
    const key = ck + '::' + tag
    const cur = map[key] || {}
    if (cur['zh-CN']) return
    map[key] = { ...cur, 'zh-CN': hit.name }
    changed++
  }
  for (const t of (tagListRaw.value || [])) put(t.cat, t.tag)
  for (const [cat, arr] of Object.entries(setting.value.globalTags || {})) {
    for (const t of (Array.isArray(arr) ? arr : [])) put(cat, t)
  }
  if (changed) {
    await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
    emit('loadBookList')
  }
  return changed
}

const loadTranslationFromEhTagTranslation = async (force = false) => {
  translationStatus.value = 'loading'
  try {
    const res = await ipcRenderer.invoke('load-tag-translation', { force: !!force })
    if (res && res.ok && res.data && Object.keys(res.data).length) {
      resolvedTranslation.value = res.data
      translationUpdatedAt.value = res.updatedAt || 0
      translationStatus.value = 'ok'
      ipcRenderer.invoke('update-tag-translation', res.data)
      // 词库到位后立刻补齐「标签名称」,不要求用户再逐个双击
      const n = await backfillTagNames()
      if (n && force) printMessage('success', t('m.tagTranslationUpdated') + ' ' + translationUpdatedText.value)
      return
    }
    // 主进程也拿不到(第一次且没网):退回本机以前缓存的旧词库,总比没有强
    const cache = JSON.parse(localStorage.getItem('translationCache') || '{}')
    if (cache && Object.keys(cache).length) {
      resolvedTranslation.value = cache
      translationStatus.value = 'ok'
    } else {
      translationStatus.value = 'fail'
    }
  } catch (e) {
    translationStatus.value = 'fail'
  }
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
  // ⚠ 必须在主进程里测:渲染进程的 fetch 不读 setting.proxy,
  //   以前这里直接 fetch EH,结果「代理明明连上了也一直报连接错误」
  proxyTesting.value = true
  try {
    const r = await ipcRenderer.invoke('test-proxy', { proxy: setting.value.proxy })
    if (r && r.ok) {
      printMessage('success', t('c.proxyWorking') + ` (${r.proxy}, HTTP ${r.status}, ${r.ms}ms)`)
    } else {
      printMessage('error', t('c.proxyNotWorking') + (r && r.error ? ' — ' + r.error : ''))
    }
  } catch (e) {
    printMessage('error', t('c.proxyNotWorking') + ' — ' + String((e && e.message) || e))
  } finally {
    proxyTesting.value = false
  }
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
  // 保留像素风格 / 自动主题这些附加 class(setAttribute 会把它们一起清掉)
  const root = document.documentElement
  const keepClasses = ['theme-pixel', 'theme-auto'].filter(c => root.classList.contains(c))
  root.setAttribute('class', classValue)
  keepClasses.forEach(c => root.classList.add(c))
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
// 「语言」下拉:接管全部标签与类别的显示语言。
//   · 选了具体语言 → 该语言有名称就显示该名称,没有则回退默认语言(原始名/词库名);
//   · 词库(EhTagTranslation)本身就是按语言给出的,所以选语言时一并确保词库已加载;
//   · 选「默认」→ 全部回到原始名(不再按词库翻译),与旧版「关闭翻译」等价。
const onTagLangChange = (val) => {
  setting.value.showTranslation = !!val
  if (val && typeof loadTranslationFromEhTagTranslation === 'function') loadTranslationFromEhTagTranslation()
  saveSettingNow()
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
// 运行模式不再由单选按钮切换:本地 / 远程取决于 setting.remoteServer(见 syncRunMode),
// 连接与退出由「账户」页「远程模式」块的按钮完成。
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
// 当前生效的数据目录(用来判断「值真的改了」才重启,避免只是点进来又点走也重启一次)
const currentDataPath = ref('')
const loadDataPath = async () => {
  if (!showDesktopUI.value) return
  const info = await ipcRenderer.invoke('get-data-path')
  if (info) {
    dataPathText.value = info.dataPath
    currentDataPath.value = info.dataPath
  }
}
const selectDataPath = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('m.dataPath'))
  if (folder) {
    dataPathText.value = folder
    applyDataPath()
  }
}
// 填完(回车 / 点别处)立即生效:写入 bootstrap.json 并自动重启一次 ——
// 数据目录是 App 启动时最先确定的东西(setting.json 自己就在里面),只能靠重启切换,但不用你再点按钮
const applyDataPath = async () => {
  const next = String(dataPathText.value || '').trim()
  if (!next || next === currentDataPath.value) return
  const res = await ipcRenderer.invoke('set-data-path', next)
  if (res && res.ok === false) {
    ElMessage.error(res.error || t('m.librarySaveFailed'))
    loadDataPath()
  }
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
    // 桌面版(Win 本地模式):走主进程 IPC(与 LoginDialog 同一套账户系统)
    if (!isWebMode.value && ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      const st = await ipcRenderer.invoke('auth-login', {
        username: webLoginUsername.value.trim(),
        password: webLoginPassword.value,
      })
      if (!st || !st.ok) throw new Error((st && st.error) || '登录失败')
      window.location.reload()
      return
    }
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

// 退出登录(设置 → 账户):网页版走 /api/auth/logout,桌面版走主进程 IPC
const logout = () => {
  // 桌面版(Win 本地模式)没有 HTTP 服务:交给主进程清掉会话,
  // 刷新后 web-ipc.js 重新 sendSync('auth-status') → 登录框随即弹出
  if (!isWebMode.value && ipcRenderer && typeof ipcRenderer.invoke === 'function') {
    Promise.resolve(ipcRenderer.invoke('auth-logout')).catch(() => {}).finally(() => {
      window.location.reload()
    })
    return
  }
  fetch('/api/auth/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => {
      window.location.reload()
    })
}
const accountList = ref([])
// 管理员数量:删除按钮据此置灰 —— 至少保留一个管理员(modules/auth.js 里还有一道后端校验)
const adminCount = computed(() => accountList.value.filter(u => u.role === 'admin').length)
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
  // 原来这里完全没有校验:密码随便填(甚至是空)就直接发 IPC,失败原因只从后端回显。
  // 现在与「重置密码」保持同一口径:用户名 / 密码都只要求非空,不限制位数。
  if (!String(newAccountUsername.value || '').trim()) {
    printMessage('error', t('m.usernameRequired'))
    return
  }
  if (!String(newAccountPassword.value || '').trim()) {
    printMessage('error', t('m.passwordRequired'))
    return
  }
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
      // 只校验非空:密码不再限制最少位数(与后端 modules/auth.js 的 validPassword 一致)
      inputValidator: (v) => (typeof v === 'string' && v.trim().length > 0) ? true : t('m.passwordRequired')
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
  // IP 访问控制只有网页版有:桌面版没有 auth-get-ip-rules 通道,
  // 调用会在主进程刷出「No handler registered for 'auth-get-ip-rules'」
  if (!isWebMode.value) return
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
    // ref 里的数组是 reactive 的,直接传会 structural-clone 失败,展开成普通数组
    whitelist: [...(ipWhitelist.value || [])],
    blacklist: [...(ipBlacklist.value || [])]
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

// 重建某个库:重建只会处理「活动库」,所以先切过去(用户点哪个库就重建哪个)
const rebuildLibraryOf = async (lib) => {
  if (!lib || !lib.id) return
  try {
    libraryBusy.value = true
    const sw = await ipcRenderer.invoke('set-active-library', lib.id)
    if (!sw || !sw.ok) {
      printMessage('error', (sw && sw.error) || t('m.librarySaveFailed'))
      return
    }
    // ★用后端返回的权威快照同步整份库状态。以前只改 activeLibraryId,
    //   activeBoxIndex / library / switchBoxes 还停在旧值,工具栏显示的框和后端
    //   实际活动库对不上 —— 下一次「切换库」就会从错位的序号继续走。
    if (Array.isArray(sw.libraries)) applyLibrariesResponse(sw)
    else setting.value.activeLibraryId = sw.activeLibraryId || lib.id
    await forceGeneBookList()
  } catch (e) {
    printMessage('error', String((e && e.message) || e))
  } finally {
    libraryBusy.value = false
  }
}
const forceGeneBookList = async () => {
  dialogVisibleSetting.value = false
  localStorage.setItem('viewerReadingProgress', JSON.stringify([]))
  await ipcRenderer.invoke('force-gene-book-list')
  // ★不再把 IPC 返回的裸列表直接塞进 store(那会绕过切库后的状态重建、留下旧库数量)。
  //   统一交给主界面:清空旧库视图 → 按当前库重新读书架 → 重建合集/文件夹树。
  emit('library-changed')
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

// 收藏标签用的下拉:只显示人读的名称(自定义 > 词库 > 原名),不再拼搜索语法
const tagListForCollect = computed(() => {
  return tagListRaw.value.map(({cat, tag, id}) => {
    const catKey = resolveCatKey(cat)
    return {
      label: `${categoryLabel(catKey)}:${getDisplayTagName(setting.value, catKey, tag) || tag}`,
      value: id
    }
  })
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

// 取消「收藏」:只从收藏列表里摘掉,**不动 globalTags**。
// ⚠ 以前这里调 remove-global-tag 并把 globalTags 里的同名项一起删了 ——
//   等于「取消收藏」直接把用户自建的全局标签删掉(语义完全反了)。
//   标签本身是否消失,是「删除标签」的事(设置页的删除按钮走 delete-tag);
//   收藏只是一份书签清单,不该有副作用。
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
    // 标签显示名:① 自定义(按目标语言) ② 词库(按目标语言) ③ 原始名
    const labelTail = getDisplayTagName(setting.value, resolveCatKey(tag.cat), tag.tag)
      || (setting.value.showTranslation ? (resolvedTranslation.value[resolveCatKey(tag.cat)]?.[tag.tag]?.name || tag.tag) : tag.tag)
    map[normCat].tags.push({ id: tag.id, cat: normCat, tag: tag.tag, letter: tag.letter, label: labelTail })
  }
  // 设置里登记的「全局标签」(用「增加标签」建的,不挂在任何书上):也要显示出来
  const globalTags = setting.value.globalTags || {}
  for (const [cat, arr] of Object.entries(globalTags)) {
    const normCat = resolveCatKey(cat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const have = new Set(map[normCat].tags.map(t => t.tag))
    for (const tag of (Array.isArray(arr) ? arr : [])) {
      if (!tag || have.has(tag)) continue
      have.add(tag)
      map[normCat].tags.push({
        id: normCat + ':' + tag, cat: normCat, tag,
        letter: cat2letter.value[normCat] || normCat,
        label: getDisplayTagName(setting.value, normCat, tag)
          || (setting.value.showTranslation ? (resolvedTranslation.value[normCat]?.[tag]?.name || tag) : tag),
      })
    }
  }
  // 内置「其他」类别永远存在(不可删除),用来接住被删类别的标签
  if (!map[FALLBACK_CAT]) {
    map[FALLBACK_CAT] = { cat: FALLBACK_CAT, tags: [] }
    groups.push(map[FALLBACK_CAT])
  }
  // 空类别:用户点「增加类别」建的类别还没有任何标签,它不是从 tagListRaw 来的,
  // 必须单独补进来,否则建完什么也看不见(旧逻辑只认「已有标签的分类」)。
  // 这类类别在列表里显示 0 个标签,点进去可以往里加标签。
  for (const raw of (Array.isArray(setting.value.tagCatOrder) ? setting.value.tagCatOrder : [])) {
    const normCat = resolveCatKey(raw)
    if (map[normCat]) continue
    map[normCat] = { cat: normCat, tags: [] }
    groups.push(map[normCat])
  }
  // 类别顺序跟着「设置 → 标签设置」里拖动调整的 tagCatOrder 走(未排序的排在后面)
  groups.sort((a, b) => tagCatRank(setting.value, a.cat) - tagCatRank(setting.value, b.cat))
  return groups
})

// 标签块里每个标签用什么颜色:设置里配过就用配的(收藏标签自带颜色兜底)
const tagChipColor = (tag) => {
  if (!tag) return ''
  return tagColorOf(setting.value, tag.cat, tag.tag) || ''
}
// 标签颜色 = 字体颜色(文字和描边走同一个色,不填背景)
const tagColorStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  return c ? { color: c, borderColor: c } : {}
}

// 收藏标签 chip 的填充样式（用户要求回到 1.14.x 的柔和色填充观感）：
// 背景直接填标签色；按亮度决定字色（亮黄等用深字，其余白字），保证可读。
const tagChipFillStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  if (!c) return {}
  const hex = (c.match(/^#([0-9a-f]{6})$/i) || [])[1]
  let dark = false
  if (hex) {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
    dark = (0.299 * r + 0.587 * g + 0.114 * b) > 168
  }
  return { backgroundColor: c, borderColor: c, color: dark ? '#3a3a3f' : '#ffffff' }
}

// 类别标签拖动排序:列表只用于拖拽,v-model 改动后写回 setting.tagCatOrder 并落盘。
// 存的是归一化后的英文类别键(resolveCatKey 已在 allTagsGroups 里统一),避免中英混用出现两条。
const orderedTagCats = computed({
  // 返回浅拷贝:vuedraggable 可能原地改写数组,直接交出去会毁掉 allTagsGroups 的计算缓存
  get: () => allTagsGroups.value.slice(),
  set: (val) => {
    if (!Array.isArray(val)) return
    setting.value.tagCatOrder = val.map(g => g.cat)
  },
})
// 拖动结束:立即落盘(这两个开关类操作不应被 500ms 防抖延迟,否则切页会「拖了没记上」)
const onTagCatOrderChange = () => {
  ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
}
// 单击=筛选该类别;双击=编辑类别名称。
// 浏览器的 click 总在 dblclick 之前派发,所以把单击的实际动作延后,
// 双击时先把定时器清掉,避免「弹窗刚开、筛选又被切走」。
let tagCatClickTimer = null
const onTagCatClick = (g) => {
  if (tagCatClickTimer) clearTimeout(tagCatClickTimer)
  tagCatClickTimer = setTimeout(() => {
    tagCatClickTimer = null
    selectedTagCat.value = selectedTagCat.value === g.cat ? null : g.cat
  }, 220)
}
const onTagCatDblClick = (g) => {
  if (tagCatClickTimer) { clearTimeout(tagCatClickTimer); tagCatClickTimer = null }
  openTagNameEditor({ cat: g.cat })
}
// 类别的「默认名称」:用户在编辑类别时填的 default 优先,否则用内置中文名。
// 类别标签上显示的就是这个默认名称(不再跟着语言下拉变)。
const categoryDefaultName = (cat) => {
  const key = resolveCatKey(cat)
  const rec = (setting.value.tagCatNameLangs || {})[key] || {}
  const d = String(rec['default'] || '').trim()
  return d || catDisplayName(key)
}
// 类别显示名:① 用户给类别起的多语言名 ② 在线词库的分类名 ③ 内置中文名 ④ 原键
// 自定义类别名:目标语言优先,没有则用默认名称(与全 app 统一的类别显示名同一套规则)
const categoryLabel = (cat) => categoryDisplayName(setting.value, resolvedTranslation.value, cat)

// ---------- 添加类别 ----------
// 只创建「空类别」:写进 setting.tagCatOrder 末尾,于是它会立刻出现在类别标签区(0 个标签),
// 之后往这个类别里加标签,它就会成为真正的标签分类。
const addCategoryVisible = ref(false)
const addCategoryName = ref('')
const openAddCategoryDialog = () => {
  addCategoryName.value = ''
  addCategoryVisible.value = true
}
const canAddCategory = computed(() => {
  const raw = String(addCategoryName.value || '').trim()
  if (!raw) return false
  const key = resolveCatKey(raw)
  const exists = (allTagsGroups.value || []).some(g => resolveCatKey(g.cat) === key)
  return !exists
})
const createCategory = async () => {
  if (!canAddCategory.value) return
  const key = resolveCatKey(String(addCategoryName.value).trim())
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  const order = setting.value.tagCatOrder.slice()
  if (!order.includes(key)) order.push(key)
  setting.value.tagCatOrder = order
  selectedTagCat.value = key
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  addCategoryVisible.value = false
  printMessage('success', t('m.tagCatAdded'))
}

// ---------- 添加标签 ----------
// 在选定的类别下新建一个标签 / 或给某本书加标签。
// 这里建的是「全局标签」:写进当前类别,库里所有书都能在下拉里选到它。
const addTagVisible = ref(false)
const addTagCat = ref('')
const addTagName = ref('')
const openAddTagDialog = (cat) => {
  addTagCat.value = resolveCatKey(cat || selectedTagCat.value || (allTagsGroups.value[0]?.cat || ''))
  addTagName.value = ''
  addTagVisible.value = true
}
const canAddTag = computed(() => {
  const raw = String(addTagName.value || '').trim()
  const cat = resolveCatKey(addTagCat.value)
  if (!raw || !cat) return false
  // 同类别下已存在同名标签则不允许重复建立
  const exists = (allTagsGroups.value.find(g => resolveCatKey(g.cat) === cat)?.tags || [])
    .some(t => String(t.tag).toLowerCase() === raw.toLowerCase())
  return !exists
})
const createGlobalTag = async () => {
  if (!canAddTag.value) return
  const cat = resolveCatKey(addTagCat.value)
  const name = String(addTagName.value).trim()
  // 建标签 = 让它出现在全库标签集合里:写进 tagCatOrder 保证类别可见,
  // 并由后端 add-global-tag 登记到 setting.globalTags(不挂任何书也能显示)
  const res = await ipcRenderer.invoke('add-global-tag', { cat, name })
  if (!res?.ok) {
    printMessage('error', res?.error || t('c.groupTagError'))
    return
  }
  // 本地立刻登记一份:allTagsGroups 只认 tagListRaw 与 setting.globalTags,
  // 不写这里就要等下一次「重新加载漫画库」才出现 —— 这正是「添加后不显示」的直接原因。
  if (!setting.value.globalTags || typeof setting.value.globalTags !== 'object') setting.value.globalTags = {}
  const gArr = Array.isArray(setting.value.globalTags[cat]) ? setting.value.globalTags[cat].slice() : []
  if (!gArr.includes(name)) gArr.push(name)
  setting.value.globalTags = { ...setting.value.globalTags, [cat]: gArr }
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  if (!setting.value.tagCatOrder.includes(cat)) setting.value.tagCatOrder.push(cat)
  // 落盘(后端会把 globalTags 与内存里的并集合并,不会把刚加的冲掉)
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  // 再拉一次全库标签,保证其它来源(metadata)也同步
  try { await appStore.loadAllTags() } catch (e) { /* 忽略 */ }
  addTagVisible.value = false
  printMessage('success', t('m.tagCatAdded'))
  emit('loadBookList')
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
// 类别本身也有多语言名称:存在 setting.tagCatNameLangs[cat] = { 'zh-CN', 'zh-TW', ja, en }
const tagEditIsCategory = ref(false)
const tagEditLangs = ref({ 'zh-CN': '', 'zh-TW': '', ja: '', en: '' })
// 标签颜色(改到「编辑标签」弹窗里设置):存 setting.tagColors['分类::标签']
const tagEditColor = ref('')
// 标签所属类别(保存时若变了,就把全库这条标签搬到新类别)
const tagEditCat = ref('')
const tagEditOrigCat = ref('')
// 标题分析(本地对比 + 格式识别,不调用 AI)
const titleAnalyzing = ref(false)
// 标题只显示所属类别,不再拼接标签名 —— 标签名已经交给下面的「默认名称」输入框编辑
const tagEditTitle = computed(() => {
  const it = tagEditItem.value
  if (!it) return ''
  if (tagEditIsCategory.value) return categoryLabel(it.cat) + ' (' + it.cat + ')'
  return categoryLabel(it.cat)
})
// tag 既可以是 { cat, tag }(标签),也可以是 { cat }(类别);类别用 isCategory 标记
const openTagNameEditor = (tag) => {
  tagRelationPick.value = ''
  if (!tag || !tag.cat) return
  const isCat = !tag.tag
  tagEditIsCategory.value = isCat
  const catKey = resolveCatKey(tag.cat)
  const rec = isCat
    ? ((setting.value.tagCatNameLangs || {})[catKey] || {})
    : ((setting.value.tagNameLangs || {})[catKey + '::' + tag.tag] || {})
  // 默认名称 = 标签/类别的原始名,可在弹窗里改;选了具体语言但没填时回退到它
  tagEditLangs.value = {
    'default': rec['default'] || (isCat ? catDisplayName(resolveCatKey(tag.cat)) : String(tag.tag || '')),
    // 没写过「标签名称」时,直接把词库里的中文名填进来(双击就能看到对应名称)
    'zh-CN': rec['zh-CN'] || (!isCat ? ((resolvedTranslation.value[catKey] || {})[tag.tag] || {}).name : '') || '',
    'zh-TW': rec['zh-TW'] || '', ja: rec.ja || '', en: rec.en || '',
  }
  tagEditItem.value = isCat ? { cat: resolveCatKey(tag.cat), isCategory: true } : tag
  tagEditCat.value = resolveCatKey(tag.cat)
  tagEditOrigCat.value = resolveCatKey(tag.cat)
  // 颜色:新键优先,兼容老数据(收藏标签里的 color)
  if (!isCat) {
    const key = catKey + '::' + tag.tag
    const old = ((setting.value.collectTag || []).find(x => x && (x.id === (catKey + ':' + tag.tag) || x.id === (tag.cat + ':' + tag.tag))) || {}).color
    tagEditColor.value = ((setting.value.tagColors || {})[key]) || old || ''
  } else {
    tagEditColor.value = ''
  }
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
      // 显示名与别处一致:自定义(按语言/默认名) > 词库 > 原始名
      const label = t.label || getDisplayTagName(setting.value, resolveCatKey(t.cat), t.tag) || t.tag
      out.push({ value: k, label })
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
  const lang = {
    'default': (tagEditLangs.value['default'] || '').trim(),
    'zh-CN': (tagEditLangs.value['zh-CN'] || '').trim(),
    'zh-TW': (tagEditLangs.value['zh-TW'] || '').trim(),
    ja: (tagEditLangs.value.ja || '').trim(),
    en: (tagEditLangs.value.en || '').trim(),
  }
  const empty = !lang['default'] && !lang['zh-CN'] && !lang['zh-TW'] && !lang.ja && !lang.en

  if (tagEditIsCategory.value) {
    if (!setting.value.tagCatNameLangs) setting.value.tagCatNameLangs = {}
    const ck = resolveCatKey(it.cat)
    if (empty) delete setting.value.tagCatNameLangs[ck]
    else setting.value.tagCatNameLangs[ck] = { ...(setting.value.tagCatNameLangs[ck] || {}), ...lang }
    await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
    tagEditVisible.value = false
    printMessage('success', t('m.saveTagNamesDone'))
    return
  }

  const oldCat = resolveCatKey(tagEditOrigCat.value || it.cat)
  const newCat = resolveCatKey(tagEditCat.value || oldCat)
  // 本标签的全部名字(用 / 分隔),用于查重
  const myNames = new Set()
  for (const v of Object.values(lang)) for (const n of String(v || '').split('/')) {
    const x = n.trim().toLowerCase()
    if (x) myNames.add(x)
  }
  // 同类别同名 → 合并;不同类别同名 → 问要不要搬过去
  let conflict = null
  for (const g of (allTagsGroups.value || [])) {
    for (const t of (g.tags || [])) {
      if (t.tag === it.tag && resolveCatKey(t.cat) === oldCat) continue
      const variants = tagNameVariants(setting.value, resolvedTranslation.value, t.cat, t.tag).map(v => String(v).toLowerCase())
      if (variants.some(v => myNames.has(v))) { conflict = { cat: resolveCatKey(t.cat), tag: t.tag }; break }
    }
    if (conflict) break
  }

  let movedToCat = newCat
  try {
    if (conflict && conflict.cat === newCat) {
      await ElMessageBox.confirm(
        t('m.tagMergeConfirm', { name: getDisplayTagName(setting.value, conflict.cat, conflict.tag) || conflict.tag }),
        t('m.tagMergeTitle'),
        { type: 'warning' }
      )
      // 合并:全库把这条标签改成目标标签,再删掉自己的名称/颜色记录
      await ipcRenderer.invoke('rename-tag', { cat: newCat, oldName: it.tag, newName: conflict.tag })
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
      tagEditVisible.value = false
      printMessage('success', t('m.saveTagNamesDone'))
      emit('loadBookList')
      return
    }
    if (conflict && conflict.cat !== newCat) {
      await ElMessageBox.confirm(
        t('m.tagMoveToCatConfirm', { cat: categoryLabel(conflict.cat), name: getDisplayTagName(setting.value, conflict.cat, conflict.tag) || conflict.tag }),
        t('m.tagMergeTitle'),
        { type: 'warning' }
      )
      movedToCat = conflict.cat
      await ipcRenderer.invoke('move-tag', { fromCat: oldCat, name: it.tag, toCat: movedToCat, newName: conflict.tag })
      // 记住:以后遇到同名标签都自动归到这个类别
      if (!setting.value.tagNameCategoryMap) setting.value.tagNameCategoryMap = {}
      for (const n of myNames) setting.value.tagNameCategoryMap[n] = movedToCat
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      if (setting.value.tagRelations) delete setting.value.tagRelations[oldCat + '::' + it.tag]
      await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
      tagEditVisible.value = false
      printMessage('success', t('m.saveTagNamesDone'))
      emit('loadBookList')
      return
    }
    // 换了类别(没冲突):全库搬过去
    if (movedToCat !== oldCat) {
      await ipcRenderer.invoke('move-tag', { fromCat: oldCat, name: it.tag, toCat: movedToCat })
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      if (setting.value.tagRelations) {
        const oldKey = oldCat + '::' + it.tag
        const newKey = movedToCat + '::' + it.tag
        const rel = setting.value.tagRelations[oldKey]
        if (rel) { delete setting.value.tagRelations[oldKey]; setting.value.tagRelations[newKey] = rel }
        for (const [k, v] of Object.entries(setting.value.tagRelations)) {
          if (v && Array.isArray(v.contains)) {
            setting.value.tagRelations[k] = { ...v, contains: v.contains.map(x => (x === oldKey ? newKey : x)) }
          }
        }
      }
      tagEditItem.value = { ...it, cat: movedToCat }
      tagEditOrigCat.value = movedToCat
    }
  } catch (e) {
    // 用户取消确认:什么都不做,保持弹窗
    return
  }

  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const key = movedToCat + '::' + it.tag
  if (empty) delete setting.value.tagNameLangs[key]
  else setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  if (!setting.value.tagColors) setting.value.tagColors = {}
  if (tagEditColor.value) {
    setting.value.tagColors[key] = tagEditColor.value
    // 记住「上一次手动设置的颜色」:以后长按收藏别的标签时优先沿用它(用户要求)。
    // ⚠ 只有这里(用户在弹窗里手选/手填了颜色)才回写;自动取色(色板轮转)绝不回写,
    //    否则自动挑出来的颜色会污染「上次设置的颜色」。
    setting.value.lastTagColor = tagEditColor.value
  } else {
    delete setting.value.tagColors[key]
  }
  // 记住「这个名字属于哪个类别」,以后同名标签自动归到这里
  if (!setting.value.tagNameCategoryMap) setting.value.tagNameCategoryMap = {}
  for (const n of myNames) setting.value.tagNameCategoryMap[n] = movedToCat

  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  tagEditVisible.value = false
  printMessage('success', t('m.saveTagNamesDone'))
  // 改名称/配色不需要重载书库(与 TagEditorDialog 一致)
}
// 标题分析:和库里已有标签做对比(标题按括号/分隔符切开),命中就写入 团队/作者/原作/角色
const analyzeTitles = async () => {
  if (titleAnalyzing.value) return
  try {
    await ElMessageBox.confirm(t('m.titleAnalyzeConfirm'), t('m.titleAnalyze'), { type: 'info' })
  } catch (e) { return }
  titleAnalyzing.value = true
  try {
    const res = await ipcRenderer.invoke('analyze-titles-by-tags', {})
    if (res && res.ok) {
      printMessage('success', t('m.titleAnalyzeDone', { changed: res.changed || 0, added: res.added || 0 }))
      emit('loadBookList')
    } else {
      printMessage('error', (res && res.error) || 'failed')
    }
  } catch (e) {
    printMessage('error', String(e.message || e))
  } finally {
    titleAnalyzing.value = false
  }
}
// ---------- 删除类别 ----------
// 类别是「大分类」。删掉它时,该类别下的标签不能凭空消失,统一归入内置的「其他」类别。
// 需要清理的地方:
//   ① 全库把 book.tags[被删类别] 的标签搬到 book.tags.other(走 move-tag-category)
//   ② setting.tagCatOrder(顺序表,也是空类别的唯一来源)
//   ③ setting.tagCatNameLangs(类别多语言名)
//   ④ setting.tagRelations 里以该类别标签为主语/宾语的关联边(键名同步换到 other)
// 内置「其他」类别本身不允许删除。
const deleteTagCategory = async () => {
  const it = tagEditItem.value
  if (!it || !tagEditIsCategory.value) return
  const key = resolveCatKey(it.cat)
  // 内置「其他」不可删除
  if (isBuiltinCat(key)) {
    printMessage('warning', t('m.cannotDeleteOtherCategory'))
    return
  }
  const count = (allTagsGroups.value.find(g => g.cat === key)?.tags || []).length
  try {
    await ElMessageBox.confirm(
      count
        ? t('m.deleteCategoryConfirmWithTags', { cat: categoryLabel(key), n: count })
        : t('m.deleteCategoryConfirm', { cat: categoryLabel(key) }),
      t('m.deleteCategory'),
      { type: 'warning', confirmButtonText: t('m.delete'), cancelButtonText: t('m.cancel') }
    )
  } catch (e) { return } // 取消

  // ① 该类别下的标签整体迁移到内置「其他」
  if (count) {
    const mv = await ipcRenderer.invoke('move-tag-category', { from: key, to: FALLBACK_CAT })
    if (!mv?.ok) {
      printMessage('error', mv?.error || t('c.groupTagError'))
      return
    }
  }
  // ④ 关联边键名同步换到 other
  const rel0 = setting.value.tagRelations
  if (rel0) {
    for (const [k, v] of Object.entries(rel0)) {
      const [kCat, kTag] = String(k).split('::')
      if (resolveCatKey(kCat) === key) {
        delete rel0[k]
        const nk = FALLBACK_CAT + '::' + kTag
        rel0[nk] = { ...(rel0[nk] || {}), ...v }
      }
      if (v && Array.isArray(v.contains)) {
        rel0[k] = {
          ...v,
          contains: v.contains.map(x => {
            const [c, tg] = String(x).split('::')
            return resolveCatKey(c) === key ? FALLBACK_CAT + '::' + tg : x
          }),
        }
      }
    }
  }
  // 确保「其他」类别在顺序表里(它永远可见)
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  if (!setting.value.tagCatOrder.includes(FALLBACK_CAT)) setting.value.tagCatOrder.push(FALLBACK_CAT)

  if (Array.isArray(setting.value.tagCatOrder)) {
    setting.value.tagCatOrder = setting.value.tagCatOrder.filter(c => resolveCatKey(c) !== key)
  }
  if (setting.value.tagCatNameLangs) delete setting.value.tagCatNameLangs[key]
  // ★ 必须把 setting.globalTags 里这个类别整条删掉。
  //   事故:allTagsGroups 会把 globalTags 里的标签建成组,
  //   这里不清的话,删掉的类别/标签下一次渲染立刻复活(用户看到「删了又回来」)。
  if (setting.value.globalTags && typeof setting.value.globalTags === 'object') {
    const gs = { ...setting.value.globalTags }
    let touched = false
    for (const k of Object.keys(gs)) {
      if (resolveCatKey(k) === key) { delete gs[k]; touched = true }
    }
    if (touched) setting.value.globalTags = gs
  }
  // 该类别下标签的颜色也一并清掉(颜色表的键是 'cat::tag')
  if (setting.value.tagColors && typeof setting.value.tagColors === 'object') {
    const next = { ...setting.value.tagColors }
    let touched = false
    for (const k of Object.keys(next)) {
      if (resolveCatKey(String(k).split('::')[0]) === key) { delete next[k]; touched = true }
    }
    if (touched) setting.value.tagColors = next
  }
  // 关联边:该类别下的标签作为「包含方」或「被包含方」的条目全部摘掉
  const rel = setting.value.tagRelations
  if (rel) {
    for (const [k, v] of Object.entries(rel)) {
      const kCat = resolveCatKey(String(k).split('::')[0])
      if (kCat === key) { delete rel[k]; continue }
      if (v && Array.isArray(v.contains)) {
        const kept = v.contains.filter(x => resolveCatKey(String(x).split('::')[0]) !== key)
        if (kept.length) rel[k] = { ...v, contains: kept }
        else delete rel[k]
      }
    }
  }
  if (selectedTagCat.value && resolveCatKey(selectedTagCat.value) === key) selectedTagCat.value = null
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  tagEditVisible.value = false
  printMessage('success', t('m.deleteCategoryDone'))
  emit('loadBookList')
}

// ---------- 删除标签(从全库移除)----------
const deleteEditingTag = async () => {
  const it = tagEditItem.value
  if (!it || tagEditIsCategory.value) return
  try {
    await ElMessageBox.confirm(
      t('m.deleteTagConfirm', { cat: categoryLabel(it.cat), tag: it.tag }),
      t('m.deleteTag'),
      { type: 'warning', confirmButtonText: t('m.delete'), cancelButtonText: t('m.cancel') }
    )
  } catch (e) { return } // 取消
  const res = await ipcRenderer.invoke('delete-tag', { cat: it.cat, name: it.tag })
  if (res?.ok) {
    // 清掉这个标签的名称与关联配置
    if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[it.cat + '::' + it.tag]
    const rel = setting.value.tagRelations
    if (rel) {
      const selfKey = it.cat + '::' + it.tag
      delete rel[selfKey]
      for (const [k, v] of Object.entries(rel)) {
        if (v && Array.isArray(v.contains)) {
          const kept = v.contains.filter(x => x !== selfKey)
          if (kept.length) rel[k] = { ...v, contains: kept }
          else delete rel[k]
        }
      }
    }
    // 已收藏的也一并移除
    if (Array.isArray(setting.value.collectTag)) {
      setting.value.collectTag = setting.value.collectTag.filter(x => x.id !== it.cat + ':' + it.tag)
    }
    // 从「全局标签登记表」里显式摘掉:光靠随后的 save-setting 不够 ——
    // 后端为防「刚加就丢」会补回尚未确认的新增,删除必须走这条显式通道。
    try { await ipcRenderer.invoke('remove-global-tag', { cat: it.cat, name: it.tag }) } catch (e) { /* 忽略 */ }
    if (setting.value.globalTags && Array.isArray(setting.value.globalTags[it.cat])) {
      const kept = setting.value.globalTags[it.cat].filter(v => String(v) !== String(it.tag))
      if (kept.length) setting.value.globalTags = { ...setting.value.globalTags, [it.cat]: kept }
      else { const gt = { ...setting.value.globalTags }; delete gt[it.cat]; setting.value.globalTags = gt }
    }
    await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
    tagEditVisible.value = false
    printMessage('success', t('c.renameTagDone', { count: res.count }))
    emit('loadBookList')
  } else {
    printMessage('error', res?.error || t('c.renameTagFailed'))
  }
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
    // 长按收藏的默认色,优先级:
    //   ① 这个标签自己在「编辑标签」里配过的颜色(tagColorOf)
    //   ② 上一次在「编辑标签」里手动设置的颜色(lastTagColor) —— 用户希望沿用上次的配色
    //   ③ 1.14.x 柔和色板里第一个没被占用的
    //   ④ 按已收藏数量轮转取色(色板被占满时)
    const palette = moderateSoftColors
    const used = new Set((setting.value.collectTag || []).map(x => x && x.color))
    const color = tagColorOf(setting.value, tag.cat, tag.tag) ||
      setting.value.lastTagColor ||
      palette.find(c => !used.has(c)) ||
      palette[(setting.value.collectTag || []).length % palette.length]
    setting.value.collectTag.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color })
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
// ---------- 已收藏标签:长按 / 右键 取消收藏 ----------
// 计时器与坐标都独立于「库中全部标签」那一套(两处可能同时按住,不能共用一个变量)
const UNCOLLECT_LONG_PRESS_MS = 600
let longPressUncollectTimer = null
let longPressUncollectStart = { x: 0, y: 0 }
const uncollectTag = (element) => {
  if (!element || !element.id) return
  cancelLongPressUncollect()
  setting.value.collectTag = (setting.value.collectTag || []).filter(t => t.id !== element.id)
  // 删除类操作必须立即落盘:saveSetting 是 500ms 防抖,关窗口太快会丢掉这次修改
  saveSettingNow()
}
const startLongPressUncollect = (element, e) => {
  cancelLongPressUncollect()
  longPressUncollectStart = {
    x: (e && e.clientX) || 0,
    y: (e && e.clientY) || 0
  }
  longPressUncollectTimer = setTimeout(() => {
    longPressUncollectTimer = null
    uncollectTag(element)
  }, UNCOLLECT_LONG_PRESS_MS)
}
// 手指/鼠标移动超过 8px = 用户在拖动排序(vuedraggable),取消长按
const onLongPressUncollectMove = (e) => {
  if (!longPressUncollectTimer) return
  const dx = Math.abs(((e && e.clientX) || 0) - longPressUncollectStart.x)
  const dy = Math.abs(((e && e.clientY) || 0) - longPressUncollectStart.y)
  if (dx > 8 || dy > 8) cancelLongPressUncollect()
}
const cancelLongPressUncollect = () => {
  if (longPressUncollectTimer) {
    clearTimeout(longPressUncollectTimer)
    longPressUncollectTimer = null
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

// 标签设置整页组件(与管理界面共用)
const tagSectionRef = ref(null)
const dialogVisibleSetting = ref(false)
// 高级主题(像素风格)
// 像素风格设置(音效 / 清晰度 / 块大小 / 颜色数量 / 算法 / 网格)
const pixelSettingVisible = ref(false)

// ---------- EH 登录 / EH在线漫画库(设置 → 账户)----------
// 桌面客户端由主进程开登录窗口收 Cookie(参考 JHenTai);其余形态填账号密码或粘贴 Cookie。
const isDesktopClient = computed(() => !isWebMode.value || isRemoteDesktop.value)
const ehLoginLoading = ref(false)
const ehLoggedIn = computed(() => hasEhCookies(setting.value))
// 登录结果的统一处理(登录窗口与纯 HTTP 登录共用)
const applyEhLoginResult = (res) => {
  if (res && res.ok) {
    Object.assign(setting.value, res.cookies || {})
    setting.value.ehOnlineUser = res.user || ehUsername.value || setting.value.ehOnlineUser || ''
    // 登录成功即默认打开「EH在线」库(用户诉求:登录后出现一个叫 EH在线 的漫画库)
    setting.value.ehOnlineEnabled = true
    ehPassword.value = ''
    saveSettingNow()
    printMessage('success', t('m.ehLoginSuccess'))
    // 让主界面立刻重算库列表(虚拟库就此出现)
    emit('loadBookList')
    return true
  }
  const err = (res && res.error) || ''
  const msg = err === 'captcha' ? t('m.ehLoginNeedCaptcha')
    : err === 'cloudflare' ? t('m.ehLoginCloudflare')
      : err === 'badCredentials' ? t('m.ehLoginBadCredentials')
        : err === 'emptyInput' ? t('m.ehLoginInputRequired')
          : err === 'timeout' ? t('m.ehLoginNetwork')
            : err === 'busy' ? t('m.ehLoginBusy')
              : err === 'canceled' ? t('m.ehLoginCanceled')
                : t('m.ehLoginFailed', { msg: (res && res.detail) || err })
  printMessage(err === 'canceled' ? 'info' : 'error', msg)
  return false
}

// 「登录」按钮:桌面端开登录窗口并自动填账号密码 —— EH 论坛有 Cloudflare 人机挑战 + Turnstile 验证码,
// 只有真浏览器窗口能过(实测);网页版没有窗口,只能退回纯 HTTP 登录(通常会被拦,会给出明确提示)。
const doEhLogin = async () => {
  if (ehLoginLoading.value || ehPasswordLoginLoading.value) return
  if (isDesktopClient.value) {
    ehLoginLoading.value = true
    try {
      applyEhLoginResult(await ipcRenderer.invoke('eh-login', { username: ehUsername.value, password: ehPassword.value }))
    } catch (e) {
      printMessage('error', t('m.ehLoginFailed', { msg: String((e && e.message) || e) }))
    } finally {
      ehLoginLoading.value = false
    }
    return
  }
  await doEhPasswordLogin()
}

const doEhLogout = async () => {
  try { await ipcRenderer.invoke('eh-logout') } catch (e) { /* 网页版没有该通道:忽略 */ }
  for (const k of ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'ehOnlineUser']) setting.value[k] = ''
  setting.value.ehOnlineEnabled = false
  saveSettingNow()
  emit('loadBookList')
  printMessage('success', t('m.ehLogoutDone'))
}
// 从剪贴板粘贴 Cookie:把浏览器里复制的一整串里四项抽出来(JHenTai pasteCookie 同口径)
const pasteEhCookie = async () => {
  let text = ''
  try { text = await ipcRenderer.invoke('read-text-from-clipboard') } catch (e) { /* 忽略 */ }
  const parsed = parseCookieString(text || '')
  const hit = Object.values(parsed).filter(Boolean).length
  if (!hit) { printMessage('warning', t('m.ehCookieNone')); return }
  Object.assign(setting.value, parsed)
  saveSettingNow()
  printMessage('success', t('m.ehCookiePasted', { n: hit }))
  ehAutoEnableIfReady()
}
const clearEhCookie = () => {
  for (const k of ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'ehOnlineUser']) setting.value[k] = ''
  setting.value.ehOnlineEnabled = false
  saveSettingNow()
}
// 四项 Cookie 刚被填齐(手工填 / 从剪贴板粘贴 / 登录窗口):自动打开「EH在线」。
// 网页版没有登录窗口,「Cookie 填好」就等于登录 —— 不该再让用户自己去设置里找开关。
// 只在用户动作里调用(不在加载设置时),所以用户显式关掉开关后不会被重新打开。
const ehAutoEnableIfReady = () => {
  if (!ehLoggedIn.value || setting.value.ehOnlineEnabled) return
  setting.value.ehOnlineEnabled = true
  saveSettingNow()
  printMessage('success', t('m.ehOnlineAutoEnabled'))
  emit('loadBookList')
}
// EH 设置里四个 Cookie 输入框的 @change(只在这里自动开库,别的输入框不受影响)
const onEhCookieChange = () => {
  saveSetting()
  ehAutoEnableIfReady()
}

// ---------- 账号密码登录(桌面版与网页版都能用)----------
const ehUsername = ref('')
const ehPassword = ref('')
const ehPasswordLoginLoading = ref(false)
// 打开设置 / 切到「账户」页时把上次用的 EH 账号带出来(密码永不回填)
const seedEhUsername = () => {
  // 永不回填密码;已有输入(用户正在打字)也不覆盖
  if (!ehUsername.value) ehUsername.value = String(setting.value.ehOnlineUser || setting.value.ipb_member_id || '')
}
const doEhPasswordLogin = async () => {
  if (ehPasswordLoginLoading.value || ehLoginLoading.value) return
  if (!String(ehUsername.value || '').trim() || !String(ehPassword.value || '')) {
    printMessage('warning', t('m.ehLoginInputRequired'))
    return
  }
  ehPasswordLoginLoading.value = true
  try {
    applyEhLoginResult(await ipcRenderer.invoke('eh-password-login', { username: ehUsername.value, password: ehPassword.value }))
  } catch (e) {
    printMessage('error', t('m.ehLoginFailed', { msg: String((e && e.message) || e) }))
  } finally {
    ehPasswordLoginLoading.value = false
  }
}
const handlePixelThemeChange = () => {
  applyPixelTheme(setting.value)
  saveSetting()
}
const handleAutoThemeChange = () => {
  applyPixelTheme(setting.value)
  saveSetting()
}
// Ctrl+滚轮 改过缩放后,再打开设置时同步显示当前的百分比
// (必须放在 dialogVisibleSetting 定义之后,否则 setup 阶段会 ReferenceError → 整个设置面板打不开)
watch(dialogVisibleSetting, (visible) => {
  if (!visible) return
  // 每次打开设置:同步界面缩放 + 自动刷新一次回收站(文件可能被外部移动/删除,状态会变)
  zoomPercentRef.value = readZoomPercent()
  loadTrashList()
})
const activeSettingPanel = ref('general')
const proxyTesting = ref(false)
// 「功能」页:右边选项 / 左边内容
const activeFeature = ref('upscale')
const featureTabs = computed(() => [
  { id: 'upscale', label: t('m.imageUpscale') },
  { id: 'colorize', label: t('m.imageColorize') },
  { id: 'metadata', label: t('m.aiInfoProcessing') },
  { id: 'download', label: t('m.download') },
  { id: 'fileMove', label: t('m.fileMove') },
])
// 打开设置 / 切到「账户」页时,把上次用的 EH 账号带出来(密码永不回填)
watch([dialogVisibleSetting, activeSettingPanel], ([open, panel]) => {
  if (open && panel === 'accounts') seedEhUsername()
})

// 设置页内容区惯性滚动(对话框打开/挂载后各尝试一次)
// ⚠ 必须传 getParams:以前这里是 attachInertiaScroll(el) 裸调,走的是 getLevel() 默认档
//   medium —— 于是「惯性滑动」开关关掉,设置弹窗自己照样滑;摩擦系数/最大速度/跟手灵敏度
//   改多少,这一页也全是 medium 的手感,和主界面完全对不上。
let settingInertiaDetach = null
const attachSettingInertiaScroll = () => {
  const el = document.querySelector('.setting-tabs .el-tabs__content')
  if (el && !settingInertiaDetach) {
    settingInertiaDetach = attachInertiaScroll(el, {
      getParams: () => ({
        enabled: setting.value.inertiaEnabled !== false,
        friction: setting.value.inertiaFriction,
        maxVelocity: setting.value.inertiaMaxVelocity,
        follow: setting.value.inertiaFollow,
      })
    })
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
  // 「功能设置」tab 里左侧选中的子页(upscale/colorize/metadata/download/fileMove)。
  // 导出它是为了让外部能「一键跳到下载目录」:App.vue 的 openDownloadSetting 会赋值 'download'。
  // 它是 ref,外部通过 expose proxy 赋值时会被 proxyRefs 解包(等价于 activeFeature.value = ...)。
  activeFeature,
  // 「标签设置」里的完整标签编辑器(配色/分类/关联/删除)。
  // App.vue 的右键「编辑标签」直接调它 —— 以前那里只能快速改个名。
  openTagNameEditor,
  // 全软件统一的「增加标签」入口:直接打开 设置 → 标签 这一页。
  // (详细界面 / 侧边详情 / 管理面板上的「增加标签」都调这里,不再各弹各的小窗)
  openTagPanel: () => {
    activeSettingPanel.value = 'collectTag'
    dialogVisibleSetting.value = true
  },
  saveSetting
})

</script>

<style lang="stylus">

/* EH 设置:登录区(账号 / 密码 / 登录按钮排一行) */
.eh-login-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.eh-login-input { width: 170px; }

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
.setting-line.tag-option-row
  // 收藏标签 / 随机标签 / 语言 / 更新词库:强制一行(用户要求),放不下就压缩状态文字
  display: flex
  align-items: center
  flex-wrap: nowrap
  gap: 12px
  overflow: hidden
  .tag-translate-label
    margin-left: 4px
    flex: none
  .tag-target-lang
    flex: none
    width: 128px
  .tag-translation-refresh
    flex: none
  .tag-translation-status
    margin: 0
    flex: 1 1 auto
    min-width: 0
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
.tag-color-editor
  display: flex
  align-items: center
  gap: 8px
  margin: 4px 0 10px
  .tag-color-label
    font-size: 13px
    color: var(--el-text-color-regular)
.tag-cat-editor
  display: flex
  align-items: center
  gap: 8px
  margin: 2px 0 6px
.tag-name-hint
  font-size: 12px
  color: var(--el-text-color-secondary)
  margin-bottom: 6px
.rate-inputs
  display: flex
  align-items: center
  gap: 4px
  .rate-sep
    font-size: 12px
    color: var(--el-text-color-secondary)
.collect-tag
  .el-form-item
    margin-bottom: 0
  .el-tag
    margin-right: 8px
    margin-bottom: 8px
    border-width: 0

/* 多库管理(设置 → 常用):一排 = 一个库(库名 / 库文件夹 / 库数据存放位置),下方「添加库」 */
.library-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.library-active-radio { margin-right: 2px; flex: 0 0 auto; }
.library-name-input { width: 120px; flex: 0 0 auto; }
.library-name-input .el-input__inner { font-weight: 600; }
.library-path-input { flex: 0 1 180px; min-width: 120px; }
.library-remove-btn { flex: 0 0 auto; padding: 8px 10px; margin-left: auto; }
.library-data-input { flex: 1 1 260px; min-width: 200px; }
.library-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.library-inactive { color: #e6a23c; font-size: 12px; flex: 0 0 auto; }
.library-boxes-title { font-weight: 600; margin-top: 10px; }
.library-box-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.library-box-index { width: 18px; text-align: center; color: #909399; flex: 0 0 auto; }
.library-box-select { flex: 1 1 300px; min-width: 220px; }
.library-box-current { color: #409eff; font-size: 12px; flex: 0 0 auto; }

// 标签设置:类别标签标题行 + 类别拖动区 + 全部标签列表
.tag-cat-header
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px
  margin-bottom: 8px
  // 左边那坨是「标题 + 感叹号」的 .label-with-hint(一个整体),
  // 右边是 el-space 按钮组 —— 两组之间由 space-between 拉开,图标不会再被推到中间
  .context-menu-title
    margin-right: 0
// 「已收藏标签」的胶囊:长按取消收藏时不要选中文字
// ⚠ 不加 touch-action:none —— 那会把整个设置页的滚动一起禁掉
.collected-tag-item
  user-select: none
// 分区标题 + 感叹号说明:el-divider 的默认插槽里放一段 span 包住文字与 ! ,
// 让感叹号紧贴标题文字(直接放 div/block 会掉到下一行)。
// gap 4px:与 .tag-help-dot 自带的 margin-left:4px 拉开一点,图标不会压到文字上
// 文字 + 感叹号:必须用它包住,图标才会跟着文字走,不会掉行、不会被挤到中间
.label-with-hint
  display: inline-flex
  align-items: center
  gap: 4px
  min-width: 0
.emm-divider-label
  display: inline-flex
  align-items: center
  gap: 4px
.tag-cat-list
  display: flex
  flex-wrap: wrap
  gap: 6px
  margin-bottom: 8px
  .tag-cat-chip
    // 需求:鼠标放到类别标签上不要变成「一只手」
    cursor: default
    user-select: none
  .tag-cat-drag
    display: inline-block
    margin-right: 4px
    opacity: .55
    letter-spacing: -2px
    // 手柄保持移动光标,提示这里可以拖
    cursor: move
  // 类别右侧的标签数量(用户要求:类别右边显示该类别拥有标签的个数)
  .tag-cat-count
    display: inline-block
    margin-left: 4px
    padding: 0 5px
    border-radius: 8px
    font-size: 11px
    line-height: 16px
    font-weight: 400
    color: var(--el-text-color-secondary)
    background: var(--el-fill-color)
    font-variant-numeric: tabular-nums
// 标签编辑界面里的「该类别标签」横排选择(与「详细信息」里的标签展示同排版)
// 关联标签「选择标签」的下拉:选项横排铺开(一排一排),不再是竖着一条
.tag-relation-dropdown
  .el-select-dropdown__wrap
    max-height: 260px
  .el-select-dropdown__list
    display: flex
    flex-wrap: wrap
    gap: 6px
    padding: 8px
  .el-select-dropdown__item
    display: inline-flex
    align-items: center
    width: auto
    max-width: 100%
    height: 26px
    line-height: 24px
    padding: 0 10px
    margin: 0
    border: 1px solid var(--el-border-color)
    border-radius: 13px
    font-size: 12px
    &.is-hovering,
    &:hover
      background-color: var(--el-fill-color-light)
    &.is-selected
      color: var(--el-color-primary)
      border-color: var(--el-color-primary)
      font-weight: 600
      background-color: var(--el-color-primary-light-9)
      // 与 BookDetailDialog 的 .tag-select-dropdown 同一个组件写法:Element 的选中勾
      // 绝对定位 right:20px 会压在 chip 文字上,这里去掉(边框+颜色+浅底已经够辨识)。
      // 同样要 display:none —— 只写 content:none 会被 Element 的 4 类选择器压掉;
      // 这句 select 现在不是 multiple、本就不画勾,保持一致以防以后改成多选又冒出来。
      &::after
        content: none
        display: none
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
// 已收藏的标签:加一圈圆角描边(用户要的「圆形框」),和未收藏的一眼区分
.all-tag-item.is-collected
  box-shadow: 0 0 0 1.5px var(--el-color-primary)
  border-color: var(--el-color-primary)
.tag-color-dot
  display: inline-block
  width: 10px
  height: 10px
  border-radius: 50%
  margin-right: 5px
  vertical-align: middle
  cursor: pointer
// 关联标签区域:标题 + 一行(分类下拉 / 方式下拉 / 添加按钮) + 横排标签选择 + 已有关联列表
.tag-relation-editor
  margin-top: 10px
  padding-top: 8px
  border-top: 1px solid var(--el-border-color-lighter)
  text-align: left
  .tag-relation-title
    font-size: 12px
    font-weight: 600
    color: var(--el-text-color-secondary)
    margin-bottom: 6px
  .tag-relation-add
    display: flex
    flex-wrap: wrap
    align-items: center
    gap: 6px
  .tag-relation-list
    margin-top: 8px
    display: flex
    flex-wrap: wrap
    gap: 6px
.setting-switch
  text-align: left
  margin-top: 6px
  // 必须是 flex:el-switch 的 active-text 会溢出自己的盒子,
  // 后面的感叹号就会压在开关文字上(用户截图里的那一处)。
  // flex + .el-switch{flex:none} 之后两者各占各的位置;带说明的开关统一用 .switch-label。
  display: flex
  align-items: center
  gap: 8px
  .el-switch
    flex: none
  .switch-label
    display: inline-flex
    align-items: center
    gap: 4px
    min-width: 0
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

// 功能设置:左内容、右选项
.feature-settings
  display: flex
  align-items: flex-start
  gap: 14px
  width: 100%
  .feature-content
    flex: 1 1 auto
    min-width: 0
    max-height: 60vh
    overflow-y: auto
    padding-right: 6px
  .feature-menu
    flex: 0 0 128px
    display: flex
    flex-direction: column
    gap: 2px
    padding-right: 10px
    border-right: 1px solid var(--el-border-color-lighter)
    position: sticky
    top: 0
  .feature-menu-item
    padding: 7px 10px
    border-radius: 4px
    font-size: 13px
    color: var(--el-text-color-regular)
    cursor: pointer
    user-select: none
    white-space: nowrap
    &:hover
      background: var(--el-fill-color-light)
    &.active
      background: var(--el-color-primary-light-9)
      color: var(--el-color-primary)
      font-weight: 600

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
  // 分区下的「分支」小标题(例:卡片样式 → 合集界面卡片):
  // 比大标题低一级 —— 没有主色竖条,改用缩进 + 细竖线,一眼看出是从属关系
  .advanced-subsection-title
    font-weight: 600
    font-size: 12px
    color: var(--el-text-color-regular)
    border-left: 2px solid var(--el-border-color)
    padding-left: 10px
    margin: 16px 0 8px 14px
    line-height: 18px
    text-align: left
    // 带总开关的子分区标题(合集界面卡片):文字在左、开关在右,同一行
    &.with-switch
      display: flex
      align-items: center
      justify-content: space-between
      gap: 12px
      padding-right: 4px
      .el-switch
        flex: none
        font-weight: 400
  // 设置项说明文字(灰字小提示)
  .setting-hint
    font-size: 12px
    line-height: 1.6
    color: var(--el-text-color-secondary)
    margin: 2px 0 6px
    text-align: left
  // 「当前值」用小字显示(如回收站目录路径)。和 .setting-hint 长得一样,
  // 但语义不同:它是值不是说明 —— 既然说明都收进了感叹号,这里刻意不用 .setting-hint 类
  .setting-hint-value
    font-size: 12px
    line-height: 1.6
    color: var(--el-text-color-secondary)
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
  // 主题:下拉框 + 「高级主题」按钮拼成同一个框(去掉中间的缝和圆角)
  .theme-select-group
    display: flex
    align-items: stretch
    width: 100%
    min-width: 0
    .el-select
      flex: 1 1 auto
      min-width: 0
      .el-select__wrapper
        border-top-right-radius: 0
        border-bottom-right-radius: 0
    .advanced-theme-btn
      flex: 0 0 auto
      margin-left: -1px
      padding: 0 12px
      border-top-left-radius: 0
      border-bottom-left-radius: 0
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
  // 分区标题(本地模式 / 远程模式)
  .account-section-title
    margin: 10px 0 6px
    font-size: 14px
    font-weight: 600
    color: var(--el-text-color-primary)
  // 本地模式与远程模式之间的分割线
  .account-divider
    margin: 18px 0 4px
    border-top: solid 1px var(--el-border-color, #dcdfe6)
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

// 下载设置:路径那一行输入框要占满剩余宽度
// 库列表里那排按钮(重建 / 删除)
.library-rebuild-btn
  flex: none
  white-space: nowrap

.download-setting-panel
  .download-path-value
    flex: 1
    min-width: 0
  .setting-hint
    margin-top: 8px
  // 面板内的小标题(失败任务自动重试):独占一行,和上面的选项隔开
  .download-subsection-title
    width: 100%
    margin: 12px 0 6px
    padding-top: 10px
    border-top: 1px dashed var(--el-border-color-lighter)
    font-size: 13px
    font-weight: 600
    color: var(--el-text-color-primary)
</style>