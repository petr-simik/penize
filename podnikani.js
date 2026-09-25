/* ============================================================
   Podnikání – příjmy a výdaje živnosti, doklady a daně

   Data žijí v data.business vedle osobního rozpočtu a synchronizují
   se s ním. S měsícem je to propojené třemi směry:
   – příjem z podnikání se ukáže v Příjmech měsíce, kdy přišel,
   – rezerva na daně z každé platby je převod ve „Kam poslat peníze“,
   – zaplacený výdaj z kategorie Podnikání se sám zapíše sem.
   Řádky v měsíci mají pevná id odvozená od záznamu (bi-, br-, bm-, b-),
   takže je dvě zařízení nezaloží dvakrát.
   ============================================================ */
import * as dane from './dane.js';
import { createDocs, zip, isImage } from './doklady.js';

export const KAT_PRIJMY = [
  ['foceni', 'Focení', 'c-camera'],
  ['svatba', 'Svatba', 'c-heart'],
  ['poukaz', 'Dárkový poukaz', 'c-gift'],
  ['produkty', 'Tisk a fotoprodukty', 'c-book'],
  ['licence', 'Prodej fotek a licence', 'c-layers'],
  ['jine', 'Jiné', 'c-wallet'],
];
export const KAT_VYDAJE = [
  ['technika', 'Technika a vybavení', 'c-camera'],
  ['software', 'Software a předplatné', 'c-layers'],
  ['web', 'Web a reklama', 'c-globe'],
  ['tisk', 'Tisk a fotoprodukty', 'c-book'],
  ['doprava', 'Doprava', 'c-car'],
  ['sidlo', 'Sídlo, telefon, internet', 'c-phone'],
  ['vzdelavani', 'Kurzy a vzdělávání', 'c-spark'],
  ['pojisteni', 'Pojištění', 'c-shield'],
  ['poplatky', 'Poplatky a úřady', 'c-bank'],
  ['material', 'Materiál a rekvizity', 'c-tools'],
  ['ostatni', 'Ostatní', 'c-receipt'],
];
const ZPUSOBY = [['ucet', 'Na účet'], ['hotove', 'Hotově'], ['karta', 'Kartou'], ['jine', 'Jinak']];
const PLATBY = [
  ['dan', 'Daň z příjmů'], ['zdravotni', 'Zdravotní pojištění'],
  ['socialni', 'Sociální pojištění'], ['dph', 'DPH (identifikovaná osoba)'],
];
const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MESICE_1 = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

const VYDAJ_HINTS = [
  [/adobe|lightroom|photoshop|evenilo|pixin|icloud|claude|chatgpt|openai|canva|dropbox|google one|capture one|luminar|aftershoot|imagen|topaz|software|licenc|předplat|predplat/i, 'software'],
  [/doména|domena|hosting|webglobe|vercel|\bweb\b|reklam|meta ads|facebook|instagram|google ads|sklik|seznam/i, 'web'],
  [/objektiv|fotoapar|fotak|foťák|blesk|světl|svetl|stativ|karta|\bdisk|ssd|baterie|sony|canon|nikon|fuji|sigma|tamron|dron|gimbal|brašn|brasn|notebook|monitor/i, 'technika'],
  [/tisk|fotokni|papír|papir|rámeč|ramec|obálk|obalk|cewe|fotolab|album/i, 'tisk'],
  [/benz|nafta|jízd|jizd|vlak|autobus|parkov|dálni|dalni|mýt|myt|uber|bolt/i, 'doprava'],
  [/sídlo|sidlo|telefon|tarif|\bo2\b|vodafone|t-mobile|internet/i, 'sidlo'],
  [/kurz|workshop|školen|skolen|mentor|kniha/i, 'vzdelavani'],
  [/pojiš|pojis/i, 'pojisteni'],
  [/poplat|úřad|urad|živnost|zivnost|kolek|bank/i, 'poplatky'],
  [/rekvizit|materiál|material|kostým|kostym|balón|balon|květin|kvetin/i, 'material'],
];
// Firmy, které službu prodávají ze zahraničí (identifikovaná osoba k DPH).
const ZAHRANICI = /adobe|apple|icloud|google|youtube|meta\b|facebook|instagram|claude|anthropic|openai|chatgpt|canva|dropbox|microsoft|office 365|amazon|aws|envato|shutterstock|pixieset|pic-time|shootproof|squarespace|wix|midjourney|notion|figma|capture one|luminar|skylum|topaz|imagen|aftershoot|spotify|linkedin|pinterest|tiktok/i;
const PRIJEM_HINTS = [
  [/svatb/i, 'svatba'], [/poukaz|voucher/i, 'poukaz'],
  [/tisk|fotokni|album|obraz|plátno|platno/i, 'produkty'], [/licenc|prodej fot|stock/i, 'licence'],
];

const CHECKLIST = [
  ['ico', 'Živnost je zapsaná a máš IČO', () => 'Jednotný registrační formulář na živnostenském úřadě. Vedlejší činnost se zaškrtává v části pro ČSSZ.'],
  ['cssz', 'ČSSZ ví, že podnikáš vedle zaměstnání', (t) => `Oznámení do ${t ? t.cssz : '8. dne dalšího měsíce'}. Formulář ze živnostenského úřadu ho obvykle pošle sám, ověř si to na ePortálu ČSSZ.`],
  ['zp', 'Zdravotní pojišťovna ví o zahájení', (t) => `Do ${t ? t.zp : '8 dnů od zahájení'}. I tohle jde přes registrační formulář.`],
  ['ds', 'Datová schránka je aktivní a čteš ji', () => 'Podnikatel ji dostane automaticky. Chodí do ní pošta z úřadů a přes ni podáváš přiznání.'],
  ['ucet', 'Finanční úřad zná účet, na který chodí peníze za focení', (t) => `Oznamuje se do ${t ? t.ucetFu : '15 dnů'} přes daňovou informační schránku nebo datovou schránkou.`],
  ['io', 'Služby ze zahraničí máš probrané s účetní', () => 'Adobe, iCloud, Claude, reklama na Meta nebo Google. Podrobnosti jsou v kartě Služby ze zahraničí.'],
  ['zamestnavatel', 'Víš, že přiznání podáš sám, ne přes zaměstnavatele', () => 'V lednu nebo únoru si od zaměstnavatele vezmeš Potvrzení o zdanitelných příjmech. Roční zúčtování za tebe dělat nebude.'],
  ['web', 'Na webu jsou údaje o podnikateli', () => 'Jméno, IČO, sídlo a věta „zapsán v živnostenském rejstříku“. Plus obchodní podmínky.'],
];

export function createBusiness(api) {
  const { fmtCzk, fmtDate, parseNum, todayIso, uid, toast, snapshot, undo, skloneni } = api;
  const D = () => api.data;
  const B = () => api.data.business;

  const docs = createDocs({ mode: () => api.storageMode, syncConfig: api.syncConfig });

  let tab = 'prehled';
  let year = null;
  let filter = 'vse';
  let query = '';
  let dialog = null;

  /* ------------------------------------------------------------
     Pomocníci
     ------------------------------------------------------------ */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function ico(id, cls = 'ico') {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + id);
    s.append(u);
    return s;
  }
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (typeof v !== 'string' && k in n) n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) n.append(c);
    return n;
  }
  const sum = (list, f = (x) => x) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace('.', ',')} %`;
  const bez = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shortDate = (iso) => (iso ? fmtDate(iso).replace(/ \d{4}$/, '') : '');
  const catOf = (list, key) => list.find((c) => c[0] === key) || list[list.length - 1];
  const yearOf = (iso) => Number((iso || '').slice(0, 4)) || null;
  const daysTo = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const [ty, tm, td] = todayIso().split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  };
  const kdy = (iso) => {
    const n = daysTo(iso);
    if (n === 0) return 'dnes';
    if (n === 1) return 'zítra';
    if (n > 0) return `za ${n} ${skloneni(n, 'den', 'dny', 'dní')}`;
    return `před ${-n} ${skloneni(-n, 'dnem', 'dny', 'dny')}`;
  };

  function guessVydaj(text) {
    for (const [re, k] of VYDAJ_HINTS) if (re.test(text || '')) return k;
    return 'ostatni';
  }
  const guessForeign = (text) => ZAHRANICI.test(text || '');
  function guessPrijem(text) {
    for (const [re, k] of PRIJEM_HINTS) if (re.test(text || '')) return k;
    return 'foceni';
  }

  /* ------------------------------------------------------------
     Data
     ------------------------------------------------------------ */
  const LINK_DEFAULT = { income: true, reserve: true, expenses: true };
  function ensure() {
    const d = D();
    if (!d.business || typeof d.business !== 'object') d.business = {};
    const b = d.business;
    b.settings = { start: null, end: null, rezim: 'auto', pausal: 60, reserveAccount: null, bizBlocks: null, jmeno: '', ico: '', ...(b.settings || {}) };
    b.settings.link = { ...LINK_DEFAULT, ...(b.settings.link || {}) };
    for (const k of ['income', 'expenses', 'payments', 'moves']) if (!Array.isArray(b[k])) b[k] = [];
    if (!b.checklist || typeof b.checklist !== 'object' || Array.isArray(b.checklist)) b.checklist = {};
    return b;
  }
  const S = () => B().settings;

  const deductible = (e) => (e.deductible === false ? 0 : Math.round((e.amount || 0) * (e.share ?? 100)) / 100);
  const isReceived = (e) => !!e.date && (e.amount || 0) > 0;
  const entryYear = (e) => yearOf(e.date || e.issued || e.created);
  const counterparty = (e) => e.client || e.supplier || '';
  const titleOf = (e) => e.label || counterparty(e) || (B().income.includes(e) ? 'Příjem' : 'Výdaj');
  const isIncome = (e) => B().income.includes(e);

  function years() {
    const b = B();
    const set = new Set();
    const now = Number(todayIso().slice(0, 4));
    const startY = yearOf(b.settings.start);
    if (startY) for (let y = startY; y <= now; y++) set.add(y);
    for (const e of [...b.income, ...b.expenses]) { const y = entryYear(e); if (y) set.add(y); }
    if (!set.size) set.add(now);
    return [...set].sort((a, z) => a - z);
  }
  function currentYear() {
    const ys = years();
    if (year && ys.includes(year)) return year;
    const now = Number(todayIso().slice(0, 4));
    year = ys.includes(now) ? now : ys[ys.length - 1];
    return year;
  }

  /* Všechno, co se pro rok počítá, na jednom místě. Výsledek se drží
     do dalšího překreslení nebo změny (fresh), rezervy se počítají
     přes všechny platby roku a řádky deníku by je jinak počítaly znovu. */
  let memo = new Map();
  const fresh = () => { memo = new Map(); };
  function yearData(y) {
    if (memo.has(y)) return memo.get(y);
    const out = computeYear(y);
    memo.set(y, out);
    return out;
  }
  // Co je z doby před zahájením živnosti, do daní podnikání nepatří.
  const beforeStart = (e) => !!(S().start && e.date && e.date < S().start);
  function computeYear(y) {
    const b = B();
    const s = b.settings;
    const inc = b.income.filter((e) => isReceived(e) && yearOf(e.date) === y && !beforeStart(e));
    const exp = b.expenses.filter((e) => !e.draft && (e.amount || 0) > 0 && yearOf(e.date) === y && !beforeStart(e));
    const prijmy = sum(inc, (e) => e.amount);
    const vydaje = sum(exp, deductible);
    const mesice = dane.mesiceCinnosti(y, s.start, s.end);
    const opts = { rok: y, mesice, rezim: s.rezim, pausal: s.pausal };
    const calc = dane.spocitej({ ...opts, prijmy, vydaje });
    const created = (e) => e.created || '';
    const rezervy = dane.rozpisRezerv({
      ...opts,
      prijmy: [...inc].sort((a, z) => created(a).localeCompare(created(z)))
        .map((e, i) => ({ id: e.id, date: e.date, castka: e.amount, poradi: i })),
      vydaje: exp.map((e) => ({ date: e.date, castka: deductible(e) })),
    });
    const moves = b.moves.filter((m) => m.year === y && m.done);
    const odlozeno = sum(inc.filter((e) => e.reserve), (e) => e.reserve.amount) + sum(moves, (m) => m.amount);
    const kOdlozeni = sum(inc.filter((e) => !e.reserve), (e) => rezervy.get(e.id) || 0);
    const zaplaceno = sum(b.payments.filter((p) => p.year === y), (p) => p.amount);
    return {
      y, inc, exp, prijmy, vydaje, mesice, calc, rezervy, odlozeno, kOdlozeni, zaplaceno,
      chybi: calc.celkem - odlozeno,
      zbytek: calc.celkem - odlozeno - kOdlozeni,
      terminy: dane.terminy(y, { priznani: calc.priznani }),
    };
  }

  const reserveOf = (e) => {
    if (e.reserve) return e.reserve.amount;
    const Y = yearData(yearOf(e.date));
    return Y.rezervy.get(e.id) || 0;
  };

  function nextNo(list, prefix, y, taken) {
    const yy = String(y).slice(2);
    let max = 0;
    for (const e of list) {
      const m = /^([PV])(\d{2})-(\d+)$/.exec(e.no || '');
      if (m && m[1] === prefix && m[2] === yy) max = Math.max(max, Number(m[3]));
    }
    for (const n of taken || []) max = Math.max(max, n);
    return `${prefix}${yy}-${String(max + 1).padStart(3, '0')}`;
  }

  /* Čísla záznamů: P26-001 příjmy, V26-001 výdaje, v každém roce od jedničky.
     Dvě zařízení můžou rozdat stejné číslo – pozdější záznam pak dostane nové. */
  function renumber() {
    const b = B();
    let changed = false;
    for (const [list, prefix] of [[b.income, 'P'], [b.expenses, 'V']]) {
      const used = new Map();
      const bad = [];
      const byCreated = [...list].sort((a, z) => (a.created || '').localeCompare(z.created || ''));
      for (const e of byCreated) {
        const y = entryYear(e) || Number(todayIso().slice(0, 4));
        const yy = String(y).slice(2);
        const m = /^([PV])(\d{2})-(\d+)$/.exec(e.no || '');
        const set = used.get(y) || new Set();
        used.set(y, set);
        if (m && m[1] === prefix && m[2] === yy && !set.has(Number(m[3]))) set.add(Number(m[3]));
        else bad.push([e, y]);
      }
      for (const [e, y] of bad) {
        const set = used.get(y);
        const n = Math.max(0, ...set) + 1;
        set.add(n);
        e.no = `${prefix}${String(y).slice(2)}-${String(n).padStart(3, '0')}`;
        changed = true;
      }
    }
    return changed;
  }

  /* ------------------------------------------------------------
     Propojení s měsíčním rozpočtem
     ------------------------------------------------------------ */
  function isBizBlock(bl) {
    const names = S().bizBlocks;
    if (Array.isArray(names)) return names.some((n) => bez(n).trim() === bez(bl.name).trim());
    return /podnik|zivnost/.test(bez(bl.name)) || String(bl.id).startsWith('bb-');
  }
  // Období, do kterého datum patří. Budoucí data do žádného.
  function periodFor(iso) {
    const ps = D().periods;
    return ps.find((p) => p.from <= iso && iso < p.to) || ps.find((p) => p.from <= iso && iso <= p.to) || null;
  }
  function accountOk(id) { return !!id && (D().accounts || []).some((a) => a.id === id); }
  function bizBlockOf(p, create) {
    let bl = p.blocks.find(isBizBlock);
    if (!bl && create) {
      bl = { id: 'bb-' + p.id, name: 'Podnikání', icon: 'c-briefcase', kind: 'nutne', items: [] };
      p.blocks.push(bl);
    }
    return bl;
  }

  // Zaplacený výdaj z kategorie Podnikání → výdaj v podnikání.
  function linkExpenses() {
    const b = B();
    const s = b.settings;
    let changed = false;
    const wanted = new Map();
    if (s.link.expenses && s.start) {
      for (const p of D().periods) {
        for (const bl of p.blocks) {
          if (!isBizBlock(bl)) continue;
          for (const it of bl.items) {
            if (it.link || it.bizSkip) continue;
            const label = (it.label || '').trim();
            if (it.split) {
              for (const sp of it.spends || []) {
                const date = sp.date || p.from;
                if ((sp.amount || 0) > 0 && date >= s.start) wanted.set('b-' + sp.id, { date, amount: sp.amount, label, ref: { periodId: p.id, itemId: it.id } });
              }
            } else if (it.paid) {
              const amount = it.actual ?? it.plan ?? 0;
              const date = it.paidAt || p.from;
              if (amount > 0 && date >= s.start) wanted.set('b-' + it.id, { date, amount, label, ref: { periodId: p.id, itemId: it.id } });
            }
          }
        }
      }
    }
    for (const e of [...b.expenses]) {
      if (!e.fromBudget) continue;
      const w = wanted.get(e.id);
      if (!w) {
        if (!(e.files || []).length && !e.touched) { b.expenses = b.expenses.filter((x) => x !== e); }
        else delete e.fromBudget;
        changed = true;
        continue;
      }
      wanted.delete(e.id);
      if (e.manual) continue;
      if (e.amount !== w.amount || e.date !== w.date) { e.amount = w.amount; e.date = w.date; changed = true; }
      if (!e.touched && e.label !== w.label) { e.label = w.label; changed = true; }
    }
    for (const [id, w] of wanted) {
      if (b.expenses.some((x) => x.id === id)) continue;   // odpojený ručně – nechat být
      b.expenses.push({
        id, created: new Date().toISOString(), date: w.date, amount: w.amount,
        label: w.label, supplier: w.label, cat: guessVydaj(w.label),
        deductible: true, share: 100, foreign: guessForeign(w.label), files: [],
        fromBudget: w.ref,
      });
      changed = true;
    }
    return changed;
  }

  // Řádky v měsíci: příjmy z podnikání, rezervy z plateb, dorovnání rezervy.
  function linkPeriods() {
    const b = B();
    const s = b.settings;
    const d = D();
    let changed = false;
    const today = todayIso();
    const acc = accountOk(s.reserveAccount) ? s.reserveAccount : null;
    const Yof = yearData;

    // Kam co patří
    const wantIncome = new Map();   // periodId → { plan, actual }
    const wantRes = new Map();      // periodId → [{ id, label, amount, paid, paidAt, src }]
    if (s.start) {
      for (const e of b.income) {
        if (!(e.amount > 0)) continue;
        const when = e.date || e.due;
        if (!when || when < s.start) continue;
        const p = periodFor(when);
        if (!p) continue;
        if (s.link.income) {
          const w = wantIncome.get(p.id) || { plan: 0, actual: 0, any: false };
          w.plan += e.amount;
          if (e.date) { w.actual += e.amount; w.any = true; }
          wantIncome.set(p.id, w);
        }
        if (s.link.reserve && acc && e.date) {
          const amount = e.reserve ? e.reserve.amount : (Yof(yearOf(e.date)).rezervy.get(e.id) || 0);
          if (amount > 0 || e.reserve) {
            const list = wantRes.get(p.id) || [];
            list.push({ id: 'br-' + e.id, label: `Na daně: ${titleOf(e)}`, amount, src: e, kind: 'income' });
            wantRes.set(p.id, list);
          }
        }
      }
      if (s.link.reserve && acc) {
        for (const m of b.moves) {
          if (!(m.amount > 0)) continue;
          const p = periodFor(m.date);
          if (!p) continue;
          const list = wantRes.get(p.id) || [];
          list.push({ id: 'bm-' + m.id, label: m.note || 'Dorovnání rezervy na daně', amount: m.amount, src: m, kind: 'move' });
          wantRes.set(p.id, list);
        }
      }
    }

    for (const p of d.periods) {
      // Příjmy
      const iid = 'bi-' + p.id;
      const w = wantIncome.get(p.id);
      const row = p.income.find((x) => x.id === iid);
      if (w && w.plan > 0) {
        const actual = w.any ? w.actual : null;
        if (!row) {
          p.income.push({ id: iid, link: 'biz-income', label: 'Příjmy z podnikání', plan: w.plan, actual });
          changed = true;
        } else if (row.plan !== w.plan || row.actual !== actual) {
          row.plan = w.plan; row.actual = actual; changed = true;
        }
      } else if (row) {
        p.income = p.income.filter((x) => x !== row);
        changed = true;
      }
      for (const x of p.income.filter((x) => x.link && x.id !== iid)) {
        p.income = p.income.filter((y) => y !== x); changed = true;
      }

      // Rezervy
      const want = wantRes.get(p.id) || [];
      const wantIds = new Set(want.map((x) => x.id));
      for (const bl of p.blocks) {
        const stale = bl.items.filter((it) => (it.link === 'biz-reserve' || it.link === 'biz-move') && !wantIds.has(it.id));
        if (stale.length) { bl.items = bl.items.filter((it) => !stale.includes(it)); changed = true; }
      }
      if (!want.length) continue;
      const bl = bizBlockOf(p, true);
      for (const x of want) {
        let it = p.blocks.flatMap((q) => q.items).find((q) => q.id === x.id);
        const srcDone = x.kind === 'income' ? !!x.src.reserve : !!x.src.done;
        if (!it) {
          it = { id: x.id, link: x.kind === 'income' ? 'biz-reserve' : 'biz-move', label: x.label, account: acc, plan: x.amount, actual: null };
          if (srcDone) { it.paid = true; it.paidAt = x.kind === 'income' ? x.src.reserve.date : x.src.doneAt || today; }
          bl.items.push(it);
          changed = true;
          continue;
        }
        // Odškrtnuté v měsíci (nebo celý převod najednou) – rozpočet má přednost.
        if (!!it.paid !== srcDone) {
          if (x.kind === 'income') {
            x.src.reserve = it.paid ? { amount: x.amount, date: it.paidAt || today } : null;
          } else {
            x.src.done = !!it.paid;
            x.src.doneAt = it.paid ? it.paidAt || today : undefined;
          }
          changed = true;
        }
        const amount = x.kind === 'income' ? (x.src.reserve ? x.src.reserve.amount : x.amount) : x.amount;
        if (it.plan !== amount || it.label !== x.label || it.account !== acc) {
          it.plan = amount; it.label = x.label; it.account = acc; changed = true;
        }
      }
    }
    return changed;
  }

  // Volá se před každým uložením a vykreslením. Vrací true, když něco změnilo.
  function reconcile() {
    const b = D().business;
    if (!b || !Array.isArray(b.income)) return false;
    ensure();
    fresh();
    let changed = renumber();
    if (linkExpenses()) { changed = true; renumber(); fresh(); }
    if (linkPeriods()) changed = true;
    fresh();
    return changed;
  }

  // Rezerva odložená přímo v Podnikání: řádek v měsíci se přepne s ní.
  function setReserve(e, on) {
    e.reserve = on ? { amount: reserveOf(e), date: todayIso() } : null;
    fresh();
    for (const p of D().periods) {
      for (const it of p.blocks.flatMap((bl) => bl.items)) {
        if (it.id !== 'br-' + e.id) continue;
        if (on) { it.paid = true; it.paidAt = e.reserve.date; it.plan = e.reserve.amount; }
        else { delete it.paid; delete it.paidAt; }
      }
    }
  }
  function setMoveDone(m, on) {
    m.done = on;
    m.doneAt = on ? todayIso() : undefined;
    for (const p of D().periods) {
      for (const it of p.blocks.flatMap((bl) => bl.items)) {
        if (it.id !== 'bm-' + m.id) continue;
        if (on) { it.paid = true; it.paidAt = m.doneAt; } else { delete it.paid; delete it.paidAt; }
      }
    }
  }

  /* ------------------------------------------------------------
     Uložení a překreslení
     ------------------------------------------------------------ */
  function commit(message, withUndo = true) {
    reconcile();
    api.renderAll();
    api.save();
    if (message) toast(message, withUndo ? 'Vrátit zpět' : undefined, withUndo ? undo : undefined);
  }

  /* ------------------------------------------------------------
     Vykreslení
     ------------------------------------------------------------ */
  function render() {
    ensure();
    fresh();
    const host = document.getElementById('viewPodnikani');
    if (!host) return;
    const y = currentYear();
    const Y = yearData(y);
    const body = tab === 'denik' ? renderDenik(Y) : tab === 'dane' ? renderDane(Y) : renderPrehled(Y);
    host.replaceChildren(renderBar(), ...body);
  }

  function renderBar() {
    const seg = h('div', { class: 'segmented biz-tabs', role: 'tablist', 'aria-label': 'Podnikání' });
    for (const [k, label] of [['prehled', 'Přehled'], ['denik', 'Příjmy a výdaje'], ['dane', 'Daně']]) {
      seg.append(h('button', {
        type: 'button', class: 'seg' + (tab === k ? ' is-on' : ''), role: 'tab',
        'aria-selected': String(tab === k), text: label,
        onclick: () => { tab = k; render(); scrollTo(0, 0); },
      }));
    }
    const ys = years();
    let yearSel = null;
    if (ys.length > 1) {
      yearSel = h('select', { class: 'sf-select biz-year', 'aria-label': 'Rok' },
        ys.map((y) => h('option', { value: String(y), text: `Rok ${y}` })));
      yearSel.value = String(currentYear());
      yearSel.addEventListener('change', () => { year = Number(yearSel.value); api.renderAll(); });
    }
    const actions = h('div', { class: 'biz-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEntry(null, { type: 'prijem' }) }, ico('i-plus'), 'Příjem'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openEntry(null, { type: 'vydaj' }) }, ico('i-plus'), 'Výdaj'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: quickCapture, title: 'Vyfotit účtenku a doplnit ji hned nebo později' }, ico('c-camera'), 'Účtenka'),
    );
    return h('div', { class: 'biz-bar' }, seg, yearSel, actions);
  }

  /* ---------- Přehled ---------- */
  function renderPrehled(Y) {
    const s = S();
    const out = [];
    if (!s.start) out.push(renderSetup());
    out.push(renderHero(Y));
    out.push(renderFigures(Y));
    const att = renderAttention(Y);
    if (att) out.push(att);
    out.push(section('Hranice pro rok ' + Y.y, 'Od kdy co platíš a kolik ti ještě zbývá.', renderLimits(Y, true)));
    const terms = renderTerms();
    if (terms) out.push(terms);
    if (s.start) {
      const done = CHECKLIST.filter(([k]) => B().checklist[k]).length;
      if (done < CHECKLIST.length) out.push(renderChecklist(false));
    }
    return out;
  }

  function section(title, note, ...content) {
    return h('section', { class: 'biz-section' },
      h('div', { class: 'section-head' }, h('h3', { text: title }), note ? h('p', { class: 'section-note', text: note }) : null),
      ...content);
  }

  function renderSetup() {
    const d = D();
    const s = S();
    const tops = d.accounts.filter((a) => !a.parent);
    const savings = tops.find((a) => /spor|spoř/i.test(a.name + ' ' + a.id)) || tops[1] || tops[0];
    const date = h('input', { type: 'date', class: 'sf-input', value: s.start || todayIso(), 'aria-label': 'Den zahájení živnosti' });
    const acc = h('select', { class: 'sf-select', 'aria-label': 'Kam odkládat peníze na daně' });
    if (savings) acc.append(h('option', { value: 'new:' + savings.id, text: `Nový podúčet Daně u ${savings.name}` }));
    for (const a of d.accounts) acc.append(h('option', { value: a.id, text: a.parent ? `${a.name} (část ${d.accounts.find((x) => x.id === a.parent)?.name || ''})` : a.name }));
    acc.append(h('option', { value: '', text: 'Nikam, jen ukazovat' }));
    return h('section', { class: 'biz-setup glass' },
      h('h3', { text: 'Než začneš' }),
      h('p', { text: 'Den zahájení živnosti potřebuju kvůli hranici pro sociální pojištění: v prvním roce se zkracuje podle měsíců, kdy podnikáš. Přesné datum najdeš ve výpisu z živnostenského rejstříku, zatím stačí odhad.' }),
      h('div', { class: 'biz-setup-grid' },
        h('label', { class: 'sf-field' }, h('span', { class: 'sf-label', text: 'Podnikám od' }), date),
        h('label', { class: 'sf-field' }, h('span', { class: 'sf-label', text: 'Peníze na daně posílám na' }), acc),
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            if (!date.value) { date.focus(); return; }
            snapshot();
            s.start = date.value;
            s.reserveAccount = resolveAccount(acc.value);
            commit('Podnikání nastavené. Příjmy a rezervy se teď propisují i do měsíce.');
          },
        }, 'Uložit'),
      ));
  }

  // „new:<id>“ = založit podúčet Daně pod tím účtem.
  function resolveAccount(v) {
    if (!v) return null;
    if (!v.startsWith('new:')) return v;
    const parent = v.slice(4);
    const d = D();
    const existing = d.accounts.find((a) => a.parent === parent && /dan/.test(bez(a.name)));
    if (existing) return existing.id;
    const id = 'dane';
    const acc = { id: d.accounts.some((a) => a.id === id) ? uid() : id, name: 'Daně', note: 'rezerva na daně z podnikání', parent };
    d.accounts.push(acc);
    return acc.id;
  }

  function renderHero(Y) {
    const c = Y.calc;
    const pending = Y.inc.filter((e) => !e.reserve && (Y.rezervy.get(e.id) || 0) > 0);
    const odlozit = Y.kOdlozeni + Math.max(0, Y.zbytek);
    const rate = dane.sazbaNaKorunu(c);
    const ratePo = dane.sazbaPoPriznani(c);

    const left = h('div', { class: 'biz-hero-main' },
      h('p', { class: 'biz-hero-label', text: 'Odlož na daně' }),
      h('strong', { class: 'biz-hero-amount', text: fmtCzk(Math.max(0, odlozit)) }),
      h('p', { class: 'biz-hero-sub', text: odlozit > 0
        ? (pending.length ? `z ${pending.length} ${skloneni(pending.length, 'platby', 'plateb', 'plateb')}${Y.zbytek > 0 ? ' a dorovnání' : ''}` : 'dorovnání rezervy')
        : Y.inc.length ? 'Rezerva sedí. Máš odloženo, co zatím vychází.' : 'Až zapíšeš první příjem, spočítám, kolik z něj dát stranou.' }),
    );
    if (pending.length) {
      left.append(h('button', {
        type: 'button', class: 'btn btn-primary biz-hero-btn',
        onclick: () => {
          snapshot();
          for (const e of pending) setReserve(e, true);
          commit(`Odloženo ${fmtCzk(sum(pending, (e) => e.reserve.amount))} na daně.`);
        },
      }, ico('i-check'), pending.length === 1 ? 'Mám odloženo' : `Mám odloženo všech ${pending.length}`));
    }
    if (Y.zbytek > 50 && !pending.length) {
      left.append(h('button', { type: 'button', class: 'btn btn-primary biz-hero-btn', onclick: () => addMove(Y.y, Y.zbytek) }, 'Dorovnat rezervu'));
    }

    const right = h('div', { class: 'biz-hero-side' });
    const dl = h('dl', { class: 'biz-break' },
      row('Daň z příjmů', c.priznani ? fmtCzk(c.dan) : 'zatím 0 Kč'),
      row('Zdravotní pojištění', fmtCzk(c.zdr)),
      row('Sociální pojištění', c.socPovinne ? fmtCzk(c.soc) : '0 Kč, pod hranicí'),
      row(`Celkem za rok ${Y.y}`, fmtCzk(c.celkem), 'is-total'),
      row('Odloženo', fmtCzk(Y.odlozeno)),
    );
    right.append(dl);
    if (Y.zbytek < -50) right.append(h('p', { class: 'biz-hero-note', text: `Máš odloženo o ${fmtCzk(-Y.zbytek)} víc, než zatím vychází. Nevadí, na jaře to přijde vhod.` }));
    right.append(h('p', { class: 'biz-hero-note', text: c.priznani
      ? `Z každé další platby odlož zhruba ${pct(rate)}.`
      : `Teď odkládáš ${pct(rate)} z každé platby (jen zdravotní). Po 20 000 Kč příjmů to bude ${pct(ratePo)}.` }));
    for (const j of dane.skoky(c)) {
      if (j.co === 'priznani' && j.zbyva > 0) {
        right.append(h('p', { class: 'biz-jump', text: `Do 20 000 Kč příjmů zbývá ${fmtCzk(j.zbyva)}. Pak podáváš přiznání a přibude daň asi ${fmtCzk(j.pridej)} najednou.` }));
      }
      if (j.co === 'socialni' && j.zbyva > 0 && j.zbyva < j.prijmyNaHranici * 0.4) {
        right.append(h('p', { class: 'biz-jump is-warn', text: `Blížíš se hranici pro sociální pojištění: zbývá ${fmtCzk(j.zbyva)} příjmů. Až ji přeskočíš, přibude najednou ${fmtCzk(j.pridej)}.` }));
      }
    }

    const card = h('section', { class: 'biz-hero glass', 'aria-label': 'Rezerva na daně' }, left, right);
    const wrap = [card];
    if (pending.length) {
      const list = h('ul', { class: 'biz-pending' });
      for (const e of pending) {
        list.append(h('li', {},
          reserveCheck(e),
          h('button', { type: 'button', class: 'biz-pending-main', onclick: () => openEntry(e) },
            h('b', { text: titleOf(e) }),
            h('span', { text: `${shortDate(e.date)} · přišlo ${fmtCzk(e.amount)}` })),
          h('span', { class: 'biz-pending-amount', text: fmtCzk(Y.rezervy.get(e.id) || 0) }),
        ));
      }
      wrap.push(h('div', { class: 'biz-card biz-pending-card' },
        h('p', { class: 'biz-card-title', text: 'Z těchhle plateb ještě odlož' }), list));
    }
    return h('div', { class: 'biz-hero-wrap' }, ...wrap);

    function row(label, value, cls = '') {
      return h('div', { class: cls }, h('dt', { text: label }), h('dd', { text: value }));
    }
  }

  function reserveCheck(e) {
    const on = !!e.reserve;
    const amount = on ? e.reserve.amount : reserveOf(e);
    const lbl = h('label', { class: 'pay-check', title: on ? `Odloženo ${fmtCzk(amount)} ${fmtDate(e.reserve.date)}` : `Označit ${fmtCzk(amount)} jako odložené` });
    const box = h('input', { type: 'checkbox', checked: on, 'aria-label': `Odloženo na daně – ${titleOf(e)}` });
    box.addEventListener('change', () => {
      snapshot();
      setReserve(e, box.checked);
      commit(box.checked ? `${titleOf(e)}: odloženo ${fmtCzk(e.reserve.amount)}.` : `${titleOf(e)}: odložení zrušené.`);
    });
    const vis = document.createElement('span');
    vis.className = 'pay-box';
    vis.setAttribute('aria-hidden', 'true');
    vis.append(ico('i-check'));
    lbl.append(box, vis);
    return lbl;
  }

  function addMove(y, amount) {
    const b = B();
    snapshot();
    const m = { id: uid(), date: todayIso(), year: y, amount: Math.round(amount), note: 'Dorovnání rezervy na daně', done: false };
    b.moves.push(m);
    const linked = S().link.reserve && accountOk(S().reserveAccount) && periodFor(m.date);
    if (!linked) setMoveDone(m, true);
    commit(linked
      ? `Dorovnání ${fmtCzk(m.amount)} je v měsíci mezi platbami. Odškrtni ho, až peníze pošleš.`
      : `Dorovnáno ${fmtCzk(m.amount)}.`);
  }

  function renderFigures(Y) {
    const c = Y.calc;
    const pend = B().income.filter((e) => !e.date && e.amount > 0);
    const fig = (label, value, sub, hero) => h('div', { class: 'figure' + (hero ? ' figure--hero' : '') },
      h('dt', { text: label }), h('dd', { text: value }), sub ? h('p', { class: 'figure-sub', text: sub }) : null);
    const vydSub = c.druh === 'pausal'
      ? `počítá se paušál ${S().pausal} % = ${fmtCzk(c.pausal.vydaje)}`
      : 'skutečné výdaje vyšly líp než paušál';
    return h('section', { class: 'summary', 'aria-label': 'Souhrn roku' },
      h('dl', { class: 'figures' },
        fig(`Příjmy ${Y.y}`, fmtCzk(Y.prijmy), `${Y.inc.length} ${skloneni(Y.inc.length, 'platba', 'platby', 'plateb')}`),
        fig('Výdaje', fmtCzk(Y.vydaje), vydSub),
        fig('Zisk pro daně', fmtCzk(Math.max(0, c.zisk)), c.zisk < 0 ? `ztráta ${fmtCzk(-c.zisk)}`
          : S().start ? `${Y.mesice} ${skloneni(Y.mesice, 'měsíc', 'měsíce', 'měsíců')} podnikání v roce ${Y.y}` : 'příjmy minus výdaje', true),
        fig('Čeká na zaplacení', fmtCzk(sum(pend, (e) => e.amount)), pend.length ? `${pend.length} ${skloneni(pend.length, 'faktura', 'faktury', 'faktur')}` : 'nic'),
      ));
  }

  function renderAttention(Y) {
    const b = B();
    const items = [];
    const drafts = b.expenses.filter((e) => e.draft);
    if (drafts.length) items.push([`${drafts.length} ${skloneni(drafts.length, 'účtenka čeká', 'účtenky čekají', 'účtenek čeká')} na doplnění částky`, () => goDenik('doplnit')]);
    const noDoc = [...Y.inc, ...Y.exp].filter((e) => !(e.files || []).length);
    if (noDoc.length) items.push([`${noDoc.length} ${skloneni(noDoc.length, 'záznam nemá', 'záznamy nemají', 'záznamů nemá')} doklad`, () => goDenik('bezdokladu')]);
    const overdue = b.income.filter((e) => !e.date && e.due && e.due < todayIso());
    if (overdue.length) items.push([`${overdue.length} ${skloneni(overdue.length, 'faktura je', 'faktury jsou', 'faktur je')} po splatnosti`, () => goDenik('ceka')]);
    const foreign = Y.exp.filter((e) => e.foreign);
    if (foreign.length && !b.checklist.io) items.push([`${foreign.length} ${skloneni(foreign.length, 'služba', 'služby', 'služeb')} ze zahraničí: možná jsi identifikovaná osoba k DPH`, () => { tab = 'dane'; render(); document.getElementById('bizForeign')?.scrollIntoView({ block: 'start' }); }]);
    const early = [...b.income, ...b.expenses].filter(beforeStart);
    if (early.length) items.push([`${early.length} ${skloneni(early.length, 'záznam je', 'záznamy jsou', 'záznamů je')} z doby před začátkem živnosti, do daní se ${skloneni(early.length, 'nepočítá', 'nepočítají', 'nepočítá')}`, () => goDenik('vse')]);
    if (Y.calc.par.odhad) items.push([`Čísla pro rok ${Y.y} zatím neznám, počítám s rokem ${Y.calc.par.podle}`, () => { tab = 'dane'; render(); }]);
    if (api.syncConfig() && docs.pending()) items.push([`${docs.pending()} ${skloneni(docs.pending(), 'doklad čeká', 'doklady čekají', 'dokladů čeká')} na odeslání na GitHub`, () => api.syncNow()]);
    if (!items.length) return null;
    return section('Potřebuje pozornost', null, h('ul', { class: 'biz-todo' }, items.map(([text, fn]) => h('li', {},
      h('button', { type: 'button', onclick: fn }, ico('i-alert'), h('span', { text }), ico('i-chevron'))))));
  }

  function goDenik(f) { tab = 'denik'; filter = f; query = ''; render(); scrollTo(0, 0); }

  function renderTerms() {
    const list = upcoming().slice(0, 6);
    if (!list.length) return null;
    return section('Termíny', 'Co tě čeká a do kdy.', h('ul', { class: 'biz-terms' }, list.map((t) => h('li', { class: t.warn ? 'is-warn' : '' },
      h('span', { class: 'biz-term-date' }, h('b', { text: shortDate(t.date) }), h('span', { text: kdy(t.date) })),
      h('span', { class: 'biz-term-text' }, h('b', { text: t.title }), t.note ? h('span', { text: t.note }) : null)))));
  }

  function upcoming() {
    const b = B();
    const s = b.settings;
    const today = todayIso();
    const out = [];
    if (s.start) {
      const tz = dane.terminyZahajeni(s.start);
      if (!b.checklist.cssz) out.push({ date: tz.cssz, title: 'Oznámit ČSSZ zahájení vedlejší činnosti', note: 'Když to neposlal živnostenský úřad.' });
      if (!b.checklist.zp) out.push({ date: tz.zp, title: 'Oznámit zdravotní pojišťovně zahájení' });
      if (!b.checklist.ucet) out.push({ date: tz.ucetFu, title: 'Oznámit finančnímu úřadu číslo účtu' });
    }
    const now = Number(today.slice(0, 4));
    for (const y of years()) {
      if (y > now) continue;
      const Y = yearData(y);
      const t = Y.terminy;
      if (y === now || t.prehledy >= today) {
        if (y < now || Y.inc.length || s.start) {
          out.push({ date: `${t.rokPodani}-02-10`, title: `Potvrzení o zdanitelných příjmech ${y}`, note: 'Řekni si o něj zaměstnavateli. Budeš ho potřebovat do přiznání.' });
        }
        if (t.dap) out.push({ date: t.dap, title: `Daňové přiznání za ${y}`, note: `Elektronicky přes Moje daně. Daň z podnikání asi ${fmtCzk(Y.calc.dan)}.` });
        out.push({ date: t.prehledy, title: `Přehledy pro ČSSZ a pojišťovnu za ${y}`, note: `Pak do 8 dnů doplatíš zdravotní ${fmtCzk(Y.calc.zdr)}${Y.calc.socPovinne ? ` a sociální ${fmtCzk(Y.calc.soc)}` : ''}.` });
      }
      for (const [ym, list] of foreignByMonth(Y.exp)) {
        const due = dane.terminDphZaMesic(ym);
        if (due >= today) out.push({ date: due, title: `DPH za služby ze zahraničí, ${monthName(ym)}`, note: `${fmtCzk(Math.round(sum(list, (e) => e.amount) * dane.SAZBY.dph))} (${[...new Set(list.map(titleOf))].join(', ')}). Jen když jsi identifikovaná osoba.`, warn: true });
      }
    }
    for (const e of b.income) {
      if (!e.date && e.due && e.amount > 0) out.push({ date: e.due, title: `Splatnost: ${titleOf(e)}`, note: `${fmtCzk(e.amount)}${e.due < today ? ', po splatnosti' : ''}`, warn: e.due < today });
    }
    return out.filter((t) => t.date >= today || t.warn).sort((a, z) => a.date.localeCompare(z.date));
  }

  function monthName(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${MESICE[m - 1]} ${y}`;
  }
  function foreignByMonth(exp) {
    const map = new Map();
    for (const e of exp) {
      if (!e.foreign) continue;
      const ym = e.date.slice(0, 7);
      map.set(ym, [...(map.get(ym) || []), e]);
    }
    return [...map].sort((a, z) => a[0].localeCompare(z[0]));
  }

  /* ---------- Hranice ---------- */
  function renderLimits(Y, compact) {
    const c = Y.calc;
    const t = Y.terminy;
    const rows = [];
    const meter = (value, max, over) => {
      const m = h('div', { class: 'meter limit-meter' });
      const f = h('div', { class: 'meter-fill' + (over ? ' is-crossed' : '') });
      f.style.width = Math.min(100, max ? (value / max) * 100 : 0) + '%';
      m.append(f);
      return m;
    };
    const limit = (title, status, meterEl, text) => h('li', { class: 'limit' + (status === 'nad' ? ' is-over' : '') },
      h('div', { class: 'limit-head' }, h('b', { text: title }), h('span', { class: 'tag' + (status === 'nad' ? ' is-on' : ''), text: status === 'nad' ? 'platíš' : status === 'pod' ? 'zatím ne' : 'vždy' })),
      meterEl, h('p', { text }));

    rows.push(limit('Daňové přiznání a daň 15 %', c.priznani ? 'nad' : 'pod',
      meter(Y.prijmy, dane.LIMITY.priznani, c.priznani),
      c.priznani
        ? `Příjmy ${fmtCzk(Y.prijmy)} jsou přes 20 000 Kč, takže přiznání podáváš${t.dap ? ` do ${fmtDate(t.dap)}` : ''}. Daň 15 % ze zisku: ${fmtCzk(c.dan)}.`
        : `Do 20 000 Kč příjmů za rok (hrubých, ne zisku) přiznání nepodáváš a daň z podnikání neplatíš. Zbývá ${fmtCzk(dane.LIMITY.priznani - Y.prijmy)}.`));

    const soc = dane.skoky(c).find((j) => j.co === 'socialni');
    const pausalNote = c.druh === 'pausal' ? ` S paušálem ${c.pausalPct} % to je ${fmtCzk(Math.ceil(c.hranice / (1 - c.pausalPct / 100)))} příjmů.` : '';
    const zkraceno = Y.mesice < 12 && Y.mesice > 0 ? ` Hranice je zkrácená na ${Y.mesice} ${skloneni(Y.mesice, 'měsíc', 'měsíce', 'měsíců')}, kdy podnikáš (za celý rok ${fmtCzk(c.par.rozhodna)}).` : '';
    rows.push(limit('Sociální pojištění', c.socPovinne ? 'nad' : 'pod',
      meter(Math.max(0, c.zisk), c.hranice, c.socPovinne),
      c.socPovinne
        ? `Zisk ${fmtCzk(c.zisk)} je přes hranici ${fmtCzk(c.hranice)}. Platíš 29,2 % z ${fmtCzk(c.socVZ)}: ${fmtCzk(c.soc)}. Od dalšího roku k tomu měsíční zálohy.`
        : `Pod ${fmtCzk(c.hranice)} zisku neplatíš nic.${zkraceno}${pausalNote}${soc ? ` Až hranici přeskočíš, přibude najednou ${fmtCzk(soc.pridej)}.` : ''}`));

    rows.push(limit('Zdravotní pojištění', 'vzdy', null,
      `Hranice není: 6,75 % z každé koruny zisku, letos zatím ${fmtCzk(c.zdr)}. Zálohy neplatíš, minimum za tebe hradí zaměstnavatel. Doplácí se jednou za rok po přehledu.`));

    if (!compact || Y.prijmy > 200000) {
      rows.push(limit('Plátce DPH', Y.prijmy > dane.LIMITY.dph ? 'nad' : 'pod',
        meter(Y.prijmy, dane.LIMITY.dph, Y.prijmy > dane.LIMITY.dph),
        `Plátcem se stáváš až nad 2 000 000 Kč obratu za kalendářní rok (nad 2 536 500 Kč hned). Zbývá ${fmtCzk(Math.max(0, dane.LIMITY.dph - Y.prijmy))}.`));
    }
    const foreign = Y.exp.filter((e) => e.foreign);
    rows.push(limit('Služby ze zahraničí', foreign.length ? 'nad' : 'pod', null,
      foreign.length
        ? `Tady hranice není. ${foreign.length} ${skloneni(foreign.length, 'výdaj', 'výdaje', 'výdajů')} od firem ze zahraničí, z nich se odvádí DPH 21 %, i když plátce nejsi. Probrat s účetní.`
        : 'Tady hranice není. Když pro podnikání koupíš službu od firmy ze zahraničí (Adobe, reklama na Meta), odvádíš z ní DPH 21 %.'));
    return h('ul', { class: 'limit-list' }, rows);
  }

  /* ---------- Deník ---------- */
  function matches(e, q) {
    if (!q) return true;
    const cat = isIncome(e) ? catOf(KAT_PRIJMY, e.cat)[1] : catOf(KAT_VYDAJE, e.cat)[1];
    const amount = e.amount != null ? `${e.amount} ${fmtCzk(e.amount)} ${String(e.amount).replace('.', ',')}` : '';
    const hay = bez([e.no, e.label, e.client, e.supplier, e.note, e.invoiceNo, cat, amount,
      e.date, e.date && fmtDate(e.date), e.issued && fmtDate(e.issued),
      e.date && monthName(e.date.slice(0, 7)), ...(e.files || []).map((f) => f.name)].join(' '));
    return bez(q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t) || hay.replace(/\s/g, '').includes(t));
  }

  function renderDenik(Y) {
    const search = h('input', {
      type: 'search', class: 'sf-input biz-search', placeholder: 'Hledat: Lidl, 1290, říjen, V26-004…',
      value: query, 'aria-label': 'Hledat v příjmech a výdajích', autocomplete: 'off', enterkeyhint: 'search',
    });
    const seg = h('div', { class: 'chips biz-filters', role: 'group', 'aria-label': 'Filtr' });
    const body = h('div', { class: 'biz-journal', 'aria-live': 'polite' });
    // Při psaní se překresluje jen seznam, pole zůstane – na telefonu
    // by se jinak s každým písmenem zavřela klávesnice.
    search.addEventListener('input', () => { query = search.value; paintJournal(Y, seg, body); });
    paintJournal(Y, seg, body);
    return [h('div', { class: 'biz-journal-tools' }, search, seg), body];
  }

  function paintJournal(Y, seg, body) {
    fresh();
    const b = B();
    let list = [
      ...b.income.filter((e) => entryYear(e) === Y.y || !e.date),
      ...b.expenses.filter((e) => entryYear(e) === Y.y || e.draft),
    ];
    const noDoc = (e) => !(e.files || []).length;
    const counts = {
      vse: list.length,
      prijmy: list.filter(isIncome).length,
      vydaje: list.filter((e) => !isIncome(e)).length,
      bezdokladu: list.filter(noDoc).length,
      ceka: b.income.filter((e) => !e.date).length,
      doplnit: b.expenses.filter((e) => e.draft).length,
    };
    const f = {
      prijmy: isIncome, vydaje: (e) => !isIncome(e), bezdokladu: noDoc,
      ceka: (e) => isIncome(e) && !e.date, doplnit: (e) => !!e.draft,
    }[filter];
    if (f) list = list.filter(f);
    list = list.filter((e) => matches(e, query));
    list.sort((a, z) => (z.date || z.issued || '9999').localeCompare(a.date || a.issued || '9999') || (z.created || '').localeCompare(a.created || ''));

    seg.replaceChildren();
    for (const [k, label] of [['vse', 'Vše'], ['prijmy', 'Příjmy'], ['vydaje', 'Výdaje'], ['bezdokladu', 'Bez dokladu'], ['ceka', 'Čeká na platbu'], ['doplnit', 'K doplnění']]) {
      if ((k === 'ceka' || k === 'doplnit') && !counts[k] && filter !== k) continue;
      seg.append(h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(filter === k),
        onclick: () => { filter = k; paintJournal(Y, seg, body); },
      }, `${label} ${counts[k]}`));
    }

    const groups = new Map();
    for (const e of list) {
      const key = e.draft ? 'doplnit' : e.date ? e.date.slice(0, 7) : 'ceka';
      groups.set(key, [...(groups.get(key) || []), e]);
    }
    const rank = (k) => (k === 'doplnit' ? '0' : k === 'ceka' ? '1' : '2' + (9999 - Number(k.slice(0, 4))) + String(99 - Number(k.slice(5))).padStart(2, '0'));
    const order = [...groups.keys()].sort((a, z) => rank(a).localeCompare(rank(z)));

    body.replaceChildren();
    if (!list.length) {
      body.append(h('p', { class: 'sl-empty', text: query ? `Nic neodpovídá „${query}“.` : filter === 'vse' ? 'Zatím tu nic není. Zapiš první příjem nebo výdaj tlačítky nahoře.' : 'V tomhle filtru nic není.' }));
    }
    for (const key of order) {
      const items = groups.get(key);
      const inc = sum(items.filter(isIncome), (e) => e.amount);
      const out = sum(items.filter((e) => !isIncome(e)), (e) => e.amount);
      const title = key === 'doplnit' ? 'K doplnění' : key === 'ceka' ? 'Čeká na zaplacení' : `${MESICE_1[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
      const head = h('div', { class: 'j-head' }, h('h4', { text: title }),
        h('span', { text: [inc ? `+${fmtCzk(inc)}` : '', out ? `−${fmtCzk(out)}` : ''].filter(Boolean).join(' · ') }));
      body.append(h('section', { class: 'j-group' }, head, h('ul', { class: 'j-list' }, items.map(journalRow))));
    }
  }

  function journalRow(e) {
    const inc = isIncome(e);
    const cat = inc ? catOf(KAT_PRIJMY, e.cat) : catOf(KAT_VYDAJE, e.cat);
    const nFiles = (e.files || []).length;
    const meta = [e.no, counterparty(e) && counterparty(e) !== e.label ? counterparty(e) : '', cat[1]];
    if (inc && !e.date) meta.push(e.due ? `splatnost ${fmtDate(e.due)}` : 'nezaplaceno');
    if (!inc && e.deductible === false) meta.push('neuznatelný');
    else if (!inc && (e.share ?? 100) < 100) meta.push(`${e.share} % pro podnikání`);
    if (e.fromBudget) meta.push('z rozpočtu');
    if (beforeStart(e)) meta.push('před zahájením, nepočítá se');

    const doc = nFiles
      ? h('span', { class: 'j-doc', title: `${nFiles} ${skloneni(nFiles, 'doklad', 'doklady', 'dokladů')}` }, ico('i-clip'), nFiles > 1 ? String(nFiles) : null)
      : h('span', { class: 'j-doc is-missing', title: 'Chybí doklad' }, 'bez dokladu');

    const main = h('button', { type: 'button', class: 'j-main', onclick: () => openEntry(e), 'aria-label': `${titleOf(e)}, ${inc ? 'příjem' : 'výdaj'} ${fmtCzk(e.amount || 0)}. Upravit.` },
      h('span', { class: 'j-icon' + (inc ? ' is-in' : '') }, ico(cat[2])),
      h('span', { class: 'j-text' },
        h('b', { text: e.draft && !e.amount ? 'Účtenka k doplnění' : titleOf(e) }),
        h('span', { text: meta.filter(Boolean).join(' · ') })),
      h('span', { class: 'j-date', text: e.date ? shortDate(e.date) : e.issued ? `vyst. ${shortDate(e.issued)}` : '' }),
      doc,
      h('span', { class: 'j-amount' + (inc ? ' is-in' : ''), text: e.amount ? `${inc ? '+' : '−'}${fmtCzk(e.amount)}` : '–' }),
    );
    const li = h('li', { class: 'j-row' + (inc && !e.date ? ' is-pending' : '') + (e.draft ? ' is-draft' : '') }, main);
    if (inc && e.date) {
      li.append(h('span', { class: 'j-res', title: 'Odloženo na daně' }, reserveCheck(e),
        h('span', { class: 'j-res-amount', text: fmtCzk(e.reserve ? e.reserve.amount : reserveOf(e)) })));
    } else if (inc) {
      li.append(h('button', {
        type: 'button', class: 'btn btn-quiet j-paid',
        onclick: () => { snapshot(); e.date = todayIso(); commit(`${titleOf(e)}: zaplaceno dnes. Datum změníš v detailu.`); },
      }, 'Přišlo'));
    } else {
      li.append(h('span', { class: 'j-res' }));
    }
    return li;
  }

  /* ---------- Daně ---------- */
  function renderDane(Y) {
    const out = [];
    out.push(section(`Přiznání za rok ${Y.y}`, Y.mesice < 12 ? `Podnikáš ${Y.mesice} ${skloneni(Y.mesice, 'měsíc', 'měsíce', 'měsíců')} z roku.` : null, renderCompare(Y)));
    out.push(section('Co kam vyplníš', 'Čísla podle dosavadních záznamů. Na konci roku sedí přesně.', renderFill(Y)));
    out.push(section('Hranice', 'Od kdy co platíš.', renderLimits(Y, false)));
    out.push(section('Čísla pro jednotlivé roky', 'Mění se každý rok. Vláda je schvaluje v září na další rok.', renderYearTable()));
    const foreign = renderForeign(Y);
    if (foreign) out.push(foreign);
    out.push(section('Zaplaceno', 'Daně, pojištění a zálohy, které už jsi poslal. Na účtu Daně by pak mělo zůstat, co ukazuje řádek dole.', renderPayments(Y)));
    out.push(section('Pro účetní a na konec roku', null, renderExport(Y)));
    out.push(renderChecklist(true));
    out.push(renderSettings());
    const strop = 36 * Y.calc.par.prumernaMzda;
    out.push(h('p', { class: 'biz-small', text: `Počítá se s vedlejší činností při zaměstnání: slevu na poplatníka uplatňuje zaměstnavatel, zdravotní pojištění nemá minimum a sociální se platí jen nad rozhodnou částkou. Daň 15 % platí, dokud mzda a zisk dohromady nepřesáhnou ${fmtCzk(strop)} za rok, nad tím 23 %. Nejsem daňový poradce, před podáním si čísla ověř s účetní.` }));
    return out;
  }

  function renderCompare(Y) {
    const c = Y.calc;
    const P = c.pausal, Sk = c.skutecne;
    const rows = [
      ['Příjmy', Y.prijmy, Y.prijmy],
      ['Výdaje', P.vydaje, Sk.vydaje],
      ['Zisk', P.zisk, Sk.zisk],
      ['Daň z příjmů', P.dan, Sk.dan],
      ['Zdravotní pojištění', P.zdr, Sk.zdr],
      ['Sociální pojištění', P.soc, Sk.soc],
      ['Celkem odvedeš', P.celkem, Sk.celkem],
    ];
    const th = (text, on) => h('th', { class: 'num' + (on ? ' is-chosen' : ''), text });
    const table = h('table', { class: 'cmp-table' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), th(`Paušál ${S().pausal} %`, c.druh === 'pausal'), th('Skutečné výdaje', c.druh === 'skutecne'))),
      h('tbody', {}, rows.map(([label, a, z], i) => h('tr', { class: i === rows.length - 1 ? 'is-total' : '' },
        h('td', { text: label }),
        h('td', { class: 'num' + (c.druh === 'pausal' ? ' is-chosen' : ''), text: fmtCzk(a) }),
        h('td', { class: 'num' + (c.druh === 'skutecne' ? ' is-chosen' : ''), text: fmtCzk(z) })))));
    const diff = Math.abs(P.celkem - Sk.celkem);
    const why = S().rezim === 'auto'
      ? (c.lepsi === 'pausal'
        ? `Paušál vychází líp${diff ? ` o ${fmtCzk(diff)}` : ''}. Výdaje pak nemusíš dokládat, doklady si ale schovej.`
        : `Skutečné výdaje vychází líp o ${fmtCzk(diff)}. Pak ale musíš mít doklad ke každému výdaji.`)
      : `Nastavené natvrdo: ${c.druh === 'pausal' ? 'paušál' : 'skutečné výdaje'}. ${c.lepsi !== c.druh ? `Druhá varianta by vyšla o ${fmtCzk(diff)} líp.` : ''}`;
    return [h('div', { class: 'table-wrap' }, table), h('p', { class: 'biz-note', text: why })];
  }

  function renderFill(Y) {
    const c = Y.calc;
    const t = Y.terminy;
    const z = dane.zalohyPristiRok(c);
    const box = (title, when, rows, note) => h('div', { class: 'fill-box' },
      h('div', { class: 'fill-head' }, h('b', { text: title }), when ? h('span', { text: when }) : null),
      h('dl', {}, rows.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))),
      note ? h('p', { class: 'hint', text: note }) : null);
    const dap = c.priznani
      ? box('Daňové přiznání, příloha č. 1', t.dap ? `do ${fmtDate(t.dap)}` : '', [
        ['Příjmy (ř. 101)', fmtCzk(Y.prijmy)],
        ['Výdaje (ř. 102)', fmtCzk(c.vydaje)],
        ['Způsob výdajů', c.druh === 'pausal' ? `procentem z příjmů, ${c.pausalPct} %` : 'skutečné (daňová evidence)'],
        ['Zisk z podnikání', fmtCzk(Math.max(0, c.zisk))],
        ['Daň z něj navíc', fmtCzk(c.dan)],
      ], 'Přiznání podáváš celé i se mzdou z Potvrzení od zaměstnavatele. Elektronicky přes Moje daně, máš datovou schránku.')
      : box('Daňové přiznání', 'nemusíš', [['Příjmy z podnikání', fmtCzk(Y.prijmy)]], 'Do 20 000 Kč příjmů přiznání nepodáváš a zaměstnavatel ti udělá roční zúčtování. Přehledy ale podáváš vždycky.');
    const cssz = box('Přehled pro ČSSZ', `do ${fmtDate(t.prehledy)}`, [
      ['Příjmy / výdaje', `${fmtCzk(Y.prijmy)} / ${fmtCzk(c.vydaje)}`],
      ['Měsíce vedlejší činnosti', String(Y.mesice)],
      ['Rozhodná částka', fmtCzk(c.hranice)],
      ['Vyměřovací základ', c.socPovinne ? fmtCzk(c.socVZ) : 'pod hranicí'],
      ['Pojistné', fmtCzk(c.soc)],
      ...(z.socialni ? [['Záloha od dalšího roku', `${fmtCzk(z.socialni)} měsíčně`]] : []),
    ], 'Přes ePortál ČSSZ. Doplatek do 8 dnů od podání.');
    const zp = box('Přehled pro zdravotní pojišťovnu', `do ${fmtDate(t.prehledy)}`, [
      ['Zisk', fmtCzk(Math.max(0, c.zisk))],
      ['Vyměřovací základ (50 %)', fmtCzk(c.zdrVZ)],
      ['Pojistné (13,5 %)', fmtCzk(c.zdr)],
      ['Zálohy', 'neplatíš, jsi zaměstnaný'],
    ], 'Na portálu své pojišťovny. Doplatek do 8 dnů od podání.');
    return h('div', { class: 'fill-grid' }, dap, cssz, zp);
  }

  function renderYearTable() {
    const ys = Object.keys(dane.ROKY).map(Number).sort((a, z) => a - z);
    const col = (y) => {
      const p = dane.ROKY[y];
      return [
        fmtCzk(p.prumernaMzda), fmtCzk(p.rozhodna), fmtCzk(Math.ceil(p.rozhodna / (1 - 0.6))),
        fmtCzk(p.minVZ), fmtCzk(Math.ceil(p.minVZ * dane.SAZBY.socialni)),
        fmtCzk(dane.LIMITY.priznani), fmtCzk(dane.LIMITY.dph),
      ];
    };
    const labels = [
      'Průměrná mzda', 'Sociální: zisk, od kterého platíš', 's paušálem 60 % to jsou příjmy',
      'Minimální měsíční základ (vedlejší)', 'Minimální záloha na sociální', 'Přiznání: příjmy nad', 'Plátce DPH: obrat nad',
    ];
    const cols = ys.map(col);
    return [
      h('div', { class: 'table-wrap' }, h('table', { class: 'cmp-table' },
        h('thead', {}, h('tr', {}, h('th', { text: '' }), ys.map((y) => h('th', { class: 'num' + (y === currentYear() ? ' is-chosen' : ''), text: String(y) })))),
        h('tbody', {}, labels.map((l, i) => h('tr', {}, h('td', { text: l }), cols.map((c, j) => h('td', { class: 'num' + (ys[j] === currentYear() ? ' is-chosen' : ''), text: c[i] }))))))),
      h('p', { class: 'biz-note', text: 'Platí každý rok: daň 15 % ze zisku, zdravotní 13,5 % z poloviny zisku (6,75 %), sociální 29,2 % z 55 % zisku (16,06 %). Paušál u živnosti 60 %, nejvýš z 2 000 000 Kč příjmů.' }),
      h('p', { class: 'biz-small', text: ys.map((y) => `${y}: ${dane.ROKY[y].zdroj}`).join(' · ') }),
    ];
  }

  function renderForeign(Y) {
    const months = foreignByMonth(Y.exp);
    if (!months.length) return null;
    const first = months[0][1].map((e) => e.date).sort()[0];
    const rows = months.map(([ym, list]) => {
      const base = sum(list, (e) => e.amount);
      return h('tr', {},
        h('td', { text: monthName(ym) }),
        h('td', { text: [...new Set(list.map(titleOf))].join(', ') }),
        h('td', { class: 'num', text: fmtCzk(base) }),
        h('td', { class: 'num', text: fmtCzk(Math.round(base * dane.SAZBY.dph)) }),
        h('td', { class: 'num', text: fmtDate(dane.terminDphZaMesic(ym)) }));
    });
    const sec = section('Služby ze zahraničí', 'Nejčastější past začínajících živnostníků.',
      h('div', { class: 'biz-card biz-foreign' },
        h('p', { text: 'Když pro podnikání platíš službu firmě ze zahraničí (Adobe, Apple iCloud, Claude, reklama na Meta nebo Google), stáváš se identifikovanou osobou k DPH. Plátce DPH nejsi, ale z těch služeb odvádíš 21 % českého DPH a podáváš za ty měsíce přiznání k DPH.' }),
        h('p', { text: `První takový výdaj je z ${fmtDate(first)}. Registrace se podává do 15 dnů, tedy do ${fmtDate(dane.plusDny(first, 15))}.` }),
        h('div', { class: 'table-wrap' }, h('table', { class: 'cmp-table' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Měsíc' }), h('th', { text: 'Služby' }), h('th', { class: 'num', text: 'Zaplaceno' }), h('th', { class: 'num', text: 'DPH 21 %' }), h('th', { class: 'num', text: 'Termín' }))),
          h('tbody', {}, rows))),
        h('p', { class: 'hint', text: 'DPH je odhad z celé zaplacené částky. Jestli ti firma už účtovala české DPH jako soukromé osobě, jak to vyřešit a jestli se tě to vůbec týká, probereš s účetní. Když výdaj ze zahraničí do podnikání nepatří, odškrtni u něj „Služba ze zahraničí“.' })));
    sec.id = 'bizForeign';
    return sec;
  }

  function renderPayments(Y) {
    const b = B();
    const list = b.payments.filter((p) => p.year === Y.y).sort((a, z) => (a.date || '').localeCompare(z.date || ''));
    const moves = b.moves.filter((m) => m.year === Y.y);
    const ul = h('ul', { class: 'pay-list' });
    for (const p of list) {
      ul.append(h('li', {},
        h('span', { class: 'sl-date', text: shortDate(p.date) }),
        h('span', { text: (PLATBY.find((x) => x[0] === p.kind) || PLATBY[0])[1] + (p.note ? ` · ${p.note}` : '') }),
        h('b', { text: fmtCzk(p.amount) }),
        h('button', {
          type: 'button', class: 'row-del', 'aria-label': 'Smazat platbu',
          onclick: () => { snapshot(); b.payments = b.payments.filter((x) => x !== p); commit('Platba smazána.'); },
        }, ico('i-trash'))));
    }
    for (const m of moves) {
      ul.append(h('li', { class: m.done ? '' : 'is-muted' },
        h('span', { class: 'sl-date', text: shortDate(m.date) }),
        h('span', { text: `${m.note || 'Dorovnání rezervy'}${m.done ? '' : ' · čeká na odeslání'}` }),
        h('b', { text: fmtCzk(m.amount) }),
        h('button', {
          type: 'button', class: 'row-del', 'aria-label': 'Smazat dorovnání',
          onclick: () => { snapshot(); b.moves = b.moves.filter((x) => x !== m); commit('Dorovnání smazáno.'); },
        }, ico('i-trash'))));
    }
    if (!list.length && !moves.length) ul.append(h('li', { class: 'sl-empty', text: 'Zatím nic. Po podání přehledů sem zapíšeš doplatky.' }));

    const kind = h('select', { class: 'sf-select', 'aria-label': 'Co jsi platil' }, PLATBY.map(([k, l]) => h('option', { value: k, text: l })));
    const amount = h('input', { type: 'text', inputMode: 'decimal', class: 'sf-input sf-amount', placeholder: '0 Kč', 'aria-label': 'Částka' });
    const date = h('input', { type: 'date', class: 'sf-input', value: todayIso(), 'aria-label': 'Kdy' });
    const form = h('form', { class: 'pay-form' }, kind, amount, date,
      h('button', { type: 'submit', class: 'btn btn-quiet' }, ico('i-plus'), 'Zapsat'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = parseNum(amount.value);
      if (!v || v <= 0) { amount.focus(); return; }
      snapshot();
      b.payments.push({ id: uid(), kind: kind.value, amount: Math.round(v), date: date.value || todayIso(), year: Y.y });
      commit('Platba zapsaná.');
    });

    const allSet = sum(b.income.filter((e) => e.reserve), (e) => e.reserve.amount) + sum(b.moves.filter((m) => m.done), (m) => m.amount);
    const allPaid = sum(b.payments, (p) => p.amount);
    const balance = h('p', { class: 'biz-note' },
      `Za rok ${Y.y} zbývá doplatit ${fmtCzk(Math.max(0, Y.calc.celkem - Y.zaplaceno))}. `,
      accountOk(S().reserveAccount) ? `Na účtu ${D().accounts.find((a) => a.id === S().reserveAccount).name} by mělo být ${fmtCzk(allSet - allPaid)}.` : `V rezervě by mělo být ${fmtCzk(allSet - allPaid)}.`);
    return [h('div', { class: 'biz-card' }, ul, form), balance];
  }

  function renderExport(Y) {
    return h('div', { class: 'biz-card biz-export' },
      h('p', { text: 'Balíček obsahuje souhrn s výpočtem, tabulky příjmů a výdajů pro Excel a všechny doklady pojmenované podle čísla záznamu. Účetní z něj přiznání udělá, nebo ho podle souhrnu vyplníš sám.' }),
      h('div', { class: 'settings-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => exportZip(Y.y) }, ico('i-download'), `Podklady za ${Y.y} (ZIP)`),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openSummary(Y.y) }, 'Souhrn k vytištění'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => exportCsv(Y.y) }, ico('i-download'), 'Tabulka pro Excel')));
  }

  function renderChecklist(full) {
    const b = B();
    const tz = b.settings.start ? dane.terminyZahajeni(b.settings.start) : null;
    const tzFmt = tz && Object.fromEntries(Object.entries(tz).map(([k, v]) => [k, fmtDate(v)]));
    const done = CHECKLIST.filter(([k]) => b.checklist[k]).length;
    const list = h('ul', { class: 'biz-check' }, CHECKLIST.map(([k, title, note]) => {
      const box = h('input', { type: 'checkbox', checked: !!b.checklist[k] });
      box.addEventListener('change', () => {
        if (box.checked) b.checklist[k] = todayIso(); else delete b.checklist[k];
        commit(null);
      });
      const vis = h('span', { class: 'pay-box', 'aria-hidden': 'true' }, ico('i-check'));
      return h('li', {}, h('label', { class: 'biz-check-row' + (b.checklist[k] ? ' is-done' : '') },
        box, vis, h('span', {}, h('b', { text: title }), h('span', { text: note(tzFmt) }))));
    }));
    const det = h('details', { class: 'biz-details', open: !full && done < 3 },
      h('summary', {}, h('h3', { text: 'Začínáš podnikat' }), h('span', { class: 'section-note', text: `${done} z ${CHECKLIST.length} hotovo` })),
      list);
    return h('section', { class: 'biz-section' }, det);
  }

  function renderSettings() {
    const d = D();
    const b = B();
    const s = b.settings;
    const field = (label, control, hint) => h('label', { class: 'sf-field' }, h('span', { class: 'sf-label', text: label }), control, hint ? h('span', { class: 'hint', text: hint }) : null);
    const upd = (fn) => () => { snapshot(); fn(); commit(null); };

    const start = h('input', { type: 'date', class: 'sf-input', value: s.start || '' });
    start.addEventListener('change', upd(() => { s.start = start.value || null; }));
    const end = h('input', { type: 'date', class: 'sf-input', value: s.end || '' });
    end.addEventListener('change', upd(() => { s.end = end.value || null; }));

    const rezim = h('select', { class: 'sf-select' },
      h('option', { value: 'auto', text: 'Spočítat obojí, použít výhodnější' }),
      h('option', { value: 'pausal', text: 'Vždycky paušál' }),
      h('option', { value: 'skutecne', text: 'Vždycky skutečné výdaje' }));
    rezim.value = s.rezim;
    rezim.addEventListener('change', upd(() => { s.rezim = rezim.value; }));

    const pausal = h('select', { class: 'sf-select' }, dane.PAUSALY.map(([p, l]) => h('option', { value: String(p), text: `${p} % · ${l}` })));
    pausal.value = String(s.pausal);
    pausal.addEventListener('change', upd(() => { s.pausal = Number(pausal.value); }));

    const acc = h('select', { class: 'sf-select' }, h('option', { value: '', text: 'Nikam, jen ukazovat' }));
    const tops = d.accounts.filter((a) => !a.parent);
    const savings = tops.find((a) => /spor|spoř/i.test(a.name + ' ' + a.id)) || tops[1] || tops[0];
    if (savings && !d.accounts.some((a) => a.parent === savings.id && /dan/.test(bez(a.name)))) {
      acc.append(h('option', { value: 'new:' + savings.id, text: `Nový podúčet Daně u ${savings.name}` }));
    }
    for (const a of d.accounts) acc.append(h('option', { value: a.id, text: a.parent ? `${a.name} (část ${d.accounts.find((x) => x.id === a.parent)?.name || ''})` : a.name }));
    acc.value = accountOk(s.reserveAccount) ? s.reserveAccount : '';
    acc.addEventListener('change', upd(() => { s.reserveAccount = resolveAccount(acc.value); }));

    const toggle = (key, title, hint) => {
      const box = h('input', { type: 'checkbox', checked: !!s.link[key] });
      box.addEventListener('change', upd(() => { s.link[key] = box.checked; }));
      return h('label', { class: 'biz-check-row' }, box, h('span', { class: 'pay-box', 'aria-hidden': 'true' }, ico('i-check')),
        h('span', {}, h('b', { text: title }), h('span', { text: hint })));
    };

    // Které kategorie měsíce jsou podnikání – podle názvu, platí pro všechna období.
    const names = [...new Set(d.periods.flatMap((p) => p.blocks.map((bl) => (bl.name || '').trim())).filter(Boolean))];
    const current = new Set(names.filter((n) => isBizBlock({ name: n })));
    const blocks = h('div', { class: 'chips' }, names.map((n) => h('button', {
      type: 'button', class: 'chip chip-check', 'aria-pressed': String(current.has(n)),
      onclick: upd(() => {
        if (current.has(n)) current.delete(n); else current.add(n);
        s.bizBlocks = [...current];
      }),
    }, h('span', { class: 'chip-mark' }, ico('i-check')), n)));

    const jmeno = h('input', { type: 'text', class: 'sf-input', value: s.jmeno || '', placeholder: 'Petr Novák', autocomplete: 'off' });
    jmeno.addEventListener('change', upd(() => { s.jmeno = jmeno.value.trim(); }));
    const icoIn = h('input', { type: 'text', class: 'sf-input', value: s.ico || '', inputMode: 'numeric', placeholder: '12345678', autocomplete: 'off' });
    icoIn.addEventListener('change', upd(() => { s.ico = icoIn.value.replace(/\s/g, ''); }));

    return h('section', { class: 'biz-section' }, h('details', { class: 'biz-details' },
      h('summary', {}, h('h3', { text: 'Nastavení podnikání' }), h('span', { class: 'section-note', text: 'začátek, výdaje, rezerva, propojení s měsícem' })),
      h('div', { class: 'biz-settings' },
        h('div', { class: 'biz-settings-grid' },
          field('Podnikám od', start, 'Den zahájení živnosti. Podle něj se zkracuje hranice pro sociální.'),
          field('Ukončeno', end, 'Jen když živnost přerušíš nebo zrušíš.'),
          field('Výdaje', rezim),
          field('Paušál', pausal),
          field('Rezervu na daně posílám na', acc),
          field('Jméno a IČO do souhrnu', h('div', { class: 'biz-inline' }, jmeno, icoIn))),
        h('div', { class: 'biz-links' },
          h('p', { class: 'sf-label', text: 'Propojení s měsícem' }),
          toggle('income', 'Příjmy z podnikání ukazovat v Příjmech měsíce', 'Jeden řádek „Příjmy z podnikání“, spočítá se sám.'),
          toggle('reserve', 'Rezervu z každé platby dát do plateb měsíce', 'Řádky „Na daně: …“ v kategorii Podnikání, převod na účet výš.'),
          toggle('expenses', 'Zaplacené výdaje z kategorie Podnikání zapsat sem', 'Po odškrtnutí „zaplaceno“ v měsíci. Doklad pak přidáš tady.'),
          h('p', { class: 'sf-label', text: 'Které kategorie v měsíci jsou podnikání' }),
          blocks))));
  }

  /* ------------------------------------------------------------
     Záznam: formulář
     ------------------------------------------------------------ */
  function newEntry(type) {
    const now = new Date().toISOString();
    if (type === 'prijem') return { id: uid(), created: now, date: todayIso(), amount: null, label: '', client: '', cat: 'foceni', method: 'ucet', invoiceNo: '', files: [], note: '' };
    return { id: uid(), created: now, date: todayIso(), amount: null, label: '', supplier: '', cat: 'ostatni', deductible: true, share: 100, foreign: false, files: [], note: '' };
  }

  function dialogEl() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'sheet glass biz-dialog';
    dialog.setAttribute('aria-labelledby', 'bizDialogTitle');
    document.body.append(dialog);
    return dialog;
  }

  function openEntry(entry, { type = 'vydaj', file = null } = {}) {
    ensure();
    fresh();
    const isNew = !entry;
    let kind = entry ? (isIncome(entry) ? 'prijem' : 'vydaj') : type;
    let draft = entry ? clone(entry) : newEntry(kind);
    let files = [...(draft.files || [])];
    const added = [];       // nové soubory – při zrušení je zase smazat
    const removed = [];
    const dlg = dialogEl();
    const opener = document.activeElement;

    const titleEl = h('h2', { id: 'bizDialogTitle' });
    const body = h('div', { class: 'sheet-body' });
    const foot = h('div', { class: 'sheet-foot' });
    const form = h('form', { class: 'biz-form', novalidate: true }, h('div', { class: 'sheet-head' }, titleEl,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zavřít', onclick: () => close(false) }, ico('i-close'))), body, foot);
    dlg.replaceChildren(form);

    let closing = false;
    async function close(saved) {
      if (closing) return;
      closing = true;
      if (!saved) for (const m of added) await docs.remove(m);
      dlg.close();
      if (opener && document.contains(opener)) opener.focus();
    }
    dlg.onclose = () => { if (!closing) { closing = true; for (const m of added) docs.remove(m); } };
    dlg.oncancel = (e) => { e.preventDefault(); close(false); };

    function paint() {
      titleEl.textContent = isNew ? (kind === 'prijem' ? 'Nový příjem' : 'Nový výdaj') : `${kind === 'prijem' ? 'Příjem' : 'Výdaj'} ${draft.no || ''}`.trim();
      body.replaceChildren(...(kind === 'prijem' ? incomeFields() : expenseFields()), docsField(), noteField());
      paintHints();
    }

    const fieldBox = (label, control, hint, cls = '') => h('label', { class: 'field ' + cls }, h('span', { class: 'field-label', text: label }), control, hint ? h('span', { class: 'hint', text: hint }) : null);

    function amountInput() {
      const inp = h('input', { type: 'text', inputMode: 'decimal', class: 'sf-input sf-amount biz-amount', placeholder: '0 Kč', autocomplete: 'off', value: draft.amount != null ? String(draft.amount).replace('.', ',') : '' });
      inp.addEventListener('input', () => { draft.amount = parseNum(inp.value); paintHints(); });
      inp.addEventListener('blur', () => { const v = parseNum(inp.value); draft.amount = v; if (v != null) inp.value = String(v).replace('.', ','); paintHints(); });
      return inp;
    }
    function dateInput(key, label) {
      const inp = h('input', { type: 'date', class: 'sf-input', value: draft[key] || '', 'aria-label': label });
      inp.addEventListener('change', () => { draft[key] = inp.value || null; paintHints(); });
      return inp;
    }
    function textInput(key, placeholder, list) {
      const inp = h('input', { type: 'text', class: 'sf-input', value: draft[key] || '', placeholder, autocomplete: 'off', list: list || null });
      inp.addEventListener('input', () => { draft[key] = inp.value; onText(key); });
      return inp;
    }
    function select(key, options) {
      const sel = h('select', { class: 'sf-select' }, options.map(([k, l]) => h('option', { value: k, text: l })));
      sel.value = draft[key];
      sel.addEventListener('change', () => { draft[key] = sel.value; draft.catTouched = key === 'cat' ? true : draft.catTouched; paintHints(); });
      return sel;
    }
    function datalist(id, values) {
      return h('datalist', { id }, [...new Set(values.filter(Boolean))].slice(0, 60).map((v) => h('option', { value: v })));
    }
    let catSel = null;
    let foreignBox = null;
    function onText(key) {
      const text = `${draft.label || ''} ${draft.supplier || draft.client || ''}`;
      if ((key === 'label' || key === 'supplier' || key === 'client') && !draft.catTouched && catSel) {
        draft.cat = kind === 'prijem' ? guessPrijem(text) : guessVydaj(text);
        catSel.value = draft.cat;
      }
      if (kind === 'vydaj' && foreignBox && !draft.foreignTouched && isNew) {
        draft.foreign = guessForeign(text);
        foreignBox.checked = draft.foreign;
      }
      paintHints();
    }

    const hints = h('div', { class: 'biz-form-hints' });
    function paintHints() {
      hints.replaceChildren();
      if (beforeStart(draft)) {
        hints.append(h('p', { class: 'hint is-warn', text: `Datum je před začátkem živnosti (${fmtDate(S().start)}). Do daní z podnikání se takový záznam nepočítá.` }));
      } else if (kind === 'prijem' && draft.amount > 0 && draft.date) {
        const y = yearOf(draft.date);
        const Y = yearData(y);
        const base = Y.inc.filter((e) => e.id !== draft.id);
        const before = dane.spocitej({ rok: y, prijmy: sum(base, (e) => e.amount), vydaje: Y.vydaje, mesice: Y.mesice, rezim: S().rezim, pausal: S().pausal }).celkem;
        const after = dane.spocitej({ rok: y, prijmy: sum(base, (e) => e.amount) + draft.amount, vydaje: Y.vydaje, mesice: Y.mesice, rezim: S().rezim, pausal: S().pausal }).celkem;
        hints.append(h('p', { class: 'biz-form-reserve' }, 'Z téhle platby odlož na daně ', h('b', { text: fmtCzk(Math.max(0, after - before)) }), '.'));
      }
      if (kind === 'prijem' && !draft.date) {
        hints.append(h('p', { class: 'hint', text: 'Do příjmů roku se počítá, až peníze přijdou. Do té doby je to jen vystavená faktura.' }));
      }
      if (kind === 'vydaj' && draft.amount > 80000 && draft.cat === 'technika') {
        hints.append(h('p', { class: 'hint', text: 'Věc dražší než 80 000 Kč se při skutečných výdajích neodečte najednou, ale odepisuje několik let. S paušálem to neřešíš. Probrat s účetní.' }));
      }
      if (kind === 'vydaj' && draft.foreign) {
        hints.append(h('p', { class: 'hint is-warn', text: 'Služba od firmy ze zahraničí: z té platby se odvádí DPH 21 % (identifikovaná osoba). Podrobnosti v Daně → Služby ze zahraničí.' }));
      }
      if (draft.fromBudget) {
        const p = D().periods.find((x) => x.id === draft.fromBudget.periodId);
        hints.append(h('p', { class: 'hint', text: `Zapsáno z měsíčního rozpočtu${p ? ` (${p.name})` : ''}. Částku a datum bere odtud, dokud je tady nepřepíšeš.` }));
      }
      paintFoot();
    }

    function incomeFields() {
      const paidBox = h('input', { type: 'checkbox', checked: !!draft.date });
      const dateWrap = h('div', { class: 'field-row' });
      const paintDates = () => {
        dateWrap.replaceChildren(...(draft.date
          ? [fieldBox('Kdy přišly peníze', dateInput('date', 'Kdy přišly peníze'))]
          : [fieldBox('Vystaveno', dateInput('issued', 'Vystaveno')), fieldBox('Splatnost', dateInput('due', 'Splatnost'))]));
      };
      paidBox.addEventListener('change', () => {
        if (paidBox.checked) { draft.date = todayIso(); }
        else { draft.issued = draft.issued || draft.date || todayIso(); draft.due = draft.due || dane.plusDny(draft.issued, 14); draft.date = null; }
        paintDates(); paintHints();
      });
      paintDates();
      catSel = select('cat', KAT_PRIJMY.map(([k, l]) => [k, l]));
      const clients = B().income.map((e) => e.client);
      return [
        h('div', { class: 'field-row' },
          fieldBox('Částka', amountInput()),
          h('label', { class: 'biz-check-row biz-check-inline' }, paidBox, h('span', { class: 'pay-box', 'aria-hidden': 'true' }, ico('i-check')), h('span', {}, h('b', { text: 'Peníze už přišly' })))),
        dateWrap,
        fieldBox('Za co', textInput('label', 'Rodinné focení, svatba Novákovi…')),
        h('div', { class: 'field-row' },
          fieldBox('Klient', textInput('client', 'Jméno nebo firma', 'bizClients')),
          fieldBox('Kategorie', catSel)),
        datalist('bizClients', clients),
        h('div', { class: 'field-row' },
          fieldBox('Jak zaplatil', select('method', ZPUSOBY)),
          fieldBox('Číslo faktury', textInput('invoiceNo', 'z Evenila'))),
        hints,
      ];
    }

    function expenseFields() {
      catSel = select('cat', KAT_VYDAJE.map(([k, l]) => [k, l]));
      const ded = h('input', { type: 'checkbox', checked: draft.deductible !== false });
      ded.addEventListener('change', () => { draft.deductible = ded.checked; share.disabled = !ded.checked; paintHints(); });
      const share = h('input', { type: 'number', min: '1', max: '100', step: '1', class: 'sf-input biz-share', value: String(draft.share ?? 100), disabled: draft.deductible === false, 'aria-label': 'Podíl pro podnikání v procentech' });
      share.addEventListener('input', () => { const v = Math.round(Number(share.value)); draft.share = v >= 1 && v <= 100 ? v : 100; });
      foreignBox = h('input', { type: 'checkbox', checked: !!draft.foreign });
      foreignBox.addEventListener('change', () => { draft.foreign = foreignBox.checked; draft.foreignTouched = true; paintHints(); });
      const suppliers = B().expenses.map((e) => e.supplier);
      return [
        h('div', { class: 'field-row' },
          fieldBox('Částka', amountInput()),
          fieldBox('Datum', dateInput('date', 'Datum'))),
        fieldBox('Za co', textInput('label', 'Paměťová karta, Adobe, benzín na focení…')),
        h('div', { class: 'field-row' },
          fieldBox('Dodavatel', textInput('supplier', 'Obchod nebo firma', 'bizSuppliers')),
          fieldBox('Kategorie', catSel)),
        datalist('bizSuppliers', suppliers),
        h('div', { class: 'biz-flags' },
          h('label', { class: 'biz-check-row' }, ded, h('span', { class: 'pay-box', 'aria-hidden': 'true' }, ico('i-check')),
            h('span', {}, h('b', { text: 'Daňově uznatelný' }), h('span', { text: 'Souvisí s podnikáním. Pokuty nebo osobní věci ne.' }))),
          h('label', { class: 'biz-share-row' }, h('span', { text: 'Pro podnikání' }), share, h('span', { text: '%' })),
          h('label', { class: 'biz-check-row' }, foreignBox, h('span', { class: 'pay-box', 'aria-hidden': 'true' }, ico('i-check')),
            h('span', {}, h('b', { text: 'Služba od firmy ze zahraničí' }), h('span', { text: 'Adobe, iCloud, Claude, reklama na Meta nebo Google.' })))),
        hints,
      ];
    }

    let docsList = null;
    function docsField() {
      const input = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, hidden: true });
      input.addEventListener('change', async () => {
        const chosen = [...input.files];
        input.value = '';
        await addFiles(chosen);
      });
      docsList = h('ul', { class: 'doc-list' });
      paintDocs();
      return h('div', { class: 'field' },
        h('span', { class: 'field-label', text: 'Doklady' }),
        docsList,
        h('button', { type: 'button', class: 'btn btn-quiet doc-add', onclick: () => input.click() }, ico('i-clip'), kind === 'prijem' ? 'Přidat fakturu nebo doklad' : 'Přidat účtenku nebo fakturu'),
        h('span', { class: 'hint', text: kind === 'prijem' ? 'PDF faktury z Evenila, u hotovosti příjmový doklad.' : 'Fotka účtenky nebo PDF faktury. Fotky se zmenší, aby nezabíraly místo.' }),
        input);
    }
    async function addFiles(list) {
      const y = yearOf(draft.date || draft.issued) || Number(todayIso().slice(0, 4));
      for (const f of list) {
        const busy = h('li', { class: 'doc-item is-busy', text: `Ukládám ${f.name}…` });
        docsList.append(busy);
        try {
          const meta = await docs.add(f, { year: y, uid });
          files.push(meta);
          added.push(meta);
        } catch (err) {
          toast(err.message || 'Doklad se nepodařilo uložit.');
        }
        busy.remove();
      }
      paintDocs();
      paintFoot();
    }
    function paintDocs() {
      if (!docsList) return;
      docsList.replaceChildren(...files.map((m) => {
        const thumb = h('span', { class: 'doc-thumb' }, ico(isImage(m) ? 'c-camera' : 'i-file'));
        if (isImage(m)) {
          docs.blobOf(m).then((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const img = h('img', { src: url, alt: '' });
            img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000));
            thumb.replaceChildren(img);
          });
        }
        return h('li', { class: 'doc-item' },
          h('button', { type: 'button', class: 'doc-open', onclick: () => openDoc(m), 'aria-label': `Otevřít ${m.name}` }, thumb,
            h('span', { class: 'doc-name' }, h('b', { text: m.name }), h('span', { text: `${Math.max(1, Math.round(m.size / 1024))} kB` }))),
          h('button', {
            type: 'button', class: 'row-del', 'aria-label': `Odebrat ${m.name}`,
            onclick: () => { files = files.filter((x) => x !== m); removed.push(m); paintDocs(); paintFoot(); },
          }, ico('i-trash')));
      }));
    }
    function noteField() {
      const ta = h('textarea', { class: 'sf-input biz-note-input', rows: 2, placeholder: 'Cokoliv, co se bude hodit účetní nebo tobě za rok' });
      ta.value = draft.note || '';
      ta.addEventListener('input', () => { draft.note = ta.value; });
      return h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Poznámka' }), ta);
    }

    function paintFoot() {
      const valid = draft.amount > 0 && (kind === 'vydaj' ? !!draft.date : (draft.date || draft.issued));
      const canDraft = kind === 'vydaj' && !valid && files.length > 0;
      const btns = [];
      if (!isNew) {
        btns.push(h('button', { type: 'button', class: 'btn btn-quiet biz-del', onclick: remove }, 'Smazat'));
      } else {
        const seg = h('div', { class: 'segmented biz-kind' });
        for (const [k, l] of [['prijem', 'Příjem'], ['vydaj', 'Výdaj']]) {
          seg.append(h('button', {
            type: 'button', class: 'seg' + (kind === k ? ' is-on' : ''), 'aria-pressed': String(kind === k), text: l,
            onclick: () => {
              if (kind === k) return;
              const keep = { amount: draft.amount, label: draft.label, note: draft.note, date: draft.date || todayIso(), id: draft.id, created: draft.created };
              kind = k; draft = { ...newEntry(k), ...keep }; paint();
            },
          }));
        }
        btns.push(seg);
      }
      btns.push(h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => close(false) }, 'Zrušit'));
      btns.push(h('button', {
        type: 'submit', class: 'btn btn-primary', disabled: !valid && !canDraft,
      }, canDraft ? 'Doplním později' : 'Uložit'));
      foot.replaceChildren(...btns);
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const valid = draft.amount > 0 && (kind === 'vydaj' ? !!draft.date : (draft.date || draft.issued));
      if (!valid && !(kind === 'vydaj' && files.length)) return;
      snapshot();
      draft.files = files;
      draft.label = (draft.label || '').trim();
      if (draft.amount != null) draft.amount = Math.round(draft.amount * 100) / 100;
      if (kind === 'vydaj') {
        draft.draft = !valid || undefined;
        if (!draft.draft) delete draft.draft;
      }
      if (kind === 'prijem' && draft.date) { delete draft.due; }
      delete draft.catTouched; delete draft.foreignTouched;
      if (entry) {
        // Ručně přepsaná částka nebo datum u výdaje z rozpočtu: rozpočet už je nemění.
        if (entry.fromBudget && (entry.amount !== draft.amount || entry.date !== draft.date)) draft.manual = true;
        draft.touched = true;
        Object.keys(entry).forEach((k) => delete entry[k]);
        Object.assign(entry, draft);
      } else {
        const list = kind === 'prijem' ? B().income : B().expenses;
        const y = yearOf(draft.date || draft.issued) || Number(todayIso().slice(0, 4));
        draft.no = nextNo(list, kind === 'prijem' ? 'P' : 'V', y);
        list.push(draft);
      }
      // Odebraný doklad se maže hned, takže se tahle úprava už vrátit nedá.
      const canUndo = !removed.length;
      for (const m of removed) await docs.remove(m);
      added.length = 0;
      await close(true);
      fresh();
      if (kind === 'prijem' && draft.date && isNew) {
        commit(`${titleOf(draft)}: zapsáno. Na daně odlož ${fmtCzk(reserveOf(draft))}.`, canUndo);
      } else {
        commit(draft.draft ? 'Účtenka uložená. Částku doplníš v Příjmech a výdajích, skupina K doplnění.' : isNew ? 'Zapsáno.' : 'Uloženo.', canUndo);
      }
    });

    function remove() {
      const doIt = async () => {
        snapshot();
        const list = isIncome(entry) ? 'income' : 'expenses';
        B()[list] = B()[list].filter((x) => x !== entry);
        // Výdaj z rozpočtu se jinak při dalším uložení zapíše znovu.
        if (entry.fromBudget) {
          const p = D().periods.find((x) => x.id === entry.fromBudget.periodId);
          const it = p && p.blocks.flatMap((bl) => bl.items).find((x) => x.id === entry.fromBudget.itemId);
          if (it) it.bizSkip = true;
        }
        closing = true;
        dlg.close();
        // Soubory dokladů zůstávají uložené, aby šlo smazání vrátit.
        commit(entry.fromBudget ? 'Smazáno. Položka v měsíci se sem už nezapíše.' : 'Smazáno.');
      };
      api.confirmDelete(`Smazat ${isIncome(entry) ? 'příjem' : 'výdaj'} „${titleOf(entry)}“${entry.amount ? ` za ${fmtCzk(entry.amount)}` : ''}?`, doIt);
    }

    paint();
    dlg.showModal();
    if (file) addFiles([file]).then(() => body.querySelector('.biz-amount')?.focus());
    else if (isNew) body.querySelector('.biz-amount')?.focus();
  }

  // Rychlé vyfocení účtenky: foťák a hned formulář výdaje.
  function quickCapture() {
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    input.addEventListener('change', () => {
      const f = input.files[0];
      input.remove();
      if (f) openEntry(null, { type: 'vydaj', file: f });
    });
    document.body.append(input);
    input.click();
  }

  /* ------------------------------------------------------------
     Prohlížení dokladu
     ------------------------------------------------------------ */
  let docDialog = null;
  async function openDoc(meta) {
    const blob = await docs.blobOf(meta);
    if (!blob) {
      toast(api.syncConfig() ? 'Doklad tu není a z GitHubu se ho nepodařilo stáhnout. Zkus to s internetem.' : 'Doklad v tomhle zařízení není.');
      return;
    }
    const url = URL.createObjectURL(blob);
    if (!isImage(meta)) {
      const a = h('a', { href: url, target: '_blank', rel: 'noopener' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    if (!docDialog) {
      docDialog = document.createElement('dialog');
      docDialog.className = 'sheet glass doc-dialog';
      document.body.append(docDialog);
    }
    const dl = h('a', { class: 'btn btn-quiet', href: url, download: meta.name }, ico('i-download'), 'Stáhnout');
    docDialog.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', { text: meta.name }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zavřít', onclick: () => docDialog.close() }, ico('i-close'))),
      h('div', { class: 'doc-view' }, h('img', { src: url, alt: meta.name })),
      h('div', { class: 'sheet-foot' }, dl, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => docDialog.close() }, 'Zavřít')));
    docDialog.onclose = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
    docDialog.showModal();
  }

  /* ------------------------------------------------------------
     Export
     ------------------------------------------------------------ */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const csvCell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const num = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
  // Bez diakritiky – Průzkumník ve Windows čeština v názvech uvnitř ZIPu ne vždy zvládne.
  const safeName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 _.-]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  // Do podkladů jde jen to, co patří do podnikání v daném roce.
  const forYear = (list, y) => list.filter((e) => entryYear(e) === y && !e.draft && !beforeStart(e))
    .sort((a, z) => (a.no || '').localeCompare(z.no || ''));

  function docNames(e) {
    return (e.files || []).map((m, i) => {
      const ext = (m.path.split('.').pop() || 'bin').toLowerCase();
      const base = [e.no, e.date || e.issued, safeName(counterparty(e) || e.label)].filter(Boolean).join(' ');
      return { meta: m, name: `${base}${e.files.length > 1 ? ` (${i + 1})` : ''}.${ext}` };
    });
  }

  function csvFor(y) {
    const b = B();
    const inc = forYear(b.income, y);
    const exp = forYear(b.expenses, y);
    const p = ['Číslo;Datum přijetí;Částka;Klient;Za co;Kategorie;Jak zaplatil;Číslo faktury;Vystaveno;Splatnost;Stav;Odloženo na daně;Doklady;Poznámka'];
    for (const e of inc) {
      p.push([e.no, e.date || '', num(e.amount), e.client, e.label, catOf(KAT_PRIJMY, e.cat)[1], (ZPUSOBY.find((z) => z[0] === e.method) || ['', ''])[1],
        e.invoiceNo, e.issued || '', e.due || '', e.date ? 'zaplaceno' : 'čeká na platbu', e.reserve ? num(e.reserve.amount) : '',
        docNames(e).map((x) => x.name).join(', '), e.note].map(csvCell).join(';'));
    }
    const v = ['Číslo;Datum;Částka;Dodavatel;Za co;Kategorie;Daňově uznatelný;Podíl pro podnikání %;Uznatelná částka;Služba ze zahraničí;Doklady;Poznámka'];
    for (const e of exp) {
      v.push([e.no, e.date, num(e.amount), e.supplier, e.label, catOf(KAT_VYDAJE, e.cat)[1], e.deductible === false ? 'ne' : 'ano',
        e.share ?? 100, num(deductible(e)), e.foreign ? 'ano' : '', docNames(e).map((x) => x.name).join(', '), e.note].map(csvCell).join(';'));
    }
    return { prijmy: p.join('\r\n'), vydaje: v.join('\r\n') };
  }

  function exportCsv(y) {
    const { prijmy, vydaje } = csvFor(y);
    api.download(`podnikani-${y}-prijmy.csv`, prijmy, 'text/csv;charset=utf-8');
    setTimeout(() => api.download(`podnikani-${y}-vydaje.csv`, vydaje, 'text/csv;charset=utf-8'), 400);
    toast('Dvě tabulky staženy: příjmy a výdaje.');
  }

  function summaryHtml(y, missing = []) {
    const b = B();
    const s = b.settings;
    const Y = yearData(y);
    const c = Y.calc;
    const t = Y.terminy;
    const inc = forYear(b.income, y);
    const exp = forYear(b.expenses, y);
    const money = (n) => esc(fmtCzk(n));
    const tr = (cells, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}>${cells.map((x, i) => `<td${i && typeof x === 'number' ? ' class="n"' : ''}>${typeof x === 'number' ? money(x) : esc(x)}</td>`).join('')}</tr>`;
    const docList = (e) => docNames(e).map((x) => x.name).join(', ') || '–';
    return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Podnikání ${y} – podklady</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;max-width:980px;margin:32px auto;padding:0 16px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
p{margin:4px 0}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{padding:5px 8px;border-bottom:1px solid #e3e3e3;text-align:left;vertical-align:top}
th{font-weight:600;background:#f5f5f5}.n{text-align:right;white-space:nowrap}.t td{font-weight:700;border-top:2px solid #999}
.muted{color:#666;font-size:12px}.warn{background:#fff4e0;padding:8px 12px;border-radius:6px}
@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>Podnikání ${y}: podklady k přiznání</h1>
<p>${esc([s.jmeno, s.ico ? `IČO ${s.ico}` : ''].filter(Boolean).join(' · ') || 'Vedlejší samostatná činnost')}</p>
<p class="muted">Podnikání od ${esc(s.start ? fmtDate(s.start) : 'neuvedeno')}${s.end ? ` do ${esc(fmtDate(s.end))}` : ''} · ${Y.mesice} měsíců činnosti v roce ${y} · vedlejší činnost při zaměstnání · vytvořeno ${esc(fmtDate(todayIso()))}</p>

<h2>Výpočet</h2>
<table><tr><th></th><th class="n">Paušál ${c.pausalPct} %</th><th class="n">Skutečné výdaje</th></tr>
${[['Příjmy', Y.prijmy, Y.prijmy], ['Výdaje', c.pausal.vydaje, c.skutecne.vydaje], ['Zisk', c.pausal.zisk, c.skutecne.zisk],
  ['Daň z příjmů 15 %', c.pausal.dan, c.skutecne.dan], ['Zdravotní pojištění', c.pausal.zdr, c.skutecne.zdr],
  ['Sociální pojištění', c.pausal.soc, c.skutecne.soc]].map((r) => tr(r)).join('')}
${tr(['Celkem', c.pausal.celkem, c.skutecne.celkem], 't')}
</table>
<p>Použito: <b>${c.druh === 'pausal' ? `paušální výdaje ${c.pausalPct} %` : 'skutečné výdaje'}</b>${s.rezim === 'auto' ? ' (vychází výhodněji)' : ''}.</p>

<h2>Pro přiznání a přehledy</h2>
<table>
${tr(['Příloha č. 1, ř. 101 – příjmy podle § 7', Y.prijmy])}
${tr(['Příloha č. 1, ř. 102 – výdaje podle § 7', c.vydaje])}
${tr(['Zisk (dílčí základ daně § 7)', Math.max(0, c.zisk)])}
${tr(['Přehled ČSSZ – vyměřovací základ', c.socVZ])}
${tr(['Přehled ČSSZ – rozhodná částka za rok', c.hranice])}
${tr(['Přehled ČSSZ – pojistné', c.soc])}
${tr(['Přehled ZP – vyměřovací základ (50 % zisku)', c.zdrVZ])}
${tr(['Přehled ZP – pojistné', c.zdr])}
</table>
<p>${c.priznani ? `Přiznání podat do ${esc(fmtDate(t.dap))} (elektronicky).` : 'Příjmy nepřesáhly 20 000 Kč, přiznání není povinné.'} Přehledy do ${esc(fmtDate(t.prehledy))}.</p>
${Y.exp.some((e) => e.foreign) ? `<p class="warn">Obsahuje výdaje za služby od firem ze zahraničí (${esc(Y.exp.filter((e) => e.foreign).map(titleOf).join(', '))}). Prověřit povinnosti identifikované osoby k DPH.</p>` : ''}

<h2>Příjmy (${inc.length})</h2>
<table><tr><th>Číslo</th><th>Přijato</th><th>Klient</th><th>Za co</th><th class="n">Částka</th><th>Doklady</th></tr>
${inc.map((e) => tr([e.no, e.date ? fmtDate(e.date) : `čeká (splatnost ${e.due ? fmtDate(e.due) : '?'})`, e.client || '', e.label || '', e.amount || 0, docList(e)])).join('')}
${tr(['', '', '', 'Celkem přijato', Y.prijmy, ''], 't')}
</table>

<h2>Výdaje (${exp.length})</h2>
<table><tr><th>Číslo</th><th>Datum</th><th>Dodavatel</th><th>Za co</th><th class="n">Částka</th><th class="n">Uznatelné</th><th>Doklady</th></tr>
${exp.map((e) => tr([e.no, fmtDate(e.date), e.supplier || '', `${e.label || ''}${e.foreign ? ' (zahraničí)' : ''}`, e.amount || 0, deductible(e), docList(e)])).join('')}
${tr(['', '', '', 'Celkem', sum(exp, (e) => e.amount), Y.vydaje, ''], 't')}
</table>

<h2>Zaplacené daně a pojištění za ${y}</h2>
<table>${b.payments.filter((p) => p.year === y).map((p) => tr([fmtDate(p.date), (PLATBY.find((x) => x[0] === p.kind) || PLATBY[0])[1], p.amount])).join('') || '<tr><td>Zatím nic.</td></tr>'}</table>
${missing.length ? `<p class="warn">Tyhle doklady se nepodařilo přibalit (nejsou v zařízení ani na GitHubu): ${esc(missing.join(', '))}</p>` : ''}
<p class="muted">Výpočet z aplikace Peníze. Počítá s vedlejší činností při zaměstnání, slevu na poplatníka uplatňuje zaměstnavatel. Čísla pro rok ${y}: ${esc(c.par.zdroj)}${c.par.odhad ? ' (odhad podle předchozího roku)' : ''}. Před podáním ověřit.</p>
</body></html>`;
  }

  function openSummary(y) {
    const blob = new Blob([summaryHtml(y)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, target: '_blank', rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  async function exportZip(y) {
    const b = B();
    toast('Balím podklady…');
    const entries = [...forYear(b.income, y), ...forYear(b.expenses, y)];
    const files = [];
    const missing = [];
    for (const e of entries) {
      for (const { meta, name } of docNames(e)) {
        const blob = await docs.blobOf(meta);
        if (blob) files.push({ name: `doklady/${name}`, data: blob });
        else missing.push(name);
      }
    }
    const { prijmy, vydaje } = csvFor(y);
    const bom = '﻿';
    const out = [
      { name: `souhrn-${y}.html`, data: summaryHtml(y, missing) },
      { name: `prijmy-${y}.csv`, data: bom + prijmy },
      { name: `vydaje-${y}.csv`, data: bom + vydaje },
      ...files,
    ];
    const blob = await zip(out);
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `podnikani-${y}-podklady.zip` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(missing.length
      ? `Staženo, ale ${missing.length} ${skloneni(missing.length, 'doklad chybí', 'doklady chybí', 'dokladů chybí')} (souhrn je vypíše).`
      : `Staženo: souhrn, dvě tabulky a ${files.length} ${skloneni(files.length, 'doklad', 'doklady', 'dokladů')}.`);
  }

  /* ------------------------------------------------------------
     Boční panel a lišta
     ------------------------------------------------------------ */
  function renderRail(listEl) {
    ensure();
    fresh();
    const cur = currentYear();
    listEl.replaceChildren(...years().map((y) => {
      const Y = yearData(y);
      const li = h('li', { class: 'period-item' + (y === cur ? ' is-on' : '') });
      li.append(h('button', {
        type: 'button', 'aria-current': y === cur ? 'true' : null,
        onclick: () => { year = y; api.renderAll(); api.closeRail(); },
      }, h('b', { text: `Rok ${y}` }), h('span', { text: Y.prijmy
        ? `zisk ${fmtCzk(Math.max(0, Y.calc.zisk))} · daně ${fmtCzk(Y.calc.celkem)}`
        : !S().start ? 'nastav začátek podnikání'
          : Y.mesice ? `${Y.mesice} ${skloneni(Y.mesice, 'měsíc', 'měsíce', 'měsíců')} podnikání` : 'bez záznamů' })));
      return li;
    }));
  }

  function topbar() {
    ensure();
    const s = S();
    const y = currentYear();
    return {
      title: 'Podnikání',
      sub: s.start ? `Rok ${y} · živnost od ${fmtDate(s.start)}` : `Rok ${y} · nastav si začátek`,
    };
  }

  // Po synchronizaci dat poslat i doklady. Když synchronizace běží nově,
  // přidat do fronty všechno, co v tomhle zařízení vzniklo bez ní.
  async function afterSync({ first = false } = {}) {
    const b = D().business;
    if (!b) return;
    if (first) docs.queueAll([...b.income, ...b.expenses].flatMap((e) => (e.files || []).map((m) => m.path)));
    await docs.pump();
  }

  function closeDialogs() {
    if (dialog?.open) dialog.close();
    if (docDialog?.open) docDialog.close();
  }

  // Pro řádek v měsíci: výdaj, který z něj vznikl.
  function expenseForItem(itemId) {
    const b = D().business;
    return b?.expenses?.find((e) => e.id === 'b-' + itemId) || null;
  }
  function openExpenseForItem(itemId) {
    const e = expenseForItem(itemId);
    if (e) openEntry(e);
  }
  function openIncomeTab() { tab = 'prehled'; }

  return {
    ensure, reconcile, render, renderRail, topbar, afterSync, closeDialogs,
    expenseForItem, openExpenseForItem, openIncomeTab, quickCapture,
    isBizBlock: (bl) => (D().business ? isBizBlock(bl) : false),
    active: () => !!D().business?.settings?.start,
  };
}
