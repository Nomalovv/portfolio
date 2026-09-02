# Notes de conception — Portfolio globe réseau

Ce fichier documente les choix techniques et les décisions prises pendant la construction du site, pour mémoire (le cahier des charges détaillé a été fourni séparément et n'est pas reproduit ici).

Il se lit dans les deux sens : les sections « Passe … » racontent **pourquoi**
les choses sont ce qu'elles sont, dans l'ordre où elles ont été décidées ; la
section **« Où en est le projet »**, plus bas, décrit l'**état courant** —
plan des fichiers, modèle de données, invariants, façon de rejouer les tests.
Avant une modification d'ampleur, commencer par celle-là, et la corriger en
même temps que le code.

## Fichiers livrés

- `index.html` — squelette : en-tête, balisage, appels des feuilles et des scripts.
- `css/style.css` — toute la mise en forme.
- `js/data.js`, `js/worldmap.js`, `js/globe.js`, `js/ui.js`, `js/main.js` — le
  script, découpé (voir « Où en est le projet » plus bas).
- `README.md` — instructions d'ouverture et points de personnalisation rapides.
- `scripts/update-rootme.mjs` + `.github/workflows/update-rootme.yml` — **hors
  site** : la synchronisation quotidienne des chiffres Root-Me, qui tourne sur
  GitHub Actions et réécrit un bloc de `js/data.js`. La page ne les charge pas.

Three.js r128 est chargé en script classique depuis cdnjs, et les fichiers du
dépôt le sont en chemins relatifs : **pas de module ES, pas de `fetch()`**, pour
que le site s'ouvre en double-cliquant sur `index.html` en `file://`.

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

## Passe « satellites de liens » — trois liens libres autour de Contact

### Ce qui a changé et pourquoi

Les trois liens (LinkedIn, GitHub, courriel) avaient d'abord été posés en
pastilles dans la rubrique Contact, puis chacun dans sa propre petite carte,
puis en triangle autour de la carte « Réseaux ». Retour du propriétaire : ce
qui gêne, ce n'est pas le triangle, c'est la **carte** — trois glyphes enfermés
dans une boîte à bordure et à fond, elle-même posée dans une autre boîte.

Ils sont donc dépouillés de tout ce qui dessinait un contenant, et sortis des
cartes : ils **flottent autour de la rubrique Contact**, dans l'espace laissé
libre autour du nœud. (Un aller-retour par Projets a eu lieu en cours de
route ; le propriétaire a tranché pour Contact, qui est aussi la rubrique où
l'on cherche un lien. Le déplacement n'a coûté qu'un drapeau à bouger, ce qui
valide le découpage retenu.)

- **Contact** porte l'indicateur `sats:true` dans `RUBRIQUES`. C'est le seul
  point de bascule : aucune autre rubrique n'a à savoir que ces liens existent,
  et les déplacer ne demande que de bouger ce drapeau d'une entrée à l'autre.
  Ses deux cartes restent du texte : `Courriel` (inchangée) et `Disponibilité`,
  qui remplace le cadre « Réseaux » — vidé de ses liens, il n'annonçait plus
  rien. La mise en page à deux cartes est donc préservée telle quelle.
- **Projets** est revenue à son état normal, sans satellites.

### Ce qui disparaît du style : tout le vocabulaire de la carte

`a.social` n'a plus ni `background`, ni `border`, ni `box-shadow`, ni
`backdrop-filter`, ni liseré de connexion sur l'arête haute (`::before` a changé
de métier). Il ne reste que le glyphe. Ce qui le détache du globe est une
**ombre portée sur le dessin lui-même** (`drop-shadow`), pas une surface : rien
ne borde le lien, mais il ne se noie pas dans les points de la carte du monde.

La cible est passée de 58 px (l'ancienne carte) à 48 px, puis à **68 px** sur
demande du propriétaire, glyphe porté à 36 px : sans vitre autour de lui, un
petit glyphe se lit comme une décoration ; à cette taille il redevient une
destination. L'ombre portée a été étalée d'autant (`0 3px 13px`), faute de quoi
elle se lisait comme un liseré collé au dessin au lieu d'un décollement.

Ce qui est conservé, à l'identique ou presque :

- le flottement orbital déphasé (8,4 s / 10,6 s / 9,3 s, trois délais négatifs,
  sens inversé au milieu), amplitude portée de 3,2 à 4,2 px — un corps libre
  peut respirer un peu plus large qu'une carte ;
- l'arrêt de l'orbite au survol et au focus (`animation-play-state:paused`) ;
- le cadre du logo qui se retrace (`.frame`, `stroke-dashoffset`) et l'onde
  unique de connexion au survol/focus, redessinée en cercle pour ne plus
  ressembler au contour d'une boîte ;
- le halo de survol, devenu un dégradé radial qui s'éteint avant le bord :
  il éclaire sans jamais tracer de contour ;
- glyphe seul sans texte, `aria-label` + `title`, coupure totale sous
  `prefers-reduced-motion`.

### Trois placements pour un seul balisage

`socialsHTML(variante)` rend le même HTML dans deux habillages :

1. **`field` (desktop)** — injecté dans un calque `#sats`, fixé plein écran et
   transparent aux clics (seuls les liens captent, pour ne pas voler un glisser
   du globe). Les satellites y sont posés en **coordonnées d'écran** par la
   boucle de rendu, autour du nœud de la rubrique, exactement comme les cartes
   de contenu : ils suivent donc le globe, et s'atténuent quand le nœud passe
   derrière lui — jamais tant qu'un satellite a le focus clavier
   (`#sats:focus-within` reprend la main sur l'opacité posée en ligne).
2. **`row` (feuille mobile)** — en portrait il n'y a aucun espace libre autour
   du nœud ; la rangée est posée **à même la feuille**, hors de toute `.card`,
   après les fiches de la rubrique.
3. **`row` (repli sans WebGL)** — même rangée, en fin de section Contact.

Le placement desktop est calculé par `layoutSats()`, appelée en fin de
`layoutBlocks()` qui vient de mesurer, pour de vrai, la bande centrale laissée
libre par les deux colonnes de cartes. Trois compositions, en cascade :

- **triangle** quand la bande le permet : deux satellites encadrent le titre de
  la rubrique, le troisième descend sous les coordonnées ;
- **triangle resserré** (52 px, glyphe 28 px) quand la bande ne les prend pas
  en grand — sous ~1 000 px de large, les colonnes de cartes sont déjà ramenées
  de force vers le milieu et mordent sur le centre ;
- **chapelet vertical resserré** dans l'axe du nœud quand même le triangle
  resserré ne passe plus : vers le bas s'il y a la hauteur, **vers le haut**
  sinon (au-dessus du titre l'espace reste libre en toute circonstance, les
  cartes étant rangées de part et d'autre du nœud).

Le pas du chapelet reste toujours plus grand qu'un satellite : sans cette
garde, la première version les empilait en se recouvrant sur les écrans bas —
la contrainte « ça doit tenir » l'emportait sur la contrainte « ils ne doivent
pas se toucher », et c'est la seconde qui compte. C'est aussi pourquoi la
réduction de taille est décidée par `layoutSats()`, seul endroit qui sache si
la place existe, et non par une requête média qui ne mesure rien.

### Vérifications de cette passe

Navigateur headless (Edge Chromium piloté par puppeteer-core, WebGL logiciel) :
**521 vérifications passées, aucune erreur console.** Sur 1920×1080, 1440×900,
1366×768, 1280×800, 1152×720, 1024×700, 900×640, 830×760 et 821×640 : trois
satellites présents à la taille attendue (68 px, ou 52 px au palier resserré),
glyphe ≥ 28 px, aucun texte visible, `aria-label` et `title` posés, focusables,
**fond transparent / bordure nulle / ombre de boîte nulle** (la non-régression
qui compte : plus jamais de carte) mais `drop-shadow` bien présent, orbite
active avec trois durées et trois déphasages distincts dont un sens inversé,
**aucun contact** ni avec les deux cartes de Contact, ni avec la barre de nœuds,
ni entre satellites, rien hors écran. S'y ajoutent : Projets ramenée à trois
cartes sans le moindre satellite, survol (aucune carte ne réapparaît, orbite
figée), focus clavier puis `Échap` depuis un satellite avec focus rendu à la
barre et calque vidé, feuille mobile 375×780 (rangée hors carte, glyphes à
68 px, sans débordement horizontal, calque desktop masqué), Projets en mobile
sans icône, `prefers-reduced-motion` (orbite coupée, aucun décalage résiduel)
et le repli sans three.js (7 sections, rangée de trois liens dans la section
Contact).

Deux pièges de méthode rencontrés au passage, notés pour la prochaine fois :
neuf rechargements de page d'affilée finissent par faire tomber le rendu WebGL
logiciel (le harnais redimensionne désormais à chaud, ce qui est de toute façon
le cas réel à couvrir), et la condition d'arrivée du nœud au centre peut être
satisfaite par la position **héritée** de la rubrique précédente — toutes
finissent centrées : il faut attendre deux images réelles avant de mesurer,
sinon on lit un calque que la boucle de rendu n'a pas encore placé.

## Passe « découpage en fichiers » — un index.html léger, du code cacheable

### La demande et la contrainte qui la borne

Le propriétaire trouvait que la page demandait trop au navigateur, en
particulier sur un PC modeste : tout tenait dans un `index.html` de 120 Ko,
2 720 lignes, HTML + CSS + JS inline. Demande : découper en fichiers et
sous-dossiers.

La contrainte qui décide de **comment** découper est la promesse du README :
« double-cliquez sur `index.html` ». En `file://`, Chrome et Edge refusent les
modules ES (`type="module"`, `import`) et `fetch()`/XHR vers des fichiers
locaux — chaque origine `file://` est opaque. Sont en revanche parfaitement
servis : `<link rel="stylesheet">` et `<script src>` classiques en chemins
relatifs. Le découpage est donc fait avec ces deux briques-là, et **rien
d'autre** : cinq scripts classiques chargés dans l'ordre, une feuille de style,
la portée globale comme seul mécanisme de partage.

C'est le point à ne pas « moderniser » plus tard : passer ces cinq fichiers en
modules ES casserait l'ouverture par double-clic, qui est une fonctionnalité du
site, pas un détail d'outillage.

### Ce que ça change vraiment

Il faut être honnête sur le gain : pour un premier chargement, la quantité
d'octets est la même, à ~3 Ko près. Ce que le découpage apporte :

- la feuille de style est analysée pendant que les scripts se téléchargent, au
  lieu d'être lue au milieu du HTML ;
- chaque fichier est mis en cache séparément : retoucher un texte de `data.js`
  ne réinvalide plus les 120 Ko ;
- le fichier qu'on ouvre pour travailler fait 75 lignes au lieu de 2 720.

Le vrai coût à l'affichage reste le globe : 12 498 points et 47 arcs à chaque
image. Le réglage qui pèse là-dessus est `var STEP` dans `buildDots()`
(`js/globe.js`) — l'augmenter réduit le nombre de points. Il n'a pas été touché
ici : la demande portait sur l'organisation des fichiers.

### La seule vraie difficulté : deux `return` au milieu de la page

Tout le script vivait dans une seule fonction `bootPortfolio()`, avec deux
sorties anticipées — three.js absent, puis WebGL indisponible — et un
`try/catch` autour. Un corps de fonction ne se coupe pas en cinq fichiers, et
un `return` ne se place pas au premier niveau d'un script.

Le partage se fait donc par la **portée globale**, et l'ordonnancement par une
suite d'appels dans `bootPortfolio()`, réduite à cela. Les deux sorties
deviennent : le garde-fou three.js dans `bootPortfolio()`, et `initGlobe()` qui
rend `false` après avoir affiché le repli texte. Corollaire indispensable :
plus rien qui touche à `THREE` ne s'exécute au premier niveau d'un fichier —
`COL`, les quatre textures et les vecteurs de travail sont désormais construits
dans `initGlobe()`. Sans cela, le chargement du script échouerait avant même le
garde-fou quand le CDN est injoignable, et le repli texte — la raison d'être du
garde-fou — ne s'afficherait jamais.

Le code lui-même n'a pas été réécrit : les fonctions ont été déplacées telles
quelles par un script de découpage, à quelques `var` près, hissés au niveau du
fichier. Ce qui a permis de comparer les deux versions ligne à ligne, et
surtout de rejouer la batterie de tests à l'identique.

### Vérifications de cette passe

Navigateur headless (Edge Chromium piloté par puppeteer-core, WebGL logiciel),
**en `file://` et sans `--allow-file-access-from-files`** : sans ce drapeau, un
chargement qui ne passerait pas chez le propriétaire échouerait aussi ici.

- **Chargement** : les sept ressources `file://` répondent 200, aucune requête
  en échec, aucune erreur console. Palette CSS appliquée, 7 rubriques, 3 liens,
  20 nœuds secondaires, 12 498 points en **un seul** `THREE.Points`, 21 arcs
  principaux, 7 nœuds / 7 pancartes / 7 repères câblés (13 vérifications).
- **Non-régression complète** : la batterie de la passe précédente rejouée sans
  modification — 1920×1080 à 821×640, satellites, cartes, barre, clavier,
  survol, mobile 375×780, `prefers-reduced-motion`, repli sans three.js :
  **521 vérifications passées, aucune erreur console**, exactement le même
  résultat qu'avant découpage.
- **Complément** : les 7 rubriques ouvertes une à une sur 7 tailles (1440×900,
  1366×768, 1280×800, 1152×720, 1024×700, 1024×640, 900×640) — cartes dans
  l'écran, sans contact entre elles ni avec la barre —, `Tab` sur les sept
  entrées, `Entrée`, `Échap` à deux niveaux, et le **repli sans WebGL** —
  chemin nouvellement écrit (`initGlobe()` → `false`), vérifié en neutralisant
  `getContext('webgl')` : 7 sections, 25 fiches, 3 liens, barre masquée, page
  rendue au défilement du navigateur. **649 vérifications passées, aucune
  erreur console.**

Soit **1 183 vérifications** au total sur cette passe.

Piège de méthode rencontré, à ajouter aux précédents : la condition d'arrivée du
nœud au centre était vérifiée **en x seulement**. Les cartes étant placées autour
de `(W/2, H/2)`, un nœud arrivé horizontalement mais encore à 200 px trop bas
donne des cartes ancrées trop bas, que la boucle de rendu ramène de force dans
l'écran — et deux cartes d'une même pile finissent par se toucher. En rendu
logiciel (quelques images par seconde, interpolation à 0,10 par image) cela dure
plusieurs secondes. Le harnais attend maintenant que la condition tienne **en x
et en y sur huit images consécutives**. Les « chevauchements » observés avant
cette correction se reproduisaient à l'identique sur la version d'avant
découpage : c'étaient bien des mesures prises trop tôt, pas une régression.

## Passe « arcs au-dessus du globe, transitions ralenties »

Deux retours du propriétaire, traités l'un après l'autre.

### 1. « Il y a des traits qui passent dans le globe et non au-dessus »

C'était exact, et mesurable : **cinq des vingt et un arcs principaux
traversaient réellement la sphère**.

Les arcs étaient des Béziers quadratiques dont le point de contrôle était posé
sur la **direction médiane** des deux extrémités, à `R·(1+h)`. Une Bézier ne
passe pas par son point de contrôle : elle en reste à mi-chemin. Tant que les
deux nœuds sont proches, la médiane pointe presque dans la même direction
qu'eux et la courbe bombe correctement. Passé une centaine de degrés d'écart,
la médiane s'écarte trop : la tangente au départ pointe vers **l'intérieur** du
globe, et la courbe plonge sous la surface avant de ressortir. Rayon minimal
mesuré sur la polyligne réellement rendue, surface = 1,000 R :

```
Paris–Wellington       0,849      (170,8° d'écart)
Londres–Wellington     0,855      (169,2°)
Reykjavik–Wellington   0,905      (155,2°)
New York–Singapour     0,954      (137,9°)
Wellington–New York    0,973      (129,5°)
```

Wellington est presque l'antipode de Paris et de Londres : pour ces deux
paires, `a+b` est en outre quasi nul, et le `normalize()` du point de contrôle
n'avait plus de direction stable à rendre. La sphère intérieure opaque
(`R·0,9935`) masquait le plus gros du trajet enterré : ce qu'on voyait, c'était
un trait qui rentre dans le globe d'un côté et ressort de l'autre — d'où le
constat du propriétaire, et pourquoi il n'apparaissait que sous certains
angles.

Ce n'était donc **pas** un problème de `depthTest` / `depthWrite` /
`renderOrder` : la profondeur faisait exactement son travail, elle cachait la
partie enterrée. C'était une erreur de géométrie. La pile de profondeur est
restée telle quelle (sphère intérieure opaque en `renderOrder -1`, arcs en
additif `depthWrite:false` occultés par elle quand ils passent derrière).

`makeArc()` trace maintenant le **grand cercle exact** entre les deux points,
relevé par un profil en sinus :

```
rayon(t) = R · (ARC_ALT + h · sin(π·t))      ARC_ALT = 1,004
point(t) = ( u·cos(ω·t) + perp·sin(ω·t) ) · rayon(t)
```

`u` et `perp` forment le repère orthonormé du plan du grand cercle, `ω` l'écart
angulaire. Le rayon ne peut pas descendre sous `R·ARC_ALT` : **le survol est
garanti par construction**, pas par un réglage à surveiller — c'est le point
important, un simple « on augmente la hauteur » aurait laissé le défaut
réapparaître au prochain déplacement de capitale. Deux détails qui comptent :

- la hauteur du bombement suit désormais l'écart **angulaire**
  (`h = 0,045 + 0,24·ω/π`) et non plus la corde, qui sature près de l'antipode
  alors que c'est justement là que l'arc a le plus long chemin à survoler ;
- le plan est choisi explicitement quand les deux points sont antipodaux, au
  lieu de laisser une normalisation de vecteur nul décider.

`arcCurve()` rend un objet minimal à `getPoint` / `getPoints` — les deux seules
méthodes utilisées (géométrie de la ligne, et impulsions qui la parcourent dans
`js/main.js`). Pas de sous-classe `THREE.Curve` : rien de nouveau à construire,
et l'invariant « rien qui touche à `THREE` au premier niveau d'un fichier »
reste vrai.

À savoir pour la suite : le **maillage réseau flottant** (§ 2.4, 92 nœuds,
`LineSegments` à `R·1,045`, opacité 0,032) trace lui aussi des traits en
travers du disque du globe. Ils sont volontaires, et ils sont bien au-dessus de
la surface (rayon minimal mesuré 1,027) : ce sont des cordes vues de face, pas
des traits enterrés. À ne pas confondre avec le défaut corrigé ici.

### 2. « Réduis la vitesse des transitions au moins de moitié »

La rotation vers le nœud visé et le recadrage de la caméra étaient interpolés
au même rythme que le geste direct. Ralentir le tout aurait rendu le glisser
mou : le globe doit coller au doigt. Deux régimes sont donc distingués, et les
coefficients sont sortis en constantes nommées en tête de `js/globe.js` :

```
ROT_EASE     = 0,10     glisser, molette, flèches — inchangé
AIM_ROT_EASE = 0,045    transitions aimAt()       — 0,10 auparavant
ZOOM_EASE    = 0,027    recadrage camZ            — 0,06 auparavant
```

`camZT` n'est touché que par `openRubrique()` et `closeRubrique()` : le zoom
n'a pas besoin de condition, il est ralenti tout le temps. La rotation, si.
`state.aim` marque la transition en cours : `aimAt()` le lève, la boucle de
rendu le baisse à l'arrivée, et **tout geste direct le baisse aussi**
(`pointerdown`, molette, flèches) pour que la reprise en main reste immédiate.

Il suspend en outre la rotation d'ambiance et le balancement pendant la
transition : ils déplacent la cible d'environ un cran par image, ce qui au
régime lent empêchait purement et simplement la transition d'arriver (l'écart
résiduel se stabilisait à `spin / ease`, vingt fois au-dessus du seuil
d'arrivée). Effet de bord agréable : le globe ne dérive plus sous les doigts
pendant qu'on parcourt la barre au clavier.

### Vérifications de cette passe

Navigateur headless (Edge Chromium piloté par puppeteer-core, WebGL logiciel),
**en `file://` et sans `--allow-file-access-from-files`** : **39 vérifications
passées, aucune erreur console**.

- **Géométrie des arcs** — preuve, pas échantillon : pour les 58 arcs, le rayon
  est relevé sur chaque sommet **et sur huit points par segment** (le trait
  rendu est une corde, pas la courbe). Rayon minimal **1,00400**, zéro point
  sous la surface. Comme le critère est un rayon dans le repère du globe, il ne
  dépend pas de l'orientation : aucun angle ne peut le mettre en défaut.
- **Six orientations** rejouées quand même (défaut, +90°, +180°, +270°,
  plongée, contre-plongée), marge radiale minimale à l'écran 0,004 R à chaque
  fois, captures à l'appui.
- **Impulsions** : les 79 impulsions suivent `curve.getPoint()`, rayon minimal
  1,00502.
- **Transitions** : même trajet (Paris → Wellington, 170,8°, le plus long),
  même point de départ, les deux régimes mesurés dans la même page —
  70 images / 3 188 ms en 0,10 contre 158 images / 7 357 ms en 0,045, soit
  **x2,26 en images et x2,31 en temps**. `state.aim` retombe bien à 0 sur
  `pointerdown`.
- **Non-régression** : 12 498 points en un seul `THREE.Points`, 21 arcs
  principaux, 7 nœuds, sept ressources `file://` en 200 ; les sept rubriques
  ouvertes une à une, nœud arrivé au centre, cartes sans contact entre elles ni
  avec la barre, rien hors écran.

Piège de méthode à ajouter aux précédents : **le harnais doit prévoir des
délais plus longs**. L'attente de stabilisation (x ET y stables sur huit
images) met maintenant jusqu'à ~7,5 s en rendu logiciel là où ~3 s
suffisaient. Un harnais réglé sur les anciennes durées conclurait à une
régression de placement des cartes alors qu'il mesure simplement en pleine
transition — exactement le piège déjà rencontré à la passe précédente, avec un
budget de temps deux fois plus grand.

## Passe « carte Root-Me » — le direct n'était pas possible, et pourquoi

Demande du propriétaire : une carte Root-Me dans la rubrique Certifications,
avec ses vraies statistiques, **synchronisées en direct par l'API**. La faisa-
bilité a été instruite avant d'écrire la moindre ligne de code produit, parce
que la réponse changeait complètement l'implémentation.

### Ce que l'enquête a trouvé

Quatre obstacles, chacun suffisant à lui seul, mesurés par requête réelle et
non déduits d'une documentation :

1. **`api.root-me.org` n'existe plus.** L'hôte résout, mais la poignée de main
   TLS échoue en `unrecognized_name` (alerte 112) : plus de certificat pour ce
   nom. Le point d'entrée officiel est **`api.www.root-me.org`**.
2. **Une clé est strictement obligatoire.** Tous les points d'entrée répondent
   `401 {"error":{"code":401}}` sans elle. Aucun profil public par l'API.
3. **La clé se transmet dans l'en-tête `Cookie`** (`Cookie: api_key=…`), et
   uniquement là : en paramètre d'URL (`?apikey=`) comme en en-tête maison
   (`api_key:`), la réponse reste 401. Or `Cookie` est un **nom d'en-tête
   interdit** : `fetch()` n'a pas le droit de le poser. Même avec la clé en
   main, le navigateur ne peut pas s'authentifier.
4. **Aucun en-tête CORS, nulle part.** Pas d'`Access-Control-Allow-Origin` sur
   la moindre réponse, testée avec `Origin: https://nomalovv.github.io` **et**
   `Origin: null` (le cas `file://`) ; le préaffichage `OPTIONS` répond 404,
   sans en-tête non plus. Le navigateur bloque donc l'appel avant même de
   regarder la clé — **en `file://` comme sur GitHub Pages**. Ce n'est pas une
   limite de l'ouverture par double-clic : la mise en ligne n'y changerait
   rien.

La page publique `https://www.root-me.org/Nomalow` n'est pas une porte de
secours non plus : elle est derrière **Anubis**, un rempart anti-robot à preuve
de travail en JavaScript, et ne renvoie pas davantage d'en-têtes CORS. Elle est
lisible depuis un script (le défi se résout : `sha256` du champ `challenge`,
puis `pass-challenge` rend le cookie d'authentification), mais jamais depuis
une page tierce dans un navigateur.

S'ajoute un argument qui vaut à lui seul : une clé personnelle posée dans le JS
d'un **dépôt public** est lisible par n'importe qui. Même si les quatre points
ci-dessus tombaient un jour, ce ne serait pas la bonne façon de le faire — il
faudrait un petit relais côté serveur, qui garde la clé et ajoute les en-têtes
CORS. Hors de portée d'un site qui doit s'ouvrir en double-cliquant.

### Ce qui a donc été fait

Les chiffres sont **relevés une fois, réels, et datés**. Ils viennent de l'API
officielle (`auteurs/1006965`, avec la clé fournie par le propriétaire, qui
n'est **pas** stockée dans le dépôt) et sont recoupés sur la page publique.
Relevé du 2 septembre 2026 : **28 challenges validés sur 608, 335 points,
51 444ᵉ mondial, rang « curious »**, répartis en Réseau 15, Web-Client 9,
Web-Serveur 3, Cryptanalyse 1.

La ligne de statut dit donc « **Relevé manuel du 2 septembre 2026** » et non
« synchronisé en direct ». C'est le point qui compte : afficher un faux direct
aurait été pire que pas de carte du tout. Mettre à jour = corriger l'objet
`ROOTME` en tête de `js/data.js` (les nombres **et** la date `maj`).

### Comment la carte est branchée

Elle n'a demandé **aucune modification de `js/ui.js`**, et c'est délibéré : le
modèle de données offrait déjà le bon crochet. La carte est un bloc ordinaire
de `RUBRIQUES` avec `d: rootmeHTML()` et `html:true` — donc rendue à
l'identique par les **trois** chemins du site (cartes en orbite, feuille
mobile, repli texte), sans une ligne en double. Elle remplace le bloc
placeholder « Pratique régulière » plutôt que de s'ajouter : la rubrique reste
à quatre fiches, la limite au-delà de laquelle le placement manque de place.

Le glyphe est un dessin maison (invite de terminal), pas le logo déposé de
Root-Me : aucune ressource externe, invariant du site.

### Le rouge, exception de marque assumée

Trois variables nouvelles dans `:root` — `--rm`, `--rm-soft`, `--rm-brd` — et
elles ne servent qu'à cette carte. La rupture avec l'accent cyan est voulue :
cette fiche parle d'un service tiers, et le rouge est sa couleur. `--rm-soft`
(`#ff9a9d`) est la seule des trois à porter du texte, à 8,9:1 sur la vitre des
cartes.

### Quatre défauts trouvés au test, tous invisibles à la relecture

Les trois premiers sont la même erreur sous trois formes : **les conteneurs
`.data` des trois rendus imposent des styles qui l'emportent en spécificité sur
ceux de la carte.** C'est le piège à retenir pour tout futur bloc `html:true`.

1. **`overflow-wrap:anywhere`**, hérité des trois conteneurs `.data` (il y sert
   aux longues lignes de données monospace), coupait **« #51 444 » en plein
   milieu d'un nombre**, sur deux lignes. La carte remet la césure normale.
2. **`.block p` (0,1,1) l'emportait sur `.rm-sync` (0,1,0)** : la ligne de
   statut s'affichait en 13,4 px au lieu de 9,5 px et passait sur deux lignes.
   Corrigé en la rendant en `div` plutôt qu'en `p` — plutôt que d'ouvrir une
   guerre de spécificité qu'il aurait fallu regagner trois fois (`.block p`,
   `#sheet .card p`, `#fatal.doc p`). Même raison pour le `div` du repli texte :
   `renderFallbackDoc()` posait le HTML dans un `<p>`, imbrication invalide dès
   que le contenu est un bloc.
3. **`.block a` (0,1,1), `#sheet a` (1,0,1) et `#fatal.doc a` (1,1,1)** repas-
   saient le bouton « Profil public » à l'accent **cyan**, souligné — ce qui
   annulait toute l'exception de marque. Repris une fois pour les trois par
   `.block .rm-link, #sheet .rm-link, #fatal.doc .rm-link`, qui gagne partout.
4. **Une tuile ne fait que 79 px.** Même sans césure sauvage, « #51 444 » à
   19 px n'y tenait pas. `rootmeHTML()` pose une classe `tight` (15 px) au-delà
   de cinq caractères, plutôt qu'une règle sur `:nth-child(3)` qui casserait au
   premier réordonnancement.

### Vérifications de cette passe

Navigateur headless (Edge Chromium piloté par puppeteer-core, WebGL logiciel),
en `file://` : **321 vérifications passées, aucune erreur console, aucune
ressource `file://` en échec.**

- Les neuf tailles desktop habituelles (1920×1080 à 821×640) : carte rendue,
  trois tuiles aux **vrais** chiffres, quatre barres remplies proportionnelle-
  ment et jamais débordantes, chaque nombre sur **une** ligne et dans sa tuile,
  lien `target="_blank"` + `rel="noopener noreferrer"` + `aria-label`, bouton en
  rouge de marque (`rgb(255,154,157)`, la non-régression du défaut 3), point de
  statut rouge, libellé sans le mot « direct », largeur du widget contenue dans
  la carte.
- **Invariant de chevauchement rejoué à chaque taille** avec la nouvelle carte,
  bien plus haute que les autres (352 px contre ~120) : quatre cartes dans
  l'écran, aucun contact entre elles, aucune sur la barre de nœuds. La
  répartition équilibrée de `layoutBlocks()` fait son travail sans réglage.
- Feuille mobile 375×780 : cible tactile du lien à 44 px, aucun débordement
  horizontal, pas de soulignement cyan hérité, chiffres identiques.
- Repli sans three.js : 7 sections, 25 fiches, carte présente, widget dans un
  `div` et non un `p` (défaut 2), lien et chiffres identiques.
- `prefers-reduced-motion` : carte rendue, **aucune** animation dans son
  sous-arbre.
- Non-régression : 12 498 points en un seul `THREE.Points`, 7 rubriques,
  7 entrées de barre, lien atteignable au clavier.

Piège de méthode à ajouter aux précédents, rencontré en écrivant le harnais :
**une entrée de la barre est un interrupteur.** Un harnais qui la clique à
chaque taille ouvre, ferme, ouvre… et une itération sur deux mesure une page
sans cartes. Il faut tester `state.active` avant de cliquer. Et pour la feuille
mobile, l'inverse : elle n'est bâtie qu'à l'**ouverture**, donc il faut
`closeRubrique()` d'abord si la rubrique était restée ouverte du parcours
desktop, sinon rien n'est reconstruit.

## Passe « synchronisation Root-Me » — le direct était impossible *dans le navigateur*

La passe précédente avait conclu qu'un `fetch()` vers l'API Root-Me était
impossible et s'était rabattue sur un relevé daté à la main. La conclusion était
juste, mais elle portait plus loin qu'il ne fallait : **les deux verrous
constatés sont des règles du navigateur, pas de l'API.**

- l'en-tête `Cookie` est un *forbidden header name* : c'est la spécification
  Fetch, côté client, qui l'interdit. `undici` (le `fetch` de Node) ne connaît
  pas cette liste ;
- CORS est un contrôle que le **navigateur** applique aux réponses avant de les
  rendre au script. Une requête serveur-à-serveur n'a pas d'origine à vérifier :
  l'absence d'`Access-Control-Allow-Origin` n'a alors aucun effet.

Restait le troisième argument, qui lui ne tombe pas : une clé personnelle dans
un dépôt public est lisible par tout le monde. Un secret GitHub Actions y répond
exactement — la clé vit chez GitHub, elle est injectée en variable
d'environnement le temps d'une exécution, et n'apparaît jamais dans un fichier.

D'où la solution retenue, qui **ne change rien au site** : le rafraîchissement
est un travail *hors ligne*. Le script écrit du JavaScript statique dans
`js/data.js`, la page continue de ne lire qu'un fichier. Aucun `fetch()`, aucune
clé, aucune dépendance de plus, et l'ouverture par double-clic reste vraie.

### Les deux pièces

```
scripts/update-rootme.mjs             ESM, Node 18+, zéro dépendance
.github/workflows/update-rootme.yml   cron quotidien + workflow_dispatch
```

Le workflow : `checkout` (historique complet, le `pull --rebase` final en a
besoin) → `setup-node` → script → `node --check js/data.js` → commit et `push`
direct sur `main` **seulement si `git diff` n'est pas vide**. `permissions:
contents: write` et le `GITHUB_TOKEN` intégré suffisent ; pas de branche, pas de
PR, conformément au reste du dépôt. Un verrou `concurrency` évite que
l'exécution planifiée et un déclenchement manuel poussent en même temps.

### Ce qui a demandé de la prudence, et pourquoi

**1. Ne jamais écrire à moitié.** C'est la contrainte qui a structuré le script.
Un profil qui reviendrait vide, une clé expirée, une réponse de forme
inattendue : dans tous ces cas le comportement le plus dangereux serait d'écrire
des zéros par-dessus de vraies statistiques. Le fichier n'est donc ouvert en
écriture **qu'à la toute fin**, une fois `score`, `position` et les validations
obtenus et validés ; tout le reste sort en `process.exit(1)` sans toucher au
disque. Le contenu produit est en outre analysé (`new Function`, qui *parse*
sans exécuter) avant d'être écrit, et le workflow le revérifie par
`node --check` : un `js/data.js` cassé casserait le site entier.

**2. Ne pas commiter pour rien.** Si la date de synchronisation était réécrite à
chaque exécution réussie, le dépôt récolterait **un commit par jour** pour un
changement d'un mot. Le script compare donc une *empreinte* des seules valeurs
de fond (chiffres, rang, catégories) et ne réécrit rien si elle est identique.
`maj` est par conséquent la date de la dernière **évolution constatée**, pas
celle du dernier appel — et le libellé de la carte a été choisi en conséquence.

**3. L'API n'a pas de contrat stable.** Elle est peu documentée et renvoie ses
listes sous trois formes selon le point d'entrée (tableau, objet indexé par des
clés numériques `{"0":{…},"1":{…}}`, ou tableau contenant un tel objet). Tout
passe donc par un `enTableau()` qui aplatit les trois, et par un `champ()` qui
accepte plusieurs noms possibles pour la même donnée. La catégorie d'une
validation est prise sur la validation si elle s'y trouve, sinon cherchée sur
`/challenges/{id}` (par lots de 4). Les validations sont paginées tant que
l'appel rapporte des identifiants nouveaux : sans cela, un profil dépassant une
page serait tronqué **en silence**, ce qui est pire qu'une erreur.

**4. Le nombre de catégories est plafonné (`MAX_CATS`, 6).** La carte Root-Me
est déjà la plus haute fiche du site (~352 px contre ~120) et chaque catégorie
lui ajoute une ligne. L'invariant « aucune carte n'en chevauche une autre » se
joue à quelques dizaines de pixels sur les écrans bas (voir la passe « sept
rubriques ») : laisser une machine faire grandir cette carte sans limite serait
lui confier une décision de mise en page. Relever `MAX_CATS` = rejouer le
contrôle de chevauchement.

**5. Le libellé tient sur une ligne — et c'est mesuré, pas espéré.** `.rm-sync`
est du monospace 9,5 px dans une carte de 252 px de contenu, dont 13 px pris par
la pastille et son écart : environ **41 signes**. « Synchronisé automatiquement
le 2 septembre 2026 » en fait 46 — il serait passé sur deux lignes et aurait
fait grandir la plus haute carte du site, exactement le défaut n° 2 de la passe
précédente. Le libellé retenu est « **Synchro. auto. du 2 septembre 2026** »
(34 signes, un de plus que l'ancien « Relevé manuel du … »), la phrase entière
partant dans l'attribut `title`. Le mot est choisi par le champ `sync` de
`ROOTME` : il reste à `'manuel'` tant que le script n'a pas réellement écrit —
la carte n'annonce jamais une synchronisation qui n'a pas eu lieu.

**6. `pct` disparaît de la synchronisation.** Le pourcentage de complétion par
catégorie n'est pas exposé par l'API : il faudrait parcourir les 608 challenges
un par un pour connaître le total de chaque rubrique. Le champ est donc devenu
**facultatif** — `rootmeHTML()` rend l'infobulle sans lui — plutôt que de
recopier une valeur figée qui se serait démodée en silence.

**7. Fins de ligne et échappement.** `js/data.js` est en CRLF ; un bloc réinjecté
en LF aurait produit un fichier mélangé et un diff qui déborde du bloc. Le script
reprend la fin de ligne du fichier lu. Et comme les valeurs viennent désormais
d'un tiers, elles passent par un `esc()` avant d'entrer dans du HTML — un nom de
rubrique n'a aucune raison de contenir un guillemet, mais ce n'est plus nous qui
l'écrivons.

### Comment le bloc est réécrit

Deux marqueurs encadrent l'objet dans `js/data.js` :

```js
/* @rootme:début */
var ROOTME = { … };
/* @rootme:fin */
```

Le script remplace **tout** ce qui se trouve entre les deux, et refuse de
travailler si les marqueurs manquent plutôt que de deviner où écrire. Corollaire
à retenir : ne rien ajouter entre eux qui doive survivre. Une retouche à la main
des chiffres reste possible à tout moment — la prochaine synchronisation réussie
reprend la main.

### Vérifications de cette passe

Le script a été rejoué contre un **bouchon de `fetch`** (installé par
`node --import`, aucune requête réelle, aucune clé), sur huit scénarios :

- **quatre échecs** — clé absente, clé refusée (401), API en panne (500), profil
  sans validations : les quatre sortent en **code 1** avec un message explicite,
  et `js/data.js` est **binairement identique** avant/après dans les quatre cas ;
- **trois formes de réponse** — rubrique portée par la validation, rubrique
  absente (28 appels `/challenges/{id}` déclenchés), liste au format objet
  indexé : les trois produisent le même bloc, `node --check` passe, et le
  fichier ne contient **aucune ligne en LF seul** (CRLF préservé) ;
- **relance immédiate** : « Chiffres inchangés » et fichier intact — pas de
  commit vide.

La carte a par ailleurs été rendue hors navigateur (`rootmeHTML()` évalué sur le
fichier réel) dans les deux états : `sync:'manuel'` avec `pct` → « Relevé manuel
du 2 septembre 2026 » et infobulle « Réseau : 15 challenges validés, 42 % de la
catégorie » ; `sync:'auto'` sans `pct` → « Synchro. auto. du 2 septembre 2026 »
(34 signes) et infobulle « Réseau : 15 challenges validés ». Quatre lignes de
catégories dans les deux cas.

### Et l'essai réel, qui a tranché deux hypothèses

Le secret `ROOTME_API_KEY` étant déjà en place, la tâche a été lancée pour de
vrai. **Deux exécutions vertes**, et elles ont appris trois choses qu'aucun
bouchon ne pouvait dire :

1. **Les validations ne portent pas leur rubrique.** Le chemin de secours —
   28 appels `/challenges/{id}` par lots de 4 — n'est donc pas une précaution
   théorique : c'est le chemin **normal**. Une exécution prend ~65 s, dont
   l'essentiel dans ces appels. C'est aussi ce qui borne la fréquence : un cron
   plus serré qu'une fois par jour marterait l'API sans rien apprendre.
2. **Le rang revient bien en anglais** et la table le traduit : la carte affiche
   « Curieux ».
3. **Les chiffres bougent vraiment** — le classement mondial est passé de
   51 444 à **51 423** entre le relevé manuel du matin et l'essai, à points
   constants. C'est précisément ce qu'une synchronisation quotidienne rattrape,
   et un relevé manuel jamais.

La **seconde** exécution a répondu « Chiffres inchangés : aucun commit » : la
détection de non-changement fonctionne sur des données réelles, pas seulement
sur le bouchon. Reste non éprouvé, faute de matière : la **pagination** des
validations (28 < une page) et la traduction des rangs autres que `curious`.
Les deux dégradent proprement — une pagination muette laisse la première page,
un rang inconnu est **recopié tel quel** plutôt que traduit à tort.

Un détail relevé à l'essai : `actions/checkout@v4` et `setup-node@v4` tournent
sur un runtime Node 20 déprécié, que GitHub force déjà sur Node 24. Passés en
v5 (`using: node24`, `fetch-depth` conservé), et le script en Node 22.

## Où en est le projet — repères avant une grosse modification

Section tenue à jour volontairement : elle décrit l'**état courant**, pas
l'histoire (les passes ci-dessus racontent le pourquoi). À relire en premier
avant de toucher quoi que ce soit, et à corriger en même temps que le code.

### Chiffres

- 7 fichiers de site, ~140 Ko au total, three.js r128 chargé depuis cdnjs en script
  classique :

  ```
  index.html         75 lignes    squelette + appels des feuilles et scripts
  css/style.css     969 lignes    toute la mise en forme
  js/data.js        365 lignes    RUBRIQUES, SOCIAUX, ROOTME, SECONDAIRES, repli
  js/worldmap.js    220 lignes    contours, carte procédurale, textures
  js/globe.js       561 lignes    scène three.js, nœuds, arcs, état, vitesses
  js/ui.js          507 lignes    barre, cartes, satellites, modale, mobile
  js/main.js        481 lignes    amorçage, entrées, boucle de rendu
  ```

- Deux fichiers **hors site**, jamais chargés par la page, jamais copiés avec
  elle : ils tournent sur GitHub Actions et se contentent de réécrire un bloc de
  `js/data.js` (voir la passe « synchronisation Root-Me »).

  ```
  scripts/update-rootme.mjs             ESM, Node 18+, aucune dépendance
  .github/workflows/update-rootme.yml   cron quotidien + déclenchement manuel
  ```

- 7 rubriques, 25 fiches de contenu, 20 nœuds décoratifs, 21 arcs principaux,
  12 498 points de terre.
- Contenu : **24 des 25 fiches portent « Texte à compléter. »**. La
  vingt-cinquième est la carte **Root-Me** de Certifications, seule fiche
  réellement écrite : elle affiche les statistiques relevées du profil public
  (voir la passe « carte Root-Me » ci-dessus, et l'objet `ROOTME` en tête de
  `js/data.js` pour les mettre à jour). Aucune fiche n'a de lecture longue
  (`long`) pour l'instant, donc aucun bouton « Voir en détail » n'apparaît — la
  modale et son piège à focus existent et fonctionnent, elles n'ont simplement
  rien à afficher tant qu'aucune fiche n'a de `long`.

### Plan de la feuille de style

`css/style.css`, dans l'ordre : `PALETTE + BASES` · `ÉCRAN D'ACCUEIL` ·
`INDICATEURS EN MODE GLOBE` · `BARRE DE NŒUDS` · `CONTENU EN ORBITE` ·
`SATELLITES DE LIENS` · `CARTE ROOT-ME` · `MODALE DE LECTURE LONGUE` ·
`FEUILLE MOBILE` · `ERREUR / DIVERS`, puis la requête `max-width:820px`
(portrait) et la requête `prefers-reduced-motion`. Ces deux dernières sont en fin de feuille et doivent
le rester : plusieurs de leurs règles n'ont pas de `!important` et gagnent par
l'ordre de cascade.

### Plan du script

Les cinq fichiers de `js/` sont des **scripts classiques**, chargés dans l'ordre
en bas d'`index.html`. Pas de module ES, pas de `fetch()` : les deux sont
bloqués en `file://`, et la promesse « double-clic, aucun serveur » du README en
dépend. Ils partagent donc la portée globale, et l'ordre des balises est l'ordre
des dépendances :

1. **`js/data.js`** — `SOCIAUX` + `socialsHTML()`, `ROOTME` + `rootmeHTML()`,
   `RUBRIQUES`, `SECONDAIRES`, `fmtCoordsOf()`, `renderFallbackDoc()`, plus
   `REDUCED` et `isMobile()`. `ROOTME` et `rootmeHTML()` doivent rester **avant**
   `RUBRIQUES` : la carte est construite au chargement du fichier, dans le champ
   `d` d'un bloc. `ROOTME` est encadré par les marqueurs `/* @rootme:début */`
   et `/* @rootme:fin */` : `scripts/update-rootme.mjs` remplace **tout** ce qui
   se trouve entre les deux — ne rien y mettre qui doive survivre.
   Rien ici ne dépend de three.js : c'est **la** contrainte d'ordre, sans WebGL
   le contenu doit rester lisible.
2. **`js/worldmap.js`** — `LAND`, `SEAS`, `buildWorldMap()`, `latLonToVec3()`,
   les trois fabriques de textures et `buildTextures()`.
3. **`js/globe.js`** — l'objet `COL`, les objets de scène partagés, les
   constantes de vitesse d'interpolation (`ROT_EASE`, `AIM_ROT_EASE`,
   `ZOOM_EASE`), l'objet `state`, `initGlobe()` (renderer, globe, points, halo,
   bokeh, nœuds, arcs, impulsions), `aimAt()`, `projectNode()`.
4. **`js/ui.js`** — les références du document, `initUI()` (repères, barre de
   nœuds, pancartes, modale, croix), `announce()`, `syncDock()`, la modale,
   `layoutBlocks()` / `layoutSats()`, `openRubrique()` / `closeRubrique()`,
   `buildSheet()`.
5. **`js/main.js`** — `pickNode()`, `handleTap()`, `resize()`, `setHint()`,
   `frame()`, `initInteractions()` (molette, glisser, clavier, tactile) et
   `bootPortfolio()`, enveloppé dans le `try/catch` qui garantit qu'aucune
   erreur d'initialisation ne laisse un écran vide.

`bootPortfolio()` est le seul ordonnanceur : garde-fou three.js → `initGlobe()`
(qui rend `false` et affiche le repli texte si WebGL manque) → `initUI()` →
`initInteractions()` → `resize()` → `frame()`. **`initUI()` doit rester après
`initGlobe()`** : les pancartes se rangent dans les nœuds de la scène
(`nodes[i].tag`).

Tout ce qui a besoin de `THREE` est construit **dans** `initGlobe()` — `COL`,
les textures, les vecteurs de travail — jamais au premier niveau d'un fichier :
sinon le simple chargement du script planterait quand le CDN est injoignable, et
le repli texte ne s'afficherait pas.

### Modèle de données

Tout est dans `js/data.js`.

```
RUBRIQUES[] = { id, nom, ville, lat, lon, sats?, blocs[] }
   blocs[]  = { t, p, d?, html?, long?[] }
SOCIAUX[]   = { id, nom, href, label, externe?, svg }
SECONDAIRES = [ [nom, lat, lon], … ]   // nœuds décoratifs, sans contenu
```

- `id`, `ville`, `lat`, `lon` sont du **câblage** : la barre de nœuds, les
  pancartes, les arcs, les boutons de collision et le repli texte s'y accrochent.
  Changer l'ordre ou le nombre d'entrées de `RUBRIQUES` se répercute partout
  automatiquement (le décompte « 3 sur 7 » est calculé, jamais écrit), mais
  renommer un `id` ou déplacer une capitale demande de vérifier les pancartes
  voisines : deux capitales trop proches se chevauchent sur le globe.
- `d` + `html:true` = contenu HTML injecté tel quel dans la fiche (un lien, une
  carte entière comme celle de Root-Me). Sans `html`, `d` est posé en texte.
  C'est **le** crochet pour ajouter un composant riche sans toucher à
  `js/ui.js` : il traverse les trois rendus tout seul. Deux pièges, tous deux
  payés une fois sur la carte Root-Me : le conteneur `.data` impose
  `overflow-wrap:anywhere` et une taille de police monospace, et **les
  sélecteurs des trois conteneurs l'emportent en spécificité** sur ceux du
  composant (`.block p`, `.block a`, `#sheet .card p`, `#sheet a`,
  `#fatal.doc p`, `#fatal.doc a`). Vérifier les styles calculés, pas seulement
  le rendu à l'œil.
- `long` = tableau de paragraphes ; sa seule présence fait apparaître le bouton
  « Voir en détail » et alimente la modale.
- `sats:true` = la rubrique porte les trois liens en orbite. **Un seul drapeau à
  déplacer** pour changer de rubrique d'accueil ; rien d'autre à toucher.

### Les trois rendus du même contenu

Toute fiche est rendue trois fois, par trois chemins distincts :

1. **cartes en orbite** (desktop) — `openRubrique()` construit les `.block`,
   `layoutBlocks()` les range en deux colonnes autour du nœud, la boucle de
   rendu les suit à chaque image ;
2. **feuille mobile** (`≤ 820 px`) — `buildSheet()` ;
3. **repli texte** (pas de three.js ou pas de WebGL) — `renderFallbackDoc()`,
   lectures longues dépliées, défilement rendu au navigateur.

**Règle d'or : tout ajout de contenu doit traverser les trois.** C'est l'erreur
la plus facile à commettre ici — le rendu desktop est celui qu'on regarde, les
deux autres sont ceux qu'on oublie.

### Invariants à ne pas casser

- **Un seul draw call pour la carte du monde** (12 498 points dans un
  `THREE.Points`). Les arcs sont des objets séparés, c'est assumé.
- **Aucun arc ne descend sous la surface du globe.** `makeArc()` trace un grand
  cercle relevé par un profil en sinus : `rayon(t) = R·(1,004 + h·sin(πt))`, donc
  jamais moins que `R·1,004`, quel que soit l'écart angulaire des deux points.
  C'est garanti par la forme même de la courbe : ne pas revenir à une Bézier à
  point de contrôle médian, elle plonge dans le globe passé ~100° d'écart.
- **Deux régimes d'interpolation pour la rotation**, et c'est délibéré :
  `ROT_EASE` (0,10) pour le geste direct, qui doit coller au doigt, et
  `AIM_ROT_EASE` (0,045) pour les transitions `aimAt()`, ralenties à la demande
  du propriétaire. `state.aim` fait le tri, et retombe à 0 au premier geste
  direct. Il suspend aussi la rotation d'ambiance : sans cela, la cible avance
  plus vite que l'interpolation lente et la transition n'arrive jamais.
- **Aucune ressource externe hors CDN** : la carte du monde est générée sur un
  canvas, pas chargée — pas de `fetch`, pas d'image, donc pas de canvas *tainted*
  en `file://`. La carte Root-Me ne fait pas exception : son glyphe est un SVG
  écrit sur place, et ses chiffres sont des **valeurs statiques** de `js/data.js`,
  **pas un appel réseau** (l'API exige une clé dans un en-tête que `fetch()` ne
  peut pas poser et n'envoie aucun en-tête CORS, en `file://` comme en
  hébergement web). Qu'un script les rafraîchisse hors ligne n'y change rien :
  ce script tourne sur un runner GitHub Actions, **jamais dans le navigateur**.
  Ne pas « moderniser » cela en appelant l'API depuis la page — ça ne peut pas
  marcher, et ça exposerait la clé.
- **Le site s'ouvre en double-cliquant sur `index.html`.** Donc : **pas de module
  ES, pas de `fetch()`/XHR vers un fichier du dépôt**, jamais — les deux sont
  bloqués en `file://`. Les fichiers de `css/` et `js/` sont chargés par
  `<link>` et `<script src>` classiques, en chemins relatifs, dans l'ordre de
  leurs dépendances. C'est la contrainte qui a dicté tout le découpage.
- **Rien qui touche à `THREE` au premier niveau d'un fichier** : tout passe par
  `initGlobe()`, sinon le repli texte ne s'affiche plus quand le CDN tombe.
- **`z-index`** : pancartes 4 < contenu en orbite et satellites 5 < feuille
  mobile 8 < modale. Les pancartes sont passées sous les cartes pour une raison
  (elles transparaissaient au travers), la croix de fermeture passe sous le voile
  de la modale pour une autre (deux croix concurrentes).
- **Cible tactile ≥ 44 px** partout (barre, croix, boutons, satellites) et anneau
  de focus unique pour toute la page.
- **`prefers-reduced-motion` coupe tout mouvement**, y compris les orbites et les
  impulsions le long des arcs.
- **Le clavier doit tout atteindre** : la barre de nœuds est le chemin garanti,
  les boutons de collision du globe sont hors de l'ordre de tabulation.
- **Aucune carte ne doit chevaucher une autre, ni la barre de nœuds, ni sortir
  de l'écran** — c'est la contrainte qui a coûté le plus de reprises ;
  `layoutBlocks()` la garantit tant que la place existe, et le contrôle est
  rejoué à chaque passe sur toutes les tailles.

### Comment rejouer les tests

Il n'y a pas de dépendance dans le dépôt : le harnais est monté à part, hors du
dépôt, et jeté après usage.

```
mkdir %TEMP%\pfharness && cd %TEMP%\pfharness
npm init -y && npm install puppeteer-core
node check.js
```

Ce qui compte dans le harnais, et qui a été appris à la dure :

- Edge Chromium en `headless:'new'`, lancé avec `--use-gl=angle
  --use-angle=swiftshader --enable-unsafe-swiftshader` : le rendu WebGL logiciel
  suffit, mais il tourne à quelques images par seconde.
- **Ouvrir la page en `file://`, et sans `--allow-file-access-from-files`.**
  Le drapeau masquerait exactement ce qu'on veut vérifier : que les fichiers de
  `css/` et `js/` se chargent bien dans les conditions du double-clic.
- **Attendre la position en x ET en y** du nœud actif (voir le piège décrit dans
  la passe « découpage en fichiers »), sur plusieurs images consécutives.
- **Redimensionner à chaud plutôt que recharger** : une dizaine de contextes
  WebGL logiciels d'affilée finissent par faire tomber le rendu (« Navigating
  frame was detached »). C'est de toute façon le cas réel à couvrir.
- **Attendre l'arrivée réelle du nœud au centre** avant toute mesure —
  `layoutBlocks()` repose sur cette hypothèse — puis **deux images** de plus :
  la condition d'arrivée peut être satisfaite par la position héritée de la
  rubrique précédente, toutes finissant centrées.
- **Prévoir large sur cette attente : jusqu'à ~7,5 s en rendu logiciel** depuis
  que les transitions `aimAt()` sont ralenties (~3 s auparavant). Un harnais
  réglé sur les anciennes durées mesure en pleine transition et conclut à tort
  à une régression de placement des cartes.
- Mesurer des géométries (`getBoundingClientRect`) et des styles calculés, pas
  des captures : c'est ce qui attrape les chevauchements et les régressions de
  style. Les captures servent à juger la composition, pas à valider.
- Les tailles qui trouvent des défauts : 1920×1080, 1440×900, 1366×768,
  1280×800, 1152×720, 1024×700, 900×640, 830×760, 821×640 (le palier desktop le
  plus étroit), et 375×780 en portrait. Plus `prefers-reduced-motion` et le repli
  three.js bloqué (interception de requête).

### Ce qui reste à faire

- **Écrire le contenu** : les 24 fiches restantes sont à remplir (la carte
  Root-Me, elle, est écrite), et les lectures longues (`long`) sont à ajouter là
  où elles ont un sens — c'est ce qui réveillera le bouton « Voir en détail » et
  la modale.
- **Pages GitHub** : en service, sur `main` / racine —
  <https://nomalovv.github.io/portfolio/>. À noter : ce n'est **pas** ce qui
  débloquerait un direct Root-Me — l'API n'envoie aucun en-tête CORS, l'origine
  `https://nomalovv.github.io` est refusée exactement comme `file://`.
- **Synchronisation Root-Me : rien à faire, elle tourne.** Le secret
  `ROOTME_API_KEY` est en place et deux exécutions sont passées. Pour la
  relancer à la main : `Actions` → `Stats Root-Me` → `Run workflow`. Si elle se
  met un jour à échouer sur « L'API a refusé la clé (HTTP 401) », c'est que la
  clé a expiré : la régénérer sur Root-Me et remplacer le secret dans
  `Settings` → `Secrets and variables` → `Actions`. Un rafraîchissement à la
  main de l'objet `ROOTME` reste possible à tout moment.

## Limites connues / à savoir

- Le site est en plusieurs fichiers : `index.html` a besoin des dossiers `css/`
  et `js/` **à côté de lui**. Envoyer le seul `index.html` ne suffit plus.
- Le CDN Three.js et Google Fonts nécessitent une connexion réseau au premier chargement (la carte du monde, elle, est entièrement inline). Un message s'affiche si le réseau est indisponible.
- Les tracés côtiers sont volontairement simplifiés (~40 à 70 sommets par continent) : lisibles à l'échelle du globe, approximatifs si on zoomait fortement.
- Les trois destinations de `SOCIAUX` sont réelles : adresse courriel de l'utilisateur (gardée volontairement, décision explicite), profil LinkedIn et compte GitHub `Nomalovv`. Elles flottent autour de la rubrique **Contact**, hors de toute carte.
- 24 des 25 fiches de contenu portent « Texte à compléter. » : le contenu réel reste à écrire (voir « Ce qui reste à faire » ci-dessus). La vingt-cinquième est la carte Root-Me.
- **Les statistiques Root-Me ne sont pas lues par la page**, et la carte le dit (« Relevé manuel du … », ou « Synchro. auto. du … » une fois la tâche en service). L'API Root-Me exige une clé transmise dans un en-tête `Cookie` — que `fetch()` n'a pas le droit de poser — et n'envoie aucun en-tête CORS ; la page publique est derrière un rempart anti-robot à preuve de travail. Aucun de ces obstacles ne tombe en passant sur GitHub Pages. Elles sont donc rafraîchies **hors ligne**, par `scripts/update-rootme.mjs` lancé une fois par jour par GitHub Actions, qui réécrit et commite le bloc `ROOTME` de `js/data.js`. Détail complet dans les passes « carte Root-Me » et « synchronisation Root-Me ».
- La tâche planifiée **ne tourne pas tant que le secret `ROOTME_API_KEY` n'est pas ajouté** au dépôt : chaque exécution échoue proprement (rouge dans l'onglet Actions) sans rien commiter ni casser. Le site continue d'afficher les derniers chiffres commités.
- Le champ `pct` de `ROOTME.categories` (pourcentage de la catégorie complétée, visible en infobulle) est **facultatif** et n'est pas récupéré par la synchronisation : l'API ne le donne pas sans parcourir les 608 challenges un à un. Il disparaîtra donc de l'infobulle à la première synchronisation réussie.
