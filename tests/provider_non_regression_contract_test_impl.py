#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "scripts" / "build_provider_history_matrix.py"
V3 = ROOT / "scripts" / "build_provider_history_matrix_v3.py"
GATE = ROOT / "scripts" / "check_provider_non_regression_v1.py"
MEDIA_PATCH = ROOT / "scripts" / "provider_patches" / "global_media_type_resolution_v1.py"
REPAIR_PIPELINE = ROOT / "scripts" / "run_provider_repair_pipeline_v6.py"
FINALIZER = ROOT / "scripts" / "finalize_provider_repair_disposition_v1.py"
FAST_GATE_TEST = ROOT / "tests" / "global_media_type_pre_network_gate_test.py"
HISTORY_WF = ROOT / ".github" / "workflows" / "provider-history-matrix.yml"
NONREG_WF = ROOT / ".github" / "workflows" / "provider-non-regression.yml"
SYNC_WF = ROOT / ".github" / "workflows" / "sync.yml"
OWNERSHIP = ROOT / "tests" / "provider_v3_workflow_ownership_test.py"

for path in (V1, V3, GATE, MEDIA_PATCH, REPAIR_PIPELINE, FINALIZER, FAST_GATE_TEST, HISTORY_WF, NONREG_WF, SYNC_WF, OWNERSHIP):
    assert path.exists(), f"missing anti-regression contract file: {path.relative_to(ROOT)}"

v1 = V1.read_text(encoding="utf-8")
v3 = V3.read_text(encoding="utf-8")
gate = GATE.read_text(encoding="utf-8")
media_patch = MEDIA_PATCH.read_text(encoding="utf-8")
repair_pipeline = REPAIR_PIPELINE.read_text(encoding="utf-8")
finalizer = FINALIZER.read_text(encoding="utf-8")
fast_gate_test = FAST_GATE_TEST.read_text(encoding="utf-8")
history = HISTORY_WF.read_text(encoding="utf-8")
nonreg = NONREG_WF.read_text(encoding="utf-8")
sync = SYNC_WF.read_text(encoding="utf-8")
ownership = OWNERSHIP.read_text(encoding="utf-8")

for token in ('"5.21.0"', '"5.21.16"', '"5.21.36"'):
    assert token in v3, f"V3 historical ledger lost checkpoint {token}"
assert '"crossVersionFallbackAllowed": False' in v3
assert '"historicalGreenMayBecomeUnknownSilently": False' in v3
assert "historical_lanes = verified_lanes(row.get(\"historical52136\") or {})" in v3
assert "baseline = lanes_from_rows(by36.get(pid) or qrows)" not in v1
assert "baseline = lanes_from_rows(by36.get(pid) or [])" in v1

for token in (
    "def canonical_semantic_types(",
    "def transport_types(",
    'source = "canonicalSupportedTypes" if values else "unproven-transport-only"',
    '"historicalSemanticTypeSources"',
    '"historicalTransportTypes"',
    '"historicalTransportTypesMayCreateSemanticFloor": False',
):
    assert token in v3, f"historical semantic/transport separation lost: {token}"
assert "values = canonical_semantic_types(manifest_row)" in v3
assert "type_floor = set().union(*(set(values) for values in historical_types.values()))" in v3

assert 'git_json(base_ref, "provider-v3-quick-yield.json")' in gate
assert "required_lanes = historical_specific | rolling" in gate
assert "historical_positive_without_candidate_verified_lane" in gate
assert "semantic_capability_regression" in gate
assert "historical_hls_m3u8_regression" in gate
assert "--candidate-gate" in gate
assert "--all" in gate

for token in (
    'str(row.get("nonRegressionStatus") or "") == "PARTIAL_REGRESSION"',
    'row.get("explicitCurrentFailedLanes")',
    'unrecovered_partial = sorted(partial_failed - got)',
    '"partial_regression_not_recovered"',
    '"partialRegressionFailedLanes"',
    '"unrecoveredPartialRegressionLanes"',
    '"candidateLaneStatuses"',
):
    assert token in gate, f"partial-lane non-regression gate lost: {token}"

# Historical proof debt may be accepted only by removing the broken provider from
# active execution. This exception may never hide semantic/HLS contract deletion.
for token in (
    "def current_activation_debt()",
    'disposition.get("authority") == "provider-repair-disposition-v1"',
    'disposition.get("activationState") == "disabled"',
    'state in {"repair", "off"}',
    '"disabledDebtAccepted"',
    '"disabledDebtProviders"',
    '"semantic_capability_regression"',
    '"historical_hls_m3u8_regression"',
):
    assert token in gate, f"disabled-debt non-regression policy lost: {token}"
assert 'manifest_row["enabled"] = enabled' in finalizer
assert 'route_state = "repair"' in finalizer
assert 'route_state = "off"' in finalizer
assert '"activeBrokenProviderAllowed": False' in finalizer

for token in (
    '"core/"',
    '"lego/"',
    '"runtime/"',
    '"scripts/build_provider_"',
    '"scripts/materialize_provider_"',
    '".github/workflows/"',
):
    assert token in gate, f"global non-regression scope lost shared path {token}"
assert "if shared:" in gate and "return ids, changed, True" in gate

assert "semantic.length===1)type=semantic[0]" not in media_patch
for token in (
    'if(raw==="anime"&&!hasAnime)return null;',
    'if(type==="movie"&&!hasMovie&&!hasAnime)return null;',
    'if(type==="tv"&&!hasTv&&!hasAnime)return null;',
):
    assert token in media_patch, f"pre-network semantic fast gate lost: {token}"
for token in (
    'assert_pre_network_reject(["tv"], "movie"',
    'assert_pre_network_reject(["movie"], "series"',
    'assert_pre_network_reject(["movie", "tv"], "anime"',
):
    assert token in fast_gate_test, f"pre-network fast-gate regression case lost: {token}"
assert "python tests/global_media_type_pre_network_gate_test.py" in sync
assert '"tests/global_media_type_pre_network_gate_test.py",' in repair_pipeline
assert "python tests/global_media_type_pre_network_gate_test.py" in nonreg

assert "build_provider_history_matrix_v3.py" in history
assert "python scripts/build_provider_history_matrix_v3.py" in history
assert "python scripts/build_provider_history_matrix_v2.py\n" not in history

for token in (
    "python scripts/build_provider_history_matrix_v3.py",
    "python scripts/check_provider_non_regression_v1.py",
    "python scripts/audit_provider_quick_yield.py",
    "python tests/global_media_type_pre_network_gate_test.py",
    "--candidate-gate",
    "provider-v3-quick-yield.json",
    "provider-non-regression-gate.json",
):
    assert token in nonreg, f"provider non-regression workflow missing {token}"
assert "workbench/systemic-recovery-20260909" in nonreg
assert "pull_request:" in nonreg
assert "provider-non-regression.yml" in ownership
assert "check_provider_non_regression_v1.py" in ownership

print("provider non-regression contract passed: exact 4-state ledger + no legacy fallback + canonical semantic floor + semantic fast gate + explicit disabled repair/off debt + rolling 96-provider floor")
