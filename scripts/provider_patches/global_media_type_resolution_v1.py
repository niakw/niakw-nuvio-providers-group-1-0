#!/usr/bin/env python3
"""Core-wide contextual media-type resolver.

Nuvio client aliases (series/show/other) mean TV by default. A trusted anime
identity, including TMDB metadata, may refine that TV-shaped request to anime
before any provider-specific resolver sees it.

TMDB API metadata is authoritative when available. Core owns one dynamic
metadata capability backed by request context/cache or a credential explicitly
supplied by the host runtime/CI. The native fetch bridge is transport only and is
never treated as TMDB authentication. Provider bundles never embed, receive,
recover or decrypt a TMDB credential.

A conclusive TMDB classification still enforces provider semantic capabilities.
Only infrastructure failure (timeout/network/auth/rate-limit/5xx/unparseable
response) degrades to a fail-open transport/semantic fallback so one metadata
outage cannot suppress the entire provider catalogue. No public HTML scraping is
used as a classification substitute.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
from provider_patch_blocks import has_managed_fix, replace_managed_fix

MARKER = "NUVIO_GLOBAL_MEDIA_TYPE_RESOLUTION_V1"
MANAGED_FIX_ID = "CORE.MEDIA_TYPE_RESOLUTION.V1"
ROOT = Path(__file__).resolve().parents[2]
def _strip_existing(text: str) -> str:
    old = text.find(f"/* {MARKER}:")
    if old < 0:
        return text
    call = text.find('})(typeof globalThis!=="undefined"?globalThis:this,', old)
    end = text.find(");", call) if call >= 0 else -1
    if call < 0 or end < 0:
        raise ValueError("unterminated global media type resolution wrapper")
    before = text[:old].rstrip()
    after = text[end + 2 :].lstrip()
    if before and after:
        return before + "\n" + after
    return before or after


def apply(text: str, options: dict[str, Any] | None = None, **_kwargs: Any) -> str:
    cfg = dict(options or {})
    semantic_types = []
    for value in cfg.get("semantic_types") or []:
        item = str(value).strip().lower()
        if item in {"movie", "tv", "anime"} and item not in semantic_types:
            semantic_types.append(item)
    payload = {
        "timeoutMs": max(900, min(int(cfg.get("timeout_ms", 1800)), 5000)),
        "providerTimeoutMs": max(5_000, min(int(cfg.get("provider_timeout_ms", 60_000)), 120_000)),
        "tvProviderTimeoutMs": max(5_000, min(int(cfg.get("tv_provider_timeout_ms", 60_000)), 120_000)),
        "supersedeSettleMs": max(100, min(int(cfg.get("supersede_settle_ms", 1200)), 3000)),
        "semanticTypes": semantic_types,
        "requestTypeAliases": {
            str(key).strip().lower(): str(value).strip().lower()
            for key, value in (cfg.get("request_type_aliases") or {}).items()
            if str(key).strip() and str(value).strip()
        },
        "revision": "tmdb-data-contract-launch-gate-v31-pre-network-semantic-gate",
    }
    serialized = json.dumps(payload, separators=(",", ":"))
    marker = f"{MARKER}:{hashlib.sha256(serialized.encode()).hexdigest()[:12]}"
    # Existing managed ownership is updated in place. Legacy stripping is only
    # a one-time migration for pre-START/END bundles.
    if not has_managed_fix(text, MANAGED_FIX_ID):
        text = _strip_existing(text)

    js = r'''
/* MARKER_PLACEHOLDER */
/* NUVIO_GLOBAL_PROVIDER_EXECUTION_BUDGET_V1 */
;(function(g,c){"use strict";
function s(v){return String(v==null?"":v).trim()}
function normalizeKey(v){var x=s(v);if(x.length===33&&x.charCodeAt(0)===92&&/^[0-9a-fA-F]{32}$/.test(x.slice(1)))x=x.slice(1);return /^[0-9a-fA-F]{32}$/.test(x)?x:""}
function alias(v){var x=s(v||"movie").toLowerCase();if(x==="series"||x==="show"||x==="other")return"tv";if(x==="anime")return"anime";if(x==="movie")return"movie";return"tv"}
function namespaceOf(v){var x=alias(v);return x==="movie"?"movie":"tv"}
function sourceIdentity(v){
  var raw=s(v),x=raw,kind="unknown";
  x=x.replace(/^https?:\/\/(?:www\.)?imdb\.com\/title\//i,"");
  var prefix=/^(tmdb|imdb|movie|tv|series)[:/]/i.exec(x);
  if(prefix){kind=prefix[1].toLowerCase()==="imdb"?"imdb":"tmdb";x=x.slice(prefix[0].length)}
  x=x.split(/[\/?#]/)[0];
  var episodic=/^(tt\d+|\d+):\d+:\d+$/i.exec(x);if(episodic)x=episodic[1];
  if(/^tt\d+$/i.test(x)){kind="imdb";x=x.toLowerCase()}
  else if(/^\d+$/.test(x))kind="tmdb";
  return{raw:raw,id:x,kind:kind};
}
function metadataImdb(m){
  if(!m||typeof m!=="object")return"";
  var x=s(m.imdb_id||m.imdbId||(m.external_ids&&m.external_ids.imdb_id)||"").toLowerCase();
  return /^tt\d+$/.test(x)?x:"";
}
function providerTransport(canonical,namespace){
  var map=c.requestTypeAliases&&typeof c.requestTypeAliases==="object"?c.requestTypeAliases:{};
  var mapped=s(map[canonical]).toLowerCase();
  if(mapped==="tmdb_namespace")return namespace==="movie"?"movie":"tv";
  if(mapped)return alias(mapped);
  // Anime is semantic, not a TMDB namespace. Once authoritative metadata has
  // classified the work as anime, preserve its real TV/movie namespace for the
  // provider API. The semantic capability gate still rejects non-anime works.
  if(canonical==="anime")return namespace==="movie"?"movie":"tv";
  return canonical==="movie"?"movie":"tv";
}
function namespaceCandidates(v,season,episode){
  // Client media type is only a lookup hint. Never let it remove the alternate
  // TMDB namespace before canonical identity has been established.
  if(season!=null||episode!=null)return["tv","movie"];
  var hint=alias(v);
  if(hint==="movie")return["movie","tv"];
  return["tv","movie"];
}
function rows(v){return Array.isArray(v)?v:[]}
function keywordRows(m){var k=m&&m.keywords;return rows(k&&((k.results||k.keywords)||k))}
function animeMeta(m){
  if(!m||typeof m!=="object")return false;
  var explicit=s(m.canonicalMediaType||m.canonical_media_type||m.category).toLowerCase();
  if(explicit==="anime")return true;
  var keywords=keywordRows(m).map(function(x){return s(x&&x.name).toLowerCase()});
  if(keywords.indexOf("anime")>=0)return true;
  var genres=rows(m.genres),ids=rows(m.genre_ids||m.genreIds).map(Number);
  for(var i=0;i<genres.length;i++){if(Number(genres[i]&&genres[i].id)===16)ids.push(16)}
  var animation=ids.indexOf(16)>=0||genres.some(function(x){return s(x&&x.name).toLowerCase()==="animation"});
  var lang=s(m.original_language||m.originalLanguage).toLowerCase();
  var countries=rows(m.origin_country||m.originCountry).map(function(x){return s(x).toUpperCase()});
  var prod=rows(m.production_countries||m.productionCountries).map(function(x){return s(x&&x.iso_3166_1).toUpperCase()});
  var japanese=lang==="ja"||countries.indexOf("JP")>=0||prod.indexOf("JP")>=0;
  return animation&&japanese;
}
function timeout(){try{return typeof AbortSignal!=="undefined"&&AbortSignal.timeout?AbortSignal.timeout(c.timeoutMs):undefined}catch(_){return undefined}}
function localKey(){
  var key="";
  try{key=normalizeKey(g&&g.TMDB_API_KEY);if(key)return key}catch(_){}
  try{if(typeof TMDB_API_KEY!=="undefined"){key=normalizeKey(TMDB_API_KEY);if(key)return key}}catch(_){}
  return"";
}
function localToken(){
  try{if(g&&s(g.TMDB_ACCESS_TOKEN))return s(g.TMDB_ACCESS_TOKEN)}catch(_){}
  try{if(typeof TMDB_ACCESS_TOKEN!=="undefined"&&s(TMDB_ACCESS_TOKEN))return s(TMDB_ACCESS_TOKEN)}catch(_){}
  return "";
}
var coreCredentialKey=localKey(),coreCredentialToken=localToken();
var mediaCache=Object.create(null);
try{if(g)g.__nuvioTmdbMetadataCacheV1=mediaCache}catch(_){}
function hasTmdbMetadata(m){
  return !!(m&&typeof m==="object"&&(
    Array.isArray(m.genres)||Array.isArray(m.genre_ids)||Array.isArray(m.genreIds)||
    m.original_language||m.originalLanguage||m.origin_country||m.originCountry||
    m.production_countries||m.productionCountries||m.keywords
  ));
}
async function apiJson(url){
  var key=coreCredentialKey,token=coreCredentialToken;
  if(!g||typeof g.fetch!=="function"||(!key&&!token))return{state:"unavailable",value:null};
  try{
    if(key)url+=(url.indexOf("?")>=0?"&":"?")+"api_key="+encodeURIComponent(key);
    var h={Accept:"application/json"};if(token)h.Authorization="Bearer "+token;
    var api=await g.fetch(url,{headers:h,redirect:"follow",signal:timeout()});
    if(!api)return{state:"unavailable",value:null};
    if(api.status===404)return{state:"not_found",value:null};
    if(!api.ok||typeof api.json!=="function")return{state:"unavailable",value:null};
    var value=await api.json();
    if(!value||typeof value!=="object")return{state:"unavailable",value:null};
    return{state:"ok",value:value};
  }catch(_){return{state:"unavailable",value:null}}
}
async function findTmdb(imdbId,candidates){
  var imdb=s(imdbId).replace(/^imdb:/i,"").toLowerCase(),cacheKey="find:"+imdb;
  if(!/^tt\d+$/.test(imdb))return{state:"not_found",tmdbId:"",namespace:"",metadata:null,imdbId:""};
  if(Object.prototype.hasOwnProperty.call(mediaCache,cacheKey))return await mediaCache[cacheKey];
  var pending=(async function(){
    var probe=await apiJson("https://api.themoviedb.org/3/find/"+encodeURIComponent(imdb)+"?external_source=imdb_id");
    if(!probe||probe.state!=="ok")return{state:probe&&probe.state||"unavailable",tmdbId:"",namespace:"",metadata:null,imdbId:imdb};
    for(var i=0;i<candidates.length;i++){
      var namespace=candidates[i]==="movie"?"movie":"tv";
      var list=namespace==="movie"?rows(probe.value.movie_results):rows(probe.value.tv_results);
      for(var j=0;j<list.length;j++){
        var row=list[j],id=s(row&&row.id);
        if(/^\d+$/.test(id))return{state:"ok",tmdbId:id,namespace:namespace,metadata:row,imdbId:imdb};
      }
    }
    return{state:"not_found",tmdbId:"",namespace:"",metadata:null,imdbId:imdb};
  })();
  mediaCache[cacheKey]=pending;
  var value=await pending;
  if(value&&value.state==="unavailable")delete mediaCache[cacheKey];else mediaCache[cacheKey]=value;
  return value;
}
async function tmdb(namespaceValue,tmdbId){
  var namespace=namespaceValue==="movie"?"movie":"tv",id=s(tmdbId),cacheKey=namespace+":"+id;
  if(!/^\d+$/.test(id))return{state:"unavailable",metadata:null};
  if(Object.prototype.hasOwnProperty.call(mediaCache,cacheKey))return await mediaCache[cacheKey];
  var pending=(async function(){
    var append=namespace==="movie"?"keywords,alternative_titles,external_ids,release_dates":"keywords,alternative_titles,external_ids,content_ratings";
    var probe=await apiJson("https://api.themoviedb.org/3/"+namespace+"/"+encodeURIComponent(id)+"?append_to_response="+encodeURIComponent(append)+"&language=fr-FR");
    if(!probe||probe.state!=="ok")return{state:probe&&probe.state||"unavailable",metadata:null};
    var value=probe.value;
    if(Number(value.id||0)<=0)return{state:"unavailable",metadata:null};
    value.__nuvioTmdbNamespace=namespace;
    value.__nuvioTmdbId=id;
    return{state:"ok",metadata:value};
  })();
  mediaCache[cacheKey]=pending;
  var value=await pending;
  if(value&&value.state==="unavailable")delete mediaCache[cacheKey];else mediaCache[cacheKey]=value;
  return value;
}
async function coreGetTmdbData(request){
  var q=request&&typeof request==="object"&&!Array.isArray(request)?request:{};
  var source=sourceIdentity(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id),id="",imdbId="";
  var explicit=s(q.tmdbNamespace||q.namespace).toLowerCase();
  var candidates=explicit==="movie"||explicit==="tv"?[explicit]:namespaceCandidates(q.mediaType||q.type,q.season,q.episode);
  if(source.kind==="imdb"){
    imdbId=source.id;
    var found=await findTmdb(imdbId,candidates);
    if(!found||found.state!=="ok"||!/^\d+$/.test(s(found.tmdbId)))return{state:found&&found.state||"unavailable",tmdbId:"",imdbId:imdbId,tmdbNamespace:"",metadata:null,episodeMetadata:null};
    id=s(found.tmdbId);candidates=[found.namespace];
  }else if(source.kind==="tmdb")id=source.id;
  else return{state:"not_found",tmdbId:"",imdbId:"",tmdbNamespace:"",metadata:null,episodeMetadata:null};
  var unavailable=false;
  for(var i=0;i<candidates.length;i++){
    var namespace=candidates[i]==="movie"?"movie":"tv";
    var probe=await tmdb(namespace,id);
    if(!probe||probe.state==="unavailable"){unavailable=true;continue}
    if(probe.state!=="ok"||!probe.metadata)continue;
    imdbId=imdbId||metadataImdb(probe.metadata);
    var episodeMetadata=null;
    var season=Number(q.season||0)||0,episode=Number(q.episode||0)||0;
    if(namespace==="tv"&&season>0&&episode>0){
      var episodeKey="episode:tv:"+id+":"+season+":"+episode+":fr-FR";
      if(Object.prototype.hasOwnProperty.call(mediaCache,episodeKey)){
        var cachedEpisode=await mediaCache[episodeKey];
        episodeMetadata=cachedEpisode&&cachedEpisode.metadata?cachedEpisode.metadata:cachedEpisode&&cachedEpisode.value?cachedEpisode.value:cachedEpisode||null;
      }else{
        var pendingEpisode=(async function(){
          var row=await apiJson("https://api.themoviedb.org/3/tv/"+encodeURIComponent(id)+"/season/"+encodeURIComponent(season)+"/episode/"+encodeURIComponent(episode)+"?language=fr-FR");
          if(!row||row.state!=="ok")return{state:row&&row.state||"unavailable",metadata:null};
          return{state:"ok",metadata:row.value};
        })();
        mediaCache[episodeKey]=pendingEpisode;
        var episodeResult=await pendingEpisode;
        if(episodeResult&&episodeResult.state==="unavailable")delete mediaCache[episodeKey];else mediaCache[episodeKey]=episodeResult;
        episodeMetadata=episodeResult&&episodeResult.metadata||null;
      }
    }
    return{state:"ok",tmdbId:id,imdbId:imdbId,tmdbNamespace:namespace,metadata:probe.metadata,episodeMetadata:episodeMetadata};
  }
  return{state:unavailable?"unavailable":"not_found",tmdbId:id,imdbId:imdbId,tmdbNamespace:"",metadata:null,episodeMetadata:null};
}
try{if(g)g.__nuvioCoreGetTmdbDataV1=coreGetTmdbData}catch(_){}
function fallbackType(input,semantic){
  var raw=s(input||"movie").toLowerCase(),transport=alias(input);
  if(raw==="anime")return"anime";
  if(transport==="tv"&&semantic.indexOf("tv")<0&&semantic.indexOf("anime")>=0)return"anime";
  if(raw==="movie"&&semantic.indexOf("movie")<0&&semantic.indexOf("anime")>=0)return"anime";
  return transport;
}
async function canonicalResolution(id,input,metadata,season,episode,semantic){
  var candidates=namespaceCandidates(input,season,episode);
  var source=sourceIdentity(id),rawId=source.id,tmdbId=source.kind==="tmdb"?source.id:"",imdbId=source.kind==="imdb"?source.id:"",seedMetadata=null;
  if(imdbId){
    var found=await findTmdb(imdbId,candidates);
    if(found&&found.state==="ok"){
      tmdbId=found.tmdbId;
      candidates=[found.namespace];
      seedMetadata=found.metadata||null;
    }else if(found&&found.state==="unavailable"){
      var degradedType=fallbackType(input,semantic),degradedNamespace=namespaceOf(input);
      return{type:degradedType,namespace:degradedNamespace,tmdbId:"",imdbId:imdbId,metadata:null,authoritative:false,degraded:true};
    }else return null;
  }
  if(hasTmdbMetadata(metadata)){
    var declared=s(metadata&&metadata.__nuvioTmdbNamespace).toLowerCase();
    var namespace=declared==="movie"?"movie":declared==="tv"?"tv":candidates[0];
    var declaredId=s(metadata&&metadata.__nuvioTmdbId||metadata&&metadata.id);
    if(/^\d+$/.test(declaredId))tmdbId=declaredId;
    imdbId=imdbId||metadataImdb(metadata);
    var type=animeMeta(metadata)?"anime":namespace;
    return{type:type,namespace:namespace,tmdbId:/^\d+$/.test(tmdbId)?tmdbId:"",imdbId:imdbId,metadata:metadata,authoritative:true,degraded:false};
  }
  var unavailable=false;
  for(var i=0;i<candidates.length;i++){
    var namespace=candidates[i],probe=await tmdb(namespace,tmdbId);
    if(!probe||probe.state==="unavailable"){unavailable=true;continue}
    if(probe.state==="not_found")continue;
    var m=probe.metadata;imdbId=imdbId||metadataImdb(m);var type=animeMeta(m)?"anime":namespace;
    return{type:type,namespace:namespace,tmdbId:tmdbId,imdbId:imdbId,metadata:m,authoritative:true,degraded:false};
  }
  if(unavailable&&seedMetadata){
    var seedNamespace=candidates[0]||namespaceOf(input),seedType=animeMeta(seedMetadata)?"anime":seedNamespace;
    seedMetadata.__nuvioTmdbNamespace=seedNamespace;
    seedMetadata.__nuvioTmdbId=tmdbId;
    return{type:seedType,namespace:seedNamespace,tmdbId:tmdbId,imdbId:imdbId,metadata:seedMetadata,authoritative:true,degraded:true};
  }
  if(unavailable){
    var fallback=fallbackType(input,semantic),fallbackNamespace=namespaceOf(input);
    return{type:fallback,namespace:fallbackNamespace,tmdbId:/^\d+$/.test(tmdbId)?tmdbId:"",imdbId:imdbId,metadata:null,authoritative:false,degraded:true};
  }
  return null;
}
function objectRequest(a){return a&&typeof a==="object"&&!Array.isArray(a)}
function provisional(a){
  var first=a[0],obj=objectRequest(first),q=obj?Object.assign({},first):null;
  var input=obj?s(q.mediaType||q.type||q.category||"movie"):s(a[1]||"movie");
  var raw=s(input).toLowerCase(),namespace=namespaceOf(input);
  var semantic=rows(c.semanticTypes).map(function(x){return s(x).toLowerCase()});
  var type=raw==="anime"?"anime":namespace;
  // Native Nuvio bridges may expose only a non-abortable host fetch. For a
  // numeric TMDB id, let a semantic-anime provider run provisionally even when
  // the client transports the work as tv/movie; authoritative TMDB verification
  // still happens before any positive output can escape.
  if(semantic.length&&semantic.indexOf(type)<0){
    var hasMovie=semantic.indexOf("movie")>=0,hasTv=semantic.indexOf("tv")>=0,hasAnime=semantic.indexOf("anime")>=0;
    // Explicit anime is a semantic request, not a generic TV alias. A provider
    // without anime capability must be rejected before provider/TMDB network.
    if(raw==="anime"&&!hasAnime)return null;
    // movie <-> tv transport mismatch is already conclusive from provider DATA.
    // Do not rewrite a single declared type just to make the provisional call run.
    if(type==="movie"&&!hasMovie&&!hasAnime)return null;
    if(type==="tv"&&!hasTv&&!hasAnime)return null;
    if(semantic.indexOf(namespace)>=0)type=namespace;
    else if(hasAnime&&(namespace==="tv"||namespace==="movie"))type="anime";
    else return null;
  }
  var id=obj?s(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id):s(first),source=sourceIdentity(id);
  var providerType=providerTransport(type,namespace);
  var resolvedTmdbId=source.kind==="tmdb"?source.id:"";
  var resolvedImdbId=s(obj&&(q.imdbId||q.imdb_id)||(source.kind==="imdb"?source.id:"")).toLowerCase();
  var context={
    sourceId:source.id,
    sourceIdType:source.kind,
    tmdbId:resolvedTmdbId,
    imdbId:resolvedImdbId,
    tmdbNamespace:namespace,
    tmdbIdentity:namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id),
    tmdbMetadata:null,
    canonicalMediaType:type,
    tmdbResolutionDegraded:true,
    tmdbVerificationDeferred:true,
    nuvioInputMediaType:input,
    providerMediaType:providerType
  };
  if(obj){
    q.sourceId=source.id;q.sourceIdType=source.kind;
    q.nuvioInputMediaType=input;
    if(resolvedTmdbId)q.tmdbId=resolvedTmdbId;
    if(resolvedImdbId)q.imdbId=resolvedImdbId;
    q.tmdbNamespace=namespace;
    q.tmdbIdentity=namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id);
    q.canonicalMediaType=type;
    q.providerMediaType=providerType;
    q.mediaType=providerType;q.type=providerType;
    if(type==="anime")q.category="anime";else if(!q.category||["series","show","other"].indexOf(s(q.category).toLowerCase())>=0)q.category=type;
    var out=[q];for(var i=1;i<a.length;i++)out.push(a[i]);out.__nuvioContext=context;return out;
  }
  var out=Array.prototype.slice.call(a);out[0]=resolvedTmdbId||resolvedImdbId||source.id||out[0];out[1]=providerType;out.__nuvioContext=context;return out;
}
function hasProviderOutput(value){
  if(Array.isArray(value))return value.length>0;
  if(!value||typeof value!=="object")return false;
  for(var i=0;i<3;i++){
    var key=["streams","results","data"][i];
    if(Array.isArray(value[key]))return value[key].length>0;
  }
  var url=value.url;
  if(typeof url==="string"&&s(url))return true;
  if(url&&typeof url==="object"&&typeof url.url==="string"&&s(url.url))return true;
  return false;
}
function reconcileOutputContext(value,context){
  if(!value||!context)return value;
  function stamp(row){
    if(!row||typeof row!=="object")return;
    try{
      if(Object.prototype.hasOwnProperty.call(row,"canonicalMediaType"))row.canonicalMediaType=context.canonicalMediaType;
      if(Object.prototype.hasOwnProperty.call(row,"providerMediaType"))row.providerMediaType=context.providerMediaType;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbNamespace"))row.tmdbNamespace=context.tmdbNamespace;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbIdentity"))row.tmdbIdentity=context.tmdbIdentity;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbId")&&context.tmdbId)row.tmdbId=context.tmdbId;
      if(Object.prototype.hasOwnProperty.call(row,"degraded"))row.degraded=context.tmdbResolutionDegraded===true;
      if(Object.prototype.hasOwnProperty.call(row,"tmdbResolutionDegraded"))row.tmdbResolutionDegraded=context.tmdbResolutionDegraded===true;
    }catch(_){}
  }
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i++)stamp(value[i]);
    return value;
  }
  if(typeof value==="object"){
    stamp(value);
    for(var j=0;j<3;j++){
      var key=["streams","results","data"][j],list=value[key];
      if(Array.isArray(list))for(var k=0;k<list.length;k++)stamp(list[k]);
    }
  }
  return value;
}
function invocationEvent(a){
  var first=a[0],obj=objectRequest(first),settings=obj?first:(a[4]&&typeof a[4]==="object"?a[4]:null),event="";
  try{event=s(settings&&(settings.providerEvent||settings.event)||"")}catch(_){}
  try{if(!event&&g)event=s(g.__nuvioProviderEvent||g.__nuvioEvent||"")}catch(_){}
  event=event.toLowerCase();
  return event||"launch";
}
function requestHasExternalIdentity(a){
  try{
    var first=a&&a[0],raw=objectRequest(first)?s(first.tmdbId||first.tmdb_id||first.imdbId||first.imdb_id||first.id):s(first);
    return sourceIdentity(raw).kind==="imdb";
  }catch(_){return false}
}
function providerNeedsTmdbBeforeStreams(container){
  try{
    var model=container&&container.__niakvioProviderBase;
    var contract=model&&model.identityInput;
    if(!contract||contract.requiresTmdbBeforeRun!==true)return false;
    var mode=s(contract.mode).toLowerCase();
    return mode==="catalog_search"||mode==="external_id";
  }catch(_){return false}
}
function hasResolvedTmdbMetadata(args){
  try{return !!(args&&args.__nuvioContext&&args.__nuvioContext.tmdbMetadata)}catch(_){return false}
}

async function resolve(a){
  var first=a[0],obj=objectRequest(first),q=obj?Object.assign({},first):null;
  var input=obj?s(q.mediaType||q.type||q.category||"movie"):s(a[1]||"movie");
  var namespace=namespaceOf(input);
  var semantic=rows(c.semanticTypes).map(function(x){return s(x).toLowerCase()});
  // TMDB identity/type resolution is the first provider gate for every request.
  // Provider capability filtering happens only after canonical movie|tv|anime
  // classification so transport aliases can never suppress a valid anime match.
  // Per-request isolation: canonical type/metadata must come only from the
  // current work request (plus TMDB), never from a previous getStreams call.
  var metadata=obj&&(q.tmdbMetadata||q.tmdb_metadata||q.metadata||q);
  var id=obj?s(q.tmdbId||q.tmdb_id||q.imdbId||q.imdb_id||q.id):s(first),source=sourceIdentity(id);
  var season=obj?q.season:a[2],episode=obj?q.episode:a[3];
  var resolved=await canonicalResolution(id,input,metadata,season,episode,semantic);
  if(!resolved)return null;
  var type=resolved.type;namespace=resolved.namespace;
  if(resolved.authoritative&&semantic.length&&semantic.indexOf(type)<0)return null;
  var providerType=providerTransport(type,namespace);
  var resolvedTmdbId=s(resolved.tmdbId||(source.kind==="tmdb"?source.id:""));
  var resolvedImdbId=s(resolved.imdbId||obj&&(q.imdbId||q.imdb_id)||(source.kind==="imdb"?source.id:"")).toLowerCase();
  var context={
    sourceId:source.id,
    sourceIdType:source.kind,
    tmdbId:resolvedTmdbId,
    imdbId:resolvedImdbId,
    tmdbNamespace:namespace,
    tmdbIdentity:namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id),
    tmdbMetadata:resolved.metadata||null,
    canonicalMediaType:type,
    tmdbResolutionDegraded:resolved.degraded===true,
    nuvioInputMediaType:input,
    providerMediaType:providerType
  };
  if(obj){
    q.sourceId=source.id;q.sourceIdType=source.kind;
    q.nuvioInputMediaType=input;
    if(resolvedTmdbId)q.tmdbId=resolvedTmdbId;
    if(resolvedImdbId)q.imdbId=resolvedImdbId;
    q.tmdbNamespace=namespace;
    q.tmdbIdentity=namespace+":"+(resolvedTmdbId||resolvedImdbId||source.id);
    q.tmdbMetadata=resolved.metadata||q.tmdbMetadata||q.tmdb_metadata||null;
    q.canonicalMediaType=type;
    q.providerMediaType=providerType;
    q.mediaType=providerType;q.type=providerType;
    if(type==="anime")q.category="anime";else if(!q.category||["series","show","other"].indexOf(s(q.category).toLowerCase())>=0)q.category=type;
    var out=[q];for(var i=1;i<a.length;i++)out.push(a[i]);out.__nuvioContext=context;return out;
  }
  var out=Array.prototype.slice.call(a);out[0]=resolvedTmdbId||resolvedImdbId||source.id||out[0];out[1]=providerType;out.__nuvioContext=context;return out;
}
/* NUVIO_PROVIDER_LATEST_REQUEST_OWNS_FETCH_V2 */
var requestSerial=0;
function providerTimeoutError(){var e=new Error("nuvio_provider_timeout");e.name="TimeoutError";e.code="NUVIO_PROVIDER_TIMEOUT";e.__nuvioProviderTimeout=true;return e}
function providerStaleError(){var e=new Error("nuvio_provider_superseded");e.name="AbortError";e.code="NUVIO_PROVIDER_SUPERSEDED";e.__nuvioProviderStale=true;return e}
function tokenOwns(token){try{return !token||!g||g.__nuvioProviderRequestToken===token}catch(_){return false}}
function abortController(controller){try{if(controller&&typeof controller.abort==="function")controller.abort()}catch(_){}}
function requestAbortPromise(controller,requestToken){
  return new Promise(function(_resolve,reject){
    try{
      var signal=controller&&controller.signal;
      if(!signal)return;
      var fail=function(){reject(tokenOwns(requestToken)?providerTimeoutError():providerStaleError())};
      if(signal.aborted){fail();return}
      if(typeof signal.addEventListener==="function")signal.addEventListener("abort",fail,{once:true});
    }catch(_){}
  });
}
async function settlePrior(promise){if(!promise||typeof promise.then!=="function")return;try{if(typeof setTimeout!=="function"){await Promise.resolve();return}await Promise.race([promise,new Promise(function(resolve){setTimeout(resolve,Number(c.supersedeSettleMs||1200))})])}catch(_){}}
function deadlineExpired(deadline){var n=Number(deadline);return Number.isFinite(n)&&n>0&&Date.now()>=n}
function tvRuntime(){try{var ua=s(g&&g.navigator&&g.navigator.userAgent);return /NuvioTV|Android TV/i.test(ua)||(g&&g.__NUVIO_TV_RUNTIME__===true)}catch(_){return false}}
function providerBudgetMs(){return tvRuntime()?Number(c.tvProviderTimeoutMs||60000):Number(c.providerTimeoutMs||60000)}
function budgetedFetch(original,deadline,requestToken,requestController){
  if(typeof original!=="function")return original;
  var base=original.__nuvioProviderExecutionBudgetBase||original;
  var wrapped=async function(){
    if(!tokenOwns(requestToken))throw providerStaleError();
    if(deadlineExpired(deadline))throw providerTimeoutError();
    var args=Array.prototype.slice.call(arguments),remaining=deadline>0?Math.max(1,deadline-Date.now()):0;
    if(remaining>0&&args.length>=1){
      var init=args[1]&&typeof args[1]==="object"?Object.assign({},args[1]):{};
      if(!init.signal&&requestController&&requestController.signal)init.signal=requestController.signal;
      if(!init.signal){try{if(typeof AbortSignal!=="undefined"&&AbortSignal.timeout)init.signal=AbortSignal.timeout(remaining)}catch(_){}}
      args[1]=init;
    }
    if(!tokenOwns(requestToken))throw providerStaleError();
    var timer=null;
    var timeoutPromise=new Promise(function(_resolve,reject){
      if(typeof setTimeout!=="function"||remaining<=0)return;
      timer=setTimeout(function(){abortController(requestController);reject(providerTimeoutError())},remaining);
    });
    var value,abortPromise=requestAbortPromise(requestController,requestToken);
    try{
      value=(typeof setTimeout==="function"&&remaining>0)
        ? await Promise.race([base.apply(this,args),timeoutPromise,abortPromise])
        : await Promise.race([base.apply(this,args),abortPromise]);
    }finally{
      try{if(timer!=null&&typeof clearTimeout==="function")clearTimeout(timer)}catch(_){}
    }
    if(!tokenOwns(requestToken))throw providerStaleError();
    if(deadlineExpired(deadline))throw providerTimeoutError();
    return value;
  };
  try{
    Object.defineProperty(wrapped,"__nuvioProviderExecutionBudgetV1",{value:true});
    Object.defineProperty(wrapped,"__nuvioProviderExecutionBudgetBase",{value:base});
  }catch(_){
    wrapped.__nuvioProviderExecutionBudgetV1=true;
    wrapped.__nuvioProviderExecutionBudgetBase=base;
  }
  return wrapped;
}
function install(o,k){
  if(!o||typeof o[k]!=="function"||o[k].__nuvioMediaTypeResolutionV1)return false;
  var native=o[k];
  var wrap=async function(){
    var originalArgs=Array.prototype.slice.call(arguments);
    var providerEvent=invocationEvent(originalArgs);
    // Absolute first gate: non-launch invocations do not touch provider runtime state.
    if(providerEvent!=="launch")return [];

    var requestToken=0,requestDeadline=0,hadFetch=false,previousFetch,fetchBase,budgetFetchInstalled=false;
    var requestController=null,priorController=null,priorDone=null,resolveDone=null,invocationDone=null;
    try{
      // Capture the prior invocation before claiming the global token/fetch slot.
      // The previous fetch wrapper stays installed during settlement grace, so a
      // stale catch/retry still hits its token-bound wrapper and is rejected.
      if(g){priorController=g.__nuvioProviderAbortController||null;priorDone=g.__nuvioProviderInvocationDone||null}
      if(g&&Object.prototype.hasOwnProperty.call(g,"__nuvioMediaContext"))delete g.__nuvioMediaContext;
      if(g){
        var priorSerial=Number(g.__nuvioProviderRequestSerial||requestSerial);
        requestToken=(Number.isFinite(priorSerial)&&priorSerial>=0?priorSerial:requestSerial)+1;
        requestSerial=requestToken;
        g.__nuvioProviderRequestSerial=requestToken;
        g.__nuvioProviderRequestToken=requestToken;
      }
      invocationDone=new Promise(function(resolve){resolveDone=resolve});
      if(g)g.__nuvioProviderInvocationDone=invocationDone;
      abortController(priorController);
      hadFetch=!!(g&&Object.prototype.hasOwnProperty.call(g,"fetch"));
      previousFetch=g&&g.fetch;
      fetchBase=previousFetch&&previousFetch.__nuvioProviderExecutionBudgetBase||previousFetch;
    }catch(_){}
    try{
      await settlePrior(priorDone);
      if(!tokenOwns(requestToken))return [];
      requestDeadline=Date.now()+providerBudgetMs();
      try{requestController=typeof AbortController!=="undefined"?new AbortController():null}catch(_){requestController=null}
      if(g){
        g.__nuvioProviderDeadlineMs=requestDeadline;
        g.__nuvioProviderAbortController=requestController;
        if(typeof fetchBase==="function"){g.fetch=budgetedFetch(fetchBase,requestDeadline,requestToken,requestController);budgetFetchInstalled=g.fetch!==fetchBase;}
      }
      // Gate 2: build request-local provisional transport without TMDB by default.
      // A provider whose declared DATA contract requires a title-based catalogue
      // lookup is the only exception: resolve TMDB once before its first call.
      var a=provisional(originalArgs);
      if(!a||deadlineExpired(requestDeadline))return [];
      if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      if(a.__nuvioContext)a.__nuvioContext.requestToken=requestToken;
      if(g)g.__nuvioMediaContext=a.__nuvioContext||null;

      var verified=null,preResolved=null;
      var needsPlanMetadata=providerNeedsTmdbBeforeStreams(o);
      var needsIdNormalization=requestHasExternalIdentity(originalArgs);
      if(needsPlanMetadata||needsIdNormalization){
        preResolved=await resolve(originalArgs);
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
        if(preResolved&&!deadlineExpired(requestDeadline)&&hasResolvedTmdbMetadata(preResolved)){
          verified=preResolved;
          if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
          if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
          a=verified;
        }
      }

      var value=await native.apply(this,a);
      if(deadlineExpired(requestDeadline))return [];
      if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      if(!hasProviderOutput(value))return [];

      // Gate 3: ordinary providers pay TMDB/type cost only after positive output.
      // Providers which required TMDB to execute their declared plan already ran
      // with verified context, so the same verified object is reused with no
      // second metadata call.
      if(!verified){
        verified=preResolved||await resolve(originalArgs);
        if(!verified||deadlineExpired(requestDeadline))return [];
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
      }
      var provisionalContext=a.__nuvioContext||{},verifiedContext=verified.__nuvioContext||{};
      var rerun=(
        s(provisionalContext.canonicalMediaType)!==s(verifiedContext.canonicalMediaType)
        || s(provisionalContext.providerMediaType)!==s(verifiedContext.providerMediaType)
        || s(provisionalContext.tmdbNamespace)!==s(verifiedContext.tmdbNamespace)
        || s(provisionalContext.tmdbId)!==s(verifiedContext.tmdbId)
        || s(provisionalContext.tmdbIdentity)!==s(verifiedContext.tmdbIdentity)
      );
      if(rerun){
        if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
        if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
        value=await native.apply(this,verified);
        if(deadlineExpired(requestDeadline))return [];
        if(g&&requestToken&&g.__nuvioProviderRequestToken!==requestToken)return [];
        if(!hasProviderOutput(value))return [];
      }else{
        // Identity/type stayed stable: do not execute the provider twice. Promote
        // the authoritative TMDB context and reconcile only diagnostic fields
        // already exposed by the returned rows.
        if(verified.__nuvioContext)verified.__nuvioContext.requestToken=requestToken;
        if(g)g.__nuvioMediaContext=verified.__nuvioContext||null;
        value=reconcileOutputContext(value,verifiedContext);
      }
      return value;
    }catch(error){
      if(error&&(error.__nuvioProviderTimeout||error.__nuvioProviderStale))return [];
      throw error;
    }finally{
      try{if(typeof resolveDone==="function")resolveDone()}catch(_){}
      try{
        if(g){
          // An older request must never clean state owned by a newer request.
          var ownsRequest=!requestToken||g.__nuvioProviderRequestToken===requestToken;
          if(ownsRequest){
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioMediaContext"))delete g.__nuvioMediaContext;
            if(budgetFetchInstalled){if(hadFetch&&typeof fetchBase==="function")g.fetch=fetchBase;else if(!hadFetch)delete g.fetch}
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioProviderDeadlineMs"))delete g.__nuvioProviderDeadlineMs;
            if(g.__nuvioProviderAbortController===requestController)delete g.__nuvioProviderAbortController;
            if(g.__nuvioProviderInvocationDone===invocationDone)delete g.__nuvioProviderInvocationDone;
            if(Object.prototype.hasOwnProperty.call(g,"__nuvioProviderRequestToken"))delete g.__nuvioProviderRequestToken;
          }
        }
      }catch(_){}
    }
  };
  wrap.__nuvioMediaTypeResolutionV1=true;
  o[k]=wrap;return true;
}
var ok=false;
try{if(typeof module!=="undefined"&&module.exports)ok=install(module.exports,"getStreams")}catch(_){}
try{if(g&&typeof g.getStreams==="function"){if(ok&&typeof module!=="undefined"&&module.exports)g.getStreams=module.exports.getStreams;else install(g,"getStreams")}}catch(_){}
})(typeof globalThis!=="undefined"?globalThis:this,CONFIG_PLACEHOLDER);
'''.replace("MARKER_PLACEHOLDER", marker).replace("CONFIG_PLACEHOLDER", serialized)

    return replace_managed_fix(
        text,
        MANAGED_FIX_ID,
        js.lstrip(),
        data=payload,
    )


if __name__ == "__main__":
    raise SystemExit("patch module only")
