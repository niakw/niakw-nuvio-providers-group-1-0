#!/usr/bin/env python3
"""Recover Provider v3 executable routes from real upstream/runtime HTTP traces.

Authority order:
1. exact historical upstream Provider JS referenced by upstream-lkg.json, when the
   recorded SHA-256 can be recovered from current bytes or upstream Git history;
2. current provider file from the mapped upstream repository;
3. current NiakVIO Provider JS only for providers with no mapped historical upstream.

Static source strings are never promoted directly.  Every executable route must be
observed while the provider runs, generalized only through provider_route_proof.py,
and have a successful provider HTTP response in the same trace.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import copy
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from provider_route_proof import derive_task_routes, route_role, unique

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
PARITY = ROOT / "automation" / "provider-upstream-parity.json"
LKG = ROOT / "upstream-lkg.json"
UPSTREAMS = ROOT / "engine_v2" / "config" / "provider-upstreams.json"
WORKER = ROOT / "scripts" / "provider_worker.cjs"
OUT = ROOT / "automation" / "provider-route-recovery-v5.json"
KNOWLEDGE = ROOT / "automation" / "provider-v3-static-knowledge.json"
OVERRIDES = ROOT / "provider-overrides.json"
EXPECTED = 96
PROOF_VERSION = 5

FIXTURES: dict[str, list[dict[str, Any]]] = {
    "movie": [{"slug": "interstellar", "tmdbId": "157336", "mediaType": "movie", "title": "Interstellar", "year": 2014}],
    "tv": [
        {"slug": "breaking-bad-s01e01", "tmdbId": "1396", "mediaType": "tv", "title": "Breaking Bad", "year": 2008, "season": 1, "episode": 1},
        {"slug": "house-of-the-dragon-s03e01", "tmdbId": "94997", "mediaType": "tv", "title": "House of the Dragon", "year": 2022, "season": 3, "episode": 1},
    ],
    "anime": [{"slug": "jujutsu-kaisen-s01e01", "tmdbId": "95479", "mediaType": "anime", "category": "anime", "title": "Jujutsu Kaisen", "year": 2020, "season": 1, "episode": 1}],
}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: object required")
    return value


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request(url: str, timeout: int = 25) -> urllib.request.Request:
    headers = {"User-Agent": "NiakVIO-Route-Recovery/5"}
    token = str(os.environ.get("GITHUB_TOKEN") or "").strip()
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    return urllib.request.Request(url, headers=headers)


def get_bytes(url: str, timeout: int = 25, limit: int = 16 * 1024 * 1024) -> bytes:
    with urllib.request.urlopen(request(url, timeout), timeout=timeout) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"response too large: {url}")
    return data


def get_json(url: str, timeout: int = 25) -> Any:
    return json.loads(get_bytes(url, timeout=timeout, limit=8 * 1024 * 1024).decode("utf-8"))


def parse_raw_url(url: str) -> tuple[str, str, str] | None:
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    if parsed.hostname != "raw.githubusercontent.com":
        return None
    parts = [urllib.parse.unquote(v) for v in parsed.path.split("/") if v]
    if len(parts) < 4:
        return None
    owner, repo = parts[0], parts[1]
    if parts[2] == "refs" and len(parts) >= 6 and parts[3] == "heads":
        path = "/".join(parts[5:])
    else:
        path = "/".join(parts[3:])
    return f"{owner}/{repo}", path, parts[2]


def historical_exact_bytes(row: dict[str, Any], captured_at: str) -> tuple[bytes | None, dict[str, Any]]:
    url = str(row.get("provider_url") or "").strip()
    wanted = str(row.get("sha256") or "").strip().casefold()
    evidence: dict[str, Any] = {"providerUrl": url, "wantedSha256": wanted, "capturedAt": captured_at}
    if not url or not wanted:
        evidence["mode"] = "missing-lkg-pointer"
        return None, evidence
    try:
        current = get_bytes(url)
        current_sha = sha256(current)
        evidence["currentSha256"] = current_sha
        if current_sha == wanted:
            evidence["mode"] = "lkg-current-byte-exact"
            return current, evidence
    except Exception as exc:
        evidence["currentError"] = type(exc).__name__

    parsed = parse_raw_url(url)
    if not parsed:
        evidence["mode"] = "lkg-url-unparseable"
        return None, evidence
    repo, path, _ref = parsed
    query = urllib.parse.urlencode({"path": path, "until": captured_at, "per_page": 30})
    commits_url = f"https://api.github.com/repos/{repo}/commits?{query}"
    try:
        commits = get_json(commits_url)
    except Exception as exc:
        evidence["historyError"] = type(exc).__name__
        evidence["mode"] = "lkg-history-unavailable"
        return None, evidence
    if not isinstance(commits, list):
        evidence["mode"] = "lkg-history-invalid"
        return None, evidence
    for item in commits[:30]:
        commit_sha = str(item.get("sha") or "") if isinstance(item, dict) else ""
        if not commit_sha:
            continue
        raw = f"https://raw.githubusercontent.com/{repo}/{commit_sha}/{path}"
        try:
            data = get_bytes(raw)
        except Exception:
            continue
        if sha256(data) == wanted:
            evidence["mode"] = "lkg-history-byte-exact"
            evidence["commit"] = commit_sha
            return data, evidence
    evidence["mode"] = "lkg-exact-byte-not-found"
    return None, evidence


def source_config() -> dict[str, dict[str, Any]]:
    raw = load(UPSTREAMS)
    rows = raw.get("upstreams") if isinstance(raw.get("upstreams"), list) else []
    return {str(row.get("id") or ""): row for row in rows if isinstance(row, dict) and row.get("id")}


def current_upstream_catalog(config: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for source_id, cfg in config.items():
        repos = [str(cfg.get("repository") or "").strip(), str(cfg.get("fallback_repository") or "").strip()]
        branch = str(cfg.get("branch") or "main")
        manifest_path = str(cfg.get("manifest") or "manifest.json")
        for repo in [v for v in repos if v]:
            raw_url = f"https://raw.githubusercontent.com/{repo}/{branch}/{manifest_path}"
            try:
                manifest = get_json(raw_url)
            except Exception:
                continue
            if isinstance(manifest, dict):
                rows = manifest.get("scrapers") or manifest.get("providers") or []
            elif isinstance(manifest, list):
                rows = manifest
            else:
                rows = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                provider_id = cid(row.get("id"))
                filename = str(row.get("filename") or "").strip()
                if not provider_id or not filename or provider_id in out:
                    continue
                out[provider_id] = {
                    "source": source_id,
                    "repo": repo,
                    "url": f"https://raw.githubusercontent.com/{repo}/{branch}/{filename.lstrip('/')}",
                    "entry": row,
                }
            if any(value.get("source") == source_id for value in out.values()):
                break
    return out


def lkg_rows() -> dict[tuple[str, str], list[tuple[str, dict[str, Any]]]]:
    value = load(LKG)
    sources = value.get("sources") if isinstance(value.get("sources"), dict) else {}
    out: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    for source_id, source in sources.items():
        if not isinstance(source, dict):
            continue
        for generation in source.get("generations") or []:
            if not isinstance(generation, dict):
                continue
            captured = str(generation.get("captured_at") or "")
            providers = generation.get("providers") if isinstance(generation.get("providers"), dict) else {}
            for provider_id, row in providers.items():
                if isinstance(row, dict):
                    out[(str(source_id), cid(provider_id))].append((captured, row))
    for key in out:
        out[key].sort(key=lambda item: item[0], reverse=True)
    return out


def manifest_catalog() -> dict[str, dict[str, Any]]:
    value = load(MANIFEST)
    out = {}
    for row in value.get("scrapers") or []:
        if not isinstance(row, dict):
            continue
        provider_id = cid(row.get("id"))
        filename = str(row.get("filename") or "")
        if provider_id and filename:
            out[provider_id] = {"entry": row, "path": ROOT / filename}
    return out


def semantic_types(row: dict[str, Any]) -> list[str]:
    values = row.get("canonicalSupportedTypes") or row.get("supportedTypes") or []
    out = []
    for raw in values if isinstance(values, list) else []:
        value = str(raw or "").strip().casefold()
        if value == "series":
            value = "tv"
        if value in FIXTURES and value not in out:
            out.append(value)
    return out or ["movie"]


def worker_fixture(fixture: dict[str, Any], upstream: bool) -> dict[str, Any]:
    value = copy.deepcopy(fixture)
    if upstream and value.get("mediaType") == "anime":
        value["mediaType"] = "tv"
        value["type"] = "tv"
        value.pop("category", None)
    return value


def context_for(fixture: dict[str, Any]) -> dict[str, Any]:
    is_anime = fixture.get("mediaType") == "anime" or fixture.get("category") == "anime"
    metadata = {
        "id": int(fixture["tmdbId"]),
        "title": fixture.get("title"),
        "name": fixture.get("title"),
        "original_title": fixture.get("title"),
        "original_name": fixture.get("title"),
        "release_date": f"{fixture.get('year')}-01-01" if fixture.get("year") else "",
        "first_air_date": f"{fixture.get('year')}-01-01" if fixture.get("year") else "",
        "year": fixture.get("year"),
        "aliases": [fixture.get("title")],
        "original_language": "ja" if is_anime else "en",
        "origin_country": ["JP"] if is_anime else ["US"],
        "genres": [{"id": 16, "name": "Animation"}] if is_anime else [],
        "anime": bool(is_anime),
    }
    return {
        "platform": "android",
        "locale": "fr-FR",
        "languages": ["fr-FR", "fr", "en-US", "en"],
        "fixtureMetadata": metadata,
        "maxSettingsProfiles": 5,
        "singleProfileZeroStreamPreflight": False,
        "routeProofTrace": True,
        "networkLimits": {
            "maxFetches": 40,
            "maxDistinctHosts": 16,
            "maxResponseBytes": 4 * 1024 * 1024,
            "maxTotalResponseBytes": 20 * 1024 * 1024,
            "maxRedirects": 5,
        },
    }


def run_worker(path: Path, semantic_fixture: dict[str, Any], *, upstream: bool, timeout: int) -> dict[str, Any]:
    actual_fixture = worker_fixture(semantic_fixture, upstream)
    cmd = [
        "node", str(WORKER), str(path),
        json.dumps(actual_fixture, ensure_ascii=False, separators=(",", ":")),
        json.dumps(context_for(semantic_fixture), ensure_ascii=False, separators=(",", ":")),
    ]
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout, check=False, env=os.environ.copy())
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "network": [], "streams": 0}
    result = None
    for line in proc.stdout.splitlines():
        if line.startswith("NUVIO_HEALTH_RESULT="):
            try:
                result = json.loads(line.split("=", 1)[1])
            except json.JSONDecodeError:
                pass
    if not isinstance(result, dict):
        return {"status": "worker_no_result", "network": [], "streams": 0}
    return {
        "status": "ok" if result.get("ok") else "runtime_error",
        "network": [row for row in result.get("network_observations") or [] if isinstance(row, dict)],
        "streams": int(result.get("stream_count") or 0),
        "rawStreams": int(result.get("raw_stream_count") or 0),
        "serverAccessible": bool(result.get("provider_server_accessible")),
        "serverSuccess": bool(result.get("provider_server_successful_response")),
        "error": (result.get("error_details") or {}).get("code") or result.get("error"),
    }


def observation_fetch(row: dict[str, Any]) -> dict[str, Any] | None:
    if row.get("infrastructure"):
        return None
    proof_url = str(row.get("proof_url") or "").strip()
    if not proof_url or row.get("route_proof_trace") is not True:
        return None
    return {
        "url": proof_url,
        "final_url": proof_url,
        "method": str(row.get("method") or "GET").upper(),
        "status": int(row.get("status") or 0),
        "error": row.get("error") or row.get("error_code"),
        "content_type": row.get("content_type"),
        "header_names": sorted((row.get("proof_headers") or {}).keys()),
        "proof_headers": copy.deepcopy(row.get("proof_headers") or {}),
        "body_kind": row.get("proof_body_kind"),
        "body_fields": list(row.get("proof_body_fields") or []),
        "body_values": copy.deepcopy(row.get("proof_body_values") or {}),
        "response_value_hints": copy.deepcopy(row.get("response_value_hints") or []),
        "duration_ms": int(row.get("duration_ms") or 0),
        "invocation": row.get("invocation"),
        "settings_profile": row.get("settings_profile"),
    }


def success(fetch: dict[str, Any]) -> bool:
    status = int(fetch.get("status") or 0)
    return not fetch.get("error") and 200 <= status < 400


def route_record(derived: dict[str, Any], semantic_type: str, fixture_slug: str, source_meta: dict[str, Any]) -> dict[str, Any] | None:
    route = str(derived.get("route") or "").strip()
    fetch = derived.get("fetch") if isinstance(derived.get("fetch"), dict) else {}
    derivation = derived.get("derivation") if isinstance(derived.get("derivation"), dict) else {}
    if not route or not success(fetch):
        return None
    request_spec = derivation.get("requestSpec") if isinstance(derivation.get("requestSpec"), dict) else None
    return {
        "route": route,
        "origin": derivation.get("origin"),
        "role": route_role(route),
        "method": str(fetch.get("method") or "GET").upper(),
        "semanticType": semantic_type,
        "fixture": fixture_slug,
        "requestIndex": int(derived.get("index") or 0),
        "providerValueCorrelation": bool(derivation.get("providerValueCorrelation")),
        "externalIdentityCorrelation": bool(derivation.get("externalIdentityCorrelation")),
        "requestSpec": copy.deepcopy(request_spec),
        "requestSpecReusable": bool(derivation.get("requestSpecReusable")),
        # ROUTE_RECOVERY_RESPONSE_VALUE_DIAGNOSTICS_V20_4
        # proof_body_values is already redacted by the worker for sensitive keys.
        "requestSpecSubstitutions": copy.deepcopy(derivation.get("requestSpecSubstitutions") or []),
        "requestSpecResidue": copy.deepcopy(derivation.get("requestSpecResidue") or []),
        "proofBodyKind": fetch.get("body_kind"),
        "proofBodyValues": copy.deepcopy(fetch.get("body_values") or {}),
        "status": int(fetch.get("status") or 0),
        "contentType": fetch.get("content_type"),
        "proofModelVersion": PROOF_VERSION,
        "source": copy.deepcopy(source_meta),
    }


def request_spec(record: dict[str, Any]) -> dict[str, Any] | None:
    spec = record.get("requestSpec") if isinstance(record.get("requestSpec"), dict) else None
    return copy.deepcopy(spec) if record.get("requestSpecReusable") is True and spec else None


# ROUTE_PROOF_DATAFLOW_SAFETY_V2
_BLANK_DYNAMIC_QUERY_KEYS = {
    "id", "_id", "media_id", "post_id", "content_id", "movie_id", "series_id", "show_id", "slug",
    "k", "key", "token", "access_token", "auth", "signature", "sig", "hash", "nonce", "session", "session_id",
    "season", "season_number", "seasonid", "season_id", "episode", "episode_number", "episodeid", "episode_id",
}


# ROUTE_RECOVERY_STRUCTURED_EXTERNAL_ID_V13
_FLAT_ROUTE_DYNAMIC_TOKENS = (
    "{query}", "{title}", "{slug}", "{id}", "{tmdbId}", "{tmdb_id}",
    "{imdbId}", "{imdb_id}", "{season}", "{episode}",
)


def generic_execution_route(record: dict[str, Any]) -> bool:
    """Whether routes[] may replay this call without losing HTTP/dataflow semantics.

    A flat route is deliberately stricter than an observed HTTP request. It must
    carry a reusable request spec *and* at least one proof-derived dynamic token.
    Static fixture/player/file paths remain routeData evidence only.
    """
    if record.get("requestSpecReusable") is not True:
        return False
    route = str(record.get("route") or "").strip()
    if not route or not any(token.casefold() in route.casefold() for token in _FLAT_ROUTE_DYNAMIC_TOKENS):
        return False
    spec = request_spec(record)
    if not isinstance(spec, dict):
        return False
    if str(spec.get("method") or "GET").upper() != "GET":
        return False
    if spec.get("body"):
        return False
    headers = spec.get("headers") if isinstance(spec.get("headers"), dict) else {}
    nontrivial = {
        str(key).casefold() for key in headers
        if str(key).casefold() not in {"accept", "accept-language", "user-agent"}
    }
    if nontrivial:
        return False
    try:
        query = urllib.parse.parse_qsl(urllib.parse.urlsplit(route).query, keep_blank_values=True)
    except ValueError:
        return False
    if any(str(key).casefold() in _BLANK_DYNAMIC_QUERY_KEYS and value == "" for key, value in query):
        return False
    return True


def _flat_route_blocklist(route_data: list[dict[str, Any]]) -> set[str]:
    """Freshly observed non-flat routes cannot keep an obsolete flat baseline alive."""
    blocked: set[str] = set()
    for row in route_data:
        if not isinstance(row, dict):
            continue
        route = str(row.get("route") or "").strip()
        if route and not generic_execution_route(row):
            blocked.add(route)
    return blocked


def _identity_bearing_runtime_route(value: object) -> bool:
    route = str(value or "").strip().casefold()
    if not route:
        return False
    if any(token in route for token in ("{query}", "{title}", "{slug}", "{id}", "{tmdbid}", "{tmdb_id}", "{imdbid}", "{imdb_id}")):
        return True
    path = urllib.parse.urlsplit(route).path
    return bool(path and (
        path.rstrip("/").endswith("/player")
        or "/search" in path
        or "/recherche" in path
        or "/title/" in path
        or "/movie/" in path
        or "/series/" in path
        or "/tv/" in path
    ))


def select_runtime_routes(
    existing_routes: list[str],
    candidate_routes: list[str],
    execution_routes: list[str],
    blocked_routes: set[str] | None = None,
) -> tuple[list[str], bool]:
    """Prefer fresh executable proof and never preserve freshly disproven flat DATA."""
    blocked = blocked_routes or set()
    execution = unique([route for route in execution_routes if route not in blocked], 192)
    if any(_identity_bearing_runtime_route(route) for route in execution):
        return execution, False
    for baseline in (existing_routes, candidate_routes):
        current = unique([route for route in baseline if route not in blocked], 192)
        if any(_identity_bearing_runtime_route(route) for route in current):
            return current, True
    return execution, False


def as_recipe_route(record: dict[str, Any], base: str | None) -> str:
    route = str(record.get("route") or "")
    origin = str(record.get("origin") or "")
    if base and origin == base:
        return route
    return origin.rstrip("/") + "/" + route.lstrip("/") if origin else route


# ROUTE_RECOVERY_BODY_SEARCH_RECIPE_V6
_REPAIR_RECIPE_NON_EXECUTABLE_HOSTS = {"arm.haglund.dev", "v3-cinemeta.strem.io"}


# ROUTE_RECOVERY_COMPOSITE_SEARCH_TEMPLATE_V21_8
def _record_has_search_query(row: dict[str, Any]) -> bool:
    route = str(row.get("route") or "")
    if any(marker in route for marker in ("{query}", "{queryDots}", "{query_dots}")):
        return True
    spec = request_spec(row)
    if not isinstance(spec, dict):
        return False
    # Request specs are already sanitized/abstracted proof DATA. Searching the
    # serialized structure here only detects the canonical placeholder produced
    # by proof abstraction; it never recovers arbitrary provider code/data.
    serialized = json.dumps(spec, ensure_ascii=False, sort_keys=True)
    return any(marker in serialized for marker in ("{query}", "{queryDots}", "{query_dots}"))


def _repair_recipe_origin_allowed(row: dict[str, Any]) -> bool:
    try:
        host = (urllib.parse.urlsplit(str(row.get("origin") or "")).hostname or "").casefold()
    except ValueError:
        return False
    # Shared metadata helpers may appear in a positive provider task but are not
    # provider stream resolvers. ProviderBase already treats these hosts as
    # non-executable knowledge; recipe synthesis must obey the same boundary.
    return bool(host and host not in _REPAIR_RECIPE_NON_EXECUTABLE_HOSTS)


# ROUTE_RECOVERY_TYPED_POSITIVE_ONLY_V8
def _typed_terminal_positive(row: dict[str, Any]) -> bool:
    return bool(
        (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0)
        and row.get("taskLastRequestIndex") is not None
        and int(row.get("requestIndex") or 0) == int(row.get("taskLastRequestIndex"))
        and row.get("requestSpecReusable") is True
        and row.get("providerValueCorrelation") is not True
    )


def build_simple_api_recipe(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Build only chains representable by the common API recipe engine.

    Complex multi-hop/player chains remain route DATA and require their existing
    source-family/Core Lego; they are never flattened into a fake two-step recipe.
    """
    if not records:
        return None
    by_fixture: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        by_fixture[str(row.get("fixture") or "")].append(row)
    for rows in by_fixture.values():
        rows.sort(key=lambda item: int(item.get("requestIndex") or 0))

    searches = [
        row for row in records
        if row.get("role") in {"search", "detail", "api"}
        and _record_has_search_query(row)
        and _repair_recipe_origin_allowed(row)
    ]
    search = searches[0] if searches else None
    base = str(search.get("origin") or "") if search else ""

    movie_candidates = [
        row for row in records
        if _repair_recipe_origin_allowed(row)
        and row.get("semanticType") == "movie"
        and (search is not None or _typed_terminal_positive(row))
        and row.get("role") in {"detail", "api", "source", "player"}
        and ("{id}" in str(row.get("route")) or "{tmdbId}" in str(row.get("route")))
        and (not base or row.get("origin") == base)
    ]
    episode_candidates = [
        row for row in records
        if _repair_recipe_origin_allowed(row)
        and row.get("semanticType") == "tv"
        and (search is not None or _typed_terminal_positive(row))
        and ("{season}" in str(row.get("route")) or "{episode}" in str(row.get("route")))
        and ("{id}" in str(row.get("route")) or "{tmdbId}" in str(row.get("route")))
        and (not base or row.get("origin") == base)
    ]
    direct_candidates = [
        row for row in records
        if _repair_recipe_origin_allowed(row)
        and search is None and "{tmdbId}" in str(row.get("route"))
        and row.get("role") in {"api", "source", "detail"}
    ]

    recipe: dict[str, Any] = {"proofModelVersion": PROOF_VERSION, "allowGenericFallback": False}
    if base:
        recipe["base"] = base
    if search:
        recipe["searchRoute"] = as_recipe_route(search, base)
        spec = request_spec(search)
        if spec:
            recipe["searchRequest"] = spec
    if movie_candidates:
        movie = sorted(movie_candidates, key=lambda row: int(row.get("requestIndex") or 0))[-1]
        recipe["movieRoute"] = as_recipe_route(movie, base)
        spec = request_spec(movie)
        if spec:
            recipe["movieRequest"] = spec
    if episode_candidates:
        episode = sorted(episode_candidates, key=lambda row: int(row.get("requestIndex") or 0))[-1]
        recipe["episodeRoute"] = as_recipe_route(episode, base)
        spec = request_spec(episode)
        if spec:
            recipe["episodeRequest"] = spec
    if not search and direct_candidates and not (movie_candidates or episode_candidates):
        direct = sorted(direct_candidates, key=lambda row: int(row.get("requestIndex") or 0))[0]
        recipe["base"] = str(direct.get("origin") or "") or recipe.get("base")
        recipe["directRoute"] = as_recipe_route(direct, recipe.get("base"))
        spec = request_spec(direct)
        if spec:
            recipe["directRequest"] = spec

    # ROUTE_RECOVERY_TERMINAL_SEARCH_RECIPE_V6
    # A task can be positive after a search *and* several later detail/player
    # requests. Never attribute the task's final streams to the search merely
    # because it happened earlier. Direct-search replay is valid only when that
    # reusable search request is the final observed provider request in the task.
    if "searchRoute" in recipe and not ({"movieRoute", "episodeRoute"} & recipe.keys()):
        terminal = next((
            row for row in searches
            if (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0)
            and row.get("taskLastRequestIndex") is not None
            and int(row.get("requestIndex") or 0) == int(row.get("taskLastRequestIndex"))
        ), None)
        if terminal is not None:
            recipe.pop("searchRoute", None)
            recipe.pop("searchRequest", None)
            recipe["base"] = str(terminal.get("origin") or "") or recipe.get("base")
            recipe["directRoute"] = as_recipe_route(terminal, recipe.get("base"))
            spec = request_spec(terminal)
            if spec:
                recipe["directRequest"] = spec
            recipe["terminalSearchProof"] = True
    # ROUTE_RECOVERY_TYPED_RESOLVER_API_V7
    def _typed_resolver_terminal(row: dict[str, Any]) -> bool:
        route = str(row.get("route") or "")
        return bool(
            "{tmdbId}" in route
            and "{id}" not in route
            and row.get("providerValueCorrelation") is not True
            and row.get("requestSpecReusable") is True
            and (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0)
            and row.get("taskLastRequestIndex") is not None
            and int(row.get("requestIndex") or 0) == int(row.get("taskLastRequestIndex"))
            and str(row.get("origin") or "").startswith(("http://", "https://"))
        )

    typed_rows: list[dict[str, Any]] = []
    if movie_candidates:
        typed_rows.append(sorted(movie_candidates, key=lambda row: int(row.get("requestIndex") or 0))[-1])
    if episode_candidates:
        typed_rows.append(sorted(episode_candidates, key=lambda row: int(row.get("requestIndex") or 0))[-1])
    if not search and typed_rows and all(_typed_resolver_terminal(row) for row in typed_rows):
        recipe["recipeKind"] = "typed-resolver-api"

    route_keys = {"searchRoute", "movieRoute", "episodeRoute", "directRoute"}
    if not route_keys.intersection(recipe):
        return None
    if "searchRoute" in recipe and not ({"movieRoute", "episodeRoute"} & recipe.keys()):
        return None

    # NIAKVIO_PROVIDER_SOURCE_PLAN_V10
    if "searchRoute" in recipe:
        positive_types = {
            str(row.get("semanticType") or "").strip().casefold()
            for row in records
            if int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0
        }
        covered_types: set[str] = set()
        if recipe.get("movieRoute"):
            covered_types.add("movie")
        if recipe.get("episodeRoute"):
            covered_types.update({"tv", "anime"})
        uncovered = sorted(value for value in positive_types if value and value not in covered_types)
        if uncovered:
            recipe["allowGenericFallback"] = True
            recipe["partialCoverageFallback"] = uncovered
    return recipe


def source_for_provider(
    provider_id: str,
    source_id: str | None,
    lkg: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]],
    current_upstream: dict[str, dict[str, Any]],
    local: dict[str, dict[str, Any]],
    tmp: Path,
) -> tuple[Path, dict[str, Any]]:
    if source_id:
        for captured, row in lkg.get((source_id, provider_id), []):
            data, evidence = historical_exact_bytes(row, captured)
            if data:
                path = tmp / f"{provider_id}--upstream.js"
                path.write_bytes(data)
                return path, {"kind": "upstream", "sourceId": source_id, "sha256": sha256(data), **evidence}
        current = current_upstream.get(provider_id)
        if current and current.get("source") == source_id:
            try:
                data = get_bytes(str(current["url"]))
                path = tmp / f"{provider_id}--upstream-current.js"
                path.write_bytes(data)
                return path, {"kind": "upstream-current", "sourceId": source_id, "url": current["url"], "sha256": sha256(data)}
            except Exception as exc:
                current_error = type(exc).__name__
        else:
            current_error = "not-in-current-manifest"
    else:
        current_error = "no-upstream-mapping"

    local_row = local.get(provider_id)
    if not local_row or not Path(local_row["path"]).is_file():
        raise FileNotFoundError(f"{provider_id}: no recoverable upstream or local Provider JS ({current_error})")
    return Path(local_row["path"]), {
        "kind": "niakvio-native-current",
        "sourceId": None,
        "path": str(local_row["path"].relative_to(ROOT)),
        "sha256": sha256(Path(local_row["path"]).read_bytes()),
        "upstreamFallbackReason": current_error,
    }


# ROUTE_RECOVERY_ADAPTIVE_RETRY_V1
_TRANSIENT_HTTP_STATUSES = {408, 425, 429, 500, 502, 503, 504}
_TRANSIENT_ERROR_TOKENS = (
    "timeout", "timed out", "etimedout", "econnreset", "econnrefused",
    "eai_again", "temporary failure", "socket hang up", "network error",
    "network_exception", "fetch failed", "worker_no_result",
)
_NON_RETRYABLE_ERROR_TOKENS = (
    "module_not_found", "provider module blocked by source policy",
)


def _worker_success_fetch_count(result: dict[str, Any]) -> int:
    total = 0
    for observation in result.get("network") or []:
        fetch = observation_fetch(observation)
        if fetch is not None and success(fetch):
            total += 1
    return total


def _worker_retry_reason(result: dict[str, Any]) -> str:
    if int(result.get("streams") or 0) > 0 or int(result.get("rawStreams") or 0) > 0:
        return ""
    status = str(result.get("status") or "").casefold()
    error = str(result.get("error") or "").casefold()
    combined = status + " " + error
    if any(token in combined for token in _NON_RETRYABLE_ERROR_TOKENS):
        return ""
    if status in {"runtime_error"}:
        return ""
    if status in {"worker_no_result", "timeout", "network_error", "network_exception"}:
        return status
    if any(token in combined for token in _TRANSIENT_ERROR_TOKENS):
        return next(token for token in _TRANSIENT_ERROR_TOKENS if token in combined)
    for observation in result.get("network") or []:
        fetch = observation_fetch(observation)
        if fetch is None:
            continue
        code = int(fetch.get("status") or 0)
        if code in _TRANSIENT_HTTP_STATUSES:
            return f"http-{code}"
        fetch_error = str(fetch.get("error") or "").casefold()
        if any(token in fetch_error for token in _TRANSIENT_ERROR_TOKENS):
            return next(token for token in _TRANSIENT_ERROR_TOKENS if token in fetch_error)
    return ""


def _run_worker_adaptive(
    provider_id: str,
    source_path: Path,
    fixture: dict[str, Any],
    *,
    upstream: bool,
    timeout: int,
    attempts: int,
) -> dict[str, Any]:
    best: dict[str, Any] | None = None
    best_score: tuple[int, int, int, int, int] = (-1, -1, -1, -1, -1)
    used = 0
    for attempt in range(1, max(1, attempts) + 1):
        used = attempt
        try:
            result = run_worker(source_path, fixture, upstream=upstream, timeout=timeout)
        except Exception as exc:
            result = {
                "status": "worker_no_result",
                "error": type(exc).__name__,
                "streams": 0,
                "rawStreams": 0,
                "network": [],
                "serverAccessible": False,
                "serverSuccess": False,
            }
        score = (
            1 if int(result.get("streams") or 0) > 0 else 0,
            int(result.get("rawStreams") or 0),
            1 if result.get("serverSuccess") else 0,
            _worker_success_fetch_count(result),
            len(result.get("network") or []),
        )
        if best is None or score > best_score:
            best = result
            best_score = score
        reason = _worker_retry_reason(result)
        if not reason or attempt >= max(1, attempts):
            break
        print(
            "FIELD_ROUTE_RECOVERY_RETRY "
            f"provider={provider_id} fixture={fixture.get('slug')} "
            f"attempt={attempt + 1}/{max(1, attempts)} reason={reason}",
            flush=True,
        )
    assert best is not None
    best = dict(best)
    best["repairAttempts"] = used
    return best


def recover_one(
    provider_id: str,
    local_row: dict[str, Any],
    source_id: str | None,
    lkg: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]],
    current_upstream: dict[str, dict[str, Any]],
    tmp: Path,
    timeout: int,
    attempts: int,
) -> dict[str, Any]:
    try:
        source_path, source_meta = source_for_provider(provider_id, source_id, lkg, current_upstream, {provider_id: local_row}, tmp)
    except Exception as exc:
        return {"providerId": provider_id, "sourceId": source_id, "status": "source-unavailable", "error": type(exc).__name__, "routes": [], "tasks": []}

    records: list[dict[str, Any]] = []
    tasks_report: list[dict[str, Any]] = []
    for semantic_type in semantic_types(local_row["entry"]):
        for fixture in FIXTURES[semantic_type]:
            result = _run_worker_adaptive(
                provider_id,
                source_path,
                fixture,
                upstream=bool(source_id),
                timeout=timeout,
                attempts=attempts,
            )
            # ROUTE_RECOVERY_CAUSAL_EXTERNAL_HINT_V11_1
            # Preserve the exact network order of infrastructure identity hints,
            # but carry no helper URL/method into provider execution authority.
            fetches: list[dict[str, Any]] = []
            provider_fetch_count = 0
            for network_row in result.get("network") or []:
                if not isinstance(network_row, dict):
                    continue
                value = observation_fetch(network_row)
                if value is not None:
                    fetches.append(value)
                    provider_fetch_count += 1
                    continue
                hints = network_row.get("response_value_hints")
                if network_row.get("infrastructure") and isinstance(hints, list) and hints:
                    fetches.append({
                        "proof_hint_only": True,
                        "response_value_hints": copy.deepcopy(hints[:80]),
                    })
            task = {
                "provider_id": provider_id,
                "semantic_type": semantic_type,
                "fixture_slug": fixture["slug"],
                "fixture": copy.deepcopy(fixture),
                "fetches": fetches,
            }
            derived = derive_task_routes(task)
            task_records = []
            task_last_request_index = max(
                (int(item.get("index") or 0) for item in derived if isinstance(item, dict)),
                default=-1,
            )
            for item in derived:
                record = route_record(item, semantic_type, fixture["slug"], source_meta)
                if record:
                    # Task-level output counts are context, not causal attribution.
                    # The request ordering marker is what allows recipe selection
                    # to prove that a search request was actually terminal.
                    record["taskStreamCount"] = int(result.get("streams") or 0)
                    record["taskRawStreamCount"] = int(result.get("rawStreams") or 0)
                    record["taskLastRequestIndex"] = task_last_request_index
                    records.append(record)
                    task_records.append(record)
            tasks_report.append({
                "fixture": fixture["slug"],
                "semanticType": semantic_type,
                "workerStatus": result.get("status"),
                "streamCount": result.get("streams", 0),
                "rawStreamCount": result.get("rawStreams", 0),
                "serverAccessible": result.get("serverAccessible", False),
                "serverSuccess": result.get("serverSuccess", False),
                "providerRequestCount": provider_fetch_count,
                "provenRouteCount": len(task_records),
                "error": result.get("error"),
            })

    deduped: list[dict[str, Any]] = []
    seen = set()
    for row in records:
        fp = (row.get("origin"), row.get("route"), row.get("method"), row.get("semanticType"), row.get("fixture"))
        if fp in seen:
            continue
        seen.add(fp)
        deduped.append(row)
    routes = unique([row.get("route") for row in deduped], 192)
    # ROUTE_RECOVERY_HELPER_EVIDENCE_ONLY_V11_1
    # TMDB/Cinemeta helper calls may carry critical identity evidence (IMDb, title,
    # aliases), but they are not provider execution routes. Keep them in routeData
    # and proven routes for causality while excluding them from the runtime plan.
    execution_routes = unique([
        row.get("route") for row in deduped
        if _repair_recipe_origin_allowed(row) and generic_execution_route(row)
    ], 192)
    recipe = build_simple_api_recipe([row for row in deduped if row.get("requestSpecReusable") is True])
    return {
        "providerId": provider_id,
        "sourceId": source_id,
        "status": "proven" if routes else "no-proven-route",
        "source": source_meta,
        "routeCount": len(routes),
        "routes": routes,
        "executionRouteCount": len(execution_routes),
        "executionRoutes": execution_routes,
        "routeData": deduped,
        "apiRecipe": recipe,
        "tasks": tasks_report,
    }


def _proof_execution_origin(origin: object, patch: dict[str, Any]) -> str:
    raw = str(origin or "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    host = (parsed.hostname or "").casefold()
    target = ""
    # NIAKVIO_PROVIDER_RUNTIME_DOMAIN_AUTHORITY_V10_1: only explicitly promoted runtime DATA may redirect execution.
    for key in ("runtime_domain_replacements",):
        mapping = patch.get(key)
        if not isinstance(mapping, dict):
            continue
        candidate = str(mapping.get(host) or "").strip()
        if candidate:
            target = candidate
            break
    if target:
        if "://" not in target:
            target = f"{parsed.scheme}://{target}"
        try:
            target_parts = urllib.parse.urlsplit(target)
            if target_parts.hostname:
                netloc = target_parts.netloc
                parsed = parsed._replace(netloc=netloc)
        except ValueError:
            pass
    return urllib.parse.urlunsplit(parsed)


def _positive_proof_search_bases(route_data: list[dict[str, Any]], patch: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for row in route_data:
        if not isinstance(row, dict) or row.get("requestSpecReusable") is not True:
            continue
        if not (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0):
            continue
        if not _repair_recipe_origin_allowed(row):
            continue
        if row.get("role") != "search" and not _record_has_search_query(row):
            continue
        base = _proof_execution_origin(row.get("origin"), patch)
        if base and base not in out:
            out.append(base)
    return out[:6]


# ROUTE_RECOVERY_EXTERNAL_IDENTITY_BASE_V11
def _positive_external_detail_bases(route_data: list[dict[str, Any]], patch: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for row in route_data:
        if not isinstance(row, dict) or row.get("requestSpecReusable") is not True:
            continue
        if not (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0):
            continue
        if not _repair_recipe_origin_allowed(row):
            continue
        route = str(row.get("route") or "")
        if row.get("externalIdentityCorrelation") is not True and "{imdbId}" not in route:
            continue
        base = _proof_execution_origin(row.get("origin"), patch)
        if base and base not in out:
            out.append(base)
    return out[:6]


def _looks_direct_media_route(route: object) -> bool:
    value = str(route or "").strip().casefold()
    return bool(re.search(r"\.(?:m3u8|mpd|mp4|mkv|webm)(?:[?#]|$)|/(?:hls|dash|stream)(?:/|[?#]|$)", value))


def _positive_external_identity_plan(route_data: list[dict[str, Any]], patch: dict[str, Any]) -> list[dict[str, Any]]:
    """Persist only reusable detail-page requests, never fixture HLS/player output."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in route_data:
        if not isinstance(row, dict) or row.get("requestSpecReusable") is not True:
            continue
        if row.get("externalIdentityCorrelation") is not True:
            continue
        if not (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0):
            continue
        if not _repair_recipe_origin_allowed(row):
            continue
        route = str(row.get("route") or "").strip()
        if "{imdbid}" not in route.casefold() or row.get("role") != "detail":
            continue
        if _looks_direct_media_route(route):
            continue
        base = _proof_execution_origin(row.get("origin"), patch)
        if not base:
            continue
        spec = request_spec(row) or {"method": str(row.get("method") or "GET").upper()}
        fingerprint = (base, route, json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        out.append({
            "base": base,
            "route": route,
            "requestSpec": copy.deepcopy(spec),
            "proofModelVersion": PROOF_VERSION,
            "sourceRole": "external-identity-detail",
        })
    return out[:4]


# ROUTE_RECOVERY_SEARCH_REQUEST_PLAN_V14
def _fresh_positive_origin(row: dict[str, Any]) -> str:
    if not isinstance(row, dict) or not _repair_recipe_origin_allowed(row):
        return ""
    if not (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0):
        return ""
    status = int(row.get("status") or 0)
    if status < 200 or status >= 400:
        return ""
    raw = str(row.get("origin") or "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


# ROUTE_RECOVERY_SEARCH_REQUEST_PLAN_V14_1
def _positive_proof_hosts(route_data: list[dict[str, Any]]) -> list[str]:
    """Protect only proof-owned resolver origins from stale domain rewrites.

    Search/detail endpoints can be transient, rate-limited mirrors. Their success
    remains route evidence but cannot revoke an explicit current-domain mapping.
    Source/player origins are terminal resolver authority and may do so.
    """
    out: list[str] = []
    for row in route_data:
        role = str(row.get("role") or "").strip().casefold() if isinstance(row, dict) else ""
        if role not in {"source", "player"}:
            continue
        base = _fresh_positive_origin(row)
        if not base:
            continue
        try:
            host = (urllib.parse.urlsplit(base).hostname or "").casefold()
        except ValueError:
            host = ""
        if host and host not in out:
            out.append(host)
    return out[:24]


def _positive_search_request_plan(route_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in route_data:
        if not isinstance(row, dict) or row.get("requestSpecReusable") is not True:
            continue
        if row.get("role") != "search" and not _record_has_search_query(row):
            continue
        base = _fresh_positive_origin(row)
        route = str(row.get("route") or "").strip()
        spec = request_spec(row)
        if not base or not route or not isinstance(spec, dict):
            continue
        if not _record_has_search_query(row):
            continue
        fingerprint = (
            base,
            route,
            json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        )
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        semantic = str(row.get("semanticType") or "").strip().casefold()
        out.append({
            "base": base,
            "route": route,
            "requestSpec": copy.deepcopy(spec),
            "proofModelVersion": PROOF_VERSION,
            "sourceRole": "catalog-search",
            "semanticTypes": [semantic] if semantic in {"movie", "tv", "anime"} else [],
        })
    return out[:6]


# ROUTE_RECOVERY_CORRELATED_VALUE_PLAN_V18
def _positive_provider_value_plans(route_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only positive same-task search -> provider-value request chains."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in route_data:
        if not isinstance(row, dict):
            continue
        semantic = str(row.get("semanticType") or "").strip().casefold()
        fixture = str(row.get("fixture") or "").strip()
        if semantic not in {"movie", "tv", "anime"} or not fixture:
            continue
        grouped.setdefault((semantic, fixture), []).append(row)

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for (semantic, _fixture), rows in grouped.items():
        if not any(int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0 for row in rows):
            continue
        correlated = [
            row for row in rows
            if row.get("providerValueCorrelation") is True
            and row.get("requestSpecReusable") is True
            # ROUTE_RECOVERY_RESPONSE_VALUE_CORRELATION_V20
            and ("{id}" in str(row.get("route") or "") or "{slug}" in str(row.get("route") or ""))
            and _fresh_positive_origin(row)
            and isinstance(request_spec(row), dict)
        ]
        if not correlated:
            continue
        correlated.sort(key=lambda row: int(row.get("requestIndex") or 0))
        first_index = int(correlated[0].get("requestIndex") or 0)
        searches = [
            row for row in rows
            if row.get("requestSpecReusable") is True
            and _record_has_search_query(row)
            and _fresh_positive_origin(row)
            and isinstance(request_spec(row), dict)
            and int(row.get("requestIndex") or 0) < first_index
        ]
        if not searches:
            continue
        searches.sort(key=lambda row: int(row.get("requestIndex") or 0))
        search = searches[-1]
        plan = {
            "searchBase": _fresh_positive_origin(search),
            "searchRoute": str(search.get("route") or "").strip(),
            "searchRequestSpec": copy.deepcopy(request_spec(search)),
            "steps": [
                {
                    "base": _fresh_positive_origin(row),
                    "route": str(row.get("route") or "").strip(),
                    "requestSpec": copy.deepcopy(request_spec(row)),
                    "role": str(row.get("role") or "detail").strip().casefold(),
                }
                # ROUTE_RECOVERY_PROVIDER_VALUE_CAUSAL_DEPTH_V20_5
                for row in correlated[:8]
            ],
            "semanticTypes": [semantic],
            "proofModelVersion": PROOF_VERSION,
            "sourceRole": "provider-value-correlation",
        }
        fingerprint = json.dumps(plan, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        out.append(plan)
    return out[:12]


def apply_recovery(report: dict[str, Any]) -> dict[str, Any]:
    overrides = load(OVERRIDES)
    knowledge = load(KNOWLEDGE)
    patches = overrides.get("provider_patches") if isinstance(overrides.get("provider_patches"), dict) else {}
    providers = knowledge.get("providers") if isinstance(knowledge.get("providers"), dict) else {}
    patched = 0
    recipes = 0
    routes_total = 0
    for recovered in report.get("providers") or []:
        if not isinstance(recovered, dict):
            continue
        provider_id = cid(recovered.get("providerId"))
        patch = patches.get(provider_id)
        static_row = providers.get(provider_id)
        if not isinstance(patch, dict) or not isinstance(static_row, dict):
            continue
        model = static_row.get("model") if isinstance(static_row.get("model"), dict) else {}
        existing_routes = unique([
            *(patch.get("candidate_learned_routes") or []),
            *(patch.get("learned_routes") or []),
            *(model.get("candidateRoutes") or []),
            *(model.get("routes") or []),
        ], 256)
        if existing_routes:
            patch["candidate_learned_routes"] = existing_routes
            model["candidateRoutes"] = existing_routes
        if isinstance(patch.get("api_recipe"), dict) and not isinstance(patch.get("candidate_api_recipe"), dict):
            patch["candidate_api_recipe"] = copy.deepcopy(patch["api_recipe"])
        if isinstance(model.get("apiRecipe"), dict) and not isinstance(model.get("candidateApiRecipe"), dict):
            model["candidateApiRecipe"] = copy.deepcopy(model["apiRecipe"])

        proven_routes = unique(recovered.get("routes") or [], 192)
        execution_routes = unique(recovered.get("executionRoutes") or [], 192)
        route_data = copy.deepcopy(recovered.get("routeData") or [])
        proof_search_bases = _positive_proof_search_bases(route_data, patch)
        if proof_search_bases:
            patch["proof_search_bases"] = proof_search_bases
            model["proofSearchBases"] = proof_search_bases
        else:
            patch.pop("proof_search_bases", None)
            model.pop("proofSearchBases", None)
        proof_detail_bases = _positive_external_detail_bases(route_data, patch)
        if proof_detail_bases:
            patch["proof_detail_bases"] = proof_detail_bases
            model["proofDetailBases"] = proof_detail_bases
        else:
            patch.pop("proof_detail_bases", None)
            model.pop("proofDetailBases", None)
        proof_protected_hosts = _positive_proof_hosts(route_data)
        if proof_protected_hosts:
            patch["proof_protected_hosts"] = proof_protected_hosts
            model["proofProtectedHosts"] = proof_protected_hosts
        else:
            patch.pop("proof_protected_hosts", None)
            model.pop("proofProtectedHosts", None)

        search_request_plan = _positive_search_request_plan(route_data)
        if search_request_plan:
            patch["search_request_plan"] = copy.deepcopy(search_request_plan)
            model["searchRequestPlan"] = copy.deepcopy(search_request_plan)
            patch["identity_input"] = {
                "mode": "catalog_search",
                "requires_tmdb_before_run": True,
                "required_fields": ["title", "mediaType"],
            }
        else:
            patch.pop("search_request_plan", None)
            model.pop("searchRequestPlan", None)

        provider_value_plan = _positive_provider_value_plans(route_data)
        if provider_value_plan:
            patch["provider_value_plan"] = copy.deepcopy(provider_value_plan)
            model["providerValuePlan"] = copy.deepcopy(provider_value_plan)
        else:
            patch.pop("provider_value_plan", None)
            model.pop("providerValuePlan", None)

        external_identity_plan = _positive_external_identity_plan(route_data, patch)
        if external_identity_plan:
            patch["external_identity_plan"] = copy.deepcopy(external_identity_plan)
            model["externalIdentityPlan"] = copy.deepcopy(external_identity_plan)
            patch["identity_input"] = {
                "mode": "external_id",
                "requires_tmdb_before_run": True,
                "required_fields": ["tmdbId", "mediaType"],
            }
        else:
            patch.pop("external_identity_plan", None)
            model.pop("externalIdentityPlan", None)
        recipe = recovered.get("apiRecipe") if isinstance(recovered.get("apiRecipe"), dict) else None
        existing_routes = unique(patch.get("learned_routes") or [], 192)
        candidate_routes = unique(patch.get("candidate_learned_routes") or [], 192)
        blocked_flat_routes = _flat_route_blocklist(route_data)
        runtime_routes, preserved_baseline_plan = select_runtime_routes(
            existing_routes, candidate_routes, execution_routes, blocked_flat_routes
        )
        patch["learned_routes"] = runtime_routes
        model["routes"] = runtime_routes
        model["routeData"] = route_data
        model["routeProofVersion"] = PROOF_VERSION
        model["routeProof"] = {
            "version": PROOF_VERSION,
            "authority": "observed-provider-http-request",
            "staticCandidatesExecutable": False,
            "providerSource": copy.deepcopy(recovered.get("source") or {}),
            "provenRouteCount": len(proven_routes),
            "genericExecutionRouteCount": len(execution_routes),
            "runtimePlanPreserved": preserved_baseline_plan,
            "runtimePlanRouteCount": len(runtime_routes),
        }
        patch["route_proof_version"] = PROOF_VERSION
        patch["route_proof"] = copy.deepcopy(model["routeProof"])
        if recipe:
            patch["api_recipe"] = copy.deepcopy(recipe)
            model["apiRecipe"] = copy.deepcopy(recipe)
            recipes += 1
        else:
            patch.pop("api_recipe", None)
            model.pop("apiRecipe", None)
        static_row["model"] = model
        providers[provider_id] = static_row
        patches[provider_id] = patch
        patched += 1
        routes_total += len(proven_routes)
    overrides["provider_patches"] = patches
    knowledge["providers"] = providers
    knowledge["routeRecovery"] = {
        "schemaVersion": PROOF_VERSION,
        "providerCount": patched,
        "provenRouteCount": routes_total,
        "apiRecipeCount": recipes,
        "authority": "upstream-or-native-provider-runtime-http-proof",
        "staticCandidatesExecutable": False,
    }
    write(OVERRIDES, overrides)
    write(KNOWLEDGE, knowledge)
    return {"patchedProviders": patched, "provenRoutes": routes_total, "apiRecipes": recipes}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=int(os.environ.get("NIAKVIO_ROUTE_RECOVERY_WORKERS", "8")))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("NIAKVIO_ROUTE_RECOVERY_TIMEOUT", "55")))
    parser.add_argument("--attempts", type=int, default=int(os.environ.get("NIAKVIO_ROUTE_RECOVERY_ATTEMPTS", "3")))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--provider", action="append", default=[])
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    local = manifest_catalog()
    if len(local) != EXPECTED:
        raise SystemExit(f"manifest providers={len(local)}, expected={EXPECTED}")
    parity = load(PARITY)
    source_map = {
        cid(row.get("providerId")): str(row.get("upstreamSource") or "") or None
        for row in parity.get("providers") or [] if isinstance(row, dict)
    }
    requested = {cid(value) for value in args.provider if cid(value)}
    provider_ids = [provider_id for provider_id in local if not requested or provider_id in requested]
    lkg = lkg_rows()
    current_upstream = current_upstream_catalog(source_config())
    workers = max(1, min(12, int(args.workers)))
    timeout = max(15, min(120, int(args.timeout)))
    attempts = max(1, min(4, int(args.attempts)))
    rows: list[dict[str, Any]] = []
    started = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="niakvio-route-recovery-v5-") as tmp_name:
        tmp = Path(tmp_name)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            future_map = {
                pool.submit(
                    recover_one,
                    provider_id,
                    local[provider_id],
                    source_map.get(provider_id),
                    lkg,
                    current_upstream,
                    tmp,
                    timeout,
                    attempts,
                ): provider_id
                for provider_id in provider_ids
            }
            for future in concurrent.futures.as_completed(future_map):
                provider_id = future_map[future]
                try:
                    row = future.result()
                except Exception as exc:
                    row = {"providerId": provider_id, "sourceId": source_map.get(provider_id), "status": "harness-error", "error": type(exc).__name__, "routes": [], "tasks": []}
                rows.append(row)
                print(
                    "FIELD_ROUTE_RECOVERY_PROVIDER "
                    f"provider={provider_id} source={row.get('sourceId') or 'niakvio'} "
                    f"status={row.get('status')} routes={len(row.get('routes') or [])}",
                    flush=True,
                )

    rows.sort(key=lambda row: str(row.get("providerId")))
    counts = Counter(str(row.get("status") or "unknown") for row in rows)
    proven = [row for row in rows if row.get("routes")]
    report = {
        "schemaVersion": PROOF_VERSION,
        "method": "upstream-provider-runtime-exact-http-proof",
        "providerCount": len(provider_ids),
        "catalogueProviderCount": len(local),
        "historicalUpstreamMappedCount": sum(1 for provider_id in provider_ids if source_map.get(provider_id)),
        "niakvioNativeCount": sum(1 for provider_id in provider_ids if not source_map.get(provider_id)),
        "providersWithProvenRoutes": len(proven),
        "provenRouteCount": sum(len(row.get("routes") or []) for row in rows),
        "simpleApiRecipeCount": sum(1 for row in rows if isinstance(row.get("apiRecipe"), dict)),
        "statusCounts": dict(sorted(counts.items())),
        "durationMs": round((time.monotonic() - started) * 1000),
        "maxAttemptsPerTask": attempts,
        "staticCandidatesExecutable": False,
        "requestSpecModel": "ROUTE_RECOVERY_REQUEST_SPEC_V1",
        "proofRequirements": [
            "provider-js-executed",
            "exact-sanitized-request-observed",
            "successful-provider-http-response",
            "fixture-or-prior-response-dataflow-for-dynamic-placeholders",
        ],
        "providers": rows,
    }
    out = args.out if args.out.is_absolute() else ROOT / args.out
    write(out, report)
    if args.apply:
        summary = apply_recovery(report)
        report["applied"] = summary
        write(out, report)
        print(
            "FIELD_ROUTE_RECOVERY_APPLIED "
            f"providers={summary['patchedProviders']} routes={summary['provenRoutes']} recipes={summary['apiRecipes']}"
        )
    print(
        "FIELD_ROUTE_RECOVERY_V5 "
        f"providers={report['providerCount']} upstream={report['historicalUpstreamMappedCount']} "
        f"native={report['niakvioNativeCount']} providers_proven={report['providersWithProvenRoutes']} "
        f"routes={report['provenRouteCount']} recipes={report['simpleApiRecipeCount']}"
    )
    return 0 if rows else 2


if __name__ == "__main__":
    raise SystemExit(main())
