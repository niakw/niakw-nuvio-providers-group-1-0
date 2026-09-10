#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MATRIX = ROOT / "automation" / "provider-history-matrix.json"
DEFAULT_CANDIDATE = ROOT / "provider-v3-quick-yield.json"
DEFAULT_OUT = ROOT / "automation" / "provider-non-regression-gate.json"
CURRENT_MANIFEST = ROOT / "manifest.json"
CURRENT_OVERRIDES = ROOT / "provider-overrides.json"
EXPECTED = 96
HISTORY = ("5.21.0", "5.21.16", "5.21.36")
GREEN = "🟢"


def canon(value: Any) -> str:
    return str(value or "").strip().casefold()


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(path)
    return value


def git_text(ref: str, path: str) -> str:
    proc = subprocess.run(
        ["git", "show", f"{ref}:{path}"], cwd=ROOT, text=True,
        capture_output=True, check=False,
    )
    return proc.stdout if proc.returncode == 0 else ""


def git_json(ref: str, path: str) -> dict[str, Any]:
    raw = git_text(ref, path)
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def lane_statuses_from_quick(data: dict[str, Any]) -> dict[str, dict[str, set[str]]]:
    out: dict[str, dict[str, set[str]]] = {}
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        pid = canon(row.get("provider_id") or row.get("provider"))
        lane = canon(row.get("semantic_type") or row.get("media_type") or row.get("type"))
        status = canon(row.get("status"))
        if pid and lane and status:
            out.setdefault(pid, {}).setdefault(lane, set()).add(status)
    return out


def verified_lanes_from_quick(data: dict[str, Any]) -> dict[str, set[str]]:
    statuses = lane_statuses_from_quick(data)
    return {
        pid: {lane for lane, lane_states in lanes.items() if "playable_verified" in lane_states}
        for pid, lanes in statuses.items()
    }


def provider_ids(matrix: dict[str, Any]) -> list[str]:
    return sorted({canon(row.get("provider")) for row in matrix.get("providers") or [] if canon(row.get("provider"))})


def matrix_rows(matrix: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        canon(row.get("provider")): row
        for row in matrix.get("providers") or []
        if isinstance(row, dict) and canon(row.get("provider"))
    }


def current_activation_debt() -> dict[str, dict[str, Any]]:
    manifest = load(CURRENT_MANIFEST)
    overrides = load(CURRENT_OVERRIDES)
    rows = {
        canon(row.get("id")): row
        for row in manifest.get("scrapers") or []
        if isinstance(row, dict) and canon(row.get("id"))
    }
    patches = overrides.get("provider_patches") if isinstance(overrides.get("provider_patches"), dict) else {}
    out: dict[str, dict[str, Any]] = {}
    for pid, row in rows.items():
        patch = patches.get(pid) if isinstance(patches.get(pid), dict) else {}
        disposition = patch.get("repair_disposition") if isinstance(patch.get("repair_disposition"), dict) else {}
        state = canon(disposition.get("routeDataState"))
        audited = (
            row.get("enabled") is False
            and disposition.get("authority") == "provider-repair-disposition-v1"
            and disposition.get("activationState") == "disabled"
            and state in {"repair", "off"}
            and disposition.get("completeCapabilityProof") is False
            and isinstance(disposition.get("missingLanes"), list)
            and bool(disposition.get("missingLanes"))
            and isinstance(disposition.get("reasonCodes"), list)
            and bool(disposition.get("reasonCodes"))
        )
        if audited:
            out[pid] = disposition
    return out


def diff_paths(base_ref: str) -> list[str]:
    proc = subprocess.run(
        ["git", "diff", "--name-only", f"{base_ref}...HEAD"],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if proc.returncode != 0:
        proc = subprocess.run(
            ["git", "diff", "--name-only", base_ref, "HEAD"],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
    if proc.returncode != 0:
        raise SystemExit(f"cannot derive changed paths against {base_ref}: {proc.stderr.strip()}")
    return sorted({line.strip() for line in proc.stdout.splitlines() if line.strip()})


GLOBAL_PREFIXES = (
    "core/",
    "lego/",
    "runtime/",
    "provider-base/",
    "provider_base/",
    "scripts/core_",
    "scripts/build_provider_",
    "scripts/materialize_provider_",
    "scripts/audit_provider_quick_yield.py",
    "scripts/resolve_",
    "scripts/run_provider_repair_pipeline",
    "automation/provider-v3-architecture.json",
    "automation/provider-type-policy.json",
    ".github/workflows/",
)
GLOBAL_EXACT = {
    "manifest.json",
    "provider-v3-quick-yield.json",
    "package.json",
    "package-lock.json",
}


def changed_scope(matrix: dict[str, Any], base_ref: str, force_all: bool) -> tuple[list[str], list[str], bool]:
    ids = provider_ids(matrix)
    if force_all:
        return ids, ["--all"], True

    changed = diff_paths(base_ref)
    shared = any(path in GLOBAL_EXACT or path.startswith(GLOBAL_PREFIXES) for path in changed)
    if shared:
        return ids, changed, True

    impacted: set[str] = set()
    known = set(ids)
    for path in changed:
        p = Path(path)
        stem = canon(p.stem)
        if stem in known:
            impacted.add(stem)
        if path.startswith("providers/") and stem in known:
            impacted.add(stem)
        if path.startswith("providers-v3/") and stem in known:
            impacted.add(stem)
    return sorted(impacted), changed, False


def ledger_failures(matrix: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if int(matrix.get("schemaVersion") or 0) != 3:
        failures.append("matrix schemaVersion must be 3")
    if int(matrix.get("providerCount") or 0) != EXPECTED:
        failures.append(f"matrix providerCount must be {EXPECTED}")

    policy = matrix.get("nonRegressionPolicy") or {}
    if list(policy.get("history") or []) != list(HISTORY):
        failures.append("matrix history must be exact 5.21.0 -> 5.21.16 -> 5.21.36")
    if policy.get("crossVersionFallbackAllowed") is not False:
        failures.append("cross-version evidence fallback must be forbidden")
    if policy.get("historicalGreenMayBecomeUnknownSilently") is not False:
        failures.append("historical green -> unknown may not pass silently")
    if policy.get("historicalTransportTypesMayCreateSemanticFloor") is not False:
        failures.append("historical transport aliases may not create a semantic capability floor")

    rows = matrix_rows(matrix)
    if len(rows) != EXPECTED:
        failures.append(f"matrix must contain {EXPECTED} unique provider rows, got {len(rows)}")

    for pid, row in rows.items():
        states = row.get("snapshotStates") or {}
        historical_green = any((states.get(version) or {}).get("icon") == GREEN for version in HISTORY)
        status = str(row.get("nonRegressionStatus") or "")
        required = bool(row.get("publicationProofRequired"))
        if historical_green and status not in {"PRESERVED"} and not required:
            failures.append(f"{pid}: historical positive provider lost proof without publicationProofRequired")
        drift = row.get("contractDrift")
        if not isinstance(drift, dict):
            failures.append(f"{pid}: missing contractDrift ledger")
    return failures


def candidate_gate(
    matrix: dict[str, Any], candidate: dict[str, Any], base_ref: str,
    force_all: bool,
) -> dict[str, Any]:
    rows = matrix_rows(matrix)
    scope, changed, global_scope = changed_scope(matrix, base_ref, force_all)
    candidate_statuses = lane_statuses_from_quick(candidate)
    candidate_lanes = verified_lanes_from_quick(candidate)
    baseline_lanes = verified_lanes_from_quick(git_json(base_ref, "provider-v3-quick-yield.json"))
    activation_debt = current_activation_debt()

    obligations: dict[str, Any] = {}
    failures: list[dict[str, Any]] = []
    disabled_debt: list[str] = []

    for pid in scope:
        row = rows[pid]
        states = row.get("snapshotStates") or {}
        historical_positive_versions = [
            version for version in HISTORY if (states.get(version) or {}).get("icon") == GREEN
        ]
        historical_positive = bool(historical_positive_versions)
        historical_specific = {canon(x) for x in row.get("historicalVerifiedLanes") or [] if canon(x)}
        rolling = set(baseline_lanes.get(pid) or set())
        required_lanes = historical_specific | rolling
        got = set(candidate_lanes.get(pid) or set())
        missing = sorted(required_lanes - got)

        contract = row.get("contractDrift") or {}
        current_semantic = {canon(x) for x in contract.get("currentSemanticTypes") or [] if canon(x)}
        lost_types = sorted({canon(x) for x in contract.get("lostSemanticTypes") or [] if canon(x)})
        hls_lost = bool(contract.get("hlsM3u8Lost"))

        partial_failed = set()
        if str(row.get("nonRegressionStatus") or "") == "PARTIAL_REGRESSION":
            partial_failed = {
                canon(x) for x in row.get("explicitCurrentFailedLanes") or [] if canon(x)
            } & current_semantic
        unrecovered_partial = sorted(partial_failed - got)

        require_any = historical_positive and not required_lanes
        any_missing = require_any and not got
        debt = activation_debt.get(pid)
        debt_accepted = isinstance(debt, dict)
        debt_reasons: list[str] = []
        provider_failures: list[str] = []

        if missing:
            if debt_accepted:
                debt_reasons.append("missing_verified_lanes")
            else:
                provider_failures.append("missing_verified_lanes")
        if any_missing:
            if debt_accepted:
                debt_reasons.append("historical_positive_without_candidate_verified_lane")
            else:
                provider_failures.append("historical_positive_without_candidate_verified_lane")
        if unrecovered_partial:
            if debt_accepted:
                debt_reasons.append("partial_regression_not_recovered")
            else:
                provider_failures.append("partial_regression_not_recovered")

        # Disabling does not authorize silent contract deletion. Semantic/HLS
        # capability changes remain hard failures until explicitly corrected.
        if lost_types:
            provider_failures.append("semantic_capability_regression")
        if hls_lost:
            provider_failures.append("historical_hls_m3u8_regression")

        observed_statuses = {
            lane: sorted(values)
            for lane, values in sorted((candidate_statuses.get(pid) or {}).items())
        }
        if debt_reasons:
            disabled_debt.append(pid)
        obligations[pid] = {
            "historicalPositiveVersions": historical_positive_versions,
            "historicalVerifiedLanes": sorted(historical_specific),
            "rollingAcceptedLanes": sorted(rolling),
            "requiredVerifiedLanes": sorted(required_lanes),
            "candidateVerifiedLanes": sorted(got),
            "candidateLaneStatuses": observed_statuses,
            "missingVerifiedLanes": missing,
            "requireAnyVerifiedLane": require_any,
            "partialRegressionFailedLanes": sorted(partial_failed),
            "unrecoveredPartialRegressionLanes": unrecovered_partial,
            "lostSemanticTypes": lost_types,
            "hlsM3u8Lost": hls_lost,
            "externalDriftRecorded": bool(row.get("externalDriftAccepted")),
            "disabledDebtAccepted": bool(debt_reasons),
            "disabledDebtState": debt.get("routeDataState") if isinstance(debt, dict) else None,
            "disabledDebtReasons": debt_reasons,
            "passed": not provider_failures,
            "failures": provider_failures,
        }
        if provider_failures:
            failures.append({"provider": pid, "failures": provider_failures})

    return {
        "schemaVersion": 2,
        "mode": "candidate",
        "baseRef": base_ref,
        "scopeAllProviders": global_scope,
        "scopeProviderCount": len(scope),
        "scopeProviders": scope,
        "changedPaths": changed,
        "rollingBaselineSource": f"{base_ref}:provider-v3-quick-yield.json",
        "historicalFloorSource": "automation/provider-history-matrix.json schema v3",
        "candidateSource": str(DEFAULT_CANDIDATE.relative_to(ROOT)),
        "disabledHistoricalDebtPolicy": "allowed only when manifest enabled=false and provider-repair-disposition-v1 state is repair/off; semantic/HLS contract deletion remains forbidden",
        "disabledDebtProviderCount": len(sorted(set(disabled_debt))),
        "disabledDebtProviders": sorted(set(disabled_debt)),
        "obligations": obligations,
        "failureCount": len(failures),
        "failures": failures,
        "passed": not failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="NiakVIO provider four-version non-regression gate")
    parser.add_argument("--matrix", default=str(DEFAULT_MATRIX))
    parser.add_argument("--candidate", default=str(DEFAULT_CANDIDATE))
    parser.add_argument("--output", default=str(DEFAULT_OUT))
    parser.add_argument("--base-ref", default="HEAD^")
    parser.add_argument("--candidate-gate", action="store_true")
    parser.add_argument("--all", action="store_true", dest="force_all")
    args = parser.parse_args()

    matrix_path = Path(args.matrix)
    if not matrix_path.is_absolute():
        matrix_path = ROOT / matrix_path
    out_path = Path(args.output)
    if not out_path.is_absolute():
        out_path = ROOT / out_path

    matrix = load(matrix_path)
    failures = ledger_failures(matrix)
    if failures:
        result = {
            "schemaVersion": 1,
            "mode": "ledger",
            "passed": False,
            "failureCount": len(failures),
            "failures": failures,
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"PROVIDER_NON_REGRESSION_LEDGER passed=false failures={len(failures)}")
        return 1

    if not args.candidate_gate:
        result = {
            "schemaVersion": 1,
            "mode": "ledger",
            "passed": True,
            "failureCount": 0,
            "failures": [],
            "providerCount": int(matrix.get("providerCount") or 0),
            "history": list(HISTORY),
            "crossVersionFallbackAllowed": False,
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("PROVIDER_NON_REGRESSION_LEDGER passed=true failures=0")
        return 0

    candidate_path = Path(args.candidate)
    if not candidate_path.is_absolute():
        candidate_path = ROOT / candidate_path
    candidate = load(candidate_path)
    result = candidate_gate(matrix, candidate, args.base_ref, args.force_all)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "PROVIDER_NON_REGRESSION_CANDIDATE "
        f"passed={str(result['passed']).lower()} scope={result['scopeProviderCount']} "
        f"failures={result['failureCount']} disabled_debt={result['disabledDebtProviderCount']} base={args.base_ref}"
    )
    if result["failures"]:
        print("FAILED_PROVIDERS " + ",".join(item["provider"] for item in result["failures"]))
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
