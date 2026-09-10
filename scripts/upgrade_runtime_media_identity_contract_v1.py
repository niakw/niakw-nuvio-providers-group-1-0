#!/usr/bin/env python3
"""Materialize the durable cross-client TMDB/IMDb identity contract.

This migration is intentionally idempotent. It records the identity surface that
NiakVIO Core/provider code already consumes so future runtime refactors cannot
silently regress to a TMDB-only positional interpretation.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "automation" / "platform-runtime-contracts.json"
MATRIX = ROOT / "automation" / "nuvio-client-compatibility-matrix.json"
CAPABILITY = "media_identity_hydration"
CONTEXT_PATH = "__nuvioMediaContext.tmdbMetadata.external_ids.imdb_id"
CACHE_GLOBAL = "__nuvioTmdbMetadataCacheV1"
CACHE_SHAPE = '{state:"ok",metadata:{external_ids:{imdb_id:"tt..."}}}'


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path}: expected JSON object")
    return value


def dump(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def upgrade_platform(data: dict) -> None:
    if data.get("schema_version") != 2:
        raise SystemExit("platform-runtime-contracts schema_version must remain 2")
    data["audited_at"] = "2026-09-09"
    order = list(data.get("capability_order") or [])
    if CAPABILITY not in order:
        try:
            index = order.index("tmdb_api_key") + 1
        except ValueError as exc:
            raise SystemExit("tmdb_api_key capability missing") from exc
        order.insert(index, CAPABILITY)
    data["capability_order"] = order
    data["media_identity_contract"] = {
        "version": 1,
        "positional_tmdb_id_is_complete_identity": False,
        "canonical_context_imdb_path": CONTEXT_PATH,
        "canonical_metadata_cache_global": CACHE_GLOBAL,
        "canonical_metadata_cache_entry_shape": CACHE_SHAPE,
        "cache_population_timing": "after provider/Core bundle initialization and before getStreams invocation when supplied by the host",
        "user_tmdb_credential_required": False,
        "secret_projection_to_provider_javascript": False,
        "rule": "Preserve TMDB and IMDb identity as one media identity contract. A client may provide equivalent hydration through a host metadata bridge or an audited runtime metadata capability, but must not require an end-user TMDB credential.",
    }
    clients = data.get("clients") or {}
    for client_id, client in clients.items():
        caps = client.setdefault("capabilities", {})
        if client_id == "android-tv":
            caps[CAPABILITY] = {
                "state": "bridge",
                "detail": "Equivalent Core hydration available through the audited TV TMDB runtime bridge; Core can resolve TMDB metadata/external_ids and derive IMDb without a user-supplied key.",
            }
        else:
            caps[CAPABILITY] = {
                "state": "absent",
                "detail": "Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap.",
            }


def upgrade_matrix(data: dict) -> None:
    policy = data.setdefault("policy", {})
    policy["media_identity_contract"] = (
        "The positional getStreams(tmdbId, mediaType, season, episode) argument is transport, not the full media identity. "
        f"NiakVIO's canonical IMDb metadata path is {CONTEXT_PATH} and its shared metadata cache is {CACHE_GLOBAL}. "
        "Equivalent client hydration is allowed, but no end-user TMDB credential may be required and no TMDB secret may be projected into provider JavaScript solely to recover IMDb identity."
    )
    clients = data.get("clients") or {}
    for client_id, client in clients.items():
        contract = client.setdefault("provider_contract", {})
        contract["positional_id_is_complete_identity"] = False
        contract["canonical_identity_context_path"] = CONTEXT_PATH
        contract["canonical_identity_cache"] = CACHE_GLOBAL
        contract["canonical_identity_cache_entry_shape"] = CACHE_SHAPE
        contract["user_tmdb_credential_required"] = False
        contract["tmdb_secret_projection_required"] = False
        if client_id == "nuvio-tv":
            contract["identity_hydration_status"] = "equivalent-runtime-metadata-bridge"
            contract["identity_hydration_note"] = (
                "TV currently supplies an audited TMDB runtime capability that lets Core hydrate external_ids/IMDb. "
                "This is equivalent identity capability, not permission for shared providers to depend on TMDB_API_KEY."
            )
        else:
            contract["identity_hydration_status"] = "client-gap-host-bridge-required"
            contract["identity_hydration_note"] = (
                "Official runtime currently normalizes to the positional TMDB id without a canonical host TMDB/IMDb metadata bridge. "
                "A host bridge must populate the canonical context/cache after Core initialization and before getStreams, while keeping provider bytes and secrets untouched."
            )


def main() -> int:
    platform = load(PLATFORM)
    matrix = load(MATRIX)
    upgrade_platform(platform)
    upgrade_matrix(matrix)
    dump(PLATFORM, platform)
    dump(MATRIX, matrix)
    print(
        "runtime media identity contract upgraded: "
        f"context={CONTEXT_PATH} cache={CACHE_GLOBAL} user_tmdb_credential_required=false"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
