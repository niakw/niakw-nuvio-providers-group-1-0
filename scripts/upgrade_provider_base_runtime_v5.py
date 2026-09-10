#!/usr/bin/env python3
'''Upgrade the common ProviderBase reader through cumulative runtime v9 fixes.

The verified v5 upgrader is preserved verbatim in
upgrade_provider_base_runtime_v5_legacy.py. This stable entry point keeps
existing workflows compatible while always applying the current cumulative
reader fixes and shared stream-presentation safety fixes.
'''
from __future__ import annotations

import re

import upgrade_provider_base_runtime_v5_legacy as runtime_v5
import upgrade_provider_base_runtime_v6 as runtime_v6
import upgrade_provider_base_runtime_v7 as runtime_v7
import upgrade_stream_presentation_unknown_quality_v1 as stream_quality_projection


def _once_whitespace_tolerant(text: str, old: str, new: str, label: str) -> str:
    """Match one exact source anchor while ignoring formatting-only whitespace drift."""
    parts = re.split(r'(\s+)', old)
    pattern = ''.join(r'\s+' if part.isspace() else re.escape(part) for part in parts if part)
    matches = list(re.finditer(pattern, text, flags=re.MULTILINE))
    if len(matches) != 1:
        raise AssertionError(f'{label}: expected one whitespace-tolerant anchor, got {len(matches)}')
    match = matches[0]
    return text[:match.start()] + new + text[match.end():]


def _patch_v7_safe_html_text() -> bool:
    """Use the existing deterministic HTML scanner in the DLE title scorer."""
    target = runtime_v7.TARGET
    text = target.read_text(encoding='utf-8')
    unsafe = '_text(match[4]).replace(/<[^>]+>/g, " ")'
    safe = '_htmlVisibleText(match[4])'
    unsafe_count = text.count(unsafe)
    safe_count = text.count(safe)
    if unsafe_count == 0:
        if safe_count < 1:
            raise AssertionError(
                f'v7-safe-html-text: expected at least one safe scanner when no legacy form remains, got {safe_count}'
            )
        return False
    if unsafe_count != 1:
        raise AssertionError(f'v7-safe-html-text: expected one unsafe anchor, got {unsafe_count}')
    text = text.replace(unsafe, safe, 1)
    target.write_text(text, encoding='utf-8')
    return True


def _patch_v8_api_recipe_precedence() -> bool:
    """An explicit API recipe is executable authority, not a hint after crawling."""
    target = runtime_v7.TARGET
    text = target.read_text(encoding='utf-8')
    marker = '/* NIAKVIO_PROVIDER_BASE_API_RECIPE_FIRST_V8 */'
    if marker in text:
        if text.count(marker) != 1:
            raise AssertionError(f'v8-api-recipe-first: marker count={text.count(marker)}')
        return False

    old = '''async function _spv4GetStreams(tmdbId, mediaType, season, episode) {
const family = _spv4Family();
const type = _text(mediaType || "movie").toLowerCase();
if (family === "stremio-json") {'''
    new = '''async function _spv4GetStreams(tmdbId, mediaType, season, episode) {
const family = _spv4Family();
const type = _text(mediaType || "movie").toLowerCase();
/* NIAKVIO_PROVIDER_BASE_API_RECIPE_FIRST_V8 */
if (NIAKVIO_PROVIDER_MODEL.apiRecipe) {
const recipePrimary = await getStreams(tmdbId, type, season, episode);
if (Array.isArray(recipePrimary) && recipePrimary.length) return recipePrimary;
if (NIAKVIO_PROVIDER_MODEL.apiRecipe.allowGenericFallback !== true) return [];
}
if (family === "stremio-json") {'''
    text = _once_whitespace_tolerant(text, old, new, 'v8-api-recipe-first')
    target.write_text(text, encoding='utf-8')
    return True


def _patch_v9_shared_identity_policy() -> bool:
    """Delegate catalogue identity to CORE.STREAM_IDENTITY.V1.

    ProviderBase must not own a second title/type/year policy. The Core Lego is
    evaluated after ProviderBase declarations but before any getStreams call, so
    these functions resolve the shared policy lazily at invocation time.
    """
    target = runtime_v7.TARGET
    text = target.read_text(encoding='utf-8')
    marker = '/* NIAKVIO_PROVIDER_BASE_SHARED_IDENTITY_POLICY_V9 */'
    if marker in text:
        if text.count(marker) != 1:
            raise AssertionError(f'v9-shared-identity-policy: marker count={text.count(marker)}')
        return False

    old_score = '''function _recipeScore(row, meta, recipe, expectedMedia) {
  const title = _slug(_recipeValue(row, recipe.titleFields || ["title","name","post_title","original_title"]));
  const expectedTitles = _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])])
    .map(_slug).filter(Boolean);
  const expected = expectedTitles[0] || "";
  const actualMedia = _recipeMediaType(row, recipe);
  const year = _recipeValue(row, recipe.yearFields || ["year","release_date","first_air_date"]).slice(0, 4);
  const expectedYear = _text(meta && meta.year).slice(0, 4);
  const providerId = _recipeValue(row, recipe.idFields || ["id","_id","media_id","post_id"]);

  if (recipe.strictIdentity) {
    if (!providerId || !title || !expectedTitles.length || !expectedTitles.includes(title)) return -1;
    if (actualMedia && expectedMedia && actualMedia !== expectedMedia) return -1;
    if (recipe.requireProviderTypeEvidence === true && (!actualMedia || !expectedMedia)) return -1;
    if (expectedYear) {
      if (!year || !/^\\d{4}$/.test(year)) return -1;
      if (Math.abs(Number(year) - Number(expectedYear)) > 1) return -1;
    }
    return 100 + (year === expectedYear ? 20 : 10) + 20;
  }

  if (actualMedia && expectedMedia && actualMedia !== expectedMedia) return -1;
  if (year && expectedYear && year !== expectedYear) return -1;
  let score = 0;
  if (title && expected && title === expected) score += 200;
  else if (title && expected && (title.includes(expected) || expected.includes(title))) score += 90;
  if (title && expected) {
    for (const token of expected.split("-").filter(value => value.length >= 3)) {
      if (title.includes(token)) score += 10;
    }
  }
  if (year && expectedYear && year === expectedYear) score += 40;
  if (actualMedia && expectedMedia && actualMedia === expectedMedia) score += 60;
  if (providerId) score += 15;
  return score;
}'''
    new_score = '''/* NIAKVIO_PROVIDER_BASE_SHARED_IDENTITY_POLICY_V9 */
function _identityPolicy() {
  try {
    const policy = typeof globalThis !== "undefined" ? globalThis.__nuvioIdentityPolicyV1 : null;
    return policy && typeof policy.catalogueScore === "function" && typeof policy.htmlIdentityOk === "function" ? policy : null;
  } catch (_) { return null; }
}
function _recipeScore(row, meta, recipe, expectedMedia) {
  const policy = _identityPolicy();
  if (!policy) return -1;
  return Number(policy.catalogueScore({
    title: _recipeValue(row, recipe.titleFields || ["title","name","post_title","original_title"]),
    expectedTitles: _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])]).filter(Boolean),
    actualMedia: _recipeMediaType(row, recipe),
    expectedMedia,
    year: _recipeValue(row, recipe.yearFields || ["year","release_date","first_air_date"]).slice(0, 4),
    expectedYear: _text(meta && meta.year).slice(0, 4),
    providerId: _recipeValue(row, recipe.idFields || ["id","_id","media_id","post_id"]),
    strictIdentity: recipe.strictIdentity === true,
    requireProviderTypeEvidence: recipe.requireProviderTypeEvidence === true
  }));
}'''
    text = _once_whitespace_tolerant(text, old_score, new_score, 'v9-recipe-shared-identity-policy')

    old_html = '''function _strictHtmlIdentityOk(html, meta) {
  if (!NIAKVIO_PROVIDER_MODEL.strictHtmlIdentity) return true;
  if (!meta || !meta.title) return false;
  const visible = _htmlVisibleText(html);
  const normalized = _slug(visible);
  const titles = _uniq([meta.title, ...((Array.isArray(meta.aliases) ? meta.aliases : []))])
    .map(_slug)
    .filter(Boolean);
  if (!titles.length || !titles.some(title => normalized.includes(title))) return false;
  const year = _text(meta.year).slice(0, 4);
  if (year && /^\\d{4}$/.test(year)) {
    const years = _text(html).match(/\\b(?:19|20)\\d{2}\\b/g) || [];
    if (years.length && !years.includes(year)) return false;
  }
  return true;
}'''
    new_html = '''function _strictHtmlIdentityOk(html, meta, mediaType) {
  if (!NIAKVIO_PROVIDER_MODEL.strictHtmlIdentity) return true;
  const policy = _identityPolicy();
  if (!policy) return false;
  return policy.htmlIdentityOk({
    strictIdentity: true,
    html,
    visibleText: _htmlVisibleText(html),
    expectedTitles: _uniq([meta && meta.title, ...((meta && Array.isArray(meta.aliases)) ? meta.aliases : [])]).filter(Boolean),
    expectedYear: _text(meta && meta.year).slice(0, 4),
    mediaType
  }) === true;
}'''
    text = _once_whitespace_tolerant(text, old_html, new_html, 'v9-html-shared-identity-policy')
    text = _once_whitespace_tolerant(
        text,
        'if (!_strictHtmlIdentityOk(html, meta)) continue;',
        'if (!_strictHtmlIdentityOk(html, meta, mediaType)) continue;',
        'v9-html-identity-call-media-type',
    )
    target.write_text(text, encoding='utf-8')
    return True


def patch() -> bool:
    changed_v5 = runtime_v5.patch()
    runtime_v5.validate()
    changed_v6 = runtime_v6.patch()
    runtime_v6.validate()
    runtime_v7.once = _once_whitespace_tolerant
    changed_v7 = runtime_v7.patch()
    changed_safe_html = _patch_v7_safe_html_text()
    changed_recipe_first = _patch_v8_api_recipe_precedence()
    changed_identity_policy = _patch_v9_shared_identity_policy()
    changed_stream_projection = stream_quality_projection.patch()
    return bool(
        changed_v5
        or changed_v6
        or changed_v7
        or changed_safe_html
        or changed_recipe_first
        or changed_identity_policy
        or changed_stream_projection
    )


def validate() -> None:
    runtime_v5.validate()
    runtime_v6.validate()
    runtime_v7.validate()
    stream_quality_projection.validate()
    text = runtime_v7.TARGET.read_text(encoding='utf-8')
    if '_htmlVisibleText(match[4])' not in text:
        raise AssertionError('runtime v7 DLE parser must use deterministic HTML text scanner')
    if '_text(match[4]).replace(/<[^>]+>/g, " ")' in text:
        raise AssertionError('runtime v7 DLE parser contains forbidden HTML filtering regexp')
    marker = '/* NIAKVIO_PROVIDER_BASE_API_RECIPE_FIRST_V8 */'
    if text.count(marker) != 1:
        raise AssertionError(f'runtime v8 API-recipe precedence marker count={text.count(marker)}')
    recipe_first = text.index(marker)
    family_first = text.index('if (family === "stremio-json")', recipe_first)
    if recipe_first >= family_first:
        raise AssertionError('runtime v8 API recipe must execute before source-family traversal')
    authority_prefix = text[recipe_first:family_first]
    v16_marker = '/* NIAKVIO_PROVIDER_EXECUTION_AUTHORITY_V16 */'
    if v16_marker in authority_prefix:
        for needle in (
            'const recipePrimary = await _resolveApiRecipe(proofMeta, type, season, episode);',
            'NIAKVIO_PROVIDER_MODEL.apiRecipe.allowGenericFallback !== true',
        ):
            if needle not in authority_prefix:
                raise AssertionError(f'runtime V16 API-recipe authority missing: {needle}')
        if 'recipePrimary = await getStreams(' in authority_prefix:
            raise AssertionError('runtime V16 retained obsolete recursive getStreams recipe authority')
    else:
        for needle in (
            'const recipePrimary = await getStreams(tmdbId, type, season, episode);',
            'NIAKVIO_PROVIDER_MODEL.apiRecipe.allowGenericFallback !== true',
        ):
            if needle not in authority_prefix:
                raise AssertionError(f'runtime v8 API-recipe precedence missing: {needle}')

    v9 = '/* NIAKVIO_PROVIDER_BASE_SHARED_IDENTITY_POLICY_V9 */'
    if text.count(v9) != 1:
        raise AssertionError(f'runtime v9 shared identity marker count={text.count(v9)}')
    for needle in (
        'globalThis.__nuvioIdentityPolicyV1',
        'policy.catalogueScore({',
        'policy.htmlIdentityOk({',
        'if (!policy) return -1;',
        'if (!policy) return false;',
        'if (!_strictHtmlIdentityOk(html, meta, mediaType)) continue;',
    ):
        if needle not in text:
            raise AssertionError(f'runtime v9 shared identity policy missing: {needle}')
    for needle in (
        'if (year && expectedYear && year !== expectedYear) return -1;',
        'Math.abs(Number(year) - Number(expectedYear))',
        'const movieIdentity = expectedMedia === "movie";',
        'if (!_strictHtmlIdentityOk(html, meta)) continue;',
    ):
        if needle in text:
            raise AssertionError(f'runtime v9 retained local identity semantics: {needle}')


def main() -> int:
    changed = patch()
    validate()
    print(
        'PROVIDER_BASE_RUNTIME_CURRENT_OK '
        f'changed={str(changed).lower()} v5=1 v6=1 v7=1 v8=1 v9=1 '
        'external_ids=1 traversal_eligibility=1 nested_priority=1 '
        'source_plan_first=1 api_recipe_first=1 alias_origin=1 dle_runtime=1 safe_html_text=1 '
        'identity_policy=core_stream_identity_v1 episodic_year_checks=0 movie_year_identity=core-owned '
        'unknown_stream_quality_projection=removed'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
