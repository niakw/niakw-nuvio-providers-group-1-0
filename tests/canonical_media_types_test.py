#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = {"movie", "tv", "anime"}
TRANSPORT = CANONICAL | {"series"}


def normalized_types(raw: object, label: str, allowed: set[str]) -> tuple[str, ...]:
    assert isinstance(raw, list) and raw, f"{label}: media types must be a non-empty list"
    types = tuple(str(value).strip().lower() for value in raw)
    assert len(types) == len(set(types)), f"{label}: repeated media types {types}"
    invalid = [value for value in types if value not in allowed]
    assert not invalid, f"{label}: invalid media types {invalid}; allowed={sorted(allowed)}"
    return types


def expected_transport(canonical: tuple[str, ...]) -> tuple[str, ...]:
    wanted = list(canonical)
    if "anime" in canonical and "tv" not in wanted:
        wanted.append("tv")
    if "tv" in wanted and "series" not in wanted:
        wanted.append("series")
    return tuple(wanted)


def validate_manifest(path: Path) -> tuple[list[dict], int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("scrapers", [])
    assert isinstance(rows, list) and rows, f"{path}: no scrapers"
    seen: set[str] = set()
    anime = 0
    out: list[dict] = []
    for index, row in enumerate(rows):
        assert isinstance(row, dict), f"{path}: scraper[{index}] must be an object"
        provider_id = str(row.get("id") or "").strip()
        assert provider_id, f"{path}: scraper[{index}] has no id"
        key = provider_id.casefold()
        assert key not in seen, f"{path}: duplicate provider id {provider_id!r}"
        seen.add(key)

        transport = normalized_types(row.get("supportedTypes"), f"{path}:{provider_id}:supportedTypes", TRANSPORT)
        canonical_raw = row.get("canonicalSupportedTypes")
        if canonical_raw:
            canonical = normalized_types(canonical_raw, f"{path}:{provider_id}:canonicalSupportedTypes", CANONICAL)
        else:
            canonical = tuple(value for value in transport if value != "series")
            assert canonical, f"{path}:{provider_id}: missing canonical media capability"
            assert all(value in CANONICAL for value in canonical)

        assert "series" not in canonical, (path, provider_id, canonical)
        assert transport == expected_transport(canonical), (
            path,
            provider_id,
            canonical,
            transport,
            expected_transport(canonical),
        )
        assert ("movie" in transport) == ("movie" in canonical), (path, provider_id, canonical, transport)
        if "anime" in canonical or "tv" in canonical:
            assert {"tv", "series"} <= set(transport), (path, provider_id, canonical, transport)

        anime += int("anime" in canonical)
        out.append({"id": provider_id, "key": key, "transport": transport, "canonical": canonical, "row": row})
    return out, anime


def validate_catalog(path: Path) -> tuple[dict[str, dict], dict[str, list[str]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data.get("sourceOfTruth") is True, f"{path}: sourceOfTruth must stay true"
    providers = data.get("providers", [])
    assert isinstance(providers, list) and providers, f"{path}: providers must be non-empty"
    by_canonical: dict[str, dict] = {}
    scraper_ids: set[str] = set()
    for index, entry in enumerate(providers):
        assert isinstance(entry, dict), f"{path}: providers[{index}] must be an object"
        canonical_id = str(entry.get("canonicalId") or "").strip()
        assert canonical_id, f"{path}: providers[{index}] has no canonicalId"
        canonical_key = canonical_id.casefold()
        assert canonical_key not in by_canonical, f"{path}: duplicate canonicalId {canonical_id!r}"
        scraper = entry.get("scraper")
        assert isinstance(scraper, dict), f"{path}:{canonical_id}: scraper must be an object"
        scraper_id = str(scraper.get("id") or "").strip()
        assert scraper_id, f"{path}:{canonical_id}: scraper has no id"
        scraper_key = scraper_id.casefold()
        assert scraper_key not in scraper_ids, f"{path}: duplicate scraper id {scraper_id!r}"
        scraper_ids.add(scraper_key)

        canonical_raw = scraper.get("canonicalSupportedTypes") or scraper.get("supportedTypes")
        canonical = normalized_types(canonical_raw, f"{path}:{canonical_id}/{scraper_id}:canonical", CANONICAL)
        projections = entry.get("projections") or {}
        assert isinstance(projections, dict), f"{path}:{canonical_id}: projections must be an object"
        by_canonical[canonical_key] = {
            "canonicalId": canonical_id,
            "scraperId": scraper_id,
            "types": canonical,
            "projections": projections,
        }

    assert len(by_canonical) == 96, len(by_canonical)
    orders = data.get("manifestOrder") or {}
    assert isinstance(orders, dict), f"{path}: manifestOrder must be an object"
    normalized_orders: dict[str, list[str]] = {}
    for projection in ("general", "vf"):
        raw_order = orders.get(projection)
        assert isinstance(raw_order, list), f"{path}: manifestOrder.{projection} must be a list"
        order = [str(value).strip().casefold() for value in raw_order]
        assert all(order), f"{path}: manifestOrder.{projection} contains an empty id"
        assert len(order) == len(set(order)), f"{path}: manifestOrder.{projection} contains duplicate ids"
        missing = [value for value in order if value not in by_canonical]
        assert not missing, f"{path}: manifestOrder.{projection} references unknown canonical ids {missing}"
        projected = {key for key, entry in by_canonical.items() if bool(entry["projections"].get(projection))}
        assert set(order) == projected, (
            f"{path}: manifestOrder.{projection} must exactly match providers projected to {projection}; "
            f"missing_from_order={sorted(projected - set(order))} extra_in_order={sorted(set(order) - projected)}"
        )
        normalized_orders[projection] = order
    return by_canonical, normalized_orders


def assert_projection(manifest_path: Path, projection: str, catalog: dict[str, dict], orders: dict[str, list[str]]) -> tuple[int, int]:
    manifest_rows, anime = validate_manifest(manifest_path)
    order = orders[projection]
    assert len(manifest_rows) == len(order), f"{manifest_path}: projection size drift {len(manifest_rows)} != catalog order {len(order)}"
    expected_ids = [catalog[key]["scraperId"].casefold() for key in order]
    actual_ids = [row["key"] for row in manifest_rows]
    assert actual_ids == expected_ids, f"{manifest_path}: provider order/identity is not the deterministic {projection} projection of provider_catalog.json"

    for row, canonical_key in zip(manifest_rows, order, strict=True):
        expected = catalog[canonical_key]["types"]
        assert row["canonical"] == expected, (
            f"{manifest_path}:{row['id']}: canonical media types drift from provider_catalog.json: "
            f"{row['canonical']} != {expected}"
        )
        assert row["transport"] == expected_transport(expected), (
            f"{manifest_path}:{row['id']}: transport projection drift: "
            f"{row['transport']} != {expected_transport(expected)}"
        )
    return len(manifest_rows), anime


catalog, orders = validate_catalog(ROOT / "provider_catalog.json")
canonical_count, canonical_anime = assert_projection(ROOT / "manifest.json", "general", catalog, orders)
vf_count, vf_anime = assert_projection(ROOT / "vf/manifest.json", "vf", catalog, orders)
assert canonical_count == 96, canonical_count
assert canonical_anime > 0, "general projection must retain anime providers"
assert vf_count > 0, vf_count
assert vf_anime > 0, "VF projection must retain its anime providers"

corpus = json.loads((ROOT / ".github/triggers/nuvio-client-lab.json").read_text(encoding="utf-8"))
fixtures = {row["slug"]: row["fixture"] for row in corpus.get("fixtures", []) if isinstance(row, dict) and isinstance(row.get("fixture"), dict)}
for slug in ("jujutsu-kaisen-s01e01", "mushoku-tensei-s01e01"):
    fixture = fixtures[slug]
    assert str(fixture.get("category") or "").lower() == "anime", (slug, fixture)
    assert str(fixture.get("mediaType") or "").lower() == "anime", (slug, fixture)

print(
    "canonical media type tests passed: "
    f"catalog={len(catalog)} general={canonical_count} vf={vf_count} "
    f"anime_general={canonical_anime} anime_vf={vf_anime} semantic=movie|tv|anime "
    "transport=movie|tv|anime|series anime_or_tv_requires=tv+series movie_only_when_canonical"
)
