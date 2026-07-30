// Cloudflare Worker: edge image proxy for Google Drive thumbnails.
// Serves img.meowpow.online/i/<fileId> with CORS + edge caching, so images
// keep working when the home server is off and Drive's hotlink 429s are
// absorbed by the cache.
export default {
  async fetch(req) {
    const m = new URL(req.url).pathname.match(/^\/i\/([\w-]+)$/);
    if (!m) return new Response('not found', { status: 404 });
    const r = await fetch(`https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`, {
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
