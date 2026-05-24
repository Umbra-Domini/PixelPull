if (window.__imgGrabberLoaded) {
  
} else {
  window.__imgGrabberLoaded = true;

  
  ['__img_grabber_tooltip__','__img_grabber_overlay__','__img_grabber_banner__','__img_grabber_hud__'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let active    = false;
  let locked    = false;
  let tooltip   = null;
  let overlay   = null;
  let hud       = null;
  let colorChip = null;
  let lockedSrc = null;
  let lockedEl  = null;

  

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

  // Sample pixel colour at cursor position from an <img> element
  function samplePixelAt(clientX, clientY, imgEl) {
    try {
      const rect  = imgEl.getBoundingClientRect();
      const scaleX = (imgEl.naturalWidth  || rect.width)  / rect.width;
      const scaleY = (imgEl.naturalHeight || rect.height) / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top)  * scaleY;
      const c  = document.createElement('canvas');
      c.width  = 1; c.height = 1;
      const ctx2 = c.getContext('2d', { willReadFrequently: true });
      ctx2.drawImage(imgEl, -px, -py, imgEl.naturalWidth || rect.width, imgEl.naturalHeight || rect.height);
      const d = ctx2.getImageData(0, 0, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch(e) {
      return null; // CORS-tainted
    }
  }

  // Floating live colour chip — shown while hovering unlocked, hidden on lock
  function createColorChip() {
    const el = document.createElement('div');
    el.id = '__img_grabber_colorchip__';
    document.body.appendChild(el);
    return el;
  }

  function hideColorChip() {
    if (colorChip) colorChip.style.display = 'none';
  }



  let _colorChipThrottle = 0;

  function updateColorChip(clientX, clientY, imgEl, src) {
    if (!colorChip) return;
    const now = Date.now();
    if (now - _colorChipThrottle < 60) return;
    _colorChipThrottle = now;

    // Find the real <img> for pixel sampling (highlightEl may be a wrapper div)
    let sampleEl = null;
    if (imgEl) {
      const tag = imgEl.tagName && imgEl.tagName.toUpperCase();
      if (tag === 'IMG') {
        sampleEl = imgEl;
      } else {
        // Search children first, then siblings, then parent's children
        sampleEl = (imgEl.querySelector && imgEl.querySelector('img')) ||
                   (imgEl.parentElement && imgEl.parentElement.querySelector('img')) || null;
      }
    }
    const hex = sampleEl ? samplePixelAt(clientX, clientY, sampleEl) : null;

    // Dimensions
    const tag = imgEl && imgEl.tagName && imgEl.tagName.toUpperCase();
    let w = 0, h = 0;
    const realImg = sampleEl || imgEl;
    if (realImg && realImg.tagName && realImg.tagName.toUpperCase() === 'IMG' && realImg.naturalWidth) {
      w = realImg.naturalWidth; h = realImg.naturalHeight;
    } else if (tag === 'CANVAS' && imgEl.width) {
      w = imgEl.width; h = imgEl.height;
    } else if (imgEl) {
      const r = imgEl.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
    }

    // Store for async mime refresh
    colorChip.dataset.src = src || '';
    colorChip.dataset.w = w;
    colorChip.dataset.h = h;

    const fmt = (() => {
      if (!src) return '';
      const realUrl = decodeEmbeddedUrl(src) || src;
      const ext = realUrl.split('?')[0].split('.').pop().toLowerCase();
      const map = { png:'PNG', jpg:'JPG', jpeg:'JPG', gif:'GIF', webp:'WebP', svg:'SVG', avif:'AVIF' };
      return map[ext] || '';
    })();
    const fmtHtml = fmt ? `<span class="igrab-chip-sep">·</span><span class="igrab-chip-fmt">${fmt}</span>` : '';
    const dimsHtml = (w && h) ? `<span class="igrab-chip-sep">·</span><span class="igrab-chip-dims">${w} × ${h}</span>` : '';

    colorChip.style.display = 'flex';
    if (hex) {
      colorChip.innerHTML = `<span class="igrab-chip-swatch" style="background:${hex}"></span><span class="igrab-chip-label">${hex}</span>${dimsHtml}${fmtHtml}`;
    } else if (w && h) {
      colorChip.innerHTML = `<span class="igrab-chip-dims-only">${w} × ${h} px</span>${fmtHtml}`;
    } else {
      colorChip.style.display = 'none';
      return;
    }

    // Position above-right of cursor; flip if off-screen
    const cw = colorChip.offsetWidth  || 160;
    const ch = colorChip.offsetHeight || 22;
    const margin = 12;
    let cx = clientX + margin;
    let cy = clientY - ch - margin;
    if (cx + cw > window.innerWidth - 8) cx = clientX - cw - margin;
    if (cy < 8) cy = clientY + margin;
    if (cx < 8) cx = 8;
    colorChip.style.left = (cx + window.scrollX) + 'px';
    colorChip.style.top  = (cy + window.scrollY) + 'px';
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

  

  function srcFromEl(el) {
    const tag = el.tagName && el.tagName.toUpperCase();

    if (tag === 'IMG') {
      const raw = el.currentSrc || el.src || el.dataset.src || el.dataset.lazySrc
        || el.getAttribute('data-src') || el.getAttribute('data-original')
        || el.getAttribute('data-lazy') || null;
      return upgradeCanvaUrl(raw);
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

  // Canva loads a low-quality preview GIF in the <img src> but fetches the full-quality
  // GIF separately via JS. Both share the same resource ID in the URL.
  // We find the full-quality one by scanning performance.getEntriesByType('resource')
  // for a larger GIF with the same resource ID — the browser has already fetched it.
  function upgradeCanvaUrl(src) {
    if (!src) return src;
    // Already a Canva /v/ GIF — check if a better one was loaded
    const canvaMatch = src.match(/^(https:\/\/video-public\.canva\.com\/([^/]+)\/v\/)([^.]+)\.gif/);
    if (canvaMatch) {
      const betterUrl = findBetterCanvaGif(src, canvaMatch[2]);
      return betterUrl || src;
    }
    // Legacy: poster PNG
    const posterMatch = src.match(/^(https:\/\/video-public\.canva\.com\/([^/]+))\/p\/([^.]+)\.png/);
    if (posterMatch) {
      const betterUrl = findBetterCanvaGif(null, posterMatch[2]);
      if (betterUrl) return betterUrl;
      return posterMatch[1] + '/v/' + posterMatch[3] + '.gif';
    }
    return src;
  }

  // Scan performance resource entries for a Canva GIF with the same resource ID
  // that is larger than the current one (i.e. the full-quality version).
  function findBetterCanvaGif(currentSrc, resourceId) {
    try {
      const entries = performance.getEntriesByType('resource');
      let bestUrl = null;
      let bestSize = 0;
      for (const entry of entries) {
        const url = entry.name;
        if (!url.includes('video-public.canva.com')) continue;
        if (!url.includes('/' + resourceId + '/')) continue;
        if (!url.endsWith('.gif')) continue;
        if (url === currentSrc) continue;
        const size = entry.transferSize || entry.encodedBodySize || 0;
        if (size > bestSize) {
          bestSize = size;
          bestUrl = url;
        }
      }
      return bestUrl;
    } catch(e) {
      return null;
    }
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

  

  let thumbCorner = null;

  function removeThumbCorner() {
    if (thumbCorner) { thumbCorner.remove(); thumbCorner = null; }
  }

  function showThumbCorner(src) {
    removeThumbCorner();

    const el = document.createElement('div');
    el.id = '__img_grabber_thumb_corner__';
    el.innerHTML = `
      <div class="igrab-tc-loader" id="__igrab_tc_loader__">⋯</div>
      <img class="igrab-tc-img" id="__igrab_tc_img__" src="${src}" alt="" />
      <div class="igrab-tc-hint">✂ crop</div>
    `;
    document.body.appendChild(el);
    thumbCorner = el;

    const img = el.querySelector('.igrab-tc-img');
    const loader = el.querySelector('.igrab-tc-loader');

    img.style.display = 'none';
    img.onload = () => {
      loader.style.display = 'none';
      img.style.display = 'block';
      positionThumbCorner();
    };
    img.onerror = () => {
      captureElementBlob(lockedEl).then(blob => {
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          loader.style.display = 'none';
          img.style.display = 'block';
          positionThumbCorner();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        };
        img.onerror = () => { el.remove(); thumbCorner = null; };
        img.src = url;
      }).catch(() => { el.remove(); thumbCorner = null; });
    };

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openCropModal(src, lockedEl);
    });
  }

  function positionThumbCorner() {
    if (!thumbCorner || !tooltip) return;
    const tr = tooltip.getBoundingClientRect();
    const size = 80;
    
    thumbCorner.style.left = (tr.right + window.scrollX) + 'px';
    thumbCorner.style.top  = (tr.top  + window.scrollY - size) + 'px';
  }

  

  function openCropModal(src, sourceEl) {
    const existing = document.getElementById('__igrab_crop_modal__');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = '__igrab_crop_modal__';
    modal.innerHTML = `
      <div class="igrab-crop-inner">
        <div class="igrab-crop-header">
          <span class="igrab-crop-title">✂ Crop Image</span>
          <span class="igrab-crop-subtitle">Drag to select area</span>
          <button class="igrab-crop-close">✕</button>
        </div>
        <div class="igrab-crop-canvas-wrap" id="__igrab_crop_wrap__">
          <canvas id="__igrab_crop_canvas__"></canvas>
          <div class="igrab-crop-selection" id="__igrab_crop_sel__"></div>
          <div class="igrab-crop-loading" id="__igrab_crop_loading__">Loading image…</div>
        </div>
        <div class="igrab-crop-dims" id="__igrab_crop_dims__"></div>
        <div class="igrab-crop-fmt-row">
          <span class="igrab-crop-fmt-label">Format</span>
          <div class="igrab-crop-fmt-pills" id="__igrab_crop_fmt__">
            <button class="igrab-fmt-pill" data-fmt="image/png" data-ext="png">PNG</button>
            <button class="igrab-fmt-pill" data-fmt="image/jpeg" data-ext="jpg">JPG</button>
            <button class="igrab-fmt-pill" data-fmt="image/webp" data-ext="webp">WebP</button>
          </div>
        </div>
        <div class="igrab-crop-actions">
          <button class="igrab-btn igrab-crop-copy" disabled>Copy Crop</button>
          <button class="igrab-btn igrab-crop-download" disabled>⬇ Download Crop</button>
          <button class="igrab-btn igrab-crop-reset">Reset</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn  = modal.querySelector('.igrab-crop-close');
    const canvas    = modal.querySelector('#__igrab_crop_canvas__');
    const selDiv    = modal.querySelector('#__igrab_crop_sel__');
    const dimsEl    = modal.querySelector('#__igrab_crop_dims__');
    const copyBtn   = modal.querySelector('.igrab-crop-copy');
    const dlBtn     = modal.querySelector('.igrab-crop-download');
    const resetBtn  = modal.querySelector('.igrab-crop-reset');
    const loadingEl = modal.querySelector('#__igrab_crop_loading__');
    const fmtPills  = modal.querySelectorAll('.igrab-fmt-pill');
    const ctx       = canvas.getContext('2d');

    let naturalImg = null;
    let scale = 1;
    let crop = null;
    let dragging = false, startX = 0, startY = 0;
    let selectedMime = 'image/png';
    let selectedExt  = 'png';

    function detectFormatFromSrc(s) {
      if (!s) return null;
      const clean = s.split('?')[0].toLowerCase();
      if (clean.includes('.jpg') || clean.includes('.jpeg') || s.includes('format:JPG') || s.includes('format=jpg')) return { mime: 'image/jpeg', ext: 'jpg' };
      if (clean.includes('.webp') || s.includes('format:WEBP')) return { mime: 'image/webp', ext: 'webp' };
      if (clean.includes('.png') || s.includes('format:PNG'))  return { mime: 'image/png',  ext: 'png' };
      if (clean.startsWith('data:image/jpeg')) return { mime: 'image/jpeg', ext: 'jpg' };
      if (clean.startsWith('data:image/webp')) return { mime: 'image/webp', ext: 'webp' };
      return null;
    }

    function setActivePill(mime) {
      selectedMime = mime;
      fmtPills.forEach(p => {
        const active = p.dataset.fmt === mime;
        p.classList.toggle('igrab-fmt-pill-active', active);
        if (active) selectedExt = p.dataset.ext;
      });
    }

    fmtPills.forEach(p => {
      p.addEventListener('click', (e) => { e.stopPropagation(); setActivePill(p.dataset.fmt); });
    });

    const detected = detectFormatFromSrc(src);
    setActivePill(detected ? detected.mime : 'image/png');

    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); modal.remove(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    function updateDims() {
      if (!crop || !naturalImg) { dimsEl.textContent = ''; return; }
      const rawX = crop._rawX !== undefined ? crop._rawX : crop.x - (crop._offX || 0);
      const rawY = crop._rawY !== undefined ? crop._rawY : crop.y - (crop._offY || 0);
      const rw = Math.round(crop.w / scale);
      const rh = Math.round(crop.h / scale);
      dimsEl.textContent = `${rw} × ${rh} px`;
    }

    function renderSelection() {
      if (!crop) { selDiv.style.display = 'none'; return; }
      selDiv.style.display = 'block';
      selDiv.style.left   = crop.x + 'px';
      selDiv.style.top    = crop.y + 'px';
      selDiv.style.width  = crop.w + 'px';
      selDiv.style.height = crop.h + 'px';
    }

    function getCropBlob() {
      return new Promise((resolve) => {
        const rawX = crop._rawX !== undefined ? crop._rawX : crop.x - (crop._offX || 0);
        const rawY = crop._rawY !== undefined ? crop._rawY : crop.y - (crop._offY || 0);
        const rx = Math.round(rawX / scale);
        const ry = Math.round(rawY / scale);
        const rw = Math.round(crop.w / scale);
        const rh = Math.round(crop.h / scale);
        const out = document.createElement('canvas');
        out.width  = rw;
        out.height = rh;
        out.getContext('2d').drawImage(naturalImg, rx, ry, rw, rh, 0, 0, rw, rh);
        const quality = selectedMime === 'image/jpeg' ? 0.92 : undefined;
        out.toBlob(resolve, selectedMime, quality);
      });
    }

    function enableButtons(on) {
      copyBtn.disabled = !on;
      dlBtn.disabled   = !on;
    }

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!crop) return;
      const prevMime = selectedMime;
      const prevExt  = selectedExt;
      selectedMime = 'image/png'; selectedExt = 'png';
      const blob = await getCropBlob();
      selectedMime = prevMime; selectedExt = prevExt;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => { copyBtn.textContent = 'Copy Crop'; }, 2000);
      } catch { copyBtn.textContent = 'Failed'; setTimeout(() => { copyBtn.textContent = 'Copy Crop'; }, 2000); }
    });

    dlBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!crop) return;
      const blob = await getCropBlob();
      saveBlobAs(blob, `crop.${selectedExt}`);
      dlBtn.textContent = 'Downloading… ✓';
      setTimeout(() => { dlBtn.textContent = '⬇ Download Crop'; }, 2000);
    });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      crop = null;
      selDiv.style.display = 'none';
      dimsEl.textContent = '';
      enableButtons(false);
    });

    const wrap = modal.querySelector('#__igrab_crop_wrap__');

    wrap.addEventListener('mousedown', (e) => {
      if (!naturalImg) return;
      e.preventDefault(); e.stopPropagation();
      const cr = canvas.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const canvasOffX = cr.left - wr.left;
      const canvasOffY = cr.top  - wr.top;
      startX = e.clientX - cr.left;
      startY = e.clientY - cr.top;
      if (startX < 0 || startY < 0 || startX > cr.width || startY > cr.height) return;
      crop = { x: startX + canvasOffX, y: startY + canvasOffY, w: 0, h: 0 };
      crop._offX = canvasOffX;
      crop._offY = canvasOffY;
      dragging = true;
      enableButtons(false);
      renderSelection();
    });

    window.addEventListener('mousemove', function onMove(e) {
      if (!dragging) return;
      const cr = canvas.getBoundingClientRect();
      const cx = Math.min(Math.max(e.clientX - cr.left, 0), cr.width);
      const cy = Math.min(Math.max(e.clientY - cr.top,  0), cr.height);
      crop = {
        x: Math.min(startX, cx) + crop._offX,
        y: Math.min(startY, cy) + crop._offY,
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY),
        _offX: crop._offX,
        _offY: crop._offY,
        _rawX: Math.min(startX, cx),
        _rawY: Math.min(startY, cy),
      };
      renderSelection();
      updateDims();
    });

    window.addEventListener('mouseup', function onUp() {
      if (!dragging) return;
      dragging = false;
      if (crop && crop.w > 4 && crop.h > 4) {
        enableButtons(true);
      } else {
        crop = null;
        selDiv.style.display = 'none';
        dimsEl.textContent = '';
      }
    });

    function loadImage(imgSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        naturalImg = img;
        const MAX = 500;
        scale = Math.min(1, MAX / img.naturalWidth, MAX / img.naturalHeight);
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        loadingEl.style.display = 'none';
      };
      img.onerror = () => {
        loadingEl.textContent = 'CORS blocked — fetching via extension…';
        chrome.runtime.sendMessage({ action: 'fetchBlob', url: imgSrc }, (res) => {
          if (chrome.runtime.lastError || !res || res.error) {
            loadingEl.textContent = 'Could not load image.';
            return;
          }
          const blob = new Blob([new Uint8Array(res.data)], { type: res.mimeType || 'image/png' });
          const url  = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => {
            naturalImg = img2;
            const MAX = 500;
            scale = Math.min(1, MAX / img2.naturalWidth, MAX / img2.naturalHeight);
            canvas.width  = Math.round(img2.naturalWidth  * scale);
            canvas.height = Math.round(img2.naturalHeight * scale);
            ctx.drawImage(img2, 0, 0, canvas.width, canvas.height);
            loadingEl.style.display = 'none';
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          };
          img2.onerror = () => { loadingEl.textContent = 'Could not load image.'; };
          img2.src = url;
        });
      };
      img.src = imgSrc;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      loadImage(src);
    } else {
      loadImage(src);
    }
  }

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

  function calcAspectRatio(w, h) {
    if (!w || !h) return '';
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const d = gcd(w, h);
    const rw = w / d, rh = h / d;
    
    if (rw > 32 || rh > 32) return '';
    return `${rw}:${rh}`;
  }

  function decodeEmbeddedUrl(src) {
    // Many CDNs (Brave, Google, etc.) base64-encode the real image URL inside their proxy path.
    // Walk path segments and return the first one that decodes to an http URL.
    try {
      const path = src.split('?')[0].split('/');
      for (let i = path.length - 1; i >= 0; i--) {
        const seg = path[i].replace(/-/g, '+').replace(/_/g, '/');
        if (seg.length < 16) continue;
        try {
          const decoded = atob(seg);
          if (decoded.startsWith('http')) return decoded;
        } catch(e) {}
      }
    } catch(e) {}
    return null;
  }

  function formatBadge(src, mime) {
    
    let fmt = '';
    if (mime) {
      if (mime.includes('svg'))  fmt = 'SVG';
      else if (mime.includes('gif'))  fmt = 'GIF';
      else if (mime.includes('webp')) fmt = 'WebP';
      else if (mime.includes('jpeg') || mime.includes('jpg')) fmt = 'JPG';
      else if (mime.includes('png'))  fmt = 'PNG';
      else if (mime.includes('avif')) fmt = 'AVIF';
      else if (mime.includes('mp4') || mime.includes('webm')) fmt = 'VID';
    }
    if (!fmt && src) {
      // Try to decode a base64-embedded real URL first (Brave, Google image proxies, etc.)
      const realUrl = decodeEmbeddedUrl(src);
      const urlToParse = realUrl || src;
      const ext = urlToParse.split('?')[0].split('.').pop().toLowerCase();
      const map = { png:'PNG', jpg:'JPG', jpeg:'JPG', gif:'GIF', webp:'WebP', svg:'SVG', avif:'AVIF' };
      fmt = map[ext] || '';
    }
    if (src && src.startsWith('data:image/svg')) fmt = 'SVG';
    if (!fmt) return '';

    const colors = {
      PNG:  { bg: '#1a3a5c', color: '#268bd2' },
      JPG:  { bg: '#1a3a2a', color: '#2aa198' },
      GIF:  { bg: '#3a1a3a', color: '#d33682' },
      WebP: { bg: '#1a2a3a', color: '#6c71c4' },
      SVG:  { bg: '#2a1a10', color: '#cb4b16' },
      AVIF: { bg: '#1a3a1a', color: '#859900' },
      VID:  { bg: '#3a2a10', color: '#b58900' },
    };
    const c = colors[fmt] || { bg: '#073642', color: '#93a1a1' };
    return `<span class="igrab-fmt-badge" style="background:${c.bg};color:${c.color};border-color:${c.color}44">${fmt}</span>`;
  }

  function setDimsEl(w, h, fileSize, mime, src) {
    const dimsEl = document.getElementById('__igrab_dims__');
    if (!dimsEl) return;
    const ratio = calcAspectRatio(w, h);
    const sizeStr = fileSize ? ` · ${formatBytes(fileSize)}` : '';
    const ratioStr = ratio ? ` · ${ratio}` : '';
    const badge = formatBadge(src, mime);
    dimsEl.innerHTML = `${w} × ${h} px${ratioStr}${sizeStr} ${badge}`;
  }

  function populateDimensions(src, el) {
    const dimsEl = document.getElementById('__igrab_dims__');
    if (!dimsEl) return;

    
    const urlBadge = formatBadge(src, null);
    dimsEl.innerHTML = urlBadge ? `— ${urlBadge}` : '—';

    
    if (el) {
      const tag = el.tagName && el.tagName.toUpperCase();
      if (tag === 'IMG' && el.naturalWidth) {
        setDimsEl(el.naturalWidth, el.naturalHeight, null, null, src);
        fetchSizeAndMime(src, el.naturalWidth, el.naturalHeight);
        return;
      }
      if (tag === 'CANVAS') {
        setDimsEl(el.width, el.height, null, 'image/png', src);
        return;
      }
    }

    
    const img = new Image();
    img.onload = () => {
      if (!document.getElementById('__igrab_dims__')) return;
      setDimsEl(img.naturalWidth, img.naturalHeight, null, null, src);
      fetchSizeAndMime(src, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      if (dimsEl) dimsEl.innerHTML = urlBadge || '';
    };
    img.src = src;
  }

  function refreshDimsChip(src, mime) {
    if (!colorChip || colorChip.style.display === 'none') return;
    if (colorChip.dataset.src !== src) return;
    // Update the fmt span if mime resolves a better format
    const fmt = (() => {
      if (mime) {
        if (mime.includes('svg'))  return 'SVG';
        if (mime.includes('gif'))  return 'GIF';
        if (mime.includes('webp')) return 'WebP';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPG';
        if (mime.includes('png'))  return 'PNG';
        if (mime.includes('avif')) return 'AVIF';
        if (mime.includes('mp4') || mime.includes('webm')) return 'VID';
      }
      return '';
    })();
    if (!fmt) return;
    let fmtEl = colorChip.querySelector('.igrab-chip-fmt');
    if (fmtEl) {
      fmtEl.textContent = fmt;
    } else {
      const sep = document.createElement('span');
      sep.className = 'igrab-chip-sep';
      sep.textContent = '·';
      const span = document.createElement('span');
      span.className = 'igrab-chip-fmt';
      span.textContent = fmt;
      colorChip.appendChild(sep);
      colorChip.appendChild(span);
    }
  }

  function fetchSizeAndMime(src, w, h) {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    
    chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
      if (chrome.runtime.lastError || !res || res.error) return;
      const mime = res.mimeType || '';
      const dimsEl = document.getElementById('__igrab_dims__');
      if (dimsEl) setDimsEl(w, h, null, mime, src);
      refreshDimsChip(src, mime);
    });
    
    fetch(src, { method: 'HEAD' }).then(r => {
      const len = r.headers.get('content-length');
      const mime = r.headers.get('content-type') || '';
      if (!len && !mime) return;
      const dimsEl = document.getElementById('__igrab_dims__');
      if (dimsEl) setDimsEl(w, h, len ? parseInt(len, 10) : null, mime || null, src);
      refreshDimsChip(src, mime || null);
    }).catch(() => {});
  }

  function showTooltip(clientX, clientY, src, isLocked, clickX, clickY) {
    const isInline = src.startsWith('blob:') || src.startsWith('data:');
    const label = isInline ? '(inline / canvas / SVG)' : src;
    const shortLabel = label.length > 55 ? label.slice(0, 52) + '…' : label;

    // Sample pixel colour at click position for locked <img> elements
    let sampledHex = null;
    if (isLocked && lockedEl && lockedEl.tagName && lockedEl.tagName.toUpperCase() === 'IMG' &&
        clickX !== undefined && clickY !== undefined) {
      sampledHex = samplePixelAt(clickX, clickY, lockedEl);
    }

    const colorRowHtml = isLocked
      ? (sampledHex
          ? `<div class="igrab-color-row" id="__igrab_color_row__">
               <span class="igrab-color-swatch" style="background:${sampledHex}"></span>
               <span class="igrab-color-hex">${sampledHex}</span>
               <button class="igrab-btn igrab-color-copy">Copy</button>
             </div>`
          : '')
      : '';

    tooltip.innerHTML = `
      <div class="igrab-title">${isLocked ? '🔒 Locked' : '⊕ PixelPull'}</div>
      <div class="igrab-url" title="${isInline ? 'Inline image' : src}">${shortLabel}</div>
      ${isLocked ? '<div class="igrab-dims" id="__igrab_dims__">—</div>' : ''}
      ${colorRowHtml}
      ${isLocked ? '<div class="igrab-exif-row" id="__igrab_exif_row__" style="display:none"><span class="igrab-exif-toggle">▸ EXIF</span><div class="igrab-exif-body" style="display:none"></div></div>' : ''}
      <div class="igrab-actions">
        <button class="igrab-btn igrab-copy-url"${isInline ? ' disabled' : ''}>Copy URL</button>
        <button class="igrab-btn igrab-copy-img">Copy Image</button>
      </div>
      <div class="igrab-actions igrab-actions-row2">
        <button class="igrab-btn igrab-download">⬇ Download</button>
        <button class="igrab-btn igrab-open-tab">↗ Open Tab</button>
      </div>
      ${isLocked ? '<div class="igrab-actions igrab-actions-row3"><button class="igrab-btn igrab-crop-btn">✂ Crop Image</button></div>' : ''}
      <div class="igrab-hint">${isLocked
        ? '<kbd>Esc</kbd> or click to unlock &nbsp;•&nbsp; then <kbd>Esc</kbd> to exit'
        : 'Click image to lock &nbsp;•&nbsp; <kbd>Esc</kbd> to exit'
      }</div>
    `;

    
    if (isLocked) {
      populateDimensions(src, lockedEl);
      showThumbCorner(src);

      // Colour row copy button
      const colorCopyBtn = document.getElementById('__igrab_color_row__')?.querySelector('.igrab-color-copy');
      if (colorCopyBtn && sampledHex) {
        colorCopyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(sampledHex).then(() => {
            colorCopyBtn.textContent = 'Copied ✓';
            setTimeout(() => { colorCopyBtn.textContent = 'Copy'; }, 1500);
          }).catch(() => {});
        });
      }

      // --- Prompt 2 Feature 2: EXIF row ---
      const isJpeg = src && !src.startsWith('data:') && !src.startsWith('blob:') &&
        (src.toLowerCase().includes('.jpg') || src.toLowerCase().includes('.jpeg') ||
         src.toLowerCase().includes('format=jpg') || src.toLowerCase().includes('format:jpg'));
      const exifRow = document.getElementById('__igrab_exif_row__');
      if (exifRow && isJpeg) {
        exifRow.style.display = 'block';
        let exifFetched = false;
        const toggle   = exifRow.querySelector('.igrab-exif-toggle');
        const body     = exifRow.querySelector('.igrab-exif-body');
        let expanded = false;
        toggle.addEventListener('click', (ev) => {
          ev.stopPropagation();
          expanded = !expanded;
          toggle.textContent = (expanded ? '▾' : '▸') + ' EXIF';
          body.style.display = expanded ? 'block' : 'none';
          if (expanded && !exifFetched) {
            exifFetched = true;
            body.textContent = 'Loading…';
            chrome.runtime.sendMessage({ action: 'fetchPartial', url: src }, (res) => {
              if (chrome.runtime.lastError || !res || res.error) {
                body.textContent = 'Could not fetch EXIF data.';
                return;
              }
              const bytes = new Uint8Array(res.data);
              const exif  = parseExifBytes(bytes);
              if (!exif) {
                body.textContent = 'No EXIF data found.';
              } else {
                body.innerHTML = Object.entries(exif)
                  .map(([k, v]) => `<div class="igrab-exif-kv"><span class="igrab-exif-key">${k}</span><span class="igrab-exif-val">${v}</span></div>`)
                  .join('');
              }
            });
          }
        });
      }
    } else {
      removeThumbCorner();
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
    if (isLocked) positionThumbCorner();

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

    if (isLocked) {
      tooltip.querySelector('.igrab-crop-btn').onclick = (e) => {
        e.stopPropagation();
        openCropModal(src, lockedEl);
      };
    }

    if (isLocked) probeAndWarnIfAnimated(src);
  }

  

  
  function probeAndWarnIfAnimated(src) {
    if (!src || src.startsWith('data:')) return;

    function warnAndBlock() {
      flash('🎞 This is an animated image — for best results use ⬇ Download. Copying may cause errors or lose animation.', 0);
      
      const btn = tooltip && tooltip.querySelector('.igrab-copy-img');
      if (btn) {
        btn.disabled = true;
        btn.title = 'Cannot copy animated images — use Download';
        btn.style.opacity = '0.35';
        btn.style.cursor = 'not-allowed';
      }
    }

    
    if (src.toLowerCase().includes('.gif')) { warnAndBlock(); return; }
    
    if (src.includes('video-public.') || src.includes('/video/')) { warnAndBlock(); return; }

    
    chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
      if (chrome.runtime.lastError || !res || res.error) return;
      const mime = res.mimeType || '';
      const isAnimated = mime.includes('gif') || mime.startsWith('video/');
      if (isAnimated) warnAndBlock();
    });
  }

  async function copyImageToClipboard(src) {
    
    if (src.toLowerCase().includes('.gif')) {
      flash('🎞 GIF detected — copying GIFs can cause errors or lose animation. Use ⬇ Download instead for best results.', 0);
      return;
    }

    flash('Copying…');

    
    async function handleBlob(blob) {
      
      const mightBeGif = blob.type === 'image/gif' || src.toLowerCase().includes('.gif');
      
      const isVideo = blob.type.startsWith('video/');

      const isGif = await (async () => {
        if (mightBeGif) return true;
        if (isVideo) return true; 
        try {
          const buf = await blob.slice(0, 8).arrayBuffer();
          const bytes = new Uint8Array(buf);
          
          if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
          
          if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
          
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
      
      chrome.runtime.sendMessage({ action: 'fetchBlob', url: src }, async (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
          
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

  
  function saveBlobAs(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }

  
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

  // --- Prompt 2 Feature 2: minimal EXIF parser (no libraries) ---
  function parseExifBytes(bytes) {
    // bytes is Uint8Array
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null; // not JPEG

    let i = 2;
    while (i < bytes.length - 4) {
      if (bytes[i] !== 0xFF) break;
      const marker = (bytes[i] << 8) | bytes[i + 1];
      const segLen  = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker === 0xFFE1) {
        // APP1 — check for 'Exif\0\0'
        const magic = String.fromCharCode(bytes[i+4], bytes[i+5], bytes[i+6], bytes[i+7]);
        if (magic !== 'Exif') return null;
        const tiffStart = i + 10; // after FF E1 + length (2) + 'Exif\0\0' (6)
        return parseTiff(bytes, tiffStart);
      }
      i += 2 + segLen;
    }
    return null;
  }

  function parseTiff(bytes, base) {
    const bo = String.fromCharCode(bytes[base], bytes[base + 1]);
    const le = bo === 'II';

    function r16(off) {
      const a = bytes[base + off], b = bytes[base + off + 1];
      return le ? (a | (b << 8)) : ((a << 8) | b);
    }
    function r32(off) {
      const a = bytes[base + off], b = bytes[base + off + 1],
            c = bytes[base + off + 2], d = bytes[base + off + 3];
      return le ? (a | (b << 8) | (c << 16) | (d * 16777216))
                : ((a * 16777216) | (b << 16) | (c << 8) | d);
    }
    function readAscii(off, len) {
      let s = '';
      for (let k = 0; k < len - 1; k++) {
        const ch = bytes[base + off + k];
        if (ch === 0) break;
        s += String.fromCharCode(ch);
      }
      return s.trim();
    }

    const ifdOffset = r32(4);
    const nEntries  = r16(ifdOffset);
    const result    = {};
    const want      = { 0x010F: 'Make', 0x0110: 'Model', 0x9003: 'DateTimeOriginal' };

    for (let n = 0; n < nEntries; n++) {
      const eOff  = ifdOffset + 2 + n * 12;
      const tag   = r16(eOff);
      if (!want[tag]) continue;
      const type  = r16(eOff + 2);
      const count = r32(eOff + 4);
      if (type === 2) { // ASCII
        const valueOff = count <= 4 ? eOff + 8 : r32(eOff + 8);
        result[want[tag]] = readAscii(valueOff, count);
      }
    }
    return Object.keys(result).length ? result : null;
  }

  async function downloadImage(src, forceMime, forceExt) {
    // At download time, re-check performance entries for a better Canva GIF URL.
    // This catches cases where Canva finished loading the full-quality version
    // after the user hovered (which is when upgradeCanvaUrl first ran).
    if (!forceMime && src && src.includes('video-public.canva.com') && src.endsWith('.gif')) {
      const canvaMatch = src.match(/video-public\.canva\.com\/([^/]+)\//);
      if (canvaMatch) {
        const better = findBetterCanvaGif(src, canvaMatch[1]);
        if (better) src = better;
      }
    }
    flash('Downloading…');

    async function convertBlob(blob, mime, ext) {
      if (!mime) return { blob, ext: ext || extFromMime(blob.type) };
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          const quality = mime === 'image/jpeg' ? 0.92 : undefined;
          c.toBlob(b => resolve({ blob: b, ext }), mime, quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob, ext: extFromMime(blob.type) }); };
        img.src = url;
      });
    }

    // --- Prompt 1: build alt-text base name ---
    function sanitizeAlt(text) {
      if (!text) return '';
      return text
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    }
    const altBase = (lockedEl && lockedEl.tagName && lockedEl.tagName.toUpperCase() === 'IMG')
      ? sanitizeAlt(lockedEl.alt)
      : '';

    if (src.startsWith('data:')) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const { blob: out, ext } = await convertBlob(blob, forceMime, forceExt);
        saveBlobAs(out, (altBase || 'image') + '.' + ext);
        flash('Download started ✓');
      } catch(e) { flash('Could not download inline image'); }
      return;
    }

    const rawName = decodeURIComponent(src.split('/').pop().split('?')[0]);
    const urlHasExt = rawName && rawName.match(/\.[a-z]{2,5}$/i);
    // Priority: alt text > URL slug > null (will fall through to sniffMime)
    let filename = altBase
      ? null   // we'll attach the ext after mime-sniff below
      : (urlHasExt ? rawName : null);

    if (forceMime && forceExt) {
      const base = altBase || (filename ? filename.replace(/\.[^.]+$/, '') : 'image');
      filename = `${base}.${forceExt}`;
    } else if (altBase) {
      // ext not yet known — keep filename null so we sniff below, but store altBase for use there
      filename = null;
    }

    const doDownload = async (fname, blobOverride) => {
      if (blobOverride) {
        saveBlobAs(blobOverride, fname);
        flash('Download started ✓');
        return;
      }
      chrome.runtime.sendMessage({ action: 'download', url: src, filename: fname }, (dlRes) => {
        if (chrome.runtime.lastError || (dlRes && dlRes.error)) {
          fetch(src).then(r => r.blob()).then(async blob => {
            const { blob: out, ext } = await convertBlob(blob, forceMime, forceExt);
            saveBlobAs(out, fname);
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

    if (forceMime) {
      flash('Converting…');
      chrome.runtime.sendMessage({ action: 'fetchBlob', url: src }, async (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
          flash('Could not fetch — try Original');
          return;
        }
        try {
          const blob = new Blob([new Uint8Array(res.data)], { type: res.mimeType || 'image/png' });
          const { blob: out } = await convertBlob(blob, forceMime, forceExt);
          saveBlobAs(out, filename || `image.${forceExt}`);
          flash('Download started ✓');
        } catch(err) {
          flash('Conversion failed');
        }
      });
      return;
    }

    if (filename) {
      doDownload(filename);
    } else {
      chrome.runtime.sendMessage({ action: 'sniffMime', url: src }, (res) => {
        let ext = 'png';
        if (!chrome.runtime.lastError && res && !res.error) {
          ext = extFromMime(res.mimeType);
        }
        filename = altBase
          ? `${altBase}.${ext}`
          : (urlHasExt ? rawName : `image.${ext}`);
        doDownload(filename);
      });
    }
  }

  
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

  

  function onMouseMove(e) {
    if (!active || locked) return;
    if (document.getElementById('__igrab_crop_modal__')) return;

    
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
      // Show color chip for all image elements; non-IMG shows — (can't sample pixels)
      updateColorChip(e.clientX, e.clientY, highlightEl, foundSrc);

    } else {
      lockedEl = lockedSrc = null;
      if (overlay) overlay.style.display = 'none';
      if (tooltip) tooltip.style.display = 'none';
      hideColorChip();
    }
  }

  function onMouseClick(e) {
    if (!active) return;
    if (document.getElementById('__igrab_crop_modal__')) return;
    const path = e.composedPath ? e.composedPath() : [e.target];

    if (tooltip && path.includes(tooltip)) return;
    if (hud     && path.includes(hud))     return;
    if (thumbCorner && path.includes(thumbCorner)) return;

    if (locked) {
      locked = false;
      overlay.classList.remove('igrab-locked');
      if (tooltip) tooltip.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
      lockedEl = lockedSrc = null;
      removeThumbCorner();
      updateHud();
      e.preventDefault(); e.stopPropagation();
    } else if (lockedSrc) {
      locked = true;
      overlay.classList.add('igrab-locked');
      hideColorChip();
      showTooltip(e.clientX, e.clientY, lockedSrc, true, e.clientX, e.clientY);
      updateHud();
      e.preventDefault(); e.stopPropagation();
    }
  }

  function onContextMenu(e) { if (active) e.preventDefault(); }

  function onKeydown(e) {
    if (!active) return;
    const cropModal = document.getElementById('__igrab_crop_modal__');
    if (cropModal) {
      if (e.key === 'Escape') cropModal.remove();
      return;
    }
    if (e.key === 'Escape') {
      if (locked) {
        locked = false;
        overlay.classList.remove('igrab-locked');
        if (tooltip) tooltip.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        lockedEl = lockedSrc = null;
        removeThumbCorner();
        updateHud();
      } else {
        deactivate();
      }
    }
  }

  

  function activate() {
    if (active) return;
    active = true; locked = false;
    if (!tooltip)   tooltip   = createTooltip();
    if (!overlay)   overlay   = createOverlay();
    if (!hud)       hud       = createHud();
    if (!colorChip) colorChip = createColorChip();
    document.addEventListener('mousemove',    onMouseMove,   true);
    document.addEventListener('click',        onMouseClick,  true);
    document.addEventListener('contextmenu',  onContextMenu, true);
    document.addEventListener('keydown',      onKeydown,     true);
    document.body.style.cursor = 'crosshair';
    document.getElementById('__igrab_cursor_style__')?.remove();
    const _cursorStyle = document.createElement('style');
    _cursorStyle.id = '__igrab_cursor_style__';
    _cursorStyle.textContent = `
      html, html * { cursor: crosshair !important; }
      #__img_grabber_tooltip__ button,
      #__img_grabber_tooltip__ .igrab-btn,
      #__img_grabber_hud__ button,
      .igrab-hud-close { cursor: pointer !important; }
    `;
    document.head.appendChild(_cursorStyle);
    showBanner('PixelPull ON');
  }

  function deactivate() {
    if (!active) return;
    active = false; locked = false;
    lockedEl = lockedSrc = null;
    removeThumbCorner();
    document.removeEventListener('mousemove',   onMouseMove,   true);
    document.removeEventListener('click',       onMouseClick,  true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown',     onKeydown,     true);
    document.body.style.cursor = '';
    document.getElementById('__igrab_cursor_style__')?.remove();
    if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('igrab-locked'); }
    if (tooltip) tooltip.style.display = 'none';
    hideColorChip();
    
    if (hud) {
      hud.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(8px)';
      setTimeout(() => { if (hud) { hud.remove(); hud = null; } }, 220);
    }
    showBanner('PixelPull OFF');
  }

  function showBanner(msg) {
    
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