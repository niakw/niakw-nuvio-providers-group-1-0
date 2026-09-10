# Contrat runtime Nuvio — comparaison par device

> Généré depuis `automation/platform-runtime-contracts.json` par `scripts/render_platform_runtime_contracts.py`. Ne pas éditer la matrice à la main.

Dernier audit du contrat : **2026-09-09**.

**Lecture rapide :** 🟢 identique sur tous les clients · 🟠 implémentation/sémantique différente · 🔴 capacité absente, incompatible ou à ré-auditer sur au moins un client.

## Matrice des capacités

| Capacité | Écart | Android | iOS | macOS | Windows | Linux | Android TV |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Runtime JS | 🟢 **Identique** | **native** — QuickJS | **native** — QuickJS | **native** — QuickJS | **native** — QuickJS | **native** — QuickJS | **native** — QuickJS |
| Signature getStreams | 🟢 **Identique** | **native** — getStreams(tmdbId, mediaType, season, episode) | **native** — getStreams(tmdbId, mediaType, season, episode) | **native** — getStreams(tmdbId, mediaType, season, episode) | **native** — getStreams(tmdbId, mediaType, season, episode) | **native** — getStreams(tmdbId, mediaType, season, episode) | **native** — getStreams(tmdbId, mediaType, season, episode) |
| SCRAPER_ID | 🟢 **Identique** | **native** — SCRAPER_ID injected | **native** — SCRAPER_ID injected | **native** — SCRAPER_ID injected | **native** — SCRAPER_ID injected | **native** — SCRAPER_ID injected | **native** — SCRAPER_ID injected |
| SCRAPER_SETTINGS | 🟢 **Identique** | **native** — SCRAPER_SETTINGS injected | **native** — SCRAPER_SETTINGS injected | **native** — SCRAPER_SETTINGS injected | **native** — SCRAPER_SETTINGS injected | **native** — SCRAPER_SETTINGS injected | **native** — SCRAPER_SETTINGS injected |
| TMDB_API_KEY | 🔴 **Écart de capacité** — absent | **absent** — no TMDB_API_KEY runtime global | **absent** — no TMDB_API_KEY runtime global | **absent** — no TMDB_API_KEY runtime global | **absent** — no TMDB_API_KEY runtime global | **absent** — no TMDB_API_KEY runtime global | **native** — TMDB_API_KEY injected from BuildConfig |
| Hydratation identité TMDB ↔ IMDb | 🔴 **Écart de capacité** — absent | **absent** — Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap. | **absent** — Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap. | **absent** — Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap. | **absent** — Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap. | **absent** — Current official runtime forwards only the positional TMDB id and exposes no host-populated canonical TMDB/IMDb metadata context/cache; identity hydration is a documented client gap. | **bridge** — Equivalent Core hydration available through the audited TV TMDB runtime bridge; Core can resolve TMDB metadata/external_ids and derive IMDb without a user-supplied key. |
| fetch / bridge natif | 🟠 **Différence** | **bridge** — synchronous __native_fetch → OkHttp | **bridge** — synchronous __native_fetch → Ktor Darwin | **bridge** — async __native_fetch → OkHttp | **bridge** — async __native_fetch → OkHttp | **bridge** — async __native_fetch → OkHttp | **bridge** — blocking native fetch behind async JS fetch → OkHttp |
| Pile HTTP | 🟠 **Différence** | **native** — OkHttp | **native** — Ktor Darwin | **native** — OkHttp | **native** — OkHttp | **native** — OkHttp | **native** — OkHttp |
| Politique proxy | 🟠 **Différence** | **native** — Proxy.NO_PROXY | **native** — Darwin/platform default | **native** — JVM/system default; no NO_PROXY override | **native** — JVM/system default; no NO_PROXY override | **native** — JVM/system default; no NO_PROXY override | **native** — Proxy.NO_PROXY |
| DNS | 🟠 **Différence** | **native** — IPv4FirstDns | **native** — Darwin/platform default | **native** — IPv4FirstDns | **native** — IPv4FirstDns | **native** — IPv4FirstDns | **native** — IPv4FirstDns |
| Redirections | 🟠 **Différence** | **native** — HTTP + SSL redirects enabled | **native** — Ktor Darwin engine policy | **native** — HTTP + SSL redirects enabled | **native** — HTTP + SSL redirects enabled | **native** — HTTP + SSL redirects enabled | **native** — HTTP + SSL redirects enabled |
| Timeouts | 🟠 **Différence** | **native** — 60s HTTP; 60s plugin runtime | **native** — 60s request/connect/socket; 60s plugin runtime | **native** — 60s HTTP; 60s plugin runtime | **native** — 60s HTTP; 60s plugin runtime | **native** — 60s HTTP; 60s plugin runtime | **native** — 30s HTTP; 60s plugin runtime; 120s outer scraper safety net |
| AbortController | 🟠 **Différence** | **polyfill** — AbortController / AbortSignal | **polyfill** — AbortController / AbortSignal | **polyfill** — AbortController / AbortSignal | **polyfill** — AbortController / AbortSignal | **polyfill** — AbortController / AbortSignal | **polyfill** — AbortController / AbortSignal; pre/post checks + coroutine cancellation of in-flight calls |
| URL / URLSearchParams | 🟢 **Identique** | **polyfill** — URL + URLSearchParams over native URL parser | **polyfill** — URL + URLSearchParams over native URL parser | **polyfill** — URL + URLSearchParams over native URL parser | **polyfill** — URL + URLSearchParams over native URL parser | **polyfill** — URL + URLSearchParams over native URL parser | **polyfill** — URL + URLSearchParams over native URL parser |
| atob / btoa | 🟢 **Identique** | **polyfill** — atob + btoa | **polyfill** — atob + btoa | **polyfill** — atob + btoa | **polyfill** — atob + btoa | **polyfill** — atob + btoa | **polyfill** — atob + btoa |
| TextEncoder / TextDecoder | 🔴 **Écart de capacité** — absent | **polyfill** — TextEncoder + TextDecoder | **polyfill** — TextEncoder + TextDecoder | **polyfill** — TextEncoder + TextDecoder | **polyfill** — TextEncoder + TextDecoder | **polyfill** — TextEncoder + TextDecoder | **absent** — TextEncoder / TextDecoder not exposed by current PluginRuntime |
| Cheerio / DOM | 🟠 **Différence** | **bridge** — Cheerio-compatible API over native parser | **bridge** — Cheerio-compatible API over native parser | **bridge** — Cheerio-compatible API over native parser | **bridge** — Cheerio-compatible API over native parser | **bridge** — Cheerio-compatible API over native parser | **bridge** — Cheerio-compatible API over Jsoup |
| require / CommonJS | 🟢 **Identique** | **polyfill** — require() / CommonJS compatibility | **polyfill** — require() / CommonJS compatibility | **polyfill** — require() / CommonJS compatibility | **polyfill** — require() / CommonJS compatibility | **polyfill** — require() / CommonJS compatibility | **polyfill** — require() / CommonJS compatibility |
| CryptoJS / crypto | 🟠 **Différence** | **bridge** — CryptoJS compatibility | **bridge** — CryptoJS compatibility | **bridge** — CryptoJS compatibility | **bridge** — CryptoJS compatibility | **bridge** — CryptoJS compatibility | **bridge** — CryptoJS source/bytecode bundle |
| WebAssembly | 🔴 **Écart de capacité** — absent | **bridge** — WebAssembly compatibility bridge | **bridge** — WebAssembly compatibility bridge | **bridge** — WebAssembly compatibility bridge | **bridge** — WebAssembly compatibility bridge | **bridge** — WebAssembly compatibility bridge | **absent** — no WebAssembly bridge in current PluginRuntime |
| Exception getStreams → [] | 🟢 **Identique** | **native** — getStreams failures are caught and surfaced as [] | **native** — getStreams failures are caught and surfaced as [] | **native** — getStreams failures are caught and surfaced as [] | **native** — getStreams failures are caught and surfaced as [] | **native** — getStreams failures are caught and surfaced as [] | **native** — getStreams failures are caught and surfaced as [] |
| Headers stream | 🟠 **Différence** | **native** — PluginRuntimeResult.headers retained | **native** — PluginRuntimeResult.headers retained | **native** — PluginRuntimeResult.headers retained | **native** — PluginRuntimeResult.headers retained | **native** — PluginRuntimeResult.headers retained | **native** — LocalScraperResult.headers retained |
| Sous-titres stream | 🟠 **Différence** | **native** — PluginRuntimeResult.subtitles retained, including subtitle-specific headers | **native** — PluginRuntimeResult.subtitles retained, including subtitle-specific headers | **native** — PluginRuntimeResult.subtitles retained, including subtitle-specific headers | **native** — PluginRuntimeResult.subtitles retained, including subtitle-specific headers | **native** — PluginRuntimeResult.subtitles retained, including subtitle-specific headers | **native** — LocalScraperResult.subtitles retained and projected to Stream.subtitles, including subtitle-specific headers |
| seeders / peers / infoHash | 🟢 **Identique** | **native** — seeders / peers / infoHash retained | **native** — seeders / peers / infoHash retained | **native** — seeders / peers / infoHash retained | **native** — seeders / peers / infoHash retained | **native** — seeders / peers / infoHash retained | **native** — seeders / peers / infoHash retained |
| Projection badges du flux | 🟠 **Différence** | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeMatcher re-derives badges by regex over StreamItem name/title/description and parsed fields | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeMatcher re-derives badges by regex over StreamItem name/title/description and parsed fields | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeMatcher re-derives badges by regex over StreamItem name/title/description and parsed fields | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeMatcher re-derives badges by regex over StreamItem name/title/description and parsed fields | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeMatcher re-derives badges by regex over StreamItem name/title/description and parsed fields | **shim** — badgeIds/displayBadges are not parsed from provider JSON; StreamBadgeRules re-derives badges by regex over Stream name/title/description and parsed fields |
| Projection description du flux | 🟠 **Différence** | **shim** — PluginRuntimeResult has no description field; StreamItem.description is rebuilt from quality + size + language, so NiakVIO tunnels full technical description through size | **shim** — PluginRuntimeResult has no description field; StreamItem.description is rebuilt from quality + size + language, so NiakVIO tunnels full technical description through size | **shim** — PluginRuntimeResult has no description field; StreamItem.description is rebuilt from quality + size + language, so NiakVIO tunnels full technical description through size | **shim** — PluginRuntimeResult has no description field; StreamItem.description is rebuilt from quality + size + language, so NiakVIO tunnels full technical description through size | **shim** — PluginRuntimeResult has no description field; StreamItem.description is rebuilt from quality + size + language, so NiakVIO tunnels full technical description through size | **shim** — LocalScraperResult has no description field; Stream.description is projected from LocalScraperResult.size, so NiakVIO tunnels full technical description through size |
| Projection titre / nom du flux | 🟠 **Différence** | **shim** — PluginRuntimeResult.title is parsed, but plugin StreamItem uses name ?: title; NiakVIO mirrors branded Provider - Quality into name and title | **shim** — PluginRuntimeResult.title is parsed, but plugin StreamItem uses name ?: title; NiakVIO mirrors branded Provider - Quality into name and title | **shim** — PluginRuntimeResult.title is parsed, but plugin StreamItem uses name ?: title; NiakVIO mirrors branded Provider - Quality into name and title | **shim** — PluginRuntimeResult.title is parsed, but plugin StreamItem uses name ?: title; NiakVIO mirrors branded Provider - Quality into name and title | **shim** — PluginRuntimeResult.title is parsed, but plugin StreamItem uses name ?: title; NiakVIO mirrors branded Provider - Quality into name and title | **native** — LocalScraperResult title/name/quality are retained; toStream keeps title/name and appends quality when not already present |
| Projection behaviorHints / proxyHeaders | 🔴 **Écart de capacité** — absent | **absent** — runtime result keeps raw headers; behaviorHints is downstream | **absent** — runtime result keeps raw headers; behaviorHints is downstream | **absent** — runtime result keeps raw headers; behaviorHints is downstream | **absent** — runtime result keeps raw headers; behaviorHints is downstream | **absent** — runtime result keeps raw headers; behaviorHints is downstream | **bridge** — main stream headers → behaviorHints.proxyHeaders.request; local-plugin bingeGroup; subtitle headers remain attached to each subtitle |

## Contrat canonique d'identité média

Le paramètre positionnel `tmdbId` de `getStreams(tmdbId, mediaType, season, episode)` est un **transport d'identifiant**, pas l'identité média complète.

- Chemin IMDb canonique du contexte : `__nuvioMediaContext.tmdbMetadata.external_ids.imdb_id`.
- Cache metadata partagé canonique : `__nuvioTmdbMetadataCacheV1` avec entrée `{state:"ok",metadata:{external_ids:{imdb_id:"tt..."}}}`.
- Timing d'un bridge host : after provider/Core bundle initialization and before getStreams invocation when supplied by the host.
- Une clé/credential TMDB fournie par l'utilisateur n'est **jamais** une précondition de compatibilité NiakVIO.
- Un secret TMDB ne doit pas être projeté dans le JavaScript provider uniquement pour reconstruire l'identité IMDb.
- Un client peut fournir une capacité équivalente d'hydratation, mais la disponibilité d'un seul TMDB ID ne permet jamais de conclure que l'identité dual-ID est disponible.

## Révisions auditées

| Device | Dépôt / branche | Révision auditée | État | Transport runtime |
| --- | --- | --- | --- | --- |
| Android | `NuvioMedia/NuvioMobile` / `cmp-rewrite` | `68337ffac8578b986d0c3f6e432abf75f4a33521` | **audited** | `composeApp/src/androidMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.android.kt` |
| iOS | `NuvioMedia/NuvioMobile` / `cmp-rewrite` | `68337ffac8578b986d0c3f6e432abf75f4a33521` | **audited** | `composeApp/src/iosMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.ios.kt` |
| macOS | `NuvioMedia/NuvioDesktop` / `Dev` | `323c1037f3c0fbe0ebe255b77d42331c3fdeb2d7` | **audited** | `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt` |
| Windows | `NuvioMedia/NuvioDesktop` / `Dev` | `323c1037f3c0fbe0ebe255b77d42331c3fdeb2d7` | **audited** | `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt` |
| Linux | `NuvioMedia/NuvioDesktop` / `Dev` | `323c1037f3c0fbe0ebe255b77d42331c3fdeb2d7` | **audited** | `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt` |
| Android TV | `NuvioMedia/NuvioTV` / `dev` | `23d1fe478e380860dae3eb41c8770533361a0cc5` | **audited** | `app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt` |

## Lecture des états

- **native** : comportement fourni directement par le client ou son modèle natif.
- **bridge** : capacité exposée à JavaScript par un pont natif.
- **polyfill** : compatibilité fournie en JavaScript au-dessus du runtime.
- **shim** : adaptation NiakVIO explicitement nécessaire pour harmoniser les clients.
- **absent** : capacité absente du contrat actuel du client.
- **incompatible** : capacité présente mais avec une sémantique incompatible entre clients.
- **audit-required** : le code upstream a changé et la valeur ne doit pas être considérée comme validée avant ré-audit.
- **n/a** : capacité sans objet pour ce client.

## Différences qui comptent pour NiakVIO

- **Android et Android TV forcent `Proxy.NO_PROXY`; Desktop ne le force pas.** C'est une différence de transport silencieuse : un provider peut attraper une erreur réseau et retourner `[]` sans exception JavaScript visible.
- **Desktop utilise un bridge `__native_fetch` asynchrone**, alors que Mobile et TV appellent leur pont natif de manière bloquante derrière l'API JavaScript `fetch`.
- **iOS utilise Ktor/Darwin**, contrairement à l'OkHttp d'Android, Desktop et TV. Les comportements réseau propres à la plateforme doivent donc rester audités séparément.
- **TV injecte `TMDB_API_KEY` dans le runtime plugin; Mobile/Desktop ne l'exposent pas comme global runtime.** TV dispose donc actuellement d'une capacité équivalente d'hydratation TMDB→metadata/external_ids→IMDb ; Mobile/Desktop ont un gap host-side documenté. Les providers partagés ne doivent toutefois jamais dépendre de `TMDB_API_KEY`.
- **Le cache `__nuvioTmdbMetadataCacheV1` est initialisé par Core pendant l'évaluation du bundle et `__nuvioMediaContext` est réécrit pendant la résolution.** Un bridge host dual-ID doit donc alimenter le contrat canonique après l'initialisation Core et avant `getStreams`, sinon son identité peut être écrasée avant le provider.
- **Les six clients conservent désormais les sous-titres retournés par le provider.** TV a ajouté `LocalScraperResult.subtitles` depuis l'audit précédent.
- **Mobile/Desktop ne conservent pas `description` depuis le JSON provider** : leur `StreamItem.description` est reconstruit depuis `quality + size + language`. TV projette également `Stream.description` depuis `LocalScraperResult.size`. NiakVIO utilise donc `size` comme tunnel de description technique complète.
- **Mobile/Desktop privilégient `name` à `title` pour le label plugin.** NiakVIO doit donc écrire `Provider - Qualité` dans les deux champs ; TV conserve les deux et évite de dupliquer la qualité lorsqu'elle est déjà présente.
- **Aucun client ne consomme directement `badgeIds` / `displayBadges` depuis le JSON provider.** Les moteurs de badges Mobile/Desktop/TV re-matchent des règles regex sur les champs textuels du stream (`name`, `title`, `description`, champs parsés). Les tokens techniques doivent donc survivre dans le label/description projetés.
- **TV projette les headers dans `behaviorHints.proxyHeaders.request`** et ajoute son `bingeGroup`; Mobile/Desktop conservent d'abord les headers bruts dans `PluginRuntimeResult`.
- **TV n'expose actuellement ni TextEncoder/TextDecoder ni WebAssembly dans son PluginRuntime**, contrairement au runtime Mobile/Desktop. Un provider qui en dépend doit être adapté ou déclaré incompatible TV.

## Contrat vivant / drift upstream

Le registre `automation/nuvio-client-upstreams.json` et le checker `scripts/check_nuvio_client_upstreams.py` surveillent les HEAD officiels Mobile, Desktop et TV. Les chemins runtime, modèles de résultat, repository et transport font partie du périmètre sensible.

Règle : **un HEAD ne doit pas être avancé comme contrat audité lorsqu'un de ces chemins ou une sémantique sensible a changé sans ré-audit**. Après audit, `source_ref`, le registre upstream et cette matrice doivent pointer vers la même révision officielle.

Le check CI `python3 scripts/render_platform_runtime_contracts.py --check` garantit que ce README reste exactement synchronisé avec le JSON machine-readable.

## Sources canoniques par client

### Android

- Runtime : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt`
- Repository : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`
- Transport : `composeApp/src/androidMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.android.kt`
- Modèle de résultat : `composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt`
- Note d'audit : Re-audited at cmp-rewrite HEAD 68337ffac857. No PluginRuntime, PluginRepository or PluginModels changes since the 3 September provider-contract audit; Android player/download/UI changes are reader-only evidence.

### iOS

- Runtime : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt`
- Repository : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`
- Transport : `composeApp/src/iosMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.ios.kt`
- Modèle de résultat : `composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt`
- Note d'audit : Re-audited at cmp-rewrite HEAD 68337ffac857. No PluginRuntime, PluginRepository or PluginModels changes since the 3 September provider-contract audit; iOS player/UI changes are reader-only evidence.

### macOS

- Runtime : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt`
- Repository : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`
- Transport : `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt`
- Modèle de résultat : `composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt`
- Note d'audit : Re-audited at Dev HEAD 323c1037f3c0. Provider ABI/runtime/fetch projection is unchanged; a separate StreamsRepository/PlayerStreamsRepository readiness-invalidation bug can leave a visible repository with zero app-selected providers until a request-key change forces reload.

### Windows

- Runtime : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt`
- Repository : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`
- Transport : `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt`
- Modèle de résultat : `composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt`
- Note d'audit : Re-audited at Dev HEAD 323c1037f3c0. Provider ABI/runtime/fetch projection is unchanged; a separate StreamsRepository/PlayerStreamsRepository readiness-invalidation bug can leave a visible repository with zero app-selected providers until a request-key change forces reload.

### Linux

- Runtime : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt`
- Repository : `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`
- Transport : `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt`
- Modèle de résultat : `composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt`
- Note d'audit : Re-audited at Dev HEAD 323c1037f3c0. Provider ABI/runtime/fetch projection is unchanged; Linux shares the desktop provider runtime but remains outside the five mandatory native release Labs.

### Android TV

- Runtime : `app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt`
- Repository : `app/src/full/java/com/nuvio/tv/core/plugin/PluginManager.kt`
- Transport : `app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt`
- Modèle de résultat : `app/src/main/java/com/nuvio/tv/domain/model/Plugin.kt`
- Note d'audit : Re-audited at dev HEAD 23d1fe478e38 / 0.9.0-beta. Positional getStreams and network/runtime globals remain stable. Subtitle projection changed additively: subtitle-specific headers are now part of the TV result model and must survive NiakVIO projection; fresh Android-TV runtime re-proof remains required.
