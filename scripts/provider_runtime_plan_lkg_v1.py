#!/usr/bin/env python3
"""Preserve baseline-verified published runtime plans across Provider DATA repair.

This is runtime-plan LKG, not route proof:
- only a provider with at least one clean baseline playable+verified lane is eligible;
- the current manifest bundle must match provider-v3-materialization.json exactly;
- embedded runtime plan fields are captured as an opaque, already-published plan;
- apply restores only missing plan pieces when repair DATA became poorer;
- no routeData, validationState, executedEvidence, or HTTP proof is created.

The publication/non-regression gate remains authoritative: preserving a plan never
enables a provider and never makes an unverified lane pass.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
MATERIALIZATION = ROOT / "provider-v3-materialization.json"
KNOWLEDGE = ROOT / "automation" / "provider-v3-static-knowledge.json"
OVERRIDES = ROOT / "provider-overrides.json"
DEFAULT_BASELINE = ROOT / "automation" / "provider-repair-portfolio-baseline.json"
DEFAULT_SNAPSHOT = Path(os.environ.get("RUNNER_TEMP") or (ROOT / "automation")) / "provider-runtime-plan-lkg-v1.json"

MODEL_RE = re.compile(
    r"const\s+NIAKVIO_PROVIDER_MODEL\s*=\s*Object\.freeze\((\{.*?\})\);",
    re.DOTALL,
)
PLAN_FIELDS = (
    ("routes", "learned_routes"),
    ("apiRecipe", "api_recipe"),
    ("providerValuePlan", "provider_value_plan"),
    ("searchRequestPlan", "search_request_plan"),
    ("externalIdentityPlan", "external_identity_plan"),
)


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: object required")
    return value


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cid(value: object) -> str:
    return str(value or "").strip().casefold().replace("_", "-")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique(values: object, limit: int = 256) -> list[str]:
    out: list[str] = []
    for raw in values if isinstance(values, list) else []:
        value = str(raw or "").strip()
        if value and value not in out:
            out.append(value)
        if len(out) >= limit:
            break
    return out


def embedded_model(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    match = MODEL_RE.search(path.read_text(encoding="utf-8", errors="replace"))
    if match is None:
        return None
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def clean_verified_lanes(baseline: dict[str, Any]) -> dict[str, list[str]]:
    lanes: dict[str, list[str]] = {}
    for row in baseline.get("rows") or []:
        if not isinstance(row, dict):
            continue
        provider = cid(row.get("provider_id"))
        lane = str(row.get("semantic_type") or "").strip().casefold()
        try:
            playable = int(row.get("playable") or 0)
            verified = int(row.get("verified") or 0)
            contradictions = int(row.get("contradictions") or 0)
        except (TypeError, ValueError):
            continue
        if not provider or lane not in {"movie", "tv", "anime"}:
            continue
        if playable <= 0 or verified <= 0 or contradictions != 0:
            continue
        lanes.setdefault(provider, [])
        if lane not in lanes[provider]:
            lanes[provider].append(lane)
    return lanes


def materialization_index(value: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in value.get("providers") or []:
        if not isinstance(row, dict):
            continue
        provider = cid(row.get("provider"))
        if provider:
            out[provider] = row
    return out


def manifest_index(value: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in value.get("scrapers") or []:
        if not isinstance(row, dict):
            continue
        provider = cid(row.get("id"))
        filename = str(row.get("filename") or "").strip()
        if provider and filename:
            out[provider] = row
    return out


def capture(
    *,
    root: Path,
    baseline_path: Path,
    manifest_path: Path,
    materialization_path: Path,
    snapshot_path: Path,
) -> dict[str, Any]:
    baseline = load(baseline_path)
    manifest = load(manifest_path)
    materialization = load(materialization_path)
    clean = clean_verified_lanes(baseline)
    manifests = manifest_index(manifest)
    materialized = materialization_index(materialization)

    providers: dict[str, Any] = {}
    rejected: dict[str, str] = {}
    for provider, lanes in sorted(clean.items()):
        row = manifests.get(provider)
        mat = materialized.get(provider)
        if not isinstance(row, dict) or not isinstance(mat, dict):
            rejected[provider] = "missing-manifest-or-materialization"
            continue
        filename = str(row.get("filename") or "").strip()
        path = root / filename
        expected_file = str(mat.get("file") or "").strip()
        expected_sha = str(mat.get("sha256") or "").strip().casefold()
        if not path.is_file() or filename != expected_file or not expected_sha:
            rejected[provider] = "materialization-metadata-mismatch"
            continue
        actual_sha = file_sha256(path).casefold()
        if actual_sha != expected_sha:
            rejected[provider] = "materialization-sha-mismatch"
            continue
        model = embedded_model(path)
        if not isinstance(model, dict):
            rejected[provider] = "embedded-model-missing"
            continue

        plan: dict[str, Any] = {}
        routes = unique(model.get("routes"), 256)
        if routes:
            plan["routes"] = routes
        for model_key, _patch_key in PLAN_FIELDS[1:]:
            value = model.get(model_key)
            if isinstance(value, dict) and value:
                plan[model_key] = copy.deepcopy(value)
            elif isinstance(value, list) and value:
                plan[model_key] = copy.deepcopy(value)
        if not plan:
            rejected[provider] = "embedded-runtime-plan-empty"
            continue
        providers[provider] = {
            "verifiedLanes": sorted(lanes),
            "manifestFile": filename,
            "manifestFileSha256": actual_sha,
            "materializationGeneration": materialization.get("generation"),
            "materializationSourceSha": materialization.get("sourceSha"),
            "plan": plan,
            "routeCount": len(routes),
            "proofPromotion": False,
        }

    snapshot = {
        "schemaVersion": 1,
        "policy": "baseline-clean-verified-published-runtime-plan-lkg-no-proof-promotion",
        "providers": providers,
        "rejected": rejected,
    }
    write(snapshot_path, snapshot)
    print(
        "PROVIDER_RUNTIME_PLAN_LKG_CAPTURE_V1_OK "
        f"baseline_clean={len(clean)} captured={len(providers)} rejected={len(rejected)} "
        "proof_promotion=0"
    )
    return snapshot


def _merge_plan_list(old: object, current: object) -> list[Any]:
    if isinstance(old, list) and all(isinstance(x, str) for x in old):
        return unique([*old, *(current if isinstance(current, list) else [])], 256)
    out: list[Any] = []
    for source in (old if isinstance(old, list) else [], current if isinstance(current, list) else []):
        for item in source:
            if item not in out:
                out.append(copy.deepcopy(item))
    return out


def apply(
    *,
    snapshot_path: Path,
    knowledge_path: Path,
    overrides_path: Path,
) -> dict[str, Any]:
    snapshot = load(snapshot_path)
    knowledge = load(knowledge_path)
    overrides = load(overrides_path)
    providers = knowledge.get("providers") if isinstance(knowledge.get("providers"), dict) else {}
    patches = overrides.get("provider_patches") if isinstance(overrides.get("provider_patches"), dict) else {}

    changed: list[str] = []
    restored_fields = 0
    for provider, saved in sorted((snapshot.get("providers") or {}).items()):
        if not isinstance(saved, dict):
            continue
        static_row = providers.get(provider)
        patch = patches.get(provider)
        if not isinstance(static_row, dict) or not isinstance(patch, dict):
            continue
        model = static_row.get("model") if isinstance(static_row.get("model"), dict) else {}
        plan = saved.get("plan") if isinstance(saved.get("plan"), dict) else {}
        provider_changed = False

        for model_key, patch_key in PLAN_FIELDS:
            saved_value = plan.get(model_key)
            if not saved_value:
                continue
            current_model = model.get(model_key)
            current_patch = patch.get(patch_key)

            if isinstance(saved_value, list):
                merged_model = _merge_plan_list(saved_value, current_model)
                merged_patch = _merge_plan_list(saved_value, current_patch)
                if current_model != merged_model:
                    model[model_key] = merged_model
                    provider_changed = True
                    restored_fields += 1
                if current_patch != merged_patch:
                    patch[patch_key] = merged_patch
                    provider_changed = True
            elif isinstance(saved_value, dict):
                if not isinstance(current_model, dict) or not current_model:
                    model[model_key] = copy.deepcopy(saved_value)
                    provider_changed = True
                    restored_fields += 1
                if not isinstance(current_patch, dict) or not current_patch:
                    patch[patch_key] = copy.deepcopy(saved_value)
                    provider_changed = True

        if provider_changed:
            model["runtimePlanLkg"] = {
                "version": 1,
                "source": "baseline-verified-published-plan",
                "verifiedLanes": copy.deepcopy(saved.get("verifiedLanes") or []),
                "proofPromotion": False,
                "activationAuthority": False,
            }
            patch["runtime_plan_lkg"] = copy.deepcopy(model["runtimePlanLkg"])
            static_row["model"] = model
            providers[provider] = static_row
            patches[provider] = patch
            changed.append(provider)

    knowledge["providers"] = providers
    overrides["provider_patches"] = patches
    write(knowledge_path, knowledge)
    write(overrides_path, overrides)
    print(
        "PROVIDER_RUNTIME_PLAN_LKG_APPLY_V1_OK "
        f"captured={len(snapshot.get('providers') or {})} changed={len(changed)} "
        f"restored_fields={restored_fields} proof_promotion=0 providers={','.join(changed)}"
    )
    return {"changedProviders": changed, "restoredFields": restored_fields}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("capture", "apply"))
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--materialization", type=Path, default=MATERIALIZATION)
    parser.add_argument("--knowledge", type=Path, default=KNOWLEDGE)
    parser.add_argument("--overrides", type=Path, default=OVERRIDES)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    args = parser.parse_args()

    root = args.root.resolve()
    resolve = lambda p: p.resolve() if p.is_absolute() else (root / p).resolve()
    snapshot = resolve(args.snapshot)
    if args.mode == "capture":
        capture(
            root=root,
            baseline_path=resolve(args.baseline),
            manifest_path=resolve(args.manifest),
            materialization_path=resolve(args.materialization),
            snapshot_path=snapshot,
        )
    else:
        apply(
            snapshot_path=snapshot,
            knowledge_path=resolve(args.knowledge),
            overrides_path=resolve(args.overrides),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
