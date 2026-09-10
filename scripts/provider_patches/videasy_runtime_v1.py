#!/usr/bin/env python3
"""VidEasy clean-v3 Wings runtime Lego."""
from __future__ import annotations
from typing import Any
from provider_patch_blocks import replace_managed_fix
from provider_wings_runtime_common import render_wings_runtime

MANAGED_FIX_ID = "PROVIDER.VIDEASY.WINGS.V1"
MARKER = "NIAKVIO_VIDEASY_WINGS_V1"

DEFAULT_ENDPOINTS=[
 {"label":"Hydrogen","path":"cdn/sources-with-title"},
 {"label":"Titanium","path":"tejo/sources-with-title"},
 {"label":"Oxygen","path":"neon2/sources-with-title"},
 {"label":"Lithium","path":"downloader2/sources-with-title"},
 {"label":"Krypton","path":"ym/sources-with-title"},
 {"label":"Carbon","path":"mb-flix/sources-with-title"},
 {"label":"Aluminium","path":"lamovie/sources-with-title"},
 {"label":"Neon","path":"superflix/sources-with-title"},
 {"label":"Helium","path":"1movies/sources-with-title"},
]

def apply(text: str, options: dict[str, Any] | None = None, **_kwargs: Any) -> str:
    cfg=dict(options or {})
    runtime={
      "apiBase":str(cfg.get("api_base") or "https://api.speedracelight.com"),
      "origin":str(cfg.get("origin") or "https://www.vidking.net"),
      "referer":str(cfg.get("referer") or "https://www.vidking.net/"),
      "userAgent":str(cfg.get("user_agent") or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
      "providerId":"videasy","providerName":"VidEasy","installMarker":"__niakvioVidEasyWingsV1",
      "endpoints":list(cfg.get("endpoints") or DEFAULT_ENDPOINTS)
    }
    return replace_managed_fix(text,MANAGED_FIX_ID,render_wings_runtime(marker=MARKER,config=runtime),data={"runtime":runtime,"family":"wings-v1","identity":"core-tmdb-title-year","legacyExecutableSeed":False})
if __name__ == "__main__": raise SystemExit("patch module only")
