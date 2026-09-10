# NiakVIO — Recovery Memory

Last authoritative checkpoint: 2026-09-07 Europe/Paris.

This file is the durable recovery source of truth for the active NiakVIO work. Prefer current repository state and exact GitHub Actions/native logs over older chat summaries. Update this file automatically at every important correction, failure, publication, native proof, security proof, or architecture decision before moving to the next risky step.

## Repository topology / execution policy

- Repository: `niakw/NiakVIO`.
- **`main` is the only active write/publication target.** Do not recreate a persistent workbench branch.
- Durable Learning proposal branch: `brain-learning/proposals`; proposal storage only, not publication authority.
- Cleanup completed after 5.21.35 publication: `workbench` deleted, `hotfix/runtime-tmdb-credentialless-v28` deleted, PR #92 closed and never merged.
- Expected branches: `main` + `brain-learning/proposals` only.
- Catalogue target remains **all 96 Provider Objects**, including disabled/off rows for census/recoverability. Never shrink the catalogue to manufacture green metrics.
- A structural/materialization green is not real stream proof. Real route/network/yield/native evidence remains mandatory.
- Do not patch official NuvioTV/NuvioMobile/NuvioDesktop production behavior to make Labs green. Native Labs are observational.

## Accepted publication — 5.21.35

- Current accepted public generation remains **5.21.35** until a later checkpoint explicitly records a verified public 5.21.36.
- Final 5.21.35 publication commit: `9db07b3aa42ce2535ec1d7c19866beb43586badd` — `fix: restore Provider CONFIG in final publication 5.21.35`.
- Publication trigger commit: `96957c79403908028964aaab388bdb4c80a5bbe2`.
- Workflow `MAIN - Provider CONFIG Publication Hotfix`, run **34061529965**, job **101562800243**, completed success.
- Root `manifest.json`, `vf/manifest.json`, `no-anime/manifest.json`, and `vf-no-anime/manifest.json` were all verified as `5.21.35`.
- 96 provider versions/hashes were regenerated and Provider CONFIG validation passed 96/96.
- Temporary 5.21.35 publication workflow/script self-removed as intended.
- Flemmix authoritative domain is `flemmix.kim`; `.men` is stale. Commit `bdf11932ea5b949837c29b71c8a61b903e91c57b` fixed final DATA audit authority.

## Provider v3 architecture — invariant

Generated provider composition:
1. clean immutable/common ProviderBase v3;
2. structured provider DATA/CONFIG/static knowledge;
3. provider-owned `PROVIDER.*` Lego;
4. one global Core boundary;
5. shared `CORE.*` Lego;
6. conservative NiakVIO minimizer + content hash.

Hard rules:
- published/upstream/historical Provider JS is knowledge/reference only, never a reconstruction seed;
- **published Provider JS contains only common ProviderBase + structured DATA/CONFIG + managed Provider/Core Lego + envelope/minimizer-preserved structure**;
- no provider file/adapter may own duplicated identity, media-type, year, sanitizer, presentation, or other shared business rules;
- provider-local `strictIdentityScore`, `routeIdentity`, year rejection, or duplicated season/episode identity logic are architecture violations;
- ProviderBase may transport evidence and call shared Core services but must not own a second copy of Core policy;
- provider behavior belongs in DATA or owned Provider Lego;
- Core is provider-agnostic and each concern has one owner;
- managed Lego uses `STARTFIX` / `CLOSEFIX` (+ `FIXDATA` when needed);
- Provider Lego precedes Core boundary; Core Lego follows it;
- reverse reconstruction must be deterministic/byte-verifiable;
- Terser forbidden; production minimizer is `scripts/provider_v3_minimizer.py` and must preserve comments/markers/structure.

Core order:
`Provider -> STREAM_FACTS -> STREAM_IDENTITY -> MEDIA_TYPE -> STREAM_PRESENTATION -> PROVIDER_BRANDING -> SANITIZER`.

Ownership:
- `CORE.STREAM_IDENTITY.V1` is the **sole owner** of title/type/ID/year/season/episode identity acceptance semantics.
- `CORE.RUNTIME_MEDIA_SAFETY.V4` owns only playback/media safety: URL shape, P2P rejection, HLS/direct checks, bounded duration/playability. It must not own title/year/S/E collision policy.
- `engine_v2` may mirror Core policy for smoke/diagnostic tests, but provider-specific scoring APIs are forbidden.

## Identity / type / episodic-year contract — FINAL

- Provider input accepts **TMDB or IMDb**. Valid IMDb must not be rejected merely because TMDB enrichment is missing/unavailable.
- Episodic IMDb such as `tt11198330:3:1` preserves season/episode.
- Canonical semantic types: `movie`, `tv`, `anime`.
- Nuvio transport alias `series` maps to canonical `tv`; app-path tests cover movie/tv/series.
- Anime semantics remain distinct even when a provider uses a tv/movie transport lane.
- Capability/type gate must happen before provider network work.

Year policy:
- **MOVIE only**: title + type + movie year; year mismatch is strong evidence and may reject in strict mode.
- **TV / `series` / anime**: release/origin/season/episode year has **zero identity influence**, direct or indirect. No rejection, score promotion, `contentLike` promotion, or other heuristic may depend on year for episodic media.
- Episode resolution identity uses title/type + **season + episode**.
- Provider rows may expose original-series year, season year, episode year, or no year without affecting episodic acceptance.
- `House of the Dragon - Saison 3 (2026)` must be accepted against TMDB series origin 2022 when title/type/S3E1 are correct.

## Core identity 5.21.36 work — implemented source changes

Important commits after 5.21.35 include:
- `1723472`: ProviderBase runtime v9 migration introduced for episodic-year removal.
- `5b356ce`: `CORE.STREAM_IDENTITY.V1` shared catalogue identity API + movie-only year policy.
- `3600e8b`: ProviderBase delegates catalogue/HTML identity to `globalThis.__nuvioIdentityPolicyV1`.
- `491f1ba`: executable Core ownership regression for HOTD-like episodic year mismatch + strict movie year.
- `25e5148`: Workflow Gate includes identity ownership regression.
- `f62393a`, `fb76b5c`, `c1d8c43`: shared engine-v2 catalogue policy + Purstream HOTD S3E1 synthetic smoke.
- `398024c`: priority regression wording/contract changed to episodic-year-disabled/movie-only.
- `ef4073a`: ProviderBase provenance reports runtime reader v9.
- `a934df3`: one-shot Core identity ownership cleanup transaction.
- `c8bc366`: active-96 Provider JS Lego ownership test.
- `1d3a415`: identity-only ProviderBase materializer with `route_or_domain_mutation=false`.
- `d0824a8`: Kehflix-shaped final-row runtime regression: HOTD S03E01 survives, S03E02 rejects, movie year mismatch rejects.
- `9003a84`: MEMORY checkpoint recording the discovery that episodic year still indirectly influenced `contentLike()`.
- `c9e10ce`: migration strengthened to zero-year episodic identity v10; year cannot promote `contentLike()` for episodic requests.
- `8176123`: regression proves tv/series/anime produce the same decision with or without year.
- `a6f1b4bd`: authoritative retry workflow updated for v10.
- `ec8867c` + `7296e20`: Python test bootstraps fixed for direct Core Lego imports.
- `af73c025`: ownership test now inspects transformed ProviderBase snippets, not legacy source-anchor strings inside the migration tool.
- `c50806c`: Purstream contract accepts absent or empty `patch_scripts` as the same clean state; any non-empty legacy patch list remains forbidden.
- `05cce19c`: Purstream test aligned with real transport DATA: `published_types=[movie,tv]`, anime preserved semantically via `request_type_aliases={anime:tmdb_namespace}`.
- `e6ea30b`: Purstream recipe contract aligned with current DATA: `movieRoute=/stream/{id}`, `episodeRoute=/stream/{id}/episode?...`, `yearFields=[release_date]`; no `first_air_date` requirement for episodic identity.

## 5.21.36 publication attempts — exact state

**5.21.36 is NOT published at this checkpoint. Public manifest is still treated as 5.21.35.**

Workflow/run authority:
- Workflow: `MAIN - Core Identity Publication Retry 2`.
- Run: **34066073913**.

Earlier safe attempts:
- Run **34065556338**, job **101573573889**: failed before materialization because the one-shot Purstream migration expected one `strictIdentityScore(item, metadata, targetType)` occurrence but correctly found two (call + local definition). No publish.
- Retry run **34065727473**, job **101574024846**: cancelled/superseded before publication when zero-year v10 became authoritative.

Run 34066073913 progression:
- Initial job **101574939364**: migration and DATA scope passed; smoke failed only because `global_identity_policy_ownership_test.py` did not add `scripts/` to `sys.path`. No materialization/publish.
- Rerun job **101575336306**: bootstrap fixed; next failure was a test false-positive scanning `upgrade_provider_base_runtime_v5.py` source text and seeing the legacy validation literal `const movieIdentity...`. Runtime was not at fault. Fixed by inspecting only transformed ProviderBase snippets.
- Rerun job **101575867355**: **all smoke contracts passed**. Identity-only ProviderBase rematerialization itself passed **96/96**, then old Purstream contract failed because `patch_scripts` was omitted (`None`) rather than `[]`.
- Rerun job **101576053245**: all smoke contracts passed; ProviderBase rematerialization again passed **96/96**; old Purstream contract then failed because it expected `published_types=[movie,tv,anime]` instead of real `movie,tv` transport + semantic anime alias.
- Rerun job **101576310737**: all smoke contracts passed; ProviderBase rematerialization again passed **96/96**; old Purstream contract then failed because it expected historical `movieRoute=/media/{id}/sheet`. Current authoritative DATA says `/stream/{id}` and `yearFields=[release_date]`.

Repeated verified rematerialization line:
`IDENTITY_ONLY_PROVIDER_BASE_OK providers=96 unique_paths=96 common_digest=520ba9882661582dc4789f65e5d04c3c902fa22f79b1f436dc52823d845dd3fc runtime_reader=v9 route_or_domain_mutation=false`

Repeated smoke proof before the stale-contract blockers:
- global identity policy ownership: pass;
- Kehflix-shaped episodic identity runtime: pass;
- episodic zero-year regression: pass;
- engine-v2 Purstream adapter: pass;
- runtime media safety: pass;
- priority episodic-year-disabled/domain refresh regression: pass;
- native HLS integrity budget: pass;
- native provider loading compatibility: pass;
- global media resolver: pass;
- native dual IMDb/TMDB identity: pass;
- Provider v3 source plan v4 contract: pass.

The remaining transaction still must execute, on one successful run:
1. complete post-materialization Purstream contract;
2. recompose **all 96 active bundles** from common Base + existing DATA/CONFIG + Provider/Core Lego;
3. validate active-96 ownership and stream guards;
4. generate projections and synchronize release to **5.21.36**, bumping all 96 changed providers;
5. final reverse/static/ownership/integrity/fixed-point proof;
6. write final publication checkpoint to this file;
7. CAS-check `origin/main == base_sha` and atomically push publication;
8. verify public root/vf/no-anime/vf-no-anime manifests actually report 5.21.36 before telling the user to retest.

## Purstream current authoritative DATA relevant to this migration

- `published_types`: `movie`, `tv`.
- semantic anime request: capability alias `anime -> tmdb_namespace`, identity source `original_nuvio_request`.
- official site: `https://purstream.ad`.
- official API: `https://purstream.ad/api`.
- search route: `/search-bar/search/{query}`.
- movie stream route: `/stream/{id}`.
- episode stream route: `/stream/{id}/episode?season={season}&episode={episode}`.
- recipe `yearFields`: `release_date` only, used as movie catalogue evidence; episodic identity ignores year entirely.
- `strictIdentity=true`, `directSourcesOnly=true`.
- No provider-local identity algorithm is allowed; Core owns the semantics.

## Stream/player integrity

A URL or `#EXTM3U` response is not native playback proof. Keep separate:
1. extraction;
2. work/episode identity;
3. request context/headers;
4. playlist/variant resolution;
5. media/container integrity;
6. official native player outcome.

- `CORE.STREAM_SANITIZER.V6` is global and fail-closed on `probe_all_urls=true`.
- `tests/global_stream_output_guard_test.py` walks the 96 current manifest providers and requires one V6 managed sanitizer and terminal ordering.
- `tests/stream_output_sanitizer_fail_closed_test.py` executes fail-closed behavior.
- Historical Allwish ~20 s Interstellar result is a stream-level regression, not a reason to disable a provider. Allwish is not in current 5.21.35 manifest.
- Kehflix malformed MPEG-TS handling probes first media bytes when the runtime exposes them; lack of bridge byte access remains unknown rather than a fake provider-wide failure.
- HLS audio-child integrity `CORE.HLS_RUNTIME_INTEGRITY.V1` remains required.

## Five first-class Native Labs

Exactly five proofs:
1. TV Android — NuvioTV;
2. Mobile Android — NuvioMobile;
3. Mobile iOS — NuvioMobile;
4. Desktop macOS — NuvioDesktop;
5. Desktop Windows — NuvioDesktop.

Workflow mapping: Android matrix = TV + Mobile Android; Desktop matrix = macOS + Windows; iOS separate.

Runtime refs before final Labs:
- NuvioMobile audited/current: `68337ffac8578b986d0c3f6e432abf75f4a33521`.
- NuvioTV audited/current: `23d1fe478e380860dae3eb41c8770533361a0cc5`.
- NuvioDesktop last audited runtime-contract ref: `323c1037f3c0fbe0ebe255b77d42331c3fdeb2d7`.
- Desktop later advanced to `21aabeeb49fc6de835f9031a65cc5f8489419330`; compare showed player-shortcut/UI changes only, not provider/plugin runtime contract files.

## Security state

- Exact 5.21.35 publication SHA Default Setup CodeQL run: **34061759678**.
- Python analysis: success.
- GitHub Actions analysis: success.
- JavaScript/TypeScript was still pending at an older checkpoint; re-check final state rather than assuming.
- Final security completion also requires repository `SEC - CodeQL` / security-extended plus `npm audit --omit=dev --audit-level=high` on the final publication SHA.
- Direct code-scanning-alert enumeration is not exposed by current connector; never claim historical UI alerts were individually closed without evidence.
- Do not weaken CodeQL/security rules for green CI.

## Repository/documentation debts after runtime stabilization

Pending unless a later checkpoint says fixed:
- `CHANGELOG.md` was behind current release history.
- `VALIDATION.json` still carried stale release metadata.
- README EN/FR, `ARCHITECTURE.md`, `VALIDATION.md`, and Domain Refresh docstring contained old official-site-only wording.
- `ARCHITECTURE.docx` must be regenerated/rechecked after final architecture wording.
- `.github/triggers/nuvio-client-lab.json` contained stale release/frozen route counters and should derive current truth instead.
- `automation/provider-v3-architecture.json` / ownership tests contained older branch-based publication assumptions; durable model is one workspace + CAS + atomic main commit.

## Domain Refresh — diagnosed, intentionally deferred until common runtime is stable

Current `refresh_authoritative_hub_domains.py` tries to reconcile terminal-domain derivatives, but the transaction has known inconsistencies:
1. scope validator/tests still encode old official-site-only mutation;
2. `update_provider_v3_domain_config.py` updates only `officialSite` instead of rebuilding full CONFIG from current structured source authority;
3. updater can emit old filename shape rather than source-qualified current publication shape;
4. generic old-host -> new-host logo/icon/favicon reconciliation still needs synthetic proof.

Required later fix: source authority + allowed scope gate + full CONFIG projection + source-qualified filename preservation + synthetic A->B tests + docs. ProviderBase/Core bytes must remain unchanged for domain-only updates.

## User Desktop HOTD S3E1 evidence on published 5.21.35

User supplied `nuvio-ux-20260907-001220.log`.

Observed chain:
- IMDb `tt11198330`, TMDB `94997`, type `series`, title `House of the Dragon` resolve correctly.
- Stream request reaches `type=series id=tt11198330:3:1`.
- `StreamsRepo Found 0 addons...` is ordinary addon-list state, not proof zero NiakVIO Provider JS ran; PluginRuntime network calls follow.
- Visible provider requests then include DNS failures for YFlix family, Nakios, Peachify and VidLink.
- Current priority is **not** a full route/domain sweep yet. First stabilize common TV/series/runtime architecture and already-viable providers such as Purstream/Kehflix; route census/repair across all 96 follows later.

## Active completion sequence

1. Finish 5.21.36 transaction through active 96-bundle recomposition, versioning, reverse/static/integrity and atomic publication.
2. Verify public 5.21.36 manifests and final active Provider JS ownership.
3. Have user re-test real Desktop HOTD S3E1; separate common-runtime results from route/network failures.
4. Stabilize any remaining common TV/series/player issues without narrowing provider scope.
5. Resume full real-route/domain recovery across **all 96**, testing routes live as they are discovered.
6. Fix Domain Refresh transaction defects.
7. Run complete five Native Labs on one exact final candidate SHA.
8. Finish Workflow Gate/security/dependency/CodeQL proof on final SHA.
9. Clean docs/machine architecture contracts/trigger metadata and regenerate `ARCHITECTURE.docx`.
10. Final branch/PR hygiene audit and final `MEMORY.md` checkpoint with exact SHA/run/artifact IDs.

## Completion principle

A green structural workflow is not proof that the 96 providers work. A native client failure is not automatically a provider failure. Keep identity, route/network, extraction, sanitizer, and player evidence separate; fix common NiakVIO-owned root causes at their owning layer; never delete providers, weaken validation, invent routes, or patch official clients to manufacture success.

## 2026-09-07 — Route reconstruction authority bug / proof-first redesign

- Critical architecture bug confirmed in `scripts/discover_candidates.py`: `infer_api_recipe()` can concatenate static route fragments (`search`, `stream`, `media`, `sheet`, `episode`) into executable `movieRoute`/`episodeRoute` templates without proving that the fragments form one real provider endpoint.
- `clean_provider_model()` also merges `patch.learned_routes`, `capability.routes`, and static `knowledge.routes` directly into executable `model.routes`; static observation therefore can leak into runtime Provider DATA before HTTP proof.
- `validate_provider_v3_routes_sequential.py` already contains the correct proof model in `derive_observed_route()`: start from an exact HTTP request observed while executing that provider, abstract only fixture values into placeholders, and refuse promotion when literal content/session/token residue remains.
- A second leak exists in sequential finalization: candidate `apiRecipe` is copied back to executable `apiRecipe` wholesale after route validation instead of filtering route fields by live proof.
- A third leak exists in `materialize_provider_v3_one.py`: `reconcile_provider_authority()` can copy `model.apiRecipe` back into `provider-overrides.api_recipe`, re-promoting stale/static recipe authority.
- `scripts/materialize_provider_v3_all.py::provider_model()` also merges static model routes/API recipe into the runtime model, so reconstruction must be changed to candidate-vs-executable separation.
- Final route model: **static/upstream/recognition data = candidate only; executable route/API recipe = provider-specific live HTTP proof only**. A route proof must preserve method, origin/base, route template, query/body fields, headers needed, semantic role/type, and evidence; static fragments never count as HTTP proof.
- `/stream/{id}` was NOT introduced by the current identity work. It was already in Purstream DATA on 5.21.35. Current Purstream engine adapter instead uses movie detail `/media/{id}/sheet` and episodic `/stream/{id}/episode?...`, exposing an existing route-authority inconsistency. Do not repair Purstream routes opportunistically inside the identity release; requalify them under the new proof-first route model.
- Next mandatory execution: patch reconstruction authority, reconcile all current routes to candidates, sequentially execute/requalify all 96 Provider Objects, persist only live-proven reusable routes, regenerate the 96 Provider v3 bundles from sanitized DATA, then run reverse/static/integrity proof before publication/testing.

## 2026-09-07 — Route-proof reconstruction/bootstrap architecture checkpoint

- User requires `MEMORY.md` to be updated automatically at each important architecture correction/failure/publication checkpoint without being reminded.
- Historical Provider JS route recovery uses the three original provider-source repositories: `Gowaru/gowaru-nuvio-providers`, `NuvioPlugin/All-in-One-Nuvio` (fallback `D3adlyRocket/All-in-One-Nuvio`), and `yoruix/nuvio-providers`. NuvioTV/NuvioMobile/NuvioDesktop are client validation repos only and are never route sources.
- `automation/provider-upstream-parity.json` currently maps **91/96** providers to an upstream source; five providers have no historical upstream mapping: `4khdhubnew`, `cinemm`, `goatapi`, `kehflix`, `toflix`.
- Last parity classification counted 19 `upstream_ok_niakvio_ko` providers, proving NiakVIO route/plan reconstruction regressed real upstream behavior for a nontrivial subset.
- Exact historical upstream bytes should be recovered from `upstream-lkg.json` using recorded provider URL + SHA-256 + capture time. If current raw bytes differ, search upstream Git history for the matching SHA. Current upstream is fallback; NiakVIO-native current source is only fallback for providers without usable upstream history.
- Static extraction is **candidate knowledge only**. It must never manufacture executable routes by concatenating fragments. The old `discover_candidates.py::infer_api_recipe()` / `clean_provider_model()` behavior that promoted static route fragments into runtime `routes/apiRecipe` is an architecture bug and is being replaced.
- Runtime route authority is proof-first **v5**: execute the Provider JS; capture exact sanitized HTTP request structure; capture bounded response identity hints; correlate later request values to prior provider responses; derive placeholders only from proven fixture/dataflow values; require successful provider HTTP evidence; then and only then promote executable DATA.
- `scripts/provider_route_proof.py` is the shared route-proof authority. It proves `search -> internal provider id -> later request` chains. A literal internal id such as `525` must never become `{id}` unless a previous provider response in the same trace proved that value.
- `scripts/bootstrap_provider_v3_routes.py` is the permanent bootstrap path for a **new empty provider**: input is provider source JS + provider id + supported semantic types; no prior `routes` or `apiRecipe` is required. It observes runtime HTTP and produces proof-v5 route DATA. `tests/provider_v3_empty_route_bootstrap_test.py` locks this zero-route onboarding contract.
- Difficult SPA/React/Next-like providers are not handled by guessed framework-specific routes. Runtime execution + network trace + response->request dataflow is the general fallback. Kehflix is explicitly one of the five NiakVIO-native/recent providers and historically accumulated many generic candidate routes, so it is a key proof case for this model.
- `scripts/upgrade_provider_worker_route_proof_v1.py` adds opt-in proof tracing to the hardened provider worker: exact sanitized URL, method, reproducible non-sensitive headers, body shape/values, content type, and bounded response id/slug hints. Existing health diagnostics remain separate.
- Request proof is not URL-only. `scripts/upgrade_provider_route_proof_request_spec_v1.py` abstracts request body/header fixture values (`{query}`, `{tmdbId}`, `{id}`, `{season}`, `{episode}`, `{media}`, `{year}` when merely transported) and rejects unresolved fixture/session residue.
- `scripts/upgrade_provider_base_route_requests_v1.py` teaches the **common ProviderBase** to replay structured `directRequest/searchRequest/movieRequest/episodeRequest` DATA including GET/POST/PUT/PATCH/DELETE, JSON/form body templates, and request headers. Provider-specific algorithms remain forbidden; request facts live in DATA.
- `scripts/recover_provider_routes_from_upstreams.py` is the 96-provider recovery/census harness. It uses upstream/LKG source where available, NiakVIO-native source for the five unmapped providers, runtime proof-v5, and produces a durable route recovery report.
- `scripts/upgrade_route_recovery_request_specs_v1.py` separates all HTTP-proven route observations from the subset safe for generic `routes[]` replay. POST/body/Referer/etc. requirements must not be lost merely because the URL was correct; complex calls belong in `routeData/apiRecipe` with request specs.
- `scripts/upgrade_provider_route_authority_v5.py` makes proof-v5 mandatory for runtime `routes/apiRecipe`: static discovery emits `candidateRoutes/candidateApiRecipe`; materialization only consumes executable routes when `route_proof_version >= 5` and recipe `proofModelVersion >= 5`; sequential finalization filters candidate recipes field-by-field against live routes instead of copying the candidate recipe wholesale.
- Generic catalogue preflight must no longer require `year`. Movie-year identity remains Core-owned; TV/series/anime year has zero identity influence.
- Provider JS architecture remains: common ProviderBase + structured DATA/CONFIG + PROVIDER.* Lego + CORE.* Lego. Reconstruction/discovery tooling is never embedded as provider-specific runtime business logic.
- Public release remains **5.21.35** until the new route-proof census + 96/96 reconstruction + reverse/audit/integrity + version sync are actually green and a later checkpoint records a verified bump.

## 2026-09-07 — Route-proof reconstruction run 34069211303 failure

- Workflow , run **34069211303**, job **101583333823**, failed safely in workspace before route census, DATA application, reconstruction or publication. Public release remained 5.21.35.
- Baseline freeze passed: 5.21.35 / 96 providers.
- , worker route-proof v1, request-spec proof v1 and ProviderBase runtime v9 all applied successfully before the failure.
- Failure was migration cardinality only:  assumed the legacy  call was unique for directRoute, but ProviderBase has exactly three stable call sites: directRoute, catalogue search, movie/episode resolve. It raised .
- No census was executed and no route result from this run is authoritative.
- Commit  fixes the upgrader to require cardinality exactly 3 then replace the three calls deterministically in stable semantic order.

## 2026-09-07 — Purstream HOTD S3E1 final proof requirement

- User explicitly requires a final **real Purstream → House of the Dragon S3E1** proof after the 96/96 route-proof reconstruction/audit. It must not be satisfied by the synthetic engine smoke alone.
- The final Purstream test must exercise the real provider/network path for HOTD S3E1, verify `tv`p/`series` transport and season=3/episode=1, and prove that the provider-side 2026 season year is not rejected against TMDB series origin 2022.
- Do not consider the next release publishable until this Purstream HOTD S3E1 check is green or is precisely classified as the remaining real-world blocker with evidence.

## 2026-09-07 — Route-proof reconstruction run 34069559315 failure

- Workflow , run **34069559315**, job **101584262866**, again failed safely before census/DATA application/reconstruction/publication. Public release remained 5.21.35.
- The previous ProviderBase request-spec cardinality bug was fixed:  passed.
- New blocker was another migration-anchor bug in : it searched exactly for  but  currently imports ; failure was .
- Commit  fixes this by injecting  before the stable  anchor and requiring that stable anchor exactly once.
- No provider route census result exists yet from runs 34069211303 or 34069559315; both failed before the live census step.
- Final candidate pipeline now includes a mandatory real Purstream / House of the Dragon S3E1 proof after reverse/static/integrity: both  and canonical  transports must return streams, have successful provider HTTP, and expose an observed episode request.


## TV runtime regression checkpoint — 2026-09-07

- User refreshed the current NiakVIO plugin on NuvioTV during route-proof work. Concrete native observation: Interstellar now returns streams from multiple providers; series/anime also return streams for some providers, but results can arrive much later after navigating away and appear to stack across works.
- This means series/anime are not globally broken. A major remaining systemic problem is stale provider work that keeps consuming the QuickJS/native fetch bridge after the user changes work.
- `CORE.MEDIA_TYPE_RESOLUTION.V1` currently has `requestSerial/requestToken` latest-result gating, but its `budgetedFetch()` is not bound to the invocation token. Superseded invocations can continue network/crawl work; because `global.fetch` is replaced by a later invocation wrapper, an older invocation may even execute later fetches under the newer request budget. Fix must be global/Core, never provider-specific.
- Required cancellation invariant: every provider invocation owns a request token; every wrapped fetch checks ownership before network and immediately after network; starting a newer invocation aborts the prior in-flight controller when supported; on runtimes where native bridge cancellation is not actually possible, the old in-flight call may finish but MUST NOT start any subsequent search/detail/player/crawl work or return output.
- Current platform contract says QuickJS clients expose AbortController/AbortSignal polyfills, but lifecycle teardown across already-entered native fetch remains not universally guaranteed. Therefore token gating remains mandatory even when abort is attempted.
- Native TV also exposed `Purstream - Inconnue` and `StreamZo - Inconnue`. Correct policy is NOT to discard quality blindly. `CORE.STREAM_FACTS`/`CORE.STREAM_PRESENTATION` must first recover a real quality from provider facts (`quality`, title/name/description, resolution/height, URL/manifest-derived facts). Only when no real quality can be recovered may the placeholder field (`Unknown`, `Inconnu`, `Inconnue`, `N/A`, null, etc.) be removed before terminal branding. Preserve real qualities such as 2160p/1080p/720p.
- Route-proof run #5 `34070914957`, job `101588047149`, materially progressed: migrations/proof-first tests/census/DATA apply/materialization reached green; candidate materialization was 96/96. The first failing post-materialization stage was prune/projection because `scripts/prune_unreferenced_providers.py` performs repeated per-file `git log --follow` calls while bootstrapping retention order and exceeded the bounded stage timeout. This is CI/tooling performance debt, not a provider runtime failure.
- Prune must be fixed by a batched Git-history scan/cache (single/bounded Git history traversal), preserving the rolling 10-generation retention semantics and all current/LKG/provenance/security protections; do not merely raise timeout.
- Final acceptance still requires rerun 96/96 -> reverse/static/integrity -> quick-yield -> real Purstream House of the Dragon TMDB 94997 S3E1 in both `series` and `tv`, plus the native-facing cancellation and quality regressions fixed.


## TV shared-runtime repair run 1 — 2026-09-07

- One-shot workflow `MAIN - TV Runtime Repair`, run **34072829930**, job **101593230828**, failed safely in the migration step before tests/commit/publication.
- `CORE.MEDIA_TYPE_RESOLUTION.V1` latest-request/cancellation patch applied successfully in the ephemeral workspace; failure occurred afterward because the `STREAM_FACTS` migration anchor still used old local variable name `r` while current Core source uses `row`.
- No generated provider, manifest, DATA or public version changed from this failed run.
- Fix the migration anchor against current `global_stream_facts_v1.py`, then rerun the full focused cancellation + quality + batched-prune test set before committing any Core repair.


## TV shared-runtime repair run 2 — 2026-09-07

- `MAIN - TV Runtime Repair` retry run **34073021357**, job **101593778197**, failed safely in migration validation before focused tests/commit/publication.
- The current-source `STREAM_FACTS` prepatch succeeded (`STREAM_FACTS_QUALITY_V2_PREPATCH_OK`) and wrote the intended richer quality-fact logic in the ephemeral workspace.
- Failure was only the upgrader's own stale validation literal: it still required `r&&r.resolution` / `r&&r.height`, while current `global_stream_facts_v1.py` correctly uses `row&&row.resolution` / `row&&row.height`.
- No provider bundle, manifest or public version changed. Fix the migration validator, then rerun the full focused cancellation + quality + batched-prune suite.


## TV shared-runtime repair run 3 — 2026-09-07

- `MAIN - TV Runtime Repair` run **34073127250**, job **101594076771**: all three migrations succeeded in workspace (latest-request cancellation, quality recovery, batched prune history).
- The new **functional cancellation regression passed**: observed calls were exactly `/1/one` then `/2/one`; the superseded request's catch/fallback `/1/two` never reached network. This directly proves latest-request-wins for the stale-fallback shape reported on NuvioTV.
- The run then failed before executing the quality behavior because `tests/stream_quality_recovery_tv_test.py` imported `global_stream_presentation_v1.py` without adding `scripts/` to `sys.path`, causing `ModuleNotFoundError: provider_patch_blocks`.
- This is a test bootstrap defect only. No Core repair was committed and no provider/manifest/public version changed. Fix the test import path and rerun the complete focused suite; do not alter the proven cancellation behavior.

### TV shared-runtime repair — final consolidated checkpoint (2026-09-07)
- Retry 4: Actions run `34073319355` proved stale-request cancellation but exposed that `resolution: 1920x1080` was not converted to `quality: 1080p`.
- Retry 5: Actions run `34073668673` proved cancellation, Purstream/StreamZo quality recovery (`1080p`, `1080p`), and batched prune; it then exposed a stale runtime-only-TMDB test bootstrap.
- Retry 6: Actions run `34073743529` restored full presentation metadata but exposed two TMDB requests for one movie invocation.
- Retry 7: Actions run `34073960958` had zero jobs because checkpoint text escaped the YAML block; no Core/product code executed.
- Retries 9/10 (`34074004747`, `34074084167`) proved the duplicate was not solved by presentation reuse alone: MEDIA_TYPE clears transient `__nuvioMediaContext`, while its durable cache is populated only after the inner identity layer has already run.
- Retry 11: Actions run `34074160651` instrumented the exact requests. The first was STREAM_IDENTITY's legacy lightweight `append_to_response=external_ids`; the second was MEDIA_TYPE's canonical rich metadata request. Final cache key was `movie:157336`.
- Retry 12: Actions run `34074347630` applied shared TMDB ownership successfully, then stopped on the obsolete identity revision literal in a test.
- Retry 13: Actions run `34074404812` passed cancellation, quality, prune, media resolver, full identity semantics and presentation V20. It then exposed that `global_stream_presentation_metadata_fallback_test.py` expected TMDB metadata without injecting the required runtime-only TMDB credential.
- Final repair run: Actions run `34074478047`. STREAM_IDENTITY delegates TMDB metadata acquisition to `__nuvioCoreGetTmdbDataV1` when installed, so identity, media-type and presentation share one canonical cache/network owner; the legacy lightweight call is compatibility-only when the shared capability is absent.
- Shared Core acceptance: stale A→B network sequence only `/1/one`, `/2/one`; Purstream/StreamZo quality fixtures both `1080p`; batched prune retention; media-type + identity contracts; exactly one movie TMDB request through the full presentation pipeline; metadata fallback under explicit runtime credentials; sanitizer fail-closed/direct-normalization.
- Public manifest remains `5.21.35` until the separate 96/96 route-proof reconstruction, reverse/static/integrity, quick-yield, real Purstream HOTD S3E1 `series` + `tv` proof, and publication transaction are green.

## 2026-09-07 — Route-proof runs 8–10 / HOTD dual-provider checkpoint

- Shared runtime repair is durable on `main` from commit `0162eeeb85763ced98fb090ad09f7260bfb600ae`: stale-request cancellation A→B, real stream-quality recovery, batched prune history, shared TMDB ownership/cache, presentation and sanitizer focused regressions all passed together in run `34074478047`.
- Route-proof reconstruction run #8 `34074736796` reached census/DATA/materialization/prune/runtime/cardinality green. First reverse blocker was legitimate: MOVIX had been re-enabled even though census classified it `no-proven-route` with zero proven routes. Route-proof activation policy was added so MOVIX remains disabled/neutralized until a future positive route proof; it never auto-enables on proof alone.
- Route-proof reconstruction run #9 `34075701458`, job `101601231061`, proved census **96/96** with `91` historical-upstream mappings + `5` NiakVIO-native providers, `46` providers with proven routes, `310` proven routes, `23` simple API recipes, and zero source-unavailable providers. MOVIX stayed `enabled=false` through DATA application, materialization, prune and 96-provider cardinality.
- Run #9 also passed reconstructed 96 runtime/Core ownership, global stream output guard, episodic zero-year policy, native HLS budget, provider-loading compatibility, media resolver and dual-ID tests. Reverse then failed only on a stale Purstream type assertion: it expected `supportedTypes=[movie,tv]` even though current architecture separates canonical semantic capability from client transport compatibility.
- Purstream type contract is now explicit: `canonicalSupportedTypes=[movie,tv]`; transport compatibility exposes `supportedTypes=[movie,tv,series]`, where `series` is a Nuvio transport alias for canonical `tv`. Reverse checker commit `c1c022609b202ec36f49cb77d5486db89017d1f9` validates this split instead of rejecting the required `series` lane.
- User requires final real **House of the Dragon S3E1** proof to test **both Kehflix and Purstream**, on both `series` and `tv` transport. Expected diagnostic pattern supplied by user: **Kehflix OK / Purstream NOT OK**. Do not force that result; measure and report the real per-provider verdict. Kehflix is the required positive control; Purstream is diagnostic at this stage.
- This supersedes older MEMORY wording that required Purstream itself to be green before the route-proof run could complete. Current acceptance is: **Kehflix must be OK**; Purstream must be measured and reported exactly. If the measured pattern is Kehflix OK / Purstream NOT_OK, preserve that report and wait for the user's follow-up explanation before deciding whether publication may proceed with the Purstream diagnostic blocker.
- Latest completed census before run #10: Kehflix = `proven`, 5 reusable route patterns; Purstream = `no-proven-route`, 0 proven routes despite two provider requests per Interstellar / Breaking Bad S1E1 / HOTD S3E1 fixture and an accessible server. Do not call Purstream candidate/static paths "new routes".
- Purstream candidate-only paths currently retained for recognition/recovery, NOT executable route authority: `/search-bar/search/{query}`, `/stream/{id}`, `/stream/{id}/episode?season={season}&episode={episode}`, plus the official status hub candidate. `route_proof_version=5`, `provenRouteCount=0`, `learned_routes=[]`.
- Kehflix proven reusable patterns in the same census are `/api/streams/movie?id=&k=`, `/api/streams/tv?id=&k=`, `/api/streams/episode?id=&season=&episode=&k=`, `/api/stream-gw`, `/api/track-view` on `https://kehflix.lol`.
- Final live probe is `scripts/hotd_s3e1_live_probe.py`; it executes the reconstructed Kehflix and Purstream Provider JS through the hardened worker separately for `series` and `tv`, records stream count / provider HTTP success / episode-route observation, and emits `automation/hotd-s3e1-live.json` without printing stream URLs. The script exits non-zero only when required positive control Kehflix fails.
- Route-proof run #10 `34076409932` is triggered from commit `4229ae02b95625c8cc3d2fba4834ba12d8f56fd0` after the Purstream canonical/transport reverse assertion fix. Its 96-provider census and DATA/activation-policy step are green; materialization/prune are green and runtime tests were running at the latest checkpoint. Public manifest is still **5.21.35**; no 5.21.36 publication is accepted yet.
- Publication rule: do **not** reuse the old identity-only 5.21.36 workflow. If route-proof + reverse/static/integrity + quick-yield + HOTD proof succeeds, promote the **exact validated artifact** rather than running a second network census, revalidate the current cancellation/quality/TMDB Core and MOVIX neutralization, then CAS-push and verify all public manifest projections post-push.
- Documentation debt added by user: after runtime/publication stabilization, replace user-facing/documentation terminology **"Lego"** with a generic term such as **block / Core block / Provider block**. Preserve marker semantics and compatibility while removing trademarked wording from docs/log labels/names where practical. Do this as a later clean step, not inside the current functional run.
- User explicitly reminded that `MEMORY.md` must be updated at every important state transition. Treat this as a hard execution rule: checkpoint significant red/green runs, root-cause fixes, publication changes and final proofs before moving on.

## 2026-09-07 — Route-proof run 10 reverse green / static-audit naming failure

- Route-proof run #10 `34076409932`, job `101603292174`, completed failure safely before quick-yield/HOTD/publication. Public release remains `5.21.35`.
- Run #10 census: 96 providers, 91 historical-upstream mapped + 5 NiakVIO-native, **47 providers with proven routes, 303 proven routes, 23 simple API recipes, 0 source-unavailable**. This differs slightly from run #9's 46/310 because live route proof is network-dependent; catalogue cardinality and source mapping remained stable.
- Purstream remained `no-proven-route`, 0 proven routes. Kehflix remained `proven`, 5 reusable routes. MOVIX remained `no-proven-route`, 0 routes and `enabled=false` through DATA policy, materialization, prune and cardinality.
- Full 96 Provider JS materialization, prune/projections/config validation, reconstructed runtime/Core ownership, stream-output guard, episodic-zero-year, HLS, native-loading, media resolver and dual-ID tests all passed.
- **Reverse reconstruction passed byte-identical 96/96**: `PROVIDER_V3_REVERSE_REBUILD_OK providers=96 generation=66809df74d148b02 byte_identical=96/96`.
- The next command `audit_provider_v3_static.py` failed on `anime-sama-aaa6dc71f60a1d3e.js` even though the computed SHA prefix was exactly `aaa6dc71f60a1d3e`. Root cause: the static audit only accepted final publication filename shape `provider--source--hash.js`, while route-proof workspace materialization intentionally uses `provider-hash.js`.
- Correct fix: make the static audit context-aware. `publication=false` / workspace must require the exact simple content-addressed materialization filename; `publication=true` / release/main must retain the stricter source-qualified publication filename. Do not weaken final publication naming validation.
- Quick-yield and final HOTD Kehflix/Purstream proof were skipped because static/integrity stage failed first. No HOTD verdict exists from run #10.

## 2026-09-07 — Workflow Gate source-v10 alignment

- `CORE - Workflow Gate` run `34077502006` on route-proof source SHA `914048e5de06c3adab0cf348cd932265ecd0a936` failed in workflow architecture contracts because direct source tests still asserted obsolete identity revision `cross-client-shared-catalogue-policy-movie-year-only-v9`.
- This was source-test metadata drift, not a provider/runtime regression: the repository `global_stream_identity_v1.py` is already `cross-client-shared-tmdb-owner-movie-year-only-v10`, while route-proof workspace migration subsequently upgrades the candidate to combined `cross-client-shared-tmdb-owner-zero-episodic-year-v11`.
- Commits `2064b526a51d8ccda375b47bb981a137dad6e938` and `181ec48edd3847be1a40400aefe6e8db47839e50` align only the direct-source revision assertions in `priority_tv_year_domain_refresh_test.py` and `global_identity_policy_ownership_test.py` with source v10. The full behavioral assertions were preserved; no Provider/Core/DATA/manifest byte changed.
- `CORE - Workflow Gate` run `34077884061`, job `101607483550`, then completed **success**: pinned Actions, Python syntax, multi-device runtime contract, workflow architecture contracts, native provider-loading compatibility and side-effect-purity all passed.
- These test-only commits did not trigger or mutate route-proof run `34077501994`; that candidate remains fixed to source SHA `914048e5de06c3adab0cf348cd932265ecd0a936`.
- Exact-artifact publication may allow these two named test-only drifts after the route-proof source SHA, but any product/runtime/DATA/manifest drift must still require a fresh route-proof candidate.

## 2026-09-07 — Route-proof run 11 integrity / pre-release validation checkpoint

- Route-proof run #11 `34077501994`, job `101606427031`, source SHA `914048e5de06c3adab0cf348cd932265ecd0a936`, passed baseline, proof-first migration tests, 96-provider census/DATA application, materialization, prune/projections, reconstructed runtime/Core tests and 96-provider cardinality.
- Run #11 also passed reverse reconstruction **96/96 byte-identical**, the context-aware static audit, and release-hash generation. It failed only in release-integrity activation preservation because `health-report.json` still carried an older MOVIX promotion row with `enabled=true` while the proof-v5 manifest/override policy correctly kept MOVIX `enabled=false` with zero proven routes. Quick-yield and HOTD were therefore skipped; run #11 produced no HOTD verdict.
- MOVIX fix is explicit proof-v5 evidence, not a generic network-failure exception: `published-disabled-no-proven-route` + `route_proof_no_proven_route` requires schema/proof v5, current `provider-route-recovery-v5` authority and zero proven routes. Future positive route proof removes the stale zero-route reason but never auto-enables MOVIX. Durable commits: `910b5669366818a419b8e091d122d9d49e8c317a`, `db4f52f7f16377abec6736ba99236003013e4ba0`, `220829104086af20f755e588510f57fcf63b744d`, `cd26ee3af00d5506a01769616a70dcba5d4cc71a`.
- Media capability documentation/tests were reconciled with runtime truth: canonical semantic values remain `movie/tv/anime`; `series` is transport-only; episodic anime/tv expose `tv+series`; anime never gains artificial movie capability. Machine/test commits include `3febf63ce11610f53fd27f2dedc55ca48f60cf20`, `6ecd053bb4571b86f987dc61092625e980916586`, `5b84350454db6f3f368bf9922df2ffd3f0b1db1e`.
- Public/static filename audit now uses explicit execution context: route-proof sets `NUVIO_PROVIDER_V3_CONTEXT=workspace` and requires `provider-hash.js`; unspecified/public execution fails closed to source-qualified `provider--source--hash.js`, even if historical materialization metadata still says workspace. Commits `64d89c58901082971a86dcab05893e975b848baa` and `2e3c1d9a8bb8cede580af1e9f70e49cd7c0c88d9`.
- Workflow Gate run `34090076713` on `2e3c1d9a8bb8cede580af1e9f70e49cd7c0c88d9` is fully green. CORE Quick run `34090076686` validates public docs/types/five-Lab contract, minimizer, HTML security, strategy plan and static audit, then reports source-vs-public Core block non-idempotence because unreleased 5.21.36 Core source is ahead of the accepted 5.21.35 published bytes. That pre-release drift is not used as candidate proof; candidate authority remains reverse byte-identical reconstruction.
- Public manifest remains **5.21.35**. Next action is route-proof retry 8 through quick-yield and real HOTD S3E1 Kehflix + Purstream (`series` + `tv`). If measured result is Kehflix OK / Purstream NOT_OK, preserve the report and stop before publication for the user's Purstream explanation.

## 2026-09-07 — HOTD targeted acceptance: Kehflix OK / Purstream NOT_OK

- Public remains **5.21.35**; no publication was performed.
- Full route-proof retry 9: run `34091368865` reached census 96/96, DATA apply, materialization 96/96, runtime/Core-block tests, cardinality, reverse `96/96 byte_identical`, static audit, release integrity and quick-yield. Census: 96 providers, 91 historical upstream + 5 NiakVIO native, 46 providers with proven routes, 311 proven routes, 23 API recipes, 0 source-unavailable.
- Retry 9 HOTD initially measured Kehflix NOT_OK / Purstream NOT_OK. Kehflix reached HTTP episode routes but returned zero streams; Purstream was still zero.
- Root cause 1: proof-v5 generalized signed/identity query calls too aggressively (`id=&k=` etc.) and even rewrote literal `User-Agent: NiakVIO/3` into `NiakVIO/{season}` for S3. Added `scripts/upgrade_route_proof_dataflow_safety_v2.py` + `tests/route_proof_dataflow_safety_v2_test.py` to preserve literal static headers, reject blank signed routes as executable, and preserve a richer runtime plan over weak observations.
- Kehflix terminal discovery run `34094560163`: `kehflix.lol` is redirect-only to `kehflix.com/`; both `kehflix.com` and `kehflix.wiki` preserve `/title/tv/94997-house-of-the-dragon`. The detail page exposes a signed `/player` URL. The signed HOTD S3E1 episode API returned media-like values: `.com`=1, `.wiki`=5. Canonical runtime terminal chosen for the repair: `kehflix.wiki`, alternate live terminal `kehflix.com`.
- Added `scripts/upgrade_kehflix_terminal_domain_v1.py` and `scripts/upgrade_signed_player_api_v1.py`. The signed-player family now executes deterministic TMDB detail -> signed player -> episodic stream API dataflow instead of assuming a direct unsigned `/player?tmdbId` call is sufficient.
- Targeted real HOTD run **`34095052891`** materialized only Kehflix from current Core + structured DATA and then executed the same final probe against Kehflix + Purstream in both `series` and `tv`.
- **ACCEPTED TARGET:** Kehflix `OK`: `series_streams=6`, `tv_streams=6`, HTTP=true, episode route=true for both transports. Purstream `NOT_OK`: `series_streams=0`, `tv_streams=0` (provider HTTP and episode route were reached in this targeted baseline). `HOTD_S3E1_EXPECTED_PATTERN kehflix=OK purstream=NOT_OK matched=true`.
- Per user instruction, stop before publication/full next retry at this exact pattern and wait for the user explanation about Purstream.
- Purstream current structured/upstream route family to preserve for the next discussion: domain discovery `https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json`; search `/search-bar/search/{query}`; movie `/stream/{id}`; episode `/stream/{id}/episode?season={season}&episode={episode}`; API base is dynamically `https://api.purstream.<current-tld>/api/v1` with matching site Referer.
- Cleanup reminder after final publication: replace the word `Lego` in docs/workflow labels with a neutral term such as `block`/`bloc`.

## 2026-09-07 — Route-proof 5.21.36 final publication

- Exact validated artifact: route-proof run `34096200193`, source `8173adc4db674189ccc3169fe9ffe90043790d21`.
- Public filename projection preserved provider bytes; reverse rebuild remained 96/96 byte-identical and static publication audit passed.
- Published release target `5.21.36`, 96 providers. Kehflix HOTD S3E1 proof is OK (6 series / 6 tv); Purstream remains NOT_OK diagnostic pending operator explanation.


## 2026-09-07 — Accepted 5.21.37 / Terminal Session V29 / live-yield checkpoint

- **This checkpoint supersedes all earlier wording that says the public release is still 5.21.35 or that 5.21.36/5.21.37 is pending.** Current public release is **5.21.37**.
- Publication workflow: `FIX - Publish Terminal Session V29`, run **34120732027**, job **101737919476**, completed success.
- Final publication commit: **`6f74939efa11b2c886e82002c242b923a4f87f6c`** (`fix(core): publish terminal labels and stale-session isolation V29`). Push to `main` completed successfully.
- Public manifests verified after push: `manifest.json`, `vf/manifest.json`, `no-anime/manifest.json`, and `vf-no-anime/manifest.json` all report **5.21.37**.
- 96/96 published Provider JS were rematerialized and physically verified to contain `tmdb-data-contract-launch-gate-v29-native-abort-race`, `requestAbortPromise(controller,requestToken)`, and presentation client-projection V20.
- V29 closes the stale-session hole where a native QuickJS fetch bridge may ignore `AbortSignal`: provider fetch now races the native call against request cancellation. Functional regression with an intentionally never-resolving old native fetch completed in ~1 ms after supersede and observed only `/1/one` then `/2/one`; superseded fallback `/1/two` never reached network.
- Terminal stream-label bug was localized outside provider-specific quality calculation: Engine V2 accepted labels such as `Kehflix - Inconnue` as provider names. Engine V2 now strips terminal placeholder suffixes and mirrors final projected `title` into `name`, matching the client-facing Core projection. Placeholder quality (`Unknown`, `Inconnue`, `N/A`, etc.) collapses to provider-only; meaningful qualities remain, including `1080p` and `2160p -> 4K`.
- `CORE.STREAM_SANITIZER.V6` output guard passed across all 96; release integrity and fixed-point override checks passed.
- Nuvio client upstream drift seen during release: NuvioDesktop audited contract remained accepted; NuvioMobile had a safe upstream advance; NuvioTV had a separate semantic-sensitive subtitle-cache drift requiring review. Provider publication intentionally continued against pinned audited client contract refs.

### Live yield on exact 5.21.37 candidate

- Interstellar matrix tested **55 enabled movie-capable providers**. Only **6** returned automatic streams: `castle`, `hindmoviez`, `streamflix`, `streamzo`, `videasy`, `wookafr`. VF automatic providers: **2**, `streamzo` + `wookafr`. **49/55** returned no streams. This is materially better than the earlier native observation of only StreamZo/Kehflix/Castle in one client session, but still far below the 96-provider objective and must not be considered provider recovery completion.
- Notably Kehflix returned zero in the CI Interstellar matrix even though it is a known viable provider in other live/native fixtures; treat this as route/runtime/fixture evidence, not provider-wide disablement.
- User Desktop anime fixture was correctly identified as **The Unwanted Undead Adventurer S01E02**, IMDb `tt30177477`, not Hell Mode. Candidate matrix tested **62 episodic/anime-capable providers**: **2 positive** (`anime-sama`, `neko-sama`), network reached **49**, successful provider HTTP **37**.
- Secondary Hell Mode S01E12 (`tt38646634`) matrix produced the same provider-positive set: **2/62**, `anime-sama` + `neko-sama`; network reached 49, successful HTTP 36.
- These anime results prove the global `series -> tv/anime` transport is not completely broken, but extraction/runtime route yield is still severely underperforming after successful network access for many providers.
- User Desktop logs separately showed DNS/host failures including `api.nakios.live`, `*.eat-peach.sbs`, and VidLink-related traffic. Current main domains can be alive while historical/API subdomains or route families are stale; domain, route, extraction and player evidence must remain separately classified.

### Current priority after 5.21.37

1. Keep V29 terminal-label/session isolation immutable while provider recovery continues.
2. Resume **proof-first real route recovery across all 96**, including disabled/off rows for recoverability; test a route live at discovery time and never promote static fragments as executable routes.
3. Use `MAIN - Route Proof Reconstruction 96` as a non-public candidate workflow. Its baseline must derive from `.github/triggers/route-proof-reconstruction.json`, not be hard-coded to 5.21.35.
4. For every candidate, compare live yield against the accepted 5.21.37 baselines: Interstellar 6/55 automatic (2 VF), Unwanted Undead 2/62, Hell Mode 2/62. A structurally green reconstruction that does not improve/accurately explain these results is not completion.
5. Route families already requiring scrutiny include VidLink historical `/api/b/...` versus current documented `/movie/{tmdbId}` and `/tv/{tmdbId}/{season}/{episode}`, and Nakios principal-site versus stale `api.nakios.live`. Do not replace routes solely from documentation; require provider-specific executable HTTP proof before promotion.
6. Preserve the five Native Labs requirement after route/runtime stabilization: TV Android, Mobile Android, Mobile iOS, Desktop macOS, Desktop Windows.
7. Continue automatic `MEMORY.md` checkpoints for every important green/red run, root cause, architecture change, publication, native proof, and security proof.

## 2026-09-07 — Route-proof retry 16 pre-census failure

- Candidate workflow `MAIN - Route Proof Reconstruction 96`, run **34123018893**, job **101745186842**, failed before route census; no provider route result from this run is valid because all proof/yield steps were skipped.
- Baseline modernization itself passed: `ROUTE_PROOF_BASELINE_OK version=5.21.37 providers=96`.
- Exact blocker: `scripts/apply_core_identity_ownership_cleanup.py` still attempted the historical v10 -> v11 one-shot migration and required exactly one `cross-client-shared-tmdb-owner-movie-year-only-v10` anchor. Current main is already v11 (`cross-client-shared-tmdb-owner-zero-episodic-year-v11`), therefore anchor count was 0 and the migration aborted.
- This is a stale/idempotency defect in the route-proof bootstrap, not a V29/session/presentation regression and not route/network evidence.
- Required correction: make the one-shot identity cleanup detect an already-current v11 source state, validate all expected final ownership invariants, and exit successfully without rewriting; only run historical transformations when the legacy anchor is actually present.
- Do not weaken identity tests: TV/series/anime episodic year influence remains zero; V29 terminal label + abort-ignorant request cancellation remain mandatory in every reconstructed candidate.

## 2026-09-07 — Identity cleanup fixed-point correction

- Stale route-proof bootstrap defect from run 34123018893 is corrected in commit **`3ca80acc513720bab4c91ede3467894f3c4a1120`** (`fix(core): make identity ownership cleanup idempotent`).
- `scripts/apply_core_identity_ownership_cleanup.py` now detects the already-current `cross-client-shared-tmdb-owner-zero-episodic-year-v11` implementation, validates the full expected final source state, reports `already_current=true`, and exits successfully without attempting historical rewrites.
- Repair workflow `TEMP - Identity Cleanup Fixed Point V1`, run **34123475865**, completed success; both patch application and a direct second execution of the cleanup script on the current source were green, proving fixed-point/idempotent behavior.
- Temporary repair workflow/script were cleaned after the verified source commit. Route-proof recovery may now proceed to its actual proof/census stages without reapplying the obsolete v10 -> v11 migration.

## 2026-09-07 — Route-proof run 17 request-spec bootstrap failure

- Candidate workflow `MAIN - Route Proof Reconstruction 96`, run **34123692126**, job **101747285815**, again failed before route census; no route/yield conclusion from this run is valid.
- Baseline and the previously fixed identity cleanup passed on exact **5.21.37**. `apply_core_identity_ownership_cleanup.py` reported `already_current=true`; ProviderBase current checks and route-proof authority v5 migration also passed.
- Exact new blocker is `scripts/upgrade_route_recovery_request_specs_v1.py` validation after `upgrade_provider_route_authority_v5.py`: it still requires the obsolete literal `patch["learned_routes"] = execution_routes`, which is no longer present in the current route-recovery/applier wiring. Assertion: `recovery request-spec wiring missing: patch["learned_routes"] = execution_routes`.
- This is another stale bootstrap/migration validation mismatch, not provider route/network evidence. Census, materialization, quick-yield and all three candidate live matrices were skipped.
- Required correction: inspect the current structured route recovery writer and update the migration/validation to assert the current proof-v5 DATA/request-spec contract semantically, while preserving the hard rule that only live-proven executable routes may enter runtime `routes/apiRecipe`; candidate/static routes must never be promoted merely to satisfy the test.

## 2026-09-07 — Proof-v5 request-spec validator fixed to current runtime selection

- Run 34123692126 exposed an obsolete validator expectation in `scripts/upgrade_route_recovery_request_specs_v1.py`: it still required direct `patch["learned_routes"] = execution_routes` assignment.
- Current route recovery intentionally uses `select_runtime_routes(existing_routes, candidate_routes, execution_routes)` so a weak new census cannot demote a richer already-proven runtime plan. Directly restoring the old assignment would have weakened route authority/dataflow safety.
- Durable fix commit: **`44b245ae333c4092cc2901468a6fd4c618e21dee`** (`fix(routes): validate current proof-v5 runtime selection`).
- Repair workflow `TEMP - Route Request Spec Validator V2`, run **34124033946**, completed success. It proved the request-spec migrator, route-authority v5 migrator, Python compilation, provider route-proof authority, manifest policy and empty-route bootstrap tests; the migrator also passed a second execution in the same run.
- The validator now requires semantic current wiring: `executionRoutes`, `generic_execution_route`, reusable request specs, conservative `select_runtime_routes`, `patch/model routes = runtime_routes`, `genericExecutionRouteCount`, and `runtimePlanPreserved`; it also explicitly rejects reintroduction of the obsolete direct execution-route overwrite.
- This correction preserves the core rule: only live-proven executable routes may enter runtime DATA, while static/candidate routes stay non-executable unless separately proven.

## 2026-09-07 — Route-proof reconstruction 96/96 fully green (candidate only)

- Public baseline remains `5.21.37`; no Provider candidate was published by this run. Successful workflow: `MAIN - Route Proof Reconstruction 96`, run `34124189951`, workflow run number 18 / internal retry 13, trigger commit `c68da2edeecde5241486dd2089ebe7d703ce1a9e`. Trigger target is `5.21.38-candidate` and required proof is `proof-v5-96+interstellar+unwanted-undead+hellmode+hotd`.
- Full workflow PASS end-to-end: baseline freeze; proof-v5/shared-runtime migrations; proof-first authority and zero-route onboarding; 96-provider live census; DATA/activation application; 96/96 materialization; prune/projections/CONFIG; reconstructed runtime + managed-block contracts; workspace cardinality; reverse/static/integrity; quick-yield; live comparison; HOTD S3E1; artifact upload.
- Census exact result: `96` providers = `91` historical-upstream mapped + `5` NiakVIO-native, `source_unavailable=0`; `45/96` providers produced live proven routes, `286` proven routes total, `23` simple API recipes, statuses `45 proven / 51 no-proven-route`. The report was applied to all 96 providers. A weak/empty new observation does not demote a richer previously proven runtime plan; `select_runtime_routes(existing,candidate,execution)` preserves the better plan.
- Materialization exact generation: `f492fb39d2a5927c`, `96/96`, device-agnostic JS for TV/Mobile/Desktop. Projections after reconstruction: VF `29`, no-anime `73`, VF-no-anime `17`. Provider CONFIG validation PASS. `Movix` remains disabled with zero proven routes.
- V29/runtime invariants survived complete reconstruction: `ROUTE_PROOF_V29_PRESENT providers=96`; episodic year influence remains zero for TV (`year=ignored`, S/E authoritative), movie year core-owned; media-type resolver, dual IMDb/TMDB identity, latest-request cancellation, abort-ignorant native fetch cancellation, stream presentation/branding/sanitizer order all PASS.
- Reverse/static/integrity exact proof: `PROVIDER_V3_REVERSE_REBUILD_OK providers=96 generation=f492fb39d2a5927c byte_identical=96/96`; static audit PASS; release integrity PASS.
- Quick-yield exact result across `193` representative tasks: `raw providers=9`, `playable providers=9`, `verified providers=8`, `wrong_content providers=3`. Playable providers: `allwish, anime-sama, castle, hindmoviez, kehflix, neko-sama, streamzo, videasy, wookafr`. Verified: same list except `neko-sama`. Type breakdown: movie `7/82` playable+verified; TV `6/71` playable, `4/71` verified; anime `2/40` playable+verified. Main failure stages: network zero result `74 tasks / 38 providers`, HTTP error `64/33`, network exception `19/12`, missing runtime plan `16/9`, zero before provider network `5/3`.
- Interstellar candidate matrix: `7/63` automatic providers = `castle, hindmoviez, kehflix, streamflix, streamzo, videasy, wookafr`; VF `3` = `kehflix, streamzo, wookafr`; no settings gap. Prior accepted 5.21.37 checkpoint was `6/55` with `2 VF`, so absolute provider/VF yield increased, but denominator changed and must not be presented as a normalized-rate comparison.
- The Unwanted Undead Adventurer S01E02: `3/62` positives = `anime-sama, kehflix, neko-sama`, network reached `50`, successful HTTP `39`. Prior accepted checkpoint was `2/62`, so candidate adds one positive provider.
- Hell Mode S01E12: `2/62` positives = `anime-sama, neko-sama`, network reached `50`, successful HTTP `38`; count unchanged from accepted checkpoint.
- HOTD S3E1 real probe: Kehflix PASS on both `series` and `tv`, `4 streams` on each transport, HTTP reached and episode route observed. Purstream remains NOT_OK: HTTP reached but `0 streams`, no episode route. Expected accepted pattern `kehflix=OK / purstream=NOT_OK` matched.
- Candidate artifact: `route-proof-reconstruction-96-34124189951`, artifact id `10020094655`, size `152561733` bytes, SHA-256 `46627b78e445ea0d70d50f09e8bbe7b17dd272e64391232079fb3a9d564bb4d5`, retention 14 days.
- CI cleanup performed during the run: obsolete one-shot workflow `fix-terminal-label-session-v1.yml` removed in `be1f771400dca148991a4ae8ff77e89505836ee0`; obsolete `lab-timeout-isolation-fix.yml` removed in `6430091699152c2eadb504b8c1ac41c86f3bf5be`. Durable source/test fixes remain.
- Memory checkpoint transport upgraded to non-empty sentinel file `automation/memory-checkpoint-pending-v2.md` because the connector Contents wrapper repeatedly returned SHA mismatch 409 when updating the previous empty blob. The permanent writer now consumes v2 and resets it to `` instead of a zero-byte blob.
- Next canonical release step: do not run `CORE - Finalize Accepted Release` directly on the current main, because the successful 5.21.38 candidate exists only in the workflow workspace/artifact (`publication=false`, `mainTouched=false`). First hydrate/commit the exact accepted candidate onto a non-main release branch, include the deterministic migration/source changes needed for reverse rebuild, rerun bounded acceptance there, then merge the accepted candidate and finalize the synchronized release version on the exact accepted main SHA.

## 2026-09-07 — Route recognition V6 retry/dependency checkpoint

- Active experimental branch: `workbench/route-recognition-v6`; no publication from this branch. The public accepted release remains whatever the earlier publication checkpoint says until an explicit verified publication occurs.
- Canonical Repair/Learn/Force engine is `scripts/run_provider_repair_pipeline_v6.py`; all three modes use the same recognition -> correction -> rematerialization -> targeted-yield path.
- Network skip set remains 9 previously validated providers: `allwish`, `anime-sama`, `castle`, `hindmoviez`, `kehflix`, `neko-sama`, `streamzo`, `videasy`, `wookafr`. Retry-4 run `34136291243` proved `tested=87 skipped=9 overlap=0`; common ProviderBase changes still rematerialize all 96 and therefore require deterministic 96-provider regressions.
- Retry-4 route census: 87 targeted, 39 providers with proven upstream routes, 238 targeted routes; merged proof = 46/96 providers and 299 routes. Post-reconstruction acceptance remained `raw=0 playable=0 verified=0`; 21 representative upstream-positive provider/type pairs were lost after reconstruction. Therefore route proof alone is not a repaired provider.
- Adaptive recognition retries are implemented: default 3 attempts, max 4, only for transient network/execution states (timeouts, reset/DNS-temporary, 408/425/429/5xx, worker-no-result/network exception). Deterministic source/runtime failures such as `MODULE_NOT_FOUND` and source-policy blocks are not retried.
- PlayIMDb is explicitly treated as a typed resolver/API family, not as a generic absolute-route or VidSrc-like multi-hop template. Its upstream currently calls `https://streamdata.vaplayer.ru/api.php`, uses `Origin/Referer` playback context from `nextgencloudfabric.com`, and returns URLs under `data.stream_urls`. V11/V12 work is scoped to proof-backed `typed-resolver-api` recipes; multi-hop/search/player chains are not flattened.
- A reconstruction parser defect was identified: plural resolver containers such as `stream_urls` were ignored by common `_sourceUrls`. V12 adds bounded explicit plural stream/source containers plus safe inherited playback headers (`Origin`, `Referer`, `User-Agent`, `Accept-Language`) without scanning arbitrary JSON URLs.
- `MODULE_NOT_FOUND` root cause: upstream Provider JS is executed from a temporary directory, so bare npm imports could not see NiakVIO's locked root `node_modules`. The single owner is `upgrade_provider_worker_module_resolution_v1.py`: only top-level declared dependencies may fall back to project-root resolution, Cheerio is redirected to parser-only `cheerio/slim`, and blocked Node built-ins remain blocked.
- Dependency probe run `34147056268` succeeded: 16/16 formerly `MODULE_NOT_FOUND` providers no longer hit that error; `allanime` immediately produced 4 proven routes. This is an environment/recognition recovery, not yet an end-to-end repaired provider until reconstructed `raw/playable` passes.
- Do not count PlayIMDb or AllAnime as repaired until the targeted post-reconstruction yield returns real streams. Do not expand the green skip set from route proof alone.

## 2026-09-07 — First V6 red-to-green acceptance: PlayIMDb

- Targeted canonical acceptance run `34147372929`, job `101822202535`, proved the first V6 unresolved provider repaired end-to-end: `playimdb`.
- Final reconstructed yield was `raw=1 playable=1 verified=1`; representative upstream-positive pairs were `2`, preserved `2`, lost `0`. Both movie and TV resolver paths therefore survived recognition -> DATA/recipe -> rematerialization -> reconstructed runtime.
- The repair is shared runtime behavior, not a hard-coded PlayIMDb provider patch: V7 classifies only proof-backed terminal TMDB resolver requests as `typed-resolver-api`; V11 allows only that class to execute without a search/base phase; V12 parses explicit plural source containers such as `data.stream_urls` and preserves the already-proven safe playback context (`Origin`, `Referer`, `User-Agent`, `Accept-Language`). Generic absolute routes and multi-hop/search/player providers remain excluded from this bypass.
- The same PlayIMDb acceptance job passed the full deterministic 96-provider gates: published CONFIG 96/96, Provider/Core Lego ownership, global stream output guard 96/96, episodic identity/year regressions, global media-type resolver, dual IMDb/TMDB identity, stream presentation, and presentation pipeline.
- This does not mean the 9 previously-green providers were network re-probed; they remained excluded from network recognition. It does prove the common V11/V12 rematerialization did not break the global 96-provider structural/runtime contracts.
- Parallel AllAnime acceptance was not a repair: its selected upstream fixture itself had zero streams, and reconstructed yield remained `raw=0 playable=0 verified=0`. Route proof alone is not promoted to green.
- NetMirror is the next typed-resolver candidate because retry-4 showed direct TMDB movie/episode resolver requests with positive upstream streams and the same old `provider_zero_before_provider_network` reconstructed failure class.

## 2026-09-09 — Main-only recovery, V21 runtime/player checkpoint

Repository authority / topology:
- Active work authority is **main only**.
- `brain-learning/proposals` is the sole retained secondary branch and is immutable; never mutate/delete it during cleanup.
- All workbench and Dependabot branches have been removed after useful history/content was consolidated. Current repository branch set is exactly `main` + `brain-learning/proposals`.
- Do not recreate persistent repair branches unless the user explicitly changes this policy.

Release/versioning:
- A real regression was detected after consolidation: historical published release reached **5.21.39**, while current main bytes regressed to **5.21.37**.
- `scripts/sync_release_versions.py` now has a history-backed anti-downgrade floor: explicit or automatic finalization cannot go below the highest release version found on main first-parent history.
- `tests/release_version_sync_test.py` reproduces the exact 5.21.39 -> 5.21.37 failure and requires the next changed generation to resolve to **5.21.40**.
- Final release candidate must synchronize package.json, package-lock.json, all four manifests, sources.json, provider_catalog.json, visible manifest names (`NiakVIO vX.Y.Z ...`), release hashes and integrity artifacts. Current main manifest bytes may still show 5.21.37 until finalization; do not expose that as a finished candidate.

Workflow/security cleanup:
- `.github/workflows/provider-repair-fast-targeted.yml` and the full parallel sweep now run from main.
- Legacy V14 workflow is manual diagnostic only; deleted workbench branch triggers were removed.
- Full sweep is fixed at 96 Provider Objects (24 groups x 4) and uses the current targeted runner rather than stale v1-only logic.
- `workflow_security_policy_test.py` requires every external GitHub Action to use a full 40-character commit SHA.
- A recurring regression reintroduced `actions/checkout@v4`, setup actions by tags and `upload-artifact@v4` in the targeted workflow. Fixed on main: checkout/setup-node/setup-python/upload-artifact are all full-SHA pinned.
- Targeted and full-sweep plan jobs now execute `python3 tests/workflow_security_policy_test.py` **before network proof**, so this cannot waste another long provider run before detection.
- Run 72 (`34291236317`) proved the new targeted security preflight green.

Provider objective / acceptance:
- Target remains **all 96 Provider Objects**, including disabled/off rows for recoverability.
- Never treat a few repaired providers or a green structural test as completion.
- Required chain: targeted live-positive preservation -> neighbor/family non-regression -> 96/96 global proof -> five independent native Labs (TV Android, Mobile Android, Mobile iOS, Desktop macOS, Desktop Windows) -> UX/player/metadata/latency/session checks -> final version/hashes/integrity -> publication.
- Device behavior must be cross-compared but never inferred blindly across Nuvio repos/runtimes.

Targeted recovery history / current root causes:
- Earlier upstream proof established live positives for AnimeSama (`animesama-co`), AnimeVOSTFR and French-Manga.
- V20.3 fixed `{slug}` projection and urlencoded-form capture; V20.4 fixed static form constants + state updates; V20.5/V20.5.1 added strict id/slug readiness, dependency passes, deeper correlated steps and nested JSON HTTP value extraction.
- Run 70 showed V20.5.1 contracts green but live preservation still 0/3.
- Exact run-70 divergence:
  - AnimeSama materialized plan exists but reconstructed path did not reach useful provider network before falling through metadata/fallback authority.
  - AnimeVOSTFR still incurred broad generic WordPress/fallback traversal instead of a short causal chain, contributing to latency and wrong identity order.
  - French-Manga reached search -> episode API -> player embed; remaining failure is shared player extraction. One observed embed family exposes a fake `/troll/master.m3u8` and encodes the real HLS through base64 + reverse + hostname-derived XOR.

V21 current work on main:
- `scripts/upgrade_provider_shared_player_trace_v21.py` adds a provider-agnostic shared player decoder for the **content shape** above, rejecting the decoy HLS. No provider ids/hosts/titles are hard-coded into executable runtime logic.
- V21 also extends provider-value runtime evidence from one last-state row to a sanitized bounded history of max 48 lifecycle rows (`plan_selected`, identity, step/deferred/fetch/response, etc.). No response body, credentials, cookies or request headers are stored.
- `scripts/nuvio_tv_probe_tmdb_ci.cjs` now exports `provider_value_trace_history_v21` for CI diagnosis with step indices up to 7.
- `tests/provider_shared_player_trace_v21_test.py` executes the actual generated shared decoder against synthetic neutral encoded HLS content and validates trace/privacy constraints.
- First V21 run 72 did not reach live recovery because the V21 trace privacy validator scoped its scan too broadly and falsely found `authorization` in neighboring security helpers. The validator is now scoped only to `_spv184Trace`; the regex SyntaxWarning was also cleaned.
- Current retry trigger schema 26 targets `animesama-co`, `animevostfr`, `french-manga`, publicationAllowed=false.

Native/client evidence / UX blockers:
- User macOS log: Interstellar displayed 0 streams in that Desktop run while provider/network work occurred; several dead/failing DNS routes were visible. Absence of literal provider name in Desktop logs is not proof the provider was not selected/executed.
- TV Android previously produced Interstellar streams including Purstream/Castle/Cineby after cache clear. Therefore macOS 0-stream must not be generalized into common DATA failure.
- User wants Desktop macOS logged test + raw TV Android test on the **same candidate SHA/version**. Do not ask for that test until the candidate provider generation is stable and versioned.
- Historical stale-loading complaint means old title provider jobs may continue after navigation. This is not yet proven identically across runtimes; cancellation/native HTTP/stale-completion must be tested per client repo/device.
- `Purstream - Inconnue` on *Les Fils de l'homme* is a **stream title/technical metadata** regression, not manifest provider branding. Preserve real quality/language/source/host/size when available; never invent a quality merely to hide `Inconnue`.
- Reduced stream count is also blocking; latency must not be "fixed" by dropping providers/streams.

Next execution order:
1. Finish V21 targeted retry; fix real live failure until all known upstream-positive representative pairs are preserved.
2. Retest AnimeZey, Cineby, MovieBlast and other immediate neighbors/families.
3. Run all 96 with current V21 contracts and no stale skip exemption.
4. Materialize exact candidate and finalize as **5.21.40** with visible version names, hashes and integrity validation.
5. Run Desktop macOS logged + TV Android raw on identical SHA/version, then Mobile Android, Mobile iOS, Desktop Windows independently; compare runtime divergences.
6. Fix remaining player, metadata, cancellation/session and latency defects; rerun 96 + five Labs.
7. Security/docs/minimizer/fixed-point final clean; publish only after the entire chain is green.

## 2026-09-09 — V21.4 targeted recovery / four-manifest release checkpoint

- Main-only work remains authoritative. Do not delete branches or perform final cleanup/publication until provider recovery, the five Native Labs, player/UX checks, and the final release transaction are complete.
- Release target remains **5.21.40**. `scripts/sync_release_versions.py` / `tests/release_version_sync_test.py` enforce the historical 5.21.39 -> 5.21.37 anti-downgrade regression and require the next accepted changed generation to be 5.21.40.
- Final release synchronization must cover **all four public manifests**, not merely names/version strings: root `manifest.json`, `vf/manifest.json`, `no-anime/manifest.json`, and `vf-no-anime/manifest.json`, plus package/package-lock, sources/catalogue, provider hashes/integrity and visible manifest names. The two no-anime projections are first-class release/runtime artifacts and must be generated, content-checked, runtime/Lab-tested where applicable, hash/integrity-checked, and published atomically with root/VF.
- Current main still shows `no-anime/manifest.json` name `NiakVIO — Without anime providers` and `vf-no-anime/manifest.json` name `NiakVIO — VF uniquement — Without anime providers`, both at 5.21.37 until final 5.21.40 finalization. Do not present those current bytes as the finished release.
- Metadata preservation contract across the 96 providers is green from run `34294642425`: source and normalized metadata survive Facts -> Identity -> Presentation, while sanitizer URL/headers/transport checks remain separately validated. The `wrong_content` diagnostics regression was also corrected; diagnostics stay bounded and do not persist media URLs, tokens or sensitive titles.
- Targeted recovery run **78** improved the three-provider upstream-positive preservation set from 0/3 to **2/3**: AnimeSama (`animesama-co`) playable+verified, AnimeVOSTFR playable+verified, French-Manga playable but rejected. French-Manga title/season/episode identity matched, but measured HLS duration was about **4.3718x** the expected fixture duration, so the duration guard was intentionally not weakened.
- Root-cause hypothesis for French-Manga: its API shape is language -> episode -> servers, while NiakVIO was extracting player URLs from all episode rows instead of selecting the requested episode first. Upstream explicitly selects the requested episode number.
- Shared generic **V21.4** (`scripts/upgrade_provider_episode_scoped_json_v21_4.py`) was introduced to scope episode-indexed JSON before player extraction: requested episode only for TV/anime, support tagged arrays (`episode_number`/`episode`/`num`), fail-closed when a true episode table lacks the requested episode, leave movies unchanged, and avoid treating numeric quality maps (1080/720/etc.) as episode tables. Runtime logic must remain provider/host/fixture agnostic.
- Run **79** did not reach authoritative live validation because an old V20.5 textual invariant rejected the new runtime arrangement. Compatibility was adjusted so V20.5 keeps its historical marker while the V21.4 runtime zone still forbids unscoped JSON extraction.
- Run **80**, GitHub Actions run `34296820117`, is **red** and must not be described as V21.4 success. V21.4 boundary/migration initialization itself reported ready and the 96 Provider CONFIG check passed, but final live yield remained **2/3**: all three providers produced playable output, only AnimeSama + AnimeVOSTFR were accepted/verified, and French-Manga remained `wrong_content` with reasons `fixture_duration_mismatch,season_episode_match`; `lost=1`, target gate false.
- Run 80 also exposed an independent **test-only defect** after the live result: `tests/provider_episode_scoped_json_v21_4_test.py` crashes at the movie-unchanged assertion with `NameError: name 'payload' is not defined`. Fix that test variable/fixture without changing V21.4 behavior, then rerun; this test bug is not the cause of French-Manga's remaining live duration mismatch.
- Run 80 route recovery itself proved all three targeted sources/routes (`animesama-co` 5 routes, `animevostfr` 11, `french-manga` 8; 24 total) and materialized the three bundles successfully before yield evaluation. Therefore the remaining French-Manga issue is downstream episode/player/content selection or media validation, not absence of provider network route proof.
- Immediate next order: (1) fix the V21.4 regression test `payload` NameError; (2) inspect the exact French-Manga V21.4 runtime trace/output to determine why episode scoping did not remove the ~4.37x duration mismatch; (3) get targeted **3/3** without weakening duration/identity guards; (4) retest AnimeZey/Cineby/MovieBlast and neighboring families; (5) run the complete 96-provider proof; (6) materialize the exact candidate; (7) validate root + VF + **both no-anime manifests** and finalize 5.21.40 atomically; (8) execute five Native Labs independently (TV Android, Mobile Android, Mobile iOS, Desktop macOS, Desktop Windows) plus UX/player/metadata/latency/session checks; (9) security/docs/minimizer/fixed-point clean and only then publish/branch cleanup.

## 2026-09-09 — V21.5/V21.6 catalogue identity, exact-source proof LKG and player fallback checkpoint

- Release/publication state is unchanged: **publicationAllowed=false**, target remains **5.21.40**, main-only authoritative, and finalization still requires the complete 96-provider proof, exact candidate materialization, all four public manifests (`manifest.json`, `vf/manifest.json`, `no-anime/manifest.json`, `vf-no-anime/manifest.json`), five independent Native Labs, player/UX/metadata/session/latency checks, security/docs/minimizer/fixed-point clean, and only then publication/branch cleanup.
- The V21.4 regression test defect from run 80 was fixed: `tests/provider_episode_scoped_json_v21_4_test.py` no longer references an undefined Python `payload`; later targeted CI confirms V21.4 contracts green.
- French-Manga's ~4.37x duration mismatch was traced upstream of media validation to a wrong catalogue identity: the requested Jujutsu Kaisen S1 result uses provider `newsid=1497198`, while NiakVIO had correlated `1497822`. The original V20.4/V20.5 response-wide ID fallback could overwrite a strong title/season-correlated result with a more frequent unrelated HTML `data-id`.
- Shared **V21.5** (`scripts/upgrade_provider_catalogue_identity_correlation_v21_5.py`) now scopes the initial provider catalogue identity to the same bounded search result/card as the matched title/season while preserving V21.1 media-aware identity and later response ID learning. It handles direct anchor search results and bounded onclick/data-href style catalogue cards without provider/fixture-specific IDs. `tests/provider_catalogue_identity_correlation_v21_5_test.py` locks the behavior.
- Run **81** (`34307300812`) did not reach live recovery because the first V21.5 migration looked for the pre-V21.1 `_spv205StrictProviderValues(value, base, meta, season)` signature. It was corrected to compose against the current V21.1+ runtime owner/signature rather than restoring an obsolete owner.
- By runs **84/85**, V21.5 fixed French-Manga in real execution: the reconstructed provider uses the correct `provider_id=1497198`, reaches the correct episode API/player chain, and returns verified streams. Treat French-Manga catalogue identity as fixed unless a later regression proves otherwise.
- Runs 84/85 exposed a separate systemic proof-memory defect: an immutable upstream Provider JS can return different successful request traces between invocations. AnimeSama's positive trace previously included the correlated Sibnet step `/shell.php?videoid={id}`; a later same-SHA upstream run still returned a stream but did not exercise that HTTP step. `merge_provider_repair_report_v6.py` replaced the targeted provider row and erased the previously live-proven route. The 96 baseline was too old to restore it.
- A durable **exact-source live-positive route-proof LKG** was implemented in `scripts/provider_route_proof_lkg.py`, registry `automation/provider-route-proof-lkg.json`, and `tests/provider_route_proof_lkg_test.py`. It stores only proof-v5+ reusable HTTP-success rows from upstream tasks that actually returned streams; `{id}`/`{slug}` rows require provider-value correlation. Evidence is reusable only while `(kind, sourceId, currentSha256, providerUrl)` matches exactly and `currentSha256==wantedSha256`. A source SHA change resets that provider's retained evidence. It is proof memory only, not publication authority.
- `scripts/merge_provider_repair_report_v6.py` now merges current targeted proof with the exact-source LKG before applying/materializing the 96-provider census. Run **86** proved this works: `route_lkg_retained=1`, AnimeSama materialized a three-route value chain containing search, episode page and the restored Sibnet `/shell.php?videoid={id}` step.
- LKG persistence is security-isolated in `.github/workflows/provider-repair-fast-targeted.yml`: the provider execution job retains `contents: read`; a separate `persist-route-proof-lkg` job downloads the sanitized proof artifact, has job-only `contents: write`, merges/validates the LKG, and commits **only** `automation/provider-route-proof-lkg.json`. Run 86's security preflight passed and the persistence job succeeded, committing `data(repair): persist exact-source route proof LKG` at `74cd33cd8d1073c4cd83a6a73264941c434f273c`.
- Run **86** (`34308986704`) remains red overall and must not be called 3/3: targeted upstream-positive set was AnimeSama + AnimeVOSTFR + French-Manga, while reconstructed preservation was only French-Manga (`raw=1`, `playable=1`, `verified=1`, `lost=2`). All V16→V21.5 contracts, route-LKG tests, diagnostics and route-cap tests were green.
- Run 86's detailed AnimeSama trace clarified the remaining runtime layer: the restored value plan executes correctly. It selects catalogue ID `93`, fetches `/anime/93-jujutsu-kaisen-1/saison-1/episode-1.html`, learns `videoid=4668025`, then calls `https://video.sibnet.ru/shell.php?videoid=4668025`; that resolution currently returns HTTP 400. The upstream AnimeSama implementation intentionally returns the iframe/embed URL itself as a native-player fallback when its resolver cannot produce direct media. NiakVIO instead discarded the entire correlated plan on the failed player HTTP request.
- Shared **V21.6** (`scripts/upgrade_provider_player_fallback_v21_6.py`) addresses that mismatch generically: failed proof-correlated player/embed-like step URLs are accumulated as bounded fallbacks, all later dependency-ready branches still execute, and the fallback is returned only if no direct/nested branch succeeds. Ordinary catalogue/detail/API URLs are not promoted. `tests/provider_player_fallback_v21_6_test.py` checks direct/embed/player-query eligibility, ordinary-detail rejection, dedupe and referer preservation.
- AnimeVOSTFR had a related pre-LKG evidence gap. Run 84 on the exact same source SHA `f75843cd26128bc78d31ecc641acfe155ca7a5e4046bea977fe5ab3c4f8e8c2a` had reusable, stream-positive branches `/?trembed=0&trid={id}&trtype=2`, `/?trembed=1&trid={id}&trtype=2` and `/shell.php?videoid={id}`. In run 86 the trembed requests were still observed but `requestSpecReusable=false`, so the current providerValuePlan contained only search -> series -> episode. Because the durable LKG did not yet exist at run 84, those earlier reusable rows were absent from the registry.
- `automation/provider-route-proof-seed-v1.json` now bootstraps that pre-LKG AnimeVOSTFR live proof. `merge_provider_repair_report_v6.py` admits historical seed rows **only** when the provider is targeted now and the current exact source identity matches the seed; a SHA change makes the bootstrap ineligible. The normal LKG then becomes the durable owner.
- Targeted run **87** (`34309729426`) was triggered on SHA `04ce5a680e868e32b877c46ce943d31fe54d902f` with V21.6 + exact-source bootstrap. Its security preflight is green. Expected checks: AnimeSama must preserve its player/embed fallback when Sibnet resolution is 400; AnimeVOSTFR should regain run-84 trembed/player branches if the source SHA remains exact; French-Manga must stay on correct catalogue identity `1497198`. Do not claim run 87 success until its live yield is complete.

## 2026-09-09 — V21.6 blocker cleared; full-portfolio sweep resumes

- `Provider Repair Parallel Batch Proof` run **34309729426** (run 87), head `04ce5a680e868e32b877c46ce943d31fe54d902f`, completed success.
- Targeted providers: `animesama-co`, `animevostfr`, `french-manga`.
- Live result: **3/3 raw, 3/3 playable, 3/3 accepted-playable, 3/3 verified, wrong_content=0, lost=0**. `targetGatePassed=true`.
- Global non-network stream guard also passed across the complete **96-provider** catalogue; publication remains forbidden because the full live portfolio gate and five Native Labs are still outstanding.
- V21.6 shared failed-player/embed fallback contract passed. AnimeSama retained the exact correlated plan `/template-php/defaut/fetch.php -> /anime/{slug}/saison-1/episode-1.html -> video.sibnet.ru/shell.php?videoid={id}` and is live verified again.
- AnimeVOSTFR exact-source historical bootstrap matched and rebuilt the evidence-backed chain `/?s={query}`, `?trembed=0`, `?trembed=1`, Sibnet shell, series and episode routes; provider is live verified again.
- French-Manga remains live verified after V21.5 catalogue-identity correction; no upstream-positive pair was lost.
- All V16 through V21.6 contract tests passed, including exact-source route-proof LKG, response-value correlation, identity guards, episode scoping and player fallback.
- Route-proof LKG persistence job succeeded with isolated `contents: write`; it updated all 3 exact-source entries with zero source reset. Rebased/pushed final LKG commit **c25a90b6** (full SHA obtainable from repository history).
- `automation/memory-checkpoint-pending-v2.md` from the previous checkpoint was successfully absorbed and reset to the empty sentinel before this checkpoint.
- Next authority: do **not** stop at these 3 providers. Resume the deterministic live sweep of the remaining 96-provider portfolio, keeping the 10 already accepted green providers as skip authority, using exact-source LKG only as proof memory, fixing shared/runtime family failures rather than deleting/quarantining providers, and preserving `publicationAllowed=false` until full live proof + five Native Labs + final candidate/security/docs/fixed-point gates are complete.

## 2026-09-09 — Run 88 first 24-provider full-portfolio sweep

- `Provider Repair Parallel Batch Proof` run **34310197297** (run 88), head **2eec355d9be79789aebd73c876de9778a5a0928e**, completed with expected overall failure because 4/6 live batches contained upstream-positive regressions. Security/plan preflight and isolated route-proof LKG persistence succeeded.
- Exact 24 selected: `allmovieland`, `anidb`, `anikototv`, `animekai`, `animepahe`, `animesalt`, `animesama-co`, `animesultra`, `animetsu`, `animevostfr`, `animezey`, `animoflix`, `cineby`, `cinemacity`, `cinemm`, `dooflix`, `dulourd`, `french-manga`, `goated`, `hdghartv`, `hianime`, `kurage`, `movieblast`, `movies4u`.
- Upstream-positive representative pairs = **10**. NiakVIO preserved/verified **3** providers (`animekai`, `french-manga`, `movies4u`) and lost **7** upstream-positive pairs: `animesama-co:anime`, `animevostfr:anime`, `animezey:movie`, `animezey:tv`, `cineby:movie`, `cineby:tv`, `movieblast:movie`.
- AnimeSama: exact correlated plan still resolves catalogue id 93 and player id 4668025. Sibnet shell returned HTTP 403. V21.6 emitted `step_player_fallback`, but final raw streams were still zero. Therefore the shared strict stream sanitizer is deleting the intentionally preserved native-player fallback after the resolver correctly marks it.
- AnimeVOSTFR: exact search/detail/episode/trembed branches execute; `trembed=0` returned 200 then Sendvid 502, `trembed=1` returned 200, Sibnet shell returned 400. V21.6 again emitted `step_player_fallback`, yet final raw streams were zero. Same sanitizer/fallback ownership bug as AnimeSama, not an identity regression.
- AnimeZey: upstream remains stream-positive for both movie and TV. Reconstructed search reaches the current worker endpoint but discovered `animezeydl.workers.dev/download.aspx` URLs returned HTTP 500. Keep separate until exact upstream output behavior/headers are inspected; do not invent replacement routes.
- Cineby: exact upstream source is stream-positive for movie and TV. Reconstruction correctly reaches `api.speedracelight.com/seed` and `cdn/sources-with-title`, extracts 480/720/1080/2160 HLS URLs on `moon.peakstorm.top`, then loses them because bare HLS probes return 403. Current upstream explicitly returns each stream with playback headers including browser UA plus `Referer: https://www.cineby.at/` and `Origin: https://www.cineby.at`. Root cause is shared playback-header/context loss between API result extraction and direct-media probe/output, not TMDB/search/route identity.
- MovieBlast: exact upstream remains stream-positive (movie and some TV fixtures), but NiakVIO tries stale/generic `https://app.cloud-mb.xyz/api/search/<query>` and receives 404. Current upstream uses app-specific static request headers/tokenized search/detail paths and dynamically signs media URLs with timestamp + CryptoJS/HMAC before returning them with playback headers. This requires a real generic signed-API capability or equivalent source-derived recipe; do not hardcode provider secrets or claim the generic route works.
- Dooflix hit upstream HTTP 429 in this sweep. It is not an upstream-positive lost pair for run 88 and must be treated as rate-limited, not as a proven dead provider.
- Existing shared `_streams(urls, referer, extraHeaders)` supports output headers, but `_crawlDirectMedia` currently carries only `{url, depth, referer}` and emits direct media without arbitrary safe playback headers. The V4/V5/V6 sanitizer already knows how to mirror `stream.headers` into `behaviorHints.proxyHeaders.request`; the missing transport context must be restored before/properly through probing.
- Planned shared fixes: (1) narrowly preserve an exact proof-correlated **non-direct** player/embed fallback through the sanitizer while still stripping private proof markers and keeping direct-media fail-closed checks; (2) add bounded same-URL direct-media retry/output with safe provider-origin Referer/Origin context when an actually discovered media URL returns 403 without context. Neither fix may bypass auth/DRM or promote ordinary catalogue/API URLs.
- Publication remains **forbidden**. Run 88 is only the first 24-provider live wave; full 96 live proof, all five Native Labs, final candidate/manifests/security/docs/minimizer/fixed-point gates are still mandatory.

# NiakVIO checkpoint — Run 91 / portfolio sweep continuation

## Publication/finalization remains blocked
- `publicationAllowed=false`; target remains 5.21.40.
- Catalogue target is all 96 providers, not only currently green/active providers.
- Final publication still requires the exact candidate, 96-provider proof, the 5 Native Labs (TV Android, Mobile Android, Mobile iOS, Desktop macOS, Desktop Windows), player/UX/metadata/session/latency validation, security/docs/minimizer/fixed-point clean, and the four public manifests (`manifest.json`, `vf/manifest.json`, `no-anime/manifest.json`, `vf-no-anime/manifest.json`).
- Route discovery must stay live-proof-first: no invented routes and no validator-only success.

## Exact-source proof/LKG architecture now in place
- V21.5 fixed French-Manga catalogue identity: JJK S1 authoritative id is `1497198` rather than the unrelated global HTML id `1497822`.
- Exact-source live-positive route-proof LKG is implemented and persisted by a separate write-only job; provider execution itself remains `contents: read`.
- Same exact source SHA may retain previous positive reusable proof rows; a source SHA change resets them. `{id}`/`{slug}` rows require response-value correlation. LKG remains proof memory only, never publication authority.
- AnimeVOSTFR has an exact-source-only historical bootstrap for its pre-LKG `trembed`/Sibnet evidence.

## V21.6/V21.7 player fallback
- V21.6 preserves a failed proof-correlated player/embed hop as a bounded native-player fallback while still executing later branches.
- V21.7 adds private exact fallback provenance (`__nuvioCorrelatedPlayerFallbackV1`) and terminal sanitizer V7 consumes/strips only that narrow marker. Direct media remains fail-closed; ordinary catalogue/detail/API URLs are not promoted.
- Run 89/90 failures were pre-network test-harness issues (module path, then over-literal assertion), not provider results.
- Run 91 CI passed both real contract tests before network: `provider player fallback V21.7 tests passed` and `stream output correlated player fallback V7 tests passed`.

## Run 87 and first broad wave
- Run 87 (`34309729426`) was 3/3 for AnimeSama, AnimeVOSTFR and French-Manga; full non-network 96 guard passed.
- Run 88 first broad tranche had 10 upstream-positive pairs, 3 preserved (`animekai`, `french-manga`, `movies4u`) and 7 losses: AnimeSama, AnimeVOSTFR, AnimeZey movie+tv, Cineby movie+tv, MovieBlast movie. Dooflix was HTTP 429 and was not converted into a fake route.

## Run 91 exact result
- Run 91: `34311503094`, head `9388b705a1801ea9db828dd5a01c7b3c57618722`; LKG persistence advanced main to `5c3c21150c24b8d4aebd4054faa89e2b0a55ec88`.
- AnimeSama: exact value plan retained search -> episode -> Sibnet and targeted audit verified it.
- AnimeVOSTFR: not upstream-positive in that invocation; do not classify as a verified success or a NiakVIO loss from run 91.
- AnimeZey: upstream positive movie + TV but target lost both.
- Cineby: targeted audit lost movie+TV in this invocation, while the global census in the same run showed real 4/4 verified movie and 4/4 verified TV. Existing Cineby Wings/headers are already correct; this is intermittent CDN/network behavior, not a reason to invent routes/headers.
- MovieBlast: upstream movie positive but no reusable proof route; target correctly stayed fail-closed.
- LKG persist job succeeded. No later Provider Repair run was observed after run 91 at the time of this checkpoint.

## AnimeZey diagnosis
- Exact AIO source SHA: `46e83c8d710830679b7f17eacb03e014fc4195237cd423fe63254862549f24ff`.
- Upstream returned 1 movie stream and 2 TV streams on the positive fixtures.
- Positive calls use structured POST search values that current request proof cannot deterministically template: movie example `Interstellar.2014`; TV example `Breaking.Bad.S01E01` plus a redacted `page_token`.
- The movie request becomes non-reusable only because the current scalar placeholder logic understands whole-value `{query}` / `{year}` but not a deterministic composite query. This is a shared request-template capability gap, not an AnimeZey-specific rule.
- TV must remain fail-closed while `page_token` is redacted unless a live request proves a safe reproducible form without freezing a secret.
- Next generic fix: derive deterministic composite title/year and title/SxxExx request-body templates only when the observed value exactly decomposes into fixture-owned fields with no residue; add a shared runtime transform/placeholder and neutral contract tests.

## Cineby diagnosis
- Upstream still returns four streams for movie and TV.
- Global run-91 census successfully reached `api.speedracelight.com` seed/source endpoints and four `moon.peakstorm.top` HLS URLs, verified 4/4 with HTTP 200.
- Other targeted attempts saw the same CDN return 403. Keep retry/network classification separate from algorithmic reconstruction; do not fabricate headers.

## MovieBlast diagnosis
- Exact AIO source SHA: `d3b04a5ee1a13fed77192b5226d46001508fe321fa747f0c519d0c23d5b1a974`.
- Current upstream uses `https://app.cloud-mb.xyz`, static mobile headers, a path token for search/detail, and runtime HMAC-SHA256 signing of returned media URLs using the current Unix second and a source secret.
- Reconstructed stale generic `/api/search/...` routes return 404. Proof recovery correctly refuses to freeze redacted token/signature material, so `providers_proven=0` is expected rather than a false success.
- Do not hardcode TOKEN/SIGN_SECRET. A future solution must be a generic, safely representable signed/mobile request capability or remain fail-closed.

## Immediate continuation
1. Add the generic deterministic composite request-body template capability and tests, then live-retarget AnimeZey.
2. Independently advance the next deterministic 24-provider sweep so AnimeZey/MovieBlast do not block coverage of the remaining 96.
3. Re-test Cineby under the normal retry policy and distinguish transient CDN failures from reconstruction failures.
4. Keep MovieBlast isolated as signed-route architecture work; improve secret-free diagnostics rather than copying secrets.
5. Absorb this checkpoint into `MEMORY.md` and reset this pending file to ``.

## 2026-09-09 — V21.6 live recovery + non-regression checkpoint

- User requirement tightened after repeated repair regressions: **a provider/bundle already proven green becomes an immutable live reference**. A Repair/reconstruction must not replace it unless the candidate is live A/B-tested against that reference and proves no regression. Architectural cleanliness never justifies losing a previously working provider.
- Targeted Provider Repair run **87** (`34309729426`), head `04ce5a680e868e32b877c46ce943d31fe54d902f`, completed **success**. Job `102333746919` proved all three blocker providers live-positive together: **AnimeSama + AnimeVOSTFR + French-Manga = raw 3 / playable 3 / verified 3, lost 0**. `tests/global_stream_output_guard_test.py` also passed across the 96-provider output surface. This is targeted live proof for the three providers plus a global structural/output guard; it is **not** proof that all 96 providers are live-verified.
- V21.5 remains the French-Manga catalogue-identity fix: strongly correlated title/card ID wins over response-wide fallback; JJK S1 stays on `newsid=1497198` rather than wrong `1497822`.
- Exact-source positive route-proof LKG remains proof-memory only, keyed by immutable source identity and requiring live-positive reusable evidence; it is not publication authority. The separate persistence job keeps provider execution read-only and writes only sanitized LKG JSON.
- AnimeVOSTFR uses a one-time pre-LKG exact-source bootstrap only when current targeted source identity exactly matches the historical seed; SHA/source change makes the seed ineligible, after which normal LKG is authoritative.
- V21.6 shared player/embed fallback fixed the AnimeSama failure mode without provider-specific fixture logic: a failed player/embed resolution (e.g. Sibnet 400) can remain a bounded native-player fallback while ordinary catalogue/detail/API failures are not promoted. This mirrors upstream behavior and keeps later branches executable.
- Current next regression investigation: **VF generation A/B around 5.21.36 -> 5.21.37 for Kehflix and StreamZo**. Treat the accepted 5.21.36 provider bytes as immutable baseline if live replay confirms them. Diagnose generation/runtime cause before changing provider bytes; add a general regression gate requiring prior-green preservation or independently live-proven replacement.
- Parallel secondary work remains mandatory while live workflows run: security/workflow policy, minimizer/fixed-point, docs/architecture consistency and stale metadata cleanup. Do not publish from these targeted greens.
- Publication remains gated; project target remains all **96** Provider Objects plus the five Native Labs and four final manifest projections before final 5.21.40 publication.

# NiakVIO checkpoint — 2026-09-09 — provider history + systemic regression audit

## 96-provider historical matrix
- Durable report: `automation/PROVIDER-HISTORY-MATRIX.md` + `automation/provider-history-matrix.json`.
- Current manifest tracked by report: 5.21.37, exactly 96 providers.
- Exact snapshots: tag 5.21.0, tag 5.21.16, publication 5.21.36 (`b4d5bff4c2e3b8e9944c1eaaf8ae9690cb00d5cf`), then current.
- V2 policy: absolutely no cross-version evidence fallback. 5.21.0/5.21.16 status comes from each tag's own `availability-report.json`; 5.21.36 from its own `provider-v3-quick-yield.json`; current from published-byte guards, current TV field evidence, or explicitly labelled candidate evidence.
- State legend: 🟢 exact positive evidence; 🟡 partial/degraded/blocked/wrong-content/candidate; 🟠 LEARN-owned debt; 🔴 explicit failure/no-stream/current published guard red; ⚪ unknown/inconclusive.
- V2 generator: `scripts/build_provider_history_matrix_v2.py`; workflow `Provider History Matrix` run 34330433714 passed security/build/persist and bot commit `78487f86f00345ecfbe83ce749f3d1956043dd78` persisted colored 96/96 report.
- Current exact regression-watch set generated by V2: `kehflix`, `movieshunt`, `purstream` (at least one historical 🟢 and current 🔴/🟠). Do not infer that other ⚪ providers are broken.
- Known current protected baselines: Castle movie+TV, PersianStremio movie+TV; Anime-Sama anime lane; DesiFlix TV lane; StreamZo movie lane. A/B live proof is mandatory before replacing a known-good published lane.
- Candidate-only greens remain distinct from published/device proof: AnimeVOSTFR and French-Manga after run 87.
- Residual route/data repair must be bounded; then hand to LEARN. Avoid provider-by-provider manual loops unless one shared family fix is proven.

## Current user field evidence on published manifest
- TV Interstellar: Castle, PersianStremio, StreamZo visible.
- TV The Unwanted Undead Adventurer: Anime-Sama visible.
- TV House of the Dragon S1E1: PersianStremio, DesiFlix, Castle visible.
- Desktop macOS: no provider visible in the user's current field test.
- Treat this as field evidence distinct from CI. Do not overwrite it with an invalid lab zero.

## Desktop Lab systemic blocker discovered
- Last full Desktop lab associated with final five-Labs launch: workflow run `34110935429` (NATIVE - Desktop Reader, run #113), official NuvioDesktop SHA `21aabeeb49fc6de835f9031a65cc5f8489419330`.
- macOS and Windows jobs failed before provider execution. The macOS native player bridge itself built successfully.
- Failure occurred at `:composeApp:compileTestKotlinDesktop`: upstream `PlayerExitOrderingTest.kt` anonymous `PlayerEngineController` lacked newly required `applyAudioLanguagePreferences(languages: List<String>)`.
- Consequence: providerCount/executions/nonEmpty remained zero, `missing_begin_marker`, 96 providers missing. This CI zero is lab-infrastructure evidence, NOT provider evidence.
- Current upstream NuvioDesktop still has the stale test fake while production `PlayerEngineController` requires `applyAudioLanguagePreferences`.
- Test-only compatibility shim added at `scripts/native_desktop_upstream_test_compat.py`, covered by `tests/native_desktop_upstream_test_compat_test.py`. It may only add one no-op override to that exact upstream `commonTest` fake, is idempotent, and fails closed on shape drift. It never edits Nuvio commonMain/desktopMain runtime, networking, player, Gradle, or OS policy.
- `automation/native-human-ux-policy.json` moved to v7 and records blocker `desktop-player-exit-ordering-test-api-drift`; exact commonTest path is the only new Desktop checkout exception.
- `.github/workflows/native-desktop-reader-acceptance.yml` now runs the compatibility contract and applies the shim before staging the corpus. Do not classify a zero-execution compile failure as provider evidence again.

## Core regression audit in progress
- `scripts/nuvio_client_lab.cjs` currently uses `DEFAULT_TIMEOUT_MS=70000` and `DEFAULT_PLAYBACK_TIMEOUT_MS=18000`; these are identical to 5.21.36. Therefore the global client-lab timeout did not regress 5.21.36 -> current.
- Old `scripts/publish_nuvio_tv_compat_v2.py` still contains provider-specific 12–15s adapter settings for Goated/WookaFR/Coflix/StreamZo/Frenchstream; verify whether these are still publication-authoritative before changing them. Do not confuse health latency thresholds with runtime hard timeouts.
- `engine_v2/src/stream-presentation.mjs` changed since 5.21.36 so current `name` mirrors the quality-bearing `streamTitle` instead of only provider name; continue validating metadata/badges through Core contract and real native UX, not static assumptions.

## Execution discipline
- Finish all non-reader commits/checkpoints before triggering expensive Native Labs, then freeze main while the intended reader run executes; persistent blocker `reader-run-cancellation-churn` forbids cosmetic/speculative pushes during evidence collection.
- Publication remains blocked until candidate, all 96 proof, five Native Labs, UX/player/metadata/session/latency, security/docs/minimizer/fixed-point gates are complete.

# NiakVIO checkpoint — 2026-09-09 — Core regression gate before Desktop rerun

- `CORE - Stream Metadata Contract` run `34331678345` passed fully on `fdfe7bca3cb5db544a90372bf21547a2bdf68668`.
- New `tests/core_runtime_nonregression_contract_test.py` passed and locks provider lab timeout >=60s (actual 70s), playback timeout >=18s (actual 18s), current 96-provider cardinality, quality-bearing stream `title` + `name`, `badgeIds`, `displayBadges`, `presentationFacts`, and requires the legacy 12–15s `publish_nuvio_tv_compat_v2.py` publisher to remain absent from current workflows.
- Remaining Core contract steps also passed: lossless metadata, presentation pipeline, quality recovery, sanitizer header/transport preservation, sanitizer fail-closed, and presentation fixed point.
- Static Core green is necessary but does not prove actual client UX/latency/session/player/badge rendering. Native Labs remain mandatory.
- Durable audit doc: `automation/CORE-REGRESSION-AUDIT.md`.
- Desktop prior run `34110935429` is invalid as provider-zero evidence because it failed before corpus execution on stale upstream test compilation. Test-only compatibility shim/policy v7/workflow wiring are now committed. Next step is a Desktop macOS+Windows rerun on a frozen HEAD; do not push unrelated commits while it runs.

# NiakVIO checkpoint — 2026-09-09 — Desktop HTTP-200 zero + Core budget + durable media identity

## Desktop root-cause narrowing
- Official NuvioDesktop protected-byte bisect run **34338322836** (macOS, PersianStremio, Interstellar) proved the runtime loads the protected PersianStremio bundle and performs `GET https://persianstremio.vercel.app/stream/movie/157336.json` successfully (`HTTP 200`, `application/json`). Sanitized response-shape instrumentation proved the JSON itself contains no stream rows: `kind=object rows=0 objectRows=0 httpUrlRows=0 externalUrlRows=0`; final plugin result is `count=0` in under one second.
- Therefore the PersianStremio Desktop zero is **not** a QuickJS JSON/result-parser loss and is not caused by the former 25/30 s Core budget. The numeric TMDB backend route itself is empty for this fixture.
- Official NuvioDesktop uses a single positional identity at its plugin boundary: `StreamsRepository` -> `PluginRepository` -> `PluginRuntime.executePlugin(tmdbId, mediaType, season, episode)` -> `getStreams(tmdbId, mediaType, season, episode)`. NuvioMobile has the same structural four-argument contract. Mobile/Desktop must not require users to configure a TMDB key to recover IMDb identity.
- NuvioTV uses the same four-argument ABI but has an audited runtime TMDB capability, allowing Core to hydrate TMDB metadata/external_ids and derive IMDb. Treat this as an equivalent identity capability, **not** permission for shared provider bundles to depend on `TMDB_API_KEY`.

## Core timeout authority fixed in source
- `CORE.MEDIA_TYPE_RESOLUTION` previously owned a shorter internal execution deadline while Native Labs owned an outer deadline. This created competing timeout authorities and could drop valid late results after network return.
- Source fix commit **a2ccd335ea3be285e3a37807488605abdc195865** (`fix(core): unify provider execution budget at 60s`) sets canonical Core `providerTimeoutMs=60000` and `tvProviderTimeoutMs=60000`, revision `tmdb-data-contract-launch-gate-v30-unified-60s-budget`.
- Validation run **34339079601** completed fully green, including media-resolution contracts, latest-request cancellation, abort-ignoring native-fetch cancellation and Core budget non-regression.
- Do **not** rematerialize this Core into already protected green provider lanes until required live A/B proves no regression. Green lane bytes remain immutable authority.

## Desktop media-identity A/B history
- Baseline evidence is stable: protected PersianStremio bytes on official Desktop call `/stream/movie/157336.json`, receive HTTP 200 with zero stream rows, and finish `count=0`.
- Host resolution for Interstellar maps TMDB **157336** to IMDb **tt0816692**. TMDB credentials are used host-side only for the Lab resolution and are never projected into provider JavaScript.
- Run **34341065713** established a valid baseline (`count=0 imdb_route=false numeric_route=true`); its first dual branch was harness-invalid because mutation happened before human-UX purity audits. Never weaken those audits.
- Run **34343072382** is valid evidence against the *V2 injection point*, not against dual-ID itself. Baseline job **102438235395** passed. Dual job **102438235616** successfully resolved `tt0816692`, injected the canonical `tmdbMetadata.external_ids.imdb_id` shape after checkout purity audits, executed the provider, but still produced `count=0 imdb_route=false numeric_route=true`. Provider bytes remained unchanged.
- Exact source inspection then proved why V2 could not work: NiakVIO Core itself rewrites `globalThis.__nuvioMediaContext = a.__nuvioContext || null` before provider execution and again after authoritative resolution. Core also initializes `var mediaCache=Object.create(null); globalThis.__nuvioTmdbMetadataCacheV1=mediaCache` while the provider/Core bundle is evaluated. Therefore any host identity global/cache injected **before** `evaluate(wrappedCode)` is destroyed or superseded before the provider consumes it.
- PersianStremio's existing `hydrateImdb()` already consumes the canonical shared metadata surfaces in order: `__nuvioMediaContext.tmdbMetadata`, `__nuvioTmdbMetadataCacheV1[<namespace>:<tmdbId>]`, then `__nuvioCoreGetTmdbDataV1`. The correct host bridge is therefore systemic, not provider-specific.

## Canonical identity architecture restored and locked
- Architectural invariant: positional `getStreams(tmdbId, mediaType, season, episode)` is **transport**, not the complete media identity contract.
- Canonical context IMDb path: **`__nuvioMediaContext.tmdbMetadata.external_ids.imdb_id`**.
- Canonical shared metadata cache: **`__nuvioTmdbMetadataCacheV1`**, with host-provided entries shaped as `state=ok` + `metadata.external_ids.imdb_id`.
- A host-side identity bridge must populate the shared metadata identity **after provider/Core bundle initialization and before `getStreams` invocation**. Pre-bundle injection is explicitly invalid because Core initializes/rewrites these globals.
- No end-user TMDB credential may be required for NiakVIO compatibility, and no TMDB secret may be projected into provider JavaScript merely to recover IMDb identity.
- Desktop/Mobile currently have a documented host identity-hydration gap; Android TV currently has equivalent Core hydration through its audited runtime metadata capability.
- V3 Lab bridge commit **bf37cbdf20dfefd6be3e6e033ea44f1fae675f2e** moves identity injection after `evaluate(wrappedCode)` and populates Core's canonical metadata cache before `getStreams`. Test commit **f65a8dfdd243e3ad963cc358f320a95a23c2e5eb** locks ordering, cache shape, no-secret behavior and idempotence. Commit **9135b4036f38fd5dca97e2a12d6ef1c3eb045b35** keeps only a temporary V2 marker for compatibility with the one-shot A/B harness; V3 is the active bridge.
- Runtime compatibility is now being made executable, not documentary only: migration `scripts/upgrade_runtime_media_identity_contract_v1.py` commit **12aec359e851fb080d41839f518c40968748b6f7**; strengthened `scripts/runtime_contract_gate.py` commit **988e2374fc05fb5aef62641e7b8a1a41bffaa544**; renderer commit **39bf05a107f2d3ce345f5031c20c350ef100a455**. The canonical JSONs/README must be generated and pass CI before this checkpoint is considered complete.
- Runtime-contract materialization workflow run **34344595051** was queued from commit **bc217211be6e4fd6226b5b93416b868d5c3a7feb**. It must prove migration idempotence, renderer fixed point, semantic assertions, and executable runtime gate before committing generated JSON/Markdown.
- V3 Desktop A/B run **34344396120** was in progress at this checkpoint. Do not claim the media identity root fix until the dual job proves an IMDb route and `count>0` with the protected PersianStremio bytes unchanged.

## Memory durability
- `.github/workflows/memory-checkpoint.yml` was previously main-only, so workbench checkpoints could remain outside `MEMORY.md`. Commit **c78baa379950bd30604a9463dd06be62d479f357** makes the writer branch-aware for `main` and `workbench/**`, checks out/pulls/pushes the actual branch, and keeps the append idempotent.
- This pending checkpoint update must trigger the branch-aware writer. Verify physically that this heading appears in workbench `MEMORY.md` and that the pending file is reset before considering memory persistence complete.

## Immediate continuation authority
1. Collect V3 A/B run **34344396120**. Success requires protected bytes unchanged, `/stream/movie/tt...json` observed, and `FIELD_NATIVE_RESULT count>0`; otherwise continue the runtime bisect without forcing the conclusion.
2. Collect runtime-contract run **34344595051** and verify generated `automation/platform-runtime-contracts.json`, `automation/nuvio-client-compatibility-matrix.json`, and `automation/PLATFORM-RUNTIME-CONTRACTS.md` physically contain the identity invariant.
3. Verify the branch-aware Memory writer appends this checkpoint into workbench `MEMORY.md` and clears `automation/memory-checkpoint-pending-v2.md`.
4. Once the V3 mechanism is proven, convert the Lab-only bridge into the smallest backward-compatible client/runtime contract for Desktop and Mobile; preserve the four-argument provider ABI and keep provider bytes/secrets untouched.
5. Remove one-shot/temporary workflow and marker after evidence is persisted.
6. Resume lane-scoped Repair across all 96 Provider Objects; protected green lanes remain exact-byte immutable unless live A/B proves a non-regressing replacement.
7. Mandatory end state remains all 96 plus five Native Labs (Android TV, Android Mobile, iOS Mobile, macOS Desktop, Windows Desktop), final projections, security/docs/minimizer/fixed-point gates, and the real Purstream House of the Dragon S3E1 check before publication.

# NiakVIO checkpoint — 2026-09-09 — runtime identity contract materialized + V3 harness correction

## Runtime compatibility is now durable and executable
- Runtime media-identity materialization workflow run **34344595051** completed **success**.
- Bot commit **2804a57480cc27d2754e55638a4fd26571ef7f7f** (`arch(runtime): materialize TMDB IMDb identity contract`) physically generated and committed the canonical runtime contract files.
- `automation/platform-runtime-contracts.json` now has audit date **2026-09-09**, capability `media_identity_hydration`, Desktop/Mobile marked with the current host-side identity gap, and Android TV marked as an equivalent `bridge` capability.
- `automation/nuvio-client-compatibility-matrix.json` now locks: positional `getStreams(tmdbId, mediaType, season, episode)` is transport rather than complete identity; canonical IMDb context path `__nuvioMediaContext.tmdbMetadata.external_ids.imdb_id`; canonical metadata cache `__nuvioTmdbMetadataCacheV1`; no end-user TMDB credential requirement; no TMDB secret projection requirement.
- Generated `automation/PLATFORM-RUNTIME-CONTRACTS.md` visibly contains the new `Hydratation identité TMDB ↔ IMDb` row and a dedicated canonical identity section, including the required host-bridge timing **after provider/Core initialization and before getStreams**.
- The one-shot materialization workflow was removed after proof in commit **e2e564277dd04e1779d4b0d638fc8c095ad97e70**. Keep the migration, renderer and executable gate; remove only temporary CI orchestration.

## Memory writer proof
- Branch-aware Memory run **34344670882** completed **success**.
- Workbench `MEMORY.md` was physically verified to contain the prior Desktop/Core/media-identity checkpoint; observed blob SHA **09801cc27a9b19a13fb79d86c629fec0e7555c98**.
- `automation/memory-checkpoint-pending-v2.md` was physically verified reset to ``. This proves workbench checkpoints now persist rather than remaining stranded outside MEMORY.

## V3 run 34344396120 is harness-invalid, not runtime evidence
- V3 A/B run **34344396120**, dual job **102442498820**, reached host IMDb resolution (`tt0816692`), protected-byte immutability and the V3 transform contract (`canonical_tmdb_cache=true post_core_init=true`).
- In the real suite, both human-UX checkout audits remained green and the V3 transform was applied to official NuvioDesktop `PluginRuntime.kt`.
- Execution then stopped immediately after `FIELD_NATIVE_DESKTOP_DUAL_ID_CONTEXT added=true version=3 ...`; no corpus log was produced, so PersianStremio itself was never executed in this run.
- Exact cause: the one-shot workflow still executed `grep -q 'NIAKVIO_LAB_DUAL_ID_CONTEXT_V2'` against the modified NuvioDesktop `PluginRuntime.kt`. The obsolete V2 marker existed only as a Python constant in the NiakVIO transform script and was never inserted into `PluginRuntime.kt`, so that grep necessarily returned 1.
- Therefore **34344396120 must never be interpreted as evidence that the V3 post-Core metadata-cache bridge failed**.
- Workflow commit **a7f2ad2cf917f8f91ac6320c28082ebcbb908d77** updates the harness to assert `NIAKVIO_LAB_DUAL_ID_CONTEXT_V3`, reports `canonical_tmdb_cache=true post_core_init=true`, and updates verdict wording to the canonical post-Core cache contract.
- Cleanup commit **cf1dc9c885935e4cffb0c95a82bb78ee20d563c8** removes the obsolete V2 compatibility marker entirely from the V3 transform.
- Final corrected A/B run **34344938190** is the first run on the clean V3 harness/transform pair. Success criteria remain: provider bytes unchanged, actual `/stream/movie/tt...json` route observed, and PersianStremio `FIELD_NATIVE_RESULT count>0`. Do not force the conclusion before this evidence exists.

## Continuation authority
1. Collect final V3 run **34344938190** and inspect the dual job log, actual route and count.
2. If V3 proves positive, persist the exact route/count/run/job and promote the mechanism from Lab evidence to the smallest backward-compatible Desktop/Mobile runtime contract, keeping the public four-argument provider ABI intact.
3. If V3 reaches IMDb but remains zero, inspect the backend response; if it fails before provider execution, fix the harness/runtime bridge and retry. Never collapse these cases into provider failure.
4. Remove `.github/workflows/desktop-dual-id-ab.yml` after decisive evidence is persisted; it is a one-shot diagnostic workflow.
5. Resume all-96 lane-scoped Repair and then the five mandatory Native Labs. Protected green lanes remain byte-immutable unless live A/B proves a non-regressing replacement.

## 2026-09-10 — semantic/transport drift caught before merge

- Final cleanup run `34412252681` correctly failed before commit on ANIDB because the candidate manifest exposed anime transport without the required `series` alias and still carried an obsolete anime->movie widening path.
- This supersedes stale docs/source that said anime-only `supportedTypes=[anime,tv,movie]`. Authoritative invariant: canonical semantics are `movie/tv/anime`; `series` is transport-only alias of `tv`; episodic anime may add `tv+series`; **movie must never be manufactured for anime-only** and appears only when `movie` is canonical provider capability.
- Internal Core may preserve a TMDB movie namespace inside an already-authorized anime request; that is not permission to expose a generic movie lane in manifest/health capability.
- Materializer, semantic enforcer, health/Repair inference, tests and current user-facing docs are reconciled to this invariant before merge.
- Repair run `34409463163` remains useful route/yield evidence but is no longer final acceptance for the transport matrix. A fresh authoritative Repair + four-version gate is mandatory after this correction.
- Do not delete `workbench/systemic-recovery-20260909` until corrected Repair, clean PR, merge and five Native Labs are green. Final branch target remains only `main` + `brain-learning/proposals`.

## 2026-09-10 — Repair migration forward-compatibility gate

- Corrected semantic/transport Repair uses the authoritative 188-task matrix; anime-only no longer gains an artificial movie lane and TV/anime episodic transport keeps `tv + series`.
- Fresh Repair runs then exposed stale *migration validators*, not provider/runtime failures: Source Plan V10 expected its pre-V14 materializer call shape; V18.4 expected its pre-V20 response-value scalar/depth/trace surroundings.
- V10 validation is now forward-compatible with V14 while still requiring `runtime_domain_replacements` as the only executable domain-replacement authority.
- V18.4 validation must preserve its bounded JSON-text bridge and sanitized trace but accept the current V20.x id/slug owner and depth-8 dependency replay. Its secret-leak audit is scoped to the actual `_spv184Trace` helper; later security-filter code containing words such as `authorization` is not trace output.
- These fixes change validators only. They do not alter provider DATA, routes, runtime algorithms or accepted stream evidence. A fresh full authoritative Repair + four-version gate remains mandatory before cleanup/merge.
