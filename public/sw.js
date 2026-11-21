/* Sää – service worker
   - Sovelluksen runko (HTML, manifesti, kuvakkeet) toimii ilman verkkoa.
   - Sivu haetaan aina ensin verkosta, joten julkaisut näkyvät heti.
   - Ennusteet ja revontulidata: verkko ensin, viimeisin tallennettu versio varalla.
   - Kirjastot ja fontit: välimuistista, päivitetään taustalla.
   - Karttatiiliä ja tutkakuvia ei tallenneta (liikaa dataa). */
const VERSION = 'saa-v1';
const SHELL = VERSION + '-shell', DATA = VERSION + '-data', LIBS = VERSION + '-libs';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg'];
const DATA_HOSTS = ['api.met.no', 'services.swpc.noaa.gov', 'geocoding-api.open-meteo.com'];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, stamp) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) {
      if (stamp) {
        const h = new Headers(res.headers); h.set('x-saa-saved', String(Date.now()));
        const body = await res.clone().blob();
        await cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers: h }));
      } else await cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (!hit) throw err;
    if (!stamp) return hit;
    const h = new Headers(hit.headers); h.set('x-saa-offline', '1');
    h.set('Access-Control-Expose-Headers', 'x-saa-offline, x-saa-saved');
    return new Response(await hit.blob(), { status: hit.status, headers: h });
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL).catch(() => caches.match('/')));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  // Lähiennustetta (nowcast) ei näytetä vanhana: se vanhenee minuuteissa.
  if (url.pathname.includes('/nowcast/')) return;
  if (DATA_HOSTS.includes(url.hostname) || /\/(met|swpc)\//.test(url.pathname)) {
    e.respondWith(networkFirst(req, DATA, true));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
});
