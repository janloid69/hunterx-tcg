// Reads text from camera frames in the browser with Tesseract.js, loaded from
// jsDelivr only when the scanner opens (about 5 MB the first time, then
// cached). Everything runs on the member's device; no photo is uploaded.

const TESSERACT_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const ALLOWED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-|';

type TesseractWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};
type TesseractGlobal = { createWorker: (lang: string, oem?: number) => Promise<TesseractWorker> };

let workerPromise: Promise<TesseractWorker> | null = null;

function loadScript(): Promise<TesseractGlobal> {
  const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const loaded = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error('The card reader did not load.'));
    };
    script.onerror = () => reject(new Error("Couldn't download the card reader. Check your connection."));
    document.head.appendChild(script);
  });
}

/** Starts the reader once and reuses it. */
export function prepareReader(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await loadScript();
      const worker = await Tesseract.createWorker('eng', 1);
      await worker.setParameters({
        tessedit_char_whitelist: ALLOWED,
        tessedit_pageseg_mode: '11', // sparse text: find bits of text anywhere in the picture
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function readText(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await prepareReader();
  const { data } = await worker.recognize(canvas);
  return data.text ?? '';
}

export type Crop = { x: number; y: number; width: number; height: number };

/**
 * Copies part of a frame, scaled for reading: greyscale, stretched contrast,
 * and optionally inverted for light text on dark cards (full arts).
 */
export function prepareImage(
  source: CanvasImageSource,
  crop: Crop,
  { invert = false, maxWidth = 1400 }: { invert?: boolean; maxWidth?: number } = {},
): HTMLCanvasElement {
  const scale = Math.min(3, maxWidth / Math.max(1, crop.width));
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const grey = new Uint8ClampedArray(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    const value = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    grey[j] = value;
    histogram[value] += 1;
  }
  // Stretch between the 2nd and 98th percentile.
  const total = width * height;
  let low = 0;
  let high = 255;
  for (let sum = 0, v = 0; v < 256; v += 1) {
    sum += histogram[v];
    if (sum > total * 0.02) {
      low = v;
      break;
    }
  }
  for (let sum = 0, v = 255; v >= 0; v -= 1) {
    sum += histogram[v];
    if (sum > total * 0.02) {
      high = v;
      break;
    }
  }
  const range = Math.max(1, high - low);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    let value = ((grey[j] - low) * 255) / range;
    if (invert) value = 255 - value;
    px[i] = px[i + 1] = px[i + 2] = value;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
