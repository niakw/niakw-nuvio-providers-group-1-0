#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

const assert = require('node:assert/strict');
const {
  canonicalMetadataCanExpand,
  inferSupportedTypes,
  isAnimeFocusedCatalogue,
  roundRobin,
} = require('./provider_semantics.cjs');

const movix = {
  canonical_id: 'movix',
  metadata: {
    id: 'movix',
    name: 'Movix',
    description: 'Films, Séries et Animes en VF et VOSTFR.',
    supportedTypes: ['anime'],
  },
};
assert.deepEqual(
  inferSupportedTypes(movix),
  ['movie', 'tv', 'anime'],
  'Movix must remain available for films, series and anime',
);
assert.equal(
  isAnimeFocusedCatalogue(movix),
  false,
  'mixed movie/TV/anime catalogues must keep general movie fixtures',
);

const incompleteMovixVariant = {
  canonical_id: 'movix',
  source: 'gowaru',
  metadata: {
    id: 'movix',
    description: 'Animes en VF et VOSTFR',
    supportedTypes: ['anime'],
  },
  canonical_metadata: {
    descriptions: ['Films, Séries et Animes en VF et VOSTFR.'],
    supportedTypes: ['anime', 'movie', 'tv'],
    sources: ['gowaru', 'yoru'],
  },
};
assert.equal(canonicalMetadataCanExpand(incompleteMovixVariant), true);
assert.deepEqual(
  inferSupportedTypes(incompleteMovixVariant),
  ['movie', 'tv', 'anime'],
  'canonical descriptions from another live upstream must restore Movix movie/TV coverage',
);
assert.equal(
  isAnimeFocusedCatalogue(incompleteMovixVariant),
  false,
  'canonical mixed-catalogue evidence must prevent anime-only validation narrowing',
);

const stalePublishedBaselineExpansion = {
  canonical_id: 'papadustream',
  source: 'gowaru',
  metadata: {
    id: 'papadustream',
    name: 'Papadustream',
    description: 'Séries TV en streaming HLS.',
    supportedTypes: ['tv'],
  },
  canonical_metadata: {
    descriptions: [
      'Séries TV en streaming HLS.',
      'Films et séries TV en streaming HLS via an older published bundle.',
    ],
    supportedTypes: ['tv', 'movie', 'anime'],
    sources: ['gowaru', 'published-baseline'],
  },
};
assert.equal(canonicalMetadataCanExpand(stalePublishedBaselineExpansion), false);
assert.deepEqual(
  inferSupportedTypes(stalePublishedBaselineExpansion),
  ['tv'],
  'a published baseline must not widen a current upstream beyond its live catalogue declaration',
);

const animeOnly = {
  canonical_id: 'anime-only',
  metadata: {
    description: 'Animes et mangas en streaming',
    supportedTypes: ['movie', 'tv'],
  },
};
assert.deepEqual(
  inferSupportedTypes(animeOnly),
  ['anime'],
  'anime-only transport aliases must not manufacture semantic movie capability',
);
assert.equal(
  isAnimeFocusedCatalogue(animeOnly),
  true,
  'anime-only catalogues remain identifiable without creating a generic movie lane',
);

const genericMoviesAndAnime = {
  canonical_id: 'mixed-cinema',
  metadata: {
    name: 'Mixed Cinema',
    description: 'Movies and Anime',
    supportedTypes: ['movie', 'anime'],
  },
};
assert.equal(
  isAnimeFocusedCatalogue(genericMoviesAndAnime),
  false,
  'generic movie + anime catalogues must not be narrowed without anime identity evidence',
);

const pool = roundRobin([
  [{ category: 'movie', id: 1 }],
  [{ category: 'tv', id: 2 }],
  [{ category: 'anime', id: 3 }],
]);
assert.deepEqual(
  pool.map((item) => item.category),
  ['movie', 'tv', 'anime'],
  'multi-catalogue representative tests must begin with a movie, then TV, then anime',
);

console.log('Provider semantics self-test passed: live upstream coverage is preserved without stale baseline widening.');
