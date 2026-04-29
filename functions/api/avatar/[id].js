// Cloudflare Pages Function — proxy Sleeper avatar images through our domain.
//
// Why: html2canvas needs to read pixel data from images to draw them onto its
// canvas. Browsers block reading cross-origin image pixels unless the source
// server sends Access-Control-Allow-Origin headers. Sleeper's CDN doesn't.
// So when we capture the share-snapshot, the avatar gets silently skipped.
//
// Solution: this function fetches the avatar from sleepercdn.com server-side
// and re-serves it from our domain with CORS headers. The browser sees a
// same-origin image and html2canvas captures it cleanly.
//
// Route: /api/avatar/{id}        → https://sleepercdn.com/avatars/thumbs/{id}
// Route: /api/avatar/full/{id}   → https://sleepercdn.com/avatars/{id}      (not implemented yet)
//
// Cached for 1 day (public, max-age=86400) — Sleeper avatars rarely change.

export async function onRequestGet({ params }) {
  const id = params.id;

  // Sleeper avatar IDs are hex hashes (e.g. fbe53cf15f6585898b24bb8035273e91).
  // Reject anything that doesn't match — prevents URL injection / SSRF abuse.
  if (!id || !/^[a-f0-9]{8,64}$/i.test(id)) {
    return new Response('Invalid avatar id', { status: 400 });
  }

  const upstreamUrl = `https://sleepercdn.com/avatars/thumbs/${id}`;
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      // CF caches the upstream fetch globally — multiple PFK users get a cache hit.
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
  } catch (e) {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok) {
    return new Response('Avatar not found', { status: upstream.status });
  }

  // Build response headers: copy content-type, add CORS + browser caching.
  const headers = new Headers();
  const ct = upstream.headers.get('content-type') || 'image/jpeg';
  headers.set('Content-Type', ct);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=86400');
  // Allow images to be loaded with credentials-mode-omit, the html2canvas default.
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(upstream.body, { status: 200, headers });
}
