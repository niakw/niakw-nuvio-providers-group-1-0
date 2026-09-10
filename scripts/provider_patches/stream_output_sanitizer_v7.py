#!/usr/bin/env python3
"""V7 terminal policy: preserve only exact proof-correlated non-direct player fallbacks.

The strict V6 all-URL boundary remains authoritative for direct media and ordinary
URLs. A V21.7 provider-value resolver may, however, deliberately hand an exact
live-correlated player/embed URL to the native player after server-side resolving
that player fails. Upstream providers use the same behavior. V7 recognizes only
that private exact-URL marker, requires a non-direct player-shaped URL, keeps the
row without a second destructive probe, and strips the private marker before the
row escapes the sanitizer.

Known application-shell media is rejected before any proof marker is considered.
A fixed browser/app fallback asset is not content merely because it is a playable
MP4. This does not whitelist or blacklist provider catalogues; it excludes exact
infrastructure fallback paths whose bytes are independent of the requested work.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
V6_PATH = ROOT / "stream_output_sanitizer_v6.py"
MANAGED_FIX_ID = "CORE.STREAM_SANITIZER.V6"
MARKER = "NUVIO_STREAM_OUTPUT_CORRELATED_PLAYER_FALLBACK_V7"

CHECK_V6 = (
    "if(coreMediaProof(item.stream,item.url))return clearCoreMediaProof(item.stream);"
    "if(!item.probe)return config.probeAllUrls?null:clearCoreMediaProof(item.stream);"
)
CHECK_V7 = (
    "if(genericAppShellMedia(item.url))return null;"
    "if(correlatedPlayerFallback(item.stream,item.url))return clearPrivateProofs(item.stream);"
    "if(coreMediaProof(item.stream,item.url))return clearPrivateProofs(item.stream);"
    "if(!item.probe)return config.probeAllUrls?null:clearPrivateProofs(item.stream);"
)
VERDICT_V6 = "return verdict===false?null:clearCoreMediaProof(item.stream);"
VERDICT_V7 = "return verdict===false?null:clearPrivateProofs(item.stream);"
HELPER_ANCHOR = "  function coreMediaProof(stream,url){\n"
HELPERS = r'''  /* NUVIO_STREAM_OUTPUT_CORRELATED_PLAYER_FALLBACK_V7 */
  function genericAppShellMedia(url){
    try{
      var parsed=new URL(String(url||""));
      var host=String(parsed.hostname||"").toLowerCase();
      var path=String(parsed.pathname||"").toLowerCase().replace(/\/+$/,"");
      if(host==="web.telegram.org"&&(path==="/a/nojs.mp4"||path==="/k/nojs.mp4"))return true;
    }catch(_e){}
    return false;
  }
  function correlatedPlayerFallback(stream,url){
    if(!stream||typeof stream!=="object"||isDirect(stream,url))return false;
    var proof=stream.__nuvioCorrelatedPlayerFallbackV1;
    if(!proof||typeof proof!=="object"||String(proof.url||"")!==String(url||""))return false;
    try{
      var parsed=new URL(String(url||"")),path=String(parsed.pathname||"").toLowerCase();
      if(/\/(?:embed|e|player|watch)(?:[-/]|$)/i.test(path))return true;
      if(/\/(?:shell|video|stream)(?:\.php|[/?#.-]|$)/i.test(path)){
        var keys=[];try{parsed.searchParams.forEach(function(_v,k){keys.push(String(k).toLowerCase())})}catch(_e){}
        return keys.some(function(k){return /^(?:videoid|video|vid|file|embed|player|stream|source)$/.test(k)});
      }
    }catch(_e){}
    return false;
  }
  function clearPrivateProofs(stream){
    if(stream&&typeof stream==="object"){
      try{delete stream.__nuvioCorrelatedPlayerFallbackV1}catch(_e){}
      try{delete stream.__nuvioCoreMediaProofV1}catch(_e){}
    }
    return stream;
  }
'''


def _load_v6_apply():
    spec = importlib.util.spec_from_file_location("stream_output_sanitizer_v6_for_v7", V6_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {V6_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.apply


V6_APPLY = _load_v6_apply()


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise ValueError(f"stream sanitizer v7 {label} count={count}")
    return text.replace(old, new, 1)


def apply(text: str, options: dict[str, Any] | None = None, **kwargs: Any) -> str:
    patched = V6_APPLY(text, options=options, **kwargs)
    if MARKER in patched:
        validate(patched)
        return patched
    patched = _replace_once(patched, HELPER_ANCHOR, HELPERS + HELPER_ANCHOR, "helper-anchor")
    patched = _replace_once(patched, CHECK_V6, CHECK_V7, "check-item")
    patched = _replace_once(patched, VERDICT_V6, VERDICT_V7, "verdict")
    validate(patched)
    return patched


def validate(text: str) -> None:
    if text.count(MARKER) != 1:
        raise ValueError(f"stream sanitizer v7 marker count={text.count(MARKER)}")
    for needle in (
        "function genericAppShellMedia(url)",
        'host===\"web.telegram.org\"',
        'path===\"/a/nojs.mp4\"',
        "function correlatedPlayerFallback(stream,url)",
        "function clearPrivateProofs(stream)",
        "String(proof.url||\"\")!==String(url||\"\")",
        "if(!stream||typeof stream!==\"object\"||isDirect(stream,url))return false;",
        "if(genericAppShellMedia(item.url))return null;",
        "if(correlatedPlayerFallback(item.stream,item.url))return clearPrivateProofs(item.stream);",
        "return verdict===false?null:clearPrivateProofs(item.stream);",
        "delete stream.__nuvioCorrelatedPlayerFallbackV1",
    ):
        if needle not in text:
            raise ValueError(f"stream sanitizer v7 missing {needle}")
    if CHECK_V6 in text or VERDICT_V6 in text:
        raise ValueError("stream sanitizer v7 left V6 output-cleanup hook")
    section = text.split(f"/* {MARKER} */", 1)[1].split("function coreMediaProof", 1)[0].casefold()
    for forbidden in ("animesama", "animevostfr", "jujutsu", "sibnet", "sendvid"):
        if forbidden in section:
            raise ValueError(f"stream sanitizer v7 provider-specific token leaked: {forbidden}")


if __name__ == "__main__":
    raise SystemExit("patch module; import apply()")
