#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "compare_quick_yield_preservation.py"


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def row(stage: str, *, raw: int = 0, playable: int = 0, verified: int = 0, contradictions: int = 0) -> dict:
    return {
        "provider_id": "same",
        "semantic_type": "tv",
        "debug_stage": stage,
        "raw": raw,
        "playable": playable,
        "verified": verified,
        "contradictions": contradictions,
    }


def report(rows: list[dict], *, positive: bool = False, wrong: bool = False) -> dict:
    providers = ["same"] if positive else []
    return {
        "rows": rows,
        "raw_providers": providers,
        "playable_providers": providers,
        "accepted_playable_providers": providers,
        "verified_providers": providers,
        "wrong_content_providers": ["same"] if wrong else [],
    }


def run_case(
    root: Path,
    *,
    changed_bytes: bool = False,
    enabled: bool = False,
    retry_stages: list[str] | None = None,
    candidate_stage: str = "timeout",
    new_wrong: bool = False,
    explicit: bool = True,
) -> subprocess.CompletedProcess[str]:
    provider_dir = root / "providers"
    provider_dir.mkdir(parents=True, exist_ok=True)
    baseline_bytes = b"exact baseline provider bytes\n"
    candidate_bytes = b"changed candidate provider bytes\n" if changed_bytes else baseline_bytes
    filename = "providers/same-deadbeefdeadbeef.js"
    provider_path = root / filename
    provider_path.write_bytes(candidate_bytes)
    baseline_sha = hashlib.sha256(baseline_bytes).hexdigest()

    baseline = report([row("provider_returned_streams", raw=1, playable=1, verified=1)], positive=True)
    contradictions = 1 if new_wrong else 0
    candidate = report([row(candidate_stage, contradictions=contradictions)], wrong=new_wrong)
    stages = retry_stages if retry_stages is not None else ["provider_network_exception", "timeout"]
    retry = report([row(stage, contradictions=contradictions) for stage in stages], wrong=new_wrong)
    manifest = {"scrapers": [{"id": "same", "filename": filename, "enabled": enabled}]}
    lkg = {
        "providers": {
            "same": {
                "manifestFileSha256": baseline_sha,
                "proofPromotion": False,
                "verifiedLanes": ["tv"],
            }
        }
    }
    disposition = {
        "providers": [
            {
                "provider": "same",
                "activationState": "disabled",
                "routeDataState": "repair",
            }
        ]
    }

    paths = {
        "baseline": root / "baseline.json",
        "candidate": root / "candidate.json",
        "retry": root / "retry.json",
        "manifest": root / "manifest.json",
        "lkg": root / "lkg.json",
        "disposition": root / "disposition.json",
    }
    write(paths["baseline"], baseline)
    write(paths["candidate"], candidate)
    write(paths["retry"], retry)
    write(paths["manifest"], manifest)
    write(paths["lkg"], lkg)
    write(paths["disposition"], disposition)

    cmd = [
        sys.executable,
        str(SCRIPT),
        "--baseline", str(paths["baseline"]),
        "--candidate", str(paths["candidate"]),
        "--candidate-retry", str(paths["retry"]),
    ]
    if explicit:
        cmd.extend([
            "--baseline-runtime-lkg", str(paths["lkg"]),
            "--manifest", str(paths["manifest"]),
            "--disposition", str(paths["disposition"]),
            "--root", str(root),
        ])
    return subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=False)


with tempfile.TemporaryDirectory(prefix="niakvio-external-drift-") as tmp:
    root = Path(tmp)

    green = run_case(root)
    assert green.returncode == 0, green.stdout + green.stderr
    assert "YIELD_EXTERNAL_DRIFT_WAIVED=same" in green.stdout, green.stdout
    assert "byte-identical-repeated-transient-disabled-debt" in green.stdout, green.stdout

    strict = run_case(root, explicit=False)
    assert strict.returncode != 0, strict.stdout + strict.stderr

    changed = run_case(root, changed_bytes=True)
    assert changed.returncode != 0 and "provider-bytes-changed" in changed.stdout, changed.stdout

    active = run_case(root, enabled=True)
    assert active.returncode != 0 and "candidate-still-enabled" in active.stdout, active.stdout

    deterministic = run_case(root, candidate_stage="provider_network_http_error")
    assert deterministic.returncode != 0 and "lane-tv-not-transient" in deterministic.stdout, deterministic.stdout

    one_retry = run_case(root, retry_stages=["provider_network_exception"])
    assert one_retry.returncode != 0 and "lane-tv-retry-evidence-missing" in one_retry.stdout, one_retry.stdout

    wrong = run_case(root, new_wrong=True)
    assert wrong.returncode != 0 and "new-wrong-content" in wrong.stdout, wrong.stdout

print("provider external drift preservation tests passed: waiver requires same bytes + repeated transient retries + disabled repair debt")
