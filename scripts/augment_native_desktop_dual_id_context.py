#!/usr/bin/env python3
"""Inject a Lab-only native->QuickJS media identity bridge into NuvioDesktop.

The IMDb ID is resolved outside QuickJS by the Lab and passed through
NIAKVIO_LAB_IMDB_ID. No TMDB credential is exposed to provider JavaScript and
provider bytes remain untouched.

V3 deliberately injects *after* the provider/Core bundle has been evaluated.
NiakVIO Core initializes __nuvioTmdbMetadataCacheV1 during bundle evaluation and
rewrites __nuvioMediaContext during request resolution, so a pre-bundle global
is not a durable host identity bridge. The canonical shared cache entry is:

  __nuvioTmdbMetadataCacheV1["<movie|tv>:<tmdbId>"] = {
    state: "ok",
    metadata: { external_ids: { imdb_id: "tt..." } }
  }

That shape is already consumed by the Core/provider identity helpers.
"""
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "NIAKVIO_LAB_DUAL_ID_CONTEXT_V3"
ANCHOR = '''                evaluate<Any?>(wrappedCode)\n\n                val tmdbIdArg = JsonPrimitive(tmdbId).toString()'''
INJECTION = '''                evaluate<Any?>(wrappedCode)\n\n                // NIAKVIO_LAB_DUAL_ID_CONTEXT_V3: populate Core's canonical cache after Core init.\n                val labImdbId = System.getenv("NIAKVIO_LAB_IMDB_ID")?.trim().orEmpty()\n                if (labImdbId.isNotEmpty()) {\n                    val labNamespace = if (mediaType == "movie") "movie" else "tv"\n                    val cacheKeyJson = JsonPrimitive("$labNamespace:$tmdbId").toString()\n                    val cacheEntryJson = JsonObject(\n                        mapOf(\n                            "state" to JsonPrimitive("ok"),\n                            "metadata" to JsonObject(\n                                mapOf(\n                                    "id" to JsonPrimitive(tmdbId),\n                                    "external_ids" to JsonObject(\n                                        mapOf("imdb_id" to JsonPrimitive(labImdbId))\n                                    ),\n                                    "imdb_id" to JsonPrimitive(labImdbId),\n                                    "imdbId" to JsonPrimitive(labImdbId),\n                                )\n                            ),\n                        )\n                    ).toString()\n                    evaluate<Any?>(\n                        """\n                        (function() {\n                            var cache = globalThis.__nuvioTmdbMetadataCacheV1;\n                            if (!cache || typeof cache !== "object") {\n                                cache = Object.create(null);\n                                globalThis.__nuvioTmdbMetadataCacheV1 = cache;\n                            }\n                            cache[$cacheKeyJson] = $cacheEntryJson;\n                        })();\n                        """.trimIndent()\n                    )\n                }\n\n                val tmdbIdArg = JsonPrimitive(tmdbId).toString()'''


def augment(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"FIELD_NATIVE_DESKTOP_DUAL_ID_CONTEXT already=true version=3 source={path}")
        return False
    count = text.count(ANCHOR)
    if count != 1:
        raise SystemExit(f"dual-id runtime anchor count={count}")
    text = text.replace(ANCHOR, INJECTION, 1)
    path.write_text(text, encoding="utf-8")
    print(
        f"FIELD_NATIVE_DESKTOP_DUAL_ID_CONTEXT added=true version=3 source={path} "
        "provider_bytes_mutated=false secret_exposed=false canonical_tmdb_cache=true post_core_init=true"
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    augment(Path(args.source).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
