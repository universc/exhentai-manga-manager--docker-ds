; exhentai-manga-manager 安装器自定义行为
;
; 目标:
;   1. 不再因为旧的 per-machine 安装而每次弹 UAC:强制按「当前用户」安装,
;      并沿用旧安装目录(如果存在),不要求管理员权限。
;   2. 升级前把安装目录里的用户数据备份到 %TEMP%,安装完成后恢复到
;      <安装目录>\data —— 这样更新不会再把 setting / database / cover 删掉。
;   3. 卸载/升级时保留 <安装目录>\data(用户数据),只删程序文件。

!include "LogicLib.nsh"

; xcopy 复制(目录或通配符);返回码 >1 视为失败,直接中止,绝不带着“备份失败”继续删数据。
; 返回码 1 = 没有文件(目录为空),不算失败。
!macro CopyTo SRC DST
  nsExec::Exec 'cmd /c xcopy /E /I /Y /Q "${SRC}" "${DST}"'
  Pop $0
  ${If} $0 > 1
    MessageBox MB_OK|MB_ICONSTOP "复制用户数据失败(错误 $0):$\r$\n${SRC}$\r$\n已中止,避免数据丢失。"
    Abort
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
  ; ── 安装前:备份旧安装目录里的用户数据 ───────────────────────
  !macro customInit
    ${If} ${FileExists} "$INSTDIR\exhentai-manga-manager.exe"
      StrCpy $R9 "$TEMP\emm-userdata-backup"
      RMDir /r "$R9"
      CreateDirectory "$R9"

      ; 新版已经把数据放在 data 子目录
      ${If} ${FileExists} "$INSTDIR\data\*.*"
        !insertmacro CopyTo "$INSTDIR\data" "$R9"
      ${EndIf}

      ; 旧版数据直接放在安装根目录
      !insertmacro CopyTo "$INSTDIR\*.json" "$R9"
      !insertmacro CopyTo "$INSTDIR\*.sqlite" "$R9"
      !insertmacro CopyTo "$INSTDIR\*.sqlite-journal" "$R9"
      !insertmacro CopyTo "$INSTDIR\*.jsonl" "$R9"
      ${If} ${FileExists} "$INSTDIR\log.txt"
        !insertmacro CopyTo "$INSTDIR\log.txt" "$R9"
      ${EndIf}

      ${If} ${FileExists} "$INSTDIR\cover\*.*"
        !insertmacro CopyTo "$INSTDIR\cover" "$R9\cover"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\viewcache\*.*"
        !insertmacro CopyTo "$INSTDIR\viewcache" "$R9\viewcache"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\models\*.*"
        !insertmacro CopyTo "$INSTDIR\models" "$R9\models"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\custom-assets\*.*"
        !insertmacro CopyTo "$INSTDIR\custom-assets" "$R9\custom-assets"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\upscaled\*.*"
        !insertmacro CopyTo "$INSTDIR\upscaled" "$R9\upscaled"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\libraries\*.*"
        !insertmacro CopyTo "$INSTDIR\libraries" "$R9\libraries"
      ${EndIf}
      ${If} ${FileExists} "$INSTDIR\.trash\*.*"
        !insertmacro CopyTo "$INSTDIR\.trash" "$R9\.trash"
      ${EndIf}
    ${EndIf}
  !macroend

  ; ── 安装后:恢复数据到 <安装目录>\data,并清掉旧 per-machine 注册项 ──
  !macro customInstall
    ${If} ${FileExists} "$TEMP\emm-userdata-backup\*.*"
      CreateDirectory "$INSTDIR\data"
      !insertmacro CopyTo "$TEMP\emm-userdata-backup" "$INSTDIR\data"
      RMDir /r "$TEMP\emm-userdata-backup"
    ${EndIf}
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  ; ── 卸载/升级:保留 <安装目录>\data ─────────────────────────
  ; 替换默认的 RMDir /r $INSTDIR:先把 data 复制到 %TEMP%,删完程序文件再放回来。
  !macro customRemoveFiles
    ${If} ${FileExists} "$INSTDIR\data\*.*"
      RMDir /r "$TEMP\emm-data-preserve"
      CreateDirectory "$TEMP\emm-data-preserve"
      !insertmacro CopyTo "$INSTDIR\data" "$TEMP\emm-data-preserve"
    ${EndIf}
    RMDir /r "$INSTDIR"
    ${If} ${FileExists} "$TEMP\emm-data-preserve\*.*"
      CreateDirectory "$INSTDIR\data"
      !insertmacro CopyTo "$TEMP\emm-data-preserve" "$INSTDIR\data"
      RMDir /r "$TEMP\emm-data-preserve"
    ${EndIf}
  !macroend
!endif
