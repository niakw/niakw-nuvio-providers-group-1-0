#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  WINDOWS_UA,
  MACOS_UA,
  buildWorkerContext,
  classify,
  executionGroups,
  mapLimit,
  maxStreamsForProbe,
  parseWorkerOutput,
  resolveProvider,
  selectStreamsForProbe,
  summarizeStream,
  summarizePolicy,
  streamIdentity,
  tailText,
  verifyRuntimeContract,
} = require('../scripts/nuvio_client_lab.cjs');
const { explicitYears, releaseIdentityGuard } = require('../scripts/native_fixture_identity_guard.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const labTrigger = JSON.parse(fs.readFileSync(path.join(repositoryRoot, '.github/triggers/nuvio-client-lab.json'), 'utf8'));
const npmTestLifecycle = `${packageJson.scripts.pretest || ''} ${packageJson.scripts.test || ''}`;
assert.match(npmTestLifecycle, /node tests\/nuvio_client_lab\.test\.cjs/);
assert.match(packageJson.scripts.posttest || '', /python3 scripts\/validate_release_integrity\.py/);
assert.equal(fs.existsSync(path.join(repositoryRoot, '.github/workflows/nuvio-client-lab.yml')), false, 'mutable-client transport workflow is retired; official native readers own CI evidence');
assert.equal(labTrigger.policy.blocking, false);
assert.equal(labTrigger.policy.require_identity_match, true);
assert.equal(labTrigger.policy.block_identity_contradictions, true);
assert.equal(labTrigger.fixtures.length, 12);
assert.equal(labTrigger.fixtures.every((row) => Number(row.fixture.expectedDurationMinutes) > 0), true);
assert.deepEqual(labTrigger.native_reader_acceptance.tv_priority_regressions, []);
assert.equal(labTrigger.native_reader_acceptance.provider_scope, 'declared-type');
assert.equal(labTrigger.native_reader_acceptance.one_fixture_per_type_per_provider, true);
assert.deepEqual(labTrigger.native_reader_acceptance.fixture_by_type, {
  movie: 'interstellar',
  tv: 'breaking-bad-s01e01',
  anime: 'jujutsu-kaisen-s01e01',
});
const fixturesBySlug = new Map(labTrigger.fixtures.map((row) => [row.slug, row.fixture]));
assert.equal(fixturesBySlug.get('colony-2021').tmdbId, '760873');
assert.equal(fixturesBySlug.get('colony-2021').year, 2021);
assert.deepEqual(fixturesBySlug.get('colony-2021').ambiguousReleaseYears, [2013, 2021]);
assert.equal(fixturesBySlug.get('failure-frame-s01e01').tmdbId, '245285');
assert.equal(fixturesBySlug.get('failure-frame-s01e01').category, 'anime');
assert.equal(fixturesBySlug.get('failure-frame-s01e01').episode, 1);
assert.equal(fixturesBySlug.get('hell-teacher-nube-2025-s01e01').tmdbId, '259544');
assert.equal(fixturesBySlug.get('hell-teacher-nube-2025-s01e01').year, 2025);
assert.deepEqual(fixturesBySlug.get('hell-teacher-nube-2025-s01e01').ambiguousReleaseYears, [1996, 2025]);
assert.equal(fixturesBySlug.get('hell-mode-s01e01').tmdbId, '280049');
assert.equal(fixturesBySlug.get('hell-mode-s01e01').mediaType, 'anime');
assert.equal(fixturesBySlug.get('hell-mode-s01e01').season, 1);
assert.equal(fixturesBySlug.get('hell-mode-s01e01').episode, 1);

const manifest = {
  scrapers: [
    { id: 'FLEMMIX', name: 'Flemmix', filename: 'providers/flemmix.js' },
    { id: 'MOVIX', name: 'Movix', filename: 'providers/movix.js' },
  ],
};
assert.equal(resolveProvider(manifest, 'flemmix').filename, 'providers/flemmix.js');
assert.equal(resolveProvider(manifest, 'Movix').id, 'MOVIX');
assert.throws(() => resolveProvider(manifest, 'missing'), /provider not found/);

assert.deepEqual(executionGroups(['tv', 'desktop', 'mobile']), [
  { runtimeGroup: 'tv', clients: ['tv'] },
  { runtimeGroup: 'compose', clients: ['desktop', 'mobile'] },
]);

const context = buildWorkerContext('tv', { tmdbId: '157336', mediaType: 'movie' }, {});
assert.equal(context.userAgent, WINDOWS_UA);
assert.equal(context.injectAcceptLanguage, false);
assert.equal(context.clientRuntimeLab.invocationContract, 'positional-compatible');
const desktopContext = buildWorkerContext('compose', { tmdbId: '1215638', mediaType: 'movie' }, {});
assert.equal(desktopContext.platform, 'macos');
assert.equal(desktopContext.userAgent, MACOS_UA);

const parsed = parseWorkerOutput('noise\nNUVIO_HEALTH_RESULT={"ok":true,"stream_count":1,"streams":[]}\n');
assert.equal(parsed.ok, true);
assert.equal(parsed.stream_count, 1);
assert.equal(tailText('abcdefgh', 'ijkl', 6), 'ghijkl');

const summary = summarizeStream({
  url: 'https://cdn.example/video.m3u8?token=secret',
  title: '1080p',
  headers: { Referer: 'https://example.test/', Authorization: 'secret' },
  subtitles: [{ url: 'https://sub.example/a.vtt' }],
}, 0);
assert.equal(summary.host, 'cdn.example');
assert.equal(summary.stream_id.length, 16);
assert.deepEqual(summary.header_names, ['Authorization', 'Referer']);
assert.equal(JSON.stringify(summary).includes('token=secret'), false);
assert.equal(JSON.stringify(summary).includes('Authorization":"secret'), false);

assert.equal(classify({ ok: false, stream_count: 0 }, []), 'runtime_error');
assert.equal(classify({ ok: false, timed_out: true, stream_count: 0 }, []), 'runtime_timeout');
assert.equal(classify({ ok: true, stream_count: 0 }, []), 'runtime_empty');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: true }]), 'identity_unverified');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: true, identity: { status: 'match' } }]), 'playable');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: true, identity: { status: 'contradiction' } }]), 'wrong_content');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: false, transport_playable: true, identity: { status: 'contradiction', reason: 'fixture_duration_mismatch' } }]), 'wrong_content');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: false, inconclusive: true }]), 'playback_inconclusive');
assert.equal(classify({ ok: true, stream_count: 1 }, [{ playable: false, inconclusive: false }]), 'media_unplayable');

assert.equal(maxStreamsForProbe({}), 3);
assert.equal(maxStreamsForProbe({ max_streams_per_runtime: 1 }), 1);
assert.equal(maxStreamsForProbe({ probe_all_streams: true, all_streams_safety_cap: 40 }), 40);
assert.equal(maxStreamsForProbe({ probe_all_streams: true, all_streams_safety_cap: 500 }), 200);
const allTargetStreams = Array.from({ length: 8 }, (_, index) => ({ url: `https://cdn.example/${index}.m3u8` }));
assert.equal(selectStreamsForProbe(allTargetStreams, maxStreamsForProbe({ probe_all_streams: true, all_streams_safety_cap: 40 })).length, 8);

const policyProviders = [
  { id: 'vf-good', manifest_enabled: true, is_vf: true, clients: { tv: { verdict: 'playable', identity_status: 'verified' }, desktop: { verdict: 'playable', identity_status: 'verified' } } },
  { id: 'non-vf-good', manifest_enabled: true, is_vf: false, clients: { tv: { verdict: 'playable', identity_status: 'verified' }, desktop: { verdict: 'playable', identity_status: 'verified' } } },
  { id: 'partial', manifest_enabled: true, is_vf: true, clients: { tv: { verdict: 'playable' }, desktop: { verdict: 'runtime_empty' } } },
  { id: 'disabled', manifest_enabled: false, is_vf: true, clients: { tv: { verdict: 'playable' }, desktop: { verdict: 'playable' } } },
];
const policy = summarizePolicy(policyProviders, ['tv', 'desktop'], { policy: { target_total: 3, minimum_vf: 1 } });
assert.equal(policy.verified_total, 2);
assert.equal(policy.verified_vf, 1);
assert.equal(policy.status, 'vf_met_total_shortfall');
assert.equal(policy.blocking_pass, true);
assert.equal(policy.safety_blocking_pass, true);
assert.deepEqual(policy.qualified_provider_ids, ['vf-good', 'non-vf-good']);
const strictIdentityPolicy = summarizePolicy([
  { id: 'verified', manifest_enabled: true, is_vf: true, clients: { tv: { verdict: 'playable', identity_status: 'verified' } } },
  { id: 'unknown', manifest_enabled: true, is_vf: true, clients: { tv: { verdict: 'playable', identity_status: 'unknown' } } },
], ['tv'], { policy: { target_total: 1, minimum_vf: 1, require_identity_match: true } });
assert.deepEqual(strictIdentityPolicy.qualified_provider_ids, ['verified']);
assert.equal(strictIdentityPolicy.status, 'target_met');
const recentWorkPolicy = summarizePolicy([], ['tv'], { policy: { target_total: 10, minimum_vf: 3 } });
assert.equal(recentWorkPolicy.objective_met, false);
assert.equal(recentWorkPolicy.advisory_only, true);
assert.equal(recentWorkPolicy.blocking_pass, true);

assert.deepEqual(streamIdentity({ title: 'Interstellar - 2014 - 1080p' }, { title: 'Interstellar', mediaType: 'movie' }), { status: 'match', reason: 'expected_title_alias' });
assert.deepEqual(streamIdentity({ title: 'Enola Holmes 2 - 1080p' }, { title: 'Mon ninja et moi 3', aliases: ['Checkered Ninja 3'], mediaType: 'movie' }), { status: 'contradiction', reason: 'strong_title_mismatch' });
assert.deepEqual(streamIdentity({ name: 'TopCartoons', url: 'https://ww.topcartoons.tv/video/Ben-10-Ultimate-Alien-Fame.mp4' }, { title: 'Breaking Bad', mediaType: 'tv', season: 1, episode: 1 }), { status: 'contradiction', reason: 'media_filename_title_mismatch' });
assert.deepEqual(streamIdentity({ name: 'Purstream 1080p Dual Audio - Inconnue', url: 'https://cdn.example/hls2/03/00026/master.m3u8' }, { title: 'Revenant', mediaType: 'tv', season: 1, episode: 1 }), { status: 'unknown', reason: 'insufficient_identity_metadata' });
assert.deepEqual(streamIdentity({ title: 'Purstream 1080p Dual Audio - Inconnue', description: 'Revenant S01E01', url: 'https://cdn.example/hls2/03/00026/master.m3u8' }, { title: 'Revenant', mediaType: 'tv', season: 1, episode: 1 }), { status: 'match', reason: 'season_episode_match' });
assert.deepEqual(streamIdentity({ title: 'Ben 10 Ultimate Alien', description: 'Breaking Bad S01E01', url: 'https://cdn.example/generic/master.m3u8' }, { title: 'Breaking Bad', mediaType: 'tv', season: 1, episode: 1 }), { status: 'contradiction', reason: 'strong_title_mismatch' });
assert.deepEqual(streamIdentity({ name: 'MovieBlast', title: 'MovieBlast - 720P (Telugu)', url: 'https://cdn.example/fp44sc004rev' }, { title: 'Interstellar', mediaType: 'movie' }), { status: 'unknown', reason: 'insufficient_identity_metadata' });
assert.deepEqual(streamIdentity({ title: 'S02E04 1080p' }, { title: 'Revenant', mediaType: 'tv', season: 1, episode: 1 }), { status: 'contradiction', reason: 'wrong_season_episode' });
assert.deepEqual(streamIdentity({ title: 'Player - Ep 1 - VF [1080p]', name: 'Anime-Sama (VF)' }, { title: 'Jujutsu Kaisen', mediaType: 'tv', season: 1, episode: 1 }), { status: 'match', reason: 'episode_match' });
assert.deepEqual(streamIdentity({ title: 'S1E1 - Ryomen Sukuna', name: 'ToFlix' }, { title: 'Jujutsu Kaisen', mediaType: 'tv', season: 1, episode: 1 }), { status: 'match', reason: 'season_episode_match' });
assert.deepEqual(streamIdentity({ title: 'Saison 1 - Vidmoly', name: 'Mugiwara (VOSTFR)' }, { title: 'Mushoku Tensei', mediaType: 'tv', season: 1, episode: 1 }), { status: 'unknown', reason: 'insufficient_identity_metadata' });
assert.deepEqual(streamIdentity({ title: 'Enola Holmes 2 - 1080p' }, { title: 'Mon ninja et moi 3', forbiddenAliases: ['Enola Holmes 2'], mediaType: 'movie' }), { status: 'contradiction', reason: 'forbidden_title_alias' });

// Release/remake collision guard: resolution labels are not years; explicit wrong
// release years are contradictions; same-title rows without a discriminator stay
// unproven so duration alone cannot bless the wrong work.
assert.deepEqual(explicitYears('The Colony 2013 1080p x265'), [2013]);
assert.deepEqual(explicitYears('2160p 1080p HEVC'), []);
const colonyFixture = fixturesBySlug.get('colony-2021');
assert.equal(releaseIdentityGuard({ title: 'The Colony 2013 1080p' }, colonyFixture).reason, 'wrong_release_year');
assert.equal(releaseIdentityGuard({ title: 'The Colony 2021 1080p' }, colonyFixture), null);
assert.equal(releaseIdentityGuard({ title: 'Tides 1080p' }, colonyFixture), null);
const colonyAmbiguous = releaseIdentityGuard({ title: 'The Colony 1080p' }, colonyFixture);
assert.equal(colonyAmbiguous.status, 'unknown');
assert.equal(colonyAmbiguous.reason, 'ambiguous_same_title_release');
assert.equal(colonyAmbiguous.preventDurationPromotion, true);
const nubeFixture = fixturesBySlug.get('hell-teacher-nube-2025-s01e01');
assert.equal(releaseIdentityGuard({ title: 'Hell Teacher Nube 1996 S01E01' }, nubeFixture).reason, 'wrong_release_year');
assert.equal(releaseIdentityGuard({ title: 'Hell Teacher Nube 2025 S01E01' }, nubeFixture), null);
const nubeAmbiguous = releaseIdentityGuard({ title: 'Hell Teacher Nube S01E01 1080p' }, nubeFixture);
assert.equal(nubeAmbiguous.status, 'unknown');
assert.equal(nubeAmbiguous.preventDurationPromotion, true);
assert.equal(releaseIdentityGuard({ title: 'Failure Frame S01E01' }, fixturesBySlug.get('failure-frame-s01e01')), null);

const unsafePolicy = summarizePolicy([
  { id: 'disabled-but-cacheable', manifest_enabled: false, is_vf: false, clients: { tv: { verdict: 'wrong_content', identity_status: 'contradiction', identity_contradiction_count: 1 } } },
], ['tv'], { policy: { target_total: 10, minimum_vf: 3, blocking: false } });
assert.equal(unsafePolicy.coverage_blocking_pass, true);
assert.equal(unsafePolicy.safety_blocking_pass, false);
assert.equal(unsafePolicy.blocking_pass, false);
assert.deepEqual(unsafePolicy.identity_contradiction_provider_ids, ['disabled-but-cacheable']);

(async () => {
  let running = 0;
  let maximum = 0;
  const mapped = await mapLimit([1, 2, 3, 4], 2, async (value) => {
    running += 1;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return value * 2;
  });
  assert.deepEqual(mapped, [2, 4, 6, 8]);
  assert.equal(maximum, 2);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvio-lab-test-'));
try {
  const runtimePath = path.join(tmp, 'tv', 'app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt');
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, `
    private const val PLUGIN_TIMEOUT_MS = 60_000L
    val ua = "${WINDOWS_UA}"
    function("__native_fetch") { }
    var result = await getStreams(args.tmdbId, args.mediaType, args.season, args.episode)
  `);
  const contract = verifyRuntimeContract('tv', tmp);
  assert.equal(contract.ok, true, JSON.stringify(contract));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('nuvio client transport unit tests passed');
