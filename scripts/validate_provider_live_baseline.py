#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import provider_live_baseline as policy

ROOT = Path(__file__).resolve().parents[1]


def read_optional(path: Path | None) -> dict | None:
    if path is None or not path.is_file():
        return None
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path}: object required")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="manifest.json")
    parser.add_argument("--locks", default="automation/provider-live-baseline-locks.json")
    parser.add_argument("--ab-report", default="")
    args = parser.parse_args()

    manifest = policy.load(ROOT / args.manifest)
    locks = policy.load(ROOT / args.locks)
    ab_path = ROOT / args.ab_report if args.ab_report else None
    ab_report = read_optional(ab_path)

    errors = policy.baseline_lock_errors(manifest, locks, require_exact_bundle=False)
    errors += policy.candidate_replacement_errors(manifest, locks, ab_report)
    if errors:
        raise SystemExit("provider live baseline preservation failed:\n- " + "\n- ".join(errors))

    protected = policy.lock_rows(locks)
    complete = policy.fully_green_provider_ids(manifest, locks)
    lane_count = sum(len(policy.protected_lanes(row)) for row in protected.values())
    print(
        "provider live baseline preservation passed "
        f"(providers={len(protected)} lanes={lane_count} fully_green={len(complete)} "
        f"ab_report={'yes' if ab_report else 'no'})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
