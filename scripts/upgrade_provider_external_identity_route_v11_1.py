#!/usr/bin/env python3
"""External identity route V11.1.

Runs the V11 proof/recovery/materializer migrations, but owns corrected portfolio
boundaries:
- ProviderBase patching uses stable runtime anchors only;
- metadata helper hosts remain route evidence but can never enter executionRoutes;
- metadata external-identity hints keep their exact network order and may prove a
  later provider request without becoming executable helper routes.

`/series/...` already classifies as a detail route, so adding `{imdbId}` to an
unrelated Python selector was unnecessary and caused the original V11 pre-network
failure.
"""
from __future__ import annotations

import upgrade_provider_external_identity_route_v11 as v11

EXECUTION_MARKER = "ROUTE_RECOVERY_HELPER_EVIDENCE_ONLY_V11_1"
CAUSAL_HINT_MARKER = "ROUTE_RECOVERY_CAUSAL_EXTERNAL_HINT_V11_1"
PROOF_CAUSAL_HINT_MARKER = "PROVIDER_ROUTE_PROOF_CAUSAL_EXTERNAL_HINT_V11_1"


def patch_execution_boundary() -> bool:
    text = v11.RECOVERY.read_text(encoding="utf-8")
    if EXECUTION_MARKER in text:
        validate_execution_boundary(text)
        return False
    if "NIAKVIO_PROVIDER_SOURCE_PLAN_V10" not in text:
        raise AssertionError("V11.1 helper boundary requires Source Plan V10 recovery")
    old = '''    execution_routes = unique([row.get("route") for row in deduped if generic_execution_route(row)], 192)
'''
    new = '''    # ROUTE_RECOVERY_HELPER_EVIDENCE_ONLY_V11_1
    # TMDB/Cinemeta helper calls may carry critical identity evidence (IMDb, title,
    # aliases), but they are not provider execution routes. Keep them in routeData
    # and proven routes for causality while excluding them from the runtime plan.
    execution_routes = unique([
        row.get("route") for row in deduped
        if _repair_recipe_origin_allowed(row) and generic_execution_route(row)
    ], 192)
'''
    text = v11.once(text, old, new, "helper-evidence-execution-boundary")
    v11.RECOVERY.write_text(text, encoding="utf-8")
    validate_execution_boundary(text)
    return True


def validate_execution_boundary(text: str | None = None) -> None:
    value = text if text is not None else v11.RECOVERY.read_text(encoding="utf-8")
    for needle in (
        EXECUTION_MARKER,
        "if _repair_recipe_origin_allowed(row) and generic_execution_route(row)",
    ):
        if needle not in value:
            raise AssertionError(f"V11.1 execution boundary missing: {needle}")


def patch_causal_external_hints() -> bool:
    """Carry helper response identities forward without giving helpers route authority."""
    changed = False
    proof = v11.PROOF.read_text(encoding="utf-8")
    if PROOF_CAUSAL_HINT_MARKER not in proof:
        proof = v11.once(
            proof,
            '''        elif value in imdb_values and key_l in (EXTERNAL_IDENTITY_HINT_KEYS | PROVIDER_VALUE_KEYS):
            placeholder = "{imdbId}"
''',
            '''        # PROVIDER_ROUTE_PROOF_CAUSAL_EXTERNAL_HINT_V11_1
        # Search endpoints may legitimately consume an IMDb identity resolved by
        # an earlier metadata request (for example q=tt...). Exact value equality
        # is still required; the query key alone never creates identity authority.
        elif value in imdb_values and key_l in (
            EXTERNAL_IDENTITY_HINT_KEYS | PROVIDER_VALUE_KEYS |
            {"q", "query", "search", "keyword"}
        ):
            placeholder = "{imdbId}"
''',
            "proof-imdb-search-query-placeholder",
        )
        proof = v11.once(
            proof,
            '''    hints: list[dict[str, str]] = []
    out: list[dict[str, Any]] = []
    for index, fetch in enumerate(task.get("fetches") or []):
        if not isinstance(fetch, dict):
            continue
        route, derivation = derive_observed_route(fetch, task, hints)
''',
            '''    hints: list[dict[str, str]] = []
    out: list[dict[str, Any]] = []
    for index, fetch in enumerate(task.get("fetches") or []):
        if not isinstance(fetch, dict):
            continue
        # PROVIDER_ROUTE_PROOF_CAUSAL_EXTERNAL_HINT_V11_1
        # Hint-only rows preserve metadata response ordering but never produce a
        # provider route. This prevents a later response from proving an earlier
        # request while allowing TMDB->IMDb->provider chains to remain causal.
        if fetch.get("proof_hint_only") is True:
            hints.extend(response_value_hints(fetch))
            if len(hints) > 240:
                hints = hints[-240:]
            continue
        route, derivation = derive_observed_route(fetch, task, hints)
''',
            "proof-causal-hint-only-row",
        )
        v11.PROOF.write_text(proof, encoding="utf-8")
        changed = True

    recovery = v11.RECOVERY.read_text(encoding="utf-8")
    if CAUSAL_HINT_MARKER not in recovery:
        recovery = v11.once(
            recovery,
            '''            fetches = [value for row in result.get("network") or [] if (value := observation_fetch(row)) is not None]
            task = {
''',
            '''            # ROUTE_RECOVERY_CAUSAL_EXTERNAL_HINT_V11_1
            # Preserve the exact network order of infrastructure identity hints,
            # but carry no helper URL/method into provider execution authority.
            fetches: list[dict[str, Any]] = []
            provider_fetch_count = 0
            for network_row in result.get("network") or []:
                if not isinstance(network_row, dict):
                    continue
                value = observation_fetch(network_row)
                if value is not None:
                    fetches.append(value)
                    provider_fetch_count += 1
                    continue
                hints = network_row.get("response_value_hints")
                if network_row.get("infrastructure") and isinstance(hints, list) and hints:
                    fetches.append({
                        "proof_hint_only": True,
                        "response_value_hints": copy.deepcopy(hints[:80]),
                    })
            task = {
''',
            "recovery-causal-helper-hints",
        )
        recovery = v11.once(
            recovery,
            '''                "providerRequestCount": len(fetches),
''',
            '''                "providerRequestCount": provider_fetch_count,
''',
            "recovery-provider-request-count-excludes-hints",
        )
        v11.RECOVERY.write_text(recovery, encoding="utf-8")
        changed = True

    validate_causal_external_hints()
    return changed


def validate_causal_external_hints() -> None:
    proof = v11.PROOF.read_text(encoding="utf-8")
    recovery = v11.RECOVERY.read_text(encoding="utf-8")
    for needle in (
        PROOF_CAUSAL_HINT_MARKER,
        'fetch.get("proof_hint_only") is True',
        '{"q", "query", "search", "keyword"}',
    ):
        if needle not in proof:
            raise AssertionError(f"V11.1 causal proof hint missing: {needle}")
    for needle in (
        CAUSAL_HINT_MARKER,
        'network_row.get("infrastructure")',
        '"proof_hint_only": True',
        '"providerRequestCount": provider_fetch_count',
    ):
        if needle not in recovery:
            raise AssertionError(f"V11.1 causal recovery hint missing: {needle}")


def patch_base_fixed() -> bool:
    text = v11.BASE.read_text(encoding="utf-8")
    if v11.BASE_MARKER in text:
        v11.validate_base(text)
        return False
    if "NIAKVIO_PROVIDER_SOURCE_PLAN_V10" not in text:
        raise AssertionError("external identity V11.1 requires Source Plan V10 ProviderBase first")

    text = v11.once(
        text,
        '''        "proofSearchBases": [
            str(value).strip()
            for value in incoming_model.get("proofSearchBases") or []
            if _provider_data_url_is_executable(value)
        ][:6],
        "sourceRuntimeFamily": str(incoming_model.get("sourceRuntimeFamily") or "unknown"),
''',
        '''        "proofSearchBases": [
            str(value).strip()
            for value in incoming_model.get("proofSearchBases") or []
            if _provider_data_url_is_executable(value)
        ][:6],
        "proofDetailBases": [
            str(value).strip()
            for value in incoming_model.get("proofDetailBases") or []
            if _provider_data_url_is_executable(value)
        ][:6],
        "sourceRuntimeFamily": str(incoming_model.get("sourceRuntimeFamily") or "unknown"),
''',
        "base-data-proof-detail-bases",
    )
    text = v11.once(
        text,
        '''function _runtimeBases() {
  return _uniq([..._searchBases(), ..._apiBases()]);
}''',
        '''function _runtimeBases() {
  return _uniq([
    ...(Array.isArray(NIAKVIO_PROVIDER_MODEL.proofDetailBases) ? NIAKVIO_PROVIDER_MODEL.proofDetailBases : []),
    ..._searchBases(),
    ..._apiBases()
  ].map(_substituteDomain));
}''',
        "base-proof-detail-runtime-priority",
    )
    text = v11.once(
        text,
        '''  const id = _text(meta && meta.tmdbId);
  const title = _text(meta && meta.title);
''',
        '''  const id = _text(meta && meta.tmdbId);
  const imdbId = _text(meta && meta.imdbId);
  const title = _text(meta && meta.title);
''',
        "base-learned-imdb-value",
    )
    text = v11.once(
        text,
        '''  route = route.replace(/\\{tmdb_?id\\}/gi, encodeURIComponent(id));
''',
        '''  route = route.replace(/\\{tmdb_?id\\}/gi, encodeURIComponent(id));
  route = route.replace(/\\{imdb_?id\\}/gi, encodeURIComponent(imdbId));
''',
        "base-expand-imdb-learned-route",
    )
    text = v11.once(
        text,
        '''  if (/\\{(?:tmdb_?id|id|slug|title)\\}/i.test(value) || /\\/(?:title|movie|film|series|tv|show|watch|media)(?:[/?#]|$)/i.test(value)) return "detail";
''',
        '''  if (/\\{(?:tmdb_?id|imdb_?id|id|slug|title)\\}/i.test(value) || /\\/(?:title|movie|film|series|tv|show|watch|media)(?:[/?#]|$)/i.test(value)) return "detail";
''',
        "base-route-kind-imdb",
    )

    anchor = '''  // Slug-driven catalogues (Sekai and similar) do not expose a search endpoint.
  // Generate only deterministic title slugs from Core metadata.
  const detailRoutes = _spv4Routes().filter(route => _spv4IsDetailRoute(route, family));
'''
    replacement = '''  // NIAKVIO_PROVIDER_BASE_EXTERNAL_IDENTITY_ROUTE_V11
  // External-ID catalogues may have no title search endpoint. Core already owns
  // TMDB -> IMDb metadata resolution, so execute only routes whose `{imdbId}`
  // placeholder was proof-derived from a prior response.
  const detailRoutes = _spv4Routes().filter(route => _spv4IsDetailRoute(route, family));
  if (meta && meta.imdbId) {
    for (const route of detailRoutes) {
      if (!/\\{imdb_?id\\}/i.test(route)) continue;
      out.push(..._spv4Expand(route, meta, {}, mediaType, season, episode));
    }
  }
  // Slug-driven catalogues (Sekai and similar) do not expose a search endpoint.
  // Generate only deterministic title slugs from Core metadata.
'''
    text = v11.once(text, anchor, replacement, "base-external-id-detail-plan")
    v11.BASE.write_text(text, encoding="utf-8")
    v11.validate_base(text)
    return True


def main() -> int:
    changed = v11.patch_worker() | v11.patch_proof() | v11.patch_recovery()
    changed |= patch_execution_boundary()
    changed |= patch_causal_external_hints()
    changed |= v11.patch_materializer() | patch_base_fixed()
    v11.validate_worker()
    v11.validate_proof()
    v11.validate_recovery()
    validate_execution_boundary()
    validate_causal_external_hints()
    v11.validate_materializer()
    v11.validate_base()
    print(
        f"PROVIDER_EXTERNAL_IDENTITY_ROUTE_V11_1_OK changed={str(changed).lower()} "
        "redundant_anchor_removed=1 helper_routes_evidence_only=1 imdb_hint=1 "
        "causal_helper_hints=1 imdb_search_query=1 "
        "generic_imdb_id_reclassified=1 provider_id_separation=1 "
        "literal_imdb_fail_closed=1 imdb_placeholder=1 proof_detail_base=1 "
        "source_plan_external_id=1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
