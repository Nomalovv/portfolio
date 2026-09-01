# Portfolio « globe réseau »

Portfolio one-page interactif : le globe terrestre sert de menu. Sept nœuds posés
sur des capitales ouvrent chacun une rubrique dont le contenu se déploie en orbite
autour du point.

## Ouvrir le site

Double-cliquez sur `index.html` : il s'ouvre directement dans le navigateur en
`file://`, **aucun serveur n'est nécessaire**. Une connexion internet est requise
au chargement pour récupérer three.js (CDN cdnjs) et les polices Google Fonts ; la
carte du monde, elle, est générée dans la page et ne déclenche aucune requête.

Navigation : la barre de nœuds en bas d'écran liste les sept rubriques et est
visible dès le premier écran — un clic ouvre la rubrique et amène le globe
dessus, sans rien avoir à faire défiler ni faire tourner. `Tab` parcourt ces
sept entrées, `Entrée` ouvre, `Échap` ferme. Chaque entrée porte le nom de la
rubrique et son rang (`03 / 07`) ; la capitale, elle, n'apparaît que sur le
globe et sous le titre ancré.

Pour ceux qui préfèrent explorer : le bouton « Explorer le globe » (ou la
molette, ou un balayage vertical) bascule en vue globe, le glisser l'oriente
librement et un clic direct sur un nœud ouvre sa rubrique.

## Modifier le contenu

Tout est dans `index.html`. Quatre endroits à connaître.

### 1. Le texte des rubriques — `var RUBRIQUES`

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

### 2. Les liens LinkedIn / GitHub / courriel — `var SOCIAUX`

Juste au-dessus de `RUBRIQUES` (section « 1.a »). Une entrée = un lien, avec son
glyphe SVG écrit sur place (aucune bibliothèque d'icônes) : changez `href` pour
changer la destination, `label` pour ce qu'annoncent les lecteurs d'écran.

Ces trois liens ne sont pas rangés dans une carte : ils **flottent autour de la
rubrique Contact**, autour du nœud. Pour les faire graviter autour d'une autre
rubrique, déplacez le drapeau `sats: true` d'une entrée de `RUBRIQUES` à une
autre — il n'y a rien d'autre à toucher. Sur mobile et dans la version texte,
où il n'y a pas d'espace libre autour du nœud, ils reviennent en rangée au bas
de la rubrique.

### 3. L'écran d'accueil — le bloc `<section id="intro">`

Dans le HTML, juste après `<body>` : ligne de coordonnées, nom, métier et accroche.
Le nom du bandeau en haut à gauche se change dans `<header id="brand">`.

### 4. Les couleurs — le bloc `:root` du `<style>`

Toute la palette est en variables CSS (`--bg-deep`, `--accent`, `--warm`, `--text`…)
tout en haut de la feuille de style. Les couleurs 3D correspondantes (points de
terre, arcs, nœuds) sont regroupées juste en dessous dans l'objet `var COL` du
script — modifiez les deux ensemble pour rester cohérent.

## Bon à savoir

- Les nœuds décoratifs secondaires se règlent dans `var SECONDAIRES` (nom, lat, lon).
- La densité du globe se règle avec `var STEP = 1.0;` dans `buildDots()` : augmenter
  la valeur réduit le nombre de points (donc la charge GPU), la diminuer l'augmente.
- Si three.js ne se charge pas ou si WebGL est indisponible, la page bascule sur
  une version texte complète de toutes les rubriques au lieu d'un écran vide.
- Le libellé des entrées de la barre de nœuds vient de `RUBRIQUES` : changer un
  `nom` met la barre à jour automatiquement, et le rang (`03 / 07`) se recalcule
  tout seul si vous ajoutez ou retirez une rubrique.
- Une rubrique ajoutée est câblée partout automatiquement (barre, clavier, arcs,
  repli texte). Au-delà de sept, surveillez seulement la largeur de la barre :
  elle passe sur deux rangées centrées plutôt que de sortir de l'écran.
