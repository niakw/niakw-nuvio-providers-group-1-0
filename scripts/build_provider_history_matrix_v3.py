#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
V2 = ROOT / "scripts" / "build_provider_history_matrix_v2.py"
OUT_JSON = ROOT / "automation" / "provider-history-matrix.json"
OUT_MD = ROOT / "automation" / "PROVIDER-HISTORY-MATRIX.md"
CAP_5210 = ROOT / "tests" / "fixtures" / "provider-production-5.21.0-capabilities.json"
EXPECTED = 96

GREEN = "🟢"
YELLOW = "🟡"
ORANGE = "🟠"
RED = "🔴"
UNKNOWN = "⚪"
HISTORY = ("5.21.0", "5.21.16", "5.21.36")
START = "<!-- NON_REGRESSION_V3_START -->"
END = "<!-- NON_REGRESSION_V3_END -->"


def canon(value: Any) -> str:
    return str(value or "").strip().casefold()


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(path)
    return value


def git_json(ref: str, path: str) -> dict[str, Any]:
    proc = subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return {}
    try:
        value = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def manifest_map(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        canon(row.get("id")): row
        for row in (data.get("scrapers") or [])
        if isinstance(row, dict) and canon(row.get("id"))
    }


def canonical_semantic_types(row: dict[str, Any] | None) -> set[str]:
    """Return only an explicitly canonical semantic declaration.

    Historical ``supportedTypes`` mixed semantic categories with transport aliases
    (notably anime providers temporarily advertised as movie/tv and TV-capable
    providers advertised as anime). It is therefore evidence about invocation
    compatibility, not a safe semantic publication floor. V3 never promotes that
    ambiguous field into a lost-capability regression.
    """
    if not row:
        return set()
    canonical = row.get("canonicalSupportedTypes")
    if not isinstance(canonical, list) or not canonical:
        return set()
    return {
        canon(value)
        for value in canonical
        if canon(value) in {"movie", "tv", "anime"}
    }


def transport_types(row: dict[str, Any] | None) -> set[str]:
    if not row:
        return set()
    return {
        canon(value)
        for value in (row.get("supportedTypes") or [])
        if canon(value) in {"movie", "tv", "anime"}
    }



def normalize_historical_semantic_types(
    values: set[str],
    *,
    current_semantic: set[str],
    current_transport: set[str],
    historical_verified_lanes: set[str],
) -> tuple[set[str], bool]:
    """Demote the legacy anime->tv invocation alias unless TV has real proof.

    Some historical manifests wrote the Nuvio ``tv`` transport alias into
    ``canonicalSupportedTypes`` for anime providers. That field is normally a
    semantic source, but the alias must not become a permanent TV capability
    obligation when current canonical semantics are anime-only and no historical
    TV lane was independently verified.
    """
    normalized = set(values)
    alias_only_tv = (
        "anime" in normalized
        and "tv" in normalized
        and "anime" in current_semantic
        and "tv" not in current_semantic
        and "tv" in current_transport
        and "tv" not in historical_verified_lanes
    )
    if alias_only_tv:
        normalized.discard("tv")
    return normalized, alias_only_tv

def current_semantic_types(row: dict[str, Any] | None) -> tuple[set[str], str]:
    canonical = canonical_semantic_types(row)
    if canonical:
        return canonical, "canonicalSupportedTypes"
    # Current manifests are expected to be canonicalized, but retain a bounded
    # compatibility fallback for providers that have not yet materialized the
    # explicit field. This fallback may satisfy a floor; it never creates one.
    return transport_types(row), "supportedTypes-current-fallback"


def formats(row: dict[str, Any] | None) -> set[str]:
    if not row:
        return set()
    return {canon(value) for value in (row.get("formats") or []) if canon(value)}


def languages(row: dict[str, Any] | None) -> set[str]:
    if not row:
        return set()
    return {canon(value) for value in (row.get("contentLanguage") or []) if canon(value)}


def verified_lanes(mapping: dict[str, Any]) -> set[str]:
    return {canon(media) for media, status in mapping.items() if canon(status) == "verified" and canon(media)}


def current_verified_lanes(row: dict[str, Any]) -> set[str]:
    lanes = verified_lanes(row.get("currentPublishedGuard") or {})
    for field in row.get("currentTvField") or []:
        media = canon(field.get("semanticType"))
        if media:
            lanes.add(media)
    return lanes


def current_failed_lanes(row: dict[str, Any]) -> set[str]:
    out = set()
    for media, status in (row.get("currentPublishedGuard") or {}).items():
        if canon(status) in {"zero", "wrong-content", "wrong_content"}:
            out.add(canon(media))
    return out


def status_for(
    *,
    historical_green: bool,
    current_icon: str,
    missing_historical_lanes: set[str],
    explicit_failed_lanes: set[str],
    contract_blocking: bool,
) -> str:
    if contract_blocking:
        return "CONTRACT_REGRESSION"
    if not historical_green:
        return "NO_HISTORICAL_GREEN"
    if current_icon in {RED, ORANGE}:
        return "HARD_REGRESSION"
    if current_icon == UNKNOWN:
        return "REVALIDATION_REQUIRED"
    if current_icon == YELLOW:
        if missing_historical_lanes or explicit_failed_lanes:
            return "PARTIAL_REGRESSION"
        return "PARTIAL_REVALIDATION"
    if current_icon == GREEN and missing_historical_lanes:
        return "LANE_REVALIDATION_REQUIRED"
    if current_icon == GREEN:
        return "PRESERVED"
    return "REVALIDATION_REQUIRED"


def main() -> int:
    # V2 owns exact per-snapshot evidence isolation. V3 is deliberately a
    # post-processor so the legacy V1 fallback can never remain authoritative.
    subprocess.run(["python3", str(V2)], cwd=ROOT, check=True)
    matrix = load(OUT_JSON)
    if int(matrix.get("providerCount") or 0) != EXPECTED:
        raise SystemExit(f"expected {EXPECTED} providers, got {matrix.get('providerCount')}")

    refs = matrix.get("snapshotRefs") or {}
    ref0 = str((refs.get("tag_5_21_0") or {}).get("ref") or "5.21.0")
    ref16 = str((refs.get("tag_5_21_16") or {}).get("ref") or "5.21.16")
    ref36 = str((refs.get("release_5_21_36") or {}).get("ref") or "b4d5bff4c2e3b8e9944c1eaaf8ae9690cb00d5cf")

    manifests = {
        "5.21.0": manifest_map(git_json(ref0, "manifest.json")),
        "5.21.16": manifest_map(git_json(ref16, "manifest.json")),
        "5.21.36": manifest_map(git_json(ref36, "manifest.json")),
        "current": manifest_map(load(ROOT / "manifest.json")),
    }
    fixture0 = load(CAP_5210) if CAP_5210.exists() else {}
    fixture0_rows = fixture0.get("providers") or {}

    current_key = str(matrix.get("currentManifestVersion") or "current")
    status_counts: dict[str, int] = {}
    hard: list[str] = []
    partial: list[str] = []
    revalidate: list[str] = []
    contract_regressions: list[str] = []
    watch: list[str] = []

    for row in matrix.get("providers") or []:
        pid = canon(row.get("provider"))
        states = row.get("snapshotStates") or {}
        historical_positive_versions = [
            version
            for version in HISTORY
            if (states.get(version) or {}).get("icon") == GREEN
        ]
        historical_green = bool(historical_positive_versions)

        historical_lanes = verified_lanes(row.get("historical52136") or {})
        current_lanes = current_verified_lanes(row)
        failed_lanes = current_failed_lanes(row)
        missing_lanes = historical_lanes - current_lanes

        historical_types: dict[str, list[str]] = {}
        historical_transport_types: dict[str, list[str]] = {}
        historical_type_sources: dict[str, str] = {}
        current_manifest_semantics = manifests["current"].get(pid)
        current_types, current_type_source = current_semantic_types(current_manifest_semantics)
        current_transport = transport_types(current_manifest_semantics)
        for version in HISTORY:
            manifest_row = manifests[version].get(pid)
            historical_transport_types[version] = sorted(transport_types(manifest_row))
            values = canonical_semantic_types(manifest_row)
            source = "canonicalSupportedTypes" if values else "unproven-transport-only"
            if version == "5.21.0":
                floor = fixture0_rows.get(pid) if isinstance(fixture0_rows, dict) else None
                if isinstance(floor, dict):
                    explicit = {
                        canon(value)
                        for value in (floor.get("semanticTypes") or [])
                        if canon(value) in {"movie", "tv", "anime"}
                    }
                    legacy = {
                        canon(value)
                        for value in (floor.get("types") or [])
                        if canon(value) in {"movie", "tv", "anime"}
                    }
                    if explicit:
                        values = explicit
                        source = "5.21.0-fixture-semanticTypes"
                    elif legacy:
                        values = legacy
                        source = "5.21.0-fixture-types"
            values, alias_reclassified = normalize_historical_semantic_types(
                values,
                current_semantic=current_types,
                current_transport=current_transport,
                historical_verified_lanes=historical_lanes,
            )
            if alias_reclassified:
                source += "+anime-tv-transport-alias-normalized"
            historical_types[version] = sorted(values)
            historical_type_sources[version] = source

        # Semantic floor uses normalized 5.21.0 evidence plus later *explicit*
        # canonical declarations only. Bare historical supportedTypes are kept
        # for diagnostics but can never create a blocking regression.
        type_floor = set().union(*(set(values) for values in historical_types.values()))
        lost_types = sorted(type_floor - current_types)

        historical_formats = set().union(
            *(formats(manifests[version].get(pid)) for version in HISTORY)
        )
        current_formats = formats(manifests["current"].get(pid))
        hls_lost = "m3u8" in historical_formats and "m3u8" not in current_formats

        historical_languages = set().union(
            *(languages(manifests[version].get(pid)) for version in HISTORY)
        )
        current_languages = languages(manifests["current"].get(pid))
        lost_languages = sorted(historical_languages - current_languages)

        historically_enabled = any(
            (manifests[version].get(pid) or {}).get("enabled") is not False
            for version in HISTORY
            if pid in manifests[version]
        )
        current_manifest_row = manifests["current"].get(pid) or {}
        disabled_after_enabled = bool(historically_enabled and current_manifest_row.get("enabled") is False)

        contract = {
            "historicalSemanticTypes": historical_types,
            "historicalSemanticTypeSources": historical_type_sources,
            "historicalTransportTypes": historical_transport_types,
            "semanticTypeFloor": sorted(type_floor),
            "currentSemanticTypes": sorted(current_types),
            "currentSemanticTypeSource": current_type_source,
            "lostSemanticTypes": lost_types,
            "historicalFormats": sorted(historical_formats),
            "currentFormats": sorted(current_formats),
            "hlsM3u8Lost": hls_lost,
            "historicalLanguages": sorted(historical_languages),
            "currentLanguages": sorted(current_languages),
            "lostLanguages": lost_languages,
            "disabledAfterHistoricalEnabled": disabled_after_enabled,
        }
        contract_blocking = bool(lost_types or hls_lost)

        current_icon = str((states.get(current_key) or {}).get("icon") or UNKNOWN)
        status = status_for(
            historical_green=historical_green,
            current_icon=current_icon,
            missing_historical_lanes=missing_lanes,
            explicit_failed_lanes=failed_lanes,
            contract_blocking=contract_blocking,
        )

        row["historicalPositiveVersions"] = historical_positive_versions
        row["historicalVerifiedLanes"] = sorted(historical_lanes)
        row["currentVerifiedLanes"] = sorted(current_lanes)
        row["explicitCurrentFailedLanes"] = sorted(failed_lanes)
        row["missingHistoricalVerifiedLanes"] = sorted(missing_lanes)
        row["contractDrift"] = contract
        row["nonRegressionStatus"] = status
        row["publicationProofRequired"] = status not in {"PRESERVED", "NO_HISTORICAL_GREEN"}
        row["externalDriftAccepted"] = row.get("classification") == "UPSTREAM_DRIFT"

        status_counts[status] = status_counts.get(status, 0) + 1
        if status in {"HARD_REGRESSION", "CONTRACT_REGRESSION"}:
            hard.append(pid)
        if status == "PARTIAL_REGRESSION":
            partial.append(pid)
        if status in {"REVALIDATION_REQUIRED", "PARTIAL_REVALIDATION", "LANE_REVALIDATION_REQUIRED"}:
            revalidate.append(pid)
        if contract_blocking:
            contract_regressions.append(pid)
        if row["publicationProofRequired"]:
            watch.append(pid)

    matrix["schemaVersion"] = 3
    matrix["nonRegressionPolicy"] = {
        "history": list(HISTORY),
        "current": current_key,
        "crossVersionFallbackAllowed": False,
        "historicalTransportTypesMayCreateSemanticFloor": False,
        "historicalGreenMayBecomeUnknownSilently": False,
        "knownVerifiedLaneMayDisappearWithoutCandidateProof": False,
        "semanticCapabilityLossAllowedSilently": False,
        "historicalHlsLossAllowedSilently": False,
        "publicationRule": "changed historical-positive providers must reproduce their historical/current accepted proof floor; shared Core changes imply portfolio-wide proof",
    }
    matrix["nonRegressionStatusCounts"] = dict(sorted(status_counts.items()))
    matrix["hardRegressionProviders"] = sorted(set(hard))
    matrix["partialRegressionProviders"] = sorted(set(partial))
    matrix["revalidationRequiredProviders"] = sorted(set(revalidate))
    matrix["contractRegressionProviders"] = sorted(set(contract_regressions))
    matrix["nonRegressionWatchProviders"] = sorted(set(watch))
    OUT_JSON.write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    md = OUT_MD.read_text(encoding="utf-8") if OUT_MD.exists() else "# Provider history\n"
    if START in md:
        md = md.split(START, 1)[0].rstrip() + "\n"
    lines = [
        "",
        START,
        "## V3 non-regression ledger",
        "",
        "This section is generated from four exact states: **5.21.0 → 5.21.16 → 5.21.36 → current**.",
        "Historical evidence is never filled from a newer snapshot. A historical green that becomes unknown is explicit revalidation debt, not a silent pass.",
        "Historical `supportedTypes` are transport/invocation compatibility only; only normalized or explicit canonical semantic declarations can create a semantic regression floor.",
        "",
        f"- Hard/contract regressions: **{len(set(hard))}** — " + (", ".join(f"`{x}`" for x in sorted(set(hard))) if hard else "none"),
        f"- Partial regressions: **{len(set(partial))}** — " + (", ".join(f"`{x}`" for x in sorted(set(partial))) if partial else "none"),
        f"- Revalidation debt: **{len(set(revalidate))}** — " + (", ".join(f"`{x}`" for x in sorted(set(revalidate))) if revalidate else "none"),
        f"- Semantic/HLS contract regressions: **{len(set(contract_regressions))}** — " + (", ".join(f"`{x}`" for x in sorted(set(contract_regressions))) if contract_regressions else "none"),
        "",
        "### Guard semantics",
        "",
        "- A provider that was green in an exact historical snapshot cannot become `unknown` without being put on the revalidation list.",
        "- Every verified 5.21.36 lane becomes an explicit lane obligation until current/candidate proof supersedes it.",
        "- Semantic capability and historical HLS losses are contract regressions, independently of transient network health.",
        "- Historical bare `supportedTypes` never create a semantic floor because old releases mixed semantic types and transport aliases.",
        "- The publication gate additionally unions the rolling accepted quick-yield baseline with these historical obligations, so future releases extend rather than reset the floor.",
        END,
        "",
    ]
    OUT_MD.write_text(md.rstrip() + "\n" + "\n".join(lines), encoding="utf-8")

    print(
        "PROVIDER_HISTORY_V3 "
        f"providers={EXPECTED} hard={len(set(hard))} partial={len(set(partial))} "
        f"revalidate={len(set(revalidate))} contract={len(set(contract_regressions))} "
        f"watch={len(set(watch))}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
