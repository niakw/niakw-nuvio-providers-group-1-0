#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from provider_patches.videasy_runtime_v1 import DEFAULT_ENDPOINTS
paths=[str(x.get("path") or "") for x in DEFAULT_ENDPOINTS]
labels=[str(x.get("label") or "") for x in DEFAULT_ENDPOINTS]
assert len(DEFAULT_ENDPOINTS)==9, len(DEFAULT_ENDPOINTS)
assert "cdn/sources-with-title" in paths
assert "Hydrogen" in labels
assert "m4uhd/sources-with-title" not in paths
assert "Nitrogen" not in labels
overrides=json.loads((ROOT/"provider-overrides.json").read_text(encoding="utf-8"))
row=overrides["provider_patches"]["videasy"]
assert "/m4uhd/sources-with-title" in (row.get("candidate_learned_routes") or [])
assert any("identity contradiction" in str(n) for n in (row.get("notes") or []))
print("VIDEASY_IDENTITY_SAFE_ENDPOINT_POLICY_OK executable=9 nitrogen=false evidence_retained=true")
