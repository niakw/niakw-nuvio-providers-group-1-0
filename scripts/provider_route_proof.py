#!/usr/bin/env python3
"""Shared proof-first Provider v3 route derivation.

Static/upstream route strings are candidates only. Executable Provider DATA may only
be derived from HTTP requests observed while executing that provider. Dynamic values
are abstracted only when the trace proves where they came from (fixture identity or a
prior provider response value). Anything with unresolved fixture/session residue stays
diagnostic evidence and is never promoted to runtime authority.
"""
from __future__ import annotations

import copy
import re
import urllib.parse
from typing import Any, Iterable

SEMANTIC_TYPES = {"movie", "tv", "anime"}
ROUTE_FIELD_SUFFIXES = ("route", "routes", "path", "paths", "endpoint", "endpoints", "url", "urls")
ROUTE_FIELD_EXCLUDED = {
    "base", "baseurl", "referer", "referrer", "origin", "host", "domain",
    "officialsite", "officialhub", "officialapi", "fixedapi",
}
PROVIDER_VALUE_KEYS = {
    "id", "_id", "media_id", "mediaid", "post_id", "postid", "content_id", "contentid",
    "movie_id", "movieid", "series_id", "seriesid", "show_id", "showid", "slug",
}
VOLATILE_QUERY_KEYS = {
    "seed", "token", "access_token", "auth", "signature", "sig", "hash", "nonce",
    "timestamp", "ts", "expires", "expiry", "expire", "key", "session", "session_id",
}
# PROVIDER_ROUTE_PROOF_EXTERNAL_IDENTITY_V11
EXTERNAL_IDENTITY_HINT_KEYS = {"imdb", "imdbid", "imdb_id"}
CONTENT_IDENTITY_QUERY_KEYS = {
    "imdb", "imdbid", "imdb_id", "year", "releaseyear", "release_year",
    "seasonid", "season_id", "episodeid", "episode_id",
}


def canonical(value: object) -> str:
    return str(value or "").strip().casefold()


def unique(values: Iterable[Any], limit: int = 256) -> list[str]:
    out: list[str] = []
    for raw in values:
        value = str(raw or "").strip()
        if value and value not in out:
            out.append(value)
        if len(out) >= limit:
            break
    return out


def routeish_key(key: object) -> bool:
    compact = str(key or "").strip().replace("-", "").replace("_", "").casefold()
    return bool(compact and compact not in ROUTE_FIELD_EXCLUDED and compact.endswith(ROUTE_FIELD_SUFFIXES))


def iter_recipe_routes(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            if routeish_key(key):
                if isinstance(child, str) and child.strip():
                    yield child.strip()
                elif isinstance(child, list):
                    for item in child:
                        if isinstance(item, str) and item.strip():
                            yield item.strip()
            if isinstance(child, (dict, list)):
                yield from iter_recipe_routes(child)
    elif isinstance(value, list):
        for child in value:
            if isinstance(child, (dict, list)):
                yield from iter_recipe_routes(child)


def filter_recipe_by_live_routes(recipe: dict[str, Any], live_routes: set[str]) -> dict[str, Any] | None:
    """Keep recipe metadata but only route fields proven live in this provider trace."""
    def walk(value: Any) -> Any:
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for key, child in value.items():
                if routeish_key(key):
                    if isinstance(child, str):
                        text = child.strip()
                        if text and text in live_routes:
                            out[key] = child
                    elif isinstance(child, list):
                        kept = [item for item in child if isinstance(item, str) and item.strip() in live_routes]
                        if kept:
                            out[key] = kept
                    continue
                if isinstance(child, (dict, list)):
                    nested = walk(child)
                    if nested not in ({}, [], None):
                        out[key] = nested
                else:
                    out[key] = copy.deepcopy(child)
            return out
        if isinstance(value, list):
            out = []
            for child in value:
                if isinstance(child, (dict, list)):
                    nested = walk(child)
                    if nested not in ({}, [], None):
                        out.append(nested)
                else:
                    out.append(copy.deepcopy(child))
            return out
        return copy.deepcopy(value)

    filtered = walk(recipe)
    if not isinstance(filtered, dict):
        return None
    if not list(iter_recipe_routes(filtered)):
        return None
    return filtered


def request_shape(fetch: dict[str, Any]) -> str:
    raw = str(fetch.get("final_url") or fetch.get("url") or "")
    try:
        parsed = urllib.parse.urlsplit(raw)
        query_keys = sorted(urllib.parse.parse_qs(parsed.query, keep_blank_values=True))
        host = (parsed.hostname or "").casefold()
        path = parsed.path or "/"
    except ValueError:
        host, path, query_keys = "", raw, []
    return "|".join([
        str(fetch.get("method") or "GET").upper(),
        host,
        path,
        ",".join(query_keys),
        str(fetch.get("body_kind") or "none"),
        ",".join(sorted(str(v) for v in fetch.get("body_fields") or [])),
    ])


# NIAKVIO_PROVIDER_REPAIR_PORTFOLIO_V6
def route_role(route: str) -> str:
    value = canonical(route)
    try:
        parsed = urllib.parse.urlsplit(value)
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    except ValueError:
        query = {}
    has_episode = any(key in query for key in ("e", "ep", "episode", "episode_number"))
    has_season = any(key in query for key in ("season", "season_number")) or ("s" in query and has_episode)
    if (
        re.search(r"(?:/(?:search|recherche)(?:[/?#]|$)|:search(?:[/?#]|$))", value)
        or any(key in query for key in ("q", "query", "keyword", "search", "story"))
        or ("s" in query and not has_season)
    ):
        return "search"
    if re.search(r"/(?:video[-_]?player|watchplayer|iframeplayer|player|embed|play)(?:[/?#.-]|$)", value):
        return "player"
    if re.search(r"/(?:download|file|mediafile|source|sources)(?:[/?#.-]|$)", value):
        return "source"
    if re.search(r"/(?:episodes?(?:\.js|\.json|\.txt)?|season-list|episode-list)(?:[/?#.-]|$)", value):
        return "episode-index"
    if re.search(r"/api(?:[./?#]|$)", value):
        return "api"
    return "detail"


def _slug_candidates(fixture: dict[str, Any]) -> list[str]:
    values = [fixture.get("title"), *(fixture.get("aliases") or [])]
    out: list[str] = []
    for raw in values:
        text = canonical(raw)
        if not text:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
        compact = re.sub(r"[^a-z0-9]+", "", text)
        for value in (slug, compact):
            if value and len(value) >= 4 and value not in out:
                out.append(value)
    return out


# NIAKVIO_PROVIDER_RESPONSE_VALUE_CORRELATION_V20
# NIAKVIO_PROVIDER_RESPONSE_VALUE_CORRELATION_V20_1
_PROVIDER_HINT_SENSITIVE_KEY = re.compile(
    r"api[_-]?key|token|auth|authorization|signature|sig|secret|password|cookie|session|nonce",
    re.I,
)


def _provider_hint_rows(prior_value_hints: Iterable[dict[str, Any]] | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for row in prior_value_hints or []:
        if not isinstance(row, dict):
            continue
        key = canonical(row.get("key"))
        value = str(row.get("value") or "").strip()
        if not key or not value or len(value) < 2 or len(value) > 160:
            continue
        if _PROVIDER_HINT_SENSITIVE_KEY.search(key) or key in VOLATILE_QUERY_KEYS:
            continue
        if not re.fullmatch(r"[A-Za-z0-9._~-]+", value):
            continue
        fp = (key, value)
        if fp in seen:
            continue
        seen.add(fp)
        out.append({"key": key, "value": value})
    return out[:160]


def _provider_hint_values_for_keys(
    prior_value_hints: Iterable[dict[str, Any]] | None,
    keys: set[str],
) -> set[str]:
    wanted = {canonical(value) for value in keys}
    return {row["value"] for row in _provider_hint_rows(prior_value_hints) if row["key"] in wanted}


def _provider_hint_values(prior_value_hints: Iterable[dict[str, Any]] | None) -> set[str]:
    out: set[str] = set()
    for row in _provider_hint_rows(prior_value_hints):
        value = row["value"]
        # Preserve V11 external IMDb ownership: an IMDb-shaped value is never a
        # provider-internal id even if an upstream response called the field id.
        if re.fullmatch(r"tt\d{7,10}", value, re.I):
            continue
        out.add(value)
    return out


def _external_identity_hint_values(
    prior_value_hints: Iterable[dict[str, Any]] | None,
) -> set[str]:
    out: set[str] = set()
    for row in prior_value_hints or []:
        if not isinstance(row, dict):
            continue
        key = canonical(row.get("key"))
        value = str(row.get("value") or "").strip()
        if key not in EXTERNAL_IDENTITY_HINT_KEYS and key not in PROVIDER_VALUE_KEYS:
            continue
        if re.fullmatch(r"tt\d{7,10}", value, re.I):
            out.add(value)
    return out


def response_value_hints(fetch: dict[str, Any]) -> list[dict[str, str]]:
    rows = fetch.get("response_value_hints")
    if not isinstance(rows, list):
        return []
    return _provider_hint_rows(rows)[:80]


# PROVIDER_ROUTE_PROOF_REQUEST_SPEC_V1
BODY_TITLE_KEYS = {"q", "query", "search", "title", "keyword", "story", "name"}
BODY_SEASON_KEYS = {"s", "season", "season_number", "seasonid", "season_id"}
BODY_EPISODE_KEYS = {"e", "ep", "episode", "episode_number", "episodeid", "episode_id"}
BODY_MEDIA_KEYS = {"type", "mediatype", "media_type", "media", "category", "kind"}
BODY_TMDB_KEYS = {"id", "tmdb", "tmdbid", "tmdb_id", "movie", "tv"}
BODY_YEAR_KEYS = {"year", "releaseyear", "release_year"}


# PROVIDER_ROUTE_PROOF_COMPOSITE_REQUEST_TEMPLATE_V21_8
def _request_dotted_title(raw: object) -> str:
    return re.sub(r"\s+", ".", str(raw or "").strip())


def _request_compact_identity(raw: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", canonical(raw))


def _request_composite_placeholder(
    key: object,
    raw_value: object,
    fixture: dict[str, Any],
) -> str | None:
    """Abstract only exact fixture-owned composite search scalars."""
    if canonical(key) not in BODY_TITLE_KEYS:
        return None
    value = str(raw_value if raw_value is not None else "").strip()
    title = str(fixture.get("title") or "").strip()
    if not value or not title:
        return None
    dotted = _request_dotted_title(title)
    year = str(fixture.get("year") or "").strip()
    season = str(fixture.get("season") or "").strip()
    episode = str(fixture.get("episode") or "").strip()

    if year and canonical(value) == canonical(f"{dotted}.{year}"):
        return "{queryDots}.{year}"
    if season and episode:
        try:
            episodic = f"{dotted}.S{int(season):02d}E{int(episode):02d}"
        except (TypeError, ValueError):
            episodic = ""
        if episodic and canonical(value) == canonical(episodic):
            return "{queryDots}.S{season2}E{episode2}"
    if dotted != title and canonical(value) == canonical(dotted):
        return "{queryDots}"
    return None


def _request_composite_related_to_fixture(
    key: object,
    raw_value: object,
    fixture: dict[str, Any],
) -> bool:
    """Fail closed on near-miss composite identity instead of freezing it."""
    if canonical(key) not in BODY_TITLE_KEYS:
        return False
    title = _request_compact_identity(fixture.get("title"))
    value = _request_compact_identity(raw_value)
    return bool(len(title) >= 4 and title in value)


def _request_scalar_placeholder(
    key: object,
    raw_value: object,
    fixture: dict[str, Any],
    provider_values: set[str],
) -> str | None:
    value = str(raw_value if raw_value is not None else "").strip()
    key_l = canonical(key)
    if not value:
        return None
    tmdb = str(fixture.get("tmdbId") or "").strip()
    season = str(fixture.get("season") or "").strip()
    episode = str(fixture.get("episode") or "").strip()
    year = str(fixture.get("year") or "").strip()
    titles = {canonical(fixture.get("title"))}
    titles.update(canonical(v) for v in fixture.get("aliases") or [])
    titles.discard("")
    media = canonical(fixture.get("mediaType") or fixture.get("type") or fixture.get("category"))

    if tmdb and value == tmdb and key_l in BODY_TMDB_KEYS:
        return "{tmdbId}"
    if season and value == season and key_l in BODY_SEASON_KEYS:
        return "{season}"
    if episode and value == episode and key_l in BODY_EPISODE_KEYS:
        return "{episode}"
    if canonical(value) in titles and key_l in BODY_TITLE_KEYS:
        return "{query}"
    if value in provider_values and key_l in PROVIDER_VALUE_KEYS:
        return "{id}"
    if media in SEMANTIC_TYPES and canonical(value) in {media, "series" if media == "tv" else media} and key_l in BODY_MEDIA_KEYS:
        return "{media}"
    if year and value == year and key_l in BODY_YEAR_KEYS:
        return "{year}"
    return None


# PROVIDER_ROUTE_PROOF_TEXT_BODY_V9
def _text_body_template(
    raw: object,
    fixture: dict[str, Any],
    provider_values: set[str],
) -> tuple[str | None, list[dict[str, str]], list[dict[str, str]]]:
    text = str(raw if raw is not None else "")
    if not text or len(text) > 1024 or "<redacted>" in text:
        return None, [], [{"location": "body:$text", "value": "unsafe-or-empty"}]

    template = text
    substitutions: list[dict[str, str]] = []
    residue: list[dict[str, str]] = []

    # Long/meaningful fixture values first so replacements cannot be fragmented.
    candidates: list[tuple[str, str]] = []
    titles = [fixture.get("title"), *(fixture.get("aliases") or [])]
    for value in titles:
        literal = str(value or "").strip()
        if len(literal) >= 2:
            candidates.append((literal, "{query}"))
    tmdb = str(fixture.get("tmdbId") or "").strip()
    if len(tmdb) >= 3:
        candidates.append((tmdb, "{tmdbId}"))
    year = str(fixture.get("year") or "").strip()
    if len(year) == 4:
        candidates.append((year, "{year}"))
    media = str(fixture.get("mediaType") or fixture.get("type") or fixture.get("category") or "").strip()
    if len(media) >= 2:
        candidates.append((media, "{media}"))
    for value in provider_values:
        literal = str(value or "").strip()
        if len(literal) >= 2:
            candidates.append((literal, "{id}"))

    # Exact literals are evidence from the fixture/provider response. Replace
    # longer values first and record every proof-backed abstraction.
    for literal, placeholder in sorted(set(candidates), key=lambda row: len(row[0]), reverse=True):
        if literal and literal in template:
            template = template.replace(literal, placeholder)
            substitutions.append({
                "location": "body:$text",
                "value": literal[:160],
                "placeholder": placeholder,
            })

    # Single-digit season/episode values are too ambiguous to replace globally.
    # Support them only when the text explicitly labels the field.
    labelled = [
        ("season", str(fixture.get("season") or "").strip(), "{season}"),
        ("episode", str(fixture.get("episode") or "").strip(), "{episode}"),
    ]
    import re as _re
    for label, literal, placeholder in labelled:
        if not literal:
            continue
        pattern = _re.compile(rf"(?i)(\b{label}\b\s*[:=]\s*){_re.escape(literal)}\b")
        if pattern.search(template):
            template = pattern.sub(lambda match: match.group(1) + placeholder, template)
            substitutions.append({
                "location": "body:$text",
                "value": literal,
                "placeholder": placeholder,
            })

    # A text body is never executable as unexplained static data. At least one
    # proof-backed substitution is required.
    if not substitutions:
        return None, [], [{"location": "body:$text", "value": "no-proof-backed-substitution"}]

    # Fail closed if meaningful fixture/provider values remain after abstraction.
    residue_tokens = [
        str(fixture.get("tmdbId") or "").strip(),
        str(fixture.get("title") or "").strip(),
        str(fixture.get("year") or "").strip(),
        *[str(value) for value in provider_values],
    ]
    for token in residue_tokens:
        if len(token) >= 3 and token in template:
            residue.append({"location": "body:$text", "value": token[:160]})
    if residue:
        return None, substitutions, residue
    return template, substitutions, []


# PROVIDER_RESPONSE_VALUE_CORRELATION_V20_3

# PROVIDER_RESPONSE_VALUE_CORRELATION_V20_4
def _urlencoded_search_query_template(
    key: object,
    raw_value: object,
    fixture: dict[str, Any],
) -> str | None:
    """Recognize a bounded title + season search expression without provider rules."""
    if canonical(key) not in BODY_TITLE_KEYS:
        return None
    value = str(raw_value if raw_value is not None else "").strip()
    season = str(fixture.get("season") or "").strip()
    if not value or not season or not season.isdigit():
        return None
    titles = unique([fixture.get("title"), *(fixture.get("aliases") or [])], 24)
    for raw_title in titles:
        title = str(raw_title or "").strip()
        if not title:
            continue
        pattern = re.compile(
            r"^" + re.escape(title) + r"\s*(?:[-–—:]\s*)?"
            r"(saison|season|s)\s*0*" + re.escape(season) + r"$",
            re.I,
        )
        match = pattern.match(value)
        if match:
            keyword = match.group(1)
            return "{query} " + keyword + " {season}"
    return None


def _composite_provider_path_segment_template(
    decoded: object,
    fixture: dict[str, Any],
    provider_values: set[str],
    provider_slugs: set[str],
) -> str | None:
    """Abstract only bounded episode-shaped path segments backed by current DATA.

    The runtime already owns ``{slug}``, ``{season}``, and ``{episode}``.
    This helper deliberately does not generalize arbitrary mixed path strings.
    """
    value = str(decoded or "").strip()
    season = str(fixture.get("season") or "").strip()
    episode = str(fixture.get("episode") or "").strip()
    if not value or not season or not episode or not season.isdigit() or not episode.isdigit():
        return None

    lower = value.casefold()
    trusted_slugs = []
    for slug in [*sorted(provider_slugs, key=len, reverse=True), *_slug_candidates(fixture)]:
        slug_text = str(slug or "").strip().casefold()
        if slug_text and slug_text not in trusted_slugs:
            trusted_slugs.append(slug_text)

    templates = (
        ("-{season}-episode-{episode}", "-{season}-episode-{episode}"),
        ("-saison-{season}-episode-{episode}", "-saison-{season}-episode-{episode}"),
        ("-season-{season}-episode-{episode}", "-season-{season}-episode-{episode}"),
    )
    for slug in trusted_slugs:
        for observed_suffix, template_suffix in templates:
            observed = slug + observed_suffix.format(season=season, episode=episode)
            if lower == observed:
                return "{slug}" + template_suffix

    for provider_id in sorted((str(v) for v in provider_values if v), key=len, reverse=True):
        pid = provider_id.casefold()
        for observed_suffix, template_suffix in templates:
            observed = pid + observed_suffix.format(season=season, episode=episode)
            if lower == observed:
                return "{id}" + template_suffix
    return None


def _urlencoded_text_body_spec(
    raw: object,
    fixture: dict[str, Any],
    provider_values: set[str],
) -> tuple[dict[str, Any] | None, list[dict[str, str]], list[dict[str, str]]]:
    """Abstract a bounded x-www-form-urlencoded raw body as ordinary form DATA."""
    text = str(raw if raw is not None else "")
    if not text or len(text) > 1024 or "<redacted>" in text:
        return None, [], [{"location": "body:$text", "value": "unsafe-or-empty"}]
    try:
        pairs = urllib.parse.parse_qsl(text, keep_blank_values=True, strict_parsing=False)
    except (TypeError, ValueError):
        return None, [], [{"location": "body:$text", "value": "invalid-urlencoded-form"}]
    if not pairs or len(pairs) > 32:
        return None, [], [{"location": "body:$text", "value": "invalid-urlencoded-form"}]

    body: dict[str, Any] = {}
    substitutions: list[dict[str, str]] = []
    residue: list[dict[str, str]] = []
    # V20.4: semantic season/episode/year values are dynamic only on their
    # own semantic keys. Do not classify unrelated tiny literals (for example a
    # pagination constant) as fixture residue merely because they equal "1".
    fixture_tokens = [
        str(token)
        for token in unique([
            fixture.get("tmdbId"), fixture.get("title"), *(fixture.get("aliases") or []),
            *provider_values,
        ], 32)
        if len(str(token or "").strip()) >= 4
    ]

    for raw_key, raw_value in pairs:
        key = str(raw_key or "").strip()
        value = str(raw_value if raw_value is not None else "")
        if not key or len(key) > 96 or len(value) > 512:
            residue.append({"location": "body:$text", "value": "invalid-urlencoded-field"})
            continue
        placeholder = _request_scalar_placeholder(key, value, fixture, provider_values)
        if not placeholder:
            placeholder = _urlencoded_search_query_template(key, value, fixture)
        if placeholder:
            body[key] = placeholder
            substitutions.append({
                "location": f"body:{key}",
                "value": value[:160],
                "placeholder": placeholder,
            })
            continue
        if any(token and str(token) in value for token in fixture_tokens):
            residue.append({"location": f"body:{key}", "value": value[:160]})
            continue
        body[key] = value

    # A raw body gains execution authority only when at least one value was
    # correlated to current fixture/provider DATA. Static opaque POST bodies stay
    # diagnostic-only exactly as in V9.
    if not substitutions:
        residue.append({"location": "body:$text", "value": "no-proof-backed-substitution"})
    if residue:
        return None, substitutions, residue[:20]
    return body, substitutions, []


def derive_request_spec(
    fetch: dict[str, Any],
    task: dict[str, Any],
    prior_value_hints: Iterable[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    fixture = task.get("fixture") if isinstance(task.get("fixture"), dict) else {}
    provider_values = _provider_hint_values(prior_value_hints)
    method = str(fetch.get("method") or "GET").upper()
    body_kind = canonical(fetch.get("body_kind") or "none")
    raw_body = fetch.get("body_values") if isinstance(fetch.get("body_values"), dict) else {}
    raw_headers = fetch.get("proof_headers") if isinstance(fetch.get("proof_headers"), dict) else {}
    body: dict[str, Any] = {}
    headers: dict[str, str] = {}
    residue: list[dict[str, str]] = []
    substitutions: list[dict[str, str]] = []

    sensitive_marker = "<redacted>"
    # V20.4: semantic season/episode/year values are dynamic only on their
    # own semantic keys. Do not classify unrelated tiny literals (for example a
    # pagination constant) as fixture residue merely because they equal "1".
    fixture_tokens = [
        str(token)
        for token in unique([
            fixture.get("tmdbId"), fixture.get("title"), *(fixture.get("aliases") or []),
            *provider_values,
        ], 32)
        if len(str(token or "").strip()) >= 4
    ]

    # PROVIDER_ROUTE_PROOF_TEXT_BODY_RESIDUE_V9_1
    for key, raw in raw_body.items():
        if body_kind == "text" and str(key) == "$text":
            continue
        value = str(raw if raw is not None else "")
        if value == sensitive_marker:
            residue.append({"location": f"body:{key}", "value": sensitive_marker})
            continue
        placeholder = _request_scalar_placeholder(key, raw, fixture, provider_values)
        if not placeholder:
            placeholder = _request_composite_placeholder(key, raw, fixture)
        if not placeholder:
            placeholder = _urlencoded_search_query_template(key, raw, fixture)
        if placeholder:
            body[str(key)] = placeholder
            substitutions.append({"location": f"body:{key}", "value": value, "placeholder": placeholder})
            continue
        if _request_composite_related_to_fixture(key, raw, fixture):
            residue.append({"location": f"body:{key}", "value": value[:160]})
            continue
        if any(token and str(token) in value for token in fixture_tokens):
            residue.append({"location": f"body:{key}", "value": value[:160]})
            continue
        body[str(key)] = raw

    # ROUTE_PROOF_DATAFLOW_SAFETY_V2
    # Headers are not semantic identity fields. In particular a fixture season
    # such as 3 must never rewrite a literal User-Agent like NiakVIO/3.
    # Preserve known static request headers literally. For arbitrary headers,
    # fail closed when a meaningful fixture/provider token is embedded rather
    # than freezing a fixture-specific value into executable DATA.
    static_header_keys = {"accept", "accept-language", "user-agent", "content-type"}
    header_dynamic_tokens = unique([
        fixture.get("tmdbId"), fixture.get("title"), fixture.get("year"),
        *provider_values,
    ], 32)
    header_dynamic_tokens = [str(token) for token in header_dynamic_tokens if len(str(token)) >= 4]
    for key, raw in raw_headers.items():
        value = str(raw or "")
        key_l = canonical(key)
        if value == sensitive_marker:
            residue.append({"location": f"header:{key}", "value": sensitive_marker})
            continue
        if key_l not in static_header_keys and any(token in value for token in header_dynamic_tokens):
            residue.append({"location": f"header:{key}", "value": value[:160]})
            continue
        headers[str(key)] = value

    reusable = not residue
    spec: dict[str, Any] = {"method": method}
    if headers:
        spec["headers"] = headers
    if body_kind in {"json", "form"}:
        if raw_body and not body:
            reusable = False
        spec["bodyKind"] = body_kind
        spec["body"] = body
    elif body_kind == "text":
        # V20.3: the worker can only know that a JS string body is text. The
        # Content-Type proves when that text is actually URL-encoded form data.
        content_type = next((
            str(value or "").strip().casefold()
            for key, value in raw_headers.items()
            if canonical(key) == "content-type"
        ), "")
        if "application/x-www-form-urlencoded" in content_type:
            form_body, form_substitutions, form_residue = _urlencoded_text_body_spec(
                raw_body.get("$text"), fixture, provider_values
            )
            substitutions.extend(form_substitutions)
            residue.extend(form_residue)
            reusable = reusable and form_body is not None and not form_residue
            if form_body is not None:
                spec["bodyKind"] = "form"
                spec["body"] = form_body
        else:
            text_template, text_substitutions, text_residue = _text_body_template(
                raw_body.get("$text"), fixture, provider_values
            )
            substitutions.extend(text_substitutions)
            residue.extend(text_residue)
            reusable = reusable and text_template is not None and not text_residue
            if text_template is not None:
                spec["bodyKind"] = "text"
                spec["body"] = text_template
    elif body_kind not in {"none", "empty", ""}:
        reusable = False

    return (spec if reusable else None), {
        "requestSpecReusable": reusable,
        "requestSpecSubstitutions": substitutions,
        "requestSpecResidue": residue[:20],
    }


def derive_observed_route(
    fetch: dict[str, Any],
    task: dict[str, Any],
    prior_value_hints: Iterable[dict[str, Any]] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    """Derive one reusable route only from this observed provider HTTP call."""
    raw = str(fetch.get("final_url") or fetch.get("url") or "")
    fixture = task.get("fixture") if isinstance(task.get("fixture"), dict) else {}
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return None, {"reason": "invalid-url", "observedUrl": raw, "reusable": False}
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None, {"reason": "invalid-origin", "observedUrl": raw, "reusable": False}

    path = parsed.path or "/"
    substitutions: list[dict[str, str]] = []
    reusable = True
    provider_values = _provider_hint_values(prior_value_hints)
    provider_slugs = _provider_hint_values_for_keys(prior_value_hints, {"slug"})
    imdb_values = _external_identity_hint_values(prior_value_hints)

    tmdb = str(fixture.get("tmdbId") or "").strip()
    season = str(fixture.get("season") or "").strip()
    episode = str(fixture.get("episode") or "").strip()
    title_values = {canonical(fixture.get("title"))}
    title_values.update(canonical(v) for v in fixture.get("aliases") or [])
    title_values.discard("")

    parts = path.split("/")
    for index, part in enumerate(parts):
        decoded = urllib.parse.unquote(part)
        placeholder = None
        if tmdb and decoded == tmdb:
            placeholder = "{tmdbId}"
        elif decoded in imdb_values:
            placeholder = "{imdbId}"
        elif decoded in provider_slugs:
            placeholder = "{slug}"
        elif decoded in provider_values:
            placeholder = "{id}"
        else:
            for slug in _slug_candidates(fixture):
                if canonical(decoded) == canonical(slug):
                    placeholder = "{slug}"
                    break
            if not placeholder:
                placeholder = _composite_provider_path_segment_template(
                    decoded, fixture, provider_values, provider_slugs
                )
        if placeholder:
            substitutions.append({"value": decoded, "placeholder": placeholder, "location": "path"})
            parts[index] = placeholder
    path = "/".join(parts)

    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    rendered_query: list[tuple[str, str]] = []
    dynamic_query_residue: list[dict[str, str]] = []
    for key, value in query:
        key_l = canonical(key)
        replacement = value
        placeholder = None
        if tmdb and value == tmdb and key_l in {"id", "tmdb", "tmdbid", "tmdb_id", "movie", "tv"}:
            placeholder = "{tmdbId}"
        elif season and value == season and key_l in {"s", "season", "season_number", "seasonid", "season_id"}:
            placeholder = "{season}"
        elif episode and value == episode and key_l in {"e", "ep", "episode", "episode_number", "episodeid", "episode_id"}:
            placeholder = "{episode}"
        elif canonical(value) in title_values and key_l in {"q", "query", "search", "title", "keyword", "story", "s"}:
            placeholder = "{query}"
        # PROVIDER_ROUTE_PROOF_CAUSAL_EXTERNAL_HINT_V11_1
        # Search endpoints may legitimately consume an IMDb identity resolved by
        # an earlier metadata request (for example q=tt...). Exact value equality
        # is still required; the query key alone never creates identity authority.
        elif value in imdb_values and key_l in (
            EXTERNAL_IDENTITY_HINT_KEYS | PROVIDER_VALUE_KEYS |
            {"q", "query", "search", "keyword"}
        ):
            placeholder = "{imdbId}"
        elif value in provider_values and key_l not in VOLATILE_QUERY_KEYS | CONTENT_IDENTITY_QUERY_KEYS:
            placeholder = "{slug}" if value in provider_slugs else "{id}"
        if placeholder:
            replacement = placeholder
            substitutions.append({"value": value, "placeholder": placeholder, "location": f"query:{key}"})
        elif value and key_l in VOLATILE_QUERY_KEYS | CONTENT_IDENTITY_QUERY_KEYS:
            dynamic_query_residue.append({"key": key, "value": value})
        rendered_query.append((key, replacement))
    if dynamic_query_residue:
        reusable = False

    route = path
    if rendered_query:
        route += "?" + urllib.parse.urlencode(rendered_query, doseq=True, safe="{}:/")

    fixture_specific: list[str] = []
    if tmdb and tmdb in route:
        fixture_specific.append(tmdb)
    try:
        residue_parts = urllib.parse.urlsplit(route)
        haystacks = [urllib.parse.unquote(residue_parts.path or "/").casefold()]
        semantic_keys = {"type", "mediatype", "media_type", "media", "category", "kind"}
        for residue_key, residue_value in urllib.parse.parse_qsl(residue_parts.query, keep_blank_values=True):
            if canonical(residue_key) in semantic_keys and canonical(residue_value) in SEMANTIC_TYPES:
                continue
            haystacks.append(urllib.parse.unquote(residue_value).casefold())
    except ValueError:
        haystacks = [urllib.parse.unquote(route).casefold()]
    for raw_title in title_values:
        if raw_title and len(raw_title) >= 4 and any(raw_title in haystack for haystack in haystacks):
            fixture_specific.append(raw_title)
    if fixture_specific:
        reusable = False

    # Literal provider-internal numeric/opaque path values are not generalized
    # unless the prior response trace proved their origin.
    unresolved_segments = [
        segment for segment in urllib.parse.urlsplit(route).path.split("/")
        if segment and "{" not in segment and re.fullmatch(r"[A-Za-z0-9._~-]{2,}", segment)
    ]
    # Fixed route words are fine; only values that look like opaque IDs need proof.
    opaque = [segment for segment in unresolved_segments if re.fullmatch(r"\d{2,}|tt\d{7,10}|[A-Fa-f0-9]{12,}|[A-Za-z0-9_-]{18,}", segment, re.I)]
    if opaque:
        reusable = False

    request_spec, request_meta = derive_request_spec(fetch, task, prior_value_hints)
    meta = {
        "origin": f"{parsed.scheme}://{parsed.netloc}",
        "observedUrl": raw,
        "substitutions": substitutions,
        "providerValueCorrelation": bool(
            provider_values and any(
                "{id}" in str(row.get("placeholder") or "")
                or "{slug}" in str(row.get("placeholder") or "")
                for row in substitutions
            )
        ),
        "externalIdentityCorrelation": bool(imdb_values and any(row.get("placeholder") == "{imdbId}" for row in substitutions)),
        "reusable": reusable,
        "fixtureSpecificValues": unique(fixture_specific, 12),
        "dynamicQueryResidue": dynamic_query_residue[:12],
        "unresolvedOpaqueSegments": opaque[:12],
        "requestSpec": request_spec,
        **request_meta,
    }
    return (route if reusable else None), meta


def derive_task_routes(task: dict[str, Any]) -> list[dict[str, Any]]:
    """Derive routes in request order so response values can feed later requests."""
    hints: list[dict[str, str]] = []
    out: list[dict[str, Any]] = []
    for index, fetch in enumerate(task.get("fetches") or []):
        if not isinstance(fetch, dict):
            continue
        # PROVIDER_ROUTE_PROOF_CAUSAL_EXTERNAL_HINT_V11_1
        # Hint-only rows preserve metadata response ordering but never produce a
        # provider route. This prevents a later response from proving an earlier
        # request while allowing TMDB->IMDb->provider chains to remain causal.
        if fetch.get("proof_hint_only") is True:
            hints.extend(response_value_hints(fetch))
            if len(hints) > 240:
                hints = hints[-240:]
            continue
        route, derivation = derive_observed_route(fetch, task, hints)
        out.append({"index": index, "fetch": fetch, "route": route, "derivation": derivation})
        hints.extend(response_value_hints(fetch))
        if len(hints) > 240:
            hints = hints[-240:]
    return out
