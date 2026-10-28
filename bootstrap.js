(async () => {
  const status = document.getElementById('status');
  const scope = new URL('./', document.baseURI);
  const marker = 'ion-fury-isolation-reload:' + scope.pathname;
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  window.furyProduction = true;
  window.furyDevelopment = debug;
  try {
    if (!isSecureContext || !navigator.serviceWorker) throw new Error('This game needs HTTPS and browser Service Worker support.');
    status.textContent = 'Initializing browser runtime…';
    await navigator.serviceWorker.register(new URL('isolation-worker.js', scope), { scope: scope.pathname, updateViaCache: 'none' });
    if (!crossOriginIsolated) {
      if (sessionStorage.getItem(marker)) throw new Error('This browser could not enable the security features required by the game.');
      await Promise.race([navigator.serviceWorker.ready, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Browser initialization timed out. Reload to retry.')), 15000))]);
      sessionStorage.setItem(marker, '1');
      location.reload(); return;
    }
    sessionStorage.removeItem(marker);
    const load = (name, type) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      if (type) script.type = type;
      script.src = new URL(name, scope);
      script.onload = resolve; script.onerror = () => reject(new Error('Unable to load game runtime: ' + name));
      document.body.append(script);
    });
    for (const name of ['performance.js', 'app.js', 'capabilities.js', 'controller-state.js', 'performance-report.js', 'content-host.js']) await load(name);
    await load('mobile.js', 'module');
    await load('audio-ring.js');
    await load('worker-host.js');
  } catch (error) {
    document.getElementById('loading').hidden = false;
    status.textContent = error.message;
    console.error('[ion-fury-startup]', error);
  }
})();
