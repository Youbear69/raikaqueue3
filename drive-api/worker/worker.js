// Cloudflare Worker: edge image proxy for Google Drive thumbnails.
// Serves img.meowpow.online/i/<fileId> with CORS + edge caching, so images
// keep working when the home server is off and Drive's hotlink 429s are
// absorbed by the cache.
export default {
  async fetch(req) {
    const url = new URL(req.url);
    // optional .gif suffix: Discord only animates URLs whose path ends in .gif
    const m = url.pathname.match(/^\/i\/([\w-]+)(?:\.\w{1,5})?$/);
    if (!m) return new Response('not found', { status: 404 });
    // ?s=<width> for larger renders (hero character), default 1000
    const s = Math.min(4000, Math.max(100, Number(url.searchParams.get('s')) || 1000));
    const r = await fetch(`https://drive.google.com/thumbnail?id=${m[1]}&sz=w${s}`, {
      redirect: 'follow',
      cf: { cacheEverything: true, cacheTtl: 604800 },
    });
    return new Response(r.body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'image/jpeg',
        'cache-control': 'public, max-age=604800',
        'access-control-allow-origin': '*',
      },
    });
  },
};
