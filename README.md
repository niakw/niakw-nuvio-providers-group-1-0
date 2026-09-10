<div align="center">
  <img src="assets/branding/niakvio-logo.svg" alt="NiakVIO" width="560">

  <p><strong>English</strong> · <a href="README.fr.md">Français</a></p>
  <h3>One maintained provider layer for Nuvio.</h3>
  <p><strong>96 Provider Objects · VO / VF · TV / Mobile / Desktop</strong></p>
  <p>Install one provider repository. Keep a broad catalogue while NiakVIO handles structured maintenance, domain changes, validation and cache-safe releases.</p>
</div>

---

## Install NiakVIO

**Recommended — general manifest**  
[`manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/manifest.json)

**French-focused manifest**  
[`vf/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/vf/manifest.json)

**General manifest without anime-oriented providers**  
[`no-anime/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/no-anime/manifest.json)

**French-focused manifest without anime-oriented providers**  
[`vf-no-anime/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/vf-no-anime/manifest.json)

Manifest guide: [`docs/how-to-add-manifest.md`](docs/how-to-add-manifest.md)

### StreamBadge feed

[`assets/stream-badges-fusion-v2.json`](https://raw.githubusercontent.com/niakw/NiakVIO/main/assets/stream-badges-fusion-v2.json)

StreamBadge guide: [`docs/how-to-add-stream-badges.md`](docs/how-to-add-stream-badges.md)

> NiakVIO does not host video. It maintains provider metadata, structured protocol knowledge, compatibility rules, manifests and client-side provider bundles.

> [!IMPORTANT]
> Named works in code, CI or documentation are deterministic **test fixtures**, not a catalogue. See [`TESTING_NOTICE.md`](TESTING_NOTICE.md) and [`DISCLAIMER.md`](DISCLAIMER.md).

---

## Why NiakVIO?

A provider layer is easy while everything is static. The real maintenance problem starts when domains rotate, APIs change, player requirements drift, clients behave differently, or a cached provider generation refuses to refresh.

NiakVIO is built around that problem.

- **96 Provider Objects stay in the census** — disabled or unresolved providers are not silently removed to improve a success rate.
- **VO and VF projections** — one maintained catalogue with dedicated French-focused manifests.
- **One provider layer** — avoid stacking several provider packs that duplicate the same role.
- **Structured provider knowledge** — routes, request semantics, identity rules and official-domain evidence live outside opaque published bundles.
- **Repairable architecture** — common failures can be fixed at Provider/Core-family level; uncertain changes go through reviewable Learning proposals.
- **Native compatibility evidence** — TV Android, Mobile Android, Mobile iOS, macOS and Windows are independent compatibility boundaries.
- **Cache-safe publication** — provider versions, manifest versions, content-addressed bundles and integrity metadata remain synchronized.
- **Fail-closed validation** — zero streams, wrong-media playback, malformed media and upstream client failures remain distinct states instead of fake success.

<div align="center">
  <img src="assets/branding/how-it-works-en.svg" alt="How NiakVIO works" width="820">
</div>

---

## Recommended Nuvio setup

<div align="center">
  <a href="https://github.com/NuvioMedia"><img src="assets/thanks/nuvio-bg.png" alt="Nuvio" width="150"></a>
  <p><strong>Keep the stack small: one tool per role.</strong></p>
</div>

### Providers — NiakVIO

<img src="assets/branding/niakvio-mark.svg" alt="NiakVIO" width="72" align="left">

Use **NiakVIO only** for the provider layer. That keeps source selection, cache behavior and provider diagnostics understandable instead of duplicating the same role through multiple provider packs.

**Links:** [NiakVIO repository](https://github.com/niakw/NiakVIO) · [General manifest](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/manifest.json)

<br clear="left">

### Metadata & catalogue — Ultra MAX

<img src="assets/thanks/ultramax-bg.png" alt="Ultra MAX" width="72" align="left">

Use **Ultra MAX** for catalogues, metadata-oriented rows and discovery rather than adding another provider layer.

**Links:** [Ultra MAX](https://ultramax.vip) · [GitHub](https://github.com/PaRaN01a-hash/UltraMax)

<br clear="left">

### Subtitles — SubSense

<img src="assets/thanks/subsense-bg.png" alt="SubSense" width="72" align="left">

Use **SubSense** as the subtitle addon.

**Links:** [Configure SubSense](https://subsense.nepiraw.com/configure) · [GitHub](https://github.com/NepiRaw/Stremio-SubSense)

<br clear="left">

### Favorites & tracking — SIMKL

<img src="assets/thanks/simkl-bg.png" alt="SIMKL" width="72" align="left">

Use **SIMKL** for watch history, favorites and tracking.

**Link:** [SIMKL](https://simkl.com)

<br clear="left">

The goal is deliberately simple: **one provider layer, one metadata/catalogue addon, one subtitle addon and one tracking service**.

---

## NiakVIO vs a raw provider manifest

A standalone provider or manifest can be perfectly useful. NiakVIO becomes valuable when the objective is a **large, changing provider catalogue that must remain maintainable across multiple Nuvio clients**.

| Capability | Raw provider / standalone manifest | NiakVIO |
| --- | --- | --- |
| Installation | One or several provider manifests | One stable provider layer with general/VF projections |
| Catalogue maintenance | Mostly manual | 96 Provider Objects retained and audited |
| Durable source | Often the published JS itself | ProviderBase v3 + structured DATA + owned Provider/Core Lego |
| Route knowledge | Usually embedded in provider code | Structured route/request/provenance data |
| Domain rotation | Manual/static URL changes | Official-hub discovery + bounded `official_site` refresh |
| Media types | Launch type and semantic capability can be mixed | Canonical capability separated from Nuvio transport compatibility |
| Failure diagnosis | Often zero streams / generic error | Search, detail, episode, runtime, player, media and device evidence |
| Repair | Manual provider rewrite | Family/Core repair + reviewable Learning proposals |
| Client coverage | Often inferred from one runtime | Five independent native Labs |
| Publication | File replacement | Cache-safe provider versions + manifest generation + integrity hashes |
| Security | Source-dependent | Bounded execution, network/resource guards and sanitization contracts |

---

## Built for the official Nuvio clients

NiakVIO treats every official client/device as its own compatibility boundary:

- **TV Android** — [NuvioTV](https://github.com/NuvioMedia/NuvioTV)
- **Mobile Android** — [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile)
- **Mobile iOS** — [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile)
- **Desktop macOS** — [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop)
- **Desktop Windows** — [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop)

A Desktop result does not automatically count as Android/iOS/TV evidence. Labs consume official clients as-is: an upstream compile, dependency, packaging, runtime, player or QuickJS failure stays visible instead of being patched inside NiakVIO merely to manufacture green CI.

---

## Under the hood

### Provider v3

Provider bundles are reconstructed from:

```text
ProviderBase v3
+ structured provider DATA/static knowledge
+ PROVIDER.* Lego
+ CORE.* Lego
+ NiakVIO-safe minimizer
```

Published `providers/*.js` files are content-addressed runtime artifacts, **never reconstruction seeds**. Historical/upstream JavaScript is knowledge and provenance only.

Canonical ownership uses managed `STARTFIX` / `CLOSEFIX` / `FIXDATA` boundaries and one global Core boundary. Full reconstruction must finish with a byte-identical reverse rebuild. Terser is forbidden; `scripts/provider_v3_minimizer.py` is deliberately conservative and runs before content hashing.

See [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Route and protocol DATA

The durable source is:

```text
provider.model.routeData
```

Route recognition preserves, when known, method, body encoding and fields, `Referer`, `Origin`, response kind, placeholders, role, provenance and confidence. Static analysis can recover variables, concatenations and templates without treating the published provider bundle as reconstruction authority.

Missing route evidence means **unknown**, not automatically dead or quarantined.

### Media types: semantic capability vs Nuvio transport

`canonicalSupportedTypes` describes what the provider catalogue actually serves (`movie`, `tv`, `anime`). `supportedTypes` describes how Nuvio may launch it.

An anime-only provider can therefore legitimately expose:

```json
{
  "canonicalSupportedTypes": ["anime"],
  "supportedTypes": ["anime", "tv", "series"]
}
```

`tv` and `series` are episodic transport aliases for anime. `movie` appears only when the provider declares canonical movie capability; transport aliases never widen semantic capability.

### Runtime rules

Provider JS is a specialized reader, not a crawler or Learning engine.

- capability/type gate before provider network work;
- TMDB enrichment only when the provider plan needs it;
- identity scoped by work/type/season/episode;
- incompatible provider returns `[]` instead of arbitrary searching;
- Core output processing runs only after useful streams exist;
- zero streams never manufacture success;
- wrong-media playback is a failure;
- one broken stream never disables the whole provider by itself.

### Reader, transport and playback

A `.m3u8` URL or `#EXTM3U` response does not prove native playback. NiakVIO separates extraction, identity, request context, playlist/variant resolution, media/container integrity and the actual native player outcome.

HTML/JSON disguised as media or positively malformed TS/fMP4 can be rejected. A timeout, temporary fetch failure, encrypted stream or unavailable diagnostic byte API is **inconclusive**, not evidence for a fabricated provider-wide failure.

---

## CORE, Learning and Domain Refresh

`CORE - Verify & Publish` is the routine publication workflow.

- **Quick** — deterministic structure/runtime/unit/security/minimizer checks. No provider repair or reconstruction.
- **Deep** — broader read-only network/hub observation, provider-health evidence, projections, reports and integrity inventories. Still no Provider JS repair/reconstruction.
- **Learning** — isolated code-evolution/repair path. Proposed changes remain reviewable before publication authority.
- **Domain Refresh** — deliberately narrow maintenance of validated `official_site` CONFIG data only.

This separation prevents a health check from silently rewriting a provider just because a site is temporarily unavailable.

---

## Publication and versioning

Publication is atomic and fail-closed. Published provider-byte changes require synchronized provider/manifest/cache/release metadata, but **the bump happens only after the validation pile is accepted**.

The accepted release is finalized explicitly through `release-finalize.yml`. It checks out the exact accepted SHA, uses either an explicit baseline or the oldest commit in the current release-version generation, and then synchronizes provider/manifest/cache/release versions, manifest projections, hashes and integrity metadata as one release transaction. It does **not** repair or reconstruct provider bytes.

Route-only census, documentation and workflow-only changes that do not alter published provider bytes do **not** trigger a provider/cache bump. `sync.yml` Quick/Deep remains validation-oriented and does not routinely mutate release versions.

Final publication can include:

- `provider_catalog.json`;
- content-addressed provider bundles;
- `manifest.json` and VF/no-anime projections;
- provenance/domain state;
- synchronized provider/cache/release versions;
- release hashes and allowlisted reports.

---

## Main workflows

| Workflow | Responsibility |
| --- | --- |
| `sync.yml` | **CORE - Verify & Publish** Quick/Deep; no provider repair/reconstruction or routine release bump |
| `release-finalize.yml` | exact-SHA accepted-release finalization: synchronized versions, projections, hashes and integrity |
| `provider-v3-reconstruct-routes.yml` | route-only recognition / canonical `routeData` census |
| `provider-v3-reconstruct-all.yml` | full Provider v3 reconstruction + reverse byte proof |
| `brain-learning-lab.yml` | sandbox observation/repair Learning + reviewable proposals |
| `domain-refresh.yml` | validated `official_site` CONFIG-only maintenance |
| `add-provider.yml` | structured provider onboarding |
| `native-mobile-android-reader.yml` | TV Android + Mobile Android evidence |
| `native-mobile-ios-reader.yml` | Mobile iOS evidence |
| `native-desktop-reader-acceptance.yml` | Desktop macOS + Windows evidence |
| `native-corpus-device-targeted.yml` | targeted device/provider diagnostics |
| `github-actions-gate.yml` | workflow/repository security and compatibility invariants |
| `codeql.yml` | local CodeQL `security-extended` evidence + High/Critical production dependency audit |
| `weekly-upstream-provider-discovery.yml` | read-only upstream discovery |
| `purge-actions-history.yml` | old Actions-run cleanup |
| `brain-branch-maintenance.yml` | Learning/proposals store maintenance |

---

## Thanks & upstream knowledge

NiakVIO is independent. These projects are useful upstream references and deserve explicit credit; they are **not** NiakVIO reconstruction authorities.

### Gowaru

[<img src="assets/thanks/gowaru-bg.png" alt="Gowaru" width="170">](https://github.com/Gowaru/gowaru-nuvio-providers)

French Nuvio provider implementations with provider-local source and protocol knowledge that can be used as upstream evidence/provenance.

**Repository:** [Gowaru/gowaru-nuvio-providers](https://github.com/Gowaru/gowaru-nuvio-providers)

### Yoru

[<img src="assets/thanks/yoru-bg.png" alt="Yoru" width="170">](https://github.com/yoruix/nuvio-providers)

Provider implementations and reusable Nuvio provider conventions that help cross-check runtime behavior and interfaces.

**Repository:** [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers)

### All-in-One Nuvio / D3adlyRocket

[<img src="assets/thanks/deadlyrocket-bg.png" alt="All-in-One Nuvio / D3adlyRocket" width="170">](https://github.com/D3adlyRocket/All-in-One-Nuvio)

Historical provider aggregation/mirror material used as one provenance source where relevant, never as NiakVIO reconstruction authority.

**Repository:** [D3adlyRocket/All-in-One-Nuvio](https://github.com/D3adlyRocket/All-in-One-Nuvio)

---

## Security, responsibility and independence

Provider JavaScript is treated as untrusted input. NiakVIO uses bounded workers, SSRF/network controls, sandboxing, identity checks, CI sanitization and fail-closed publication. Generic regex-based HTML stripping is forbidden by the Provider v3 security contract.

NiakVIO is an independent community project and is not affiliated with Nuvio or referenced third-party services. Nothing in this repository grants rights to third-party media/services or authorizes bypassing authentication, paywalls, encryption or access controls.

See [`SECURITY.md`](SECURITY.md), [`TESTING_NOTICE.md`](TESTING_NOTICE.md), [`DISCLAIMER.md`](DISCLAIMER.md), [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
