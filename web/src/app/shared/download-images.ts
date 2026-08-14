import { zipSync } from 'fflate';

export interface DownloadableImage {
  name: string;
  url: string;
}

// ?s=4000 clamps to the original resolution on the image proxy
async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(`${url}?s=4000`);
  if (!r.ok) throw new Error(String(r.status));
  return new Uint8Array(await r.arrayBuffer());
}

function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// One image downloads as-is; more than one is bundled into a single .zip
export async function downloadImages(
  imgs: DownloadableImage[],
  zipName = 'raika-images.zip',
  onResult?: (name: string, ok: boolean) => void,
): Promise<void> {
  if (imgs.length === 1) {
    try {
      saveBlob(new Blob([(await fetchBytes(imgs[0].url)) as BlobPart]), imgs[0].name);
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
      files[n] = await fetchBytes(im.url);
      onResult?.(im.name, true);
    } catch {
      onResult?.(im.name, false);
    }
  }
  if (!Object.keys(files).length) return;
  // level 0 (store): images are already compressed, zip is just a container
  saveBlob(new Blob([zipSync(files, { level: 0 }) as BlobPart]), zipName);
}
