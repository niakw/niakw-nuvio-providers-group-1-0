#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
PATCH = ROOT / "scripts" / "provider_patches" / "global_media_type_resolution_v1.py"
spec = importlib.util.spec_from_file_location("global_media_type_resolution_v1", PATCH)
assert spec is not None and spec.loader is not None
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

BASE = '''
"use strict";
async function getStreams(tmdbId, mediaType, season, episode) {
  globalThis.__providerCalls = (globalThis.__providerCalls || 0) + 1;
  return [{tmdbId, mediaType, season, episode}];
}
module.exports = { getStreams };
'''


def run_case(source: str, runner: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        provider = tmp_path / "provider.cjs"
        test = tmp_path / "test.cjs"
        provider.write_text(source, encoding="utf-8")
        test.write_text(
            "global.TMDB_API_KEY='0123456789abcdef0123456789abcdef';\n" + runner,
            encoding="utf-8",
        )
        result = subprocess.run(["node", str(test), str(provider)], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr


def assert_pre_network_reject(semantic_types: list[str], media_type: str, label: str) -> None:
    patched = mod.apply(BASE, options={"semantic_types": semantic_types})
    run_case(
        patched,
        f'''
let fetchCalls=0;
global.__providerCalls=0;
global.fetch=async()=>{{fetchCalls++;throw new Error('network forbidden before semantic gate')}};
const provider=require(process.argv[2]);
(async()=>{{
  const value=await provider.getStreams('1396','{media_type}',1,1);
  if(!Array.isArray(value)||value.length!==0)throw new Error('{label}: mismatch must return []');
  if(global.__providerCalls!==0)throw new Error('{label}: provider executed before semantic reject: '+global.__providerCalls);
  if(fetchCalls!==0)throw new Error('{label}: TMDB/provider network touched before semantic reject: '+fetchCalls);
}})().catch(e=>{{console.error(e);process.exit(1)}});
''',
    )


# Transport mismatch is conclusive from the provider DATA contract and must be
# rejected before provider/TMDB network. This is the fast-gate regression that
# previously allowed semantic.length===1 to rewrite movie <-> tv.
assert_pre_network_reject(["tv"], "movie", "tv-only on movie")
assert_pre_network_reject(["movie"], "series", "movie-only on tv")

# Anime is a semantic class carried over movie/tv transport. An explicit anime
# client request must never be sent to a non-anime provider such as Castle.
assert_pre_network_reject(["tv"], "anime", "tv-only on explicit anime")
assert_pre_network_reject(["movie", "tv"], "anime", "movie-tv provider on explicit anime")

# But a semantic-anime provider must still be allowed to provisionally accept a
# movie transport because an anime work may genuinely live in TMDB movie space.
anime_only = mod.apply(BASE, options={"semantic_types": ["anime"]})
run_case(anime_only, '''
let fetchCalls=0;
global.__providerCalls=0;
global.fetch=async(url)=>{
  fetchCalls++;
  if(!String(url).includes('/movie/129?'))throw new Error('expected TMDB movie verification');
  return {ok:true,status:200,json:async()=>({
    id:129,genres:[{id:16,name:'Animation'}],original_language:'ja',
    production_countries:[{iso_3166_1:'JP'}],keywords:{keywords:[{name:'anime'}]}
  })};
};
const provider=require(process.argv[2]);
(async()=>{
  const value=await provider.getStreams('129','movie',null,null);
  if(!Array.isArray(value)||!value.length)throw new Error('anime movie transport was incorrectly pre-rejected');
  if(global.__providerCalls<1)throw new Error('anime provider did not execute');
  if(fetchCalls!==1)throw new Error('anime movie must be verified exactly once: '+fetchCalls);
})().catch(e=>{console.error(e);process.exit(1)});
''')

print('global media fast gate passed: movie<->tv and explicit anime mismatches reject before provider/TMDB network')
