!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var /GLOBAL ShortcutDialog
Var /GLOBAL CheckboxDesktop
Var /GLOBAL CheckboxStartMenu
Var /GLOBAL CheckboxDesktop_State
Var /GLOBAL CheckboxStartMenu_State

Function ShortcutOptionsPageCreator
  nsDialogs::Create 1018
  Pop $ShortcutDialog
  ${If} $ShortcutDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Select additional shortcuts for Gifts Presenter:$\r$\n(Both are disabled by default. Check a box to create that shortcut)"
  Pop $0

  ${NSD_CreateCheckbox} 10u 32u 280u 12u "Create a &Desktop shortcut"
  Pop $CheckboxDesktop
  ${NSD_SetState} $CheckboxDesktop ${BST_UNCHECKED}

  ${NSD_CreateCheckbox} 10u 48u 280u 12u "Create a &Start Menu shortcut"
  Pop $CheckboxStartMenu
  ${NSD_SetState} $CheckboxStartMenu ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
  ${NSD_GetState} $CheckboxDesktop $CheckboxDesktop_State
  ${NSD_GetState} $CheckboxStartMenu $CheckboxStartMenu_State
FunctionEnd

!macro customPageAfterChangeDir
  Page custom ShortcutOptionsPageCreator ShortcutOptionsPageLeave
!macroend

!macro customInstall
  ${If} $CheckboxDesktop_State == ${BST_CHECKED}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${EndIf}

  ${If} $CheckboxStartMenu_State == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!endif

!macro customUnInstall
  Delete "$newDesktopLink"
  Delete "$newStartMenuLink"
!macroend
