#!/usr/bin/env python3
"""Canonical proof-first recognition/correction pipeline for unresolved providers."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
DEFAULT_SKIP = ROOT / "automation" / "provider-repair-skip.json"
TARGET_REPORT = ROOT / "automation" / "provider-route-recovery-v6-targeted.json"
MERGED_REPORT = ROOT / "automation" / "provider-route-recovery-v6.json"
YIELD_REPORT = ROOT / "automation" / "provider-repair-yield-v6.json"
SUMMARY = ROOT / "automation" / "provider-repair-v6-summary.json"
QUICK_YIELD = ROOT / "provider-v3-quick-yield.json"
PORTFOLIO_BASELINE = ROOT / "automation" / "provider-repair-portfolio-baseline.json"
PORTFOLIO_CANDIDATE = ROOT / "automation" / "provider-repair-portfolio-candidate.json"
PORTFOLIO_RETRY = ROOT / "automation" / "provider-repair-portfolio-retry.json"
PORTFOLIO_LOSSES = ROOT / "automation" / "provider-repair-portfolio-losses.json"
DISPOSITION = ROOT / "automation" / "provider-repair-disposition.json"
RUNTIME_PLAN_LKG = Path(os.environ.get("RUNNER_TEMP") or (ROOT / "automation")) / "provider-runtime-plan-lkg-v1.json"


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(path)
    return value


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def run(*args: str, timeout: int | None = None) -> None:
    print("FIELD_PROVIDER_REPAIR_CMD " + " ".join(args), flush=True)
    subprocess.run(list(args), cwd=ROOT, env=os.environ.copy(), check=True, timeout=timeout)


def capture_portfolio_yield(destination: Path) -> dict[str, Any]:
    run(sys.executable, "scripts/audit_provider_quick_yield.py")
    if not QUICK_YIELD.exists():
        raise RuntimeError("quick-yield audit did not produce provider-v3-quick-yield.json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(QUICK_YIELD, destination)
    report = load(destination)
    print(
        "FIELD_PROVIDER_REPAIR_PORTFOLIO "
        f"file={destination.name} raw={int(report.get('raw_provider_count') or 0)} "
        f"playable={int(report.get('playable_provider_count') or 0)} "
        f"verified={int(report.get('verified_provider_count') or 0)} "
        f"wrong={int(report.get('wrong_content_provider_count') or 0)}",
        flush=True,
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("repair", "learn", "force"), default="repair")
    parser.add_argument("--skip-file", type=Path, default=DEFAULT_SKIP.relative_to(ROOT))
    parser.add_argument("--provider", action="append", default=[])
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=55)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--allow-upstream-positive-loss", action="store_true")
    args = parser.parse_args()

    manifest = load(MANIFEST)
    skip_path = args.skip_file if args.skip_file.is_absolute() else ROOT / args.skip_file
    skip_cfg = load(skip_path)
    skipped = {cid(value) for value in (skip_cfg.get("providers") or {}).keys() if cid(value)}
    catalogue = [cid(row.get("id")) for row in manifest.get("scrapers") or [] if isinstance(row, dict) and cid(row.get("id"))]
    if len(catalogue) != 96 or len(set(catalogue)) != 96:
        raise SystemExit(f"provider catalogue must be exactly 96, got {len(catalogue)}")
    requested = {cid(value) for value in args.provider if cid(value)}
    targets = [provider for provider in catalogue if provider not in skipped and (not requested or provider in requested)]
    if not targets:
        raise SystemExit("no unresolved provider selected for repair")

    attempts = max(1, min(int(args.attempts), 4))
    print(
        "FIELD_PROVIDER_REPAIR_SCOPE "
        f"mode={args.mode} catalogue=96 targeted={len(targets)} skipped_green={len(skipped)} "
        f"attempts={attempts} providers={','.join(targets)}",
        flush=True,
    )

    baseline_portfolio = capture_portfolio_yield(PORTFOLIO_BASELINE)
    run(
        sys.executable,
        "scripts/provider_runtime_plan_lkg_v1.py",
        "capture",
        "--baseline", str(PORTFOLIO_BASELINE.relative_to(ROOT)),
    )

    # This order is canonical. V16 (chained by base runtime V11) requires Source
    # Plan V15. V17 then builds on V16, while V21.8 cumulatively chains V18-V21.7
    # before the live recovery census. Do not reorder these migrations.
    migrations = [
        "scripts/prepatch_identity_cleanup_shared_owner_v1.py",
        "scripts/apply_core_identity_ownership_cleanup.py",
        "scripts/upgrade_provider_worker_route_proof_v1.py",
        "scripts/upgrade_provider_base_runtime_v5.py",
        "scripts/upgrade_provider_base_route_requests_v1.py",
        "scripts/upgrade_provider_route_authority_v5.py",
        "scripts/upgrade_route_recovery_request_specs_v1.py",
        "scripts/upgrade_provider_v3_source_plan_v5.py",
        "scripts/upgrade_provider_repair_v6.py",
        "scripts/upgrade_provider_repair_v7.py",
        "scripts/upgrade_provider_repair_v8.py",
        "scripts/upgrade_provider_text_body_request_v9.py",
        "scripts/upgrade_provider_text_body_request_v9_1.py",
        "scripts/upgrade_provider_source_plan_v10.py",
        "scripts/upgrade_provider_external_identity_route_v11_1.py",
        "scripts/upgrade_provider_source_plan_v12.py",
        "scripts/upgrade_provider_route_plan_v13_2.py",
        "scripts/upgrade_provider_search_request_plan_v14.py",
        "scripts/upgrade_provider_search_request_plan_v14_1.py",
        "scripts/upgrade_provider_source_plan_v15.py",
        "scripts/upgrade_provider_route_retry_v1.py",
        "scripts/upgrade_provider_base_runtime_v11.py",
        "scripts/upgrade_provider_search_detail_bridge_v17.py",
        "scripts/upgrade_provider_composite_request_template_v21_8.py",
        "scripts/upgrade_stream_sanitizer_v7_selection.py",
    ]
    for migration in migrations:
        run(sys.executable, migration)

    run("node", "--check", "scripts/provider_worker.cjs")
    for test in (
        "tests/provider_route_proof_authority_test.py",
        "tests/provider_repair_v6_recipe_regression_test.py",
        "tests/provider_repair_merge_typed_recipe_test.py",
        "tests/provider_repair_v7_typed_resolver_test.py",
        "tests/provider_repair_v8_partial_typed_resolver_test.py",
        "tests/provider_text_body_request_v9_test.py",
        "tests/provider_source_plan_v10_regression_test.py",
        "tests/provider_external_identity_route_v11_test.py",
        "tests/provider_source_plan_v12_regression_test.py",
        "tests/provider_route_plan_v13_regression_test.py",
        "tests/provider_search_request_plan_v14_contract_test.py",
        "tests/provider_search_request_plan_v14_1_contract_test.py",
        "tests/provider_source_plan_v15_contract_test.py",
        "tests/provider_execution_authority_v16_contract_test.py",
        "tests/provider_composite_request_template_v21_8_test.py",
        "tests/stream_output_correlated_player_fallback_v7_test.py",
        "tests/global_identity_policy_ownership_test.py",
        "tests/provider_latest_request_cancellation_test.py",
        "tests/provider_native_abort_ignorant_cancellation_test.py",
        "tests/provider_quick_yield_fixture_selection_test.py",
        "tests/provider_runtime_plan_lkg_v1_test.py",
        "tests/provider_external_drift_preservation_test.py",
    ):
        run(sys.executable, test)

    cmd = [
        sys.executable, "scripts/recover_provider_routes_from_upstreams.py",
        "--workers", str(max(1, min(args.workers, 12))),
        "--timeout", str(max(15, min(args.timeout, 120))),
        "--attempts", str(attempts),
        "--out", str(TARGET_REPORT.relative_to(ROOT)),
    ]
    for provider in targets:
        cmd.extend(["--provider", provider])
    run(*cmd, timeout=max(1200, len(targets) * max(15, args.timeout) * attempts))

    run(sys.executable, "scripts/merge_provider_repair_report_v6.py", "--baseline", "automation/provider-route-recovery-v5.json", "--targeted", str(TARGET_REPORT.relative_to(ROOT)), "--output", str(MERGED_REPORT.relative_to(ROOT)))
    run(sys.executable, "scripts/apply_provider_route_recovery_report.py", str(MERGED_REPORT.relative_to(ROOT)))
    run(
        sys.executable,
        "scripts/provider_runtime_plan_lkg_v1.py",
        "apply",
    )
    run(sys.executable, "scripts/enforce_route_proof_manifest_policy_v1.py", "--report", str(MERGED_REPORT.relative_to(ROOT)), "--manifest", "manifest.json", "--overrides", "provider-overrides.json")

    run(sys.executable, "scripts/materialize_provider_base_v3_store.py")
    run(sys.executable, "scripts/materialize_provider_v3_all.py")
    run(sys.executable, "scripts/generate_language_manifests.py", "--manifest", "manifest.json", "--report", "health-report.json")
    run(sys.executable, "scripts/validate_published_provider_config.py", "--expected", "96")

    for test in (
        "tests/provider_js_lego_ownership_test.py",
        "tests/global_stream_output_guard_test.py",
        "tests/episodic_identity_runtime_test.py",
        "tests/episodic_year_identity_regression_test.py",
        "tests/global_media_type_pre_network_gate_test.py",
        "tests/global_media_type_resolution_test.py",
        "tests/native_dual_id_identity_test.py",
        "tests/global_stream_presentation_test.py",
        "tests/global_stream_presentation_pipeline_test.py",
    ):
        run(sys.executable, test)

    candidate_portfolio = capture_portfolio_yield(PORTFOLIO_CANDIDATE)

    # Activation finalization is deliberately after the real candidate census.
    # Broken/incomplete providers become enabled=false while their learned DATA is
    # retained and explicitly classified repair/off for later Learning/Repair.
    run(
        sys.executable,
        "scripts/finalize_provider_repair_disposition_v1.py",
        "--recovery", str(TARGET_REPORT.relative_to(ROOT)),
        "--quick-yield", str(QUICK_YIELD.relative_to(ROOT)),
    )
    run(sys.executable, "scripts/generate_language_manifests.py", "--manifest", "manifest.json", "--report", "health-report.json")
    run(sys.executable, "scripts/validate_published_provider_config.py", "--expected", "96")
    run(sys.executable, "tests/provider_v3_strategy_plan_contract_test.py")

    PORTFOLIO_RETRY.unlink(missing_ok=True)
    PORTFOLIO_LOSSES.unlink(missing_ok=True)
    preliminary_cmd = [
        sys.executable,
        "scripts/compare_quick_yield_preservation.py",
        "--baseline", str(PORTFOLIO_BASELINE.relative_to(ROOT)),
        "--candidate", str(PORTFOLIO_CANDIDATE.relative_to(ROOT)),
        "--losses-output", str(PORTFOLIO_LOSSES.relative_to(ROOT)),
    ]
    subprocess.run(preliminary_cmd, cwd=ROOT, env=os.environ.copy(), check=False)
    losses = load(PORTFOLIO_LOSSES).get("providers") if PORTFOLIO_LOSSES.exists() else []
    losses = [cid(value) for value in losses or [] if cid(value)]
    if losses and attempts > 1:
        retry_attempts = min(max(attempts - 1, 1), 3)
        run(
            sys.executable,
            "scripts/audit_provider_quick_yield_targeted.py",
            "--providers-json", str(PORTFOLIO_LOSSES.relative_to(ROOT)),
            "--output", str(PORTFOLIO_RETRY.relative_to(ROOT)),
            "--attempts", str(retry_attempts),
        )

    final_portfolio_cmd = [
    sys.executable,
    "scripts/compare_quick_yield_preservation.py",
    "--baseline", str(PORTFOLIO_BASELINE.relative_to(ROOT)),
    "--candidate", str(PORTFOLIO_CANDIDATE.relative_to(ROOT)),
    "--baseline-runtime-lkg", str(RUNTIME_PLAN_LKG),
    "--manifest", str(MANIFEST.relative_to(ROOT)),
    "--disposition", str(DISPOSITION.relative_to(ROOT)),
    "--root", ".",
    "--losses-output", str(PORTFOLIO_LOSSES.relative_to(ROOT)),
]
    if PORTFOLIO_RETRY.exists():
        final_portfolio_cmd.extend(["--candidate-retry", str(PORTFOLIO_RETRY.relative_to(ROOT))])
    portfolio_proc = subprocess.run(final_portfolio_cmd, cwd=ROOT, env=os.environ.copy(), check=False)

    yield_cmd = [sys.executable, "scripts/audit_provider_repair_yield_v6.py", "--recovery", str(TARGET_REPORT.relative_to(ROOT)), "--skip-file", str(skip_path.relative_to(ROOT) if skip_path.is_relative_to(ROOT) else skip_path), "--output", str(YIELD_REPORT.relative_to(ROOT))]
    if not args.allow_upstream_positive_loss:
        yield_cmd.append("--require-upstream-positive-preserved")
    yield_proc = subprocess.run(yield_cmd, cwd=ROOT, env=os.environ.copy(), check=False)

    targeted_report = load(TARGET_REPORT)
    merged_report = load(MERGED_REPORT)
    yield_report = load(YIELD_REPORT) if YIELD_REPORT.exists() else {}
    retry_report = load(PORTFOLIO_RETRY) if PORTFOLIO_RETRY.exists() else {}
    disposition_report = load(DISPOSITION) if DISPOSITION.exists() else {}
    summary = {
        "schemaVersion": 11,
        "mode": args.mode,
        "publicationAllowed": False,
        "mainWritesAllowed": False,
        "catalogueProviderCount": 96,
        "skippedAlreadyGreenProviders": sorted(skipped),
        "targetedProviderCount": len(targets),
        "targetedProviders": targets,
        "maxAttemptsPerTask": attempts,
        "routePlanRevision": "v21.8",
        "targetedProvidersWithProvenRoutes": int(targeted_report.get("providersWithProvenRoutes") or 0),
        "targetedProvenRoutes": int(targeted_report.get("provenRouteCount") or 0),
        "mergedProvidersWithProvenRoutes": int(merged_report.get("providersWithProvenRoutes") or 0),
        "mergedProvenRoutes": int(merged_report.get("provenRouteCount") or 0),
        "postRepairPlayableProviders": yield_report.get("playableProviders") or [],
        "postRepairVerifiedProviders": yield_report.get("verifiedProviders") or [],
        "lostUpstreamPositivePairs": yield_report.get("lostUpstreamPositivePairs") or [],
        "upstreamPositivePreservationGatePassed": yield_proc.returncode == 0,
        "portfolioBaselineRawProviders": baseline_portfolio.get("raw_providers") or [],
        "portfolioBaselinePlayableProviders": baseline_portfolio.get("playable_providers") or [],
        "portfolioBaselineVerifiedProviders": baseline_portfolio.get("verified_providers") or [],
        "portfolioCandidateRawProviders": candidate_portfolio.get("raw_providers") or [],
        "portfolioCandidatePlayableProviders": candidate_portfolio.get("playable_providers") or [],
        "portfolioCandidateVerifiedProviders": candidate_portfolio.get("verified_providers") or [],
        "portfolioRetriedProviders": retry_report.get("providers") or [],
        "portfolioPreservationGatePassed": portfolio_proc.returncode == 0,
        "repairDispositionStateCounts": disposition_report.get("stateCounts") or {},
        "disabledProviderCount": int(disposition_report.get("disabledProviderCount") or 0),
        "activeBrokenProviderAllowed": False,
        "preservationGatePassed": yield_proc.returncode == 0 and portfolio_proc.returncode == 0,
    }
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "FIELD_PROVIDER_REPAIR_V6_FINAL "
        f"mode={args.mode} revision=v21.8 targeted={len(targets)} targeted_proven={summary['targetedProvidersWithProvenRoutes']} "
        f"playable={len(summary['postRepairPlayableProviders'])} verified={len(summary['postRepairVerifiedProviders'])} "
        f"disabled={summary['disabledProviderCount']} lost={len(summary['lostUpstreamPositivePairs'])} "
        f"upstream_gate={str(summary['upstreamPositivePreservationGatePassed']).lower()} "
        f"portfolio_gate={str(summary['portfolioPreservationGatePassed']).lower()} "
        f"preservation_gate={str(summary['preservationGatePassed']).lower()} active_broken=false"
    )
    return 0 if summary["preservationGatePassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
