import { zipSync } from 'fflate';
import { driveFileUrl } from './drive-url';

export interface DownloadableImage {
  id: string;
  name: string;
  url: string;
}

// Original file from the drive-api (/f/). If the home server is down, a picture
// still downloads from the edge thumbnail proxy (?s=4000 = re-encoded, max 4000 px).
async function fetchBytes(im: DownloadableImage): Promise<Uint8Array> {
  let r = await fetch(driveFileUrl(im.id)).catch(() => null);
  if (!r?.ok && im.url.includes('/i/')) r = await fetch(`${im.url}?s=4000`);
  if (!r?.ok) throw new Error(String(r?.status ?? 'network'));
  return new Uint8Array(await r.arrayBuffer());
}

function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// One file downloads as-is; more than one is bundled into a single .zip
export async function downloadImages(
  imgs: DownloadableImage[],
  zipName = 'raika-images.zip',
  onResult?: (name: string, ok: boolean) => void,
): Promise<void> {
  if (imgs.length === 1) {
    try {
      saveBlob(new Blob([(await fetchBytes(imgs[0])) as BlobPart]), imgs[0].name);
      onResult?.(imgs[0].name, true);
    } catch {
      onResult?.(imgs[0].name, false);
    }
    return;
  }
  const files: Record<string, Uint8Array> = {};
  for (const im of imgs) {
    try {
      let n = im.name;
      let k = 1;
      while (files[n]) n = im.name.replace(/(\.[^.]*)?$/, ` (${k++})$1`);
      files[n] = await fetchBytes(im);
      onResult?.(im.name, true);
    } catch {
      onResult?.(im.name, false);
    }
  }
  if (!Object.keys(files).length) return;
  // level 0 (store): fast, and most files (images, video, zip) are already compressed
  saveBlob(new Blob([zipSync(files, { level: 0 }) as BlobPart]), zipName);
}
