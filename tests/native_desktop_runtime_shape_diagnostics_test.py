#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "augment_native_desktop_runtime_shape_diagnostics.py"

fixture = """class DesktopProbe {
    private fun trapRuntimeErrors(code: String): String = code
    private fun b64(value: Any?): String = ""
    fun execute() {
        val rows = PluginRepository.executeScraper(loadedScraper, tmdbId, requestMediaType, season, episode).getOrThrow()
    }
}
"""

with tempfile.TemporaryDirectory() as tmp:
    target = Path(tmp) / "DesktopProbe.kt"
    target.write_text(fixture, encoding="utf-8")
    proc = subprocess.run(
        ["python3", str(SCRIPT), "--source", str(target)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    generated = target.read_text(encoding="utf-8")

assert "NIAKVIO_NATIVE_RUNTIME_CONSOLE_CAPTURE_PRE" in generated
assert "NIAKVIO_NATIVE_RUNTIME_RESPONSE_SHAPE_V1" in generated
assert 'capture("fetch-json-shape"' in generated
assert '"kind=" + kind' in generated
assert '"rows=" + String(rows.length)' in generated
assert '"objectRows=" + String(objectRows)' in generated
assert '"httpUrlRows=" + String(httpUrlRows)' in generated
assert '"externalUrlRows=" + String(externalUrlRows)' in generated
assert 'capture("fetch-text-shape"' in generated
assert '"chars=" + String(length)' in generated

# The diagnostic may only emit structural facts, never response material.
injected = generated[generated.index("NIAKVIO_NATIVE_RUNTIME_RESPONSE_SHAPE_V1"):]
for forbidden in (
    "parsed.body",
    "JSON.stringify(value)",
    "row.url]",
    "row.url,",
    "row.externalUrl,",
    "Authorization",
    "Cookie",
    "Bearer ",
):
    assert forbidden not in injected, forbidden

# Idempotence is important because the generated corpus can be restaged repeatedly.
with tempfile.TemporaryDirectory() as tmp:
    target = Path(tmp) / "DesktopProbe.kt"
    target.write_text(fixture, encoding="utf-8")
    first = subprocess.run(["python3", str(SCRIPT), "--source", str(target)], cwd=ROOT, text=True, capture_output=True, timeout=20)
    assert first.returncode == 0, first.stdout + first.stderr
    second = subprocess.run(["python3", str(SCRIPT), "--source", str(target)], cwd=ROOT, text=True, capture_output=True, timeout=20)
    assert second.returncode == 0, second.stdout + second.stderr
    twice = target.read_text(encoding="utf-8")
    assert twice.count("NIAKVIO_NATIVE_RUNTIME_RESPONSE_SHAPE_V1") == 1

print("native Desktop runtime response-shape diagnostic contract passed")
