#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import audit_provider_repair_yield_v6 as audit  # noqa: E402
import compare_quick_yield_preservation as preservation  # noqa: E402
import finalize_provider_repair_disposition_v1 as disposition  # noqa: E402

mixed = {
    "provider_id": "videasy",
    "semantic_type": "movie",
    "status": "wrong_content",
    "debug_stage": "provider_returned_wrong_content",
    "raw": 5,
    "playable": 5,
    "verified": 4,
    "contradictions": 1,
}
all_wrong = {
    "provider_id": "desiflix",
    "semantic_type": "movie",
    "status": "wrong_content",
    "debug_stage": "provider_returned_wrong_content",
    "raw": 1,
    "playable": 1,
    "verified": 0,
    "contradictions": 1,
}
assert audit.identity_safe(mixed) is True
assert audit.identity_safe(all_wrong) is False

verified, statuses, _ = disposition.quick_evidence({"rows": [mixed, all_wrong]})
assert verified["videasy"] == {"movie"}, verified
assert not verified.get("desiflix"), verified
assert "wrong_content" in statuses["videasy"]["movie"]

normalized = preservation.normalize_report({
    "wrong_content_providers": ["videasy", "desiflix"],
    "rows": [mixed, all_wrong],
})
assert normalized["wrong_content_providers"] == ["desiflix"], normalized

print("provider mixed yield acceptance tests passed")
