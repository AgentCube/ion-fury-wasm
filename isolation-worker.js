const isolationVersion = 'ion-fury-isolation-v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const scope = new URL(self.registration.scope);
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)
      || (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin')) return;
  event.respondWith((async () => {
    const response = await fetch(new Request(event.request, { cache: 'no-cache' }));
    if (!response.ok || response.type === 'opaque') return response;
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    headers.set('X-Ion-Fury-Isolation', isolationVersion);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  })());
});
