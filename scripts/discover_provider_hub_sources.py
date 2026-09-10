#!/usr/bin/env python3
"""Discover authoritative address hubs without ever replacing an existing hub.

Safety contract:
- existing hub / telegram_public / redirect sources are immutable;
- terminal/direct domains are never promoted to hubs;
- a candidate needs structural address-source evidence plus >=2 independent
  search confirmations in the same run;
- --apply may only fill a provider that currently has no authoritative source;
- this command edits provider-hubs.json only. It never edits Provider JS, domain
  history, manifests, provider-overrides.json or current official_site values.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import resolve_provider_hubs as hub

REGISTRY_PATH = ROOT / "provider-hubs.json"
PROTECTED_TYPES = {"hub", "telegram_public", "redirect"}
ADDRESS_MARKERS = tuple(
    hub.compact(value)
    for value in (
        "adresse officielle", "nouvelle adresse", "nouveau domaine", "site officiel",
        "accès au site", "acces au site", "adresse active", "lien officiel",
        "official site", "official domain", "new domain", "new address", "current domain",
        "official link", "access the site", "sitio oficial", "dominio oficial",
        "nuevo dominio", "nueva direccion", "enlace oficial", "sito ufficiale",
        "dominio ufficiale", "nuovo dominio", "nuovo indirizzo", "site oficial",
        "novo dominio", "novo endereco", "offizielle seite", "offizielle domain",
        "neue domain", "neue adresse", "resmi site", "resmi adres", "yeni alan adi",
        "yeni adres", "situs resmi", "domain resmi", "domain baru", "alamat baru",
    )
)


def load_registry(path: Path = REGISTRY_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write(path: Path, payload: Any) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def authoritative_sources(row: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        source for source in (row.get("sources") or [])
        if isinstance(source, dict)
        and str(source.get("type") or "").strip().casefold() in PROTECTED_TYPES
        and str(source.get("url") or "").strip()
    ]


def provider_is_protected(row: dict[str, Any]) -> bool:
    return hub.is_http_url(row.get("hub")) or bool(authoritative_sources(row))


def direct_hosts(row: dict[str, Any]) -> set[str]:
    values: list[str] = []
    if hub.is_http_url(row.get("direct")):
        values.append(str(row["direct"]))
    values.extend(str(v) for v in row.get("direct_candidates") or [] if hub.is_http_url(v))
    values.extend(str(v) for v in row.get("allowed_terminal_hosts") or [] if v)
    output: set[str] = set()
    for value in values:
        hostname = hub.host(value) if "://" in value else value.casefold().strip(".")
        if hostname:
            output.add(hostname)
    return output


def provider_aliases(provider_id: str, row: dict[str, Any]) -> list[str]:
    values = [provider_id, row.get("name"), *(row.get("aliases") or [])]
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        compact = hub.compact(text)
        if len(compact) < 3 or compact in seen:
            continue
        seen.add(compact)
        result.append(text)
    return result


def primary_brand(provider_id: str, row: dict[str, Any]) -> str:
    aliases = provider_aliases(provider_id, row)
    return aliases[0] if aliases else provider_id


def search_queries(provider_id: str, row: dict[str, Any]) -> list[str]:
    brand = primary_brand(provider_id, row)
    return [
        f'"{brand}" "adresse officielle"',
        f'"{brand}" "nouvelle adresse"',
        f'"{brand}" "official site"',
        f'"{brand}" "new domain"',
        f'"{brand}" telegram',
        f'"{brand}" site:.wiki',
    ]


def result_brand_hint(provider_id: str, row: dict[str, Any], url: str, label: str, document: str = "") -> bool:
    haystack = hub.compact(f"{url} {label} {document[:120000]}")
    return any(hub.compact(alias) in haystack for alias in provider_aliases(provider_id, row))


def safe_source_host(row: dict[str, Any], url: str) -> bool:
    hostname = hub.host(url)
    if not hostname or not hub.is_public_url(url):
        return False
    if hostname in direct_hosts(row):
        return False
    if hostname.endswith(hub.SEARCH_HOST_SUFFIXES + hub.INFRASTRUCTURE_HOST_SUFFIXES):
        return False
    return True


def webpage_address_source(provider_id: str, row: dict[str, Any], url: str, label: str, timeout: float) -> dict[str, Any] | None:
    if not safe_source_host(row, url):
        return None
    try:
        status, final, document, _headers = hub.fetch(url, timeout)
    except Exception:
        return None
    if not 200 <= int(status) < 400:
        return None
    final = final.rstrip("/")
    final_host = hub.host(final)
    if final_host in direct_hosts(row):
        source_host = hub.host(url)
        if source_host and source_host != final_host and result_brand_hint(provider_id, row, url, label):
            return {
                "url": url.rstrip("/"), "type": "redirect", "score": 96,
                "purpose": "Discovered public provider address redirector",
                "terminal": final,
            }
        return None
    if not safe_source_host(row, final):
        return None
    if not result_brand_hint(provider_id, row, final, label, document):
        return None

    compact_doc = hub.compact(re.sub(r"<[^>]+>", " ", document[:250000]))
    marker_hits = sum(1 for marker in ADDRESS_MARKERS if marker and marker in compact_doc)
    if marker_hits <= 0:
        return None

    probe_cfg = dict(row)
    probe_cfg["aliases"] = provider_aliases(provider_id, row)
    outbound: list[str] = []
    for candidate_url, _candidate_label, _index in hub.links(document, final)[:160]:
        candidate_host = hub.host(candidate_url)
        if not candidate_host or candidate_host == final_host:
            continue
        if candidate_host.endswith(hub.SOCIAL_HOST_SUFFIXES + hub.SEARCH_HOST_SUFFIXES + hub.INFRASTRUCTURE_HOST_SUFFIXES):
            continue
        if hub.same_brand(provider_id, candidate_url, probe_cfg) or candidate_host in direct_hosts(row):
            outbound.append(candidate_url.rstrip("/"))
    if not outbound:
        return None
    return {
        "url": final,
        "type": "hub",
        "score": min(99, 90 + min(marker_hits, 3) * 2),
        "purpose": "Discovered authoritative address/reference hub",
        "terminal": outbound[0],
        "marker_hits": marker_hits,
    }


def telegram_address_source(provider_id: str, row: dict[str, Any], url: str, label: str, timeout: float) -> dict[str, Any] | None:
    hostname = hub.host(url)
    if not hostname or not hostname.endswith(("t.me", "telegram.me")):
        return None
    if not result_brand_hint(provider_id, row, url, label):
        return None
    try:
        status, final, document, _headers = hub.fetch(url, timeout)
    except Exception:
        return None
    if not 200 <= int(status) < 400 or not result_brand_hint(provider_id, row, final, label, document):
        return None
    cfg = dict(row)
    cfg["aliases"] = provider_aliases(provider_id, row)
    cfg["resolver"] = "latest_telegram_domain"
    rows, _preferred = hub.choose_official(provider_id, cfg, final, document)
    rows = [candidate for candidate in rows if hub.host(str(candidate.get("url") or "")) != hub.host(final)]
    if not rows:
        return None
    return {
        "url": final.rstrip("/"),
        "type": "telegram_public",
        "score": 97,
        "purpose": "Discovered public provider address announcement channel",
        "terminal": str(rows[0].get("url") or "").rstrip("/"),
        "message_id": rows[0].get("message_id"),
    }


def inspect_result(provider_id: str, row: dict[str, Any], url: str, label: str, timeout: float) -> dict[str, Any] | None:
    hostname = hub.host(url)
    if hostname.endswith(("t.me", "telegram.me")):
        return telegram_address_source(provider_id, row, url, label, timeout)
    return webpage_address_source(provider_id, row, url, label, timeout)


def discover_provider(provider_id: str, row: dict[str, Any], timeout: float) -> dict[str, Any]:
    evidence: dict[str, set[str]] = defaultdict(set)
    best: dict[str, dict[str, Any]] = {}
    observations: list[dict[str, Any]] = []
    for query in search_queries(provider_id, row):
        for engine, search_url in hub.search_engine_urls(query):
            try:
                status, final, document, _headers = hub.fetch(search_url, timeout)
            except Exception as exc:
                observations.append({"engine": engine, "query": query, "status": 0, "error": type(exc).__name__})
                continue
            challenged = any(marker in document[:200000].casefold() for marker in hub.SEARCH_CHALLENGE_MARKERS)
            observations.append({"engine": engine, "query": query, "status": status, "challenged": challenged})
            if not 200 <= int(status) < 400 or challenged:
                continue
            for result_url, label, index in hub.links(document, final)[:24]:
                result_host = hub.host(result_url)
                if not result_host or result_host.endswith(hub.SEARCH_HOST_SUFFIXES + hub.INFRASTRUCTURE_HOST_SUFFIXES):
                    continue
                if not result_brand_hint(provider_id, row, result_url, label):
                    continue
                candidate = inspect_result(provider_id, row, result_url, label, timeout)
                if not candidate:
                    continue
                candidate_url = str(candidate["url"]).rstrip("/")
                evidence[candidate_url].add(f"{engine}:{query}")
                current = best.get(candidate_url)
                if current is None or int(candidate.get("score") or 0) > int(current.get("score") or 0):
                    best[candidate_url] = candidate
                if index > 10:
                    break
    ordered = []
    for candidate_url, candidate in best.items():
        confirmations = len(evidence[candidate_url])
        ordered.append({**candidate, "confirmations": confirmations, "evidence": sorted(evidence[candidate_url])})
    ordered.sort(key=lambda item: (-int(item.get("confirmations") or 0), -int(item.get("score") or 0), item["url"]))
    selected = next((item for item in ordered if int(item.get("score") or 0) >= 90 and int(item.get("confirmations") or 0) >= 2), None)
    return {
        "provider_id": provider_id,
        "status": "confirmed" if selected else ("candidate" if ordered else "not_found"),
        "selected": selected,
        "candidates": ordered[:8],
        "observations": observations,
    }


def apply_candidate(row: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if provider_is_protected(row):
        return False
    url = str(candidate.get("url") or "").strip().rstrip("/")
    source_type = str(candidate.get("type") or "hub").strip().casefold()
    if source_type not in PROTECTED_TYPES or not hub.is_http_url(url):
        return False
    row["hub"] = url + ("/" if source_type == "hub" and not url.endswith("/") else "")
    sources = [dict(source) for source in row.get("sources") or [] if isinstance(source, dict)]
    sources.append({
        "type": source_type,
        "url": url,
        "priority": 95,
        "purpose": candidate.get("purpose") or "Automatically discovered authoritative address source",
        "discovery": "multi_search_structural_confirmation",
    })
    row["sources"] = sources
    if source_type == "telegram_public":
        row.setdefault("resolver", "latest_telegram_domain")
    else:
        row.setdefault("resolver", "official_outbound")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=REGISTRY_PATH)
    parser.add_argument("--output", type=Path, default=ROOT / "health-output/provider-hub-source-discovery.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--timeout", type=float, default=7.0)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--max-providers", type=int, default=0, help="0 = all missing-hub providers")
    parser.add_argument("--provider", action="append", default=[])
    args = parser.parse_args()

    registry_path = args.registry if args.registry.is_absolute() else ROOT / args.registry
    output_path = args.output if args.output.is_absolute() else ROOT / args.output
    payload = load_registry(registry_path)
    providers = payload.get("providers") or {}
    requested = {hub.canonical_provider_id(value) for value in args.provider}
    eligible: list[tuple[str, dict[str, Any]]] = []
    protected = 0
    for raw_id, raw_row in sorted(providers.items()):
        if not isinstance(raw_row, dict):
            continue
        provider_id = hub.canonical_provider_id(raw_id)
        if requested and provider_id not in requested:
            continue
        if provider_is_protected(raw_row):
            protected += 1
            continue
        eligible.append((raw_id, raw_row))
    if args.max_providers > 0:
        eligible = eligible[: args.max_providers]

    report: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": hub.now_iso(),
        "safety": "fill-only; existing authoritative hubs are immutable",
        "protected_existing": protected,
        "eligible": len(eligible),
        "confirmed": 0,
        "applied": 0,
        "providers": {},
    }

    workers = max(1, min(int(args.workers), 16))
    results: dict[str, dict[str, Any]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        future_map = {
            pool.submit(discover_provider, hub.canonical_provider_id(raw_id), dict(row), args.timeout): raw_id
            for raw_id, row in eligible
        }
        for future in concurrent.futures.as_completed(future_map):
            raw_id = future_map[future]
            provider_id = hub.canonical_provider_id(raw_id)
            try:
                results[raw_id] = future.result()
            except Exception as exc:
                results[raw_id] = {
                    "provider_id": provider_id,
                    "status": "error",
                    "selected": None,
                    "candidates": [],
                    "observations": [],
                    "error": f"{type(exc).__name__}: {exc}",
                }

    for raw_id, row in eligible:
        provider_id = hub.canonical_provider_id(raw_id)
        result = results[raw_id]
        selected = result.get("selected")
        if selected:
            report["confirmed"] += 1
            if args.apply and apply_candidate(row, selected):
                result["applied"] = True
                report["applied"] += 1
        report["providers"][provider_id] = result

    output_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(output_path, report)
    if args.apply and report["applied"]:
        atomic_write(registry_path, payload)
    print(
        "hub source discovery complete: "
        f"protected={protected} eligible={len(eligible)} confirmed={report['confirmed']} applied={report['applied']} workers={workers}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
