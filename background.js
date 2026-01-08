// Background service worker for Manifest V3
// Canvas operations are handled by offscreen.js

const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[DD Studio]') : () => {};
const logError = console.error.bind(console, '[DD Studio]');

const OUTPUT_MODES = [
  { type: 'JPG', id: 0 },
  { type: 'PNG', id: 1 }
];

const DETECTION_MODES = [
  { type: 'id', id: 0 },
  { type: 'firstdiv', id: 1 },
  { type: 'automatic', id: 2 },
  { type: 'none', id: 3 }
];

const OPTIMIZING_MODES = [
  { type: 'quality', id: 0 },
  { type: 'filesize', id: 1 }
];

const DEFAULT_OPTIONS = {
  overwrite: true,
  optimizingMode: OPTIMIZING_MODES[0].type,
  maxFileSize: 39,
  saveAs: false,
  detectionId: '#banner',
  outputMode: OUTPUT_MODES[0].type,
  quality: 90,
  detectionMode: DETECTION_MODES[0].type,
  hotkey: 'S',
  devicePixelRatio: 1,
  retinaMode: false,
  suggestedFileName: '',
  suggestedFileNameDefault: 'fallback'
};

let _options = { ...DEFAULT_OPTIONS };
let _lastDownloadId = null;
let _lastFilename = '';
let _creatingOffscreen = false;

// Notification helper
function showNotification(title, message, isError = false) {
  const notificationId = 'dd-studio-' + Date.now();
  log('Creating notification', title, message);

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon_128.png'),
    title: title,
    message: message
  }, (id) => {
    if (chrome.runtime.lastError) {
      logError('Notification error', chrome.runtime.lastError);
    } else {
      log('Notification created', id);
    }
  });
}

// Load options from storage on startup
chrome.storage.local.get(['options'], (result) => {
  if (result.options) {
    _options = { ...DEFAULT_OPTIONS, ...result.options };
  }
});

// Save options to storage
function saveOptions() {
  chrome.storage.local.set({ options: _options });
}

// Offscreen document management
async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Prevent race condition
  if (_creatingOffscreen) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return setupOffscreenDocument();
  }

  _creatingOffscreen = true;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Process screenshot images and convert to blob for download'
    });
    log('Offscreen document created successfully');
    // Wait a bit for the document to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    // Document might already exist
    log('Offscreen document creation:', error.message);
  }
  _creatingOffscreen = false;
}

// Listen for tab updates to send hotkey
chrome.tabs.onUpdated.addListener((tabId, changedProps) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id === tabId) {
      sendNewHotkey();
    }
  });
});

// Listen for action click (toolbar icon)
chrome.action.onClicked.addListener(() => {
  // The popup handles this now
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.senderID === 'content') {
    if (request.action === 'info') {
      for (const key in request) {
        _options[key] = request[key];
      }
      sendResponse({ status: 'ok' });
    } else if (request.action === 'screenshot') {
      log('Screenshot requested from content script');
      startScreenshot();
      sendResponse({ status: 'ok' });
    } else if (request.action === 'getOptions') {
      sendResponse({
        options: _options,
        version: chrome.runtime.getManifest().version
      });
    }
  } else if (request.senderID === 'popup') {
    if (request.action === 'options') {
      if (_options.hotkey !== request.options.hotkey) {
        _options.hotkey = request.options.hotkey;
        sendNewHotkey();
      }
      for (const key in request.options) {
        _options[key] = request.options[key];
      }
      saveOptions();
      sendResponse({ status: 'ok' });
    } else if (request.action === 'getOptions') {
      sendResponse({
        options: _options,
        outputModes: OUTPUT_MODES,
        detectionModes: DETECTION_MODES,
        optimizingModes: OPTIMIZING_MODES,
        version: chrome.runtime.getManifest().version
      });
    }
  }
  return true; // Keep message channel open for async responses
});

// Send hotkey to content script
function sendNewHotkey() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'hotkey',
        hotkey: _options.hotkey
      }).catch(() => {
        // Tab might not have content script loaded
      });
    }
  });
}

// Keyboard command handler
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save') {
    startScreenshot();
  }
});

// Main screenshot function
async function startScreenshot() {
  log('startScreenshot called');
  try {
    // Get active tab info
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    log('Active tab:', tabs[0]?.url);
    if (!tabs[0]) return;

    // Request page info from content script
    try {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'info',
        options: _options
      });
    } catch (error) {
      log('Content script not available');
    }

    // Small delay to allow content script to respond
    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture screenshot
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // Setup offscreen document
    await setupOffscreenDocument();

    // Process screenshot in offscreen document
    const needsAutoDetect = _options.width === 0 || _options.height === 0;

    const result = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'processScreenshot',
      data: {
        screenshotUrl,
        options: _options,
        needsAutoDetect
      }
    });

    if (result.error) {
      logError('Screenshot processing error:', result.error);
      showNotification('Screenshot Failed', result.error, true);
      return;
    }

    // Download the processed image
    onCropComplete(result.dataURL, result.imgWidth, result.imgHeight);

  } catch (error) {
    logError('Screenshot error:', error);
    showNotification('Screenshot Failed', error.message || 'Unknown error', true);
  }
}

// Handle download completion
function onCropComplete(dataURL, imgWidth, imgHeight) {
  let fileName;

  if (_options.suggestedFileName === '') {
    fileName = `${_options.suggestedFileNameDefault}_${imgWidth}x${imgHeight}.${_options.outputMode.toLowerCase()}`;
  } else {
    fileName = `${_options.suggestedFileName}.${_options.outputMode.toLowerCase()}`;
  }

  // Handle overwrite
  if (_options.overwrite && _lastDownloadId && _lastFilename === fileName) {
    chrome.downloads.removeFile(_lastDownloadId, () => {
      // File removed
    });
  }

  _lastFilename = fileName;

  chrome.downloads.download({
    url: dataURL,
    filename: fileName,
    saveAs: _options.saveAs
  }, (downloadId) => {
    _lastDownloadId = downloadId;
    if (downloadId) {
      showNotification('Screenshot Saved', `${fileName} (${imgWidth}x${imgHeight})`);
    } else {
      showNotification('Download Failed', 'Could not save the screenshot', true);
    }
  });
}

// Export for popup access via messaging
self.OUTPUT_MODES = OUTPUT_MODES;
self.DETECTION_MODES = DETECTION_MODES;
self.OPTIMIZING_MODES = OPTIMIZING_MODES;
