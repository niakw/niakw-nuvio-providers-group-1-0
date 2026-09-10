# International Provider Discovery — 2026-09-09

Status: research queue only. Nothing in this document is published into manifests or Provider v3 automatically.

## Safety / onboarding rule

Every candidate below was cross-checked against the 96 canonical IDs in `provider_catalog.json`. Existing providers are excluded. A candidate may only enter NiakVIO through the normal onboarding path: identity -> current route/hub resolution -> upstream scraper review -> media-type contract -> ProviderBase v3 materialization -> native Labs -> publication gates.

Do not infer identity continuity from a domain name alone and do not replace an existing provider/hub with one of these candidates.

## Tier A — best next onboarding candidates

These have a maintained public scraper/plugin ecosystem and current evidence that the provider is active or actively maintained.

| Region | Candidate | Content | Current public evidence | NiakVIO status |
|---|---|---|---|---|
| IT | StreamingCommunity | movie/tv | Active CloudStream implementations; public Telegram redirect channel; current Sept. 2026 domain rotation observed | absent |
| IT | AnimeUnity | anime | Active in maintained Italian CloudStream repos; current target reported as `animeunity.so` | absent |
| IT | CB01 | movie/tv | Active in maintained Italian CloudStream repo; current target reported as `cb01.uno` | absent |
| IT | AltaDefinizione | movie/tv | Active implementation in current Italian CloudStream fork; domain rotation expected | absent |
| DE | FilmPalast | movie/tv | Present in maintained GermanProviders and xStream; working in recent xStream status | absent |
| DE | HDFilme | movie/tv | Present in maintained GermanProviders and xStream; working in recent xStream status | absent |
| DE | Serienstream | tv | Maintained German provider; recent Nuvio/CloudStream community reports confirm use, with login requirement on some routes | absent |
| DE | KinoGer | movie/tv | Maintained German provider; working in recent xStream status | absent |
| DE | MegaKino | movie/tv | Maintained German provider; working in recent xStream status | absent |
| DE | Moflix | movie/tv | Maintained German provider; working in recent xStream status | absent |
| TR | FilmMakinesi | movie/tv | Present in actively maintained Turkish CloudStream repositories | absent |
| TR | FilmModu | movie/tv | Present in actively maintained Turkish CloudStream repositories | absent |
| TR | HDFilmCehennemi | movie/tv | Present in actively maintained Turkish CloudStream repositories | absent |
| TR | FullHDFilm | movie/tv | Present in actively maintained Turkish CloudStream repositories | absent |
| TR | JetFilmizle | movie/tv | Present in actively maintained Turkish CloudStream repositories | absent |
| ID | LayarKaca21 | movie/tv | Stable in current Indonesian OCE repo; route family currently reports `lk21official` | absent |
| ID | Anichin | anime/donghua | Stable in current Indonesian repositories; current target reported as `anichin.cafe` | absent |
| ID | Samehadaku | anime | Stable in current Indonesian OCE repo; current target reported as `samehadaku.biz` | absent |
| ID | Donghuastream | anime/donghua | Stable in current Indonesian OCE repo; current target reported as `donghuastream.org` | absent |
| ID | Pencurimovie | movie/tv | Stable in current Indonesian OCE/CloudX ecosystem | absent |
| AR | Akwam | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | ArabSeed | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | CimaNow | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | EgyBest | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | FaselHD | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | Fushaar | movie/tv | Maintained Arabic CloudStream provider | absent |
| AR | Shahid4u | movie/tv | Maintained Arabic CloudStream provider | absent |

## Tier B — strong discovery queue

These are useful candidates, but current terminal/domain or runtime health needs a fresh resolver pass before implementation.

| Region | Candidate | Notes |
|---|---|---|
| IT | GuardaSerie | Italian TV-series provider present in CloudStream ecosystem |
| IT | TantiFilm | Current repos retain implementation but some report partial/deactivated state |
| IT | FilmPerTutti | Implementation exists; some current repos report temporarily deactivated |
| IT | OnlineSerieTV | Implementation exists; recent repo reports Cloudflare blocking |
| IT | ToonItalia | anime/cartoon/TV; implementation exists, current health mixed |
| DE | KinoKing | Maintained GermanProviders plugin |
| DE | XCine | Maintained GermanProviders plugin |
| DE | ZeroMovies | Maintained GermanProviders plugin |
| DE | KKiste | Recent xStream status reports working |
| DE | MovieDream | Recent xStream status reports working |
| DE | Topstreamfilm | Recent xStream status reports working |
| TR | FilmKovasi | Turkish CloudStream implementation |
| TR | FullHDFilmizlesene | Turkish CloudStream implementation |
| TR | HDFilmIzle | Turkish CloudStream implementation |
| TR | HDFilmSitesi | Turkish CloudStream implementation |
| TR | KultFilmler | Turkish CloudStream implementation |
| TR | KoreanTurk | Korean content with Turkish localization |
| TR | RoketDizi | Turkish series provider implementation |
| ID | LayarKaca | Active in CloudX ecosystem |
| ID | LayarWarna | Active in CloudX ecosystem |
| ID | MidasXXi | Active in CloudX ecosystem |
| ID | Ngefilm | Active in CloudX ecosystem |
| ID | Pusatfilm | Active in CloudX ecosystem |
| ID | Pusatmovie | Active in CloudX ecosystem |
| ID | Sarangfilm | Active in CloudX ecosystem |
| ID | Savefilm | Active in CloudX ecosystem |
| ID | WGFilm21 | Active in CloudX ecosystem |
| ID | Rebahin | Stable implementation reported by a current Indonesian repo; identity/domain churn requires separate resolver |
| AR | Anime4up | Arabic anime provider |
| AR | AnimeBlkom | Arabic anime provider |
| AR | Animeiat | Arabic anime provider |
| AR | GateAnime | Arabic anime provider |
| AR | Movizland | Arabic movie/TV provider |
| AR | FajerShow | Arabic provider implementation |
| ES/LATAM | Cinecalidad | Multilingual CloudStream implementation |
| ES/LATAM | Cuevana | Multiple implementations exist; identity is clone-prone, so fingerprinting is mandatory |
| ES/LATAM | PelisplusHD | Provider implementation exists; current route must be resolved independently |
| ES/LATAM | Seriesflix | Provider implementation exists; current route must be resolved independently |
| ES/LATAM | DoramasYT | Spanish-language Asian drama provider implementation |
| ES/LATAM | Monoschinos | Spanish-language anime provider implementation |

## Tier C — India / South Asia discovery queue

An Indian government/industry piracy study ranked several large services in 2025 and a July 2026 Delhi High Court order still records active domain families for this ecosystem. NiakVIO already contains `vegamovies`, `moviesmod`, `cineby`, `hdhub4u`, `movies4u`, `moviesdrive`, `movieshunt`, `hindmoviez`, `desiflix`, etc., so those were excluded.

New identities worth route/upstream investigation:

- LuxMovies
- Bolly4u
- Filmyzilla
- Moviezwap
- MKVMoviesPoint
- KatMovieHD
- 9xflix
- TamilMV
- TamilBlasters
- MoviesDa
- iBOMMA family
- Bappam family
- MultiMovies

These should not be onboarded from search-result domains. First find a maintained upstream implementation or stable identity/hub signal.

## Explicit exclusions because already in NiakVIO

The sweep found many apparently interesting names that are already among the 96 canonical providers and therefore are not new: `animeworld`, `mycima`, `moviebox`, `streamflix`, `moviesmod`, `vegamovies`, `cineby`, `frenchstream`, `hianime`, `einthusan`, `kisskh`, `netmirror`, and others.

## Existing French hubs: do not replace

The web sweep also rediscovered alternate address pages for French providers. They are not automatically better than NiakVIO's curated sources.

- FrenchStream already carries `https://fstream.website/` in NiakVIO. `fstream.info` is therefore only secondary evidence, not a replacement.
- Flemmix already carries the curated Wiflix-address lineage in NiakVIO. `wiflix.sarl` is secondary evidence only until continuity is independently established.
- Existing Anime-Sama, Purstream, Coflix, PapaDuStream, Nakios, etc. hub/address sources remain protected by the fill-only discovery job.

## Suggested onboarding order

1. StreamingCommunity (IT)
2. AnimeUnity (IT)
3. FilmPalast (DE)
4. HDFilme (DE)
5. Serienstream (DE; auth-aware)
6. HDFilmCehennemi (TR)
7. FilmMakinesi (TR)
8. LayarKaca21 (ID)
9. Samehadaku (ID)
10. Akwam (AR)
11. FaselHD (AR)
12. CimaNow (AR)
13. CB01 (IT)
14. KinoGer (DE)
15. Pencurimovie (ID)

This order favors maintained scrapers, language diversification, and movie/TV coverage rather than adding many clone-prone identities at once.

## Public research sources used

- `Gian-Fr/ItalianProvider`
- `doGior/doGiorsHadEnough`
- `manuel09/itaCloud`
- `Bnyro/GermanProviders`
- xStream plugin status/wiki (June 2026)
- `nikyokki/nik-cloudstream` and related Turkish CloudStream repos
- `ImZaw/cloudstream-extensions-arabic`
- `Asm0d3usX/CloudX-V2`
- `ExtremeBoyGG/nonton-indo`
- `byimam2nd/oce`
- `lawlietbr/lietrepo`
- `hexated/cloudstream-extensions-multilingual`
- India Ministry of Information & Broadcasting / IP House + MPA + CII piracy study
- Delhi High Court, July 2026, dynamic injunction domain list
- AGCOM 2026 StreamingCommunity alias decisions and public StreamingCommunity Telegram redirect channels
