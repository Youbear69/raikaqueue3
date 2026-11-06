// One-time OAuth setup: node oauth-setup.js <client_id> <client_secret>
// Prints a consent URL; after the owner approves, this exchanges the code,
// creates the app upload folder, shares it (anyone-with-link + service account),
// and writes oauth.json for server.js.
const http = require('http');
const fs = require('fs');
const { URL, URLSearchParams } = require('url');

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.log('usage: node oauth-setup.js <client_id> <client_secret>');
  process.exit(1);
}
const REDIRECT = 'http://127.0.0.1:8123';
const SA_EMAIL = 'firebase-adminsdk-fbsvc@raikaqueue.iam.gserviceaccount.com';
const FOLDER_NAME = 'raika-img-uploads';

const srv = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) return res.end('no code');
  res.end('OK - close this tab');
  try {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tr.json();
    if (!tok.refresh_token) throw new Error('no refresh_token: ' + JSON.stringify(tok));
    const authH = { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' };

    const fr = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: authH,
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const folder = await fr.json();
    if (!folder.id) throw new Error('folder create failed: ' + JSON.stringify(folder));

    // anyone-with-link reader (thumbnail URLs) + service account reader (/list)
    for (const perm of [
      { role: 'reader', type: 'anyone' },
      { role: 'reader', type: 'user', emailAddress: SA_EMAIL },
    ]) {
      const pr = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folder.id}/permissions?sendNotificationEmail=false`,
        { method: 'POST', headers: authH, body: JSON.stringify(perm) },
      );
      const pj = await pr.json();
      if (!pj.id) console.log('WARN permission failed:', JSON.stringify(pj));
    }

    fs.writeFileSync(
      'oauth.json',
      JSON.stringify(
        {
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tok.refresh_token,
          folder_id: folder.id,
        },
        null,
        2,
      ),
    );
    console.log('DONE. folder_id=' + folder.id + ' -> oauth.json written');
  } catch (e) {
    console.log('FAIL:', e.message);
  }
  srv.close();
});

srv.listen(8123, '127.0.0.1', () => {
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/drive.file',
    });
  console.log('Open this URL in the browser (login as the folder owner):\n\n' + url + '\n');
});
