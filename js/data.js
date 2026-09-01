/* ============================================================================
   DONNÉES DE CONTENU + REPLI SANS 3D
   Chargé en premier : rien ici ne dépend de three.js, et le repli texte doit
   rester disponible même si la bibliothèque 3D ne se charge pas.
   ========================================================================== */
'use strict';

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var isMobile = function () { return window.innerWidth <= 820; };

/* ============================================================================
   1. DONNÉES DE CONTENU
   Déclarées AVANT le garde-fou three.js : sans WebGL le globe disparaît, mais
   le contenu, lui, doit rester lisible (voir renderFallbackDoc plus bas).
   ========================================================================== */
/* --- 1.a Satellites de liens (rubrique Contact) ----------------------------
   Une entrée = un satellite qui flotte autour de la rubrique. Les glyphes sont
   des SVG écrits ici même : aucune dépendance à une bibliothèque d'icônes.
   Chaque SVG se compose de deux parties, et c'est ce que la feuille de style
   anime : « frame » (le cadre, retracé au survol) et « glyph » (le symbole).
   Ajouter une destination = ajouter une entrée ici, rien d'autre.
   « externe » ouvre le lien dans un nouvel onglet ; le courriel s'en passe,
   un mailto n'a pas à laisser une page blanche derrière lui. */
var SOCIAUX = [
  {
    id: 'linkedin',
    nom: 'LinkedIn',
    href: 'https://www.linkedin.com/in/arthur-formentin-907296362/',
    label: 'Profil LinkedIn d’Arthur Formentin (nouvel onglet)',
    externe: true,
    svg: '<rect class="frame" x="1.7" y="1.7" width="20.6" height="20.6" rx="4.6"/>' +
         '<g class="glyph">' +
         '<circle cx="7.1" cy="7.6" r="1.55"/>' +
         '<rect x="5.85" y="10" width="2.5" height="8.15" rx=".4"/>' +
         '<path d="M10.9 18.15V10h2.4v1.12h.04c.43-.78 1.37-1.37 2.67-1.37 2.28 0 2.99 1.4 2.99 3.56v4.84h-2.5v-4.34c0-1.06-.02-2.43-1.5-2.43-1.5 0-1.74 1.15-1.74 2.35v4.42z"/>' +
         '</g>'
  },
  {
    id: 'github',
    nom: 'GitHub',
    href: 'https://github.com/Nomalovv',
    label: 'Profil GitHub d’Arthur Formentin (nouvel onglet)',
    externe: true,
    svg: '<circle class="frame" cx="12" cy="12" r="10.3"/>' +
         '<path class="glyph" d="M12 5.1a7 7 0 00-2.21 13.64c.35.06.48-.15.48-.34v-1.2c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.44.05-.43.05-.43.7.05 1.07.73 1.07.73.63 1.07 1.65.76 2.05.58.06-.46.25-.77.45-.94-1.56-.18-3.2-.78-3.2-3.47 0-.77.28-1.4.73-1.89-.07-.18-.32-.9.07-1.87 0 0 .6-.19 1.96.72a6.8 6.8 0 013.56 0c1.36-.91 1.95-.72 1.95-.72.4.97.15 1.69.08 1.87.46.49.73 1.12.73 1.89 0 2.7-1.65 3.29-3.22 3.46.26.22.48.65.48 1.31v1.94c0 .19.13.41.49.34A7 7 0 0012 5.1z"/>'
  },
  {
    id: 'mail',
    nom: 'Courriel',
    href: 'mailto:arthur.formentin@sts-sio-caen.info',
    label: 'Écrire à arthur.formentin@sts-sio-caen.info',
    svg: '<rect class="frame" x="1.9" y="5" width="20.2" height="14" rx="3.2"/>' +
         '<path class="glyph" d="M3.6 7.1l8.4 5.7 8.4-5.7v2.1L12 15 3.6 9.2z"/>'
  }
];

/* Rend les trois satellites. Deux variantes du même balisage :
     « field » — posés en coordonnées d'écran autour du nœud de la rubrique
                 ouverte (desktop), donc libres, sans rien autour ;
     « row »   — rangée dans le flux, pour la feuille mobile et le repli texte,
                 où il n'existe pas d'espace libre à occuper.
   Les satellites n'affichent aucun texte : le nom part dans « aria-label »
   pour les lecteurs d'écran et dans « title » pour l'infobulle native. */
function socialsHTML(variante) {
  return '<span class="socials ' + (variante || 'row') + '">' + SOCIAUX.map(function (s) {
    return '<span class="orb">' +
           '<a class="social" href="' + s.href + '"' +
           (s.externe ? ' target="_blank" rel="noopener noreferrer"' : '') +
           ' aria-label="' + s.label + '" title="' + s.nom + '">' +
           '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + s.svg + '</svg>' +
           '</a></span>';
  }).join('') + '</span>';
}

var RUBRIQUES = [
  {
    id: 'apropos', nom: 'À propos', ville: 'Paris', lat: 48.85, lon: 2.35,
    blocs: [
      { t:'Approche du métier', p:"Texte à compléter." },
      { t:'Terrain d\'intervention', p:"Texte à compléter." },
      { t:'Méthode de travail', p:"Texte à compléter." },
      { t:'Disponibilité', p:"Texte à compléter." }
    ]
  },
  {
    id: 'parcours', nom: 'Parcours', ville: 'Londres', lat: 51.51, lon: -0.13,
    blocs: [
      { t:'Formation', p:"Texte à compléter." },
      { t:'Expérience 1', p:"Texte à compléter." },
      { t:'Expérience 2', p:"Texte à compléter." },
      { t:'Formation continue', p:"Texte à compléter." }
    ]
  },
  {
    id: 'certifications', nom: 'Certifications', ville: 'Reykjavik', lat: 64.15, lon: -21.94,
    blocs: [
      { t:'Certification 1', p:"Texte à compléter." },
      { t:'Certification 2', p:"Texte à compléter." },
      { t:'Certification 3', p:"Texte à compléter." },
      { t:'Pratique régulière', p:"Texte à compléter." }
    ]
  },
  {
    id: 'competences', nom: 'Compétences', ville: 'Tokyo', lat: 35.68, lon: 139.69,
    blocs: [
      { t:'Domaine 1', p:"Texte à compléter." },
      { t:'Domaine 2', p:"Texte à compléter." },
      { t:'Domaine 3', p:"Texte à compléter." },
      { t:'Domaine 4', p:"Texte à compléter." }
    ]
  },
  {
    id: 'procedures', nom: 'Procédures', ville: 'Wellington', lat: -41.29, lon: 174.78,
    blocs: [
      { t:'Procédure 1', p:"Texte à compléter." },
      { t:'Procédure 2', p:"Texte à compléter." },
      { t:'Procédure 3', p:"Texte à compléter." },
      { t:'Procédure 4', p:"Texte à compléter." }
    ]
  },
  {
    id: 'projets', nom: 'Projets', ville: 'New York', lat: 40.71, lon: -74.01,
    blocs: [
      { t:'Projet 1', p:"Texte à compléter." },
      { t:'Projet 2', p:"Texte à compléter." },
      { t:'Projet 3', p:"Texte à compléter." }
    ]
  },
  {
    id: 'contact', nom: 'Contact', ville: 'Singapour', lat: 1.35, lon: 103.82,
    // « sats » : les trois liens (LinkedIn, GitHub, courriel) gravitent autour
    // de la rubrique — autour du nœud, jamais dans une carte. Voir SOCIAUX,
    // buildSats() et layoutSats().
    sats: true,
    blocs: [
      { t:'Courriel',
        p:"Texte à compléter.",
        d:'<a href="mailto:arthur.formentin@sts-sio-caen.info">arthur.formentin@sts-sio-caen.info</a>',
        html:true },
      // Les liens ne sont plus dans une carte : ils flottent autour de la
      // rubrique (voir « sats » ci-dessus). Les deux cartes restent du texte.
      { t:'Disponibilité',
        p:"Texte à compléter." }
    ]
  }
];

// ~20 nœuds décoratifs (coordonnées réelles approximatives)
var SECONDAIRES = [
  ['Moscou',55.75,37.62], ['Le Caire',30.04,31.24], ['Dubaï',25.20,55.27],
  ['Mumbai',19.08,72.88], ['Pékin',39.90,116.41], ['Canberra',-35.28,149.13],
  ['Brasília',-15.79,-47.88], ['Pretoria',-25.75,28.19], ['Ottawa',45.42,-75.70],
  ['Mexico',19.43,-99.13], ['Séoul',37.57,126.98], ['Bangkok',13.76,100.50],
  ['Nairobi',-1.29,36.82], ['Berlin',52.52,13.40], ['Madrid',40.42,-3.70],
  ['Rome',41.90,12.50], ['Varsovie',52.23,21.01], ['Ankara',39.93,32.86],
  ['Riyad',24.71,46.68], ['Buenos Aires',-34.60,-58.38]
];

function fmtCoordsOf(r) {
  return Math.abs(r.lat).toFixed(2) + '° ' + (r.lat >= 0 ? 'N' : 'S') + ', ' +
         Math.abs(r.lon).toFixed(2) + '° ' + (r.lon >= 0 ? 'E' : 'O') + ' — ' + r.ville;
}

/* ============================================================================
   2. REPLI SANS 3D
   Si three.js ou WebGL manque, on n'affiche plus seulement un message d'erreur :
   toutes les rubriques sont rendues en document texte, dans l'ordre, avec les
   lectures longues dépliées. Le portfolio reste consultable et indexable.
   ========================================================================== */
function renderFallbackDoc(raison) {
  var el = document.getElementById('fatal');
  if (!el) return;
  el.innerHTML = '';
  el.className = 'doc';
  el.style.display = 'block';

  var note = document.createElement('p');
  note.className = 'note';
  note.textContent = raison + " Le globe interactif n'est pas affiché, mais l'intégralité du contenu figure ci-dessous.";
  el.appendChild(note);

  var h1 = document.createElement('h1');
  h1.textContent = 'Arthur Formentin';
  el.appendChild(h1);
  var sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'Administrateur réseau, spécialisé cybersécurité — Caen, mobilité Île-de-France.';
  el.appendChild(sub);

  RUBRIQUES.forEach(function (r) {
    var sec = document.createElement('section');
    var h2 = document.createElement('h2'); h2.textContent = r.nom; sec.appendChild(h2);
    var co = document.createElement('p'); co.className = 'coords';
    co.textContent = fmtCoordsOf(r); sec.appendChild(co);
    r.blocs.forEach(function (bl) {
      var art = document.createElement('article');
      var h3 = document.createElement('h3'); h3.textContent = bl.t; art.appendChild(h3);
      var p = document.createElement('p'); p.textContent = bl.p; art.appendChild(p);
      if (bl.long) {
        bl.long.forEach(function (par) {
          var lp = document.createElement('p'); lp.textContent = par; art.appendChild(lp);
        });
      }
      if (bl.d) {
        var d = document.createElement('p'); d.className = 'data';
        if (bl.html) d.innerHTML = bl.d; else d.textContent = bl.d;
        art.appendChild(d);
      }
      sec.appendChild(art);
    });
    // Repli texte : la rangée de liens clôt la rubrique qui les porte.
    if (r.sats) {
      var sw = document.createElement('div');
      sw.innerHTML = socialsHTML('row');
      sec.appendChild(sw.firstChild);
    }
    el.appendChild(sec);
  });

  // Plus rien à piloter : on rend le défilement de page au navigateur.
  document.body.style.overflow = 'auto';
  document.body.style.touchAction = 'auto';
  var dk = document.getElementById('dock'); if (dk) dk.style.display = 'none';
  var it = document.getElementById('intro'); if (it) it.style.display = 'none';
}
