; FckClicky NSIS customizations — polished installer with motto
!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "FckClicky"
!endif
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "FOSS is 4ever.$\r$\n$\r$\nInstall FckClicky — a fast, local-first screen assistant.$\r$\nThis setup will guide you through a clean installation."

!define MUI_FINISHPAGE_TITLE "FckClicky is ready"
!define MUI_FINISHPAGE_TEXT "FOSS is 4ever.$\r$\n$\r$\nFckClicky has been installed successfully. Launch it to get started."

BrandingText "FckClicky  ·  FOSS is 4ever"