#!/usr/bin/env node
/* ============================================================================
   update-rootme.mjs — synchronise l'objet ROOTME de js/data.js avec l'API
   officielle Root-Me.

   POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL NE TOURNE PAS DANS LE NAVIGATEUR
   -------------------------------------------------------------------------
   La passe « carte Root-Me » (voir NOTES.md) a établi qu'un fetch() depuis la
   page est impossible : la clé d'API se transmet dans l'en-tête « Cookie », que
   fetch() n'a pas le droit de poser, et l'API n'envoie aucun en-tête CORS. Ces
   deux verrous sont des règles du NAVIGATEUR, pas de l'API : côté serveur
   (Node, dans un runner GitHub Actions) il n'y a ni liste d'en-têtes interdits
   ni contrôle d'origine. La synchronisation se fait donc ici, hors ligne, et le
   site continue de ne lire qu'un fichier statique — l'invariant « ouverture en
   file://, aucun serveur, aucun fetch() » reste intact.

   CE QU'IL FAIT
   -------------
     1. interroge https://api.www.root-me.org (et surtout PAS api.root-me.org,
        qui n'a plus de certificat — testé) pour le profil du pseudo ;
     2. en extrait points, classement mondial, rang et validations ;
     3. répartit les validations par catégorie (Réseau, Web-Client, …) ;
     4. réécrit le bloc ROOTME de js/data.js, entre deux marqueurs.

   GARDE-FOUS
   ----------
     - la clé vient de l'environnement (ROOTME_API_KEY), jamais du dépôt ;
     - le fichier n'est écrit QU'À LA FIN, une fois toutes les valeurs obtenues
       et validées : un échec réseau, une clé refusée ou une réponse inattendue
       terminent le script en code non nul SANS toucher à js/data.js — jamais de
       mise à jour partielle, jamais de zéros qui écraseraient de vrais chiffres ;
     - le fichier produit est analysé syntaxiquement avant d'être écrit ;
     - si rien n'a bougé depuis la dernière synchronisation, rien n'est écrit :
       le workflow ne crée donc pas un commit par jour pour une simple date.

   USAGE
   -----
     ROOTME_API_KEY=xxxxx node scripts/update-rootme.mjs

   Node 18+ requis (fetch natif). Aucune dépendance externe, rien à installer.

   Variables d'environnement facultatives :
     ROOTME_PSEUDO           défaut « Nomalow »
     ROOTME_AUTEUR_ID        défaut « 1006965 » (identifiant API du profil)
     ROOTME_MAX_CATEGORIES   défaut 6 — voir le commentaire de MAX_CATS
     ROOTME_DEBUG=1          journalise les réponses brutes tronquées
   ========================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = path.join(RACINE, 'js', 'data.js');

const API = 'https://api.www.root-me.org';
const CLE = process.env.ROOTME_API_KEY;
const PSEUDO = process.env.ROOTME_PSEUDO || 'Nomalow';
const AUTEUR_ID = process.env.ROOTME_AUTEUR_ID || '1006965';
const DEBUG = process.env.ROOTME_DEBUG === '1';

/* La carte Root-Me est déjà la plus haute des quatre fiches de Certifications
   (~352 px contre ~120). Chaque catégorie affichée lui ajoute une ligne, et
   au-delà d'une certaine hauteur l'invariant « aucune carte n'en chevauche une
   autre » (voir NOTES.md) n'a plus la place de tenir sur un écran bas. On
   n'affiche donc que les MAX_CATS catégories les mieux fournies. Relever cette
   valeur = rejouer le contrôle de chevauchement sur les petites tailles. */
const MAX_CATS = Math.max(1, Number(process.env.ROOTME_MAX_CATEGORIES || 6));

const MARQUEUR_DEBUT = '/* @rootme:début */';
const MARQUEUR_FIN = '/* @rootme:fin */';

const UA = 'portfolio-nomalovv/1.0 (+https://github.com/Nomalovv/portfolio)';

/* ---------------------------------------------------------------------------
   Petits utilitaires
   ------------------------------------------------------------------------- */
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

function echec(message) {
  const e = new Error(message);
  e.definitif = true; // pas la peine de réessayer
  return e;
}

/* Root-Me renvoie ses listes sous trois formes selon le point d'entrée : un
   vrai tableau, un objet indexé par des clés numériques (« {"0":{…},"1":{…}} »)
   ou un tableau contenant un tel objet. Les trois sont ramenées ici à un
   tableau plat, pour ne pas avoir à deviner laquelle arrive. */
function enTableau(v) {
  if (v == null) return [];
  const indexe = (o) =>
    o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).length > 0 && Object.keys(o).every((k) => /^\d+$/.test(k));
  if (Array.isArray(v)) {
    return v.flatMap((e) => (indexe(e) ? Object.values(e) : [e]));
  }
  if (typeof v === 'object') return indexe(v) ? Object.values(v) : [v];
  return [];
}

/* Premier champ non vide parmi plusieurs noms possibles : l'API n'est pas
   documentée de façon stable, autant accepter les synonymes plutôt que de
   casser au premier renommage. */
function champ(objet, ...noms) {
  if (!objet || typeof objet !== 'object') return null;
  for (const n of noms) {
    const v = objet[n];
    if (v != null && v !== '') return v;
  }
  return null;
}

function entier(v) {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/* Guillemets simples, comme le reste de js/data.js. */
function txt(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

/* « 2 septembre 2026 ». Intl couvre le cas normal (Node a l'ICU complet) ; le
   repli manuel évite de dépendre d'une construction de Node sans locales. */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function dateFrancaise(d) {
  try {
    const s = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris'
    }).format(d);
    if (/[a-zà-ÿ]/i.test(s) && !/\d{2}\/\d{2}/.test(s)) return s;
  } catch { /* repli ci-dessous */ }
  // Jour civil à Paris, sans dépendre des locales.
  const iso = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
  const [a, m, j] = iso.split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
}

/* ---------------------------------------------------------------------------
   Appel d'API
   La clé passe par l'en-tête « Cookie », seule forme acceptée (le paramètre
   d'URL « ?apikey= » et un en-tête maison « api_key: » répondent 401 — testé).
   ------------------------------------------------------------------------- */
async function api(chemin) {
  const url = API + chemin;
  let derniere = null;

  for (let essai = 1; essai <= 3; essai++) {
    try {
      const ctl = new AbortController();
      const minuteur = setTimeout(() => ctl.abort(), 20000);
      let r;
      try {
        r = await fetch(url, {
          headers: {
            Cookie: 'api_key=' + CLE,
            Accept: 'application/json',
            'User-Agent': UA
          },
          redirect: 'follow',
          signal: ctl.signal
        });
      } finally {
        clearTimeout(minuteur);
      }

      const corps = await r.text();
      if (DEBUG) console.error(`[debug] ${r.status} ${chemin} → ${corps.slice(0, 300)}`);

      if (r.status === 401 || r.status === 403) {
        throw echec(
          `L'API a refusé la clé (HTTP ${r.status}) sur ${chemin}. ` +
          'Vérifier le secret ROOTME_API_KEY : une clé Root-Me expire et doit être ' +
          'régénérée depuis la page « Mon compte » du profil.'
        );
      }
      if (r.status === 404) throw echec(`Point d'entrée introuvable (404) : ${chemin}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${chemin} — ${corps.slice(0, 200)}`);

      try {
        return JSON.parse(corps);
      } catch {
        throw new Error(`Réponse non-JSON sur ${chemin} — ${corps.slice(0, 200)}`);
      }
    } catch (e) {
      derniere = e;
      if (e.definitif) break;
      if (essai < 3) await dors(1500 * essai);
    }
  }
  throw derniere || new Error(`Échec de l'appel ${chemin}`);
}

/* Appels en parallèle, mais bridés : inutile de marteler l'API pour vingt
   requêtes, et un profil bien rempli en demanderait plusieurs dizaines. */
async function parLots(elements, largeur, fn) {
  const sortie = new Array(elements.length);
  let curseur = 0;
  const ouvriers = new Array(Math.min(largeur, elements.length)).fill(0).map(async () => {
    while (curseur < elements.length) {
      const i = curseur++;
      sortie[i] = await fn(elements[i], i);
    }
  });
  await Promise.all(ouvriers);
  return sortie;
}

/* ---------------------------------------------------------------------------
   Récupération du profil
   ------------------------------------------------------------------------- */

/* L'identifiant est connu (1006965), mais un profil peut changer d'id ou la
   valeur par défaut être fausse sur un autre compte : en cas d'échec on le
   redemande par le pseudo plutôt que d'abandonner. */
async function trouverAuteurId() {
  try {
    const p = await api(`/auteurs/${encodeURIComponent(AUTEUR_ID)}`);
    if (champ(p, 'nom', 'pseudo')) return { id: AUTEUR_ID, profil: p };
  } catch (e) {
    if (e.definitif && /refusé la clé/.test(e.message)) throw e;
    console.error(`Profil ${AUTEUR_ID} indisponible (${e.message}) — recherche par pseudo.`);
  }

  const liste = enTableau(await api(`/auteurs?nom=${encodeURIComponent(PSEUDO)}`));
  const cible = liste.find((a) => {
    const nom = champ(a, 'nom', 'pseudo');
    return nom && String(nom).toLowerCase() === PSEUDO.toLowerCase();
  }) || liste[0];

  const id = cible && champ(cible, 'id_auteur', 'id');
  if (!id) throw echec(`Aucun auteur « ${PSEUDO} » retourné par l'API.`);
  return { id: String(id), profil: await api(`/auteurs/${encodeURIComponent(id)}`) };
}

/* Les validations peuvent être paginées (« debut_validations »). Tant qu'un
   appel rapporte des identifiants nouveaux, on continue ; dès que la page se
   répète, se vide ou échoue, on s'arrête avec ce qu'on a. Ainsi un profil de
   plus de 50 validations n'est pas tronqué en silence, et si le nom du
   paramètre change un jour, le script garde au moins la première page. */
async function toutesValidations(id, premierProfil) {
  const vues = new Set();
  const sortie = [];
  let profil = premierProfil;
  let curseur = null;

  for (let page = 0; page < 20; page++) {
    let data = page === 0 ? profil : null;
    if (!data) {
      try {
        data = await api(`/auteurs/${encodeURIComponent(id)}?debut_validations=${encodeURIComponent(curseur)}`);
      } catch (e) {
        console.error(`Pagination interrompue à la page ${page + 1} : ${e.message}`);
        break;
      }
    }

    const lot = enTableau(champ(data, 'validations', 'validation'));
    let neufs = 0;
    for (const v of lot) {
      const cle = String(champ(v, 'id_challenge', 'id') ?? JSON.stringify(v));
      if (vues.has(cle)) continue;
      vues.add(cle);
      sortie.push(v);
      neufs++;
    }

    if (neufs === 0 || lot.length === 0) break;
    const dernier = champ(lot[lot.length - 1], 'id_challenge', 'id');
    if (dernier == null || String(dernier) === String(curseur)) break;
    curseur = dernier;
    await dors(250);
  }

  return { profil, validations: sortie };
}

/* ---------------------------------------------------------------------------
   Catégories
   ------------------------------------------------------------------------- */

/* « Web - Client » côté API, « Web-Client » côté carte : la colonne du libellé
   ne fait que 74 px, les espaces autour du tiret y coûtent cher pour rien. */
function normaliserCategorie(nom) {
  return String(nom).trim().replace(/\s*[-–]\s*/g, '-').replace(/\s+/g, ' ');
}

/* Une validation porte parfois déjà le nom de sa rubrique ; sinon il faut aller
   le chercher sur le challenge. On ne retient une valeur que si c'est du texte :
   « id_rubrique » est un numéro, il n'apprend rien de lisible. */
function categorieDirecte(v) {
  const brut = champ(v, 'rubrique', 'nom_rubrique', 'categorie', 'category');
  if (brut == null) return null;
  const s = String(brut).trim();
  if (!s || /^\d+$/.test(s)) return null;
  return normaliserCategorie(s);
}

async function categoriesDesValidations(validations) {
  const manquantes = [];
  const directes = validations.map((v) => {
    const c = categorieDirecte(v);
    if (!c) manquantes.push(v);
    return c;
  });

  // Un challenge peut avoir été validé une seule fois : pas de doublon d'appel
  // à craindre, mais on déduplique quand même par sécurité.
  const idsManquants = [...new Set(
    manquantes.map((v) => champ(v, 'id_challenge', 'id')).filter((x) => x != null).map(String)
  )];

  const table = new Map();
  if (idsManquants.length) {
    console.error(`Rubrique absente des validations : ${idsManquants.length} challenge(s) à interroger un par un.`);
    const details = await parLots(idsManquants, 4, async (id) => {
      try {
        return await api(`/challenges/${encodeURIComponent(id)}`);
      } catch (e) {
        console.error(`Challenge ${id} illisible : ${e.message}`);
        return null;
      }
    });
    idsManquants.forEach((id, i) => {
      const d = enTableau(details[i])[0] || details[i];
      const r = d && champ(d, 'rubrique', 'nom_rubrique', 'categorie');
      if (r && !/^\d+$/.test(String(r).trim())) table.set(id, normaliserCategorie(r));
    });
  }

  const comptes = new Map();
  let inconnues = 0;
  validations.forEach((v, i) => {
    const id = champ(v, 'id_challenge', 'id');
    const cat = directes[i] || (id != null ? table.get(String(id)) : null);
    if (!cat) { inconnues++; return; }
    comptes.set(cat, (comptes.get(cat) || 0) + 1);
  });

  if (inconnues) console.error(`${inconnues} validation(s) sans catégorie identifiable — non comptée(s) dans la répartition.`);

  return [...comptes.entries()]
    .map(([nom, n]) => ({ nom, n }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, MAX_CATS);
}

/* ---------------------------------------------------------------------------
   Rang : l'API répond en anglais (« curious »), la carte affiche en français.
   Table de correspondance volontairement incomplète et non bloquante : un rang
   inconnu est recopié tel quel plutôt que traduit à tort. Compléter au fur et à
   mesure des promotions.
   ------------------------------------------------------------------------- */
const RANGS = {
  visitor: 'Visiteur',
  curious: 'Curieux',
  trainee: 'Apprenti',
  insider: 'Initié',
  enthusiast: 'Passionné',
  hacker: 'Hacker',
  elite: 'Élite',
  legend: 'Légende'
};

function rangFrancais(brut) {
  const s = String(brut || '').trim();
  return RANGS[s.toLowerCase()] || s;
}

/* ---------------------------------------------------------------------------
   Écriture du bloc ROOTME
   ------------------------------------------------------------------------- */
function rendreBloc(o) {
  // Colonnes alignées comme le reste de js/data.js : la virgule colle au nom,
  // c'est le remplissage qui vient après.
  const largeur = o.categories.reduce((m, c) => Math.max(m, txt(c.nom).length + 1), 0);
  const cats = o.categories
    .map((c) => `    { nom: ${(txt(c.nom) + ',').padEnd(largeur)} n: ${String(c.n).padStart(2)} }`)
    .join(',\n');

  return [
    'var ROOTME = {',
    `  pseudo: ${txt(o.pseudo)},`,
    `  profil: ${txt(o.profil)},`,
    `  rang: ${txt(o.rang)},`,
    `  challenges: ${o.challenges},`,
    `  challengesTotal: ${o.challengesTotal},`,
    `  points: ${o.points},`,
    `  classement: ${o.classement},`,
    `  maj: ${txt(o.maj)},`,
    `  sync: ${txt(o.sync)},`,
    '  // n = challenges validés dans la catégorie. Les catégories sont classées',
    '  // par nombre de validations décroissant et le nombre affiché est plafonné',
    '  // (voir MAX_CATS dans scripts/update-rootme.mjs).',
    '  categories: [',
    cats,
    '  ]',
    '};'
  ].join('\n');
}

/* Relit l'objet ROOTME déjà présent dans le fichier : sert de valeur de repli
   (challengesTotal, que l'API n'expose pas) et de point de comparaison pour
   décider s'il y a lieu d'écrire. Le bloc est du JS que nous avons écrit
   nous-mêmes ; il est analysé, pas exécuté au sens large. */
function lireBlocExistant(source) {
  const a = source.indexOf(MARQUEUR_DEBUT);
  const b = source.indexOf(MARQUEUR_FIN);
  if (a < 0 || b < 0 || b < a) return null;
  const corps = source.slice(a + MARQUEUR_DEBUT.length, b);
  try {
    return new Function(`${corps}\nreturn ROOTME;`)();
  } catch (e) {
    console.error(`Bloc ROOTME existant illisible (${e.message}) — comparaison ignorée.`);
    return null;
  }
}

/* Ce qui décide d'une réécriture : les chiffres, pas la date. Sans cela le
   workflow produirait un commit par jour pour changer un seul mot. */
function empreinte(o) {
  return JSON.stringify({
    pseudo: o.pseudo, profil: o.profil, rang: o.rang,
    challenges: o.challenges, challengesTotal: o.challengesTotal,
    points: o.points, classement: o.classement, sync: o.sync,
    categories: (o.categories || []).map((c) => [c.nom, c.n])
  });
}

/* ---------------------------------------------------------------------------
   Programme principal
   ------------------------------------------------------------------------- */
async function main() {
  if (!CLE) {
    throw echec(
      'ROOTME_API_KEY absent. En local : ROOTME_API_KEY=… node scripts/update-rootme.mjs. ' +
      'Sur GitHub : Settings → Secrets and variables → Actions → New repository secret, ' +
      'nommé exactement ROOTME_API_KEY.'
    );
  }

  const source = await readFile(FICHIER, 'utf8');
  if (!source.includes(MARQUEUR_DEBUT) || !source.includes(MARQUEUR_FIN)) {
    throw echec(
      `Marqueurs ${MARQUEUR_DEBUT} / ${MARQUEUR_FIN} introuvables dans js/data.js : ` +
      'le script refuse de deviner où réécrire. Les remettre autour de « var ROOTME = { … }; ».'
    );
  }
  const ancien = lireBlocExistant(source);

  const { id, profil: profil0 } = await trouverAuteurId();
  const { profil, validations } = await toutesValidations(id, profil0);

  const points = entier(champ(profil, 'score', 'points'));
  const classement = entier(champ(profil, 'position', 'classement', 'rank'));
  const rangBrut = champ(profil, 'rang', 'rank_name', 'titre');

  // Les trois chiffres de tuiles sont obligatoires : sans eux la carte
  // afficherait des trous, mieux vaut échouer et garder l'état précédent.
  const manque = [];
  if (points == null) manque.push('score');
  if (classement == null) manque.push('position');
  if (!validations.length) manque.push('validations');
  if (manque.length) {
    throw echec(
      `Réponse inattendue de l'API : champ(s) ${manque.join(', ')} introuvable(s) ou vide(s). ` +
      'js/data.js n\'a pas été modifié. Relancer avec ROOTME_DEBUG=1 pour voir la réponse brute.'
    );
  }

  const categories = await categoriesDesValidations(validations);
  if (!categories.length) {
    throw echec('Aucune catégorie identifiable dans les validations — js/data.js n\'a pas été modifié.');
  }

  const nouveau = {
    pseudo: String(champ(profil, 'nom', 'pseudo') || PSEUDO),
    profil: `https://www.root-me.org/${String(champ(profil, 'nom', 'pseudo') || PSEUDO)}`,
    rang: rangFrancais(rangBrut) || (ancien && ancien.rang) || '',
    challenges: validations.length,
    // L'API n'expose pas le nombre total de challenges du site : on conserve la
    // dernière valeur connue plutôt que d'inventer un chiffre.
    challengesTotal: (ancien && entier(ancien.challengesTotal)) || 0,
    points,
    classement,
    maj: dateFrancaise(new Date()),
    sync: 'auto',
    categories
  };

  console.log(
    `Root-Me / ${nouveau.pseudo} : ${nouveau.challenges} validations, ${nouveau.points} points, ` +
    `#${nouveau.classement}, rang « ${nouveau.rang} », ` +
    categories.map((c) => `${c.nom} ${c.n}`).join(', ')
  );

  if (ancien && empreinte(ancien) === empreinte(nouveau)) {
    console.log('Chiffres inchangés depuis la dernière synchronisation : js/data.js laissé tel quel.');
    return;
  }

  // Le dépôt est sur Windows et js/data.js est en CRLF : le bloc réinjecté doit
  // l'être aussi, faute de quoi le fichier devient à fins de ligne mélangées et
  // le diff du commit automatique déborde du bloc.
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const a = source.indexOf(MARQUEUR_DEBUT) + MARQUEUR_DEBUT.length;
  const b = source.indexOf(MARQUEUR_FIN);
  const contenu = source.slice(0, a) + eol +
    rendreBloc(nouveau).replace(/\n/g, eol) + eol + source.slice(b);

  // Dernier filet : un fichier qui ne s'analyse pas casserait le site entier.
  // « new Function » analyse le corps sans l'exécuter.
  try {
    new Function(contenu); // eslint-disable-line no-new-func
  } catch (e) {
    throw echec(`Le js/data.js produit ne s'analyse pas (${e.message}) — écriture annulée.`);
  }

  await writeFile(FICHIER, contenu, 'utf8');
  console.log(`js/data.js mis à jour (maj : ${nouveau.maj}).`);
}

main().catch((e) => {
  console.error('Échec de la synchronisation Root-Me : ' + (e && e.message ? e.message : e));
  console.error('js/data.js est resté inchangé — le site continue d\'afficher les derniers chiffres commités.');
  process.exit(1);
});
