// Helper functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const logError = console.error.bind(console, '[DD Studio]');

let _options = {};
let _outputModes = [];
let _detectionModes = [];
let _optimizingModes = [];
const _allowedKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

function init() {
  // Build hotkey select options
  const selectOptions = _allowedKeys.map((key, i) =>
    `<option value="${i}">${key}</option>`
  ).join('');
  $('#select_hotkey').innerHTML = selectOptions;

  // Get options from background via messaging (MV3 compatible)
  chrome.runtime.sendMessage({
    senderID: 'popup',
    action: 'getOptions'
  }, (response) => {
    if (!response) {
      logError('Failed to get options from background');
      return;
    }

    _options = response.options;
    _outputModes = response.outputModes;
    _detectionModes = response.detectionModes;
    _optimizingModes = response.optimizingModes;

    // Update UI with current values
    $('#version').innerHTML = 'v' + response.version;
    $('#input_detection_id').value = _options.detectionId;
    $('input[name=input_quality]').value = _options.quality;
    $('input[name=input_filesize]').value = _options.maxFileSize;

    // Set output mode radio
    let outputId = 0;
    for (let i = 0; i < _outputModes.length; i++) {
      if (_options.outputMode === _outputModes[i].type) outputId = i;
    }
    $(`input[name=output][value='${outputId}']`).checked = true;

    // Set detection mode radio
    let detectionId = 0;
    for (let i = 0; i < _detectionModes.length; i++) {
      if (_options.detectionMode === _detectionModes[i].type) detectionId = i;
    }
    $(`input[name=detection][value='${detectionId}']`).checked = true;

    // Enable/disable optimizing section based on output mode
    if (_options.outputMode !== 'JPG') {
      disable('holder_optimizing');
    } else {
      enable('holder_optimizing');
    }

    // Set optimizing mode radio
    let optimizingId = 0;
    for (let i = 0; i < _optimizingModes.length; i++) {
      if (_options.optimizingMode === _optimizingModes[i].type) optimizingId = i;
    }
    $(`input[name=optimizing][value='${optimizingId}']`).checked = true;

    // Set checkboxes
    $("input[name=saveAs]").checked = _options.saveAs;
    $("input[name=overwrite]").checked = _options.overwrite;
    $("input[name=retinaMode]").checked = _options.retinaMode;

    // Set hotkey dropdown
    $(`#select_hotkey option[value='${getValueHotkey(_options.hotkey)}']`).selected = true;

    // Setup event handlers
    setupEventHandlers();
  });
}

function setupEventHandlers() {
  // Radio button handlers
  $$('input[type=radio]').forEach(radio => {
    radio.addEventListener('click', function() {
      switch (this.name) {
        case 'output':
          _options.outputMode = _outputModes[this.value].type;
          if (_options.outputMode !== 'JPG') {
            disable('holder_optimizing');
          } else {
            enable('holder_optimizing');
          }
          break;
        case 'detection':
          _options.detectionMode = _detectionModes[this.value].type;
          break;
        case 'optimizing':
          _options.optimizingMode = _optimizingModes[this.value].type;
          break;
      }

      // Focus appropriate input on radio selection
      switch (this.id) {
        case 'radio_quality':
          $('#input_quality').focus();
          $('#input_quality').select();
          break;
        case 'file_size':
          $('#input_filesize').focus();
          $('#input_filesize').select();
          break;
        case 'input_id':
          $('#input_detection_id').focus();
          $('#input_detection_id').select();
          break;
      }
      sendNewOptions();
    });
  });

  // Checkbox handlers
  $$('input[type=checkbox]').forEach(checkbox => {
    checkbox.addEventListener('click', function() {
      switch (this.name) {
        case 'saveAs':
          _options.saveAs = this.checked;
          break;
        case 'overwrite':
          _options.overwrite = this.checked;
          break;
        case 'retinaMode':
          _options.retinaMode = this.checked;
          break;
      }
      sendNewOptions();
    });
  });

  // Text/number input handlers
  $$('input[type=text],input[type=number]').forEach(input => {
    input.addEventListener('keyup', function() {
      switch (this.name) {
        case 'input_detection_id':
          _options.detectionId = this.value;
          break;
        case 'input_quality':
          let quality = parseInt(this.value) || 1;
          if (quality > 100) {
            quality = 100;
            this.value = quality;
          } else if (quality < 1) {
            quality = 1;
            this.value = quality;
          }
          _options.quality = quality;
          break;
        case 'input_filesize':
          let filesize = parseInt(this.value) || 1;
          if (filesize > 999) {
            filesize = 999;
            this.value = filesize;
          } else if (filesize < 1) {
            filesize = 1;
            this.value = filesize;
          }
          _options.maxFileSize = filesize;
          break;
      }
      sendNewOptions();
    });

    // Focus handlers
    input.addEventListener('focus', function() {
      if (this.name === 'input_detection_id') {
        $("input[name=detection][value='0']").checked = true;
        _options.detectionMode = _detectionModes[0].type;
        sendNewOptions();
      }
    });
  });

  // Hotkey dropdown handler
  $("#select_hotkey").addEventListener('change', function() {
    _options.hotkey = _allowedKeys[this.value];
    sendNewOptions();
  });
}

function getValueHotkey(key) {
  const index = _allowedKeys.indexOf(key);
  return index >= 0 ? index : 0;
}

function disable(divId) {
  const el = document.getElementById(divId);
  if (el) {
    el.style.opacity = '0.4';
    el.style.pointerEvents = 'none';
  }
}

function enable(divId) {
  const el = document.getElementById(divId);
  if (el) {
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
  }
}

function sendNewOptions() {
  chrome.runtime.sendMessage({
    senderID: 'popup',
    action: 'options',
    options: _options
  });
}

window.onload = init;
