# DD Studio Fallback Generator

A Chrome extension for creating fallback images from HTML5 banner ads. Capture screenshots of banner elements and save them as optimized JPG or PNG files with a single keyboard shortcut.

## Features

- **One-click capture** - Press `Cmd/Ctrl+Shift+S` to instantly capture a banner
- **Smart detection** - Automatically detects banner dimensions using CSS selector, first div, or pixel analysis
- **Image optimization** - Export as JPG (with quality/filesize control) or PNG
- **Retina support** - Optional 2x output for high-DPI displays
- **Auto-naming** - Filenames based on folder name and dimensions (e.g., `300x250.jpg`)
- **Overwrite mode** - Automatically replaces previous captures with the same name
- **Notifications** - Visual feedback when screenshots are saved

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/davedingarten/D2-Studio-Fallbackgenerator.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the cloned folder

5. The extension icon will appear in your toolbar

## Usage

### Basic Workflow

1. Navigate to your HTML5 banner ad (local file or web URL)
2. Press `Cmd+Shift+S` (Mac) or `Ctrl+Shift+S` (Windows/Linux)
3. The fallback image is automatically saved to your Downloads folder

### Configuration

Click the extension icon to open settings:

| Setting | Description |
|---------|-------------|
| **Image Format** | Choose JPG or PNG output |
| **Quality** | JPG quality (1-100) |
| **Filesize** | Target max filesize in KB (auto-adjusts quality) |
| **Detection** | How to find the banner element |
| **Save as** | Show save dialog instead of auto-saving |
| **Overwrite** | Replace previous file with same name |
| **Retina (2x)** | Output at double resolution |
| **Hotkey** | Customize the keyboard shortcut |

### Detection Modes

- **ID/Selector** - Find element by CSS selector (default: `#banner`)
- **First div** - Use the first child element of `<body>`
- **Pixels** - Automatic edge detection based on background color

## Technical Details

- **Manifest Version:** 3 (latest Chrome standard)
- **Permissions:** activeTab, tabs, downloads, storage, notifications, offscreen
- **Min Chrome Version:** 109+ (requires Offscreen API)

## Development

The extension uses modern JavaScript (ES6+) with no external dependencies except:
- **Mousetrap** - Keyboard shortcut handling
- **canvas-to-blob** - Canvas polyfill for older browsers

### Project Structure

```
├── manifest.json      # Extension configuration
├── background.js      # Service worker
├── offscreen.js       # Image processing (canvas operations)
├── content.js         # Page inspection & hotkey handling
├── popup.html/js      # Settings UI
└── icons/             # Extension icons
```

### Debug Mode

To enable debug logging, set `DEBUG = true` in:
- `background.js`
- `offscreen.js`
- `content.js`

## License

MIT

## Credits

Developed by DD Studio
