#!/usr/bin/env python3
"""Source Plan V10: proof-owned search authority and safer multi-hop fallback.

This migration is provider-agnostic. It fixes four portfolio-level reconstruction
losses exposed by the live multi-hop census:
- positive proof-backed search origins become execution DATA without overwriting
  provider branding/hub metadata;
- explicit runtime domain replacements are consumed by ProviderBase and by recipe
  bases/Origin/Referer headers;
- a search recipe that covers only part of the upstream-positive semantic lanes
  fails open into the source-family plan instead of returning [] immediately;
- catalogue URL scoring is season-aware and obvious navigation links cannot steal
  the bounded player crawl budget.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / "scripts" / "recover_provider_routes_from_upstreams.py"
MATERIALIZER = ROOT / "scripts" / "materialize_provider_v3_all.py"
BASE = ROOT / "scripts" / "provider_base_store.py"
MARKER = "NIAKVIO_PROVIDER_SOURCE_PLAN_V10"


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


def patch_recovery() -> bool:
    text = RECOVERY.read_text(encoding="utf-8")
    if MARKER in text:
        validate_recovery(text)
        return False
    if "ROUTE_RECOVERY_TYPED_POSITIVE_ONLY_V8" not in text:
        raise AssertionError("Source Plan V10 requires repair V8 first")

    # A simple search recipe is useful only for the semantic lanes it can actually
    # resolve. If the same positive trace proves additional lanes, preserve the
    # recipe as a fast path but let the family Source Plan execute after a miss.
    old = '''    if "searchRoute" in recipe and not ({"movieRoute", "episodeRoute"} & recipe.keys()):
        return None
    return recipe
'''
    new = '''    if "searchRoute" in recipe and not ({"movieRoute", "episodeRoute"} & recipe.keys()):
        return None

    # NIAKVIO_PROVIDER_SOURCE_PLAN_V10
    if "searchRoute" in recipe:
        positive_types = {
            str(row.get("semanticType") or "").strip().casefold()
            for row in records
            if int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0
        }
        covered_types: set[str] = set()
        if recipe.get("movieRoute"):
            covered_types.add("movie")
        if recipe.get("episodeRoute"):
            covered_types.update({"tv", "anime"})
        uncovered = sorted(value for value in positive_types if value and value not in covered_types)
        if uncovered:
            recipe["allowGenericFallback"] = True
            recipe["partialCoverageFallback"] = uncovered
    return recipe
'''
    text = once(text, old, new, "partial-recipe-fallback")

    # Persist the positive search origin as execution authority. This is separate
    # from officialSite/officialHub: proof may follow a current runtime terminal
    # while public hub metadata remains stable. Existing explicit replacement DATA
    # is applied before persistence so stale proof origins do not bypass a known
    # current terminal.
    anchor = "def apply_recovery(report: dict[str, Any]) -> dict[str, Any]:\n"
    helper = '''def _proof_execution_origin(origin: object, patch: dict[str, Any]) -> str:\n    raw = str(origin or "").strip()\n    try:\n        parsed = urllib.parse.urlsplit(raw)\n    except ValueError:\n        return ""\n    if parsed.scheme not in {"http", "https"} or not parsed.hostname:\n        return ""\n    host = (parsed.hostname or "").casefold()\n    target = ""\n    for key in ("runtime_domain_replacements", "replacements", "domain_substitutions"):\n        mapping = patch.get(key)\n        if not isinstance(mapping, dict):\n            continue\n        candidate = str(mapping.get(host) or "").strip()\n        if candidate:\n            target = candidate\n            break\n    if target:\n        if "://" not in target:\n            target = f"{parsed.scheme}://{target}"\n        try:\n            target_parts = urllib.parse.urlsplit(target)\n            if target_parts.hostname:\n                netloc = target_parts.netloc\n                parsed = parsed._replace(netloc=netloc)\n        except ValueError:\n            pass\n    return urllib.parse.urlunsplit(parsed)\n\n\ndef _positive_proof_search_bases(route_data: list[dict[str, Any]], patch: dict[str, Any]) -> list[str]:\n    out: list[str] = []\n    for row in route_data:\n        if not isinstance(row, dict) or row.get("requestSpecReusable") is not True:\n            continue\n        if not (int(row.get("taskStreamCount") or 0) > 0 or int(row.get("taskRawStreamCount") or 0) > 0):\n            continue\n        if not _repair_recipe_origin_allowed(row):\n            continue\n        if row.get("role") != "search" and not _record_has_search_query(row):\n            continue\n        base = _proof_execution_origin(row.get("origin"), patch)\n        if base and base not in out:\n            out.append(base)\n    return out[:6]\n\n\n'''
    text = once(text, anchor, helper + anchor, "proof-search-base-helper")

    old_apply = '''        route_data = copy.deepcopy(recovered.get("routeData") or [])
        recipe = recovered.get("apiRecipe") if isinstance(recovered.get("apiRecipe"), dict) else None
'''
    new_apply = '''        route_data = copy.deepcopy(recovered.get("routeData") or [])
        proof_search_bases = _positive_proof_search_bases(route_data, patch)
        if proof_search_bases:
            patch["proof_search_bases"] = proof_search_bases
            model["proofSearchBases"] = proof_search_bases
        else:
            patch.pop("proof_search_bases", None)
            model.pop("proofSearchBases", None)
        recipe = recovered.get("apiRecipe") if isinstance(recovered.get("apiRecipe"), dict) else None
'''
    text = once(text, old_apply, new_apply, "persist-proof-search-base")
    RECOVERY.write_text(text, encoding="utf-8")
    validate_recovery(text)
    return True


def patch_materializer() -> bool:
    text = MATERIALIZER.read_text(encoding="utf-8")
    if MARKER in text:
        validate_materializer(text)
        return False

    anchor = '''def provider_model(
    provider_id: str,
'''
    helper = '''# NIAKVIO_PROVIDER_SOURCE_PLAN_V10\ndef _runtime_domain_substitutions(patch: dict[str, Any]) -> dict[str, str]:\n    out: dict[str, str] = {}\n    # runtime_domain_replacements is explicit execution DATA. Historical generic\n    # replacements remain candidate knowledge unless already promoted there.\n    for key in ("domain_substitutions", "runtime_domain_replacements"):\n        mapping = patch.get(key)\n        if not isinstance(mapping, dict):\n            continue\n        for source, target in mapping.items():\n            old = str(source or "").strip().casefold()\n            new = str(target or "").strip().casefold()\n            if "://" in old:\n                old = (urlparse(old).hostname or "").casefold()\n            if "://" in new:\n                new = (urlparse(new).hostname or "").casefold()\n            if old and new:\n                out[old] = new\n    return out\n\n\n'''
    text = once(text, anchor, helper + anchor, "runtime-domain-helper")

    old_return = '''        "routeProofVersion": proof_version,
        "sourceRuntimeFamily": str(static_model.get("sourceRuntimeFamily") or "unknown"),
'''
    new_return = '''        "routeProofVersion": proof_version,
        "proofSearchBases": [
            str(value).strip()
            for value in (patch.get("proof_search_bases") or static_model.get("proofSearchBases") or [])
            if str(value).strip()
        ][:6],
        "sourceRuntimeFamily": str(static_model.get("sourceRuntimeFamily") or "unknown"),
'''
    text = once(text, old_return, new_return, "project-proof-search-bases")
    text = once(
        text,
        '        "domainSubstitutions": patch.get("domain_substitutions") or {},\n',
        '        "domainSubstitutions": _runtime_domain_substitutions(patch),\n',
        "project-runtime-domain-replacements",
    )
    MATERIALIZER.write_text(text, encoding="utf-8")
    validate_materializer(text)
    return True


def patch_base() -> bool:
    text = BASE.read_text(encoding="utf-8")
    if MARKER in text:
        validate_base(text)
        return False

    # DATA projection.
    text = once(
        text,
        '''        "routeProofVersion": int(incoming_model.get("routeProofVersion") or 0),
        "sourceRuntimeFamily": str(incoming_model.get("sourceRuntimeFamily") or "unknown"),
''',
        '''        "routeProofVersion": int(incoming_model.get("routeProofVersion") or 0),
        "proofSearchBases": [
            str(value).strip()
            for value in incoming_model.get("proofSearchBases") or []
            if _provider_data_url_is_executable(value)
        ][:6],
        "sourceRuntimeFamily": str(incoming_model.get("sourceRuntimeFamily") or "unknown"),
''',
        "base-data-proof-search-bases",
    )

    # Search execution prefers fresh proof origin, then durable metadata bases.
    text = once(
        text,
        '''function _searchBases() {
  return _uniq([
    NIAKVIO_PROVIDER_MODEL.officialSite,
''',
        '''function _searchBases() {
  return _uniq([
    ...(Array.isArray(NIAKVIO_PROVIDER_MODEL.proofSearchBases) ? NIAKVIO_PROVIDER_MODEL.proofSearchBases : []),
    NIAKVIO_PROVIDER_MODEL.officialSite,
''',
        "runtime-proof-search-priority",
    )

    # Recipe bases and URL-valued static headers follow the same current-domain
    # substitution contract as all other Source Plan requests.
    text = once(
        text,
        '''  const spec = { method, headers: _recipeExpandObject(raw.headers || {}, values) || {} };
  const bodyKind = _text(raw.bodyKind || "").toLowerCase();
''',
        '''  const spec = { method, headers: _recipeExpandObject(raw.headers || {}, values) || {} };
  for (const key of Object.keys(spec.headers)) {
    if (/^(?:origin|referer|referrer)$/i.test(key) && /^https?:\\/\\//i.test(_text(spec.headers[key]))) {
      spec.headers[key] = _substituteDomain(spec.headers[key]);
    }
  }
  const bodyKind = _text(raw.bodyKind || "").toLowerCase();
''',
        "recipe-header-domain-substitution",
    )
    text = once(
        text,
        ''']).filter(value=>/^https?:/i.test(_text(value)));
}
async function _recipeStatusDynamicBase(recipe){
''',
        ''']).map(_substituteDomain).filter(value=>/^https?:/i.test(_text(value)));
}
async function _recipeStatusDynamicBase(recipe){
''',
        "recipe-base-domain-substitution",
    )

    # Catalogue scoring now understands explicit season tokens. A season mismatch
    # is a strong negative signal, while an unnumbered series URL remains eligible
    # (important for season 1 catalogues that use the base title URL).
    old_score = '''function _spv4UrlScore(url, meta) {
  let score = _candidateScore(url, meta);
'''
    new_score = '''function _spv10SeasonUrlScore(url, mediaType, season) {
  if (mediaType === "movie" || season == null) return 0;
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname || "").toLowerCase(); } catch (_) { return 0; }
  const wanted = Math.max(1, Number(season) || 1);
  let observed = null;
  const match = path.match(/(?:season|saison)[-_ /]*(\\d{1,3})|(?:^|[-_/])(\\d{1,3})(?:st|nd|rd|th)[-_ ]*season(?:[-_/]|$)|(?:^|[-_/])s(\\d{1,3})(?:[-_/]|$)/i);
  if (match) observed = Number(match[1] || match[2] || match[3] || 0) || null;
  if (observed == null) return 0;
  return observed === wanted ? 180 : -320;
}
function _spv4UrlScore(url, meta, mediaType, season) {
  let score = _candidateScore(url, meta) + _spv10SeasonUrlScore(url, mediaType, season);
'''
    text = once(text, old_score, new_score, "season-aware-catalogue-score")
    text = once(
        text,
        'function _spv4HtmlDetails(html, base, meta) {\n',
        'function _spv4HtmlDetails(html, base, meta, mediaType, season) {\n',
        "html-details-signature",
    )
    text = once(
        text,
        '.map(url => ({ url: _substituteDomain(url), score: _spv4UrlScore(url, meta) }))\n',
        '.map(url => ({ url: _substituteDomain(url), score: _spv4UrlScore(url, meta, mediaType, season) }))\n',
        "html-details-season-score",
    )
    text = once(
        text,
        '          else out.push(..._spv4HtmlDetails(payload.text, payload.base, meta));\n',
        '          else out.push(..._spv4HtmlDetails(payload.text, payload.base, meta, mediaType, season));\n',
        "find-details-season-context",
    )

    # Obvious UI actions are never player traversal candidates.
    text = once(
        text,
        '''    if (/\\/(?:feed|comments?\\/feed|wp-json(?:\\/|$)|wp-admin|admin|login|register|assets?|static|images?|icons?|fonts?)(?:[/?#.-]|$)/i.test(path)) return false;
''',
        '''    if (/\\/(?:feed|comments?\\/feed|wp-json(?:\\/|$)|wp-admin|admin|login|register|signin|signup|collapse|assets?|static|images?|icons?|fonts?)(?:[/?#.-]|$)/i.test(path)) return false;
''',
        "crawl-navigation-noise",
    )

    text = text.replace(
        "/* NIAKVIO_PROVIDER_BASE_SOURCE_PLAN_V4 */",
        "/* NIAKVIO_PROVIDER_SOURCE_PLAN_V10 */\n/* NIAKVIO_PROVIDER_BASE_SOURCE_PLAN_V4 */",
        1,
    )
    BASE.write_text(text, encoding="utf-8")
    validate_base(text)
    return True


def validate_recovery(text: str | None = None) -> None:
    value = text if text is not None else RECOVERY.read_text(encoding="utf-8")
    for needle in (
        MARKER,
        "partialCoverageFallback",
        "def _positive_proof_search_bases",
        'patch["proof_search_bases"]',
        'model["proofSearchBases"]',
        "runtime_domain_replacements",
    ):
        if needle not in value:
            raise AssertionError(f"V10 recovery missing: {needle}")


def validate_materializer(text: str | None = None) -> None:
    value = text if text is not None else MATERIALIZER.read_text(encoding="utf-8")
    for needle in (
        MARKER,
        "def _runtime_domain_substitutions",
        '"proofSearchBases"',
    ):
        if needle not in value:
            raise AssertionError(f"V10 materializer missing: {needle}")
    # V10 itself introduced the one-argument projector. Later V14 adds
    # static_model only as proof-protected-host input; both are valid V10+
    # shapes, while runtime-domain authority is still enforced separately.
    domain_projection_v10 = '"domainSubstitutions": _runtime_domain_substitutions(patch)'
    domain_projection_v14 = '"domainSubstitutions": _runtime_domain_substitutions(patch, static_model)'
    if domain_projection_v10 not in value and domain_projection_v14 not in value:
        raise AssertionError("V10 materializer missing runtime domainSubstitutions projection")


def validate_base(text: str | None = None) -> None:
    value = text if text is not None else BASE.read_text(encoding="utf-8")
    for needle in (
        MARKER,
        "NIAKVIO_PROVIDER_MODEL.proofSearchBases",
        "_spv10SeasonUrlScore",
        "partialCoverageFallback" if False else "_substituteDomain(spec.headers[key])",
        "]).map(_substituteDomain).filter",
        "signin|signup|collapse",
    ):
        if needle not in value:
            raise AssertionError(f"V10 ProviderBase missing: {needle}")


def main() -> int:
    changed = patch_recovery() | patch_materializer() | patch_base()
    validate_recovery()
    validate_materializer()
    validate_base()
    print(
        f"PROVIDER_SOURCE_PLAN_V10_OK changed={str(changed).lower()} "
        "proof_search_base=1 runtime_domain_replacements=1 recipe_domain_rewrite=1 "
        "partial_recipe_fallback=1 season_scoring=1 navigation_noise_guard=1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
