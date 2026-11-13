const { app, BrowserWindow, ipcMain, screen, globalShortcut, desktopCapturer, clipboard, Tray, Menu, nativeImage, dialog, nativeTheme, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');

let notchWin = null;
let overlayWin = null;
// (Draw/3D engine window removed: upstream engine assets had unverified provenance)
let setupWin = null;
let tray = null;
let modKeyWatcher = null;
let modKeysDown = false;
let mouseTracker = null;
let lastMousePos = null;
let mouseMoveAccum = 0;
let autoPointerIdleTimer = null;
let autoPointerActive = false;

const CONFIG_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'FckClicky');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_CONFIG = {
  ai_base_url: 'http://127.0.0.1:31415/v1',
  ai_api_key: '',
  vision_model: 'auto',
  chat_model: 'auto',
  stt_model: 'auto',
  tts_model: 'auto',
  stt_provider: 'remote', // 'remote' | 'local_whisper'
  local_whisper_bin: '',
  local_whisper_model: '',
  local_whisper_args: '',
  setup_completed: false,
  require_subscription: false,
  telemetry_enabled: false,
  auto_speak: true,
  hotkey: 'CommandOrControl+Alt+Space'
};

function ensureConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    // Strip a possible UTF-8 BOM (e.g. config edited with PowerShell/Notepad)
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
    const cfg = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...cfg, require_subscription: false, telemetry_enabled: false };
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const merged = { ...DEFAULT_CONFIG, ...cfg, require_subscription: false, telemetry_enabled: false };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

function getDisplayForNotch() {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
}

let autoHideTimer = null;
let idleTimer = null;
let uiBusy = false;
let lastActiveAt = Date.now();

function getNotchBounds(display) {
  const d = display || getDisplayForNotch();
  const { x: dx, y: dy, width: dw } = d.workArea;
  const w = Math.min(380, Math.max(280, dw - 60));
  const h = 34; // ultra-compact notch window
  const x = Math.round(dx + (dw - w) / 2);
  const y = dy + 4;
  return { x, y, width: w, height: h };
}

function fadeWindow(win, from, to, duration = 180, done) {
  try {
    if (!win || win.isDestroyed()) return done && done();
    const start = Date.now();
    const step = () => {
      if (!win || win.isDestroyed()) return done && done();
      const t = Math.min(1, (Date.now() - start) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const v = from + (to - from) * ease;
      try { win.setOpacity(Math.max(0, Math.min(1, v))); } catch {}
      if (t < 1) setTimeout(step, 16);
      else done && done();
    };
    try { win.setOpacity(from); } catch {}
    step();
  } catch { done && done(); }
}

let boundsTween = null;

/**
 * Smoothly morph the notch window between its compact and expanded geometry.
 * Windows' native setBounds(animate) is macOS-only, so we tween it ourselves
 * with an ease-out quart curve (very close to the Apple spring feel).
 */
function animateWindowBounds(win, target, duration = 400) {
  if (!win || win.isDestroyed()) return;
  if (boundsTween) {
    try { clearTimeout(boundsTween.timer); } catch {}
    boundsTween.cancelled = true;
  }
  if (!win.isVisible()) {
    try { win.setBounds(target, false); } catch {}
    return;
  }
  const from = win.getBounds();
  const start = Date.now();
  const token = { cancelled: false, timer: null };
  boundsTween = token;
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  const step = () => {
    if (token.cancelled || win.isDestroyed()) return;
    const t = Math.min(1, (Date.now() - start) / duration);
    const e = easeOutQuart(t);
    try {
      win.setBounds({
        x: Math.round(from.x + (target.x - from.x) * e),
        y: Math.round(from.y + (target.y - from.y) * e),
        width: Math.round(from.width + (target.width - from.width) * e),
        height: Math.round(from.height + (target.height - from.height) * e)
      }, false);
    } catch {}
    if (t < 1) token.timer = setTimeout(step, 16);
    else if (boundsTween === token) boundsTween = null;
  };
  step();
}

function showNotchWindow() {
  if (!notchWin || notchWin.isDestroyed()) createNotchWindow();
  // Defensive: hide any stray notch windows except the current one
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (w !== notchWin && w !== overlayWin && !w.isDestroyed()) {
        try {
          const u = w.webContents?.getURL?.() || '';
          if (u.includes('index.html')) w.hide();
        } catch {}
      }
    });
  } catch {}
  const bounds = getNotchBounds();
  notchWin.setBounds(bounds, false);
  try { notchWin.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  try { notchWin.setOpacity(0); } catch {}
  notchWin.showInactive();
  fadeWindow(notchWin, 0, 1, 220);
  try { notchWin.webContents.send('ui-shown'); } catch {}
  try { notchWin.moveTop(); } catch {}
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  lastActiveAt = Date.now();
  return notchWin;
}

function hideNotchWindowSmooth(cb) {
  if (!notchWin || notchWin.isDestroyed()) return cb && cb();
  fadeWindow(notchWin, notchWin.getOpacity ? notchWin.getOpacity() : 1, 0, 220, () => {
    try { if (notchWin && !notchWin.isDestroyed()) notchWin.hide(); } catch {}
    try { if (notchWin && !notchWin.isDestroyed()) notchWin.setOpacity(1); } catch {}
    cb && cb();
  });
}

function goIdle(force = false) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  if (modKeysDown) return;
  if (uiBusy && !force) return;
  uiBusy = false;
  try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay-set-mode', { mode: 'off' }); } catch {}
  setTimeout(() => {
    try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide(); } catch {}
  }, 260);
  try { if (notchWin && !notchWin.isDestroyed()) notchWin.webContents.send('assistant-idle'); } catch {}
  hideNotchWindowSmooth();
}

function scheduleIdle(delay = 5000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (modKeysDown) { scheduleIdle(delay); return; }
    if (uiBusy) {
      // Safety: don't stay stuck forever if a request hangs
      if (Date.now() - lastActiveAt > 45000) { goIdle(true); return; }
      scheduleIdle(delay); return;
    }
    goIdle(true);
  }, delay);
}

function scheduleNotchAutoHide(delay = 2500) {
  if (autoHideTimer) clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null;
    if (modKeysDown) return;
    // Go fully idle (overlay + notch hidden) until next Ctrl+Alt
    goIdle();
  }, delay);
}

function createNotchWindow() {
  if (notchWin && !notchWin.isDestroyed()) {
    try { notchWin.close(); } catch {}
  }
  const bounds = getNotchBounds();
  notchWin = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'AppIcon.ico')
  });
  notchWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  notchWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notchWin.setAlwaysOnTop(true, 'screen-saver');
  const winRef = notchWin;
  notchWin.on('closed', () => { if (notchWin === winRef) notchWin = null; });
}

function createOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  const displays = screen.getAllDisplays();
  const bounds = displays.reduce((acc, d) => {
    const b = d.bounds;
    return {
      x: Math.min(acc.x, b.x),
      y: Math.min(acc.y, b.y),
      r: Math.max(acc.r, b.x + b.width),
      b: Math.max(acc.b, b.y + b.height)
    };
  }, { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity });
  const width = bounds.r - bounds.x;
  const height = bounds.b - bounds.y;
  overlayWin = new BrowserWindow({
    width, height, x: bounds.x, y: bounds.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  // Keep hidden until explicitly activated via Ctrl+Alt
  overlayWin.once('ready-to-show', () => {
    if (overlayWin && !overlayWin.isDestroyed() && !modKeysDown) overlayWin.hide();
  });
  overlayWin.on('closed', () => { overlayWin = null; });

  // Broadcast the live cursor into the overlay so the golden ribbon follows it.
  let cursorLogCount = 0;
  let lastCursor = null;
  const pollCursor = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed()) { clearInterval(pollCursor); return; }
    if (!overlayWin.isVisible()) { lastCursor = null; return; }
    const p = screen.getCursorScreenPoint();
    if (lastCursor && lastCursor.x === p.x && lastCursor.y === p.y) return;
    lastCursor = { x: p.x, y: p.y };
    const b = overlayWin.getBounds();
    const rel = { x: p.x - b.x, y: p.y - b.y, sx: p.x, sy: p.y };
    if (cursorLogCount < 5) { console.log('[cursor] -> overlay', rel.x, rel.y); cursorLogCount++; }
    overlayWin.webContents.send('overlay-cursor', rel);
  }, 24);
  overlayWin.on('closed', () => clearInterval(pollCursor));

  startMouseActivityTracker();
  return overlayWin;
}

function registerHotkey() {
  // Unico shortcut richiesto: tenere premuti Ctrl+Alt
  globalShortcut.unregisterAll();
  startModifierKeyWatcher();
}

function startModifierKeyWatcher() {
  if (modKeyWatcher) return;
  console.log('[modkeys] starting watcher');
  const { spawn } = require('child_process');
  const script = [
    "Add-Type @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class K { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey); }',
    "'@",
    "$down = $false",
    "while ($true) {",
    "  $ctrl = ([K]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0",
    "  $alt = ([K]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0",
    "  $both = $ctrl -and $alt",
    "  if ($both -ne $down) { $down = $both; if ($down) { Write-Output 'DOWN' } else { Write-Output 'UP' } }",
    "  Start-Sleep -Milliseconds 20",
    "}"
  ].join('\r\n');
  modKeyWatcher = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  modKeyWatcher.stdout.setEncoding('utf8');
  let buf = '';
  modKeyWatcher.stdout.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line === 'DOWN') onCtrlAltDown();
      else if (line === 'UP') onCtrlAltUp();
    }
  });
  modKeyWatcher.on('exit', (code) => {
    console.log('[modkeys] watcher exited', code);
    modKeyWatcher = null;
    if (modKeysDown) { try { onCtrlAltUp(); } catch {} }
    modKeysDown = false;
    // Auto-restart watcher to keep Ctrl+Alt reactive
    if (app && !app.isQuiting) setTimeout(() => { try { startModifierKeyWatcher(); } catch {} }, 300);
  });
  modKeyWatcher.on('error', (e) => {
    console.error('mod key watcher error', e);
    modKeyWatcher = null;
  });
}

function startMouseActivityTracker() {
  // Pointer appears only when Clicky is invoked via Ctrl+Alt.
  // Keep last position tracking minimal; no auto-show on mouse movement.
  if (mouseTracker) return;
  mouseTracker = setInterval(() => {
    try {
      lastMousePos = screen.getCursorScreenPoint();
    } catch {}
  }, 250);
}

function activateAssistantUI() {
  showNotchWindow();
  if (!overlayWin || overlayWin.isDestroyed()) createOverlayWindow();
  try {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWin.showInactive();
    console.log('[modkeys] overlay visible=', overlayWin.isVisible());
  } catch (e) {
    console.log('[modkeys] overlay show error', e?.message || e);
  }
  try { overlayWin.webContents.send('overlay-set-mode', { mode: 'pointer', active: true }); } catch {}
  try {
    if (notchWin && !notchWin.isDestroyed()) {
      notchWin.setAlwaysOnTop(true, 'screen-saver');
      notchWin.showInactive();
      notchWin.moveTop();
    }
  } catch {}
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  appState.isOverlayVisible = true;
  lastActiveAt = Date.now();
  if (notchWin && !notchWin.isDestroyed()) notchWin.webContents.send('assistant-hold-start');
}

function onCtrlAltDown() {
  if (modKeysDown) {
    console.log('[modkeys] Ctrl+Alt DOWN (resync)');
    activateAssistantUI();
    return;
  }
  modKeysDown = true;
  appState.isCtrlAltDown = true;
  console.log('[modkeys] Ctrl+Alt DOWN');
  activateAssistantUI();
}

function cleanupOnKeyRelease() {
  modKeysDown = false;
  appState.isCtrlAltDown = false;
  if (notchWin && !notchWin.isDestroyed()) notchWin.webContents.send('assistant-hold-stop');
  try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay-set-mode', { mode: 'off', active: false }); } catch {}
  setTimeout(() => {
    if (modKeysDown) return;
    try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide(); } catch {}
    scheduleIdle(5000);
  }, 480);
}

function onCtrlAltUp() {
  if (!modKeysDown) {
    // Ensure cleanup even if state desynced
    try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay-set-mode', { mode: 'off', active: false }); } catch {}
    return;
  }
  cleanupOnKeyRelease();
}

app.whenReady().then(() => {
  const cfg = ensureConfig();
  // Windows shell identity (taskbar grouping, notifications, tray)
  try { app.setAppUserModelId('com.fckclicky.app'); } catch {}
  // Follow the OS light/dark theme automatically
  try { nativeTheme.themeSource = 'system'; } catch {}
  // Allow microphone/camera/media permissions for voice features
  try {
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      callback(true); // Allow all permissions for microphone
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission) => {
      return true; // Allow all permission checks
    });
  } catch (e) {
    console.log('Permission handler setup error:', e?.message || e);
  }
  if (!cfg.setup_completed) {
    createSetupWindow();
  } else {
    startMainAppUI();
    // Dev helper: force the notch visible for UI work (opt-in)
    if (process.env.HEYCLICKY_DEBUG_SHOW === '1') {
      setTimeout(() => { try { showNotchWindow(); } catch {} }, 900);
    }
  }
});

app.on('before-quit', () => { app.isQuiting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { modKeyWatcher && modKeyWatcher.kill(); } catch {} try { mouseTracker && clearInterval(mouseTracker); } catch {} });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// IPC
ipcMain.handle('get-config', () => ensureConfig());
ipcMain.handle('save-config', (e, cfg) => saveConfig(cfg));
ipcMain.handle('get-assets-path', () => path.join(__dirname, 'assets'));

// ===== Windows 11 shell integration (theme / accent color) =====
function getThemeInfo() {
  let accent = null;
  try {
    // Windows returns RRGGBBAA (e.g. "0078d4ff")
    const raw = systemPreferences.getAccentColor?.();
    if (raw && /^[0-9a-fA-F]{6,8}$/.test(raw)) accent = '#' + raw.slice(0, 6);
  } catch {}
  return {
    accent: accent || (nativeTheme.shouldUseDarkColors ? '#60cdff' : '#0067c0'),
    dark: nativeTheme.shouldUseDarkColors,
    highContrast: nativeTheme.shouldUseHighContrastColors,
    reducedMotion: false
  };
}
ipcMain.handle('get-theme', () => getThemeInfo());

function broadcastTheme() {
  const info = getThemeInfo();
  for (const w of BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) w.webContents.send('theme-changed', info); } catch {}
  }
}
try { nativeTheme.on('updated', broadcastTheme); } catch {}
ipcMain.handle('set-window-size', (e, { width, height, animate }) => {
  if (!notchWin || notchWin.isDestroyed()) return;
  const display = getDisplayForNotch();
  const { x: dx, y: dy, width: dw } = display.workArea;
  const reqW = Math.round(width || 380);
  const reqH = Math.round(height || 34);
  const w = reqH <= 40
    ? Math.min(380, Math.max(280, reqW, dw - 60))
    : Math.min(Math.max(420, reqW), Math.max(420, dw - 40));
  const h = Math.min(Math.max(34, reqH), Math.max(120, display.workArea.height - 64));
  const x = Math.round(dx + (dw - w) / 2);
  const y = dy + 4;
  const target = { x, y, width: w, height: h };
  if (animate) animateWindowBounds(notchWin, target, 420);
  else notchWin.setBounds(target, false);
});
ipcMain.handle('set-ignore-mouse', (e, ignore) => { if (notchWin) notchWin.setIgnoreMouseEvents(!!ignore, { forward: true }); });
ipcMain.handle('show-overlay', () => {
  // Pointer appears only when Clicky is invoked via Ctrl+Alt
  if (!modKeysDown) {
    console.log('[ipc] show-overlay ignored (not invoked via Ctrl+Alt)');
    return { visible: false };
  }
  console.log('[ipc] show-overlay');
  showNotchWindow();
  if (!overlayWin || overlayWin.isDestroyed()) createOverlayWindow();
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.showInactive();
  overlayWin.webContents.send('overlay-set-mode', { mode: 'pointer' });
  return { visible: true };
});
ipcMain.handle('hide-overlay', () => {
  console.log('[ipc] hide-overlay');
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
  return { visible: false };
});
ipcMain.handle('toggle-overlay', () => {
  // Pointer appears only when Clicky is invoked via Ctrl+Alt
  if (!modKeysDown) {
    return { visible: !!(overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) };
  }
  if (!overlayWin || overlayWin.isDestroyed()) createOverlayWindow();
  if (overlayWin.isVisible()) {
    overlayWin.hide();
    return { visible: false };
  } else {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.showInactive();
    overlayWin.webContents.send('overlay-set-mode', { mode: 'pointer' });
    return { visible: true };
  }
});
ipcMain.handle('hide-notch', () => {
  modKeysDown = false;
  uiBusy = false;
  try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay-set-mode', { mode: 'off', active: false }); } catch {}
  try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide(); } catch {}
  try { if (notchWin && !notchWin.isDestroyed()) notchWin.hide(); } catch {}
  try { if (notchWin && !notchWin.isDestroyed()) notchWin.webContents.send('assistant-idle'); } catch {}
  return true;
});
let lastOverlaySelection = null;
let lastOverlaySelectionAt = 0;
let appState = {
  isCtrlAltDown: false,
  isOverlayVisible: false,
  isResyncScheduled: false
};

function refineSelectionRect(rect, img, scale) {
  // Heuristic vision-like refinement: tighten bounds around high-contrast/content pixels
  try {
    if (!rect || !img) return rect;
    const crop = {
      x: Math.max(0, Math.round(rect.x * scale)),
      y: Math.max(0, Math.round(rect.y * scale)),
      width: Math.max(1, Math.round(rect.w * scale)),
      height: Math.max(1, Math.round(rect.h * scale))
    };
    const sub = img.crop(crop);
    const size = sub.getSize();
    const bmp = sub.getBitmap();
    if (!bmp || !size.width || !size.height) return rect;
    const w = size.width, h = size.height;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;

    // sample pixels and detect edges/contrast against local neighborhood
    const step = Math.max(1, Math.floor(Math.min(w, h) / 120));
    const lum = (i) => (bmp[i] * 0.299 + bmp[i + 1] * 0.587 + bmp[i + 2] * 0.114);
    for (let y = step; y < h - step; y += step) {
      for (let x = step; x < w - step; x += step) {
        const i = (y * w + x) * 4;
        const l = lum(i);
        const l2 = lum(((y - step) * w + x) * 4);
        const l3 = lum((y * w + (x + step)) * 4);
        const d = Math.abs(l - l2) + Math.abs(l - l3);
        if (d > 28) { // edge/content
          if (x < minX) minX = x; if (y < minY) minY = y;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (!found) return rect;
    // pad a bit
    const pad = Math.round(8 * scale);
    const rx = Math.max(0, crop.x + minX - pad);
    const ry = Math.max(0, crop.y + minY - pad);
    const rw = Math.min(crop.width - Math.max(0, minX - pad), (maxX - minX) + pad * 2);
    const rh = Math.min(crop.height - Math.max(0, minY - pad), (maxY - minY) + pad * 2);
    if (rw < 20 * scale || rh < 20 * scale) return rect;
    // don't over-shrink; keep at least 40% of original
    if ((rw * rh) < (crop.width * crop.height * 0.4)) return rect;
    return { x: rx / scale, y: ry / scale, w: rw / scale, h: rh / scale };
  } catch (e) {
    return rect;
  }
}

ipcMain.handle('overlay-report-selection', async (e, rect) => {
  // Try to refine selection for better precision
  let refined = rect || null;
  if (rect && rect.w > 10 && rect.h > 10) {
    try {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: primary.size.width, height: primary.size.height } });
      const src = sources && sources[0];
      if (src) refined = refineSelectionRect(rect, src.thumbnail, primary.scaleFactor || 1) || rect;
    } catch {}
  }
  lastOverlaySelection = refined;
  lastOverlaySelectionAt = refined ? Date.now() : 0;
  console.log('[overlay] selection', refined ? 'set' : 'cleared');
  try { if (overlayWin && !overlayWin.isDestroyed() && refined) overlayWin.webContents.send('overlay-draw', { selection: refined }); } catch {}
  return { ok: true, rect: refined };
});

ipcMain.handle('set-ui-state', (e, state) => {
  uiBusy = !!(state && state.busy);
  lastActiveAt = Date.now();
  if (uiBusy) {
    showNotchWindow();
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  } else if (!modKeysDown) {
    scheduleIdle(5000);
  }
  return true;
});
ipcMain.handle('overlay-update', (e, payload) => { if (!overlayWin) createOverlayWindow(); overlayWin.webContents.send('overlay-draw', payload); });
ipcMain.handle('overlay-set-interactive', (e, interactive) => {
  if (!overlayWin) createOverlayWindow();
  if (interactive) {
    overlayWin.setIgnoreMouseEvents(false);
    overlayWin.focus();
  } else {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  }
  overlayWin.webContents.send('overlay-interactive', !!interactive);
  return true;
});
ipcMain.handle('overlay-set-subtitle', (e, payload) => { if (!overlayWin) createOverlayWindow(); overlayWin.webContents.send('overlay-subtitle', payload); });
ipcMain.handle('overlay-set-cursor', (e, payload) => {
  if (!overlayWin) createOverlayWindow();
  overlayWin.webContents.send('overlay-cursor', payload);
});

ipcMain.handle('capture-screen', async (e, opts = {}) => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: primary.size.width, height: primary.size.height } });
  const src = sources[0];
  if (!src) throw new Error('No screen source');
  let img = src.thumbnail;
  // Intelligent selection: only use recent selection (auto-expires) and consume it once
  let rect = opts && opts.selection ? opts.selection : null;
  if (!rect && opts && opts.useLastSelection && lastOverlaySelection) {
    const age = Date.now() - lastOverlaySelectionAt;
    if (age < 12000) rect = lastOverlaySelection; // recent selection only
    // consume after use to avoid stale selections persisting
    lastOverlaySelection = null;
    lastOverlaySelectionAt = 0;
    try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay-draw', { consumeSelection: true }); } catch {}
  }
  if (rect && rect.w > 5 && rect.h > 5) {
    try {
      const scale = primary.scaleFactor || 1;
      const crop = {
        x: Math.max(0, Math.round(rect.x * scale)),
        y: Math.max(0, Math.round(rect.y * scale)),
        width: Math.max(1, Math.round(rect.w * scale)),
        height: Math.max(1, Math.round(rect.h * scale))
      };
      img = img.crop(crop);
    } catch (err) {
      console.log('crop failed, using full screen', err?.message || err);
    }
  }
  const png = img.toPNG();
  return png.toString('base64');
});
ipcMain.handle('clipboard-write', (e, text) => { clipboard.writeText(text || ''); return true; });

function requestJson(urlStr, opts, bodyObj, stream=false, onChunk=null) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === 'https:' ? https : http;
      const data = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
      const headers = Object.assign({}, opts.headers || {});
      if (data) headers['Content-Length'] = Buffer.byteLength(data);
      const timeoutMs = (opts && opts.timeoutMs) || 30000;
      const req = lib.request({ method: opts.method || 'GET', hostname: u.hostname, port: u.port || (u.protocol==='https:'?443:80), path: u.pathname + (u.search||''), headers }, (res) => {
        let buf = '';
        if (stream && String(res.headers['content-type']||'').includes('text/event-stream')) {
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            buf += chunk;
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx+1);
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (payload === '[DONE]') continue;
              try { const ev = JSON.parse(payload); if (onChunk) onChunk(ev); } catch {}
            }
          });
          res.on('end', () => resolve({ streamed: true }));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const ct = String(res.headers['content-type']||'');
          if (ct.includes('application/json')) {
            try { resolve(JSON.parse(raw.toString('utf8'))); } catch { resolve({ raw: raw.toString('utf8') }); }
          } else if (opts.binary) {
            resolve({ binary: raw.toString('base64'), contentType: ct });
          } else {
            resolve({ raw: raw.toString('utf8'), status: res.statusCode, contentType: ct });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        try { req.destroy(new Error('Request timeout')); } catch { req.destroy(); }
      });
      if (data) req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

ipcMain.handle('ai-test', async () => {
  const cfg = ensureConfig();
  const url = cfg.ai_base_url.replace(/\/$/, '') + '/models';
  return await requestJson(url, { method:'GET', headers: cfg.ai_api_key ? { Authorization: 'Bearer '+cfg.ai_api_key } : {} });
});
ipcMain.handle('ai-chat', async (e, { messages, stream }) => {
  const cfg = ensureConfig();
  const url = cfg.ai_base_url.replace(/\/$/, '') + '/chat/completions';
  const body = { model: cfg.chat_model || 'auto', messages, stream: !!stream, temperature: 0.2 };
  if (stream) {
    let full = '';
    await requestJson(url, { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, cfg.ai_api_key?{Authorization:'Bearer '+cfg.ai_api_key}:{}) }, body, true, (ev) => {
      try {
        const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
        const chunk = delta && delta.content ? delta.content : '';
        if (chunk) { full += chunk; if (notchWin) notchWin.webContents.send('ai-delta', { chunk, full }); }
      } catch {}
    });
    return { content: full };
  }
  return await requestJson(url, { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, cfg.ai_api_key?{Authorization:'Bearer '+cfg.ai_api_key}:{}) }, body);
});
ipcMain.handle('ai-vision', async (e, { prompt, imageBase64, stream }) => {
  const cfg = ensureConfig();
  const url = cfg.ai_base_url.replace(/\/$/, '') + '/chat/completions';
  const dataUrl = 'data:image/png;base64,' + imageBase64;
  const messages = [
    { role:'system', content:'You are FckClicky, a private Windows screen assistant. No cloud subscription. Be concise and helpful. When pointing at UI elements, include drawing tags like [POINT:x,y:label], [BOX:x,y,w,h:label], [ARROW:x1,y1,x2,y2:label], [CIRCLE:x,y,r:label] with normalized 0..1 coordinates.' },
    { role:'user', content:[ {type:'text', text: prompt}, {type:'image_url', image_url:{url:dataUrl}} ] }
  ];
  const body = { model: cfg.vision_model || cfg.chat_model || 'auto', messages, stream: !!stream, temperature: 0.2 };
  if (stream) {
    let full = '';
    await requestJson(url, { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, cfg.ai_api_key?{Authorization:'Bearer '+cfg.ai_api_key}:{}) }, body, true, (ev) => {
      try {
        const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
        const chunk = delta && delta.content ? delta.content : '';
        if (chunk) { full += chunk; if (notchWin) notchWin.webContents.send('ai-delta', { chunk, full }); }
      } catch {}
    });
    return { content: full };
  }
  return await requestJson(url, { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, cfg.ai_api_key?{Authorization:'Bearer '+cfg.ai_api_key}:{}) }, body);
});
ipcMain.handle('ai-tts', async (e, { text }) => {
  const cfg = ensureConfig();
  const url = cfg.ai_base_url.replace(/\/$/, '') + '/audio/speech';
  const body = { model: cfg.tts_model || 'auto', input: text, voice: 'alloy' };
  return await requestJson(url, { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, cfg.ai_api_key?{Authorization:'Bearer '+cfg.ai_api_key}:{}), binary: true }, body, false, null);
});

function multipartRequest(urlStr, fields, fileField, fileName, fileBuffer, contentType, authHeader) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === 'https:' ? https : http;
      const boundary = '----fckclicky' + randomUUID().replace(/-/g,'');
      const chunks = [];
      const push = (s) => chunks.push(Buffer.isBuffer(s) ? s : Buffer.from(s));
      for (const [k,v] of Object.entries(fields||{})) {
        push(`--${boundary}
Content-Disposition: form-data; name="${k}"

${v}
`);
      }
      push(`--${boundary}
Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"
Content-Type: ${contentType}

`);
      push(fileBuffer);
      push(`
--${boundary}--
`);
      const body = Buffer.concat(chunks);
      const headers = { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length };
      if (authHeader) headers['Authorization'] = authHeader;
      const req = lib.request({ method:'POST', hostname:u.hostname, port:u.port || (u.protocol==='https:'?443:80), path:u.pathname + (u.search||''), headers }, (res) => {
        const out = [];
        res.on('data', c => out.push(Buffer.from(c)));
        res.on('end', () => {
          const raw = Buffer.concat(out).toString('utf8');
          try { resolve(JSON.parse(raw)); } catch { resolve({ raw, status: res.statusCode }); }
        });
      });
      req.on('error', reject);
      req.write(body); req.end();
    } catch (e) { reject(e); }
  });
}

function runLocalWhisper(buf, mimeType, cfg) {
  return new Promise((resolve, reject) => {
    try {
      const bin = (cfg.local_whisper_bin || '').trim();
      const model = (cfg.local_whisper_model || '').trim();
      if (!bin) return reject(new Error('Local Whisper: percorso eseguibile non configurato'));
      if (!fs.existsSync(bin)) return reject(new Error('Local Whisper: eseguibile non trovato: ' + bin));
      const ct = mimeType || 'audio/webm';
      const ext = ct.includes('wav') ? 'wav' : (ct.includes('ogg') ? 'ogg' : 'webm');
      const tmpDir = path.join(CONFIG_DIR, 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const id = randomUUID();
      const inFile = path.join(tmpDir, `stt-${id}.${ext}`);
      const outBase = path.join(tmpDir, `stt-${id}`);
      fs.writeFileSync(inFile, buf);

      let argsTpl = (cfg.local_whisper_args || '').trim();
      let args;
      if (argsTpl) {
        argsTpl = argsTpl.replace(/\{model\}/g, model).replace(/\{input\}/g, inFile).replace(/\{output\}/g, outBase);
        // simple split respecting quotes is overkill; basic split
        args = argsTpl.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(s => s.replace(/^"|"$/g, '')) || [];
      } else {
        args = [];
        if (model) { args.push('-m', model); }
        args.push('-f', inFile, '-nt', '-oj', '-of', outBase);
      }

      execFile(bin, args, { windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        let text = '';
        try {
          const jsonPath = outBase + '.json';
          const txtPath = outBase + '.txt';
          if (fs.existsSync(jsonPath)) {
            const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (typeof j.text === 'string') text = j.text;
            else if (Array.isArray(j.transcription)) text = j.transcription.map(s => s.text || '').join(' ');
            else if (Array.isArray(j.segments)) text = j.segments.map(s => s.text || '').join(' ');
          } else if (fs.existsSync(txtPath)) {
            text = fs.readFileSync(txtPath, 'utf8');
          } else {
            // Wrapper contract (faster-whisper): transcript is printed on stdout
            const so = String(stdout || '').trim();
            if (so) text = so;
            else {
              const out = String(stderr || '');
              const m = out.match(/\]\s*(.+)$/m);
              text = m ? m[1] : out.trim();
            }
          }
        } catch (e2) {
          text = String(stdout || '').trim();
        } finally {
          try { fs.unlinkSync(inFile); } catch {}
          try { fs.unlinkSync(outBase + '.json'); } catch {}
          try { fs.unlinkSync(outBase + '.txt'); } catch {}
          try { fs.unlinkSync(outBase + '.srt'); } catch {}
          try { fs.unlinkSync(outBase + '.vtt'); } catch {}
        }
        if (err && !String(text || '').trim()) {
          return reject(new Error('Local Whisper failed: ' + (err.message || err) + (stderr ? (' | ' + String(stderr).slice(0,300)) : '')));
        }
        resolve({ text: String(text || '').trim() });
      });
    } catch (e) {
      reject(e);
    }
  });
}

ipcMain.handle('ai-stt', async (e, { audioBase64, mimeType }) => {
  const cfg = ensureConfig();
  const buf = Buffer.from(audioBase64, 'base64');
  if ((cfg.stt_provider || 'remote') === 'local_whisper') {
    return await runLocalWhisper(buf, mimeType, cfg);
  }
  const url = cfg.ai_base_url.replace(/\/$/, '') + '/audio/transcriptions';
  const ct = mimeType || 'audio/webm';
  const ext = ct.includes('wav') ? 'wav' : (ct.includes('ogg') ? 'ogg' : 'webm');
  return await multipartRequest(url, { model: cfg.stt_model || 'auto' }, 'file', `audio.${ext}`, buf, ct, cfg.ai_api_key ? ('Bearer ' + cfg.ai_api_key) : null);
});

ipcMain.handle('open-setup', () => { createSetupWindow(); return true; });
ipcMain.handle('complete-setup', (e, partialCfg) => {
  const merged = saveConfig({ ...(partialCfg || {}), setup_completed: true });
  try { if (setupWin && !setupWin.isDestroyed()) setupWin.close(); } catch {}
  if (!notchWin || notchWin.isDestroyed()) startMainAppUI();
  return merged;
});
ipcMain.handle('pick-file', async (e, opts = {}) => {
  try {
    const res = await dialog.showOpenDialog(setupWin || notchWin || null, {
      title: opts.title || 'Select file',
      properties: ['openFile'],
      filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths?.length) return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
  } catch (err) {
    return { canceled: true, error: err?.message || String(err) };
  }
});
function runCmd(cmd, args, timeout = 60000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim(), err: err ? (err.message || String(err)) : '' });
      });
    } catch (e) {
      resolve({ ok: false, stdout: '', stderr: String(e), err: String(e) });
    }
  });
}

async function findPython() {
  // Prefer `where python`, then common install paths, then `py` launcher
  const w = await runCmd('where.exe', ['python'], 15000);
  const lines = (w.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (w.ok && lines.length && fs.existsSync(lines[0])) return lines[0];
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(localAppData, 'Programs', 'Python'),
    'C:\\Python312', 'C:\\Python311', 'C:\\Python310'
  ];
  try {
    if (localAppData && fs.existsSync(path.join(localAppData, 'Programs', 'Python'))) {
      for (const entry of fs.readdirSync(path.join(localAppData, 'Programs', 'Python'), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const p = path.join(localAppData, 'Programs', 'Python', entry.name, 'python.exe');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  const py = await runCmd('where.exe', ['py'], 15000);
  if (py.ok && py.stdout && fs.existsSync(py.stdout.split(/\r?\n/)[0].trim())) {
    // py launcher: resolve to python 3 executable
    const r = await runCmd(py.stdout.split(/\r?\n/)[0].trim(), ['-3', '-c', 'import sys; print(sys.executable)'], 15000);
    if (r.ok && r.stdout && fs.existsSync(r.stdout.trim())) return r.stdout.trim();
  }
  return null;
}

const FASTER_WHISPER_TRANSCRIBE_PY = `# FckClicky - faster-whisper transcription wrapper (generated)
import sys

def main():
    if len(sys.argv) < 2:
        print('usage: transcribe.py <audio_file> [model_name]', file=sys.stderr)
        sys.exit(2)
    inp = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else 'base'
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    segments, info = model.transcribe(inp, vad_filter=True, beam_size=1)
    text = ' '.join((s.text or '').strip() for s in segments).strip()
    print(text)

if __name__ == '__main__':
    main()
`;

async function setupFasterWhisper(log, modelName) {
  const baseDir = path.join(CONFIG_DIR, 'whisper');
  fs.mkdirSync(baseDir, { recursive: true });
  const scriptPath = path.join(baseDir, 'transcribe.py');

  log('1/4 Rilevo Python...');
  const python = await findPython();
  if (!python) {
    throw new Error('Python non trovato. Installa Python 3.10+ da python.org (spunta "Add python.exe to PATH") e riprova.');
  }
  log('    Python: ' + python);

  log('2/4 Installo/aggiorno faster-whisper (pip, può richiedere qualche minuto)...');
  const pip = await runCmd(python, ['-m', 'pip', 'install', '--upgrade', 'faster-whisper'], 900000);
  if (!pip.ok) {
    // try --user fallback
    const pip2 = await runCmd(python, ['-m', 'pip', 'install', '--user', '--upgrade', 'faster-whisper'], 900000);
    if (!pip2.ok) throw new Error('pip install faster-whisper fallito: ' + (pip.stderr || pip.err || '').slice(0, 400));
  }
  log('    faster-whisper installato.');

  log('3/4 Creo lo script di trascrizione...');
  fs.writeFileSync(scriptPath, FASTER_WHISPER_TRANSCRIBE_PY, 'utf8');

  log('4/4 Scarico/verifico il modello "' + modelName + '" (al primo uso lo pre-carico, ~145 MB)...');
  const warm = await runCmd(python, ['-c', 'from faster_whisper import WhisperModel; WhisperModel("' + modelName + '", device="cpu", compute_type="int8"); print("MODEL_OK")'], 600000);
  if (!warm.ok && /MODEL_OK/.test(warm.stderr + warm.stdout)) {
    // ok anyway
  } else if (!warm.ok && !/MODEL_OK/.test(warm.stderr + warm.stdout)) {
    throw new Error('Pre-caricamento modello fallito: ' + (warm.stderr || warm.err || '').slice(0, 400));
  }
  log('    Modello pronto.');

  return {
    bin: python,
    model: modelName,
    args: '"' + scriptPath + '" {input} {model}'
  };
}

ipcMain.handle('whisper-auto-setup', async (e, opts = {}) => {
  const log = (m) => { try { if (setupWin && !setupWin.isDestroyed()) setupWin.webContents.send('whisper-setup-log', { msg: m }); } catch {} };
  const cfg = ensureConfig();
  const model = (opts && opts.model && String(opts.model).trim()) || (cfg.local_whisper_model || 'base');
  log('Avvio installazione automatica di faster-whisper (SYSTRAN)...');
  const res = await setupFasterWhisper(log, model);
  log('✅ Completato!');
  return { ok: true, ...res };
});

ipcMain.handle('whisper-check', async (e, payload = {}) => {
  const bin = (payload.local_whisper_bin || '').trim();
  const model = (payload.local_whisper_model || '').trim();
  const result = { ok: false, checks: {} };
  result.checks.bin = bin ? { exists: fs.existsSync(bin), path: bin } : { exists: false, path: '' };
  // model is either a file path (whisper.cpp) or a model name for faster-whisper (tiny/base/small/...)
  const isFile = /[\.\:\\\/]/.test(model);
  result.checks.model = {
    kind: isFile ? 'file' : 'name',
    exists: isFile ? fs.existsSync(model) : true,
    value: model,
    note: isFile ? '' : 'faster-whisper: scaricato automaticamente al primo utilizzo'
  };
  result.ok = !!(result.checks.bin.exists && result.checks.model.exists);
  result.message = result.ok
    ? 'Configurazione STT locale valida.'
    : 'Controlla il percorso di Python/eseguibile e il modello.';
  return result;
});

ipcMain.handle('type-text', async (e, text) => {
  clipboard.writeText(text || '');
  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      // small delay to let focus return to target app if possible
      setTimeout(() => {
        const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`;
        exec(cmd, { windowsHide: true }, (err) => resolve({ ok: !err, pasted: !err }));
      }, 250);
    });
  }
  return { ok: true, pasted: false };
});

// Draw/3D window removed (engine assets of unverified provenance excluded for open-source compliance).
function createSetupWindow() {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.show(); setupWin.focus(); return setupWin; }
  const display = getDisplayForNotch();
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
  const w = 600, h = 640;
  setupWin = new BrowserWindow({
    width: w, height: h,
    x: Math.round(dx + (dw - w) / 2), y: Math.round(dy + Math.max(20, (dh - h) / 2)),
    show: false,
    frame: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#202020',
    title: 'FckClicky Setup',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'AppIcon.ico')
  });
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWin.on('closed', () => { setupWin = null; });
  setupWin.once('ready-to-show', () => {
    try {
      setupWin.setOpacity(0);
      setupWin.show();
      fadeWindow(setupWin, 0, 1, 260);
    } catch {}
  });
  // Windows 11: native Mica backdrop (falls back silently on Windows 10)
  setupWin.webContents.once('did-finish-load', () => {
    try {
      if (typeof setupWin.setBackgroundMaterial === 'function' && process.platform === 'win32') {
        setupWin.setBackgroundMaterial('mica');
        setupWin.webContents.executeJavaScript("document.documentElement.classList.add('material-mica')").catch(() => {});
      }
    } catch {}
  });
  return setupWin;
}

function startMainAppUI() {
  createNotchWindow();
  createOverlayWindow();
  registerHotkey();
  try {
    const iconPath = path.join(__dirname, 'assets', 'AppIcon.ico');
    const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    if (!tray || tray.isDestroyed?.()) {
      tray = new Tray(img);
      const menu = Menu.buildFromTemplate([
        { label: 'Show FckClicky', click: () => { showNotchWindow(); notchWin?.focus(); } },
        { label: 'Hide Overlay', click: () => { if (overlayWin) overlayWin.hide(); scheduleNotchAutoHide(800); } },
        { label: 'Setup...', click: () => { createSetupWindow(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ]);
      tray.setToolTip('FckClicky');
      tray.setContextMenu(menu);
      tray.on('click', () => { showNotchWindow(); notchWin?.focus(); });
    }
  } catch (e) {
    console.log('tray init error', e?.message || e);
  }
}

ipcMain.handle('renderer-log', (e, msg) => { console.log('[renderer]', typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; });
ipcMain.handle('quit-app', () => app.quit());
