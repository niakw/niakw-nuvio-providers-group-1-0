#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"automation/provider-v3-architecture.json").read_text(encoding="utf-8"))
routine=(ROOT/".github/workflows/sync.yml").read_text(encoding="utf-8")
brain=(ROOT/".github/workflows/brain-learning-lab.yml").read_text(encoding="utf-8")
repair=(ROOT/".github/workflows/provider-recognition-repair-v6.yml").read_text(encoding="utf-8")
manual=(ROOT/".github/workflows/provider-v3-reconstruct-all.yml").read_text(encoding="utf-8")
domain=(ROOT/".github/workflows/domain-refresh.yml").read_text(encoding="utf-8")
nonreg=(ROOT/".github/workflows/provider-non-regression.yml").read_text(encoding="utf-8")
legacy_core=ROOT/".github/workflows/core-media-finalize-main.yml"

assert not legacy_core.exists(), "legacy duplicate Core finalizer workflow must stay deleted"
assert routine.startswith("name: CORE - Verify & Publish")
assert routine.count("schedule:")==1
assert "47 4 * * 2,5" in routine
assert "MODE=deep" in routine
assert "Deep gate - full structural contracts" in routine
assert "Deep - reproject manifests and integrity inventories" in routine

for mode in ("quick","deep"):
    assert policy["routine"][mode]["repair_allowed"] is False
    assert policy["routine"][mode]["provider_fix_mutation_allowed"] is False
    assert policy["routine"][mode]["provider_reconstruction_allowed"] is False

for forbidden in (
    "run_adaptive_deep_repair.py",
    "run_adaptive_quick_repair.py",
    "promote_candidates.py",
    "promote_refresh_candidates.py",
    "materialize_provider_v3_all.py",
    "verify_provider_v3_reverse_rebuild.py",
    "--apply",
):
    assert forbidden not in routine, f"routine workflow must not mutate/reconstruct providers: {forbidden}"

assert "audit_provider_v3_static.py" in routine
assert "build_published_provider_stage.py" in routine
assert "build_observational_health_report.py" in routine

# Brain owns broad evidence/memory/proposal learning. It is no longer the
# executable authority for provider route recognition/correction.
for required in ("run_brain_learning_queue.py","build_brain_repair_proposal.py","brain-repair/proposal"):
    assert required in brain, f"Brain lost evidence/proposal ownership: {required}"
assert "--include-disabled" in brain or "including disabled providers" in brain

# Provider recognition/correction has one implementation for Repair, scheduled
# Learn and explicit Force. The workflow chooses a mode, but every mode invokes
# this exact script and therefore the same proof/correction gates.
assert repair.startswith("name: LEARN/FORCE - Provider Recognition Repair V6")
assert repair.count('scripts/run_provider_repair_pipeline_v6.py --mode "$MODE"') == 1
for required in (
    "MODE=learn",
    "MODE=repair",
    "DISPATCH_MODE:-force",
    "provider-repair-skip.json",
    "Verify known-green providers were not network re-probed",
    "Enforce four-version floor on repair candidate",
    "python scripts/build_provider_history_matrix_v3.py",
    "python scripts/check_provider_non_regression_v1.py --candidate-gate --all --base-ref HEAD",
):
    assert required in repair, f"canonical provider repair workflow missing: {required}"
pipeline=(ROOT/"scripts/run_provider_repair_pipeline_v6.py").read_text(encoding="utf-8")
for required in (
    "recover_provider_routes_from_upstreams.py",
    "merge_provider_repair_report_v6.py",
    "apply_provider_route_recovery_report.py",
    "materialize_provider_base_v3_store.py",
    "materialize_provider_v3_all.py",
    "audit_provider_repair_yield_v6.py",
    "--require-upstream-positive-preserved",
):
    assert required in pipeline, f"canonical provider repair pipeline missing: {required}"
assert '"publicationAllowed": False' in pipeline
assert '"mainWritesAllowed": False' in pipeline

for required in ("materialize_provider_v3_all.py","verify_provider_v3_reverse_rebuild.py","96"):
    assert required in manual
assert "Refuse direct main mutation" in manual
assert "NUVIO_PROVIDER_V3_CONTEXT: workspace" in manual

# Domain refresh owns only authoritative hub -> official_site/history publication.
# Terminal DNS/HTTP reachability is observation-only and must never gate the hub declaration.
assert "refresh_authoritative_hub_domains.py" in domain
assert "--apply" in domain
assert "--domain-only" not in domain, "legacy terminal-gated domain updater must not own hub publication"
assert "continue-on-error: true" in domain
assert "provider_dns_preflight.mjs" in domain
assert "update_provider_v3_domain_config.py" in domain
assert "audit_provider_v3_static.py" in domain
assert "materialize_provider_v3_all.py" not in domain
assert "verify_provider_v3_reverse_rebuild.py" not in domain

# Non-regression owns the exact four-version ledger plus the rolling accepted
# quick-yield publication floor. Repair is allowed to propose/correct only if its
# non-Learn candidate subsequently satisfies the exact same 96-provider floor.
assert nonreg.startswith("name: Provider Non-Regression Gate")
for required in (
    "build_provider_history_matrix_v3.py",
    "check_provider_non_regression_v1.py",
    "audit_provider_quick_yield.py",
    "--candidate-gate",
    "provider-v3-quick-yield.json",
    "provider-non-regression-gate.json",
    "workbench/systemic-recovery-20260909",
):
    assert required in nonreg, f"non-regression ownership missing: {required}"
assert "pull_request:" in nonreg
assert "--all" in nonreg, "workbench/global verification must exercise the complete 96-provider portfolio"

print("provider v3 workflow ownership contract passed: CORE verify-only + Brain evidence + one provider repair v6 engine + four-version non-regression gate")
