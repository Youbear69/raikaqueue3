// Self-hosted drive-api (see drive-api/README.md) — upload/list images in the shared folder
export const DRIVE_API = 'https://img.meowpow.online';

// Shown wherever the pi5 drive-api is unreachable
export const DRIVE_API_DOWN_MSG =
  'เครื่อง server ไม่ทำงาน หรือไฟดับ กรุณาสวดอ้อนวอนเพื่อให้เครื่อง server กลับมาใช้งานได้ปกติ';

export interface DriveImage {
  id: string;
  name: string;
  url: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  thumb?: string; // newest image inside, for the Explorer-style folder preview
}

export interface DriveListing {
  folders: DriveFolder[];
  images: DriveImage[];
}

const DRIVE_ID_RE =
  /(?:drive\.google\.com\/(?:file\/d\/([\w-]+)|(?:open|uc|thumbnail)\?[^#]*?\bid=([\w-]+))|img\.meowpow\.online\/i\/([\w-]+(?:\.gif)?))/;

// Converts a Google Drive share link (file/d/ID, open?id=, uc?id=) into our
// /i/ image proxy — a Cloudflare Worker at the edge (drive-api/worker/), so it
// adds CORS for canvas use, caches away Drive's hotlink 429s, and stays up when
// the home server is off. Non-Drive URLs pass through unchanged.
export function normalizeImageUrl(url: string): string {
  const m = url.match(DRIVE_ID_RE);
  const id = m?.[1] ?? m?.[2] ?? m?.[3];
  return id ? `${DRIVE_API}/i/${id}` : url;
}
