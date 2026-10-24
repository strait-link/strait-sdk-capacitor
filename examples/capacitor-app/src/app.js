import { createStrait } from '@straitlink/capacitor';

// Set at build time from the environment (see build.mjs). The publishable key is safe in apps.
/* global STRAIT_PUBLISHABLE_KEY, STRAIT_ENDPOINT */
const strait = createStrait({ publishableKey: STRAIT_PUBLISHABLE_KEY, endpoint: STRAIT_ENDPOINT });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Your router goes here. The sample has two screens: Home and Product (/p/<id>). */
function navigate(path, params = {}) {
  const m = /^\/p\/([^/]+)$/.exec(path || '');
  $('screen').innerHTML = m
    ? `<h2>Product ${esc(m[1])}</h2><div class="muted">${Object.entries(params).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') || 'no options'}</div>`
    : `<h2>Home</h2><div class="muted">No screen for ${esc(path || '/')}</div>`;
}

function show(e) {
  $('last').textContent = `kind=${e.kind} route=${e.route} state=${e.appState} matched=${e.matched}` +
    (e.path ? ` path=${e.path}` : '') + (e.reason ? ` reason=${e.reason}` : '') +
    (e.params ? ` params=${new URLSearchParams(e.params)}` : '');
}

strait.onLinkStart(() => { $('status').textContent = 'Opening link…'; });
strait.onLink((e) => {
  show(e);
  $('status').textContent = e.matched ? `Opened from a ${e.kind} link` : `Link not matched (${e.reason || 'no_match'})`;
  if (e.matched && e.path) navigate(e.path, e.params);
});

$('deferred').onclick = async () => show(await strait.checkDeferred());
$('event').onclick = async () => {
  const ok = await strait.trackEvent('purchase', { value: 49.99, currency: 'USD' });
  $('status').textContent = ok ? 'Purchase logged' : 'Purchase not logged (offline?)';
};

strait.start().then(async () => {
  if ($('status').textContent === 'Starting…') $('status').textContent = `Ready (${(await strait.deviceClass()) || 'web'})`;
});
