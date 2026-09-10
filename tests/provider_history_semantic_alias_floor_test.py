#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "build_provider_history_matrix_v3.py"
spec = importlib.util.spec_from_file_location("niakvio_provider_history_v3", MODULE_PATH)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
normalize_historical_semantic_types = module.normalize_historical_semantic_types


def norm(values: set[str], current: set[str], transport: set[str], verified: set[str]) -> tuple[set[str], bool]:
    return normalize_historical_semantic_types(
        values,
        current_semantic=current,
        current_transport=transport,
        historical_verified_lanes=verified,
    )


# Legacy anime manifests temporarily stored the Nuvio tv invocation alias in
# canonicalSupportedTypes. Without independent TV proof this is transport
# compatibility, not a semantic capability that publication must preserve.
values, reclassified = norm(
    {"anime", "tv"},
    {"anime"},
    {"anime", "tv"},
    set(),
)
assert values == {"anime"}
assert reclassified is True

# A genuinely verified historical TV lane remains protected.
values, reclassified = norm(
    {"anime", "tv"},
    {"anime"},
    {"anime", "tv"},
    {"tv"},
)
assert values == {"anime", "tv"}
assert reclassified is False

# If TV is still a current canonical semantic capability it is never demoted.
values, reclassified = norm(
    {"anime", "tv"},
    {"anime", "tv"},
    {"anime", "tv"},
    set(),
)
assert values == {"anime", "tv"}
assert reclassified is False

# Movie is unrelated to the anime<->tv transport alias and must never be lost.
values, reclassified = norm(
    {"anime", "movie", "tv"},
    {"anime", "movie"},
    {"anime", "movie", "tv"},
    set(),
)
assert values == {"anime", "movie"}
assert reclassified is True

print("provider history semantic alias floor tests passed: anime tv transport alias normalized, proven TV preserved")
