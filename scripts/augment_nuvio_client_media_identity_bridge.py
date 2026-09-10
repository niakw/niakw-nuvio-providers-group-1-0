#!/usr/bin/env python3
"""Preserve host media identity across Nuvio Desktop/Mobile plugin execution.

This patch keeps the public provider ABI unchanged:
    getStreams(tmdbId, mediaType, season, episode)

Internally it preserves an IMDb source id before PluginRepository normalizes the
request to TMDB and passes the optional IMDb identity to PluginRuntime. After the
provider/Core bundle initializes its globals, PluginRuntime populates NiakVIO's
canonical __nuvioTmdbMetadataCacheV1 entry before invoking getStreams.

No TMDB credential is added or exposed. If an app already has a TMDB key,
TmdbService.tmdbToImdb may opportunistically fill a missing IMDb id; absence of
that key remains valid and is not a compatibility failure.
"""
from __future__ import annotations

import argparse
from pathlib import Path

REPOSITORY_MARKER = "NIAKVIO_CANONICAL_MEDIA_IDENTITY_REPOSITORY_V1"
RUNTIME_MARKER = "NIAKVIO_CANONICAL_MEDIA_IDENTITY_RUNTIME_V1"

REPOSITORY_ANCHOR = '''        val resolvedTmdbId = resolvePluginTmdbId(\n            tmdbId = tmdbId,\n            mediaType = mediaType,\n        )\n\n        return runCatching {\n            PluginRuntime.executePlugin(\n                code = scraper.code,\n                tmdbId = resolvedTmdbId,\n                mediaType = normalizePluginType(mediaType),'''
REPOSITORY_REPLACEMENT = '''        // NIAKVIO_CANONICAL_MEDIA_IDENTITY_REPOSITORY_V1\n        // Preserve identity before TMDB normalization; provider ABI stays positional.\n        val sourceContentId = tmdbId.trim()\n        val sourceImdbId = sourceContentId\n            .removePrefix("imdb:")\n            .substringBefore(':')\n            .substringBefore('/')\n            .takeIf { it.matches(Regex("^tt\\\\d+$", RegexOption.IGNORE_CASE)) }\n\n        val resolvedTmdbId = resolvePluginTmdbId(\n            tmdbId = tmdbId,\n            mediaType = mediaType,\n        )\n        val resolvedImdbId = sourceImdbId ?: resolvedTmdbId.toIntOrNull()?.let { numericTmdbId ->\n            TmdbService.tmdbToImdb(numericTmdbId, mediaType)\n        }\n\n        return runCatching {\n            PluginRuntime.executePlugin(\n                code = scraper.code,\n                tmdbId = resolvedTmdbId,\n                imdbId = resolvedImdbId,\n                mediaType = normalizePluginType(mediaType),'''

PUBLIC_SIGNATURE_ANCHOR = '''    suspend fun executePlugin(\n        code: String,\n        tmdbId: String,\n        mediaType: String,'''
PUBLIC_SIGNATURE_REPLACEMENT = '''    suspend fun executePlugin(\n        code: String,\n        tmdbId: String,\n        imdbId: String? = null,\n        mediaType: String,'''

INTERNAL_CALL_ANCHOR = '''            executePluginInternal(\n                code = code,\n                tmdbId = tmdbId,\n                mediaType = mediaType,'''
INTERNAL_CALL_REPLACEMENT = '''            executePluginInternal(\n                code = code,\n                tmdbId = tmdbId,\n                imdbId = imdbId,\n                mediaType = mediaType,'''

INTERNAL_SIGNATURE_ANCHOR = '''    private suspend fun executePluginInternal(\n        code: String,\n        tmdbId: String,\n        mediaType: String,'''
INTERNAL_SIGNATURE_REPLACEMENT = '''    private suspend fun executePluginInternal(\n        code: String,\n        tmdbId: String,\n        imdbId: String?,\n        mediaType: String,'''

POST_CORE_ANCHOR = '''                evaluate<Any?>(wrappedCode)\n\n                val tmdbIdArg = JsonPrimitive(tmdbId).toString()'''
POST_CORE_REPLACEMENT = '''                evaluate<Any?>(wrappedCode)\n\n                // NIAKVIO_CANONICAL_MEDIA_IDENTITY_RUNTIME_V1\n                // Core initializes this cache while evaluating wrappedCode; populate it afterwards.\n                val canonicalImdbId = imdbId\n                    ?.trim()\n                    ?.takeIf { it.matches(Regex("^tt\\\\d+$", RegexOption.IGNORE_CASE)) }\n                if (canonicalImdbId != null) {\n                    val canonicalNamespace = if (mediaType == "movie") "movie" else "tv"\n                    val cacheKeyJson = JsonPrimitive("$canonicalNamespace:$tmdbId").toString()\n                    val cacheEntryJson = JsonObject(\n                        mapOf(\n                            "state" to JsonPrimitive("ok"),\n                            "metadata" to JsonObject(\n                                mapOf(\n                                    "id" to JsonPrimitive(tmdbId),\n                                    "external_ids" to JsonObject(\n                                        mapOf("imdb_id" to JsonPrimitive(canonicalImdbId))\n                                    ),\n                                    "imdb_id" to JsonPrimitive(canonicalImdbId),\n                                    "imdbId" to JsonPrimitive(canonicalImdbId),\n                                )\n                            ),\n                        )\n                    ).toString()\n                    evaluate<Any?>(\n                        """\n                        (function() {\n                            var cache = globalThis.__nuvioTmdbMetadataCacheV1;\n                            if (!cache || typeof cache !== "object") {\n                                cache = Object.create(null);\n                                globalThis.__nuvioTmdbMetadataCacheV1 = cache;\n                            }\n                            cache[$cacheKeyJson] = $cacheEntryJson;\n                        })();\n                        """.trimIndent()\n                    )\n                }\n\n                val tmdbIdArg = JsonPrimitive(tmdbId).toString()'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} anchor count={count}")
    return text.replace(old, new, 1)


def patch_repository(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if REPOSITORY_MARKER in text:
        return False
    text = replace_once(text, REPOSITORY_ANCHOR, REPOSITORY_REPLACEMENT, "repository identity")
    path.write_text(text, encoding="utf-8")
    return True


def patch_runtime(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if RUNTIME_MARKER in text:
        return False
    text = replace_once(text, PUBLIC_SIGNATURE_ANCHOR, PUBLIC_SIGNATURE_REPLACEMENT, "runtime public internal API")
    text = replace_once(text, INTERNAL_CALL_ANCHOR, INTERNAL_CALL_REPLACEMENT, "runtime internal call")
    text = replace_once(text, INTERNAL_SIGNATURE_ANCHOR, INTERNAL_SIGNATURE_REPLACEMENT, "runtime internal signature")
    text = replace_once(text, POST_CORE_ANCHOR, POST_CORE_REPLACEMENT, "runtime post-Core cache")
    path.write_text(text, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-source", required=True)
    parser.add_argument("--runtime-source", required=True)
    args = parser.parse_args()
    repository = Path(args.repository_source).resolve()
    runtime = Path(args.runtime_source).resolve()
    repo_changed = patch_repository(repository)
    runtime_changed = patch_runtime(runtime)
    print(
        "FIELD_NUVIO_CLIENT_MEDIA_IDENTITY_BRIDGE "
        f"repository_changed={str(repo_changed).lower()} runtime_changed={str(runtime_changed).lower()} "
        "provider_abi_changed=false canonical_cache=__nuvioTmdbMetadataCacheV1 "
        "user_tmdb_credential_required=false secret_exposed=false"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
