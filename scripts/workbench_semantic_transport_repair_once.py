#!/usr/bin/env python3
"""One-shot workbench migration restoring the final semantic/transport contract.

This script exists only to repair the systemic-recovery branch before merge.
It must be removed by the final repository cleanup.
"""
from __future__ import annotations

import json
import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = {"movie", "tv", "anime"}
TRANSPORT = CANONICAL | {"series"}


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def regex_once(rel: str, pattern: str, replacement: str) -> None:
    text = read(rel)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{rel}: expected one regex replacement, got {count}: {pattern!r}")
    write(rel, updated)


def canonical_types(values: object) -> list[str]:
    out: list[str] = []
    for value in values if isinstance(values, list) else []:
        item = str(value or "").strip().casefold()
        if item in CANONICAL and item not in out:
            out.append(item)
    return out


def transport_types(canonical: list[str]) -> list[str]:
    out = list(canonical)
    if "anime" in canonical and "tv" not in out:
        out.append("tv")
    if "tv" in out and "series" not in out:
        out.append("series")
    return out


def patch_materializer() -> None:
    replacement = textwrap.dedent(
        '''
        def normalize_anime_transport_compatibility(entry: dict[str, Any]) -> bool:
            """Project canonical media capability onto Nuvio transport aliases."""
            canonical = []
            source = entry.get("canonicalSupportedTypes") or entry.get("supportedTypes") or []
            for value in source:
                item = str(value or "").strip().casefold()
                if item in {"movie", "tv", "anime"} and item not in canonical:
                    canonical.append(item)
            if not canonical:
                return False

            wanted = list(canonical)
            if "anime" in canonical and "tv" not in wanted:
                wanted.append("tv")
            if "tv" in wanted and "series" not in wanted:
                wanted.append("series")

            current = []
            for value in entry.get("supportedTypes") or []:
                item = str(value or "").strip().casefold()
                if item in {"movie", "tv", "anime", "series"} and item not in current:
                    current.append(item)

            before_canonical = [
                str(value or "").strip().casefold()
                for value in entry.get("canonicalSupportedTypes") or []
                if str(value or "").strip().casefold() in {"movie", "tv", "anime"}
            ]
            if current == wanted and before_canonical == canonical:
                return False

            entry["supportedTypes"] = wanted
            if wanted != canonical or "canonicalSupportedTypes" in entry:
                entry["canonicalSupportedTypes"] = canonical
            return True


        '''
    ).lstrip()
    regex_once(
        "scripts/materialize_provider_v3_all.py",
        r"def normalize_anime_transport_compatibility\(entry: dict\[str, Any\]\) -> bool:\n.*?(?=def base_version\(value: object\) -> str:)",
        replacement,
    )


def patch_enforcer() -> None:
    text = read("scripts/enforce_provider_v3_semantic_transport_contract_v5.py")
    if "import re\n" not in text:
        text = text.replace("import json\n", "import json\nimport re\n", 1)
    text = text.replace(
        "capability while accepting the real TV/movie transport namespace needed by Nuvio.\n"
        "Authoritative TMDB metadata still decides whether the work is anime before the\n"
        "semantic gate lets an anime-only catalogue serve a TV/movie-shaped request.\n",
        "capability while accepting Nuvio episodic TV/series transport aliases.\n"
        "Movie transport is exposed only when movie is a canonical provider capability.\n"
        "Authoritative TMDB metadata still decides whether the work is anime before the\n"
        "semantic gate lets an anime catalogue serve an episodic TV-shaped request.\n",
    )
    write("scripts/enforce_provider_v3_semantic_transport_contract_v5.py", text)

    block = textwrap.dedent(
        '''
        def normalized_types(values: object) -> list[str]:
            out: list[str] = []
            for value in values if isinstance(values, list) else []:
                item = str(value or "").strip().casefold()
                if item in CANONICAL_TYPES and item not in out:
                    out.append(item)
            return out


        def normalized_transport_types(values: object) -> list[str]:
            out: list[str] = []
            for value in values if isinstance(values, list) else []:
                item = str(value or "").strip().casefold()
                if item in {"movie", "tv", "anime", "series"} and item not in out:
                    out.append(item)
            return out


        def anime_transport(canonical: list[str]) -> list[str]:
            """Project semantic capability to transport without inventing movie."""
            wanted = list(canonical)
            if "anime" in canonical and "tv" not in wanted:
                wanted.append("tv")
            if "tv" in wanted and "series" not in wanted:
                wanted.append("series")
            return wanted


        '''
    ).lstrip()
    regex_once(
        "scripts/enforce_provider_v3_semantic_transport_contract_v5.py",
        r"def normalized_types\(values: object\) -> list\[str\]:\n.*?(?=def catalog_semantic_types\(\) -> dict\[str, list\[str\]\]:)",
        block,
    )

    patch_materializer_block = textwrap.dedent(
        '''
        def patch_materializer() -> bool:
            path = ROOT / "scripts" / "materialize_provider_v3_all.py"
            text = path.read_text(encoding="utf-8")
            pattern = re.compile(
                r"def normalize_anime_transport_compatibility\(entry: dict\[str, Any\]\) -> bool:\n.*?(?=def base_version\(value: object\) -> str:)",
                re.S,
            )
            match = pattern.search(text)
            if not match:
                raise AssertionError("materializer semantic/transport projector missing")
            current = match.group(0)
            required = (
                'if "anime" in canonical and "tv" not in wanted:',
                'wanted.append("series")',
                'item in {"movie", "tv", "anime", "series"}',
            )
            forbidden = (
                'for compatible in ("tv", "movie"):',
                'wanted = ["anime", "tv", "movie"]',
            )
            if any(value not in current for value in required) or any(value in current for value in forbidden):
                raise AssertionError("materializer semantic/transport projector drifted")
            return False


        '''
    ).lstrip()
    regex_once(
        "scripts/enforce_provider_v3_semantic_transport_contract_v5.py",
        r"def patch_materializer\(\) -> bool:\n.*?(?=def patch_runtime_regression_expectations\(\) -> bool:)",
        patch_materializer_block,
    )

    normalize_manifest_block = textwrap.dedent(
        '''
        def normalize_manifest(path: Path, semantics: dict[str, list[str]]) -> int:
            if not path.is_file():
                return 0
            value = json.loads(path.read_text(encoding="utf-8"))
            changed = 0
            for entry in value.get("scrapers") or []:
                if not isinstance(entry, dict):
                    continue
                provider_id = str(entry.get("id") or "").strip().casefold()
                canonical = list(semantics.get(provider_id) or [])
                if not canonical:
                    raise AssertionError(f"{path}:{provider_id}: missing canonical semantics")
                wanted = anime_transport(canonical)
                current_transport = normalized_transport_types(entry.get("supportedTypes"))
                current_canonical = normalized_types(entry.get("canonicalSupportedTypes"))
                if current_transport != wanted or (wanted != canonical and current_canonical != canonical):
                    entry["supportedTypes"] = wanted
                    if wanted != canonical or current_canonical:
                        entry["canonicalSupportedTypes"] = canonical
                    changed += 1
            if changed:
                path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
            return changed


        '''
    ).lstrip()
    regex_once(
        "scripts/enforce_provider_v3_semantic_transport_contract_v5.py",
        r"def normalize_manifest\(path: Path, semantics: dict\[str, list\[str\]\]\) -> int:\n.*?(?=def embedded_tmdb_contract_already_final\(\) -> bool:)",
        normalize_manifest_block,
    )
    text = read("scripts/enforce_provider_v3_semantic_transport_contract_v5.py")
    text = text.replace("manifest_anime_rows_normalized=", "manifest_rows_normalized=")
    write("scripts/enforce_provider_v3_semantic_transport_contract_v5.py", text)


def patch_semantic_inference() -> None:
    function = textwrap.dedent(
        '''
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

        '''
    ).lstrip()
    regex_once(
        "scripts/provider_semantics.cjs",
        r"function inferSupportedTypes\(candidate\) \{.*?(?=function roundRobin\(groups\) \{)",
        function,
    )
    text = read("scripts/provider_semantics.cjs")
    text = text.replace(
        " * Anime catalogues expose both anime episodes and anime films. Therefore an\n"
        " * anime-only description maps to the anime and movie request types, but never\n"
        " * to general TV unless series/TV coverage is explicitly declared. Mixed\n"
        " * catalogues such as Movix preserve all three categories.\n",
        " * Canonical semantics describe real catalogue capability; Nuvio transport\n"
        " * aliases never widen that capability. Anime-only stays anime-only, while a\n"
        " * provider explicitly declaring movie+anime preserves both canonical types.\n",
    )
    text = text.replace(
        "// (notably anime -> movie + tv). When canonicalSupportedTypes exists it is\n",
        "// (notably anime -> tv/series). When canonicalSupportedTypes exists it is\n",
    )
    write("scripts/provider_semantics.cjs", text)


def patch_tests() -> None:
    text = read("scripts/validate_provider_semantics.cjs")
    text = text.replace(
        "  ['movie', 'anime'],\n  'anime catalogues must expose anime films without being presented as general TV catalogues',",
        "  ['anime'],\n  'anime-only transport aliases must not manufacture semantic movie capability',",
        1,
    )
    text = text.replace(
        "'anime-only catalogues must validate movie requests against anime-film fixtures'",
        "'anime-only catalogues remain identifiable without creating a generic movie lane'",
        1,
    )
    write("scripts/validate_provider_semantics.cjs", text)

    text = read("tests/provider_semantics.test.cjs")
    text = text.replace("supportedTypes: ['anime', 'movie', 'tv'],", "supportedTypes: ['anime', 'tv', 'series'],", 1)
    text = text.replace("assert.deepEqual(inferSupportedTypes(hianime), ['movie', 'anime']);", "assert.deepEqual(inferSupportedTypes(hianime), ['anime']);", 1)
    text = text.replace("supportedTypes: ['movie', 'anime', 'tv'],", "supportedTypes: ['movie', 'anime', 'tv', 'series'],", 1)
    write("tests/provider_semantics.test.cjs", text)

    test = textwrap.dedent(
        '''
        #!/usr/bin/env python3
        from __future__ import annotations
        import json
        from pathlib import Path

        ROOT = Path(__file__).resolve().parents[1]
        CANONICAL = {"movie", "tv", "anime"}
        TRANSPORT = CANONICAL | {"series"}

        def values(raw: object, label: str, allowed: set[str]) -> list[str]:
            assert isinstance(raw, list) and raw, f"{label}: non-empty media type list required"
            out: list[str] = []
            for value in raw:
                item = str(value or "").strip().casefold()
                assert item in allowed, f"{label}: invalid media type {item!r}"
                assert item not in out, f"{label}: duplicate media type {item!r}"
                out.append(item)
            return out

        def transport_for(canonical: list[str]) -> list[str]:
            wanted = list(canonical)
            if "anime" in canonical and "tv" not in wanted:
                wanted.append("tv")
            if "tv" in wanted and "series" not in wanted:
                wanted.append("series")
            return wanted

        catalog = json.loads((ROOT / "provider_catalog.json").read_text(encoding="utf-8"))
        assert catalog.get("sourceOfTruth") is True
        semantics: dict[str, list[str]] = {}
        for provider in catalog.get("providers") or []:
            scraper = provider.get("scraper") if isinstance(provider, dict) else None
            assert isinstance(scraper, dict)
            provider_id = str(scraper.get("id") or provider.get("canonicalId") or "").strip().casefold()
            assert provider_id and provider_id not in semantics
            semantics[provider_id] = values(
                scraper.get("canonicalSupportedTypes") or scraper.get("supportedTypes"),
                f"provider_catalog.json:{provider_id}",
                CANONICAL,
            )
        assert len(semantics) == 96, len(semantics)

        projected = 0
        anime_only = 0
        canonical_movie_anime = 0
        for relative in ("manifest.json", "vf/manifest.json", "no-anime/manifest.json", "vf-no-anime/manifest.json"):
            path = ROOT / relative
            if not path.is_file():
                continue
            manifest = json.loads(path.read_text(encoding="utf-8"))
            for row in manifest.get("scrapers") or []:
                provider_id = str(row.get("id") or "").strip().casefold()
                assert provider_id in semantics, f"{relative}:{provider_id}: missing semantics"
                canonical = semantics[provider_id]
                transport = values(row.get("supportedTypes"), f"{relative}:{provider_id}:supportedTypes", TRANSPORT)
                explicit = row.get("canonicalSupportedTypes")
                if explicit:
                    assert values(
                        explicit,
                        f"{relative}:{provider_id}:canonicalSupportedTypes",
                        CANONICAL,
                    ) == canonical
                wanted = transport_for(canonical)
                assert transport == wanted, (relative, provider_id, canonical, transport, wanted)
                assert ("movie" in transport) == ("movie" in canonical), (
                    relative,
                    provider_id,
                    canonical,
                    transport,
                )
                if "anime" in canonical or "tv" in canonical:
                    assert "tv" in transport and "series" in transport, (relative, provider_id, transport)
                projected += 1
                anime_only += int(canonical == ["anime"])
                canonical_movie_anime += int("movie" in canonical and "anime" in canonical)

        assert projected >= 96
        assert anime_only > 0
        assert canonical_movie_anime > 0

        materializer = (ROOT / "scripts/materialize_provider_v3_all.py").read_text(encoding="utf-8")
        assert 'if "anime" in canonical and "tv" not in wanted:' in materializer
        assert 'wanted.append("series")' in materializer
        assert 'for compatible in ("tv", "movie"):' not in materializer
        assert 'wanted = ["anime", "tv", "movie"]' not in materializer

        enforcer = (ROOT / "scripts/enforce_provider_v3_semantic_transport_contract_v5.py").read_text(encoding="utf-8")
        assert 'if "anime" in canonical and "tv" not in wanted:' in enforcer
        assert 'wanted.append("series")' in enforcer

        reapply = (ROOT / "scripts/reapply_published_overrides.py").read_text(encoding="utf-8")
        assert 'Movie is not a generic' in reapply
        assert 'transport.append("series")' in reapply

        machine = json.loads((ROOT / "automation/provider-v3-architecture.json").read_text(encoding="utf-8"))
        assert machine["media_types"]["anime_only_transport_compatibility"] == ["anime", "tv", "series"]

        print(
            "provider anime semantic/transport contract passed "
            f"projected_rows={projected} anime_only={anime_only} movie_anime={canonical_movie_anime} "
            "rule=no-artificial-movie+tv-series-alias"
        )
        '''
    ).lstrip()
    write("tests/provider_anime_semantic_transport_contract_test.py", test)


def normalize_manifests() -> dict[str, int]:
    catalog = json.loads(read("provider_catalog.json"))
    semantics: dict[str, list[str]] = {}
    for provider in catalog.get("providers") or []:
        if not isinstance(provider, dict):
            continue
        scraper = provider.get("scraper")
        if not isinstance(scraper, dict):
            continue
        provider_id = str(scraper.get("id") or provider.get("canonicalId") or "").strip().casefold()
        canonical = canonical_types(scraper.get("canonicalSupportedTypes") or scraper.get("supportedTypes") or [])
        if provider_id and canonical:
            semantics[provider_id] = canonical
    if len(semantics) != 96:
        raise SystemExit(f"provider_catalog semantic rows={len(semantics)} expected=96")

    changes: dict[str, int] = {}
    for relative in ("manifest.json", "vf/manifest.json", "no-anime/manifest.json", "vf-no-anime/manifest.json"):
        path = ROOT / relative
        if not path.is_file():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        changed = 0
        for row in payload.get("scrapers") or []:
            provider_id = str(row.get("id") or "").strip().casefold()
            canonical = list(semantics.get(provider_id) or [])
            if not canonical:
                raise SystemExit(f"{relative}:{provider_id}: missing canonical semantics")
            wanted = transport_types(canonical)
            current = [str(v or "").strip().casefold() for v in row.get("supportedTypes") or []]
            explicit = canonical_types(row.get("canonicalSupportedTypes"))
            if current != wanted or (wanted != canonical and explicit != canonical):
                row["supportedTypes"] = wanted
                if wanted != canonical or explicit:
                    row["canonicalSupportedTypes"] = canonical
                changed += 1
        if changed:
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        changes[relative] = changed
    return changes


def patch_docs() -> None:
    for relative in (
        "README.md",
        "README.fr.md",
        "ARCHITECTURE.md",
        "VALIDATION.md",
        "HEALTH-CHECK.md",
        "CONTRIBUTING.md",
    ):
        text = read(relative)
        text = text.replace('["anime", "tv", "movie"]', '["anime", "tv", "series"]')
        text = text.replace('[anime, tv, movie]', '[anime, tv, series]')
        text = text.replace("anime + tv + movie", "anime + tv + series")
        text = text.replace("anime/tv/movie", "anime/tv/series")
        text = text.replace(
            "`tv` supports episodic anime transport and `movie` supports anime films. Those aliases do **not** turn an anime-only provider into a generic movie/TV provider; ordinary non-anime content must still be rejected by authoritative identity logic.",
            "`tv` and `series` are episodic transport aliases for anime. `movie` appears only when the provider declares canonical movie capability; transport aliases never widen semantic capability.",
        )
        text = text.replace(
            "`tv` transporte les anime épisodiques et `movie` les films anime. Ces alias ne transforment **pas** le provider en provider film/série générique ; un contenu non-anime doit toujours être rejeté par la logique d’identité autoritaire.",
            "`tv` et `series` sont les alias de transport épisodique de l’anime. `movie` n’est exposé que si le provider déclare réellement une capacité canonique `movie` ; les alias de transport n’élargissent jamais la capacité sémantique.",
        )
        text = text.replace(
            "`tv` and `movie` are transport compatibility for episodic anime and anime films. They do not authorize ordinary non-anime movie/TV content.",
            "`tv` and `series` are episodic transport aliases. `movie` is present only for providers with canonical movie capability; aliases never authorize additional semantic content.",
        )
        text = text.replace(
            "- anime épisodique via transport série/`tv` ;\n- film anime via transport `movie` ;\n- namespace `anime` lorsqu’il est exposé par le client.",
            "- anime épisodique via transport `tv`/`series` ;\n- namespace `anime` lorsqu’il est exposé par le client ;\n- transport `movie` uniquement lorsqu’une capacité canonique `movie` est réellement déclarée.",
        )
        text = text.replace(
            "Les trois voies doivent être testables sans ajouter `movie` ou `tv` à sa capacité canonique.",
            "Les voies `anime`, `tv` et `series` restent des lancements compatibles sans élargir la capacité canonique ; `movie` n’est exposé que s’il est canonique.",
        )
        write(relative, text)


def patch_workflows() -> None:
    manual = read(".github/workflows/provider-v3-reconstruct-all.yml")
    manual = manual.replace(
        "Enforce anime semantic and TV/movie transport contract",
        "Enforce canonical semantic and TV/series transport contract",
        1,
    )
    write(".github/workflows/provider-v3-reconstruct-all.yml", manual)

    auth = read(".github/workflows/workbench-authoritative-repair-v1.yml")
    auth = auth.replace(
        "# Trigger revision: causal-external-identity-and-accounted-repair-debt-v2.",
        "# Trigger revision: semantic-transport-no-artificial-movie-v3.",
        1,
    )
    anchor = "          python tests/global_media_type_pre_network_gate_test.py\n"
    extra = (
        anchor
        + "          node scripts/validate_provider_semantics.cjs\n"
        + "          node tests/provider_semantics.test.cjs\n"
        + "          python tests/reapply_manifest_type_projection_test.py\n"
        + "          python tests/provider_anime_semantic_transport_contract_test.py\n"
        + "          python tests/provider_v3_documentation_contract_test.py\n"
    )
    if "node scripts/validate_provider_semantics.cjs" not in auth:
        if anchor not in auth:
            raise SystemExit("authoritative Repair preflight anchor missing")
        auth = auth.replace(anchor, extra, 1)
    write(".github/workflows/workbench-authoritative-repair-v1.yml", auth)


def checkpoint_memory() -> None:
    memory = read("MEMORY.md")
    heading = "## 2026-09-10 — semantic/transport drift caught before merge"
    if heading in memory:
        return
    checkpoint = textwrap.dedent(
        '''

        ## 2026-09-10 — semantic/transport drift caught before merge

        - Final cleanup run `34412252681` correctly failed before commit on ANIDB because the candidate manifest exposed anime transport without the required `series` alias and still carried an obsolete anime->movie widening path.
        - This supersedes stale docs/source that said anime-only `supportedTypes=[anime,tv,movie]`. Authoritative invariant: canonical semantics are `movie/tv/anime`; `series` is transport-only alias of `tv`; episodic anime may add `tv+series`; **movie must never be manufactured for anime-only** and appears only when `movie` is canonical provider capability.
        - Internal Core may preserve a TMDB movie namespace inside an already-authorized anime request; that is not permission to expose a generic movie lane in manifest/health capability.
        - Materializer, semantic enforcer, health/Repair inference, tests and current user-facing docs are reconciled to this invariant before merge.
        - Repair run `34409463163` remains useful route/yield evidence but is no longer final acceptance for the transport matrix. A fresh authoritative Repair + four-version gate is mandatory after this correction.
        - Do not delete `workbench/systemic-recovery-20260909` until corrected Repair, clean PR, merge and five Native Labs are green. Final branch target remains only `main` + `brain-learning/proposals`.
        '''
    )
    write("MEMORY.md", memory.rstrip() + checkpoint)


def assert_no_stale_docs() -> None:
    for relative in (
        "README.md",
        "README.fr.md",
        "ARCHITECTURE.md",
        "VALIDATION.md",
        "HEALTH-CHECK.md",
        "CONTRIBUTING.md",
    ):
        text = read(relative)
        for stale in ('["anime", "tv", "movie"]', '[anime, tv, movie]', "anime + tv + movie"):
            if stale in text:
                raise SystemExit(f"{relative}: stale anime->movie transport wording remains: {stale}")


def main() -> int:
    patch_materializer()
    patch_enforcer()
    patch_semantic_inference()
    patch_tests()
    changes = normalize_manifests()
    patch_docs()
    patch_workflows()
    checkpoint_memory()
    assert_no_stale_docs()
    print("SEMANTIC_TRANSPORT_PROJECTIONS " + json.dumps(changes, sort_keys=True))
    print("SEMANTIC_TRANSPORT_SOURCE_REPAIR_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
