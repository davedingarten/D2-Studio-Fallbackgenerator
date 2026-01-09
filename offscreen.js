// Offscreen document for handling canvas operations
// Service workers don't have DOM access, so we use this offscreen document

const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[DD Studio Offscreen]') : () => {};
const logError = console.error.bind(console, '[DD Studio Offscreen]');

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
      const dataURL = canvas.toDataURL(imgType, options.quality / 100);
      resolve({ dataURL, imgWidth, imgHeight });
    }
  } else {
    // PNG
    const dataURL = canvas.toDataURL(imgType);
    resolve({ dataURL, imgWidth, imgHeight });
  }
}

// Binary search to find highest quality that fits under maxFileSize
// Guarantees file will NOT exceed maxFileSize while maximizing quality
async function checkSize(canvas, _tempQuality, _security, imgType, options, callback) {
  const targetSize = options.maxFileSize;

  // Helper to get blob at a given quality
  const getBlob = (quality) => {
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        resolve({ blob, size: blob.size / 1000, quality });
      }, imgType, quality / 100);
    });
  };

  let iterations = 0;
  let bestBlob = null;
  let bestQuality = 1;

  // First check if 100% quality fits
  const maxResult = await getBlob(100);
  iterations++;

  if (maxResult.size <= targetSize) {
    // Max quality fits, use it
    bestBlob = maxResult.blob;
    bestQuality = 100;
  } else {
    // Binary search between 1 and 100
    let low = 1;
    let high = 100;

    while (high - low > 2) {
      const mid = Math.floor((low + high) / 2);
      const result = await getBlob(mid);
      iterations++;

      if (result.size <= targetSize) {
        // This quality fits, try higher
        bestBlob = result.blob;
        bestQuality = mid;
        low = mid + 1;
      } else {
        // Too big, need lower quality
        high = mid - 1;
      }
    }

    // Fine-tune: check remaining values in range
    for (let q = high; q >= low; q--) {
      const result = await getBlob(q);
      iterations++;
      if (result.size <= targetSize) {
        bestBlob = result.blob;
        bestQuality = q;
        break;
      }
    }

    // Fallback if nothing found yet
    if (!bestBlob) {
      const fallback = await getBlob(1);
      bestBlob = fallback.blob;
      bestQuality = 1;
      iterations++;
    }
  }

  // Convert blob to data URL
  const reader = new FileReader();
  reader.onloadend = () => {
    log(`Filesize optimization: quality=${bestQuality}, size=${(bestBlob.size / 1000).toFixed(1)}KB, iterations=${iterations}`);
    callback(reader.result);
  };
  reader.readAsDataURL(bestBlob);
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
