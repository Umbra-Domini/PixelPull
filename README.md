<div align="center">

<img src="imgs/icon128.png" width="80" alt="PixelPull icon" />

# PixelPull

**Hover over any image on any page and instantly grab its URL, copy it, or download it.**
Bypasses right-click restrictions on any site.

![Version](https://img.shields.io/badge/version-1.1-5FFFBF?style=flat-square&labelColor=073642) ![Manifest](https://img.shields.io/badge/manifest-v3-268bd2?style=flat-square&labelColor=073642) ![License](https://img.shields.io/badge/license-MIT-6c71c4?style=flat-square&labelColor=073642) ![Chrome | Edge | Brave](https://img.shields.io/badge/Chrome%20%7C%20Edge%20%7C%20Brave-supported-2aa198?style=flat-square&labelColor=073642)

</div>

---

## What it does

Most sites block right-click "Save image as". PixelPull bypasses that entirely. Activate it, hover over any image, lock onto it, and you get full access: copy the URL, copy the image to your clipboard, or download the file directly.

It works on images that are hard to grab normally: CSS background images, lazy-loaded images, `srcset` responsive images, SVGs, canvas elements, and animated content from CDNs like Canva.

---

## Features

- **Hover detection** - automatically detects images, CSS backgrounds, SVGs, canvas, video posters, and lazy-loaded images as you move your cursor
- **Click to lock** - click any image to lock onto it and keep the tooltip open for action
- **Copy URL** - copies the full resolved image URL to your clipboard
- **Copy Image** - fetches the image and copies it as a PNG to your clipboard, bypassing CORS restrictions via the extension background context
- **Download** - saves the file directly to your downloads folder using `chrome.downloads`, with correct filename and extension detected from MIME type
- **GIF / animated image handling** - detects GIFs and video-format animations (MP4, WebM) by MIME type, magic bytes, and URL pattern; warns immediately on lock and disables Copy Image with a permanent message
- **Image dimensions and file size** - shows `W x H px - size KB` in the tooltip when locked, read from the DOM instantly where possible
- **Keyboard shortcut** - `Alt+G` to toggle the grabber from anywhere, no popup needed
- **HUD indicator** - persistent on-screen indicator while active, with a close button
- **Works inside iframes** - detects images across shadow DOM and nested frames

---

## Supported image types

| Type | Detected via |
|---|---|
| `<img>` | `currentSrc`, `src`, `data-src`, `data-lazy`, `data-original`, `srcset` |
| CSS background | `getComputedStyle().backgroundImage` |
| `<svg>` | Serialized to a `data:image/svg+xml` URI |
| `<canvas>` | `toDataURL()` |
| `<video>` | `poster` attribute |
| `<picture>` / `<source>` | Best `srcset` candidate |
| Lazy-loaded | Common data attribute patterns |

---

## Installation

PixelPull is not on the Chrome Web Store. Install it as an unpacked extension:

1. Clone or download this repository
   ```bash
   git clone https://github.com/yourusername/pixelpull.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `pixelpull` folder
5. The extension icon will appear in your toolbar

---

## Usage

### Basic flow

1. Click the PixelPull icon in your toolbar, or press `Alt+G`
2. Your cursor changes to a crosshair and the HUD appears in the bottom-right corner
3. Hover over any image - a tooltip appears with the URL and action buttons
4. **Click the image to lock** - the tooltip stays open and turns amber
5. Use the buttons: **Copy URL**, **Copy Image**, **Download**, or **Open Tab**
6. Press `Esc` or click anywhere to unlock, then `Esc` again to exit

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+G` | Toggle PixelPull on/off |
| `Esc` | Unlock (if locked) / Exit (if unlocked) |

You can change the shortcut at `chrome://extensions/shortcuts`.

---

## File structure

```
pixelpull/
├── manifest.json       # Extension manifest (v3)
├── background.js       # Service worker - handles downloads, CORS fetches, screenshots
├── content.js          # Injected into every page - hover detection, tooltip, actions
├── content.css         # Tooltip, overlay, HUD, and banner styles
├── popup.html          # Toolbar popup UI
├── popup.js            # Popup logic - toggle state, activate/deactivate
└── imgs/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## How CORS is handled

Some images block direct `fetch()` from the page context. PixelPull uses a fallback chain:

1. **Direct fetch** from content script (works for permissive CORS)
2. **Background fetch** via `chrome.runtime.sendMessage` - the service worker fetches from extension context, bypassing most CORS restrictions
3. **`chrome.downloads`** for downloads - streams directly to disk, no blob transfer over the message bus, handles large files without size limits
4. **Screenshot crop** as a last resort - captures the visible tab and crops to the element's bounding rect

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab to inject content scripts on demand |
| `scripting` | Inject `content.js` when triggered via keyboard shortcut |
| `clipboardWrite` | Write images and URLs to the clipboard |
| `downloads` | Save files directly to the downloads folder |
| `tabs` | Query the active tab for messaging between popup and content script |

---

## Known limitations

- **Animated GIFs / MP4s** - browsers don't support writing animated images to the clipboard. PixelPull detects these and redirects to Download, which preserves the animation
- **Cross-origin canvases** - `canvas.toDataURL()` throws a security error on tainted canvases; PixelPull falls back to screenshot crop in this case
- **Chrome only** - built for Chromium-based browsers (Chrome, Edge, Brave). Firefox uses a different extension API for some features

---

## License

MIT
