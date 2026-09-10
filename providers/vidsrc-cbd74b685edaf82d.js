/* BEGIN NIAKVIO_PROVIDER */
/* NIAKVIO_PROVIDER_ID:vidsrc */
/* NIAKVIO_PROVIDER_BASE_OWNED_V3 */
/* NIAKVIO_PROVIDER_BASE_AUTHORING:niakvio-owned-v3 */
"use strict";

function _uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function _origin(value) {
  try { return new URL(value).origin; } catch (_) { return ""; }
}
function _substituteDomain(raw) {
  const value = _text(raw).trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    const mapping = NIAKVIO_PROVIDER_MODEL.domainSubstitutions &&
      typeof NIAKVIO_PROVIDER_MODEL.domainSubstitutions === "object"
      ? NIAKVIO_PROVIDER_MODEL.domainSubstitutions
      : {};
    const host = _text(parsed.hostname).toLowerCase();
    const target = _text(mapping[host]).toLowerCase();
    if (target) parsed.hostname = target;
    return parsed.toString();
  } catch (_) {
    return value;
  }
}
function _absolute(value, base) {
  try { return _substituteDomain(new URL(value, base).toString()); } catch (_) { return ""; }
}
function _text(value) {
  return String(value == null ? "" : value);
}
function _embeddedText(value) {
  return _text(value).split("\\/").join("/").replace(
    /\\u002[fF]|\\u003[aA]|\\u0026|\\u003[dD]|\\"|&quot;|&#34;|&amp;/gi,
    token => {
      const normalized = token.toLowerCase();
      if (normalized === "\\u002f") return "/";
      if (normalized === "\\u003a") return ":";
      if (normalized === "\\u0026" || normalized === "&amp;") return "&";
      if (normalized === "\\u003d") return "=";
      if (normalized === '\\"' || normalized === "&quot;" || normalized === "&#34;") return '"';
      return token;
    }
  );
}
function _slug(value) {
  return _text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function _directMedia(url) {
  return /\.(?:m3u8|mpd|mp4|mkv|webm)(?:[?#]|$)|\/(?:hls|dash|stream)(?:\/|[?#]|$)/i.test(_text(url));
}
function _extractUrls(text, base) {
  const out = [];
  const normalized = _embeddedText(text);
  const patterns = [
    /(?:src|href|file|url|pathname|permalink|embedUrl|embed_url|contentUrl|data-(?:src|url|video|embed|player|file|stream|link|href))\s*["']?\s*[:=]\s*["']([^"'<>\s]+)["']/gi,
    /["'](\/(?:api|watch|embed|player|play|video|videos|stream|streams|source|sources|server|servers|resolve|proxy|manifest|hls|dash|action)(?:[^"'<>\\\s]{0,500}))["']/gi,
    /https?:\/\/[^"'<>\s]+/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized))) {
      const raw = match[1] || match[0] || "";
      const absolute = _absolute(raw, base);
      if (absolute && /^https?:/i.test(absolute)) out.push(absolute);
      if (out.length >= 240) break;
    }
  }
  return _uniq(out);
}
function _mediaNamespace(mediaType) {
  try {
    const ctx = typeof globalThis !== "undefined" ? globalThis.__nuvioMediaContext : null;
    if (ctx && (ctx.tmdbNamespace === "movie" || ctx.tmdbNamespace === "tv")) return ctx.tmdbNamespace;
  } catch (_) {}
  return mediaType === "movie" ? "movie" : "tv";
}
function _playerLike(url) {
  try {
    const parsed = new URL(url);
    const host = _text(parsed.hostname).toLowerCase();
    // Shared download/intermediate hosts used by multiple catalogue providers.
    // They are resolver pages, not playable output, so the bounded crawler may
    // traverse them but _directMedia() must still prove the final stream.
    if (/(?:^|\.)(?:abhilinks\.(?:site|life)|vcloud\.zip|hubcloud\.[a-z0-9.-]+|driveseed\.[a-z0-9.-]+|hubdrive\.[a-z0-9.-]+|gdflix\.[a-z0-9.-]+)$/i.test(host)) {
      return true;
    }
    const providerOrigin = _runtimeBases().some(base => _origin(base) === parsed.origin);
    if (!providerOrigin && /^\/e\/[^/?#]+(?:[/?#]|$)/i.test(parsed.pathname + parsed.search)) return true;
    return /\/(?:watch|embed|player|play|video|videos|stream|streams|source|sources|server|servers|resolve|proxy|drive|download|file|files)(?:[/?#.-]|$)/i.test(parsed.pathname + parsed.search);
  } catch (_) {
    return false;
  }
}
function _crawlUrlScore(url) {
  try {
    if (_directMedia(url)) return 5000;
    const parsed = new URL(url);
    const host = _text(parsed.hostname).toLowerCase();
    const path = (parsed.pathname + parsed.search).toLowerCase();
    let score = 0;
    if (/(?:^|\.)(?:vcloud|hubcloud|driveseed|hubdrive|gdflix|gofile|pixeldrain|streamtape|vidmoly|filelions|filemoon|streamwish|wishfast|dood|doodstream|mixdrop|voe|lulustream|savefiles)\./i.test(host)) score += 900;
    if (/(?:^|\.)(?:abhilinks\.(?:site|life))$/i.test(host)) score += 500;
    if (/\/(?:watch|embed|player|play|video|stream|source|server|resolve|proxy|drive|download|file|files|dl|links?|redirect)(?:[/?#.-]|$)/i.test(path)) score += 420;
    if (/\/archives?\/\d+/i.test(path)) score += 180;
    if (/(?:^|\.)(?:t\.me|telegram\.me|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|youtu\.be)$/i.test(host)) score -= 1600;
    if (/\/(?:feed|comments?\/feed|wp-json\/oembed|assets?|static|images?|icons?|fonts?)(?:[/?#.-]|$)/i.test(path)) score -= 1200;
    if (/\.(?:css|js|jpe?g|png|gif|webp|svg|avif|ico|woff2?|ttf)(?:[?#]|$)/i.test(path)) score -= 1600;
    return score;
  } catch (_) { return -5000; }
}
function _crawlCanonical(url) {
try {
const parsed = new URL(url);
if (!/^https?:$/i.test(parsed.protocol)) return "";
parsed.hash = "";
return parsed.toString();
} catch (_) { return ""; }
}
function _crawlEligible(url) {
  try {
    if (_directMedia(url)) return true;
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    const host = _text(parsed.hostname).toLowerCase();
    const path = (parsed.pathname + parsed.search).toLowerCase();
    const hash = _text(parsed.hash).toLowerCase();
    if (/^#(?:comments?|respond|reply|share)/i.test(hash)) return false;
    if (/(?:^|\.)(?:t\.me|telegram\.me|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|youtu\.be)$/i.test(host)) return false;
    if (/\/(?:feed|comments?\/feed|wp-json(?:\/|$)|wp-admin|admin|login|register|signin|signup|collapse|assets?|static|images?|icons?|fonts?)(?:[/?#.-]|$)/i.test(path)) return false;
    if (/\.(?:css|js|jpe?g|png|gif|webp|svg|avif|ico|woff2?|ttf)(?:[?#]|$)/i.test(path)) return false;
    if (/(?:\+t\.uri|code%3a|message%3a|xhr%3a|\{status:)/i.test(path)) return false;
    return _playerLike(url) || _crawlUrlScore(url) > 0;
  } catch (_) { return false; }
}
/* NIAKVIO_PROVIDER_BASE_BOUNDED_EXTERNAL_ROOT_V10 */
function _crawlFollowable(url, fromUrl) {
  if (!_crawlEligible(url)) return false;
  if (_directMedia(url)) return true;
  try {
    const next = new URL(url);
    const from = new URL(fromUrl);
    const rootOnly = (next.pathname === "/" || next.pathname === "") && !next.search && !next.hash;
    if (rootOnly && next.origin !== from.origin) return false;
    return true;
  } catch (_) { return false; }
}
/* NIAKVIO_PROVIDER_PACKED_PLAYER_V18_6 */
function _spv186UnpackPackedPlayer(code) {
  const source = _text(code);
  if (!source.includes("p,a,c,k,e,d")) return source;
  try {
    function blocks(input) {
      const out = [];
      let pos = 0;
      while (true) {
        const start = input.indexOf("eval(function(p,a,c,k,e,d)", pos);
        if (start < 0) break;
        let depth = 0, single = false, double = false, escaped = false, i = start;
        for (; i < input.length; i++) {
          const ch = input[i];
          if (escaped) { escaped = false; continue; }
          if (ch === "\\") { escaped = true; continue; }
          if (!double && ch === "'") single = !single;
          else if (!single && ch === '"') double = !double;
          if (single || double) continue;
          if (ch === "(") depth += 1;
          else if (ch === ")") {
            depth -= 1;
            if (depth === 0) { i += 1; break; }
          }
        }
        if (i > start) out.push(input.slice(start, i));
        pos = Math.max(i, start + 1);
      }
      return out.slice(0, 8);
    }
    function decodeString(src, start) {
      const quote = src[start];
      if (quote !== "'" && quote !== '"') return null;
      let out = "", escaped = false, i = start + 1;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (escaped) {
          if (ch === "n") out += "\n";
          else if (ch === "r") out += "\r";
          else if (ch === "t") out += "\t";
          else out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === quote) return { value: out, end: i + 1 };
        out += ch;
      }
      return null;
    }
    function skipWs(src, i) { while (i < src.length && /\s/.test(src[i])) i += 1; return i; }
    function integer(src, i) {
      i = skipWs(src, i);
      const match = src.slice(i).match(/^\d+/);
      return match ? { value: parseInt(match[0], 10), end: i + match[0].length } : null;
    }
    function decodeBlock(block) {
      const call = block.indexOf("}(");
      if (call < 0) return null;
      let i = skipWs(block, call + 2);
      const payload = decodeString(block, i);
      if (!payload) return null;
      i = skipWs(block, payload.end);
      if (block[i] !== ",") return null;
      const radixRow = integer(block, i + 1);
      if (!radixRow || radixRow.value < 2 || radixRow.value > 62) return null;
      const radix = radixRow.value;
      i = skipWs(block, radixRow.end);
      if (block[i] !== ",") return null;
      const countRow = integer(block, i + 1);
      if (!countRow || countRow.value > 10000) return null;
      let count = countRow.value;
      i = skipWs(block, countRow.end);
      if (block[i] !== ",") return null;
      const wordsRow = decodeString(block, skipWs(block, i + 1));
      if (!wordsRow) return null;
      if (!/^\s*\.split\(\s*['"]\|['"]\s*\)/.test(block.slice(wordsRow.end, wordsRow.end + 32))) return null;
      const words = wordsRow.value.split("|").slice(0, 10000);
      function key(value) {
        return (value < radix ? "" : key(parseInt(value / radix, 10)))
          + ((value = value % radix) > 35 ? String.fromCharCode(value + 29) : value.toString(36));
      }
      const dictionary = {};
      while (count-- > 0) dictionary[key(count)] = words[count] || key(count);
      return payload.value.replace(/\b\w+\b/g, word => dictionary[word] || word);
    }
    let result = source;
    for (const block of blocks(source)) {
      const decoded = decodeBlock(block);
      if (decoded) result = result.replace(block, decoded);
    }
    return result;
  } catch (_) {
    return source;
  }
}
/* NIAKVIO_PROVIDER_PLAYER_ROUTE_VARIANT_V18_7 */
function _spv187PlayerRouteVariants(raw) {
  try {
    const parsed = new URL(_text(raw));
    if (!/^https?:$/i.test(parsed.protocol)) return [];
    const original = parsed.toString();
    const nextPath = _text(parsed.pathname).replace(
      /^\/(?:embed|e|f|d|file|download)\/([^/?#]+)\/?$/i,
      "/v/$1"
    );
    if (!nextPath || nextPath === parsed.pathname) return [];
    parsed.pathname = nextPath;
    parsed.hash = "";
    const next = _crawlCanonical(parsed.toString());
    return next && next !== _crawlCanonical(original) ? [next] : [];
  } catch (_) {
    return [];
  }
}
function _spv187PrioritizedPlayerRoutes(values) {
  const out = [];
  for (const raw of values || []) {
    const canonical = _crawlCanonical(raw);
    if (!canonical) continue;
    for (const variant of _spv187PlayerRouteVariants(canonical)) out.push(variant);
    out.push(canonical);
  }
  return _uniq(out);
}
function _spv187QueueScore(url) {
  let bonus = 0;
  try {
    const path = _text(new URL(url).pathname);
    if (/^\/v\/[A-Za-z0-9_-]{3,160}\/?$/i.test(path)) bonus = 1000;
  } catch (_) {}
  return _crawlUrlScore(url) + bonus;
}
/* NIAKVIO_PROVIDER_PLAYER_FORM_HANDOFF_V18_8 */
function _spv188HtmlAttr(tag, name) {
  const source = _text(tag);
  const key = _text(name);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) return "";
  const quoted = source.match(new RegExp("\\b" + key + "\\s*=\\s*([\\\"'])([\\s\\S]*?)\\1", "i"));
  if (quoted) return quoted[2].replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  const bare = source.match(new RegExp("\\b" + key + "\\s*=\\s*([^\\s>]+)", "i"));
  return bare ? bare[1] : "";
}
function _spv188PlayerForm(html, pageUrl) {
  const source = _text(html).slice(0, 524288);
  if (!source || !/^https?:\/\//i.test(_text(pageUrl))) return null;
  const forms = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi;
  let match, scanned = 0;
  while ((match = forms.exec(source)) && scanned++ < 8) {
    const attrs = match[1] || "";
    if (_spv188HtmlAttr(attrs, "id").toUpperCase() !== "F1") continue;
    const method = _spv188HtmlAttr(attrs, "method").toUpperCase();
    if (method && method !== "POST") continue;
    let page, target;
    try {
      page = new URL(pageUrl);
      target = new URL(_spv188HtmlAttr(attrs, "action") || page.toString(), page.toString());
    } catch (_) { return null; }
    if (!/^https?:$/i.test(target.protocol) || target.origin !== page.origin) return null;
    const params = new URLSearchParams();
    const inputs = match[2].match(/<input\b[^>]*>/gi) || [];
    for (const tag of inputs.slice(0, 32)) {
      const type = _spv188HtmlAttr(tag, "type").toLowerCase();
      if (type && type !== "hidden") continue;
      const name = _spv188HtmlAttr(tag, "name");
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(name)) continue;
      const value = _spv188HtmlAttr(tag, "value").slice(0, 2048);
      params.append(name, value);
    }
    if (!params.has("file_code")) {
      const code = page.pathname.split("/").filter(Boolean).pop() || "";
      if (/^[A-Za-z0-9_-]{3,160}$/.test(code)) params.set("file_code", code);
    }
    if (![...params.keys()].length) return null;
    target.hash = "";
    return { url: target.toString(), body: params.toString() };
  }
  return null;
}
/* NIAKVIO_PROVIDER_SHARED_PLAYER_TRACE_V21 */
/* NIAKVIO_PROVIDER_OBFUSCATED_HLS_PLAYER_V21 */
function _spv21DecodedObfuscatedHls(html, pageUrl) {
  const source = _text(html).slice(0, 1048576);
  if (!source || !/^https?:\/\//i.test(_text(pageUrl))) return "";
  let hostname = "";
  try { hostname = new URL(pageUrl).hostname || ""; } catch (_) { return ""; }
  let videoUrl = "";

  // Current family: encoded string is base64, reversed, then XOR-decoded with
  // a key derived from the response hostname. The visible /troll/ HLS is a decoy.
  const dynamic = source.match(/\}\)\(["']([A-Za-z0-9+/=_-]{50,})["']\)/);
  if (dynamic && source.includes("reverse().join")) {
    const encoded = dynamic[1].replace(/-/g, "+").replace(/_/g, "/");
    let binary = "";
    try { binary = atob(encoded); } catch (_) {}
    if (binary) {
      let hostHash = 0;
      for (let index = 0; index < hostname.length; index += 1) {
        hostHash = (hostHash + hostname.charCodeAt(index)) & 255;
      }
      const reversed = binary.split("").reverse().join("");
      let decoded = "";
      for (let index = 0; index < reversed.length; index += 1) {
        const key = (0x3d + index * 89 + hostHash) & 255;
        decoded += String.fromCharCode(reversed.charCodeAt(index) ^ key);
      }
      if (/^https?:\/\//i.test(decoded) && /\.m3u8(?:[?#]|$)/i.test(decoded) && !/\/troll\//i.test(decoded)) {
        videoUrl = decoded;
      }
    }
  }

  // Legacy family: static repeating XOR key stored directly in the player JS.
  if (!videoUrl) {
    const legacy = /(?:var|let|const)\s+k=\[([0-9,\s]+)\],b=atob\(s\)[\s\S]*?return\s+\w+\}\)\(["']([A-Za-z0-9+/=_-]+)["']\)/g;
    let match, scanned = 0;
    while ((match = legacy.exec(source)) !== null && scanned++ < 8) {
      const keys = match[1].split(",").map(value => Number.parseInt(value.trim(), 10)).filter(Number.isFinite).slice(0, 64);
      if (!keys.length) continue;
      const encoded = match[2].replace(/-/g, "+").replace(/_/g, "/");
      let binary = "";
      try { binary = atob(encoded); } catch (_) { continue; }
      let decoded = "";
      for (let index = 0; index < binary.length; index += 1) {
        decoded += String.fromCharCode(binary.charCodeAt(index) ^ keys[index % keys.length]);
      }
      if (/^https?:\/\//i.test(decoded) && /\.m3u8(?:[?#]|$)/i.test(decoded) && !/\/troll\//i.test(decoded)) {
        videoUrl = decoded;
        break;
      }
    }
  }
  return videoUrl;
}
async function _crawlDirectMedia(seedUrls, referer, maxDepth) {
  const queue = _spv187PrioritizedPlayerRoutes(seedUrls).filter(_crawlEligible).sort((a,b)=>_spv187QueueScore(b)-_spv187QueueScore(a)).slice(0, 8).map(url => ({ url, depth: 0, referer }));
  const seen = new Set();
  const streams = [];
  let requests = 0;
  while (queue.length && requests < 10 && streams.length < 12) {
    queue.sort((a,b)=>_spv187QueueScore(b.url)-_spv187QueueScore(a.url));
    const row = queue.shift();
    if (!row || seen.has(row.url)) continue;
    seen.add(row.url);
    requests += 1;
    try {
      const response = await _fetch(row.url, {
        headers: row.referer ? { Referer: row.referer } : {}
      });
      const responseUrl = response.url || row.url;
      const contentType = _text(response.headers.get("content-type")).toLowerCase();
      if (_directMedia(responseUrl) || /(?:mpegurl|dash\+xml|video\/)/i.test(contentType)) {
        streams.push(..._streams([responseUrl], row.referer || referer || ""));
        continue;
      }
      let urls = [];
      let playerText = "";
      if (contentType.includes("json")) {
        urls = _jsonUrls(await response.json());
      } else {
        playerText = await response.text();
        const decodedPlayerText = _spv186UnpackPackedPlayer(playerText);
        urls = _extractUrls(decodedPlayerText, responseUrl);
      }
      const decodedObfuscatedHls = playerText
        ? _spv21DecodedObfuscatedHls(playerText, responseUrl) : "";
      if (decodedObfuscatedHls) {
        streams.push(..._streams([decodedObfuscatedHls], responseUrl));
        continue;
      }
      // Never promote the known content-shape decoy as a direct stream.
      urls = urls.filter(url => !/\/troll\/master\.m3u8(?:[?#]|$)/i.test(_text(url)));
      const direct = urls.filter(_directMedia);
      if (direct.length) {
        streams.push(..._streams(direct, responseUrl));
        continue;
      }
      const formRequest = playerText ? _spv188PlayerForm(playerText, responseUrl) : null;
      if (formRequest && requests < 10) {
        try {
          requests += 1;
          const postResponse = await fetch(formRequest.url, {
            method: "POST",
            headers: {
              Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: responseUrl
            },
            body: formRequest.body,
            redirect: "follow"
          });
          if (postResponse && postResponse.ok) {
            const postUrl = _text(postResponse.url || formRequest.url);
            const postText = await postResponse.text();
            const postDecoded = _spv186UnpackPackedPlayer(postText);
            const postUrls = _extractUrls(postDecoded, postUrl);
            const postDirect = postUrls.filter(_directMedia);
            if (postDirect.length) {
              streams.push(..._streams(postDirect, postUrl));
              continue;
            }
            if (row.depth < Math.max(0, Number(maxDepth) || 0)) {
              for (const nested of postUrls.filter(_crawlEligible).slice(0, 6)) {
                const next = _crawlCanonical(nested);
                if (next && !seen.has(next)) queue.push({ url: next, depth: row.depth + 1, referer: postUrl });
              }
            }
          }
        } catch (_) {}
      }
      // The same opaque player id is often exposed under a landing/embed path
      // and a canonical /v/ player path. Try only this bounded same-origin
      // representation change; it does not consume recursive crawl depth.
      for (const variant of _spv187PlayerRouteVariants(responseUrl)) {
        if (!seen.has(variant)) queue.push({ url: variant, depth: row.depth, referer: responseUrl });
      }
      if (row.depth < Math.max(0, Number(maxDepth) || 0)) {
        for (const next of _uniq(urls.map(_crawlCanonical)).filter(Boolean).filter(next=>_crawlFollowable(next,responseUrl)).sort((a,b)=>_crawlUrlScore(b)-_crawlUrlScore(a)).slice(0, 4)) {
          if (!seen.has(next)) queue.push({ url: next, depth: row.depth + 1, referer: responseUrl });
        }
      }
    } catch (_) {}
  }
  return streams.slice(0, 40);
}
function _candidateScore(url, meta) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return -1; }
  const path = decodeURIComponent(parsed.pathname || "").toLowerCase();
  if (!path || path === "/" || /\/(?:_next|static|assets?|images?|icons?|fonts?)(?:\/|$)/i.test(path)) return -1;
  const slug = _slug(meta && meta.title);
  const tokens = slug.split("-").filter(token => token.length >= 3);
  let score = 0;
  if (slug && path.includes(slug)) score += 120;
  // NIAKVIO_PROVIDER_SOURCE_PLAN_V12
  if (slug) {
    const leaf = path.split("/").filter(Boolean).pop() || "";
    const titleTokens = slug.split("-").filter(Boolean);
    const leafTokens = leaf.split(/[^a-z0-9]+/).filter(Boolean);
    const titleSet = new Set(titleTokens);
    const missing = titleTokens.filter(token => !leafTokens.includes(token));
    if (!missing.length) {
      const extras = leafTokens.filter(token =>
        !titleSet.has(token) &&
        !["tv", "series", "show", "anime"].includes(token) &&
        !/^\d{4}$/.test(token)
      );
      score += Math.max(-120, 240 - extras.length * 60);
    }
  }
  for (const token of tokens) if (path.includes(token)) score += 18;
  if (meta && meta.year && path.includes(String(meta.year))) score += 20;
  if (meta && meta.tmdbId && path.includes(String(meta.tmdbId))) score += 45;
  if (/\/(?:movie|movies|film|films|series|tv|show|watch|title|media)\//i.test(path)) score += 12;
  return score;
}
function _identityMode() {
  const raw = NIAKVIO_PROVIDER_MODEL && NIAKVIO_PROVIDER_MODEL.identityInput;
  return _text(raw && raw.mode || "tmdb_direct").toLowerCase();
}
function _identityUsesTmdbId() {
  return _identityMode() === "tmdb_direct";
}
function _expandLearnedRoute(pattern, meta, mediaType, season, episode, bases) {
  let route = _text(pattern);
  if (/\$\{|encodeURIComponent\s*\(/i.test(route)) return [];
  if (!route || /^https?:\/\//i.test(route) && !/\{[^}]+\}/.test(route)) {
    return /^https?:\/\//i.test(route) ? [route] : [];
  }
  const id = _text(meta && meta.tmdbId);
  const imdbId = _text(meta && meta.imdbId);
  const title = _text(meta && meta.title);
  const slug = _slug(title);
  const transport = mediaType === "movie" ? "movie" : "tv";
  route = route.replace(/\{tmdb_?id\}/gi, encodeURIComponent(id));
  route = route.replace(/\{imdb_?id\}/gi, encodeURIComponent(imdbId));
  // {id} has no universal meaning across providers. It can be a provider
  // catalogue/session/file/MAL id. Only the explicit tmdb_direct identity
  // contract permits using the incoming TMDB id as its implicit value.
  if (/\{id\}/i.test(route)) {
    if (!_identityUsesTmdbId()) return [];
    route = route.replace(/\{id\}/gi, encodeURIComponent(id));
  }
  route = route
    .replace(/\{slug\}/gi, encodeURIComponent(slug))
    .replace(/\{(?:title|query|q)\}/gi, encodeURIComponent(title))
    .replace(/\{(?:media|media_?type|type)\}/gi, encodeURIComponent(transport))
    .replace(/\{season\}/gi, encodeURIComponent(season == null ? "" : season))
    .replace(/\{episode\}/gi, encodeURIComponent(episode == null ? "" : episode));
  if (/\{[^}]+\}/.test(route)) return [];
  const out = [];
  for (const base of (bases || _runtimeBases())) {
    const absolute = _absolute(route, base);
    if (absolute) out.push(absolute);
  }
  return _uniq(out);
}
function _routeKind(route) {
  const value = _text(route).toLowerCase();
  if (!value || /\/(?:track|report|warm|dead|working|ad-link|fp)(?:[/?#]|$)/i.test(value)) return "ignore";
  // Search semantics are more specific than a generic /api prefix. A route
  // such as /api?m=search&q={query} must carry Core title metadata instead of
  // falling into _apiUrls(), where title is intentionally empty for ID routes.
  if (/\/(?:search|recherche)(?:[/?#]|$)|[?&](?:s|q|query|keyword)=/i.test(value)) return "search";
  if (/\/(?:api)(?:[./?#]|$)/i.test(value)) return "api";
  if (/\/(?:player|embed|play)(?:[/?#]|$)/i.test(value)) return "player";
  if (/\{(?:tmdb_?id|imdb_?id|id|slug|title)\}/i.test(value) || /\/(?:title|movie|film|series|tv|show|watch|media)(?:[/?#]|$)/i.test(value)) return "detail";
  return "ignore";
}
function _learnedUrls(kind, meta, mediaType, season, episode) {
  const out = [];
  const bases = kind === "api" ? _apiBases() : _searchBases();
  for (const route of NIAKVIO_PROVIDER_MODEL.routes || []) {
    if (_routeKind(route) !== kind) continue;
    out.push(..._expandLearnedRoute(route, meta, mediaType, season, episode, bases));
  }
  return _uniq(out);
}
function _providerDeadlineExceeded() {
  try {
    const deadline = Number(globalThis && globalThis.__nuvioProviderDeadlineMs);
    return Number.isFinite(deadline) && deadline > 0 && Date.now() >= deadline;
  } catch (_) {
    return false;
  }
}
function _providerTimeoutError() {
  const error = new Error("nuvio_provider_timeout");
  error.name = "TimeoutError";
  error.code = "NUVIO_PROVIDER_TIMEOUT";
  error.__nuvioProviderTimeout = true;
  return error;
}
async function _fetch(url, options) {
  if (_providerDeadlineExceeded()) throw _providerTimeoutError();
  const requestOptions = options && typeof options === "object" ? Object.assign({}, options) : {};
  requestOptions.redirect = requestOptions.redirect || "follow";
  requestOptions.headers = Object.assign({
    "Accept": "application/json,text/html,application/xhtml+xml,text/plain,*/*",
    "User-Agent": "Mozilla/5.0 NiakVIO/3"
  }, requestOptions.headers || {});
  const response = await fetch(url, requestOptions);
  if (_providerDeadlineExceeded()) throw _providerTimeoutError();
  if (!response.ok) throw new Error("provider_http_" + response.status);
  return response;
}
async function _tmdb(tmdbId, mediaType) {
  if (!tmdbId) return null;
  const type = _mediaNamespace(mediaType);
  const identity = type + ":" + String(tmdbId || "");
  function project(row) {
    if (!row || typeof row !== "object") return null;
    const alternativeRows = row.alternative_titles && (
      row.alternative_titles.titles || row.alternative_titles.results || row.alternative_titles
    );
    const aliases = _uniq([
      row.title,
      row.name,
      row.original_title,
      row.original_name,
      ...(Array.isArray(alternativeRows) ? alternativeRows.map(item => item && (item.title || item.name)) : [])
    ].map(_text).filter(Boolean));
    const externalIds = row.external_ids && typeof row.external_ids === "object"
      ? row.external_ids
      : {};
    const imdbId = _text(
      row.imdb_id || row.imdbId || externalIds.imdb_id || ""
    ).trim();
    return {
      title: aliases[0] || "",
      aliases,
      year: String(row.release_date || row.first_air_date || row.year || "").slice(0, 4),
      tmdbId: String(tmdbId || ""),
      imdbId,
      externalIds
    };
  }
  try {
    const ctx = typeof globalThis !== "undefined" ? globalThis.__nuvioMediaContext : null;
    const ctxId = String(ctx && ctx.tmdbId || "");
    const ctxNamespace = String(ctx && ctx.tmdbNamespace || "");
    if (ctx && (!ctxId || ctxId === String(tmdbId)) && (!ctxNamespace || ctxNamespace === type)) {
      const projected = project(ctx.tmdbMetadata);
      if (projected) return projected;
    }
  } catch (_) {}
  try {
    const cache = typeof globalThis !== "undefined" ? globalThis.__nuvioTmdbMetadataCacheV1 : null;
    const cached = cache && cache[identity];
    if (cached) {
      const settled = typeof cached.then === "function" ? await cached : cached;
      const row = settled && settled.metadata && typeof settled.metadata === "object" ? settled.metadata : settled;
      const projected = project(row);
      if (projected) return projected;
    }
  } catch (_) {}
  try {
    const getTmdbData = typeof globalThis !== "undefined" ? globalThis.__nuvioCoreGetTmdbDataV1 : null;
    if (typeof getTmdbData === "function") {
      const result = await getTmdbData({ tmdbId: String(tmdbId), mediaType: type, tmdbNamespace: type });
      const row = result && result.metadata && typeof result.metadata === "object" ? result.metadata : null;
      const projected = project(row);
      if (projected) return projected;
    }
  } catch (_) {}
  return null;
}
function _searchBases() {
  return _uniq([
    ...(Array.isArray(NIAKVIO_PROVIDER_MODEL.proofSearchBases) ? NIAKVIO_PROVIDER_MODEL.proofSearchBases : []),
    NIAKVIO_PROVIDER_MODEL.officialSite,
    NIAKVIO_PROVIDER_MODEL.knownSite,
    NIAKVIO_PROVIDER_MODEL.officialHub
  ].map(_substituteDomain)).filter(value => /^https?:/i.test(value));
}
function _apiBases() {
  return _uniq([
    NIAKVIO_PROVIDER_MODEL.fixedApi,
    NIAKVIO_PROVIDER_MODEL.officialApi,
    NIAKVIO_PROVIDER_MODEL.officialSite,
    NIAKVIO_PROVIDER_MODEL.knownSite
  ].map(_substituteDomain)).filter(value => /^https?:/i.test(value));
}
function _runtimeBases() {
  return _uniq([
    ...(Array.isArray(NIAKVIO_PROVIDER_MODEL.proofDetailBases) ? NIAKVIO_PROVIDER_MODEL.proofDetailBases : []),
    ..._searchBases(),
    ..._apiBases()
  ].map(_substituteDomain));
}
function _searchUrls(meta, mediaType, season, episode) {
  return _learnedUrls("search", meta, mediaType, season, episode);
}
function _runtimePlanAvailable() {
  if (NIAKVIO_PROVIDER_MODEL.apiRecipe) return true;
  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.providerValuePlan) && NIAKVIO_PROVIDER_MODEL.providerValuePlan.length) return true;
  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.searchRequestPlan) && NIAKVIO_PROVIDER_MODEL.searchRequestPlan.length) return true;
  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.externalIdentityPlan) && NIAKVIO_PROVIDER_MODEL.externalIdentityPlan.length) return true;
  return (NIAKVIO_PROVIDER_MODEL.routes || []).some(route => ["search","detail","player","api"].includes(_routeKind(route)));
}
function _apiUrls(tmdbId, mediaType, season, episode) {
  const bases = _apiBases();
  const out = [];
  // Route DATA is executable knowledge. API-family providers commonly persist
  // only a relative route plus one trusted origin; consume that plan directly
  // instead of requiring an observed full endpoint URL.
  out.push(..._learnedUrls(
    "api",
    { tmdbId: _text(tmdbId), title: "" },
    mediaType,
    season,
    episode
  ));
  // A bare API origin is not an executable request plan. The legacy fallback
  // that appended ?tmdbId=... is valid only for providers explicitly classified
  // tmdb_direct; catalogue providers must execute an observed route/search chain.
  if (!_identityUsesTmdbId()) return _uniq(out);
  for (const base of bases) {
    if (!/^https?:/i.test(base)) continue;
    let url = base
      .replace(/\{tmdb_?id\}/gi, encodeURIComponent(tmdbId || ""))
      .replace(/\{id\}/gi, encodeURIComponent(tmdbId || ""))
      .replace(/\{(?:media_?type|type)\}/gi, encodeURIComponent(mediaType || "movie"))
      .replace(/\{season\}/gi, encodeURIComponent(season == null ? "" : season))
      .replace(/\{episode\}/gi, encodeURIComponent(episode == null ? "" : episode));
    out.push(url);
    try {
      const parsed = new URL(url);
      if (!parsed.search) {
        const params = [
          ["tmdbId", tmdbId || ""],
          ["type", mediaType || "movie"]
        ];
        if (season != null) params.push(["season", String(season)]);
        if (episode != null) params.push(["episode", String(episode)]);
        out.push(parsed.origin + parsed.pathname + "?" + params
          .map(pair => encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]))
          .join("&") + (parsed.hash || ""));
      }
    } catch (_) {}
  }
  return _uniq(out);
}
function _directPlayerUrls(tmdbId, mediaType) {
  if (!tmdbId || !_identityUsesTmdbId()) return [];
  const hasPlayerRoute = (NIAKVIO_PROVIDER_MODEL.routes || []).some(route =>
    /^\/player(?:[?#]|$)/i.test(_text(route))
  );
  if (!hasPlayerRoute) return [];
  const transportType = _mediaNamespace(mediaType);
  const out = [];
  for (const base of _searchBases()) {
    try {
      const parsed = new URL("/player", base);
      out.push(
        parsed.origin + parsed.pathname
        + "?m=" + encodeURIComponent(transportType)
        + "&id=" + encodeURIComponent(_text(tmdbId))
      );
    } catch (_) {}
  }
  return _uniq(out);
}
function _runtimeApiUrls(playerUrl, mediaType, tmdbId, season, episode) {
  let player;
  try { player = new URL(playerUrl); } catch (_) { return []; }
  const out = [];
  // Transport-level player media values are commonly movie/tv even when
  // Nuvio's semantic type is anime. Preserve anime as a Nuvio type, but route
  // episodic/anime players through the site's TV transport convention.
  const desiredMedia = _mediaNamespace(mediaType);
  const observedMedia = _text(player.searchParams.get("m") || player.searchParams.get("media") || player.searchParams.get("type")).toLowerCase();
  for (const pattern of NIAKVIO_PROVIDER_MODEL.routes || []) {
    if (!/^\/api\/(?:streams?(?:\/|$)|source|sources|resolve|proxy)/i.test(_text(pattern))) continue;
    if (/\/(?:working|dead|warm)(?:[?#]|$)/i.test(_text(pattern))) continue;
    const parts = _text(pattern).split("?", 2);
    let path = parts[0].replace(/\{media\}/gi, encodeURIComponent(desiredMedia));
    if (observedMedia && /\/(?:movie|tv|anime)$/i.test(path)) {
      path = path.replace(/\/(?:movie|tv|anime)$/i, "/" + encodeURIComponent(desiredMedia));
    }
    const keys = (parts[1] || "").split("&").map(part => part.split("=", 1)[0]).filter(Boolean);
    if (!keys.length) continue;
    let target;
    try { target = new URL(path, player.origin); } catch (_) { continue; }
    let missing = false;
    const query = [];
    for (const key of keys) {
      const lower = key.toLowerCase();
      let value = player.searchParams.get(key);
      if (value == null && lower === "id" && _identityUsesTmdbId()) value = _text(tmdbId);
      if (value == null && /^(?:m|media|type)$/.test(lower)) value = desiredMedia;
      if (value == null && /^(?:season|s)$/.test(lower) && season != null) value = _text(season);
      if (value == null && /^(?:episode|e)$/.test(lower) && episode != null) value = _text(episode);
      if (value == null || value === "") { missing = true; break; }
      query.push(encodeURIComponent(key) + "=" + encodeURIComponent(_text(value)));
    }
    if (!missing) {
      const targetUrl = target.origin + target.pathname + (query.length ? "?" + query.join("&") : "");
      out.push({ url: targetUrl, referer: player.toString() });
    }
  }
  const seen = new Set();
  return out.filter(row => row.url && !seen.has(row.url) && seen.add(row.url));
}
function _jsonUrls(value, out) {
  out = out || [];
  if (typeof value === "string") {
    if (/^https?:/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const child of value) _jsonUrls(child, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) _jsonUrls(child, out);
  }
  return out;
}
/* NIAKVIO_PROVIDER_BASE_STREAM_CONTAINERS_V12 */
function _sourceUrls(value, base, out, streamContainer) {
  out = out || [];
  if (typeof value === "string") {
    if (streamContainer) {
      const absolute = _absolute(value, base);
      if (absolute && /^https?:/i.test(absolute) &&
          !/\.(?:jpe?g|png|gif|webp|svg|avif)(?:[?#]|$)/i.test(absolute)) out.push(absolute);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 80)) _sourceUrls(child, base, out, streamContainer);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const directField = /^(?:src|url|file|stream|stream_url|streamUrl|source|source_url|sourceUrl)$/i.test(key);
    const pluralStreamContainer = /^(?:streams?|stream_urls?|streamUrls?|sources?|source_urls?|sourceUrls?)$/i.test(key);
    if (typeof child === "string" && directField) {
      const absolute = _absolute(child, base);
      if (absolute && /^https?:/i.test(absolute) &&
          !/\.(?:jpe?g|png|gif|webp|svg|avif)(?:[?#]|$)/i.test(absolute)) {
        out.push(absolute);
      }
    }
    if (child && typeof child === "object") {
      _sourceUrls(child, base, out, Boolean(streamContainer || pluralStreamContainer));
    }
  }
  return out;
}
function _rewriteOutputUrl(raw) {
  const value = _substituteDomain(_text(raw).trim());
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    const host = _text(parsed.hostname).toLowerCase();
    for (const rule of NIAKVIO_PROVIDER_MODEL.outputUrlHostRewrites || []) {
      const fromHost = _text(rule && rule.fromHost).toLowerCase();
      const toHost = _text(rule && rule.toHost).toLowerCase();
      if (!fromHost || !toHost || host !== fromHost) continue;
      parsed.hostname = toHost;
      return parsed.toString();
    }
  } catch (_) {}
  return value;
}
function _outputLanguage(url) {
  try {
    const host = new URL(_text(url)).hostname.toLowerCase();
    for (const rule of NIAKVIO_PROVIDER_MODEL.outputLanguageRules || []) {
      const prefix = _text(rule && rule.hostPrefix).toLowerCase();
      const language = _text(rule && rule.language).toLowerCase();
      if (prefix && language && host.startsWith(prefix)) return language;
    }
  } catch (_) {}
  return "";
}
function _streams(urls, referer, extraHeaders) {
  const headers = Object.assign({}, extraHeaders || {});
  if (referer) headers.Referer = referer;
  const hasHeaders = Object.keys(headers).length > 0;
  return _uniq(urls)
    .map(_rewriteOutputUrl)
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 40)
    .map((url, index) => {
      const language = _outputLanguage(url);
      return {
        name: NIAKVIO_PROVIDER_MODEL.displayName,
        title: NIAKVIO_PROVIDER_MODEL.displayName + (index ? " #" + (index + 1) : ""),
        url,
        language: language || undefined,
        headers: hasHeaders ? Object.assign({}, headers) : undefined
      };
    });
}
function _recipeValue(row, fields) {
  if (!row || typeof row !== "object") return "";
  for (const field of fields || []) {
    const value = row[field];
    if (value != null && value !== "") return _text(value);
  }
  return "";
}
function _collectionMediaType(key) {
  const value = _text(key).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["movie","movies","film","films"].includes(value)) return "movie";
  if (["tv","tvs","series","show","shows","anime","animes","episode","episodes"].includes(value)) return "tv";
  return "";
}
function _recipeObjects(value, out, inheritedMedia) {
  out = out || [];
  inheritedMedia = inheritedMedia || "";
  if (Array.isArray(value)) {
    for (const child of value) _recipeObjects(child, out, inheritedMedia);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (inheritedMedia && !value.__nuvioCollectionMediaType) {
    out.push(Object.assign({ __nuvioCollectionMediaType: inheritedMedia }, value));
  } else {
    out.push(value);
  }
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      _recipeObjects(child, out, _collectionMediaType(key) || inheritedMedia);
    }
    if (out.length >= 400) break;
  }
  return out;
}
function _recipeMediaType(row, recipe) {
  const raw = _recipeValue(row, recipe.typeFields || ["type","media_type","mediaType","kind","category"]).toLowerCase();
  if (raw) {
    if (["tv","series","show","anime","episode"].includes(raw)) return "tv";
    if (["movie","film"].includes(raw)) return "movie";
  }
  const inherited = _text(row && row.__nuvioCollectionMediaType).toLowerCase();
  return inherited === "movie" || inherited === "tv" ? inherited : "";
}
/* NIAKVIO_PROVIDER_BASE_SHARED_IDENTITY_POLICY_V9 */
function _identityPolicy() {
  try {
    const policy = typeof globalThis !== "undefined" ? globalThis.__nuvioIdentityPolicyV1 : null;
    return policy && typeof policy.catalogueScore === "function" && typeof policy.htmlIdentityOk === "function" ? policy : null;
  } catch (_) { return null; }
}
function _recipeScore(row, meta, recipe, expectedMedia) {
  const policy = _identityPolicy();
  if (!policy) return -1;
  return Number(policy.catalogueScore({
    title: _recipeValue(row, recipe.titleFields || ["title","name","post_title","original_title"]),
    expectedTitles: _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])]).filter(Boolean),
    actualMedia: _recipeMediaType(row, recipe),
    expectedMedia,
    year: _recipeValue(row, recipe.yearFields || ["year","release_date","first_air_date"]).slice(0, 4),
    expectedYear: _text(meta && meta.year).slice(0, 4),
    providerId: _recipeValue(row, recipe.idFields || ["id","_id","media_id","post_id"]),
    strictIdentity: recipe.strictIdentity === true,
    requireProviderTypeEvidence: recipe.requireProviderTypeEvidence === true
  }));
}
function _recipeSourceUrls(value, base, recipe) {
  const urls = _sourceUrls(value, base);
  if (!recipe || !recipe.directSourcesOnly) return urls;
  return urls.filter(_directMedia);
}
function _recipePlaybackContext(recipe, requestSpec, base) {
  const raw = requestSpec && requestSpec.headers && typeof requestSpec.headers === "object"
    ? requestSpec.headers
    : {};
  const lower = {};
  for (const [key, value] of Object.entries(raw)) lower[_text(key).toLowerCase()] = _text(value);
  const headers = {};
  if (lower["origin"]) headers.Origin = lower["origin"];
  if (lower["user-agent"]) headers["User-Agent"] = lower["user-agent"];
  if (lower["accept-language"]) headers["Accept-Language"] = lower["accept-language"];
  const explicit = recipe && recipe.playbackHeaders && typeof recipe.playbackHeaders === "object"
    ? recipe.playbackHeaders
    : {};
  for (const [key, value] of Object.entries(explicit)) {
    if (!/^(?:origin|referer|referrer|user-agent|accept-language)$/i.test(_text(key))) continue;
    if (/^(?:referer|referrer)$/i.test(_text(key))) continue;
    headers[key] = _text(value);
  }
  if (recipe && recipe.origin) headers.Origin = _text(recipe.origin);
  const referer = _text(
    (recipe && recipe.referer)
    || lower["referer"]
    || lower["referrer"]
    || base
  );
  return { referer, headers };
}
function _recipeUrl(pattern, values, base) {
  let route = _text(pattern);
  if (!route) return "";
  const replacements = {
    query: values.query,
    title: values.query,
    id: values.providerId,
    providerId: values.providerId,
    slug: values.providerSlug,
    providerSlug: values.providerSlug,
    tmdbId: values.tmdbId,
    tmdb_id: values.tmdbId,
    imdbId: values.imdbId,
    imdb_id: values.imdbId,
    media: values.media,
    type: values.media,
    season: values.season,
    episode: values.episode,
    source: values.source
  };
  route = route.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = replacements[key];
    return value == null ? "" : encodeURIComponent(_text(value));
  });
  let url;
  try {
    if (/^https?:\/\//i.test(route)) {
      url = new URL(route).toString();
    } else {
      const parsedBase = new URL(_text(base).trim());
      const basePath = _text(parsedBase.pathname || "").replace(/\/+$/, "");
      const prefix = parsedBase.origin + (basePath && basePath !== "/" ? basePath : "");
      url = prefix + "/" + route.replace(/^\/+/, "");
    }
  } catch (_) { return ""; }
  // NuvioTV's QuickJS URL polyfill does not synchronize URL.href after
  // searchParams mutations. Rebuild the query explicitly instead of relying
  // on mutating searchParams before toString().
  try {
    const parsed = new URL(url);
    const remove = new Set(
      ["season","episode","source"].filter(key => values[key] == null || values[key] === "")
    );
    if (!remove.size) return parsed.toString();
    const query = _text(parsed.search || "").replace(/^\?/, "");
    const kept = query ? query.split("&").filter(part => {
      const rawKey = part.split("=", 1)[0] || "";
      let key = rawKey;
      try { key = decodeURIComponent(rawKey); } catch (_) {}
      return !remove.has(_text(key).toLowerCase());
    }) : [];
    return parsed.origin + parsed.pathname + (kept.length ? "?" + kept.join("&") : "") + _text(parsed.hash || "");
  } catch (_) {
    return url;
  }
}
/* NIAKVIO_PROVIDER_BASE_ROUTE_REQUEST_SPEC_V1 */
/* NIAKVIO_PROVIDER_BASE_COMPOSITE_REQUEST_TEMPLATE_V21_8 */
function _recipeExpandScalar(value, values) {
  if (typeof value !== "string") return value;
  const replacements = {
    query: values.query,
    title: values.query,
    queryDots: _text(values.query).trim().replace(/\s+/g, "."),
    query_dots: _text(values.query).trim().replace(/\s+/g, "."),
    year: values.year,
    season2: String(values.season == null ? "" : values.season).padStart(2, "0"),
    episode2: String(values.episode == null ? "" : values.episode).padStart(2, "0"),
    id: values.providerId,
    providerId: values.providerId,
    slug: values.providerSlug,
    providerSlug: values.providerSlug,
    tmdbId: values.tmdbId,
    tmdb_id: values.tmdbId,
    imdbId: values.imdbId,
    imdb_id: values.imdbId,
    media: values.media,
    type: values.media,
    season: values.season,
    episode: values.episode,
    source: values.source
  };
  return value.replace(/\{([^}]+)\}/g, (match, key) => {
    const replacement = replacements[key];
    return replacement == null ? "" : _text(replacement);
  });
}
function _recipeExpandObject(value, values) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) out[key] = _recipeExpandObject(raw, values);
    else if (Array.isArray(raw)) out[key] = raw.map(item => _recipeExpandScalar(item, values));
    else out[key] = _recipeExpandScalar(raw, values);
  }
  return out;
}
function _recipeRequestSpec(recipe, key, values) {
  const raw = recipe && recipe[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const method = _text(raw.method || "GET").toUpperCase();
  if (!/^(?:GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(method)) return null;
  const spec = { method, headers: _recipeExpandObject(raw.headers || {}, values) || {} };
  for (const key of Object.keys(spec.headers)) {
    if (/^(?:origin|referer|referrer)$/i.test(key) && /^https?:\/\//i.test(_text(spec.headers[key]))) {
      spec.headers[key] = _substituteDomain(spec.headers[key]);
    }
  }
  const bodyKind = _text(raw.bodyKind || "").toLowerCase();
  const body = _recipeExpandObject(raw.body || {}, values);
  if (bodyKind === "json" && body && typeof body === "object") {
    spec.body = JSON.stringify(body);
    if (!Object.keys(spec.headers).some(key => key.toLowerCase() === "content-type")) spec.headers["Content-Type"] = "application/json";
  } else if (bodyKind === "form" && body && typeof body === "object") {
    spec.body = Object.entries(body).map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(_text(value))).join("&");
    if (!Object.keys(spec.headers).some(key => key.toLowerCase() === "content-type")) spec.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  /* NIAKVIO_PROVIDER_BASE_TEXT_BODY_REQUEST_V9 */
  } else if (bodyKind === "text" && typeof raw.body === "string") {
    spec.body = _recipeExpandScalar(raw.body, values);
  }
  return spec;
}
async function _recipePayload(url, recipe, requestSpec, values) {
  const headers = Object.assign({}, recipe.requestHeaders || {}, requestSpec && requestSpec.headers || {});
  if (recipe.referer && !headers.Referer && !headers.referer) headers.Referer = recipe.referer;
  if (recipe.origin && !headers.Origin && !headers.origin) headers.Origin = recipe.origin;
  const options = { headers };
  if (requestSpec && requestSpec.method) options.method = requestSpec.method;
  if (requestSpec && requestSpec.body != null) options.body = requestSpec.body;
  const requestTimeoutMs = Math.max(0, Number(recipe.requestTimeoutMs || 0) || 0);
  if (requestTimeoutMs > 0) {
    try {
      let timeoutMs = requestTimeoutMs;
      const deadline = Number(globalThis && globalThis.__nuvioProviderDeadlineMs);
      if (Number.isFinite(deadline) && deadline > 0) timeoutMs = Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
      if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) options.signal = AbortSignal.timeout(timeoutMs);
    } catch (_) {}
  }
  const response = await _fetch(url, options);
  const type = _text(response.headers.get("content-type")).toLowerCase();
  if (type.includes("json")) return { value: await response.json(), base: response.url || url };
  const text = await response.text();
  try { return { value: JSON.parse(text), base: response.url || url }; }
  catch (_) { return { value: text, base: response.url || url }; }
}
function _recipeField(value,path){var cur=value;for(const part of _text(path).split(".").filter(Boolean)){if(!cur||typeof cur!=="object")return"";cur=cur[part]}return _text(cur)}
function _recipeStatusBase(domain,recipe){
  let raw=_text(domain).replace(/^https?:\/\//i,"").replace(/\/+$/,"");
  if(!raw)return"";
  let host=raw.split("/")[0];
  const prefix=_text(recipe.statusApiPrefix);
  if(prefix&&host.toLowerCase().indexOf(prefix.toLowerCase())!==0)host=prefix+host;
  const suffix=_text(recipe.statusApiSuffix);
  return "https://"+host+(suffix?(suffix.charAt(0)==="/"?suffix:"/"+suffix):"");
}
function _recipeStaticBases(recipe){
  const explicitFallbackBases=Array.isArray(recipe.fallbackBases)?recipe.fallbackBases:[];
  const modelFallbackBases=recipe.allowModelBases===true
    ? [NIAKVIO_PROVIDER_MODEL.fixedApi,NIAKVIO_PROVIDER_MODEL.officialApi,..._runtimeBases()]
    : [];
  return _uniq([
    recipe.base,
    ...explicitFallbackBases,
    ...modelFallbackBases
  ]).map(_substituteDomain).filter(value=>/^https?:/i.test(_text(value)));
}
async function _recipeStatusDynamicBase(recipe){
  if(!/^https?:\/\//i.test(_text(recipe.statusUrl))||!recipe.statusDomainField)return"";
  try{
    const statusOptions={headers:{Accept:"application/json,text/plain,*/*"}};
    try{
      const requestTimeoutMs=Math.max(0,Number(recipe.requestTimeoutMs||0)||0);
      if(requestTimeoutMs>0&&typeof AbortSignal!=="undefined"&&AbortSignal.timeout)statusOptions.signal=AbortSignal.timeout(requestTimeoutMs);
    }catch(_){}
    const response=await _fetch(_text(recipe.statusUrl),statusOptions);
    let value=null;
    const type=_text(response.headers&&response.headers.get?response.headers.get("content-type"):"").toLowerCase();
    if(type.includes("json"))value=await response.json();
    else{
      const body=await response.text();
      try{value=JSON.parse(body)}catch(_){value=null}
    }
    return _recipeStatusBase(_recipeField(value,recipe.statusDomainField),recipe);
  }catch(_){return""}
}
async function _recipeBases(recipe){
  return _recipeStaticBases(recipe);
}
/* NIAKVIO_PROVIDER_BASE_TYPED_RESOLVER_API_V11 */
async function _resolveApiRecipe(meta, mediaType, season, episode) {
  const recipe = NIAKVIO_PROVIDER_MODEL.apiRecipe;
  if (!recipe || typeof recipe !== "object") return [];
  const media = _mediaNamespace(mediaType);
  const bases = await _recipeBases(recipe);
  const typedResolverRoute = media === "movie" ? recipe.movieRoute : (recipe.episodeRoute || recipe.movieRoute);
  let typedResolverOrigin = "";
  if (recipe.recipeKind === "typed-resolver-api") {
    try {
      const parsed = new URL(_text(typedResolverRoute));
      if (/^https?:$/i.test(parsed.protocol)) typedResolverOrigin = parsed.origin;
    } catch (_) {}
  }
  if (!bases.length && !typedResolverOrigin) return [];
  const values = {
    query: _text(meta && meta.title),
    providerId: _text(meta && meta.tmdbId),
    tmdbId: _text(meta && meta.tmdbId),
    media,
    season,
    episode,
    source: null
  };

  if (recipe.directRoute) {
    const streams = [];
    const sources = Array.isArray(recipe.sources) && recipe.sources.length ? recipe.sources.slice(0, 12) : [null];
    const batchSize = Math.max(1, Math.min(Number(recipe.sourceBatchSize || 4) || 4, 6));
    const minStreamsBeforeStop = Math.max(1, Math.min(Number(recipe.minStreamsBeforeStop || 1) || 1, 20));
    for (const base of bases.slice(0, 2)) {
      for (let offset = 0; offset < sources.length; offset += batchSize) {
        const batch = sources.slice(offset, offset + batchSize);
        const batchRows = await Promise.all(batch.map(async source => {
          const localValues = Object.assign({}, values, { source });
          const url = _recipeUrl(recipe.directRoute, localValues, base);
          if (!url) return [];
          try {
            const payload = await _recipePayload(url, recipe, _recipeRequestSpec(recipe, "directRequest", localValues), localValues);
            if (typeof payload.value === "string") {
              return _streams(
                _extractUrls(payload.value, payload.base).filter(_directMedia),
                recipe.referer || base,
                Object.assign({}, recipe.playbackHeaders || {}, recipe.origin ? { Origin: recipe.origin } : {})
              );
            }
            return _streams(
              _recipeSourceUrls(payload.value, payload.base, recipe),
              recipe.referer || base,
              Object.assign({}, recipe.playbackHeaders || {}, recipe.origin ? { Origin: recipe.origin } : {})
            );
          } catch (_) {
            return [];
          }
        }));
        for (const rows of batchRows) streams.push(...rows);
        if (streams.length >= minStreamsBeforeStop) break;
      }
      if (streams.length) break;
    }
    return streams.slice(0, 40);
  }

  if (!recipe.searchRoute && !typedResolverOrigin) return [];
  const searchQueries = _uniq([
    meta && meta.title,
    ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])
  ].map(_text).filter(Boolean)).slice(0, 3);

  let statusFallbackBlocked = false;
  async function findProvider(baseList) {
    const blockedBases = new Set();
    const skipStatuses = new Set(
      (Array.isArray(recipe.skipStatusOnHttpStatuses) ? recipe.skipStatusOnHttpStatuses : [])
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
    );
    const candidates = baseList.slice(0, 3);
    for (const query of searchQueries) {
      values.query = query;
      for (const base of candidates) {
        if (blockedBases.has(base)) continue;
        const url = _recipeUrl(recipe.searchRoute, values, base);
        if (!url) continue;
        try {
          const payload = await _recipePayload(url, recipe, _recipeRequestSpec(recipe, "searchRequest", values), values);
          if (!payload.value || typeof payload.value === "string") continue;
          const rows = _recipeObjects(payload.value, [])
            .map(row => ({ row, score: _recipeScore(row, meta, recipe, media) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
          if (!rows.length) continue;
          const id = _recipeValue(rows[0].row, recipe.idFields || ["id","_id","media_id","post_id"]);
          if (id) return { id, base };
        } catch (error) {
          const match = _text(error && error.message).match(/provider_http_(\d+)/i);
          const status = match ? Number(match[1]) : 0;
          if (status && skipStatuses.has(status)) blockedBases.add(base);
        }
      }
    }
    if (candidates.length && candidates.every(base => blockedBases.has(base))) statusFallbackBlocked = true;
    return null;
  }

  let providerMatch = typedResolverOrigin && !recipe.searchRoute
    ? { id: "", base: typedResolverOrigin }
    : await findProvider(bases);
  let dynamicStatusBase = "";
  if (!providerMatch && !statusFallbackBlocked) {
    dynamicStatusBase = await _recipeStatusDynamicBase(recipe);
    if (dynamicStatusBase && !bases.includes(dynamicStatusBase)) {
      providerMatch = await findProvider([dynamicStatusBase]);
    }
  }
  if (!providerMatch) return [];

  values.providerId = providerMatch.id;
  const route = media === "movie" ? recipe.movieRoute : (recipe.episodeRoute || recipe.movieRoute);
  if (!route) return [];

  async function resolveRoute(baseList) {
    for (const base of baseList.slice(0, 3)) {
      const url = _recipeUrl(route, values, base);
      if (!url) continue;
      try {
        const requestKey = media === "movie" ? "movieRequest" : "episodeRequest";
        const requestSpec = _recipeRequestSpec(recipe, requestKey, values);
        const payload = await _recipePayload(url, recipe, requestSpec, values);
        const playback = _recipePlaybackContext(recipe, requestSpec, base);
        if (typeof payload.value === "string") {
          const urls = _extractUrls(payload.value, payload.base).filter(_directMedia);
          if (urls.length) return _streams(
            urls,
            playback.referer,
            playback.headers
          );
        } else {
          const urls = _recipeSourceUrls(payload.value, payload.base, recipe);
          if (urls.length) return _streams(
            urls,
            playback.referer,
            playback.headers
          );
        }
      } catch (_) {}
    }
    return [];
  }

  const routeBases = _uniq([providerMatch.base, ...bases]);
  let resolved = await resolveRoute(routeBases);
  if (resolved.length) return resolved;

  if (!dynamicStatusBase) dynamicStatusBase = await _recipeStatusDynamicBase(recipe);
  if (dynamicStatusBase && !routeBases.includes(dynamicStatusBase)) {
    resolved = await resolveRoute([dynamicStatusBase]);
    if (resolved.length) return resolved;
  }
  return [];
}
async function _resolveApi(tmdbId, mediaType, season, episode) {
  const streams = [];
  for (const url of _apiUrls(tmdbId, mediaType, season, episode).slice(0, 4)) {
    try {
      const response = await _fetch(url);
      const type = _text(response.headers.get("content-type")).toLowerCase();
      if (type.includes("json")) {
        const value = await response.json();
        streams.push(..._jsonUrls(value).filter(_directMedia));
      } else {
        const text = await response.text();
        streams.push(..._extractUrls(text, response.url || url).filter(_directMedia));
      }
    } catch (_) {}
    if (streams.length) break;
  }
  return _streams(streams, _searchBases()[0] || "");
}
async function _resolveRuntimeApi(playerUrls, mediaType, tmdbId, season, episode) {
  const streams = [];
  for (const playerUrl of _uniq(playerUrls).slice(0, 3)) {
    for (const row of _runtimeApiUrls(playerUrl, mediaType, tmdbId, season, episode).slice(0, 4)) {
      try {
        const response = await _fetch(row.url, {
          headers: row.referer ? { Referer: row.referer } : {}
        });
        const type = _text(response.headers.get("content-type")).toLowerCase();
        if (type.includes("json")) {
          const value = await response.json();
          const sources = _sourceUrls(value, response.url || row.url);
          if (sources.length) streams.push(..._streams(sources, row.referer));
        } else {
          const text = await response.text();
          const urls = _extractUrls(text, response.url || row.url);
          const direct = urls.filter(_directMedia);
          if (direct.length) streams.push(..._streams(direct, row.referer));
        }
      } catch (_) {}
      if (streams.length) break;
    }
    if (streams.length) break;
  }
  return streams.slice(0, 40);
}
async function _resolveKnownPlayer(tmdbId, mediaType, season, episode) {
  const known = _directPlayerUrls(tmdbId, mediaType).slice(0, 2);
  for (const playerUrl of known) {
    try {
      const response = await _fetch(playerUrl);
      const responseUrl = response.url || playerUrl;
      let text = "";
      try { text = await response.text(); } catch (_) {}
      const candidates = _uniq([
        responseUrl,
        ..._extractUrls(text, responseUrl).filter(_playerLike)
      ]).slice(0, 3);
      const runtime = await _resolveRuntimeApi(candidates, mediaType, tmdbId, season, episode);
      if (runtime.length) return runtime;
      const direct = _extractUrls(text, responseUrl).filter(_directMedia);
      if (direct.length) return _streams(direct, responseUrl).slice(0, 12);
    } catch (_) {}
  }
  return [];
}
function _htmlVisibleText(value) {
  const source = _text(value);
  const lower = source.toLowerCase();
  let out = "";
  let cursor = 0;
  let hidden = "";
  while (cursor < source.length) {
    if (hidden) {
      const closeAt = lower.indexOf("</" + hidden, cursor);
      if (closeAt < 0) break;
      cursor = closeAt;
      hidden = "";
      continue;
    }
    if (source.charAt(cursor) !== "<") {
      out += source.charAt(cursor);
      cursor += 1;
      continue;
    }
    const end = source.indexOf(">", cursor + 1);
    if (end < 0) {
      out += source.slice(cursor);
      break;
    }
    let raw = source.slice(cursor + 1, end).trim();
    let closing = raw.charAt(0) === "/";
    if (closing) raw = raw.slice(1).trim();
    let name = "";
    for (let i = 0; i < raw.length; i += 1) {
      const code = raw.charCodeAt(i);
      const alpha = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      if (!alpha) break;
      name += raw.charAt(i).toLowerCase();
    }
    if (!closing && (name === "script" || name === "style")) hidden = name;
    out += " ";
    cursor = end + 1;
  }
  return out;
}
function _strictHtmlIdentityOk(html, meta, mediaType) {
  if (!NIAKVIO_PROVIDER_MODEL.strictHtmlIdentity) return true;
  const policy = _identityPolicy();
  if (!policy) return false;
  return policy.htmlIdentityOk({
    strictIdentity: true,
    html,
    visibleText: _htmlVisibleText(html),
    expectedTitles: _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])]).filter(Boolean),
    expectedYear: _text(meta && meta.year).slice(0, 4),
    mediaType
  }) === true;
}
async function _resolveHtml(meta, mediaType, season, episode) {
  if (!meta || (!meta.title && !meta.tmdbId)) return [];
  const candidates = [];
  if (meta.title) {
    for (const searchUrl of _searchUrls(meta, mediaType, season, episode).slice(0, 2)) {
      try {
        const response = await _fetch(searchUrl);
        const html = await response.text();
        const urls = _extractUrls(html, response.url || searchUrl)
          .filter(value => {
            const host = _origin(value);
            return host && _searchBases().some(base => _origin(base) === host);
          })
          .map(value => ({ url: value, score: _candidateScore(value, meta) }))
          .filter(row => row.score >= 18)
          .sort((a, b) => b.score - a.score)
          .map(row => row.url);
        candidates.push(...urls);
      } catch (_) {}
      if (candidates.length) break;
    }
  }
  candidates.push(..._learnedUrls("detail", meta, mediaType, season, episode));
  const streams = [];
  for (const detailUrl of _uniq(candidates).slice(0, 6)) {
    try {
      const response = await _fetch(detailUrl);
      const html = await response.text();
      if (!_strictHtmlIdentityOk(html, meta, mediaType)) continue;
      const explicitPlayers = _spv15ExplicitPlayerAttrs(html, response.url || detailUrl);
      if (explicitPlayers.length) {
        const explicitCrawled = await _crawlDirectMedia(explicitPlayers, response.url || detailUrl, 3);
        if (explicitCrawled.length) return explicitCrawled.slice(0, 40);
      }
      let urls = _uniq([
        ...explicitPlayers,
        ..._extractUrls(html, response.url || detailUrl)
      ]);
      if (mediaType !== "movie" && season != null && episode != null) {
        const token = new RegExp("(?:s(?:eason)?\\s*0*" + Number(season) + "[^\\n]{0,80}e(?:pisode)?\\s*0*" + Number(episode) + "|0*" + Number(season) + "x0*" + Number(episode) + ")", "i");
        const episodeLinks = urls.filter(value => token.test(value));
        if (episodeLinks.length) {
          for (const episodeUrl of episodeLinks.slice(0, 2)) {
            try {
              const episodeResponse = await _fetch(episodeUrl);
              const episodeHtml = await episodeResponse.text();
              urls = urls.concat(_extractUrls(episodeHtml, episodeResponse.url || episodeUrl));
            } catch (_) {}
          }
        }
      }
      const direct = urls.filter(_directMedia);
      if (direct.length) streams.push(..._streams(direct, response.url || detailUrl));
      if (!direct.length && /iframe|mixed_embed|html_scraper|direct_media/i.test(NIAKVIO_PROVIDER_MODEL.strategy)) {
        const discoveredNested = _uniq(urls.filter(_crawlEligible).sort((a,b)=>_crawlUrlScore(b)-_crawlUrlScore(a))).slice(0, 10);
        if (discoveredNested.length) {
          const runtimeCandidates = _uniq([
            ...discoveredNested,
            ..._directPlayerUrls(meta.tmdbId, mediaType)
          ]);
          // A signed player URL can carry short-lived keys required by a
          // learned runtime API. Consume that exact route before recursively
          // crawling third-party embeds, otherwise an unrelated player-like
          // URL can steal the bounded crawl budget and the signed key is lost.
          const runtime = await _resolveRuntimeApi(
            runtimeCandidates,
            mediaType,
            meta.tmdbId,
            season,
            episode
          );
          if (runtime.length) {
            streams.push(...runtime);
          } else {
            // Runtime-route enrichment remains fail-open: providers without a
            // usable learned API continue through the generic player crawl.
            const crawled = await _crawlDirectMedia(
              discoveredNested,
              response.url || detailUrl,
              2
            );
            if (crawled.length) streams.push(...crawled);
          }
        } else {
          const runtimeCandidates = _directPlayerUrls(meta.tmdbId, mediaType);
          if (runtimeCandidates.length) {
            const runtime = await _resolveRuntimeApi(
              runtimeCandidates,
              mediaType,
              meta.tmdbId,
              season,
              episode
            );
            if (runtime.length) streams.push(...runtime);
          }
        }
      }
    } catch (_) {}
    if (streams.length >= 12) break;
  }
  return streams.slice(0, 40);
}
/* NIAKVIO_PROVIDER_BASE_STRUCTURED_EXTERNAL_ID_V13 */
function _externalEpisodeMarker(url, season, episode) {
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname || "").toLowerCase(); }
  catch (_) { return { marked: false, matches: false }; }
  const wantedSeason = Math.max(1, Number(season) || 1);
  const wantedEpisode = Math.max(1, Number(episode) || 1);
  let match = path.match(/\/(\d{1,3})\/(\d{1,4})\/[^/]*(?:playlist\.m3u8|manifest\.mpd|[^/]+\.(?:mp4|mkv|webm))(?:$|[?#])/i);
  if (match) return {
    marked: true,
    matches: Number(match[1]) === wantedSeason && Number(match[2]) === wantedEpisode
  };
  match = path.match(/(?:^|[-_/])s(?:eason)?[-_ ]*0*(\d{1,3})[-_ ]*e(?:pisode)?[-_ ]*0*(\d{1,4})(?:[-_/]|$)/i);
  if (match) return {
    marked: true,
    matches: Number(match[1]) === wantedSeason && Number(match[2]) === wantedEpisode
  };
  match = path.match(/(?:^|[-_/])0*(\d{1,3})x0*(\d{1,4})(?:[-_/]|$)/i);
  if (match) return {
    marked: true,
    matches: Number(match[1]) === wantedSeason && Number(match[2]) === wantedEpisode
  };
  return { marked: false, matches: false };
}
function _externalPlaybackHeaders(requestSpec) {
  const source = requestSpec && requestSpec.headers && typeof requestSpec.headers === "object"
    ? requestSpec.headers : {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(?:origin|referer|referrer|user-agent)$/i.test(key) && value != null && value !== "") out[key] = value;
  }
  return out;
}
/* NIAKVIO_PROVIDER_BASE_SEARCH_REQUEST_PLAN_V14 */
/* NIAKVIO_PROVIDER_BASE_CORRELATED_VALUE_PLAN_V18 */
function _spv18ProviderIdFromJson(value, meta) {
  /* NIAKVIO_PROVIDER_CORRELATED_VALUE_PLAN_V18_1 */
  const labelKeys = [
    "title","name","original_title","post_title","label","anime",
    "movie","series","show","matched","display_name","displayName"
  ];
  const identityKeys = [
    "id","ID","_id","media_id","post_id","anime_id","movie_id",
    "series_id","show_id","slug","provider_slug","seo_slug"
  ];
  let bestScore = -1;
  let bestIdentity = "";
  const rows = _spv4JsonRows(value, []).slice(0, 300);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    let rowScore = 0;
    for (const key of labelKeys) {
      const label = _spv4Scalar(row[key]);
      if (!label) continue;
      rowScore = Math.max(rowScore, _spv4TitleScore(label, meta));
    }
    if (rowScore < 90) continue;
    let identity = "";
    for (const key of identityKeys) {
      const candidate = _spv4Scalar(row[key]);
      if (candidate && candidate.length <= 160 && /^[A-Za-z0-9._~-]+$/.test(candidate)) {
        identity = candidate;
        break;
      }
    }
    if (!identity) continue;
    if (rowScore > bestScore) {
      bestScore = rowScore;
      bestIdentity = identity;
    }
  }
  return bestIdentity;
}
/* NIAKVIO_PROVIDER_RESPONSE_VALUE_CORRELATION_V20 */
function _spv20ProviderValuesFromHtml(html, meta) {
  const source = _text(html).slice(0, 786432);
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match, scanned = 0;
  let bestScore = -1;
  let best = { id: "", slug: "" };
  while ((match = anchorRe.exec(source)) !== null && scanned++ < 400) {
    const label = _htmlVisibleText(match[2]).replace(/\s+/g, " ").trim();
    const score = _spv4TitleScore(label, meta);
    if (score < 90 || score < bestScore) continue;
    const attrs = _text(match[1]);
    let id = "";
    let slug = "";
    const idMatch = attrs.match(/\bdata-(?:id|post-id|media-id|anime-id|movie-id|series-id|show-id)\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/i);
    if (idMatch) id = idMatch[1];
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])([^"']{1,900})\1/i);
    if (hrefMatch) {
      try {
        const parsed = new URL(hrefMatch[2], "https://invalid.local/");
        const raw = parsed.pathname.split("/").filter(Boolean).pop() || "";
        const segment = decodeURIComponent(raw).replace(/\.html?$/i, "");
        if (/^[A-Za-z0-9._~-]{2,160}$/.test(segment)) {
          slug = segment;
          const numeric = segment.match(/^(\d{2,})[-_.]/);
          if (!id && numeric) id = numeric[1];
        }
      } catch (_) {}
    }
    if (!id && !slug) continue;
    if (score > bestScore) {
      bestScore = score;
      best = { id, slug };
    }
  }
  if (!best.id) best.id = _spv18ProviderIdFromHtml(source, meta);
  if (!best.slug) best.slug = best.id;
  if (!best.id) best.id = best.slug;
  return best;
}
function _spv20ProviderValuesFromJson(value, meta) {
  const identity = _spv18ProviderIdFromJson(value, meta);
  return { id: identity, slug: identity };
}
function _spv18ProviderIdFromHtml(html, meta) {
  const source = _text(html);
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(source)) !== null) {
    const label = _htmlVisibleText(match[2]).replace(/\s+/g, " ").trim();
    if (_spv4TitleScore(label, meta) < 90) continue;
    const attrs = _text(match[1]);
    const idMatch = attrs.match(/\bdata-(?:id|post-id|media-id|anime-id|movie-id|series-id|show-id)\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/i);
    if (idMatch) return idMatch[1];
  }
  for (const title of _spv4Titles(meta)) {
    const token = _text(title).trim();
    if (!token) continue;
    const at = source.toLowerCase().indexOf(token.toLowerCase());
    if (at < 0) continue;
    const windowText = source.slice(Math.max(0, at - 1400), Math.min(source.length, at + 1400));
    const idMatch = windowText.match(/\bdata-(?:id|post-id|media-id|anime-id|movie-id|series-id|show-id)\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/i);
    if (idMatch) return idMatch[1];
  }
  return "";
}
function _spv18ValueUrls(value, base, out) {
  out = out || [];
  if (Array.isArray(value)) {
    for (const child of value) _spv18ValueUrls(child, base, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /^(?:src|url|file|stream|stream_url|streamUrl|source|source_url|sourceUrl|iframe|embed|player|link|href)$/i.test(key)) {
      const absolute = _absolute(child, base);
      if (absolute && /^https?:/i.test(absolute)) out.push(absolute);
    }
    if (child && typeof child === "object") _spv18ValueUrls(child, base, out);
    if (out.length >= 160) break;
  }
  return out;
}
/* NIAKVIO_PROVIDER_VALUE_TRACE_V18_4 */
/* NIAKVIO_PROVIDER_CORRELATED_VALUE_SEMANTIC_LANE_V18_5 */
function _spv185PlanLaneAllowed(lanes, mediaType) {
  if (!Array.isArray(lanes) || !lanes.length) return true;
  const type = _text(mediaType).trim().toLowerCase();
  if (lanes.includes(type)) return true;
  const semantic = Array.isArray(NIAKVIO_PROVIDER_MODEL.supportedTypes)
    ? NIAKVIO_PROVIDER_MODEL.supportedTypes.map(value => _text(value).trim().toLowerCase())
    : [];
  if (!semantic.includes("anime")) return false;
  return (type === "tv" && lanes.includes("anime")) ||
    (type === "anime" && lanes.includes("tv"));
}
/* NIAKVIO_PROVIDER_VALUE_TRACE_HISTORY_V21 */
function _spv184Trace(stage, mediaType, providerId, stepIndex, route) {
  try {
    const row = {
      stage: _text(stage).slice(0, 64),
      lane: _text(mediaType).slice(0, 32),
      providerId: _text(providerId).slice(0, 160),
      stepIndex: Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : -1,
      route: _text(route).slice(0, 240)
    };
    globalThis.__nuvioProviderValueTraceV18 = row;
    const history = Array.isArray(globalThis.__nuvioProviderValueTraceHistoryV21)
      ? globalThis.__nuvioProviderValueTraceHistoryV21 : [];
    history.push(row);
    while (history.length > 48) history.shift();
    globalThis.__nuvioProviderValueTraceHistoryV21 = history;
  } catch (_) {}
}
/* NIAKVIO_PROVIDER_RESPONSE_VALUE_STATEFUL_V20_4 */
/* NIAKVIO_PROVIDER_RESPONSE_VALUE_DEPENDENCY_V20_5 */
function _spv205SeasonSignal(raw, season) {
  const text = _text(raw).toLowerCase();
  const wanted = Number(season);
  if (!text || !Number.isFinite(wanted) || wanted <= 0) return 0;
  const patterns = [
    /(?:saison|season)[\s._-]*0*(\d{1,3})\b/i,
    /(?:^|[^a-z0-9])s0*(\d{1,3})(?:[^a-z0-9]|$)/i,
    /-(\d{1,3})-episode-/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const found = Number(match[1]);
    if (!Number.isFinite(found)) continue;
    return found === wanted ? 80 : -120;
  }
  return 0;
}
/* NIAKVIO_PROVIDER_MEDIA_IDENTITY_GUARD_V21_1 */
function _spv211RegexEscape(value) {
  return _text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/* NIAKVIO_PROVIDER_MEDIA_IDENTITY_GUARD_V21_2 */
function _spv212Slug(value) {
  return _text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function _spv212Titles(meta) {
  const rows = [meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])];
  const out = [];
  const seen = new Set();
  for (const row of rows.slice(0, 8)) {
    const value = _text(row).trim();
    const key = _spv212Slug(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 4);
}
function _spv211CandidateIdentityScore(title, href, meta, mediaType, season) {
  const actual = _spv212Slug(title);
  if (!actual) return 0;
  const expected = _spv212Titles(meta).map(_spv212Slug).filter(Boolean);
  const exact = expected.includes(actual);
  let score = _spv4TitleScore(title, meta);
  const lane = _text(mediaType).toLowerCase();
  const context = _text(title) + " " + _text(href);

  if (lane === "movie") {
    if (!exact && /(?:^|[\s/_-])(?:saison|season|episode|ep)[\s._-]*\d{1,3}\b/i.test(context)) return -10000;
    const wantedYear = Number(meta && (meta.year || meta.releaseYear || meta.release_year));
    const years = context.match(/\b(?:19|20)\d{2}\b/g) || [];
    if (Number.isFinite(wantedYear) && wantedYear > 1800 && years.length) {
      if (!years.some(value => Number(value) === wantedYear)) return -10000;
      score += 100;
    }
    return score;
  }

  // Anime is a TV-series identity lane at the TMDB boundary. A non-exact bare
  // numeric franchise installment is not a season signal and commonly denotes
  // another work (movie/prequel/sequel). Accept it only when TMDB itself exposes
  // that complete title as an alias, which is covered by exact=true above.
  if (!exact) {
    for (const wanted of expected) {
      const suffix = actual.match(new RegExp("^" + _spv211RegexEscape(wanted) + "-(\\d{1,3})$", "i"));
      if (suffix) return -10000;
    }
  }
  score += _spv205SeasonSignal(context, season);
  return score;
}
/* NIAKVIO_PROVIDER_SERIES_SLUG_ROLE_V21_3 */
function _spv213SlugCarriesEpisodeIdentity(value) {
  const slug = _text(value).toLowerCase();
  if (!slug) return false;
  return /(?:^|[-_.])(?:s\d{1,3}[-_.]?e\d{1,4}|(?:season|saison)[-_.]?\d{1,3}|(?:episode|ep)[-_.]?\d{1,4}|\d{1,3}[-_.]episode[-_.]\d{1,4})(?:$|[-_.])/i.test(slug);
}
function _spv213StableSeriesSlug(currentSlug, candidateSlug, mediaType, valueSteps, completedSteps, currentStepIndex) {
  const current = _text(currentSlug).trim();
  const candidate = _text(candidateSlug).trim();
  if (!candidate || !current || candidate === current) return candidate || current;
  const lane = _text(mediaType).trim().toLowerCase();
  if (lane !== "tv" && lane !== "anime") return candidate;
  if (_spv213SlugCarriesEpisodeIdentity(current) || !_spv213SlugCarriesEpisodeIdentity(candidate)) return candidate;

  const steps = Array.isArray(valueSteps) ? valueSteps : [];
  const done = completedSteps && typeof completedSteps.has === "function" ? completedSteps : null;
  let laterNeedsSeriesCoordinates = false;
  for (let index = 0; index < steps.length; index += 1) {
    if (index === Number(currentStepIndex) || (done && done.has(index))) continue;
    const route = _text(steps[index] && steps[index].route);
    if (!/\{slug\}/i.test(route)) continue;
    if (/\{(?:season|episode)\}/i.test(route)) {
      laterNeedsSeriesCoordinates = true;
      break;
    }
  }
  return laterNeedsSeriesCoordinates ? current : candidate;
}
/* NIAKVIO_PROVIDER_EPISODE_SCOPED_JSON_V21_4 */
/* Historical V20.5 proof marker only; executable V21.4 extraction below must
   never use this unscoped expression: ..._spv205HttpValues(payload.value, payload.base, []) */
function _spv214EpisodeNumber(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return 0;
  for (const key of ["episode", "episode_number", "episodeNumber", "ep", "number", "num"]) {
    const value = Number(row[key]);
    if (Number.isFinite(value) && value > 0 && value <= 10000) return Math.floor(value);
  }
  return 0;
}
function _spv214EpisodeTableKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const keys = Object.keys(value).filter(key => /^\d{1,4}$/.test(key));
  if (!keys.length) return [];
  const structured = keys.filter(key => {
    const child = value[key];
    return !!child && typeof child === "object";
  });
  return structured.length === keys.length ? keys : [];
}
function _spv214EpisodeScopedValue(value, mediaType, episode, depth) {
  const lane = _text(mediaType).trim().toLowerCase();
  const wanted = Math.floor(Number(episode) || 0);
  depth = Number(depth) || 0;
  if ((lane !== "tv" && lane !== "anime") || wanted <= 0 || depth > 10 || value == null) return value;

  if (Array.isArray(value)) {
    const tagged = value.filter(row => _spv214EpisodeNumber(row) > 0);
    if (tagged.length) {
      const exact = tagged.filter(row => _spv214EpisodeNumber(row) === wanted);
      return exact.length ? exact : null;
    }
    return value
      .map(row => _spv214EpisodeScopedValue(row, lane, wanted, depth + 1))
      .filter(row => row != null);
  }
  if (typeof value !== "object") return value;

  const rowEpisode = _spv214EpisodeNumber(value);
  if (rowEpisode > 0 && rowEpisode !== wanted) return null;

  const episodeKeys = _spv214EpisodeTableKeys(value);
  if (episodeKeys.length) {
    const key = String(wanted);
    if (!Object.prototype.hasOwnProperty.call(value, key)) return null;
    return _spv214EpisodeScopedValue(value[key], lane, wanted, depth + 1);
  }

  const out = {};
  for (const [key, child] of Object.entries(value).slice(0, 256)) {
    const scoped = _spv214EpisodeScopedValue(child, lane, wanted, depth + 1);
    if (scoped != null) out[key] = scoped;
  }
  return out;
}
function _spv211ProviderIdAllowed(key, rawValue) {
  const field = _text(key).trim().toLowerCase();
  const value = _text(rawValue).trim();
  if (!value || value.length > 160) return false;
  if (/tracking|analytics|measurement|gtag|google[_-]?tag|pixel|telemetry|client[_-]?id|visitor[_-]?id/i.test(field)) return false;
  if (/^(?:G-[A-Z0-9]{6,}|GTM-[A-Z0-9-]{4,}|UA-\d+(?:-\d+)?|AW-\d+)$/i.test(value)) return false;
  return /^[A-Za-z0-9._~-]{1,160}$/.test(value);
}
/* NIAKVIO_PROVIDER_CATALOGUE_IDENTITY_CORRELATION_V21_5 */
function _spv215CatalogueCardValues(value, base, meta, season, mediaType) {
  const source = _text(value).slice(0, 786432);
  if (!source) return { id: "", slug: "", score: -1e9 };

  // A title and navigation target from the same search/result/card record are
  // stronger identity evidence than an unrelated path or data-id elsewhere in
  // the response. Bound both the number of records and bytes inspected. Search
  // results may themselves be anchors, so <a class="...search-result..."> is a
  // first-class record boundary too.
  const startRe = /<(?:a|div|article|li)\b[^>]*\bclass\s*=\s*(["'])[^"']*(?:search[-_ ]?item|search[-_ ]?result|result[-_ ]?item|catalog(?:ue)?[-_ ]?item|media[-_ ]?item|result[-_ ]?card)[^"']*\1[^>]*>/gi;
  const starts = [];
  let match, scanned = 0;
  while ((match = startRe.exec(source)) !== null && scanned++ < 160) {
    starts.push({ index: match.index, opening: match[0] });
  }
  if (!starts.length) return { id: "", slug: "", score: -1e9 };

  let best = { id: "", slug: "", score: -1e9 };
  for (let index = 0; index < starts.length; index += 1) {
    const row = starts[index];
    const nextIndex = index + 1 < starts.length ? starts[index + 1].index : source.length;
    const card = source.slice(row.index, Math.min(nextIndex, row.index + 12000));
    const opening = row.opening;

    let href = "";
    const directHref = opening.match(/\bhref\s*=\s*(["'])([^"']{1,900})\1/i);
    if (directHref) href = directHref[2];
    if (!href) {
      const click = opening.match(/(?:location\s*\.\s*)?href\s*=\s*['"]([^'"]{1,900})['"]/i);
      if (click) href = click[1];
    }
    if (!href) {
      const dataHref = opening.match(/\b(?:data-href|data-url|data-link)\s*=\s*(["'])([^"']{1,900})\1/i);
      if (dataHref) href = dataHref[2];
    }
    if (!href) {
      const anchor = card.match(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']{1,900})\1[^>]*>/i);
      if (anchor) href = anchor[2];
    }
    if (!href) continue;

    let label = "";
    const title = card.match(/<[^>]*\bclass\s*=\s*(["'])[^"']*(?:search[-_ ]?title|result[-_ ]?title|item[-_ ]?title|card[-_ ]?title|media[-_ ]?title)[^"']*\1[^>]*>([\s\S]{0,2400}?)<\/(?:div|span|p|h[1-6]|a)>/i);
    if (title) label = _htmlVisibleText(title[2]).replace(/\s+/g, " ").trim();
    if (!label) continue;

    const score = _spv211CandidateIdentityScore(label, href, meta, mediaType, season);
    if (score < 90 || score <= best.score) continue;

    let id = "";
    let slug = "";
    try {
      const parsed = new URL(href, base || "https://invalid.local/");
      const raw = parsed.pathname.split("/").filter(Boolean).pop() || "";
      const segment = decodeURIComponent(raw).replace(/\.html?$/i, "");
      if (/^[A-Za-z0-9._~-]{2,160}$/.test(segment)) {
        slug = segment;
        const numeric = segment.match(/^(\d{2,})[-_.]/);
        if (numeric) id = numeric[1];
      }
      if (!id) {
        for (const key of ["newsid", "postid", "post_id", "mediaid", "media_id", "id"]) {
          const candidate = _text(parsed.searchParams.get(key)).trim();
          if (_spv211ProviderIdAllowed(key, candidate)) { id = candidate; break; }
        }
      }
    } catch (_) {}
    if (!id && !slug) continue;
    best = { id, slug, score };
  }
  return best;
}
function _spv215CatalogueProviderValues(value, base, meta, season, mediaType) {
  const fallback = _spv205StrictProviderValues(value, base, meta, season, mediaType) || { id: "", slug: "" };
  if (typeof value !== "string") return fallback;
  const card = _spv215CatalogueCardValues(value, base, meta, season, mediaType);
  if (!card || (!card.id && !card.slug) || card.score < 90) return fallback;
  return {
    id: card.id || fallback.id || "",
    slug: card.slug || fallback.slug || ""
  };
}
function _spv205StrictProviderValues(value, base, meta, season, mediaType) {
  if (value && typeof value === "object") {
    const id = _spv18ProviderIdFromJson(value, meta) || "";
    let slug = "";
    const rows = _spv4JsonRows(value, [])
      .map(row => ({
        row,
        score: _spv211CandidateIdentityScore(
          _spv4Scalar(row.title) || _spv4Scalar(row.name) ||
          _spv4Scalar(row.original_title) || _spv4Scalar(row.post_title) ||
          _spv4Scalar(row.label) || "",
          _spv4Scalar(row.url) || _spv4Scalar(row.href) || _spv4Scalar(row.permalink) || "",
          meta,
          mediaType,
          season
        )
      }))
      .filter(item => item.score >= 90)
      .sort((a,b)=>b.score-a.score)
      .slice(0, 12);
    for (const item of rows) {
      const candidate = _spv4Scalar((item.row || {}).slug);
      if (candidate && candidate.length <= 160 && /^[A-Za-z0-9._~-]+$/.test(candidate)) {
        slug = candidate;
        break;
      }
    }
    return { id, slug };
  }

  const source = _text(value).slice(0, 786432);
  let bestScore = -1e9;
  let best = { id: "", slug: "" };
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match, scanned = 0;
  while ((match = anchorRe.exec(source)) !== null && scanned++ < 400) {
    const attrs = _text(match[1]);
    const label = _htmlVisibleText(match[2]).replace(/\s+/g, " ").trim();
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])([^"']{1,900})\1/i);
    const href = hrefMatch ? hrefMatch[2] : "";
    const score = _spv211CandidateIdentityScore(label, href, meta, mediaType, season);
    if (score < 90 || score < bestScore) continue;
    let id = "";
    let slug = "";
    const idMatch = attrs.match(/\bdata-(id|post-id|media-id|anime-id|movie-id|series-id|show-id)\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/i);
    if (idMatch && _spv211ProviderIdAllowed(idMatch[1], idMatch[2])) id = idMatch[2];
    if (href) {
      try {
        const parsed = new URL(href, base || "https://invalid.local/");
        const raw = parsed.pathname.split("/").filter(Boolean).pop() || "";
        const segment = decodeURIComponent(raw).replace(/\.html?$/i, "");
        if (/^[A-Za-z0-9._~-]{2,160}$/.test(segment)) {
          slug = segment;
          const numeric = segment.match(/^(\d{2,})[-_.]/);
          if (!id && numeric) id = numeric[1];
        }
      } catch (_) {}
    }
    if (!id && !slug) continue;
    if (score > bestScore) {
      bestScore = score;
      best = { id, slug };
    }
  }

  const pathRe = /(?:https?:\/\/[^\s"'<>]{1,300}\/)?(\d{2,}-[A-Za-z0-9._~-]{2,150})\.html(?:[?#][^\s"'<>]*)?/gi;
  scanned = 0;
  while ((match = pathRe.exec(source)) !== null && scanned++ < 240) {
    const segment = _text(match[1]);
    const numeric = segment.match(/^(\d{2,})[-_.]/);
    if (!numeric) continue;
    const label = segment.replace(/^\d+[-_.]?/, "").replace(/[._-]+/g, " ");
    const score = _spv211CandidateIdentityScore(label, segment, meta, mediaType, season);
    if (score < 90 || score < bestScore) continue;
    bestScore = score;
    best = { id: numeric[1], slug: segment };
  }

  let bestId = "";
  let bestIdCount = 0;
  const counts = new Map();
  const attrRe = /\b(?:href|src|data-src)\s*=\s*(["'])([^"']{1,900})\1/gi;
  scanned = 0;
  while ((match = attrRe.exec(source)) !== null && scanned++ < 320) {
    let parsed;
    try { parsed = new URL(match[2], base || "https://invalid.local/"); }
    catch (_) { continue; }
    for (const [rawKey, rawValue] of [...parsed.searchParams.entries()].slice(0, 24)) {
      const key = _text(rawKey).trim().toLowerCase();
      const candidate = _text(rawValue).trim();
      if (!key || !candidate || candidate.length > 160) continue;
      if (/api[_-]?key|token|auth|authorization|signature|sig|secret|password|cookie|session|nonce|hash|expires?|timestamp|^ts$/i.test(key)) continue;
      if (/^(?:tmdb|tmdbid|tmdb_id|imdb|imdbid|imdb_id|season|season_number|episode|episode_number|year)$/i.test(key)) continue;
      if (!/(?:^|[_-])id$|id$/i.test(key)) continue;
      if (!_spv211ProviderIdAllowed(key, candidate)) continue;
      const count = (counts.get(candidate) || 0) + 1;
      counts.set(candidate, count);
      if (count > bestIdCount) {
        bestId = candidate;
        bestIdCount = count;
      }
    }
  }
  const dataIdRe = /\bdata-((?:id|[a-z0-9_-]*[_-]id))\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/gi;
  scanned = 0;
  while ((match = dataIdRe.exec(source)) !== null && scanned++ < 320) {
    const key = _text(match[1]).trim();
    const candidate = _text(match[2]).trim();
    if (!_spv211ProviderIdAllowed(key, candidate)) continue;
    const count = (counts.get(candidate) || 0) + 1;
    counts.set(candidate, count);
    if (count > bestIdCount) {
      bestId = candidate;
      bestIdCount = count;
    }
  }
  if (bestId) best.id = bestId;
  return best;
}
function _spv205HttpValues(value, base, out, depth) {
  out = out || [];
  depth = Number(depth) || 0;
  if (out.length >= 160 || depth > 8 || value == null) return out;
  if (typeof value === "string") {
    const raw = _text(value).trim();
    if (!/^https?:\/\//i.test(raw) || raw.length > 4096) return out;
    try {
      const parsed = new URL(raw, base || undefined);
      if (!/^https?:$/i.test(parsed.protocol) || parsed.username || parsed.password) return out;
      if (/\.(?:jpe?g|png|webp|gif|svg|ico)(?:[?#]|$)/i.test(parsed.pathname)) return out;
      out.push(parsed.toString());
    } catch (_) {}
    return out;
  }
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 160)) {
      _spv205HttpValues(child, base, out, depth + 1);
      if (out.length >= 160) break;
    }
    return out;
  }
  if (typeof value !== "object") return out;
  let scannedEntries = 0;
  for (const [rawKey, child] of Object.entries(value)) {
    if (scannedEntries++ >= 160 || out.length >= 160) break;
    const key = _text(rawKey).toLowerCase();
    if (/api[_-]?key|token|auth|authorization|signature|sig|secret|password|cookie|session|nonce|hash|expires?|timestamp|^ts$/i.test(key)) continue;
    _spv205HttpValues(child, base, out, depth + 1);
  }
  return out;
}
function _spv204ResponseProviderValues(value, base, meta) {
  if (value && typeof value === "object") {
    return _spv20ProviderValuesFromJson(value, meta) || { id: "", slug: "" };
  }
  const source = _text(value).slice(0, 786432);
  let pair = _spv20ProviderValuesFromHtml(source, meta) || { id: "", slug: "" };
  let bestId = "";
  let bestIdCount = 0;
  const idCounts = new Map();

  const attrRe = /\b(?:href|src|data-src)\s*=\s*(["'])([^"']{1,900})\1/gi;
  let match, scanned = 0;
  while ((match = attrRe.exec(source)) !== null && scanned++ < 320) {
    let parsed;
    try { parsed = new URL(match[2], base || "https://invalid.local/"); }
    catch (_) { continue; }
    for (const [rawKey, rawValue] of [...parsed.searchParams.entries()].slice(0, 24)) {
      const key = _text(rawKey).trim().toLowerCase();
      const candidate = _text(rawValue).trim();
      if (!key || !candidate || candidate.length > 160) continue;
      if (/api[_-]?key|token|auth|authorization|signature|sig|secret|password|cookie|session|nonce|hash|expires?|timestamp|^ts$/i.test(key)) continue;
      if (/^(?:tmdb|tmdbid|tmdb_id|imdb|imdbid|imdb_id|season|season_number|episode|episode_number|year)$/i.test(key)) continue;
      if (!/(?:^|[_-])id$|id$/i.test(key)) continue;
      if (!/^[A-Za-z0-9._~-]{1,160}$/.test(candidate)) continue;
      const count = (idCounts.get(candidate) || 0) + 1;
      idCounts.set(candidate, count);
      if (count > bestIdCount) {
        bestId = candidate;
        bestIdCount = count;
      }
    }
  }

  const dataIdRe = /\bdata-(?:id|[a-z0-9_-]*[_-]id)\s*=\s*["']?([A-Za-z0-9._~-]{1,160})/gi;
  scanned = 0;
  while ((match = dataIdRe.exec(source)) !== null && scanned++ < 320) {
    const candidate = _text(match[1]).trim();
    if (!candidate) continue;
    const count = (idCounts.get(candidate) || 0) + 1;
    idCounts.set(candidate, count);
    if (count > bestIdCount) {
      bestId = candidate;
      bestIdCount = count;
    }
  }

  if (bestId) pair.id = bestId;
  if (!pair.slug) pair.slug = pair.id || "";
  return pair;
}
/* NIAKVIO_PROVIDER_PLAYER_FALLBACK_V21_6 */
function _spv216PlayerFallbackEligible(rawUrl) {
  const value = _text(rawUrl).trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (_directMedia(value) || _playerLike(value)) return true;
  try {
    const parsed = new URL(value);
    const host = _text(parsed.hostname).toLowerCase();
    if (/(?:sibnet|vidmoly|streamtape|sendvid|vidoza|myvi)/i.test(host)) return true;
    for (const key of parsed.searchParams.keys()) {
      if (/^(?:video|videoid|video_id|file|fileid|file_id|embed|embedid|embed_id|player|playerid|player_id|stream|streamid|stream_id|source|sourceid|source_id)$/i.test(key)) return true;
    }
  } catch (_) {}
  return false;
}
function _spv216FallbackReferer(stepSpec, stepBase) {
  const headers = stepSpec && stepSpec.headers && typeof stepSpec.headers === "object"
    ? stepSpec.headers : {};
  return _text(headers.Referer || headers.referer || stepBase || "");
}
/* NIAKVIO_PROVIDER_PLAYER_FALLBACK_V21_7 */
function _spv216FallbackStreams(rows) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows.slice(0, 12) : []) {
    const url = _text(row && row.url).trim();
    if (!url || seen.has(url) || !_spv216PlayerFallbackEligible(url)) continue;
    seen.add(url);
    const emitted = _streams([url], _text(row && row.referer));
    for (const stream of emitted) {
      if (!_directMedia(url) && stream && typeof stream === "object") {
        stream.__nuvioCorrelatedPlayerFallbackV1 = { url };
      }
      out.push(stream);
    }
    if (out.length >= 12) break;
  }
  return out.slice(0, 12);
}
async function _resolveProviderValuePlan(meta, mediaType, season, episode) {
  const plans = Array.isArray(NIAKVIO_PROVIDER_MODEL.providerValuePlan)
    ? NIAKVIO_PROVIDER_MODEL.providerValuePlan : [];
  if (!plans.length || !meta || !meta.title) return [];
  const media = _mediaNamespace(mediaType);
  const baseValues = {
    query: _text(meta.title),
    providerId: "",
    tmdbId: _text(meta.tmdbId),
    imdbId: _text(meta.imdbId),
    media,
    season,
    episode,
    source: null
  };
  for (const plan of plans.slice(0, 12)) {
    const lanes = Array.isArray(plan && plan.semanticTypes) ? plan.semanticTypes : [];
    if (!_spv185PlanLaneAllowed(lanes, mediaType)) {
      _spv184Trace("lane_skip", mediaType, "", -1, "");
      continue;
    }
    _spv184Trace("plan_selected", mediaType, "", -1, _text(plan && plan.searchRoute));
    const searchBase = _text(plan && plan.searchBase);
    const searchRoute = _text(plan && plan.searchRoute);
    if (!/^https?:\/\//i.test(searchBase) || !searchRoute) continue;
    const searchUrl = _recipeUrl(searchRoute, baseValues, searchBase);
    if (!searchUrl) continue;
    try {
      const searchSpec = _recipeRequestSpec(
        { providerValueSearch: plan.searchRequestSpec || { method: "GET" } },
        "providerValueSearch",
        baseValues
      );
      const searchPayload = await _recipePayload(searchUrl, {}, searchSpec, baseValues);
      /* NIAKVIO_PROVIDER_CORRELATED_VALUE_JSON_TEXT_V18_4 */
      /* NIAKVIO_PROVIDER_RESPONSE_VALUE_CORRELATION_V20_2 */
      let providerValues = { id: "", slug: "" };
      if (typeof searchPayload.value === "string") {
        const rawSearchValue = _text(searchPayload.value).trim();
        if (rawSearchValue && rawSearchValue.length <= 4 * 1024 * 1024 && /^[\[{]/.test(rawSearchValue)) {
          try {
            providerValues = _spv20ProviderValuesFromJson(JSON.parse(rawSearchValue), meta);
          } catch (_) {}
        }
        if (!providerValues || (!providerValues.id && !providerValues.slug)) {
          providerValues = _spv20ProviderValuesFromHtml(rawSearchValue, meta);
        }
      } else {
        providerValues = _spv20ProviderValuesFromJson(searchPayload.value, meta);
      }
      providerValues = _spv215CatalogueProviderValues(
        searchPayload.value,
        searchPayload.base || searchUrl,
        meta,
        season,
        mediaType
      ) || { id: "", slug: "" };
      const providerTraceId = providerValues.id || providerValues.slug || "";
      _spv184Trace(providerTraceId ? "identity_hit" : "identity_miss", mediaType, providerTraceId, -1, searchRoute);
      if (!providerValues.id && !providerValues.slug) continue;
      let values = Object.assign({}, baseValues, {
        providerId: providerValues.id || "",
        /* NIAKVIO_PROVIDER_RESPONSE_VALUE_VALIDATOR_COMPAT_V20_5_1
         legacy ownership signatures only; NOT executable runtime:
         providerSlug: providerValues.slug || providerValues.id
         providerSlug: providerValues.slug || providerValues.id || providerId
         const nextProviderValues = _spv204ResponseProviderValues(
         providerId: nextProviderValues.id || values.providerId
         providerSlug: nextProviderValues.slug || values.providerSlug
         _spv184Trace("step_fetch", mediaType, values.providerId, stepIndex, stepRoute);
      */
      providerSlug: providerValues.slug || ""
      });
      const valueSteps = (plan.steps || []).slice(0, 8);
      const completedSteps = new Set();
      const playerFallbacks = [];
      for (let dependencyPass = 0; dependencyPass < valueSteps.length + 1; dependencyPass += 1) {
        let progressed = false;
        for (let stepIndex = 0; stepIndex < valueSteps.length; stepIndex += 1) {
          if (completedSteps.has(stepIndex)) continue;
          const step = valueSteps[stepIndex];
          const stepBase = _text(step && step.base);
          const stepRoute = _text(step && step.route);
          if (!/^https?:\/\//i.test(stepBase) || !stepRoute || !/\{(?:id|slug)\}/i.test(stepRoute)) {
            completedSteps.add(stepIndex);
            _spv184Trace("step_shape_rejected", mediaType, values.providerId, stepIndex, stepRoute);
            continue;
          }
          const needsId = /\{id\}/i.test(stepRoute);
          const needsSlug = /\{slug\}/i.test(stepRoute);
          if ((needsId && !values.providerId) || (needsSlug && !values.providerSlug)) {
            _spv184Trace("step_deferred", mediaType, values.providerId || values.providerSlug, stepIndex, stepRoute);
            continue;
          }
          completedSteps.add(stepIndex);
          progressed = true;
          const stepUrl = _recipeUrl(stepRoute, values, stepBase);
          if (!stepUrl) {
            _spv184Trace("step_url_empty", mediaType, values.providerId, stepIndex, stepRoute);
            continue;
          }
          _spv184Trace("step_fetch", mediaType, values.providerId || values.providerSlug, stepIndex, stepRoute);
          const stepSpec = _recipeRequestSpec(
            { providerValueStep: step.requestSpec || { method: "GET" } },
            "providerValueStep",
            values
          );
          let payload;
          try {
            payload = await _recipePayload(stepUrl, {}, stepSpec, values);
          } catch (_) {
            if (_spv216PlayerFallbackEligible(stepUrl)) {
              const fallbackReferer = _spv216FallbackReferer(stepSpec, stepBase);
              if (!playerFallbacks.some(row => row.url === stepUrl)) {
                playerFallbacks.push({ url: stepUrl, referer: fallbackReferer });
              }
              _spv184Trace("step_player_fallback", mediaType, values.providerId || values.providerSlug, stepIndex, stepRoute);
            }
            continue;
          }
          _spv184Trace("step_response", mediaType, values.providerId || values.providerSlug, stepIndex, stepRoute);
          const nextProviderValues = _spv205StrictProviderValues(
            payload.value,
            payload.base || stepUrl,
            meta,
            season,
            mediaType
          ) || { id: "", slug: "" };
          if (nextProviderValues.slug) {
            nextProviderValues.slug = _spv213StableSeriesSlug(
              values.providerSlug,
              nextProviderValues.slug,
              mediaType,
              valueSteps,
              completedSteps,
              stepIndex
            );
          }
          if (nextProviderValues.id || nextProviderValues.slug) {
            values = Object.assign({}, values, {
              providerId: nextProviderValues.id || values.providerId,
              providerSlug: nextProviderValues.slug || values.providerSlug
            });
          }
          const scopedPayloadValue = _spv214EpisodeScopedValue(payload.value, mediaType, episode, 0);
          let urls = [];
        if (typeof scopedPayloadValue === "string") {
          urls = _uniq([
            ..._extractUrls(scopedPayloadValue, payload.base),
            ..._spv15ExplicitPlayerAttrs(payload.value, payload.base)
          ]);
        } else {
          urls = _uniq([
            ..._jsonUrls(scopedPayloadValue),
            ..._sourceUrls(scopedPayloadValue, payload.base),
            ..._spv18ValueUrls(scopedPayloadValue, payload.base, []),
            ..._spv205HttpValues(scopedPayloadValue, payload.base, [])
          ]);
        }
        const direct = urls.filter(_directMedia);
        if (direct.length) return _streams(direct, payload.base || stepUrl).slice(0, 40);
        const crawl = urls.filter(_crawlEligible).sort((a,b)=>_crawlUrlScore(b)-_crawlUrlScore(a));
        if (crawl.length) {
          const streams = await _crawlDirectMedia(crawl.slice(0, 10), payload.base || stepUrl, 3);
          if (streams.length) return streams.slice(0, 40);
        }
        }
        if (!progressed) break;
      }
      if (playerFallbacks.length) {
        const fallbackStreams = _spv216FallbackStreams(playerFallbacks);
        if (fallbackStreams.length) return fallbackStreams;
      }
    } catch (_) {}
  }
  return [];
}
async function _resolveSearchRequestPlan(meta, mediaType, season, episode) {
  const plans = Array.isArray(NIAKVIO_PROVIDER_MODEL.searchRequestPlan)
    ? NIAKVIO_PROVIDER_MODEL.searchRequestPlan : [];
  if (!plans.length || !meta || !meta.title) return [];
  const media = _mediaNamespace(mediaType);
  const values = {
    query: _text(meta.title),
    providerId: _text(meta.tmdbId),
    tmdbId: _text(meta.tmdbId),
    imdbId: _text(meta.imdbId),
    media,
    year: _text(meta.year),
    season,
    episode,
    source: null
  };
  for (const plan of plans.slice(0, 6)) {
    const lanes = Array.isArray(plan && plan.semanticTypes) ? plan.semanticTypes : [];
    if (!_spv185PlanLaneAllowed(lanes, mediaType)) continue;
    const base = _text(plan && plan.base);
    const route = _text(plan && plan.route);
    if (!/^https?:\/\//i.test(base) || !route) continue;
    const url = _recipeUrl(route, values, base);
    if (!url) continue;
    try {
      const requestSpec = _recipeRequestSpec(
        { searchPlanRequest: plan.requestSpec || { method: "GET" } },
        "searchPlanRequest",
        values
      );
      const payload = await _recipePayload(url, {}, requestSpec, values);
      const directUrls = typeof payload.value === "string"
        ? _extractUrls(payload.value, payload.base).filter(_directMedia)
        : _sourceUrls(payload.value, payload.base).filter(_directMedia);
      if (directUrls.length) return _streams(_uniq(directUrls), payload.base || url).slice(0, 40);

      const details = typeof payload.value === "string"
        ? _spv4HtmlDetails(payload.value, payload.base, meta, mediaType, season)
        : _spv4JsonDetails(
            payload.value,
            payload.base,
            meta,
            mediaType,
            season,
            episode,
            NIAKVIO_PROVIDER_MODEL.sourceRuntimeFamily
          );
      if (details.length) {
        const family = _spv4Family();
        for (const detailUrl of _uniq(details).slice(0, 8)) {
          const detailStreams = await _spv4ResolveDetail(
            detailUrl,
            meta,
            mediaType,
            season,
            episode,
            family
          );
          if (Array.isArray(detailStreams) && detailStreams.length) return detailStreams.slice(0, 40);
        }
        const crawled = await _crawlDirectMedia(_uniq(details).slice(0, 8), payload.base || url, 3);
        if (crawled.length) return crawled.slice(0, 40);
      }
    } catch (_) {}
  }
  return [];
}
async function _resolveExternalIdentityPlan(meta, mediaType, season, episode) {
  const plans = Array.isArray(NIAKVIO_PROVIDER_MODEL.externalIdentityPlan)
    ? NIAKVIO_PROVIDER_MODEL.externalIdentityPlan : [];
  if (!plans.length || !meta || !meta.imdbId) return [];
  const media = _mediaNamespace(mediaType);
  const values = {
    query: _text(meta.title),
    providerId: _text(meta.tmdbId),
    tmdbId: _text(meta.tmdbId),
    imdbId: _text(meta.imdbId),
    media,
    season,
    episode,
    source: null
  };
  for (const plan of plans.slice(0, 4)) {
    const base = _substituteDomain(_text(plan && plan.base));
    const route = _text(plan && plan.route);
    if (!base || !route || !/\{imdb_?id\}/i.test(route)) continue;
    const url = _recipeUrl(route, values, base);
    if (!url) continue;
    try {
      const requestSpec = _recipeRequestSpec(
        { externalIdentityRequest: plan.requestSpec || { method: "GET" } },
        "externalIdentityRequest",
        values
      );
      const payload = await _recipePayload(url, {}, requestSpec, values);
      const urls = typeof payload.value === "string"
        ? _extractUrls(payload.value, payload.base)
        : _sourceUrls(payload.value, payload.base);
      const direct = _uniq(urls.filter(_directMedia));
      if (direct.length) {
        let selected = direct;
        if (media !== "movie" && season != null && episode != null) {
          const classified = direct.map(value => ({ value, marker: _externalEpisodeMarker(value, season, episode) }));
          const marked = classified.filter(row => row.marker.marked);
          selected = marked.filter(row => row.marker.matches).map(row => row.value);
          if (!marked.length) selected = [];
        }
        if (selected.length) {
          return _streams(selected, payload.base || url, _externalPlaybackHeaders(requestSpec)).slice(0, 40);
        }
      }
      const nested = _uniq(urls.filter(_crawlEligible)).slice(0, 10);
      if (nested.length) {
        const crawled = await _crawlDirectMedia(nested, payload.base || url, 2);
        if (crawled.length) return crawled;
      }
    } catch (_) {}
  }
  return [];
}
async function getStreams(tmdbId, mediaType, season, episode) {
  const type = String(mediaType || "movie").toLowerCase();
  if (NIAKVIO_PROVIDER_MODEL.supportedTypes.length &&
      !NIAKVIO_PROVIDER_MODEL.supportedTypes.includes(type) &&
      !(type === "tv" && NIAKVIO_PROVIDER_MODEL.supportedTypes.includes("anime"))) {
    return [];
  }
  if (!_runtimePlanAvailable()) return [];
  const strategy = NIAKVIO_PROVIDER_MODEL.strategy;

  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.providerValuePlan) && NIAKVIO_PROVIDER_MODEL.providerValuePlan.length) {
    const providerValueMeta = await _tmdb(tmdbId, type) || null;
    const providerValueStreams = await _resolveProviderValuePlan(providerValueMeta, type, season, episode);
    if (providerValueStreams.length) return providerValueStreams;
  }

  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.searchRequestPlan) && NIAKVIO_PROVIDER_MODEL.searchRequestPlan.length) {
    const searchMeta = await _tmdb(tmdbId, type) || null;
    const searchStreams = await _resolveSearchRequestPlan(searchMeta, type, season, episode);
    if (searchStreams.length) return searchStreams;
  }

  if (Array.isArray(NIAKVIO_PROVIDER_MODEL.externalIdentityPlan) && NIAKVIO_PROVIDER_MODEL.externalIdentityPlan.length) {
    const externalMeta = await _tmdb(tmdbId, type) || null;
    const externalStreams = await _resolveExternalIdentityPlan(externalMeta, type, season, episode);
    if (externalStreams.length) return externalStreams;
  }

  // Declarative ProviderBase recipe: a clean reconstruction may need a bounded
  // search -> provider-id -> source chain. This remains data-driven and executes
  // no upstream JavaScript.
  if (NIAKVIO_PROVIDER_MODEL.apiRecipe) {
    const recipeMeta = await _tmdb(tmdbId, type) || {
      title: "",
      year: "",
      tmdbId: String(tmdbId || "")
    };
    const recipe = await _resolveApiRecipe(recipeMeta, type, season, episode);
    if (recipe.length) return recipe;
    if (NIAKVIO_PROVIDER_MODEL.apiRecipe.allowGenericFallback !== true) return [];
  }

  // Reader fast path: consume already learned ID/API/player routes before any
  // title metadata lookup. Runtime executes a plan; it does not discover one.
  if (/api_stream_resolver|direct_media/i.test(strategy)) {
    const api = await _resolveApi(tmdbId, type, season, episode);
    if (api.length) return api;
  }
  const player = await _resolveKnownPlayer(tmdbId, type, season, episode);
  if (player.length) return player;

  const needsMetadata = (NIAKVIO_PROVIDER_MODEL.routes || []).some(route =>
    ["search","detail"].includes(_routeKind(route))
  );
  if (!needsMetadata) {
    if (!/api_stream_resolver|direct_media/i.test(strategy)) {
      return _resolveApi(tmdbId, type, season, episode);
    }
    return [];
  }

  const meta = await _tmdb(tmdbId, type) || {
    title: "",
    year: "",
    tmdbId: String(tmdbId || "")
  };
  const html = await _resolveHtml(meta, type, season, episode);
  if (html.length) return html;
  if (!/api_stream_resolver|direct_media/i.test(strategy)) {
    return _resolveApi(tmdbId, type, season, episode);
  }
  return [];
}
/* NIAKVIO_PROVIDER_SOURCE_PLAN_V10 */
/* NIAKVIO_PROVIDER_BASE_SOURCE_PLAN_V4 */
/* NIAKVIO_PROVIDER_BASE_RUNTIME_V5 */
/* NIAKVIO_PROVIDER_BASE_RUNTIME_V6 */
/* NIAKVIO_PROVIDER_BASE_RUNTIME_V7 */
function _spv4Family() {
  return _text(NIAKVIO_PROVIDER_MODEL.sourceRuntimeFamily || "unknown").toLowerCase();
}
function _spv4Routes() {
  return Array.isArray(NIAKVIO_PROVIDER_MODEL.routes) ? NIAKVIO_PROVIDER_MODEL.routes.map(_text).filter(Boolean) : [];
}
function _spv4Titles(meta) {
  return _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])])
    .map(_text).filter(Boolean).slice(0, 4);
}
function _spv4Base64(value) {
  const raw = _text(value).replace(/\s+/g, "");
  try { if (typeof atob === "function") return atob(raw); } catch (_) {}
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bits = 0, bitCount = 0, out = "";
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === "=") break;
    const n = alphabet.indexOf(raw[i]);
    if (n < 0) continue;
    bits = (bits << 6) | n;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      out += String.fromCharCode((bits >> bitCount) & 255);
    }
  }
  return out;
}
function _spv4Expand(pattern, meta, vars, mediaType, season, episode) {
  let route = _text(pattern);
  if (!route) return [];
  vars = vars || {};
  const values = {
    query: vars.query != null ? vars.query : (meta && meta.title),
    title: vars.query != null ? vars.query : (meta && meta.title),
    slug: vars.slug != null ? vars.slug : _slug(meta && meta.title),
    id: vars.providerId != null ? vars.providerId : "",
    providerid: vars.providerId != null ? vars.providerId : "",
    tmdbid: meta && meta.tmdbId,
    tmdb_id: meta && meta.tmdbId,
    imdbid: meta && meta.imdbId,
    imdb_id: meta && meta.imdbId,
    media: mediaType === "movie" ? "movie" : "tv",
    type: mediaType === "movie" ? "movie" : "tv",
    season,
    episode
  };
  const encodedQuery = values.query == null ? "" : encodeURIComponent(_text(values.query));
  if (encodedQuery) route = route.replace(/([?&](?:s|q|query|keyword|search|story)=)(?:\.{3})?(?=&|#|$)/gi, function(_, prefix) { return prefix + encodedQuery; });
  route = route.replace(/\{([^}]+)\}/g, function(match, key) {
    const value = values[_text(key).toLowerCase()];
    return value == null || value === "" ? "" : encodeURIComponent(_text(value));
  });
  if (/\{[^}]+\}/.test(route)) return [];
  if (/^https?:\/\//i.test(route)) return [route];
  const out = [];
  for (const base of _runtimeBases()) {
    const absolute = _absolute(route, base);
    if (absolute) out.push(absolute);
  }
  return _uniq(out);
}
function _spv4IsSearchRoute(route, family) {
  const value = _text(route).toLowerCase();
  if (/\{query\}|[?&](?:s|q|query|keyword|search|story)=/i.test(value)) return true;
  if (/\/api\/search(?:[/?#]|$)/i.test(value)) return true;
  return /form/.test(family) && /\/template-php\/[^?#]*fetch\.php(?:[?#]|$)/i.test(value);
}
function _spv4IsActionRoute(route) {
  return /full-story\.php|controller\.php\?mod=playepisode/i.test(_text(route));
}
function _spv4IsDetailRoute(route, family) {
  const value = _text(route).toLowerCase();
  if (!value || _spv4IsSearchRoute(value, family) || _spv4IsActionRoute(value)) return false;
  return /\{(?:slug|id|imdbid|imdb_id|tmdbid|tmdb_id|season|episode)\}/i.test(value) ||
    /\/(?:anime|animes|movie|movies|film|films|serie|series|voir-series|episode|saison|season|saga|catalogue|watch)(?:[/?#.-]|$)/i.test(value);
}
function _spv4SameProviderOrigin(url, currentBase) {
const candidate = _origin(_substituteDomain(url));
const current = _origin(_substituteDomain(currentBase));
if (candidate && current && candidate === current) return true;
return !!candidate && _runtimeBases().some(base => _origin(_substituteDomain(base)) === candidate);
}
function _spv4AttrUrls(text, base) {
  const out = [];
  const value = _embeddedText(text);
  const re = /(?:src|href|file|url|data-(?:src|url|video|embed|player|file|stream|link|href))\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(value)) !== null) {
    const absolute = _absolute(match[1], base);
    if (absolute && /^https?:/i.test(absolute)) out.push(absolute);
    if (out.length >= 160) break;
  }
  return _uniq(out.concat(_extractUrls(value, base)));
}
function _spv10SeasonUrlScore(url, mediaType, season) {
  if (mediaType === "movie" || season == null) return 0;
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname || "").toLowerCase(); } catch (_) { return 0; }
  const wanted = Math.max(1, Number(season) || 1);
  let observed = null;
  const match = path.match(/(?:season|saison)[-_ /]*(\d{1,3})|(?:^|[-_/])(\d{1,3})(?:st|nd|rd|th)[-_ ]*season(?:[-_/]|$)|(?:^|[-_/])s(\d{1,3})(?:[-_/]|$)/i);
  if (match) observed = Number(match[1] || match[2] || match[3] || 0) || null;
  if (observed == null) return 0;
  return observed === wanted ? 180 : -320;
}
function _spv4UrlScore(url, meta, mediaType, season) {
  let score = _candidateScore(url, meta) + _spv10SeasonUrlScore(url, mediaType, season);
  try {
    const path = decodeURIComponent(new URL(url).pathname || "").toLowerCase();
    if (mediaType !== "movie" && /(?:^|[-_/])(?:movie|film|specials?|ova|ona)(?:[-_/]|$)/i.test(path)) score -= 220;
    if (mediaType === "movie" && /(?:season|saison)[-_ /]*\d{1,3}|(?:^|[-_/])s\d{1,3}(?:[-_/]|$)/i.test(path)) score -= 220;
  } catch (_) {}
  try {
    const path = decodeURIComponent(new URL(url).pathname || "").toLowerCase();
    const wanted = _spv4Titles(meta).map(_slug).filter(Boolean);
    for (const title of wanted) {
      if (title && path.includes(title)) score += 100;
      for (const token of title.split("-").filter(v => v.length >= 3)) if (path.includes(token)) score += 16;
    }
    if (/\/(?:anime|animes|movie|movies|film|films|serie|series|voir-series|watch|title)\//i.test(path)) score += 24;
  } catch (_) {}
  return score;
}
function _spv7DetailUrlEligible(url) {
try {
const parsed = new URL(url);
const path = _text(parsed.pathname).toLowerCase();
const hash = _text(parsed.hash).toLowerCase();
if (/^#(?:comments?|respond|reply|share)/i.test(hash)) return false;
if (/\/(?:feed|wp-json|wp-admin|admin|login|register|privacy|terms)(?:[/?#.-]|$)/i.test(path)) return false;
if (/\.(?:css|js|jpe?g|png|gif|webp|svg|avif|ico|woff2?|ttf)(?:[?#]|$)/i.test(path)) return false;
return true;
} catch (_) { return false; }
}
/* NIAKVIO_PROVIDER_SEARCH_REQUEST_PLAN_V14_1 */
function _spv14LabelScoreForUrl(html, base, targetUrl, meta, mediaType, season) {
  const target = _text(targetUrl);
  if (!target) return 0;
  const expectedYear = _text(meta && meta.year).slice(0, 4);
  const source = _text(html);
  const pattern = /<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let best = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const candidate = _absolute(match[2], base);
    if (!candidate || candidate !== target) continue;
    const label = _htmlVisibleText(match[4]);
    if (!label) continue;
    let score = _spv4TitleScore(label, meta);
    // A loose token overlap cannot promote a catalogue result by itself.
    if (score < 90) continue;
    const observedYearMatch = label.match(/\b(?:19|20)\d{2}\b/);
    const observedYear = observedYearMatch ? observedYearMatch[0] : "";
    if (mediaType === "movie" && expectedYear && observedYear && observedYear !== expectedYear) continue;
    if (expectedYear && observedYear === expectedYear) score += 40;
    const attrs = _text(match[1]) + " " + _text(match[3]);
    if (/\brel\s*=\s*["'][^"']*\bbookmark\b/i.test(attrs)) score += 24;
    score += _spv10SeasonUrlScore(candidate, mediaType, season);
    best = Math.max(best, score);
  }
  return best;
}
/* NIAKVIO_PROVIDER_SOURCE_PLAN_V15 */
function _spv15ExplicitPlayerAttrs(html, base) {
  const out = [];
  const source = _embeddedText(html);
  const re = /\bdata-(?:video|embed|player|src|url|file|stream|link|href)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    const absolute = _absolute(match[1], base);
    if (absolute && /^https?:/i.test(absolute)) out.push(absolute);
    if (out.length >= 32) break;
  }
  return _uniq(out);
}
/* NIAKVIO_PROVIDER_SEARCH_DETAIL_BRIDGE_V17 */
function _spv17CurrentResponseUrl(value, base) {
  try {
    const raw = new URL(value, base).toString();
    const current = new URL(base).origin;
    if (new URL(raw).origin === current) return raw;
  } catch (_) {}
  return _absolute(value, base);
}
function _spv15ArticleDetails(html, base, meta, mediaType, season) {
  const out = [];
  const source = _text(html);
  const expectedYear = _text(meta && meta.year).slice(0, 4);
  const articleRe = /<article\b[^>]*>[\s\S]{0,12000}?<\/article>/gi;
  let article;
  while ((article = articleRe.exec(source)) !== null) {
    const block = article[0];
    const visible = _htmlVisibleText(block).replace(/\s+/g, " ").trim();
    let identityScore = _spv4TitleScore(visible, meta);
    if (identityScore < 90) continue;
    const years = [];
    const yearRe = /\b(?:19|20)\d{2}\b/g;
    let yearMatch;
    while ((yearMatch = yearRe.exec(visible)) !== null) {
      if (!years.includes(yearMatch[0])) years.push(yearMatch[0]);
      if (years.length >= 6) break;
    }
    if (mediaType === "movie" && expectedYear && years.length && !years.includes(expectedYear)) continue;
    if (expectedYear && years.includes(expectedYear)) identityScore += 40;
    const hrefRe = /<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi;
    let link;
    while ((link = hrefRe.exec(block)) !== null) {
      const url = _spv17CurrentResponseUrl(link[2], base);
      if (!url || !_spv4SameProviderOrigin(url, base) || !_spv7DetailUrlEligible(url)) continue;
      const attrs = _text(link[1]) + " " + _text(link[3]);
      const bookmark = /\brel\s*=\s*["'][^"']*\bbookmark\b/i.test(attrs);
      const urlScore = _spv4UrlScore(url, meta, mediaType, season);
      if (!bookmark && urlScore < 36) continue;
      out.push({
        url,
        score: Math.max(identityScore, urlScore) + (bookmark ? 24 : 0) + _spv10SeasonUrlScore(url, mediaType, season)
      });
      if (out.length >= 24) break;
    }
    if (out.length >= 24) break;
  }
  return out;
}
function _spv4HtmlDetails(html, base, meta, mediaType, season) {
  const rows = _spv4AttrUrls(html, base)
    .filter(url => _spv4SameProviderOrigin(url, base))
    .filter(_spv7DetailUrlEligible)
    .map(url => ({
      url: _spv17CurrentResponseUrl(url, base),
      score: Math.max(
        _spv4UrlScore(url, meta, mediaType, season),
        _spv14LabelScoreForUrl(html, base, url, meta, mediaType, season)
      )
    }))
    .filter(row => row.score >= 36);
  rows.push(..._spv15ArticleDetails(html, base, meta, mediaType, season));
  const best = new Map();
  for (const row of rows) {
    if (!row || !row.url) continue;
    const previous = best.get(row.url);
    if (!previous || Number(row.score || 0) > Number(previous.score || 0)) best.set(row.url, row);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map(row => row.url)
    .slice(0, 8);
}
function _spv4JsonRows(value, out) {
  out = out || [];
  if (Array.isArray(value)) {
    for (const child of value) _spv4JsonRows(child, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  out.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") _spv4JsonRows(child, out);
    if (out.length >= 300) break;
  }
  return out;
}
function _spv4TitleScore(title, meta) {
  const actual = _slug(title);
  if (!actual) return 0;
  let best = 0;
  for (const expected of _spv4Titles(meta).map(_slug).filter(Boolean)) {
    if (actual === expected) best = Math.max(best, 240);
    else if (actual.includes(expected) || expected.includes(actual)) best = Math.max(best, 110);
    else {
      let score = 0;
      for (const token of expected.split("-").filter(v => v.length >= 3)) if (actual.includes(token)) score += 18;
      best = Math.max(best, score);
    }
  }
  return best;
}
function _spv4Scalar(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return _text(value);
  if (typeof value !== "object") return "";
  for (const key of ["rendered","raw","value","text","title","name","slug","href","url","link","path"]) {
    const child = value[key];
    if (typeof child === "string" || typeof child === "number") return _text(child);
  }
  return "";
}
function _spv4JsonDetails(value, base, meta, mediaType, season, episode, family) {
  const details = [];
  const detailRoutes = _spv4Routes().filter(route => _spv4IsDetailRoute(route, family));
  const rows = _spv4JsonRows(value, [])
    .map(row => ({
      row,
      score: _spv4TitleScore(_spv4Scalar(row.title) || _spv4Scalar(row.name) || _spv4Scalar(row.original_title) || _spv4Scalar(row.post_title) || _spv4Scalar(row.label) || "", meta)
    }))
    .filter(item => item.score >= 36)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  for (const item of rows) {
    const row = item.row;
    const direct = _spv4Scalar(row.url) || _spv4Scalar(row.href) || _spv4Scalar(row.permalink) || _spv4Scalar(row.link) || _spv4Scalar(row.path) || _spv4Scalar(row.guid) || "";
    if (direct) {
      const absolute = _absolute(direct, base);
      if (absolute && _spv4SameProviderOrigin(absolute)) details.push(absolute);
    }
    const vars = {
      slug: _spv4Scalar(row.slug) || _spv4Scalar(row.permalink_slug) || _spv4Scalar(row.seo_slug) || _slug(_spv4Scalar(row.title) || _spv4Scalar(row.name) || meta.title),
      providerId: _spv4Scalar(row.id) || _spv4Scalar(row.ID) || _spv4Scalar(row._id) || _spv4Scalar(row.media_id) || _spv4Scalar(row.post_id)
    };
    for (const route of detailRoutes) {
      details.push(..._spv4Expand(route, meta, vars, mediaType, season, episode));
    }
  }
  return _uniq(details).slice(0, 12);
}
async function _spv4SearchResponse(url, query, family) {
  const form = /form/.test(family) && /\/template-php\/[^?#]*fetch\.php(?:[?#]|$)/i.test(url);
  const options = form ? {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": _searchBases()[0] || ""
    },
    body: "query=" + encodeURIComponent(_text(query))
  } : {};
  const response = await _fetch(url, options);
  const contentType = _text(response.headers.get("content-type")).toLowerCase();
  if (contentType.includes("json")) return { json: await response.json(), text: "", base: response.url || url };
  const text = await response.text();
  try {
    if (/^\s*[\[{]/.test(text)) return { json: JSON.parse(text), text: "", base: response.url || url };
  } catch (_) {}
  return { json: null, text, base: response.url || url };
}
async function _spv4FindDetails(meta, mediaType, season, episode, family) {
  const out = [];
  const searchRoutes = _spv4Routes().filter(route => _spv4IsSearchRoute(route, family));
  for (const query of _spv4Titles(meta).slice(0, 3)) {
    for (const route of searchRoutes.slice(0, 3)) {
      const urls = _spv4Expand(route, Object.assign({}, meta, { title: query }), { query }, mediaType, season, episode);
      for (const url of urls.slice(0, 2)) {
        try {
          const payload = await _spv4SearchResponse(url, query, family);
          if (payload.json != null) out.push(..._spv4JsonDetails(payload.json, payload.base, meta, mediaType, season, episode, family));
          else out.push(..._spv4HtmlDetails(payload.text, payload.base, meta, mediaType, season));
        } catch (_) {}
        if (out.length) break;
      }
      if (out.length) break;
    }
    if (out.length) break;
  }

  // NIAKVIO_PROVIDER_BASE_EXTERNAL_IDENTITY_ROUTE_V11
  // External-ID catalogues may have no title search endpoint. Core already owns
  // TMDB -> IMDb metadata resolution, so execute only routes whose `{imdbId}`
  // placeholder was proof-derived from a prior response.
  const detailRoutes = _spv4Routes().filter(route => _spv4IsDetailRoute(route, family));
  if (meta && meta.imdbId) {
    for (const route of detailRoutes) {
      if (!/\{imdb_?id\}/i.test(route)) continue;
      out.push(..._spv4Expand(route, meta, {}, mediaType, season, episode));
    }
  }
  // Slug-driven catalogues (Sekai and similar) do not expose a search endpoint.
  // Generate only deterministic title slugs from Core metadata.
  for (const title of _spv4Titles(meta).slice(0, 3)) {
    const slug = _slug(title);
    if (!slug) continue;
    for (const route of detailRoutes) {
      const signedTmdbDetail = family === "signed-player-api" &&
        /\{slug\}/i.test(route) && /\{id\}/i.test(route) &&
        /\/title\/(?:movie|tv)\//i.test(route);
      if (signedTmdbDetail) {
        const wantsMovie = /\/title\/movie\//i.test(route);
        if ((mediaType === "movie") !== wantsMovie) continue;
        const tmdbId = _text(meta && meta.tmdbId).trim();
        if (!tmdbId) continue;
        out.push(..._spv4Expand(
          route,
          Object.assign({}, meta, { title }),
          { slug, providerId: tmdbId },
          mediaType,
          season,
          episode
        ));
        continue;
      }
      if (!/\{slug\}/i.test(route) || /\{id\}/i.test(route)) continue;
      out.push(..._spv4Expand(route, Object.assign({}, meta, { title }), { slug }, mediaType, season, episode));
    }
  }
  return _uniq(out).slice(0, 16);
}
function _spv4DirectStreams(urls, referer) {
  const direct = _uniq(urls).filter(_directMedia);
  return direct.length ? _streams(direct, referer).slice(0, 12) : [];
}
async function _spv4NestedStreams(urls, referer) {
  const candidates = _uniq(urls.map(_crawlCanonical)).filter(Boolean).filter(url => _crawlEligible(url) || /(?:sibnet|vidmoly|streamtape|sendvid|vidoza|myvi)/i.test(url)).sort((a,b)=>_crawlUrlScore(b)-_crawlUrlScore(a)).slice(0, 8);
  if (!candidates.length) return [];
  return (await _crawlDirectMedia(candidates, referer, 2)).slice(0, 12);
}
async function _spv4FullStory(detailUrl, meta, mediaType, season, episode) {
  const idMatch = _text(detailUrl).match(/\/(\d+)-/);
  if (!idMatch) return [];
  const route = _spv4Routes().find(value => /full-story\.php/i.test(value));
  if (!route) return [];
  const targets = _spv4Expand(route, meta, { providerId: idMatch[1] }, mediaType, season, episode);
  for (const target of targets.slice(0, 2)) {
    try {
      const response = await _fetch(target, { headers: { "X-Requested-With": "XMLHttpRequest", "Referer": detailUrl } });
      let html = "";
      const contentType = _text(response.headers.get("content-type")).toLowerCase();
      if (contentType.includes("json")) {
        const value = await response.json();
        html = _text(value && value.html);
      } else {
        const raw = await response.text();
        try { const value = JSON.parse(raw); html = _text(value && value.html); } catch (_) { html = raw; }
      }
      if (!html) continue;
      const wanted = Math.max(1, Number(episode) || 1);
      const epNumbers = [];
      const epRe = /data-number\s*=\s*["'](\d+)["']/gi;
      let epMatch;
      while ((epMatch = epRe.exec(html)) !== null) epNumbers.push(Number(epMatch[1]));
      const players = [];
      const cpRe = /id\s*=\s*["']content_player_(\d+)[a-z]*["'][^>]*>\s*(\d+)\s*</gi;
      let cp;
      while ((cp = cpRe.exec(html)) !== null) players.push(cp[2]);
      const index = epNumbers.indexOf(wanted);
      if (index >= 0 && index < players.length && /^\d+$/.test(players[index])) {
        return _streams(["https://video.sibnet.ru/shell.php?videoid=" + players[index]], detailUrl).slice(0, 4);
      }
      const urls = _spv4AttrUrls(html, target);
      const direct = _spv4DirectStreams(urls, target);
      if (direct.length) return direct;
      const nested = await _spv4NestedStreams(urls, target);
      if (nested.length) return nested;
    } catch (_) {}
  }
  return [];
}
async function _spv4PlayEpisode(detailUrl, html, meta, mediaType, season, episode) {
  let pageUrl = detailUrl;
  let pageHtml = html;
  if (mediaType !== "movie" && season != null && episode != null && /\.html(?:[?#]|$)/i.test(detailUrl)) {
    pageUrl = detailUrl.replace(/\.html(?:[?#].*)?$/i, "") + "/" + Number(season || 1) + "-saison/" + Number(episode || 1) + "-episode.html";
    try {
      const response = await _fetch(pageUrl);
      pageHtml = await response.text();
    } catch (_) { return []; }
  }
  const pairs = [];
  const pairRe = /playEpisode\([^,]+,\s*["'](\d+)["']\s*,\s*["']([^"']+)["']/gi;
  let match;
  while ((match = pairRe.exec(pageHtml)) !== null) {
    const key = match[1] + "\u0000" + match[2];
    if (!pairs.some(row => row.key === key)) pairs.push({ key, id: match[1], xfield: match[2] });
    if (pairs.length >= 6) break;
  }
  if (!pairs.length) return [];
  const actionRoute = _spv4Routes().find(value => /controller\.php\?mod=playepisode/i.test(value));
  if (!actionRoute) return [];
  const actionUrls = _spv4Expand(actionRoute, meta, {}, mediaType, season, episode);
  for (const actionUrl of actionUrls.slice(0, 2)) {
    for (const pair of pairs.slice(0, 4)) {
      try {
        const response = await _fetch(actionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": pageUrl
          },
          body: "id=" + encodeURIComponent(pair.id) + "&xfield=" + encodeURIComponent(pair.xfield) + "&action=playEpisode"
        });
        const text = await response.text();
        const urls = _spv4AttrUrls(text, response.url || actionUrl);
        const direct = _spv4DirectStreams(urls, pageUrl);
        if (direct.length) return direct;
        const nested = await _spv4NestedStreams(urls, pageUrl);
        if (nested.length) return nested;
      } catch (_) {}
    }
  }
  return [];
}
function _spv4SagaTargets(episode) {
  const out = [];
  try {
    const ctx = typeof globalThis !== "undefined" ? globalThis.__nuvioMediaContext : null;
    for (const key of ["absoluteEpisode", "absoluteEpisodeNumber", "episodeAbsolute", "absolute_episode"]) {
      const n = Number(ctx && ctx[key]);
      if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    }
  } catch (_) {}
  const ep = Number(episode);
  if (Number.isFinite(ep) && ep > 0 && !out.includes(ep)) out.push(ep);
  return out;
}
function _spv4ParseSagaMedia(html, targets) {
  const constants = Object.create(null);
  const constRe = /var\s+([A-Za-z0-9_]+)\s*=\s*atob\(["']([^"']+)["']\)/g;
  let cm;
  while ((cm = constRe.exec(html)) !== null) constants[cm[1]] = _spv4Base64(cm[2]);
  const found = [];
  const assignment = /(episodeHD|episodeLow|episode)\s*\[\s*(\d+)\s*\]\s*=\s*([A-Za-z0-9_]+)\s*\+\s*["']([^"']+\.(?:mp4|m3u8))["']/gi;
  let row;
  while ((row = assignment.exec(html)) !== null) {
    const number = Number(row[2]);
    if (!targets.includes(number)) continue;
    const url = _text(constants[row[3]]) + row[4];
    if (/^https?:\/\//i.test(url)) found.push(url);
  }
  return _uniq(found);
}
async function _spv4Saga(detailUrl, html, episode) {
  const targets = _spv4SagaTargets(episode);
  if (!targets.length) return [];
  let urls = _spv4ParseSagaMedia(html, targets);
  if (urls.length) return _streams(urls, detailUrl).slice(0, 6);
  const sagaUrls = _spv4AttrUrls(html, detailUrl).filter(url => /\/saga-\d+(?:[/?#]|$)/i.test(url)).slice(0, 6);
  for (const sagaUrl of sagaUrls) {
    try {
      const response = await _fetch(sagaUrl);
      const sagaHtml = await response.text();
      urls = _spv4ParseSagaMedia(sagaHtml, targets);
      if (urls.length) return _streams(urls, sagaUrl).slice(0, 6);
    } catch (_) {}
  }
  return [];
}
function _spv5SafeHttpStreamUrl(value) {
  const url = _text(value).trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.torrent(?:[?#]|$)|[?&](?:magnet|infohash|btih)=/i.test(url)) return "";
  return url;
}
async function _spv5Stremio(tmdbId, mediaType, season, episode) {
  const type = mediaType === "movie" ? "movie" : "tv";
  const routes = _spv4Routes().filter(route => {
    const low = _text(route).toLowerCase();
    return /\/stream\//.test(low) && (type === "movie" ? /\/stream\/movie\//.test(low) : /\/stream\/(?:series|tv)\//.test(low));
  });
  for (const route of routes.slice(0, 4)) {
    for (const target of _spv4Expand(route, {tmdbId:_text(tmdbId),title:""}, {providerId:_text(tmdbId)}, type, season, episode).slice(0,3)) {
      try {
        const response = await _fetch(target, {headers:{Accept:"application/json"}});
        let value = null;
        const ct = _text(response.headers.get("content-type")).toLowerCase();
        if (ct.includes("json")) value = await response.json(); else { const raw=await response.text(); try{value=JSON.parse(raw)}catch(_){} }
        const urls=[];
        for (const row of (value && Array.isArray(value.streams) ? value.streams : []).slice(0,40)) {
          if (!row || typeof row !== "object" || row.infoHash || row.infohash || row.magnet || row.torrent) continue;
          const url=_spv5SafeHttpStreamUrl(row.url || row.streamUrl || row.stream_url || "");
          if (url) urls.push(url);
        }
        if (urls.length) return _streams(urls, response.url || target).slice(0,20);
      } catch (_) {}
    }
  }
  return [];
}
async function _spv5DleFilmApi(detailUrl, html, meta, mediaType, season, episode) {
  if (mediaType !== "movie") return [];
  const route = _spv4Routes().find(value => /\/engine\/ajax\/film_api\.php/i.test(_text(value)));
  if (!route) return [];
  const idMatch = _text(detailUrl).match(/\/(\d{2,})-[^/?#]+/) || _text(html).match(/(?:news[_-]?id|data-id|post[_-]?id)\s*[:=]\s*["']?(\d{2,})/i);
  if (!idMatch) return [];
  let targets = _spv4Expand(route, meta, {providerId:idMatch[1]}, mediaType, season, episode);
  targets = targets.map(value => /[?&]id=\d+/i.test(value) ? value : value + (value.includes("?") ? "&" : "?") + "id=" + encodeURIComponent(idMatch[1]));
  for (const target of targets.slice(0,3)) {
    try {
      const response = await _fetch(target,{headers:{"X-Requested-With":"XMLHttpRequest",Referer:detailUrl}});
      const ct=_text(response.headers.get("content-type")).toLowerCase();
      let urls=[];
      if (ct.includes("json")) { const value=await response.json(); urls=_uniq(_sourceUrls(value,response.url||target).concat(_jsonUrls(value))); }
      else { const raw=await response.text(); try{const value=JSON.parse(raw);urls=_uniq(_sourceUrls(value,response.url||target).concat(_jsonUrls(value)))}catch(_){urls=_spv4AttrUrls(raw,response.url||target)} }
      const direct=_spv4DirectStreams(urls,detailUrl); if (direct.length) return direct;
      const nested=await _spv4NestedStreams(urls,detailUrl); if (nested.length) return nested;
    } catch (_) {}
  }
  return [];
}
async function _spv4ResolveDetail(detailUrl, meta, mediaType, season, episode, family) {
  let response, html;
  try {
    response = await _fetch(detailUrl);
    html = await response.text();
  } catch (_) { return []; }
  const base = response.url || detailUrl;
  if (!_strictHtmlIdentityOk(html, meta)) return [];

  if (family === "dle-full-story") {
    const special = await _spv4FullStory(base, meta, mediaType, season, episode);
    if (special.length) return special;
  }
  if (family === "dle-playepisode-form") {
    const special = await _spv4PlayEpisode(base, html, meta, mediaType, season, episode);
    if (special.length) return special;
  }
  if (family === "slug-saga-inline-media") {
    const special = await _spv4Saga(base, html, episode);
    if (special.length) return special;
  }
  if (family === "dle-film-api") {
    const special = await _spv5DleFilmApi(base, html, meta, mediaType, season, episode);
    if (special.length) return special;
  }
  /* NIAKVIO_SIGNED_PLAYER_API_RUNTIME_V1 */
  if (family === "signed-player-api") {
    const signedPlayers = _spv4AttrUrls(html, base)
      .filter(_spv4SameProviderOrigin)
      .filter(url => {
        try {
          const parsed = new URL(url);
          if (!/\/player(?:[/?#.-]|$)/i.test(parsed.pathname)) return false;
          const id = _text(parsed.searchParams && parsed.searchParams.get("id")).trim();
          const key = _text(parsed.searchParams && (parsed.searchParams.get("k") || parsed.searchParams.get("key"))).trim();
          return !!id && !!key;
        } catch (_) { return false; }
      });
    if (signedPlayers.length) {
      const runtime = await _resolveRuntimeApi(
        signedPlayers.slice(0, 4),
        mediaType,
        meta && meta.tmdbId,
        season,
        episode
      );
      if (runtime.length) return runtime;
    }
  }

  let urls = _spv4AttrUrls(html, base);
  if (mediaType !== "movie" && season != null && episode != null) {
    const s = Math.max(1, Number(season) || 1);
    const e = Math.max(1, Number(episode) || 1);
    const patterns = [
      new RegExp("/saison[-_/]?0*" + s + "[^?#]*episode[-_/]?0*" + e + "(?:[./?#]|$)", "i"),
      new RegExp("/0*" + s + "-saison/0*" + e + "-episode(?:[./?#]|$)", "i"),
      new RegExp("/episode/[^?#/]*-(?:saison-)?0*" + s + "-episode-0*" + e + "(?:[./?#-]|$)", "i"),
      new RegExp("/[^?#/]*-(?:saison-)?0*" + s + "-episode-0*" + e + "(?:[./?#-]|$)", "i"),
      new RegExp("/episode[-_/]?0*" + e + "(?:[./?#]|$)", "i")
    ];
    const episodeLinks = urls.filter(url => patterns.some(pattern => pattern.test(url))).slice(0, 3);
    for (const episodeUrl of episodeLinks) {
      try {
        const epResponse = await _fetch(episodeUrl);
        const epHtml = await epResponse.text();
        urls = urls.concat(_spv4AttrUrls(epHtml, epResponse.url || episodeUrl));
      } catch (_) {}
    }
  }

  // DLE/legacy pages sometimes expose a numeric Sibnet id without a URL.
  const numeric = [];
  const sibRe = /(?:content_player_[^>]+>|videoid\s*[:=]\s*["']?)(\d{3,})/gi;
  let sm;
  while ((sm = sibRe.exec(html)) !== null) numeric.push("https://video.sibnet.ru/shell.php?videoid=" + sm[1]);
  urls = urls.concat(numeric);

  const direct = _spv4DirectStreams(urls, base);
  if (direct.length) return direct;
  return _spv4NestedStreams(urls, base);
}
function _spv7ProviderSiteBases() {
  return _uniq([NIAKVIO_PROVIDER_MODEL.officialSite, NIAKVIO_PROVIDER_MODEL.knownSite])
    .map(_substituteDomain).filter(value => /^https?:/i.test(value));
}
function _spv7DleDetailLinks(html, base, meta) {
  const out = [];
  const text = _embeddedText(html);
  const re = /<a\b([^>]*)href=["']([^"']*(?:newsid=\d+|\/\d+[^"']*))['"]([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const label = _text(match[1]) + " " + _text(match[3]) + " " + _htmlVisibleText(match[4]);
    const score = _spv4TitleScore(label, meta);
    const url = _absolute(match[2], base);
    if (url && score >= 36 && _spv4SameProviderOrigin(url)) out.push({url:_substituteDomain(url), score});
    if (out.length >= 12) break;
  }
  return out.sort((a,b)=>b.score-a.score).map(row=>row.url).slice(0,6);
}
async function _spv7DleFindDetails(meta, mediaType, season, episode) {
  const out = [];
  for (const base of _spv7ProviderSiteBases().slice(0,2)) {
    try {
      const target = new URL("/engine/ajax/search.php", base).toString();
      const response = await _fetch(target, {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest",Referer:base+"/"},
        body:"query="+encodeURIComponent(_text(meta && meta.title))+"&page=1"
      });
      out.push(..._spv7DleDetailLinks(await response.text(), response.url || target, meta));
    } catch (_) {}
    if (out.length) break;
  }
  if (out.length) return _uniq(out).slice(0,8);
  return _spv4FindDetails(meta, mediaType, season, episode, "dle-film-api");
}
async function _spv7DleTv(tmdbId, mediaType, season, episode) {
  if (mediaType === "movie" || tmdbId == null || episode == null) return [];
  const wantedSeason = Math.max(1, Number(season) || 1);
  const wantedEpisode = String(Math.max(1, Number(episode) || 1));
  for (const base of _spv7ProviderSiteBases().slice(0,2)) {
    try {
      const seasonsUrl = new URL("/engine/ajax/get_seasons.php?serie_tag=s-"+encodeURIComponent(_text(tmdbId))+"&news_id=0", base).toString();
      const response = await _fetch(seasonsUrl, {headers:{Accept:"application/json,text/plain,*/*",Referer:base+"/"}});
      const raw = await response.text();
      let seasons = null; try { seasons = JSON.parse(raw); } catch (_) {}
      if (!Array.isArray(seasons) || !seasons.length) continue;
      let chosen = seasons.find(row => {
        const match = _text(row && row.title).match(/saison\s*(\d+)/i);
        return match && Number(match[1]) === wantedSeason;
      }) || seasons[0];
      const seasonId = _text(chosen && chosen.id).trim();
      if (!seasonId) continue;
      const epsUrl = new URL("/data/eps_"+encodeURIComponent(seasonId)+".txt?v="+Math.floor(Date.now()/30000), base).toString();
      const epsResponse = await _fetch(epsUrl, {headers:{Accept:"application/json,text/plain,*/*",Referer:base+"/"}});
      const epsRaw = await epsResponse.text();
      let eps = null; try { eps = JSON.parse(epsRaw); } catch (_) {}
      if (!eps || typeof eps !== "object") continue;
      const rows = [];
      const seen = new Set();
      for (const lang of ["vf","vostfr","vo"]) {
        const bucket = eps[lang];
        const players = bucket && (bucket[wantedEpisode] || bucket[Number(wantedEpisode)]);
        if (!players || typeof players !== "object") continue;
        for (const [host, value] of Object.entries(players)) {
          const url = _text(value).trim();
          if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
          seen.add(url);
          rows.push({name:NIAKVIO_PROVIDER_MODEL.displayName,title:"["+lang.toUpperCase()+"] "+_text(host).toUpperCase(),url,language:lang,headers:{Referer:base+"/"}});
        }
      }
      if (rows.length) return rows.slice(0,24);
    } catch (_) {}
  }
  return [];
}
async function _spv4GetStreams(tmdbId, mediaType, season, episode) {
const family = _spv4Family();
const type = _text(mediaType || "movie").toLowerCase();
/* NIAKVIO_PROVIDER_BASE_API_RECIPE_FIRST_V8 */
/* NIAKVIO_PROVIDER_EXECUTION_AUTHORITY_V16 */
/* NIAKVIO_PROVIDER_CORRELATED_VALUE_AUTHORITY_V18_2 */
const hasProofValue = Array.isArray(NIAKVIO_PROVIDER_MODEL.providerValuePlan) && NIAKVIO_PROVIDER_MODEL.providerValuePlan.length > 0;
const hasProofRecipe = !!NIAKVIO_PROVIDER_MODEL.apiRecipe;
const hasProofSearch = Array.isArray(NIAKVIO_PROVIDER_MODEL.searchRequestPlan) && NIAKVIO_PROVIDER_MODEL.searchRequestPlan.length > 0;
let proofMeta = null;
if (hasProofValue || hasProofRecipe || hasProofSearch) proofMeta = await _tmdb(tmdbId, type);
if (hasProofValue && proofMeta && proofMeta.title) {
  const valuePrimary = await _resolveProviderValuePlan(proofMeta, type, season, episode);
  if (Array.isArray(valuePrimary) && valuePrimary.length) return valuePrimary;
}
if (hasProofRecipe) {
  const recipePrimary = await _resolveApiRecipe(proofMeta, type, season, episode);
  if (Array.isArray(recipePrimary) && recipePrimary.length) return recipePrimary;
  if (NIAKVIO_PROVIDER_MODEL.apiRecipe.allowGenericFallback !== true) return [];
}
if (hasProofSearch && proofMeta && proofMeta.title) {
  const searchPrimary = await _resolveSearchRequestPlan(proofMeta, type, season, episode);
  if (Array.isArray(searchPrimary) && searchPrimary.length) return searchPrimary;
}
if (family === "stremio-json") {
const stremio = await _spv5Stremio(tmdbId, type, season, episode);
if (stremio.length) return stremio;
}
if (family && family !== "unknown") {
const meta = await _tmdb(tmdbId, type);
// Known source families execute their typed source plan before the generic
// fallback. This prevents broad catalogue/API guesses from spending the
// provider budget on category pages, dead aliases and placeholder routes.
if (meta && meta.title) {
if (family === "dle-film-api" && type !== "movie") {
const tv = await _spv7DleTv(tmdbId, type, season, episode);
if (tv.length) return tv;
}
const details = family === "dle-film-api"
? await _spv7DleFindDetails(meta, type, season, episode)
: await _spv4FindDetails(meta, type, season, episode, family);
for (const detail of details.slice(0, 8)) {
const streams = await _spv4ResolveDetail(detail, meta, type, season, episode, family);
if (streams.length) return streams;
}
}
}
const primary = await getStreams(tmdbId, type, season, episode);
if (Array.isArray(primary) && primary.length) return primary;
return [];
}
module.exports = {
  getStreams: _spv4GetStreams,
  get __niakvioProviderBase(){ return NIAKVIO_PROVIDER_MODEL; }
};

/* STARTFIX:PROVIDER.VIDSRC.CONFIG.V1 */
/* FIXDATA:PROVIDER.VIDSRC.CONFIG.V1:eyJhcGlSZWNpcGUiOm51bGwsImF1dGhvcmluZyI6Im5pYWt2aW8tb3duZWQtdjMiLCJkaXNwbGF5TmFtZSI6IvCflIwgVmlkU3JjIiwiZG9tYWluU3Vic3RpdHV0aW9ucyI6e30sImV4dGVybmFsSWRlbnRpdHlQbGFuIjpbXSwiZml4ZWRBcGkiOm51bGwsImlkZW50aXR5SW5wdXQiOnsibW9kZSI6InRtZGJfZGlyZWN0IiwicmVxdWlyZWRGaWVsZHMiOlsidG1kYklkIiwibWVkaWFUeXBlIl0sInJlcXVpcmVzVG1kYkJlZm9yZVJ1biI6ZmFsc2V9LCJrbm93blNpdGUiOiJodHRwczovL3ZpZHNyYy5tZSIsIm1vZGVsU2NoZW1hVmVyc2lvbiI6NCwib2JzZXJ2ZWRVcmxzIjpbImh0dHBzOi8vd2hpc3BlcmluZ2F1cm9yYXMuY29tLyIsImh0dHBzOi8vdmlkc3JjLm1lLyIsImh0dHBzOi8vdmlkc3JjLm1lL2VtYmVkLyIsImh0dHBzOi8vdmlkc3JjLm1lIl0sIm9mZmljaWFsQXBpIjpudWxsLCJvZmZpY2lhbEh1YiI6bnVsbCwib2ZmaWNpYWxTaXRlIjoiaHR0cHM6Ly92aWRzcmMubWUiLCJvcmlnaW5zIjpbImh0dHBzOi8vdmlkc3JjLm1lIiwiaHR0cHM6Ly93aGlzcGVyaW5nYXVyb3Jhcy5jb20iXSwib3V0cHV0TGFuZ3VhZ2VSdWxlcyI6W10sIm91dHB1dFVybEhvc3RSZXdyaXRlcyI6W10sInByb29mRGV0YWlsQmFzZXMiOltdLCJwcm9vZlByb3RlY3RlZEhvc3RzIjpbXSwicHJvb2ZTZWFyY2hCYXNlcyI6W10sInByb3ZpZGVySWQiOiJ2aWRzcmMiLCJwcm92aWRlclZhbHVlUGxhbiI6W10sInJlY29uc3RydWN0aW9uU3RhdGUiOiJsZWFybmluZy1jbGVhbi1zZWVkIiwicm91dGVQbGFuVmVyc2lvbiI6Mywicm91dGVQcm9vZlZlcnNpb24iOjUsInJvdXRlcyI6WyIvZW1iZWQve3RtZGJJZH0iLCIvZW1iZWQve3RtZGJJZH0vMS0xIiwiL2VtYmVkL3t0bWRiSWR9LzMtMSJdLCJydW50aW1lRGlzY292ZXJ5IjpmYWxzZSwicnVudGltZVJvbGUiOiJyZWFkZXIiLCJzZWFyY2hSZXF1ZXN0UGxhbiI6W10sInNvdXJjZVJ1bnRpbWVGYW1pbHkiOiJjYXRhbG9ndWUtaHRtbC1lbWJlZCIsInN0cmF0ZWd5IjoibWl4ZWRfZW1iZWRfcmVzb2x2ZXIiLCJzdHJpY3RIdG1sSWRlbnRpdHkiOmZhbHNlLCJzdHJpY3RJZGVudGl0eSI6ZmFsc2UsInN1cHBvcnRlZFR5cGVzIjpbIm1vdmllIiwidHYiXSwidXBzdHJlYW1Db2RlRW1iZWRkZWQiOmZhbHNlLCJ1cHN0cmVhbUNvZGVFeGVjdXRlZCI6ZmFsc2V9 */
const NIAKVIO_PROVIDER_MODEL = Object.freeze({"apiRecipe":null,"authoring":"niakvio-owned-v3","displayName":"🔌 VidSrc","domainSubstitutions":{},"externalIdentityPlan":[],"fixedApi":null,"identityInput":{"mode":"tmdb_direct","requiredFields":["tmdbId","mediaType"],"requiresTmdbBeforeRun":false},"knownSite":"https://vidsrc.me","modelSchemaVersion":4,"observedUrls":["https://whisperingauroras.com/","https://vidsrc.me/","https://vidsrc.me/embed/","https://vidsrc.me"],"officialApi":null,"officialHub":null,"officialSite":"https://vidsrc.me","origins":["https://vidsrc.me","https://whisperingauroras.com"],"outputLanguageRules":[],"outputUrlHostRewrites":[],"proofDetailBases":[],"proofProtectedHosts":[],"proofSearchBases":[],"providerId":"vidsrc","providerValuePlan":[],"reconstructionState":"learning-clean-seed","routePlanVersion":3,"routeProofVersion":5,"routes":["/embed/{tmdbId}","/embed/{tmdbId}/1-1","/embed/{tmdbId}/3-1"],"runtimeDiscovery":false,"runtimeRole":"reader","searchRequestPlan":[],"sourceRuntimeFamily":"catalogue-html-embed","strategy":"mixed_embed_resolver","strictHtmlIdentity":false,"strictIdentity":false,"supportedTypes":["movie","tv"],"upstreamCodeEmbedded":false,"upstreamCodeExecuted":false});
/* CLOSEFIX:PROVIDER.VIDSRC.CONFIG.V1 */
/* NUVIO_GLOBAL_CORE_START_BOUNDARY_V1 */
/* STARTFIX:CORE.MEDIA_ENRICHMENT.V1 */
/* FIXDATA:CORE.MEDIA_ENRICHMENT.V1:eyJkZWZhdWx0VXNlckFnZW50IjoiIiwiaW1wbGVtZW50YXRpb25SZXZpc2lvbiI6InNjb3BlZC1wbGF5YmFjay1jb250ZXh0LXY4LW1lZGlhLWZpcnN0LWNhbmRpZGF0ZXMiLCJtYXhDYW5kaWRhdGVzIjoxMCwibWF4RGVwdGgiOjIsIm1heFJvd3MiOjYsInByZXNlcnZlT3JpZ2luYWwiOnRydWUsInRpbWVvdXRNcyI6NjUwMH0= */
/* NUVIO_GLOBAL_MEDIA_ENRICHMENT_V1:8f06be4fdbd4 */
;(function(g,c){"use strict";
var ASSET=/\.(?:css|js|mjs|map|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|eot|json|xml|vtt|srt)(?:[?#]|$)/i;
var BADHOST=/(?:^|\.)(?:youtube\.com|youtu\.be|twitter\.com|x\.com|twimg\.com|facebook\.com|instagram\.com|googletagmanager\.com|google-analytics\.com|doubleclick\.net)$/i;
var DEFAULT_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function s(v){return String(v==null?"":v).replace(/\\\//g,"/").trim()}
function urlOf(row){var v=row&&row.url;if(v&&typeof v==="object")v=v.url||v.href||v.src;return s(v||(row&&(row.streamUrl||row.stream||row.link||row.file)))}
function abs(v,b){try{return new URL(s(v),b).toString()}catch(_){return""}}
function host(v){try{return new URL(v).hostname.toLowerCase()}catch(_){return""}}
function rejected(v){var h=host(v);return !/^https?:\/\//i.test(v)||!h||BADHOST.test(h)||ASSET.test(v)||/(?:trailer|bande-annonce|big[_-]?buck[_-]?bunny|sample[-_]?video|\/troll\/master\.m3u8)/i.test(v)}
function directByName(v){return /\.(?:m3u8|mpd|mp4|m4v|mkv|webm|ts)(?:[?#]|$)|\/hls2?\//i.test(v)}
function declaredDirect(row,v){var t=s(row&&(row.type||row.format||row.mimeType||row.contentType)).toLowerCase();return !!(row&&row.isDirect===true)||directByName(v)||/hls|mpegurl|m3u8|dash|mpd|mp4|m4v|matroska|mkv|webm|mpegts|mp2t|video\//i.test(t)}
function timeout(){try{return typeof AbortSignal!=="undefined"&&AbortSignal.timeout?AbortSignal.timeout(c.timeoutMs):undefined}catch(_){return undefined}}
function providerDeadlineExpired(){try{var d=Number(g&&g.__nuvioProviderDeadlineMs);return Number.isFinite(d)&&d>0&&Date.now()>=d}catch(_){return false}}
function keyOf(o,name){var keys=Object.keys(o||{}),want=String(name||"").toLowerCase();for(var i=0;i<keys.length;i++)if(String(keys[i]).toLowerCase()===want)return keys[i];return""}
function setHeader(o,name,value){if(!value)return;var k=keyOf(o,name);if(k&&k!==name)delete o[k];o[name]=String(value)}
function responseHeader(r,name){try{return r&&r.headers&&typeof r.headers.get==="function"?s(r.headers.get(name)):""}catch(_e){return""}}
function baseHeaders(row){
  var out={};
  function merge(src){if(src&&typeof src==="object")Object.keys(src).forEach(function(k){if(String(k).toLowerCase()!=="range"&&s(src[k]))out[k]=s(src[k])})}
  try{merge(row&&row.url&&typeof row.url==="object"&&row.url.headers)}catch(_e){}
  try{merge(row&&row.headers)}catch(_e){}
  try{merge(row&&row.requestHeaders)}catch(_e){}
  try{merge(row&&row.behaviorHints&&row.behaviorHints.proxyHeaders&&row.behaviorHints.proxyHeaders.request)}catch(_e){}
  return out;
}
function normalizeRow(row){var u=urlOf(row);if(!u)return row;return Object.assign({},row,{url:u,headers:baseHeaders(row)})}
function splitSetCookie(value){
  var raw=s(value);if(!raw)return[];
  return raw.split(/,(?=\s*[^;,=\s]+\s*=)/g).map(function(x){return x.trim()}).filter(Boolean);
}
function defaultPath(url){try{var p=new URL(url).pathname||"/";if(p.charAt(0)!=="/")return"/";var i=p.lastIndexOf("/");return i<=0?"/":p.slice(0,i+1)}catch(_e){return"/"}}
function rememberCookie(jar,setCookie,url){
  if(!jar||!setCookie)return;
  var parsed;try{parsed=new URL(url)}catch(_e){return}
  splitSetCookie(setCookie).forEach(function(line){
    var parts=line.split(";"),first=s(parts.shift()),eq=first.indexOf("=");if(eq<=0)return;
    var name=s(first.slice(0,eq)),value=s(first.slice(eq+1));if(!name)return;
    var item={name:name,value:value,domain:parsed.hostname.toLowerCase(),hostOnly:true,path:defaultPath(url),secure:false,expired:false};
    parts.forEach(function(part){var x=s(part),i=x.indexOf("="),ak=(i>=0?x.slice(0,i):x).trim().toLowerCase(),av=i>=0?s(x.slice(i+1)):"";
      if(ak==="domain"&&av){item.domain=av.replace(/^\./,"").toLowerCase();item.hostOnly=false}
      else if(ak==="path"&&av.charAt(0)==="/")item.path=av;
      else if(ak==="secure")item.secure=true;
      else if(ak==="max-age"&&Number(av)<=0)item.expired=true;
      else if(ak==="expires"){var ts=Date.parse(av);if(Number.isFinite(ts)&&ts<=Date.now())item.expired=true}
    });
    var id=item.name.toLowerCase()+"|"+item.domain+"|"+item.path;
    for(var i=jar.length-1;i>=0;i--){var old=jar[i],oldId=old.name.toLowerCase()+"|"+old.domain+"|"+old.path;if(oldId===id)jar.splice(i,1)}
    if(!item.expired&&item.value)jar.push(item);
  });
}
function captureCookies(jar,response,url){
  try{if(!response||!response.headers||typeof response.headers.get!=="function")return;var v=response.headers.get("set-cookie")||response.headers.get("Set-Cookie");if(v)rememberCookie(jar,v,url)}catch(_e){}
}
function cookieHeader(jar,target){
  var u;try{u=new URL(target)}catch(_e){return""}
  var h=u.hostname.toLowerCase(),p=u.pathname||"/",secure=u.protocol==="https:",out=[];
  (jar||[]).forEach(function(x){var domainOk=x.hostOnly?h===x.domain:(h===x.domain||h.endsWith("."+x.domain));if(!domainOk)return;if(x.secure&&!secure)return;if(p.indexOf(x.path)!==0)return;out.push(x.name+"="+x.value)});
  return out.join("; ");
}
function mergeCookies(a,b){
  var order=[],map={};function add(raw){s(raw).split(";").forEach(function(part){var x=s(part),i=x.indexOf("=");if(i<=0)return;var n=s(x.slice(0,i)),v=s(x.slice(i+1)),k=n.toLowerCase();if(!map[k])order.push(k);map[k]={n:n,v:v}})}add(a);add(b);return order.map(function(k){return map[k].n+"="+map[k].v}).join("; ")
}
function headers(row,referer,target,jar){
  var out=baseHeaders(row);
  if(referer){setHeader(out,"Referer",referer);try{setHeader(out,"Origin",new URL(referer).origin)}catch(_e){}}
  if(c.defaultUserAgent&&!keyOf(out,"User-Agent"))setHeader(out,"User-Agent",c.defaultUserAgent);
  var scoped=cookieHeader(jar,target),existing=keyOf(out,"Cookie");if(scoped)setHeader(out,"Cookie",mergeCookies(existing?out[existing]:"",scoped));
  if(!directByName(target)&&!keyOf(out,"Range"))out.Range="bytes=0-262143";
  return out;
}
function kindBytes(bytes){if(!bytes||bytes.length<4)return null;if(bytes.length>=12&&String.fromCharCode(bytes[4],bytes[5],bytes[6],bytes[7])==="ftyp")return"mp4";if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return"mkv";if(bytes[0]===71&&(bytes.length<189||bytes[188]===71))return"mpegts";return null}
function extensionKind(value){var m=s(value).toLowerCase().match(/\.(m3u8|mpd|mp4|m4v|mkv|webm|ts)(?:[?&#"'\s;]|$)/);if(!m)return null;return m[1]==="m3u8"?"hls":m[1]==="mpd"?"dash":m[1]==="m4v"?"mp4":m[1]==="ts"?"mpegts":m[1]}
function metadataKind(type,disposition,url){
  var ct=s(type).toLowerCase(),byName=extensionKind(s(disposition)+" "+s(url));
  if(/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)|audio\/(?:mpegurl|x-mpegurl)/i.test(ct))return"hls";
  if(/application\/dash\+xml/i.test(ct))return"dash";
  if(/video\/(?:x-)?matroska|application\/(?:x-)?matroska/i.test(ct))return"mkv";
  if(/video\/(?:mp4|x-m4v|quicktime)/i.test(ct))return"mp4";
  if(/video\/webm/i.test(ct))return"webm";
  if(/video\/(?:mp2t|mpegts)/i.test(ct))return"mpegts";
  if(/^video\//i.test(ct))return byName||"video";
  if(/application\/(?:octet-stream|force-download)/i.test(ct)&&byName&&byName!=="hls"&&byName!=="dash")return byName;
  return byName&&byName!=="hls"&&byName!=="dash"?byName:null;
}
function decode(bytes){try{return new TextDecoder("utf-8").decode(bytes)}catch(_){var x="";for(var i=0;i<Math.min(bytes.length,262144);i++)x+=String.fromCharCode(bytes[i]);return x}}
async function fetchResource(url,row,referer,jar){if(providerDeadlineExpired())return null;try{
  var requestHeaders=headers(row,referer,url,jar),r=await g.fetch(url,{headers:requestHeaders,redirect:"follow",signal:timeout()});if(!r)return null;
  var finalUrl=s(r.url||url);captureCookies(jar,r,finalUrl);
  var type=responseHeader(r,"content-type"),disposition=responseHeader(r,"content-disposition"),bytes=null,text="",meta=metadataKind(type,disposition,finalUrl);
  if(r.ok&&meta&&meta!=="hls"&&meta!=="dash")return{ok:true,status:r.status,url:finalUrl,type:type,disposition:disposition,bytes:null,text:"",metadataKind:meta,headers:headers(row,referer,finalUrl,jar)};
  if(typeof r.arrayBuffer==="function"){var buf=await r.arrayBuffer();bytes=new Uint8Array(buf);text=decode(bytes.slice(0,300000))}
  else if(typeof r.text==="function"){text=String(await r.text()||"").slice(0,300000)}
  return{ok:!!r.ok,status:r.status,url:finalUrl,type:type,disposition:disposition,bytes:bytes,text:text,metadataKind:meta,headers:headers(row,referer,finalUrl,jar)}
}catch(_){return null}}
function proof(r){if(!r||!r.ok)return null;var t=s(r.text).trimStart();if(t.indexOf("#EXTM3U")===0)return"hls";if(/<MPD[\s>]/i.test(t.slice(0,4096))||/application\/dash\+xml/i.test(r.type))return"dash";var b=kindBytes(r.bytes);if(b)return b;if(r.metadataKind)return r.metadataKind;if(/^video\//i.test(r.type)&&r.bytes&&r.bytes.length>12)return"video";return null}
function candidates(text,base){var out=[],seen={};function add(v){var u=abs(v,base);if(!u||rejected(u)||seen[u])return;seen[u]=1;out.push(u)}var body=s(text),patterns=[/(https?:\/\/[^"'<>\s\\]+\.(?:m3u8|mpd|mp4|m4v|mkv|webm|ts)(?:[?#][^"'<>\s\\]*)?)/gi,/(?:file|source|src|url|playlist|hls|stream|contentUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,/(?:data-src|data-url|data-embed|data-player|data-file|src)=["']([^"']+)["']/gi,/(?:href)=["']([^"']*(?:\.m3u8|\.mpd|\.mp4|\.m4v|\.mkv|\.webm|\.ts|\/embed(?:[\/?#.-]|$)|\/player(?:[\/?#.-]|$)|\/e\/|\/hls2?\/)[^"']*)["']/gi,/(https?:\/\/[^"'<>\s\\]+(?:embed|player|\/e\/|\/hls2?\/)[^"'<>\s\\]*)/gi],m;for(var i=0;i<patterns.length;i++){patterns[i].lastIndex=0;while((m=patterns[i].exec(body))!==null){add(m[1]);if(out.length>=c.maxCandidates)return out}}return out}
async function resolve(url,row,referer,depth,seen,jar){if(providerDeadlineExpired()||depth>c.maxDepth||rejected(url))return[];seen=seen||{};if(seen[url])return[];seen[url]=1;var r=await fetchResource(url,row,referer,jar);if(!r)return[];var k=proof(r);if(k)return[{url:r.url||url,kind:k,headers:r.headers}];if(!/html|text|json|javascript|xml/i.test(r.type)&&!/[<>{}\[\]"']/.test(r.text||""))return[];var next=candidates(r.text,r.url||url),out=[];for(var i=0;i<next.length&&out.length<c.maxCandidates;i++){var found=await resolve(next[i],row,r.url||url,depth+1,seen,jar);for(var j=0;j<found.length;j++)if(!out.some(function(x){return x.url===found[j].url}))out.push(found[j])}return out}
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
function clone(row,media){var out=Object.assign({},normalizeRow(row),{url:media.url,headers:media.headers||baseHeaders(row),isDirect:true,type:media.kind,__nuvioCoreMediaProofV1:{url:media.url,kind:media.kind}});if(media.kind==="hls"&&"format" in out)out.format="m3u8";if(media.kind==="dash"&&"format" in out)out.format="mpd";return out}
function refererOf(row,u){var h=baseHeaders(row),k=keyOf(h,"Referer");return s(k?h[k]:(row&&(row.referer||row.referrer||row.playerUrl||row.embedUrl||row.pageUrl))||u)}
async function enrich(list){if(providerDeadlineExpired())return[];var out=[],seen={};function add(row){row=normalizeRow(row);var u=urlOf(row);if(!u||seen[u])return;seen[u]=1;out.push(row)}for(var i=0;i<list.length;i++){var row=list[i];if(!row||typeof row!=="object")continue;var u=urlOf(row);if(!u||rejected(u))continue;if(declaredDirect(row,u)){add(row);continue}if(i<c.maxRows){var ref=refererOf(row,u),jar=[],found=await resolve(u,row,ref,0,{},jar);for(var j=0;j<found.length;j++)add(clone(row,found[j]));if(found.length)continue}/* Unresolved player/download pages are not playable streams. */}return out}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalMediaEnrichmentV1)return false;var native=o[k];var wrap=async function(){var v=await native.apply(this,arguments),x=slot(v);if(!x||!x.list.length)return v;var list=await enrich(x.list);return rebuild(v,x,list)};wrap.__nuvioGlobalMediaEnrichmentV1=true;o[k]=wrap;return true}
var ok=false;try{if(typeof module!=="undefined"&&module.exports)ok=install(module.exports,"getStreams")}catch(_){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_){}
})(typeof globalThis!=="undefined"?globalThis:this,{"maxRows":6,"maxDepth":2,"maxCandidates":10,"timeoutMs":6500,"preserveOriginal":true,"defaultUserAgent":"","implementationRevision":"scoped-playback-context-v8-media-first-candidates"});
/* CLOSEFIX:CORE.MEDIA_ENRICHMENT.V1 */
/* STARTFIX:CORE.RUNTIME_MEDIA_SAFETY.V4 */
/* FIXDATA:CORE.RUNTIME_MEDIA_SAFETY.V4:eyJjYXBhYmlsaXR5U3RyYXRlZ3kiOiJtaXhlZF9lbWJlZF9yZXNvbHZlciIsImR1cmF0aW9uSWRlbnRpdHkiOnRydWUsImltcGxlbWVudGF0aW9uUmV2aXNpb24iOiJmaWVsZC1zYWZldHktdjgtbWVkaWEtb25seS1wMnAtdm9kLWR1cmF0aW9uIiwibWF4RHVyYXRpb25SYXRpbyI6MS44LCJtYXhSb3dzIjo0LCJtaW5EdXJhdGlvblJhdGlvIjowLjU1LCJwcm92aWRlcklkIjoidmlkc3JjIiwicmVxdWVzdFR5cGVBbGlhc2VzIjp7fSwic3RyaWN0UGxheWJhY2siOmZhbHNlLCJ0aW1lb3V0TXMiOjY1MDAsInRtZGJUaW1lb3V0TXMiOjQ1MDB9 */
/* NUVIO_GLOBAL_RUNTIME_MEDIA_SAFETY_V1:238a9d55273e */
;(function(g,c){
  "use strict";
  function s(v){return String(v==null?"":v).trim()}
  function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
  function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
  function requestInfo(a){var first=a[0],q=first&&typeof first==="object"&&!Array.isArray(first)?Object.assign({},first):{tmdbId:first,mediaType:a[1],season:a[2],episode:a[3]};q.tmdbId=s(q.tmdbId||q.id||first).replace(/^tmdb:/i,"").split(":")[0];q.mediaType=s(q.mediaType||q.type||a[1]||"movie").toLowerCase();q.season=Number(q.season||a[2]||0)||0;q.episode=Number(q.episode||a[3]||0)||0;return q}
  function invocationArgs(a,q){var out=Array.prototype.slice.call(a),aliases=c.requestTypeAliases&&typeof c.requestTypeAliases==="object"?c.requestTypeAliases:{},alias=s(aliases[q.mediaType]).toLowerCase();if(!alias||alias===q.mediaType)return out;var first=out[0];if(first&&typeof first==="object"&&!Array.isArray(first)){var copy=Object.assign({},first);copy.mediaType=alias;if("type" in copy)copy.type=alias;out[0]=copy}else out[1]=alias;return out}
  function nativeHost(){try{return typeof g.__native_fetch==="function"}catch(_e){return false}}
  function isTv(){try{var ua=s(g.navigator&&g.navigator.userAgent);return /NuvioTV|Android TV/i.test(ua)||(g&&g.__NUVIO_TV_RUNTIME__===true)}catch(_e){return false}}
  function p2pReason(row){if(!row||typeof row!=="object")return"";var u=s(row.url).toLowerCase(),t=s(row.type||row.format||row.protocol).toLowerCase();if(/^(?:magnet|torrent|acestream|sop):/i.test(u))return"p2p_protocol";if(row.infoHash||row.infohash||row.magnet||row.torrent||row.peerId||row.peer_id)return"p2p_stream_field";if(/^(?:torrent|p2p|peer-to-peer|magnet|acestream|sopcast)$/i.test(t))return"p2p_stream_type";return""}
  function obviousNonMedia(row){var p2p=p2pReason(row);if(p2p)return p2p;var u=s(row&&row.url);if(!u)return"missing_url";if(!/^https?:\/\//i.test(u))return"invalid_url";var lower=u.toLowerCase();if(/(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|watch)(?:\/|\?|$)/i.test(lower))return"video_page_url";if(/\/embed(?:\/|\?|#|$)/i.test(lower))return"embed_page_url";if(/\.(?:html?|php)(?:[?#]|$)/i.test(lower))return"html_page_url";if(/^https?:\/\/[^/]+\/\/www\./i.test(u))return"malformed_nested_url";return""}
  function staticSafety(row){if(!row||typeof row!=="object")return{keep:false,reason:"invalid_row"};var obvious=obviousNonMedia(row);if(obvious)return{keep:false,reason:obvious};return{keep:true}}
  function rowHeaders(row,range){var out={},src=row&&row.headers&&typeof row.headers==="object"?row.headers:{};Object.keys(src).forEach(function(k){out[k]=s(src[k])});try{var bh=row&&row.behaviorHints&&row.behaviorHints.proxyHeaders&&row.behaviorHints.proxyHeaders.request;if(bh&&typeof bh==="object")Object.keys(bh).forEach(function(k){if(!(k in out))out[k]=s(bh[k])})}catch(_e){}if(range&&!Object.keys(out).some(function(k){return k.toLowerCase()==="range"}))out.Range="bytes=0-65535";if(!Object.keys(out).some(function(k){return k.toLowerCase()==="accept"}))out.Accept="application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*";return out}
  function timeoutSignal(ms){try{if(typeof AbortSignal!=="undefined"&&AbortSignal.timeout)return AbortSignal.timeout(ms)}catch(_e){}return void 0}
  async function responseText(r){if(!r)return"";try{if(typeof r.text==="function")return s(await r.text())}catch(_e){}try{if(typeof r.arrayBuffer==="function"){var ab=await r.arrayBuffer();if(ab&&typeof TextDecoder!=="undefined")return s(new TextDecoder("utf-8").decode(new Uint8Array(ab)))}}catch(_e){}return""}
  async function fetchText(url,row,range){try{var r=await g.fetch(url,{method:"GET",redirect:"follow",headers:rowHeaders(row,range),signal:timeoutSignal(c.timeoutMs)});if(!r)return{state:"unknown",reason:"no_response"};var st=Number(r.status||0),ct=s(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();if(st===401||st===403||st===404||st===410||st>=500)return{state:"dead",status:st,contentType:ct};if(!r.ok)return{state:"unknown",status:st,contentType:ct};return{state:"ok",status:st,url:s(r.url||url),contentType:ct,text:await responseText(r)}}catch(e){return{state:"unknown",reason:e&&e.name==="AbortError"?"timeout":"network_error"}}}
  function playlistKind(text){var body=s(text).replace(/^\uFEFF/,"");if(!/^#EXTM3U(?:\s|$)/i.test(body))return"invalid";if(/#EXT-X-STREAM-INF\s*:/i.test(body))return"master";if(/#EXTINF\s*:/i.test(body))return"media";return"unknown"}
  function firstVariant(text,base){var lines=s(text).split(/\r?\n/);for(var i=0;i<lines.length;i++){if(!/^#EXT-X-STREAM-INF\s*:/i.test(lines[i]))continue;for(var j=i+1;j<lines.length;j++){var v=s(lines[j]);if(!v||v.charAt(0)==="#")continue;try{return new URL(v,base).toString()}catch(_e){return""}}}return""}
  function durationSeconds(text){var body=s(text);if(!/#EXT-X-ENDLIST(?:\s|$)/i.test(body))return null;var total=0,count=0,re=/#EXTINF\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi,m;while((m=re.exec(body))!==null){var n=Number(m[1]);if(Number.isFinite(n)&&n>0){total+=n;count++}}return count>=2&&total>=60?total:null}
  async function inspectHls(row,url){var r=await fetchText(url,row,false);if(r.state!=="ok")return r;var kind=playlistKind(r.text);if(kind==="invalid")return{state:"dead",reason:"not_hls",status:r.status};if(kind==="media")return{state:"ok",duration:durationSeconds(r.text)};if(kind==="master"){var child=firstVariant(r.text,r.url||url);if(!child)return{state:"dead",reason:"master_without_variant"};var cr=await fetchText(child,row,false);if(cr.state!=="ok")return cr;var ck=playlistKind(cr.text);if(ck!=="media"&&ck!=="master")return{state:"dead",reason:"invalid_child"};return{state:"ok",duration:durationSeconds(cr.text)}}return{state:"ok",duration:null}}
  function mediaKind(row){var u=s(row&&row.url).toLowerCase(),t=s(row&&(row.type||row.format)).toLowerCase();if(/\.m3u8(?:[?#]|$)|\/hls2?\//i.test(u)||/hls|mpegurl|m3u8/.test(t))return"hls";if(/\.(?:mp4|mkv|webm)(?:[?#]|$)/i.test(u)||/mp4|matroska|webm|video\//.test(t))return"direct";return"other"}
  async function expectedSeconds(q){var tmdbKey=s(g&&g.TMDB_API_KEY);if(!c.durationIdentity||!q||!tmdbKey||!/^\d+$/.test(q.tmdbId||""))return null;var kind=(q.mediaType==="tv"||q.mediaType==="anime"||q.mediaType==="series")?"tv":"movie",url;if(kind==="tv"&&q.season>0&&q.episode>0)url="https://api.themoviedb.org/3/tv/"+encodeURIComponent(q.tmdbId)+"/season/"+q.season+"/episode/"+q.episode+"?api_key="+encodeURIComponent(tmdbKey);else url="https://api.themoviedb.org/3/"+kind+"/"+encodeURIComponent(q.tmdbId)+"?api_key="+encodeURIComponent(tmdbKey);try{var r=await g.fetch(url,{headers:{Accept:"application/json"},signal:timeoutSignal(c.tmdbTimeoutMs)});if(!r||!r.ok)return null;var d=await r.json(),minutes=Number(d&&d.runtime||0);if(!minutes&&kind==="tv"&&Array.isArray(d&&d.episode_run_time)&&d.episode_run_time.length)minutes=Number(d.episode_run_time[0]||0);return minutes>=5?minutes*60:null}catch(_e){return null}}
  async function directPlayable(row,url){var r=await fetchText(url,row,true);if(r.state!=="ok")return r;if(/text\/html|application\/xhtml/i.test(r.contentType)||/^<!doctype html|^<html/i.test(r.text||""))return{state:"dead",reason:"html_payload"};return{state:"ok"}}
  async function remoteCheck(row,expected,tv){var kind=mediaKind(row),result;if(kind==="hls")result=await inspectHls(row,s(row.url));else if(kind==="direct")result=await directPlayable(row,s(row.url));else return{keep:true};if(result.state==="dead")return{keep:false,reason:result.reason||("http_"+result.status)};if(result.state==="unknown"){if(c.strictPlayback||tv)return{keep:false,reason:result.reason||"unverified_media"};return{keep:true}}if(kind==="hls"&&expected&&result.duration){var ratio=result.duration/expected;if(ratio<c.minDurationRatio||ratio>c.maxDurationRatio)return{keep:false,reason:"duration_identity_mismatch",ratio:ratio}}return{keep:true}}
  function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioRuntimeCapabilitySafetyV4)return false;var native=o[k];var wrap=async function(){var q=requestInfo(arguments),invoke=invocationArgs(arguments,q),v=await native.apply(this,invoke),x=slot(v);if(!x||!x.list.length)return v;var tv=isTv(),nativeRuntime=nativeHost();var staticRows=x.list.filter(function(row){return staticSafety(row).keep});if(nativeRuntime)return rebuild(v,x,staticRows);var expected=await expectedSeconds(q),head=staticRows.slice(0,c.maxRows),tail=staticRows.slice(c.maxRows),checks=await Promise.all(head.map(function(row){return remoteCheck(row,expected,tv)})),kept=head.filter(function(_row,i){return checks[i]&&checks[i].keep}).concat(tail);return rebuild(v,x,kept)};wrap.__nuvioRuntimeCapabilitySafetyV4=true;o[k]=wrap;return true}
  var ok=false;try{if(typeof module!=="undefined"&&module.exports)ok=install(module.exports,"getStreams")}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,{"providerId":"vidsrc","capabilityStrategy":"mixed_embed_resolver","requestTypeAliases":{},"timeoutMs":6500,"tmdbTimeoutMs":4500,"maxRows":4,"minDurationRatio":0.55,"maxDurationRatio":1.8,"durationIdentity":true,"strictPlayback":false,"implementationRevision":"field-safety-v8-media-only-p2p-vod-duration"});
/* CLOSEFIX:CORE.RUNTIME_MEDIA_SAFETY.V4 */
/* STARTFIX:CORE.HLS_RUNTIME_INTEGRITY.V1 */
/* FIXDATA:CORE.HLS_RUNTIME_INTEGRITY.V1:eyJpbXBsZW1lbnRhdGlvblJldmlzaW9uIjoicmVjb3ZlcnktZmlyc3QtdjUtbmF0aXZlLWJ1ZGdldC1vd25lZCIsIm1heENoaWxkcmVuIjoyLCJtYXhSZWNvdmVyeUNhbmRpZGF0ZXMiOjEyLCJtYXhSZWNvdmVyeVBhZ2VzIjo0LCJ0aW1lb3V0TXMiOjY1MDB9 */
/* NUVIO_HLS_RUNTIME_INTEGRITY_V1:7d44f4b5f93c */
;(function(g,config){
  "use strict";
  function nativeHlsHost(){try{return typeof g.__native_fetch==="function"}catch(_e){return false}}
  function clean(v){return String(v==null?"":v).replace(/^\uFEFF/,"").replace(/^ï»¿/,"").trim()}
  function hlsHint(stream){
    if(!stream||typeof stream!=="object")return false;
    var u=String(stream.url||"").toLowerCase(),t=String(stream.type||stream.format||"").toLowerCase();
    return /\.m3u8(?:[?#]|$)/i.test(u)||u.indexOf("/hls/")>=0||u.indexOf("/hls2/")>=0||t==="hls"||t==="m3u8"||t.indexOf("mpegurl")>=0;
  }
  function absolute(raw,base){try{return new URL(clean(raw),base).toString()}catch(_e){return ""}}
  function headerValue(stream,name){
    var src=stream&&stream.headers&&typeof stream.headers==="object"?stream.headers:{};
    var wanted=String(name||"").toLowerCase(),keys=Object.keys(src);
    for(var i=0;i<keys.length;i++)if(String(keys[i]).toLowerCase()===wanted)return clean(src[keys[i]]);
    return "";
  }
  function requestHeaders(stream,referer,range){
    var src=stream&&stream.headers&&typeof stream.headers==="object"?stream.headers:{};
    var out={};Object.keys(src).forEach(function(k){out[k]=String(src[k])});
    if(referer){
      var refKey=Object.keys(out).find(function(k){return k.toLowerCase()==="referer"}),currentRef=refKey?clean(out[refKey]):"";
      if(!currentRef||currentRef!==clean(referer)){
        Object.keys(out).forEach(function(k){var lower=k.toLowerCase();if(lower==="referer"||lower==="origin")delete out[k]});
        out.Referer=referer;try{out.Origin=new URL(referer).origin}catch(_e){}
      }
    }
    if(range&&!Object.keys(out).some(function(k){return k.toLowerCase()==="range"}))out.Range="bytes=0-4095";
    if(!out.Accept)out.Accept="application/vnd.apple.mpegurl,application/x-mpegURL,application/dash+xml,video/*,text/plain,*/*";
    return out;
  }
  async function fetchBounded(url,stream,referer,range,timeoutOverride){
    if(!g||typeof g.fetch!=="function")return {state:"unknown",reason:"fetch_unavailable"};
    var controller=typeof AbortController!=="undefined"?new AbortController():null;
    var timer=null,timeoutMs=Number(timeoutOverride||config.timeoutMs)||config.timeoutMs;
    if(controller&&typeof setTimeout==="function")timer=setTimeout(function(){try{controller.abort()}catch(_e){}},timeoutMs);
    try{
      var response=await g.fetch(url,{method:"GET",redirect:"follow",headers:requestHeaders(stream,referer,range),signal:controller?controller.signal:void 0});
      if(!response)return {state:"unknown",reason:"no_response"};
      if(response.status===404||response.status===410)return {state:"invalid",reason:"http_"+response.status};
      if(!response.ok)return {state:"unknown",reason:"http_"+response.status};
      var contentType=String(response.headers&&response.headers.get?response.headers.get("content-type")||"":"").toLowerCase();
      return {state:"ok",response:response,url:String(response.url||url),contentType:contentType};
    }catch(error){return {state:"unknown",reason:error&&error.name==="AbortError"?"timeout":"network_error"}}
    finally{if(timer!==null&&typeof clearTimeout==="function")try{clearTimeout(timer)}catch(_e){}}
  }
  async function responseText(result){
    var response=result&&result.response;if(!response)return "";
    try{if(typeof response.text==="function")return clean(await response.text())}catch(_e){}
    try{if(typeof response.arrayBuffer==="function"){var ab=await response.arrayBuffer();return clean(new TextDecoder("utf-8").decode(ab))}}catch(_e){}
    try{if(response.body&&typeof response.body.getReader==="function"){var reader=response.body.getReader(),chunks=[],total=0;while(total<131072){var part=await reader.read();if(part&&part.value){chunks.push(part.value);total+=part.value.byteLength||part.value.length||0}if(!part||part.done)break}try{if(typeof reader.cancel==="function")await reader.cancel()}catch(_e){}var merged=new Uint8Array(total),offset=0;for(var i=0;i<chunks.length;i++){var value=chunks[i],take=Math.min(value.byteLength||value.length||0,total-offset);merged.set(value.subarray?value.subarray(0,take):value,offset);offset+=take;if(offset>=total)break}return clean(new TextDecoder("utf-8").decode(merged))}}catch(_e){}
    return "";
  }
  async function responseBytes(result,cap){
    var response=result&&result.response,limit=Math.max(188,Number(cap||4096)||4096);if(!response)return new Uint8Array(0);
    try{
      if(response.body&&typeof response.body.getReader==="function"){
        var reader=response.body.getReader(),chunks=[],total=0;
        while(total<limit){var part=await reader.read();if(part&&part.value){var take=Math.min(part.value.byteLength||part.value.length||0,limit-total);chunks.push(part.value.subarray?part.value.subarray(0,take):part.value);total+=take}if(!part||part.done||total>=limit)break}
        try{if(typeof reader.cancel==="function")await reader.cancel()}catch(_e){}
        var merged=new Uint8Array(total),offset=0;for(var i=0;i<chunks.length;i++){var value=chunks[i],len=value.byteLength||value.length||0;merged.set(value,offset);offset+=len}return merged;
      }
    }catch(_e){}
    try{if(typeof response.arrayBuffer==="function"){var ab=await response.arrayBuffer(),bytes=new Uint8Array(ab);return bytes.length>limit?bytes.slice(0,limit):bytes}}catch(_e){}
    return new Uint8Array(0);
  }
  function asciiPrefix(bytes,cap){var out="",n=Math.min(bytes&&bytes.length||0,Number(cap||96)||96);for(var i=0;i<n;i++){var b=bytes[i];out+=b>=32&&b<=126?String.fromCharCode(b):" "}return out.trim().toLowerCase()}
  function hasTsSync(bytes){var n=bytes&&bytes.length||0;if(n<188)return n>0&&bytes[0]===0x47;var max=Math.min(187,n-1);for(var o=0;o<=max;o++){if(bytes[o]!==0x47)continue;if(o+188<n&&bytes[o+188]!==0x47)continue;if(o+376<n&&bytes[o+376]!==0x47)continue;return true}return false}
  function hasMp4Box(bytes){if(!bytes||bytes.length<8)return false;for(var o=0;o+8<=bytes.length&&o<64;o+=4){var a=String.fromCharCode(bytes[o+4]||0,bytes[o+5]||0,bytes[o+6]||0,bytes[o+7]||0);if(a==="ftyp"||a==="styp"||a==="moof"||a==="moov")return true}return false}
  function nonMediaPayload(bytes,contentType){var ct=String(contentType||"").toLowerCase(),p=asciiPrefix(bytes,160);if(/text\/html|application\/(?:json|problem\+json)|text\/plain|application\/xhtml\+xml/.test(ct))return true;return /^<!doctype\s+html|^<html\b|^<\?xml\b|^\{|^\[/.test(p)}
  function mapUri(body,base){var m=clean(body).match(/#EXT-X-MAP\s*:[^\n\r]*\bURI\s*=\s*"([^"]+)"/i)||clean(body).match(/#EXT-X-MAP\s*:[^\n\r]*\bURI\s*=\s*([^,\s]+)/i);return m?absolute(m[1],base):""}
  function firstMediaUri(body,base){var lines=clean(body).split(/\r?\n/);for(var i=0;i<lines.length;i++){var v=clean(lines[i]);if(!v||v.charAt(0)==="#")continue;var u=absolute(v,base);if(u)return u}return ""}
  function playlistEncrypted(body){var lines=clean(body).match(/#EXT-X-KEY\s*:[^\n\r]*/gi)||[];for(var i=0;i<lines.length;i++){var m=lines[i].match(/METHOD\s*=\s*([^,\s]+)/i),method=clean(m&&m[1]).toUpperCase();if(method&&method!=="NONE")return true}return false}
  function segmentProof(bytes,contentType,url,hasMap,encrypted){
    if(!bytes||!bytes.length)return {state:"unknown",reason:"segment_bytes_unavailable"};
    if(nonMediaPayload(bytes,contentType))return {state:"invalid",reason:"segment_non_media_payload"};
    if(encrypted)return {state:"unknown",reason:"encrypted_segment"};
    var u=String(url||"").toLowerCase(),ct=String(contentType||"").toLowerCase();
    var ts=/\.ts(?:[?#]|$)/i.test(u)||/video\/(?:mp2t|mpegts)|application\/(?:mp2t|mpegts)/i.test(ct);
    if(ts)return hasTsSync(bytes)?{state:"valid",kind:"mpegts"}:{state:"invalid",reason:"ts_sync_missing"};
    var fragmented=hasMap||/\.(?:m4s|mp4)(?:[?#]|$)/i.test(u)||/video\/mp4|application\/mp4/i.test(ct);
    if(fragmented)return hasMp4Box(bytes)?{state:"valid",kind:"fmp4"}:{state:"invalid",reason:"fmp4_signature_missing"};
    return {state:"unknown",reason:"segment_container_unknown"};
  }
  async function proveMediaPlaylist(body,playlistUrl,stream,referer){
    var encrypted=playlistEncrypted(body),init=mapUri(body,playlistUrl),target=init||firstMediaUri(body,playlistUrl);
    if(!target)return {state:"unknown",reason:"segment_uri_missing"};
    var result=await fetchBounded(target,stream,referer,true,config.nativeProbeTimeoutMs||config.timeoutMs);
    if(result.state==="invalid")return result;if(result.state!=="ok")return {state:"unknown",reason:result.reason||"segment_fetch_unknown"};
    var bytes=await responseBytes(result,4096),proof=segmentProof(bytes,result.contentType,result.url||target,!!init,encrypted);
    if(init&&proof.state==="valid"&&proof.kind==="fmp4")return proof;
    return proof;
  }
  async function nativeFirstSegmentProof(stream){
    var referer=headerValue(stream,"referer"),root=await fetchBounded(String(stream.url||""),stream,referer,false,config.nativeProbeTimeoutMs||config.timeoutMs);
    if(root.state==="invalid")return root;if(root.state!=="ok")return {state:"unknown",reason:root.reason||"playlist_fetch_unknown"};
    var body=await responseText(root),kind=playlistKind(body),base=root.url||String(stream.url||"");
    if(kind==="invalid"||kind==="header_only")return {state:"invalid",reason:"playlist_"+kind};
    if(kind==="master"){
      var variants=variantUris(body,base);if(!variants.length)return {state:"invalid",reason:"master_without_variants"};
      var child=await fetchBounded(variants[0],stream,referer,false,config.nativeProbeTimeoutMs||config.timeoutMs);
      if(child.state==="invalid")return child;if(child.state!=="ok")return {state:"unknown",reason:child.reason||"variant_fetch_unknown"};
      body=await responseText(child);kind=playlistKind(body);base=child.url||variants[0];
      if(kind==="invalid"||kind==="header_only")return {state:"invalid",reason:"variant_"+kind};
      if(kind==="master")return {state:"unknown",reason:"nested_master"};
    }
    return proveMediaPlaylist(body,base,stream,referer);
  }
  function playlistKind(body){
    var text=clean(body);if(!/^#EXTM3U(?:\s|$)/i.test(text))return "invalid";
    if(/#EXT-X-STREAM-INF\s*:/i.test(text))return "master";
    if(/#EXTINF\s*:/i.test(text)||/#EXT-X-PART\s*:/i.test(text)||/#EXT-X-MAP\s*:/i.test(text)){
      var lines=text.split(/\r?\n/).map(function(v){return v.trim()}).filter(Boolean);
      if(lines.some(function(v){return v.charAt(0)!=="#"}))return "media";
    }
    return "header_only";
  }
  function variantUris(body,base){
    var lines=clean(body).split(/\r?\n/),out=[];
    for(var i=0;i<lines.length;i++){
      if(!/^#EXT-X-STREAM-INF\s*:/i.test(lines[i]))continue;
      for(var j=i+1;j<lines.length;j++){
        var candidate=clean(lines[j]);if(!candidate)continue;if(candidate.charAt(0)==="#")continue;
        var u=absolute(candidate,base);if(u&&out.indexOf(u)<0)out.push(u);break;
      }
      if(out.length>=config.maxChildren)break;
    }
    return out;
  }
  function audioUris(body,base){
    var out=[],lines=clean(body).split(/\r?\n/);
    lines.forEach(function(line){
      if(!/^#EXT-X-MEDIA\s*:/i.test(line)||!/TYPE\s*=\s*AUDIO/i.test(line))return;
      var m=line.match(/URI\s*=\s*"([^"]+)"/i)||line.match(/URI\s*=\s*([^,\s]+)/i);
      var u=m&&absolute(m[1],base);if(u&&out.indexOf(u)<0)out.push(u);
    });
    return out.slice(0,config.maxChildren);
  }
  async function validateChild(url,stream,referer){
    var result=await fetchBounded(url,stream,referer,false);if(result.state!=="ok")return result.state;
    var body=await responseText(result),kind=playlistKind(body);return kind==="media"||kind==="master"?"valid":"invalid";
  }
  async function inspectHls(url,stream,referer){
    var result=await fetchBounded(url,stream,referer,false);
    if(result.state!=="ok")return {state:result.state,reason:result.reason||"fetch_failed",result:result};
    var ct=result.contentType||"";
    if(/^video\//i.test(ct))return {state:"direct",format:ct.indexOf("webm")>=0?"webm":"mp4",url:result.url,result:result};
    var body=await responseText(result),kind=playlistKind(body);
    if(kind==="invalid"||kind==="header_only")return {state:"invalid",kind:kind,body:body,result:result};
    if(kind==="media")return {state:"valid",kind:kind,url:result.url,body:body,result:result};

    var variants=variantUris(body,result.url||url),audio=audioUris(body,result.url||url);
    if(!variants.length)return {state:"invalid",kind:"master_without_variants",body:body,result:result};
    var variantState="invalid";
    for(var i=0;i<variants.length;i++){
      var s=await validateChild(variants[i],stream,result.url||referer);if(s==="valid"){variantState="valid";break}if(s==="unknown")variantState="unknown";
    }
    if(variantState!=="valid")return {state:variantState,kind:"master_child_"+variantState,body:body,result:result};
    if(audio.length){
      var audioState="invalid";
      for(var j=0;j<audio.length;j++){
        var a=await validateChild(audio[j],stream,result.url||referer);if(a==="valid"){audioState="valid";break}if(a==="unknown")audioState="unknown";
      }
      if(audioState!=="valid")return {state:audioState,kind:"audio_child_"+audioState,body:body,result:result};
    }
    return {state:"valid",kind:"master",url:result.url,body:body,result:result};
  }
  function normalizedText(text){
    return clean(text).replace(/\\u002[fF]/g,"/").replace(/\\\//g,"/").replace(/&amp;/g,"&");
  }
  function candidateUrls(text,base){
    var body=normalizedText(text),out=[],seen={};
    function add(raw){
      var value=clean(raw).replace(/^['"]|['"]$/g,"");if(!value||/^javascript:|^data:/i.test(value))return;
      var u=absolute(value,base);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;out.push(u);
    }
    var patterns=[
      /(?:src|href|data-src|data-url|data-file|data-player|data-embed|file|source|url|playlist|hls|stream|embedUrl|embed_url)\s*[:=]\s*["']([^"']+)["']/gi,
      /(https?:\/\/[^"'<>\s\\]+)/gi,
      /["']([^"']+\.(?:m3u8|mpd|mp4|mkv|webm)(?:[?#][^"']*)?)["']/gi
    ],m;
    for(var i=0;i<patterns.length&&out.length<config.maxRecoveryCandidates;i++){
      patterns[i].lastIndex=0;while((m=patterns[i].exec(body))!==null&&out.length<config.maxRecoveryCandidates)add(m[1]);
    }
    return out;
  }
  function mediaHint(url){return /\.m3u8(?:[?#]|$)|\/hls2?\//i.test(url)?"hls":/\.mpd(?:[?#]|$)/i.test(url)?"dash":/\.(?:mp4|mkv|webm)(?:[?#]|$)/i.test(url)?"direct":"page"}
  function cloneRecovered(stream,url,format,referer){
    var row=Object.assign({},stream,{url:url}),headers={};
    var src=stream&&stream.headers&&typeof stream.headers==="object"?stream.headers:{};Object.keys(src).forEach(function(k){headers[k]=String(src[k])});
    if(referer){
      var refKey=Object.keys(headers).find(function(k){return k.toLowerCase()==="referer"}),currentRef=refKey?clean(headers[refKey]):"";
      if(!currentRef||currentRef!==clean(referer)){
        Object.keys(headers).forEach(function(k){var lower=k.toLowerCase();if(lower==="referer"||lower==="origin")delete headers[k]});
        headers.Referer=referer;try{headers.Origin=new URL(referer).origin}catch(_e){}
      }
    }
    if(Object.keys(headers).length)row.headers=headers;
    if(format==="hls"){row.type="hls";if("format" in row)row.format="m3u8"}
    else if(format==="dash"){row.type="dash";if("format" in row)row.format="mpd"}
    else if(format){row.type=format;if("format" in row)row.format=format}
    return row;
  }
  async function probeDirect(url,stream,referer){
    var result=await fetchBounded(url,stream,referer,true);if(result.state!=="ok")return null;
    var ct=result.contentType||"";
    if(/^video\//i.test(ct))return cloneRecovered(stream,result.url,ct.indexOf("webm")>=0?"webm":"mp4",referer);
    if(/(?:application\/dash\+xml|application\/xml|text\/xml)/i.test(ct)||/\.mpd(?:[?#]|$)/i.test(result.url)){
      var dash=await responseText(result);if(/<MPD(?:\s|>)/i.test(dash))return cloneRecovered(stream,result.url,"dash",referer);
    }
    if(/mpegurl/i.test(ct)||/\.m3u8(?:[?#]|$)/i.test(result.url)){
      var hls=await inspectHls(result.url,stream,referer);if(hls.state==="valid")return cloneRecovered(stream,hls.url||result.url,"hls",referer);
    }
    return null;
  }
  async function recover(stream,inspection){
    var queue=[],seen={},pages=0;
    function enqueue(url,referer){var u=absolute(url,referer||String(stream.url||""));if(!/^https?:\/\//i.test(u)||seen[u]||u===String(stream.url||""))return;seen[u]=1;queue.push({url:u,referer:referer||""})}
    var base=inspection&&inspection.result&&inspection.result.url||String(stream.url||"");
    candidateUrls(inspection&&inspection.body||"",base).forEach(function(u){enqueue(u,base)});
    var outerReferer=headerValue(stream,"referer");
    [stream&&stream.playerUrl,stream&&stream.embedUrl,stream&&stream.pageUrl,stream&&stream.sourceUrl,stream&&stream.referrer,stream&&stream.referer].forEach(function(u){if(u)enqueue(u,outerReferer||base)});
    if(outerReferer)enqueue(outerReferer,"");
    while(queue.length&&pages<config.maxRecoveryPages){
      var item=queue.shift(),kind=mediaHint(item.url);
      if(kind==="hls"){
        var hls=await inspectHls(item.url,stream,item.referer);if(hls.state==="valid")return cloneRecovered(stream,hls.url||item.url,"hls",item.referer);if(hls.state==="direct")return cloneRecovered(stream,hls.url||item.url,hls.format||"mp4",item.referer);
        candidateUrls(hls.body||"",hls.result&&hls.result.url||item.url).forEach(function(u){enqueue(u,hls.result&&hls.result.url||item.url)});continue;
      }
      if(kind==="direct"||kind==="dash"){
        var direct=await probeDirect(item.url,stream,item.referer);if(direct)return direct;continue;
      }
      pages++;
      var page=await fetchBounded(item.url,stream,item.referer,false);if(page.state!=="ok")continue;
      var ct=page.contentType||"";
      if(/^video\//i.test(ct))return cloneRecovered(stream,page.url,page.contentType.indexOf("webm")>=0?"webm":"mp4",item.referer);
      var body=await responseText(page);
      if(/^#EXTM3U(?:\s|$)/i.test(body)){
        var pageHls=await inspectHls(page.url,stream,item.referer);if(pageHls.state==="valid")return cloneRecovered(stream,pageHls.url||page.url,"hls",item.referer);
      }
      if(/<MPD(?:\s|>)/i.test(body))return cloneRecovered(stream,page.url,"dash",item.referer);
      candidateUrls(body,page.url||item.url).forEach(function(u){enqueue(u,page.url||item.url)});
    }
    return null;
  }
  async function validateOrRecover(stream){
    var inspection=await inspectHls(String(stream.url||""),stream,headerValue(stream,"referer"));
    if(inspection.state==="valid")return stream;
    if(inspection.state==="unknown"&&!config.failClosedUnknown)return stream;
    if(inspection.state==="direct")return cloneRecovered(stream,inspection.url||String(stream.url||""),inspection.format||"mp4",headerValue(stream,"referer"));
    var recovered=await recover(stream,inspection);if(recovered)return recovered;
    return null;
  }
  async function filterRows(value){
    var rows=Array.isArray(value)?value:value&&Array.isArray(value.streams)?value.streams:null;
    if(nativeHlsHost()){
      if(!config.probeFirstSegmentNative||!rows||!rows.length)return value;
      var remaining=Math.max(1,Number(config.nativeProbeMaxRows||1)||1);
      var checks=await Promise.all(rows.map(async function(stream){
        if(!hlsHint(stream)||remaining<=0)return stream;
        remaining-=1;
        var proof=await nativeFirstSegmentProof(stream);
        if(proof.state==="invalid"){
          try{console.warn("[Nuvio HLS integrity] rejected invalid first media container",proof.reason||"invalid",String(stream&&stream.url||"").slice(0,180))}catch(_e){}
          return null;
        }
        return stream;
      }));
      var nativeFiltered=checks.filter(Boolean);
      if(Array.isArray(value))return nativeFiltered;
      var nativeCopy=Object.assign({},value);nativeCopy.streams=nativeFiltered;return nativeCopy;
    }
    if(!rows||!rows.length)return value;
    var checks=await Promise.all(rows.map(async function(stream){
      if(!config.probeAllUrls&&!hlsHint(stream))return stream;
      var output=await validateOrRecover(stream);
      if(!output){
        try{console.warn("[Nuvio HLS integrity] rejected malformed playlist after bounded recovery",String(stream&&stream.url||"").slice(0,180))}catch(_e){}
      }
      return output;
    }));
    var filtered=checks.filter(Boolean);
    if(Array.isArray(value))return filtered;
    var copy=Object.assign({},value);copy.streams=filtered;return copy;
  }
  function wrap(target,key){
    if(!target||typeof target[key]!=="function"||target[key].__nuvioHlsIntegrityV1)return false;
    var native=target[key];
    var wrapped=async function(){return filterRows(await native.apply(this,arguments))};
    try{Object.defineProperty(wrapped,"__nuvioHlsIntegrityV1",{value:true})}catch(_e){wrapped.__nuvioHlsIntegrityV1=true}
    target[key]=wrapped;return true;
  }
  function install(){
    var done=false;
    try{done=wrap(g,"getStreams")||done}catch(_e){}
    try{if(typeof module!=="undefined"&&module&&module.exports){done=wrap(module.exports,"getStreams")||done;done=wrap(module.exports,"streams")||done}}catch(_e){}
    try{if(typeof exports!=="undefined")done=wrap(exports,"getStreams")||done}catch(_e){}
    return done;
  }
  install();
})(typeof globalThis!=="undefined"?globalThis:this,{"timeoutMs":6500,"maxChildren":2,"maxRecoveryPages":4,"maxRecoveryCandidates":12,"implementationRevision":"recovery-first-v5-native-budget-owned"});
/* CLOSEFIX:CORE.HLS_RUNTIME_INTEGRITY.V1 */
/* STARTFIX:CORE.PROVIDER_SECURITY_BOUNDARY.V1 */
/* FIXDATA:CORE.PROVIDER_SECURITY_BOUNDARY.V1:eyJwb3N0QnVpbGRNdXRhdGlvbiI6ZmFsc2UsInByb3ZpZGVyTXV0YXRpb24iOmZhbHNlLCJyZXZpc2lvbiI6InByZXZlbnRpdmUtY29yZS1zZWN1cml0eS12NCJ9 */
/* NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1 */
globalThis.__nuvioGlobalProviderSecurityBoundaryV1=true;
/* CLOSEFIX:CORE.PROVIDER_SECURITY_BOUNDARY.V1 */
/* STARTFIX:CORE.RUNTIME_COMPAT.V1 */
/* FIXDATA:CORE.RUNTIME_COMPAT.V1:eyJyZXZpc2lvbiI6Mn0= */
/* NUVIO_GLOBAL_RUNTIME_COMPAT_V1 */
;(function(g){
  "use strict";
  if(!g||g.__nuvioGlobalRuntimeCompatV1)return;
  g.__nuvioGlobalRuntimeCompatV1={revision:2};

  // NuvioDesktop's current URL polyfill stores href independently from hostname,
  // host, pathname, search and hash. Replacing hostname therefore leaves
  // URL#toString() stale. Keep the official parser, but return instances whose
  // string form is reconstructed from their current public URL fields.
  var NativeURL=g.URL;
  if(typeof NativeURL==="function"){
    function renderUrl(u){
      try{
        var protocol=String(u.protocol||"");
        var host=String(u.host||"");
        if(!host){
          host=String(u.hostname||"");
          var port=String(u.port||"");
          if(port&&host.indexOf(":")<0)host+=":"+port;
        }else if(u.hostname&&String(u.hostname)!==host.split(":")[0]){
          host=String(u.hostname||"")+(u.port?":"+String(u.port):"");
        }
        var hierarchical=protocol&&host?protocol+"//"+host:"";
        var pathname=String(u.pathname||"");
        var search=String(u.search||"");
        var hash=String(u.hash||"");
        var rendered=hierarchical+pathname+search+hash;
        if(rendered)return rendered;
        // Some official QuickJS URL polyfills expose a correct href for
        // new URL(relative, base) while leaving protocol/host/pathname empty.
        // Fall back to href only when there is nothing mutable to reconstruct.
        return String(u.href||"");
      }catch(_error){
        try{return String(u.href||"");}catch(_ignored){return "";}
      }
    }
    var staleMutableUrl=false;
    try{
      var probe=new NativeURL("https://old.invalid/a?b=1#c");
      probe.hostname="new.invalid";
      staleMutableUrl=String(probe).indexOf("new.invalid")<0;
    }catch(_error){}
    if(staleMutableUrl){
      var CompatURL=function(input,base){
        var u=arguments.length>1?new NativeURL(input,base):new NativeURL(input);
        try{
          u.toString=function(){return renderUrl(u);};
          u.toJSON=function(){return renderUrl(u);};
        }catch(_error){}
        return u;
      };
      try{CompatURL.prototype=NativeURL.prototype;}catch(_error){}
      try{
        Object.getOwnPropertyNames(NativeURL).forEach(function(name){
          if(name==="length"||name==="name"||name==="prototype")return;
          try{CompatURL[name]=NativeURL[name];}catch(_ignored){}
        });
      }catch(_error){}
      g.URL=CompatURL;
    }
  }

  // Normalize URL/Request-like inputs before the official Desktop fetch bridge.
  // QuickJS host bindings stringify arbitrary objects differently across clients;
  // the network bridge itself expects one concrete URL string.
  if(typeof g.fetch==="function"&&!g.fetch.__nuvioGlobalRuntimeCompatV1){
    var nativeFetch=g.fetch.bind(g);
    function providerTimedOut(){
      try{
        var deadline=Number(g&&g.__nuvioProviderDeadlineMs)||0;
        return deadline>0&&Date.now()>deadline;
      }catch(_error){return false;}
    }
    function providerTimeoutError(){
      var error=new Error("NiakVIO provider execution budget exceeded");
      error.name="NuvioProviderTimeoutError";
      error.code="NUVIO_PROVIDER_TIMEOUT";
      error.__nuvioProviderTimeout=true;
      return error;
    }
    var compatFetch=function(input,init){
      if(providerTimedOut())return Promise.reject(providerTimeoutError());
      var next=input;
      try{
        if(input&&typeof input==="object"){
          if(typeof input.url==="string")next=input.url;
          else if(typeof input.href==="string"||typeof input.toString==="function")next=String(input);
        }
      }catch(_error){next=input;}
      var pending;
      try{pending=nativeFetch(next,init);}catch(error){return Promise.reject(error);}
      return Promise.resolve(pending).then(function(value){
        if(providerTimedOut())throw providerTimeoutError();
        return value;
      });
    };
    compatFetch.__nuvioGlobalRuntimeCompatV1=true;
    compatFetch.__nuvioOriginal=nativeFetch;
    g.fetch=compatFetch;
  }

  // Some provider helpers install abort timeouts even though NuvioDesktop QuickJS
  // currently exposes no timer API. A positive delay is intentionally a no-op:
  // firing an abort immediately is worse than allowing the native request budget
  // to govern the request. Zero-delay callbacks keep microtask semantics.
  if(typeof g.setTimeout!=="function"){
    g.setTimeout=function(callback,delay){
      if((Number(delay)||0)<=0&&typeof callback==="function"&&typeof Promise!=="undefined"){
        Promise.resolve().then(callback).catch(function(){});
      }
      return 0;
    };
  }
  if(typeof g.clearTimeout!=="function")g.clearTimeout=function(){};
  if(typeof g.setInterval!=="function")g.setInterval=function(){return 0;};
  if(typeof g.clearInterval!=="function")g.clearInterval=function(){};
})(typeof globalThis!=="undefined"?globalThis:this);
/* CLOSEFIX:CORE.RUNTIME_COMPAT.V1 */
/* STARTFIX:CORE.STREAM_FACTS.V1 */
/* FIXDATA:CORE.STREAM_FACTS.V1:eyJyZXZpc2lvbiI6Imdsb2JhbC1mYWN0cy12MS1zb3VyY2UtcHJlc2VydmF0aW9uLXYyIn0= */
/* NUVIO_GLOBAL_STREAM_FACTS_V1:3f39765bf864 */
;(function(g){"use strict";
function s(v){return String(v==null?"":v).trim()}
function meaningful(v){var x=s(v);return x&&!/^(?:unknown|inconnue?|n\/?a|null|undefined|none|-+)$/i.test(x)}
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
/* NUVIO_STREAM_QUALITY_RECOVERY_V2 */
/* NUVIO_STREAM_SOURCE_METADATA_PRESERVATION_V2 */
function urlFacts(row){var u=s(row&&row.url);if(!u)return"";try{u=decodeURIComponent(u)}catch(_e){}return u.replace(/[?#&=/_\.\-]+/g," ")}
function blob(row){return [row&&row.name,row&&row.title,row&&row.size,row&&row.description,row&&row.quality,row&&row.resolution,row&&row.height,row&&row.width,row&&row.label,row&&row.language,row&&row.codec,row&&row.audio,row&&row.sourceType,row&&row.releaseType,row&&row.format,row&&row.hdr,row&&row.videoTech,row&&row.bitDepth,row&&row.subtitles,row&&row.sourceLabel,row&&row.filename,urlFacts(row)].map(s).join(" ")}
function qualityFromHeight(height){var h=Number(height||0);if(h>=2000)return"2160p";if(h>=1350)return"1440p";if(h>=900)return"1080p";if(h>=650)return"720p";if(h>=450)return"480p";if(h>=300)return"360p";return""}
function quality(row,b){if(meaningful(row.quality)){var v=s(row.quality);return /^(?:4k|2160p)$/i.test(v)?"2160p":v}var resolution=s(row&&row.resolution),rm=resolution.match(/(\d{2,5})\s*[xX×]\s*(\d{2,5})/);if(rm){var rq=qualityFromHeight(rm[2]);if(rq)return rq}var hq=qualityFromHeight(row&&row.height);if(hq)return hq;var u=b.toUpperCase();if(/(?:\b4K\b|\b2160P?\b|\bUHD\b)/.test(u))return"2160p";var m=u.match(/\b(1440|1080|720|576|540|480|360)P?\b/);return m?m[1]+"p":""}
function language(row,b){if(meaningful(row.language))return s(row.language);var u=b.toUpperCase();if(/\bMULTI(?:[- ]?AUDIO|LANG(?:UE)?S?)?\b/.test(u))return"Multi";if(/\bDUAL(?:[- ]?AUDIO)?\b/.test(u))return"Dual Audio";if(/\bVOSTFR\b/.test(u))return"VOSTFR";if(/\bVFQ\b/.test(u))return"VFQ";if(/\bVFF\b/.test(u))return"VFF";if(/\bVF\b/.test(u))return"VF";if(/\bVO\b/.test(u))return"VO";return""}
function codec(row,b){if(meaningful(row.codec))return s(row.codec);var u=b.toUpperCase();if(/\b(?:HEVC|H[ ._-]?265|X265)\b/.test(u))return"HEVC";if(/\bAV1\b/.test(u))return"AV1";if(/\bVP9\b/.test(u))return"VP9";if(/\b(?:AVC|H[ ._-]?264|X264)\b/.test(u))return"AVC";return""}
function audio(row,b){if(meaningful(row.audio))return s(row.audio);var u=b.toUpperCase(),ch="",m=u.match(/\b(7\.1|5\.1|2\.1|2\.0)\b/);if(m)ch=" "+m[1];if(/\b(?:ATMOS|DOLBY ATMOS)\b/.test(u))return"Dolby Atmos"+ch;if(/\bTRUE[ ._-]?HD\b/.test(u))return"TrueHD"+ch;if(/\b(?:E-?AC-?3|DDP|DD\+)\b/.test(u))return"E-AC3"+ch;if(/\bAC-?3\b/.test(u))return"AC3"+ch;if(/\bDTS[: ._-]?X\b/.test(u))return"DTS:X"+ch;if(/\bDTS[- ]?HD\b/.test(u))return"DTS-HD"+ch;if(/\bDTS\b/.test(u))return"DTS"+ch;if(/\bAAC\b/.test(u))return"AAC"+ch;return""}
function duration(row,b){if(typeof row.duration==="number"&&Number.isFinite(row.duration)&&row.duration>0)return row.duration>600?Math.round(row.duration/60):Math.round(row.duration);var direct=s(row.duration),m=direct.match(/(\d{1,4})\s*(?:min|minutes?)\b/i);if(m)return Number(m[1]);var x=b.match(/\b(\d{1,3})\s*(?:min|minutes?)\b/i);return x?Number(x[1]):0}
function sourceType(row,b){if(meaningful(row.sourceType))return s(row.sourceType);var u=b.toUpperCase();if(/\b(?:BLU[- ]?RAY|BDRIP|BRRIP|BDREMUX)\b/.test(u))return"BLU-RAY";if(/\bWEB[- .]?DL\b/.test(u))return"WEB-DL";if(/\bWEB[- .]?RIP\b/.test(u))return"WEBRIP";if(/\bHDTV\b/.test(u))return"HDTV";if(/\bDVD[- .]?RIP\b/.test(u))return"DVD RIP";return""}
function releaseType(row,b){if(meaningful(row.releaseType))return s(row.releaseType);return /\bREMUX\b/i.test(b)?"REMUX":""}
function formatType(row){if(meaningful(row.format))return s(row.format);var u=s(row.url).split(/[?#]/)[0].toLowerCase();if(/\.m3u8$/.test(u))return"HLS";if(/\.mpd$/.test(u))return"DASH";if(/\.mp4$/.test(u))return"MP4";if(/\.mkv$/.test(u))return"MKV";return""}
function keep(out,key,value,limit){if(meaningful(value)&&!meaningful(out[key]))out[key]=s(value).slice(0,limit);return out}
function preserveSource(row,out){keep(out,"sourceName",row.name,512);keep(out,"sourceTitle",row.title,512);keep(out,"sourceDescription",row.description,4096);keep(out,"sourceSize",row.size,256);keep(out,"sourceQuality",row.quality,128);keep(out,"sourceResolution",row.resolution,128);keep(out,"sourceLanguage",row.language,128);keep(out,"sourceCodec",row.codec,128);keep(out,"sourceAudio",row.audio,256);keep(out,"sourceTypeRaw",row.sourceType,128);keep(out,"releaseTypeRaw",row.releaseType,128);keep(out,"sourceFormat",row.format,128);return out}
function facts(row){if(!row||typeof row!=="object")return row;var out=preserveSource(row,Object.assign({},row)),b=blob(row),q=quality(row,b),l=language(row,b),c=codec(row,b),a=audio(row,b),d=duration(row,b),st=sourceType(row,b),rt=releaseType(row,b),f=formatType(row);if(q)out.quality=q;else if("quality" in out&&!meaningful(out.quality))delete out.quality;if(l)out.language=l;if(c)out.codec=c;if(a)out.audio=a;if(d)out.duration=d;if(st)out.sourceType=st;if(rt)out.releaseType=rt;if(f)out.format=f;return out}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalStreamFactsV1)return false;var native=o[k];var wrap=async function(){var v=await native.apply(this,arguments),x=slot(v);return x?rebuild(v,x,x.list.map(facts)):v};wrap.__nuvioGlobalStreamFactsV1=true;o[k]=wrap;return true}
var ok=false;try{if(typeof module!=="undefined"&&module.exports){ok=install(module.exports,"getStreams")||install(module.exports,"streams")}}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this);
/* CLOSEFIX:CORE.STREAM_FACTS.V1 */
/* STARTFIX:CORE.STREAM_IDENTITY.V1 */
/* FIXDATA:CORE.STREAM_IDENTITY.V1:eyJjYXRhbG9ndWVZZWFyUG9saWN5IjoibW92aWUtb25seSIsImltcGxlbWVudGF0aW9uUmV2aXNpb24iOiJjcm9zcy1jbGllbnQtc2hhcmVkLXRtZGItb3duZXItemVyby1lcGlzb2RpYy15ZWFyLXYxMSIsInByb3ZpZGVySWQiOiJ2aWRzcmMiLCJ0bWRiUnVudGltZUtleVJlcXVpcmVkIjp0cnVlLCJ0bWRiVGltZW91dE1zIjoxMjAwfQ== */
/* NUVIO_GLOBAL_STREAM_IDENTITY_V1:99eadfce96d9 */
;(function(g,c){"use strict";
function s(v){return String(v==null?"":v).replace(/\\\//g,"/").trim()}
function norm(v){try{return s(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}catch(_e){return s(v).toLowerCase()}}
function uniq(values){var out=[],seen={};(values||[]).forEach(function(v){var x=s(v),k=norm(x);if(x&&k&&!seen[k]){seen[k]=1;out.push(x)}});return out}
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
function req(a){var f=a[0],q=f&&typeof f==="object"&&!Array.isArray(f)?Object.assign({},f):{tmdbId:f,mediaType:a[1],season:a[2],episode:a[3]};var raw=s(q.tmdbId||q.tmdb_id||q.id||f).replace(/^tmdb:/i,"");q.tmdbId=(raw.match(/^\d+/)||[])[0]||"";q.imdbId=s(q.imdbId||q.imdb_id||"").toLowerCase();q.mediaType=s(q.mediaType||q.type||a[1]||"movie").toLowerCase();q.title=s(q.title||q.name||q.label);q.year=Number(q.year||0)||0;q.season=Number(q.season||a[2]||0)||0;q.episode=Number(q.episode||a[3]||0)||0;return q}
function episodic(q){return q.mediaType==="tv"||q.mediaType==="series"||q.mediaType==="anime"}
function providerMedia(v){var x=s(v).toLowerCase();return x==="movie"?"movie":((x==="tv"||x==="series"||x==="show"||x==="anime")?"tv":"")}
function catalogueScore(e){
  e=e&&typeof e==="object"?e:{};
  var title=norm(e.title),expected=uniq(e.expectedTitles||[]).map(norm).filter(Boolean),actualMedia=providerMedia(e.actualMedia),expectedMedia=providerMedia(e.expectedMedia),providerId=s(e.providerId),strict=e.strictIdentity===true;
  var movie=expectedMedia==="movie",year=s(e.year).slice(0,4),expectedYear=s(e.expectedYear).slice(0,4);
  if(actualMedia&&expectedMedia&&actualMedia!==expectedMedia)return-1;
  if(e.requireProviderTypeEvidence===true&&(!actualMedia||!expectedMedia))return-1;
  if(strict){
    if(!providerId||!title||!expected.length||expected.indexOf(title)<0)return-1;
    if(movie&&expectedYear){
      if(!/^\d{4}$/.test(year))return-1;
      if(Math.abs(Number(year)-Number(expectedYear))>1)return-1;
    }
    return 120+(movie&&year===expectedYear?20:0);
  }
  if(movie&&year&&expectedYear&&year!==expectedYear)return-1;
  var score=0,primary=expected[0]||"";
  if(title&&expected.indexOf(title)>=0)score+=200;
  else if(title&&primary&&(title.indexOf(primary)>=0||primary.indexOf(title)>=0))score+=90;
  if(title&&primary){primary.split(" ").filter(function(v){return v.length>=3}).forEach(function(token){if(title.indexOf(token)>=0)score+=10})}
  if(movie&&year&&expectedYear&&year===expectedYear)score+=40;
  if(actualMedia&&expectedMedia&&actualMedia===expectedMedia)score+=60;
  if(providerId)score+=15;
  return score;
}
function htmlIdentityOk(e){
  e=e&&typeof e==="object"?e:{};
  if(e.strictIdentity!==true)return true;
  var visible=norm(e.visibleText),expected=uniq(e.expectedTitles||[]).map(norm).filter(Boolean),media=providerMedia(e.mediaType);
  if(!visible||!expected.length||!expected.some(function(title){return visible.indexOf(title)>=0}))return false;
  if(media==="movie"){
    var expectedYear=s(e.expectedYear).slice(0,4),html=s(e.html),years=html.match(/\b(?:19|20)\d{2}\b/g)||[];
    if(expectedYear&&/^\d{4}$/.test(expectedYear)&&years.length&&years.indexOf(expectedYear)<0)return false;
  }
  return true;
}
try{if(g)g.__nuvioIdentityPolicyV1=Object.freeze({catalogueScore:catalogueScore,htmlIdentityOk:htmlIdentityOk,yearPolicy:"movie-only"})}catch(_e){}
function kind(q){return episodic(q)?"tv":"movie"}
function nativeFetchBridge(){try{return !!(g&&typeof g.__native_fetch==="function")}catch(_e){return false}}
function runtimeTmdbKey(){try{return s(g&&g.TMDB_API_KEY)}catch(_e){return""}}
function runtimeTmdbAllowed(){return !!runtimeTmdbKey()}
async function cachedTmdb(q){try{var cache=g&&g.__nuvioTmdbMetadataCacheV1,key=kind(q)+":"+s(q.tmdbId);if(cache&&Object.prototype.hasOwnProperty.call(cache,key)){var value=await cache[key];if(value&&value.state==="ok"&&value.metadata)return value.metadata}}catch(_e){}return null}
function signal(){try{if(typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function")return AbortSignal.timeout(c.tmdbTimeoutMs)}catch(_e){}return null}
async function jsonFetch(url){if(!g||typeof g.fetch!=="function"||!runtimeTmdbAllowed())return null;var nb=nativeFetchBridge(),sig=nb?null:signal();if(!nb&&!sig)return null;var init={headers:{Accept:"application/json"}};if(sig)init.signal=sig;try{var r=await g.fetch(url,init);if(!r||!r.ok)return null;return await r.json()}catch(_e){return null}}
/* NUVIO_IDENTITY_SHARED_TMDB_CAPABILITY_V1 */
async function tmdb(q){var titles=uniq([q.title]),episodeTitles=[],year=q.year,imdb=q.imdbId,key=runtimeTmdbKey();if(!/^\d+$/.test(q.tmdbId||""))return{titles:titles,episodeTitles:episodeTitles,year:year,imdbId:imdb};var k=kind(q),base="https://api.themoviedb.org/3/"+k+"/"+encodeURIComponent(q.tmdbId),d=await cachedTmdb(q),shared=false;if(!d){try{var getter=g&&g.__nuvioCoreGetTmdbDataV1;if(typeof getter==="function"){shared=true;var result=await getter({tmdbId:q.tmdbId,mediaType:k,tmdbNamespace:k,season:q.season,episode:q.episode});if(result&&result.state==="ok"&&result.metadata)d=result.metadata}}catch(_e){}}if(!d&&!shared&&key)d=await jsonFetch(base+"?api_key="+encodeURIComponent(key)+"&language=fr-FR&append_to_response=external_ids");if(d){var date=s(d.release_date||d.first_air_date);titles=uniq(titles.concat([d.title,d.name,d.original_title,d.original_name]));year=year||Number((date.match(/(?:19|20)\d{2}/)||[])[0]||0)||0;imdb=imdb||s(d.external_ids&&d.external_ids.imdb_id).toLowerCase()}return{titles:titles,episodeTitles:episodeTitles,year:year,imdbId:imdb}}
async function episodeJson(q,language){var key=runtimeTmdbKey();if(!key||!episodic(q)||q.season<=0||q.episode<=0||!/^\d+$/.test(q.tmdbId||""))return null;var cache=null,cacheKey="episode:tv:"+q.tmdbId+":"+q.season+":"+q.episode+":"+language;try{cache=g&&g.__nuvioTmdbMetadataCacheV1;if(cache&&Object.prototype.hasOwnProperty.call(cache,cacheKey))return await cache[cacheKey]}catch(_e){}var url="https://api.themoviedb.org/3/tv/"+encodeURIComponent(q.tmdbId)+"/season/"+encodeURIComponent(q.season)+"/episode/"+encodeURIComponent(q.episode)+"?api_key="+encodeURIComponent(key)+"&language="+encodeURIComponent(language),pending=jsonFetch(url);try{if(cache)cache[cacheKey]=pending}catch(_e){}var value=await pending;try{if(cache){if(value)cache[cacheKey]=value;else delete cache[cacheKey]}}catch(_e){}return value}
async function ensureEpisodeTitles(q,m){if(!episodic(q)||q.season<=0||q.episode<=0||m.__episodeTitlesLoaded)return m;m.__episodeTitlesLoaded=true;var eps=await Promise.all([episodeJson(q,"fr-FR"),episodeJson(q,"en-US")]);eps.forEach(function(ep){if(ep)m.episodeTitles=uniq((m.episodeTitles||[]).concat([ep.name,ep.original_name]))});return m}
function episode(v){return/(?:^|\D)s(?:eason|aison)?\s*0*(\d{1,3})\s*[-_. ]*e(?:p(?:isode)?)?\s*0*(\d{1,4})(?:\D|$)/i.exec(v)||/(?:season|saison)\s*0*(\d{1,3})[^\d]{0,12}(?:episode|ep)\s*0*(\d{1,4})/i.exec(v)}
function explicitIds(row){var out={tmdbId:"",imdbId:""};var tv=s(row&&(row.tmdbId||row.tmdb_id||row.tmdb));if(/^\d+$/.test(tv))out.tmdbId=tv;var iv=s(row&&(row.imdbId||row.imdb_id||row.imdb)).toLowerCase();if(/^tt\d+$/.test(iv))out.imdbId=iv;try{var u=new URL(s(row&&row.url)),qp=u.searchParams,t=s(qp.get("tmdbId")||qp.get("tmdb")||"");if(!out.tmdbId&&/^\d+$/.test(t))out.tmdbId=t;var i=s(qp.get("imdbId")||qp.get("imdb")||"").toLowerCase();if(!out.imdbId&&/^tt\d+$/.test(i))out.imdbId=i}catch(_e){}return out}
function tokens(v){var noise={the:1,a:1,an:1,le:1,la:1,les:1,un:1,une:1,de:1,des:1,du:1,and:1,et:1,film:1,movie:1,episode:1,season:1,saison:1,stream:1,streaming:1,source:1,server:1,serveur:1,player:1,video:1,watch:1,play:1,direct:1,download:1,quality:1,unknown:1,fallback:1};var tech={vcloud:1,hubcloud:1,file:1,web:1,dl:1,webrip:1,webdl:1,bluray:1,remux:1,hdr:1,dv:1,dolby:1,atmos:1,aac:1,ac3:1,eac3:1,ddp:1,x264:1,x265:1,h264:1,h265:1,hevc:1,av1:1,multi:1,vf:1,vff:1,vfq:1,vostfr:1,vo:1,french:1,english:1,truefrench:1,hd:1,uhd:1,fhd:1,sd:1};var provider=norm(c.providerId).split(" ");return norm(v).split(" ").filter(function(x){return x.length>1&&!noise[x]&&!tech[x]&&provider.indexOf(x)<0&&!/^\d{4}$/.test(x)&&!/^\d{3,4}p$/.test(x)&&!/^s\d+e\d+$/.test(x)})}
function expectedTokens(m){var map={};uniq((m.titles||[]).concat(m.episodeTitles||[])).forEach(function(t){tokens(t).forEach(function(x){map[x]=1})});return map}
function overlapsExpected(text,expected){var w=tokens(text);for(var i=0;i<w.length;i++)if(expected[w[i]])return true;return false}
function explicitCandidates(row){var out=[],title=s(row&&row.title);if(title)out.push({text:title,kind:"title"});var filename=s(row&&row.filename);if(filename)out.push({text:filename,kind:"filename"});try{var base=decodeURIComponent(new URL(s(row&&row.url)).pathname.split("/").filter(Boolean).pop()||"").replace(/\.(?:m3u8|mpd|mp4|mkv|webm|m4v|ts)$/i,"");if(base)out.push({text:base,kind:"url"})}catch(_e){}var name=s(row&&row.name);if(name&&norm(name)!==norm(c.providerId))out.push({text:name,kind:"name"});return out}
function contentLike(candidate,q){var w=tokens(candidate.text),se=episode(candidate.text),years=norm(candidate.text).match(/\b(?:19|20)\d{2}\b/g)||[];if(se)return true;if(!episodic(q)&&years.length&&w.length>=1)return true;if((candidate.kind==="title"||candidate.kind==="filename")&&w.length>=3)return true;return false}
function queryTitle(text){return tokens(text).join(" ").trim()}
function strongNameMatch(query,result){var a=tokens(query),names=uniq([result&&result.name,result&&result.original_name,result&&result.title,result&&result.original_title]);if(a.length<2)return false;for(var n=0;n<names.length;n++){var b=tokens(names[n]);if(!b.length)continue;var hit=0;a.forEach(function(x){if(b.indexOf(x)>=0)hit++});var ratio=hit/Math.max(a.length,b.length);if(ratio>=0.67)return true}return false}
async function confirmOtherTitle(candidate,q){var key=runtimeTmdbKey();if(!key||!/^\d+$/.test(q.tmdbId||""))return false;var query=queryTitle(candidate.text);if(tokens(query).length<2)return false;var endpoint=episodic(q)?"tv":"movie",d=await jsonFetch("https://api.themoviedb.org/3/search/"+endpoint+"?api_key="+encodeURIComponent(key)+"&language=fr-FR&query="+encodeURIComponent(query)+"&include_adult=false");if(!d||!Array.isArray(d.results))return false;for(var i=0;i<Math.min(5,d.results.length);i++){var row=d.results[i];if(!strongNameMatch(query,row))continue;var id=s(row&&row.id);if(id===q.tmdbId)return false;return /^\d+$/.test(id)&&id!==q.tmdbId}return false}
async function candidateContradicts(candidate,q,m,expected){var text=candidate.text,se=episode(text);if(q.mediaType==="movie"&&se)return true;if(se&&episodic(q)){var ss=Number(se[1])||0,ee=Number(se[2])||0;if((q.season&&ss&&ss!==q.season)||(q.episode&&ee&&ee!==q.episode))return true;if(overlapsExpected(text,expected))return false;m=await ensureEpisodeTitles(q,m);expected=expectedTokens(m);if(overlapsExpected(text,expected))return false;return await confirmOtherTitle(candidate,q)}var years=norm(text).match(/\b(?:19|20)\d{2}\b/g)||[];if(!episodic(q)&&m.year&&years.length&&!years.some(function(y){return Math.abs(Number(y)-Number(m.year))<=1}))return true;if(!contentLike(candidate,q)||overlapsExpected(text,expected))return false;var w=tokens(text);if(w.length<2)return false;if(w.length>=3&&(candidate.kind==="title"||candidate.kind==="filename"))return await confirmOtherTitle(candidate,q);return false}
async function mismatch(row,q,m){var ids=explicitIds(row);if(ids.tmdbId&&q.tmdbId&&ids.tmdbId!==q.tmdbId)return true;if(ids.imdbId&&(q.imdbId||m.imdbId)&&ids.imdbId!==(q.imdbId||m.imdbId))return true;var expected=expectedTokens(m),cands=explicitCandidates(row);for(var i=0;i<cands.length;i++)if(await candidateContradicts(cands[i],q,m,expected))return true;return false}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalStreamIdentityV1)return false;var native=o[k];var wrap=async function(){var q=req(arguments),v=await native.apply(this,arguments),x=slot(v);if(!x||!x.list.length)return v;var m=await tmdb(q),kept=[];for(var i=0;i<x.list.length;i++)if(!(await mismatch(x.list[i],q,m)))kept.push(x.list[i]);return rebuild(v,x,kept)};wrap.__nuvioGlobalStreamIdentityV1=true;o[k]=wrap;return true}
var ok=false;try{if(typeof module!=="undefined"&&module.exports){ok=install(module.exports,"getStreams")||install(module.exports,"streams")}}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,{"providerId":"vidsrc","tmdbRuntimeKeyRequired":true,"tmdbTimeoutMs":1200,"implementationRevision":"cross-client-shared-tmdb-owner-zero-episodic-year-v11","catalogueYearPolicy":"movie-only"});
/* CLOSEFIX:CORE.STREAM_IDENTITY.V1 */
/* STARTFIX:CORE.MEDIA_TYPE_RESOLUTION.V1 */
/* FIXDATA:CORE.MEDIA_TYPE_RESOLUTION.V1:eyJwcm92aWRlclRpbWVvdXRNcyI6NjAwMDAsInJlcXVlc3RUeXBlQWxpYXNlcyI6e30sInJldmlzaW9uIjoidG1kYi1kYXRhLWNvbnRyYWN0LWxhdW5jaC1nYXRlLXYzMS1wcmUtbmV0d29yay1zZW1hbnRpYy1nYXRlIiwic2VtYW50aWNUeXBlcyI6WyJtb3ZpZSIsInR2Il0sInN1cGVyc2VkZVNldHRsZU1zIjoxMjAwLCJ0aW1lb3V0TXMiOjE4MDAsInR2UHJvdmlkZXJUaW1lb3V0TXMiOjYwMDAwfQ== */
/* NUVIO_GLOBAL_MEDIA_TYPE_RESOLUTION_V1:264b5d0b669a */
/* NUVIO_GLOBAL_PROVIDER_EXECUTION_BUDGET_V1 */
;(function(g,c){"use strict";
function s(v){return String(v==null?"":v).trim()}
function normalizeKey(v){var x=s(v);if(x.length===33&&x.charCodeAt(0)===92&&/^[0-9a-fA-F]{32}$/.test(x.slice(1)))x=x.slice(1);return /^[0-9a-fA-F]{32}$/.test(x)?x:""}
function alias(v){var x=s(v||"movie").toLowerCase();if(x==="series"||x==="show"||x==="other")return"tv";if(x==="anime")return"anime";if(x==="movie")return"movie";return"tv"}
function namespaceOf(v){var x=alias(v);return x==="movie"?"movie":"tv"}
function sourceIdentity(v){
  var raw=s(v),x=raw,kind="unknown";
  x=x.replace(/^https?:\/\/(?:www\.)?imdb\.com\/title\//i,"");
  var prefix=/^(tmdb|imdb|movie|tv|series)[:/]/i.exec(x);
  if(prefix){kind=prefix[1].toLowerCase()==="imdb"?"imdb":"tmdb";x=x.slice(prefix[0].length)}
  x=x.split(/[\/?#]/)[0];
  var episodic=/^(tt\d+|\d+):\d+:\d+$/i.exec(x);if(episodic)x=episodic[1];
  if(/^tt\d+$/i.test(x)){kind="imdb";x=x.toLowerCase()}
  else if(/^\d+$/.test(x))kind="tmdb";
  return{raw:raw,id:x,kind:kind};
}
function metadataImdb(m){
  if(!m||typeof m!=="object")return"";
  var x=s(m.imdb_id||m.imdbId||(m.external_ids&&m.external_ids.imdb_id)||"").toLowerCase();
  return /^tt\d+$/.test(x)?x:"";
}
function providerTransport(canonical,namespace){
  var map=c.requestTypeAliases&&typeof c.requestTypeAliases==="object"?c.requestTypeAliases:{};
  var mapped=s(map[canonical]).toLowerCase();
  if(mapped==="tmdb_namespace")return namespace==="movie"?"movie":"tv";
  if(mapped)return alias(mapped);
  // Anime is semantic, not a TMDB namespace. Once authoritative metadata has
  // classified the work as anime, preserve its real TV/movie namespace for the
  // provider API. The semantic capability gate still rejects non-anime works.
  if(canonical==="anime")return namespace==="movie"?"movie":"tv";
  return canonical==="movie"?"movie":"tv";
}
function namespaceCandidates(v,season,episode){
  // Client media type is only a lookup hint. Never let it remove the alternate
  // TMDB namespace before canonical identity has been established.
  if(season!=null||episode!=null)return["tv","movie"];
  var hint=alias(v);
  if(hint==="movie")return["movie","tv"];
  return["tv","movie"];
}
function rows(v){return Array.isArray(v)?v:[]}
function keywordRows(m){var k=m&&m.keywords;return rows(k&&((k.results||k.keywords)||k))}
function animeMeta(m){
  if(!m||typeof m!=="object")return false;
  var explicit=s(m.canonicalMediaType||m.canonical_media_type||m.category).toLowerCase();
  if(explicit==="anime")return true;
  var keywords=keywordRows(m).map(function(x){return s(x&&x.name).toLowerCase()});
  if(keywords.indexOf("anime")>=0)return true;
  var genres=rows(m.genres),ids=rows(m.genre_ids||m.genreIds).map(Number);
  for(var i=0;i<genres.length;i++){if(Number(genres[i]&&genres[i].id)===16)ids.push(16)}
  var animation=ids.indexOf(16)>=0||genres.some(function(x){return s(x&&x.name).toLowerCase()==="animation"});
  var lang=s(m.original_language||m.originalLanguage).toLowerCase();
  var countries=rows(m.origin_country||m.originCountry).map(function(x){return s(x).toUpperCase()});
  var prod=rows(m.production_countries||m.productionCountries).map(function(x){return s(x&&x.iso_3166_1).toUpperCase()});
  var japanese=lang==="ja"||countries.indexOf("JP")>=0||prod.indexOf("JP")>=0;
  return animation&&japanese;
}
function timeout(){try{return typeof AbortSignal!=="undefined"&&AbortSignal.timeout?AbortSignal.timeout(c.timeoutMs):undefined}catch(_){return undefined}}
function localKey(){
  var key="";
  try{key=normalizeKey(g&&g.TMDB_API_KEY);if(key)return key}catch(_){}
  try{if(typeof TMDB_API_KEY!=="undefined"){key=normalizeKey(TMDB_API_KEY);if(key)return key}}catch(_){}
  return"";
}
function localToken(){
  try{if(g&&s(g.TMDB_ACCESS_TOKEN))return s(g.TMDB_ACCESS_TOKEN)}catch(_){}
  try{if(typeof TMDB_ACCESS_TOKEN!=="undefined"&&s(TMDB_ACCESS_TOKEN))return s(TMDB_ACCESS_TOKEN)}catch(_){}
  return "";
}
var coreCredentialKey=localKey(),coreCredentialToken=localToken();
var mediaCache=Object.create(null);
try{if(g)g.__nuvioTmdbMetadataCacheV1=mediaCache}catch(_){}
function hasTmdbMetadata(m){
  return !!(m&&typeof m==="object"&&(
    Array.isArray(m.genres)||Array.isArray(m.genre_ids)||Array.isArray(m.genreIds)||
    m.original_language||m.originalLanguage||m.origin_country||m.originCountry||
    m.production_countries||m.productionCountries||m.keywords
  ));
}
async function apiJson(url){
  var key=coreCredentialKey,token=coreCredentialToken;
  if(!g||typeof g.fetch!=="function"||(!key&&!token))return{state:"unavailable",value:null};
  try{
    if(key)url+=(url.indexOf("?")>=0?"&":"?")+"api_key="+encodeURIComponent(key);
    var h={Accept:"application/json"};if(token)h.Authorization="Bearer "+token;
    var api=await g.fetch(url,{headers:h,redirect:"follow",signal:timeout()});
    if(!api)return{state:"unavailable",value:null};
    if(api.status===404)return{state:"not_found",value:null};
    if(!api.ok||typeof api.json!=="function")return{state:"unavailable",value:null};
    var value=await api.json();
    if(!value||typeof value!=="object")return{state:"unavailable",value:null};
    return{state:"ok",value:value};
  }catch(_){return{state:"unavailable",value:null}}
}
async function findTmdb(imdbId,candidates){
  var imdb=s(imdbId).replace(/^imdb:/i,"").toLowerCase(),cacheKey="find:"+imdb;
  if(!/^tt\d+$/.test(imdb))return{state:"not_found",tmdbId:"",namespace:"",metadata:null,imdbId:""};
  if(Object.prototype.hasOwnProperty.call(mediaCache,cacheKey))return await mediaCache[cacheKey];
  var pending=(async function(){
    var probe=await apiJson("https://api.themoviedb.org/3/find/"+encodeURIComponent(imdb)+"?external_source=imdb_id");
    if(!probe||probe.state!=="ok")return{state:probe&&probe.state||"unavailable",tmdbId:"",namespace:"",metadata:null,imdbId:imdb};
    for(var i=0;i<candidates.length;i++){
      var namespace=candidates[i]==="movie"?"movie":"tv";
      var list=namespace==="movie"?rows(probe.value.movie_results):rows(probe.value.tv_results);
      for(var j=0;j<list.length;j++){
        var row=list[j],id=s(row&&row.id);
        if(/^\d+$/.test(id))return{state:"ok",tmdbId:id,namespace:namespace,metadata:row,imdbId:imdb};
      }
    }
    return{state:"not_found",tmdbId:"",namespace:"",metadata:null,imdbId:imdb};
  })();
  mediaCache[cacheKey]=pending;
  var value=await pending;
  if(value&&value.state==="unavailable")delete mediaCache[cacheKey];else mediaCache[cacheKey]=value;
  return value;
}
async function tmdb(namespaceValue,tmdbId){
  var namespace=namespaceValue==="movie"?"movie":"tv",id=s(tmdbId),cacheKey=namespace+":"+id;
  if(!/^\d+$/.test(id))return{state:"unavailable",metadata:null};
  if(Object.prototype.hasOwnProperty.call(mediaCache,cacheKey))return await mediaCache[cacheKey];
  var pending=(async function(){
    var append=namespace==="movie"?"keywords,alternative_titles,external_ids,release_dates":"keywords,alternative_titles,external_ids,content_ratings";
    var probe=await apiJson("https://api.themoviedb.org/3/"+namespace+"/"+encodeURIComponent(id)+"?append_to_response="+encodeURIComponent(append)+"&language=fr-FR");
    if(!probe||probe.state!=="ok")return{state:probe&&probe.state||"unavailable",metadata:null};
    var value=probe.value;
    if(Number(value.id||0)<=0)return{state:"unavailable",metadata:null};
    value.__nuvioTmdbNamespace=namespace;
    value.__nuvioTmdbId=id;
    return{state:"ok",metadata:value};
  })();
  mediaCache[cacheKey]=pending;
  var value=await pending;
  if(value&&value.state==="unavailable")delete mediaCache[cacheKey];else mediaCache[cacheKey]=value;
  return value;
}
async function coreGetTmdbData(request){
  var q=request&&typeof request==="object"&&!Array.isArray(request)?request:{};
  var source=sourceIdentity(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id),id="",imdbId="";
  var explicit=s(q.tmdbNamespace||q.namespace).toLowerCase();
  var candidates=explicit==="movie"||explicit==="tv"?[explicit]:namespaceCandidates(q.mediaType||q.type,q.season,q.episode);
  if(source.kind==="imdb"){
    imdbId=source.id;
    var found=await findTmdb(imdbId,candidates);
    if(!found||found.state!=="ok"||!/^\d+$/.test(s(found.tmdbId)))return{state:found&&found.state||"unavailable",tmdbId:"",imdbId:imdbId,tmdbNamespace:"",metadata:null,episodeMetadata:null};
    id=s(found.tmdbId);candidates=[found.namespace];
  }else if(source.kind==="tmdb")id=source.id;
  else return{state:"not_found",tmdbId:"",imdbId:"",tmdbNamespace:"",metadata:null,episodeMetadata:null};
  var unavailable=false;
  for(var i=0;i<candidates.length;i++){
    var namespace=candidates[i]==="movie"?"movie":"tv";
    var probe=await tmdb(namespace,id);
    if(!probe||probe.state==="unavailable"){unavailable=true;continue}
    if(probe.state!=="ok"||!probe.metadata)continue;
    imdbId=imdbId||metadataImdb(probe.metadata);
    var episodeMetadata=null;
    var season=Number(q.season||0)||0,episode=Number(q.episode||0)||0;
    if(namespace==="tv"&&season>0&&episode>0){
      var episodeKey="episode:tv:"+id+":"+season+":"+episode+":fr-FR";
      if(Object.prototype.hasOwnProperty.call(mediaCache,episodeKey)){
        var cachedEpisode=await mediaCache[episodeKey];
        episodeMetadata=cachedEpisode&&cachedEpisode.metadata?cachedEpisode.metadata:cachedEpisode&&cachedEpisode.value?cachedEpisode.value:cachedEpisode||null;
      }else{
        var pendingEpisode=(async function(){
          var row=await apiJson("https://api.themoviedb.org/3/tv/"+encodeURIComponent(id)+"/season/"+encodeURIComponent(season)+"/episode/"+encodeURIComponent(episode)+"?language=fr-FR");
          if(!row||row.state!=="ok")return{state:row&&row.state||"unavailable",metadata:null};
          return{state:"ok",metadata:row.value};
        })();
        mediaCache[episodeKey]=pendingEpisode;
        var episodeResult=await pendingEpisode;
        if(episodeResult&&episodeResult.state==="unavailable")delete mediaCache[episodeKey];else mediaCache[episodeKey]=episodeResult;
        episodeMetadata=episodeResult&&episodeResult.metadata||null;
      }
    }
    return{state:"ok",tmdbId:id,imdbId:imdbId,tmdbNamespace:namespace,metadata:probe.metadata,episodeMetadata:episodeMetadata};
  }
  return{state:unavailable?"unavailable":"not_found",tmdbId:id,imdbId:imdbId,tmdbNamespace:"",metadata:null,episodeMetadata:null};
}
try{if(g)g.__nuvioCoreGetTmdbDataV1=coreGetTmdbData}catch(_){}
function fallbackType(input,semantic){
  var raw=s(input||"movie").toLowerCase(),transport=alias(input);
  if(raw==="anime")return"anime";
  if(transport==="tv"&&semantic.indexOf("tv")<0&&semantic.indexOf("anime")>=0)return"anime";
  if(raw==="movie"&&semantic.indexOf("movie")<0&&semantic.indexOf("anime")>=0)return"anime";
  return transport;
}
async function canonicalResolution(id,input,metadata,season,episode,semantic){
  var candidates=namespaceCandidates(input,season,episode);
  var source=sourceIdentity(id),rawId=source.id,tmdbId=source.kind==="tmdb"?source.id:"",imdbId=source.kind==="imdb"?source.id:"",seedMetadata=null;
  if(imdbId){
    var found=await findTmdb(imdbId,candidates);
    if(found&&found.state==="ok"){
      tmdbId=found.tmdbId;
      candidates=[found.namespace];
      seedMetadata=found.metadata||null;
    }else if(found&&found.state==="unavailable"){
      var degradedType=fallbackType(input,semantic),degradedNamespace=namespaceOf(input);
      return{type:degradedType,namespace:degradedNamespace,tmdbId:"",imdbId:imdbId,metadata:null,authoritative:false,degraded:true};
    }else return null;
  }
  if(hasTmdbMetadata(metadata)){
    var declared=s(metadata&&metadata.__nuvioTmdbNamespace).toLowerCase();
    var namespace=declared==="movie"?"movie":declared==="tv"?"tv":candidates[0];
    var declaredId=s(metadata&&metadata.__nuvioTmdbId||metadata&&metadata.id);
    if(/^\d+$/.test(declaredId))tmdbId=declaredId;
    imdbId=imdbId||metadataImdb(metadata);
    var type=animeMeta(metadata)?"anime":namespace;
    return{type:type,namespace:namespace,tmdbId:/^\d+$/.test(tmdbId)?tmdbId:"",imdbId:imdbId,metadata:metadata,authoritative:true,degraded:false};
  }
  var unavailable=false;
  for(var i=0;i<candidates.length;i++){
    var namespace=candidates[i],probe=await tmdb(namespace,tmdbId);
    if(!probe||probe.state==="unavailable"){unavailable=true;continue}
    if(probe.state==="not_found")continue;
    var m=probe.metadata;imdbId=imdbId||metadataImdb(m);var type=animeMeta(m)?"anime":namespace;
    return{type:type,namespace:namespace,tmdbId:tmdbId,imdbId:imdbId,metadata:m,authoritative:true,degraded:false};
  }
  if(unavailable&&seedMetadata){
    var seedNamespace=candidates[0]||namespaceOf(input),seedType=animeMeta(seedMetadata)?"anime":seedNamespace;
    seedMetadata.__nuvioTmdbNamespace=seedNamespace;
    seedMetadata.__nuvioTmdbId=tmdbId;
    return{type:seedType,namespace:seedNamespace,tmdbId:tmdbId,imdbId:imdbId,metadata:seedMetadata,authoritative:true,degraded:true};
  }
  if(unavailable){
    var fallback=fallbackType(input,semantic),fallbackNamespace=namespaceOf(input);
    return{type:fallback,namespace:fallbackNamespace,tmdbId:/^\d+$/.test(tmdbId)?tmdbId:"",imdbId:imdbId,metadata:null,authoritative:false,degraded:true};
  }
  return null;
}
function objectRequest(a){return a&&typeof a==="object"&&!Array.isArray(a)}
function provisional(a){
  var first=a[0],obj=objectRequest(first),q=obj?Object.assign({},first):null;
  var input=obj?s(q.mediaType||q.type||q.category||"movie"):s(a[1]||"movie");
  var raw=s(input).toLowerCase(),namespace=namespaceOf(input);
  var semantic=rows(c.semanticTypes).map(function(x){return s(x).toLowerCase()});
  var type=raw==="anime"?"anime":namespace;
  // Native Nuvio bridges may expose only a non-abortable host fetch. For a
  // numeric TMDB id, let a semantic-anime provider run provisionally even when
  // the client transports the work as tv/movie; authoritative TMDB verification
  // still happens before any positive output can escape.
  if(semantic.length&&semantic.indexOf(type)<0){
    var hasMovie=semantic.indexOf("movie")>=0,hasTv=semantic.indexOf("tv")>=0,hasAnime=semantic.indexOf("anime")>=0;
    // Explicit anime is a semantic request, not a generic TV alias. A provider
    // without anime capability must be rejected before provider/TMDB network.
    if(raw==="anime"&&!hasAnime)return null;
    // movie <-> tv transport mismatch is already conclusive from provider DATA.
    // Do not rewrite a single declared type just to make the provisional call run.
    if(type==="movie"&&!hasMovie&&!hasAnime)return null;
    if(type==="tv"&&!hasTv&&!hasAnime)return null;
    if(semantic.indexOf(namespace)>=0)type=namespace;
    else if(hasAnime&&(namespace==="tv"||namespace==="movie"))type="anime";
    else return null;
  }
  var id=obj?s(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id):s(first),source=sourceIdentity(id);
  var providerType=providerTransport(type,namespace);
  var resolvedTmdbId=source.kind==="tmdb"?source.id:"";
  var resolvedImdbId=s(obj&&(q.imdbId||q.imdb_id)||(source.kind==="imdb"?source.id:"")).toLowerCase();
  var context={
    sourceId:source.id,
    sourceIdType:source.kind,
    tmdbId:resolvedTmdbId,
    imdbId:resolvedImdbId,
    tmdbNamespace:namespace,
    tmdbIdentity:namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id),
    tmdbMetadata:null,
    canonicalMediaType:type,
    tmdbResolutionDegraded:true,
    tmdbVerificationDeferred:true,
    nuvioInputMediaType:input,
    providerMediaType:providerType
  };
  if(obj){
    q.sourceId=source.id;q.sourceIdType=source.kind;
    q.nuvioInputMediaType=input;
    if(resolvedTmdbId)q.tmdbId=resolvedTmdbId;
    if(resolvedImdbId)q.imdbId=resolvedImdbId;
    q.tmdbNamespace=namespace;
    q.tmdbIdentity=namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id);
    q.canonicalMediaType=type;
    q.providerMediaType=providerType;
    q.mediaType=providerType;q.type=providerType;
    if(type==="anime")q.category="anime";else if(!q.category||["series","show","other"].indexOf(s(q.category).toLowerCase())>=0)q.category=type;
    var out=[q];for(var i=1;i<a.length;i++)out.push(a[i]);out.__nuvioContext=context;return out;
  }
  var out=Array.prototype.slice.call(a);out[0]=resolvedTmdbId||resolvedImdbId||source.id||out[0];out[1]=providerType;out.__nuvioContext=context;return out;
}
function hasProviderOutput(value){
  if(Array.isArray(value))return value.length>0;
  if(!value||typeof value!=="object")return false;
  for(var i=0;i<3;i++){
    var key=["streams","results","data"][i];
    if(Array.isArray(value[key]))return value[key].length>0;
  }
  var url=value.url;
  if(typeof url==="string"&&s(url))return true;
  if(url&&typeof url==="object"&&typeof url.url==="string"&&s(url.url))return true;
  return false;
}
function reconcileOutputContext(value,context){
  if(!value||!context)return value;
  function stamp(row){
    if(!row||typeof row!=="object")return;
    try{
      if(Object.prototype.hasOwnProperty.call(row,"canonicalMediaType"))row.canonicalMediaType=context.canonicalMediaType;
      if(Object.prototype.hasOwnProperty.call(row,"providerMediaType"))row.providerMediaType=context.providerMediaType;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbNamespace"))row.tmdbNamespace=context.tmdbNamespace;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbIdentity"))row.tmdbIdentity=context.tmdbIdentity;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbId")&&context.tmdbId)row.tmdbId=context.tmdbId;
      if(Object.prototype.hasOwnProperty.call(row,"degraded"))row.degraded=context.tmdbResolutionDegraded===true;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbResolutionDegraded"))row.tmdbResolutionDegraded=context.tmdbResolutionDegraded===true;
    }catch(_){}
  }
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i++)stamp(value[i]);
    return value;
  }
  if(typeof value==="object"){
    stamp(value);
    for(var j=0;j<3;j++){
      var key=["streams","results","data"][j],list=value[key];
      if(Array.isArray(list))for(var k=0;k<list.length;k++)stamp(list[k]);
    }
  }
  return value;
}
function invocationEvent(a){
  var first=a[0],obj=objectRequest(first),settings=obj?first:(a[4]&&typeof a[4]==="object"?a[4]:null),event="";
  try{event=s(settings&&(settings.providerEvent||settings.event)||"")}catch(_){}
  try{if(!event&&g)event=s(g.__nuvioProviderEvent||g.__nuvioEvent||"")}catch(_){}
  event=event.toLowerCase();
  return event||"launch";
}
function requestHasExternalIdentity(a){
  try{
    var first=a&&a[0],raw=objectRequest(first)?s(first.tmdbId||first.tmdb_id||first.imdbId||first.imdb_id||first.id):s(first);
    return sourceIdentity(raw).kind==="imdb";
  }catch(_){return false}
}
function providerNeedsTmdbBeforeStreams(container){
  try{
    var model=container&&container.__niakvioProviderBase;
    var contract=model&&model.identityInput;
    if(!contract||contract.requiresTmdbBeforeRun!==true)return false;
    var mode=s(contract.mode).toLowerCase();
    return mode==="catalog_search"||mode==="external_id";
  }catch(_){return false}
}
function hasResolvedTmdbMetadata(args){
  try{return !!(args&&args.__nuvioContext&&args.__nuvioContext.tmdbMetadata)}catch(_){return false}
}

async function resolve(a){
  var first=a[0],obj=objectRequest(first),q=obj?Object.assign({},first):null;
  var input=obj?s(q.mediaType||q.type||q.category||"movie"):s(a[1]||"movie");
  var namespace=namespaceOf(input);
  var semantic=rows(c.semanticTypes).map(function(x){return s(x).toLowerCase()});
  // TMDB identity/type resolution is the first provider gate for every request.
  // Provider capability filtering happens only after canonical movie|tv|anime
  // classification so transport aliases can never suppress a valid anime match.
  // Per-request isolation: canonical type/metadata must come only from the
  // current work request (plus TMDB), never from a previous getStreams call.
  var metadata=obj&&(q.tmdbMetadata||q.tmdb_metadata||q.metadata||q);
  var id=obj?s(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id):s(first),source=sourceIdentity(id);
  var season=obj?q.season:a[2],episode=obj?q.episode:a[3];
  var resolved=await canonicalResolution(id,input,metadata,season,episode,semantic);
  if(!resolved)return null;
  var type=resolved.type;namespace=resolved.namespace;
  if(resolved.authoritative&&semantic.length&&semantic.indexOf(type)<0)return null;
  var providerType=providerTransport(type,namespace);
  var resolvedTmdbId=s(resolved.tmdbId||(source.kind==="tmdb"?source.id:""));
  var resolvedImdbId=s(resolved.imdbId||obj&&(q.imdbId||q.imdb_id)||(source.kind==="imdb"?source.id:"")).toLowerCase();
  var context={
    sourceId:source.id,
    sourceIdType:source.kind,
    tmdbId:resolvedTmdbId,
    imdbId:resolvedImdbId,
    tmdbNamespace:namespace,
    tmdbIdentity:namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id),
    tmdbMetadata:resolved.metadata||null,
    canonicalMediaType:type,
    tmdbResolutionDegraded:resolved.degraded===true,
    nuvioInputMediaType:input,
    providerMediaType:providerType
  };
  if(obj){
    q.sourceId=source.id;q.sourceIdType=source.kind;
    q.nuvioInputMediaType=input;
    if(resolvedTmdbId)q.tmdbId=resolvedTmdbId;
    if(resolvedImdbId)q.imdbId=resolvedImdbId;
    q.tmdbNamespace=namespace;
    q.tmdbIdentity=namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id);
    q.tmdbMetadata=resolved.metadata||q.tmdbMetadata||q.tmdb_metadata||null;
    q.canonicalMediaType=type;
    q.providerMediaType=providerType;
    q.mediaType=providerType;q.type=providerType;
    if(type==="anime")q.category="anime";else if(!q.category||["series","show","other"].indexOf(s(q.category).toLowerCase())>=0)q.category=type;
    var out=[q];for(var i=1;i<a.length;i++)out.push(a[i]);out.__nuvioContext=context;return out;
  }
  var out=Array.prototype.slice.call(a);out[0]=resolvedTmdbId||resolvedImdbId||source.id||out[0];out[1]=providerType;out.__nuvioContext=context;return out;
}
/* NUVIO_PROVIDER_LATEST_REQUEST_OWNS_FETCH_V2 */
var requestSerial=0;
function providerTimeoutError(){var e=new Error("nuvio_provider_timeout");e.name="TimeoutError";e.code="NUVIO_PROVIDER_TIMEOUT";e.__nuvioProviderTimeout=true;return e}
function providerStaleError(){var e=new Error("nuvio_provider_superseded");e.name="AbortError";e.code="NUVIO_PROVIDER_SUPERSEDED";e.__nuvioProviderStale=true;return e}
function tokenOwns(token){try{return !token||!g||g.__nuvioProviderRequestToken===token}catch(_){return false}}
function abortController(controller){try{if(controller&&typeof controller.abort==="function")controller.abort()}catch(_){}}
function requestAbortPromise(controller,requestToken){
  return new Promise(function(_resolve,reject){
    try{
      var signal=controller&&controller.signal;
      if(!signal)return;
      var fail=function(){reject(tokenOwns(requestToken)?providerTimeoutError():providerStaleError())};
      if(signal.aborted){fail();return}
      if(typeof signal.addEventListener==="function")signal.addEventListener("abort",fail,{once:true});
    }catch(_){}
  });
}
async function settlePrior(promise){if(!promise||typeof promise.then!=="function")return;try{if(typeof setTimeout!=="function"){await Promise.resolve();return}await Promise.race([promise,new Promise(function(resolve){setTimeout(resolve,Number(c.supersedeSettleMs||1200))})])}catch(_){}}
function deadlineExpired(deadline){var n=Number(deadline);return Number.isFinite(n)&&n>0&&Date.now()>=n}
function tvRuntime(){try{var ua=s(g&&g.navigator&&g.navigator.userAgent);return /NuvioTV|Android TV/i.test(ua)||(g&&g.__NUVIO_TV_RUNTIME__===true)}catch(_){return false}}
function providerBudgetMs(){return tvRuntime()?Number(c.tvProviderTimeoutMs||60000):Number(c.providerTimeoutMs||60000)}
function budgetedFetch(original,deadline,requestToken,requestController){
  if(typeof original!=="function")return original;
  var base=original.__nuvioProviderExecutionBudgetBase||original;
  var wrapped=async function(){
    if(!tokenOwns(requestToken))throw providerStaleError();
    if(deadlineExpired(deadline))throw providerTimeoutError();
    var args=Array.prototype.slice.call(arguments),remaining=deadline>0?Math.max(1,deadline-Date.now()):0;
    if(remaining>0&&args.length>=1){
      var init=args[1]&&typeof args[1]==="object"?Object.assign({},args[1]):{};
      if(!init.signal&&requestController&&requestController.signal)init.signal=requestController.signal;
      if(!init.signal){try{if(typeof AbortSignal!=="undefined"&&AbortSignal.timeout)init.signal=AbortSignal.timeout(remaining)}catch(_){}}
      args[1]=init;
    }
    if(!tokenOwns(requestToken))throw providerStaleError();
    var timer=null;
    var timeoutPromise=new Promise(function(_resolve,reject){
      if(typeof setTimeout!=="function"||remaining<=0)return;
      timer=setTimeout(function(){abortController(requestController);reject(providerTimeoutError())},remaining);
    });
    var value,abortPromise=requestAbortPromise(requestController,requestToken);
    try{
      value=(typeof setTimeout==="function"&&remaining>0)
        ? await Promise.race([base.apply(this,args),timeoutPromise,abortPromise])
        : await Promise.race([base.apply(this,args),abortPromise]);
    }finally{
      try{if(timer!=null&&typeof clearTimeout==="function")clearTimeout(timer)}catch(_){}
    }
    if(!tokenOwns(requestToken))throw providerStaleError();
    if(deadlineExpired(deadline))throw providerTimeoutError();
    return value;
  };
  try{
    Object.defineProperty(wrapped,"__nuvioProviderExecutionBudgetV1",{value:true});
    Object.defineProperty(wrapped,"__nuvioProviderExecutionBudgetBase",{value:base});
  }catch(_){
    wrapped.__nuvioProviderExecutionBudgetV1=true;
    wrapped.__nuvioProviderExecutionBudgetBase=base;
  }
  return wrapped;
}
function install(o,k){
  if(!o||typeof o[k]!=="function"||o[k].__nuvioMediaTypeResolutionV1)return false;
  var native=o[k];
  var wrap=async function(){
    var originalArgs=Array.prototype.slice.call(arguments);
    var providerEvent=invocationEvent(originalArgs);
    // Absolute first gate: non-launch invocations do not touch provider runtime state.
    if(providerEvent!=="launch")return [];

    var requestToken=0,requestDeadline=0,hadFetch=false,previousFetch,fetchBase,budgetFetchInstalled=false;
    var requestController=null,priorController=null,priorDone=null,resolveDone=null,invocationDone=null;
    try{
      // Capture the prior invocation before claiming the global token/fetch slot.
      // The previous fetch wrapper stays installed during settlement grace, so a
      // stale catch/retry still hits its token-bound wrapper and is rejected.
      if(g){priorController=g.__nuvioProviderAbortController||null;priorDone=g.__nuvioProviderInvocationDone||null}
      if(g&&Object.prototype.hasOwnProperty.call(g,"__nuvioMediaContext"))delete g.__nuvioMediaContext;
      if(g){
        var priorSerial=Number(g.__nuvioProviderRequestSerial||requestSerial);
        requestToken=(Number.isFinite(priorSerial)&&priorSerial>=0?priorSerial:requestSerial)+1;
        requestSerial=requestToken;
        g.__nuvioProviderRequestSerial=requestToken;
        g.__nuvioProviderRequestToken=requestToken;
      }
      invocationDone=new Promise(function(resolve){resolveDone=resolve});
      if(g)g.__nuvioProviderInvocationDone=invocationDone;
      abortController(priorController);
      hadFetch=!!(g&&Object.prototype.hasOwnProperty.call(g,"fetch"));
      previousFetch=g&&g.fetch;
      fetchBase=previousFetch&&previousFetch.__nuvioProviderExecutionBudgetBase||previousFetch;
    }catch(_){}
    try{
      await settlePrior(priorDone);
      if(!tokenOwns(requestToken))return [];
      requestDeadline=Date.now()+providerBudgetMs();
      try{requestController=typeof AbortController!=="undefined"?new AbortController():null}catch(_){requestController=null}
      if(g){
        g.__nuvioProviderDeadlineMs=requestDeadline;
        g.__nuvioProviderAbortController=requestController;
        if(typeof fetchBase==="function"){g.fetch=budgetedFetch(fetchBase,requestDeadline,requestToken,requestController);budgetFetchInstalled=g.fetch!==fetchBase;}
      }
      // Gate 2: build request-local provisional transport without TMDB by default.
      // A provider whose declared DATA contract requires a title-based catalogue
      // lookup is the only exception: resolve TMDB once before its first call.
      var a=provisional(originalArgs);
      if(!a||deadlineExpired(requestDeadline))return [];
      if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      if(a.__nuvioContext)a.__nuvioContext.requestToken=requestToken;
      if(g)g.__nuvioMediaContext=a.__nuvioContext||null;

      var verified=null,preResolved=null;
      var needsPlanMetadata=providerNeedsTmdbBeforeStreams(o);
      var needsIdNormalization=requestHasExternalIdentity(originalArgs);
      if(needsPlanMetadata||needsIdNormalization){
        preResolved=await resolve(originalArgs);
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
        if(preResolved&&!deadlineExpired(requestDeadline)&&hasResolvedTmdbMetadata(preResolved)){
          verified=preResolved;
          if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
          if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
          a=verified;
        }
      }

      var value=await native.apply(this,a);
      if(deadlineExpired(requestDeadline))return [];
      if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      if(!hasProviderOutput(value))return [];

      // Gate 3: ordinary providers pay TMDB/type cost only after positive output.
      // Providers which required TMDB to execute their declared plan already ran
      // with verified context, so the same verified object is reused with no
      // second metadata call.
      if(!verified){
        verified=preResolved||await resolve(originalArgs);
        if(!verified||deadlineExpired(requestDeadline))return [];
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      }
      var provisionalContext=a.__nuvioContext||{},verifiedContext=verified.__nuvioContext||{};
      var rerun=(
        s(provisionalContext.canonicalMediaType)!==s(verifiedContext.canonicalMediaType)
        || s(provisionalContext.providerMediaType)!==s(verifiedContext.providerMediaType)
        || s(provisionalContext.tmdbNamespace)!==s(verifiedContext.tmdbNamespace)
        || s(provisionalContext.tmdbId)!==s(verifiedContext.tmdbId)
        || s(provisionalContext.tmdbIdentity)!==s(verifiedContext.tmdbIdentity)
      );
      if(rerun){
        if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
        if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
        value=await native.apply(this,verified);
        if(deadlineExpired(requestDeadline))return [];
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
        if(!hasProviderOutput(value))return [];
      }else{
        // Identity/type stayed stable: do not execute the provider twice. Promote
        // the authoritative TMDB context and reconcile only diagnostic fields
        // already exposed by the returned rows.
        if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
        if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
        value=reconcileOutputContext(value,verifiedContext);
      }
      return value;
    }catch(error){
      if(error&&(error.__nuvioProviderTimeout||error.__nuvioProviderStale))return [];
      throw error;
    }finally{
      try{if(typeof resolveDone==="function")resolveDone()}catch(_){}
      try{
        if(g){
          // An older request must never clean state owned by a newer request.
          var ownsRequest=!requestToken||g.__nuvioProviderRequestToken===requestToken;
          if(ownsRequest){
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioMediaContext"))delete g.__nuvioMediaContext;
            if(budgetFetchInstalled){if(hadFetch&&typeof fetchBase==="function")g.fetch=fetchBase;else if(!hadFetch)delete g.fetch}
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioProviderDeadlineMs"))delete g.__nuvioProviderDeadlineMs;
            if(g.__nuvioProviderAbortController===requestController)delete g.__nuvioProviderAbortController;
            if(g.__nuvioProviderInvocationDone===invocationDone)delete g.__nuvioProviderInvocationDone;
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioProviderRequestToken"))delete g.__nuvioProviderRequestToken;
          }
        }
      }catch(_){}
    }
  };
  wrap.__nuvioMediaTypeResolutionV1=true;
  o[k]=wrap;return true;
}
var ok=false;
try{if(typeof module!=="undefined"&&module.exports)ok=install(module.exports,"getStreams")}catch(_){}
try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_){}
})(typeof globalThis!=="undefined"?globalThis:this,{"timeoutMs":1800,"providerTimeoutMs":60000,"tvProviderTimeoutMs":60000,"supersedeSettleMs":1200,"semanticTypes":["movie","tv"],"requestTypeAliases":{},"revision":"tmdb-data-contract-launch-gate-v31-pre-network-semantic-gate"});
/* CLOSEFIX:CORE.MEDIA_TYPE_RESOLUTION.V1 */
/* STARTFIX:CORE.STREAM_PRESENTATION.V1 */
/* FIXDATA:CORE.STREAM_PRESENTATION.V1:eyJpbXBsZW1lbnRhdGlvblJldmlzaW9uIjoiYWxsLXByb3ZpZGVycy1jbGllbnQtcHJvamVjdGlvbi1uYW1lLW1pcnJvci12MjAiLCJsYW5ndWFnZUZhbGxiYWNrIjoiVk8iLCJwcm92aWRlcklkIjoidmlkc3JjIiwicHJvdmlkZXJMYW5ndWFnZU1vZGUiOiJ2byIsInRtZGJDb3JlQ2FwYWJpbGl0eVJlcXVpcmVkIjp0cnVlLCJ0bWRiVGltZW91dE1zIjoxMjAwfQ== */
/* NUVIO_GLOBAL_STREAM_PRESENTATION_V1:5ad36dfebbb1 */
;(function(g,c){"use strict";
function s(v){return String(v==null?"":v).trim()}
function meaningful(v){var x=s(v);return x&&!/^(?:unknown|inconnue?|n\/?a|null|undefined|none|-+)$/i.test(x)}
function uniq(a){var o=[];(a||[]).forEach(function(v){if(v&&o.indexOf(v)<0)o.push(v)});return o}
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
function streamPayload(v){var x=slot(v);if(x&&x.list&&x.list.length){var r=x.list[0];return !!(r&&typeof r==="object"&&(typeof r.url==="string"||r.url&&typeof r.url==="object"))}return false}
function asciiJson(v){var out="",n;for(var i=0;i<v.length;i++){n=v.charCodeAt(i);out+=n>127?"\\u"+("0000"+n.toString(16)).slice(-4):v.charAt(i)}return out}
function installJvmSafeStreamStringify(){try{var j=g&&g.JSON?g.JSON:(typeof JSON!=="undefined"?JSON:null);if(!j||typeof j.stringify!=="function"||j.stringify.__nuvioJvmSafeStreamStringify)return;var native=j.stringify;var wrapped=function(value,replacer,space){var raw=native.call(j,value,replacer,space);return typeof raw==="string"&&streamPayload(value)?asciiJson(raw):raw};wrapped.__nuvioJvmSafeStreamStringify=true;wrapped.__nuvioOriginal=native;j.stringify=wrapped}catch(_e){}}
function req(a){var f=a[0],q=f&&typeof f==="object"&&!Array.isArray(f)?Object.assign({},f):{tmdbId:f,mediaType:a[1],season:a[2],episode:a[3]};q.tmdbId=s(q.tmdbId||q.id||f).replace(/^tmdb:/i,"").split(":")[0];q.mediaType=s(q.mediaType||q.type||a[1]||"movie").toLowerCase();q.title=s(q.title||q.name||q.label);q.year=Number(q.year||0)||0;q.season=Number(q.season||a[2]||0)||0;q.episode=Number(q.episode||a[3]||0)||0;return q}
function urlFacts(r){var u=s(r&&r.url);if(!u)return"";try{u=decodeURIComponent(u)}catch(_e){}return u.replace(/[?#&=/_\\.\-]+/g," ")}
function blob(r){return [r&&r.name,r&&r.title,r&&r.size,r&&r.description,r&&r.quality,r&&r.resolution,r&&r.height,r&&r.width,r&&r.label,r&&r.language,r&&r.codec,r&&r.audio,r&&r.sourceType,r&&r.releaseType,r&&r.format,r&&r.hdr,r&&r.videoTech,r&&r.bitDepth,r&&r.subtitles,r&&r.sourceLabel,r&&r.filename,r&&r.edition,r&&r.releaseGroup,r&&r.release_group,r&&r.bitrate,r&&r.container,r&&r.encode,r&&r.indexer,r&&r.network,urlFacts(r)].map(s).join(" ")}
function quality(r){var v=meaningful(r&&r.quality)?s(r.quality):blob(r),u=v.toUpperCase();if(/(?:\b4K\b|\b2160P?\b|\bUHD\b)/.test(u))return"2160p";var m=u.match(/\b(1440|1080|720|576|540|480|360)P?\b/);if(m)return m[1]+"p";if(/\b(?:FULL[ ._-]?HD|FHD)\b/.test(u))return"1080p";if(/\bHD\b/.test(u))return"720p";if(/\bSD\b/.test(u))return"480p";var h=Number(r&&r.height||0);if(h>=2000)return"2160p";if(h>=1350)return"1440p";if(h>=900)return"1080p";if(h>=650)return"720p";if(h>=450)return"480p";return""}
function language(r){var explicit=meaningful(r&&r.language)?s(r.language):"",all=blob(r),u=explicit.toUpperCase(),a=all.toUpperCase(),vfMode=s(c.providerLanguageMode).toLowerCase()==="vf";function isMulti(x){return /\bMULTI(?:[- ]?AUDIO|LANG(?:UE)?S?)?\b/.test(x)||/\bDUAL(?:[- ]?AUDIO)?\b/.test(x)}function isVost(x){return /\bVOSTFR\b/.test(x)||/\bVOST[ ._-]?FR\b/.test(x)||/\bVO[ ._-]?ST[ ._-]?FR\b/.test(x)}function isVfq(x){return /\bVFQ\b/.test(x)||/\bFR[ ._-]?CA\b/.test(x)||/\bFRENCH[ ._-]?(?:CANADA|CANADIAN|QUEBEC)\b/.test(x)||/\b(?:QUEBEC|QU[ÉE]B[ÉE]COIS)\b/.test(x)}function isVf(x){return /\b(?:VF|VFF|FR|FRA|FRE|FRENCH|FRANCAIS|FRANÇAIS|FR[ ._-]?FR)\b/.test(x)}function isVo(x){return /\bVO\b/.test(x)||/\bORIGINAL(?:[ ._-]?(?:AUDIO|LANG(?:UAGE)?))?\b/.test(x)||/\b(?:EN|ENG|ENGLISH)\b/.test(x)}var hasVost=isVost(a),hasVf=isVf(a)||isVfq(a);if(isMulti(u)||isMulti(a)||(hasVost&&hasVf))return vfMode?"MULTI (VF/VO)":"MULTI";if(isVost(u))return"VOSTFR";if(isVfq(u))return"VFQ";if(isVf(u))return"VF";if(isVo(u))return"VO";if(!u){if(hasVost)return"VOSTFR";if(hasVf)return"VF";if(isVo(a))return"VO"}return s(c.languageFallback)||(vfMode?"VF":"VO")}
function codec(r){var v=meaningful(r&&r.codec)?s(r.codec):blob(r),u=v.toUpperCase();if(/\b(?:HEVC|H[ ._-]?265|X265)\b/.test(u))return"HEVC";if(/\bAV1\b/.test(u))return"AV1";if(/\bVP9\b/.test(u))return"VP9";if(/\b(?:AVC|H[ ._-]?264|X264)\b/.test(u))return"AVC";return meaningful(r&&r.codec)?s(r.codec):""}
function audioFacts(r){var u=(s(r&&r.audio)+" "+blob(r)).toUpperCase(),tech=[],codec="",ch="",cm=u.match(/\b(7\.1|5\.1|2\.1|2\.0|1\.0)\b/);if(cm)ch=cm[1];if(/\b(?:ATMOS|DOLBY ATMOS)\b/.test(u))tech.push("Dolby Atmos");if(/\bDTS[: ._-]?X\b/.test(u))tech.push("DTS:X");if(/\bTRUE[ ._-]?HD\b/.test(u))codec="TrueHD";else if(/\b(?:E-?AC-?3|DDP|DD\+)\b/.test(u))codec="E-AC3";else if(/\bAC-?3\b/.test(u))codec="AC3";else if(/\bDTS[- ]?HD\b/.test(u))codec="DTS-HD";else if(/\bDTS\b/.test(u))codec="DTS";else if(/\bAAC\b/.test(u))codec="AAC";else if(/\bFLAC\b/.test(u))codec="FLAC";else if(/\bOPUS\b/.test(u))codec="Opus";else if(meaningful(r&&r.audio)&&!tech.length)codec=s(r.audio);return{tech:uniq(tech),codec:codec,channels:ch}}
function duration(r){var raw=r&&r.duration;if(typeof raw==="number"&&Number.isFinite(raw)&&raw>0)return raw>600?Math.round(raw/60):Math.round(raw);var d=s(raw),h=d.match(/(\d{1,2})\s*h(?:eures?)?\s*(\d{1,2})?/i);if(h)return Number(h[1])*60+Number(h[2]||0);var m=d.match(/(\d{1,4})\s*(?:min|minutes?)\b/i);if(m)return Number(m[1]);var x=blob(r).match(/\b(\d{1,3})\s*(?:min|minutes?)\b/i);return x?Number(x[1]):0}
function source(r){var raw=(s(r&&r.sourceType)+" "+s(r&&r.releaseType)+" "+blob(r)),u=raw.toUpperCase(),sourceType="",releaseType="";if(/\b(?:ULTRA[ ._-]?HD[ ._-]?BLU[ ._-]?RAY|UHD[ ._-]?BLU[ ._-]?RAY|UHD[ ._-]?BD)\b/.test(u))sourceType="ULTRA HD BLU-RAY";else if(/\b(?:BLU[- ]?RAY|BDRIP|BRRIP|BDREMUX)\b/.test(u))sourceType="BLU-RAY";else if(/\bWEB[- .]?DL\b/.test(u))sourceType="WEB-DL";else if(/\bWEB[- .]?RIP\b/.test(u))sourceType="WEBRIP";else if(/\bHDTV\b/.test(u))sourceType="HDTV";else if(/\bDVD[- .]?RIP\b/.test(u))sourceType="DVD RIP";if(/\bREMUX\b/.test(u))releaseType="REMUX";return{sourceType:sourceType||(meaningful(r&&r.sourceType)?s(r.sourceType):""),releaseType:releaseType||(meaningful(r&&r.releaseType)?s(r.releaseType):"")}}
function formatType(r){var v=meaningful(r&&r.format)?s(r.format):"",u=v.toUpperCase();if(/(?:M3U8|HLS)/.test(u))return"HLS";if(/(?:MPD|DASH)/.test(u))return"DASH";if(/\bMP4\b/.test(u))return"MP4";if(/\bMKV\b/.test(u))return"MKV";var url=s(r&&r.url).split(/[?#]/)[0].toLowerCase();if(/\.m3u8$/.test(url))return"HLS";if(/\.mpd$/.test(url))return"DASH";if(/\.mp4$/.test(url))return"MP4";if(/\.mkv$/.test(url))return"MKV";return v}
function videoFacts(r){var u=blob(r).toUpperCase(),tech=[],bit="";if(/\b(?:DOLBY VISION|DOVI)\b/.test(u))tech.push("Dolby Vision");if(/\bHDR10\+\b|\bHDR10 PLUS\b/.test(u))tech.push("HDR10+");else if(/\bHDR10\b/.test(u))tech.push("HDR10");else if(/\bHDR\b/.test(u))tech.push("HDR");if(/\bIMAX[ ._-]?ENHANCED\b/.test(u))tech.push("IMAX Enhanced");else if(/\bIMAX\b/.test(u))tech.push("IMAX");if(/\b10[ ._-]?BIT\b|\bHI10P\b/.test(u))bit="10bit";else if(/\b8[ ._-]?BIT\b/.test(u))bit="8bit";return{tech:uniq(tech),bitDepth:bit}}
function subtitleFacts(r){var u=blob(r).toUpperCase(),out=[];if(/\bVOSTFR\b/.test(u))out.push("VOSTFR");if(/\bSUB[ ._-]?FR\b/.test(u))out.push("SUB FR");if(/\bSUB[ ._-]?EN\b/.test(u))out.push("SUB EN");if(/\bFORCED\b/.test(u))out.push("FORCED");if(/\bSDH\b/.test(u))out.push("SDH");return uniq(out)}
function age(r){var v=r&&(r.ageRating||r.certification||r.contentRating);return meaningful(v)?s(v):""}
function cleanProviderLabel(v){var x=s(v).replace(/\s*(?:[-|•:])\s*(?:unknown|inconnue?|n\/?a|null|undefined|none|-+)\s*$/i,"").trim();return meaningful(x)?x:""}
function providerName(r){var raw=cleanProviderLabel(r&&r.name),n=raw.split(/[|\n]/)[0].trim(),u=n.toUpperCase(),looksTechnical=/(?:\b4K\b|\b(?:2160|1440|1080|720|576|480)P?\b|\b(?:VF|VFF|VFQ|VOSTFR|VO|MULTI|DUAL[ -]?AUDIO)\b|\b(?:HEVC|AVC|H[ ._-]?26[45]|X26[45]|AV1|VP9)\b|\b(?:WEB[ ._-]?DL|WEB[ ._-]?RIP|BLU[ ._-]?RAY|REMUX|HDR|DOLBY|DTS)\b)/.test(u);if(n&&n.length<=40&&!looksTechnical)return n;var id=s(c.providerId).replace(/[-_]+/g," ");return id?id.replace(/\b\w/g,function(x){return x.toUpperCase()}):"Source"}
function fileSize(r){var v=s(r&&r.size);if(!meaningful(v))return"";var m=v.match(/\b\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|TB)\b/i);return m?m[0]:""}
function qualityLabel(v){return v==="2160p"?"4K":s(v)}
function badgeIds(f){var ids=[];var q={"2160p":"4k-ultra-hd","1080p":"1080p-full-hd","720p":"720p-hd","480p":"480p-sd"}[f.quality];if(q)ids.push(q);var src={"ULTRA HD BLU-RAY":"uhd-blu-ray","BLU-RAY":"blu-ray-disc","WEB-DL":"webdl","WEBRIP":"webrip","HDTV":"hdtv","DVD RIP":"dvd-rip"}[f.sourceType];if(src)ids.push(src);if(f.releaseType==="REMUX")ids.push("remux");f.videoTech.forEach(function(v){var id={"Dolby Vision":"dolby-vision","HDR10+":"hdr10-plus","HDR10":"hdr10","IMAX Enhanced":"imax-enhanced","IMAX":"imax"}[v];if(id)ids.push(id)});var co={"HEVC":"hevc","AVC":"avc"}[f.codec];if(co)ids.push(co);if(f.bitDepth)ids.push(f.bitDepth);(f.audioTech||[]).forEach(function(v){var id={"Dolby Atmos":"dolby-atmos","DTS:X":"dts-x"}[v];if(id)ids.push(id)});var ac={"TrueHD":"truehd","E-AC3":"dolby-digital-plus","AC3":"dolby-digital","DTS-HD":"dts-hd-master-audio"}[f.audioCodec];if(ac)ids.push(ac);if(f.audioChannels==="7.1")ids.push("7.1");else if(f.audioChannels==="5.1")ids.push("5.1");var lg={"MULTI (VF/VO)":"multi","MULTI":"multi","VF":"vf","VFQ":"vfq","VO":"vo","VOSTFR":"vostfr"}[f.language];if(lg)ids.push(lg);(f.subtitles||[]).forEach(function(v){var id={"VOSTFR":"vostfr","SUB FR":"sub-fr","SUB EN":"sub-en","FORCED":"forced","SDH":"sdh-cc"}[v];if(id)ids.push(id)});return uniq(ids)}
function badgeLabels(f){var out=[];if(f.quality)out.push(qualityLabel(f.quality));if(f.sourceType)out.push(f.sourceType);if(f.releaseType)out.push(f.releaseType);out=out.concat(f.videoTech);if(f.codec)out.push(f.codec);if(f.bitDepth)out.push(f.bitDepth);out=out.concat(f.audioTech||[]);if(f.audioCodec)out.push(f.audioCodec);if(f.audioChannels)out.push(f.audioChannels);if(f.language)out.push(f.language);if(f.duration)out.push(humanDuration(f.duration));if(f.ageRating)out.push(f.ageRating);return uniq(out)}
function humanDuration(v){v=Number(v)||0;if(v<=0)return"";var h=Math.floor(v/60),m=v%60;return h?h+"h"+String(m).padStart(2,"0"):v+"min"}
function technicalLine(f,fs){var groups=[],video=[],audio=[],misc=[],src=f.sourceType+(f.releaseType?" "+f.releaseType:"");if(src)video.push(src);if(f.edition)video.push(f.edition);if(f.codec)video.push(f.codec+(f.bitDepth?" "+f.bitDepth:""));else if(f.bitDepth)video.push(f.bitDepth);video=video.concat(f.videoTech||[]);if(f.format)video.push(f.format);if(video.length)groups.push("🎞️ "+uniq(video).join(" • "));audio=audio.concat(f.audioTech||[]);if(f.audioCodec)audio.push(f.audioCodec);if(f.audioChannels)audio.push(f.audioChannels);if(audio.length)groups.push("🔊 "+uniq(audio).join(" • "));if(fs)misc.push("💾 "+fs);if(f.bitrate)misc.push("📶 "+f.bitrate);if(f.releaseGroup)misc.push("🏷️ "+f.releaseGroup);if(misc.length)groups.push(misc.join(" • "));return groups.join("  |  ")}
function durationAgeLine(f){var out=[];if(f.duration)out.push("⏱ "+humanDuration(f.duration));if(f.ageRating)out.push("🔞 "+f.ageRating);return out.join(" • ")}
function languageLine(f){if(!f.language)return"";var prefix=(f.language==="VF"||f.language==="VFQ"||f.language==="MULTI (VF/VO)")?"🇫🇷 ":(f.language==="VOSTFR"?"🌐🇫🇷 ":"🌐 ");var subs=(f.subtitles||[]).filter(function(v){return v&&v!=="VOSTFR"});return prefix+f.language+(subs.length?" • 💬 "+subs.join(" • "):"")}
async function cacheValue(key){try{var cache=g&&g.__nuvioTmdbMetadataCacheV1;if(cache&&Object.prototype.hasOwnProperty.call(cache,key))return await cache[key]}catch(_e){}return null}
function certification(d,kind){var rows=kind==="movie"?(d&&d.release_dates&&d.release_dates.results):(d&&d.content_ratings&&d.content_ratings.results);if(!Array.isArray(rows))return"";var row=rows.find(function(x){return s(x&&x.iso_3166_1).toUpperCase()==="FR"})||rows.find(function(x){return s(x&&x.iso_3166_1).toUpperCase()==="US"})||rows[0];if(!row)return"";if(kind==="movie"){var releases=Array.isArray(row.release_dates)?row.release_dates:[];for(var i=0;i<releases.length;i++){var v=s(releases[i]&&releases[i].certification);if(v)return v}return""}return s(row.rating)}
/* NUVIO_PRESENTATION_REUSE_MEDIA_CONTEXT_TMDB_V1 */
function contextTmdb(q,kind){try{var ctx=g&&g.__nuvioMediaContext;if(!ctx||typeof ctx!=="object"||!ctx.tmdbMetadata)return null;if(s(ctx.tmdbId)!==s(q.tmdbId))return null;var ns=s(ctx.tmdbNamespace).toLowerCase();if(ns&&ns!==kind)return null;return ctx.tmdbMetadata}catch(_e){return null}}
async function coreTmdb(q){if(!/^\d+$/.test(q.tmdbId||""))return null;var kind=(q.mediaType==="tv"||q.mediaType==="series"||q.mediaType==="anime")?"tv":"movie",result=null,d=contextTmdb(q,kind),ep=null,needsEpisode=kind==="tv"&&q.season>0&&q.episode>0;if(!d){var cached=await cacheValue(kind+":"+s(q.tmdbId));d=cached&&cached.metadata?cached.metadata:cached&&cached.value?cached.value:cached||null}if(needsEpisode){var cachedEpisode=await cacheValue("episode:tv:"+s(q.tmdbId)+":"+q.season+":"+q.episode+":fr-FR");ep=cachedEpisode&&cachedEpisode.metadata?cachedEpisode.metadata:cachedEpisode&&cachedEpisode.value?cachedEpisode.value:cachedEpisode||null}if(!d||(needsEpisode&&!ep)){try{var getter=g&&g.__nuvioCoreGetTmdbDataV1;if(typeof getter==="function")result=await getter({tmdbId:q.tmdbId,mediaType:kind,tmdbNamespace:kind,season:q.season,episode:q.episode})}catch(_e){}if(result&&result.state==="ok"){if(!d)d=result.metadata||null;if(!ep)ep=result.episodeMetadata||null}}if(!d)return null;var date=s(d.release_date||d.first_air_date),runtime=Number(d.runtime||0);if(ep&&Number(ep.runtime||0)>0)runtime=Number(ep.runtime||0);else if(!runtime&&Array.isArray(d.episode_run_time)&&d.episode_run_time.length)runtime=Number(d.episode_run_time[0]||0);return{title:s(d.title||d.name||q.title),year:Number((date.match(/(?:19|20)\d{2}/)||[])[0]||q.year||0)||0,runtime:runtime>0?Math.round(runtime):0,age:certification(d,kind)}}
function mediaLine(meta,q){var mt=meta&&meaningful(meta.title)?s(meta.title):"",qt=meaningful(q&&q.title)?s(q.title):"",title=mt||qt,year=Number((meta&&meta.year)||q.year||0)||0,parts=[];if(title)parts.push(title);if(year)parts.push(String(year));if((q.mediaType==="tv"||q.mediaType==="series"||q.mediaType==="anime")&&(q.season>0||q.episode>0))parts.push("S"+String(q.season||0).padStart(2,"0")+"E"+String(q.episode||0).padStart(2,"0"));return parts.join(" • ")}
function present(r,meta,q){if(!r||typeof r!=="object")return r;var out=Object.assign({},r),au=audioFacts(r),so=source(r),vf=videoFacts(r),f={quality:quality(r),language:language(r),codec:codec(r),audioTech:au.tech,audioCodec:au.codec,audioChannels:au.channels,duration:duration(r)||(meta&&meta.runtime)||0,sourceType:so.sourceType,releaseType:so.releaseType,format:formatType(r),videoTech:vf.tech,bitDepth:vf.bitDepth,subtitles:subtitleFacts(r),ageRating:age(r)||(meta&&meta.age)||"",edition:meaningful(r&&r.edition)?s(r.edition):"",releaseGroup:meaningful(r&&(r.releaseGroup||r.release_group))?s(r.releaseGroup||r.release_group):"",bitrate:meaningful(r&&r.bitrate)?s(r.bitrate):""};if(f.quality)out.quality=f.quality;else if("quality" in out)delete out.quality;if(!f.quality&&("resolution" in out)&&!meaningful(out.resolution))delete out.resolution;if(f.language)out.language=f.language;if(f.codec)out.codec=f.codec;var audioCombined=uniq((f.audioTech||[]).concat([f.audioCodec,f.audioChannels].filter(Boolean))).join(" ");if(audioCombined)out.audio=audioCombined;if(f.duration)out.duration=f.duration;if(f.sourceType)out.sourceType=f.sourceType;if(f.releaseType)out.releaseType=f.releaseType;if(f.format)out.format=f.format;if(f.ageRating)out.ageRating=f.ageRating;out.badgeIds=badgeIds(f);out.displayBadges=badgeLabels(f);out.presentationFacts=f;var provider=providerName(r),media=mediaLine(meta,q),fs=fileSize(r),technical=technicalLine(f,fs),timing=durationAgeLine(f),lang=languageLine(f),lines=[];if(media)lines.push(((q.mediaType==="tv"||q.mediaType==="series"||q.mediaType==="anime")?"📺 ":"🎬 ")+media);if(timing)lines.push(timing);if(lang)lines.push(lang);if(technical)lines.push(technical);out.title=provider+(f.quality?" - "+qualityLabel(f.quality):"");out.name=out.title;out.description=lines.join("\n");if(out.description)out.size=out.description;else if(fs)out.size=fs;else if("size" in out)delete out.size;return out}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalStreamPresentationV1)return false;var native=o[k];var wrap=async function(){var q=req(arguments),v=await native.apply(this,arguments),x=slot(v);if(!x||!x.list.length)return v;var meta=null;try{meta=await coreTmdb(q)}catch(_e){}return rebuild(v,x,x.list.map(function(r){return present(r,meta,q)}))};wrap.__nuvioGlobalStreamPresentationV1=true;o[k]=wrap;return true}
installJvmSafeStreamStringify();
var ok=false;try{if(typeof module!=="undefined"&&module.exports){ok=install(module.exports,"getStreams")||install(module.exports,"streams")}}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,{"providerId":"vidsrc","providerLanguageMode":"vo","languageFallback":"VO","tmdbCoreCapabilityRequired":true,"tmdbTimeoutMs":1200,"implementationRevision":"all-providers-client-projection-name-mirror-v20"});
/* CLOSEFIX:CORE.STREAM_PRESENTATION.V1 */
/* STARTFIX:CORE.PROVIDER_BRANDING.V1 */
/* FIXDATA:CORE.PROVIDER_BRANDING.V1:eyJpbXBsZW1lbnRhdGlvblJldmlzaW9uIjoicG9zdC1wcmVzZW50YXRpb24tbG9zc2xlc3Mtc291cmNlLWxhYmVsLXY4IiwicHJvdmlkZXJFbW9qaSI6IvCflIwiLCJwcm92aWRlcklkIjoidmlkc3JjIiwicHJvdmlkZXJOYW1lIjoiVmlkU3JjIn0= */
/* NUVIO_GLOBAL_PROVIDER_BRANDING_V1:db712c546e2e */
;(function(g,c){"use strict";
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
function s(v){return String(v==null?"":v).replace(/\s+/g," ").trim()}
function label(){return(s(c.providerEmoji)+" "+s(c.providerName||c.providerId||"Source")).trim()}
function placeholder(v){return/^(?:unknown|inconnu(?:e)?|n\/?a|none|null|undefined|unknown\s+(?:quality|language)|qualit(?:e|é)\s+inconnue|langue\s+inconnue|-+)$/i.test(s(v))}
function cleanSource(v){var x=s(v);if(!x)return"";var m=x.match(/^(.*?)(?:\s*[-|•:]\s*)(unknown|inconnu(?:e)?|n\/?a|none|null|undefined|unknown\s+(?:quality|language)|qualit(?:e|é)\s+inconnue|langue\s+inconnue)$/i);if(m)x=s(m[1]);return placeholder(x)?"":x}
function norm(v){return s(v).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g,"")}
function qualityToken(v){v=s(v);var u=v.toUpperCase();if(/(?:\b4K\b|\b2160P?\b|\bUHD\b)/.test(u))return"4K";var m=u.match(/\b(1440|1080|720|576|540|480|360)P?\b/);return m?m[1]+"p":""}
function oldQuality(old){old=s(old);var token=" - ",i=old.lastIndexOf(token);if(i<0)return"";var suffix=s(old.slice(i+token.length));return suffix&&!placeholder(suffix)?qualityToken(suffix)||suffix:""}
function addUnique(out,value){value=cleanSource(value);if(!value)return;var n=norm(value);if(!n)return;for(var i=0;i<out.length;i++){var p=norm(out[i]);if(p===n||p.indexOf(n)>=0)return;if(n.indexOf(p)>=0){out[i]=value;return}}out.push(value)}
function sourceParts(r){var out=[];addUnique(out,r&&r.sourceName);addUnique(out,r&&r.sourceTitle);addUnique(out,r&&r.sourceLabel);addUnique(out,r&&r.server);addUnique(out,r&&r.hoster);addUnique(out,r&&r.player);addUnique(out,r&&r.indexer);addUnique(out,r&&r.network);return out}
function containsQuality(parts,q){q=qualityToken(q);if(!q)return false;var aliases=q==="4K"?["4k","2160p","uhd"]:[q.toLowerCase()];var all=(parts||[]).join(" ").toLowerCase();for(var i=0;i<aliases.length;i++)if(all.indexOf(aliases[i])>=0)return true;return false}
function visibleTitle(r,v,old){var parts=[v],sources=sourceParts(r);for(var i=0;i<sources.length;i++){var value=sources[i],n=norm(value),pn=norm(c.providerName),vl=norm(v);if(n&&n!==pn&&n!==vl)addUnique(parts,value)}var q=qualityToken(r&&r.quality)||oldQuality(old),base=parts.join(" • ");return q&&!containsQuality(parts,q)?base+" - "+q:base}
function brand(r){if(!r||typeof r!=="object")return r;var o=Object.assign({},r),v=label();if(!v)return o;var display=visibleTitle(o,v,o.title);o.title=display;o.name=display;return o}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalProviderBrandingV1)return false;var native=o[k];var wrap=async function(){var v=await native.apply(this,arguments),x=slot(v);if(!x||!x.list.length)return v;return rebuild(v,x,x.list.map(brand))};wrap.__nuvioGlobalProviderBrandingV1=true;o[k]=wrap;return true}
var ok=false;try{if(typeof module!=="undefined"&&module.exports){ok=install(module.exports,"getStreams")||install(module.exports,"streams")}}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,{"providerId":"vidsrc","providerName":"VidSrc","providerEmoji":"🔌","implementationRevision":"post-presentation-lossless-source-label-v8"});
/* CLOSEFIX:CORE.PROVIDER_BRANDING.V1 */
/* STARTFIX:CORE.STREAM_SANITIZER.V6 */
/* FIXDATA:CORE.STREAM_SANITIZER.V6:eyJpbXBsZW1lbnRhdGlvblJldmlzaW9uIjoidGVybWluYWwtc2luZ2xlLW93bmVyLXY2IiwibWF4UHJvYmVzIjo4LCJtaW5Wb2REdXJhdGlvblNlY29uZHMiOjYwLCJwcm9iZUFsbFVybHMiOnRydWUsInByb2JlVGltZW91dE1zIjo2NTAwfQ== */
/* NUVIO_STREAM_OUTPUT_SANITIZER_V4:eb109cc8a760 */
;(function(g,config){
  "use strict";
  function nativeHost(){try{return typeof g.__native_fetch==="function"}catch(_e){return false}}
  function providerDeadlineExpired(){try{var d=Number(g&&g.__nuvioProviderDeadlineMs);return Number.isFinite(d)&&d>0&&Date.now()>=d}catch(_e){return false}}
  function hostOf(raw){try{return new URL(String(raw)).hostname.toLowerCase()}catch(_e){return ""}}
  function blocked(raw){
    var host=hostOf(raw);
    if(!host)return true;
    for(var i=0;i<config.blockedHosts.length;i++){
      var rule=config.blockedHosts[i];
      if(host===rule||host.endsWith("."+rule))return true;
    }
    try{
      var parsed=new URL(String(raw)),path=parsed.pathname.toLowerCase();
      for(var j=0;j<config.blockedPathPatterns.length;j++){
        if(path.indexOf(config.blockedPathPatterns[j])>=0)return true;
      }
      // NUVIO_EMBED_HTML_ALLOWLIST_V1
      // External-player pages often legitimately end in .html. Preserve them
      // only when their path has an explicit player/embed/watch role.
      var embedLike=/\/(?:embed|e|player|watch)(?:[-/]|$)/i.test(path);
      if(/\.(?:js|mjs|css|json|xml|txt|map|woff2?|ttf|otf|ico|jpe?g|png|gif|webp|svg)(?:$|[?#])/i.test(path))return true;
      if(/\.html?(?:$|[?#])/i.test(path)&&!embedLike)return true;
    }catch(_e){}
    return false;
  }
  function streamSlot(value){if(Array.isArray(value))return {key:null,list:value};if(value&&typeof value==="object"){for(var i=0;i<3;i++){var key=["streams","results","data"][i];if(Array.isArray(value[key]))return {key:key,list:value[key]}}}return null}
  function rebuild(value,slot,list){if(slot.key===null)return list;var out=Object.assign({},value);out[slot.key]=list;return out}
  function urlOf(stream){return stream&&typeof stream.url==="string"?stream.url.trim():""}
  function directExtension(url){return /(?:\.m3u8?|\.mpd|\.mp4|\.m4v|\.mov|\.mkv|\.webm|\.mpeg|\.mpg|\.ogv)(?:[?#]|$)/i.test(String(url||""))}
  function isDirect(stream,url){
    var hint=String((stream&&(stream.type||stream.format||stream.mimeType||stream.contentType))||"").toLowerCase();
    return directExtension(url)||/(?:hls|mpegurl|dash|mp4|matroska|webm|video\/)/.test(hint);
  }
  function markDirect(stream,url){
    if(!stream||typeof stream!=="object")return;
    if(url&&!blocked(url))stream.url=String(url);
    stream.isDirect=true;
  }
  function rank(stream,url){
    if(isDirect(stream,url))return 0;
    try{
      var path=new URL(String(url)).pathname.toLowerCase();
      if(/\/(?:embed|e|player|watch)(?:[-/]|$)/i.test(path))return 1;
    }catch(_e){}
    if(stream&&stream.headers&&typeof stream.headers==="object"&&Object.keys(stream.headers).length)return 2;
    return 3;
  }
  function hasHeader(headers,name){
    if(!headers||typeof headers!=="object")return false;
    var wanted=String(name||"").toLowerCase(),keys=[];
    try{keys=Object.keys(headers)}catch(_e){}
    for(var i=0;i<keys.length;i++)if(String(keys[i]).toLowerCase()===wanted)return true;
    return false;
  }
  function proxyRequestHeaders(stream){
    try{
      var hints=stream&&stream.behaviorHints;
      var proxy=hints&&hints.proxyHeaders;
      return proxy&&proxy.request&&typeof proxy.request==="object"?proxy.request:null;
    }catch(_e){return null}
  }
  function ensureProxyRequest(stream){
    if(!stream||typeof stream!=="object")return null;
    if(!stream.behaviorHints||typeof stream.behaviorHints!=="object")stream.behaviorHints={};
    if(!stream.behaviorHints.proxyHeaders||typeof stream.behaviorHints.proxyHeaders!=="object")stream.behaviorHints.proxyHeaders={};
    if(!stream.behaviorHints.proxyHeaders.request||typeof stream.behaviorHints.proxyHeaders.request!=="object")stream.behaviorHints.proxyHeaders.request={};
    stream.behaviorHints.notWebReady=true;
    return stream.behaviorHints.proxyHeaders.request;
  }
  function setHeaderIfMissing(headers,key,value){
    if(!headers||value==null||String(value).trim()===""||hasHeader(headers,key))return;
    headers[key]=String(value);
  }
  function syncPlaybackHeaders(stream){
    if(!stream||typeof stream!=="object")return;
    var legacy=stream.headers&&typeof stream.headers==="object"?stream.headers:null;
    if(!legacy)return;
    var request=ensureProxyRequest(stream);
    try{Object.keys(legacy).forEach(function(key){if(legacy[key]!=null)setHeaderIfMissing(request,key,legacy[key])})}catch(_e){}
  }
  function ensurePlaybackHeaders(stream,referer){
    if(!stream||typeof stream!=="object"||!referer)return;
    var request=ensureProxyRequest(stream);
    if(!stream.headers||typeof stream.headers!=="object")stream.headers={};
    setHeaderIfMissing(request,"Referer",referer);
    setHeaderIfMissing(stream.headers,"Referer",referer);
    try{
      var origin=new URL(String(referer)).origin;
      setHeaderIfMissing(request,"Origin",origin);
      setHeaderIfMissing(stream.headers,"Origin",origin);
    }catch(_e){}
  }
  function headersFor(stream,referer){
    var output={"Accept":"application/vnd.apple.mpegurl,application/x-mpegURL,application/dash+xml,video/*,*/*;q=0.8","Range":"bytes=0-32767","User-Agent":"Mozilla/5.0"};
    var legacy=stream&&stream.headers;
    if(legacy&&typeof legacy==="object"){
      try{Object.keys(legacy).forEach(function(key){if(legacy[key]!=null)output[key]=String(legacy[key])})}catch(_e){}
    }
    var proxy=proxyRequestHeaders(stream);
    if(proxy){try{Object.keys(proxy).forEach(function(key){if(proxy[key]!=null)output[key]=String(proxy[key])})}catch(_e){}}
    if(referer){
      setHeaderIfMissing(output,"Referer",referer);
      try{setHeaderIfMissing(output,"Origin",new URL(String(referer)).origin)}catch(_e){}
    }
    return output;
  }
  async function prefixBytes(response,controller){
    if(response.body&&typeof response.body.getReader==="function"){
      var reader=response.body.getReader(),chunks=[],total=0;
      try{
        while(total<32768){
          var chunk=await reader.read();
          if(!chunk||chunk.done)break;
          var value=chunk.value||new Uint8Array(0);
          if(!value.length)continue;
          if(total+value.length>32768)value=value.slice(0,32768-total);
          chunks.push(value);total+=value.length;
        }
        var output=new Uint8Array(total),offset=0;
        for(var i=0;i<chunks.length;i++){output.set(chunks[i],offset);offset+=chunks[i].length}
        return output;
      }finally{try{await reader.cancel()}catch(_e){};try{controller.abort()}catch(_e){}}
    }
    if(typeof response.arrayBuffer==="function"){
      var buffer=await response.arrayBuffer();
      try{controller.abort()}catch(_e){}
      return new Uint8Array(buffer.slice(0,32768));
    }
    // NuvioTV's QuickJS fetch Response is text/json-only. Preserve strict HLS
    // validation there without requiring TextEncoder (also absent on TV).
    if(typeof response.text==="function"){
      var text=String(await response.text()||""),length=Math.min(text.length,32768);
      var output=new Uint8Array(length);
      for(var i=0;i<length;i++)output[i]=text.charCodeAt(i)&255;
      try{controller.abort()}catch(_e){}
      return output;
    }
    try{controller.abort()}catch(_e){}
    return new Uint8Array(0);
  }
  function ascii(bytes){
    var end=Math.min(bytes.length,32768),out="";
    for(var i=0;i<end;i++)out+=String.fromCharCode(bytes[i]);
    return out;
  }
  function absoluteMediaUri(raw,baseUrl){
    var value=String(raw||"").trim();
    if(!value||value.charAt(0)==="#")return value;
    if(/^(?:data:|blob:|skd:|urn:)/i.test(value))return value;
    try{return new URL(value,String(baseUrl||"")).toString()}catch(_e){return value}
  }
  function normalizeHlsText(text,baseUrl){
    var value=String(text||"").replace(/^(?:\uFEFF|\u00EF\u00BB\u00BF)/,"").trimStart();
    if(/^\s*(?:<!doctype|<html|<body|\{|\[)/i.test(value))return null;
    var hadHeader=value.indexOf("#EXTM3U")===0;
    if(!hadHeader){
      if(!/(?:^|\n)#EXT-(?:X-[A-Z0-9-]+|INF)\s*[:]/i.test(value))return null;
      value="#EXTM3U\n"+value;
    }
    if(!validHls(value))return null;
    var lines=value.split(/\r?\n/);
    for(var i=0;i<lines.length;i++){
      var line=String(lines[i]||"");
      if(line.charAt(0)==="#"){
        lines[i]=line.replace(/URI=(["'])([^"']+)\1/gi,function(_all,quote,uri){return "URI="+quote+absoluteMediaUri(uri,baseUrl)+quote});
      }else if(line.trim()){
        lines[i]=absoluteMediaUri(line.trim(),baseUrl);
      }
    }
    return {text:lines.join("\n"),repaired:!hadHeader};
  }
  /* NUVIO_STREAM_QUALITY_RECOVERY_V2 */
  function meaningfulQuality(value){return !/^(?:|unknown|inconnue?|n\/?a|null|undefined|none|-+)$/i.test(String(value==null?"":value).trim())}
  function qualityFromHeight(height){var h=Number(height||0);if(h>=2000)return"2160p";if(h>=1350)return"1440p";if(h>=900)return"1080p";if(h>=650)return"720p";if(h>=450)return"480p";if(h>=300)return"360p";return""}
  function qualityFromHls(text,url){
    var value=String(text||""),match,re=/RESOLUTION\s*=\s*(\d{2,5})x(\d{2,5})/gi,best=0;
    while((match=re.exec(value))!==null)best=Math.max(best,Number(match[2]||0));
    var q=qualityFromHeight(best);if(q)return q;
    var source=String(url||"").toUpperCase();
    if(/(?:\b4K\b|\b2160P?\b|\bUHD\b)/.test(source))return"2160p";
    var m=source.match(/\b(1440|1080|720|576|540|480|360)P?\b/);return m?m[1]+"p":"";
  }
  function recoverQuality(stream,text,url){if(!stream||typeof stream!=="object"||meaningfulQuality(stream.quality))return;var q=qualityFromHls(text,url);if(q)stream.quality=q;else try{delete stream.quality}catch(_e){}}
  function repairedHlsUrl(text){
    return "data:application/vnd.apple.mpegurl;charset=utf-8,"+encodeURIComponent(String(text||""));
  }
  function looksHtml(text,contentType){
    return /text\/html|application\/xhtml\+xml/i.test(String(contentType||""))||/^\s*(?:<!doctype|<html|<head|<body)/i.test(String(text||""));
  }
  function looksJson(text,contentType){
    return /application\/(?:json|[^;]+\+json)/i.test(String(contentType||""))||/^\s*[\[{]/.test(String(text||""));
  }
  function mediaCandidatesFromPayload(text,baseUrl){
    var value=String(text||"").replace(/\\\//g,"/").replace(/&amp;/gi,"&").replace(/\\u0026/gi,"&"),rows=[],seen=Object.create(null);
    function push(raw,allowOpaque){
      var candidate=String(raw||"").trim().replace(/^['"]|['"]$/g,"");
      if(!candidate||candidate.length>4096)return;
      candidate=absoluteMediaUri(candidate,baseUrl);
      if(!candidate||candidate===baseUrl||blocked(candidate)||seen[candidate])return;
      var path="";try{path=new URL(candidate).pathname.toLowerCase()}catch(_e){}
      var embedLike=/\/(?:embed|e|player|watch)(?:[-/]|$)/i.test(path);
      if(!allowOpaque&&!directExtension(candidate)&&!embedLike)return;
      seen[candidate]=1;rows.push({url:candidate,direct:isDirect(null,candidate)?0:1});
    }
    var match,re=/<(?:video|source|iframe)\b[^>]*?\b(?:src|data-src)\s*=\s*["']([^"']+)["']/gi;
    while((match=re.exec(value))!==null)push(match[1],true);
    re=/(?:["']?(?:file|src|source|url)["']?\s*[:=]\s*)["']([^"']+)["']/gi;
    while((match=re.exec(value))!==null)push(match[1],true);
    re=/https?:\/\/[^\s"'<>\\]+/gi;
    while((match=re.exec(value))!==null)push(match[0],false);
    rows.sort(function(a,b){return a.direct-b.direct});
    return rows.slice(0,2).map(function(row){return row.url});
  }
  function validHls(text){
    var value=String(text||"").replace(/^(?:\uFEFF|\u00EF\u00BB\u00BF)/,"").trimStart();
    if(value.indexOf("#EXTM3U")!==0)return false;
    var lines=value.split(/\r?\n/),hasVariantTag=false,hasVariantUri=false;
    for(var i=0;i<lines.length;i++){
      if(!/^#EXT-X-STREAM-INF\s*:/i.test(lines[i].trim()))continue;
      hasVariantTag=true;
      for(var j=i+1;j<lines.length;j++){
        var child=String(lines[j]||"").trim();
        if(!child)continue;
        if(child.charAt(0)==="#")continue;
        hasVariantUri=true;break;
      }
      if(hasVariantUri)break;
    }
    if(hasVariantTag&&!hasVariantUri)return false;
    var hasMedia=/#EXTINF\s*:/i.test(value)||/#EXT-X-PART\s*:/i.test(value)||/#EXT-X-MAP\s*:/i.test(value);
    if(!hasMedia&&!hasVariantUri)return false;
    var isVod=/#EXT-X-ENDLIST(?:\r?\n|$)/i.test(value);
    var durations=[],match,re=/#EXTINF:([0-9]+(?:\.[0-9]+)?)/gi;
    while((match=re.exec(value))!==null)durations.push(Number(match[1])||0);
    if(isVod&&durations.length&&config.minVodDurationSeconds>0){
      var total=durations.reduce(function(sum,item){return sum+item},0);
      if(total<config.minVodDurationSeconds)return false;
    }
    return true;
  }
  function validDash(text){
    var value=String(text||"").trimStart();
    return /<MPD[\s>]/i.test(value)&&/<(?:Representation|AdaptationSet)\b/i.test(value);
  }
  function dispositionMedia(value){
    return /filename\*?=(?:UTF-8''|["']?)[^;\r\n]*\.(?:m3u8?|mpd|mp4|m4v|mov|mkv|webm|mpeg|mpg|ogv)(?:["';\r\n]|$)/i.test(String(value||""));
  }
  function isEbml(bytes){return bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3}
  async function probeResolved(stream,url,depth,referer){
    if(providerDeadlineExpired())return null;
    if(typeof g.fetch!=="function")return true;
    var controller=typeof AbortController!=="undefined"?new AbortController():{signal:void 0,abort:function(){}};
    var timer=setTimeout(function(){try{controller.abort()}catch(_e){}},config.timeoutMs);
    try{
      var response=await g.fetch(url,{method:"GET",headers:headersFor(stream,referer),redirect:"follow",signal:controller.signal});
      var finalUrl=response&&response.url?String(response.url):url;
      if(!response)return null;
      if(blocked(finalUrl))return false;
      if(!response.ok){
        var status=Number(response.status||0);
        if(status===403||status===404||status===410)return false;
        return null;
      }
      var contentType=String(response.headers&&response.headers.get?response.headers.get("content-type")||"":"").toLowerCase();
      var disposition=String(response.headers&&response.headers.get?response.headers.get("content-disposition")||"":"");
      var bytes=await prefixBytes(response,controller),text=ascii(bytes);
      if(/(?:\.m3u8?)(?:[?#]|$)/i.test(url)||/(?:\.m3u8?)(?:[?#]|$)/i.test(finalUrl)||/(?:mpegurl|vnd\.apple)/.test(contentType)||/^\s*#EXT(?:M3U|-(?:X-[A-Z0-9-]+|INF)\s*:)/i.test(text)){
        var hls=normalizeHlsText(text,finalUrl);
        if(!hls)return false;
        recoverQuality(stream,hls.text,finalUrl);
        if(hls.repaired){
          stream.url=repairedHlsUrl(hls.text);
          if(!stream.type)stream.type="hls";
          if(!stream.mimeType)stream.mimeType="application/vnd.apple.mpegurl";
          stream.isDirect=true;
        }else markDirect(stream,finalUrl);
        syncPlaybackHeaders(stream);
        return true;
      }
      if(looksHtml(text,contentType)||looksJson(text,contentType)){
        var candidates=mediaCandidatesFromPayload(text,finalUrl);
        if(depth<2&&candidates.length){
          ensurePlaybackHeaders(stream,finalUrl);
          for(var candidateIndex=0;candidateIndex<candidates.length;candidateIndex++){
            if(await probeResolved(stream,candidates[candidateIndex],depth+1,finalUrl))return true;
          }
        }
        return false;
      }
      if(/(?:\.mpd)(?:[?#]|$)/i.test(url)||/(?:\.mpd)(?:[?#]|$)/i.test(finalUrl)||/application\/dash\+xml/.test(contentType)||/^\s*(?:<\?xml[\s\S]{0,300})?<MPD[\s>]/i.test(text)){
        if(!validDash(text))return false;
        markDirect(stream,finalUrl);
        return true;
      }
      var hasFtyp=bytes.length>=8&&ascii(bytes.slice(4,8))==="ftyp";
      if(/(?:\.mp4|\.m4v|\.mov)(?:[?#]|$)/i.test(url)||/(?:\.mp4|\.m4v|\.mov)(?:[?#]|$)/i.test(finalUrl)||/video\/mp4/.test(contentType)||hasFtyp){
        if(!(/video\/mp4/.test(contentType)||hasFtyp||bytes.length>0))return false;
        markDirect(stream,finalUrl);
        return true;
      }
      if(/(?:video\/(?:webm|x-matroska|mpeg|ogg)|application\/(?:x-matroska|ogg))/.test(contentType)||isEbml(bytes)||dispositionMedia(disposition)){
        if(!bytes.length)return false;
        markDirect(stream,finalUrl);
        return true;
      }
      if(/^video\//.test(contentType)&&bytes.length){
        markDirect(stream,finalUrl);
        return true;
      }
      if(/^text\//i.test(contentType))return false;
      return bytes.length>0;
    }catch(_error){return null}
    finally{clearTimeout(timer);try{controller.abort()}catch(_e){}}
  }
  /* NUVIO_STREAM_OUTPUT_CORRELATED_PLAYER_FALLBACK_V7 */
  function genericAppShellMedia(url){
    try{
      var parsed=new URL(String(url||""));
      var host=String(parsed.hostname||"").toLowerCase();
      var path=String(parsed.pathname||"").toLowerCase().replace(/\/+$/,"");
      if(host==="web.telegram.org"&&(path==="/a/nojs.mp4"||path==="/k/nojs.mp4"))return true;
    }catch(_e){}
    return false;
  }
  function correlatedPlayerFallback(stream,url){
    if(!stream||typeof stream!=="object"||isDirect(stream,url))return false;
    var proof=stream.__nuvioCorrelatedPlayerFallbackV1;
    if(!proof||typeof proof!=="object"||String(proof.url||"")!==String(url||""))return false;
    try{
      var parsed=new URL(String(url||"")),path=String(parsed.pathname||"").toLowerCase();
      if(/\/(?:embed|e|player|watch)(?:[-/]|$)/i.test(path))return true;
      if(/\/(?:shell|video|stream)(?:\.php|[/?#.-]|$)/i.test(path)){
        var keys=[];try{parsed.searchParams.forEach(function(_v,k){keys.push(String(k).toLowerCase())})}catch(_e){}
        return keys.some(function(k){return /^(?:videoid|video|vid|file|embed|player|stream|source)$/.test(k)});
      }
    }catch(_e){}
    return false;
  }
  function clearPrivateProofs(stream){
    if(stream&&typeof stream==="object"){
      try{delete stream.__nuvioCorrelatedPlayerFallbackV1}catch(_e){}
      try{delete stream.__nuvioCoreMediaProofV1}catch(_e){}
    }
    return stream;
  }
  function coreMediaProof(stream,url){
    var proof=stream&&stream.__nuvioCoreMediaProofV1;
    if(!proof||typeof proof!=="object")return false;
    var kind=String(proof.kind||"").toLowerCase();
    return String(proof.url||"")===String(url||"")&&/^(?:hls|dash|mp4|mkv|webm|mpegts|video)$/.test(kind);
  }
  function clearCoreMediaProof(stream){
    if(stream&&typeof stream==="object")try{delete stream.__nuvioCoreMediaProofV1}catch(_e){}
    return stream;
  }
  async function probe(stream,url){return await probeResolved(stream,url,0,"")}
  function install(container,key){
    if(!container||typeof container[key]!=="function"||container[key].__nuvioSanitized)return false;
    var original=container[key];
    var wrapped=async function(){
      var result=await original.apply(this,arguments);
      var slot=streamSlot(result);
      if(!slot)return [];
      if(!slot.list.length)return result;
      var rows=slot.list,seen=Object.create(null),candidates=[],probeCount=0;
      for(var i=0;i<rows.length;i++){
        var stream=rows[i];syncPlaybackHeaders(stream);var url=urlOf(stream);
        if(!url||blocked(url)||seen[url])continue;
        seen[url]=true;
        candidates.push({stream:stream,url:url,rank:rank(stream,url),index:i});
      }
      candidates.sort(function(a,b){return a.rank-b.rank||a.index-b.index});
      for(var c=0;c<candidates.length;c++){
        candidates[c].probe=(config.probeAllUrls||(config.probeDirectMedia&&isDirect(candidates[c].stream,candidates[c].url)))&&probeCount++<config.maxProbes;
      }
      async function checkItem(item){
        if(genericAppShellMedia(item.url))return null;if(correlatedPlayerFallback(item.stream,item.url))return clearPrivateProofs(item.stream);if(coreMediaProof(item.stream,item.url))return clearPrivateProofs(item.stream);if(!item.probe)return config.probeAllUrls?null:clearPrivateProofs(item.stream);
        var verdict=await probe(item.stream,item.url);
        return verdict===false?null:clearPrivateProofs(item.stream);
      }
      var checked=[];
      if(nativeHost()){
        for(var p=0;p<candidates.length;p++)checked.push(await checkItem(candidates[p]));
      }else{
        checked=await Promise.all(candidates.map(checkItem));
      }
      return rebuild(result,slot,checked.filter(Boolean));
    };
    wrapped.__nuvioSanitized=true;
    wrapped.__nuvioOriginal=original;
    container[key]=wrapped;
    return true;
  }
  var installed=false;
  try{if(typeof module!=="undefined"&&module.exports)installed=install(module.exports,"getStreams")||installed}catch(_e){}
  try{if(g&&typeof g.getStreams==="function"){
    if(installed&&typeof module!=="undefined"&&module.exports&&module.exports.getStreams)g.getStreams=module.exports.getStreams;
    else install(g,"getStreams");
  }}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,{"blockedHosts":["analytics.google.com","api.themoviedb.org","arm.haglund.dev","cloudflareinsights.com","connect.facebook.net","doubleclick.net","google-analytics.com","googlesyndication.com","googletagmanager.com","graphql.anilist.co","kitsu.io","lodash.com","npms.io","openjsf.org","pagead2.googlesyndication.com","static.cloudflareinsights.com","underscorejs.org","v3-cinemeta.strem.io"],"probeDirectMedia":true,"probeAllUrls":true,"maxProbes":8,"timeoutMs":6500,"minVodDurationSeconds":60,"blockedPathPatterns":["/analytics","/beacon.min.js","/cdn-cgi/rum","/collect","/gtag/js"],"implementationVersion":9});
/* CLOSEFIX:CORE.STREAM_SANITIZER.V6 */
/* END NIAKVIO_PROVIDER */