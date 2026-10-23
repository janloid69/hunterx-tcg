import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

export type PickedPhoto = {
  /** Something an <Image> can show right away. */
  previewUri: string;
  /** JPEG, at most 1600px on the long side, ready to upload. */
  blob: Blob;
};

/** Lets the member choose up to `limit` photos from their phone or computer. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Allow photo access to add pictures.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.9,
  });
  if (result.canceled) return [];

  const photos: PickedPhoto[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    const blob = await shrinkToJpeg(asset.file ?? null, asset.uri);
    photos.push({ previewUri: Platform.OS === 'web' ? URL.createObjectURL(blob) : asset.uri, blob });
  }
  return photos;
}

/** Re-encodes a photo as a smaller JPEG so uploads are quick on mobile data. */
async function shrinkToJpeg(file: File | null, uri: string): Promise<Blob> {
  const source: Blob = file ?? (await (await fetch(uri)).blob());
  if (Platform.OS !== 'web' || typeof document === 'undefined') return source;

  const image = await loadImage(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.drawImage(image, 0, 0, width, height);
  if ('close' in image && typeof image.close === 'function') image.close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? source), 'image/jpeg', JPEG_QUALITY);
  });
}

async function loadImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall back to an <img> element below (older Safari).
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file doesn't look like a photo."));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
