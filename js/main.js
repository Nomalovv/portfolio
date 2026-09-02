/* ============================================================================
   AMORÇAGE, INTERACTIONS ET BOUCLE DE RENDU
   Dernier script chargé : il vérifie three.js, construit la scène puis
   l'interface, branche les entrées et lance la boucle.
   ========================================================================== */
'use strict';

var pointerInside = false;
var drag = false, lastX = 0, lastY = 0, moved = 0, downT = 0;
var introEl = null, brandEl = null;

function pickNode() {
  raycaster.setFromCamera(ndc, camera);
  var hits = raycaster.intersectObjects(hitMeshes, false);
  return hits.length ? hits[0].object.userData.index : -1;
}

// Un tap : ouverture d'une rubrique, ou fermeture si le clic tombe dans le vide
function handleTap() {
  if (state.pT < 0.55) { state.pT = 1; return; }
  var idx = pickNode();
  if (idx >= 0) openRubrique(idx);
  else if (state.active >= 0) closeRubrique();
}

function endDrag(e) {
  if (!drag) return;
  drag = false;
  var quick = performance.now() - downT < 420;
  if (moved < 8 && quick) handleTap();
}

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  var pr = Math.min(window.devicePixelRatio || 1, 2);
  var sc = (h * pr) / (2 * Math.tan(FOV * Math.PI / 360));
  if (dotsMat) dotsMat.uniforms.uScale.value = sc;
  if (secMat) secMat.uniforms.uScale.value = sc;
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  // Sphères de collision élargies au doigt sur petit écran
  var hs = isMobile() ? 1.9 : 1;
  for (var hi = 0; hi < hitMeshes.length; hi++) hitMeshes[hi].scale.setScalar(hs);
  if (state.active >= 0 && blocks.length) layoutBlocks(w / 2, h / 2);
}

/* Le message d'aide suit l'état réel de la page : ce qu'il faut faire
   maintenant, jamais une liste de gestes à retenir. La rotation et le clic
   sur le globe y sont présentés comme des options, pas comme le chemin. */
var HINTS = {
  intro: 'Cliquez une rubrique pour l\'ouvrir — <b>ou explorez le globe</b>',
  globe: 'Cliquez une rubrique, ou <b>faites glisser le globe</b> pour l\'orienter',
  open:  '<b>Échap</b> ferme la rubrique · une autre rubrique pour changer'
};
var hintKey = '';
function setHint(k) {
  if (k === hintKey) return;
  hintKey = k;
  elDockHint.innerHTML = HINTS[k];
}

function frame() {
  requestAnimationFrame(frame);
  var dt = Math.min(clock.getDelta(), 0.05);
  var t = clock.elapsedTime;

  /* --- interpolations continues : jamais de saut brutal --- */
  state.p += (state.pT - state.p) * 0.075;
  state.dim += (state.dimT - state.dim) * 0.08;
  state.camZ += (state.camZT - state.camZ) * ZOOM_EASE;
  camera.position.z = state.camZ;

  // Pendant une transition aimAt(), la rotation d'ambiance et le balancement
  // sont suspendus : ils déplacent la cible d'environ un cran par image, ce qui
  // au régime lent empêcherait la transition d'arriver.
  if (state.active < 0 && !drag && !state.aim) {
    state.rotYT += state.spin;
    if (!REDUCED) state.rotXT = 0.12 + Math.sin(t * 0.22) * 0.075;   // léger balancement
  }
  if (!drag) {
    state.rotYT += state.velY;
    state.rotXT = Math.max(-1.15, Math.min(1.15, state.rotXT + state.velX));
    state.velY *= 0.935; state.velX *= 0.935;                        // inertie qui retombe
    if (Math.abs(state.velY) < 1e-5) state.velY = 0;
    if (Math.abs(state.velX) < 1e-5) state.velX = 0;
  }
  // Transition de rubrique : régime lent. Geste direct : régime nerveux.
  var rotEase = state.aim ? AIM_ROT_EASE : ROT_EASE;
  state.rotY += (state.rotYT - state.rotY) * rotEase;
  state.rotX += (state.rotXT - state.rotX) * rotEase;
  if (state.aim &&
      Math.abs(state.rotYT - state.rotY) < 0.0015 &&
      Math.abs(state.rotXT - state.rotX) < 0.0015) {
    state.aim = 0;                                  // arrivé : on rend la main
  }
  globe.rotation.y = state.rotY;
  globe.rotation.x = state.rotX;

  /* --- mise en scène accueil -> plein écran --- */
  var p = state.p;
  var mob = isMobile();
  var sX = mob ? 0 : (1 - p) * 0.62;
  var sY = mob ? (1 - p) * 0.34 : (1 - p) * -0.06;
  var sc = 0.70 + p * 0.30;
  if (mob && state.active >= 0) { sY += 0.62; sc *= 0.78; }
  if (mob) {
    // Sur un écran étroit, le champ horizontal est bien plus serré que le
    // champ vertical : à l'échelle du bureau, le globe débordait des deux
    // côtés et ne se lisait plus comme un globe. On plafonne l'échelle pour
    // qu'il tienne dans la largeur, avec une marge.
    var extX = state.camZ * Math.tan(FOV * Math.PI / 360) * (window.innerWidth / window.innerHeight);
    sc = Math.min(sc, (extX * 0.88) / (R * 1.06));
  }
  stage.position.set(sX, sY, 0);
  stage.scale.setScalar(sc);
  atmo.position.copy(stage.position);
  atmo.scale.setScalar(sc);

  if (dotsMat) {
    dotsMat.uniforms.uTime.value = t;
    dotsMat.uniforms.uStage.value = sc;
    dotsMat.uniforms.uDim.value = state.dim;
  }
  if (secMat) {
    secMat.uniforms.uTime.value = t;
    secMat.uniforms.uStage.value = sc;
    secMat.uniforms.uDim.value = state.dim * 0.7;
  }

  var introVis = Math.max(0, 1 - p * 1.9);
  introEl.style.opacity = String(introVis);
  introEl.style.transform = 'translateY(' + (-p * 46).toFixed(1) + 'px)';
  // Une fois l'accueil effacé, ses commandes ne doivent plus être cliquables
  // ni atteignables au clavier (sinon Tab tombe sur un bouton invisible).
  introEl.style.visibility = introVis < 0.02 ? 'hidden' : 'visible';
  brandEl.style.opacity = p > 0.6 ? '1' : '0';
  setHint(state.active >= 0 ? 'open' : (p > 0.6 ? 'globe' : 'intro'));

  /* --- survol (raycaster sur les sphères de collision élargies) --- */
  if (state.focused >= 0) {
    state.hovered = state.focused;                 // le focus clavier prime sur la souris
  } else if (!mob && pointerInside && !drag && p > 0.5) {
    var h = pickNode();
    // un nœud dont la face est tournée vers l'arrière n'est pas survolable
    if (h >= 0 && nodes[h].facing < 0.02) h = -1;
    state.hovered = h;
  } else {
    state.hovered = -1;
  }
  canvas.style.cursor = state.hovered >= 0 ? 'pointer' : (drag ? 'grabbing' : 'grab');

  /* --- nœuds de rubrique --- */
  var mobK = mob ? 1.6 : 1;   // points agrandis au doigt sur petit écran
  // Les pancartes n'apparaissent qu'une fois la transition d'accueil engagée,
  // et s'effacent sur mobile dès que la feuille remontante occupe l'écran.
  var tagIntro = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  var tagsOff = mob && state.active >= 0;
  var tagGap = mob ? 20 : 25;
  centerW.copy(stage.position);
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var sp = projectNode(n);
    normal.copy(n.world).sub(centerW).normalize();
    toCam.copy(camera.position).sub(n.world).normalize();
    n.facing = normal.dot(toCam);
    var vis = Math.max(0, Math.min(1, (n.facing - 0.02) * 5));

    n.hoverT = (state.hovered === i || state.active === i) ? 1 : 0;
    n.hover += (n.hoverT - n.hover) * 0.14;

    var isActive = (state.active === i);
    var c = isActive ? COL.warm : COL.accent;
    n.halo.material.color.copy(c);
    n.core.material.color.set(isActive ? 0xffe9d2 : 0xffffff);

    var fade = vis * (state.active >= 0 && !isActive ? 0.30 : 1);
    n.core.scale.setScalar((0.030 + n.hover * 0.014) * (isActive ? 1.18 : 1) * mobK);
    n.core.material.opacity = fade;
    n.halo.scale.setScalar((0.105 + n.hover * 0.062) * mobK);
    n.halo.material.opacity = fade * (0.34 + n.hover * 0.40);

    for (var k = 0; k < n.rings.length; k++) {
      var rg = n.rings[k];
      rg.material.color.copy(c);
      if (REDUCED) {
        rg.scale.setScalar(0.20 * mobK); rg.material.opacity = fade * 0.16;
      } else {
        var tt = (t * 0.30 + rg.userData.ph + i * 0.13) % 1;
        rg.scale.setScalar((0.05 + tt * 0.19) * mobK);
        rg.material.opacity = fade * (1 - tt) * (1 - tt) * (0.30 + n.hover * 0.36) * (isActive ? 1.5 : 1);
      }
    }

    // Repère superposé : matérialise le nœud désigné depuis la barre de nœuds
    var btn = hitButtons[i];
    btn.style.left = sp.x + 'px';
    btn.style.top = sp.y + 'px';
    var spot = (state.focused === i) && vis > 0.2;
    if (spot !== (btn.className.indexOf('spot') > 0)) {
      btn.className = spot ? 'hit spot' : 'hit';
    }

    // Pancarte permanente : discrète au repos, plus lumineuse au survol/focus,
    // effacée avec la face arrière et masquée sur le nœud ouvert (le titre
    // ancré prend alors le relais).
    n.tagStack = 0;
    n.tagY = sp.y - tagGap - n.hover * 3;
    n.tagAlpha = tagsOff ? 0
      : vis * tagIntro * (0.58 + n.hover * 0.42) *
        (state.active < 0 ? 1 : (isActive ? 0 : 0.3));
  }

  /* --- pancartes : empilement vertical pour éviter les chevauchements --- */
  // Paris et Londres ne sont séparés que d'une vingtaine de pixels à l'écran :
  // les étiquettes en conflit sont repoussées vers le haut, de bas en haut.
  var tgOrder = [];
  for (var tgI = 0; tgI < nodes.length; tgI++) {
    if (nodes[tgI].tagAlpha > 0.012) tgOrder.push(nodes[tgI]);
  }
  tgOrder.sort(function (a, b) { return b.tagY - a.tagY; });
  var tgPlaced = [];
  for (var tgJ = 0; tgJ < tgOrder.length; tgJ++) {
    var tgN = tgOrder[tgJ];
    if (!tgN.tagW) { tgN.tagW = tgN.tag.offsetWidth; tgN.tagH = tgN.tag.offsetHeight; }
    var tgY = tgN.tagY;
    for (var tgP = 0; tgP < tgPlaced.length; tgP++) {
      var tgR = tgPlaced[tgP];
      if (Math.abs(tgN.screen.x - tgR.x) < (tgN.tagW + tgR.w) / 2 + 8) {
        tgY = Math.min(tgY, tgR.y - tgR.h - 6);
      }
    }
    tgPlaced.push({ x: tgN.screen.x, y: tgY, w: tgN.tagW, h: tgN.tagH });
    tgN.tagStack = tgY - tgN.tagY;
  }

  for (var tgK = 0; tgK < nodes.length; tgK++) {
    var tgE = nodes[tgK];
    tgE.tagDY += (tgE.tagStack - tgE.tagDY) * 0.18;   // décalage lissé, sans à-coup
    var tgEl = tgE.tag;
    tgEl.style.opacity = tgE.tagAlpha.toFixed(3);
    if (tgE.tagAlpha > 0.012) {
      tgEl.style.left = tgE.screen.x.toFixed(1) + 'px';
      tgEl.style.top = (tgE.tagY + tgE.tagDY).toFixed(1) + 'px';
      tgEl.style.transform = 'translate(-50%,-100%) scale(' + (1 + tgE.hover * 0.07).toFixed(3) + ')';
    }
    var tgHot = tgE.hover > 0.5 && tgE.tagAlpha > 0.2;
    if (tgHot !== tgE.tagHot) {
      tgE.tagHot = tgHot;
      if (tgHot) tgEl.classList.add('hot'); else tgEl.classList.remove('hot');
      tgE.tagW = 0;                                   // la taille change : à remesurer
    }
  }

  /* --- arcs : désaturation générale, illumination de ceux du nœud actif --- */
  for (var a = 0; a < arcs.length; a++) {
    var ar = arcs[a];
    var lit = (state.active >= 0 && ar.ends.length && (ar.ends[0] === state.active || ar.ends[1] === state.active));
    var target;
    if (state.active < 0) target = ar.base;
    else if (lit) target = ar.base * 2.6;
    else target = ar.base * 0.22;
    ar.mat.opacity += (target - ar.mat.opacity) * 0.09;
    if (lit) ar.mat.color.lerp(COL.warm, 0.06); else ar.mat.color.lerp(COL.line, 0.06);
  }

  /* --- impulsions le long des arcs --- */
  if (!REDUCED) {
    for (var q = 0; q < pulses.length; q++) {
      var pu = pulses[q];
      pu.t += pu.sp * dt;
      if (pu.t > 1) pu.t -= 1;
      var ac = arcs[pu.arc];
      ac.curve.getPoint(pu.t, tmpP);
      pulsePos[q * 3] = tmpP.x; pulsePos[q * 3 + 1] = tmpP.y; pulsePos[q * 3 + 2] = tmpP.z;
      // fondu aux deux extrémités de l'arc
      var f = Math.sin(pu.t * Math.PI);
      f = f * f;
      var glow = ac.main ? 1 : 0.4;
      var dimf = state.active >= 0 ? (ac.ends.length && (ac.ends[0] === state.active || ac.ends[1] === state.active) ? 1.5 : 0.2) : 1;
      var cc = (state.active >= 0 && dimf > 1) ? COL.warm : COL.accent;
      pulseCol[q * 3] = cc.r * f * glow * dimf;
      pulseCol[q * 3 + 1] = cc.g * f * glow * dimf;
      pulseCol[q * 3 + 2] = cc.b * f * glow * dimf;
    }
    pulseGeo.attributes.position.needsUpdate = true;
    pulseGeo.attributes.color.needsUpdate = true;
  }

  /* --- bokeh flottant --- */
  if (!REDUCED) {
    for (var bk = 0; bk < bokeh.length; bk++) {
      var s = bokeh[bk], u = s.userData;
      s.position.x = u.base.x + Math.sin(t * 0.13 + u.ph) * u.amp;
      s.position.y = u.base.y + Math.cos(t * 0.11 + u.ph * 1.7) * u.amp * 0.8;
    }
  }

  /* --- ancrage du contenu en orbite + lignes SVG --- */
  if (state.active >= 0 && blocks.length) {
    var an = nodes[state.active];
    var ax = an.screen.x, ay = an.screen.y;
    var behind = an.facing < 0.05;   // le nœud est passé derrière le globe

    elTitle.style.left = ax + 'px';
    elTitle.style.top = (ay - 46) + 'px';
    elCoords.style.left = ax + 'px';
    elCoords.style.top = (ay + 30) + 'px';
    elTitle.style.opacity = behind ? '0.25' : '1';
    elCoords.style.opacity = behind ? '0.25' : '1';

    var W = window.innerWidth, H = window.innerHeight - dockReserve();
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
      var lx = ax + b.offX - b.w / 2;
      var ly = ay + b.offY - b.h / 2;
      lx = Math.max(16, Math.min(W - b.w - 16, lx));
      ly = Math.max(16, Math.min(H - b.h - 16, ly));
      b.el.style.left = lx + 'px';
      b.el.style.top = ly + 'px';

      // Point d'accroche : bord du bloc le plus proche du nœud
      var cx = lx + b.w / 2, cy = ly + b.h / 2;
      var tx = Math.max(lx, Math.min(ax, lx + b.w));
      var ty = Math.max(ly, Math.min(ay, ly + b.h));
      if (Math.abs(ax - cx) > Math.abs(ay - cy)) tx = (ax < cx) ? lx : lx + b.w;
      else ty = (ay < cy) ? ly : ly + b.h;

      b.line.setAttribute('x1', ax); b.line.setAttribute('y1', ay);
      b.line.setAttribute('x2', tx); b.line.setAttribute('y2', ty);
      b.line.setAttribute('class', 'warm');
      b.line.style.opacity = behind ? '0' : '0.85';   // masqué si le nœud est caché
    }

    /* Satellites de liens : mêmes coordonnées d'ancrage que les cartes, mais
       aucune ligne de liaison et aucun cadre — ils flottent, c'est tout. On
       pose « left/top » et jamais « transform », que l'orbite occupe déjà. */
    if (sats.length) {
      for (var si = 0; si < sats.length; si++) {
        var sa = sats[si];
        var sx = Math.max(14, Math.min(W - 14 - satR * 2, ax + sa.offX - satR));
        var sy = Math.max(14, Math.min(H - 14 - satR * 2, ay + sa.offY - satR));
        sa.el.style.left = sx + 'px';
        sa.el.style.top = sy + 'px';
      }
      elSats.style.opacity = behind ? '0.3' : '1';
    }
  }

  renderer.render(scene, camera);
}

/* ============================================================================
   ENTRÉES : MOLETTE, GLISSER, CLAVIER, TACTILE
   ========================================================================== */
function initInteractions() {

  /* --- Molette : transition puis rotation ------------------------------ */
  // Tant que la transition n'est pas finie, la molette la pilote ; ensuite elle
  // fait tourner le globe. Un scroll soutenu vers le haut sert de porte de sortie.
  window.addEventListener('wheel', function (e) {
    if (document.getElementById('modal').classList.contains('on')) return;
    if (isMobile() && document.getElementById('sheet').classList.contains('on')) return;
    e.preventDefault();
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;              // lignes -> pixels
    if (state.pT < 0.999) {
      state.pT = Math.min(1, Math.max(0, state.pT + d / 900));
      state.upAccum = 0;
    } else {
      state.aim = 0;                             // geste direct : reprise du régime nerveux
      state.velY += d * 0.00022;
      if (state.active < 0) {
        if (d < 0) state.upAccum -= d; else state.upAccum = Math.max(0, state.upAccum - d * 0.6);
        if (state.upAccum > 520) { state.pT = 0; state.upAccum = 0; closeRubrique(); }
      }
    }
  }, { passive: false });

  canvas.addEventListener('pointerdown', function (e) {
    drag = true; moved = 0; downT = performance.now();
    lastX = e.clientX; lastY = e.clientY;
    state.velY = 0; state.velX = 0;
    state.aim = 0;                               // le doigt reprend la main sur la caméra
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
  });

  canvas.addEventListener('pointermove', function (e) {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    pointerInside = true;
    if (!drag) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    var k = 0.0052;
    state.rotYT += dx * k;
    state.rotXT = Math.max(-1.15, Math.min(1.15, state.rotXT - dy * k));
    state.velY = dx * k * 0.55;
    state.velX = -dy * k * 0.55;
    if (state.active >= 0 && moved > 26) closeRubrique();
  });

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function () { drag = false; });
  canvas.addEventListener('pointerleave', function () { pointerInside = false; });

  /* --- Clavier ---------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    var modal = document.getElementById('modal');
    if (e.key === 'Escape') {
      if (modal.classList.contains('on')) { closeModal(); return; }
      if (state.active >= 0) { closeRubrique(); return; }
      if (state.pT > 0.5) { state.pT = 0; return; }
    }
    if (e.key === 'ArrowLeft')  { state.pT = 1; state.rotYT -= 0.22; state.aim = 0; }
    if (e.key === 'ArrowRight') { state.pT = 1; state.rotYT += 0.22; state.aim = 0; }
  });

  /* Entrée dans le globe : bouton explicite de l'accueil. Le scroll et le
     balayage restent disponibles, mais ne sont plus le seul chemin. */
  document.getElementById('enter').addEventListener('click', function () {
    state.pT = 1;
    announce('Globe interactif affiché. ' + RUBRIQUES.length + ' rubriques disponibles dans la barre de navigation.');
  });

  /* Tactile : un balayage vertical dans l'accueil déclenche la transition.
     Les balayages qui partent d'un élément d'interface (barre de nœuds, bouton
     d'entrée) sont ignorés, sinon un simple appui un peu glissé sur une entrée
     ferait sauter la mise en scène. */
  var tY = 0, tSkip = false;
  window.addEventListener('touchstart', function (e) {
    if (!e.touches.length) return;
    tY = e.touches[0].clientY;
    var t = e.target;
    tSkip = !!(t && t.closest && (t.closest('#dock') || t.closest('#enter') || t.closest('#sheet')));
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!e.touches.length || tSkip) return;
    if (elSheet.classList.contains('on') || elModal.classList.contains('on')) return;
    var d = tY - e.touches[0].clientY;
    tY = e.touches[0].clientY;
    if (state.pT < 0.999) state.pT = Math.min(1, Math.max(0, state.pT + d / 420));
  }, { passive: true });
}

/* ============================================================================
   AMORÇAGE
   ========================================================================== */
function bootPortfolio() {
  // Sans three.js (hors ligne, CDN bloqué), le contenu reste lisible en texte.
  if (typeof THREE === 'undefined') {
    renderFallbackDoc("La bibliothèque 3D n'a pas pu être chargée (accès au CDN three.js indisponible).");
    return;
  }
  // initGlobe() rend lui-même le repli texte si WebGL est indisponible.
  if (!initGlobe()) return;

  initUI();
  initInteractions();

  introEl = document.getElementById('intro');
  brandEl = document.getElementById('brand');

  window.addEventListener('resize', resize);
  resize();
  setHint('intro');
  frame();
}

// Aucune erreur d'initialisation ne doit laisser un écran vide.
try {
  bootPortfolio();
} catch (err) {
  if (window.console) console.error(err);
  var fatal = document.getElementById('fatal');
  if (fatal) fatal.style.display = 'flex';
}
