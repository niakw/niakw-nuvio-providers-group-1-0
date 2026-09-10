#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCH = ROOT / "scripts/provider_patches/global_media_type_resolution_v1.py"
spec = importlib.util.spec_from_file_location("media_type_abort_ignorant", PATCH)
assert spec is not None and spec.loader is not None
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

base = r'''
"use strict";
async function getStreams(tmdbId, mediaType) {
  try {
    await fetch("https://provider.example/" + tmdbId + "/one");
  } catch (_) {
    try { await fetch("https://provider.example/" + tmdbId + "/two"); } catch (_) {}
  }
  return [];
}
module.exports = { getStreams };
'''

# The canonical media owner is now V31: V30's unified cancellation budget plus
# the pre-network semantic gate. Keep this assertion explicit so cancellation is
# never tested against an older owner while avoiding a stale V30-only contract.
source = PATCH.read_text(encoding="utf-8")
for needle in (
    "tmdb-data-contract-launch-gate-v31-pre-network-semantic-gate",
    "function requestAbortPromise(controller,requestToken)",
    "Promise.race([base.apply(this,args),timeoutPromise,abortPromise])",
    "Promise.race([base.apply(this,args),abortPromise])",
    'if(type==="movie"&&!hasMovie&&!hasAnime)return null;',
    'if(type==="tv"&&!hasTv&&!hasAnime)return null;',
):
    assert needle in source, needle

patched = mod.apply(
    base,
    options={
        "semantic_types": ["movie"],
        "provider_timeout_ms": 10_000,
        "tv_provider_timeout_ms": 10_000,
        "supersede_settle_ms": 1_000,
    },
)

runner = r'''
const calls=[];
global.navigator={userAgent:"Nuvio Desktop macOS"};
global.fetch=(url,_init={})=>{
  const value=String(url);calls.push(value);
  if(value.includes("/1/one")) return new Promise(()=>{}); // host bridge ignores AbortSignal forever
  return Promise.resolve({ok:true,status:200,url:value,headers:{get:()=>"text/plain"},text:async()=>"ok",json:async()=>({})});
};
const provider=require(process.argv[2]);
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
(async()=>{
  const first=provider.getStreams("1","movie");
  await Promise.resolve();
  const started=Date.now();
  const second=provider.getStreams("2","movie");
  await Promise.race([
    Promise.all([first,second]),
    sleep(1500).then(()=>{throw new Error("superseded abort-ignorant native fetch did not settle")}),
  ]);
  const elapsed=Date.now()-started;
  if(elapsed>=1200)throw new Error("supersede settlement too slow: "+elapsed+"ms");
  if(calls.some(v=>v.includes("/1/two")))throw new Error("superseded request launched fallback fetch: "+JSON.stringify(calls));
  if(!calls.some(v=>v.includes("/1/one")))throw new Error("first request never started");
  if(!calls.some(v=>v.includes("/2/one")))throw new Error("new request did not run");
  if(global.__nuvioProviderRequestToken!=null)throw new Error("request token leaked after final invocation");
  console.log("abort-ignorant native fetch cancellation passed",elapsed,JSON.stringify(calls));
})().catch(e=>{console.error(e);process.exit(1)});
'''

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    provider = root / "provider.js"
    test = root / "test.js"
    provider.write_text(patched, encoding="utf-8")
    test.write_text(runner, encoding="utf-8")
    subprocess.run(["node", str(test), str(provider)], check=True, timeout=5)

print("provider native abort-ignorant cancellation contract passed on media fast-gate v31")
