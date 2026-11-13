const $ = (s) => document.querySelector(s);
const statusText = $('#statusText');
const statusDot = $('#statusDot') || $('.status-dot');
const transcriptEl = $('#transcript');
const settingsBtn = $('#settingsBtn');
const settingsPanel = $('#settingsPanel');

// ===== Windows 11 theme bridge (accent color + light/dark) =====
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return { r: 0, g: 120, b: 212 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function mixColor(hex, targetHex, amount) {
  const a = hexToRgb(hex), b = hexToRgb(targetHex);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount
  });
}
function relLuminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function applyTheme(info) {
  const root = document.documentElement;
  const dark = info ? !!info.dark : !window.matchMedia('(prefers-color-scheme: light)').matches;
  root.classList.toggle('theme-light', !dark);
  const base = (info && info.accent) || (dark ? '#60cdff' : '#0067c0');
  // WinUI tints the system accent for dark theme so it stays legible on dark surfaces.
  const fill = dark ? mixColor(base, '#ffffff', 0.42) : base;
  const rgb = hexToRgb(fill);
  root.style.setProperty('--accent', fill);
  root.style.setProperty('--accent-fill', fill);
  root.style.setProperty('--accent-text', relLuminance(rgb) > 0.45 ? '#0a1a24' : '#ffffff');
  root.style.setProperty('--accent-subtle', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);
}
try {
  window.fckclicky?.getTheme?.().then(applyTheme).catch(() => applyTheme(null));
  window.fckclicky?.onThemeChange?.((info) => applyTheme(info));
} catch {}
applyTheme(null);

let mediaRecorder = null;
let audioChunks = [];
let recordingStream = null;
let recording = false;
let voiceHoldActive = false;
let micRequestPending = false;

// ===== UI Sounds (Web Audio, synthesized) =====
let audioCtx = null;
function getAudioCtx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch {}
  return audioCtx;
}
function playTone({ freq = 440, type = 'sine', duration = 0.12, gain = 0.03, slideTo = null, delay = 0, attack = 0.01 } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + duration + 0.03);
}
function playClick({ soft = false } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(soft ? 1200 : 1600, t0);
  osc.frequency.exponentialRampToValueAtTime(soft ? 500 : 700, t0 + 0.045);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(soft ? 0.03 : 0.045, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + 0.06);
}
const uiSound = {
  click() { playClick(); },
  softClick() { playClick({ soft: true }); },
  open() { playClick({ soft: true }); playTone({ freq: 520, slideTo: 980, duration: 0.12, gain: 0.022, type: 'sine', delay: 0.02 }); },
  close() { playTone({ freq: 820, slideTo: 420, duration: 0.11, gain: 0.02, type: 'sine' }); },
  listenStart() { playClick({ soft: true }); playTone({ freq: 420, slideTo: 640, duration: 0.08, gain: 0.022 }); playTone({ freq: 640, slideTo: 920, duration: 0.14, gain: 0.02, delay: 0.05, type: 'triangle' }); },
  listenStop() { playTone({ freq: 880, slideTo: 560, duration: 0.09, gain: 0.02, type: 'triangle' }); },
  success() { playTone({ freq: 523, slideTo: 784, duration: 0.09, gain: 0.02, type: 'sine' }); playTone({ freq: 784, slideTo: 1046, duration: 0.16, gain: 0.02, delay: 0.07, type: 'triangle' }); },
  error() { playTone({ freq: 260, slideTo: 180, duration: 0.16, gain: 0.028, type: 'sawtooth' }); playTone({ freq: 180, slideTo: 130, duration: 0.18, gain: 0.02, delay: 0.06, type: 'triangle' }); },
  pointerOn() { playTone({ freq: 660, slideTo: 990, duration: 0.1, gain: 0.018, type: 'sine' }); },
  pointerOff() { playTone({ freq: 880, slideTo: 520, duration: 0.09, gain: 0.016, type: 'sine' }); },
  selection() { playClick(); playTone({ freq: 700, slideTo: 1050, duration: 0.1, gain: 0.022, type: 'triangle', delay: 0.03 }); playTone({ freq: 1050, slideTo: 1400, duration: 0.14, gain: 0.018, delay: 0.08, type: 'sine' }); }
};

// Centralized notch/status copy (English, short labels for the 24px status line).
const COPY = {
  ready: 'Ready - Hold Ctrl+Alt to speak',
  listening: 'Listeningâ€¦',
  thinking: 'Thinkingâ€¦',
  speaking: 'Speakingâ€¦',
  tray: 'In tray - Hold Ctrl+Alt to speak',
  cancelled: 'Cancelled - Hold Ctrl+Alt to speak'
};

function setStatus(msg, kind='ok') {
  if (statusText) statusText.textContent = msg || '';
  if (statusDot) {
    statusDot.classList.remove('busy', 'error', 'listening', 'thinking', 'speaking');
    if (kind === 'busy' || kind === 'thinking') statusDot.classList.add('busy');
    else if (kind === 'listening') statusDot.classList.add('listening');
    else if (kind === 'speaking') statusDot.classList.add('speaking');
    else if (kind === 'error') statusDot.classList.add('error');
  }

  // (mic button removed)
  // Keep main process "busy" only for active work; errors should still allow auto-idle.
  const busy = kind === 'listening' || kind === 'thinking' || kind === 'speaking' || kind === 'busy';
  window.fckclicky?.setUiState?.({ busy, kind, msg });
}

function showTranscript(text, ms = 8000) {
  if (!transcriptEl) return;
  const msg = String(text || '');
  transcriptEl.textContent = msg;
  transcriptEl.classList.add('show');
  // Expand window so full error/details are readable
  const lines = Math.max(2, msg.split('\n').length + Math.ceil(msg.length / 70));
  const h = Math.min(300, 56 + lines * 18);
  try { window.fckclicky?.setWindowSize?.({ width: 520, height: h, animate: true }); } catch {}
  try { window.fckclicky?.setUiState?.({ busy: true, kind: 'detail', msg }); } catch {}
  clearTimeout(showTranscript._t);
  showTranscript._t = setTimeout(() => {
    transcriptEl.classList.remove('show');
    try { window.fckclicky?.setWindowSize?.({ width: 520, height: 40, animate: false }); } catch {}
  }, ms);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      resolve(res.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Pointer and microphone: activated via Ctrl+Alt (no dedicated button)
$('#collapseBtn').addEventListener('click', () => {
  uiSound.click();
  closeSettings();
  window.fckclicky?.hideOverlay?.();
  window.fckclicky?.hideNotch?.();
  setStatus(COPY.ready, 'ok');
});
$('#quitBtn').addEventListener('click', () => {
  uiSound.click();
  // Minimize to system tray instead of quitting - keep app running
  try { window.fckclicky?.hideNotch?.(); } catch {}
  // Optionally, hide the overlay too
  try { window.fckclicky?.hideOverlay?.(); } catch {}
  // Show notification in system tray or status
  setStatus(COPY.tray, 'ok');
});

function ensureSelectHasValue(sel, value) {
  if (!sel) return;
  const v = value || 'auto';
  const exists = Array.from(sel.options).some(o => o.value === v);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
  sel.value = v;
}

function populateModelSelect(selectId, models, selectedValue) {
  const sel = $('#' + selectId);
  if (!sel) return;
  const prev = selectedValue || sel.value || 'auto';
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = 'auto';
  sel.appendChild(auto);
  const seen = new Set(['auto']);
  models.forEach(m => {
    const id = m.id || m;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    sel.appendChild(opt);
  });
  ensureSelectHasValue(sel, prev);
}

// ===== Motion preference =====
// Windows can turn CSS motion off ("Animation effects"), which made the whole
// interface feel static. "Animazioni complete" re-enables the full choreography.
const MOTION_KEY = 'fckclicky.motionFull';
function motionFullEnabled() {
  // Full choreography is the default (this build is tuned for it); the toggle
  // turns it off for people who prefer calm/instant feedback.
  try { return localStorage.getItem(MOTION_KEY) !== '0'; } catch { return true; }
}
function applyMotionPreference() {
  const on = motionFullEnabled();
  document.documentElement.classList.toggle('force-motion', on);
  const box = document.getElementById('cfgMotionFull');
  if (box) box.checked = on;
}
applyMotionPreference();
document.addEventListener('DOMContentLoaded', applyMotionPreference);
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'cfgMotionFull') {
    try { localStorage.setItem(MOTION_KEY, e.target.checked ? '1' : '0'); } catch {}
    applyMotionPreference();
    if (e.target.checked) replayNotchEntrance();
  }
});

// Settings
let settingsOpen = false;
function updateSttProviderUI() {
  const provider = $('#cfgSttProvider')?.value || 'remote';
  const localFields = $('#localWhisperFields');
  if (localFields) localFields.style.display = provider === 'local_whisper' ? 'block' : 'none';
}
async function openSettings() {
  if (!settingsPanel || settingsOpen) return;
  settingsOpen = true;
  uiSound.open();
  try {
    const cfg = await window.fckclicky.getConfig();
    if ($('#cfgBaseUrl')) $('#cfgBaseUrl').value = cfg.ai_base_url || '';
    if ($('#cfgApiKey')) $('#cfgApiKey').value = cfg.ai_api_key || '';
    ensureSelectHasValue($('#cfgChatModel'), cfg.chat_model || 'auto');
    ensureSelectHasValue($('#cfgVisionModel'), cfg.vision_model || 'auto');
    ensureSelectHasValue($('#cfgSttModel'), cfg.stt_model || 'auto');
    ensureSelectHasValue($('#cfgTtsModel'), cfg.tts_model || 'auto');
    if ($('#cfgSttProvider')) $('#cfgSttProvider').value = cfg.stt_provider || 'remote';
    if ($('#cfgWhisperBin')) $('#cfgWhisperBin').value = cfg.local_whisper_bin || '';
    if ($('#cfgWhisperModel')) $('#cfgWhisperModel').value = cfg.local_whisper_model || '';
    if ($('#cfgWhisperArgs')) $('#cfgWhisperArgs').value = cfg.local_whisper_args || '';
    if ($('#cfgMotionFull')) $('#cfgMotionFull').checked = motionFullEnabled();
    updateSttProviderUI();
  } catch {}
  if (!settingsOpen) return;
  if (settingsPanel.classList.contains('closing')) {
    // Reopened mid-close: restart the reveal cleanly
    settingsPanel.classList.remove('closing');
    settingsPanel.style.display = 'none';
    void settingsPanel.offsetWidth;
  }
  settingsPanel.classList.remove('closing');
  settingsPanel.style.display = 'block';
  requestAnimationFrame(() => {
    if (!settingsOpen || !settingsPanel) return;
    // Morph the window: the bar stretches and the flyout settles in.
    window.fckclicky?.setWindowSize?.({ width: 560, height: 780, animate: true });
  });
  try { window.fckclicky?.setUiState?.({ busy: true, kind: 'settings' }); } catch {}
  loadModelsByType('all').catch(() => {});
}
function closeSettings() {
  if (!settingsOpen && (!settingsPanel || settingsPanel.style.display !== 'block')) {
    if (settingsPanel) settingsPanel.style.display = 'none';
    window.fckclicky?.setWindowSize?.({ width: 380, height: 34, animate: false });
    return;
  }
  settingsOpen = false;
  uiSound.close();
  if (settingsPanel && settingsPanel.style.display === 'block') {
    settingsPanel.classList.add('closing');
    setTimeout(() => {
      if (settingsOpen) return; // reopened meanwhile
      settingsPanel.classList.remove('closing');
      settingsPanel.style.display = 'none';
    }, 190);
    // Let the flyout fade before the window shrinks back to the compact bar.
    setTimeout(() => {
      if (settingsOpen) return;
      window.fckclicky?.setWindowSize?.({ width: 380, height: 34, animate: true });
      try { window.fckclicky?.setUiState?.({ busy: false, kind: 'idle' }); } catch {}
    }, 160);
  } else {
    window.fckclicky?.setWindowSize?.({ width: 380, height: 34, animate: false });
  }
}
settingsBtn?.addEventListener('click', () => {
  uiSound.click();
  if (settingsOpen) closeSettings(); else openSettings();
});
$('#closeSettingsBtn')?.addEventListener('click', closeSettings);
$('#saveSettingsBtn')?.addEventListener('click', async () => {
  const msg = $('#settingsMsg');
  try {
    const cfg = await window.fckclicky.getConfig();
    const next = {
      ...cfg,
      ai_base_url: $('#cfgBaseUrl')?.value.trim() || '',
      ai_api_key: $('#cfgApiKey')?.value.trim() || '',
      chat_model: $('#cfgChatModel')?.value.trim() || 'auto',
      vision_model: $('#cfgVisionModel')?.value.trim() || 'auto',
      stt_model: $('#cfgSttModel')?.value.trim() || 'auto',
      tts_model: $('#cfgTtsModel')?.value.trim() || 'auto',
      stt_provider: $('#cfgSttProvider')?.value || 'remote',
      local_whisper_bin: $('#cfgWhisperBin')?.value.trim() || '',
      local_whisper_model: $('#cfgWhisperModel')?.value.trim() || '',
      local_whisper_args: $('#cfgWhisperArgs')?.value.trim() || '',
    };
    await window.fckclicky.saveConfig(next);
    if (msg) msg.textContent = 'Saved.';
    showTranscript('Settings saved');
  } catch (e) {
    if (msg) msg.textContent = 'Save error: ' + (e?.message || e);
  }
});

$('#cfgSttProvider')?.addEventListener('change', updateSttProviderUI);
$('#pickWhisperBinBtn')?.addEventListener('click', async () => {
  try {
    const res = await window.fckclicky.pickFile?.({ title: 'Select Whisper executable', filters: [{ name: 'Executables', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All Files', extensions: ['*'] }] });
    if (res && !res.canceled && res.path && $('#cfgWhisperBin')) $('#cfgWhisperBin').value = res.path;
  } catch {}
});
$('#pickWhisperModelBtn')?.addEventListener('click', async () => {
  try {
    const res = await window.fckclicky.pickFile?.({ title: 'Select Whisper model', filters: [{ name: 'Models', extensions: ['bin', 'pt', 'gguf', 'onnx'] }, { name: 'All Files', extensions: ['*'] }] });
    if (res && !res.canceled && res.path && $('#cfgWhisperModel')) $('#cfgWhisperModel').value = res.path;
  } catch {}
});
$('#openSetupBtn')?.addEventListener('click', () => {
  try { window.fckclicky.openSetup?.(); } catch {}
});

let cachedModels = null;

function normalizeModels(res) {
  const arr = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.models) ? res.models : (Array.isArray(res) ? res : []));
  return arr.map(m => {
    if (typeof m === 'string') return { id: m, raw: m };
    return { id: m?.id || m?.name || m?.model || '', raw: m };
  }).filter(m => m.id);
}

function modelMatchesType(model, type) {
  const id = String(model.id || '').toLowerCase();
  const raw = JSON.stringify(model.raw || '').toLowerCase();
  const hay = id + ' ' + raw;
  if (type === 'chat') {
    return /(gpt|chat|llama|qwen|mistral|mixtral|claude|gemini|deepseek|phi|command|instruct|sonnet|haiku|opus|o1|o3|o4|reason|text)/.test(hay)
      && !/(whisper|transcribe|tts|speech|audio|embedding|rerank|moderation)/.test(id);
  }
  if (type === 'vision') {
    return /(vision|gpt-4o|gpt-4\.1|omni|vl|llava|pixtral|gemini|claude|image|multimodal|visual)/.test(hay);
  }
  if (type === 'tts') {
    return /(tts|text-to-speech|speech|audio|voice|alloy|echo|nova|fable|onyx|shimmer|eleven|kokoro)/.test(hay)
      && !/(whisper|transcribe|stt|speech-to-text)/.test(hay);
  }
  if (type === 'stt') {
    return /(whisper|stt|speech-to-text|transcribe|transcription|asr)/.test(hay);
  }
  return true;
}

function targetFieldForType(type) {
  if (type === 'chat') return 'cfgChatModel';
  if (type === 'vision') return 'cfgVisionModel';
  if (type === 'tts') return 'cfgTtsModel';
  if (type === 'stt') return 'cfgSttModel';
  return null;
}

async function loadModelsByType(type) {
  const msg = $('#settingsMsg');
  if (msg) msg.textContent = 'Caricamento modelli...';
  try {
    if (!cachedModels) cachedModels = normalizeModels(await window.fckclicky.aiTest());
    if (!cachedModels.length) {
      const raw = await window.fckclicky.aiTest().catch(() => null);
      if (msg) msg.textContent = 'No models found in /models. Check Base URL and API key.';
      try { window.fckclicky?.log?.('models raw: ' + JSON.stringify(raw)); } catch {}
      return;
    }

    const filtered = type === 'all' ? cachedModels : cachedModels.filter(m => modelMatchesType(m, type));
    if (type === 'chat' || type === 'all') {
      const l = (type === 'all' ? cachedModels.filter(m => modelMatchesType(m, 'chat')) : filtered);
      populateModelSelect('cfgChatModel', l.length ? l : cachedModels);
    }
    if (type === 'vision' || type === 'all') {
      const l = (type === 'all' ? cachedModels.filter(m => modelMatchesType(m, 'vision')) : filtered);
      populateModelSelect('cfgVisionModel', l.length ? l : cachedModels);
    }
    if (type === 'tts' || type === 'all') {
      const l = (type === 'all' ? cachedModels.filter(m => modelMatchesType(m, 'tts')) : filtered);
      populateModelSelect('cfgTtsModel', l.length ? l : cachedModels);
    }
    if (type === 'stt' || type === 'all') {
      const l = (type === 'all' ? cachedModels.filter(m => modelMatchesType(m, 'stt')) : filtered);
      populateModelSelect('cfgSttModel', l.length ? l : cachedModels);
    }

    if (msg) {
      if (filtered.length) msg.textContent = `${filtered.length} modelli caricati nel menu (${type === 'all' ? 'tutti' : type}).`;
      else msg.textContent = `Filter ${type}: no matches, showing all ${cachedModels.length} available models.`;
    }
    // Keep settings window tall enough while settings are open
    if (settingsOpen) window.fckclicky?.setWindowSize?.({ width: 560, height: 780, animate: false });
  } catch (e) {    if (msg) msg.textContent = 'Error loading models: ' + (e?.message || e);
    try { window.fckclicky?.log?.('loadModels error: ' + (e?.stack || e?.message || e)); } catch {}
  }
}

// Models are loaded automatically in dropdowns when settings open.

// Listening activated via Ctrl+Alt (hold)

// ===== Voice Mode =====
// Click or Ctrl+Alt+V toggles listening; hold behavior removed to avoid accidental stops.

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    
    // Stop active listening flow if present
    if (recording) {
      stopVoice();
      setStatus(COPY.cancelled, 'ok');
    } else {
      setStatus(COPY.cancelled, 'ok');
    }
  }
});

window.fckclicky?.onActivateAssistant?.(() => {
  if (!recording) startVoice();
});

// ===== Motion: replay the notch entrance each time it is revealed =====
const notchEl = $('#notch');
function replayNotchEntrance() {
  if (!notchEl) return;
  notchEl.classList.remove('notch-out');
  const nodes = [notchEl, ...notchEl.querySelectorAll('.brand, .status, .controls')];
  nodes.forEach((el) => {
    el.style.animation = 'none';
    void el.offsetWidth; // force style flush so the animation restarts
    el.style.animation = '';
  });
}
try { window.fckclicky?.onUiShown?.(replayNotchEntrance); } catch {}

window.fckclicky?.onAssistantHoldStart?.(() => {
  // Ctrl+Alt pressed: start listening (push-to-talk)
  replayNotchEntrance();
  voiceHoldActive = true;
  try { window.fckclicky?.log?.('hold-start received'); } catch {}
  if (!recording) {
    setStatus(COPY.listening, 'listening');
    showTranscript('Speak now, release to send', 12000);
    startVoice().catch((e) => { try { window.fckclicky?.log?.('startVoice rejected: ' + (e?.message || e)); } catch {} });
  }
});
window.fckclicky?.onAssistantHoldStop?.(() => {
  // Ctrl+Alt released: stop listening and send
  voiceHoldActive = false;
  try { window.fckclicky?.log?.('hold-stop received, recording=' + recording + ' pending=' + micRequestPending); } catch {}
  if (recording) {
    stopVoice();
  } else if (micRequestPending) {
    // mic still initializing; startVoice will abort once stream arrives
    setStatus(COPY.ready, 'ok');
    showTranscript('Released too quickly: hold a bit longer', 4000);
  } else {
    setStatus(COPY.ready, 'ok');
  }
});

window.fckclicky?.onAssistantIdle?.(() => {
  // Automatic idle after inactivity/release
  voiceHoldActive = false;
  try { if (recording) cleanupRecording(); } catch {}
  closeSettings();
  setStatus(COPY.ready, 'ok');
  try { transcriptEl?.classList.remove('show'); } catch {}
  try {
    if (notchEl) {
      notchEl.classList.add('notch-out');
      setTimeout(() => notchEl.classList.remove('notch-out'), 320);
    }
  } catch {}
  try { window.fckclicky?.setWindowSize?.({ width: 380, height: 34, animate: false }); } catch {}
});

// Feedback suoni per selezione automatica (da overlay)
window.fckclicky?.onOverlayDraw?.((payload) => {
  // reserved for future visual sync; selection sound handled in overlay
});

window.fckclicky?.onHotkey?.(() => {});
window.fckclicky?.onVoiceHotkey?.(() => {});

async function startVoice() {
  if (recording || micRequestPending) return;
  micRequestPending = true;
  try {
    try { window.fckclicky?.log?.('startVoice: requesting microphone'); } catch {}
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone not supported (getUserMedia unavailable)');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      try { window.fckclicky?.log?.('startVoice: microphone granted (enhanced)'); } catch {}
    } catch (e1) {
      try { window.fckclicky?.log?.('startVoice: enhanced failed, trying basic: ' + (e1?.message || e1)); } catch {}
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try { window.fckclicky?.log?.('startVoice: microphone granted (basic)'); } catch {}
    }

    micRequestPending = false;
    // If user released Ctrl+Alt while we were requesting mic, abort
    if (!voiceHoldActive) {
      try { window.fckclicky?.log?.('startVoice: hold released during mic request, aborting'); } catch {}
      try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
      return;
    }

    recordingStream = stream;
    audioChunks = [];
    const mime = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      ? 'audio/webm;codecs=opus'
      : (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    if (!mime) throw new Error('No supported audio format available (webm/opus missing)');
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType: mime });
    mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) audioChunks.push(ev.data); };
    mediaRecorder.onerror = (ev) => {
      try { window.fckclicky?.log?.('MediaRecorder error: ' + (ev?.error?.message || ev?.error)); } catch {}
      showTranscript('Recording error: ' + (ev?.error?.message || 'unknown'), 12000);
    };
    mediaRecorder.start(100); // Collect data every 100ms
    recording = true;
    uiSound.listenStart();
    setStatus(COPY.listening, 'listening');
    showTranscript('Listening... release Ctrl+Alt to send');
    try { window.fckclicky?.log?.('startVoice: recording started, mime=' + mime); } catch {}
  } catch (err) {
    micRequestPending = false;
    recording = false;
    uiSound.error();
    const name = err?.name ? ` [${err.name}]` : '';
    const msg = err?.message || String(err);
    const full = 'Microphone error' + name + ': ' + msg;
    setStatus(full.slice(0, 80), 'error');
    console.error('[renderer] mic error', err?.stack || err);
    try { window.fckclicky?.log?.('mic error: ' + (err?.stack || err?.message || err)); } catch {}
    showTranscript(full + ' â€” Check Windows Privacy > Microphone, default input device, and app permissions.', 16000);
    cleanupRecording();
  }
}

async function primeMicrophone() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    try { window.fckclicky?.log?.('primeMicrophone: ok'); } catch {}
  } catch (e) {
    try { window.fckclicky?.log?.('primeMicrophone: failed ' + (e?.message || e)); } catch {}
  }
}

async function stopVoice() {
  if (!recording || !mediaRecorder) {
    // If released before mic was ready, nothing to process
    try { window.fckclicky?.log?.('stopVoice: nothing to stop (recording=' + recording + ')'); } catch {}
    return;
  }
  recording = false;
  uiSound.listenStop();
  setStatus(COPY.thinking, 'thinking');
  showTranscript('Processingâ€¦');
  try { window.fckclicky?.log?.('stopVoice: stopping recorder'); } catch {}

  try {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const stopped = new Promise((resolve) => {
      mediaRecorder.onstop = resolve;
    });
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    await stopped;

    const blob = new Blob(audioChunks, { type: mimeType });
    cleanupRecording();

    if (!blob.size) {
      try { window.fckclicky?.log?.('voice: no audio chunks recorded, mime=' + mimeType + ' chunks=' + audioChunks.length); } catch {}
      uiSound.error();
      setStatus(COPY.ready, 'ok');
      showTranscript('No audio recorded. Hold Ctrl+Alt a bit longer and try again.', 10000);
      return;
    }

    const audioBase64 = await blobToBase64(blob);
    let transcript = '';
    try {
      const stt = await window.fckclicky.aiStt({ audioBase64, mimeType });
      transcript = (stt && (stt.text || stt.transcript || stt.result || stt.raw)) || '';
      if (typeof transcript !== 'string') transcript = JSON.stringify(transcript);
    } catch (e) {
      throw new Error('STT fallita: ' + (e?.message || e));
    }

    transcript = (transcript || '').trim();
    if (!transcript) {
      uiSound.error();
      setStatus(COPY.ready, 'ok');
      showTranscript('Non ho capito (trascrizione vuota). Verifica STT/API locale.');
      return;
    }

    showTranscript('Tu: ' + transcript, 12000);
    setStatus(COPY.thinking, 'thinking');

    // Capture screen (use selected area if available) and ask vision/chat
    let answer = '';
    try {
      const imageBase64 = await window.fckclicky.captureScreen({ useLastSelection: true });
      const res = await window.fckclicky.aiVision({ prompt: transcript, imageBase64, stream: false });
      answer = extractContent(res);
    } catch (e) {
      // fallback to text chat
      try {
        const res = await window.fckclicky.aiChat({ messages: [{ role: 'user', content: transcript }], stream: false });
        answer = extractContent(res);
      } catch (e2) {
        throw new Error('AI fallita: ' + (e2?.message || e?.message || e2));
      }
    }

    answer = (answer || '').trim() || 'No response from the model.';
    uiSound.success();
    setStatus(COPY.ready, 'ok');
    showTranscript(answer, 15000);

    // Optional TTS
    try {
      if (window.fckclicky?.aiTts) {
        const tts = await window.fckclicky.aiTts({ text: answer.slice(0, 600) });
        if (tts && tts.binary) {
          const bytes = Uint8Array.from(atob(tts.binary), c => c.charCodeAt(0));
          const audioBlob = new Blob([bytes], { type: tts.contentType || 'audio/mpeg' });
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          setStatus(COPY.speaking, 'speaking');
          audio.onended = () => { URL.revokeObjectURL(url); setStatus(COPY.ready, 'ok'); };
          audio.onerror = () => { URL.revokeObjectURL(url); setStatus(COPY.ready, 'ok'); };
          audio.play().catch(() => { URL.revokeObjectURL(url); setStatus(COPY.ready, 'ok'); });
        }
      }
    } catch (_) {
      // ignore TTS errors
    }
  } catch (err) {
    cleanupRecording();
    uiSound.error();
    const msg = err?.stack || err?.message || String(err);
    try { window.fckclicky?.log?.('voice flow error: ' + msg); } catch {}
    setStatus(('Error: ' + (err?.message || msg)).slice(0, 200), 'error');
    showTranscript('Error: ' + msg, 20000);
  }
}

function extractContent(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.content && typeof res.content === 'string') return res.content;
  if (res.raw && typeof res.raw === 'string') return res.raw;
  try {
    const c = res.choices?.[0]?.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => p.text || p.content || '').join('');
  } catch {}
  return JSON.stringify(res);
}

function cleanupRecording() {
  try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch {}
  try { recordingStream?.getTracks?.().forEach(t => t.stop()); } catch {}
  mediaRecorder = null;
  recordingStream = null;
  audioChunks = [];
}

// Global error surfacing (helps diagnose "TypeError: Cannot read properties of ...")
window.addEventListener('error', (e) => {
  const msg = e?.error?.stack || e?.error?.message || e?.message || String(e?.error || e);
  console.error('window.error', e?.error || e);
  try { window.fckclicky?.log?.('window.error: ' + msg); } catch {}
  setStatus(('Error: ' + String(e?.error?.message || e?.message || msg)).slice(0, 200), 'error');
  showTranscript('Error: ' + msg, 30000);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e?.reason;
  const msg = r?.stack || r?.message || (typeof r === 'string' ? r : JSON.stringify(r)) || String(r);
  console.error('unhandledrejection', r || e);
  try { window.fckclicky?.log?.('unhandledrejection: ' + msg); } catch {}
  setStatus(('Error: ' + String(r?.message || msg)).slice(0, 200), 'error');
  showTranscript('Error: ' + msg, 30000);
});

function cancelAssistant() {
  try { if (recording) { stopVoice._cancelled = true; cleanupRecording(); } } catch {}
  recording = false;
  try { window.fckclicky?.hideOverlay?.(); } catch {}
  closeSettings();
  setStatus(COPY.ready, 'ok');
  try { transcriptEl?.classList.remove('show'); } catch {}
  try { window.fckclicky?.setWindowSize?.({ width: 380, height: 34, animate: false }); } catch {}
  try { window.fckclicky?.setUiState?.({ busy: false, kind: 'idle' }); } catch {}
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    // Esc: close/cancel everything without breaking state
    uiSound.close();
    cancelAssistant();
    window.fckclicky?.hideNotch?.();
  }
});

// Hidden by default; shown on modifier hold. Report idle state for auto-hide.
setStatus(COPY.ready, 'ok');
// Warm up microphone permission/device to make push-to-talk responsive
setTimeout(() => { primeMicrophone().catch(() => {}); }, 1200);