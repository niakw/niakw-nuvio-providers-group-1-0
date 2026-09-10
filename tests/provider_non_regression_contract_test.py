#!/usr/bin/env python3
"""Compatibility-aware entrypoint for the provider non-regression contract."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
impl_path = ROOT / "tests" / "provider_non_regression_contract_test_impl.py"
source = impl_path.read_text(encoding="utf-8")
old = 'finalizer = FINALIZER.read_text(encoding="utf-8")'
new = 'finalizer = FINALIZER.read_text(encoding="utf-8") + "\\n" + (ROOT / "scripts" / "finalize_provider_repair_disposition_v1_impl.py").read_text(encoding="utf-8")'
if source.count(old) != 1:
    raise AssertionError("provider non-regression finalizer compatibility anchor changed")
source = source.replace(old, new, 1)
exec(compile(source, str(impl_path), "exec"), globals(), globals())
