#!/usr/bin/env python3
"""Generate deterministic release checksum inventories without circular hashes.

Release inventories cover code, manifests, provider artifacts and durable
configuration. Mutable operational telemetry and explicitly temporary CI
harnesses are excluded; otherwise a disposable diagnostic/proof workflow would
invalidate an otherwise immutable published release.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from render_platform_runtime_contracts import load_contract, render as render_platform_runtime_contracts

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONTRACT_README = ROOT / "automation" / "PLATFORM-RUNTIME-CONTRACTS.md"
CORE_PUBLISH_FREEZE = ROOT / "automation" / "CORE-PUBLISH-FREEZE"
GENERATED = {"FILE-HASHES.json", "PATCH-SHA256SUMS.txt"}
IGNORED_PARTS = {
    ".git",
    "node_modules",
    "staging",
    "health-output",
    "checked-artifact",
    "__pycache__",
}
IGNORED_FILES = {
    "availability-history.json",
    "availability-report.json",
    # Current quick evidence contains run timestamps and is intentionally
    # regenerated on every routine refresh. The canonical deep health report,
    # manifests, provider bytes and provenance remain release-hashed.
    "refresh-health-report.json",
}
IGNORED_PREFIXES = (
    ".github/ci-status/",
    ".github/triggers/",
    ".github/workflows/tmp-",
)
CORE_FILES = [
    "package.json",
    "package-lock.json",
    "sources.json",
    "manifest.json",
    "vf/manifest.json",
    "vf-no-anime/manifest.json",
    "provider-v3-materialization.json",
    "provider-overrides.json",
    "provider_catalog.json",
    "provider-type-policy.json",
    "automation/platform-runtime-contracts.json",
    "automation/PLATFORM-RUNTIME-CONTRACTS.md",
    "automation/nuvio-tv-runtime-contract.json",
    "automation/nuvio-client-upstreams.json",
    "automation/nuvio-client-safety-findings.json",
    "scripts/render_platform_runtime_contracts.py",
    "scripts/deep_repair_loop.py",
    "scripts/runtime_repair.py",
    "scripts/apply_provider_overrides.py",
    "scripts/reapply_published_overrides.py",
    "scripts/provider_dns_preflight.mjs",
    "scripts/prune_unreferenced_providers.py",
    "scripts/validate_platform_runtime_policy.py",
    "scripts/validate_nuvio_tv_runtime_policy.py",
    "scripts/check_nuvio_client_upstreams.py",
    "scripts/sync_release_versions.py",
    "scripts/nuvio_tv_probe_v2.cjs",
    "scripts/promote_global_nuvio_tv_candidates.py",
    "scripts/provider_base_store.py",
    "scripts/provider_patch_blocks.py",
    "scripts/provider_byte_stability.py",
    "scripts/materialize_provider_v3_all.py",
    "scripts/verify_provider_v3_reverse_rebuild.py",
    "scripts/provider_patches/stream_output_sanitizer_v5.py",
    "scripts/provider_patches/stream_output_sanitizer_v6.py",
    "scripts/provider_patches/stream_output_sanitizer_v7.py",
    "scripts/provider_patches/global_media_enrichment_v1.py",
    "scripts/provider_patches/global_media_type_resolution_v1.py",
    "scripts/provider_patches/runtime_capability_media_safety_v4.py",
    "scripts/provider_patches/hls_runtime_integrity_v1.py",
    "scripts/provider_patches/global_provider_branding_v1.py",
    "scripts/provider_patches/global_provider_security_hardening_v1.py",
    "scripts/provider_patches/global_runtime_compat_v1.py",
    "scripts/provider_patches/global_stream_facts_v1.py",
    "scripts/provider_patches/global_stream_identity_v1.py",
    "scripts/provider_patches/global_stream_presentation_v1.py",
    "scripts/provider_patches/global_catalogue_alias_recovery_v2.py"
]
OPTIONAL_CORE_FILES = [
    "automation/platform-runtime-matrix.json",
    "automation/platform-runtime-policy.json",
]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def inventory(*, include_file_hashes: bool) -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT).as_posix()
        if any(part in IGNORED_PARTS for part in path.relative_to(ROOT).parts):
            continue
        if relative in IGNORED_FILES:
            continue
        if any(relative.startswith(prefix) for prefix in IGNORED_PREFIXES):
            continue
        if relative == "PATCH-SHA256SUMS.txt":
            continue
        if relative == "FILE-HASHES.json" and not include_file_hashes:
            continue
        if path.suffix in {".zip", ".sha256"}:
            continue
        files[relative] = digest(path)
    return files


def materialize_generated_release_docs() -> None:
    rendered = render_platform_runtime_contracts(load_contract())
    RUNTIME_CONTRACT_README.write_text(rendered, encoding="utf-8")


def enforce_core_publication_authority() -> None:
    """Fail closed when a Core finalizer is frozen or no longer authoritative."""
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    if os.environ.get("GITHUB_WORKFLOW") != "NiakVIO Core media finalizer":
        return

    if CORE_PUBLISH_FREEZE.is_file():
        raise SystemExit(
            "Core publication freeze is active; refusing release hash materialization/publish"
        )

    run_sha = os.environ.get("GITHUB_SHA", "").strip()
    if not run_sha:
        raise SystemExit("Core finalizer has no GITHUB_SHA; refusing publication")
    try:
        authoritative_sha = subprocess.check_output(
            ["git", "rev-parse", "origin/main"],
            cwd=ROOT,
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"unable to resolve authoritative origin/main: {exc}") from exc

    if authoritative_sha != run_sha:
        raise SystemExit(
            "stale Core finalizer refused: "
            f"run_sha={run_sha} authoritative_main={authoritative_sha}"
        )


def main() -> int:
    enforce_core_publication_authority()

    # Generated human-readable contracts are part of the durable release tree.
    # Materialize them before any digest is computed so the hash inventory and
    # README are one fixed point rather than two independently updated states.
    materialize_generated_release_docs()

    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

    core_paths = list(CORE_FILES) + [relative for relative in OPTIONAL_CORE_FILES if (ROOT / relative).is_file()]
    core = {relative: digest(ROOT / relative) for relative in core_paths}
    (ROOT / "SHA256SUMS.json").write_text(
        json.dumps(
            {
                "schema_version": 3,
                "release": version,
                "algorithm": "sha256",
                "files": core,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    files = inventory(include_file_hashes=False)
    (ROOT / "FILE-HASHES.json").write_text(
        json.dumps(
            {
                "schema_version": 79,
                "release": version,
                "algorithm": "sha256",
                "excluded_generated_files": sorted(GENERATED),
                "excluded_mutable_operational_files": sorted(IGNORED_FILES),
                "excluded_mutable_operational_prefixes": sorted(IGNORED_PREFIXES),
                "files": files,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    patch_inventory = inventory(include_file_hashes=True)
    lines = [f"{sha}  ./{relative}" for relative, sha in patch_inventory.items()]
    (ROOT / "PATCH-SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        f"release hashes generated: core={len(core)}, files={len(files)}, patch={len(patch_inventory)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
