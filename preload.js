const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fckclicky', {
  // ===== Core =====
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  showOverlay: () => ipcRenderer.invoke('show-overlay'),
  hideOverlay: () => ipcRenderer.invoke('hide-overlay'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  hideNotch: () => ipcRenderer.invoke('hide-notch'),
  quit: () => ipcRenderer.invoke('quit-app'),
  
  // ===== Cursor / Ribbon =====
  onCursor: (cb) => ipcRenderer.on('overlay-cursor', (e, d) => cb(d)),
  
  // ===== AI =====
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  aiVision: (payload) => ipcRenderer.invoke('ai-vision', payload),
  aiTts: (payload) => ipcRenderer.invoke('ai-tts', payload),
  aiStt: (payload) => ipcRenderer.invoke('ai-stt', payload),
  aiTest: () => ipcRenderer.invoke('ai-test'),
  captureScreen: (opts) => ipcRenderer.invoke('capture-screen', opts),
  typeText: (text) => ipcRenderer.invoke('type-text', text),

  // ===== Setup / Local Whisper =====
  openSetup: () => ipcRenderer.invoke('open-setup'),
  completeSetup: (cfg) => ipcRenderer.invoke('complete-setup', cfg),
  pickFile: (opts) => ipcRenderer.invoke('pick-file', opts),
  whisperCheck: (payload) => ipcRenderer.invoke('whisper-check', payload),
  whisperAutoSetup: (opts) => ipcRenderer.invoke('whisper-auto-setup', opts),
  onWhisperSetupLog: (cb) => ipcRenderer.on('whisper-setup-log', (e, d) => cb(d)),

  // ===== Windows 11 shell / theme =====
  getTheme: () => ipcRenderer.invoke('get-theme'),
  onThemeChange: (cb) => ipcRenderer.on('theme-changed', (e, d) => cb(d)),
  
  // ===== Events =====
  onDelta: (cb) => ipcRenderer.on('ai-delta', (e, data) => cb(data)),
  onHotkey: (cb) => ipcRenderer.on('hotkey-pressed', () => cb()),
  onVoiceHotkey: (cb) => ipcRenderer.on('voice-hotkey', () => cb()),
  onActivateAssistant: (cb) => ipcRenderer.on('activate-assistant', () => cb()),
  onAssistantHoldStart: (cb) => ipcRenderer.on('assistant-hold-start', () => cb()),
  onAssistantHoldStop: (cb) => ipcRenderer.on('assistant-hold-stop', () => cb()),
  onAssistantIdle: (cb) => ipcRenderer.on('assistant-idle', () => cb()),
  onUiShown: (cb) => ipcRenderer.on('ui-shown', () => cb()),
  onOverlayDraw: (cb) => ipcRenderer.on('overlay-draw', (e, data) => cb(data)),
  onOverlayInteractive: (cb) => ipcRenderer.on('overlay-interactive', (e, v) => cb(v)),
  onOverlaySubtitle: (cb) => ipcRenderer.on('overlay-subtitle', (e, d) => cb(d)),
  onOverlayMode: (cb) => ipcRenderer.on('overlay-set-mode', (e, d) => cb(d)),
  overlaySetInteractive: (v) => ipcRenderer.invoke('overlay-set-interactive', v),
  reportSelection: (rect) => ipcRenderer.invoke('overlay-report-selection', rect),
  
  // ===== Window control =====
  setWindowSize: (opts) => ipcRenderer.invoke('set-window-size', opts),
  setUiState: (state) => ipcRenderer.invoke('set-ui-state', state),
  log: (msg) => ipcRenderer.invoke('renderer-log', msg),
});