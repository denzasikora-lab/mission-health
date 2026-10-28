importScripts('/camera-engine/vision-1.2.0.js');

let segmenter, portrait, portraitContext, maskCanvas, maskContext;
self.onmessage = async event => {
  const { type, bitmap, timestamp } = event.data;
  try {
    if (type === 'init') {
      const files = await Vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm');
      segmenter = await Vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/camera-engine/selfie-landscape.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true
      });
      portrait = new OffscreenCanvas(640, 360);
      portraitContext = portrait.getContext('2d');
      maskCanvas = new OffscreenCanvas(256, 144);
      maskContext = maskCanvas.getContext('2d');
      self.postMessage({ type: 'ready' });
    } else if (type === 'frame' && segmenter) {
      segmenter.segmentForVideo(bitmap, timestamp, result => {
        const masks = result.confidenceMasks;
        const mask = masks[masks.length === 1 ? 0 : 1];
        const values = mask.getAsFloat32Array();
        if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
          maskCanvas.width = mask.width; maskCanvas.height = mask.height;
        }
        const image = maskContext.createImageData(mask.width, mask.height);
        // Мягкая граница сохраняет волосы и сглаживает край портрета.
        for (let pixel = 0; pixel < values.length; pixel++) {
          const confidence = Math.max(0, Math.min(1, (values[pixel] - .25) / .55));
          const offset = pixel * 4;
          image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = 255;
          image.data[offset + 3] = Math.round(confidence * confidence * (3 - 2 * confidence) * 255);
        }
        maskContext.putImageData(image, 0, 0);
        portraitContext.globalCompositeOperation = 'source-over';
        portraitContext.clearRect(0, 0, 640, 360);
        portraitContext.drawImage(bitmap, 0, 0, 640, 360);
        portraitContext.globalCompositeOperation = 'destination-in';
        portraitContext.drawImage(maskCanvas, 0, 0, 640, 360);
        portraitContext.globalCompositeOperation = 'source-over';
        const cutout = portrait.transferToImageBitmap();
        self.postMessage({ type: 'frame', bitmap: cutout }, [cutout]);
      });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'segmentation_unavailable' });
  } finally { bitmap?.close(); }
};
