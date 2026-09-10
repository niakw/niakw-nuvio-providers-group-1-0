// SPDX-License-Identifier: GPL-3.0-only
'use strict';

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeSupportedType(value) {
  const text = normalizedText(value).trim();
  if (/^(movie|movies|film|films|cinema)$/.test(text)) return 'movie';
  if (/^(tv|series|serie|show|shows|television)$/.test(text)) return 'tv';
  if (/^(anime|animes|manga|mangas)$/.test(text)) return 'anime';
  return null;
}

function descriptionTypeSignals(textValue) {
  const text = normalizedText(textValue);
  const movie = /\b(?:movie|movies|film|films|cinema|cinematic)\b/.test(text);
  const tv = /\b(?:tv|television|serie|series|show|shows)\b/.test(text);
  const anime = /\b(?:anime|animes|manga|mangas)\b/.test(text);
  return { movie, tv, anime };
}

/**
 * Canonical metadata may aggregate several variants of the same provider. A
 * live upstream variant may be enriched by another live upstream declaration,
 * but the last published local baseline must never be the sole reason to widen
 * current catalogue coverage. Otherwise stale local metadata can force a
 * current TV-only source, for example, to prove obsolete movie/anime routes.
 *
 * Older/synthetic fixtures that do not expose canonical source provenance keep
 * the historical aggregation behaviour for backwards compatibility.
 */
function canonicalMetadataCanExpand(candidate) {
  const canonicalMetadata = candidate?.canonical_metadata || {};
  const sources = Array.isArray(canonicalMetadata.sources)
    ? canonicalMetadata.sources.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (!sources.length) return true;

  const candidateSource = String(candidate?.source || '').trim();
  return sources.some((source) => (
    source !== 'published-baseline'
    && (!candidateSource || source !== candidateSource)
  ));
}

function semanticText(candidate) {
  const metadata = candidate?.metadata || {};
  const canonicalMetadata = candidate?.canonical_metadata || {};
  const canonicalDescriptions = canonicalMetadataCanExpand(candidate)
    ? (Array.isArray(canonicalMetadata.descriptions) ? canonicalMetadata.descriptions : [])
    : [];
  return [
    candidate?.canonical_id,
    metadata.id,
    metadata.name,
    metadata.description,
    ...canonicalDescriptions,
  ].filter(Boolean).join(' ');
}

/**
 * Return true when the provider's ``movie`` request shape represents anime
 * films rather than evidence of a general live-action movie catalogue.
 *
 * We deliberately require an anime/manga signal and no TV/series signal. If a
 * provider also describes generic movies, its identity (id/name) must itself
 * be anime/manga-specific before we narrow validation to anime-film fixtures.
 * This keeps mixed catalogues such as Movix on general movie/TV/anime tests.
 */
function isAnimeFocusedCatalogue(candidate) {
  const metadata = candidate?.metadata || {};
  const identity = [candidate?.canonical_id, metadata.id, metadata.name].filter(Boolean).join(' ');
  const identitySignals = descriptionTypeSignals(identity);
  const signals = descriptionTypeSignals(semanticText(candidate));
  return signals.anime && !signals.tv && (identitySignals.anime || !signals.movie);
}

/**
 * Infer the catalogue coverage of one manifest entry.
 *
 * Canonical semantics describe real catalogue capability; Nuvio transport
 * aliases never widen that capability. Anime-only stays anime-only, while a
 * provider explicitly declaring movie+anime preserves both canonical types.
 *
 * Canonical claims from other *live upstreams* may enrich an incomplete
 * variant. A published-baseline-only claim cannot expand a current upstream.
 */
function inferSupportedTypes(candidate) {
  const metadata = candidate?.metadata || {};
  const canonicalMetadata = candidate?.canonical_metadata || {};
  const canonicalMayExpand = canonicalMetadataCanExpand(candidate);
  const metadataHasCanonical = Array.isArray(metadata.canonicalSupportedTypes)
    && metadata.canonicalSupportedTypes.length > 0;
  const canonicalHasCanonical = Array.isArray(canonicalMetadata.canonicalSupportedTypes)
    && canonicalMetadata.canonicalSupportedTypes.length > 0;
  const metadataSemanticTypes = metadataHasCanonical
    ? metadata.canonicalSupportedTypes
    : (Array.isArray(metadata.supportedTypes) ? metadata.supportedTypes : []);
  const canonicalSemanticTypes = canonicalHasCanonical
    ? canonicalMetadata.canonicalSupportedTypes
    : (Array.isArray(canonicalMetadata.supportedTypes) ? canonicalMetadata.supportedTypes : []);
  const declaredValues = [
    ...metadataSemanticTypes,
    ...(canonicalMayExpand ? canonicalSemanticTypes : []),
  ];
  const declared = new Set(declaredValues.map(normalizeSupportedType).filter(Boolean));
  const explicitCanonicalValues = [
    ...(metadataHasCanonical ? metadata.canonicalSupportedTypes : []),
    ...(canonicalMayExpand && canonicalHasCanonical ? canonicalMetadata.canonicalSupportedTypes : []),
  ];
  const explicitCanonical = new Set(
    explicitCanonicalValues.map(normalizeSupportedType).filter(Boolean),
  );
  const signals = descriptionTypeSignals(semanticText(candidate));
  const inferred = new Set();
  if (signals.movie) inferred.add('movie');
  if (signals.tv) inferred.add('tv');
  if (signals.anime) inferred.add('anime');

  // Launch aliases never manufacture canonical catalogue capability.
  // Explicit canonical movie+anime remains movie+anime; anime-only stays anime-only.
  if (signals.anime && !signals.movie && !signals.tv) {
    const semantic = explicitCanonical.size
      ? new Set([...explicitCanonical, 'anime'])
      : new Set(['anime']);
    return ['movie', 'tv', 'anime'].filter((value) => semantic.has(value));
  }

  const combined = new Set([...declared, ...inferred]);
  if (!combined.size) {
    combined.add('movie');
    combined.add('tv');
  }
  return ['movie', 'tv', 'anime'].filter((value) => combined.has(value));
}

function roundRobin(groups) {
  const output = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (index < group.length) output.push(group[index]);
    }
  }
  return output;
}

module.exports = {
  canonicalMetadataCanExpand,
  descriptionTypeSignals,
  inferSupportedTypes,
  isAnimeFocusedCatalogue,
  normalizeSupportedType,
  normalizedText,
  roundRobin,
};
