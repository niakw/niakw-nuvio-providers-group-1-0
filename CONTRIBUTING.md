# Contributing to NiakVIO

NiakVIO maintains, reconstructs and validates Nuvio providers. Contributions are welcome when they preserve the current Provider v3 ownership model and the reliability of published manifests.

## Before contributing

A change must not:

- introduce credentials, cookies, private tokens or personal data ;
- include copyrighted media files ;
- weaken security/network guards ;
- create a second publication pipeline or canonical manifest ;
- hand-edit generated provider bundles as durable source ;
- seed reconstruction from published/upstream Provider JS ;
- activate/disable/quarantine providers from weak evidence ;
- patch a Nuvio client inside a Lab merely to obtain a green result.

## Provider v3 ownership

Durable provider code is reconstructed from:

```text
ProviderBase v3 + structured DATA/static knowledge + owned PROVIDER.* / CORE.* Lego
```

The canonical ProviderBase marker is `NIAKVIO_PROVIDER_BASE_OWNED_V3`.

Managed changes use `STARTFIX/CLOSEFIX` and `FIXDATA` where required. `providers/*.js` is generated/content-addressed runtime output, not a source file to maintain manually.

Full reconstruction uses `.github/workflows/provider-v3-reconstruct-all.yml` on a non-main branch and must pass reverse byte-identical reconstruction.

## Media types

Do not confuse semantic capability and launch transport.

- `canonicalSupportedTypes` = real catalogue capability ;
- `supportedTypes` = Nuvio launch compatibility.

An anime-only provider may require:

```text
canonicalSupportedTypes = [anime]
supportedTypes = [anime, tv, series]
```

`tv` and `series` are episodic transport aliases. `movie` is present only for providers with canonical movie capability; aliases never authorize additional semantic content.

## Provider protocol and routes

Canonical route DATA belongs to:

```text
provider.model.routeData
```

When fixing or onboarding a provider, preserve when known:

- request role ;
- GET/POST/etc. ;
- body encoding and field names ;
- `Referer` / `Origin` requirements ;
- response type ;
- dynamic placeholders ;
- title/TMDB/IMDb/season/episode identity dependencies ;
- provenance and confidence.

Do not turn filenames, assets, HTML attributes, admin routes or unrelated endpoints into executable provider routes.

A hub is a discovery signal for the current service address. It does not replace the provider business protocol.

## Runtime expectations

A provider change should preserve:

- capability gate before provider network work ;
- TMDB calls only when required by the plan ;
- correct movie/tv/anime identity ;
- correct season/episode ;
- fail-closed empty result rather than wrong media ;
- stream-level failures scoped to the stream, not automatic provider-wide disablement.

A successful HTTP response alone is not a functional provider proof.

## Testing

Minimum repository setup:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
node engine_v2/tests/provider-catalog.test.mjs
```

Add targeted regression coverage for the root cause when practical.

Provider/runtime changes should validate, when relevant:

- title/identity ;
- media type ;
- season/episode ;
- route/API method/body/headers ;
- player/embed extraction ;
- final media shape ;
- language/quality metadata ;
- rejection of false positives.

Mocked fixtures alone are not enough to claim current live provider health.

## Native Labs

There are exactly five first-class targets:

1. TV Android ;
2. Mobile Android ;
3. Mobile iOS ;
4. Desktop macOS ;
5. Desktop Windows.

Platform evidence is independent.

Native Labs are observational. Test-only plumbing may expose the official path, but a Lab contribution must not modify Nuvio production behavior or work around an upstream compile/build/dependency/packaging/runtime/player bug to make the run green.

If NuvioTV/NuvioMobile/NuvioDesktop itself fails, preserve that as external evidence and fix NiakVIO only when the cause is demonstrably NiakVIO-owned.

## CORE Quick / Deep

`.github/workflows/sync.yml` is **CORE - Verify & Publish**.

Quick and Deep verify/observe. They do not repair or reconstruct provider code.

Do not add provider mutation, adaptive repair or reconstruction back into Quick/Deep.

## Learning

`brain-learning-lab.yml` is the sandbox for bounded NiakVIO repair experiments. Learning output is reviewable proposal material, not direct publication authority.

Disabled providers remain eligible for diagnosis; disabled does not mean forgotten.

## Domain Refresh

`domain-refresh.yml` is the only routine provider CONFIG maintenance exception:

- validated official hub/address ;
- `official_site` only ;
- no API/route/Core change ;
- provider structure unchanged outside CONFIG ;
- content-addressed outputs/hashes refreshed consistently.

Do not manually broaden Domain Refresh to generic repair.

## Minimizer

Terser is forbidden.

`scripts/provider_v3_minimizer.py` must preserve provider envelopes, managed markers, Core boundary, execution order, literals and ASI-sensitive newlines. Do not add identifier renaming, expression reordering, literal folding or generic text replacement.

## Security

Do not contribute code that:

- executes downloaded remote code as trusted source ;
- bypasses SSRF/network guards ;
- disables domain validation ;
- exposes credentials ;
- weakens worker/resource limits ;
- accepts arbitrary unsafe protocols ;
- uses generic regex HTML stripping where the security contract forbids it ;
- disables CodeQL/tests to hide a finding.

Generated/upstream snapshots remain untrusted even when a static-analysis finding is classified as vendored/generated.

## Pull requests

Keep PRs focused and include:

- root cause ;
- affected providers/components ;
- files changed ;
- tests executed ;
- live/native evidence when applicable ;
- known limitations.

Do not mix unrelated provider-specific patches unless one shared Core/architecture root cause explains them.

## Reports

A useful broken-provider report includes:

- provider ID/name ;
- manifest ;
- client/device ;
- movie/tv/anime ;
- title/year ;
- season/episode when relevant ;
- observed result/error ;
- approximate test date/time ;
- sanitized logs.

Never publish cookies, tokens or private information.

## Availability claims

Domains, APIs and players change. Avoid statements like “permanently fixed”. State what was tested and on which client/device/date.

A missing proof is not a success, but it is not automatically proof of death either.
