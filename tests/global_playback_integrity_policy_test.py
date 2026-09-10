#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provider_patch_blocks import begin_marker, end_marker  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "apply_provider_overrides",
    ROOT / "scripts/apply_provider_overrides.py",
)
if not spec or not spec.loader:
    raise RuntimeError("cannot import apply_provider_overrides")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def clean_v3_fixture(source: bytes) -> bytes:
    if b"/* BEGIN NIAKVIO_PROVIDER */" in source:
        assert b"NIAKVIO_PROVIDER_BASE_OWNED_V3" in source
        return source
    return (
        b"/* BEGIN NIAKVIO_PROVIDER */\n"
        b"/* NIAKVIO_PROVIDER_BASE_OWNED_V3 */\n"
        + source.strip()
        + b"\n/* END NIAKVIO_PROVIDER */\n"
    )

cfg = json.loads((ROOT / "provider-overrides.json").read_text(encoding="utf-8"))
policy = cfg.get("playback_integrity_policy") or {}
assert policy.get("version") == 4
assert policy.get("enabled") is True
assert policy.get("provider_disabling_is_not_a_repair") is True
assert policy.get("global_discovery_hooks") == [
    "scripts/provider_patches/hls_runtime_integrity_v1.py",
    "scripts/provider_patches/global_provider_security_hardening_v1.py",
]
assert policy.get("pre_media_discovery_hooks") == []
assert policy.get("native_hls_probe_policy") == "skip_additional_integrity_network_probes_on_native_host_bridge"
assert policy.get("post_media_discovery_hooks") == [
    "scripts/provider_patches/hls_runtime_integrity_v1.py",
]

for provider_id, row in (cfg.get("provider_patches") or {}).items():
    if not isinstance(row, dict):
        continue
    scripts = row.get("patch_scripts") or []
    assert "scripts/provider_patches/hls_master_audio_preserver_v1.py" not in scripts, provider_id
    assert "scripts/provider_patches/hls_runtime_integrity_v1.py" not in scripts, provider_id
    assert "scripts/provider_patches/native_hls_integrity_budget_v1.py" not in scripts, provider_id
    assert "scripts/provider_patches/global_provider_security_hardening_v1.py" not in scripts, provider_id
    options = row.get("patch_script_options") or {}
    hls_options = options.get("scripts/provider_patches/hls_runtime_integrity_v1.py")
    if hls_options is not None:
        assert isinstance(hls_options, dict), provider_id

streamzo_hls_options = cfg["provider_patches"]["streamzo"]["core_options"]["hls_runtime_integrity"]
assert streamzo_hls_options["probe_all_urls"] is True
assert streamzo_hls_options["fail_closed_unknown"] is False

original_apply_patch_script = module._apply_patch_script
captured_scheduler_paths = []
def capture_scheduler(text, provider_id, patch_script, options, profile_name):
    captured_scheduler_paths.append(patch_script)
    return text
module._apply_patch_script = capture_scheduler
try:
    module.apply_overrides(
        "streamzo",
        clean_v3_fixture(b"globalThis.getStreams=async function(){return []};\n"),
        phase="discovery",
    )
finally:
    module._apply_patch_script = original_apply_patch_script
wanted = [
    path for path in captured_scheduler_paths
    if path in {
        "scripts/provider_patches/hls_runtime_integrity_v1.py",
        "scripts/provider_patches/global_media_enrichment_v1.py",
        "scripts/provider_patches/global_provider_security_hardening_v1.py",
        module.GLOBAL_STREAM_PRESENTATION,
    }
]
assert wanted == [
    "scripts/provider_patches/global_media_enrichment_v1.py",
    "scripts/provider_patches/hls_runtime_integrity_v1.py",
    "scripts/provider_patches/global_provider_security_hardening_v1.py",
    module.GLOBAL_STREAM_PRESENTATION,
], wanted

future = clean_v3_fixture(b'''\nasync function helper(t){let x=await fetch(t.url).then(r=>r.text());if(!/#EXT-X-STREAM-INF/i.test(x))return [{url:t.url,type:"hls"}];return []}\nglobalThis.getStreams=async function(){return [{url:"https://media.example/master.m3u8",type:"hls"}]};\n''')
patched, records = module.apply_overrides("future-provider-never-seen-before", future, phase="discovery")
text = patched.decode("utf-8")
assert "NUVIO_HLS_RUNTIME_INTEGRITY_V1" in text
assert "NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1" in text
assert "NUVIO_GLOBAL_STREAM_PRESENTATION_V1" in text
assert text.rfind("NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1") > text.rfind("NUVIO_HLS_RUNTIME_INTEGRITY_V1")
assert text.rfind("NUVIO_GLOBAL_STREAM_PRESENTATION_V1") > text.rfind("NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1")
paths = {str(row.get("path")) for row in records if isinstance(row, dict)}
assert "scripts/provider_patches/hls_runtime_integrity_v1.py" in paths
assert "scripts/provider_patches/global_provider_security_hardening_v1.py" in paths
assert "NUVIO_NATIVE_HLS_INTEGRITY_BUDGET_V1" not in text
assert "NUVIO_HLS_MASTER_AUDIO_PRESERVER_V1" not in text
assert any(row.get("scope") == "global_playback_integrity" for row in records if isinstance(row, dict))

reapplied, reapplied_records = module.apply_overrides(
    "future-provider-never-seen-before", patched, phase="discovery"
)
if reapplied != patched:
    left = patched.decode("utf-8", errors="replace")
    right = reapplied.decode("utf-8", errors="replace")
    limit = min(len(left), len(right))
    first = next((i for i in range(limit) if left[i] != right[i]), limit)
    window_start = max(0, first - 180)
    window_end = first + 360
    raise AssertionError(
        "Core discovery transform not byte-idempotent: "
        f"first_diff={first} len1={len(left)} len2={len(right)} "
        f"sha1={hashlib.sha256(patched).hexdigest()} "
        f"sha2={hashlib.sha256(reapplied).hexdigest()}\n"
        f"FIRST={left[window_start:window_end]!r}\n"
        f"SECOND={right[window_start:window_end]!r}"
    )
reapplied_text = reapplied.decode("utf-8")
assert reapplied_text.count("NUVIO_GLOBAL_STREAM_PRESENTATION_V1") == 1
assert reapplied_text.count("NUVIO_GLOBAL_RUNTIME_MEDIA_SAFETY_V1") == 1
assert '"implementationRevision":"field-safety-v8-media-only-p2p-vod-duration"' in reapplied_text
assert '"implementationRevision":"field-safety-v7-stream-scoped-p2p-vod-duration"' not in reapplied_text
assert '"implementationRevision":"field-safety-v6-core-repair-types"' not in reapplied_text
assert '"implementationRevision":"scoped-playback-context-v4"' not in reapplied_text
assert reapplied_text.count(begin_marker("CORE.HLS_RUNTIME_INTEGRITY.V1")) == 1
assert reapplied_text.count(end_marker("CORE.HLS_RUNTIME_INTEGRITY.V1")) == 1
assert reapplied_text.count("NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1") == 1
assert reapplied_text.rfind("NUVIO_HLS_RUNTIME_INTEGRITY_V1") < reapplied_text.rfind("NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1")
assert reapplied_text.rfind("NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1") < reapplied_text.rfind("NUVIO_GLOBAL_STREAM_FACTS_V1")
assert reapplied_text.rfind("NUVIO_GLOBAL_STREAM_FACTS_V1") < reapplied_text.rfind("NUVIO_GLOBAL_STREAM_IDENTITY_V1")
assert reapplied_text.rfind("NUVIO_GLOBAL_STREAM_IDENTITY_V1") < reapplied_text.rfind("NUVIO_GLOBAL_STREAM_PRESENTATION_V1")
assert not any(
    row.get("type") == "replace"
    for row in reapplied_records
    if isinstance(row, dict)
)

runtime, runtime_records = module.apply_overrides("future-provider-never-seen-before", future, phase="runtime")
assert b"NUVIO_HLS_RUNTIME_INTEGRITY_V1" not in runtime
assert b"NUVIO_GLOBAL_PROVIDER_SECURITY_HOOK_V1" not in runtime
assert b"NUVIO_GLOBAL_STREAM_PRESENTATION_V1" not in runtime
assert not any(row.get("scope") == "global_playback_integrity" for row in runtime_records if isinstance(row, dict))

health_cfg = json.loads((ROOT / "health-config.json").read_text(encoding="utf-8"))
for mode in ("availability", "retry", "deep"):
    assert health_cfg["modes"][mode]["probe_best_variant"] is True, mode
    assert health_cfg["modes"][mode]["probe_first_segment"] is True, mode

health_source = (ROOT / "scripts/health_check.mjs").read_text(encoding="utf-8")
for marker in (
    "const structurallyPlayable = variants.length > 0",
    "audioTracks.push({",
    "audio_manifest_reachable",
    "audio_segment_reachable",
    "master.audioTracks.length ? audioSegmentReachable === true",
):
    assert marker in health_source, marker

print("global playback integrity + final stream presentation/security policy tests passed")