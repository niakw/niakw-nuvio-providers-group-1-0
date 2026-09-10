#!/usr/bin/env python3
"""Finalize provider activation after a real Repair V6 candidate census.

Policy:
- an enabled provider must have current proof for every declared canonical lane;
- an exact locked live lane may substitute only while the candidate still points
  to the exact locked bundle bytes/path;
- incomplete providers are disabled, never left active-but-broken;
- terminal-blocked/unreachable or explicit quarantine -> route/DATA state ``off``;
- every other unresolved/incomplete provider -> route/DATA state ``repair``;
- existing route/DATA evidence is preserved for learning/repair. Disabling is an
  execution decision, not evidence destruction;
- this script never silently shrinks supported/canonical types.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
OVERRIDES = ROOT / "provider-overrides.json"
KNOWLEDGE = ROOT / "automation" / "provider-v3-static-knowledge.json"
LOCKS = ROOT / "automation" / "provider-live-baseline-locks.json"
RECOVERY = ROOT / "automation" / "provider-route-recovery-v6-targeted.json"
QUICK = ROOT / "provider-v3-quick-yield.json"
OUTPUT = ROOT / "automation" / "provider-repair-disposition.json"
EXPECTED = 96
TERMINAL = {"terminal-blocked", "terminal-unreachable"}


def load(path: Path, default: Any | None = None) -> Any:
    if not path.is_file():
        if default is not None:
            return default
        raise SystemExit(f"missing required file: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def lane(value: object) -> str:
    raw = str(value or "").strip().casefold()
    return "tv" if raw in {"series", "serie"} else raw


def declared_lanes(row: dict[str, Any]) -> list[str]:
    canonical = row.get("canonicalSupportedTypes")
    source = canonical if isinstance(canonical, list) and canonical else row.get("supportedTypes")
    out: list[str] = []
    for raw in source if isinstance(source, list) else []:
        value = lane(raw)
        if value in {"movie", "tv", "anime"} and value not in out:
            out.append(value)
    return out


def quick_evidence(data: dict[str, Any]) -> tuple[dict[str, set[str]], dict[str, dict[str, set[str]]], dict[str, set[str]]]:
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
        if status == "playable_verified":
            verified[provider].add(semantic)
    return verified, statuses, stages


def recovery_rows(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        cid(row.get("providerId")): row
        for row in data.get("providers") or []
        if isinstance(row, dict) and cid(row.get("providerId"))
    }


def exact_locked_lanes(
    locks: dict[str, Any],
    manifest_rows: dict[str, dict[str, Any]],
) -> dict[str, set[str]]:
    out: dict[str, set[str]] = defaultdict(set)
    providers = locks.get("providers") if isinstance(locks.get("providers"), dict) else {}
    for provider, raw in providers.items():
        pid = cid(provider)
        lock = raw if isinstance(raw, dict) else {}
        manifest_row = manifest_rows.get(pid) or {}
        bundle = str(lock.get("bundle") or "").strip()
        filename = str(manifest_row.get("filename") or "").strip()
        # A live lock belongs to exact published bytes. A newly hashed/materialized
        # candidate must earn fresh proof instead of inheriting the old lane.
        if not bundle or bundle != filename:
            continue
        for raw_lane in lock.get("protectedLanes") or []:
            value = lane(raw_lane)
            if value in {"movie", "tv", "anime"}:
                out[pid].add(value)
    return out


def terminal_state(patch: dict[str, Any], model: dict[str, Any]) -> str:
    gate = patch.get("live_route_gate") if isinstance(patch.get("live_route_gate"), dict) else {}
    recognition = model.get("routeRecognition") if isinstance(model.get("routeRecognition"), dict) else {}
    values = [
        str(gate.get("completion_state") or "").strip().casefold(),
        str(recognition.get("completionState") or "").strip().casefold(),
    ]
    for value in values:
        if value in TERMINAL:
            return value
    return ""


def explicit_quarantine(patch: dict[str, Any], model: dict[str, Any]) -> bool:
    strategy = str(patch.get("capability") or model.get("strategy") or "").strip().casefold()
    return strategy == "quarantined" or bool(patch.get("quarantine_reason"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Finalize Provider v3 repair activation/disposition")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--overrides", type=Path, default=OVERRIDES)
    parser.add_argument("--knowledge", type=Path, default=KNOWLEDGE)
    parser.add_argument("--locks", type=Path, default=LOCKS)
    parser.add_argument("--recovery", type=Path, default=RECOVERY)
    parser.add_argument("--quick-yield", type=Path, default=QUICK)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    manifest = load(args.manifest)
    overrides = load(args.overrides)
    knowledge = load(args.knowledge)
    locks = load(args.locks, {"providers": {}})
    recovery = load(args.recovery, {"providers": []})
    quick = load(args.quick_yield)

    rows = [row for row in manifest.get("scrapers") or [] if isinstance(row, dict)]
    if len(rows) != EXPECTED:
        raise SystemExit(f"expected {EXPECTED} manifest providers, got {len(rows)}")
    manifest_rows = {cid(row.get("id")): row for row in rows if cid(row.get("id"))}
    if len(manifest_rows) != EXPECTED:
        raise SystemExit(f"expected {EXPECTED} unique provider ids, got {len(manifest_rows)}")

    patches = overrides.get("provider_patches") if isinstance(overrides.get("provider_patches"), dict) else {}
    static = knowledge.get("providers") if isinstance(knowledge.get("providers"), dict) else {}
    recovered = recovery_rows(recovery)
    verified, lane_statuses, debug_stages = quick_evidence(quick)
    locked = exact_locked_lanes(locks, manifest_rows)

    report_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    disabled: list[str] = []
    incomplete: list[str] = []

    for provider in sorted(manifest_rows):
        manifest_row = manifest_rows[provider]
        patch = patches.get(provider) if isinstance(patches.get(provider), dict) else {}
        static_row = static.get(provider) if isinstance(static.get(provider), dict) else {}
        model = static_row.get("model") if isinstance(static_row.get("model"), dict) else {}
        recovery_row = recovered.get(provider) or {}

        required = set(declared_lanes(manifest_row))
        current = set(verified.get(provider) or set())
        protected = set(locked.get(provider) or set())
        proven = current | protected
        missing = sorted(required - proven)
        complete = bool(required) and not missing
        terminal = terminal_state(patch, model)
        quarantined = explicit_quarantine(patch, model)

        if complete and not quarantined:
            route_state = "on"
            reason_codes = ["all_declared_lanes_live_proven"]
            # Repair disposition is the activation authority for this candidate:
            # complete live proof restores execution, while incomplete proof is
            # disabled below as explicit repair/off debt. A stale historical
            # enabled=false must not keep a fully recovered provider disabled.
            enabled = True
        else:
            enabled = False
            if quarantined or terminal:
                route_state = "off"
            else:
                route_state = "repair"
            reason_codes = []
            if missing:
                reason_codes.append("declared_lane_unproven")
            if terminal:
                reason_codes.append(terminal)
            if quarantined:
                reason_codes.append("explicit_quarantine")
            status = str(recovery_row.get("status") or "").strip().casefold()
            if status:
                reason_codes.append("recovery_" + status.replace("_", "-"))
            for stage in sorted(debug_stages.get(provider) or set()):
                reason_codes.append("quick_" + stage.replace("_", "-"))
            if not reason_codes:
                reason_codes.append("repair_incomplete")
            disabled.append(provider)
            incomplete.append(provider)

        manifest_row["enabled"] = enabled
        manifest_overrides = patch.get("manifest_overrides") if isinstance(patch.get("manifest_overrides"), dict) else {}
        manifest_overrides["enabled"] = enabled
        patch["manifest_overrides"] = manifest_overrides
        patch["route_data_state"] = route_state
        disposition = {
            "schemaVersion": 1,
            "authority": "provider-repair-disposition-v1",
            "activationState": "enabled" if enabled else "disabled",
            "routeDataState": route_state,
            "requiredLanes": sorted(required),
            "currentVerifiedLanes": sorted(current),
            "exactLockedLanes": sorted(protected),
            "provenLanes": sorted(proven),
            "missingLanes": missing,
            "completeCapabilityProof": complete,
            "recoveryStatus": str(recovery_row.get("status") or "unknown"),
            "provenRouteCount": len(recovery_row.get("routes") or []),
            "terminalState": terminal or None,
            "quarantined": quarantined,
            "reasonCodes": sorted(set(reason_codes)),
            "laneStatuses": {
                semantic: sorted(values)
                for semantic, values in sorted((lane_statuses.get(provider) or {}).items())
            },
            "evidenceDestructive": False,
        }
        patch["repair_disposition"] = disposition
        patches[provider] = patch

        if isinstance(model, dict):
            model["routeDataState"] = route_state
            model["repairDisposition"] = disposition
            static_row["model"] = model
            static[provider] = static_row

        counts[route_state] += 1
        report_rows.append({"provider": provider, **disposition})

    overrides["provider_patches"] = patches
    knowledge["providers"] = static
    summary = {
        "schemaVersion": 1,
        "authority": "provider-repair-disposition-v1",
        "catalogueProviderCount": EXPECTED,
        "policy": {
            "activeBrokenProviderAllowed": False,
            "incompleteProviderEnabled": False,
            "terminalOrQuarantinedState": "off",
            "nonTerminalUnresolvedState": "repair",
            "evidenceDestructionAllowed": False,
            "semanticTypeShrinkAllowed": False,
            "exactLiveLocksRequireExactBundlePath": True,
        },
        "stateCounts": dict(sorted(counts.items())),
        "disabledProviderCount": len(disabled),
        "disabledProviders": disabled,
        "incompleteProviderCount": len(incomplete),
        "incompleteProviders": incomplete,
        "providers": report_rows,
    }

    write(args.manifest, manifest)
    write(args.overrides, overrides)
    write(args.knowledge, knowledge)
    write(args.output, summary)
    print(
        "PROVIDER_REPAIR_DISPOSITION_V1 "
        f"providers={EXPECTED} on={counts['on']} repair={counts['repair']} off={counts['off']} "
        f"disabled={len(disabled)} active_broken=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
