#!/usr/bin/env python3
"""Materialize every clean Provider v3 bundle from one cross-device source of truth.

Provider JavaScript is device-agnostic. TV, Mobile and Desktop manifests may select
or disable providers, but they must all reference the exact same materialized JS
bytes for a given provider/version.

Source:
  ProviderBase v3 + structured provider DATA + owned PROVIDER.* / CORE.* Lego.

Forbidden as executable seeds:
  published legacy provider JS, upstream provider JS, per-device JS forks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provider_base_store import (  # noqa: E402
    build_base_from_seed,
    build_clean_provider_seed,
    build_provider_data_model,
    canonical_id,
    compose_provider_bundle,
)
from apply_provider_overrides import apply_overrides  # noqa: E402
from provider_patch_blocks import owned_span, validate_managed_fixes  # noqa: E402
from provider_v3_minimizer import minimize_text, validate_transform  # noqa: E402

DEFAULT_SOURCE_MANIFEST = ROOT / "manifest.json"
DEFAULT_OVERRIDES = ROOT / "provider-overrides.json"
DEFAULT_STATIC_KNOWLEDGE = ROOT / "automation" / "provider-v3-static-knowledge.json"
DEFAULT_OUT = ROOT / "providers"
DEFAULT_REPORT = ROOT / "provider-v3-materialization.json"
EXPECTED_PROVIDER_COUNT = 96


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: object required")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def origin(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return ""
        return f"{parsed.scheme}://{parsed.hostname.casefold()}"
    except ValueError:
        return ""


def _identity_route_allowed(value: object) -> bool:
    text = str(value or "").strip()
    lowered = text.casefold()
    if not text or "${" in text or "encodeuricomponent(" in lowered:
        return False
    if re.search(r"(?:[?&])q=ponyfill(?:&|$)", lowered):
        return False
    return lowered.rstrip("/") not in {"/license", "license"}


def _identity_mode_from_plan(
    routes: list[str],
    api_recipe: dict[str, Any] | None,
) -> str:
    candidates: list[str] = []
    if isinstance(api_recipe, dict):
        for key in ("searchRoute", "search_route", "directRoute", "direct_route"):
            value = str(api_recipe.get(key) or "").strip()
            if value:
                candidates.append(value)
    candidates.extend(str(value or "").strip() for value in routes)
    candidates = [value for value in candidates if _identity_route_allowed(value)]

    # External identifiers are derived by Core from the same authoritative TMDB
    # metadata request. They therefore need metadata before the provider runs.
    if any(
        re.search(r"\{imdb(?:_?id)?\}|(?:[?&])imdb(?:_?id)?=", value, re.I)
        for value in candidates
    ):
        return "external_id"

    # Only plans that actually consume title/query/slug metadata are catalogue
    # plans. Merely knowing an official site/API must never force a TMDB
    # preflight across every provider.
    if any(
        re.search(
            r"\{(?:query|title|slug)\}"
            r"|/(?:search|recherche)(?:[/?#]|$)"
            r"|(?:[?&])(?:s|q|query|keyword|search|story)="
            r"|/template-php/[^?#]*fetch\.php(?:[?#]|$)",
            value,
            re.I,
        )
        for value in candidates
    ):
        return "catalog_search"

    return "tmdb_direct"


def identity_input(
    patch: dict[str, Any],
    routes: list[str] | None = None,
    api_recipe: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # PROVIDER_TYPED_RESOLVER_IDENTITY_V8
    # Fresh terminal stream proof for a typed TMDB resolver is stronger than
    # stale catalogue/search routes carried as historical candidate knowledge.
    if isinstance(api_recipe, dict) and str(api_recipe.get("recipeKind") or "") == "typed-resolver-api":
        return {
            "mode": "tmdb_direct",
            "requiresTmdbBeforeRun": False,
            "requiredFields": ["tmdbId", "mediaType"],
        }
    raw = patch.get("identity_input")
    if not isinstance(raw, dict):
        mode = _identity_mode_from_plan(list(routes or []), api_recipe)
        return {
            "mode": mode,
            "requiresTmdbBeforeRun": mode != "tmdb_direct",
            "requiredFields": (
                ["title", "mediaType"]
                if mode == "catalog_search"
                else ["tmdbId", "mediaType"]
            ),
        }
    mode = str(raw.get("mode") or "tmdb_direct").strip().casefold()
    if mode not in {"tmdb_direct", "catalog_search", "external_id"}:
        raise ValueError(f"invalid identity mode: {mode}")
    required = [
        str(v).strip()
        for v in raw.get("required_fields") or raw.get("requiredFields") or []
        if str(v).strip()
    ]
    return {
        "mode": mode,
        "requiresTmdbBeforeRun": bool(
            raw.get(
                "requires_tmdb_before_run",
                raw.get("requiresTmdbBeforeRun", mode != "tmdb_direct"),
            )
        ),
        "requiredFields": required or (
            ["title", "mediaType"]
            if mode == "catalog_search"
            else ["tmdbId", "mediaType"]
        ),
    }


# NIAKVIO_PROVIDER_SOURCE_PLAN_V10
def _runtime_domain_substitutions(patch: dict[str, Any], static_model: dict[str, Any] | None = None) -> dict[str, str]:
    out: dict[str, str] = {}
    # PROVIDER_SEARCH_REQUEST_PLAN_V14: current positive HTTP proof outranks stale
    # historical replacement knowledge for runtime execution.
    protected = {
        str(value or "").strip().casefold()
        for value in [
            *(patch.get("proof_protected_hosts") or []),
            *((static_model or {}).get("proofProtectedHosts") or []),
        ]
        if str(value or "").strip()
    }
    # runtime_domain_replacements is explicit execution DATA. Historical generic
    # replacements remain candidate knowledge unless already promoted there.
    # NIAKVIO_PROVIDER_RUNTIME_DOMAIN_AUTHORITY_V10_1: candidate/history maps are non-executable knowledge.
    for key in ("runtime_domain_replacements",):
        mapping = patch.get(key)
        if not isinstance(mapping, dict):
            continue
        for source, target in mapping.items():
            old = str(source or "").strip().casefold()
            new = str(target or "").strip().casefold()
            if "://" in old:
                old = (urlparse(old).hostname or "").casefold()
            if "://" in new:
                new = (urlparse(new).hostname or "").casefold()
            if old and new and old not in protected:
                out[old] = new
    return out


def provider_model(
    provider_id: str,
    patch: dict[str, Any],
    capability: dict[str, Any],
    static_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fixed = patch.get("fixed_endpoint")
    fixed = fixed if isinstance(fixed, dict) else {}
    static_model = static_row.get("model") if isinstance(static_row, dict) and isinstance(static_row.get("model"), dict) else {}

    official_site = str(patch.get("official_site") or static_model.get("officialSite") or static_model.get("knownSite") or "").strip() or None
    official_hub = str(patch.get("official_hub") or static_model.get("officialHub") or "").strip() or None
    official_api = str(patch.get("official_api") or static_model.get("officialApi") or "").strip() or None
    fixed_api = str(fixed.get("api") or static_model.get("fixedApi") or "").strip() or None

    origins: list[str] = []
    for value in (official_site, official_hub, official_api, fixed_api, *(static_model.get("origins") or [])):
        item = origin(value)
        if item and not item.endswith(".invalid") and item not in origins:
            origins.append(item)

    observed_urls: list[str] = []
    for value in [*(patch.get("learned_urls") or []), *(static_model.get("observedUrls") or [])]:
        item = str(value).strip()
        if item and "old.invalid" not in item and item not in observed_urls:
            observed_urls.append(item)
    # Explicit current endpoints are safe provenance facts and help generic
    # route expansion without importing historical/upstream executable code.
    for value in (official_site, official_api, fixed_api):
        item = str(value or "").strip()
        if item and item not in observed_urls:
            observed_urls.append(item)

    # PROVIDER_V3_ROUTE_PROOF_AUTHORITY_V5
    patch_proof = int(patch.get("route_proof_version") or 0)
    static_proof = int(static_model.get("routeProofVersion") or 0)
    proof_version = max(patch_proof, static_proof)
    routes: list[str] = []
    if proof_version >= 5:
        for value in [*(patch.get("learned_routes") or []), *(static_model.get("routes") or [])]:
            item = str(value).strip()
            if item and item != "/" and item not in routes:
                routes.append(item)

    patch_recipe = patch.get("api_recipe") if isinstance(patch.get("api_recipe"), dict) else None
    static_recipe = static_model.get("apiRecipe") if isinstance(static_model.get("apiRecipe"), dict) else None
    candidate_recipe = patch_recipe or static_recipe
    recipe_proof = int(candidate_recipe.get("proofModelVersion") or 0) if isinstance(candidate_recipe, dict) else 0
    api_recipe = candidate_recipe if proof_version >= 5 and recipe_proof >= 5 else None

    return {
        "knownSite": official_site,
        "strategy": str(
            patch.get("capability")
            or capability.get("strategy")
            or capability.get("capability")
            or static_model.get("strategy")
            or "unknown"
        ).strip().casefold(),
        "officialSite": official_site,
        "officialHub": official_hub,
        "officialApi": official_api,
        "fixedApi": fixed_api,
        "origins": origins,
        "observedUrls": observed_urls,
        "routes": routes,
        "apiRecipe": api_recipe,
        "routeProofVersion": proof_version,
        "proofSearchBases": [
            str(value).strip()
            for value in (patch.get("proof_search_bases") or static_model.get("proofSearchBases") or [])
            if str(value).strip()
        ][:6],
        # PROVIDER_EXTERNAL_IDENTITY_BASE_V11
        "proofDetailBases": [
            str(value).strip()
            for value in (patch.get("proof_detail_bases") or static_model.get("proofDetailBases") or [])
            if str(value).strip()
        ][:6],
        # PROVIDER_SEARCH_REQUEST_PLAN_V14
        "proofProtectedHosts": [
            str(value).strip().casefold()
            for value in (patch.get("proof_protected_hosts") or static_model.get("proofProtectedHosts") or [])
            if str(value).strip()
        ][:24],
        "searchRequestPlan": [
            dict(row)
            for row in (patch.get("search_request_plan") or static_model.get("searchRequestPlan") or [])
            if isinstance(row, dict)
        ][:6],
        # PROVIDER_RESPONSE_VALUE_CORRELATION_V20
        # PROVIDER_CORRELATED_VALUE_PLAN_V18
        # PROVIDER_VALUE_CAUSAL_DEPTH_V20_5
        "providerValuePlan": [
            dict(row)
            for row in (patch.get("provider_value_plan") or static_model.get("providerValuePlan") or [])
            if isinstance(row, dict)
        ][:12],
        # PROVIDER_STRUCTURED_EXTERNAL_ID_V13
        "externalIdentityPlan": [
            dict(row)
            for row in (patch.get("external_identity_plan") or static_model.get("externalIdentityPlan") or [])
            if isinstance(row, dict)
        ][:4],
        "sourceRuntimeFamily": str(static_model.get("sourceRuntimeFamily") or "unknown"),
        "identityInput": identity_input(patch, routes, api_recipe),
        "strictIdentity": bool(patch.get("strict_identity", False)),
        "strictHtmlIdentity": bool(patch.get("strict_html_identity", False)),
        "outputUrlHostRewrites": patch.get("output_url_host_rewrites") or [],
        "outputLanguageRules": patch.get("output_language_rules") or [],
        "domainSubstitutions": _runtime_domain_substitutions(patch, static_model),
    }


def normalize_anime_transport_compatibility(entry: dict[str, Any]) -> bool:
    """Project canonical media capability onto Nuvio transport aliases."""
    canonical = []
    source = entry.get("canonicalSupportedTypes") or entry.get("supportedTypes") or []
    for value in source:
        item = str(value or "").strip().casefold()
        if item in {"movie", "tv", "anime"} and item not in canonical:
            canonical.append(item)
    if not canonical:
        return False

    wanted = list(canonical)
    if "anime" in canonical and "tv" not in wanted:
        wanted.append("tv")
    if "tv" in wanted and "series" not in wanted:
        wanted.append("series")

    current = []
    for value in entry.get("supportedTypes") or []:
        item = str(value or "").strip().casefold()
        if item in {"movie", "tv", "anime", "series"} and item not in current:
            current.append(item)

    before_canonical = [
        str(value or "").strip().casefold()
        for value in entry.get("canonicalSupportedTypes") or []
        if str(value or "").strip().casefold() in {"movie", "tv", "anime"}
    ]
    if current == wanted and before_canonical == canonical:
        return False

    entry["supportedTypes"] = wanted
    if wanted != canonical or "canonicalSupportedTypes" in entry:
        entry["canonicalSupportedTypes"] = canonical
    return True


def base_version(value: object) -> str:
    raw = str(value or "0.0.0").strip() or "0.0.0"
    for token in ("-v3-all-", "-tv-native", "-tv-lab", "-tv-strict"):
        if token in raw:
            return raw.split(token, 1)[0]
    return raw


def strict_projection(
    source_manifest: dict[str, Any],
    ids: list[str],
    generation: str,
) -> dict[str, Any]:
    wanted = [canonical_id(v) for v in ids if canonical_id(v)]
    rows_by_id = {
        canonical_id(str(row.get("id") or "")): row
        for row in source_manifest.get("scrapers") or []
        if isinstance(row, dict)
    }
    missing = [provider_id for provider_id in wanted if provider_id not in rows_by_id]
    if missing:
        raise ValueError(f"projection missing providers: {missing}")
    rows = [dict(rows_by_id[provider_id]) for provider_id in wanted]
    return {
        "name": "NiakVIO STRICT CLIENT LAB",
        "version": f"{source_manifest.get('version', '0')}-projection-{generation[:10]}",
        "scrapers": rows,
        "description": (
            "Client validation projection only. Provider JS bytes are the same "
            "cross-device global v3 artifacts used by TV, Mobile and Desktop."
        ),
    }


def materialize_all(
    *,
    source_manifest_path: Path = DEFAULT_SOURCE_MANIFEST,
    overrides_path: Path = DEFAULT_OVERRIDES,
    output_dir: Path = DEFAULT_OUT,
    report_path: Path = DEFAULT_REPORT,
    static_knowledge_path: Path = DEFAULT_STATIC_KNOWLEDGE,
    project_manifest_path: Path | None = None,
    project_ids: list[str] | None = None,
) -> dict[str, Any]:
    manifest = load(source_manifest_path)
    overrides = load(overrides_path)
    static_knowledge = load(static_knowledge_path)
    static_rows = static_knowledge.get("providers")
    if static_knowledge.get("legacyProviderJsExecuted") is not False or static_knowledge.get("upstreamJsExecuted") is not False:
        raise ValueError("static Provider v3 knowledge must be knowledge-only")
    if not isinstance(static_rows, dict):
        raise ValueError("static Provider v3 knowledge providers map required")
    patches = overrides.get("provider_patches")
    capabilities = overrides.get("provider_capabilities")
    if not isinstance(patches, dict) or not isinstance(capabilities, dict):
        raise ValueError("provider override maps required")

    rows = [
        row for row in manifest.get("scrapers") or []
        if isinstance(row, dict) and canonical_id(str(row.get("id") or ""))
    ]
    if len(rows) != EXPECTED_PROVIDER_COUNT:
        raise ValueError(
            f"global v3 manifest provider count={len(rows)} expected={EXPECTED_PROVIDER_COUNT}"
        )

    ids = [canonical_id(str(row.get("id") or "")) for row in rows]
    if len(set(ids)) != EXPECTED_PROVIDER_COUNT:
        raise ValueError("global v3 manifest contains duplicate provider ids")

    patch_ids = {canonical_id(v) for v in patches}
    capability_ids = {canonical_id(v) for v in capabilities}
    missing_patches = sorted(set(ids) - patch_ids)
    missing_capabilities = sorted(set(ids) - capability_ids)
    static_ids = {canonical_id(v) for v in static_rows}
    missing_static = sorted(set(ids) - static_ids)
    if missing_patches or missing_capabilities or missing_static:
        raise ValueError(
            f"structured DATA incomplete patches={missing_patches} "
            f"capabilities={missing_capabilities} static={missing_static}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    report_rows: list[dict[str, Any]] = []
    aggregate = hashlib.sha256()

    for index, entry in enumerate(rows, start=1):
        normalize_anime_transport_compatibility(entry)
        provider_id = canonical_id(str(entry.get("id") or ""))
        print(
            "FIELD_PROVIDER_V3_MATERIALIZE_BEGIN "
            f"index={index} total={len(rows)} provider={provider_id}",
            flush=True,
        )
        patch = patches.get(provider_id)
        capability = capabilities.get(provider_id)
        if not isinstance(patch, dict) or not isinstance(capability, dict):
            raise ValueError(f"{provider_id}: missing structured DATA")

        static_row = static_rows.get(provider_id)
        if not isinstance(static_row, dict):
            raise ValueError(f"{provider_id}: missing durable static knowledge")
        model = provider_model(provider_id, patch, capability, static_row)
        seed = build_clean_provider_seed(
            provider_id,
            entry,
            known_site=model.get("knownSite"),
            provider_model=model,
        )
        base, stripped = build_base_from_seed(
            provider_id,
            seed,
            overrides_path=overrides_path,
        )
        data = build_provider_data_model(
            provider_id,
            entry,
            known_site=model.get("knownSite"),
            provider_model=model,
        )
        bundle = compose_provider_bundle(provider_id, base, data)
        bundle, applied = apply_overrides(
            provider_id,
            bundle,
            phase="discovery",
            include_global_core=True,
            config_path=overrides_path,
        )
        text = bundle.decode("utf-8", errors="strict")

        if text.count("/* BEGIN NIAKVIO_PROVIDER */") != 1:
            raise ValueError(f"{provider_id}: BEGIN PROVIDER cardinality")
        if text.count("/* END NIAKVIO_PROVIDER */") != 1:
            raise ValueError(f"{provider_id}: END PROVIDER cardinality")
        if not text.rstrip().endswith("/* END NIAKVIO_PROVIDER */"):
            raise ValueError(f"{provider_id}: bytes after END PROVIDER")
        if "searchParams.set(" in text or "searchParams.delete(" in text:
            raise ValueError(f"{provider_id}: QuickJS URLSearchParams mutation remains")

        fix_ids = validate_managed_fixes(text)
        config_id = f"PROVIDER.{provider_id.upper()}.CONFIG.V1"
        if config_id not in fix_ids:
            raise ValueError(f"{provider_id}: provider CONFIG Lego missing")
        core_ids = [fix_id for fix_id in fix_ids if fix_id.startswith("CORE.")]
        if not core_ids:
            raise ValueError(f"{provider_id}: no Core Lego materialized")
        boundary = "/* NUVIO_GLOBAL_CORE_START_BOUNDARY_V1 */"
        if text.count(boundary) != 1:
            raise ValueError(
                f"{provider_id}: Core boundary count={text.count(boundary)} expected=1"
            )
        boundary_at = text.index(boundary)
        provider_fix_positions = []
        core_fix_positions = []
        for fix_id in fix_ids:
            span = owned_span(text, fix_id)
            if span is None:
                raise ValueError(f"{provider_id}: managed Lego span missing: {fix_id}")
            if fix_id.startswith("PROVIDER."):
                provider_fix_positions.append(span[0])
            elif fix_id.startswith("CORE."):
                core_fix_positions.append(span[0])
        if provider_fix_positions and max(provider_fix_positions) >= boundary_at:
            raise ValueError(f"{provider_id}: Provider Lego found after Core boundary")
        if core_fix_positions and min(core_fix_positions) <= boundary_at:
            raise ValueError(f"{provider_id}: Core Lego found before Core boundary")

        minimized = minimize_text(text)
        validate_transform(text, minimized.text)
        text = minimized.text
        bundle = text.encode("utf-8")

        # Prove minimization kept Lego ownership and envelope byte-addressable.
        minimized_fix_ids = validate_managed_fixes(text)
        if minimized_fix_ids != fix_ids:
            raise ValueError(f"{provider_id}: minimizer changed managed Lego ownership")
        if text.count("/* BEGIN NIAKVIO_PROVIDER */") != 1 or text.count("/* END NIAKVIO_PROVIDER */") != 1:
            raise ValueError(f"{provider_id}: minimizer changed Provider v3 envelope")
        if text.count(boundary) != 1:
            raise ValueError(f"{provider_id}: minimizer changed Core boundary")

        digest = hashlib.sha256(bundle).hexdigest()
        filename = f"{provider_id}-{digest[:16]}.js"
        relative = f"providers/{filename}"
        (output_dir / filename).write_bytes(bundle)

        entry["filename"] = relative
        entry["version"] = base_version(entry.get("version"))

        aggregate.update(provider_id.encode("utf-8"))
        aggregate.update(bytes.fromhex(digest))
        report_rows.append({
            "provider": provider_id,
            "file": relative,
            "sha256": digest,
            "providerDataSha256": hashlib.sha256(
                json.dumps(
                    data,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest(),
            "baseStrippedGeneratedCore": bool(stripped),
            "fixIds": fix_ids,
            "coreCount": len(core_ids),
            "applied": applied,
            "deviceSpecificJs": False,
            "devices": ["tv", "mobile", "desktop"],
            "legacyProviderJsExecuted": False,
            "upstreamJsExecuted": False,
            "minimizer": {
                "enabled": True,
                "savedBytes": minimized.saved_bytes,
                "transformedLines": minimized.transformed_lines,
                "skippedReason": minimized.skipped_reason,
            },
        })

    generation = aggregate.hexdigest()
    manifest["version"] = str(manifest.get("version") or "0")
    manifest["description"] = (
        "NiakVIO Provider v3 production artifacts. One Provider JS per provider/version "
        "for TV, Mobile and Desktop; client manifests only project these same bytes."
    )
    write_json(source_manifest_path, manifest)

    context = str(os.environ.get("NUVIO_PROVIDER_V3_CONTEXT") or "workspace").strip().casefold()
    if context not in {"workspace", "release", "main"}:
        raise ValueError(f"invalid NUVIO_PROVIDER_V3_CONTEXT: {context}")
    report = {
        "schemaVersion": 3,
        "sourceSha": os.environ.get("GITHUB_SHA") or "",
        "context": context,
        "generation": generation,
        "providerCount": len(report_rows),
        "expectedProviderCount": EXPECTED_PROVIDER_COUNT,
        "providers": report_rows,
        "devicePolicy": {
            "providerJsIsDeviceAgnostic": True,
            "devices": ["tv", "mobile", "desktop"],
            "perDeviceProviderForkAllowed": False,
            "clientManifestProjectionAllowed": True,
        },
        "publication": context in {"release", "main"},
        "mainTouched": context == "main",
        "legacyProviderJsExecuted": False,
        "upstreamJsExecuted": False,
        "staticKnowledgeFile": static_knowledge_path.relative_to(ROOT).as_posix(),
        "staticKnowledgeProviderCount": len(static_rows),
    }
    write_json(report_path, report)

    if project_manifest_path is not None:
        ids_for_projection = project_ids or []
        if not ids_for_projection:
            raise ValueError("project manifest requested without project ids")
        write_json(
            project_manifest_path,
            strict_projection(manifest, ids_for_projection, generation),
        )

    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-manifest", type=Path, default=DEFAULT_SOURCE_MANIFEST)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--static-knowledge", type=Path, default=DEFAULT_STATIC_KNOWLEDGE)
    parser.add_argument("--project-manifest", type=Path)
    parser.add_argument("--project-ids", default="")
    args = parser.parse_args()

    project_ids = [
        value.strip()
        for value in str(args.project_ids or "").split(",")
        if value.strip()
    ]
    report = materialize_all(
        source_manifest_path=args.source_manifest.resolve(),
        overrides_path=args.overrides.resolve(),
        output_dir=args.output_dir.resolve(),
        report_path=args.report.resolve(),
        static_knowledge_path=args.static_knowledge.resolve(),
        project_manifest_path=(
            args.project_manifest.resolve()
            if args.project_manifest is not None
            else None
        ),
        project_ids=project_ids,
    )
    print(
        "FIELD_PROVIDER_V3_ALL_MATERIALIZED "
        f"providers={report['providerCount']} generation={report['generation'][:16]} "
        "devices=tv,mobile,desktop"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
