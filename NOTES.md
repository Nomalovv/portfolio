# Notes de conception — Portfolio globe réseau

Ce fichier documente les choix techniques et les décisions prises pendant la construction du site, pour mémoire (le cahier des charges détaillé a été fourni séparément et n'est pas reproduit ici).

## Fichier livré

- `index.html` — page unique autonome (~85 Ko), HTML/CSS/JS inline, Three.js r128 chargé en script classique depuis cdnjs (pas de modules ES) pour que le fichier fonctionne aussi en ouverture directe `file://`.
- `README.md` — instructions d'ouverture et points de personnalisation rapides.

## Carte du monde du globe pointillé

Option retenue : **génération procédurale**, pas d'image externe.

33 polygones de côtes réels (paires lon/lat) + 4 mers intérieures (mer Noire, Caspienne, baie d'Hudson, Grands Lacs) sont tracés au chargement sur un canvas 2D 1600×800, puis lus via `getImageData` pour l'échantillonnage sphérique. Aucun `fetch`, aucune image, donc aucun risque de canvas *tainted* en CORS ou en `file://`.

Résultat : 12 498 points en terre, dans un seul `THREE.Points` (un seul draw call pour la carte). Les arcs de liaison entre points (47 au total) sont en revanche des objets séparés — la contrainte de draw call unique ne portait que sur la carte pointillée elle-même.

## Vérifications effectuées

- Syntaxe JS : extraction du script inline, validé via `node --check` (Node installé pour l'occasion).
- Structure HTML : un seul `<html>/<head>/<body>`, imbrication valide.
- Test visuel réel : navigateur headless (Edge Chromium piloté en CDP), rendu WebGL logiciel. 10 vérifications passées : transition au scroll, porte de sortie (scroll haut soutenu), ouverture d'une rubrique (blocs sans chevauchement ni débordement), lignes SVG de liaison, modale « voir en détail », fermeture (Échap, clic vide, bouton), navigation clavier (Tab sur les 5 rubriques), redimensionnement de fenêtre, `prefers-reduced-motion`, repli en cas d'échec du rendu 3D. Aucune erreur console.

Trois défauts visuels ont été corrigés grâce à ce test (invisibles à la simple relecture du code) :
1. Points de terre presque invisibles (texture de disque trop dégradée, tailles trop faibles).
2. Halo atmosphérique qui formait un anneau bleu opaque au lieu d'un liseré fin — le calcul de Fresnel produisait une arête franche au bord de la coque ; remplacé par une bande `smoothstep` qui s'estompe avant ce bord.
3. Halos de bokeh trop centrés (voilaient le globe) et anneaux radar surexposés — repositionnés en périphérie et atténués.

Deux corrections de logique : les blocs de contenu se positionnent désormais autour du point d'arrivée du nœud à l'écran après rotation (et non de sa position au moment du clic), et tout le code d'initialisation est protégé par un `try/catch` pour que le repli (sphère wireframe) fonctionne réellement en cas d'erreur.

## Passe accessibilité + polish visuel

Constat de départ : pour atteindre une rubrique il fallait enchaîner trois gestes appris — faire défiler pour « entrer », glisser pour orienter le globe, puis viser un point de 6 px. Le seul mode d'emploi était une ligne de texte discrète en bas d'écran, et le seul accès clavier passait par cinq boutons **invisibles** superposés aux nœuds : fonctionnel, mais indécouvrable. Le globe reste le menu et l'identité du site ; ce qui change, c'est qu'il n'est plus le **seul** chemin.

### Barre de nœuds (`#dock`)

Navigation permanente en bas d'écran, présente dès le premier écran : les cinq rubriques y sont listées avec leur nom, leur index et leur capitale. Un clic amène le globe sur la capitale **et** ouvre la rubrique — plus aucune manipulation de caméra n'est requise pour lire le contenu. Un second clic sur l'entrée active referme (interrupteur).

Elle reste dans le vocabulaire réseau du site (pastille de nœud, index et ville en monospace, coque vitrée) plutôt que d'être un menu générique. Le survol ou le focus d'une entrée illumine le nœud 3D correspondant, et la rubrique ouverte bascule à l'orangé exactement comme son nœud sur le globe : les deux représentations désignent visiblement la même chose.

Conséquences en cascade :

- Les cinq boutons `.hit` invisibles ne portent plus la navigation clavier. Ils sont sortis de l'ordre de tabulation et de l'arbre d'accessibilité, et ne servent plus que de repère visuel autour du nœud désigné. `Tab` parcourt maintenant cinq contrôles **visibles**.
- `layoutBlocks` et le calage des cartes réservent la hauteur de la barre : aucune carte ne vient se poser dessus.
- Le HUD « Glissez / Cliquez / Tab » a disparu. Le texte d'aide est porté par la barre et suit l'état réel de la page (accueil → globe → rubrique ouverte). La rotation y est présentée comme une option, pas comme le passage obligé.

### Autres accès et affordances

- L'accueil a un vrai bouton **« Explorer le globe »** (50 px, focusable) à la place de l'indicateur « Faites défiler », qui n'était ni cliquable ni atteignable au clavier. Molette et balayage continuent de fonctionner à l'identique.
- Sur mobile, la feuille de contenu recouvrait la barre sans offrir de sortie à portée de pouce : ajout d'un bouton **« Revenir au globe »** en fin de feuille (la croix en haut à droite reste le second chemin). La barre s'escamote pendant la lecture et revient à la fermeture. Les cinq entrées passent sur deux lignes centrées — tout est visible d'un coup d'œil, sans défilement horizontal caché.
- Piège à focus dans la modale de lecture longue (`Tab` y reste enfermé) ; à la fermeture d'une rubrique, le focus est rendu à l'entrée correspondante de la barre plutôt que perdu sur `<body>`.
- Région `aria-live` qui annonce la rubrique ouverte et son nombre de fiches ; `aria-current` sur l'entrée active.
- Anneau de focus unique pour toute la page (2 px pleins, décalage 3 px), cibles tactiles portées à 44 px minimum (barre, croix de fermeture, boutons « Voir en détail » de la feuille mobile).

### Repli sans WebGL

Le repli n'est plus un message d'erreur seul : `renderFallbackDoc()` rend les cinq rubriques en document texte, lectures longues dépliées, avec le défilement rendu au navigateur. Le contenu reste donc consultable sans three.js ni WebGL. Cela a demandé de déplacer `RUBRIQUES` **avant** le garde-fou three.js. Le repli en sphère wireframe (échantillonnage de points en échec) est inchangé.

### Passe visuelle

- Palette resserrée sur trois niveaux de texte, tous vérifiés à ≥ 4,5:1 sur les fonds réellement utilisés. La vitre des cartes est passée de `.62` à `.84` d'opacité : sous l'ancienne valeur le texte perdait son contraste dès qu'un point lumineux du globe passait derrière.
- Cartes de contenu : liseré de connexion sur l'arête haute, pastille de nœud devant chaque titre, `Voir en détail` transformé en bouton plein avec flèche, élévation au survol.
- Modale retravaillée (hiérarchie, filet de séparation, mesure limitée à 68 caractères, rappel `ÉCHAP`).
- Trois défauts trouvés au test visuel, invisibles à la relecture :
  1. Les pancartes des rubriques (`z-index` 6) transparaissaient **à travers** les cartes de contenu (`#orbit`, 5) — passées à 4.
  2. La croix de fermeture de rubrique flottait au-dessus du voile de la modale, offrant deux croix concurrentes pendant une lecture — repassée sous la modale.
  3. En portrait, le globe débordait des deux côtés et ne se lisait plus comme un globe : le champ horizontal est bien plus serré que le vertical sur un écran étroit. L'échelle est maintenant plafonnée par la largeur disponible.
- Voile directionnel derrière le texte d'accueil (horizontal sur desktop, vertical en portrait), qui s'estompe avant le globe et ne l'assombrit donc pas.

### Placement des cartes : deux colonnes plutôt qu'une recherche sur ellipse

`layoutBlocks` cherchait pour chaque carte la meilleure place parmi 16 directions × 4 rayons sur une ellipse, en notant bords et recouvrements. Sur un écran large le résultat était bon ; sur un portable étroit (1024×700, 1152×720) **aucun** de ces 64 points n'était libre, la fonction rendait donc le « moins mauvais » — une carte qui débordait en haut. La boucle de rendu la ramenait de force dans l'écran, et deux cartes finissaient par se toucher.

Or le résultat visé était toujours le même : deux piles, de part et d'autre du nœud. On le construit maintenant directement (colonnes alternées pour que l'ordre à l'écran suive l'ordre du contenu, répartition rééquilibrée puis gouttière resserrée si une pile est trop haute). Le chevauchement devient impossible tant que la place existe, et le rendu sur grand écran est inchangé.

### Vérifications de cette passe

Rejeu du test en navigateur headless (Edge Chromium piloté par CDP, WebGL logiciel) : **72 vérifications passées, aucune erreur console**. Couvre notamment l'ouverture d'une rubrique au clic depuis l'accueil sans aucun scroll ni glisser, le changement direct de rubrique, l'interrupteur de l'entrée active, les cinq rubriques une à une, le piège à focus, `Échap` à deux niveaux, le focus rendu à la barre, le glisser du globe toujours opérant, le parcours mobile complet en 375×780 (premier chargement, feuille, deux sorties), `prefers-reduced-motion`, le repli sans three.js (5 sections, 19 fiches, page défilable) et le repli sans WebGL.

Le contrôle de chevauchement est rejoué sur les cinq rubriques en 1440×900, 1280×800, 1152×720, 1024×700 et 900×640 : **zéro contact**, cartes comprises, entre cartes et barre de nœuds, et hors écran.

Trois défauts trouvés à ce rejeu, tous invisibles à la relecture du code :

1. Le chevauchement des cartes sur écran étroit décrit ci-dessus.
2. Le focus clavier sur une entrée de la barre n'éclairait le nœud que s'il se trouvait déjà sur la face visible du globe : sur la face cachée, `Tab` ne donnait aucun retour. Le globe pivote maintenant vers le nœud désigné — au clavier uniquement (un survol souris ne fait toujours rien bouger), et seulement une fois la vue globe atteinte, pour ne pas balayer l'accueil sous les doigts de qui le lit encore.
3. Les entrées de la barre se comprimaient (`flex-shrink`) dès 1280 px : « 04 · NEW YORK » passait sur deux lignes et désalignait toute la barre. Largeur naturelle figée.

Et un détail de composition : la pastille devant les titres de cartes était centrée verticalement, donc flottait entre les deux lignes des titres qui reviennent à la ligne — alignée sur la première ligne.

## Passe « sept rubriques » — Certifications et Procédures

### Le menu du bas ne nomme plus les villes

Les entrées de la barre affichaient `01 · PARIS`, `04 · NEW YORK`… La capitale
ne sert qu'à poser le nœud sur le globe : elle n'apprend rien sur la rubrique, et
avec sept entrées elle occupait de la largeur pour rien. La deuxième ligne est
devenue `01 / 07` — même allure de ligne de données en monospace, mais une
information de repérage réellement utile. Le nom du lieu reste là où il a un
sens : sur la pancarte du globe, sous le titre ancré (`#anchor-coords`), dans la
feuille mobile et dans le repli texte. L'`aria-label` suit (« Certifications —
rubrique 3 sur 7 ») et le décompte est calculé depuis `RUBRIQUES.length`, plus
écrit en toutes lettres.

### Deux rubriques de plus

- **Certifications** — Reykjavik (64,15° N / 21,94° O). CCNA, Fortinet NSE 4,
  CompTIA Security+ et entraînement offensif continu ; cohérent avec la fiche
  « Formation continue » de Parcours, qui annonçait déjà CCNA / NSE 4 / Root-Me /
  TryHackMe, et qui n'a pas été touchée.
- **Procédures** — Wellington (41,29° S / 174,78° E). Réponse à incident,
  durcissement d'un serveur neuf, sauvegarde restaurée pour de vrai, cycle de vie
  des comptes à privilèges. Les briques déjà citées ailleurs (Wazuh, Ansible,
  LAPS, tiering, BloodHound) sont reprises plutôt que réinventées.

Les deux capitales ont été choisies pour leur isolement : aucune n'est à moins de
1 800 km d'un des cinq nœuds existants ni des vingt nœuds décoratifs de
`SECONDAIRES`, donc pas de pancartes en conflit permanent. Ordre du menu :
À propos, Parcours, **Certifications**, Compétences, **Procédures**, Projets,
Contact — chaque nouvelle rubrique prolonge celle qui la précède.

Le maillage principal passe mécaniquement de 10 à 21 arcs (n·(n−1)/2), et le
repli texte de 5 sections / 19 fiches à 7 sections / 27 fiches.

### Trois défauts trouvés au test, tous invisibles à la relecture

1. **La barre n'avait droit qu'à la moitié de l'écran.** `#dock` est fixé en
   `left:50%` sans `right`, puis recentré par `translateX(-50%)`. Un élément fixé
   ainsi se dimensionne au « shrink-to-fit » : sa largeur *disponible* est celle
   qui reste de 50 % au bord droit, soit la moitié du viewport. À cinq entrées la
   barre (~700 px) tenait tout juste dans cette moitié à 1440 px ; à sept
   (856 px) elle la dépassait et repliait sur deux rangées **dès 1600 px**.
   Ces 52 px de hauteur perdus faisaient déborder les piles de cartes, qui
   chevauchaient alors sous 1152 px. `width:max-content` rend à la barre sa
   largeur naturelle, toujours bornée par `max-width` sur l'écran réel.
2. **Écrans bas.** Deux cartes de 250 px plus la barre ne tiennent pas dans
   768 px de haut, encore moins 640 : la gouttière était resserrée jusqu'à 4 px,
   puis la boucle de rendu ramenait la dernière carte de force dans l'écran, ce
   qui la faisait chevaucher la précédente. Sous `max-height:780px` les cartes
   sont désormais rendues compactes (302 px de large, marges et corps réduits) :
   ~40 px gagnés par carte, la pile repasse dans le budget sans rien tronquer.
3. **Palier compact de la barre.** Entre 821 et 1279 px, sept libellés à pleine
   taille (856 px) touchaient le bord. Les entrées y sont resserrées — la barre
   retombe à 709 px, sur une seule rangée jusqu'à 840 px, et la cible tactile
   garde ses 48 px de haut. En portrait, les sept entrées occupent trois rangées
   (~210 px) au lieu de deux : la réserve de l'écran d'accueil a été relevée en
   conséquence.

`flex-wrap` a été ajouté au rail en filet de sécurité : si un jour la barre ne
tient vraiment plus, elle passe sur deux lignes centrées au lieu de sortir de
l'écran, et `dockReserve()` mesurant sa hauteur réelle, les cartes suivent.

### Vérifications de cette passe

Rejeu du test en navigateur headless (Edge Chromium piloté par puppeteer-core,
WebGL logiciel) : **318 vérifications passées, aucune erreur console**. Le
contrôle de chevauchement est rejoué sur les **sept** rubriques en 1440×900,
1366×768, 1280×800, 1152×720, 1024×700, 1024×640 et 900×640 — zéro contact,
entre cartes, avec la barre de nœuds et hors écran. La barre elle-même est
mesurée de 1920 à 840 px : une seule rangée partout, aucune entrée coupée,
aucun libellé sur deux lignes. S'y ajoutent `Tab` sur les sept entrées, `Entrée`,
le piège à focus, `Échap` à deux niveaux, le focus rendu à la barre, le
redimensionnement à chaud pendant qu'une rubrique est ouverte, le parcours mobile
complet en 375×780, `prefers-reduced-motion` et le repli sans three.js (7
sections, 27 fiches).

Détail de méthode : en rendu logiciel la boucle tourne à quelques images par
seconde, et l'interpolation du globe (0,10 par image) met plusieurs secondes à
converger. Le harnais attend donc que le nœud actif soit réellement arrivé au
centre de l'écran — l'hypothèse sur laquelle repose `layoutBlocks` — avant toute
mesure ; sans cela, la moitié des « chevauchements » observés n'étaient que des
captures prises en pleine animation.

## Limites connues / à savoir

- Le CDN Three.js et Google Fonts nécessitent une connexion réseau au premier chargement (la carte du monde, elle, est entièrement inline). Un message s'affiche si le réseau est indisponible.
- Les tracés côtiers sont volontairement simplifiés (~40 à 70 sommets par continent) : lisibles à l'échelle du globe, approximatifs si on zoomait fortement.
- Contenu de la rubrique Contact : l'adresse email est la vraie adresse de l'utilisateur (gardée volontairement, décision explicite). **Les liens LinkedIn et GitHub sont des placeholders fictifs** (`linkedin.com/in/arthur-formentin`, `github.com/arthur-formentin`) — à remplacer par les vrais liens avant mise en ligne définitive.
- Tout le reste du contenu (parcours, compétences, projets) est un placeholder réaliste à adapter.
