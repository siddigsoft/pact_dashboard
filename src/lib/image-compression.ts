interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

const defaultOptions: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.7,
  mimeType: 'image/jpeg',
};

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const maxWidth = opts.maxWidth!;
      const maxHeight = opts.maxHeight!;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        opts.mimeType,
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export async function compressImageToBase64(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<string> {
  const blob = await compressImage(file, options);
  return blobToBase64(blob);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function base64ToBlob(base64: string): Promise<Blob> {
  const response = await fetch(base64);
  return response.blob();
}

export function getFileSizeString(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function captureAndCompressPhoto(options?: CompressionOptions): Promise<{
  original: { size: number; sizeString: string };
  compressed: { blob: Blob; base64: string; size: number; sizeString: string };
}> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';

  return new Promise((resolve, reject) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const originalSize = file.size;
        const compressed = await compressImage(file, options);
        const base64 = await blobToBase64(compressed);

        resolve({
          original: {
            size: originalSize,
            sizeString: getFileSizeString(originalSize),
          },
          compressed: {
            blob: compressed,
            base64,
            size: compressed.size,
            sizeString: getFileSizeString(compressed.size),
          },
        });
      } catch (error) {
        reject(error);
      }
    };

    input.click();
  });
}

export function fixImageOrientation(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to fix orientation'));
            }
          },
          'image/jpeg',
          0.9
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface PhotoCapture {
  id: string;
  base64: string;
  timestamp: number;
  originalSize: number;
  compressedSize: number;
  location?: { lat: number; lng: number; accuracy?: number };
}

export async function capturePhoto(
  getLocation?: () => Promise<{ lat: number; lng: number; accuracy?: number } | null>
): Promise<PhotoCapture> {
  const result = await captureAndCompressPhoto({
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.75,
  });

  const location = getLocation ? await getLocation() : null;

  return {
    id: crypto.randomUUID(),
    base64: result.compressed.base64,
    timestamp: Date.now(),
    originalSize: result.original.size,
    compressedSize: result.compressed.size,
    location: location || undefined,
  };
}
