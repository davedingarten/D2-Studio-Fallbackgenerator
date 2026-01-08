const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[DD Studio]') : () => {};

let _options = {};
let _bannerDIV;
let _bannerWidth = 0;
let _bannerHeight = 0;
let _previousHotkey = '';

function getPageInfo() {
  _bannerWidth = 0;
  _bannerHeight = 0;
  _bannerDIV = undefined;

  if (_options.detectionMode === 'id') {
    _bannerDIV = document.querySelector(_options.detectionId);
    if (_bannerDIV) {
      const styles = window.getComputedStyle(_bannerDIV);
      _bannerWidth = parseInt(styles.width);
      _bannerHeight = parseInt(styles.height);
    }
  }

  if (_options.detectionMode === 'firstdiv' || (!_bannerDIV && _options.detectionMode !== 'automatic')) {
    _bannerDIV = document.body.children[0];
    if (_bannerDIV?.style.width && _bannerDIV?.style.height) {
      _bannerWidth = parseInt(_bannerDIV.style.width);
      _bannerHeight = parseInt(_bannerDIV.style.height);
    }
  }

  // Automatic mode is handled in offscreen.js

  let bkColorHex = document.body.style.backgroundColor || '#ffffff';
  log(`bkColorHex: ${bkColorHex}`);

  const bkColor = hexToRgb(bkColorHex);
  const currentUrl = window.location.href;
  const urlSplit = currentUrl.split('/');

  let suggestedFileName = '';
  let parentFolder = '';

  const lastSegment = urlSplit[urlSplit.length - 1];

  if (!lastSegment.includes('.html')) {
    suggestedFileName = lastSegment === ''
      ? urlSplit[urlSplit.length - 2]
      : lastSegment;
  } else {
    suggestedFileName = urlSplit[urlSplit.length - 2];
  }

  parentFolder = urlSplit.slice(0, -1).join('/') + '/';
  if (!lastSegment.includes('.html') && lastSegment !== '') {
    parentFolder += `${lastSegment}/`;
  }

  chrome.runtime.sendMessage({
    senderID: 'content',
    action: 'info',
    parentFolder,
    suggestedFileName,
    currentUrl,
    devicePixelRatio: window.devicePixelRatio,
    bgColor: bkColor,
    width: _bannerWidth,
    height: _bannerHeight
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'info') {
    Object.assign(_options, request.options);
    getPageInfo();
  }

  if (request.action === 'hotkey') {
    _options.hotkey = request.hotkey;
    setHotkey();
  }

  sendResponse({ status: 'ok' });
});

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function setHotkey() {
  if (_previousHotkey) {
    Mousetrap.unbind(`mod+shift+${_previousHotkey.toLowerCase()}`);
  }

  const hotkey = _options.hotkey ?? 'S';
  log(`Binding hotkey Cmd/Ctrl+Shift+${hotkey}`);

  Mousetrap.bind(`mod+shift+${hotkey.toLowerCase()}`, () => {
    log('Hotkey pressed, taking screenshot');
    chrome.runtime.sendMessage({
      senderID: 'content',
      action: 'screenshot'
    }, () => {
      log('Screenshot message sent');
    });
    return false;
  });

  _previousHotkey = hotkey;
}

// Initialize on page load
(function init() {
  _options.hotkey = 'S';
  setHotkey();

  chrome.runtime.sendMessage({
    senderID: 'content',
    action: 'getOptions'
  }, (response) => {
    if (response?.options) {
      _options = response.options;
      setHotkey();
    }
  });
})();
