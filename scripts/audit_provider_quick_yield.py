#!/usr/bin/env python3
"""Fast report-only Provider v3 yield census with execution-gate diagnostics."""
from __future__ import annotations

import concurrent.futures
import json
import os
import re
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
CORPUS = ROOT / ".github" / "triggers" / "nuvio-client-lab.json"
PROBE = ROOT / "scripts" / "nuvio_tv_probe_tmdb_ci.cjs"
OUTPUT = ROOT / "provider-v3-quick-yield.json"
WORKERS = max(1, min(int(os.environ.get("NIAKVIO_QUICK_YIELD_WORKERS", "12")), 20))
TIMEOUT = max(20, min(int(os.environ.get("NIAKVIO_QUICK_YIELD_TIMEOUT", "45")), 90))
REPRESENTATIVE = {
    "movie": "interstellar",
    "tv": "breaking-bad-s01e01",
    "anime": "jujutsu-kaisen-s01e01",
}
TMDB_ERASED_HOST_RE = re.compile(r"^/+(?:api\.)?themoviedb\.org(?:/|$)", re.I)
TMDB_CORE_ROUTE_RE = re.compile(r"^/3/(?:movie|tv)(?:/|$)", re.I)


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(path)
    return value


def semantic_types(row: dict[str, Any]) -> list[str]:
    values = row.get("canonicalSupportedTypes") or row.get("supportedTypes") or []
    out: list[str] = []
    for value in values:
        item = str(value or "").strip().casefold()
        if item in REPRESENTATIVE and item not in out:
            out.append(item)
    return out


def parse_probe(stdout: str) -> dict[str, Any] | None:
    for raw in reversed(stdout.splitlines()):
        raw = raw.strip()
        if not raw.startswith("{"):
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "playable_stream_count" in value:
            return value
    return None


def build_tasks() -> tuple[list[dict[str, Any]], int]:
    manifest = load(MANIFEST)
    corpus = load(CORPUS)
    fixture_records = {
        str(row.get("slug") or ""): row
        for row in corpus.get("fixtures") or []
        if isinstance(row, dict) and isinstance(row.get("fixture"), dict)
    }
    fixture_rows = {slug: row["fixture"] for slug, row in fixture_records.items()}
    fixtures: dict[str, dict[str, Any]] = {}
    for media_type, slug in REPRESENTATIVE.items():
        fixture = fixture_rows.get(slug)
        if not isinstance(fixture, dict):
            raise RuntimeError(f"missing representative fixture {slug}")
        fixtures[media_type] = fixture

    # Anime catalogues may legitimately expose a movie lane for anime films.
    # That lane must be proven with the corpus-owned animeMovie fixture rather
    # than a generic movie such as Interstellar; otherwise semantic/transport
    # separation is violated and healthy anime-film lanes are false-negative.
    anime_movie_records = [
        row for row in fixture_records.values()
        if isinstance(row.get("fixture"), dict) and row["fixture"].get("animeMovie") is True
    ]
    if len(anime_movie_records) != 1:
        raise RuntimeError(f"expected exactly one animeMovie representative fixture, got {len(anime_movie_records)}")
    anime_movie_record = anime_movie_records[0]
    anime_movie_fixture = anime_movie_record["fixture"]
    anime_movie_providers = {
        str(value or "").strip().casefold()
        for value in (anime_movie_record.get("providers") or [])
        if str(value or "").strip()
    }

    tasks: list[dict[str, Any]] = []
    providers = 0
    for row in manifest.get("scrapers") or []:
        if not isinstance(row, dict):
            continue
        provider_id = str(row.get("id") or "").strip().casefold()
        filename = str(row.get("filename") or "").strip()
        if not provider_id or not filename or not (ROOT / filename).is_file():
            continue
        providers += 1
        for media_type in semantic_types(row):
            fixture = (
                anime_movie_fixture
                if media_type == "movie" and provider_id in anime_movie_providers
                else fixtures[media_type]
            )
            tasks.append({
                "provider_id": provider_id,
                "provider_name": str(row.get("name") or row.get("id") or provider_id),
                "filename": filename,
                "semantic_type": media_type,
                "fixture": fixture,
            })
    return tasks, providers


def _provider_fetches(debug: dict[str, Any]) -> list[dict[str, Any]]:
    rows = debug.get("fetches") if isinstance(debug.get("fetches"), list) else []
    output = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            host = str(urlsplit(str(row.get("url") or "")).hostname or "").casefold()
        except ValueError:
            host = ""
        if host == "api.themoviedb.org":
            continue
        output.append(row)
    return output


def _provider_value_trace_history(debug: dict[str, Any]) -> list[dict[str, Any]]:
    rows = debug.get("provider_value_trace_history_v21")
    if not isinstance(rows, list):
        return []
    output: list[dict[str, Any]] = []
    for row in rows[-48:]:
        if not isinstance(row, dict):
            continue
        output.append({
            "stage": str(row.get("stage") or "")[:64],
            "lane": str(row.get("lane") or "")[:32],
            "provider_id": str(row.get("provider_id") or "")[:160],
            "step_index": row.get("step_index") if isinstance(row.get("step_index"), int) else None,
            "route": str(row.get("route") or "")[:240],
        })
    return output


def classify_debug_stage(task: dict[str, Any], probe: dict[str, Any], debug: dict[str, Any]) -> str:
    model = debug.get("model") if isinstance(debug.get("model"), dict) else {}
    raw = int(probe.get("raw_stream_count") or 0)
    contradictions = int(probe.get("identity_contradiction_count") or 0)
    if raw > 0:
        return "provider_returned_wrong_content" if contradictions else "provider_returned_streams"

    supported = [str(v or "").casefold() for v in model.get("supported_types") or []]
    requested = str(task.get("semantic_type") or "").casefold()
    if supported and requested not in supported and not (requested == "tv" and "anime" in supported):
        return "gate_type_capability"

    if not bool(model.get("has_api_recipe")) and int(model.get("route_count") or 0) <= 0:
        return "gate_runtime_plan_missing"

    provider_fetches = _provider_fetches(debug)
    if not provider_fetches:
        family = str(model.get("source_runtime_family") or "unknown").casefold()
        return "gate_source_family_unknown" if family == "unknown" else "provider_zero_before_provider_network"

    for row in provider_fetches:
        raw_url = str(row.get("url") or "")
        try:
            parsed = urlsplit(raw_url)
            host = str(parsed.hostname or "").casefold()
            path = str(parsed.path or "")
        except ValueError:
            host = ""
            path = raw_url
        if (
            host == "api.themoviedb.org"
            or TMDB_ERASED_HOST_RE.match(path)
            or TMDB_CORE_ROUTE_RE.match(path)
        ):
            return "source_plan_core_metadata_leak"

    if any(row.get("error") for row in provider_fetches):
        return "provider_network_exception"
    if any(int(row.get("status") or 0) >= 400 for row in provider_fetches):
        return "provider_network_http_error"
    return "provider_network_zero_result"


def run(task: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    command = [
        "node", str(PROBE), str(ROOT / task["filename"]),
        json.dumps(task["fixture"], ensure_ascii=False, separators=(",", ":")), "{}",
    ]
    base = {
        "provider_id": task["provider_id"],
        "provider_name": task["provider_name"],
        "semantic_type": task["semantic_type"],
        "fixture_title": str(task["fixture"].get("title") or ""),
    }
    try:
        proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=TIMEOUT, check=False, env=os.environ.copy())
    except subprocess.TimeoutExpired:
        return {**base, "status": "timeout", "debug_stage": "timeout", "raw": 0, "playable": 0, "verified": 0, "contradictions": 0, "duration_ms": round((time.monotonic() - started) * 1000)}
    except Exception as exc:
        return {**base, "status": "audit_error", "debug_stage": "audit_error", "raw": 0, "playable": 0, "verified": 0, "contradictions": 0, "duration_ms": round((time.monotonic() - started) * 1000), "error": type(exc).__name__}

    probe = parse_probe(proc.stdout)
    if probe is None:
        marker = "missing_tmdb_credential" if "missing_tmdb_credential" in proc.stderr else "invalid_probe_output"
        return {**base, "status": marker, "debug_stage": marker, "raw": 0, "playable": 0, "verified": 0, "contradictions": 0, "duration_ms": round((time.monotonic() - started) * 1000), "stderr_tail": proc.stderr[-1000:]}

    raw = int(probe.get("raw_stream_count") or 0)
    playable = int(probe.get("playable_stream_count") or 0)
    verified = int(probe.get("content_verified_count") or probe.get("identity_verified_count") or 0)
    contradictions = int(probe.get("identity_contradiction_count") or 0)
    runtime_error = bool(probe.get("runtime_error"))
    if contradictions:
        status = "wrong_content"
    elif runtime_error:
        status = "runtime_error"
    elif playable and verified:
        status = "playable_verified"
    elif playable:
        status = "playable_unverified"
    elif raw:
        status = "returned_unplayable"
    else:
        status = "no_streams"
    debug = probe.get("debug") if isinstance(probe.get("debug"), dict) else {}
    stage = classify_debug_stage(task, probe, debug)
    return {
        **base,
        "status": status,
        "debug_stage": stage,
        "debug_model": debug.get("model"),
        "debug_fetch_count": int(debug.get("fetch_count") or 0),
        "debug_provider_fetch_count": len(_provider_fetches(debug)),
        "debug_fetches": debug.get("fetches") or [],
        "debug_provider_value_trace_v18": debug.get("provider_value_trace_v18"),
        "debug_provider_value_trace_history_v21": _provider_value_trace_history(debug),
        "raw": raw,
        "playable": playable,
        "verified": verified,
        "contradictions": contradictions,
        "identity_safe": contradictions == 0,
        "duration_ms": int(probe.get("duration_ms") or round((time.monotonic() - started) * 1000)),
    }


def main() -> int:
    if not (str(os.environ.get("TMDB_API_KEY") or "").strip() or str(os.environ.get("TMDB_ACCESS_TOKEN") or "").strip()):
        raise SystemExit("TMDB_API_KEY or TMDB_ACCESS_TOKEN is required for quick yield census")

    tasks, provider_count = build_tasks()
    rows: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(run, task) for task in tasks]
        for future in concurrent.futures.as_completed(futures):
            rows.append(future.result())

    by_provider: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_provider[row["provider_id"]].append(row)

    raw_providers = sorted(provider for provider, values in by_provider.items() if any(int(row.get("raw") or 0) > 0 for row in values))
    playable_providers = sorted(provider for provider, values in by_provider.items() if any(int(row.get("playable") or 0) > 0 for row in values))
    accepted_playable_providers = sorted(
        provider for provider, values in by_provider.items()
        if any(int(row.get("playable") or 0) > 0 and int(row.get("contradictions") or 0) == 0 for row in values)
    )
    verified_providers = sorted(provider for provider, values in by_provider.items() if any(int(row.get("verified") or 0) > 0 for row in values))
    wrong_content = sorted(provider for provider, values in by_provider.items() if any(row.get("status") == "wrong_content" for row in values))
    statuses = Counter(str(row.get("status") or "unknown") for row in rows)
    debug_stages = Counter(str(row.get("debug_stage") or "unknown") for row in rows)

    type_summary: dict[str, dict[str, int]] = {}
    for media_type in REPRESENTATIVE:
        subset = [row for row in rows if row.get("semantic_type") == media_type]
        type_summary[media_type] = {
            "tasks": len(subset),
            "raw": sum(1 for row in subset if int(row.get("raw") or 0) > 0),
            "playable": sum(1 for row in subset if int(row.get("playable") or 0) > 0),
            "accepted_playable": sum(1 for row in subset if int(row.get("playable") or 0) > 0 and int(row.get("contradictions") or 0) == 0),
            "verified": sum(1 for row in subset if int(row.get("verified") or 0) > 0),
            "wrong_content": sum(1 for row in subset if int(row.get("contradictions") or 0) > 0),
        }

    stage_providers: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        stage = str(row.get("debug_stage") or "unknown")
        provider = str(row.get("provider_id") or "")
        if provider and provider not in stage_providers[stage]:
            stage_providers[stage].append(provider)

    report = {
        "schema_version": 4,
        "environment": "node-fast-real-stream-census-with-tmdb-runtime-context-fetch-trace-and-v21-plan-history",
        "provider_count": provider_count,
        "task_count": len(tasks),
        "raw_provider_count": len(raw_providers),
        "playable_provider_count": len(playable_providers),
        "accepted_playable_provider_count": len(accepted_playable_providers),
        "verified_provider_count": len(verified_providers),
        "wrong_content_provider_count": len(wrong_content),
        "raw_providers": raw_providers,
        "playable_providers": playable_providers,
        "accepted_playable_providers": accepted_playable_providers,
        "verified_providers": verified_providers,
        "wrong_content_providers": wrong_content,
        "type_summary": type_summary,
        "status_counts": dict(sorted(statuses.items())),
        "debug_stage_counts": dict(sorted(debug_stages.items())),
        "debug_stage_providers": {key: sorted(value) for key, value in sorted(stage_providers.items())},
        "rows": sorted(rows, key=lambda row: (row["provider_id"], row["semantic_type"])),
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "FIELD_PROVIDER_QUICK_YIELD "
        f"providers={provider_count} tasks={len(tasks)} raw={len(raw_providers)} "
        f"playable={len(playable_providers)} accepted_playable={len(accepted_playable_providers)} "
        f"verified={len(verified_providers)} wrong_content={len(wrong_content)}"
    )
    print("FIELD_PROVIDER_QUICK_YIELD_PLAYABLE providers=" + ",".join(playable_providers))
    print("FIELD_PROVIDER_QUICK_YIELD_ACCEPTED_PLAYABLE providers=" + ",".join(accepted_playable_providers))
    print("FIELD_PROVIDER_QUICK_YIELD_VERIFIED providers=" + ",".join(verified_providers))
    for stage, count in sorted(debug_stages.items(), key=lambda item: (-item[1], item[0])):
        print(f"FIELD_PROVIDER_QUICK_YIELD_STAGE stage={stage} tasks={count} providers={len(stage_providers.get(stage) or [])}")
    for media_type, summary in type_summary.items():
        print(
            "FIELD_PROVIDER_QUICK_YIELD_TYPE "
            f"type={media_type} tasks={summary['tasks']} raw={summary['raw']} "
            f"playable={summary['playable']} accepted_playable={summary['accepted_playable']} "
            f"verified={summary['verified']} wrong_content={summary['wrong_content']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
