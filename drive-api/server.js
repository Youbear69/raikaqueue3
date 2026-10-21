// ponytail: single-file API — upload files (any type) into one shared Google Drive folder, list + download them.
// Run behind cloudflared; binds 127.0.0.1 only.
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs');
const os = require('os');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT || 8790);
const KEY_FILE = process.env.KEY_FILE || './service-account.json';
// oauth.json: {client_id, client_secret, refresh_token, folder_id} — created by oauth-setup.js.
// Uploads use the owner's OAuth (drive.file scope): Google blocks service-account uploads
// into My Drive ("Service Accounts do not have storage quota"), and drive.file only sees
// app-created files, hence the app-created upload folder.
let oauthCfg = null;
let oauthDrive = null;
try {
  oauthCfg = require(process.env.OAUTH_FILE || './oauth.json');
  const oc = new google.auth.OAuth2(oauthCfg.client_id, oauthCfg.client_secret);
  oc.setCredentials({ refresh_token: oauthCfg.refresh_token });
  oauthDrive = google.drive({ version: 'v3', auth: oc });
} catch {
  // no oauth.json yet — /upload returns 503 until setup is done
}
const FOLDER_ID =
  process.env.FOLDER_ID || oauthCfg?.folder_id || '11TI3eDgj1Pv8xepXvfFod3is4x6vcDpm';
// Public-read RTDB — used to check the caller's email against adminEmails
const RTDB = 'https://raikaqueue-default-rtdb.asia-southeast1.firebasedatabase.app';

// projectId alone is enough for verifyIdToken (public cert check, no credentials)
admin.initializeApp({ projectId: 'raikaqueue' });

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// /i/ is served by the Cloudflare Worker (drive-api/worker/) at the edge —
// CORS + caching + independent of this server being up. This local /i/ route
// below stays as a fallback if the Worker route is ever removed.
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://img.meowpow.online';
// .gif suffix so pasting the URL into Discord animates (Discord keys off the path extension)
const thumbUrl = (id, mime) => `${PUBLIC_URL}/i/${id}${mime === 'image/gif' ? '.gif' : ''}`;
// original bytes of any file (download), served by this server via /f/
const fileUrl = (id) => `${PUBLIC_URL}/f/${id}`;
// Drive thumbnails exist for images only; svg comes back rasterized, so treat it as a file
const isImage = (mime) => (mime || '').startsWith('image/') && mime !== 'image/svg+xml';

const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'authorization, content-type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 100 MB = Cloudflare tunnel's request body cap (free plan). Spooled to disk, not RAM.
const up = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

async function requireAdmin(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer /i, '');
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase().replace(/\./g, ',');
    if (!email) return res.status(401).json({ error: 'no email on token' });
    const r = await fetch(`${RTDB}/adminEmails/${encodeURIComponent(email)}.json`);
    if ((await r.json()) == null) return res.status(403).json({ error: 'not admin' });
    next();
  } catch {
    res.status(401).json({ error: 'bad token' });
  }
}

app.get('/i/:id', async (req, res) => {
  req.params.id = req.params.id.replace(/\.\w{1,5}$/, '');
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).end();
  const s = Math.min(4000, Math.max(100, Number(req.query.s) || 1000));
  try {
    const r = await fetch(
      `https://drive.google.com/thumbnail?id=${req.params.id}&sz=w${s}`,
      { redirect: 'follow' },
    );
    if (!r.ok) return res.status(r.status).end();
    res.set('content-type', r.headers.get('content-type') || 'image/jpeg');
    res.set('cache-control', 'public, max-age=86400');
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Only the root folder and its direct children are browsable
async function childOfRoot(id) {
  if (id === FOLDER_ID) return true;
  try {
    const r = await drive.files.get({ fileId: id, fields: 'parents' });
    return (r.data.parents || []).includes(FOLDER_ID);
  } catch {
    return false;
  }
}

app.get('/list', async (req, res) => {
  try {
    const q = String(req.query.folder || '');
    const folder = /^[\w-]+$/.test(q) ? q : FOLDER_ID;
    if (!(await childOfRoot(folder))) return res.status(400).json({ error: 'bad folder' });
    const r = await drive.files.list({
      q: `'${folder}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size)',
      orderBy: 'folder,createdTime desc',
      pageSize: 200,
    });
    const folders = [];
    const images = []; // pictures only: the image pickers and /gallery read this
    const files = []; // everything else (zip, pdf, video, ...): only the file manager shows these
    for (const f of r.data.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') folders.push({ id: f.id, name: f.name });
      else if (f.mimeType.startsWith('application/vnd.google-apps.')) continue; // Docs/Sheets: no bytes to download
      else if (isImage(f.mimeType)) images.push({ id: f.id, name: f.name, url: thumbUrl(f.id, f.mimeType) });
      else files.push({ id: f.id, name: f.name, url: fileUrl(f.id), mime: f.mimeType, size: Number(f.size) || 0 });
    }
    // folder preview: newest image inside each folder (folder count is small)
    await Promise.all(
      folders.map(async (f) => {
        try {
          const c = await drive.files.list({
            q: `'${f.id}' in parents and mimeType contains 'image/' and trashed=false`,
            fields: 'files(id,mimeType)',
            orderBy: 'createdTime desc',
            pageSize: 1,
          });
          if (c.data.files[0]) f.thumb = thumbUrl(c.data.files[0].id, c.data.files[0].mimeType);
        } catch {
          // no preview
        }
      }),
    );
    res.json({ folders, images, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/folder', requireAdmin, express.json(), async (req, res) => {
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'bad name' });
  try {
    const r = await oauthDrive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [FOLDER_ID] },
      fields: 'id',
    });
    res.json({ id: r.data.id, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/upload', requireAdmin, up.single('file'), async (req, res) => {
  const tmp = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
    const fq = String(req.body?.folder || '');
    const parent = /^[\w-]+$/.test(fq) ? fq : FOLDER_ID;
    if (!(await childOfRoot(parent))) return res.status(400).json({ error: 'bad folder' });
    // busboy hands the multipart filename over as latin1; Thai names need utf8
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const mime = req.file.mimetype || 'application/octet-stream';
    const r = await oauthDrive.files.create({
      requestBody: { name, parents: [parent] },
      media: { mimeType: mime, body: fs.createReadStream(tmp) },
      fields: 'id',
    });
    const id = r.data.id;
    res.json({ id, name, url: isImage(mime) ? thumbUrl(id, mime) : fileUrl(id), mime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (tmp) fs.unlink(tmp, () => {});
  }
});

// Original bytes of a file in the site folder (root or one level down), always as a
// download: attachment + nosniff, so an uploaded .html/.svg never runs as a page here.
app.get('/f/:id', async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  try {
    const meta = await drive.files.get({ fileId: req.params.id, fields: 'name,mimeType,size,parents,trashed' });
    const parents = meta.data.parents || [];
    const inside = parents.includes(FOLDER_ID) || (await Promise.all(parents.map(childOfRoot))).some(Boolean);
    if (!inside || meta.data.trashed || meta.data.mimeType.startsWith('application/vnd.google-apps.'))
      return res.status(404).json({ error: 'not found' });
    const r = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'stream' });
    res.set('content-type', meta.data.mimeType || 'application/octet-stream');
    if (meta.data.size) res.set('content-length', meta.data.size);
    res.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.data.name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`);
    res.set('x-content-type-options', 'nosniff');
    res.set('cache-control', 'public, max-age=3600');
    r.data.on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    res.status(e.code === 404 ? 404 : 502).json({ error: e.code === 404 ? 'not found' : e.message });
  }
});

// Rename ({name}) and/or move ({parent} — folder id or "root")
app.patch('/file/:id', requireAdmin, express.json(), async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  const name = String(req.body?.name || '').trim();
  let parent = String(req.body?.parent || '').trim();
  if (parent === 'root') parent = FOLDER_ID;
  if (!name && !parent) return res.status(400).json({ error: 'nothing to do' });
  if (name.length > 100 || (parent && !/^[\w-]+$/.test(parent)))
    return res.status(400).json({ error: 'bad request' });
  if (parent && !(await childOfRoot(parent))) return res.status(400).json({ error: 'bad folder' });
  try {
    const params = { fileId: req.params.id };
    if (name) params.requestBody = { name };
    if (parent) {
      // SA (reader on the whole folder) sees hand-added files that drive.file can't
      const cur = await drive.files.get({ fileId: req.params.id, fields: 'parents' });
      params.addParents = parent;
      params.removeParents = (cur.data.parents || []).join(',');
    }
    try {
      await oauthDrive.files.update(params);
    } catch (e) {
      // hand-added file: drive.file gets 404 (invisible) or 403 (no write grant) —
      // retry as the SA (shared as Editor on the folder)
      if (e.code !== 404 && e.code !== 403) throw e;
      await drive.files.update(params);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code === 404 ? 404 : 500).json({ error: e.message });
  }
});

app.delete('/file/:id', requireAdmin, async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  try {
    try {
      await oauthDrive.files.delete({ fileId: req.params.id });
    } catch (e) {
      // hand-added file (404/403 from drive.file): SA (as Editor) trashes it instead
      if (e.code !== 404 && e.code !== 403) throw e;
      await drive.files.update({ fileId: req.params.id, requestBody: { trashed: true } });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code === 404 ? 404 : 500).json({ error: e.message });
  }
});

// multer errors (e.g. LIMIT_FILE_SIZE) land here — JSON, not Express's HTML error page
app.use((err, req, res, next) => {
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err.message });
});

app.listen(PORT, '127.0.0.1', () => console.log(`drive-api on 127.0.0.1:${PORT}`));
