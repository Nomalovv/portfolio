/* ============================================================================
   SCÈNE 3D : GLOBE, NŒUDS, ARCS, IMPULSIONS
   Tout ce qui a besoin de three.js est construit par initGlobe(), appelée
   par js/main.js une fois la bibliothèque vérifiée présente. Les objets
   partagés avec l'interface et la boucle de rendu sont déclarés ici.
   ========================================================================== */
'use strict';

/* Couleurs 3D : à modifier en même temps que la palette CSS de css/style.css. */
var COL = null;

/* Objets de scène, relus par js/ui.js et par la boucle de rendu de js/main.js. */
var canvas = null, renderer = null, scene = null, camera = null;
var FOV = 42;
var stage = null;                  // porte l'échelle + le décalage (accueil <-> plein écran)
var globe = null;                  // porte la rotation
var R = 1;                         // rayon du globe
var dotsMat = null, dotsPts = null, dotCount = 0;
var inner = null, atmo = null;
var bokeh = [];
var nodes = [];                    // un par rubrique
var hitMeshes = [];                // sphères de collision invisibles
var secMat = null;
var arcs = [];
var pulses = [];
var pulseGeo = null, pulsePos = null, pulseCol = null;
var clock = null, raycaster = null, ndc = null;
var tmpV = null, normal = null, toCam = null, centerW = null, tmpP = null;

/* ============================================================================
   1. ÉTAT D'INTERACTION
   ========================================================================== */
var state = {
  p: 0, pT: 0,             // progression accueil -> plein écran
  rotY: 0.35, rotYT: 0.35,
  rotX: 0.12, rotXT: 0.12,
  velY: 0, velX: 0,
  spin: REDUCED ? 0 : 0.00095,
  camZ: 3.55, camZT: 3.55,
  active: -1,
  hovered: -1,
  focused: -1,
  dim: 0, dimT: 0,
  upAccum: 0
};

/* ============================================================================
   2. CONSTRUCTION DE LA SCÈNE
   Renvoie false (après avoir affiché le repli texte) si WebGL est absent.
   ========================================================================== */
function initGlobe() {

  COL = {
    dot:      new THREE.Color('#2f9fd4'),
    dotLit:   new THREE.Color('#7fe3ff'),
    accent:   new THREE.Color('#00d4ff'),
    line:     new THREE.Color('#8fc7e8'),
    warm:     new THREE.Color('#ff9d4d')
  };

  canvas = document.getElementById('scene');
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    renderFallbackDoc('WebGL est indisponible ou désactivé dans ce navigateur.');
    return false;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // plafonné à 2
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Textures générées (elles ont besoin de three.js, donc pas avant ici).
  buildTextures();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3.55);

  stage = new THREE.Group();     // porte l'échelle + le décalage (accueil <-> plein écran)
  globe = new THREE.Group();     // porte la rotation
  stage.add(globe);
  scene.add(stage);


  /* --- 2.1 Points de terre : UN SEUL THREE.Points --------------------------- */

  function buildDots() {
    var img = buildWorldMap();
    var data = img.data;
    var STEP = 1.0;                 // pas d'échantillonnage en degrés (~12 000 points)
    var pos = [], col = [], siz = [], pha = [], twk = [];
    var c = new THREE.Color();

    for (var lat = -89; lat <= 89; lat += STEP) {
      // Le nombre de points en longitude suit cos(lat) : sinon tout s'agglutine aux pôles
      var ring = Math.max(6, Math.round((360 / STEP) * Math.cos(lat * Math.PI / 180)));
      for (var i = 0; i < ring; i++) {
        var lon = -180 + (360 * i) / ring;
        var x = Math.floor((lon + 180) / 360 * MAP_W);
        var y = Math.floor((90 - lat) / 180 * MAP_H);
        if (x < 0) x = 0; if (x >= MAP_W) x = MAP_W - 1;
        if (y < 0) y = 0; if (y >= MAP_H) y = MAP_H - 1;
        var lum = data[(y * MAP_W + x) * 4];       // canal rouge suffit (carte N&B)
        if (lum < 110) continue;                   // seuil : sous ce niveau, c'est l'océan

        var v = latLonToVec3(lat, lon, R);
        pos.push(v.x, v.y, v.z);

        // Variation douce de teinte : quelques points « éclairés » cassent la grille
        c.copy(Math.random() < 0.08 ? COL.dotLit : COL.dot);
        var k = 0.86 + Math.random() * 0.42;
        col.push(c.r * k, c.g * k, c.b * k);

        siz.push(0.0086 + Math.random() * 0.0042);
        pha.push(Math.random());
        twk.push(Math.random() < 0.025 ? 1 : 0);   // 2,5 % des points scintillent
      }
    }

    dotCount = siz.length;
    if (dotCount < 500) throw new Error('échantillonnage insuffisant');

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(pha, 1));
    geo.setAttribute('aTw', new THREE.Float32BufferAttribute(twk, 1));

    dotsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uScale: { value: 900 },
        uStage: { value: 1 },
        uDim:   { value: 0 },
        uMap:   { value: TEX_DOT }
      },
      vertexShader: [
        'attribute float aSize;',
        'attribute vec3 aColor;',
        'attribute float aPhase;',
        'attribute float aTw;',
        'uniform float uTime; uniform float uScale; uniform float uStage; uniform float uDim;',
        'varying vec3 vColor; varying float vAlpha;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  float tw = 1.0 + aTw * 0.7 * sin(uTime * 1.1 + aPhase * 6.2831);',
        '  gl_PointSize = max(1.0, aSize * uStage * tw * uScale / max(0.05, -mv.z));',
        '  vColor = mix(aColor, vec3(0.055,0.115,0.165), uDim * 0.75);',
        '  vAlpha = clamp(mix(1.0, 0.34, uDim) * (0.80 + 0.28 * tw), 0.0, 1.4);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uMap;',
        'varying vec3 vColor; varying float vAlpha;',
        'void main(){',
        '  float a = texture2D(uMap, gl_PointCoord).a;',
        '  if (a < 0.02) discard;',
        '  gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });

    dotsPts = new THREE.Points(geo, dotsMat);
    dotsPts.frustumCulled = false;
    globe.add(dotsPts);
  }

  try {
    buildDots();
  } catch (err) {
    // Repli obligatoire : sphère wireframe discrète plutôt qu'un écran vide
    var wf = new THREE.Mesh(
      new THREE.SphereGeometry(R, 36, 24),
      new THREE.MeshBasicMaterial({ color: 0x2f9fd4, wireframe: true, transparent: true, opacity: 0.16 })
    );
    globe.add(wf);
    if (window.console) console.warn('Génération des points impossible, repli wireframe.', err);
  }

  /* --- 2.2 Sphère intérieure opaque (masque la face arrière) ----------------- */
  inner = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.9935, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x03080f })
  );
  inner.renderOrder = -1;
  globe.add(inner);

  /* --- 2.3 Halo atmosphérique (Fresnel, BackSide) --------------------------- */
  atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.14, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#2b8fd0') }, uStr: { value: 0.30 } },
      vertexShader: [
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  vP = mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uStr;',
        'varying vec3 vN; varying vec3 vP;',
        'void main(){',
        // f = 0 au centre du disque, 1 au bord géométrique de la coque.
        '  float f = 1.0 - abs(dot(normalize(vN), normalize(-vP)));',
        // Bande douce : culmine juste au-delà de la silhouette du globe puis
        // retombe à zéro AVANT le bord de la coque (sinon liseré à bord franc).
        '  float rim = smoothstep(0.30, 0.62, f) * (1.0 - smoothstep(0.62, 0.96, f));',
        '  rim *= uStr;',
        '  gl_FragColor = vec4(uColor * rim, rim);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(atmo);
  atmo.position.copy(stage.position);

  /* --- 2.4 Maillage réseau flottant (texture d'arrière-plan discrète) ------- */
  (function buildMesh() {
    var N = 92, nodes = [];
    for (var i = 0; i < N; i++) {                     // répartition de Fibonacci
      var y = 1 - (i / (N - 1)) * 2;
      var rad = Math.sqrt(Math.max(0, 1 - y * y));
      var th = i * Math.PI * (3 - Math.sqrt(5));
      nodes.push(new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(R * 1.045));
    }
    var seg = [];
    for (var a = 0; a < N; a++) {
      var order = [];
      for (var b = 0; b < N; b++) if (b !== a) order.push([nodes[a].distanceTo(nodes[b]), b]);
      order.sort(function (m, n) { return m[0] - n[0]; });
      for (var k = 0; k < 2; k++) {
        var t = nodes[order[k][1]];
        seg.push(nodes[a].x, nodes[a].y, nodes[a].z, t.x, t.y, t.z);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    globe.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x8fc7e8, transparent: true, opacity: 0.032, depthWrite: false, blending: THREE.AdditiveBlending
    })));
  })();

  /* --- 2.5 Bokeh hors-focus ------------------------------------------------- */
  (function buildBokeh() {
    // Repoussés vers la périphérie : au centre ils voileraient la carte de points
    var defs = [
      [-1.72, 0.88, 2.05, 0.85, 0], [1.66, -0.78, 1.95, 0.70, 0], [-1.15, -1.25, 2.25, 0.55, 0],
      [1.88, 1.05, 1.80, 0.62, 1], [-2.05, -0.45, 2.35, 0.95, 1], [0.85, 1.45, 2.15, 0.48, 1],
      [0.35, -1.62, 2.30, 0.72, 0]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var m = new THREE.SpriteMaterial({
        map: TEX_BOKEH,
        color: d[4] ? COL.warm.clone() : new THREE.Color('#3fa8e0'),
        transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: d[4] ? 0.055 : 0.038
      });
      var s = new THREE.Sprite(m);
      s.position.set(d[0], d[1], d[2]);
      s.scale.setScalar(d[3]);
      s.userData = { base: s.position.clone(), ph: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.06 };
      s.renderOrder = 5;
      scene.add(s);
      bokeh.push(s);
    }
  })();

  /* ============================================================================
     5. NŒUDS ET ARCS
     ========================================================================== */

  var hitGeo = new THREE.SphereGeometry(0.085, 10, 8);
  var hitMat = new THREE.MeshBasicMaterial({ visible: false });

  RUBRIQUES.forEach(function (r, idx) {
    var p = latLonToVec3(r.lat, r.lon, R * 1.012);
    var grp = new THREE.Group();
    grp.position.copy(p);
    globe.add(grp);

    var core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 1
    }));
    core.scale.setScalar(0.052); grp.add(core);

    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color: COL.accent.clone(), transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.45
    }));
    halo.scale.setScalar(0.12); grp.add(halo);

    var rings = [];
    for (var k = 0; k < 2; k++) {
      var rg = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX_RING, color: COL.accent.clone(), transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      }));
      rg.userData.ph = k * 0.5;
      grp.add(rg); rings.push(rg);
    }

    // Sphère de collision invisible, NETTEMENT plus large que le point visible
    var hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.copy(p);
    hit.userData.index = idx;
    globe.add(hit);
    hitMeshes.push(hit);

    nodes.push({
      def: r, index: idx, group: grp, local: p.clone(),
      core: core, halo: halo, rings: rings,
      hover: 0, hoverT: 0, world: new THREE.Vector3(), screen: { x: 0, y: 0 }, facing: 0,
      // pancarte permanente (renseignée en 8.0)
      tag: null, tagW: 0, tagH: 0, tagY: 0, tagAlpha: 0, tagStack: 0, tagDY: 0, tagHot: false
    });
  });

  // Nœuds secondaires décoratifs
  var secondaries = [];
  (function () {
    var pos = [], col = [], siz = [], pha = [], twk = [];
    SECONDAIRES.forEach(function (s) {
      var v = latLonToVec3(s[1], s[2], R * 1.008);
      secondaries.push(v);
      pos.push(v.x, v.y, v.z);
      col.push(COL.accent.r * 0.85, COL.accent.g * 0.85, COL.accent.b * 0.85);
      siz.push(0.021); pha.push(Math.random()); twk.push(1);
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(pha, 1));
    g.setAttribute('aTw', new THREE.Float32BufferAttribute(twk, 1));
    var m = dotsMat
      ? dotsMat.clone()
      : new THREE.PointsMaterial({ color: 0x00d4ff, size: 3, sizeAttenuation: false });
    if (m.uniforms) {
      m.uniforms.uMap = { value: TEX_GLOW };
      m.uniforms.uTime = { value: 0 };
      m.uniforms.uScale = { value: 900 };
      m.uniforms.uStage = { value: 1 };
      m.uniforms.uDim = { value: 0 };
      secMat = m;
    }
    var pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    globe.add(pts);
  })();

  /* --- 2.7 Arcs : grand cercle relevé au-dessus de la surface ---------------- */

  // Un arc doit TOUJOURS survoler le globe. La version précédente traçait une
  // Bézier quadratique dont le point de contrôle était posé sur la direction
  // médiane des deux extrémités : passé ~100° d'écart, la courbe part vers
  // l'intérieur dès le départ et plonge sous la surface (rayon minimal mesuré :
  // 0,849 R pour Paris–Wellington, 0,855 pour Londres–Wellington, 0,905 pour
  // Reykjavik–Wellington, 0,954 pour New York–Singapour, 0,973 pour
  // Wellington–New York) — cinq des vingt et un arcs principaux traversaient
  // donc le globe au lieu de le survoler. Et deux points quasi antipodaux
  // rendent `a+b` presque nul : `normalize()` y perdait toute direction stable.
  //
  // On trace maintenant le grand cercle exact entre les deux points, relevé par
  // un profil en sinus : le rayon vaut R·(ARC_ALT + h·sin(πt)), donc jamais
  // moins que R·ARC_ALT quel que soit l'écart angulaire. Le survol est garanti
  // par construction, pas par un réglage à surveiller.
  var ARC_ALT = 1.004;                             // altitude des deux extrémités

  // Courbe minimale : `getPoint` / `getPoints` sont les deux seules méthodes
  // utilisées (géométrie de la ligne, et impulsions qui la parcourent dans
  // js/main.js). Pas de sous-classe THREE.Curve : rien à construire au premier
  // niveau du fichier.
  function arcCurve(u, perp, omega, h) {
    return {
      getPoint: function (t, target) {
        var p = target || new THREE.Vector3();
        var ca = Math.cos(omega * t), sa = Math.sin(omega * t);
        var r = R * (ARC_ALT + h * Math.sin(Math.PI * t));
        p.set((u.x * ca + perp.x * sa) * r,
              (u.y * ca + perp.y * sa) * r,
              (u.z * ca + perp.z * sa) * r);
        return p;
      },
      getPoints: function (n) {
        var out = [];
        for (var i = 0; i <= n; i++) out.push(this.getPoint(i / n));
        return out;
      }
    };
  }

  function makeArc(a, b, main) {
    var u = a.clone().normalize();
    var v = b.clone().normalize();
    var cosO = Math.max(-1, Math.min(1, u.dot(v)));
    var omega = Math.acos(cosO);
    // Second vecteur du repère du plan du grand cercle. Deux points antipodaux
    // n'en définissent aucun : on en choisit un stable plutôt que de laisser
    // une normalisation de vecteur nul décider à notre place.
    var perp = v.clone().addScaledVector(u, -cosO);
    if (perp.lengthSq() < 1e-8) {
      perp = (Math.abs(u.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).cross(u);
    }
    perp.normalize();
    // Bombement proportionnel à l'écart ANGULAIRE, et non plus à la corde : la
    // corde sature près de l'antipode alors que c'est justement là que l'arc a
    // le plus long chemin à survoler.
    var h = 0.045 + 0.24 * (omega / Math.PI);
    var curve = arcCurve(u, perp, omega, h);
    var pts = curve.getPoints(main ? 72 : 40);
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({
      color: main ? 0x8fc7e8 : 0x8fc7e8,
      transparent: true,
      opacity: main ? 0.26 : 0.06,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var line = new THREE.Line(geo, mat);
    globe.add(line);
    var rec = { curve: curve, line: line, mat: mat, main: !!main, base: mat.opacity, ends: [] };
    arcs.push(rec);
    return rec;
  }

  // Les rubriques sont toutes reliées entre elles (n·(n−1)/2 arcs marqués)
  for (var i1 = 0; i1 < nodes.length; i1++) {
    for (var j1 = i1 + 1; j1 < nodes.length; j1++) {
      var arc = makeArc(nodes[i1].local, nodes[j1].local, true);
      arc.ends = [i1, j1];
    }
  }
  // Liaisons secondaires, plus fines
  (function () {
    for (var a = 0; a < secondaries.length; a++) {
      var order = [];
      for (var b = 0; b < secondaries.length; b++) if (b !== a) order.push([secondaries[a].distanceTo(secondaries[b]), b]);
      order.sort(function (m, n) { return m[0] - n[0]; });
      var links = (a % 3 === 0) ? 2 : 1;
      for (var k = 0; k < links; k++) if (order[k]) makeArc(secondaries[a], secondaries[order[k][1]], false);
    }
    // quelques rattachements des secondaires vers la rubrique la plus proche
    for (var s = 0; s < secondaries.length; s += 2) {
      var best = 0, bd = 1e9;
      for (var n2 = 0; n2 < nodes.length; n2++) {
        var dd = secondaries[s].distanceTo(nodes[n2].local);
        if (dd < bd) { bd = dd; best = n2; }
      }
      makeArc(secondaries[s], nodes[best].local, false);
    }
  })();

  /* --- 2.8 Impulsions de données (un seul THREE.Points) --------------------- */
  var pulseMat, pulsePts;
  (function buildPulses() {
    for (var i = 0; i < arcs.length; i++) {
      var n = arcs[i].main ? 2 : 1;
      for (var k = 0; k < n; k++) {
        pulses.push({
          arc: i,
          t: Math.random(),
          sp: (arcs[i].main ? 0.085 : 0.05) * (0.6 + Math.random() * 0.9)
        });
      }
    }
    var pos = new Float32Array(pulses.length * 3);
    var col = new Float32Array(pulses.length * 3);
    pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pulseMat = new THREE.PointsMaterial({
      size: 0.028, map: TEX_GLOW, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    pulsePts = new THREE.Points(pulseGeo, pulseMat);
    pulsePts.frustumCulled = false;
    globe.add(pulsePts);
  })();

  // Vecteurs de travail et tampons relus à chaque image par la boucle de rendu.
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();
  tmpV = new THREE.Vector3();
  normal = new THREE.Vector3();
  toCam = new THREE.Vector3();
  centerW = new THREE.Vector3();
  tmpP = new THREE.Vector3();
  pulsePos = pulseGeo.attributes.position.array;
  pulseCol = pulseGeo.attributes.color.array;

  return true;
}

/* ============================================================================
   3. ROTATION VERS UN POINT
   ========================================================================== */
// Amène le point local p face à la caméra (+Z). Ordre d'Euler XYZ => M = Rx·Ry.
function aimAt(local) {
  var L = Math.sqrt(local.x * local.x + local.z * local.z);
  var ry = Math.atan2(-local.x, local.z);
  var rx = Math.atan2(local.y, L);
  // Chemin angulaire le plus court : on ramène l'écart dans [-PI, PI]
  var d = ry - state.rotYT;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  state.rotYT += d;
  state.rotXT = rx;
  state.velY = 0; state.velX = 0;
}

/* ============================================================================
   4. PROJECTION 3D -> 2D
   ========================================================================== */
function projectNode(n) {
  n.group.getWorldPosition(tmpV);
  n.world.copy(tmpV);
  tmpV.project(camera);
  var x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
  var y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
  n.screen.x = x; n.screen.y = y;
  return n.screen;
}
