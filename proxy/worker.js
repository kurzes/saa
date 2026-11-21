/**
 * Sää – kevyt välityspalvelin (Cloudflare Worker)
 *
 * Miksi: yr.no:n rajapinta (api.met.no) vaatii jokaiseen pyyntöön yksilöllisen
 * User-Agent-otsakkeen. Selain ei anna asettaa sitä, joten worker lisää sen,
 * hoitaa CORS-otsakkeet ja välimuistittaa vastaukset MET:n Expires-otsakkeen mukaan.
 *
 * Reitit:
 *   /met/...   -> https://api.met.no/...
 *   /swpc/...  -> https://services.swpc.noaa.gov/...
 *
 * Käyttöönotto:
 *   1. npm create cloudflare@latest saa-proxy  (valitse "Hello World" Worker)
 *   2. Korvaa src/index.js tällä tiedostolla
 *   3. Aseta yhteystieto:  npx wrangler secret put CONTACT   (esim. "Saa-sovellus/1.0 sinun@sahkoposti.fi")
 *   4. npx wrangler deploy
 *   5. Liitä saatu osoite sovelluksen Asetukset → Datayhteys -kenttään
 */
const UPSTREAM = {
  met: 'https://api.met.no',
  swpc: 'https://services.swpc.noaa.gov',
};
// Rajaa sallitut polut, ettei workeria voi käyttää yleisenä välityspalvelimena.
const ALLOWED = [
  /^\/met\/weatherapi\/(locationforecast\/2\.0\/(complete|compact)|nowcast\/2\.0\/complete|sunrise\/3\.0\/(sun|moon))$/,
  /^\/swpc\/(products\/noaa-planetary-k-index(-forecast)?\.json|json\/ovation_aurora_latest\.json|json\/planetary_k_index_1m\.json)$/,
];
// Pidä tyhjänä salliaksesi kaikki originit, tai rajaa omaan sivustoon: ['https://saa.example.fi']
const ALLOWED_ORIGINS = [];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]) : '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!ALLOWED.some(r => r.test(url.pathname))) return new Response('Not found', { status: 404, headers: cors });

    const [, service, ...rest] = url.pathname.split('/');
    const params = new URLSearchParams(url.search);
    // MET:n ehtojen mukaan koordinaatit enintään 4 desimaalilla (parantaa myös välimuistiosumia)
    for (const k of ['lat', 'lon']) if (params.has(k)) params.set(k, (+params.get(k)).toFixed(4));
    const target = `${UPSTREAM[service]}/${rest.join('/')}${params.toString() ? '?' + params : ''}`;

    const cache = caches.default;
    const key = new Request(target, { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(target, {
        headers: {
          'User-Agent': env.CONTACT || 'Saa-sovellus/1.0 (aseta CONTACT-salaisuus)',
          'Accept': 'application/json',
        },
      });
      res = new Response(up.body, up);
      // Kunnioita MET:n Expires-otsaketta; SWPC:lle 5 min oletus
      if (!res.headers.get('Cache-Control')) {
        const exp = Date.parse(res.headers.get('Expires') || '');
        const ttl = exp ? Math.max(60, Math.round((exp - Date.now()) / 1000)) : 300;
        res.headers.set('Cache-Control', `public, max-age=${ttl}`);
      }
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
