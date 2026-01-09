// Offscreen document for handling canvas operations
// Service workers don't have DOM access, so we use this offscreen document

const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[DD Studio Offscreen]') : () => {};
const logError = console.error.bind(console, '[DD Studio Offscreen]');

// jSquash WASM JPEG encoder - much faster than canvas.toBlob()
let jSquashEncode = null;
let jSquashInitPromise = null;

async function initJSquash() {
  if (jSquashEncode) return jSquashEncode;
  if (jSquashInitPromise) return jSquashInitPromise;

  jSquashInitPromise = (async () => {
    try {
      log('Loading jSquash WASM encoder...');
      const startTime = performance.now();
      const module = await import('./jsquash/encode.js');
      jSquashEncode = module.default;
      log(`jSquash loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
      return jSquashEncode;
    } catch (error) {
      logError('Failed to load jSquash, falling back to toBlob:', error);
      return null;
    }
  })();

  return jSquashInitPromise;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  if (request.action === 'processScreenshot') {
    log('Processing screenshot');
    processScreenshot(request.data)
      .then(result => {
        log('Screenshot processed successfully');
        sendResponse(result);
      })
      .catch(error => {
        logError('Error processing screenshot', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});

async function processScreenshot(data) {
  const {
    screenshotUrl,
    options,
    needsAutoDetect
  } = data;

  // If retina mode is disabled, force devicePixelRatio to 1
  const effectivePixelRatio = options.retinaMode ? options.devicePixelRatio : 1;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      try {
        let coords;

        if (needsAutoDetect) {
          // Auto-detect banner boundaries
          const canvas = document.createElement('canvas');
          const canvasWidth = img.width;
          const canvasHeight = img.height;
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
          const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          const pixelData = imgData.data;

          const pos = findEdge(pixelData, canvasWidth, canvasHeight, options);
          if (!pos.valid) {
            reject(new Error('Could not detect banner boundaries'));
            return;
          }

          const boundingBox = findBoundary(pos, pixelData, canvasWidth, canvasHeight, options);

          // Use actual devicePixelRatio for coordinate calculation (screenshot is always retina on retina screens)
          const actualRatio = options.devicePixelRatio;
          if (actualRatio > 1) {
            coords = {
              x: Math.ceil(boundingBox.x / actualRatio),
              y: Math.ceil(boundingBox.y / actualRatio),
              w: Math.ceil(boundingBox.width / actualRatio),
              h: Math.ceil(boundingBox.height / actualRatio)
            };
          } else {
            coords = {
              x: boundingBox.x,
              y: boundingBox.y,
              w: boundingBox.width,
              h: boundingBox.height
            };
          }
        } else {
          coords = { x: 0, y: 0, w: options.width, h: options.height };
        }

        // Crop and process the image with effective pixel ratio
        cropAndProcess(img, coords, options, effectivePixelRatio, resolve, reject);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = screenshotUrl;
  });
}

function cropAndProcess(img, coords, options, effectivePixelRatio, resolve, reject) {
  const canvas = document.createElement('canvas');
  const imgWidth = coords.w;
  const imgHeight = coords.h;

  // The actual device pixel ratio (screenshot is captured at this resolution)
  const actualRatio = options.devicePixelRatio;

  // Output size based on effective pixel ratio (1 for non-retina, actual for retina)
  canvas.width = coords.w * effectivePixelRatio;
  canvas.height = coords.h * effectivePixelRatio;
  const ctx = canvas.getContext('2d');

  // Source coordinates need to account for actual screen resolution
  const srcX = coords.x * actualRatio;
  const srcY = coords.y * actualRatio;
  const srcW = coords.w * actualRatio;
  const srcH = coords.h * actualRatio;

  ctx.drawImage(
    img,
    srcX, srcY, srcW, srcH,
    0, 0, canvas.width, canvas.height
  );

  let imgType;
  if (options.outputMode === 'JPG') {
    imgType = 'image/jpeg';
  } else if (options.outputMode === 'PNG') {
    imgType = 'image/png';
  }

  if (options.outputMode === 'JPG') {
    if (options.optimizingMode === 'filesize') {
      checkSize(canvas, 100, 0, imgType, options, (dataURL) => {
        resolve({ dataURL, imgWidth, imgHeight });
      });
    } else if (options.optimizingMode === 'quality') {
      // Use jSquash for quality mode too (faster + better compression)
      encodeWithJSquash(canvas, options.quality).then(dataURL => {
        resolve({ dataURL, imgWidth, imgHeight });
      }).catch(() => {
        // Fallback to toDataURL if jSquash fails
        const dataURL = canvas.toDataURL(imgType, options.quality / 100);
        resolve({ dataURL, imgWidth, imgHeight });
      });
    }
  } else {
    // PNG
    const dataURL = canvas.toDataURL(imgType);
    resolve({ dataURL, imgWidth, imgHeight });
  }
}

// Single encode with jSquash for quality mode
async function encodeWithJSquash(canvas, quality) {
  const encode = await initJSquash();
  if (!encode) {
    throw new Error('jSquash not available');
  }

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  log(`Encoding with jSquash at quality=${quality}`);
  const startTime = performance.now();
  const buffer = await encode(imageData, { quality });
  const elapsed = performance.now() - startTime;

  // Convert ArrayBuffer to data URL
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const dataURL = `data:image/jpeg;base64,${base64}`;

  log(`Encoded in ${elapsed.toFixed(0)}ms, size=${(buffer.byteLength / 1000).toFixed(1)}KB`);
  return dataURL;
}

// Two-phase search: coarse (steps of 20) then fine binary search
// Uses jSquash WASM encoder for speed (~50ms vs ~1000ms per iteration)
async function checkSize(canvas, _tempQuality, _security, imgType, options, callback) {
  const targetSize = options.maxFileSize;
  const startTime = performance.now();
  const elapsed = () => `${(performance.now() - startTime).toFixed(0)}ms`;

  log(`[${elapsed()}] Starting filesize optimization, target: ${targetSize}KB`);

  // Try to use jSquash WASM encoder (much faster)
  const encode = await initJSquash();
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Helper to encode at a given quality
  const getEncoded = async (quality) => {
    if (encode) {
      // Use jSquash WASM encoder
      const buffer = await encode(imageData, { quality });
      return { data: buffer, size: buffer.byteLength / 1000, quality };
    } else {
      // Fallback to toBlob
      return new Promise(resolve => {
        canvas.toBlob(blob => {
          resolve({ data: blob, size: blob.size / 1000, quality, isBlob: true });
        }, imgType, quality / 100);
      });
    }
  };

  let iterations = 0;
  let bestData = null;
  let bestQuality = 1;
  let isBlob = false;

  // Phase 1: Coarse search with steps of 20 to find approximate range
  log(`[${elapsed()}] Phase 1: Coarse search (100, 80, 60, 40, 20) ${encode ? '[WASM]' : '[toBlob]'}`);

  let low = 1;
  let high = 100;

  for (const q of [100, 80, 60, 40, 20]) {
    const result = await getEncoded(q);
    iterations++;

    if (result.size <= targetSize) {
      log(`[${elapsed()}] #${iterations} quality=${q} -> ${result.size.toFixed(1)}KB ✓ FITS`);
      bestData = result.data;
      bestQuality = q;
      isBlob = result.isBlob || false;
      low = q;
      break;
    } else {
      log(`[${elapsed()}] #${iterations} quality=${q} -> ${result.size.toFixed(1)}KB ✗ too big`);
      high = q;
    }
  }

  // If even quality 20 doesn't fit, search lower
  if (!bestData) {
    log(`[${elapsed()}] Quality 20 too big, searching 1-19`);
    for (let q = 15; q >= 1; q -= 5) {
      const result = await getEncoded(q);
      iterations++;
      if (result.size <= targetSize) {
        log(`[${elapsed()}] #${iterations} quality=${q} -> ${result.size.toFixed(1)}KB ✓ FITS`);
        bestData = result.data;
        bestQuality = q;
        isBlob = result.isBlob || false;
        low = q;
        high = q + 5;
        break;
      }
    }
    // Absolute fallback
    if (!bestData) {
      const fallback = await getEncoded(1);
      iterations++;
      bestData = fallback.data;
      bestQuality = 1;
      isBlob = fallback.isBlob || false;
      log(`[${elapsed()}] #${iterations} Fallback to quality=1 -> ${fallback.size.toFixed(1)}KB`);
    }
  }

  // Phase 2: Binary search within the narrowed range to maximize quality
  if (high - low > 1) {
    log(`[${elapsed()}] Phase 2: Fine search between ${low} and ${high}`);

    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      const result = await getEncoded(mid);
      iterations++;

      if (result.size <= targetSize) {
        log(`[${elapsed()}] #${iterations} quality=${mid} -> ${result.size.toFixed(1)}KB ✓ FITS`);
        bestData = result.data;
        bestQuality = mid;
        isBlob = result.isBlob || false;
        low = mid;
      } else {
        log(`[${elapsed()}] #${iterations} quality=${mid} -> ${result.size.toFixed(1)}KB ✗ too big`);
        high = mid;
      }
    }
  }

  // Convert to data URL
  const finalSize = isBlob ? bestData.size / 1000 : bestData.byteLength / 1000;

  if (isBlob) {
    // Blob from toBlob fallback
    const reader = new FileReader();
    reader.onloadend = () => {
      log(`[${elapsed()}] ✓ DONE: quality=${bestQuality}, size=${finalSize.toFixed(1)}KB, iterations=${iterations}`);
      callback(reader.result);
    };
    reader.readAsDataURL(bestData);
  } else {
    // ArrayBuffer from jSquash
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bestData)));
    const dataURL = `data:image/jpeg;base64,${base64}`;
    log(`[${elapsed()}] ✓ DONE: quality=${bestQuality}, size=${finalSize.toFixed(1)}KB, iterations=${iterations}`);
    callback(dataURL);
  }
}

function xyIsInImage(data, x, y, cw, ch, options) {
  const start = (y * cw + x) * 4;
  if (options.isTransparent) {
    return data[start + 3] > 25;
  } else {
    const r = data[start + 0];
    const g = data[start + 1];
    const b = data[start + 2];
    const a = data[start + 3];
    const bgColor = options.bgColor || { r: 255, g: 255, b: 255 };
    const deltaR = Math.abs(bgColor.r - r);
    const deltaG = Math.abs(bgColor.g - g);
    const deltaB = Math.abs(bgColor.b - b);
    return !(deltaR < 1 && deltaG < 1 && deltaB < 1 && a > 10);
  }
}

function findBoundary(pos, data, cw, ch, options) {
  let x0 = pos.x;
  let x1 = pos.x;
  let y0 = pos.y;
  let y1 = pos.y;

  while (y1 <= ch && xyIsInImage(data, x1, y1, cw, ch, options)) {
    y1++;
  }

  let x2 = x1;
  let y2 = y1 - 1;

  while (x2 <= cw && xyIsInImage(data, x2, y2, cw, ch, options)) {
    x2++;
  }

  return { x: x0, y: y0, width: x2 - x0, height: y2 - y0 + 1 };
}

function findEdge(data, cw, ch, options) {
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (xyIsInImage(data, x, y, cw, ch, options)) {
        return { x: x, y: y, valid: true };
      }
    }
  }
  return { x: -100, y: -100, valid: false };
}
