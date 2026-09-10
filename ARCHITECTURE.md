# Architecture NiakVIO — Provider v3

> Source de vérité technique humaine. Les états de run, branches temporaires et métriques de disponibilité ne sont pas des invariants d’architecture et ne doivent pas être figés ici.

## 1. Modèle

NiakVIO sépare trois responsabilités :

- **Provider Object** : identité, capacité canonique, DATA, routes/protocole, stratégie, preuves et provenance ;
- **NiakVIO** : reconnaissance, composition, vérification, Learning et publication ;
- **clients Nuvio officiels** : surfaces d’exécution et de preuve par plateforme.

Le catalogue de travail couvre **les 96 Provider Objects**, providers désactivés compris. Un zéro flux, une route inconnue ou un stream cassé ne suffit jamais à déclarer un provider mort.

## 2. Source de vérité Provider v3

Un bundle publié est reconstruit depuis :

1. ProviderBase v3 propre ;
2. DATA structurée appartenant au provider ;
3. Lego `PROVIDER.*` ;
4. Lego `CORE.*` ;
5. minimizer NiakVIO conservateur avant hash.

Sources principales :

- `provider_catalog.json` ;
- `provider-bases/` ;
- `provider-overrides.json` ;
- `provider-type-policy.json` ;
- `automation/provider-v3-static-knowledge.json` ;
- `scripts/provider_patches/**` ;
- `scripts/provider_v3_minimizer.py`.

`providers/*.js` est une **sortie runtime adressée par contenu**, jamais une seed de reconstruction. Les bundles historiques/upstream servent uniquement de connaissance et de provenance.

Le ProviderBase canonique porte `NIAKVIO_PROVIDER_BASE_OWNED_V3`.

## 3. Envelope et ownership

Forme attendue :

```text
/* BEGIN NIAKVIO_PROVIDER */
/* NIAKVIO_PROVIDER_ID:<id> */
/* NIAKVIO_PROVIDER_BASE_OWNED_V3 */
<ProviderBase v3>

/* STARTFIX:PROVIDER.<ID>.CONFIG.V1 */
/* FIXDATA:PROVIDER.<ID>.CONFIG.V1:<payload> */
<DATA>
/* CLOSEFIX:PROVIDER.<ID>.CONFIG.V1 */

<Lego PROVIDER.*>
/* NUVIO_GLOBAL_CORE_START_BOUNDARY_V1 */
<Lego CORE.*>
/* END NIAKVIO_PROVIDER */
```

Les marqueurs canoniques sont `STARTFIX:<ID>` et `CLOSEFIX:<ID>`, avec `FIXDATA:<ID>` lorsque nécessaire. La frontière Core `NUVIO_GLOBAL_CORE_START_BOUNDARY_V1` est unique.

## 4. Routes et protocoles

La route durable appartient au Provider Object :

```text
provider.model.routeData
```

`provider.model.routes` et `provider.knowledge.recognizedContract.requests` sont des projections dérivées, pas de nouvelles sources de preuve.

La reconnaissance doit conserver quand ils sont connus : méthode HTTP, rôle, body/encodage, champs, `Referer`/`Origin`, type de réponse, placeholders, provenance et confiance. Elle peut analyser statiquement concaténations, variables et templates, sans exécuter le JavaScript provider.

Le workflow route-only est `.github/workflows/provider-v3-reconstruct-routes.yml`. Il ne doit ni exécuter le provider JS ni reconstruire les 96 bundles. Une absence de route reconnue reste un état **unknown**, pas une quarantaine automatique.

Les métriques d’un census précis restent dans les artifacts/rapports et dans `automation/provider-v3-architecture.json` lorsqu’une référence vérifiée est utile ; elles ne sont pas un invariant documentaire.

## 5. Type canonique ≠ transport Nuvio

C’est un contrat central.

### Capacité canonique

`canonicalSupportedTypes` décrit **ce que le catalogue du provider sert réellement** :

- `movie` ;
- `tv` ;
- `anime`.

Un provider anime-only reste donc :

```json
{"canonicalSupportedTypes":["anime"]}
```

### Compatibilité de lancement

`supportedTypes` décrit les voies par lesquelles Nuvio peut lancer ce provider.

Un provider anime peut devoir accepter les trois transports :

```json
{"supportedTypes":["anime","tv","movie"]}
```

Cela permet :

- anime épisodique via transport `tv`/`series` ;
- namespace `anime` lorsqu’il est exposé par le client ;
- transport `movie` uniquement lorsqu’une capacité canonique `movie` est réellement déclarée.

**Cela n’ajoute jamais une capacité canonique `movie` ou `tv`.** Le Core doit rejeter une œuvre non-anime sur un provider anime-only après classification autoritative, avant le réseau provider lorsque l’information nécessaire est déjà disponible.

Inversement, un provider canonique `movie + tv` ne devient pas anime-compatible par simple alias de transport.

Les alias `series`, `show` et équivalents se normalisent vers la forme `tv` du client.

## 6. Contrat runtime

Signature conceptuelle :

```text
getStreams(tmdbId, mediaType, season, episode)
```

Ordre logique :

```text
BEGIN PROVIDER
  gate launch/capacité
  résoudre l'identité/TMDB uniquement si le plan en a besoin
  exécuter le protocole provider
  si streams > 0
    appliquer identité, présentation, branding et sanitizer
  endif
END PROVIDER
```

Règles :

- gate capacité avant réseau provider ;
- pas d’appel TMDB gratuit quand le plan n’en a pas besoin ;
- cache TMDB scoped par œuvre/type ;
- saison/épisode conservés ;
- zéro flux ne fabrique rien ;
- mauvais média > zéro résultat en gravité ;
- erreur d’un stream ≠ désactivation globale du provider.

## 7. Reconstruction complète

La reconstruction 96/96 appartient à `.github/workflows/provider-v3-reconstruct-all.yml`. Règle d’exploitation courante : **`main` est l’unique cible d’écriture active**. Le workflow peut utiliser un workspace runner et des artifacts éphémères, mais il ne doit pas créer ou maintenir une branche workbench persistante par défaut.

Interdictions :

- seed depuis `providers/*.js` ;
- seed depuis un bundle upstream ;
- création automatique d’une branche workbench persistante ;
- reconstruction cachée dans Quick, Deep ou un Native Lab.

La preuve finale doit inclure la reconstruction reverse byte-identical via `scripts/verify_provider_v3_reverse_rebuild.py`.

Les anciens comptes de plans/quarantaines restent des **snapshots historiques**, jamais une vérité opérationnelle courante.

## 8. CORE — Verify & Publish

Le workflow routine est `.github/workflows/sync.yml` : **CORE - Verify & Publish**.

### Quick

Quick vérifie rapidement :

- structure Provider v3/Core ;
- bytes publiés exacts ;
- sécurité ;
- minimizer ;
- contrats média/type ;
- cohérence des cinq Labs.

### Deep

Deep ajoute :

- observations réseau/hubs en lecture seule ;
- health des bytes publiés exacts ;
- diagnostics ;
- projections de manifests ;
- hashes et intégrité de release.

**Quick/Deep ne réparent ni ne reconstruisent les providers et ne réalisent pas le bump release de routine.**

### Finalisation d’une release acceptée

`.github/workflows/release-finalize.yml` est la seule transaction explicite de finalisation après acceptation de la pile de validation.

Contrat :

- entrée obligatoire `accepted_sha` ; le checkout et la transaction doivent porter exactement ce SHA accepté ;
- `baseline_sha` peut être fourni explicitement ; sinon `scripts/release_version_baseline.py` retrouve le commit le plus ancien de la génération de version courante sur le first-parent ;
- le finalizer ne répare, ne reconstruit et ne rematérialise aucun provider ;
- il synchronise de façon atomique versions provider/manifest/cache/release, projections de manifests, hashes et intégrité ;
- si aucun byte provider publié n’a changé par rapport à la baseline de release, aucun bump provider/cache ne doit être inventé ;
- si une correction sécurité/runtime modifie ensuite les bytes providers publiés, une nouvelle validation puis une nouvelle finalisation sont obligatoires avant publication.

Les scripts de finalisation restent des consommateurs des bytes acceptés, jamais une seconde autorité de reconstruction.

## 9. Learning

`.github/workflows/brain-learning-lab.yml` est le seul espace de Learning/réparation expérimentale :

- providers actifs et désactivés peuvent être observés ;
- les essais restent sandboxés ;
- les preuves doivent être sanitizées ;
- les mutations deviennent des propositions reviewables ;
- `brain-learning/proposals` n’est pas une autorité de publication ;
- aucune mutation ne contourne les gates d’identité, sécurité, reconstruction et release.

Un échec appartenant au client Nuvio/OS ne doit jamais devenir une réparation Provider v3.

## 10. Domain Refresh

`.github/workflows/domain-refresh.yml` est une exception de maintenance DATA très bornée :

- résolution quotidienne des hubs officiels ;
- champ provider autorisé : `official_site` ;
- aucun changement de route/API/Core ;
- mise à jour CONFIG seulement ;
- structure du provider identique hors CONFIG ;
- filename content-addressed et projections/hashes rafraîchis si les bytes CONFIG changent ;
- publication directe sur `main` uniquement pour cette transaction explicitement bornée, puis Quick est relancé.

Le hub sert à localiser l’instance officielle ; il ne remplace pas le protocole business du provider.

## 11. Cinq Native Labs

Surface exacte :

1. `TVAndroid` — NuvioTV ;
2. `MobileAndroid` — NuvioMobile ;
3. `MobileIOS` — NuvioMobile ;
4. `DesktopMACOS` — NuvioDesktop ;
5. `DesktopWindows` — NuvioDesktop.

Règles :

- chaque device est une preuve indépendante ;
- la matrice de routes est dérivée du manifest courant, pas d’un nombre figé dans la documentation ;
- `canonicalSupportedTypes` porte la sémantique, `supportedTypes` la surface de lancement testée ;
- providers désactivés restent auditables ;
- les Labs utilisent les bytes NiakVIO candidats exacts ;
- **aucun Lab ne patch NuvioTV/NuvioMobile/NuvioDesktop pour contourner un bug upstream** ;
- un bug de compilation, packaging, runtime, QuickJS ou player upstream reste une preuve externe rouge ;
- le plumbing de test est autorisé uniquement s’il expose le chemin officiel sans changer le comportement production ni réparer le défaut observé.

Le trigger commun est `.github/triggers/full-native-lab-validation.json`.

## 12. Minimizer NiakVIO

Terser est interdit.

`scripts/provider_v3_minimizer.py` est conservateur et pré-hash. Il doit préserver :

- enveloppe BEGIN/END ;
- `STARTFIX/CLOSEFIX/FIXDATA` ;
- frontière Core ;
- retours ligne nécessaires à l’ASI ;
- littéraux, regexp et templates sensibles ;
- identifiants et ordre d’exécution.

Pas de renommage, reorder, folding ou remplacement textuel global. Les providers à état lexical risqué peuvent rester byte-stables.

Gates :

- `tests/provider_v3_minimizer_contract_test.py` ;
- `tests/provider_v3_minimizer_preview_test.py` ;
- `tests/provider_v3_minimizer_published_test.py` ;
- `scripts/verify_provider_v3_reverse_rebuild.py`.

## 13. Sécurité

Provider JS est de l’entrée non fiable : sandbox, budgets mémoire/temps/réseau, SSRF/redirect guards, protocoles P2P interdits, sanitization des artifacts et fail-closed publication.

Le stripping HTML générique par regexp est interdit. Les findings CodeQL sur code NiakVIO doivent être corrigés ou justifiés ; les snapshots/bundles générés restent traités comme code non fiable même lorsqu’un finding est classé vendored/generated.

`.github/workflows/codeql.yml` produit une preuve locale `security-extended` au SHA exact, conserve le SARIF en artifact et gate les findings High/Critical. Le même workflow audite les dépendances production au niveau High/Critical. Cette preuve complète le CodeQL Default Setup GitHub ; elle ne doit pas être désactivée pour masquer des alertes historiques.

## 14. Branches et publication

- **`main` = production et unique cible d’écriture active pour le travail courant** ;
- ne pas créer de nouvelle branche workbench/clean pour les corrections en cours ;
- `brain-learning/proposals` reste un store passif de propositions Learning, sans autorité de publication directe et sans servir de branche d’implémentation ;
- aucune branche workbench historique ne doit être documentée comme active après sa suppression ;
- avant de supprimer un ancien ref, vérifier qu’aucun artifact/code/doc utile n’y reste unique ;
- la finalisation release s’effectue uniquement après acceptation de la pile de validation, via `release-finalize.yml` sur le SHA exact accepté ;
- documentation/workflow/harness seuls n’imposent pas de bump provider/cache tant que les bytes providers publiés restent identiques.

## 15. Invariants non négociables

1. Les 96 Provider Objects restent dans le census.
2. ProviderBase v3 + DATA + Lego recréent les bundles sans seed JS publiée/upstream.
3. `provider.model.routeData` est la source route canonique.
4. Reconnaissance vide ≠ quarantaine.
5. `canonicalSupportedTypes` ≠ `supportedTypes`.
6. Anime canonique peut être lancé via `anime/tv/series` sans devenir movie/tv canonique.
7. Gate capacité avant réseau provider.
8. Quick/Deep ne réparent ni ne reconstruisent et ne finalisent pas une release en routine.
9. `release-finalize.yml` ne modifie que la transaction release de bytes déjà acceptés.
10. Learning ne publie pas directement.
11. Domain Refresh reste CONFIG `official_site`-only.
12. Les cinq Labs restent séparés et observationnels.
13. Aucun Lab ne corrige un bug du repo Nuvio pour obtenir un vert.
14. Mauvais média jouable = échec.
15. Stream cassé ≠ provider globalement désactivé.
16. Terser interdit ; minimizer conservateur uniquement.
17. HTML stripping générique par regexp interdit.
18. Les métriques/run IDs historiques restent dans les rapports, pas dans les invariants.

## Références

- `automation/provider-v3-architecture.json`
- `automation/provider-v3-static-knowledge.json`
- `provider-v3-materialization.json`
- `PROVENANCE.json`
- `provider-overrides.json`
- `.github/workflows/release-finalize.yml`
- `scripts/release_version_baseline.py`
- `scripts/materialize_provider_v3_all.py`
- `scripts/verify_provider_v3_reverse_rebuild.py`
- `scripts/provider_v3_minimizer.py`
- `tests/provider_v3_documentation_contract_test.py`
- `tests/native_five_lab_coverage_test.py`
- `tests/native_lab_observational_purity_test.py`
