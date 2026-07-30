// ponytail: single-file API — upload images into one shared Google Drive folder + list them.
// Run behind cloudflared; binds 127.0.0.1 only.
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');
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
const thumbUrl = (id) => `${PUBLIC_URL}/i/${id}`;

const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'authorization, content-type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const up = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

app.get('/list', async (req, res) => {
  try {
    const r = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'files(id,name)',
      orderBy: 'createdTime desc',
      pageSize: 200,
    });
    res.json(r.data.files.map((f) => ({ id: f.id, name: f.name, url: thumbUrl(f.id) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/upload', requireAdmin, up.single('file'), async (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith('image/'))
    return res.status(400).json({ error: 'image only' });
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  try {
    const r = await oauthDrive.files.create({
      requestBody: { name: req.file.originalname, parents: [FOLDER_ID] },
      media: { mimeType: req.file.mimetype, body: Readable.from(req.file.buffer) },
      fields: 'id',
    });
    res.json({ id: r.data.id, name: req.file.originalname, url: thumbUrl(r.data.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/file/:id', requireAdmin, express.json(), async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'bad name' });
  try {
    await oauthDrive.files.update({ fileId: req.params.id, requestBody: { name } });
    res.json({ ok: true, name });
  } catch (e) {
    // drive.file scope can't touch files added by hand in Drive
    res.status(e.code === 404 ? 404 : 500).json({ error: e.message });
  }
});

app.delete('/file/:id', requireAdmin, async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
  if (!oauthDrive) return res.status(503).json({ error: 'oauth not set up' });
  try {
    await oauthDrive.files.delete({ fileId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    // drive.file scope can't touch files added by hand in Drive — delete those in the Drive app
    res.status(e.code === 404 ? 404 : 500).json({ error: e.message });
  }
});

app.listen(PORT, '127.0.0.1', () => console.log(`drive-api on 127.0.0.1:${PORT}`));
