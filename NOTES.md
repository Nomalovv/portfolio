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

## Où en est le projet — repères avant une grosse modification

Section tenue à jour volontairement : elle décrit l'**état courant**, pas
l'histoire (les passes ci-dessus racontent le pourquoi). À relire en premier
avant de toucher quoi que ce soit, et à corriger en même temps que le code.

### Chiffres

- 7 fichiers, ~125 Ko au total, three.js r128 chargé depuis cdnjs en script
  classique :

  ```
  index.html         75 lignes    squelette + appels des feuilles et scripts
  css/style.css     820 lignes    toute la mise en forme
  js/data.js        225 lignes    RUBRIQUES, SOCIAUX, SECONDAIRES, repli texte
  js/worldmap.js    220 lignes    contours, carte procédurale, textures
  js/globe.js       488 lignes    scène three.js, nœuds, arcs, état
  js/ui.js          507 lignes    barre, cartes, satellites, modale, mobile
  js/main.js        469 lignes    amorçage, entrées, boucle de rendu
  ```

- 7 rubriques, 25 fiches de contenu, 20 nœuds décoratifs, 21 arcs principaux,
  12 498 points de terre.
- Contenu : les **25 fiches portent « Texte à compléter. »**. Aucune n'a de
  lecture longue (`long`) pour l'instant, donc aucun bouton « Voir en détail »
  n'apparaît — la modale et son piège à focus existent et fonctionnent, elles
  n'ont simplement rien à afficher tant qu'aucune fiche n'a de `long`.

### Plan de la feuille de style

`css/style.css`, dans l'ordre : `PALETTE + BASES` · `ÉCRAN D'ACCUEIL` ·
`INDICATEURS EN MODE GLOBE` · `BARRE DE NŒUDS` · `CONTENU EN ORBITE` ·
`SATELLITES DE LIENS` · `MODALE DE LECTURE LONGUE` · `FEUILLE MOBILE` ·
`ERREUR / DIVERS`, puis la requête `max-width:820px` (portrait) et la requête
`prefers-reduced-motion`. Ces deux dernières sont en fin de feuille et doivent
le rester : plusieurs de leurs règles n'ont pas de `!important` et gagnent par
l'ordre de cascade.

### Plan du script

Les cinq fichiers de `js/` sont des **scripts classiques**, chargés dans l'ordre
en bas d'`index.html`. Pas de module ES, pas de `fetch()` : les deux sont
bloqués en `file://`, et la promesse « double-clic, aucun serveur » du README en
dépend. Ils partagent donc la portée globale, et l'ordre des balises est l'ordre
des dépendances :

1. **`js/data.js`** — `SOCIAUX` + `socialsHTML()`, `RUBRIQUES`, `SECONDAIRES`,
   `fmtCoordsOf()`, `renderFallbackDoc()`, plus `REDUCED` et `isMobile()`.
   Rien ici ne dépend de three.js : c'est **la** contrainte d'ordre, sans WebGL
   le contenu doit rester lisible.
2. **`js/worldmap.js`** — `LAND`, `SEAS`, `buildWorldMap()`, `latLonToVec3()`,
   les trois fabriques de textures et `buildTextures()`.
3. **`js/globe.js`** — l'objet `COL`, les objets de scène partagés, l'objet
   `state`, `initGlobe()` (renderer, globe, points, halo, bokeh, nœuds, arcs,
   impulsions), `aimAt()`, `projectNode()`.
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
- `d` + `html:true` = contenu HTML injecté tel quel dans la fiche (un lien, par
  exemple). Sans `html`, `d` est posé en texte.
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
- **Aucune ressource externe hors CDN** : la carte du monde est générée sur un
  canvas, pas chargée — pas de `fetch`, pas d'image, donc pas de canvas *tainted*
  en `file://`.
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
- Mesurer des géométries (`getBoundingClientRect`) et des styles calculés, pas
  des captures : c'est ce qui attrape les chevauchements et les régressions de
  style. Les captures servent à juger la composition, pas à valider.
- Les tailles qui trouvent des défauts : 1920×1080, 1440×900, 1366×768,
  1280×800, 1152×720, 1024×700, 900×640, 830×760, 821×640 (le palier desktop le
  plus étroit), et 375×780 en portrait. Plus `prefers-reduced-motion` et le repli
  three.js bloqué (interception de requête).

### Ce qui reste à faire

- **Écrire le contenu** : les 25 fiches sont à remplir, et les lectures longues
  (`long`) sont à ajouter là où elles ont un sens — c'est ce qui réveillera le
  bouton « Voir en détail » et la modale.
- **Pages GitHub** : la mise en ligne n'est pas encore configurée.

## Limites connues / à savoir

- Le site est en plusieurs fichiers : `index.html` a besoin des dossiers `css/`
  et `js/` **à côté de lui**. Envoyer le seul `index.html` ne suffit plus.
- Le CDN Three.js et Google Fonts nécessitent une connexion réseau au premier chargement (la carte du monde, elle, est entièrement inline). Un message s'affiche si le réseau est indisponible.
- Les tracés côtiers sont volontairement simplifiés (~40 à 70 sommets par continent) : lisibles à l'échelle du globe, approximatifs si on zoomait fortement.
- Les trois destinations de `SOCIAUX` sont réelles : adresse courriel de l'utilisateur (gardée volontairement, décision explicite), profil LinkedIn et compte GitHub `Nomalovv`. Elles flottent autour de la rubrique **Contact**, hors de toute carte.
- Les 25 fiches de contenu portent toutes « Texte à compléter. » : le contenu réel reste à écrire (voir « Ce qui reste à faire » ci-dessus).
