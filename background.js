// Toggle grabber via keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-grabber') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId: tabs[0].id }, files: ['content.js'] },
            () => chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' })
          );
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Download: use chrome.downloads API (bypasses page-level CORS restrictions)
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
    return true; // async
  }

  // ── sniffMime: HEAD request to get Content-Type without downloading the body
  if (msg.action === 'sniffMime') {
    fetch(msg.url, { method: 'HEAD' })
      .then(r => {
        const mimeType = r.headers.get('content-type') || 'image/png';
        sendResponse({ mimeType });
      })
      .catch(() => {
        // HEAD blocked — fall back to a tiny range fetch
        fetch(msg.url, { headers: { Range: 'bytes=0-15' } })
          .then(r => {
            const mimeType = r.headers.get('content-type') || 'image/png';
            sendResponse({ mimeType });
          })
          .catch(e => sendResponse({ error: e.message }));
      });
    return true;
  }

  // ── fetchBlob: fetch image as array buffer from background context
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
    return true; // async
  }

  // ── captureAndCrop: screenshot the visible tab for CORS-blocked images
  if (msg.action === 'captureAndCrop') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId) {
      sendResponse({ error: 'no tab' });
      return true;
    }
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'capture failed' });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async
  }

});