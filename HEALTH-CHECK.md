# Santé, preuve et décision — NiakVIO

La santé d’un provider n’est jamais réduite à un code HTTP, à `no_streams` ou à un score unique.

## Dimensions de preuve

| Dimension | Exemples |
|---|---|
| Discovery | manifest, ID canonique, provenance, exclusion P2P |
| Domaine | hub officiel, domaine terminal, redirect, DNS, identité |
| Runtime | chargement, `getStreams`, timeout, mémoire, exception |
| Catalogue | movie/tv/anime, titre, année, saison, épisode |
| Protocole | search/detail/player/source, méthode, body, headers |
| Média | HLS, DASH, conteneur, playlist/segment, payload réel |
| Identité | œuvre, année, saison/épisode, durée, metadata player |
| Langue | metadata provider/stream, pistes explicites |
| Compatibilité | TV Android, Mobile Android, Mobile iOS, Desktop macOS, Desktop Windows |
| Publication | catalogue, manifests, provenance, versions, hashes, intégrité |

Une preuve est toujours scoped :

```text
provider × œuvre × type × langue × device × version client
```

## `no_streams` est un symptôme

Causes possibles :

- provider non invoqué ;
- domaine/route cassé ;
- recherche absente ;
- identité incorrecte ;
- détail/épisode/player non résolu ;
- extraction média manquante ;
- contexte de lecture absent ;
- média invalide ;
- runtime client cassé ;
- vrai zéro résultat.

Le diagnostic doit chercher la première cause prouvée, pas transformer tous les zéros en providers morts.

## Type canonique et transport

`canonicalSupportedTypes` décrit la capacité réelle du catalogue. `supportedTypes` décrit la compatibilité de lancement Nuvio.

Un anime-only peut donc être :

```text
canonical = anime
transport = anime + tv + series
```

Les alias de transport ne doivent jamais être réinjectés comme capacités sémantiques.

## Quick

Quick est non-mutant côté providers :

- structure Provider v3/Core ;
- bytes publiés exacts ;
- type/identité ;
- sécurité ;
- minimizer ;
- contrats des cinq Labs.

Quick ne fait ni repair ni reconstruction.

## Deep

Deep ajoute :

- observation hubs/domaines read-only ;
- health réseau des bundles publiés exacts ;
- diagnostics ;
- projections de manifests ;
- hashes et release integrity.

Deep ne fait ni repair ni reconstruction provider.

## Learning

Le Learning appartient à `brain-learning-lab.yml`.

Il peut :

- observer les providers actifs et désactivés ;
- classifier les échecs ;
- tester des réparations NiakVIO bornées en sandbox ;
- produire des propositions reviewables.

Il ne doit pas :

- publier directement des Provider JS ;
- convertir un bug Nuvio/OS en réparation provider ;
- contourner les gates d’identité/sécurité/reconstruction.

## Domain Refresh

`domain-refresh.yml` maintient uniquement l’adresse officielle :

- hub officiel comme source de découverte ;
- `official_site` uniquement ;
- CONFIG provider uniquement ;
- aucun changement de route/API/Core ;
- structure identique hors CONFIG ;
- publication content-addressed/hashes cohérents si CONFIG change.

Un hub qui répond ne prouve pas que le protocole business fonctionne.

## Validation média

Une URL n’est pas un stream prouvé.

Peuvent être confirmés :

- HLS réel (`#EXTM3U`) ;
- DASH/MPD ;
- signatures de conteneur ;
- playlist/variant/segment ;
- contexte `Referer`/`Origin` requis ;
- payload média cohérent.

Doivent être rejetés lorsque prouvés :

- HTML/JSON déguisé ;
- asset non média ;
- player non résolu ;
- payload/redirect incohérent ;
- mauvais contenu ;
- mauvais épisode ;
- durée contradictoire.

Timeout, blocage réseau ponctuel ou absence d’une API de preuve suffisante restent inconclusifs.

## Langue

VF/VOSTFR/VO doit venir de signaux explicites ou suffisamment cohérents. Un nom de domaine/provider ne suffit pas à inventer une langue.

## Quarantine

Une quarantine exige une raison forte et explicite :

- identité contradictoire persistante ;
- provenance suspecte ;
- détournement de domaine ;
- sortie dangereuse ;
- incapacité structurelle prouvée.

Ne suffisent pas seuls :

- `routeData=[]` ;
- un timeout ;
- un zéro flux ;
- une panne CI ;
- un stream cassé.

## Native Labs

Les cinq cibles sont des dimensions indépendantes de preuve.

Les Labs :

- testent la surface transport déclarée par le manifest courant ;
- conservent la sémantique canonique séparément ;
- n’adaptent pas les repos Nuvio pour faire disparaître leurs bugs ;
- gardent les erreurs de compilation, packaging, runtime, QuickJS/player upstream comme preuves externes rouges ;
- ne comptent jamais un probe composant comme preuve human-UX complète s’il ne suit pas le chemin officiel prévu.

## DNS

Le DNS est une observation, jamais un kill-switch provider.

États visibles possibles :

- `DNS OK` ;
- `DNS BLOCK` ;
- `DNS API LIMIT REACH`.

Une alerte DNS n’empêche pas le reste du diagnostic de s’exécuter lorsque c’est techniquement possible.

## Sécurité

Provider JS reste non fiable. Les contrôles réseau/SSRF, limites de ressources, sanitization, identité et média sont des couches complémentaires.

Le stripping HTML générique par regexp est interdit.

## Publication

Il ne doit exister qu’une seule autorité de publication normale : Provider v3/Core + transaction validée.

Les exceptions automatiques doivent être explicitement bornées, comme Domain Refresh `official_site`-only. Une étape rouge bloque la nouvelle génération au lieu de maquiller l’échec.

## Limites

- CI ≠ réseau résidentiel ;
- un corpus ≠ catalogue entier ;
- un device ≠ un autre device ;
- un succès ponctuel ≠ disponibilité future ;
- preuve technique ≠ statut juridique.

Ces limites produisent de l’inconclusif, jamais une conclusion inventée.
