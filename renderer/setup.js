const $ = (s) => document.querySelector(s);

// ===== Windows 11 theme bridge (system accent + light/dark) =====
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
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
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

function updateUI() {
  const provider = $('#sttProvider').value;
  $('#remoteFields').classList.toggle('hidden', provider !== 'remote');
  $('#localFields').classList.toggle('hidden', provider !== 'local_whisper');
}

async function loadCfg() {
  try {
    const cfg = await window.fckclicky.getConfig();
    $('#sttProvider').value = cfg.stt_provider || 'remote';
    $('#baseUrl').value = cfg.ai_base_url || '';
    $('#apiKey').value = cfg.ai_api_key || '';
    $('#sttModel').value = cfg.stt_model || 'auto';
    $('#whisperBin').value = cfg.local_whisper_bin || '';
    $('#whisperModel').value = cfg.local_whisper_model || '';
    $('#whisperArgs').value = cfg.local_whisper_args || '';
  } catch {}
  updateUI();
}

function gatherCfg() {
  return {
    stt_provider: $('#sttProvider').value,
    ai_base_url: $('#baseUrl').value.trim(),
    ai_api_key: $('#apiKey').value.trim(),
    stt_model: $('#sttModel').value.trim() || 'auto',
    local_whisper_bin: $('#whisperBin').value.trim(),
    local_whisper_model: $('#whisperModel').value.trim(),
    local_whisper_args: $('#whisperArgs').value.trim(),
  };
}

$('#sttProvider').addEventListener('change', updateUI);
$('#pickBin').addEventListener('click', async () => {
  const res = await window.fckclicky.pickFile({ title: 'Select python.exe', filters: [{ name: 'Python', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }] });
  if (res && !res.canceled && res.path) $('#whisperBin').value = res.path;
});
$('#checkWhisper').addEventListener('click', async () => {
  const msg = $('#msg');
  msg.textContent = 'Checking...';
  try {
    const cfg = gatherCfg();
    const res = await window.fckclicky.whisperCheck(cfg);
    msg.textContent = res?.message || (res?.ok ? 'OK' : 'Invalid configuration');
    msg.style.color = res?.ok ? '#7ee787' : '#ffb4b4';
  } catch (e) {
    msg.textContent = 'Check error: ' + (e?.message || e);
    msg.style.color = '#ffb4b4';
  }
});

$('#save').addEventListener('click', async () => {
  const msg = $('#msg');
  const cfg = gatherCfg();
  if (cfg.stt_provider === 'local_whisper' && !cfg.local_whisper_bin) {
    msg.textContent = 'Select the path to the Whisper executable for local mode.';
    msg.style.color = '#ffb4b4';
    return;
  }
  msg.textContent = 'Saving...';
  msg.style.color = '#b9c9e6';
  try {
    await window.fckclicky.completeSetup({ ...cfg, setup_completed: true });
  } catch (e) {
    msg.textContent = 'Save error: ' + (e?.message || e);
    msg.style.color = '#ffb4b4';
  }
});

$('#skip').addEventListener('click', async () => {
  const msg = $('#msg');
  msg.textContent = 'Starting with default settings...';
  try {
    await window.fckclicky.completeSetup({ setup_completed: true, stt_provider: 'remote' });
  } catch (e) {
    msg.textContent = 'Error: ' + (e?.message || e);
  }
});

function autoLogAppend(line) {
  const el = $('#autoLog');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent += line + '\n';
  el.scrollTop = el.scrollHeight;
}
window.fckclicky?.onWhisperSetupLog?.((d) => {
  autoLogAppend(d?.msg || '');
});

let autoSetupRunning = false;
$('#autoSetup').addEventListener('click', async () => {
  if (autoSetupRunning) return;
  const btn = $('#autoSetup');
  autoSetupRunning = true;
  btn.disabled = true;
  btn.textContent = 'Installing...';
  const model = $('#autoModel')?.value || 'base';
  autoLogAppend('Starting automatic faster-whisper installation (model: ' + model + ')...');
  try {
    const res = await window.fckclicky.whisperAutoSetup({ model });
    if (res && res.ok) {
      $('#whisperBin').value = res.bin;
      $('#whisperModel').value = res.model;
      autoLogAppend('Done. Fields have been filled in. Click "Save and continue".');
    } else {
      autoLogAppend('Installation finished with an unexpected result: ' + JSON.stringify(res || {}));
    }
  } catch (e) {
    autoLogAppend('Error: ' + (e?.message || e));
    autoLogAppend('Use the manual guide below to install by hand, then fill in the fields.');
  } finally {
    autoSetupRunning = false;
    btn.disabled = false;
    btn.textContent = 'Reinstall / update faster-whisper';
  }
});

loadCfg();