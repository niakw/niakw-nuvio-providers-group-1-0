#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def provider_set(report: dict, key: str) -> set[str]:
    return {str(v).strip().casefold() for v in report.get(key) or [] if str(v).strip()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--candidate-retry")
    parser.add_argument("--losses-output")
    args = parser.parse_args()

    baseline = load(args.baseline)
    candidate = load(args.candidate)
    retry = load(args.candidate_retry) if args.candidate_retry else {}

    base_raw = provider_set(baseline, "raw_providers")
    base_playable = provider_set(baseline, "playable_providers")
    base_verified = provider_set(baseline, "verified_providers")
    cand_raw = provider_set(candidate, "raw_providers") | provider_set(retry, "raw_providers")
    cand_playable = provider_set(candidate, "playable_providers") | provider_set(retry, "playable_providers")
    cand_verified = provider_set(candidate, "verified_providers") | provider_set(retry, "verified_providers")

    lost_raw = sorted(base_raw - cand_raw)
    lost_playable = sorted(base_playable - cand_playable)
    lost_verified = sorted(base_verified - cand_verified)
    losses = sorted(set(lost_raw) | set(lost_playable) | set(lost_verified))

    base_wrong = provider_set(baseline, "wrong_content_providers")
    cand_wrong = provider_set(candidate, "wrong_content_providers") | provider_set(retry, "wrong_content_providers")
    new_wrong = sorted(cand_wrong - base_wrong)

    print(f"YIELD_BASELINE raw={len(base_raw)} playable={len(base_playable)} verified={len(base_verified)} wrong={len(base_wrong)}")
    print(f"YIELD_CANDIDATE raw={len(cand_raw)} playable={len(cand_playable)} verified={len(cand_verified)} wrong={len(cand_wrong)}")
    print("YIELD_LOST_RAW=" + ",".join(lost_raw))
    print("YIELD_LOST_PLAYABLE=" + ",".join(lost_playable))
    print("YIELD_LOST_VERIFIED=" + ",".join(lost_verified))
    print("YIELD_NEW_WRONG_CONTENT=" + ",".join(new_wrong))

    if args.losses_output:
        Path(args.losses_output).write_text(json.dumps({"providers": losses}, indent=2) + "\n", encoding="utf-8")

    if lost_raw or lost_playable or lost_verified:
        raise SystemExit("yield preservation failed")
    if new_wrong:
        raise SystemExit("new wrong-content provider detected")
    print("YIELD_PRESERVATION_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
