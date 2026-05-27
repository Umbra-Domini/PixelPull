// ── Icon badge helpers ────────────────────────────────────────────────────────

function setIconActive(tabId, active) {
  // No badge — state tracked internally only
}

// Restore badge on service-worker wake-up by reading persisted state
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => {
    chrome.storage.local.get('activeTab_' + tab.id, (res) => {
      if (res['activeTab_' + tab.id]) setIconActive(tab.id, true);
    });
  });
});

// ── Tab lifecycle cleanup ─────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove('activeTab_' + tabId);
  setIconActive(tabId, false);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.local.remove('activeTab_' + tabId);
    setIconActive(tabId, false);
  }
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-grabber') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { action: 'toggle' }, (res) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content.js'] },
          () => chrome.tabs.sendMessage(tabId, { action: 'activate' })
        );
      }
      // badge is set via stateChanged message from content script
    });
  });
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Content script reports state changed — persist it and update badge
  if (msg.action === 'stateChanged') {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      const key = 'activeTab_' + tabId;
      if (msg.active) {
        chrome.storage.local.set({ [key]: true });
      } else {
        chrome.storage.local.remove(key);
      }
      setIconActive(tabId, msg.active);
    }
    sendResponse({ ok: true });
    return;
  }

  // Popup asks for current state — read from storage (survives SW sleep)
  if (msg.action === 'getTabState') {
    const key = 'activeTab_' + msg.tabId;
    // Ask content script directly for ground truth first
    chrome.tabs.sendMessage(msg.tabId, { action: 'getState' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        // Fall back to persisted storage value
        chrome.storage.local.get(key, (stored) => {
          sendResponse({ active: !!stored[key] });
        });
      } else {
        // Sync storage with what the content script says
        if (res.active) {
          chrome.storage.local.set({ [key]: true });
        } else {
          chrome.storage.local.remove(key);
        }
        setIconActive(msg.tabId, res.active);
        sendResponse({ active: res.active });
      }
    });
    return true;
  }

  if (msg.action === 'download') {
    const filename = (msg.filename && msg.filename.match(/\.[a-z]{2,5}$/i))
      ? msg.filename : 'image.png';
    chrome.downloads.download({ url: msg.url, filename, saveAs: false }, (id) => {
      if (chrome.runtime.lastError || id === undefined) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'failed' });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.action === 'sniffMime') {
    fetch(msg.url, { method: 'HEAD' })
      .then(r => {
        const mimeType = r.headers.get('content-type') || 'image/png';
        sendResponse({ mimeType });
      })
      .catch(() => {
        fetch(msg.url, { headers: { Range: 'bytes=0-15' } })
          .then(r => {
            const mimeType = r.headers.get('content-type') || 'image/png';
            sendResponse({ mimeType });
          })
          .catch(e => sendResponse({ error: e.message }));
      });
    return true;
  }

  if (msg.action === 'fetchBlob') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const mimeType = r.headers.get('content-type') || 'image/png';
        return r.arrayBuffer().then(buf => ({ buf, mimeType }));
      })
      .then(({ buf, mimeType }) => {
        sendResponse({ data: Array.from(new Uint8Array(buf)), mimeType });
      })
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'fetchPartial') {
    fetch(msg.url, { headers: { Range: 'bytes=0-65535' } })
      .then(r => {
        if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(buf => sendResponse({ data: Array.from(new Uint8Array(buf)) }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'captureAndCrop') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId) { sendResponse({ error: 'no tab' }); return true; }
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'capture failed' });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

});