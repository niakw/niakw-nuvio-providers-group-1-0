#!/usr/bin/env python3
"""Every published provider must materialize the Core terminal stream sanitizer."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from apply_provider_overrides import apply_overrides  # noqa: E402

# Keep the historical legacy-guard removal contract too.
result = subprocess.run([sys.executable, str(ROOT / "tests/provider_capabilities_test.py")], check=False)
if result.returncode:
    raise SystemExit(result.returncode)

manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
rows = manifest.get("scrapers") or []
assert len(rows) == 96, f"expected complete 96-provider publication, got {len(rows)}"

missing = []
weak = []
for row in rows:
    provider_id = str(row.get("id") or "").strip()
    relative = str(row.get("filename") or "").strip()
    assert provider_id and relative.startswith("providers/"), row
    source = (ROOT / relative).read_bytes()
    patched, _records = apply_overrides(provider_id, source, phase="discovery")
    text = patched.decode("utf-8")
    sanitizer_start = "/* STARTFIX:CORE.STREAM_SANITIZER.V6 */"
    sanitizer_close = "/* CLOSEFIX:CORE.STREAM_SANITIZER.V6 */"
    if text.count(sanitizer_start) != 1 or text.count(sanitizer_close) != 1:
        missing.append(provider_id)
    if "/* START NIAKVIO_FIX:CORE.STREAM_SANITIZER.V6 */" in text:
        weak.append(provider_id)
    if "NUVIO_STREAM_OUTPUT_SANITIZER_ALL_URL_FAIL_CLOSED_V6" in text:
        weak.append(provider_id)
    branding = text.rfind("/* STARTFIX:CORE.PROVIDER_BRANDING.V1 */")
    sanitizer = text.rfind(sanitizer_start)
    if branding >= 0 and sanitizer <= branding:
        weak.append(provider_id)

    # V6 owns the terminal boundary. V7 deliberately keeps that exact managed
    # owner/fix id and strengthens one cleanup path so an exact proof-correlated
    # non-direct player fallback can survive without weakening probeAllUrls.
    compact = "".join(text.split())
    current_v6_hook = (
        "if(coreMediaProof(item.stream,item.url))returnclearCoreMediaProof(item.stream);"
        "if(!item.probe)returnconfig.probeAllUrls?null:clearCoreMediaProof(item.stream);"
    )
    legacy_v6_hook = "if(!item.probe)returnconfig.probeAllUrls?null:item.stream;"
    current_v7_hook = (
        "if(correlatedPlayerFallback(item.stream,item.url))returnclearPrivateProofs(item.stream);"
        "if(coreMediaProof(item.stream,item.url))returnclearPrivateProofs(item.stream);"
        "if(!item.probe)returnconfig.probeAllUrls?null:clearPrivateProofs(item.stream);"
    )
    supported_hook = current_v6_hook in compact or legacy_v6_hook in compact or current_v7_hook in compact
    if not supported_hook:
        weak.append(provider_id)
    if current_v7_hook in compact:
        for v7_required in (
            "NUVIO_STREAM_OUTPUT_CORRELATED_PLAYER_FALLBACK_V7",
            "functioncorrelatedPlayerFallback(stream,url)",
            "functionclearPrivateProofs(stream)",
            "delete stream.__nuvioCorrelatedPlayerFallbackV1",
        ):
            if "".join(v7_required.split()) not in compact:
                weak.append(provider_id)
    if '"probeAllUrls":true' not in compact:
        weak.append(provider_id)

assert not missing, f"providers missing terminal sanitizer V6: {missing}"
assert not weak, f"providers missing current V6/V7 fail-closed ownership/policy: {sorted(set(weak))}"
print(f"global stream output guard passed: providers={len(rows)} managed_terminal_sanitizer={len(rows)} startfix_v3=true fail_closed_v6=true v7_extension_accepted=true")
