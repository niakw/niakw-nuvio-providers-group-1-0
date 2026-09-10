#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provider_patches import global_provider_branding_v1  # noqa: E402

NODE = shutil.which("node")
if not NODE:
    raise SystemExit("node is required for global provider branding contract test")

source = r'''
module.exports={
  getStreams:async function(){return [
    {title:"Purstream - Inconnu",name:"legacy"},
    {title:"Purstream - Unknown",name:"legacy"},
    {title:"Purstream - Qualité inconnue",name:"legacy"},
    {title:"Purstream - Unknown quality",name:"legacy"},
    {title:"Purstream - 1080p",name:"legacy"},
    {title:"Purstream - FR",name:"legacy"},
    {title:"Purstream - VOSTFR",name:"legacy"},
    {title:"Purstream",name:"legacy"},
    {name:"legacy"}
  ]}
};
'''.lstrip()

patched = global_provider_branding_v1.apply(
    source,
    context={"provider_id": "purstream"},
)
reapplied = global_provider_branding_v1.apply(
    patched,
    context={"provider_id": "purstream"},
)
assert reapplied == patched, "global provider branding must be byte-idempotent"
assert "post-presentation-lossless-source-label-v8" in patched
assert patched.count("/* STARTFIX:CORE.PROVIDER_BRANDING.V1 */") == 1
assert patched.count("/* CLOSEFIX:CORE.PROVIDER_BRANDING.V1 */") == 1

program = patched + r'''
module.exports.getStreams().then(function(v){process.stdout.write(JSON.stringify(v));});
'''
result = subprocess.run(
    [NODE, "-e", program],
    check=True,
    text=True,
    capture_output=True,
)
rows = json.loads(result.stdout)
labels = [row["title"] for row in rows]
provider = "💧 Purstream"
expected = [
    provider,
    provider,
    provider,
    provider,
    provider + " - 1080p",
    provider + " - FR",
    provider + " - VOSTFR",
    provider,
    provider,
]
assert labels == expected, (labels, expected)
assert all(row["name"] == row["title"] for row in rows)
assert not any("Inconnu" in value or "Unknown" in value for value in labels)

print("global provider branding placeholder-suffix contract passed")
