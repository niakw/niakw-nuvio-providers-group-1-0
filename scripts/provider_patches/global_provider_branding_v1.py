#!/usr/bin/env python3
"""Shared final provider branding layer for reconstructed NiakVIO providers.

Provider artwork stays in native ``scraper.logo``. Until Nuvio exposes that logo
on local stream rows, one committed emoji per provider gives the textual stream
name/title a stable identity. This layer runs *after* Core stream presentation so
it never destroys provider-returned technical facts before they are normalized.

V8 restores the historical lossless client-visible label contract: Core may
normalize quality/facts, but provider/player labels already returned by the
provider remain visible in ``title``/``name``. STREAM_FACTS keeps the original
fields under ``source*`` before presentation mutates legacy UI fields; branding
projects those preserved values back into the final label without inventing any
metadata or duplicating quality already present in the source label. Placeholder
suffixes such as ``- Inconnue``/``- Unknown`` are stripped without discarding the
meaningful prefix. The established `` - <quality>`` suffix stays byte-for-byte
compatible when quality is not already present in the richer source label.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from provider_patch_blocks import has_managed_fix, replace_managed_fix, strip_managed_fix

MARKER = "NUVIO_GLOBAL_PROVIDER_BRANDING_V1"
MANAGED_FIX_ID = "CORE.PROVIDER_BRANDING.V1"
MANAGED_FIX_OPTIONAL = True
ROOT = Path(__file__).resolve().parents[2]
BRANDING = ROOT / "assets" / "providers" / "emojis.json"


def _load_provider(provider_id: str) -> dict[str, str] | None:
    payload = json.loads(BRANDING.read_text(encoding="utf-8"))
    if payload.get("policy") != "committed-provider-default-emoji":
        raise ValueError("provider emoji map must declare committed-provider-default-emoji policy")
    providers = payload.get("providers")
    if not isinstance(providers, dict):
        raise ValueError("provider emoji map providers must be an object")
    normalized_id = str(provider_id or "").strip().casefold()
    row = providers.get(normalized_id)
    if not isinstance(row, dict):
        return None
    name = str(row.get("name") or "").strip()
    emoji = str(row.get("emoji") or "").strip()
    if not name or not emoji:
        raise ValueError(f"provider emoji map row is incomplete: {provider_id}")
    return {"name": name, "emoji": emoji}


def _strip_existing(text: str) -> str:
    start = text.find(f"/* {MARKER}:")
    if start < 0:
        return text
    call = text.find('})(typeof globalThis!=="undefined"?globalThis:this,', start)
    end = text.find(");", call) if call >= 0 else -1
    if call < 0 or end < 0:
        raise ValueError("unterminated global provider branding wrapper")
    before = text[:start].rstrip()
    after = text[end + 2 :].lstrip()
    if before and after:
        return before + "\n" + after
    return before or after


def apply(text: str, options: dict[str, Any] | None = None, **kwargs: Any) -> str:
    context = kwargs.get("context") if isinstance(kwargs.get("context"), dict) else {}
    provider_id = str(context.get("provider_id") or "").strip().casefold()

    owned = has_managed_fix(text, MANAGED_FIX_ID)
    if not owned:
        text = _strip_existing(text)
    if not provider_id:
        return strip_managed_fix(text, MANAGED_FIX_ID) if owned else text
    row = _load_provider(provider_id)
    if row is None:
        return strip_managed_fix(text, MANAGED_FIX_ID) if owned else text
    payload = {
        "providerId": provider_id,
        "providerName": row["name"],
        "providerEmoji": row["emoji"],
        "implementationRevision": "post-presentation-lossless-source-label-v8",
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    marker = f"{MARKER}:{hashlib.sha256(serialized.encode('utf-8')).hexdigest()[:12]}"
    wrapper = r'''
/* MARKER_PLACEHOLDER */
;(function(g,c){"use strict";
function slot(v){if(Array.isArray(v))return{key:null,list:v};if(v&&typeof v==="object"){for(var i=0;i<3;i++){var k=["streams","results","data"][i];if(Array.isArray(v[k]))return{key:k,list:v[k]}}}return null}
function rebuild(v,x,list){if(x.key===null)return list;var o=Object.assign({},v);o[x.key]=list;return o}
function s(v){return String(v==null?"":v).replace(/\s+/g," ").trim()}
function label(){return(s(c.providerEmoji)+" "+s(c.providerName||c.providerId||"Source")).trim()}
function placeholder(v){return/^(?:unknown|inconnu(?:e)?|n\/?a|none|null|undefined|unknown\s+(?:quality|language)|qualit(?:e|é)\s+inconnue|langue\s+inconnue|-+)$/i.test(s(v))}
function cleanSource(v){var x=s(v);if(!x)return"";var m=x.match(/^(.*?)(?:\s*[-|•:]\s*)(unknown|inconnu(?:e)?|n\/?a|none|null|undefined|unknown\s+(?:quality|language)|qualit(?:e|é)\s+inconnue|langue\s+inconnue)$/i);if(m)x=s(m[1]);return placeholder(x)?"":x}
function norm(v){return s(v).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g,"")}
function qualityToken(v){v=s(v);var u=v.toUpperCase();if(/(?:\b4K\b|\b2160P?\b|\bUHD\b)/.test(u))return"4K";var m=u.match(/\b(1440|1080|720|576|540|480|360)P?\b/);return m?m[1]+"p":""}
function oldQuality(old){old=s(old);var token=" - ",i=old.lastIndexOf(token);if(i<0)return"";var suffix=s(old.slice(i+token.length));return suffix&&!placeholder(suffix)?qualityToken(suffix)||suffix:""}
function addUnique(out,value){value=cleanSource(value);if(!value)return;var n=norm(value);if(!n)return;for(var i=0;i<out.length;i++){var p=norm(out[i]);if(p===n||p.indexOf(n)>=0)return;if(n.indexOf(p)>=0){out[i]=value;return}}out.push(value)}
function sourceParts(r){var out=[];addUnique(out,r&&r.sourceName);addUnique(out,r&&r.sourceTitle);addUnique(out,r&&r.sourceLabel);addUnique(out,r&&r.server);addUnique(out,r&&r.hoster);addUnique(out,r&&r.player);addUnique(out,r&&r.indexer);addUnique(out,r&&r.network);return out}
function containsQuality(parts,q){q=qualityToken(q);if(!q)return false;var aliases=q==="4K"?["4k","2160p","uhd"]:[q.toLowerCase()];var all=(parts||[]).join(" ").toLowerCase();for(var i=0;i<aliases.length;i++)if(all.indexOf(aliases[i])>=0)return true;return false}
function visibleTitle(r,v,old){var parts=[v],sources=sourceParts(r);for(var i=0;i<sources.length;i++){var value=sources[i],n=norm(value),pn=norm(c.providerName),vl=norm(v);if(n&&n!==pn&&n!==vl)addUnique(parts,value)}var q=qualityToken(r&&r.quality)||oldQuality(old),base=parts.join(" • ");return q&&!containsQuality(parts,q)?base+" - "+q:base}
function brand(r){if(!r||typeof r!=="object")return r;var o=Object.assign({},r),v=label();if(!v)return o;var display=visibleTitle(o,v,o.title);o.title=display;o.name=display;return o}
function install(o,k){if(!o||typeof o[k]!=="function"||o[k].__nuvioGlobalProviderBrandingV1)return false;var native=o[k];var wrap=async function(){var v=await native.apply(this,arguments),x=slot(v);if(!x||!x.list.length)return v;return rebuild(v,x,x.list.map(brand))};wrap.__nuvioGlobalProviderBrandingV1=true;o[k]=wrap;return true}
var ok=false;try{if(typeof module!=="undefined"&&module.exports){ok=install(module.exports,"getStreams")||install(module.exports,"streams")}}catch(_e){}try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_e){}
})(typeof globalThis!=="undefined"?globalThis:this,CONFIG_PLACEHOLDER);
'''.replace("MARKER_PLACEHOLDER", marker).replace("CONFIG_PLACEHOLDER", serialized)
    return replace_managed_fix(
        text,
        MANAGED_FIX_ID,
        wrapper,
        data=payload,
    )
