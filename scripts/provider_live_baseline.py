#!/usr/bin/env python3
"""Immutable live-baseline policy for Provider repair/publication.

A provider lane with current live evidence is protected on the exact published
bundle bytes that produced that evidence. Repair may still work on unprotected
lanes of the same provider. A whole provider is skipped only when every canonical
lane is protected on the exact current bundle.

Changing protected bundle bytes requires a live A/B report. Merely keeping the
provider enabled, passing static tests, or preserving another lane is insufficient.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOCKS = ROOT / "automation" / "provider-live-baseline-locks.json"
DEFAULT_MANIFEST = ROOT / "manifest.json"


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: object required")
    return value


def rows(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        cid(row.get("id")): row
        for row in manifest.get("scrapers") or []
        if isinstance(row, dict) and cid(row.get("id"))
    }


def canonical_lanes(row: dict[str, Any]) -> set[str]:
    raw = row.get("canonicalSupportedTypes") or row.get("supportedTypes") or []
    lanes: set[str] = set()
    for value in raw:
        lane = cid(value)
        if lane == "series":
            lane = "tv"
        if lane in {"movie", "tv", "anime"}:
            lanes.add(lane)
    return lanes


def lock_rows(locks: dict[str, Any]) -> dict[str, dict[str, Any]]:
    value = locks.get("providers") or {}
    if not isinstance(value, dict):
        return {}
    return {cid(key): row for key, row in value.items() if isinstance(row, dict) and cid(key)}


def protected_lanes(lock: dict[str, Any]) -> set[str]:
    return {
        cid(value)
        for value in lock.get("protectedLanes") or []
        if cid(value) in {"movie", "tv", "anime"}
    }


def baseline_lock_errors(
    manifest: dict[str, Any],
    locks: dict[str, Any],
    *,
    require_exact_bundle: bool = True,
) -> list[str]:
    errors: list[str] = []
    expected_count = int(locks.get("catalogueProviderCount") or 96)
    manifest_rows = rows(manifest)
    if len(manifest_rows) != expected_count:
        errors.append(f"catalogue count mismatch: {len(manifest_rows)} != {expected_count}")

    for provider_id, lock in sorted(lock_rows(locks).items()):
        row = manifest_rows.get(provider_id)
        if row is None:
            errors.append(f"{provider_id}: protected provider missing from manifest")
            continue
        if row.get("enabled") is not True:
            errors.append(f"{provider_id}: protected provider is disabled")
        lanes = protected_lanes(lock)
        if not lanes:
            errors.append(f"{provider_id}: protectedLanes is empty")
        declared = canonical_lanes(row)
        undeclared = sorted(lanes - declared)
        if undeclared:
            errors.append(f"{provider_id}: protected lane(s) no longer declared: {','.join(undeclared)}")
        expected_bundle = str(lock.get("bundle") or "").strip()
        actual_bundle = str(row.get("filename") or "").strip()
        if not expected_bundle.startswith("providers/"):
            errors.append(f"{provider_id}: invalid baseline bundle path")
        elif require_exact_bundle and actual_bundle != expected_bundle:
            errors.append(
                f"{provider_id}: protected bundle changed without accepted A/B: "
                f"{expected_bundle} -> {actual_bundle}"
            )
    return errors


def fully_green_provider_ids(
    manifest: dict[str, Any],
    locks: dict[str, Any],
) -> set[str]:
    """Return providers safe to skip entirely.

    Partial locks never suppress repair for the remaining lanes. Exact bundle
    identity is mandatory; changed candidate bytes are not considered green merely
    because the provider id is unchanged.
    """
    manifest_rows = rows(manifest)
    result: set[str] = set()
    for provider_id, lock in lock_rows(locks).items():
        if lock.get("completeProvider") is not True:
            continue
        row = manifest_rows.get(provider_id)
        if not isinstance(row, dict) or row.get("enabled") is not True:
            continue
        if str(row.get("filename") or "") != str(lock.get("bundle") or ""):
            continue
        declared = canonical_lanes(row)
        protected = protected_lanes(lock)
        if declared and declared <= protected:
            result.add(provider_id)
    return result


def _ab_lane_passed(lane: dict[str, Any]) -> bool:
    if lane.get("passed") is not True or lane.get("noRegression") is not True:
        return False
    baseline = lane.get("baseline") if isinstance(lane.get("baseline"), dict) else {}
    candidate = lane.get("candidate") if isinstance(lane.get("candidate"), dict) else {}

    def safe_positive(row: dict[str, Any]) -> bool:
        return (
            int(row.get("raw") or 0) > 0
            and int(row.get("playable") or 0) > 0
            and int(row.get("verified") or 0) > 0
            and int(row.get("contradictions") or 0) == 0
        )

    return safe_positive(baseline) and safe_positive(candidate)


def candidate_replacement_errors(
    manifest: dict[str, Any],
    locks: dict[str, Any],
    ab_report: dict[str, Any] | None,
) -> list[str]:
    """Validate changed protected bundles against live A/B evidence."""
    errors: list[str] = []
    manifest_rows = rows(manifest)
    ab_providers = (
        ab_report.get("providers")
        if isinstance(ab_report, dict) and isinstance(ab_report.get("providers"), dict)
        else {}
    )
    for provider_id, lock in sorted(lock_rows(locks).items()):
        row = manifest_rows.get(provider_id)
        if not isinstance(row, dict):
            errors.append(f"{provider_id}: protected provider missing")
            continue
        old_bundle = str(lock.get("bundle") or "")
        new_bundle = str(row.get("filename") or "")
        if old_bundle == new_bundle:
            continue
        proof = ab_providers.get(provider_id) if isinstance(ab_providers, dict) else None
        if not isinstance(proof, dict):
            errors.append(f"{provider_id}: changed protected bundle has no live A/B proof")
            continue
        if str(proof.get("baselineBundle") or "") != old_bundle:
            errors.append(f"{provider_id}: A/B baseline bundle mismatch")
            continue
        if str(proof.get("candidateBundle") or "") != new_bundle:
            errors.append(f"{provider_id}: A/B candidate bundle mismatch")
            continue
        lanes = proof.get("lanes") if isinstance(proof.get("lanes"), dict) else {}
        for lane in sorted(protected_lanes(lock)):
            lane_proof = lanes.get(lane)
            if not isinstance(lane_proof, dict) or not _ab_lane_passed(lane_proof):
                errors.append(f"{provider_id}:{lane}: protected lane lacks passing live A/B non-regression proof")
    return errors
