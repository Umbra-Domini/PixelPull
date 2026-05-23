// Guard against double-injection
if (window.__imgGrabberLoaded) {
  // already running — ignore re-injection entirely
} else {
  window.__imgGrabberLoaded = true;

  // Clean up stale UI from previous loads
  ['__img_grabber_tooltip__','__img_grabber_overlay__','__img_grabber_banner__','__img_grabber_hud__'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let active    = false;
  let locked    = false;
  let tooltip   = null;
  let overlay   = null;
  let hud       = null;
  let lockedSrc = null;
  let lockedEl  = null;

  // ── UI creation ────────────────────────────────────────────────────────────

  function createTooltip() {
    const el = document.createElement('div');
    el.id = '__img_grabber_tooltip__';
    document.body.appendChild(el);
    return el;
  }

  function createOverlay() {
    const el = document.createElement('div');
    el.id = '__img_grabber_overlay__';
    document.body.appendChild(el);
    return el;
  }

  function createHud() {
    if (window !== window.top) return null;
    const el = document.createElement('div');
    el.id = '__img_grabber_hud__';
    el.innerHTML = `
      <span class="igrab-hud-dot"></span>
      <span class="igrab-hud-label">PixelPull</span>
      <span class="igrab-hud-divider"></span>
      <span class="igrab-hud-hint">Hover an image &nbsp;•&nbsp; <kbd>Esc</kbd> to exit</span>
      <button class="igrab-hud-close" title="Deactivate">✕</button>
    `;
    document.body.appendChild(el);
    el.querySelector('.igrab-hud-close').addEventListener('click', (e) => {
      e.stopPropagation();
      deactivate();
    });
    return el;
  }

  function updateHud() {
    if (!hud) return;
    if (locked) {
      hud.classList.add('igrab-hud-locked');
      hud.querySelector('.igrab-hud-label').textContent = 'Locked';
      hud.querySelector('.igrab-hud-hint').innerHTML = '<kbd>Esc</kbd> or click to unlock &nbsp;•&nbsp; then <kbd>Esc</kbd> to exit';
    } else {
      hud.classList.remove('igrab-hud-locked');
      hud.querySelector('.igrab-hud-label').textContent = 'PixelPull';
      hud.querySelector('.igrab-hud-hint').innerHTML = 'Hover an image &nbsp;•&nbsp; <kbd>Esc</kbd> to exit';
    }
  }

  // ── Image detection ────────────────────────────────────────────────────────

  function srcFromEl(el) {
    const tag = el.tagName && el.tagName.toUpperCase();

    if (tag === 'IMG') {
      return el.currentSrc || el.src || el.dataset.src || el.dataset.lazySrc
        || el.getAttribute('data-src') || el.getAttribute('data-original')
        || el.getAttribute('data-lazy') || null;
    }

    if (tag === 'CANVAS') {
      try { return el.toDataURL(); } catch(e) { return null; }
    }

    if (tag === 'VIDEO') {
      return el.poster || null;
    }

    if (tag === 'PICTURE') {
      const img = el.querySelector('img');
      if (img) return srcFromEl(img);
      const source = el.querySelector('source[srcset]');
      if (source) return source.srcset.split(',')[0].trim().split(' ')[0];
    }

    if (tag === 'SOURCE' && el.srcset) {
      return el.srcset.split(',')[0].trim().split(' ')[0];
    }

    if (tag === 'SVG' || el.ownerSVGElement) {
      const svg = tag === 'SVG' ? el : el.ownerSVGElement;
      try {
        const s = new XMLSerializer().serializeToString(svg);
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch(e) { return null; }
    }

    try {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match && match[1]) return match[1];
      }
    } catch(e) {}

    return null;
  }

  function getImageSrc(startEl) {
    let el = startEl;
    for (let i = 0; i < 15 && el && el.tagName; i++) {
      const src = srcFromEl(el);
      if (src && src !== 'about:blank' && !src.startsWith('data:,')) return src;

      if (el.querySelectorAll) {
        const children = el.querySelectorAll('img, canvas, video[poster]');
        for (const child of children) {
          const s = srcFromEl(child);
          if (s && s !== 'about:blank') return s;
        }
      }

      el = el.parentElement || el.getRootNode()?.host;
    }
    return null;
  }

  function getHighlightTarget(startEl) {
    let el = startEl;
    for (let i = 0; i < 15 && el && el.tagName; i++) {
      const tag = el.tagName.toUpperCase();
      if (['IMG', 'CANVAS', 'VIDEO', 'PICTURE', 'SVG'].includes(tag)) return el;
      try {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') return el;
      } catch(e) {}
      el = el.parentElement || el.getRootNode()?.host;
    }
    return startEl;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function positionOverlay(el) {
    const rect = el.getBoundingClientRect();
    overlay.style.top    = (rect.top  + window.scrollY) + 'px';
    overlay.style.left   = (rect.left + window.scrollX) + 'px';
    overlay.style.width  = rect.width  + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function populateDimensions(src, el) {
    const dimsEl = document.getElementById('__igrab_dims__');
    if (!dimsEl) return;

    // 1. Try to read from the DOM element directly (instant, no network)
    if (el) {
      const tag = el.tagName && el.tagName.toUpperCase();
      if (tag === 'IMG' && el.naturalWidth) {
        dimsEl.textContent = `${el.naturalWidth} × ${el.naturalHeight} px`;
        // Try to also get file size via HEAD
        fetchSize(src, dimsEl, `${el.naturalWidth} × ${el.naturalHeight} px`);
        return;
      }
      if (tag === 'CANVAS') {
        dimsEl.textContent = `${el.width} × ${el.height} px`;
        return;
      }
    }

    // 2. Load image to get natural dimensions
    const img = new Image();
    img.onload = () => {
      if (!document.getElementById('__igrab_dims__')) return; // tooltip gone
      const dimStr = `${img.naturalWidth} × ${img.naturalHeight} px`;
      dimsEl.textContent = dimStr;
      fetchSize(src, dimsEl, dimStr);
    };
    img.onerror = () => {
      if (dimsEl) dimsEl.textContent = '';
    };
    img.src = src;
  }

  function fetchSize(src, dimsEl, dimStr) {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
      // sniffMime does a HEAD — Content-Length comes back if server provides it
      // We piggyback on the response for size; if not available, skip silently
    });
    // Use fetch HEAD in content context as well for Content-Length
    fetch(src, { method: 'HEAD' }).then(r => {
      const len = r.headers.get('content-length');
      const el = document.getElementById('__igrab_dims__');
      if (el && len) el.textContent = `${dimStr} · ${formatBytes(parseInt(len, 10))}`;
    }).catch(() => {});
  }

  function showTooltip(clientX, clientY, src, isLocked) {
    const isInline = src.startsWith('blob:') || src.startsWith('data:');
    const label = isInline ? '(inline / canvas / SVG)' : src;
    const shortLabel = label.length > 55 ? label.slice(0, 52) + '…' : label;

    tooltip.innerHTML = `
      <div class="igrab-title">${isLocked ? '🔒 Locked' : '⊕ PixelPull'}</div>
      <div class="igrab-url" title="${isInline ? 'Inline image' : src}">${shortLabel}</div>
      ${isLocked ? '<div class="igrab-dims" id="__igrab_dims__">—</div>' : ''}
      <div class="igrab-actions">
        <button class="igrab-btn igrab-copy-url"${isInline ? ' disabled' : ''}>Copy URL</button>
        <button class="igrab-btn igrab-copy-img">Copy Image</button>
      </div>
      <div class="igrab-actions igrab-actions-row2">
        <button class="igrab-btn igrab-download">⬇ Download</button>
        <button class="igrab-btn igrab-open-tab">↗ Open Tab</button>
      </div>
      <div class="igrab-hint">${isLocked
        ? '<kbd>Esc</kbd> or click to unlock &nbsp;•&nbsp; then <kbd>Esc</kbd> to exit'
        : 'Click image to lock &nbsp;•&nbsp; <kbd>Esc</kbd> to exit'
      }</div>
    `;

    // Populate dimensions asynchronously when locked
    if (isLocked) {
      populateDimensions(src, lockedEl);
    }

    tooltip.style.display = 'block';
    tooltip.style.left = '-9999px';
    tooltip.style.top  = '-9999px';

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let tx = clientX + 18, ty = clientY + 18;
    if (tx + tw > window.innerWidth  - 10) tx = clientX - tw - 18;
    if (ty + th > window.innerHeight - 10) ty = clientY - th - 18;
    if (tx < 8) tx = 8;
    if (ty < 8) ty = 8;

    tooltip.style.left = (tx + window.scrollX) + 'px';
    tooltip.style.top  = (ty + window.scrollY) + 'px';
    tooltip.classList.toggle('igrab-locked', isLocked);

    tooltip.querySelector('.igrab-copy-url').onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(src)
        .then(() => flash('URL copied ✓'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = src; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); ta.remove();
          flash('URL copied ✓');
        });
    };

    tooltip.querySelector('.igrab-copy-img').onclick = async (e) => {
      e.stopPropagation();
      await copyImageToClipboard(src);
    };

    tooltip.querySelector('.igrab-download').onclick = (e) => {
      e.stopPropagation();
      downloadImage(src);
    };

    tooltip.querySelector('.igrab-open-tab').onclick = (e) => {
      e.stopPropagation();
      window.open(src, '_blank');
    };

    // As soon as we lock onto an image, probe in background to warn about GIFs/videos
    if (isLocked) probeAndWarnIfAnimated(src);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  // Probe the image as soon as it's locked and warn immediately if it's animated
  function probeAndWarnIfAnimated(src) {
    if (!src || src.startsWith('data:')) return;

    function warnAndBlock() {
      flash('🎞 This is an animated image — for best results use ⬇ Download. Copying may cause errors or lose animation.', 0);
      // Disable the Copy Image button so intent is clear
      const btn = tooltip && tooltip.querySelector('.igrab-copy-img');
      if (btn) {
        btn.disabled = true;
        btn.title = 'Cannot copy animated images — use Download';
        btn.style.opacity = '0.35';
        btn.style.cursor = 'not-allowed';
      }
    }

    // URL-based fast path
    if (src.toLowerCase().includes('.gif')) { warnAndBlock(); return; }
    // Known video CDN pattern (Canva etc.)
    if (src.includes('video-public.') || src.includes('/video/')) { warnAndBlock(); return; }

    // Otherwise sniff MIME via background HEAD request
    chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
      if (chrome.runtime.lastError || !res || res.error) return;
      const mime = res.mimeType || '';
      const isAnimated = mime.includes('gif') || mime.startsWith('video/') || mime === 'application/octet-stream';
      if (isAnimated) warnAndBlock();
    });
  }

  async function copyImageToClipboard(src) {
    // Immediately warn if URL looks like a GIF — don't wait for fetch
    if (src.toLowerCase().includes('.gif')) {
      flash('🎞 GIF detected — copying GIFs can cause errors or lose animation. Use ⬇ Download instead for best results.', 0);
      return;
    }

    flash('Copying…');

    // Helper: given a blob, copy as PNG or redirect GIFs/videos to download hint
    async function handleBlob(blob) {
      // Detect GIF by MIME, URL extension, or magic bytes (GIF87a / GIF89a)
      const mightBeGif = blob.type === 'image/gif' || src.toLowerCase().includes('.gif');
      // Also catch video formats Canva serves for animations (mp4, webm, etc.)
      const isVideo = blob.type.startsWith('video/') || blob.type === 'application/octet-stream';

      const isGif = await (async () => {
        if (mightBeGif) return true;
        if (isVideo) return true; // treat video-format animations same as GIF
        try {
          const buf = await blob.slice(0, 8).arrayBuffer();
          const bytes = new Uint8Array(buf);
          // GIF magic: GIF8
          if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
          // MP4/MOV magic: ftyp box at offset 4
          if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
          // WebM magic: 1A 45 DF A3
          if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return true;
        } catch { return false; }
        return false;
      })();

      if (isGif) {
        flash('🎞 GIF detected — copying GIFs can cause errors or lose animation. Use ⬇ Download instead for best results.', 0);
        return;
      }
      try {
        const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        flash('Image copied ✓');
      } catch(e) {
        flash('Could not copy — try Open Tab');
      }
    }

    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      await handleBlob(blob);
    } catch (err) {
      // CORS — try background fetchBlob which runs in extension context
      chrome.runtime.sendMessage({ action: 'fetchBlob', url: src }, async (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
          // Last resort: screenshot
          flash('Trying screenshot…');
          try {
            const blob = await captureElementBlob(lockedEl);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            flash('Image copied ✓');
          } catch(e) {
            flash('Could not copy — try Open Tab');
          }
          return;
        }
        try {
          const blob = new Blob([new Uint8Array(res.data)], { type: res.mimeType || 'image/png' });
          await handleBlob(blob);
        } catch(e) {
          flash('Could not copy — try Open Tab');
        }
      });
    }
  }

  // Save a blob to disk
  function saveBlobAs(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }

  // Derive extension from MIME type
  function extFromMime(mime) {
    if (!mime) return 'png';
    if (mime.includes('gif'))  return 'gif';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('svg'))  return 'svg';
    if (mime.includes('mp4'))  return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('quicktime')) return 'mov';
    return 'png';
  }

  async function downloadImage(src) {
    flash('Downloading…');

    // ── data: URI — decode and save directly (no network needed)
    if (src.startsWith('data:')) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        saveBlobAs(blob, 'image.' + extFromMime(blob.type));
        flash('Download started ✓');
      } catch(e) { flash('Could not download inline image'); }
      return;
    }

    // ── Sniff real MIME type via a HEAD-like fetchBlob to get the right filename,
    //    but don't transfer the body — use chrome.downloads for the actual file
    //    so we never hit message-size limits on large GIFs/images.
    //    Strategy: probe MIME with fetchBlob (small payload check), then hand off
    //    to chrome.downloads which streams directly to disk.

    // Derive best filename from URL, will be refined after MIME sniff
    const rawName = decodeURIComponent(src.split('/').pop().split('?')[0]);
    const urlHasExt = rawName && rawName.match(/\.[a-z]{2,5}$/i);
    let filename = urlHasExt ? rawName : null;

    // If URL has no extension, sniff MIME via a small fetchBlob request
    // then use chrome.downloads regardless (avoids passing large blob over message bus)
    const doDownload = (fname) => {
      chrome.runtime.sendMessage({ action: 'download', url: src, filename: fname }, (dlRes) => {
        if (chrome.runtime.lastError || (dlRes && dlRes.error)) {
          // chrome.downloads failed — try fetching blob in content script (same-origin or permissive CORS)
          fetch(src).then(r => r.blob()).then(blob => {
            saveBlobAs(blob, fname);
            flash('Download started ✓');
          }).catch(() => {
            flash('Blocked — opening in tab');
            setTimeout(() => window.open(src, '_blank'), 600);
          });
        } else {
          flash('Download started ✓');
        }
      });
    };

    if (filename) {
      // URL already has extension — go straight to download
      doDownload(filename);
    } else {
      // No extension in URL — sniff MIME type first to get correct filename
      chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
        if (!chrome.runtime.lastError && res && !res.error) {
          const ext = extFromMime(res.mimeType);
          filename = 'image.' + ext;
        } else {
          filename = 'image.png';
        }
        doDownload(filename);
      });
    }
  }

  // Screenshot-crop: captures the visible tab, crops to the element's rect
  function captureElementBlob(el) {
    return new Promise((resolve, reject) => {
      const rect = el
        ? el.getBoundingClientRect()
        : { left: 0, top: 0, width: 200, height: 200 };
      const dpr = window.devicePixelRatio || 1;

      chrome.runtime.sendMessage({ action: 'captureAndCrop' }, (res) => {
        if (chrome.runtime.lastError || !res?.dataUrl) {
          return reject(new Error('capture failed'));
        }
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width  = Math.round(rect.width  * dpr);
          c.height = Math.round(rect.height * dpr);
          c.getContext('2d').drawImage(
            img,
            Math.round(rect.left * dpr), Math.round(rect.top * dpr),
            Math.round(rect.width * dpr), Math.round(rect.height * dpr),
            0, 0,
            c.width, c.height
          );
          c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = res.dataUrl;
      });
    });
  }

  async function convertToPng(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 300;
        c.height = img.naturalHeight || 300;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(resolve, 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  function flash(msg, duration = 2500) {
    if (!tooltip) return;
    let f = tooltip.querySelector('.igrab-flash');
    if (!f) { f = document.createElement('div'); f.className = 'igrab-flash'; tooltip.appendChild(f); }
    f.textContent = msg;
    f.style.display = 'block';
    clearTimeout(f._t);
    if (duration > 0) {
      f._t = setTimeout(() => { if (f) f.style.display = 'none'; }, duration);
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (!active || locked) return;

    // Don't trigger if hovering over the HUD itself
    if (hud && hud.contains(e.target)) return;

    const path = (e.composedPath ? e.composedPath() : [e.target])
      .filter(n => n && n.tagName);

    let foundSrc = null;
    let foundEl  = null;

    for (const el of path) {
      const src = getImageSrc(el);
      if (src) { foundSrc = src; foundEl = el; break; }
    }

    if (foundSrc) {
      const highlightEl = getHighlightTarget(foundEl);
      positionOverlay(highlightEl);
      lockedEl  = highlightEl;
      lockedSrc = foundSrc;
      showTooltip(e.clientX, e.clientY, foundSrc, false);
    } else {
      lockedEl = lockedSrc = null;
      if (overlay) overlay.style.display = 'none';
      if (tooltip) tooltip.style.display = 'none';
    }
  }

  function onMouseClick(e) {
    if (!active) return;
    const path = e.composedPath ? e.composedPath() : [];

    // Ignore clicks inside tooltip or HUD — use contains to catch all children (buttons etc)
    if (tooltip && tooltip.contains(e.target)) return;
    if (hud     && hud.contains(e.target))     return;

    if (locked) {
      locked = false;
      overlay.classList.remove('igrab-locked');
      if (tooltip) tooltip.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
      lockedEl = lockedSrc = null;
      updateHud();
      e.preventDefault(); e.stopPropagation();
    } else if (lockedSrc) {
      locked = true;
      overlay.classList.add('igrab-locked');
      showTooltip(e.clientX, e.clientY, lockedSrc, true);
      updateHud();
      e.preventDefault(); e.stopPropagation();
    }
  }

  function onContextMenu(e) { if (active) e.preventDefault(); }

  function onKeydown(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      if (locked) {
        locked = false;
        overlay.classList.remove('igrab-locked');
        if (tooltip) tooltip.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        lockedEl = lockedSrc = null;
        updateHud();
      } else {
        deactivate();
      }
    }
  }

  // ── Activate / Deactivate ──────────────────────────────────────────────────

  function activate() {
    if (active) return;
    active = true; locked = false;
    if (!tooltip) tooltip = createTooltip();
    if (!overlay) overlay = createOverlay();
    if (!hud)     hud     = createHud();
    document.addEventListener('mousemove',    onMouseMove,   true);
    document.addEventListener('click',        onMouseClick,  true);
    document.addEventListener('contextmenu',  onContextMenu, true);
    document.addEventListener('keydown',      onKeydown,     true);
    document.body.style.cursor = 'crosshair';
    showBanner('PixelPull ON');
  }

  function deactivate() {
    if (!active) return;
    active = false; locked = false;
    lockedEl = lockedSrc = null;
    document.removeEventListener('mousemove',   onMouseMove,   true);
    document.removeEventListener('click',       onMouseClick,  true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown',     onKeydown,     true);
    document.body.style.cursor = '';
    if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('igrab-locked'); }
    if (tooltip) tooltip.style.display = 'none';
    // Remove HUD with fade
    if (hud) {
      hud.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(8px)';
      setTimeout(() => { if (hud) { hud.remove(); hud = null; } }, 220);
    }
    showBanner('PixelPull OFF');
  }

  function showBanner(msg) {
    // Only show banner in the top-level frame
    if (window !== window.top) return;
    let b = document.getElementById('__img_grabber_banner__');
    if (!b) {
      b = document.createElement('div');
      b.id = '__img_grabber_banner__';
      document.body.appendChild(b);
    }
    b.textContent = msg;
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), 2000);
  }

  window.__imgGrabberToggle     = () => active ? deactivate() : activate();
  window.__imgGrabberActivate   = activate;
  window.__imgGrabberDeactivate = deactivate;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getState')  { sendResponse({ active }); return; }
    if (msg.action === 'toggle')    { window.__imgGrabberToggle(); sendResponse({ active }); return; }
    if (msg.action === 'activate')  { window.__imgGrabberActivate(); sendResponse({ active }); return; }
    if (msg.action === 'deactivate'){ window.__imgGrabberDeactivate(); sendResponse({ active }); return; }
  });
}