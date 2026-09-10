<div align="center">
  <img src="assets/branding/niakvio-logo.svg" alt="NiakVIO" width="560">

  <p><a href="README.md">English</a> · <strong>Français</strong></p>
  <h3>Une seule couche providers maintenue pour Nuvio.</h3>
  <p><strong>96 Provider Objects · VO / VF · TV / Mobile / Desktop</strong></p>
  <p>Installez un seul repository providers. Gardez un large catalogue pendant que NiakVIO gère maintenance structurée, changements de domaines, validation et publications cache-safe.</p>
</div>

---

## Installer NiakVIO

**Recommandé — manifest général**  
[`manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/manifest.json)

**Manifest orienté français**  
[`vf/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/vf/manifest.json)

**Manifest général sans providers orientés anime**  
[`no-anime/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/no-anime/manifest.json)

**Manifest français sans providers orientés anime**  
[`vf-no-anime/manifest.json`](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/vf-no-anime/manifest.json)

Guide manifest : [`docs/fr/how-to-add-manifest.md`](docs/fr/how-to-add-manifest.md)

### Feed StreamBadge

[`assets/stream-badges-fusion-v2.json`](https://raw.githubusercontent.com/niakw/NiakVIO/main/assets/stream-badges-fusion-v2.json)

Guide StreamBadge : [`docs/fr/how-to-add-stream-badges.md`](docs/fr/how-to-add-stream-badges.md)

> NiakVIO n’héberge aucune vidéo. Le projet maintient métadonnées providers, connaissance protocolaire structurée, règles de compatibilité, manifests et bundles providers exécutés côté client.

> [!IMPORTANT]
> Les œuvres citées dans le code, les CI ou la documentation sont des **fixtures de test déterministes**, pas un catalogue. Voir [`TESTING_NOTICE.md`](TESTING_NOTICE.md) et [`DISCLAIMER.md`](DISCLAIMER.md).

---

## Pourquoi NiakVIO ?

Une couche providers est simple tant que tout reste statique. Le vrai problème commence quand les domaines tournent, les API changent, les contraintes de lecture évoluent, les clients se comportent différemment ou qu’une génération provider reste bloquée en cache.

NiakVIO est construit autour de ce problème.

- **96 Provider Objects restent dans le census** — les providers désactivés ou non résolus ne sont pas supprimés silencieusement pour améliorer un taux de réussite.
- **Projections VO et VF** — un catalogue maintenu avec des manifests dédiés au français.
- **Une seule couche providers** — évite d’empiler plusieurs packs qui doublonnent le même rôle.
- **Connaissance structurée** — routes, sémantique des requêtes, identité média et domaines officiels vivent hors des bundles JS opaques publiés.
- **Architecture réparable** — les défauts communs peuvent être corrigés au niveau Provider/Core/famille ; les changements incertains passent par des propositions Learning reviewables.
- **Preuves natives** — TV Android, Mobile Android, Mobile iOS, macOS et Windows sont cinq frontières de compatibilité indépendantes.
- **Publication cache-safe** — versions providers, versions manifest, bundles adressés par contenu et métadonnées d’intégrité restent synchronisés.
- **Validation fail-closed** — zéro flux, mauvais média, média malformé et panne upstream d’un client restent des états distincts au lieu d’être maquillés en succès.

<div align="center">
  <img src="assets/branding/how-it-works.png" alt="Fonctionnement de NiakVIO" width="820">
</div>

---

## Configuration Nuvio recommandée

<div align="center">
  <a href="https://github.com/NuvioMedia"><img src="assets/thanks/nuvio-bg.png" alt="Nuvio" width="150"></a>
  <p><strong>Gardez une stack simple : un outil par rôle.</strong></p>
</div>

### Providers — NiakVIO

<img src="assets/branding/niakvio-mark.svg" alt="NiakVIO" width="72" align="left">

Utilisez **NiakVIO uniquement** pour la couche providers. Cela garde la sélection des sources, le cache et le diagnostic compréhensibles au lieu d’empiler plusieurs packs providers qui font le même travail.

**Liens :** [repository NiakVIO](https://github.com/niakw/NiakVIO) · [manifest général](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/manifest.json)

<br clear="left">

### Métadonnées & catalogue — Ultra MAX

<img src="assets/thanks/ultramax-bg.png" alt="Ultra MAX" width="72" align="left">

Utilisez **Ultra MAX** pour les catalogues, rangées de découverte et fonctions orientées métadonnées plutôt que d’ajouter une seconde couche providers.

**Liens :** [Ultra MAX](https://ultramax.vip) · [GitHub](https://github.com/PaRaN01a-hash/UltraMax)

<br clear="left">

### Sous-titres — SubSense

<img src="assets/thanks/subsense-bg.png" alt="SubSense" width="72" align="left">

Utilisez **SubSense** comme addon de sous-titres.

**Liens :** [Configurer SubSense](https://subsense.nepiraw.com/configure) · [GitHub](https://github.com/NepiRaw/Stremio-SubSense)

<br clear="left">

### Favoris & suivi — SIMKL

<img src="assets/thanks/simkl-bg.png" alt="SIMKL" width="72" align="left">

Utilisez **SIMKL** pour l’historique, les favoris et le suivi.

**Lien :** [SIMKL](https://simkl.com)

<br clear="left">

Le principe est volontairement simple : **une couche providers, un addon métadonnées/catalogue, un addon sous-titres et un service de suivi**.

---

## NiakVIO vs un manifest provider brut

Un provider ou manifest autonome peut très bien convenir. NiakVIO prend surtout son sens quand l’objectif devient un **gros catalogue providers mouvant, maintenable sur plusieurs clients Nuvio**.

| Capacité | Provider / manifest brut | NiakVIO |
| --- | --- | --- |
| Installation | Un ou plusieurs manifests providers | Une couche stable avec projections générales/VF |
| Maintenance catalogue | Principalement manuelle | 96 Provider Objects conservés et audités |
| Source durable | Souvent le JS publié lui-même | ProviderBase v3 + DATA structurée + Lego Provider/Core détenus |
| Connaissance routes | Souvent enfouie dans le code | Routes/requêtes/provenance structurées |
| Rotation domaines | Changement manuel/statique | Découverte hub officiel + refresh `official_site` borné |
| Types média | Type de lancement et capacité sémantique parfois mélangés | Capacité canonique séparée de la compatibilité transport Nuvio |
| Diagnostic | Souvent zéro flux / erreur générique | Preuves search, detail, episode, runtime, player, media, device |
| Réparation | Réécriture manuelle | Réparation famille/Core + propositions Learning reviewables |
| Couverture clients | Souvent extrapolée depuis un seul runtime | Cinq Labs natifs indépendants |
| Publication | Remplacement de fichier | Versions provider cache-safe + génération manifest + hashes d’intégrité |
| Sécurité | Dépend de la source | Exécution bornée, contrôles réseau/ressources et contrats de sanitization |

---

## Pensé pour les clients Nuvio officiels

Chaque client/device est une frontière de compatibilité indépendante :

- **TV Android** — [NuvioTV](https://github.com/NuvioMedia/NuvioTV)
- **Mobile Android** — [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile)
- **Mobile iOS** — [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile)
- **Desktop macOS** — [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop)
- **Desktop Windows** — [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop)

Une preuve Desktop ne vaut jamais automatiquement preuve Android/iOS/TV. Les Labs consomment les clients officiels tels quels : une erreur upstream de compilation, dépendance, packaging, runtime, player ou QuickJS reste visible au lieu d’être patchée dans NiakVIO uniquement pour fabriquer une CI verte.

---

## Sous le capot

### Provider v3

Les bundles providers sont reconstruits depuis :

```text
ProviderBase v3
+ DATA/connaissance statique provider structurée
+ Lego PROVIDER.*
+ Lego CORE.*
+ minimizer NiakVIO sécurisé
```

Les fichiers publiés `providers/*.js` sont des artefacts runtime adressés par contenu, **jamais des seeds de reconstruction**. Le JavaScript upstream/historique sert uniquement de connaissance et de provenance.

Les ownerships utilisent les limites gérées `STARTFIX` / `CLOSEFIX` / `FIXDATA` et une seule frontière Core globale. La reconstruction complète doit finir par une preuve de reverse rebuild byte-identique. Terser est interdit ; `scripts/provider_v3_minimizer.py` reste volontairement conservateur et s’exécute avant le hashing.

Voir [`ARCHITECTURE.md`](ARCHITECTURE.md).

### DATA routes / protocoles

La source durable est :

```text
provider.model.routeData
```

La reconnaissance conserve, lorsqu’ils sont connus, méthode, encodage et champs du body, `Referer`, `Origin`, type de réponse, placeholders, rôle, provenance et confiance. L’analyse statique peut récupérer variables, concaténations et templates sans traiter le bundle provider publié comme autorité de reconstruction.

Une absence de route prouvée signifie **inconnu**, pas automatiquement mort ou quarantiné.

### Types média : capacité sémantique vs transport Nuvio

`canonicalSupportedTypes` décrit ce que le catalogue du provider sert réellement (`movie`, `tv`, `anime`). `supportedTypes` décrit comment Nuvio peut lancer le provider.

Un provider exclusivement anime peut donc légitimement exposer :

```json
{
  "canonicalSupportedTypes": ["anime"],
  "supportedTypes": ["anime", "tv", "series"]
}
```

`tv` et `series` sont les alias de transport épisodique de l’anime. `movie` n’est exposé que si le provider déclare réellement une capacité canonique `movie` ; les alias de transport n’élargissent jamais la capacité sémantique.

### Règles runtime

Le Provider JS est un reader spécialisé, pas un crawler ni un moteur Learning.

- gate capacité/type avant tout réseau provider ;
- enrichissement TMDB uniquement si le plan provider en a besoin ;
- identité scoped par œuvre/type/saison/épisode ;
- provider incompatible → `[]`, pas recherche arbitraire ;
- Core ne traite les sorties qu’après présence de flux utiles ;
- zéro flux ne fabrique jamais un succès ;
- mauvais média = échec ;
- un flux cassé ne désactive jamais tout le provider à lui seul.

### Reader, transport et lecture

Une URL `.m3u8` ou une réponse `#EXTM3U` ne prouve pas une lecture native. NiakVIO sépare extraction, identité, contexte de requête, résolution playlist/variant, intégrité média/conteneur et résultat réel du player natif.

HTML/JSON déguisé en média ou TS/fMP4 positivement malformé peut être rejeté. Un timeout, une panne temporaire, un flux chiffré ou une API byte de diagnostic indisponible reste **inconclusif**, pas une preuve de panne provider généralisée.

---

## CORE, Learning et Domain Refresh

`CORE - Verify & Publish` est le workflow courant de publication.

- **Quick** — checks déterministes structure/runtime/unit/security/minimizer. Aucune réparation/reconstruction provider.
- **Deep** — observation réseau/hub plus large en lecture seule, health providers, projections, rapports et inventaires d’intégrité. Toujours aucune réparation/reconstruction Provider JS.
- **Learning** — chemin isolé d’évolution/réparation du code. Les changements proposés restent reviewables avant publication.
- **Domain Refresh** — maintenance volontairement limitée au DATA CONFIG `official_site` validé.

Cette séparation évite qu’un simple health check réécrive silencieusement un provider parce qu’un site est temporairement indisponible.

---

## Publication et versions

La publication est atomique et fail-closed. Tout changement des bytes provider publiés impose une synchronisation des versions provider/manifest/cache/release, mais **le bump n’est effectué qu’une fois la pile de validation acceptée**.

La release acceptée est finalisée explicitement via `release-finalize.yml`. Le workflow checkout le SHA accepté exact, utilise soit une baseline explicite soit le commit le plus ancien de la génération de version courante, puis synchronise versions provider/manifest/cache/release, projections des manifests, hashes et métadonnées d’intégrité dans une seule transaction de release. Il ne répare ni ne reconstruit les bytes providers.

Un census route-only, une mise à jour documentation ou un changement workflow qui ne modifie pas les bytes provider publiés ne déclenche **aucun bump provider/cache**. `sync.yml` Quick/Deep reste orienté validation et ne mute pas les versions de release en routine.

La publication finale peut inclure :

- `provider_catalog.json` ;
- bundles providers adressés par contenu ;
- `manifest.json` et projections VF/no-anime ;
- état provenance/domaines ;
- versions provider/cache/release synchronisées ;
- hashes de release et rapports allowlistés.

---

## Principaux workflows

| Workflow | Responsabilité |
| --- | --- |
| `sync.yml` | **CORE - Verify & Publish** Quick/Deep ; aucune réparation/reconstruction provider ni bump release de routine |
| `release-finalize.yml` | finalisation release acceptée au SHA exact : versions, projections, hashes et intégrité synchronisés |
| `provider-v3-reconstruct-routes.yml` | reconnaissance route-only / census `routeData` canonique |
| `provider-v3-reconstruct-all.yml` | reconstruction complète Provider v3 + reverse byte proof |
| `brain-learning-lab.yml` | observation/réparation Learning sandbox + propositions reviewables |
| `domain-refresh.yml` | maintenance `official_site` CONFIG uniquement |
| `add-provider.yml` | onboarding provider structuré |
| `native-mobile-android-reader.yml` | preuves TV Android + Mobile Android |
| `native-mobile-ios-reader.yml` | preuves Mobile iOS |
| `native-desktop-reader-acceptance.yml` | preuves Desktop macOS + Windows |
| `native-corpus-device-targeted.yml` | diagnostics ciblés device/provider |
| `github-actions-gate.yml` | invariants sécurité/compatibilité workflows et repository |
| `codeql.yml` | preuve locale CodeQL `security-extended` + audit High/Critical des dépendances production |
| `weekly-upstream-provider-discovery.yml` | découverte upstream en lecture seule |
| `purge-actions-history.yml` | nettoyage historique Actions |
| `brain-branch-maintenance.yml` | maintenance du store Learning/proposals |

---

## Merci & connaissances upstream

NiakVIO est indépendant. Ces projets sont des références upstream utiles et méritent un crédit explicite ; ils ne constituent **pas** une autorité de reconstruction NiakVIO.

### Gowaru

[<img src="assets/thanks/gowaru-bg.png" alt="Gowaru" width="170">](https://github.com/Gowaru/gowaru-nuvio-providers)

Implémentations providers Nuvio françaises avec sources locales et connaissance protocolaire utiles comme preuve/provenance upstream.

**Repository :** [Gowaru/gowaru-nuvio-providers](https://github.com/Gowaru/gowaru-nuvio-providers)

### Yoru

[<img src="assets/thanks/yoru-bg.png" alt="Yoru" width="170">](https://github.com/yoruix/nuvio-providers)

Implémentations providers et conventions Nuvio réutilisables utiles pour croiser les comportements runtime et les interfaces.

**Repository :** [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers)

### All-in-One Nuvio / D3adlyRocket

[<img src="assets/thanks/deadlyrocket-bg.png" alt="All-in-One Nuvio / D3adlyRocket" width="170">](https://github.com/D3adlyRocket/All-in-One-Nuvio)

Matériel historique d’agrégation/mirror providers utilisé comme source de provenance lorsque pertinent, jamais comme autorité de reconstruction NiakVIO.

**Repository :** [D3adlyRocket/All-in-One-Nuvio](https://github.com/D3adlyRocket/All-in-One-Nuvio)

---

## Sécurité, responsabilité et indépendance

Le JavaScript provider est traité comme une entrée non fiable. NiakVIO utilise workers bornés, contrôles SSRF/réseau, sandboxing, vérifications d’identité, sanitization CI et publication fail-closed. Le stripping HTML générique par regex est interdit par le contrat sécurité Provider v3.

NiakVIO est un projet communautaire indépendant, non affilié à Nuvio ni aux services tiers cités. Rien dans ce repository n’accorde de droits sur des médias/services tiers ni n’autorise le contournement d’une authentification, d’un paywall, d’un chiffrement ou d’un contrôle d’accès.

Voir [`SECURITY.md`](SECURITY.md), [`TESTING_NOTICE.md`](TESTING_NOTICE.md), [`DISCLAIMER.md`](DISCLAIMER.md), [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), [`CONTRIBUTING.md`](CONTRIBUTING.md) et [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
