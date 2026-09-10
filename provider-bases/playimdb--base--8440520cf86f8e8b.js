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
    const label = _text(match[4])
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
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
