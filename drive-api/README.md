# drive-api

Upload images into a Google Drive folder + list/serve them, for the admin UI.

- `GET /list` — public. Images in the folder as `[{id, name, url}]` (url = our `/i/:id` proxy).
- `GET /i/:id` — public image proxy (Drive thumbnail behind it). Needed because Drive's thumbnail endpoint 302-redirects without CORS headers, which breaks canvas loads (lanyard card).
- `POST /upload` — multipart field `file`, image only, max 10MB. Requires `Authorization: Bearer <Firebase ID token>` of an email present in RTDB `adminEmails`.

## Auth model (why two credentials)

- **Uploads = OAuth of the folder owner** (`oauth.json`, scope `drive.file`). Google blocks service-account uploads into My Drive ("Service Accounts do not have storage quota"). `drive.file` only sees app-created files, so setup creates its own folder (`raika-img-uploads`).
- **Listing = service account** (`service-account.json`, read-only on that folder via share). Sees ALL files in the folder, including ones added by hand in the Drive app.

Deployed setup (2026-07-30): Firebase SA `firebase-adminsdk-fbsvc@raikaqueue.iam.gserviceaccount.com` + OAuth Desktop client in the same `raikaqueue` GCP project (consent screen published to production — Testing status would expire refresh tokens after 7 days). Folder `raika-img-uploads` shared: anyone-with-link reader + SA reader.

## One-time setup (redo only if tokens/folder are lost)

1. GCP console, project `raikaqueue`: enable **Google Drive API**; download an SA key as `service-account.json`
2. Create **OAuth client ID** (Desktop app), publish consent screen to production
3. `node oauth-setup.js <client_id> <client_secret>` — open the printed URL as the folder owner; writes `oauth.json` (creates + shares the upload folder)
4. Both JSON files are gitignored — copy them to the server by hand

## Deploy (ubuntu หรือ pi5, pm2 เหมือน yt-proxy)

```sh
scp -r drive-api <host>:~/drive-api
scp service-account.json <host>:~/drive-api/
ssh <host>
cd ~/drive-api && npm install
pm2 start server.js --name drive-api
pm2 save
```

Env (ค่า default ใช้ได้เลย): `PORT` 8790, `FOLDER_ID` folder รูป, `KEY_FILE` ./service-account.json

## Expose ผ่าน cloudflared

เพิ่มใน `/etc/cloudflared/config.yml` (เครื่องที่รัน tunnel `home`) เหนือ catch-all 404:

```yaml
  - hostname: img.meowpow.online
    service: http://127.0.0.1:8790
```

แล้ว `sudo systemctl restart cloudflared` + เพิ่ม CNAME `img` ใน Cloudflare DNS ชี้ tunnel เดิม (`cloudflared tunnel route dns home img.meowpow.online`)

ฝั่งเว็บตั้ง URL ที่ `web/src/app/shared/drive-url.ts` (`DRIVE_API`)
