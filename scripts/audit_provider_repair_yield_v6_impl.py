#!/usr/bin/env python3
"""Target-only post-reconstruction yield audit for portfolio repair v6."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import audit_provider_quick_yield as base

ROOT = Path(__file__).resolve().parents[1]
REPRESENTATIVE_SLUG = {
    "movie": "interstellar",
    "tv": "breaking-bad-s01e01",
    "anime": "jujutsu-kaisen-s01e01",
}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(path)
    return value


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def identity_safe(row: dict[str, Any]) -> bool:
    return int(row.get("contradictions") or 0) == 0 and str(row.get("status") or "") != "wrong_content"


def _safe_identity_node(value: object) -> dict[str, Any]:
    row = value if isinstance(value, dict) else {}
    out: dict[str, Any] = {
        "status": str(row.get("status") or "")[:32],
        "reason": str(row.get("reason") or "")[:96],
    }
    ratio = row.get("duration_ratio") if row.get("duration_ratio") is not None else row.get("ratio")
    if isinstance(ratio, (int, float)):
        out["duration_ratio"] = round(float(ratio), 4)
    return out


def safe_identity_diagnostics(probe: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep rejection causes without persisting URLs, stream labels or tokens."""
    streams = probe.get("streams") if isinstance(probe.get("streams"), list) else []
    output: list[dict[str, Any]] = []
    for index, stream in enumerate(streams[:8]):
        if not isinstance(stream, dict):
            continue
        identity = _safe_identity_node(stream.get("identity"))
        metadata = _safe_identity_node(stream.get("metadata_identity"))
        duration = _safe_identity_node(stream.get("duration_identity"))
        if not any(part.get("status") or part.get("reason") for part in (identity, metadata, duration)):
            continue
        output.append({
            "stream_index": index,
            "identity": identity,
            "metadata_identity": metadata,
            "duration_identity": duration,
        })
    return output


def rerun_identity_diagnostics(task: dict[str, Any]) -> list[dict[str, Any]]:
    command = [
        "node",
        str(base.PROBE),
        str(ROOT / str(task.get("filename") or "")),
        json.dumps(task.get("fixture") or {}, ensure_ascii=False, separators=(",", ":")),
        "{}",
    ]
    try:
        proc = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=base.TIMEOUT,
            check=False,
            env=os.environ.copy(),
        )
    except Exception as exc:
        return [{"stream_index": None, "identity": {"status": "diagnostic_error", "reason": type(exc).__name__}, "metadata_identity": {}, "duration_identity": {}}]
    probe = base.parse_probe(proc.stdout)
    if not isinstance(probe, dict):
        return [{"stream_index": None, "identity": {"status": "diagnostic_error", "reason": "invalid_probe_output"}, "metadata_identity": {}, "duration_identity": {}}]
    return safe_identity_diagnostics(probe)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recovery", type=Path, required=True)
    parser.add_argument("--skip-file", type=Path, default=Path("automation/provider-repair-skip.json"))
    parser.add_argument("--output", type=Path, default=Path("automation/provider-repair-yield-v6.json"))
    parser.add_argument("--require-upstream-positive-preserved", action="store_true")
    args = parser.parse_args()

    recovery = load(ROOT / args.recovery)
    skip_cfg = load(ROOT / args.skip_file)
    skipped = {cid(value) for value in (skip_cfg.get("providers") or {}).keys()}
    targeted = {
        cid(row.get("providerId"))
        for row in recovery.get("providers") or []
        if isinstance(row, dict) and cid(row.get("providerId")) and cid(row.get("providerId")) not in skipped
    }

    all_tasks, _ = base.build_tasks()
    tasks = [task for task in all_tasks if cid(task.get("provider_id")) in targeted]
    task_map = {
        (cid(task.get("provider_id")), cid(task.get("semantic_type"))): task
        for task in tasks
    }
    rows: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=base.WORKERS) as pool:
        futures = [pool.submit(base.run, task) for task in tasks]
        for future in concurrent.futures.as_completed(futures):
            rows.append(future.result())

    # Wrong-content is an acceptance failure, so retain the exact verifier cause.
    # Re-run only contradictory tasks and persist no stream URL/title/host/token.
    for row in rows:
        if identity_safe(row):
            continue
        task = task_map.get((cid(row.get("provider_id")), cid(row.get("semantic_type"))))
        row["identityDiagnosticsV21"] = rerun_identity_diagnostics(task) if task else []

    by_provider: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_provider[cid(row.get("provider_id"))].append(row)
    raw = sorted(pid for pid, vals in by_provider.items() if any(int(v.get("raw") or 0) > 0 for v in vals))
    playable = sorted(pid for pid, vals in by_provider.items() if any(int(v.get("playable") or 0) > 0 for v in vals))
    accepted_playable = sorted(
        pid for pid, vals in by_provider.items()
        if any(int(v.get("playable") or 0) > 0 and identity_safe(v) for v in vals)
    )
    verified = sorted(pid for pid, vals in by_provider.items() if any(int(v.get("verified") or 0) > 0 and identity_safe(v) for v in vals))
    wrong_content = sorted(pid for pid, vals in by_provider.items() if any(not identity_safe(v) for v in vals))

    upstream_positive: set[tuple[str, str]] = set()
    for provider in recovery.get("providers") or []:
        if not isinstance(provider, dict):
            continue
        provider_id = cid(provider.get("providerId"))
        if provider_id not in targeted:
            continue
        for task in provider.get("tasks") or []:
            if not isinstance(task, dict):
                continue
            media = cid(task.get("semanticType"))
            fixture = cid((task.get("fixture") or {}).get("slug") if isinstance(task.get("fixture"), dict) else task.get("fixture"))
            if not fixture:
                fixture = cid(task.get("fixture"))
            if fixture != REPRESENTATIVE_SLUG.get(media):
                continue
            if int(task.get("streamCount") or 0) > 0 or int(task.get("rawStreamCount") or 0) > 0:
                upstream_positive.add((provider_id, media))

    reconstructed_positive = {
        (cid(row.get("provider_id")), cid(row.get("semantic_type")))
        for row in rows
        if int(row.get("raw") or 0) > 0 and identity_safe(row)
    }
    contradicted_positive = {
        (cid(row.get("provider_id")), cid(row.get("semantic_type")))
        for row in rows
        if int(row.get("raw") or 0) > 0 and not identity_safe(row)
    }
    lost = sorted(upstream_positive - reconstructed_positive)
    recovered = sorted(upstream_positive & reconstructed_positive)
    contradicted = sorted(upstream_positive & contradicted_positive)

    statuses = Counter(str(row.get("status") or "unknown") for row in rows)
    stages = Counter(str(row.get("debug_stage") or "unknown") for row in rows)
    report = {
        "schemaVersion": 8,
        "targetedProviderCount": len(targeted),
        "targetedProviders": sorted(targeted),
        "skippedAlreadyGreenProviders": sorted(skipped),
        "taskCount": len(tasks),
        "rawProviderCount": len(raw),
        "playableProviderCount": len(playable),
        "acceptedPlayableProviderCount": len(accepted_playable),
        "verifiedProviderCount": len(verified),
        "wrongContentProviderCount": len(wrong_content),
        "rawProviders": raw,
        "playableProviders": playable,
        "acceptedPlayableProviders": accepted_playable,
        "verifiedProviders": verified,
        "wrongContentProviders": wrong_content,
        "upstreamPositiveRepresentativePairs": [list(v) for v in sorted(upstream_positive)],
        "preservedUpstreamPositivePairs": [list(v) for v in recovered],
        "contradictedUpstreamPositivePairs": [list(v) for v in contradicted],
        "lostUpstreamPositivePairs": [list(v) for v in lost],
        "statusCounts": dict(sorted(statuses.items())),
        "debugStageCounts": dict(sorted(stages.items())),
        "rows": sorted(rows, key=lambda row: (cid(row.get("provider_id")), cid(row.get("semantic_type")))),
    }
    out = ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "PROVIDER_REPAIR_YIELD_V8 "
        f"targeted={len(targeted)} tasks={len(tasks)} raw={len(raw)} playable={len(playable)} "
        f"accepted_playable={len(accepted_playable)} verified={len(verified)} wrong_content={len(wrong_content)} "
        f"upstream_positive={len(upstream_positive)} preserved={len(recovered)} "
        f"contradicted={len(contradicted)} lost={len(lost)}"
    )
    if playable:
        print("PROVIDER_REPAIR_YIELD_V8_PLAYABLE providers=" + ",".join(playable))
    if accepted_playable:
        print("PROVIDER_REPAIR_YIELD_V8_ACCEPTED_PLAYABLE providers=" + ",".join(accepted_playable))
    for row in rows:
        diagnostics = row.get("identityDiagnosticsV21") if isinstance(row.get("identityDiagnosticsV21"), list) else []
        reasons = sorted({
            str(part.get("reason") or "")
            for diag in diagnostics if isinstance(diag, dict)
            for key in ("identity", "metadata_identity", "duration_identity")
            for part in [diag.get(key) if isinstance(diag.get(key), dict) else {}]
            if str(part.get("reason") or "")
        })
        if reasons:
            print(
                "PROVIDER_REPAIR_YIELD_V8_IDENTITY "
                f"provider={cid(row.get('provider_id'))} type={cid(row.get('semantic_type'))} "
                f"reasons={','.join(reasons)}"
            )
    if contradicted:
        print("PROVIDER_REPAIR_YIELD_V8_CONTRADICTED pairs=" + ",".join(f"{p}:{m}" for p, m in contradicted))
    if lost:
        print("PROVIDER_REPAIR_YIELD_V8_LOST pairs=" + ",".join(f"{p}:{m}" for p, m in lost))
    if args.require_upstream_positive_preserved and lost:
        raise SystemExit(3)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
