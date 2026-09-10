# Validation

## Suite locale

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
node engine_v2/tests/provider-catalog.test.mjs
```

Les tests couvrent notamment :

- sécurité réseau/SSRF, limites mémoire/temps/sorties ;
- syntaxe et contrat `getStreams` des bundles publiés ;
- P2P/torrent interdits ;
- projections de manifests et langues ;
- Provider v3, reverse reconstruction et minimizer ;
- type canonique vs transport Nuvio ;
- identité movie/tv/anime, saison/épisode ;
- HLS/DASH/MP4/Matroska/MPEG-TS ;
- provenance, versions, hashes et release integrity ;
- contrats des cinq Native Labs.

## Matrice native

La surface d’acceptation est exactement :

1. TV Android — NuvioTV ;
2. Mobile Android — NuvioMobile ;
3. Mobile iOS — NuvioMobile ;
4. Desktop macOS — NuvioDesktop ;
5. Desktop Windows — NuvioDesktop.

Workflows :

- `.github/workflows/native-mobile-android-reader.yml` ;
- `.github/workflows/native-mobile-ios-reader.yml` ;
- `.github/workflows/native-desktop-reader-acceptance.yml` ;
- `.github/workflows/native-corpus-device-targeted.yml` pour les diagnostics ciblés.

La liste des fixtures est centralisée dans `.github/triggers/nuvio-client-lab.json`. Le trigger de validation complète est `.github/triggers/full-native-lab-validation.json`.

### Couverture dérivée, jamais figée

Le catalogue reste **96 providers**. Le nombre de routes natives est calculé depuis le `manifest.json` courant et ses `supportedTypes` ; il ne doit pas être recopié comme constante historique dans la documentation.

La distinction est obligatoire :

- `canonicalSupportedTypes` = capacité sémantique réelle ;
- `supportedTypes` = surface de lancement Nuvio.

Un provider canonique anime-only peut donc avoir `supportedTypes = [anime, tv, series]`. Les voies `anime`, `tv` et `series` restent des lancements compatibles sans élargir la capacité canonique ; `movie` n’est exposé que s’il est canonique.

`tests/native_five_lab_coverage_test.py` doit calculer et vérifier dynamiquement cette relation à chaque changement de manifest.

### Couverture ≠ résultat lecteur

La couverture vérifie que toutes les routes déclarées ont bien été exécutées/terminées. Le verdict lecteur reste séparé :

```text
non-empty / zero / error / timeout / player
```

Un workflow vert ne signifie donc jamais « les 96 providers ont renvoyé des streams ».

Un mauvais média, mauvais épisode, mauvaise identité ou contradiction de type reste un échec de preuve même si une URL est techniquement lisible.

### Les Labs n’adaptent pas les repos Nuvio

Les Labs doivent utiliser le comportement officiel observé. Ils peuvent ajouter du plumbing de test strictement nécessaire pour atteindre/exposer le chemin officiel, mais ils ne doivent pas patcher NuvioTV, NuvioMobile ou NuvioDesktop pour contourner :

- une erreur de compilation ;
- une dépendance/packaging cassé ;
- un crash runtime/QuickJS ;
- un bug player ;
- une restriction réseau/OS ;
- un test upstream cassé.

Un tel défaut reste une preuve externe rouge. Le rendre vert artificiellement détruirait précisément l’information que le Lab doit fournir.

Chaque provider est borné individuellement ; un timeout devient une observation, pas une boucle infinie de retry.

## Cycle Provider v3

Le code durable est :

```text
ProviderBase v3 + structured DATA + owned Lego + NiakVIO-safe minimizer
```

Une reconstruction complète :

- couvre les 96 Provider Objects ;
- s’exécute uniquement sur une branche non-main ;
- ne seed jamais depuis les bundles publiés/upstream ;
- valide sécurité/type/plan/minimizer ;
- termine par `scripts/verify_provider_v3_reverse_rebuild.py` byte-identical.

Les anciens comptes `executable/quarantined` appartiennent aux snapshots historiques de reconstruction et ne doivent pas être utilisés comme vérité actuelle.

## CORE Quick / Deep

`.github/workflows/sync.yml` est l’unique routine **CORE - Verify & Publish**.

### Quick

- déterministe ;
- audit des bytes Provider v3 exacts ;
- contrats Core/type/minimizer/sécurité/Labs ;
- aucun repair ;
- aucune reconstruction provider ;
- aucune mutation Provider/DATA/Core.

### Deep

Ajoute :

- observation hubs/domaines read-only ;
- health des bundles publiés exacts ;
- diagnostics ;
- re-projection des manifests ;
- hashes et release integrity.

Deep ne répare et ne reconstruit pas les providers.

## Learning

`brain-learning-lab.yml` peut observer, classifier et essayer des réparations NiakVIO en sandbox. Une proposition Learning doit repasser par les contrats normaux avant publication.

Un échec Nuvio/OS n’est pas une cause Provider v3 et ne doit pas générer de mutation provider.

## Domain Refresh

`domain-refresh.yml` est une transaction séparée et bornée :

- hub officiel ;
- champ `official_site` uniquement ;
- CONFIG provider uniquement ;
- structure identique hors CONFIG ;
- aucun changement de route/API/Core ;
- content-addressing/projections/hashes mis à jour si nécessaire ;
- Quick relancé après publication.

## Minimizer

Terser est interdit. `scripts/provider_v3_minimizer.py` conserve les marqueurs, retours ligne nécessaires, identifiants, ordre d’exécution, littéraux, regexp et templates sensibles. Les transformations risquées restent byte-stables.

Tests principaux :

- `tests/provider_v3_minimizer_contract_test.py` ;
- `tests/provider_v3_minimizer_preview_test.py` ;
- `tests/provider_v3_minimizer_published_test.py` ;
- `scripts/verify_provider_v3_reverse_rebuild.py`.

## Sécurité

Le stripping HTML générique par regexp est interdit. `tests/provider_html_filter_security_test.py` vérifie les sources génératrices et les bundles publiés.

CodeQL et les gates sécurité ne doivent pas être « nettoyés » en désactivant les règles : un finding sur code NiakVIO doit être corrigé ou explicitement justifié.

## Limites de preuve

- une IP CI peut être bloquée alors qu’une IP résidentielle fonctionne ;
- un corpus ne représente pas tous les titres/langues ;
- une preuve sur un device n’est pas transférable à un autre ;
- une réussite ponctuelle ne garantit pas la disponibilité future ;
- une validation technique ne détermine pas le statut juridique d’un service tiers.

Ces limites produisent de l’inconclusif, pas de faux succès ni de faux provider-dead.
