#!/usr/bin/env node
const assert = require('node:assert/strict');
const {
  inferSupportedTypes,
  isAnimeFocusedCatalogue,
} = require('../scripts/provider_semantics.cjs');

const hianime = {
  canonical_id: 'hianime',
  metadata: {
    id: 'HIANIME',
    name: 'HiAnime',
    description: 'Anime catalogue',
    supportedTypes: ['anime', 'tv', 'series'],
    canonicalSupportedTypes: ['anime'],
  },
};
assert.deepEqual(inferSupportedTypes(hianime), ['anime']);
assert.equal(isAnimeFocusedCatalogue(hianime), true);

const animeSama = {
  canonical_id: 'anime-sama',
  metadata: {
    id: 'anime-sama',
    name: 'Anime-Sama',
    description: 'Anime catalogue',
    supportedTypes: ['movie', 'anime', 'tv', 'series'],
    canonicalSupportedTypes: ['movie', 'anime'],
  },
};
assert.deepEqual(inferSupportedTypes(animeSama), ['movie', 'anime']);
assert.equal(isAnimeFocusedCatalogue(animeSama), true);

const castle = {
  canonical_id: 'castle',
  metadata: {
    id: 'CASTLE',
    name: 'Castle',
    supportedTypes: ['movie', 'tv'],
  },
};
assert.deepEqual(inferSupportedTypes(castle), ['movie', 'tv']);

const mixed = {
  canonical_id: 'mixed',
  metadata: {
    id: 'mixed',
    name: 'Mixed',
    description: 'Movies, TV series and anime',
    supportedTypes: ['movie', 'tv', 'anime'],
    canonicalSupportedTypes: ['movie', 'tv', 'anime'],
  },
};
assert.deepEqual(inferSupportedTypes(mixed), ['movie', 'tv', 'anime']);

console.log('provider semantic/transport fixture inference tests passed');
