const btn             = document.getElementById('toggleBtn');
const dot             = document.getElementById('dot');
const statusText      = document.getElementById('status-text');
const logoIcon        = document.getElementById('logoIcon');
const gearBtn         = document.getElementById('gearBtn');
const historyBtn      = document.getElementById('historyBtn');
const drawerOverlay   = document.getElementById('drawerOverlay');
const settingsDrawer  = document.getElementById('settingsDrawer');
const historyDrawer   = document.getElementById('historyDrawer');
const settingsClose   = document.getElementById('settingsClose');
const historyClose    = document.getElementById('historyClose');
const shortcutDisplay = document.getElementById('shortcutDisplay');
const shortcutClear   = document.getElementById('shortcutClear');
const settingsSave    = document.getElementById('settingsSave');
const shortcutKbd     = document.getElementById('shortcutKbd');
const autoExitToggle  = document.getElementById('autoExitToggle');
const historyList     = document.getElementById('historyList');
const historyEmpty    = document.getElementById('historyEmpty');
const historyClearBtn = document.getElementById('historyClearBtn');
const overlayPills    = document.querySelectorAll('.overlay-pill');

const DEFAULT_SHORTCUT = { key: 'g', alt: true, ctrl: false, shift: false, meta: false };
const STORAGE_KEYS     = ['customShortcut', 'autoExit', 'overlayStyle', 'grabHistory'];

let isActive        = false;
let recording       = false;
let pendingShortcut = null;
let pendingOverlay  = 'outline';

// ── Drawer management ─────────────────────────────────────────────────────────

let activeDrawer = null; // 'settings' | 'history' | null

function openDrawer(name) {
  // Close any open drawer first (instant swap — no double animation)
  if (activeDrawer && activeDrawer !== name) {
    closeDrawer(false);
  }
  activeDrawer = name;
  drawerOverlay.classList.add('visible');
  if (name === 'settings') {
    settingsDrawer.classList.add('open');
    gearBtn.classList.add('open');
  } else if (name === 'history') {
    historyDrawer.classList.add('open');
    historyBtn.classList.add('open');
    // Refresh history when opening
    chrome.storage.local.get('grabHistory', (res) => {
      renderHistory(res.grabHistory || []);
    });
  }
}

function closeDrawer(animate = true) {
  drawerOverlay.classList.remove('visible');
  settingsDrawer.classList.remove('open');
  historyDrawer.classList.remove('open');
  gearBtn.classList.remove('open');
  historyBtn.classList.remove('open');
  activeDrawer = null;
  if (recording) cancelRecording();
}

gearBtn.addEventListener('click', () => {
  activeDrawer === 'settings' ? closeDrawer() : openDrawer('settings');
});

historyBtn.addEventListener('click', () => {
  activeDrawer === 'history' ? closeDrawer() : openDrawer('history');
});

settingsClose.addEventListener('click', closeDrawer);
historyClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadAll(cb) {
  chrome.storage.local.get(STORAGE_KEYS, cb);
}

function shortcutToLabel(s) {
  if (!s) return 'Alt+G';
  const parts = [];
  if (s.ctrl)  parts.push('Ctrl');
  if (s.alt)   parts.push('Alt');
  if (s.shift) parts.push('Shift');
  if (s.meta)  parts.push('Meta');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join('+');
}

function applyShortcutToUI(s) {
  const label = shortcutToLabel(s);
  shortcutDisplay.textContent = label;
  if (shortcutKbd) shortcutKbd.textContent = label;
  pendingShortcut = s;
}

function applyOverlayToUI(style) {
  pendingOverlay = style || 'outline';
  overlayPills.forEach(p => p.classList.toggle('active', p.dataset.style === pendingOverlay));
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadAll((res) => {
  applyShortcutToUI(res.customShortcut || DEFAULT_SHORTCUT);
  autoExitToggle.checked = !!res.autoExit;
  applyOverlayToUI(res.overlayStyle || 'outline');
  renderHistory(res.grabHistory || []);
});

// ── Active tab state ──────────────────────────────────────────────────────────

const toggleNote = document.getElementById('toggleNote');

function setUI(active) {
  isActive = active;
  dot.classList.toggle('active', active);
  statusText.classList.toggle('active', active);
  logoIcon.classList.toggle('active', active);
  statusText.textContent = active ? 'Active' : 'Inactive';
  btn.textContent        = active ? 'Deactivate PixelPull' : 'Activate PixelPull';
  btn.classList.toggle('active', active);
  // Show note when active — tells user the grabber keeps running after popup closes
  if (toggleNote) toggleNote.style.display = active ? 'block' : 'none';
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const tabId = tabs[0].id;
  // Ask background for ground-truth state (it survives popup close/reopen)
  chrome.runtime.sendMessage({ action: 'getTabState', tabId }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    setUI(res.active);
  });
});

btn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;
    const doToggle = () => {
      chrome.tabs.sendMessage(tabId, { action: 'toggle' }, (res) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded yet — inject it then activate
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['content.js'] },
            () => {
              chrome.tabs.sendMessage(tabId, { action: 'activate' }, () => {
                setUI(true);
              });
            }
          );
          return;
        }
        if (res) setUI(res.active);
      });
    };
    doToggle();
  });
});

// ── Shortcut recorder ─────────────────────────────────────────────────────────

function startRecording() {
  recording = true;
  shortcutDisplay.classList.add('recording');
  shortcutDisplay.textContent = 'Press keys…';
}

function cancelRecording() {
  if (!recording) return;
  recording = false;
  shortcutDisplay.classList.remove('recording');
  applyShortcutToUI(pendingShortcut || DEFAULT_SHORTCUT);
}

shortcutDisplay.addEventListener('click', () => {
  recording ? cancelRecording() : startRecording();
});

document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault(); e.stopPropagation();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
  const s = { key: e.key.toLowerCase(), ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  pendingShortcut = s;
  recording = false;
  shortcutDisplay.classList.remove('recording');
  shortcutDisplay.textContent = shortcutToLabel(s);
});

shortcutClear.addEventListener('click', () => {
  pendingShortcut = DEFAULT_SHORTCUT;
  recording = false;
  shortcutDisplay.classList.remove('recording');
  shortcutDisplay.textContent = shortcutToLabel(DEFAULT_SHORTCUT);
});

// ── Overlay pills ─────────────────────────────────────────────────────────────

overlayPills.forEach(p => {
  p.addEventListener('click', () => applyOverlayToUI(p.dataset.style));
});

// ── Save ──────────────────────────────────────────────────────────────────────

settingsSave.addEventListener('click', () => {
  const settings = {
    customShortcut: pendingShortcut || DEFAULT_SHORTCUT,
    autoExit:       autoExitToggle.checked,
    overlayStyle:   pendingOverlay,
  };
  chrome.storage.local.set(settings, () => {
    if (shortcutKbd) shortcutKbd.textContent = shortcutToLabel(settings.customShortcut);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSettings', settings },
        () => { if (chrome.runtime.lastError) {} });
    });
    settingsSave.textContent = 'Saved ✓';
    settingsSave.classList.add('saved');
    setTimeout(() => {
      settingsSave.textContent = 'Save';
      settingsSave.classList.remove('saved');
    }, 1800);
  });
});

// ── History ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function renderHistory(items) {
  historyList.innerHTML = '';

  if (!items || items.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }

  historyEmpty.style.display = 'none';

  items.slice().reverse().forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const isInline = item.src.startsWith('data:') || item.src.startsWith('blob:');
    const shortUrl = isInline ? '(inline image)' : (() => {
      try { return new URL(item.src).pathname.split('/').pop() || item.src.slice(0, 40); }
      catch { return item.src.slice(0, 40); }
    })();

    row.innerHTML = `
      <img class="history-thumb" src="${isInline ? item.src : item.src}" alt=""
           onerror="this.style.opacity='0.2'">
      <div class="history-info">
        <div class="history-url" title="${isInline ? 'Inline image' : item.src}">${shortUrl}</div>
        <div class="history-meta">${item.dims || ''} · ${timeAgo(item.ts)}</div>
      </div>
      <div class="history-actions">
        ${isInline ? '' : `<button class="history-btn" data-action="copy-url" data-src="${item.src}">URL</button>`}
        <button class="history-btn" data-action="open" data-src="${item.src}">↗</button>
      </div>`;

    row.querySelectorAll('.history-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.dataset.action === 'copy-url') {
          navigator.clipboard.writeText(b.dataset.src).then(() => {
            b.textContent = '✓';
            setTimeout(() => { b.textContent = 'URL'; }, 1500);
          });
        } else if (b.dataset.action === 'open') {
          chrome.tabs.create({ url: b.dataset.src });
        }
      });
    });

    historyList.appendChild(row);
  });
}

// Listen for history updates pushed from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'historyUpdated') {
    renderHistory(msg.history);
  }
});

// Refresh on open
chrome.storage.local.get('grabHistory', (res) => {
  renderHistory(res.grabHistory || []);
});

historyClearBtn.addEventListener('click', () => {
  chrome.storage.local.set({ grabHistory: [] }, () => {
    renderHistory([]);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'clearHistory' },
        () => { if (chrome.runtime.lastError) {} });
    });
  });
});