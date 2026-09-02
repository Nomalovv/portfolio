# Portfolio « globe réseau »

Portfolio one-page interactif : le globe terrestre sert de menu. Sept nœuds posés
sur des capitales ouvrent chacun une rubrique dont le contenu se déploie en orbite
autour du point.

## Ouvrir le site

Double-cliquez sur `index.html` : il s'ouvre directement dans le navigateur en
`file://`, **aucun serveur n'est nécessaire**. Une connexion internet est requise
au chargement pour récupérer three.js (CDN cdnjs) et les polices Google Fonts ; la
carte du monde, elle, est générée dans la page et ne déclenche aucune requête.

Le site est réparti en plusieurs fichiers, mais tous sont chargés en chemins
relatifs par de simples `<link>` et `<script src>` — ce qui fonctionne en
`file://` contrairement aux modules ES et à `fetch()`. **Gardez donc les dossiers
`css/` et `js/` à côté de `index.html`** : c'est le trio qu'il faut copier ou
envoyer, pas le seul fichier HTML.

Navigation : la barre de nœuds en bas d'écran liste les sept rubriques et est
visible dès le premier écran — un clic ouvre la rubrique et amène le globe
dessus, sans rien avoir à faire défiler ni faire tourner. `Tab` parcourt ces
sept entrées, `Entrée` ouvre, `Échap` ferme. Chaque entrée porte le nom de la
rubrique et son rang (`03 / 07`) ; la capitale, elle, n'apparaît que sur le
globe et sous le titre ancré.

Pour ceux qui préfèrent explorer : le bouton « Explorer le globe » (ou la
molette, ou un balayage vertical) bascule en vue globe, le glisser l'oriente
librement et un clic direct sur un nœud ouvre sa rubrique.

## Plan des fichiers

```
index.html        squelette : en-tête, balisage, appels des feuilles et scripts
css/style.css     toute la mise en forme (palette, composants, requêtes média)
js/data.js        contenu des rubriques, liens, repli texte sans 3D
js/worldmap.js    contours des continents, carte procédurale, textures
js/globe.js       scène three.js : globe, nœuds, arcs, impulsions, état
js/ui.js          barre de nœuds, cartes en orbite, satellites, modale, mobile
js/main.js        amorçage, molette / glisser / clavier / tactile, boucle de rendu
```

Les scripts se chargent dans cet ordre et en dépendent : `js/main.js` vérifie
three.js, appelle `initGlobe()` puis `initUI()`, branche les entrées et lance la
boucle de rendu. Si three.js ne se charge pas ou si WebGL est indisponible,
`renderFallbackDoc()` (dans `js/data.js`) affiche l'intégralité du contenu en
texte.

## Modifier le contenu

Quatre endroits à connaître : deux dans `js/data.js`, un dans `index.html`, un
dans `css/style.css`.

### 1. Le texte des rubriques — `var RUBRIQUES` dans `js/data.js`

Cherchez `var RUBRIQUES = [` (section « 1. DONNÉES DE CONTENU »). C'est le seul
endroit à toucher pour changer les textes. Une rubrique = un objet :

```js
{
  id: 'apropos', nom: 'À propos', ville: 'Paris', lat: 48.85, lon: 2.35,
  blocs: [
    { t: 'Titre du bloc',
      p: 'Une ou deux phrases courtes.',
      d: 'LIGNE DE DONNÉES EN MONOSPACE',     // optionnel
      html: true,                              // si `d` contient un lien
      long: ['Paragraphe 1.', 'Paragraphe 2.'] // lecture longue « Voir en détail »
    }
  ]
}
```

`lat` / `lon` déplacent le nœud sur le globe. Comptez 3 ou 4 blocs par rubrique :
au-delà, le placement anti-chevauchement manque de place sur petit écran.

### 1 bis. Les chiffres Root-Me — `var ROOTME` dans `js/data.js`

La carte Root-Me de la rubrique Certifications (section « 1.b ») affiche les
statistiques réelles du profil public : challenges validés, points, classement
mondial et validations par catégorie.

Ces chiffres sont un **relevé daté**, pas un flux : l'API Root-Me exige une clé
personnelle transmise dans un en-tête `Cookie`, que le JavaScript d'une page n'a
pas le droit de poser, et elle n'envoie aucun en-tête CORS — un appel depuis le
navigateur est refusé, aussi bien en `file://` qu'une fois le site en ligne.
C'est pourquoi la carte affiche honnêtement « Relevé manuel du … » plutôt qu'un
faux direct.

Pour les rafraîchir : relever les valeurs sur <https://www.root-me.org/Nomalow>
et corriger l'objet `ROOTME` — les nombres **et** le champ `maj` (la date
affichée en bas de la carte). Rien d'autre à toucher : la carte se redessine
toute seule dans les trois rendus du site.

### 2. Les liens LinkedIn / GitHub / courriel — `var SOCIAUX` dans `js/data.js`

Juste au-dessus de `RUBRIQUES` (section « 1.a »). Une entrée = un lien, avec son
glyphe SVG écrit sur place (aucune bibliothèque d'icônes) : changez `href` pour
changer la destination, `label` pour ce qu'annoncent les lecteurs d'écran.

Ces trois liens ne sont pas rangés dans une carte : ils **flottent autour de la
rubrique Contact**, autour du nœud. Pour les faire graviter autour d'une autre
rubrique, déplacez le drapeau `sats: true` d'une entrée de `RUBRIQUES` à une
autre — il n'y a rien d'autre à toucher. Sur mobile et dans la version texte,
où il n'y a pas d'espace libre autour du nœud, ils reviennent en rangée au bas
de la rubrique.

### 3. L'écran d'accueil — le bloc `<section id="intro">` d'`index.html`

Dans le HTML, juste après `<body>` : ligne de coordonnées, nom, métier et accroche.
Le nom du bandeau en haut à gauche se change dans `<header id="brand">`.

### 4. Les couleurs — le bloc `:root` de `css/style.css`

Toute la palette est en variables CSS (`--bg-deep`, `--accent`, `--warm`, `--text`…)
tout en haut de la feuille de style. Les couleurs 3D correspondantes (points de
terre, arcs, nœuds) sont dans l'objet `COL`, en haut de `js/globe.js` (il est
rempli au démarrage, `THREE.Color` ayant besoin de la bibliothèque) — modifiez
les deux ensemble pour rester cohérent.

Trois variables font exception : `--rm`, `--rm-soft` et `--rm-brd`, le rouge de
Root-Me. Elles ne servent qu'à la carte Root-Me, volontairement traitée dans la
couleur du service dont elle parle, et n'ont pas à suivre l'accent du site.

## Bon à savoir

- Les nœuds décoratifs secondaires se règlent dans `var SECONDAIRES` (nom, lat, lon),
  dans `js/data.js`.
- La vitesse des transitions se règle en haut de `js/globe.js` :
  `AIM_ROT_EASE` (rotation du globe vers la rubrique choisie) et `ZOOM_EASE`
  (recadrage de la caméra). Ce sont des parts du chemin restant parcourues par
  image : **plus la valeur est petite, plus la transition est lente.**
  `ROT_EASE`, juste au-dessus, ne concerne que le glisser à la souris et n'a pas
  de raison d'être ralenti.
- La densité du globe se règle avec `var STEP = 1.0;` dans `buildDots()`
  (`js/globe.js`) : augmenter la valeur réduit le nombre de points (donc la charge
  GPU), la diminuer l'augmente. C'est le premier réglage à toucher sur une machine
  peu puissante.
- Si three.js ne se charge pas ou si WebGL est indisponible, la page bascule sur
  une version texte complète de toutes les rubriques au lieu d'un écran vide.
- Le libellé des entrées de la barre de nœuds vient de `RUBRIQUES` : changer un
  `nom` met la barre à jour automatiquement, et le rang (`03 / 07`) se recalcule
  tout seul si vous ajoutez ou retirez une rubrique.
- Une rubrique ajoutée est câblée partout automatiquement (barre, clavier, arcs,
  repli texte). Au-delà de sept, surveillez seulement la largeur de la barre :
  elle passe sur deux rangées centrées plutôt que de sortir de l'écran.
