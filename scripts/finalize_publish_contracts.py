#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        if new in text:
            return False
        raise AssertionError(f"{label}: old and final source shapes are both absent")
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected exactly one old block, got {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def assert_media_contract() -> bool:
    """Fail closed if the authoritative semantic/transport split drifts.

    canonicalSupportedTypes is semantic movie|tv|anime. supportedTypes is the
    Nuvio transport surface: episodic tv/anime additionally exposes tv+series.
    Movie transport exists only when movie is a canonical capability.
    """
    materializer = (ROOT / "scripts/materialize_provider_v3_all.py").read_text(encoding="utf-8")
    enforcer = (ROOT / "scripts/enforce_provider_v3_semantic_transport_contract_v5.py").read_text(encoding="utf-8")
    reapply = (ROOT / "scripts/reapply_published_overrides.py").read_text(encoding="utf-8")
    machine = json.loads((ROOT / "automation/provider-v3-architecture.json").read_text(encoding="utf-8"))

    for text, label in ((materializer, "materializer"), (enforcer, "enforcer")):
        for needle in (
            'if "anime" in canonical and "tv" not in wanted:',
            'wanted.append("tv")',
            'wanted.append("series")',
        ):
            if needle not in text:
                raise AssertionError(f"{label}: missing authoritative transport rule {needle}")

    # The executable projection is validated behaviorally below by the manifest
    # contract tests. Do not grep forbidden marker strings here: the enforcer
    # intentionally contains those strings inside its own anti-regression list.
    for needle in (
        'transport.append("tv")',
        'transport.append("series")',
        'Movie is not a generic',
    ):
        if needle not in reapply:
            raise AssertionError(f"reapply projection missing {needle}")

    media = machine.get("media_types") or {}
    if media.get("semantic_field") != "canonicalSupportedTypes":
        raise AssertionError("architecture semantic field drifted")
    if media.get("transport_field") != "supportedTypes":
        raise AssertionError("architecture transport field drifted")
    if media.get("anime_only_transport_compatibility") != ["anime", "tv", "series"]:
        raise AssertionError("architecture anime transport must remain anime+tv+series")
    return False


def patch_provider_base() -> bool:
    path = ROOT / "scripts" / "provider_base_store.py"
    return replace_exact(
        path,
        '''    const label = _text(match[4])\n      .replace(/<[^>]+>/g, " ")\n      .replace(/&nbsp;/gi, " ")\n      .replace(/&amp;/gi, "&")\n      .replace(/\\s+/g, " ")\n      .trim();\n''',
        '''    const label = _htmlVisibleText(match[4]);\n''',
        "ProviderBase search-card visible label scanner",
    )


def patch_branding_test() -> bool:
    path = ROOT / "tests" / "global_provider_branding_test.py"
    return replace_exact(
        path,
        'assert "post-presentation-name-title-quality-v7" in patched\n',
        'assert "post-presentation-lossless-source-label-v8" in patched\n',
        "branding revision assertion",
    )


def main() -> int:
    changes = {
        "media_contract_verified": assert_media_contract(),
        "provider_base": patch_provider_base(),
        "branding_test": patch_branding_test(),
    }
    print("FINAL_PUBLISH_CONTRACT_FIXES " + " ".join(f"{k}={str(v).lower()}" for k, v in changes.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
