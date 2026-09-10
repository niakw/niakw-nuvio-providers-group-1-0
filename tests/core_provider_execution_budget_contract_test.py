#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
PATCH = ROOT / "scripts" / "provider_patches" / "global_media_type_resolution_v1.py"

spec = importlib.util.spec_from_file_location("core_provider_budget_contract", PATCH)
assert spec is not None and spec.loader is not None
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

from provider_patch_blocks import decode_managed_data

BASE = '''
async function getStreams() { return []; }
module.exports = { getStreams };
'''

# All audited official clients expose a 60s plugin runtime budget. Core must not
# silently impose the historical 25s TV / 30s other-provider cutoff underneath
# that host contract. A single Core provider budget is therefore 60s by default.
rendered = mod.apply(BASE, options={"semantic_types": ["movie", "tv", "anime"]})
data = decode_managed_data(rendered, "CORE.MEDIA_TYPE_RESOLUTION.V1")
assert data["providerTimeoutMs"] == 60_000, data
assert data["tvProviderTimeoutMs"] == 60_000, data
assert data["providerTimeoutMs"] == data["tvProviderTimeoutMs"], data
assert data["revision"] == "tmdb-data-contract-launch-gate-v30-unified-60s-budget", data

# Explicit smaller budgets remain available to deterministic cancellation unit
# tests and controlled diagnostics; the consolidation changes the canonical
# default, not the cancellation mechanism itself.
explicit = mod.apply(
    BASE,
    options={
        "semantic_types": ["movie"],
        "provider_timeout_ms": 10_000,
        "tv_provider_timeout_ms": 10_000,
    },
)
explicit_data = decode_managed_data(explicit, "CORE.MEDIA_TYPE_RESOLUTION.V1")
assert explicit_data["providerTimeoutMs"] == 10_000, explicit_data
assert explicit_data["tvProviderTimeoutMs"] == 10_000, explicit_data

# The generated JS fallback must agree with the serialized configuration. This
# prevents a future partial edit from reintroducing a hidden 25/30s authority.
assert "Number(c.tvProviderTimeoutMs||60000)" in rendered
assert "Number(c.providerTimeoutMs||60000)" in rendered
assert "||25000" not in rendered
assert "||30000" not in rendered

print("Core provider execution budget contract passed")
