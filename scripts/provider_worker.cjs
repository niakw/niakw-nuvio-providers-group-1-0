#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/* Execute one untrusted Nuvio provider in a disposable child process.
 *
 * This worker runs only inside the read-only test job. Provider console output is
 * suppressed so temporary endpoint URLs are not copied into public Action logs.
 * A small browser/React-Native compatibility surface is installed because some
 * providers return [] under plain Node even though they work in Nuvio/Hermes.
 */

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');
const { guardedFetch } = require('./network_guard.cjs');
const Module = require('node:module');

const networkObservations = [];
let activeInvocation = null;
let activeSettingsProfile = null;

function sanitizeDiagnosticText(value, limit = 1000) {
  return String(value || '')
    .replace(/(?:https?|magnet|acestream|torrent):[^\s"']+/gi, '[endpoint]')
    .replace(/[\r\t]+/g, ' ')
    .slice(0, limit);
}

function structuredError(error, phase = 'provider_runtime') {
  const value = error && typeof error === 'object' ? error : new Error(String(error));
  const stack = sanitizeDiagnosticText(value.stack || '', 2400)
    .split('\n')
    .slice(0, 10)
    .join('\n');
  return {
    name: sanitizeDiagnosticText(value.name || 'Error', 120),
    code: sanitizeDiagnosticText(value.code || value.cause?.code || '', 120) || null,
    message: sanitizeDiagnosticText(value.message || value, 1200),
    phase,
    invocation: activeInvocation,
    settings_profile: activeSettingsProfile,
    stack: stack || null,
  };
}
const BLOCKED_PROVIDER_MODULES = new Set([
  'child_process', 'cluster', 'worker_threads', 'inspector', 'repl', 'vm', 'module',
  'fs', 'fs/promises', 'http', 'https', 'http2', 'net', 'tls', 'dgram',
  'dns', 'dns/promises', 'process', 'wasi', 'sqlite', 'v8',
]);

function canonicalProviderModule(request) {
  const value = String(request || '').trim();
  return value.startsWith('node:') ? value.slice(5) : value;
}

function blockedProviderModule(request) {
  return BLOCKED_PROVIDER_MODULES.has(canonicalProviderModule(request));
}

/* NIAKVIO_PROVIDER_WORKER_PACKAGE_RESOLUTION_V1 */
function installModuleRestrictions() {
  const originalLoad = Module._load;
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageRequire = Module.createRequire(packageJsonPath);
  let allowedProviderPackages = new Set();
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    allowedProviderPackages = new Set(Object.keys(packageJson.dependencies || {}));
  } catch {}
  const packageRoot = (request) => {
    const value = String(request || '').trim();
    if (!value || value.startsWith('.') || path.isAbsolute(value) || value.startsWith('node:')) return '';
    const parts = value.split('/').filter(Boolean);
    if (!parts.length) return '';
    return value.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  };
  const safeProviderPackageRequest = (request) => {
    const value = String(request || '').trim();
    // Both names resolve to the same pinned Cheerio package in this repository.
    // Force parser-only code so the sandbox never has to permit Undici/node:net.
    if (value === 'cheerio' || value === 'cheerio-without-node-native') return 'cheerio/slim';
    return value;
  };
  Module._load = function restrictedLoad(request, parent, isMain) {
    if (blockedProviderModule(request)) throw new Error(`provider module blocked: ${request}`);
    try {
      return originalLoad.call(this, request, parent, isMain);
    } catch (error) {
      const root = packageRoot(request);
      if (!root || !allowedProviderPackages.has(root) || error?.code !== 'MODULE_NOT_FOUND') throw error;
      // Providers are copied to a temp directory for isolation, so approved bare
      // packages cannot naturally reach the repository's pinned node_modules.
      // Resolve only an explicitly declared dependency from NiakVIO's package root.
      const resolved = packageRequire.resolve(safeProviderPackageRequest(request));
      return originalLoad.call(this, resolved, parent, isMain);
    }
  };

  if (typeof process.getBuiltinModule === 'function') {
    const originalGetBuiltinModule = process.getBuiltinModule.bind(process);
    const restrictedGetBuiltinModule = (request) => {
      if (blockedProviderModule(request)) throw new Error(`provider module blocked: ${request}`);
      return originalGetBuiltinModule(request);
    };
    try {
      Object.defineProperty(process, 'getBuiltinModule', {
        value: restrictedGetBuiltinModule,
        configurable: true,
        writable: false,
      });
    } catch {
      try { process.getBuiltinModule = restrictedGetBuiltinModule; } catch {}
    }
  }

  for (const legacyAccessor of ['binding', '_linkedBinding']) {
    if (typeof process[legacyAccessor] !== 'function') continue;
    try {
      Object.defineProperty(process, legacyAccessor, {
        value: () => { throw new Error(`provider process API blocked: ${legacyAccessor}`); },
        configurable: true,
        writable: false,
      });
    } catch {}
  }
}

function assertProviderSourcePolicy(sourceText) {
  const patterns = [
    /\b(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\b(?:from|import)\s+['"`]([^'"`]+)['"`]/g,
    /\bprocess\s*\.\s*getBuiltinModule\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of String(sourceText || '').matchAll(pattern)) {
      const request = match[1];
      if (blockedProviderModule(request)) {
        throw new Error(`provider module blocked by source policy: ${request}`);
      }
    }
  }
}

function wrapLimitedResponse(response, perResponseLimit, consumeBytes) {
  const checked = async (reader) => {
    const value = await reader();
    const bytes = Buffer.isBuffer(value) ? value.length
      : value instanceof ArrayBuffer ? value.byteLength
      : ArrayBuffer.isView(value) ? value.byteLength
      : Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
    if (bytes > perResponseLimit) throw new Error(`response body exceeds limit (${bytes} bytes)`);
    consumeBytes(bytes);
    return value;
  };
  return new Proxy(response, {
    get(target, prop, receiver) {
      if (prop === 'text') return () => checked(() => target.text());
      if (prop === 'json') return () => checked(async () => JSON.parse(await target.text()));
      if (prop === 'arrayBuffer') return () => checked(() => target.arrayBuffer());
      if (prop === 'blob') return () => checked(() => target.blob());
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function safeHost(value) {
  try { return new URL(typeof value === 'string' ? value : value.url).hostname.toLowerCase(); } catch { return null; }
}
function safeRequestMetadata(input, init = {}) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw);
    const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const parts = url.pathname.split('/').filter(Boolean);
    const normalized = parts.map((part) => {
      if (/^\d+$/.test(part)) return '{id}';
      if (/^[0-9a-f]{16,}$/i.test(part)) return '{token}';
      if (/^[A-Za-z0-9_-]{28,}$/.test(part)) return '{token}';
      if (/^s\d+e\d+$/i.test(part)) return '{episode}';
      if (/^\d{4}$/.test(part)) return '{year}';
      return part.length > 48 ? '{value}' : part;
    });
    let pathPattern = '/' + normalized.join('/');
    if (url.pathname.endsWith('/') && pathPattern !== '/') pathPattern += '/';
    if (url.search) {
      const keys = [...url.searchParams.keys()].slice(0, 12).sort();
      if (keys.length) pathPattern += `?${keys.map((key) => `${key}={value}`).join('&')}`;
    }
    return { host: url.hostname.toLowerCase(), method, path_pattern: pathPattern || '/' };
  } catch {
    return { host: safeHost(input), method: String(init?.method || 'GET').toUpperCase(), path_pattern: null };
  }
}


/* NUVIO_PROVIDER_WORKER_ROUTE_PROOF_V1 */
/* NUVIO_PROVIDER_WORKER_ROUTE_PROOF_REQUEST_CLONE_V2 */
const ROUTE_PROOF_SENSITIVE_KEY = /api[_-]?key|token|auth|authorization|signature|sig|secret|password|cookie|session|nonce/i;
const ROUTE_PROOF_SAFE_HEADER = new Set([
  'accept', 'accept-language', 'content-type', 'origin', 'referer', 'referrer',
  'user-agent', 'x-requested-with', 'x-client-version', 'x-app-version',
]);
const ROUTE_PROOF_ID_KEYS = new Set([
  'id', '_id', 'media_id', 'mediaid', 'post_id', 'postid', 'content_id', 'contentid',
  'movie_id', 'movieid', 'series_id', 'seriesid', 'show_id', 'showid', 'slug',
  // NUVIO_PROVIDER_WORKER_EXTERNAL_IDENTITY_HINT_V11
  'imdb', 'imdb_id', 'imdbid',
]);

function routeProofSanitizedUrl(input) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(String(raw || ''));
    for (const key of [...url.searchParams.keys()]) {
      if (ROUTE_PROOF_SENSITIVE_KEY.test(key)) url.searchParams.set(key, '<redacted>');
    }
    return url.toString().slice(0, 1600);
  } catch {
    return null;
  }
}

function routeProofHeaders(headers) {
  const out = {};
  try {
    headers?.forEach?.((value, key) => {
      const name = String(key || '').toLowerCase();
      if (!ROUTE_PROOF_SAFE_HEADER.has(name) || ROUTE_PROOF_SENSITIVE_KEY.test(name)) return;
      out[name] = String(value || '').slice(0, 500);
    });
  } catch {}
  return out;
}

function routeProofSafeScalar(key, value) {
  if (ROUTE_PROOF_SENSITIVE_KEY.test(String(key || ''))) return '<redacted>';
  if (!['string', 'number', 'boolean'].includes(typeof value)) return undefined;
  const text = String(value);
  return text.length <= 300 ? value : '{value}';
}

function routeProofBody(body) {
  if (body == null) return { body_kind: 'none', body_fields: [], body_values: {} };
  const out = { body_kind: typeof body, body_fields: [], body_values: {} };
  try {
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      out.body_kind = 'form';
      for (const [key, value] of [...body.entries()].slice(0, 40)) {
        out.body_fields.push(String(key));
        out.body_values[String(key)] = ROUTE_PROOF_SENSITIVE_KEY.test(String(key)) ? '<redacted>' : String(value).slice(0, 300);
      }
      return out;
    }
  } catch {}
  if (typeof body !== 'string') return out;
  const text = body.trim();
  if (!text) return { body_kind: 'empty', body_fields: [], body_values: {} };
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.body_kind = 'json';
      for (const [key, raw] of Object.entries(value).slice(0, 40)) {
        out.body_fields.push(String(key));
        const safe = routeProofSafeScalar(key, raw);
        if (safe !== undefined) out.body_values[String(key)] = safe;
      }
      return out;
    }
  } catch {}
  if (text.includes('=')) {
    try {
      const params = new URLSearchParams(text);
      out.body_kind = 'form';
      for (const [key, value] of [...params.entries()].slice(0, 40)) {
        out.body_fields.push(String(key));
        out.body_values[String(key)] = ROUTE_PROOF_SENSITIVE_KEY.test(String(key)) ? '<redacted>' : String(value).slice(0, 300);
      }
      return out;
    } catch {}
  }
  /* NUVIO_PROVIDER_WORKER_TEXT_BODY_PROOF_V9 */
  out.body_kind = 'text';
  // Raw text is evidence-only and is never copied directly into Provider DATA.
  // Keep it in-memory only when it is bounded, printable and clearly not a
  // credential/token-shaped value. Python must still abstract fixture identity
  // before a request spec can become reusable.
  const printable = !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const tokenLike = /(?:^|[^A-Za-z0-9])(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|[A-Fa-f0-9]{40,}|[A-Za-z0-9_-]{64,})(?:$|[^A-Za-z0-9])/i.test(text);
  const sensitiveLike = /(?:api[_-]?key|access[_-]?token|authorization|bearer|secret|password|cookie|session|signature|nonce)\s*[:=]/i.test(text);
  if (text.length <= 1024 && printable && !tokenLike && !sensitiveLike) {
    out.body_fields = ['$text'];
    out.body_values['$text'] = text;
  }
  return out;
}

async function routeProofRequestMetadata(input, init, headers) {
  let rawBody = init?.body;
  if (rawBody == null) {
    try {
      if (typeof Request !== 'undefined' && input instanceof Request) {
        rawBody = await input.clone().text();
      }
    } catch {}
  }
  const body = routeProofBody(rawBody);
  return {
    proof_url: routeProofSanitizedUrl(input),
    proof_headers: routeProofHeaders(headers),
    proof_body_kind: body.body_kind,
    proof_body_fields: [...new Set(body.body_fields)].slice(0, 40),
    proof_body_values: body.body_values,
  };
}

function routeProofCollectJsonHints(value, out, depth = 0) {
  if (depth > 5 || out.length >= 100 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) routeProofCollectJsonHints(item, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [rawKey, child] of Object.entries(value).slice(0, 80)) {
    const key = String(rawKey || '').toLowerCase();
    if (ROUTE_PROOF_ID_KEYS.has(key) && ['string', 'number'].includes(typeof child)) {
      const text = String(child).trim();
      if (text && text.length <= 160 && !ROUTE_PROOF_SENSITIVE_KEY.test(key)) out.push({ key, value: text });
    }
    if (child && typeof child === 'object') routeProofCollectJsonHints(child, out, depth + 1);
    if (out.length >= 100) return;
  }
}

async function routeProofResponseHints(response) {
  const out = [];
  try {
    const type = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    const declared = Number(response?.headers?.get?.('content-length') || 0);
    if (declared > 512 * 1024) return out;
    if (!/(json|html|text)/.test(type)) return out;
    const text = await response.clone().text();
    if (Buffer.byteLength(text) > 512 * 1024) return out;
    if (type.includes('json') || /^[\s]*[\[{]/.test(text)) {
      try {
        const parsed = JSON.parse(text);
        routeProofCollectJsonHints(parsed, out, 0);
      } catch {}
    }
    if (/(html|text)/.test(type)) {
      /* NUVIO_PROVIDER_RESPONSE_VALUE_CORRELATION_V20 */
      const re = /(?:data[-_])?(id|media[-_]id|post[-_]id|content[-_]id|movie[-_]id|series[-_]id|show[-_]id|slug)[\s"'=:\-]+([A-Za-z0-9._~-]{2,160})/gi;
      let match;
      while ((match = re.exec(text)) !== null && out.length < 100) {
        out.push({ key: String(match[1]).toLowerCase().replace(/-/g, '_'), value: String(match[2]) });
      }

      // Catalogue identities are frequently encoded only in href/src paths.
      // Record bounded safe values as hints; they acquire authority only if a
      // later provider request consumes the exact same value.
      const attrRe = /\b(?:href|src|data-src)\s*=\s*(["'])([^"']{1,900})\1/gi;
      let attrMatch, scanned = 0;
      while ((attrMatch = attrRe.exec(text)) !== null && scanned++ < 240 && out.length < 100) {
        let parsed;
        try { parsed = new URL(attrMatch[2], response?.url || 'https://invalid.local/'); }
        catch { continue; }
        for (const rawPart of parsed.pathname.split('/').filter(Boolean).slice(-4)) {
          let part = rawPart;
          try { part = decodeURIComponent(rawPart); } catch {}
          const withoutExt = part.replace(/\.html?$/i, '');
          const composite = withoutExt.match(/^(\d{2,})[-_.]([A-Za-z0-9._~-]{2,150})$/);
          if (composite) {
            out.push({ key: 'id', value: composite[1] });
            if (out.length < 100 && withoutExt.length <= 160) out.push({ key: 'slug', value: withoutExt });
          }
        }
        for (const [rawKey, rawValue] of [...parsed.searchParams.entries()].slice(0, 20)) {
          const key = String(rawKey || '').toLowerCase();
          const value = String(rawValue || '').trim();
          if (!key || ROUTE_PROOF_SENSITIVE_KEY.test(key) || value.length < 3 || value.length > 160) continue;
          if (!/^[A-Za-z0-9._~-]+$/.test(value)) continue;
          out.push({ key, value });
          if (out.length >= 100) break;
        }
      }
    }
  } catch {}
  const seen = new Set();
  return out.filter((row) => {
    const fp = `${row.key}:${row.value}`;
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  }).slice(0, 80);
}

function inferRequestStage(pathPattern) {
  const value = String(pathPattern || '').toLowerCase();
  if (!value || value === '/') return 'origin_probe';
  if (/search|recherche|query|ajax|api\/.*search/.test(value)) return 'search';
  if (/embed|player|watch|video|stream|iframe/.test(value)) return 'player';
  if (/season|saison|episode|{episode}/.test(value)) return 'episode';
  return 'content_lookup';
}

function isInfrastructureHost(host) {
  if (!host) return true;
  const exact = new Set([
    'api.themoviedb.org',
    'raw.githubusercontent.com',
    'api.github.com',
    'graphql.anilist.co',
    'api.jikan.moe',
    'api.tvmaze.com',
    'api.imdbapi.dev',
    'cdn.jsdelivr.net',
    'unpkg.com',
  ]);
  return exact.has(host)
    || host.endsWith('.githubusercontent.com')
    || host.endsWith('.themoviedb.org')
    || host.endsWith('.anilist.co');
}

function emit(payload) {
  process.stdout.write(`NUVIO_HEALTH_RESULT=${JSON.stringify(payload)}\n`);
}

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(
      Object.entries(seed || {}).map(([key, value]) => [String(key), String(value)]),
    );
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][Number(index)] ?? null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  } catch {
    try { globalThis[name] = value; } catch {}
  }
}


function syntheticTmdbResponse(input, fixture = {}) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw);
    if (url.hostname.toLowerCase() !== 'api.themoviedb.org') return null;
    const fixtureType = String(fixture.mediaType || fixture.type || 'movie').toLowerCase();
    const type = fixtureType === 'movie' ? 'movie' : 'tv';
    const fixtureAnime = fixtureType === 'anime'
      || String(fixture.category || '').toLowerCase() === 'anime'
      || fixture.animeMovie === true
      || fixture.anime_movie === true;
    const id = String(fixture.tmdbId || fixture.id || '');
    if (!id || !url.pathname.includes(`/${type}/${id}`)) return null;
    const title = String(fixture.title || fixture.label || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
    if (!title) return null;
    const year = Number(fixture.year) || null;
    let payload;
    if (url.pathname.endsWith('/alternative_titles')) {
      payload = type === 'tv'
        ? { id: Number(id), results: [{ iso_3166_1: 'FR', title, type: '' }] }
        : { id: Number(id), titles: [{ iso_3166_1: 'FR', title, type: '' }] };
    } else if (url.pathname.endsWith('/translations')) {
      payload = { id: Number(id), translations: [
        { iso_3166_1: 'FR', iso_639_1: 'fr', name: 'Français', english_name: 'French', data: type === 'tv' ? { name: title, overview: '', homepage: '', tagline: '' } : { title, overview: '', homepage: '', tagline: '' } },
        { iso_3166_1: 'US', iso_639_1: 'en', name: 'English', english_name: 'English', data: type === 'tv' ? { name: title, overview: '', homepage: '', tagline: '' } : { title, overview: '', homepage: '', tagline: '' } },
      ] };
    } else {
      payload = type === 'tv'
        ? {
            id: Number(id),
            name: title,
            original_name: title,
            first_air_date: year ? `${year}-01-01` : '',
            origin_country: fixtureAnime ? ['JP'] : ['US'],
            original_language: fixtureAnime ? 'ja' : 'en',
            genres: fixtureAnime ? [{ id: 16, name: 'Animation' }] : [],
            keywords: fixtureAnime ? { results: [{ name: 'anime' }] } : { results: [] },
          }
        : {
            id: Number(id),
            title,
            original_title: title,
            release_date: year ? `${year}-01-01` : '',
            original_language: fixtureAnime ? 'ja' : 'en',
            genres: fixtureAnime ? [{ id: 16, name: 'Animation' }] : [],
            keywords: fixtureAnime ? { keywords: [{ name: 'anime' }] } : { keywords: [] },
          };
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-nuvio-fixture-fallback': '1' },
    });
  } catch {
    return null;
  }
}

function installPolyfills(context = {}) {
  if (!globalThis.crypto) defineGlobal('crypto', webcrypto);
  const tmdbApiKey = String(context.TMDB_API_KEY || context.tmdbApiKey || process.env.TMDB_API_KEY || '').trim();
  const tmdbAccessToken = String(context.TMDB_ACCESS_TOKEN || context.tmdbAccessToken || process.env.TMDB_ACCESS_TOKEN || '').trim();
  if (tmdbApiKey) defineGlobal('TMDB_API_KEY', tmdbApiKey);
  if (tmdbAccessToken) defineGlobal('TMDB_ACCESS_TOKEN', tmdbAccessToken);
  if (!globalThis.atob) defineGlobal('atob', (value) => Buffer.from(String(value), 'base64').toString('binary'));
  if (!globalThis.btoa) defineGlobal('btoa', (value) => Buffer.from(String(value), 'binary').toString('base64'));

  const locale = String(context.locale || 'en-US');
  const languages = Array.isArray(context.languages) && context.languages.length
    ? context.languages.map(String)
    : [locale, locale.split('-')[0]];
  const platform = String(context.platform || 'android');
  const userAgent = String(
    context.userAgent
      || `Mozilla/5.0 (Linux; Android 14; Nuvio) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36`,
  );

  defineGlobal('navigator', {
    userAgent,
    language: locale,
    languages,
    platform,
    product: 'ReactNative',
    onLine: true,
  });
  if (!globalThis.window) defineGlobal('window', globalThis);
  if (!globalThis.self) defineGlobal('self', globalThis);

  const storageSeed = context.storage && typeof context.storage === 'object'
    ? context.storage
    : {};
  if (!globalThis.localStorage) defineGlobal('localStorage', new MemoryStorage(storageSeed));
  if (!globalThis.sessionStorage) defineGlobal('sessionStorage', new MemoryStorage(storageSeed));

  if (!globalThis.location) {
    defineGlobal('location', {
      href: 'https://app.nuvio.local/',
      origin: 'https://app.nuvio.local',
      protocol: 'https:',
      hostname: 'app.nuvio.local',
      pathname: '/',
      search: '',
      hash: '',
    });
  }
  if (!globalThis.document) {
    defineGlobal('document', {
      cookie: '',
      location: globalThis.location,
      createElement: () => ({
        style: {},
        setAttribute() {},
        getAttribute() { return null; },
      }),
      querySelector() { return null; },
      querySelectorAll() { return []; },
    });
  }

  defineGlobal('__NUVIO_PROVIDER_CONTEXT__', Object.freeze({ ...context }));
  defineGlobal('__NUVIO_PROVIDER_SETTINGS__', Object.freeze({ ...(context.settings || {}) }));
  defineGlobal('Platform', { OS: platform, select: (choices) => choices?.[platform] ?? choices?.default });

  if (typeof globalThis.fetch === 'function') {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const maxFetches = Math.max(1, Number(context.networkLimits?.maxFetches || 30));
    const maxResponseBytes = Math.max(65536, Number(context.networkLimits?.maxResponseBytes || 5 * 1024 * 1024));
    let fetchCount = 0;
    let totalResponseBytes = 0;
    const maxTotalResponseBytes = Math.max(maxResponseBytes, Number(context.networkLimits?.maxTotalResponseBytes || 20 * 1024 * 1024));
    const contactedHosts = new Set();
    const maxDistinctHosts = Math.max(1, Number(context.networkLimits?.maxDistinctHosts || 20));
    defineGlobal('fetch', async (input, init = {}) => {
      fetchCount += 1;
      if (fetchCount > maxFetches) throw new Error(`provider fetch limit exceeded (${maxFetches})`);
      const inherited = (typeof Request !== 'undefined' && input instanceof Request) ? input.headers : undefined;
      const headers = new Headers(init.headers || inherited || {});
      if (context.injectAcceptLanguage !== false && !headers.has('Accept-Language')) headers.set('Accept-Language', languages.join(','));
      if (!headers.has('User-Agent')) headers.set('User-Agent', userAgent);
      const requestMeta = safeRequestMetadata(input, init);
      const routeProofEnabled = context.routeProofTrace === true;
      const routeProofRequest = routeProofEnabled ? await routeProofRequestMetadata(input, init, headers) : {};
      const rawRequestUrl = (() => {
        try { return typeof input === 'string' ? input : input?.url || ''; } catch { return ''; }
      })();
      if (/\[object(?:%20|\s)+object\]|%5Bobject(?:%20|\s)+object%5D/i.test(String(rawRequestUrl))) {
        const invalid = new Error('invalid provider request: an object was serialized into the request URL');
        invalid.code = 'NUVIO_INVALID_REQUEST_ARGUMENT';
        networkObservations.push({
          stage: inferRequestStage(requestMeta.path_pattern),
          host: requestMeta.host,
          method: requestMeta.method,
          path_pattern: requestMeta.path_pattern,
          status: null,
          ok: false,
          duration_ms: 0,
          infrastructure: isInfrastructureHost(requestMeta.host),
          invocation: activeInvocation,
          settings_profile: activeSettingsProfile,
          error_code: invalid.code,
          error: invalid.message,
        });
        throw invalid;
      }
      const host = requestMeta.host;
      if (host) contactedHosts.add(host);
      if (contactedHosts.size > maxDistinctHosts) throw new Error(`provider distinct-host limit exceeded (${maxDistinctHosts})`);
      const requestStage = inferRequestStage(requestMeta.path_pattern);
      const started = Date.now();
      try {
        let response;
        let synthetic = false;
        try {
          response = await guardedFetch(nativeFetch, input, { ...init, headers }, { maxRedirects: context.networkLimits?.maxRedirects || 5 });
        } catch (networkError) {
          response = syntheticTmdbResponse(input, context.fixtureMetadata || {});
          if (!response) throw networkError;
          synthetic = true;
        }
        if (!response.ok) {
          const fallback = syntheticTmdbResponse(input, context.fixtureMetadata || {});
          if (fallback) { response = fallback; synthetic = true; }
        }
        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (declaredLength > maxResponseBytes) throw new Error(`response body exceeds limit (${declaredLength} bytes)`);
        const routeProofHints = routeProofEnabled ? await routeProofResponseHints(response) : [];
        networkObservations.push({
          stage: requestStage, host, method: requestMeta.method, path_pattern: requestMeta.path_pattern,
          status: response.status, ok: response.ok, duration_ms: Date.now() - started,
          infrastructure: isInfrastructureHost(host), synthetic_fixture_fallback: synthetic,
          invocation: activeInvocation, settings_profile: activeSettingsProfile, error_code: null,
          ...routeProofRequest,
          response_value_hints: routeProofHints,
          content_type: String(response.headers.get('content-type') || '').slice(0, 160) || null,
          route_proof_trace: routeProofEnabled,
        });
        return wrapLimitedResponse(response, maxResponseBytes, (bytes) => {
          totalResponseBytes += bytes;
          if (totalResponseBytes > maxTotalResponseBytes) throw new Error(`provider cumulative response limit exceeded (${maxTotalResponseBytes} bytes)`);
        });
      } catch (error) {
        networkObservations.push({
          stage: requestStage, host, method: requestMeta.method, path_pattern: requestMeta.path_pattern,
          status: null, ok: false, duration_ms: Date.now() - started, infrastructure: isInfrastructureHost(host),
          invocation: activeInvocation, settings_profile: activeSettingsProfile,
          error_code: error?.code ? String(error.code).slice(0, 120) : null,
          error: sanitizeDiagnosticText(error?.message || error, 300),
          ...routeProofRequest, response_value_hints: [], route_proof_trace: routeProofEnabled,
        });
        throw error;
      }
    });
  }
}


function suppressProviderLogs() {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;
}

async function loadProvider(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  assertProviderSourcePolicy(sourceText);
  installModuleRestrictions();
  try {
    return require(filePath);
  } catch (requireError) {
    try {
      return await import(pathToFileURL(filePath).href + `?health=${Date.now()}`);
    } catch (importError) {
      const error = new Error(`require failed: ${requireError.message}; import failed: ${importError.message}`);
      error.cause = importError;
      throw error;
    }
  }
}

function findGetStreams(moduleValue) {
  const candidates = [moduleValue, moduleValue && moduleValue.default, moduleValue && moduleValue.module];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.getStreams === 'function') return candidate.getStreams;
    if (typeof candidate === 'function') return candidate;
  }
  return null;
}

function p2pReason(stream) {
  if (!stream || typeof stream !== 'object') return null;
  const url = typeof stream.url === 'string' ? stream.url.trim().toLowerCase() : '';
  if (/^(magnet|torrent|acestream|sop):/.test(url)) return 'disallowed P2P protocol';

  const disallowedKeys = /^(infohash|info_hash|magnet|torrent|torrenturl|p2p|peer|peers)$/i;
  for (const [key, value] of Object.entries(stream)) {
    if (disallowedKeys.test(key) && value != null && String(value).trim()) {
      return `disallowed P2P field: ${key}`;
    }
  }
  const hints = stream.behaviorHints;
  if (hints && typeof hints === 'object') {
    const text = JSON.stringify(hints).toLowerCase();
    if (/infohash|magnet|torrent|p2p|peer/.test(text)) return 'disallowed P2P behavior hint';
  }
  return null;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => typeof key === 'string' && value != null)
      .slice(0, 30)
      .map(([key, value]) => [key, String(value).slice(0, 2000)]),
  );
}


// NUVIO_NON_MEDIA_ASSET_GUARD_V1
// A technically valid media payload is not sufficient when it is a social,
// store or decorative asset unrelated to the requested title.
function isNonMediaAssetHost(host) {
  const value = String(host || '').toLowerCase();
  const exact = new Set([
    'play-games.googleusercontent.com',
    'play-lh.googleusercontent.com',
    'video.twimg.com',
    'pbs.twimg.com',
  ]);
  return exact.has(value)
    || value.endsWith('.twimg.com')
    || (value.endsWith('.googleusercontent.com') && /^(play-games|play-lh)\./.test(value));
}

function sanitizeStream(stream) {
  if (!stream || typeof stream !== 'object') return { stream: null, disallowed: null };
  const disallowed = p2pReason(stream);
  if (disallowed) return { stream: null, disallowed };

  const url = typeof stream.url === 'string' ? stream.url.trim() : '';
  if (!url) return { stream: null, disallowed: null };
  let streamHost = '';
  try { streamHost = new URL(url).hostname.toLowerCase(); } catch { return { stream: null, disallowed: 'invalid_stream_url' }; }
  if (isNonMediaAssetHost(streamHost)) return { stream: null, disallowed: 'non_media_asset_host' };
  return {
    disallowed: null,
    stream: {
      name: typeof stream.name === 'string' ? stream.name.slice(0, 200) : null,
      title: typeof stream.title === 'string' ? stream.title.slice(0, 500) : null,
      url,
      quality: stream.quality == null ? null : String(stream.quality).slice(0, 100),
      size: stream.size == null ? null : String(stream.size).slice(0, 100),
      language: stream.language == null ? null : String(stream.language).slice(0, 100),
      headers: sanitizeHeaders(stream.headers),
      subtitles: Array.isArray(stream.subtitles)
        ? stream.subtitles.slice(0, 30).map((subtitle) => ({
            language: subtitle && (subtitle.language || subtitle.lang || subtitle.label || subtitle.name),
            url: subtitle && (subtitle.url || subtitle.file),
            headers: sanitizeHeaders(subtitle && subtitle.headers),
          }))
        : [],
      audioTracks: Array.isArray(stream.audioTracks)
        ? stream.audioTracks.slice(0, 30).map((track) => ({
            language: track && (track.language || track.lang || track.label || track.name),
          }))
        : [],
    },
  };
}


function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
}

function settingsProfiles(moduleValue, sourceText, context) {
  const profiles = [{ name: 'empty', settings: {} }];
  const defaults = {};
  const alternatives = [];
  const seen = new Set();

  function visit(value, depth = 0) {
    if (!value || depth > 5 || seen.has(value)) return;
    if (typeof value === 'object' || typeof value === 'function') seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object' && typeof value !== 'function') return;
    const key = value.key || value.id || value.name || value.settingKey;
    const def = value.defaultValue ?? value.default ?? value.value;
    if (typeof key === 'string' && scalar(def) !== undefined) defaults[key] = def;
    const options = value.options || value.values || value.choices;
    if (typeof key === 'string' && Array.isArray(options)) {
      const vals = options.map((x) => scalar(x?.value ?? x?.id ?? x)).filter((x) => x !== undefined).slice(0, 6);
      if (vals.length) alternatives.push([key, vals]);
    }
    for (const prop of ['settings','settingsSchema','schema','config','configuration','preferences','fields','items','defaultSettings']) {
      if (value[prop]) visit(value[prop], depth + 1);
    }
    if (depth < 2) {
      for (const [k,v] of Object.entries(value).slice(0, 100)) {
        if (/setting|config|schema|preference/i.test(k)) visit(v, depth + 1);
      }
    }
  }
  visit(moduleValue);
  visit(moduleValue?.default);

  // Conservative fallback for minified providers: extract literal key/default pairs.
  const pairRe = /(?:key|id|name|settingKey)\s*:\s*['\"]([^'\"]{1,80})['\"][\s\S]{0,240}?(?:defaultValue|default|value)\s*:\s*(true|false|-?\d+(?:\.\d+)?|['\"][^'\"]{0,160}['\"])/g;
  let match;
  while ((match = pairRe.exec(sourceText))) {
    let val = match[2];
    if (/^['\"]/.test(val)) val = val.slice(1,-1);
    else if (val === 'true' || val === 'false') val = val === 'true';
    else val = Number(val);
    defaults[match[1]] ??= val;
  }

  const contextual = context.settings && typeof context.settings === 'object' ? context.settings : {};
  const base = { ...defaults, ...contextual };
  if (Object.keys(base).length) profiles.push({ name: 'defaults', settings: base });

  // Fixture metadata is passed through the invocation object/context, never
  // invented as provider settings. Injecting title/year as arbitrary settings
  // caused false branches and malformed requests in several bundles.

  for (const [key, vals] of alternatives.slice(0, 12)) {
    for (const val of vals.slice(0, 4)) profiles.push({ name: `option:${key}=${String(val)}`, settings: { ...base, [key]: val } });
  }
  const unique = [];
  const fingerprints = new Set();
  for (const profile of profiles.slice(0, 30)) {
    const fp = JSON.stringify(profile.settings, Object.keys(profile.settings).sort());
    if (!fingerprints.has(fp)) { fingerprints.add(fp); unique.push(profile); }
  }
  return unique;
}

function installSettingsAccessors(settings) {
  defineGlobal('__NUVIO_PROVIDER_SETTINGS__', Object.freeze({ ...settings }));
  defineGlobal('getProviderSettings', async () => ({ ...settings }));
  defineGlobal('getSettings', async () => ({ ...settings }));
  defineGlobal('providerSettings', { ...settings });
  defineGlobal('AsyncStorage', {
    async getItem(key) { const v = settings[key]; return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)); },
    async setItem() {}, async removeItem() {}, async clear() {},
    async multiGet(keys) { return keys.map((k) => [k, settings[k] == null ? null : JSON.stringify(settings[k])]); },
  });
  for (const [key, value] of Object.entries(settings)) {
    try { globalThis.localStorage?.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {}
  }
}

function providerObservationCount() {
  return networkObservations.filter((item) => !item.infrastructure).length;
}

function inferInvocationMode(getStreams) {
  let source = '';
  try { source = Function.prototype.toString.call(getStreams); } catch {}
  const compact = source.replace(/\s+/g, ' ');
  if (/^(?:async\s*)?(?:function\s*[^()]*)?\(\s*\{/.test(compact)
      || /^(?:async\s*)?\(?\s*\{[^}]*\}\s*\)?\s*=>/.test(compact)) return 'object';
  const first = compact.match(/^[^(]*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1]
    || compact.match(/^\s*(?:async\s*)?([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/)?.[1];
  if (first && new RegExp(`\\b${first}\\s*\\.\\s*(?:tmdbId|id|mediaType|type|season|episode|title)\\b`).test(compact)) {
    return 'object';
  }
  if (first) {
    const dense = compact.replace(/\s+/g, '');
    if (dense.includes(`typeof${first}==='object'`)
        || dense.includes(`typeof${first}=="object"`)
        || dense.includes(`typeof${first}=='object'`)
        || dense.includes(`typeof${first}=="object"`)
        || dense.includes(`'object'===typeof${first}`)
        || dense.includes(`"object"===typeof${first}`)) return 'object';
  }
  if (Number(getStreams.length || 0) >= 2) return 'positional';
  return 'positional';
}

function providerObservationsSince(index) {
  return networkObservations.slice(index).filter((item) => !item.infrastructure);
}

async function invokeProvider(getStreams, fixture, settings, profileName) {
  installSettingsAccessors(settings);
  const positional = [String(fixture.tmdbId), fixture.mediaType, fixture.season ?? null, fixture.episode ?? null];
  const objectArgument = {
    ...fixture,
    id: String(fixture.tmdbId),
    tmdbId: String(fixture.tmdbId),
    mediaType: fixture.mediaType,
    type: fixture.mediaType,
    category: fixture.category || fixture.mediaType,
    season: fixture.season ?? null,
    episode: fixture.episode ?? null,
    settings,
  };
  const mode = inferInvocationMode(getStreams);
  const attempts = mode === 'object'
    ? [
        { name: 'object', run: () => getStreams(objectArgument) },
        { name: 'positional_with_settings', run: () => getStreams(...positional, settings) },
      ]
    : [
        { name: 'positional_with_settings', run: () => getStreams(...positional, settings) },
        { name: 'object', run: () => getStreams(objectArgument) },
      ];
  const diagnostics = [];
  let lastEmpty = [];
  let arrayResultSeen = false;
  const errors = [];

  for (const attempt of attempts) {
    const observationStart = networkObservations.length;
    activeInvocation = attempt.name;
    activeSettingsProfile = profileName;
    try {
      const value = await attempt.run();
      const providerRows = providerObservationsSince(observationStart);
      const isArray = Array.isArray(value);
      diagnostics.push({
        name: attempt.name,
        inferred_mode: mode,
        result: isArray ? (value.length ? 'streams' : 'empty') : 'non_array',
        stream_count: isArray ? value.length : 0,
        provider_observations: providerRows.length,
        error: null,
      });
      if (isArray) {
        // An array, including an empty one, is a valid provider contract result.
        // Trying a second incompatible signature after that result created
        // duplicate side effects and /[object Object]/ requests in the deep log.
        arrayResultSeen = true;
        return { value, diagnostics, arrayResultSeen };
      }
      // A provider-owned request proves the invocation convention reached the
      // provider. Do not then try an incompatible signature and pollute the log
      // with duplicate side effects.
      if (providerRows.length > 0) break;
    } catch (error) {
      const detail = structuredError(error, 'provider_invocation');
      const providerRows = providerObservationsSince(observationStart);
      diagnostics.push({
        name: attempt.name,
        inferred_mode: mode,
        result: 'error',
        stream_count: 0,
        provider_observations: providerRows.length,
        error: detail,
      });
      errors.push(detail);
      // If the request reached a provider host, the signature was actionable;
      // trying another convention can only introduce unrelated failures.
      if (providerRows.length > 0 && detail.code !== 'NUVIO_INVALID_REQUEST_ARGUMENT') break;
    } finally {
      activeInvocation = null;
      activeSettingsProfile = null;
    }
  }

  if (!arrayResultSeen && errors.length) {
    const error = new Error(errors.map((item) => item.message).filter(Boolean).join(' | ') || 'all provider invocation attempts failed');
    error.name = 'ProviderInvocationError';
    error.code = errors.some((item) => item.code === 'NUVIO_INVALID_REQUEST_ARGUMENT')
      ? 'NUVIO_INVALID_REQUEST_ARGUMENT'
      : 'NUVIO_PROVIDER_INVOCATION_FAILED';
    error.nuvioDetails = { invocation_diagnostics: diagnostics, errors };
    throw error;
  }
  return { value: lastEmpty, diagnostics, arrayResultSeen };
}

async function main() {
  const [, , providerArg, fixtureArg, contextArg] = process.argv;
  if (!providerArg || !fixtureArg) throw new Error('provider path and fixture JSON are required');

  const context = contextArg ? JSON.parse(contextArg) : {};
  installPolyfills(context);
  suppressProviderLogs();

  const providerPath = path.resolve(providerArg);
  const fixture = JSON.parse(fixtureArg);
  const inputType = String(fixture.mediaType || fixture.type || fixture.category || 'movie').trim().toLowerCase();
  const category = String(fixture.category || '').trim().toLowerCase();
  const canonicalType = category === 'anime' || inputType === 'anime'
    ? 'anime'
    : (inputType === 'movie' ? 'movie' : 'tv');
  fixture.nuvioInputMediaType = inputType;
  fixture.mediaType = canonicalType;
  fixture.type = canonicalType;
  if (canonicalType === 'anime') fixture.category = 'anime';
  const fixtureMetadata = context.fixtureMetadata && typeof context.fixtureMetadata === 'object'
    ? { ...context.fixtureMetadata }
    : {};
  const tmdbNamespace = canonicalType === 'movie' ? 'movie' : 'tv';
  if (Object.keys(fixtureMetadata).length) {
    fixtureMetadata.__nuvioTmdbNamespace = fixtureMetadata.__nuvioTmdbNamespace || tmdbNamespace;
    fixtureMetadata.__nuvioTmdbId = fixtureMetadata.__nuvioTmdbId || String(fixture.tmdbId || '');
    fixtureMetadata.canonicalMediaType = fixtureMetadata.canonicalMediaType || canonicalType;
    fixture.tmdbMetadata = fixtureMetadata;
    fixture.tmdbNamespace = tmdbNamespace;
    globalThis.__nuvioMediaContext = {
      tmdbId: String(fixture.tmdbId || ''),
      tmdbNamespace,
      tmdbIdentity: tmdbNamespace + ':' + String(fixture.tmdbId || ''),
      tmdbMetadata: fixtureMetadata,
      canonicalMediaType: canonicalType,
      nuvioInputMediaType: inputType,
      tmdbResolutionDegraded: false,
    };
  }
  const startedAt = Date.now();
  const loaded = await loadProvider(providerPath);
  const getStreams = findGetStreams(loaded);
  if (!getStreams) throw new Error('module does not export getStreams');

  const sourceText = fs.readFileSync(providerPath, 'utf8');
  const profileLimit = Math.max(1, Math.min(12, Number(context.maxSettingsProfiles || 6)));
  const profiles = settingsProfiles(loaded, sourceText, context).slice(0, profileLimit);
  let value = [];
  let selectedProfile = profiles[0] || { name: 'empty', settings: {} };
  const profileResults = [];
  let successfulProfileInvocations = 0;
  const profileErrors = [];
  for (const profile of profiles) {
    try {
      const invocation = await invokeProvider(getStreams, fixture, profile.settings, profile.name);
      const candidateValue = invocation.value;
      if (invocation.arrayResultSeen) successfulProfileInvocations += 1;
      profileResults.push({
        name: profile.name,
        setting_keys: Object.keys(profile.settings),
        stream_count: Array.isArray(candidateValue) ? candidateValue.length : 0,
        invocation_diagnostics: invocation.diagnostics,
        error: null,
      });
      if (Array.isArray(candidateValue) && candidateValue.length > value.length) { value = candidateValue; selectedProfile = profile; }
      if (value.length > 0) break;
      if (context.singleProfileZeroStreamPreflight === true && invocation.arrayResultSeen) break;
    } catch (error) {
      const detail = structuredError(error, 'settings_profile');
      const invocationDiagnostics = error?.nuvioDetails?.invocation_diagnostics || [];
      profileResults.push({ name: profile.name, setting_keys: Object.keys(profile.settings), stream_count: 0, invocation_diagnostics: invocationDiagnostics, error: detail });
      profileErrors.push(detail);
    }
  }
  if (successfulProfileInvocations === 0 && profileErrors.length) {
    const error = new Error(profileErrors.map((item) => item.message).filter(Boolean).join(' | ') || 'all settings profiles failed');
    error.name = 'ProviderRuntimeError';
    error.code = profileErrors.some((item) => item.code === 'NUVIO_INVALID_REQUEST_ARGUMENT')
      ? 'NUVIO_INVALID_REQUEST_ARGUMENT'
      : 'NUVIO_ALL_SETTINGS_PROFILES_FAILED';
    error.nuvioDetails = { settings_diagnostics: profileResults, errors: profileErrors };
    throw error;
  }

  const streams = [];
  const disallowedReasons = [];
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 120)) {
      const sanitized = sanitizeStream(item);
      if (sanitized.disallowed) disallowedReasons.push(sanitized.disallowed);
      if (sanitized.stream) streams.push(sanitized.stream);
      if (streams.length >= 100) break;
    }
  }

  emit({
    ok: true,
    duration_ms: Date.now() - startedAt,
    raw_stream_count: Array.isArray(value) ? value.length : 0,
    stream_count: streams.length,
    disallowed_stream_count: disallowedReasons.length,
    disallowed_reasons: [...new Set(disallowedReasons)].slice(0, 10),
    environment_context: {
      locale: context.locale || 'en-US',
      platform: context.platform || 'android',
      browser_shims: true,
      settings_profiles_tested: profileResults.length,
      selected_settings_profile: selectedProfile.name,
      selected_setting_keys: Object.keys(selectedProfile.settings),
    },
    settings_diagnostics: profileResults,
    invocation_diagnostics: profileResults.flatMap((item) => item.invocation_diagnostics || []),
    runtime_errors: profileErrors,
    network_observations: networkObservations.slice(0, 80),
    network_limits: context.networkLimits || null,
    // A server is accessible when it answered at the HTTP layer, even with a
    // non-2xx status. 401/403/404/429/5xx still prove DNS, TLS and the remote
    // service are reachable; only DNS/connection/timeout failures do not.
    provider_server_accessible: networkObservations.some((item) =>
      !item.infrastructure && Number.isInteger(item.status) && item.status >= 100 && item.status <= 599
    ),
    provider_server_successful_response: networkObservations.some((item) => !item.infrastructure && item.ok),
    provider_server_hosts: [...new Set(networkObservations.filter((item) => !item.infrastructure && item.host).map((item) => item.host))].sort(),
    provider_server_http_statuses: [...new Set(networkObservations.filter((item) => !item.infrastructure && Number.isInteger(item.status)).map((item) => item.status))].sort((a, b) => a - b),
    streams,
  });
}

async function runResponseWrapperSelfTest() {
  const original = new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
  const wrapped = wrapLimitedResponse(original, 1024, () => {});
  if (wrapped.status !== 200) throw new Error('wrapped Response status getter failed');
  if (wrapped.headers.get('content-type') !== 'text/plain') throw new Error('wrapped Response headers getter failed');
  if (await wrapped.text() !== 'ok') throw new Error('wrapped Response body reader failed');
  process.stdout.write('provider Response wrapper tests passed\n');
}

async function runFixtureFallbackSelfTest() {
  const fixture = { tmdbId: '577922', mediaType: 'movie', title: 'Tenet', year: 2020 };
  const details = syntheticTmdbResponse('https://api.themoviedb.org/3/movie/577922?api_key=test', fixture);
  const alternatives = syntheticTmdbResponse('https://api.themoviedb.org/3/movie/577922/alternative_titles?api_key=test', fixture);
  const translations = syntheticTmdbResponse('https://api.themoviedb.org/3/movie/577922/translations?api_key=test', fixture);
  if (!details || !alternatives || !translations) throw new Error('fixture fallback did not match TMDb routes');
  const detailsJson = await details.json();
  const alternativesJson = await alternatives.json();
  const translationsJson = await translations.json();
  if (detailsJson.title !== 'Tenet' || detailsJson.release_date !== '2020-01-01') throw new Error('invalid fixture details fallback');
  if (!Array.isArray(alternativesJson.titles) || alternativesJson.titles[0]?.title !== 'Tenet') throw new Error('invalid alternatives fallback');
  if (!Array.isArray(translationsJson.translations) || translationsJson.translations[0]?.data?.title !== 'Tenet') throw new Error('invalid translations fallback');
  if (syntheticTmdbResponse('https://example.com/3/movie/577922', fixture) !== null) throw new Error('fallback matched a non-TMDb host');

  const animeMovieFixture = {
    tmdbId: '635302',
    mediaType: 'movie',
    category: 'movie',
    animeMovie: true,
    title: 'Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train',
    year: 2020,
  };
  const animeMovie = syntheticTmdbResponse(
    'https://api.themoviedb.org/3/movie/635302?api_key=test',
    animeMovieFixture,
  );
  if (!animeMovie) throw new Error('anime movie fixture fallback did not match');
  const animeMovieJson = await animeMovie.json();
  if (
    animeMovieJson.original_language !== 'ja'
    || !Array.isArray(animeMovieJson.genres)
    || !animeMovieJson.genres.some((row) => Number(row?.id) === 16)
  ) throw new Error('anime movie fixture lost semantic TMDb identity');

  process.stdout.write('provider fixture fallback tests passed\n');
}

const entry = process.argv[2] === '--self-test-fixture-fallback'
  ? runFixtureFallbackSelfTest()
  : process.argv[2] === '--self-test-response-wrapper'
    ? runResponseWrapperSelfTest()
    : main();

entry
  .catch((error) => {
    emit({
      ok: false,
      error: sanitizeDiagnosticText(error && error.message ? error.message : error, 2000),
      error_details: structuredError(error, 'worker_main'),
      settings_diagnostics: error?.nuvioDetails?.settings_diagnostics || [],
      invocation_diagnostics: error?.nuvioDetails?.invocation_diagnostics || [],
      stream_count: 0,
      disallowed_stream_count: 0,
      network_observations: networkObservations.slice(0, 80),
      provider_server_accessible: networkObservations.some((item) => !item.infrastructure && Number.isInteger(item.status)),
      provider_server_successful_response: networkObservations.some((item) => !item.infrastructure && item.ok),
      provider_server_hosts: [...new Set(networkObservations.filter((item) => !item.infrastructure && item.host).map((item) => item.host))].sort(),
      provider_server_http_statuses: [...new Set(networkObservations.filter((item) => !item.infrastructure && Number.isInteger(item.status)).map((item) => item.status))].sort((a, b) => a - b),
      streams: [],
    });
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 10).unref();
  });
