/* ============================================================================
   INTERFACE : BARRE DE NŒUDS, CARTES EN ORBITE, SATELLITES DE LIENS,
   MODALE, FEUILLE MOBILE
   Le câblage du DOM se fait dans initUI(), appelée par js/main.js APRÈS
   initGlobe() : les pancartes se rangent dans les nœuds de la scène.
   ========================================================================== */
'use strict';

/* Éléments du document, renseignés par initUI(). */
var orbit = null, svg = null;
var elTitle = null, elTitleH = null, elCoords = null, elTags = null;
var elSheet = null, elModal = null, elHits = null, elSats = null;
var elDock = null, elDockRail = null, elDockHint = null;
var hitButtons = null;             // repères superposés aux nœuds 3D
var navNodes = [];                 // entrées de la barre de nœuds

var blocks = [];       // { el, line, offX, offY, w, h }
var sats = [];         // { el, offX, offY } — satellites de liens, hors cartes

var fmtCoords = fmtCoordsOf;

/* Le focus arrive aussi bien par Tab que par un clic. On distingue les deux :
   au clavier, l'entrée survolée fait tourner le globe vers son nœud (sinon un
   nœud passé derrière la Terre ne donne aucun retour visible) ; à la souris,
   le globe ne bouge pas tant qu'on n'a pas cliqué. */
var kbNav = false;

var modalReturn = null;   // élément à re-focaliser à la fermeture de la modale

/* ============================================================================
   1. CÂBLAGE DU DOCUMENT
   ========================================================================== */
function initUI() {

  orbit = document.getElementById('orbit');
  svg = document.getElementById('links');
  elTitle = document.getElementById('anchor-title');
  elTitleH = elTitle.querySelector('h2');
  elCoords = document.getElementById('anchor-coords');
  elTags = document.getElementById('tags');
  elSheet = document.getElementById('sheet');
  elModal = document.getElementById('modal');
  elHits = document.getElementById('hits');
  elSats = document.getElementById('sats');

  /* --- 1.1 Repères superposés aux nœuds 3D ---------------------------------
     Anciennement des boutons focusables : c'était le seul accès clavier, mais
     ils étaient invisibles, donc indécouvrables. Ils ne sont plus que des
     marqueurs (retirés de l'ordre de tabulation et de l'arbre d'accessibilité) ;
     la barre de nœuds ci-dessous porte désormais la navigation. */
  RUBRIQUES.forEach(function () {
    var b = document.createElement('div');
    b.className = 'hit';
    elHits.appendChild(b);
  });
  hitButtons = elHits.querySelectorAll('.hit');

  /* --- 1.2 Barre de nœuds (navigation principale) ------------------------
     Toujours à l'écran, dès l'accueil. Un clic amène le globe sur la capitale
     correspondante ET ouvre la rubrique : aucune manipulation de caméra n'est
     requise pour atteindre le contenu. Le survol/focus d'une entrée illumine
     le nœud 3D correspondant, ce qui relie explicitement la liste et le globe. */
  elDock = document.getElementById('dock');
  elDockRail = elDock.querySelector('.rail');
  elDockHint = document.getElementById('dockhint');

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) kbNav = true;
  }, true);
  window.addEventListener('pointerdown', function () { kbNav = false; }, true);

  RUBRIQUES.forEach(function (r, i) {
    var b = document.createElement('button');
    b.className = 'navnode';
    b.type = 'button';
    b.setAttribute('aria-label', r.nom + ' — rubrique ' + (i + 1) + ' sur ' + RUBRIQUES.length);

    var lbl = document.createElement('span'); lbl.className = 'lbl';
    var pip = document.createElement('i'); pip.className = 'pip'; pip.setAttribute('aria-hidden', 'true');
    lbl.appendChild(pip);
    lbl.appendChild(document.createTextNode(r.nom));

    /* Deuxième ligne : rang dans la liste, plus le nom de la capitale.
       La capitale ne sert qu'au placement du nœud sur le globe et n'apprend
       rien sur la rubrique ; en la remplaçant par « rang / total » la ligne
       garde son allure de ligne de données, reste en monospace, et devient
       une information de repérage réellement utile maintenant qu'il y a sept
       entrées. Le nom du lieu reste sur la pancarte du globe, où il a un sens. */
    var loc = document.createElement('span'); loc.className = 'loc';
    loc.setAttribute('aria-hidden', 'true');
    loc.textContent = ('0' + (i + 1)).slice(-2) + ' / ' + ('0' + RUBRIQUES.length).slice(-2);

    b.appendChild(lbl); b.appendChild(loc);

    // Un second clic referme : l'entrée se comporte comme un interrupteur.
    b.addEventListener('click', function () {
      state.pT = 1;
      if (state.active === i) { closeRubrique(); announce('Rubrique fermée.'); }
      else openRubrique(i);
    });
    function spotOn()  { state.focused = i; }
    function spotOff() { if (state.focused === i) state.focused = -1; }
    b.addEventListener('mouseenter', spotOn);
    b.addEventListener('mouseleave', spotOff);
    b.addEventListener('focus', function () {
      spotOn();
      // Parcours au clavier, globe déjà à l'écran, rien d'ouvert : on amène le
      // nœud désigné face à la caméra. Tab devient une visite du globe.
      if (kbNav && state.active < 0 && state.p > 0.6) aimAt(nodes[i].local);
    });
    b.addEventListener('blur', spotOff);

    elDockRail.appendChild(b);
    navNodes.push(b);
  });

  syncDock();

  // La barre n'apparaît qu'une fois la page prête, sans à-coup au chargement.
  setTimeout(function () { elDock.classList.add('ready'); }, REDUCED ? 0 : 420);

  /* --- 1.3 Pancartes permanentes -------------------------------------------
     Une étiquette par rubrique, ancrée juste au-dessus du point et repositionnée
     à chaque image. Purement décorative pour les lecteurs d'écran (#tags est
     aria-hidden) : le nom est déjà porté par l'entrée de la barre de nœuds. */
  RUBRIQUES.forEach(function (r, i) {
    var el = document.createElement('div');
    el.className = 'tag';
    var nm = document.createElement('span'); nm.className = 'n'; nm.textContent = r.nom;
    var vl = document.createElement('span'); vl.className = 'c'; vl.textContent = r.ville;
    el.appendChild(nm); el.appendChild(vl);
    elTags.appendChild(el);
    nodes[i].tag = el;
  });

  elModal.querySelector('.x').addEventListener('click', closeModal);
  elModal.addEventListener('click', function (e) { if (e.target === elModal) closeModal(); });

  // Piège à focus : tant que la modale est ouverte, Tab reste à l'intérieur.
  elModal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !elModal.classList.contains('on')) return;
    var f = elModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* Croix de fermeture de la rubrique. */
  document.getElementById('close').addEventListener('click', closeRubrique);
}

function announce(msg) {
  var lv = document.getElementById('live');
  if (lv) lv.textContent = msg;
}

function syncDock() {
  for (var i = 0; i < navNodes.length; i++) {
    if (state.active === i) navNodes[i].setAttribute('aria-current', 'true');
    else navNodes[i].removeAttribute('aria-current');
  }
}

/* --- 3. Modale de lecture longue -------------------------------------------- */
function openModal(rub, bloc) {
  modalReturn = document.activeElement;
  elModal.querySelector('#modal-title').textContent = bloc.t;
  elModal.querySelector('.kicker').textContent = rub.nom + ' · ' + fmtCoords(rub);
  var body = elModal.querySelector('.body');
  body.innerHTML = '';
  bloc.long.forEach(function (par) {
    var p = document.createElement('p'); p.textContent = par; body.appendChild(p);
  });
  elModal.classList.add('on');
  elModal.setAttribute('aria-hidden', 'false');
  elModal.querySelector('.x').focus();
}
function closeModal() {
  if (!elModal.classList.contains('on')) return;
  elModal.classList.remove('on');
  elModal.setAttribute('aria-hidden', 'true');
  if (modalReturn && document.body.contains(modalReturn)) { try { modalReturn.focus(); } catch (e) {} }
  modalReturn = null;
}

/* --- 4. Anti-chevauchement ---------------------------------------------- */
function overlapArea(a, b) {
  var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (ox > 0 && oy > 0) ? ox * oy : 0;
}

// Hauteur réservée en bas de l'écran par la barre de nœuds : les cartes de
// contenu ne doivent jamais venir se poser dessus.
function dockReserve() {
  if (isMobile() || !elDock) return 0;
  var h = elDock.offsetHeight || 0;
  return h ? h + 30 : 0;
}

/* Place les cartes autour du point projeté. Recalculé à l'ouverture et au
   redimensionnement.

   L'ancienne version cherchait, pour chaque carte, la meilleure place sur une
   ellipse de 16 directions × 4 rayons, en notant bords et recouvrements. Sur
   un écran large elle tombait juste ; sur un portable étroit (1024×700,
   1152×720) aucun de ces 64 points n'était libre, elle rendait alors le
   « moins mauvais » — une carte qui débordait en haut. La boucle de rendu la
   ramenait de force dans l'écran, et deux cartes finissaient par se toucher.

   Le résultat visé était de toute façon toujours le même : deux piles, à
   gauche et à droite du nœud. On le construit donc directement, ce qui rend
   le chevauchement impossible tant que la place existe. */
function layoutBlocks(px, py) {
  var W = window.innerWidth, H = window.innerHeight, M = 22;
  var HB = H - dockReserve();          // bord bas utile (la barre de nœuds est sous cette ligne)
  var GAP = 18;                        // gouttière entre deux cartes
  var RES = 178;                       // demi-largeur réservée au nœud, à son titre et à ses coordonnées
  var avail = HB - M * 2;
  var i, b;

  for (i = 0; i < blocks.length; i++) {
    b = blocks[i];
    b.w = b.el.offsetWidth; b.h = b.el.offsetHeight;
  }

  // Répartition en deux colonnes. On alterne d'abord (gauche, droite, gauche…)
  // pour que l'ordre de lecture à l'écran suive l'ordre du contenu ; si une
  // pile est alors trop haute pour l'écran, on repasse à une répartition qui
  // équilibre les hauteurs.
  function split(balanced) {
    var c = [{ items: [], total: 0, w: 0 }, { items: [], total: 0, w: 0 }];
    for (var k = 0; k < blocks.length; k++) {
      var bk = blocks[k];
      var t = balanced ? (c[0].total <= c[1].total ? c[0] : c[1]) : c[k % 2];
      if (t.items.length) t.total += GAP;
      t.items.push(bk);
      t.total += bk.h;
      t.w = Math.max(t.w, bk.w);
    }
    return c;
  }
  var cols = split(false);
  if (cols[0].total > avail || cols[1].total > avail) {
    var alt = split(true);
    if (Math.max(alt[0].total, alt[1].total) < Math.max(cols[0].total, cols[1].total)) cols = alt;
  }

  // Bande centrale réellement libre de part et d'autre du nœud, mesurée après
  // coup : c'est là que flottent les satellites de liens, et sur un écran
  // étroit les colonnes de cartes viennent y mordre.
  var bandL = px - M, bandR = W - M - px;

  for (var ci = 0; ci < 2; ci++) {
    var col = cols[ci];
    if (!col.items.length) continue;

    // Colonne collée à la zone réservée, puis ramenée dans l'écran.
    var x = (ci === 0) ? (px - RES - GAP - col.w) : (px + RES + GAP);
    x = Math.max(M, Math.min(W - M - col.w, x));
    if (ci === 0) bandL = Math.min(bandL, px - (x + col.w));
    else bandR = Math.min(bandR, x - px);

    // Dernier recours quand la pile dépasse quand même : on resserre la
    // gouttière plutôt que de laisser une carte sortir de l'écran.
    var gap = GAP, total = col.total;
    if (total > avail && col.items.length > 1) {
      gap = Math.max(4, GAP - (total - avail) / (col.items.length - 1));
      total = 0;
      for (i = 0; i < col.items.length; i++) total += col.items[i].h + (i ? gap : 0);
    }

    var y = Math.min(py - total / 2, HB - M - total);   // pile centrée sur le nœud
    if (y < M) y = M;

    for (i = 0; i < col.items.length; i++) {
      b = col.items[i];
      b.offX = x + (col.w - b.w) / 2 + b.w / 2 - px;
      b.offY = y + b.h / 2 - py;
      y += b.h + gap;
    }
  }

  layoutSats(px, py, bandL, bandR, HB, M);
}

/* Place les satellites de liens autour du nœud, dans la bande centrale que
   les cartes laissent libre. Ils ne sont pas rangés dans une boîte : chacun
   reçoit un décalage en pixels par rapport au nœud, la boucle de rendu le
   suit ensuite comme elle suit les cartes.

   Composition visée : un triangle autour du point d'ancrage — deux satellites
   qui encadrent le titre de la rubrique, un troisième qui descend sous les
   coordonnées. Si l'écran est trop étroit pour que ce triangle passe entre
   les deux colonnes de cartes, les trois descendent en chapelet sous le nœud
   plutôt que d'aller heurter une carte. */
var SAT_FULL = 34;       // demi-côté d'un satellite à pleine taille (68 px)
var SAT_TIGHT = 26;      // demi-côté au palier resserré (52 px)
var satR = SAT_FULL;     // rayon courant, relu par la boucle de rendu
function layoutSats(px, py, bandL, bandR, HB, M) {
  if (!sats.length) return;
  // Bande centrale libre, moins la respiration gardée avec les cartes.
  var room = Math.min(bandL, bandR) - 10;
  var tight = room - SAT_FULL < 100;             // la bande les prend-elle en grand ?
  var r = tight ? SAT_TIGHT : SAT_FULL;
  var off, step;

  if (room - r >= 100) {
    // Composition visée : le triangle. Deux satellites encadrent le titre de
    // la rubrique, le troisième descend sous les coordonnées.
    var dx = Math.min(162, room - r);
    var down = Math.max(r + 66, Math.min(132, HB - 16 - r - py));
    off = [[-dx, -78], [dx, -78], [0, down]];
  } else {
    // Bande centrale mangée par les cartes : les trois s'alignent dans l'axe
    // du nœud plutôt que d'aller en heurter une. Toujours resserrés — s'il n'y
    // avait pas la largeur, il n'y a pas non plus la hauteur en grande taille.
    // Le pas reste plus grand qu'un satellite, sinon ils se recouvriraient.
    tight = true; r = SAT_TIGHT;
    var below = (HB - 16 - r - (py + 84)) / 2;   // pas disponible vers le bas
    if (below >= r * 2 + 6) {
      step = Math.min(r * 2 + 14, below);
      off = [[0, 84], [0, 84 + step], [0, 84 + step * 2]];
    } else {
      // Vers le haut : au-dessus du titre l'espace reste libre en toute
      // circonstance, les cartes étant rangées de part et d'autre du nœud.
      step = Math.max(r * 2 + 6, Math.min(r * 2 + 14, (py - 16 - r - 94) / 2));
      off = [[0, -94], [0, -94 - step], [0, -94 - step * 2]];
    }
  }

  satR = r;
  elSats.classList.toggle('tight', tight);
  for (var k = 0; k < sats.length; k++) {
    var o = off[k % off.length];
    sats[k].offX = o[0];
    sats[k].offY = o[1];
  }
}

/* --- 5. Ouverture d'une rubrique ---------------------------------------- */
function clearBlocks() {
  blocks.forEach(function (b) { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); });
  blocks = [];
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

/* Satellites de liens : le calque est vidé entre deux rubriques, il ne reste
   donc jamais de lien focusable pour une rubrique qui n'est plus affichée. */
function clearSats() {
  sats = [];
  elSats.innerHTML = '';
  elSats.style.opacity = '0';
  elSats.classList.remove('tight');
  satR = SAT_FULL;
}

function buildSats(r) {
  clearSats();
  if (!r.sats || isMobile()) return;
  elSats.innerHTML = socialsHTML('field');
  var orbs = elSats.querySelectorAll('.orb');
  for (var i = 0; i < orbs.length; i++) sats.push({ el: orbs[i], offX: 0, offY: 0 });
}

function openRubrique(idx) {
  if (state.active === idx) return;
  var r = RUBRIQUES[idx];
  state.active = idx;
  state.dimT = 1;
  state.camZT = isMobile() ? 3.70 : 3.15;
  state.spin = 0;
  aimAt(nodes[idx].local);
  document.body.classList.add('open');
  syncDock();
  announce(r.nom + ' — ' + r.ville + '. ' + r.blocs.length + ' fiches affichées.');

  clearBlocks();
  clearSats();

  if (isMobile()) {
    buildSheet(r);
    return;
  }

  elTitleH.textContent = r.nom;
  elCoords.textContent = fmtCoords(r);
  elTitle.style.opacity = '1';
  elCoords.style.opacity = '1';

  r.blocs.forEach(function (bl, i) {
    var el = document.createElement('article');
    el.className = 'block';
    var h = document.createElement('h3'); h.textContent = bl.t; el.appendChild(h);
    var p = document.createElement('p'); p.textContent = bl.p; el.appendChild(p);
    if (bl.d) {
      var d = document.createElement('div'); d.className = 'data';
      if (bl.html) d.innerHTML = bl.d; else d.textContent = bl.d;
      el.appendChild(d);
    }
    if (bl.long) {
      var m = document.createElement('button');
      m.className = 'more'; m.type = 'button'; m.textContent = 'Voir en détail';
      m.addEventListener('click', function (e) { e.stopPropagation(); openModal(r, bl); });
      el.appendChild(m);
    }
    el.style.transitionDelay = (REDUCED ? 0 : i * 120) + 'ms';
    orbit.appendChild(el);

    var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    svg.appendChild(ln);

    blocks.push({ el: el, line: ln, offX: 0, offY: 0, w: 288, h: 120 });
  });

  // Satellites de liens de la rubrique, s'il y en a : bâtis avant le placement,
  // qui leur cherche une place dans la bande laissée libre par les cartes.
  buildSats(r);

  // Le nœud actif finit toujours face caméra, donc au centre de l'écran :
  // on place les blocs autour de ce point d'arrivée, pas de sa position actuelle.
  layoutBlocks(window.innerWidth / 2, window.innerHeight / 2);
  requestAnimationFrame(function () {
    blocks.forEach(function (b) { b.el.classList.add('in'); });
  });
}

function closeRubrique() {
  if (state.active < 0) return;
  var was = state.active;
  state.active = -1;
  state.dimT = 0;
  state.camZT = 3.55;
  state.spin = REDUCED ? 0 : 0.00095;
  document.body.classList.remove('open');
  syncDock();
  // Le focus ne doit pas rester sur un bouton qui vient de disparaître :
  // on le rend à l'entrée de la barre correspondante.
  var ae = document.activeElement;
  if (ae && ae !== document.body && !elDock.contains(ae) &&
      (ae.id === 'close' || ae.className === 'more' || ae.className === 'backglobe' ||
       elSats.contains(ae))) {
    try { navNodes[was].focus(); } catch (e) {}
  }
  elTitle.style.opacity = '0';
  elCoords.style.opacity = '0';
  elSheet.classList.remove('on');
  closeModal();
  blocks.forEach(function (b) { b.el.classList.remove('in'); b.el.style.transitionDelay = '0ms'; });
  // Les satellites s'éteignent avec les cartes, puis quittent l'arbre : le
  // calque ne doit pas garder de lien atteignable au clavier une fois fermé.
  elSats.style.opacity = '0';
  sats = [];
  var old = blocks.slice();
  setTimeout(function () {
    old.forEach(function (b) {
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
      if (b.line.parentNode) b.line.parentNode.removeChild(b.line);
    });
    if (state.active < 0) elSats.innerHTML = '';
  }, 400);
  blocks = [];
}


/* --- 6. Feuille mobile --------------------------------------------------- */
function buildSheet(r) {
  elSheet.innerHTML = '';
  var grab = document.createElement('div'); grab.className = 'grab'; elSheet.appendChild(grab);
  var h2 = document.createElement('h2'); h2.textContent = r.nom; elSheet.appendChild(h2);
  var co = document.createElement('div'); co.className = 'coords'; co.textContent = fmtCoords(r); elSheet.appendChild(co);
  r.blocs.forEach(function (bl) {
    var c = document.createElement('div'); c.className = 'card';
    var h3 = document.createElement('h3'); h3.textContent = bl.t; c.appendChild(h3);
    var p = document.createElement('p'); p.textContent = bl.p; c.appendChild(p);
    if (bl.d) {
      var d = document.createElement('div'); d.className = 'data';
      if (bl.html) d.innerHTML = bl.d; else d.textContent = bl.d;
      c.appendChild(d);
    }
    if (bl.long) {
      var m = document.createElement('button'); m.className = 'more'; m.type = 'button';
      m.textContent = 'Voir en détail';
      m.addEventListener('click', function () { openModal(r, bl); });
      c.appendChild(m);
    }
    elSheet.appendChild(c);
  });
  // Satellites de liens : en portrait il n'y a pas d'espace libre autour du
  // nœud, ils reviennent donc en rangée au bas de la rubrique — posés à même
  // la feuille, hors de toute carte, comme sur le globe.
  if (r.sats) {
    var sr = document.createElement('div');
    sr.innerHTML = socialsHTML('row');
    elSheet.appendChild(sr.firstChild);
  }
  // Sortie explicite en bas de feuille : sur mobile la croix en haut à droite
  // est hors du pouce, et la barre de nœuds est masquée pendant la lecture.
  var row = document.createElement('div'); row.className = 'close-row';
  var back = document.createElement('button');
  back.className = 'backglobe'; back.type = 'button';
  back.textContent = 'Revenir au globe';
  back.addEventListener('click', closeRubrique);
  row.appendChild(back); elSheet.appendChild(row);
  elSheet.classList.add('on');
}
