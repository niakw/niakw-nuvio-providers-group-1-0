#!/usr/bin/env python3
"""Repair disposition entrypoint with stream-level verified-lane authority."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

import finalize_provider_repair_disposition_v1_impl as impl


def lane(value: object) -> str:
    raw = str(value or "").strip().casefold()
    return "tv" if raw in {"series", "serie"} else raw


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def quick_evidence(data: dict[str, Any]):
    verified: dict[str, set[str]] = defaultdict(set)
    statuses: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    stages: dict[str, set[str]] = defaultdict(set)
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        provider = cid(row.get("provider_id") or row.get("provider"))
        semantic = lane(row.get("semantic_type") or row.get("media_type") or row.get("type"))
        status = str(row.get("status") or "").strip().casefold()
        stage = str(row.get("debug_stage") or "").strip().casefold()
        if not provider or semantic not in {"movie", "tv", "anime"}:
            continue
        if status:
            statuses[provider][semantic].add(status)
        if stage:
            stages[provider].add(stage)
        # Stream-level acceptance: one verified playable candidate proves the lane;
        # sibling contradicted candidates remain rejected but do not erase it.
        if status == "playable_verified" or (
            int(row.get("playable") or 0) > 0 and int(row.get("verified") or 0) > 0
        ):
            verified[provider].add(semantic)
    return verified, statuses, stages


impl.quick_evidence = quick_evidence


def main() -> int:
    return impl.main()


if __name__ == "__main__":
    raise SystemExit(main())
