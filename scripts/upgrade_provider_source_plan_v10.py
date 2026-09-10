#!/usr/bin/env python3
"""Source Plan V10 entrypoint with explicit runtime-domain authority.

V10's implementation remains byte-identical in the sibling _impl module. This
entrypoint applies it, then narrows executable domain rewriting to the explicit
runtime_domain_replacements map. Historical/candidate domain_substitutions and
replacements remain knowledge only and can never redirect provider execution.
"""
from __future__ import annotations

from pathlib import Path

import upgrade_provider_source_plan_v10_impl as impl

AUTHORITY_MARKER = "NIAKVIO_PROVIDER_RUNTIME_DOMAIN_AUTHORITY_V10_1"


def _rewrite_once(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return False
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected one runtime-domain anchor, got {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def enforce_runtime_domain_authority() -> bool:
    changed = False
    changed |= _rewrite_once(
        impl.RECOVERY,
        '    for key in ("runtime_domain_replacements", "replacements", "domain_substitutions"):\n',
        f'    # {AUTHORITY_MARKER}: only explicitly promoted runtime DATA may redirect execution.\n'
        '    for key in ("runtime_domain_replacements",):\n',
        "recovery-proof-origin-authority",
    )
    changed |= _rewrite_once(
        impl.MATERIALIZER,
        '    for key in ("domain_substitutions", "runtime_domain_replacements"):\n',
        f'    # {AUTHORITY_MARKER}: candidate/history maps are non-executable knowledge.\n'
        '    for key in ("runtime_domain_replacements",):\n',
        "materializer-domain-authority",
    )

    recovery = impl.RECOVERY.read_text(encoding="utf-8")
    materializer = impl.MATERIALIZER.read_text(encoding="utf-8")
    if '("runtime_domain_replacements", "replacements", "domain_substitutions")' in recovery:
        raise AssertionError("candidate domain maps still executable in recovery")
    if '("domain_substitutions", "runtime_domain_replacements")' in materializer:
        raise AssertionError("historical domain_substitutions still executable in materializer")
    if AUTHORITY_MARKER not in recovery or AUTHORITY_MARKER not in materializer:
        raise AssertionError("runtime-domain authority marker missing")
    return changed


def main() -> int:
    changed = impl.patch_recovery() | impl.patch_materializer() | impl.patch_base()
    authority_changed = enforce_runtime_domain_authority()
    impl.validate_recovery()
    impl.validate_materializer()
    impl.validate_base()
    print(
        f"PROVIDER_SOURCE_PLAN_V10_OK changed={str(bool(changed or authority_changed)).lower()} "
        "proof_search_base=1 runtime_domain_replacements=explicit-only "
        "recipe_domain_rewrite=1 partial_recipe_fallback=1 season_scoring=1 "
        "navigation_noise_guard=1 domain_authority=v10.1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
