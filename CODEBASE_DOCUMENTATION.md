# DD Studio Fallback Generator - Codebase Documentation

## Overview

**Name:** DD Studio Fallback Generator
**Version:** 1.0
**Type:** Chrome Extension (Manifest V3)
**Purpose:** Create fallback/backup images of banner advertisements and web elements

This is a Chrome extension designed to capture screenshots of specific banner elements on web pages and save them as optimized JPG or PNG files. It's particularly useful for creating fallback images for HTML5 banner ads.

## Architecture

### Core Components

The extension consists of four main JavaScript modules that communicate via Chrome's message passing API:

1. **background.js** - Service worker (handles messaging, triggers screenshots)
2. **offscreen.js** - Offscreen document for canvas/image processing
3. **content.js** - Content script injected into all web pages
4. **popup.js** - Popup UI controller

### File Structure

```
.
├── manifest.json                 # Extension manifest (V3)
├── background.js                 # Service worker - orchestration & messaging
├── offscreen.html                # Offscreen document container
├── offscreen.js                  # Canvas operations & WASM image encoding
├── content.js                    # Page inspection & banner detection
├── popup.html                    # Settings UI
├── popup.js                      # Settings controller
├── jsquash/                      # MozJPEG WASM encoder (jSquash)
│   ├── encode.js                 # Encoder entry point
│   ├── meta.js                   # Default options
│   ├── utils.js                  # Emscripten utilities
│   └── codec/enc/
│       ├── mozjpeg_enc.js        # WASM loader
│       └── mozjpeg_enc.wasm      # MozJPEG WebAssembly binary (~270KB)
├── canvas-to-blob.js            # Canvas to Blob polyfill library
├── mousetrap.min.js             # Keyboard shortcut library
├── logo.png                     # Extension logo (popup)
├── icon_16.png                  # Toolbar icon (16px)
├── icon_48.png                  # Extension page icon (48px)
├── icon_128.png                 # Chrome Web Store icon (128px)
├── README.md                    # Project documentation
└── CODEBASE_DOCUMENTATION.md    # Technical documentation
```

## Detailed Component Analysis

### 1. manifest.json

**Manifest Version:** 3 (Current Chrome standard)

**Permissions:**
- `activeTab` - Access to current tab
- `tabs` - Tab information access
- `contextMenus` - Right-click context menus
- `downloads` - File download capability
- `storage` - Persist user settings
- `offscreen` - Create offscreen documents for canvas operations

**Host Permissions:**
- `<all_urls>` - Access to all websites (required for content script)

**Content Scripts:**
- Injected into all URLs (`<all_urls>`)
- Dependencies: jQuery, Mousetrap, content.js
- Runs at `document_end`

**Service Worker:**
- `background.js` - Handles all background operations

**Keyboard Commands:**
- Default: `Ctrl+Shift+Y` (Windows/Linux)
- Mac: `Command+Shift+Y`
- Note: Actual hotkey is configurable via Mousetrap in content script (default: Cmd/Ctrl+Shift+S)

**Action:**
- Icons: icon_16.png, icon_48.png, icon_128.png
- Opens popup.html when clicked

### 2. background.js (Service Worker)

**Purpose:** Orchestrates screenshot capture, manages settings, coordinates messaging

**Key Constants:**
```javascript
DEFAULT_OPTIONS = {
    overwrite: true,              // Auto-overwrite previous downloads
    optimizingMode: 'quality',    // 'quality' or 'filesize'
    maxFileSize: 39,              // Max file size in KB
    saveAs: false,                // Show save dialog
    detectionId: '#banner',       // CSS selector for banner
    outputMode: 'JPG',            // 'JPG' or 'PNG'
    quality: 90,                  // JPEG quality (1-100)
    detectionMode: 'id',          // 'id', 'firstdiv', 'automatic', 'none'
    hotkey: 'S',                  // Keyboard shortcut key
    devicePixelRatio: 1,          // Screen pixel density
    retinaMode: false,            // Output at 2x resolution
    suggestedFileName: '',        // Custom filename
    suggestedFileNameDefault: 'fallback'  // Default filename prefix
}
```

**Core Functions:**

- `setupOffscreenDocument()` - Creates offscreen document for canvas operations
- `startScreenshot()` - Main entry point, captures visible tab and sends to offscreen
- `sendNewHotkey()` - Sends hotkey updates to content scripts
- `onCropComplete()` - Handles file download with naming
- `saveOptions()` - Persists options to chrome.storage.local

**Message Handlers:**
- `getOptions` - Returns current options (from popup or content)
- `options` - Updates options from popup
- `info` - Receives page info from content script
- `screenshot` - Triggers screenshot from content script

### 3. offscreen.js (Image Processing)

**Purpose:** Handles all canvas and image processing operations (service workers cannot access DOM)

**JPEG Encoding:** Uses jSquash MozJPEG WASM encoder for 16x faster encoding (~30ms vs ~1000ms per encode compared to canvas.toBlob())

**Core Functions:**

- `initJSquash()` - Lazy-loads the MozJPEG WASM encoder
- `processScreenshot(data)` - Main processing function
  - Loads screenshot image
  - Auto-detects banner boundaries if needed
  - Crops to banner dimensions
  - Handles retina/non-retina output

- `cropAndProcess()` - Crops and processes the image
  - Respects `retinaMode` setting for output size
  - Uses jSquash for JPG encoding (quality and filesize modes)
  - Handles PNG output via canvas.toDataURL()

- `encodeWithJSquash()` - Single JPEG encode at specified quality
- `checkSize()` - Two-phase search for target filesize optimization
  - Phase 1: Coarse search (steps of 20) to find approximate range
  - Phase 2: Binary search within narrowed range
  - Typically completes in 6-7 iterations (~300-400ms total)

- `findEdge()` - Pixel analysis to find banner edge
- `findBoundary()` - Calculates bounding box of detected banner
- `xyIsInImage()` - Tests if pixel is part of banner (not background)

### 4. content.js (Page Inspector)

**Purpose:** Runs on all web pages to detect banners and handle keyboard shortcuts

**Key Functions:**

- `init()` - Initializes hotkey on page load, requests options from background
- `getPageInfo()` - Analyzes page to determine banner dimensions
- `setHotkey()` - Binds keyboard shortcut using Mousetrap
  - Uses `mod+shift+{key}` for cross-platform support (Cmd on Mac, Ctrl on Windows)
- `hexToRgb()` - Converts hex color to RGB object

**Detection Modes:**

1. **id** (default) - Find element by CSS selector (default: `#banner`)
2. **firstdiv** - Use first div in document.body
3. **automatic** - Detect by pixel color analysis in offscreen.js

**Filename Suggestion Logic:**
- Parses current URL path segments
- Uses folder name as suggested filename

### 5. popup.html & popup.js (Settings UI)

**Purpose:** Configuration interface for the extension

**UI Sections:**

1. **Image Format**
   - JPG (default)
   - PNG

2. **Optimize (JPG only)**
   - Quality mode: 1-100 quality value (default: 90)
   - Filesize mode: Max KB size (default: 39 KB)

3. **Detection**
   - ID mode: Custom CSS selector input (default: `#banner`)
   - First div in body
   - Pixels (automatic detection)

4. **File Saving**
   - Save as: Show save dialog (default: off)
   - Overwrite: Auto-overwrite previous file (default: on)
   - Retina (2x): Output at double resolution (default: off)

5. **Hotkey**
   - Dropdown selector for A-Z, 0-9
   - Combined with Cmd/Ctrl+Shift
   - Default: 'S' (Cmd/Ctrl+Shift+S)

**popup.js Logic:**
- Uses `chrome.runtime.sendMessage` to communicate with service worker (MV3 compatible)
- No longer uses deprecated `chrome.runtime.getBackgroundPage()`
- Loads options via messaging on popup open
- Sends updated options on any change

## Data Flow

### Screenshot Capture Flow

1. **Trigger:**
   - User presses hotkey (Cmd/Ctrl+Shift+Key) → content.js detects via Mousetrap

2. **Page Info Collection:**
   - content.js → `getPageInfo()` → Sends to background.js:
     - Banner dimensions (if detected)
     - Background color
     - Device pixel ratio
     - Current URL
     - Suggested filename

3. **Screenshot Capture:**
   - background.js → `chrome.tabs.captureVisibleTab()` → PNG data URL

4. **Offscreen Processing:**
   - background.js → Creates offscreen document if needed
   - Sends screenshot data to offscreen.js
   - offscreen.js processes image using canvas

5. **Image Processing:**
   - If banner dimensions provided: Direct crop
   - If automatic mode: Pixel analysis to find edges
   - Respects `retinaMode` setting for output resolution
   - JPG: Apply quality or filesize optimization
   - PNG: No optimization

6. **Download:**
   - Generate filename (custom or default with dimensions)
   - If overwrite enabled: Delete previous file with same name
   - `chrome.downloads.download()` with optional saveAs dialog

## Chrome APIs Used

- **Tabs API** - `chrome.tabs.captureVisibleTab()`, `chrome.tabs.query()`, `chrome.tabs.sendMessage()`
- **Runtime API** - `chrome.runtime.sendMessage()`, `chrome.runtime.onMessage`
- **Downloads API** - `chrome.downloads.download()`, `chrome.downloads.removeFile()`
- **Storage API** - `chrome.storage.local.get()`, `chrome.storage.local.set()`
- **Offscreen API** - `chrome.offscreen.createDocument()`, `chrome.runtime.getContexts()`
- **Commands API** - `chrome.commands.onCommand`
- **Action API** - `chrome.action.onClicked`

## Usage Workflow

### Basic Usage:
1. Navigate to page with banner ad
2. Press Cmd/Ctrl+Shift+S (or configured hotkey)
3. Extension captures, crops, optimizes, and downloads the fallback image

### Configuration:
1. Click extension icon to open settings popup
2. Configure detection mode, format, quality, etc.
3. Settings are saved automatically

### Detection Modes:
- **ID mode:** For banners with a specific ID/class (e.g., `#banner`, `.ad-container`)
- **First div:** For banners that are the first element in the body
- **Pixels:** For automatic detection based on background color contrast

## Known Limitations

1. **Extension Context Invalidation** - After reloading the extension, pages must be refreshed
2. **Chrome Pages** - Cannot capture chrome://, chrome-extension://, or Web Store pages
3. **Cross-Origin Iframes** - Cannot detect elements inside cross-origin iframes

## Recommended Future Features

### High Priority

1. **Visual Feedback/Notifications**
   - Show toast notification when screenshot is captured successfully
   - Show error message if banner not found
   - Flash effect on captured area

2. **Batch Processing**
   - Capture multiple banner sizes in sequence
   - Queue multiple URLs for batch processing
   - Export all sizes at once

3. **Preview Before Save**
   - Show preview popup before downloading
   - Allow cropping adjustments
   - Confirm dimensions are correct

### Medium Priority

4. **Custom Output Dimensions**
   - Override detected dimensions
   - Scale up/down to specific sizes
   - Maintain aspect ratio option

5. **Multiple Format Export**
   - Export JPG and PNG simultaneously
   - Export multiple quality levels
   - WebP support

6. **Preset Management**
   - Save detection presets for different clients/projects
   - Quick-switch between common configurations
   - Import/export presets

7. **Filename Templates**
   - Custom filename patterns (e.g., `{project}_{width}x{height}_{date}`)
   - Auto-increment for multiple captures
   - Include URL-based naming

### Low Priority

8. **Capture History**
   - Log of recent captures
   - Re-download previous captures
   - Compare before/after

9. **Advanced Detection**
   - Multiple element selection
   - Exclude specific elements
   - Custom crop margins/padding

10. **Integration Features**
    - Direct upload to cloud storage (Google Drive, Dropbox)
    - Copy to clipboard
    - Send to external tools

11. **Keyboard Shortcuts**
    - Multiple hotkeys for different presets
    - Quick toggle retina mode
    - Quick switch format (JPG/PNG)

12. **UI Improvements**
    - Dark mode support
    - Resizable popup
    - Drag-and-drop detection area selector

13. **Quality of Life**
    - Sound feedback option
    - Auto-open downloads folder
    - Duplicate detection warning

## Dependencies

### Runtime Libraries:
- **jSquash** (@jsquash/jpeg) - MozJPEG WASM encoder for fast, high-quality JPEG compression
  - Derived from Google's Squoosh project
  - Uses WebAssembly for native-speed encoding in the browser
  - ~270KB WASM binary
- **Mousetrap** - Keyboard shortcut binding
- **canvas-to-blob.js** - Canvas to Blob polyfill

**Note:** jQuery has been removed. All DOM manipulation uses vanilla JavaScript.

### Assets:
- Extension icons (16, 48, 128px)
- Logo image

## Changelog

### Version 1.2 (Current)
- Added jSquash MozJPEG WASM encoder for 16x faster JPEG encoding
  - Quality mode: ~30ms instead of ~1000ms
  - Filesize mode: ~400ms instead of ~6 seconds
  - Same encoder used by Google's Squoosh app
- Updated manifest.json CSP to allow WASM execution
- Load offscreen.js as ES module for dynamic imports

### Version 1.1
- Removed jQuery dependency (~85KB reduction)
- Removed unused legacy files (icheck.min.js, keycodes.js, screenshot.*, camera_*.png, etc.)
- Added DEBUG flag for conditional logging (disabled by default)
- Modernized all JavaScript to ES6+ syntax:
  - Replaced `var` with `const`/`let`
  - Using template literals
  - Using arrow functions
  - Using optional chaining (`?.`) and nullish coalescing (`??`)
  - Using `Object.assign()` and array methods
- Added toast notifications for success/error feedback
- Created README.md for GitHub
- Redesigned popup UI with modern white/black/gray color scheme
- Used CSS custom properties for consistent theming
- Improved filesize optimization algorithm with two-phase search
- Updated default maxFileSize from 39 to 49 KB

### Version 1.0
- Migrated from Manifest V2 to Manifest V3
- Added offscreen document for canvas operations
- Replaced `chrome.browserAction` with `chrome.action`
- Replaced `chrome.runtime.getBackgroundPage()` with message passing
- Added `chrome.storage.local` for settings persistence
- Added Retina mode toggle (default: off for 1x output)
- Fixed keyboard shortcut initialization on page load
- Uses `mod+shift` for cross-platform hotkey support
- Renamed to "DD Studio Fallback Generator"
- Updated icons and branding

### Version 0.9 (Legacy)
- Original Manifest V2 version
- Basic screenshot and crop functionality
- JPG/PNG output with quality optimization
