#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "augment_nuvio_client_media_identity_bridge.py"
spec = importlib.util.spec_from_file_location("media_identity_bridge", MODULE_PATH)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

repository_source = '''object PluginRepository {
    suspend fun executeScraper(
        scraper: PluginScraper,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
    ): Result<List<PluginRuntimeResult>> {
        val resolvedTmdbId = resolvePluginTmdbId(
            tmdbId = tmdbId,
            mediaType = mediaType,
        )

        return runCatching {
            PluginRuntime.executePlugin(
                code = scraper.code,
                tmdbId = resolvedTmdbId,
                mediaType = normalizePluginType(mediaType),
                season = season,
                episode = episode,
                scraperId = scraper.id,
            )
        }
    }
}
'''

runtime_source = '''internal object PluginRuntime {
    suspend fun executePlugin(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
    ): List<PluginRuntimeResult> = withContext(Dispatchers.Default) {
        withTimeout(PLUGIN_TIMEOUT_MS) {
            executePluginInternal(
                code = code,
                tmdbId = tmdbId,
                mediaType = mediaType,
                season = season,
                episode = episode,
                scraperId = scraperId,
                scraperSettings = scraperSettingsMap,
            )
        }
    }

    private suspend fun executePluginInternal(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
        scraperSettings: Map<String, JsonElement>,
    ): List<PluginRuntimeResult> {
                evaluate<Any?>(wrappedCode)

                val tmdbIdArg = JsonPrimitive(tmdbId).toString()
                val mediaTypeArg = JsonPrimitive(mediaType).toString()
                val callCode = """
                    var result = await getStreams($tmdbIdArg, $mediaTypeArg, $seasonArg, $episodeArg);
                """.trimIndent()
    }
}
'''

with tempfile.TemporaryDirectory() as td:
    repo_path = Path(td) / "PluginRepository.kt"
    runtime_path = Path(td) / "PluginRuntime.kt"
    repo_path.write_text(repository_source, encoding="utf-8")
    runtime_path.write_text(runtime_source, encoding="utf-8")

    assert mod.patch_repository(repo_path) is True
    assert mod.patch_runtime(runtime_path) is True

    repo = repo_path.read_text(encoding="utf-8")
    runtime = runtime_path.read_text(encoding="utf-8")

    assert mod.REPOSITORY_MARKER in repo
    assert mod.RUNTIME_MARKER in runtime
    assert 'val sourceContentId = tmdbId.trim()' in repo
    assert '.removePrefix("imdb:")' in repo
    assert 'TmdbService.tmdbToImdb(numericTmdbId, mediaType)' in repo
    assert 'imdbId = resolvedImdbId' in repo

    assert 'imdbId: String? = null' in runtime
    assert 'imdbId = imdbId' in runtime
    assert 'imdbId: String?,' in runtime
    assert 'globalThis.__nuvioTmdbMetadataCacheV1' in runtime
    assert '"external_ids" to JsonObject(' in runtime
    assert 'mapOf("imdb_id" to JsonPrimitive(canonicalImdbId))' in runtime
    assert runtime.index('evaluate<Any?>(wrappedCode)') < runtime.index(mod.RUNTIME_MARKER)
    assert runtime.index(mod.RUNTIME_MARKER) < runtime.index('val tmdbIdArg = JsonPrimitive(tmdbId).toString()')

    # The public JavaScript/provider ABI is intentionally untouched: only the
    # host-internal Kotlin call gains optional identity metadata.
    assert 'getStreams($tmdbIdArg, $mediaTypeArg, $seasonArg, $episodeArg)' in runtime
    assert 'TMDB_API_KEY' not in repo + runtime
    assert 'TMDB_ACCESS_TOKEN' not in repo + runtime

    repo_before = repo
    runtime_before = runtime
    assert mod.patch_repository(repo_path) is False
    assert mod.patch_runtime(runtime_path) is False
    assert repo_path.read_text(encoding="utf-8") == repo_before
    assert runtime_path.read_text(encoding="utf-8") == runtime_before

print(
    "Nuvio Desktop/Mobile media identity bridge contract passed: "
    "provider_abi_changed=false canonical_cache=true source_imdb_preserved=true idempotent=true"
)
