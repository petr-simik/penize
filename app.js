/* ============================================================
   Přehled příjmů a výdajů – logika aplikace
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MESICE = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

const czk = new Intl.NumberFormat('cs-CZ', {
  style: 'currency', currency: 'CZK', maximumFractionDigits: 0,
});
const num0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

const fmtCzk = (n) => czk.format(Math.round(n || 0));
const fmtNum = (n) => (n == null ? '' : num0.format(n));

function parseNum(raw) {
  if (raw == null) return null;
  let t = String(raw).replace(/[\s  ]/g, '').replace(/kč/gi, '').replace(/,/g, '.');
  if (t === '') return null;
  // Dovolíme si počítat rovnou v poli, třeba „3500+700“.
  if (/^[0-9+\-*/().]+$/.test(t) && /[+\-*/]/.test(t.slice(1))) {
    try {
      const v = Function('"use strict";return (' + t + ')')();
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

function fmtRange(from, to) {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number);
  // Stejný rok? Píše se jen jednou, na konci.
  if (fy === Number(to.split('-')[0])) return `${fd}. ${fm}. – ${fmtDate(to)}`;
  return fmtDate(from) + ' – ' + fmtDate(to);
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, last));
  return base.toISOString().slice(0, 10);
}

const uid = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------
   Ikony položek
   Jednobarevné, jedna stopová rodina. Barvu nesou jen účty,
   takže ikona je vždycky v barvě textu.
   ------------------------------------------------------------ */
const ICONS = [
  ['c-dot', 'Bez ikony'], ['c-home', 'Bydlení'], ['c-cart', 'Nákupy'],
  ['c-food', 'Jídlo'], ['c-car', 'Auto'], ['c-fuel', 'Palivo'],
  ['c-shield', 'Pojištění'], ['c-health', 'Zdraví'], ['c-pill', 'Léky'],
  ['c-heart', 'Blízcí'], ['c-user', 'Člověk'], ['c-pet', 'Zvíře'],
  ['c-piggy', 'Spoření'], ['c-chart', 'Investice'], ['c-wallet', 'Výplata'],
  ['c-cabin', 'Chata'], ['c-scissors', 'Holič'], ['c-phone', 'Telefon'],
  ['c-wifi', 'Internet'], ['c-bolt', 'Energie'], ['c-cloud', 'Úložiště'],
  ['c-layers', 'Software'], ['c-globe', 'Web a služby'], ['c-spark', 'AI'],
  ['c-camera', 'Focení'], ['c-book', 'Knihy'], ['c-plane', 'Cestování'],
  ['c-ticket', 'Vstupenky'], ['c-gift', 'Dárky'], ['c-cup', 'Kavárna'],
  ['c-dumbbell', 'Sport'], ['c-tools', 'Opravy'], ['c-briefcase', 'Podnikání'],
  ['c-bank', 'Splátky'],
  ['c-receipt', 'Ostatní'],
];

// Klíčová slova → ikona. Bere se první shoda, pořadí tedy rozhoduje.
const ICON_HINTS = [
  // Spoření se testuje dřív než bydlení, jinak by „Spoření na bydlení“
  // dostalo domeček místo prasátka.
  [/spoř|spor(eni|ení)|rezerv|důchod|duchod|conseq/i, 'c-piggy'],
  [/bydlen|nájem|najem|byt|hypot|činž|cinz/i, 'c-home'],
  [/chat(a|y|u)|zahrad|dům|dum\b/i, 'c-cabin'],
  [/potravin|nákup|nakup|jidlo\s*dom|drogeri|lidl|kaufland|albert|billa/i, 'c-cart'],
  [/jídl|jidl|oběd|obed|restaur|večeř|vecer/i, 'c-food'],
  [/benz|nafta|palivo|tank|pohonn/i, 'c-fuel'],
  [/aut(o|a)|splátka auta|splatka auta|stk|servis voz/i, 'c-car'],
  [/zdravot|doktor|lékař|lekar|zubař|zubar/i, 'c-health'],
  [/lék|lek(y|arna)|lékárn|lekarn/i, 'c-pill'],
  [/pojišt|pojist/i, 'c-shield'],
  [/akcie|etf|investic|dividend|portfol|burz/i, 'c-chart'],
  [/výplat|vyplat|mzda|plat\b|příjem|prijem|honorář|honorar|faktur/i, 'c-wallet'],
  [/focen|fotk|foto|svatb/i, 'c-camera'],
  [/dovolen|letenk|cest(a|ovn)|zájezd|zajezd/i, 'c-plane'],
  [/barber|kadeřn|kadern|holič|holic/i, 'c-scissors'],
  [/o2|vodafone|t-mobile|tarif|telefon|mobil/i, 'c-phone'],
  [/internet|wifi|připojen|pripojen/i, 'c-wifi'],
  [/elektřin|elektrin|plyn|energi|vod(a|né)|teplo/i, 'c-bolt'],
  [/icloud|dropbox|onedrive|google one|úložišt|ulozist|záloh|zaloh/i, 'c-cloud'],
  [/adobe|lightroom|photoshop|capture one|software|licenc|předplat|predplat/i, 'c-layers'],
  [/claude|chatgpt|openai|midjourney|\bai\b/i, 'c-spark'],
  [/evenilo|pixin|doména|domena|hosting|web\b|netflix|spotify|hbo|disney/i, 'c-globe'],
  [/mang|knih|komiks|časopis|casopis/i, 'c-book'],
  [/dárek|darek|dárk|dark(y|u)|vánoc|vanoc|narozenin/i, 'c-gift'],
  [/kavárn|kavarn|kafe|káva|kava|hospod|pivo/i, 'c-cup'],
  [/fitko|fitness|posilov|sport|běh|beh\b|kolo/i, 'c-dumbbell'],
  [/kin(o|a)|divadl|koncert|lístk|listk|vstupen/i, 'c-ticket'],
  [/oprav|řemesl|remesl|nářad|narad|údržb|udrzb/i, 'c-tools'],
  [/pes\b|kočk|kock|zvíř|zvir|veterin|krmiv/i, 'c-pet'],
  [/reklamac|vrácen|vracen|účtenk|uctenk|poplat|daň|dan\b/i, 'c-receipt'],
  [/mamk|tát|tat(a|i)|brách|brach|sestr|babičk|babick|děd|ded(a|ecek)|přítel|pritel|rodin/i, 'c-heart'],
];

/* ------------------------------------------------------------
   Kategorie výdajů
   Každá kategorie je jeden blok v tabulkách a nese druh: nutné,
   spoření, nebo volitelné. Z druhů je vidět, jestli měsíc stojí
   na tom, co platit musím, nebo na tom, co si dopřávám.
   ------------------------------------------------------------ */
const KINDS = [
  ['nutne', 'Nutné'],
  ['sporeni', 'Spoření'],
  ['volitelne', 'Volitelné'],
];
const kindName = (k) => (KINDS.find((x) => x[0] === k) || KINDS[2])[1];

function guessKind(name) {
  const t = name || '';
  if (/spoř|spor(eni|ení)|invest|rezerv|akci/i.test(t)) return 'sporeni';
  if (/bydl|nutn|jídl|jidl|potrav|domácn|doprav|auto|zdrav|pojišt|splát|splat|půjč|pujc|úvěr|uver|podnik|energ/i.test(t)) return 'nutne';
  return 'volitelne';
}
const kindOf = (block) => block.kind || guessKind(block.name);

const CATEGORY_HINTS = [
  [/podnik|firm|živnost|zivnost|práce|prace/i, 'c-briefcase'],
  [/splát|splat|půjč|pujc|úvěr|uver|dluh|hypot/i, 'c-bank'],
  [/doprav/i, 'c-car'],
  [/zdrav/i, 'c-health'],
  [/osobn|pro mě|pro me|kapesn/i, 'c-user'],
  [/rodin|blízc|blizc/i, 'c-heart'],
  [/ostatn/i, 'c-receipt'],
  [/jídl|jidl|domácn|domacn/i, 'c-cart'],
];
function categoryIcon(block) {
  if (block.icon) return block.icon;
  for (const [re, icon] of CATEGORY_HINTS) if (re.test(block.name || '')) return icon;
  const g = guessIcon(block.name);
  return g === 'c-dot' ? 'c-receipt' : g;
}

// S čím začne prázdné období.
const DEFAULT_CATEGORIES = [
  ['Bydlení', 'c-home', 'nutne'],
  ['Jídlo a domácnost', 'c-cart', 'nutne'],
  ['Doprava', 'c-car', 'nutne'],
  ['Splátky a půjčky', 'c-bank', 'nutne'],
  ['Zdraví a pojištění', 'c-health', 'nutne'],
  ['Podnikání', 'c-briefcase', 'nutne'],
  ['Spoření a investice', 'c-piggy', 'sporeni'],
  ['Rodina a blízcí', 'c-heart', 'volitelne'],
  ['Osobní', 'c-user', 'volitelne'],
  ['Cestování', 'c-plane', 'volitelne'],
  ['Ostatní', 'c-receipt', 'volitelne'],
];

function guessIcon(label) {
  const text = (label || '').trim();
  if (!text) return 'c-dot';
  for (const [re, icon] of ICON_HINTS) if (re.test(text)) return icon;
  return 'c-dot';
}
const iconOf = (item) => item.icon || guessIcon(item.label);

/* ------------------------------------------------------------
   Stav
   ------------------------------------------------------------ */
let data = null;
let activeId = null;
let view = 'mesic';
let undoSnapshot = null;

const els = {
  rail: $('#rail'), railScrim: $('#railScrim'),
  periodList: $('#periodList'),
  periodName: $('#periodName'), periodRange: $('#periodRange'),
  topbarBalance: $('#topbarBalance'),
  topbarPay: $('#topbarPay'),
  saveState: $('#saveState'), syncBadge: $('#syncBadge'),
  payStats: $('#payStats'), payTodo: $('#payTodo'),
  actualToggle: $('#actualToggle'),
  slabs: $('#slabs'), transfersNote: $('#transfersNote'),
  figures: $('#figures'),
  meterFill: $('#meterFill'), meterCap: $('#meterCap'),
  incomeTable: $('#incomeTable'),
  blocksHost: $('#blocksHost'),
  recapTable: $('#recapTable'),
  overviewTable: $('#overviewTable'),
  splitChart: $('#splitChart'),
  viewMesic: $('#viewMesic'), viewPrehled: $('#viewPrehled'), viewSpolecne: $('#viewSpolecne'),
  sharedPeople: $('#sharedPeople'), sharedNote: $('#sharedNote'), sharedForm: $('#sharedForm'),
  sharedList: $('#sharedList'), sharedHistory: $('#sharedHistory'),
  sharedHistorySection: $('#sharedHistorySection'), sharedSettings: $('#sharedSettings'),
  toaster: $('#toaster'),
  ambient: $('#ambient'),
};

const period = () => data.periods.find((p) => p.id === activeId) || data.periods[0];
const showActual = () => !!(data && data.settings && data.settings.showActual);

function accountById(id) {
  return (data.accounts || []).find((a) => a.id === id) || data.accounts[0];
}
function accColor(acc) {
  if (!acc) return 'var(--acc-x)';
  // Podúčet nosí barvu rodiče – peníze jsou pořád na stejném místě,
  // jen jinak rozdělené. Odliší ho pruhování, ne jiný odstín.
  const owner = acc.parent ? (accountById(acc.parent) || acc) : acc;
  const slot = typeof owner.slot === 'number' ? owner.slot : data.accounts.indexOf(owner);
  return slot >= 0 && slot <= 3 ? `var(--acc-${slot})` : 'var(--acc-x)';
}

/* Účty tvoří dvě úrovně: kam posílám peníze (převod) a jak je to
   uvnitř rozdělené (podúčet). Součet převodu podúčty zahrnuje. */
const topAccounts = () => data.accounts.filter((a) => !a.parent);
const childrenOf = (id) => data.accounts.filter((a) => a.parent === id);
const ownerOf = (acc) => (acc && acc.parent ? accountById(acc.parent) || acc : acc);

function accountLabel(a) {
  if (!a.parent) return a.name;
  const parent = accountById(a.parent);
  return parent ? `${a.name} (${parent.name})` : a.name;
}

/* ------------------------------------------------------------
   Výpočty
   ------------------------------------------------------------ */
function sumIncome(p, field) {
  return p.income.reduce((s, i) => s + (field === 'actual' ? (i.actual ?? 0) : (i.plan ?? 0)), 0);
}
function sumBlock(b, field) {
  return b.items.reduce((s, i) => s + (field === 'actual' ? (i.actual ?? 0) : (i.plan ?? 0)), 0);
}
function sumExpenses(p, field) {
  return p.blocks.reduce((s, b) => s + sumBlock(b, field), 0);
}
function hasAnyActual(p) {
  return p.income.some((i) => i.actual != null) || p.blocks.some((b) => b.items.some((i) => i.actual != null));
}
function byAccount(p, field) {
  const map = new Map(data.accounts.map((a) => [a.id, 0]));
  for (const b of p.blocks) {
    for (const it of b.items) {
      const acc = accountById(it.account);
      if (!acc) continue;
      const v = field === 'actual' ? (it.actual ?? 0) : (it.plan ?? 0);
      map.set(acc.id, (map.get(acc.id) || 0) + v);
    }
  }
  return map;
}

// Kolik celkem odejde na daný účet včetně toho, co se uvnitř přesune dál.
function accountTotal(map, acc) {
  return (map.get(acc.id) || 0) + childrenOf(acc.id).reduce((s, c) => s + (map.get(c.id) || 0), 0);
}

/* ------------------------------------------------------------
   Placení
   Odškrtává se přímo u výdaje. Počítá se skutečná částka, když je
   vyplněná a vidět, jinak plán. Položka za 0 Kč se neplatí, takže
   v seznamu nezaplacených nepřekáží.
   ------------------------------------------------------------ */
// U nájmu se k tomu přičte odečet za společné nákupy (viz Společné).
const payAmount = (it) => (showActual() && it.actual != null ? it.actual : (it.plan ?? 0))
  + (it.split ? 0 : adjustOf(it));
const allItems = (p) => p.blocks.flatMap((b) => b.items);
const itemsOfAccount = (p, acc) => allItems(p).filter((it) => ownerOf(accountById(it.account)) === acc);

/* Balíček (split): částka na měsíc, ze které se utrácí po kouskách –
   benzín, jídlo. Místo jednoho zaškrtnutí se zapisují útraty a hlídá
   se, kolik z balíčku zbývá. Skutečnost je u něj součet útrat. */
const spentOf = (it) => (it.spends || []).reduce((s, x) => s + (x.amount || 0), 0);
const budgetLeft = (it) => (it.plan ?? 0) - spentOf(it);

function isPayable(it) {
  if (it.split) return (it.plan ?? 0) > 0 || spentOf(it) > 0;
  return !!it.paid || payAmount(it) !== 0;
}
function isDone(it) {
  if (it.split) return !!it.closed || spentOf(it) >= (it.plan ?? 0);
  return !!it.paid;
}
// Kolik z položky ještě odejde. Uzavřený balíček už nic.
function leftOf(it) {
  if (it.split) return it.closed ? 0 : Math.max(budgetLeft(it), 0);
  return it.paid ? 0 : payAmount(it);
}

function payStats(items) {
  const s = { paid: 0, left: 0, nPaid: 0, n: 0, budgets: 0, budgetsOpen: 0 };
  for (const it of items) {
    if (!isPayable(it)) continue;
    s.n++;
    if (isDone(it)) s.nPaid++;
    if (it.split) {
      s.paid += spentOf(it);
      s.budgets += leftOf(it);
      if (!isDone(it)) s.budgetsOpen++;
    } else if (it.paid) {
      s.paid += payAmount(it);
    }
    s.left += leftOf(it);
  }
  s.total = s.paid + s.left;
  s.done = s.n > 0 && s.nPaid === s.n;
  return s;
}

function setPaid(item, paid) {
  if (paid) {
    item.paid = true; item.paidAt = todayIso();
    delete item.paidAuto;
  } else {
    // Ruční odškrtnutí automatické platby, která už měla odejít:
    // zřejmě neodešla, tak ji v tomhle období znovu nezaškrtávat.
    const due = item.auto && dueDate(item, periodOf(item));
    if (due && due <= todayIso()) item.autoSkip = true;
    delete item.paid; delete item.paidAt; delete item.paidAuto;
  }
}

/* ------------------------------------------------------------
   Automatické platby
   Položka, která odchází sama každý měsíc ve stejný den (inkaso,
   předplatné, trvalý příkaz). V ten den se zaškrtne sama. Běží to,
   když je aplikace otevřená, a při spuštění dožene, co zmeškala –
   s datem, kdy platba opravdu odešla.
   ------------------------------------------------------------ */
const periodOf = (item) => data.periods.find((p) => allItems(p).includes(item));

// Den splatnosti uvnitř období (od včetně, do bez). 31. v krátkém měsíci = poslední den.
function dueDate(item, p) {
  const day = item.auto?.day;
  if (!day || !p) return null;
  const [fy, fm] = p.from.split('-').map(Number);
  for (let k = 0; k < 14; k++) {
    const y = fy + Math.floor((fm - 1 + k) / 12);
    const m = (fm - 1 + k) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
    if (iso >= p.to) return null;
    if (iso >= p.from) return iso;
  }
  return null;
}

function runAutoPay() {
  const today = todayIso();
  const done = [];
  for (const p of data.periods) {
    for (const it of allItems(p)) {
      if (!it.auto || it.split || it.paid || it.autoSkip) continue;
      const due = dueDate(it, p);
      if (!due || due > today) continue;
      it.paid = true;
      it.paidAt = due;
      it.paidAuto = true;
      done.push(it.label || 'Položka');
    }
  }
  return done;
}

function autoPayAndTell() {
  const done = runAutoPay();
  if (!done.length) return false;
  const list = done.length > 3 ? `${done.slice(0, 3).join(', ')} a ${done.length - 3} další` : done.join(', ');
  toast(`Automaticky zaplaceno: ${list}.`);
  return true;
}

function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function syncSplitActual(it) {
  if (it.split) it.actual = it.spends && it.spends.length ? spentOf(it) : null;
}

function setSplit(it, on) {
  if (on) {
    it.spends = it.spends || [];
    // Co už bylo zaplacené nebo zapsané ve skutečnosti, se nesmí ztratit.
    if (!it.spends.length) {
      const seed = it.actual ?? (it.paid ? payAmount(it) : null);
      if (seed) it.spends.push({ id: uid(), amount: seed, date: it.paidAt || null });
    }
    it.split = true;
    delete it.paid; delete it.paidAt;
    delete it.auto; delete it.autoSkip; delete it.paidAuto;   // balíček neodchází najednou
    syncSplitActual(it);
  } else {
    const done = isDone(it);
    delete it.split; delete it.closed;
    delete it.spends;
    setPaid(it, done);
  }
}

function paidTitle(item) {
  if (item.paid && item.paidAt) return `Zaplaceno${item.paidAuto ? ' automaticky' : ''} ${fmtDate(item.paidAt)}`;
  const due = item.auto && dueDate(item, periodOf(item));
  if (due && !item.autoSkip) return `Zaškrtne se samo ${fmtDate(due)}. Můžeš i ručně.`;
  return 'Označit jako zaplacené';
}

// Kulaté zaškrtávátko – stejné v tabulce, v seznamu i na převodu.
function payBox() {
  const box = document.createElement('span');
  box.className = 'pay-box';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<svg class="ico"><use href="#i-check"></use></svg>';
  return box;
}

// Balíček má místo kolečka prstenec, který se plní tím, co je utracené.
// Hotový balíček dostane obyčejné zaškrtnutí, přečerpaný zčervená.
function budgetRing(it) {
  const plan = it.plan ?? 0;
  const spent = spentOf(it);
  if (isDone(it) && spent <= plan) {
    const box = payBox();
    box.classList.add('is-on');
    return box;
  }
  const pct = plan > 0 ? Math.min(spent / plan, 1) * 100 : 100;
  const wrap = document.createElement('span');
  wrap.className = 'budget-ring' + (spent > plan ? ' is-over' : '');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML =
    `<svg viewBox="0 0 20 20"><circle class="ring-track" cx="10" cy="10" r="8.2"/>`
    + `<circle class="ring-fill" cx="10" cy="10" r="8.2" pathLength="100" `
    + `stroke-dasharray="${pct.toFixed(1)} 100" transform="rotate(-90 10 10)"/></svg>`;
  return wrap;
}

function budgetText(it) {
  const left = budgetLeft(it);
  if (left < 0) return `přečerpáno o ${fmtCzk(-left)}`;
  if (it.closed) return `uzavřeno · ${fmtCzk(spentOf(it))}`;
  if (left === 0) return 'vyčerpáno';
  return `zbývá ${fmtCzk(left)}`;
}

// Po zavření okénka vrátit fokus jen tehdy, když si ho mezitím nevzalo
// něco, na co uživatel klikl.
const focusIsLost = (pop) => {
  const a = document.activeElement;
  return !a || a === document.body || pop.contains(a);
};

// Plovoucí okénka (ikony, útraty, menu řádku) se umisťují stejně.
function placePopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + w > innerWidth - 12) left = innerWidth - w - 12;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
  pop.style.left = Math.max(12, left) + 'px';
  pop.style.top = top + 'px';
}

const skloneni = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/* ------------------------------------------------------------
   Načtení a uložení
   ------------------------------------------------------------ */
/* Dva způsoby, kde data bydlí:
   – „server“: aplikace na PC, soubor data/rozpocet.json přes /api/data,
   – „local“: webová verze (iPhone), data v úložišti prohlížeče.
   Nad obojím může běžet synchronizace s GitHubem (viz níž). */
let storageMode = 'server';
const LS_DATA = 'penize:data';

function blankData() {
  return {
    version: 1,
    settings: { showActual: false },
    accounts: [
      { id: 'bezny', name: 'Běžný účet', note: 'zůstane na běžném účtu', slot: 0 },
      { id: 'sporici', name: 'Spořicí účet', note: 'posílám na spořicí účet', slot: 1 },
      { id: 'invest', name: 'Investice', note: 'posílám na investice', slot: 2 },
    ],
    periods: [],
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function load() {
  let loaded = null;
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('json')) loaded = await res.json();
  } catch { /* server tu není */ }

  if (loaded) {
    storageMode = 'server';
  } else {
    storageMode = 'local';
    loaded = readLocal() || blankData();
  }
  data = loaded;
  data.settings = data.settings || {};
  if (data.settings.showActual === undefined) data.settings.showActual = true;
  if (!data.periods.length) data.periods.push(blankPeriod('Nové období', todayIso(), addMonths(todayIso(), 1)));
  activeId = data.periods[data.periods.length - 1].id;
}

// Místní datum – toISOString by po půlnoci ukazoval ještě včerejšek (UTC).
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let saveTimer = null;
let saveInFlight = false;

function markSaving() {
  els.saveState.dataset.state = 'saving';
  els.saveState.textContent = 'Ukládám…';
}
function markSaved() {
  const t = new Date();
  els.saveState.dataset.state = 'saved';
  els.saveState.textContent = 'Uloženo ' + t.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function save({ now = false } = {}) {
  clearTimeout(saveTimer);
  markSaving();
  const run = async () => {
    if (saveInFlight) { saveTimer = setTimeout(run, 200); return; }
    saveInFlight = true;
    try {
      if (storageMode === 'local') {
        localStorage.setItem(LS_DATA, JSON.stringify(data));
        markSaved();
        scheduleSync();
        return;
      }
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      // Někdo uložil dřív než my – radši načteme jeho verzi,
      // než abychom mu práci přepsali.
      if (res.status === 409) {
        const { current } = await res.json();
        closeFloating();
        data = current;
        if (!data.periods.some((p) => p.id === activeId)) activeId = data.periods[0]?.id;
        renderAll();
        els.saveState.dataset.state = 'saved';
        els.saveState.textContent = 'Načteno znovu';
        toast('Přehled byl otevřený i jinde a změnil se tam. Načetl jsem aktuální data.');
        return;
      }

      if (!res.ok) throw new Error((await res.json()).error || 'Uložení selhalo.');
      const { rev } = await res.json();
      if (rev) data._rev = rev;
      markSaved();
      scheduleSync();
    } catch (err) {
      els.saveState.dataset.state = 'error';
      els.saveState.textContent = 'Neuloženo';
      toast(storageMode === 'local'
        ? 'Uložení v telefonu selhalo – možná je plné úložiště nebo soukromý režim.'
        : 'Uložení selhalo: ' + err.message);
    } finally {
      saveInFlight = false;
    }
  };
  saveTimer = setTimeout(run, now ? 0 : 600);
}

/* ------------------------------------------------------------
   Synchronizace přes soukromý GitHub repozitář
   Každé zařízení má vlastní kopii dat a v repozitáři leží společná
   verze (rozpocet.json). Při synchronizaci se tři verze – poslední
   společná, moje a ta na GitHubu – sloučí po jednotlivých položkách,
   takže se změny z telefonu a z PC navzájem nepřepíšou.

   Token a nastavení jsou jen v tomhle zařízení, nikdy v datech.
   ------------------------------------------------------------ */
const LS_SYNC = 'penize:sync';        // { repo, token }
const LS_BASE = 'penize:sync-base';   // { sha, json } – poslední společná verze
const SYNC_FILE = 'rozpocet.json';

const syncState = { status: 'off', at: null, error: '' };
let syncing = false;
let syncAgain = false;
let syncTimer = null;

function syncConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_SYNC) || 'null');
    return c && c.repo && c.token ? c : null;
  } catch { return null; }
}
function readBase() {
  try { return JSON.parse(localStorage.getItem(LS_BASE) || 'null'); } catch { return null; }
}
function writeBase(sha, json) {
  try { localStorage.setItem(LS_BASE, JSON.stringify({ sha, json })); } catch { /* nevejde se – příště se sloučí znovu */ }
}

// JSON se seřazenými klíči, ať stejná data vypadají stejně bez ohledu na pořadí.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
const syncable = (d) => { const c = clone(d); delete c._rev; return c; };
const same = (a, b) => stable(a) === stable(b);
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const idList = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => isPlain(x) && x.id != null);

/* Tříbodové sloučení. b = společný předek, l = moje, r = GitHub.
   Co změnila jen jedna strana, vyhrává ta strana. Když obě změnily
   totéž číslo nebo text, vyhraje tohle zařízení – je to změna, kterou
   člověk právě udělal a vidí. undefined = klíč neexistuje. */
function merge3(b, l, r) {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  if (isPlain(l) && isPlain(r)) {
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = merge3(isPlain(b) ? b[k] : undefined, l[k], r[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ((idList(l) || idList(r)) && Array.isArray(l) && Array.isArray(r)) return mergeById(Array.isArray(b) ? b : [], l, r);
  return l;
}

function mergeById(b, l, r) {
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
  const B = byId(b), L = byId(l), R = byId(r);
  const out = [];
  const keep = (id) => {
    const inL = L.has(id), inR = R.has(id), inB = B.has(id);
    if (inL && inR) return merge3(B.get(id), L.get(id), R.get(id));
    // Smazané na jedné straně: zmizí, pokud to druhá mezitím neupravila
    // (úprava má přednost). Bez předka je to nová položka.
    if (inL && !inR) return inB && same(L.get(id), B.get(id)) ? undefined : L.get(id);
    if (!inL && inR) return inB && same(R.get(id), B.get(id)) ? undefined : R.get(id);
    return undefined;
  };
  // Pořadí podle tohohle zařízení, nové položky odjinud za svého předchůdce.
  const placed = new Set();
  for (const x of l) { const v = keep(x.id); placed.add(x.id); if (v !== undefined) out.push(v); }
  r.forEach((x, i) => {
    if (placed.has(x.id)) return;
    placed.add(x.id);
    const v = keep(x.id);
    if (v === undefined) return;
    const prev = r.slice(0, i).reverse().find((y) => out.some((o) => o.id === y.id));
    const at = prev ? out.findIndex((o) => o.id === prev.id) + 1 : 0;
    out.splice(at, 0, v);
  });
  return out;
}

/* ---------- GitHub API ---------- */
function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

class SyncError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function gh(cfg, method, body) {
  let res;
  try {
    // cfg.api jen pro testování proti náhradnímu serveru.
    res = await fetch(`${cfg.api || 'https://api.github.com'}/repos/${cfg.repo}/contents/${SYNC_FILE}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('Bez připojení k internetu.', 'offline');
  }
  if (res.status === 404 && method === 'GET') return null;
  if (res.status === 401) throw new SyncError('GitHub odmítl token – je neplatný nebo mu vypršela platnost.', 'auth');
  if (res.status === 403) throw new SyncError('Token nemá oprávnění zapisovat do repozitáře.', 'auth');
  if (res.status === 404) throw new SyncError('Repozitář nenalezen. Zkontroluj název a že token k němu má přístup.', 'auth');
  if (res.status === 409 || res.status === 422) throw new SyncError('Na GitHubu se to mezitím změnilo.', 'conflict');
  if (!res.ok) throw new SyncError(`GitHub vrátil chybu ${res.status}.`, 'http');
  return res.json();
}

async function remoteGet(cfg) {
  const j = await gh(cfg, 'GET');
  if (!j) return null;
  return { sha: j.sha, json: JSON.parse(b64decode(j.content)) };
}
async function remotePut(cfg, json, sha) {
  const j = await gh(cfg, 'PUT', {
    message: `Rozpočet ${new Date().toLocaleString('cs-CZ')} (${storageMode === 'server' ? 'PC' : 'telefon'})`,
    content: b64encode(JSON.stringify(json, null, 2) + '\n'),
    ...(sha ? { sha } : {}),
  });
  return j.content.sha;
}

/* ---------- průběh ---------- */
function scheduleSync(delay = 2500) {
  if (!syncConfig()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), delay);
}

function setSyncState(status, error = '') {
  syncState.status = status;
  syncState.error = error;
  if (status === 'ok') syncState.at = new Date();
  paintSyncState();
}

function paintSyncState() {
  const t = syncState.at && syncState.at.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const text = {
    off: '',
    busy: 'Synchronizuji…',
    ok: `Synchronizováno ${t}`,
    offline: 'Offline – pošle se později',
    error: 'Synchronizace selhala',
  }[syncState.status] || '';
  if (els.syncBadge) {
    els.syncBadge.hidden = syncState.status === 'off';
    els.syncBadge.dataset.state = syncState.status;
    els.syncBadge.title = syncState.error || text;
    els.syncBadge.setAttribute('aria-label', syncState.error || text);
  }
  if (syncState.status !== 'off' && els.saveState.dataset.state !== 'saving' && els.saveState.dataset.state !== 'error') {
    els.saveState.textContent = text;
  }
  const s = $('#syncStatus');
  if (s) s.textContent = syncState.error || text || 'Nepřipojeno';
}

// Data z GitHubu do tohoto zařízení – bez dalšího odeslání zpátky.
async function applySynced(json) {
  closeFloating();
  const rev = data._rev;
  data = json;
  if (rev) data._rev = rev;
  data.settings = data.settings || {};
  if (!data.periods.length) data.periods.push(blankPeriod('Nové období', todayIso(), addMonths(todayIso(), 1)));
  if (!data.periods.some((p) => p.id === activeId)) activeId = data.periods[data.periods.length - 1].id;
  applyTheme(data.settings.theme || 'system');
  els.actualToggle.checked = showActual();
  renderAll();
  if (storageMode === 'local') {
    try { localStorage.setItem(LS_DATA, JSON.stringify(data)); } catch { /* další uložení to dožene */ }
  } else {
    const res = await fetch('/api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (res.ok) { const { rev: r } = await res.json(); if (r) data._rev = r; }
    else if (res.status === 409) { syncAgain = true; }
  }
}

const hasContent = (d) => d.periods.some((p) => p.income.length || p.blocks.some((b) => b.items.length));

async function syncNow({ firstChoice = null } = {}) {
  const cfg = syncConfig();
  if (!cfg) { setSyncState('off'); return; }
  if (syncing) { syncAgain = true; return; }
  // Rozepsané uložení nejdřív doběhne.
  if (saveInFlight || els.saveState.dataset.state === 'saving') { scheduleSync(800); return; }
  syncing = true;
  setSyncState('busy');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = syncable(data);
      const localStr = stable(local);
      const base = readBase();
      const remote = await remoteGet(cfg);

      let result;
      if (!remote) {
        result = local;                                   // na GitHubu zatím nic není
      } else if (!base) {
        // První připojení tohoto zařízení.
        if (same(local, remote.json) || !hasContent(local)) result = remote.json;
        else {
          const choice = firstChoice || await askFirstSync();
          if (!choice) { setSyncState('off'); disconnectSync(true); return; }
          result = choice === 'remote' ? remote.json : local;
        }
      } else if (remote.sha === base.sha) {
        result = local;                                   // na GitHubu beze změny
      } else {
        result = merge3(base.json, local, remote.json);   // změnilo se i jinde
      }

      try {
        if (!remote || !same(result, remote.json)) writeBase(await remotePut(cfg, result, remote?.sha), result);
        else writeBase(remote.sha, remote.json);
      } catch (err) {
        if (err.code === 'conflict') continue;            // někdo byl rychlejší – znovu
        throw err;
      }

      if (stable(result) !== localStr) {
        if (stable(syncable(data)) === localStr) await applySynced(result);
        else syncAgain = true;                            // mezitím další úprava – sloučí se v dalším kole
      }
      setSyncState('ok');
      return;
    }
    throw new SyncError('GitHub se pořád mění, zkusím to za chvíli.', 'conflict');
  } catch (err) {
    const again = syncState.error === err.message;   // stejnou chybu nehlásit každou minutu
    setSyncState(err.code === 'offline' ? 'offline' : 'error', err.code === 'offline' ? '' : err.message);
    if (err.code === 'auth' && !again) toast(err.message);
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(600); }
  }
}

function askFirstSync() {
  const dlg = $('#syncChoiceDialog');
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); resolve(v); };
    $('#syncUseRemote').onclick = () => done('remote');
    $('#syncUseLocal').onclick = () => done('local');
    dlg.onclose = () => resolve(null);
    dlg.showModal();
  });
}

function disconnectSync(quiet = false) {
  try { localStorage.removeItem(LS_SYNC); localStorage.removeItem(LS_BASE); } catch { /* nic */ }
  setSyncState('off');
  renderSyncSettings();
  if (!quiet) toast('Synchronizace v tomhle zařízení vypnutá. Data zůstala.');
}

function renderSyncSettings() {
  const host = $('#syncSettings');
  if (!host) return;
  const cfg = syncConfig();
  $('#syncForm').hidden = !!cfg;
  $('#syncConnected').hidden = !cfg;
  if (cfg) $('#syncRepoName').textContent = cfg.repo;
  paintSyncState();
}

/* ------------------------------------------------------------
   Drobnosti v rozhraní
   ------------------------------------------------------------ */
function toast(text, actionLabel, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { action(); el.remove(); });
    el.append(btn);
  }
  els.toaster.append(el);
  setTimeout(() => el.remove(), actionLabel ? 8000 : 4000);
}

function snapshot() { undoSnapshot = clone(data); }
function undo() {
  if (!undoSnapshot) return;
  closeFloating();   // okénka drží odkazy na položky, které se teď vymění
  // Verze pro server se nevrací – jinak by uložení odmítl jako zastaralé.
  const rev = data._rev;
  data = undoSnapshot;
  if (rev) data._rev = rev;
  undoSnapshot = null;
  if (!data.periods.some((p) => p.id === activeId)) activeId = data.periods[0]?.id;
  renderAll();
  save({ now: true });
}

/* ------------------------------------------------------------
   Vykreslení – levý panel a hlavička
   ------------------------------------------------------------ */
function renderRail() {
  els.periodList.replaceChildren(...data.periods.map((p) => {
    const li = document.createElement('li');
    li.className = 'period-item' + (p.id === activeId ? ' is-on' : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    if (p.id === activeId) btn.setAttribute('aria-current', 'true');
    const b = document.createElement('b');
    b.textContent = p.name;
    const s = document.createElement('span');
    s.textContent = fmtRange(p.from, p.to);
    btn.append(b, s);
    btn.addEventListener('click', () => {
      activeId = p.id;
      setView('mesic');
      renderAll();
      closeRail();
    });
    li.append(btn);
    return li;
  }));
}

function renderTopbar() {
  const p = period();
  const prehled = view !== 'mesic';

  if (view === 'spolecne') {
    els.periodName.textContent = 'Společné nákupy';
    els.periodRange.textContent = people().map((x) => x.name).join(', ');
  } else if (prehled) {
    const n = data.periods.length;
    els.periodName.textContent = 'Všechna období';
    els.periodRange.textContent = n === 1 ? '1 období' : n < 5 ? `${n} období` : `${n} období`;
  } else {
    els.periodName.textContent = p.name;
    els.periodRange.textContent = fmtRange(p.from, p.to);
  }

  const bal = sumIncome(p, 'plan') - sumExpenses(p, 'plan');
  els.topbarBalance.textContent = fmtCzk(bal);
  els.topbarBalance.style.color = bal < 0 ? 'var(--negative)' : '';

  // U tabulek dole je souhrn plateb daleko, tak ho lišta nese s sebou.
  const pay = payStats(allItems(p));
  els.topbarPay.textContent = pay.n && pay.done ? 'Vše zaplaceno' : fmtCzk(pay.left);

  // Nástroje, které patří jen k jednomu měsíci, v přehledu nedávají smysl.
  $('#editPeriodBtn')?.toggleAttribute('hidden', prehled);
  $('.switch')?.toggleAttribute('hidden', prehled);
  $('#topbarNum')?.toggleAttribute('hidden', prehled);
}

/* ------------------------------------------------------------
   Vykreslení – hrdina: kam poslat peníze
   ------------------------------------------------------------ */
function renderSlabs() {
  const p = period();
  const plan = byAccount(p, 'plan');
  const act = byAccount(p, 'actual');
  const total = [...plan.values()].reduce((a, b) => a + b, 0);
  const anyActual = showActual() && hasAnyActual(p);
  const tops = topAccounts();

  els.transfersNote.textContent = total
    ? `Celkem ${fmtCzk(total)} ve ${tops.length} převodech.`
    : 'Zatím tu nic není. Přidej výdaje níž a rozdělení se spočítá samo.';

  els.slabs.replaceChildren(...tops.map((a) => {
    const val = accountTotal(plan, a);
    const actual = accountTotal(act, a);
    const share = total ? Math.round((val / total) * 100) : 0;
    const kids = childrenOf(a.id).filter((c) => (plan.get(c.id) || 0) > 0);

    const card = document.createElement('article');
    card.className = 'slab glass';
    card.style.setProperty('--tint', accColor(a));

    const top = document.createElement('div');
    top.className = 'slab-top';
    const dot = document.createElement('span');
    dot.className = 'slab-dot';
    const name = document.createElement('h4');
    name.className = 'slab-name';
    name.textContent = a.name;
    top.append(dot, name);

    const amount = document.createElement('strong');
    amount.className = 'slab-amount';
    amount.textContent = fmtCzk(val);

    const note = document.createElement('p');
    note.className = 'slab-note';
    note.textContent = anyActual
      ? `Skutečně ${fmtCzk(actual)} · ${share} % výdajů`
      : (a.note ? `${a.note} · ${share} % výdajů` : `${share} % výdajů`);

    const bar = document.createElement('div');
    bar.className = 'slab-share';
    const fill = document.createElement('i');
    fill.style.width = share + '%';
    bar.append(fill);

    card.append(top, amount, note, bar);

    // Převod se posílá najednou, tak se najednou i odškrtne. Balíčky
    // ne – poslat peníze na účet neznamená, že je benzín projetý.
    const items = itemsOfAccount(p, a).filter((it) => !it.split);
    const budgets = itemsOfAccount(p, a).filter((it) => it.split && isPayable(it) && !isDone(it));
    const pay = payStats(items);
    let payBtn = null;
    if (pay.n) {
      const btn = payBtn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slab-pay' + (pay.done ? ' is-paid' : '');
      btn.setAttribute('aria-pressed', String(pay.done));
      btn.setAttribute('aria-label', pay.done
        ? `Všechny platby na ${a.name} jsou zaplacené. Kliknutím zrušíš označení.`
        : `Označit všech ${pay.n} plateb na ${a.name} jako zaplacené`);
      const text = document.createElement('span');
      text.textContent = pay.done
        ? 'Všechno zaplaceno'
        : pay.nPaid ? `Zbývá zaplatit ${fmtCzk(pay.left)}` : 'Označit jako zaplacené';
      btn.append(payBox(), text);
      if (budgets.length) {
        const more = document.createElement('span');
        more.className = 'slab-pay-more';
        more.textContent = `+ ${budgets.length} ${skloneni(budgets.length, 'balíček', 'balíčky', 'balíčků')}`;
        more.title = budgets.map((it) => `${it.label}: zbývá ${fmtCzk(leftOf(it))}`).join('\n');
        btn.append(more);
      }
      btn.addEventListener('click', () => {
        snapshot();
        const next = !pay.done;
        items.filter(isPayable).forEach((it) => { if (!!it.paid !== next) setPaid(it, next); });
        renderAll(); save();
        toast(next ? `${a.name}: platby označeny jako zaplacené.` : `${a.name}: označení zrušeno.`, 'Vrátit zpět', undo);
      });
    }

    // Co se z převodu přesune dál uvnitř účtu.
    if (kids.length) {
      const list = document.createElement('dl');
      list.className = 'slab-split';
      for (const c of kids) {
        const dt = document.createElement('dt');
        const swatch = document.createElement('span');
        swatch.className = 'slab-split-mark';
        const label = document.createElement('span');
        label.textContent = 'z toho ' + c.name.toLowerCase();
        dt.append(swatch, label);
        const dd = document.createElement('dd');
        dd.textContent = fmtCzk(plan.get(c.id) || 0);
        list.append(dt, dd);
      }
      card.append(list);
    }

    if (payBtn) card.append(payBtn);   // až pod rozpis podúčtů
    return card;
  }));

  paintAmbient(plan, total);
}

function paintAmbient(map, total) {
  const blobs = $$('.blob', els.ambient);
  topAccounts().slice(0, 3).forEach((a, idx) => {
    const blob = blobs[idx];
    if (!blob) return;
    const share = total ? accountTotal(map, a) / total : 1 / 3;
    const size = 16 + share * 30; // vw
    blob.style.width = size + 'vw';
    blob.style.height = size + 'vw';
    blob.style.left = (idx === 0 ? -6 : idx === 1 ? 42 : 72) + share * 6 + 'vw';
  });
}

/* ------------------------------------------------------------
   Vykreslení – souhrnná čísla
   ------------------------------------------------------------ */
function figure(label, value, { hero = false, sub = '', negative = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'figure' + (hero ? ' figure--hero' : '');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (negative) dd.classList.add('is-negative');
  wrap.append(dt, dd);
  if (sub) {
    const p = document.createElement('p');
    p.className = 'figure-sub';
    p.textContent = sub;
    wrap.append(p);
  }
  return wrap;
}

function renderFigures() {
  const p = period();
  const inPlan = sumIncome(p, 'plan');
  const outPlan = sumExpenses(p, 'plan');
  const bal = inPlan - outPlan;
  const anyActual = showActual() && hasAnyActual(p);
  const inAct = sumIncome(p, 'actual');
  const outAct = sumExpenses(p, 'actual');

  els.figures.replaceChildren(
    figure('Příjmy', fmtCzk(inPlan), { sub: anyActual ? `skutečně ${fmtCzk(inAct)}` : '' }),
    figure('Výdaje', fmtCzk(outPlan), { sub: anyActual ? `skutečně ${fmtCzk(outAct)}` : '' }),
    figure('Zůstatek', fmtCzk(bal), {
      hero: true,
      negative: bal < 0,
      sub: anyActual ? `skutečně ${fmtCzk(inAct - outAct)}` : '',
    }),
    figure('Utraceno z příjmů', inPlan ? Math.round((outPlan / inPlan) * 100) + ' %' : '—', {
      sub: anyActual && inAct ? `skutečně ${Math.round((outAct / inAct) * 100)} %` : '',
    }),
  );

  const pct = inPlan ? (outPlan / inPlan) * 100 : 0;
  els.meterFill.style.width = Math.min(pct, 100) + '%';
  els.meterFill.classList.toggle('is-over', pct > 100);
  els.meterCap.textContent = !inPlan
    ? 'Doplň příjmy a uvidíš, kolik z nich plán spotřebuje.'
    : pct > 100
      ? `Plán je o ${fmtCzk(outPlan - inPlan)} nad příjmy.`
      : `Plán spotřebuje ${Math.round(pct)} % příjmů, zbyde ${fmtCzk(inPlan - outPlan)}.`;
}

/* ------------------------------------------------------------
   Vykreslení – platby
   ------------------------------------------------------------ */
function renderPay() {
  const p = period();
  const s = payStats(allItems(p));
  const pct = s.total ? Math.round((s.paid / s.total) * 100) : 0;
  const autoLeft = allItems(p)
    .filter((it) => it.auto && !it.split && !it.paid && !it.autoSkip && dueDate(it, p))
    .reduce((t, it) => t + payAmount(it), 0);
  const subParts = [
    s.budgets > 0 ? `${fmtCzk(s.budgets)} v ${skloneni(s.budgetsOpen, 'balíčku', 'balíčcích', 'balíčcích')}` : '',
    autoLeft > 0 ? `${fmtCzk(autoLeft)} odejde samo` : '',
  ].filter(Boolean);

  const meter = document.createElement('div');
  meter.className = 'meter';
  const fill = document.createElement('div');
  fill.className = 'meter-fill';
  fill.style.width = (s.total ? (s.paid / s.total) * 100 : 0) + '%';
  meter.append(fill);

  const cap = document.createElement('p');
  cap.className = 'meter-cap';
  const zbyva = s.n - s.nPaid;
  cap.textContent = !s.n
    ? 'Až přidáš výdaje, uvidíš tu, co ještě zaplatit.'
    : s.done
      ? 'Všechno za tohle období je zaplacené.'
      : !s.nPaid
        ? 'Zatím nic. Odškrtávej u položek, nebo nahoře rovnou celý převod.'
        : `Zaplaceno ${pct} % výdajů, ${zbyva} ${skloneni(zbyva, 'položka zbývá', 'položky zbývají', 'položek zbývá')}.`;

  const figs = document.createElement('dl');
  figs.className = 'pay-figures';
  figs.append(
    figure('Zbývá zaplatit', fmtCzk(s.left), {
      hero: true,
      sub: subParts.length ? `z toho ${subParts.join(', ')}` : '',
    }),
    figure('Zaplaceno', fmtCzk(s.paid), { sub: s.total ? `z ${fmtCzk(s.total)}` : '' }),
    figure('Položky', s.n ? `${s.nPaid} z ${s.n}` : '—', { sub: 'zaplacené' }),
  );

  els.payStats.replaceChildren(figs, meter, cap);

  // Seznam toho, co ještě zbývá – po účtech, ať je vidět, odkud platit.
  const groups = topAccounts().map((a) => {
    const open = itemsOfAccount(p, a).filter((it) => isPayable(it) && !isDone(it));
    if (!open.length) return null;

    const g = document.createElement('div');
    g.className = 'pay-group';
    g.style.setProperty('--tint', accColor(a));

    const head = document.createElement('div');
    head.className = 'pay-group-head';
    const dot = document.createElement('span');
    dot.className = 'slab-dot';
    const name = document.createElement('span');
    name.className = 'pay-group-name';
    name.textContent = a.name;
    const sum = document.createElement('span');
    sum.className = 'pay-group-sum';
    sum.textContent = fmtCzk(open.reduce((t, it) => t + leftOf(it), 0));
    head.append(dot, name, sum);

    const list = document.createElement('ul');
    list.className = 'pay-pills';
    list.setAttribute('aria-label', `Nezaplacené na ${a.name}`);
    for (const it of open) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pay-pill';
      const label = it.label || 'Bez názvu';
      const t = document.createElement('span');
      t.className = 'pay-pill-label';
      t.textContent = label;
      const v = document.createElement('span');
      v.className = 'pay-pill-amount';

      if (it.split) {
        // Balíček se nezaškrtává, jen se do něj připíše útrata.
        btn.classList.add('is-budget');
        btn.dataset.spend = it.id;
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.setAttribute('aria-label', `${label}: zbývá ${fmtCzk(leftOf(it))} z ${fmtCzk(it.plan)}. Zapsat útratu.`);
        v.textContent = `zbývá ${fmtCzk(leftOf(it))}`;
        btn.append(budgetRing(it), t, v);
        btn.addEventListener('click', () => openSpendPop(btn, it));
        li.append(btn);
        list.append(li);
        continue;
      }

      btn.setAttribute('aria-label', `Označit ${label} (${fmtCzk(payAmount(it))}) jako zaplacené`);
      v.textContent = fmtCzk(payAmount(it));
      btn.append(payBox(), t, v);
      // Automatická: ukázat, kdy se zaškrtne sama.
      const due = it.auto && !it.autoSkip && dueDate(it, p);
      if (due) {
        const when = el('span', 'pay-pill-auto');
        when.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-repeat"></use></svg>';
        when.append(fmtDate(due).replace(/ \d{4}$/, ''));
        btn.append(when);
        btn.setAttribute('aria-label', `Označit ${label} (${fmtCzk(payAmount(it))}) jako zaplacené. Samo se zaškrtne ${fmtDate(due)}.`);
      }
      btn.addEventListener('click', () => {
        const idx = $$('.pay-pill', els.payTodo).indexOf(btn);
        snapshot();
        setPaid(it, true);
        renderAll(); save();
        const pills = $$('.pay-pill', els.payTodo);
        (pills[idx] || pills[pills.length - 1])?.focus();
        toast(`${label}: zaplaceno.`, 'Vrátit zpět', undo);
      });
      li.append(btn);
      list.append(li);
    }

    g.append(head, list);
    return g;
  }).filter(Boolean);

  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'pay-empty';
    if (s.n) {
      empty.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>';
      empty.append('Nic nezbývá. Všechno je zaplacené.');
    } else {
      empty.textContent = 'Žádné výdaje k zaplacení.';
    }
    els.payTodo.replaceChildren(empty);
  } else {
    els.payTodo.replaceChildren(...groups);
  }
}

/* ------------------------------------------------------------
   Vykreslení – tabulky
   ------------------------------------------------------------ */
function amountCell(item, field, label, onChange) {
  const td = document.createElement('td');
  td.className = 'cell-num num';
  td.dataset.label = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = 'cell-input num';
  input.value = fmtNum(item[field]);
  input.placeholder = field === 'actual' ? '—' : '0';
  input.setAttribute('aria-label', `${label} – ${item.label || 'položka'}`);
  if (item[field] == null) input.dataset.empty = '1';

  // Skutečnost balíčku je součet útrat, ručně se nepřepisuje.
  if (field === 'actual' && item.split) {
    input.readOnly = true;
    input.classList.add('is-derived');
    input.title = 'Součet útrat. Zapisují se přes prstenec u názvu.';
    td.append(input);
    return td;
  }

  input.addEventListener('focus', () => {
    input.value = item[field] == null ? '' : String(item[field]);
    input.select();
  });
  input.addEventListener('blur', () => {
    const v = parseNum(input.value);
    item[field] = field === 'plan' ? (v ?? 0) : v;
    input.value = fmtNum(item[field]);
    input.dataset.empty = item[field] == null ? '1' : '0';
    onChange();
    save();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
  td.append(input);
  return td;
}

function diffCell(item, kind) {
  const td = document.createElement('td');
  td.className = 'cell-num num';
  td.dataset.label = 'Rozdíl';
  const span = document.createElement('span');
  span.className = 'diff';
  const update = () => {
    if (item.actual == null) { span.textContent = '—'; span.className = 'diff'; return; }
    const d = item.actual - (item.plan ?? 0);
    span.textContent = (d > 0 ? '+' : '') + fmtCzk(d);
    const bad = kind === 'expense' ? d > 0 : d < 0;
    span.className = 'diff ' + (d === 0 ? '' : bad ? 'is-over' : 'is-under');
  };
  update();
  td.append(span);
  td._update = update;
  return td;
}

function labelCell(item, onChange, placeholder = 'Název položky', onPaid = null) {
  const td = document.createElement('td');
  td.className = 'cell-label';

  const wrap = document.createElement('div');
  wrap.className = 'label-wrap';

  // Zaškrtávátko sedí v buňce s názvem, takže na mobilu zůstane u něj.
  let budgetTag = null;
  let autoTag = null;
  if (onPaid && item.split) {
    const ring = document.createElement('button');
    ring.type = 'button';
    ring.className = 'budget-btn';
    ring.dataset.spend = item.id;
    ring.setAttribute('aria-haspopup', 'dialog');
    ring.setAttribute('aria-label', `${item.label || 'Balíček'}: ${budgetText(item)}. Zapsat útratu.`);
    ring.append(budgetRing(item));
    ring.addEventListener('click', () => openSpendPop(ring, item));
    wrap.append(ring);

    budgetTag = document.createElement('button');
    budgetTag.type = 'button';
    budgetTag.tabIndex = -1;           // stejná akce jako prstenec, fokus stačí jeden
    budgetTag.setAttribute('aria-hidden', 'true');
    budgetTag.addEventListener('click', () => openSpendPop(ring, item));

    // Po změně plánu se prstenec i štítek přepočítají bez překreslení řádku.
    const tag = budgetTag;
    td._paintBudget = () => {
      ring.replaceChildren(budgetRing(item));
      ring.setAttribute('aria-label', `${item.label || 'Balíček'}: ${budgetText(item)}. Zapsat útratu.`);
      tag.className = 'budget-tag' + (budgetLeft(item) < 0 ? ' is-over' : '');
      tag.textContent = budgetText(item);
    };
    td._paintBudget();
  } else if (onPaid) {
    const check = document.createElement('label');
    check.className = 'pay-check';
    check.title = paidTitle(item);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!item.paid;
    box.setAttribute('aria-label', `Zaplaceno – ${item.label || 'položka'}`);
    box.addEventListener('change', () => {
      setPaid(item, box.checked);
      check.title = paidTitle(item);
      onPaid();
      save();
    });
    check.append(box, payBox());
    wrap.append(check);

    if (item.auto) {
      autoTag = el('span', 'auto-tag' + (item.autoSkip ? ' is-off' : ''));
      autoTag.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-repeat"></use></svg>';
      autoTag.append(`${item.auto.day}.`);
      autoTag.title = item.autoSkip
        ? `Automatická platba ${item.auto.day}. v měsíci – v tomhle období jsi ji odškrtl ručně, sama se už nezaškrtne.`
        : `Automatická platba – zaškrtne se sama ${item.auto.day}. v měsíci. Změníš přes ⋯.`;
      autoTag.setAttribute('aria-label', autoTag.title);
      autoTag.setAttribute('role', 'img');
    }

    // Nájem ponížený o společné nákupy: ukázat, kolik opravdu poslat.
    if (item.adjust?.length) {
      const tag = budgetTag = document.createElement('button');
      tag.type = 'button';
      tag.addEventListener('click', () => { setView('spolecne'); renderAll(); scrollTo(0, 0); });
      td._paintBudget = () => {
        const adj = adjustOf(item);
        tag.className = 'budget-tag adjust-tag';
        tag.textContent = `pošleš ${fmtCzk(payAmount(item))}`;
        tag.title = `${adj < 0 ? 'Odečteno' : 'Přičteno'} ${fmtCzk(Math.abs(adj))} za společné nákupy. Kliknutím otevřeš Společné.`;
        tag.setAttribute('aria-label', `${item.label}: pošleš ${fmtCzk(payAmount(item))}, ${adj < 0 ? 'odečteno' : 'přičteno'} ${fmtCzk(Math.abs(adj))} za společné nákupy. Otevřít Společné.`);
      };
      td._paintBudget();
    }
  }

  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'item-icon';
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  iconBtn.append(svg);

  const paintIcon = () => {
    const id = iconOf(item);
    use.setAttribute('href', '#' + id);
    const name = (ICONS.find((i) => i[0] === id) || [, 'Bez ikony'])[1];
    iconBtn.setAttribute('aria-label', `Ikona položky: ${name}. Klikni a vyber jinou.`);
    iconBtn.classList.toggle('is-empty', id === 'c-dot');
  };
  paintIcon();
  iconBtn.addEventListener('click', () => openIconPicker(iconBtn, item, () => { paintIcon(); save(); }));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.value = item.label || '';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', 'Název položky');
  input.addEventListener('input', () => {
    item.label = input.value;
    if (!item.icon) paintIcon();   // dokud si ikonu nevybral ručně, jde podle názvu
    save();
  });
  input.addEventListener('blur', onChange);

  wrap.append(iconBtn, input);
  if (autoTag) wrap.append(autoTag);
  if (budgetTag) wrap.append(budgetTag);
  td.append(wrap);
  return td;
}

/* ------------------------------------------------------------
   Výběr ikony
   ------------------------------------------------------------ */
let picker = null;
let pickerTarget = null;
let pickerDone = null;
let pickerOpener = null;

function buildPicker() {
  picker = document.createElement('div');
  picker.className = 'icon-picker glass';
  picker.setAttribute('popover', 'auto');
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Výběr ikony');

  const grid = document.createElement('div');
  grid.className = 'icon-grid';
  for (const [id, name] of ICONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-choice';
    b.dataset.icon = id;
    b.title = name;
    b.setAttribute('aria-label', name);
    b.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${id}"></use></svg>`;
    b.addEventListener('click', () => {
      if (!pickerTarget) return;
      if (id === 'c-dot') pickerTarget.icon = 'c-dot';
      else pickerTarget.icon = id;
      pickerDone?.();
      picker.hidePopover();
    });
    grid.append(b);
  }

  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'icon-auto';
  auto.textContent = 'Vybrat podle názvu';
  auto.addEventListener('click', () => {
    if (!pickerTarget) return;
    delete pickerTarget.icon;
    pickerDone?.();
    picker.hidePopover();
  });

  picker.append(grid, auto);
  picker.addEventListener('toggle', (e) => {
    if (e.newState === 'closed' && focusIsLost(picker)) pickerOpener?.focus();
  });
  document.body.append(picker);
}

function openIconPicker(anchor, item, done, current = iconOf(item)) {
  if (!picker) buildPicker();
  pickerTarget = item;
  pickerDone = done;
  pickerOpener = anchor;

  $$('.icon-choice', picker).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.icon === current));
    b.classList.toggle('is-on', b.dataset.icon === current);
  });

  picker.showPopover();
  placePopover(picker, anchor);
  $('.icon-choice.is-on', picker)?.focus();
}

/* ------------------------------------------------------------
   Balíček: zápis útrat
   ------------------------------------------------------------ */
let spendPop = null;
let spendItem = null;
let spendOpenerSel = null;

function buildSpendPop() {
  spendPop = document.createElement('div');
  spendPop.className = 'spend-pop glass';
  spendPop.setAttribute('popover', 'auto');
  spendPop.setAttribute('role', 'dialog');
  spendPop.setAttribute('aria-labelledby', 'spendTitle');
  spendPop.addEventListener('toggle', (e) => {
    if (e.newState !== 'closed') return;
    spendItem = null;
    // Řádek se mezitím překreslil, tak se vrací na jeho nový prstenec.
    if (spendOpenerSel && focusIsLost(spendPop)) $(spendOpenerSel)?.focus();
  });
  document.body.append(spendPop);
}

function openSpendPop(anchor, item) {
  if (!spendPop) buildSpendPop();
  spendItem = item;
  const kind = anchor.classList.contains('pay-pill') ? '.pay-pill' : '.budget-btn';
  spendOpenerSel = `${kind}[data-spend="${item.id}"]`;
  renderSpendPop();
  spendPop.showPopover();
  placePopover(spendPop, anchor);
  $('.spend-input', spendPop)?.focus();
}

function closeFloating() {
  if (spendPop?.matches(':popover-open')) spendPop.hidePopover();
  if (rowMenu?.matches(':popover-open')) rowMenu.hidePopover();
  if (picker?.matches(':popover-open')) picker.hidePopover();
}

function spendChanged() {
  syncSplitActual(spendItem);
  renderSpendPop();
  renderAll();
  save();
}

function renderSpendPop() {
  const it = spendItem;
  if (!it) return;
  const plan = it.plan ?? 0;
  const spent = spentOf(it);
  const left = budgetLeft(it);

  const head = document.createElement('div');
  head.className = 'spend-head';
  const title = document.createElement('h4');
  title.id = 'spendTitle';
  title.textContent = it.label || 'Balíček';
  const planEl = document.createElement('span');
  planEl.className = 'spend-plan';
  planEl.textContent = `balíček ${fmtCzk(plan)}`;
  head.append(title, planEl);

  const meter = document.createElement('div');
  meter.className = 'meter spend-meter';
  const fill = document.createElement('div');
  fill.className = 'meter-fill' + (left < 0 ? ' is-over' : '');
  fill.style.width = (plan > 0 ? Math.min(spent / plan, 1) * 100 : spent > 0 ? 100 : 0) + '%';
  meter.append(fill);

  const nums = document.createElement('dl');
  nums.className = 'spend-nums';
  const pair = (label, value, cls = '') => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    d.append(dt, dd);
    return d;
  };
  nums.append(
    pair('Utraceno', fmtCzk(spent)),
    left < 0
      ? pair('Přečerpáno', fmtCzk(-left), 'is-over')
      : pair(it.closed ? 'Uzavřeno, nevyčerpáno' : 'Zbývá', fmtCzk(left), 'is-main'),
  );

  // Zápis nové útraty – Enter stačí, počítat jde i tady („450+320“).
  const form = document.createElement('form');
  form.className = 'spend-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = 'spend-input';
  input.placeholder = 'Kolik jsi utratil?';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', `Nová útrata – ${it.label || 'balíček'}`);
  const add = document.createElement('button');
  add.type = 'submit';
  add.className = 'btn btn-primary spend-add-btn';
  add.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg> Zapsat';
  form.append(input, add);

  // Společný nákup: zapíše se celý do Společných, sem jen můj podíl.
  // Volba se pamatuje u položky – Potraviny bývají společné pořád.
  ensureShared();
  const shareBox = document.createElement('div');
  shareBox.className = 'spend-share';
  const shareToggle = document.createElement('label');
  shareToggle.className = 'spend-share-toggle';
  const shareCb = document.createElement('input');
  shareCb.type = 'checkbox';
  shareCb.checked = !!it.sharedDefault;
  shareToggle.append(shareCb, payBox(), document.createTextNode('Společný nákup'));
  const shareIds = new Set(it.sharedWith && it.sharedWith.length ? it.sharedWith : people().map((x) => x.id));
  shareIds.add(meId());
  const shareChips = document.createElement('div');
  shareChips.className = 'chips chips-sm';
  const shareHint = document.createElement('p');
  shareHint.className = 'spend-share-hint';
  const paintShare = () => {
    shareChips.hidden = !shareCb.checked;
    shareHint.hidden = !shareCb.checked;
    input.placeholder = shareCb.checked ? 'Kolik stál celý nákup?' : 'Kolik jsi utratil?';
    const total = parseNum(input.value) || 0;
    const ids = people().map((x) => x.id).filter((id) => shareIds.has(id));
    const mine = equalShares(total, ids, meId())[meId()] || 0;
    shareHint.textContent = total
      ? `Sem se zapíše tvůj podíl ${fmtCzk(mine)}, od ostatních vybereš ${fmtCzk(total - mine)}.`
      : `Rozdělí se rovným dílem mezi ${ids.length}.`;
  };
  for (const person of people()) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip chip-check';
    c.textContent = person.name;
    c.prepend(Object.assign(document.createElement('span'), { className: 'chip-mark', innerHTML: '<svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>' }));
    c.setAttribute('aria-pressed', String(shareIds.has(person.id)));
    if (person.me) { c.disabled = true; c.title = 'Tvůj podíl se zapisuje sem.'; }
    c.addEventListener('click', () => {
      if (shareIds.has(person.id)) shareIds.delete(person.id); else shareIds.add(person.id);
      c.setAttribute('aria-pressed', String(shareIds.has(person.id)));
      paintShare();
    });
    shareChips.append(c);
  }
  shareCb.addEventListener('change', paintShare);
  input.addEventListener('input', paintShare);
  shareBox.append(shareToggle, shareChips, shareHint);
  paintShare();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = parseNum(input.value);
    if (!v || v <= 0) { input.select(); return; }
    const amount = Math.round(v * 100) / 100;
    const ids = people().map((x) => x.id).filter((id) => shareIds.has(id));

    it.sharedDefault = shareCb.checked || undefined;
    if (shareCb.checked && ids.length > 1) {
      it.sharedWith = ids;
      const entry = {
        id: uid(), date: todayIso(), label: it.label || 'Společný nákup', amount,
        paidBy: meId(), shares: equalShares(amount, ids, meId()), settled: {},
        budget: { periodId: period().id, itemId: it.id },
      };
      shared().entries.unshift(entry);
      linkEntrySpend(entry);
      toast(`Společný nákup přidán – od ostatních vybereš ${fmtCzk(amount - entry.shares[meId()])}.`);
    } else {
      it.spends = it.spends || [];
      it.spends.unshift({ id: uid(), amount, date: todayIso() });
    }
    delete it.closed;
    spendChanged();
    $('.spend-input', spendPop)?.focus();
  });

  const list = document.createElement('ul');
  list.className = 'spend-list';
  const spends = it.spends || [];
  if (!spends.length) {
    const li = document.createElement('li');
    li.className = 'spend-empty';
    li.textContent = 'Zatím žádná útrata. Zapiš ji pokaždé, když z balíčku zaplatíš.';
    list.append(li);
  }
  for (const sp of spends) {
    const li = document.createElement('li');
    const date = document.createElement('span');
    date.className = 'spend-date';
    date.textContent = sp.date ? fmtDate(sp.date).replace(/ \d{4}$/, '') : 'dřív';
    const amt = document.createElement('span');
    amt.className = 'spend-amount';
    amt.textContent = fmtCzk(sp.amount);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.setAttribute('aria-label', `Smazat útratu ${fmtCzk(sp.amount)}`);
    del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';

    // Podíl ze společného nákupu: mazání bere s sebou i nákup.
    const entry = sp.sharedId && data.shared?.entries.find((x) => x.id === sp.sharedId);
    if (entry) {
      date.append(Object.assign(document.createElement('span'), {
        className: 'spend-shared', textContent: ` · společné z ${fmtCzk(entry.amount)}`,
      }));
      del.setAttribute('aria-label', `Smazat společný nákup ${fmtCzk(entry.amount)}`);
    }
    del.addEventListener('click', () => {
      if (entry) {
        if (isLocked(entry)) { toast('Nákup je už součástí vyrovnání. Nejdřív ho zruš ve Společných.'); return; }
        snapshot();
        unlinkEntrySpend(entry.id);
        shared().entries = shared().entries.filter((x) => x !== entry);
        spendChanged();
        toast('Společný nákup smazán.', 'Vrátit zpět', undo);
        return;
      }
      it.spends = it.spends.filter((x) => x !== sp);
      spendChanged();
      $('.spend-input', spendPop)?.focus();
    });
    li.append(date, amt, del);
    list.append(li);
  }

  const foot = document.createElement('div');
  foot.className = 'spend-foot';
  // Uzavřít = zbytek už neutratím, ať nevisí ve „zbývá zaplatit“.
  if (left > 0 || it.closed) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-quiet spend-close';
    close.textContent = it.closed ? 'Otevřít balíček znovu' : 'Uzavřít, zbytek neutratím';
    close.addEventListener('click', () => {
      if (it.closed) delete it.closed; else it.closed = true;
      spendChanged();
      $('.spend-close', spendPop)?.focus();
    });
    foot.append(close);
  }

  spendPop.replaceChildren(head, meter, nums, form, shareBox, list, ...(foot.children.length ? [foot] : []));
}

/* ------------------------------------------------------------
   Menu řádku výdaje
   ------------------------------------------------------------ */
let rowMenu = null;
let rowMenuOpener = null;

function openRowMenu(anchor, item, { block, onMove, onSplit, onAuto, onDelete }) {
  if (!rowMenu) {
    rowMenu = document.createElement('div');
    rowMenu.className = 'row-menu glass';
    rowMenu.setAttribute('popover', 'auto');
    rowMenu.setAttribute('role', 'menu');
    rowMenu.addEventListener('toggle', (e) => {
      if (e.newState === 'closed' && focusIsLost(rowMenu)) rowMenuOpener?.focus();
    });
    rowMenu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (rowMenu.getAttribute('role') !== 'menu') return;   // ve formuláři šipky patří poli
      e.preventDefault();
      const items = $$('[role^="menuitem"]', rowMenu);
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
    document.body.append(rowMenu);
  }
  rowMenuOpener = anchor;
  rowMenu.setAttribute('role', 'menu');
  rowMenu.removeAttribute('aria-label');

  // Automatická platba – jen u plateb najednou, balíček neodchází v jeden den.
  let auto = null;
  if (!item.split) {
    auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'menu-item';
    auto.setAttribute('role', 'menuitem');
    auto.setAttribute('aria-haspopup', 'dialog');
    auto.innerHTML =
      '<span class="menu-mark menu-mark-plain" aria-hidden="true"><svg class="ico"><use href="#i-repeat"></use></svg></span>';
    const text = el('span', 'menu-text');
    text.append(
      el('b', null, item.auto ? `Automaticky ${item.auto.day}. v měsíci` : 'Automatická platba'),
      el('em', null, item.auto ? 'Změnit den nebo vypnout.' : 'Inkaso nebo předplatné? V den platby se zaškrtne samo.'),
    );
    auto.append(text);
    auto.addEventListener('click', () => showAutoForm(anchor, item, onAuto));
  }

  const split = document.createElement('button');
  split.type = 'button';
  split.className = 'menu-item';
  split.setAttribute('role', 'menuitemcheckbox');
  split.setAttribute('aria-checked', String(!!item.split));
  split.innerHTML =
    '<span class="menu-mark" aria-hidden="true"><svg class="ico"><use href="#i-check"></use></svg></span>'
    + '<span class="menu-text"><b>Platit po částech</b>'
    + '<em>Balíček, ze kterého utrácíš postupně – benzín, jídlo.</em></span>';
  split.addEventListener('click', () => { rowMenu.hidePopover(); onSplit(); });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'menu-item is-danger';
  del.setAttribute('role', 'menuitem');
  del.innerHTML =
    '<span class="menu-mark" aria-hidden="true"><svg class="ico"><use href="#i-trash"></use></svg></span>'
    + '<span class="menu-text"><b>Smazat položku</b></span>';
  del.addEventListener('click', () => { rowMenu.hidePopover(); onDelete(); });

  // Přesun do jiné kategorie – jen ikona a název, ať je seznam krátký.
  const moveHead = document.createElement('p');
  moveHead.className = 'menu-label';
  moveHead.textContent = 'Přesunout do';
  const moves = period().blocks.filter((b) => b !== block).map((b) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'menu-item menu-item--compact';
    m.setAttribute('role', 'menuitem');
    m.innerHTML = `<span class="menu-mark" aria-hidden="true"><svg class="ico"><use href="#${categoryIcon(b)}"></use></svg></span>`;
    const t = document.createElement('span');
    t.className = 'menu-text';
    t.textContent = b.name || 'Bez názvu';
    m.append(t);
    m.setAttribute('aria-label', `Přesunout do ${b.name}`);
    m.addEventListener('click', () => { rowMenu.hidePopover(); onMove(b); });
    return m;
  });
  const sep = () => Object.assign(document.createElement('hr'), { className: 'menu-sep' });

  rowMenu.replaceChildren(...(auto ? [auto] : []), split, ...(moves.length ? [sep(), moveHead, ...moves] : []), sep(), del);
  rowMenu.showPopover();
  placePopover(rowMenu, anchor);
  (auto || split).focus();
}

// Nastavení automatické platby – ve stejném okénku, místo menu.
function showAutoForm(anchor, item, onAuto) {
  const p = periodOf(item) || period();
  rowMenu.setAttribute('role', 'dialog');
  rowMenu.setAttribute('aria-label', `Automatická platba – ${item.label || 'položka'}`);

  const form = el('form', 'auto-form');
  const head = el('div', 'auto-head');
  head.append(el('h4', null, 'Automatická platba'), el('span', null, item.label || 'Položka'));

  const lead = el('p', 'hint', 'Každý měsíc v tento den se položka sama zaškrtne jako zaplacená.');

  // Den: když už je jednou zaplacená, nabídne se den, kdy to bylo.
  const initial = item.auto?.day
    || (item.paidAt && !item.paidAuto ? Number(item.paidAt.slice(8, 10)) : Number(p.from.slice(8, 10)));
  const dayWrap = el('label', 'auto-day');
  const day = el('input', 'sf-input');
  day.type = 'number';
  day.min = '1'; day.max = '31'; day.step = '1';
  day.inputMode = 'numeric';
  day.value = String(initial);
  dayWrap.append(el('span', 'sf-label', 'Den v měsíci'), day, el('span', 'auto-suffix', '. den'));

  const next = el('p', 'auto-next');
  const paint = () => {
    const d = Math.round(Number(day.value));
    if (!(d >= 1 && d <= 31)) { next.textContent = 'Zadej den od 1 do 31.'; submitBtn.disabled = true; return; }
    submitBtn.disabled = false;
    const due = dueDate({ auto: { day: d } }, p);
    if (!due) { next.textContent = `V období ${p.name} tenhle den nenastane.`; return; }
    const n = daysUntil(due);
    next.textContent = item.paid
      ? `V ${p.name} už je zaplacená. Příště se zaškrtne sama.`
      : n > 0
        ? `V ${p.name} odejde ${fmtDate(due)} – za ${n} ${skloneni(n, 'den', 'dny', 'dní')}.`
        : n === 0
          ? `Odchází dnes (${fmtDate(due)}) – zaškrtne se hned.`
          : `${fmtDate(due)} už byl – zaškrtne se hned s tímhle datem.`;
  };

  const foot = el('div', 'auto-foot');
  const back = el('button', 'btn btn-quiet', item.auto ? 'Vypnout' : 'Zrušit');
  back.type = 'button';
  back.addEventListener('click', () => {
    rowMenu.hidePopover();
    if (!item.auto) return;
    snapshot();
    delete item.auto; delete item.autoSkip; delete item.paidAuto;
    onAuto(`${item.label || 'Položka'}: automatická platba vypnutá.`);
  });
  const submitBtn = el('button', 'btn btn-primary', item.auto ? 'Uložit' : 'Zapnout');
  submitBtn.type = 'submit';
  foot.append(back, submitBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Math.round(Number(day.value));
    if (!(d >= 1 && d <= 31)) return;
    snapshot();
    item.auto = { day: d };
    delete item.autoSkip;
    rowMenu.hidePopover();
    onAuto(`${item.label || 'Položka'}: zaškrtne se samo každý ${d}. den v měsíci.`);
  });
  day.addEventListener('input', paint);

  form.append(head, lead, dayWrap, next, foot);
  rowMenu.replaceChildren(form);
  paint();
  placePopover(rowMenu, anchor);
  day.focus();
  day.select();
}

function deleteCell(label, onDelete) {
  const td = document.createElement('td');
  td.className = 'cell-del';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'row-del';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';
  btn.addEventListener('click', onDelete);
  td.append(btn);
  return td;
}

function menuCell(item, actions) {
  const td = document.createElement('td');
  td.className = 'cell-del';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'row-del row-more';
  btn.setAttribute('aria-label', `Možnosti položky ${item.label || ''}`.trim());
  btn.setAttribute('aria-haspopup', 'menu');
  btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-more"></use></svg>';
  btn.addEventListener('click', () => openRowMenu(btn, item, actions));
  td.append(btn);
  return td;
}

function tableShell(headers) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h.text;
    if (h.num) th.className = 'num';
    if (h.width) th.style.width = h.width;
    if (h.hidden) th.hidden = true;
    tr.append(th);
  }
  thead.append(tr);
  const tbody = document.createElement('tbody');
  const tfoot = document.createElement('tfoot');
  table.append(thead, tbody, tfoot);
  wrap.append(table);
  return { wrap, table, tbody, tfoot };
}

function renderIncome() {
  const p = period();
  const sa = showActual();
  const headers = [
    { text: 'Položka' },
    { text: 'Plán', num: true },
    ...(sa ? [{ text: 'Skutečnost', num: true }, { text: 'Rozdíl', num: true }] : []),
    { text: '' },
  ];
  const { wrap, tbody, tfoot } = tableShell(headers);

  const refresh = () => { renderFigures(); renderSlabs(); renderTopbar(); updateFoot(); };

  if (!p.income.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = headers.length;
    td.textContent = 'Zatím žádný příjem. Přidej první řádek.';
    tr.append(td);
    tbody.append(tr);
  }

  for (const item of p.income) {
    const tr = document.createElement('tr');
    const dc = sa ? diffCell(item, 'income') : null;
    const onChange = () => { if (dc) dc._update(); refresh(); };
    tr.append(labelCell(item, onChange, 'Např. Výplata'));
    tr.append(amountCell(item, 'plan', 'Plán', onChange));
    if (sa) { tr.append(amountCell(item, 'actual', 'Skutečnost', onChange)); tr.append(dc); }
    tr.append(deleteCell(`Smazat příjem ${item.label || ''}`.trim(), () => {
      snapshot();
      p.income = p.income.filter((x) => x !== item);
      renderAll(); save();
      toast('Řádek smazán.', 'Vrátit zpět', undo);
    }));
    tbody.append(tr);
  }

  function updateFoot() {
    const cells = [
      { text: 'Celkem příjmy', cls: 'total-label' },
      { text: fmtCzk(sumIncome(p, 'plan')), num: true },
      ...(sa ? [
        { text: hasAnyActual(p) ? fmtCzk(sumIncome(p, 'actual')) : '—', num: true },
        { text: '', num: true },
      ] : []),
      { text: '' },
    ];
    const tr = document.createElement('tr');
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c.text;
      if (c.num) td.className = 'num';
      if (c.cls) td.className = c.cls;
      tr.append(td);
    }
    tfoot.replaceChildren(tr);
  }
  updateFoot();

  const foot = document.createElement('div');
  foot.className = 'table-foot';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add-row';
  add.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg> Přidat příjem';
  add.addEventListener('click', () => {
    p.income.push({ id: uid(), label: '', plan: 0, actual: null });
    renderAll(); save();
    focusLastRow(els.incomeTable);
  });
  foot.append(add);
  wrap.append(foot);

  els.incomeTable.replaceChildren(wrap);
}

function focusLastRow(host) {
  const rows = $$('tbody tr', host);
  const last = rows[rows.length - 1];
  if (last) $('.cell-input', last)?.focus();
}

function renderBlocks() {
  const p = period();
  const sa = showActual();
  const sections = p.blocks.map((block) => {
    const section = document.createElement('section');
    section.className = 'block-section';

    section.id = 'kat-' + block.id;
    section.style.setProperty('scroll-margin-top', '96px');

    const head = document.createElement('div');
    head.className = 'section-head block-head';

    const iconBtn = document.createElement('button');
    iconBtn.type = 'button';
    iconBtn.className = 'item-icon block-icon';
    const paintIcon = () => {
      iconBtn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${categoryIcon(block)}"></use></svg>`;
      iconBtn.setAttribute('aria-label', `Ikona kategorie ${block.name}. Klikni a vyber jinou.`);
    };
    paintIcon();
    iconBtn.addEventListener('click', () => openIconPicker(iconBtn, block, () => {
      paintIcon(); renderCategories(); save();
    }, categoryIcon(block)));

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'block-title-input';
    title.value = block.name;
    title.setAttribute('aria-label', 'Název kategorie');
    title.size = Math.max(block.name.length, 8);
    title.addEventListener('input', () => {
      block.name = title.value;
      title.size = Math.max(title.value.length, 8);
      if (!block.icon) paintIcon();
      if (!block.kind) kind.value = kindOf(block);
      renderCategories(); save();
    });

    // Druh kategorie – nenápadně hned za názvem, jako podtitul.
    const kind = document.createElement('select');
    kind.className = 'kind-select';
    kind.setAttribute('aria-label', `Druh kategorie ${block.name}`);
    for (const [k, label] of KINDS) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = label;
      kind.append(opt);
    }
    kind.value = kindOf(block);
    kind.addEventListener('change', () => {
      block.kind = kind.value;
      renderCategories(); save();
    });

    const actions = document.createElement('div');
    actions.className = 'block-head-actions';
    const payNote = document.createElement('span');
    payNote.className = 'block-pay';
    const updatePayNote = () => {
      const s = payStats(block.items);
      payNote.hidden = !s.n;
      payNote.classList.toggle('is-done', s.done);
      payNote.replaceChildren();
      if (s.done) {
        payNote.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>';
        payNote.append('zaplaceno');
      } else {
        payNote.textContent = `${s.nPaid} z ${s.n} zaplaceno · zbývá ${fmtCzk(s.left)}`;
      }
    };
    updatePayNote();

    const total = document.createElement('span');
    total.className = 'block-total';
    total.textContent = fmtCzk(sumBlock(block, 'plan'));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.setAttribute('aria-label', `Smazat kategorii ${block.name}`);
    del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';
    del.addEventListener('click', () => {
      const n = block.items.length;
      const remove = () => {
        snapshot();
        p.blocks = p.blocks.filter((b) => b !== block);
        renderAll(); save();
        toast('Kategorie smazána.', 'Vrátit zpět', undo);
      };
      if (!n) remove();
      else confirmDelete(`Smazat kategorii „${block.name}“ i se ${n} ${skloneni(n, 'položkou', 'položkami', 'položkami')}? Položky můžeš předtím přesunout jinam přes ⋯ u řádku.`, remove);
    });
    actions.append(payNote, total, del);
    head.append(iconBtn, title, kind, actions);

    const headers = [
      { text: '', width: '3px' },
      { text: 'Položka' },
      { text: 'Kam' },
      { text: 'Plán', num: true },
      ...(sa ? [{ text: 'Skutečnost', num: true }, { text: 'Rozdíl', num: true }] : []),
      { text: '' },
    ];
    const { wrap, tbody, tfoot } = tableShell(headers);

    const refreshAll = () => {
      total.textContent = fmtCzk(sumBlock(block, 'plan'));
      updateFoot();
      updatePayNote();
      renderFigures(); renderSlabs(); renderPay(); renderTopbar(); renderCategories();
    };

    if (!block.items.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      const td = document.createElement('td');
      td.colSpan = headers.length;
      td.textContent = 'Zatím prázdné. Přidej položku, nebo sem nějakou přesuň přes ⋯ u řádku.';
      tr.append(td);
      tbody.append(tr);
    }

    for (const item of block.items) {
      const tr = document.createElement('tr');
      const acc = accountById(item.account);
      const tintTd = document.createElement('td');
      tintTd.className = 'col-tint';
      const bar = document.createElement('span');
      bar.className = 'tint-bar';
      tintTd.append(bar);
      tr.append(tintTd);

      const setTint = () => {
        const a = accountById(item.account);
        tr.style.setProperty('--tint', accColor(a));
        // Podúčet má stejnou barvu jako rodič, pozná se pruhováním.
        bar.classList.toggle('is-child', !!(a && a.parent));
      };
      setTint();

      const dc = sa ? diffCell(item, 'expense') : null;
      const markRow = () => {
        tr.classList.toggle('is-paid', isPayable(item) && isDone(item));
        tr.classList.toggle('is-budget', !!item.split);
      };
      markRow();
      let labelTd = null;
      const onChange = () => {
        if (dc) dc._update();
        labelTd?._paintBudget?.();
        markRow();
        refreshAll();
      };

      labelTd = labelCell(item, onChange, 'Např. Potraviny', () => { markRow(); refreshAll(); });
      tr.append(labelTd);

      const accTd = document.createElement('td');
      accTd.className = 'cell-acc';
      accTd.dataset.label = 'Kam';
      const select = document.createElement('select');
      select.className = 'cell-select';
      select.setAttribute('aria-label', `Kam patří ${item.label || 'položka'}`);
      for (const a of data.accounts) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = accountLabel(a);
        if (a.id === (acc && acc.id)) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener('change', () => {
        item.account = select.value;
        setTint();
        refreshAll(); save();
      });
      accTd.append(select);
      tr.append(accTd);

      tr.append(amountCell(item, 'plan', 'Plán', onChange));
      if (sa) { tr.append(amountCell(item, 'actual', 'Skutečnost', onChange)); tr.append(dc); }

      tr.append(menuCell(item, {
        block,
        onMove: (target) => {
          snapshot();
          block.items = block.items.filter((x) => x !== item);
          target.items.push(item);
          renderAll(); save();
          toast(`${item.label || 'Položka'} přesunuta do ${target.name}.`, 'Vrátit zpět', undo);
        },
        onAuto: (message) => {
          // Když den v tomhle období už byl, zaškrtne se to hned.
          autoPayAndTell();
          renderAll(); save();
          toast(message, 'Vrátit zpět', undo);
        },
        onSplit: () => {
          snapshot();
          const on = !item.split;
          setSplit(item, on);
          renderAll(); save();
          toast(on
            ? `${item.label || 'Položka'} se teď platí po částech. Útraty zapisuj přes prstenec u názvu.`
            : `${item.label || 'Položka'} se zase platí najednou.`, 'Vrátit zpět', undo);
          if (on) $(`.budget-btn[data-spend="${item.id}"]`)?.focus();
        },
        onDelete: () => {
          snapshot();
          block.items = block.items.filter((x) => x !== item);
          renderAll(); save();
          toast('Položka smazána.', 'Vrátit zpět', undo);
        },
      }));

      tbody.append(tr);
    }

    function updateFoot() {
      const cells = [
        { text: '' },
        { text: 'Celkem', cls: 'total-label' },
        { text: '' },
        { text: fmtCzk(sumBlock(block, 'plan')), num: true },
        ...(sa ? [
          { text: block.items.some((i) => i.actual != null) ? fmtCzk(sumBlock(block, 'actual')) : '—', num: true },
          { text: '', num: true },
        ] : []),
        { text: '' },
      ];
      const tr = document.createElement('tr');
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c.text;
        if (c.num) td.className = 'num';
        if (c.cls) td.className = c.cls;
        tr.append(td);
      }
      tfoot.replaceChildren(tr);
    }
    updateFoot();

    const foot = document.createElement('div');
    foot.className = 'table-foot';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-row';
    add.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg> Přidat položku';
    add.addEventListener('click', () => {
      const last = block.items[block.items.length - 1];
      block.items.push({
        id: uid(), label: '',
        account: last ? last.account : data.accounts[0].id,
        plan: 0, actual: null,
      });
      renderAll(); save();
      focusLastRow(section);
    });
    foot.append(add);
    wrap.append(foot);

    section.append(head, wrap);
    return section;
  });

  const addBlock = document.createElement('button');
  addBlock.type = 'button';
  addBlock.className = 'btn btn-quiet';
  addBlock.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg> Přidat kategorii';
  addBlock.addEventListener('click', () => {
    // Ikona i druh se odhadnou z názvu, dokud je nevybereš ručně.
    const block = { id: uid(), name: 'Nová kategorie', items: [] };
    period().blocks.push(block);
    renderAll(); save();
    const input = $(`#kat-${block.id} .block-title-input`);
    input?.focus();
    input?.select();
  });

  els.blocksHost.replaceChildren(...sections, addBlock);
}

/* ------------------------------------------------------------
   Vykreslení – kategorie
   Seřazené podle částky, ať je hned vidět, kam jdou peníze.
   Pruhy jsou v barvě textu – barvy patří účtům.
   ------------------------------------------------------------ */
const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function renderCategories() {
  const p = period();
  const sa = showActual();
  const total = sumExpenses(p, 'plan');

  // Druhy: nutné / spoření / volitelné
  const byKind = KINDS.map(([k, label]) => ({
    k, label,
    sum: p.blocks.filter((b) => kindOf(b) === k).reduce((s, b) => s + sumBlock(b, 'plan'), 0),
  }));

  const split = document.createElement('div');
  split.className = 'kind-split';
  const bar = document.createElement('div');
  bar.className = 'kind-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', byKind.map((x) => `${x.label} ${fmtCzk(x.sum)}, ${pctOf(x.sum, total)} %`).join('; '));
  for (const x of byKind) {
    if (!x.sum) continue;
    const seg = document.createElement('i');
    seg.className = 'kind-seg kind-' + x.k;
    seg.style.flex = String(x.sum);
    bar.append(seg);
  }
  if (!total) bar.append(Object.assign(document.createElement('i'), { className: 'kind-seg kind-empty' }));

  const legend = document.createElement('dl');
  legend.className = 'kind-legend';
  for (const x of byKind) {
    const d = document.createElement('div');
    d.className = 'kind-item' + (x.sum ? '' : ' is-zero');
    const dt = document.createElement('dt');
    const sw = document.createElement('span');
    sw.className = 'kind-swatch kind-' + x.k;
    dt.append(sw, x.label);
    const dd = document.createElement('dd');
    const strong = document.createElement('b');
    strong.textContent = fmtCzk(x.sum);
    const share = document.createElement('span');
    share.textContent = `${pctOf(x.sum, total)} %`;
    dd.append(strong, share);
    d.append(dt, dd);
    legend.append(d);
  }
  split.append(bar, legend);

  // Kategorie od největší; prázdné na konec v pořadí z tabulek.
  const rows = p.blocks
    .map((b, i) => ({ b, i, sum: sumBlock(b, 'plan') }))
    .sort((a, z) => (z.sum - a.sum) || (a.i - z.i));
  const max = Math.max(1, ...rows.map((r) => r.sum));

  const list = document.createElement('ul');
  list.className = 'cat-list';
  for (const { b, sum } of rows) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-row' + (sum ? '' : ' is-zero');
    const n = b.items.length;
    btn.setAttribute('aria-label',
      `${b.name}: ${fmtCzk(sum)}, ${pctOf(sum, total)} % výdajů, ${kindName(kindOf(b)).toLowerCase()}. Přejít na položky.`);

    const icon = document.createElement('span');
    icon.className = 'cat-icon';
    icon.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${categoryIcon(b)}"></use></svg>`;

    const name = document.createElement('span');
    name.className = 'cat-name';
    const nb = document.createElement('b');
    nb.textContent = b.name || 'Bez názvu';
    const meta = document.createElement('span');
    meta.textContent = `${kindName(kindOf(b))} · ${n ? `${n} ${skloneni(n, 'položka', 'položky', 'položek')}` : 'prázdná'}`;
    name.append(nb, meta);

    const track = document.createElement('span');
    track.className = 'cat-track';
    const fill = document.createElement('i');
    fill.style.width = (sum / max) * 100 + '%';
    track.append(fill);

    const amount = document.createElement('span');
    amount.className = 'cat-amount';
    const ab = document.createElement('b');
    ab.textContent = fmtCzk(sum);
    amount.append(ab);
    if (sa && b.items.some((i) => i.actual != null)) {
      const act = sumBlock(b, 'actual');
      const s = document.createElement('span');
      s.textContent = `skutečně ${fmtCzk(act)}`;
      if (act > sum) s.className = 'is-over';
      amount.append(s);
    }

    const pct = document.createElement('span');
    pct.className = 'cat-pct';
    pct.textContent = sum ? `${pctOf(sum, total)} %` : '—';

    btn.append(icon, name, track, amount, pct);
    btn.addEventListener('click', () => {
      const section = $(`#kat-${b.id}`);
      if (!section) return;
      section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      $('.block-title-input', section)?.focus({ preventScroll: true });
    });
    li.append(btn);
    list.append(li);
  }

  const foot = document.createElement('div');
  foot.className = 'cat-foot';
  const fl = document.createElement('span');
  fl.textContent = 'Celkem výdaje';
  const fv = document.createElement('b');
  fv.textContent = fmtCzk(total);
  foot.append(fl, fv);
  if (sa && hasAnyActual(p)) {
    const fa = document.createElement('span');
    fa.className = 'cat-foot-act';
    fa.textContent = `skutečně ${fmtCzk(sumExpenses(p, 'actual'))}`;
    foot.append(fa);
  }

  els.recapTable.replaceChildren(split, list, foot);
}

/* ------------------------------------------------------------
   Vykreslení – přehled všech období
   ------------------------------------------------------------ */
function renderOverview() {
  const headers = [
    { text: 'Období' },
    { text: 'Příjmy', num: true },
    { text: 'Výdaje', num: true },
    { text: 'Zůstatek', num: true },
    { text: 'Utraceno', num: true },
    { text: 'Nezaplaceno', num: true },
  ];
  const { wrap, tbody } = tableShell(headers);

  for (const p of data.periods) {
    const inc = sumIncome(p, 'plan');
    const out = sumExpenses(p, 'plan');
    const bal = inc - out;
    const tr = document.createElement('tr');
    tr.className = 'overview-row';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'link');
    const open = () => { activeId = p.id; setView('mesic'); renderAll(); };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });

    const name = document.createElement('td');
    name.style.padding = '12px';
    const strong = document.createElement('div');
    strong.className = 'cell-strong';
    strong.textContent = p.name;
    const range = document.createElement('div');
    range.style.fontSize = 'var(--t-xs)';
    range.style.color = 'var(--ink-3)';
    range.textContent = fmtRange(p.from, p.to);
    name.append(strong, range);
    tr.append(name);

    for (const [label, val, neg] of [
      ['Příjmy', inc, false], ['Výdaje', out, false], ['Zůstatek', bal, bal < 0],
    ]) {
      const td = document.createElement('td');
      td.className = 'num';
      td.style.padding = '12px';
      td.dataset.label = label;
      td.textContent = fmtCzk(val);
      if (neg) td.style.color = 'var(--negative)';
      tr.append(td);
    }

    const pct = document.createElement('td');
    pct.className = 'num';
    pct.style.padding = '12px';
    pct.dataset.label = 'Utraceno';
    pct.textContent = inc ? Math.round((out / inc) * 100) + ' %' : '—';
    tr.append(pct);

    // Ať v minulém měsíci nezůstane nic zapomenutého.
    const s = payStats(allItems(p));
    const left = document.createElement('td');
    left.className = 'num';
    left.style.padding = '12px';
    left.dataset.label = 'Nezaplaceno';
    left.textContent = !s.n ? '—' : s.done ? 'nic' : fmtCzk(s.left);
    if (!s.done && s.n) left.style.fontWeight = '600';
    else left.style.color = 'var(--ink-3)';
    tr.append(left);

    tbody.append(tr);
  }

  els.overviewTable.replaceChildren(wrap);
}

function renderSplit() {
  const rows = data.periods.map((p) => {
    const map = byAccount(p, 'plan');
    const total = [...map.values()].reduce((a, b) => a + b, 0);

    const row = document.createElement('div');
    row.className = 'split-row';
    const name = document.createElement('div');
    name.className = 'split-name';
    name.textContent = p.name;

    const tops = topAccounts();
    const bar = document.createElement('div');
    bar.className = 'split-bar';
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', tops
      .map((a) => `${a.name} ${fmtCzk(accountTotal(map, a))}`).join(', '));

    for (const a of tops) {
      const v = accountTotal(map, a);
      if (!v) continue;
      const seg = document.createElement('div');
      seg.className = 'split-seg';
      seg.style.flex = String(v);
      seg.style.background = accColor(a);
      const kids = childrenOf(a.id).filter((c) => (map.get(c.id) || 0) > 0);
      seg.title = `${a.name}: ${fmtCzk(v)}`
        + (kids.length ? ' (' + kids.map((c) => `${c.name} ${fmtCzk(map.get(c.id) || 0)}`).join(', ') + ')' : '');
      const share = total ? Math.round((v / total) * 100) : 0;
      if (share >= 12) seg.textContent = share + ' %';
      bar.append(seg);
    }
    if (!total) {
      const seg = document.createElement('div');
      seg.className = 'split-seg';
      seg.style.flex = '1';
      seg.style.background = 'var(--hairline)';
      bar.append(seg);
    }

    row.append(name, bar);
    return row;
  });

  const legend = document.createElement('div');
  legend.className = 'legend';
  for (const a of topAccounts()) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = accColor(a);
    const kids = childrenOf(a.id);
    const label = document.createElement('span');
    label.textContent = kids.length ? `${a.name} (včetně ${kids.map((c) => c.name.toLowerCase()).join(', ')})` : a.name;
    item.append(dot, label);
    legend.append(item);
  }

  els.splitChart.replaceChildren(...rows, legend);
}

/* ------------------------------------------------------------
   Společné nákupy se spolubydlícími
   Jeden deník pro všechna období – dluh s koncem měsíce nekončí.
   Sleduje se jen to, co si dlužím já s každým z ostatních;
   co si dluží mezi sebou, tady neřešíme.
   ------------------------------------------------------------ */
// Jména spolubydlících žijí v datech, ne v kódu – ten je veřejný.
const DEFAULT_PEOPLE = [
  { id: 'ja', name: 'Já', me: true },
];

function ensureShared() {
  data.shared = data.shared || {};
  const s = data.shared;
  if (!Array.isArray(s.people) || !s.people.length) s.people = clone(DEFAULT_PEOPLE);
  s.entries = s.entries || [];
  s.settlements = s.settlements || [];
}
const shared = () => data.shared;
const people = () => shared().people;
const meId = () => (people().find((x) => x.me) || people()[0]).id;
const others = () => people().filter((x) => !x.me);
const personById = (id) => people().find((x) => x.id === id);
const personName = (id) => personById(id)?.name || 'Někdo';
// Iniciála; když ji má víc lidí (Marek, Magda), vezmou se dvě písmena.
function initialOf(pid) {
  const name = (personName(pid) || '?').trim();
  const first = name.charAt(0).toUpperCase() || '?';
  const clash = people().some((x) => x.id !== pid && (x.name || '').trim().charAt(0).toUpperCase() === first);
  return clash ? first + name.charAt(1).toLowerCase() : first;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Rovným dílem po celých korunách; zbytek po zaokrouhlení nese plátce.
function equalShares(amount, ids, payer) {
  if (!ids.length) return {};
  const each = Math.floor(amount / ids.length);
  const shares = Object.fromEntries(ids.map((id) => [id, each]));
  const who = ids.includes(payer) ? payer : ids[0];
  shares[who] = Math.round((shares[who] + amount - each * ids.length) * 100) / 100;
  return shares;
}

// Co z nákupu plyne mezi mnou a ostatními: kladné = dluží mně.
function entryRelations(e) {
  const me = meId();
  if (e.paidBy === me) {
    return Object.entries(e.shares)
      .filter(([pid, amt]) => pid !== me && amt)
      .map(([pid, amt]) => ({ pid, amount: amt }));
  }
  return e.shares[me] ? [{ pid: e.paidBy, amount: -e.shares[me] }] : [];
}
const isOpen = (e) => entryRelations(e).some((r) => !e.settled?.[r.pid]);
// Vyrovnání (ne ruční odškrtnutí) zamyká nákup proti úpravám.
const isLocked = (e) => Object.values(e.settled || {}).some((v) => v !== 'ruka');

function balances() {
  const map = new Map(others().map((p) => [p.id, { amount: 0, n: 0 }]));
  for (const e of shared().entries) {
    for (const r of entryRelations(e)) {
      if (e.settled?.[r.pid]) continue;
      const b = map.get(r.pid) || { amount: 0, n: 0 };
      b.amount += r.amount;
      b.n++;
      map.set(r.pid, b);
    }
  }
  return map;
}

/* Můj podíl se může rovnou zapsat jako útrata do balíčku (Potraviny…),
   takže rozpočet počítá jen to, co je opravdu moje. */
function unlinkEntrySpend(entryId) {
  for (const p of data.periods) {
    for (const it of allItems(p)) {
      if (!it.spends?.some((s) => s.sharedId === entryId)) continue;
      it.spends = it.spends.filter((s) => s.sharedId !== entryId);
      syncSplitActual(it);
    }
  }
}
function linkEntrySpend(e) {
  unlinkEntrySpend(e.id);
  const mine = e.shares[meId()];
  if (!e.budget || !mine) return;
  const p = data.periods.find((x) => x.id === e.budget.periodId);
  const it = p && allItems(p).find((x) => x.id === e.budget.itemId);
  if (!it || !it.split) return;
  it.spends = it.spends || [];
  it.spends.unshift({ id: uid(), amount: mine, date: e.date, sharedId: e.id });
  syncSplitActual(it);
}
function budgetItemOf(e) {
  if (!e.budget) return null;
  const p = data.periods.find((x) => x.id === e.budget.periodId);
  return p && allItems(p).find((x) => x.id === e.budget.itemId);
}

function periodForDate(iso) {
  return data.periods.find((p) => p.from <= iso && iso < p.to)
    || data.periods.find((p) => p.from <= iso && iso <= p.to)
    || data.periods[data.periods.length - 1];
}
function budgetOptions(iso) {
  const p = periodForDate(iso);
  return p ? allItems(p).filter((it) => it.split).map((it) => ({ key: `${p.id}:${it.id}`, label: it.label || 'Balíček', p })) : [];
}
function guessBudget(label, iso) {
  const opts = budgetOptions(iso);
  const t = (label || '').toLowerCase();
  const byName = t && opts.find((o) => t.includes(o.label.toLowerCase()));
  if (byName) return byName.key;
  if (/nákup|nakup|lidl|albert|billa|kaufland|penny|tesco|potravin|jídl|jidl|drogeri|rohlík|rohlik/i.test(label || '')) {
    const food = opts.find((o) => /potravin|jídl|jidl|nákup|nakup/i.test(o.label));
    if (food) return food.key;
  }
  return '';
}

/* Nájem, ze kterého se dluh odečte. Úprava sedí na položce, plán
   (skutečná cena bydlení) zůstane, mění se jen to, co se posílá. */
const adjustOf = (it) => (it.adjust || []).reduce((s, a) => s + (a.amount || 0), 0);

function rentOptions(p) {
  return p ? allItems(p).filter((it) => !it.split) : [];
}
function guessRentItem(p) {
  const items = rentOptions(p);
  return items.find((it) => /nájem|najem/i.test(it.label || ''))
    || items.find((it) => /bydlen/i.test(it.label || ''))
    || items[0];
}
// Do jakého období odečet patří: první, kde nájem ještě není zaplacený.
function guessRentPeriod() {
  return data.periods.find((p) => {
    const it = guessRentItem(p);
    return it && !it.paid && p.to >= todayIso();
  }) || data.periods[data.periods.length - 1];
}

function settlePerson(pid, { via, periodId, itemId }) {
  const bal = balances().get(pid);
  if (!bal || !bal.amount) return null;
  const sid = uid();
  const s = { id: sid, date: todayIso(), person: pid, amount: bal.amount, via, entries: [] };
  for (const e of shared().entries) {
    if (e.settled?.[pid]) continue;
    if (!entryRelations(e).some((r) => r.pid === pid)) continue;
    e.settled = e.settled || {};
    e.settled[pid] = sid;
    s.entries.push(e.id);
  }
  if (via === 'rent') {
    const p = data.periods.find((x) => x.id === periodId);
    const it = p && allItems(p).find((x) => x.id === itemId);
    if (it) {
      it.adjust = it.adjust || [];
      it.adjust.push({ settlementId: sid, person: pid, amount: -bal.amount });
      s.periodId = periodId;
      s.itemId = itemId;
    }
  }
  shared().settlements.unshift(s);
  return s;
}

function cancelSettlement(sid) {
  for (const e of shared().entries) {
    for (const [pid, v] of Object.entries(e.settled || {})) if (v === sid) delete e.settled[pid];
  }
  for (const p of data.periods) {
    for (const it of allItems(p)) {
      if (!it.adjust) continue;
      it.adjust = it.adjust.filter((a) => a.settlementId !== sid);
      if (!it.adjust.length) delete it.adjust;
    }
  }
  shared().settlements = shared().settlements.filter((s) => s.id !== sid);
}

/* ---------- vykreslení ---------- */
let sharedFilter = 'open';
let draft = null;
const newDraft = () => ({
  id: null, label: '', amount: '', date: todayIso(),
  paidBy: meId(), ids: people().map((x) => x.id), custom: null,
  budget: '', budgetTouched: false,
});

function avatar(pid, cls = '') {
  const a = el('span', 'avatar ' + cls, initialOf(pid));
  a.setAttribute('aria-hidden', 'true');
  return a;
}

function renderShared() {
  ensureShared();
  if (!draft) draft = newDraft();
  els.sharedPeople.replaceChildren(...renderSharedPeople());
  els.sharedForm.replaceChildren(renderSharedForm());
  els.sharedList.replaceChildren(...renderSharedList());
  els.sharedHistory.replaceChildren(...renderSharedHistory());
  els.sharedSettings.replaceChildren(...renderSharedSettings());
}

function renderSharedPeople() {
  const bal = balances();
  let owedToMe = 0, iOwe = 0;
  for (const b of bal.values()) { if (b.amount > 0) owedToMe += b.amount; else iOwe -= b.amount; }
  els.sharedNote.textContent = !owedToMe && !iOwe
    ? 'Všechno je vyrovnané.'
    : [owedToMe ? `Ostatní ti dluží ${fmtCzk(owedToMe)}` : '', iOwe ? `ty dlužíš ${fmtCzk(iOwe)}` : '']
      .filter(Boolean).join(', ') + '.';

  return others().map((person) => {
    const b = bal.get(person.id) || { amount: 0, n: 0 };
    const card = el('article', 'person glass' + (b.amount ? '' : ' is-even'));

    const top = el('div', 'person-top');
    const name = el('h4', 'person-name', person.name);
    top.append(avatar(person.id), name);
    if (person.settle === 'rent') top.append(el('span', 'person-badge', 'z nájmu'));

    const amount = el('strong', 'person-amount', b.amount ? fmtCzk(Math.abs(b.amount)) : '0 Kč');
    const n = b.n;
    const note = el('p', 'person-note', !b.amount
      ? 'vyrovnáno'
      : `${b.amount > 0 ? 'dluží ti' : 'dlužíš'} · ${n} ${skloneni(n, 'nákup', 'nákupy', 'nákupů')}`);

    card.append(top, amount, note);

    if (b.amount) {
      const btn = el('button', 'person-settle');
      btn.type = 'button';
      btn.textContent = person.settle === 'rent' && b.amount > 0 ? 'Odečíst z nájmu' : b.amount > 0 ? 'Vybrat peníze' : 'Vyrovnat';
      btn.setAttribute('aria-label', `${btn.textContent}: ${person.name}, ${fmtCzk(Math.abs(b.amount))}`);
      btn.addEventListener('click', () => openSettle(person.id));
      card.append(btn);
    }
    return card;
  });
}

function draftShares() {
  const d = draft;
  const amount = parseNum(d.amount) || 0;
  if (d.custom) {
    const shares = {};
    for (const id of d.ids) shares[id] = parseNum(d.custom[id]) || 0;
    return shares;
  }
  return equalShares(amount, d.ids, d.paidBy);
}

function renderSharedForm() {
  const d = draft;
  const form = el('form', 'shared-form');
  form.noValidate = true;

  const title = el('div', 'sf-title');
  title.append(el('h4', null, d.id ? 'Upravit nákup' : 'Přidat společný nákup'));

  const field = (label, control, cls = '') => {
    const w = el('label', 'sf-field ' + cls);
    w.append(el('span', 'sf-label', label), control);
    return w;
  };

  const label = el('input', 'sf-input');
  label.type = 'text';
  label.placeholder = 'Třeba nákup v Lidlu';
  label.value = d.label;
  label.autocomplete = 'off';

  const amount = el('input', 'sf-input sf-amount');
  amount.type = 'text';
  amount.inputMode = 'decimal';
  amount.placeholder = '0 Kč';
  amount.value = d.amount;
  amount.autocomplete = 'off';

  const date = el('input', 'sf-input');
  date.type = 'date';
  date.value = d.date;

  const main = el('div', 'sf-main');
  main.append(field('Co', label, 'sf-grow'), field('Kolik', amount), field('Kdy', date));

  // Kdo platil – většinou já, ale může to být i někdo z nich.
  const payRow = el('div', 'sf-row');
  payRow.append(el('span', 'sf-label', 'Platil'));
  const payChips = el('div', 'chips');
  payChips.setAttribute('role', 'radiogroup');
  payChips.setAttribute('aria-label', 'Kdo platil');
  for (const person of people()) {
    const c = el('button', 'chip', person.me ? `${person.name} (já)` : person.name);
    c.type = 'button';
    c.setAttribute('role', 'radio');
    c.setAttribute('aria-checked', String(d.paidBy === person.id));
    c.addEventListener('click', () => { d.paidBy = person.id; rerender(); });
    payChips.append(c);
  }
  payRow.append(payChips);

  // Mezi koho se to dělí.
  const splitRow = el('div', 'sf-row');
  splitRow.append(el('span', 'sf-label', 'Rozdělit mezi'));
  const splitChips = el('div', 'chips');
  for (const person of people()) {
    const on = d.ids.includes(person.id);
    const c = el('button', 'chip chip-check', person.name);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(on));
    c.prepend(Object.assign(el('span', 'chip-mark'), { innerHTML: '<svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>' }));
    c.addEventListener('click', () => {
      d.ids = on ? d.ids.filter((x) => x !== person.id) : people().map((x) => x.id).filter((x) => x === person.id || d.ids.includes(x));
      if (d.custom && !on) d.custom[person.id] = '';
      rerender();
    });
    splitChips.append(c);
  }
  const mode = el('button', 'sf-link', d.custom ? 'Rozdělit rovným dílem' : 'Rozdělit jinak');
  mode.type = 'button';
  mode.addEventListener('click', () => {
    if (d.custom) d.custom = null;
    else {
      const eq = equalShares(parseNum(d.amount) || 0, d.ids, d.paidBy);
      d.custom = Object.fromEntries(d.ids.map((id) => [id, String(eq[id] ?? '')]));
    }
    rerender();
  });
  splitRow.append(splitChips, mode);

  // Náhled podílů – u vlastního rozdělení jako pole.
  const preview = el('div', 'sf-shares');
  const customInputs = {};
  for (const id of d.ids) {
    const cell = el('div', 'sf-share');
    cell.append(avatar(id, 'avatar-sm'), el('span', 'sf-share-name', personName(id)));
    if (d.custom) {
      const inp = el('input', 'sf-input sf-share-input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.value = d.custom[id] ?? '';
      inp.setAttribute('aria-label', `Podíl – ${personName(id)}`);
      inp.addEventListener('input', () => { d.custom[id] = inp.value; update(); });
      customInputs[id] = inp;
      cell.append(inp);
    } else {
      cell.append(el('b', 'sf-share-val'));
    }
    preview.append(cell);
  }
  const sumNote = el('p', 'sf-sum');

  // Můj podíl do rozpočtu.
  const budgetRow = el('div', 'sf-row sf-budget');
  const budgetSel = el('select', 'sf-select');
  budgetSel.setAttribute('aria-label', 'Kam započítat můj podíl');
  budgetRow.append(el('span', 'sf-label', 'Můj podíl'), budgetSel);
  const fillBudget = () => {
    const opts = budgetOptions(d.date);
    if (!d.budgetTouched) d.budget = guessBudget(d.label, d.date);
    if (d.budget && !opts.some((o) => o.key === d.budget)) d.budget = '';
    budgetSel.replaceChildren(
      Object.assign(el('option', null, 'nezapočítávat do rozpočtu'), { value: '' }),
      ...opts.map((o) => Object.assign(el('option', null, `zapsat do balíčku ${o.label} (${o.p.name})`), { value: o.key })),
    );
    budgetSel.value = d.budget;
  };
  budgetSel.addEventListener('change', () => { d.budget = budgetSel.value; d.budgetTouched = true; update(); });

  const foot = el('div', 'sf-foot');
  if (d.id) {
    const cancel = el('button', 'btn btn-quiet', 'Zrušit');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { draft = newDraft(); renderShared(); });
    foot.append(cancel);
  }
  const submit = el('button', 'btn btn-primary');
  submit.type = 'submit';
  submit.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${d.id ? 'i-check' : 'i-plus'}"></use></svg> ${d.id ? 'Uložit změny' : 'Přidat nákup'}`;
  foot.append(submit);

  function update() {
    const total = parseNum(d.amount) || 0;
    const shares = draftShares();
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    if (!d.custom) {
      $$('.sf-share', preview).forEach((cell, i) => {
        $('.sf-share-val', cell).textContent = fmtCzk(shares[d.ids[i]] || 0);
      });
    }
    const diff = Math.round((total - sum) * 100) / 100;
    const mine = shares[meId()] || 0;
    const valid = total > 0 && d.ids.length > 0 && Math.abs(diff) < 0.5;
    sumNote.classList.toggle('is-over', !!d.custom && Math.abs(diff) >= 0.5);
    sumNote.textContent = !d.ids.length
      ? 'Vyber, mezi koho se nákup dělí.'
      : d.custom && Math.abs(diff) >= 0.5
        ? (diff > 0 ? `Zbývá rozdělit ${fmtCzk(diff)}.` : `Rozděleno o ${fmtCzk(-diff)} víc, než stál nákup.`)
        : total
          ? summaryText(d.paidBy, shares, total)
          : '';
    budgetRow.hidden = !mine;
    submit.disabled = !valid;
  }
  // Po překreslení vrátit fokus na stejný ovládací prvek (klávesnice).
  function rerender() {
    const controls = (root) => $$('button, input, select', root);
    const idx = controls(form).indexOf(document.activeElement);
    els.sharedForm.replaceChildren(renderSharedForm());
    if (idx >= 0) controls(els.sharedForm)[idx]?.focus();
  }

  label.addEventListener('input', () => { d.label = label.value; fillBudget(); update(); });
  amount.addEventListener('input', () => { d.amount = amount.value; update(); });
  amount.addEventListener('blur', () => {
    const v = parseNum(amount.value);
    if (v != null && /[+\-*/]/.test(amount.value.slice(1))) { d.amount = String(v); amount.value = d.amount; update(); }
  });
  date.addEventListener('change', () => { d.date = date.value || todayIso(); fillBudget(); update(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const total = parseNum(d.amount) || 0;
    const shares = draftShares();
    if (!(total > 0) || !d.ids.length) { amount.focus(); return; }
    for (const [k, v] of Object.entries(shares)) if (!v) delete shares[k];
    snapshot();
    const [periodId, itemId] = (d.budget || '').split(':');
    const entry = d.id ? shared().entries.find((x) => x.id === d.id) : { id: uid(), settled: {} };
    Object.assign(entry, {
      date: d.date, label: d.label.trim() || 'Společný nákup', amount: total,
      paidBy: d.paidBy, shares, custom: !!d.custom || undefined,
      budget: d.budget ? { periodId, itemId } : undefined,
    });
    // Ruční odškrtnutí u lidí, kteří už v nákupu nejsou, zahodit.
    for (const pid of Object.keys(entry.settled || {})) {
      if (!entryRelations(entry).some((r) => r.pid === pid)) delete entry.settled[pid];
    }
    if (!d.id) shared().entries.unshift(entry);
    linkEntrySpend(entry);
    const editing = !!d.id;
    draft = newDraft();
    draft.paidBy = entry.paidBy;
    renderAll(); save();
    toast(editing ? 'Nákup upraven.' : `${entry.label}: přidáno, ${summaryText(entry.paidBy, entry.shares, entry.amount, true)}`, 'Vrátit zpět', undo);
    if (!editing) $('.shared-form .sf-input')?.focus();
  });

  fillBudget();
  form.append(title, main, payRow, splitRow, preview, sumNote, budgetRow, foot);
  update();
  return form;
}

function summaryText(paidBy, shares, total, short = false) {
  const me = meId();
  if (paidBy === me) {
    const back = Object.entries(shares).filter(([pid]) => pid !== me).reduce((s, [, v]) => s + v, 0);
    return back
      ? `${short ? 'vybereš' : 'Od ostatních vybereš'} ${fmtCzk(back)}${shares[me] ? `, tvůj podíl je ${fmtCzk(shares[me])}` : ''}.`
      : 'Celé je to tvoje.';
  }
  return shares[me]
    ? `Platil ${personName(paidBy)}, ty dlužíš ${fmtCzk(shares[me])}.`
    : `Tebe se to netýká – platil ${personName(paidBy)} a ty v rozdělení nejsi.`;
}

function renderSharedList() {
  const entries = shared().entries;
  const open = entries.filter(isOpen);

  const head = el('div', 'sl-head');
  const seg = el('div', 'segmented');
  for (const [key, label, n] of [['open', 'Nevyrovnané', open.length], ['all', 'Všechny', entries.length]]) {
    const b = el('button', 'seg' + (sharedFilter === key ? ' is-on' : ''), `${label} ${n}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(sharedFilter === key));
    b.addEventListener('click', () => { sharedFilter = key; renderShared(); });
    seg.append(b);
  }
  head.append(seg);

  const shown = (sharedFilter === 'open' ? open : entries)
    .slice().sort((a, z) => (z.date || '').localeCompare(a.date || ''));

  const list = el('ul', 'sl-list');
  if (!shown.length) {
    list.append(el('li', 'sl-empty', entries.length
      ? 'Nic nevyrovnaného. Všechno máš vybrané.'
      : 'Zatím žádný společný nákup. Přidej ho nahoře, nebo rovnou u útraty v balíčku zaškrtni „Společný nákup“.'));
  }

  for (const e of shown) {
    const li = el('li', 'sl-row' + (isOpen(e) ? '' : ' is-done'));
    const date = el('span', 'sl-date', e.date ? fmtDate(e.date).replace(/ \d{4}$/, '') : '—');

    const main = el('div', 'sl-main');
    main.append(el('b', null, e.label));
    const it = budgetItemOf(e);
    const meta = [`platil ${e.paidBy === meId() ? 'jsi ty' : personName(e.paidBy)}`];
    if (e.shares[meId()]) meta.push(it ? `tvůj podíl ${fmtCzk(e.shares[meId()])} v balíčku ${it.label}` : `tvůj podíl ${fmtCzk(e.shares[meId()])}`);
    main.append(el('span', null, meta.join(' · ')));

    const amount = el('span', 'sl-amount', fmtCzk(e.amount));

    const chips = el('div', 'sl-chips');
    for (const r of entryRelations(e)) {
      const state = e.settled?.[r.pid];
      const c = el('button', 'debt-chip' + (state ? ' is-settled' : '') + (r.amount < 0 ? ' is-mine' : ''));
      c.type = 'button';
      const who = el('span', 'debt-who', personName(r.pid));
      c.append(who, el('span', null, r.amount < 0 ? `dlužíš ${fmtCzk(-r.amount)}` : fmtCzk(r.amount)));
      c.setAttribute('aria-pressed', String(!!state));
      c.setAttribute('aria-label', `${personName(r.pid)}: ${r.amount < 0 ? 'dlužíš' : 'dluží'} ${fmtCzk(Math.abs(r.amount))}${state ? ', vyrovnáno' : ''}`);
      c.title = state && state !== 'ruka'
        ? 'Vyrovnáno v rámci vyrovnání – zrušíš ho dole v historii.'
        : state ? 'Odškrtnuto ručně. Kliknutím vrátíš.' : 'Kliknutím odškrtneš jen tenhle podíl.';
      c.addEventListener('click', () => {
        if (state && state !== 'ruka') { toast('Tenhle podíl je součástí vyrovnání. Zrušíš ho dole v historii vyrovnání.'); return; }
        e.settled = e.settled || {};
        if (state) delete e.settled[r.pid]; else e.settled[r.pid] = 'ruka';
        renderShared(); save();
      });
      chips.append(c);
    }

    const actions = el('div', 'sl-actions');
    const edit = el('button', 'row-del');
    edit.type = 'button';
    edit.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-pencil"></use></svg>';
    edit.setAttribute('aria-label', `Upravit ${e.label}`);
    const del = el('button', 'row-del');
    del.type = 'button';
    del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';
    del.setAttribute('aria-label', `Smazat ${e.label}`);
    if (isLocked(e)) {
      edit.disabled = del.disabled = true;
      edit.title = del.title = 'Nákup je součástí vyrovnání. Nejdřív ho zruš v historii.';
    }
    edit.addEventListener('click', () => {
      draft = {
        id: e.id, label: e.label, amount: String(e.amount), date: e.date,
        paidBy: e.paidBy, ids: people().map((x) => x.id).filter((id) => id in e.shares),
        custom: e.custom ? Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, String(v)])) : null,
        budget: e.budget ? `${e.budget.periodId}:${e.budget.itemId}` : '', budgetTouched: true,
      };
      renderShared();
      els.sharedForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
      $('.shared-form .sf-input')?.focus({ preventScroll: true });
    });
    del.addEventListener('click', () => {
      snapshot();
      unlinkEntrySpend(e.id);
      shared().entries = shared().entries.filter((x) => x !== e);
      renderAll(); save();
      toast('Nákup smazán.', 'Vrátit zpět', undo);
    });
    actions.append(edit, del);

    li.append(date, main, amount, chips, actions);
    list.append(li);
  }

  return [head, list];
}

function renderSharedHistory() {
  const items = shared().settlements;
  els.sharedHistorySection.hidden = !items.length;
  const list = el('ul', 'sh-list');
  for (const s of items) {
    const li = el('li', 'sh-row');
    const p = s.periodId && data.periods.find((x) => x.id === s.periodId);
    const rent = s.via === 'rent';
    li.append(
      el('span', 'sl-date', fmtDate(s.date).replace(/ \d{4}$/, '')),
      avatar(s.person, 'avatar-sm'),
      el('span', 'sh-text', `${personName(s.person)} · ${rent
        ? `${s.amount > 0 ? 'odečteno z' : 'přičteno k'} nájmu${p ? ` (${p.name})` : ''}`
        : s.amount > 0 ? 'vybráno' : 'posláno'}`),
      el('b', 'sh-amount', fmtCzk(Math.abs(s.amount))),
    );
    const undoBtn = el('button', 'sf-link', 'Zrušit');
    undoBtn.type = 'button';
    undoBtn.setAttribute('aria-label', `Zrušit vyrovnání ${personName(s.person)} ${fmtCzk(Math.abs(s.amount))}`);
    undoBtn.addEventListener('click', () => {
      snapshot();
      cancelSettlement(s.id);
      renderAll(); save();
      toast('Vyrovnání zrušeno, dluh je zase otevřený.', 'Vrátit zpět', undo);
    });
    li.append(undoBtn);
    list.append(li);
  }
  return [list];
}

function renderSharedSettings() {
  const rows = people().map((person) => {
    const row = el('div', 'ps-row');
    row.append(avatar(person.id));
    const name = el('input', 'sf-input');
    name.type = 'text';
    name.value = person.name;
    name.setAttribute('aria-label', 'Jméno');
    name.addEventListener('input', () => { person.name = name.value; save(); });
    name.addEventListener('change', () => renderShared());
    row.append(name);

    if (person.me) {
      row.append(el('span', 'ps-me', 'to jsem já'), el('span'));
      return row;
    }
    const how = el('select', 'sf-select');
    how.setAttribute('aria-label', `Vyrovnání – ${person.name}`);
    how.append(
      Object.assign(el('option', null, 'Peníze vybírám'), { value: 'collect' }),
      Object.assign(el('option', null, 'Odečítám z nájmu'), { value: 'rent' }),
    );
    how.value = person.settle || 'collect';
    how.addEventListener('change', () => { person.settle = how.value; renderShared(); save(); });

    const del = el('button', 'row-del');
    del.type = 'button';
    del.style.opacity = '1';
    del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';
    del.setAttribute('aria-label', `Odebrat ${person.name}`);
    const used = shared().entries.some((e) => e.paidBy === person.id || person.id in e.shares);
    del.disabled = used;
    if (used) del.title = 'Má společné nákupy, nejde odebrat.';
    del.addEventListener('click', () => {
      snapshot();
      shared().people = people().filter((x) => x !== person);
      draft = newDraft();
      renderAll(); save();
      toast(`Odebráno: ${person.name}.`, 'Vrátit zpět', undo);
    });
    row.append(how, del);
    return row;
  });

  const add = el('button', 'btn btn-quiet');
  add.type = 'button';
  add.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg> Přidat člověka';
  add.addEventListener('click', () => {
    people().push({ id: uid(), name: 'Nový spolubydlící', settle: 'collect' });
    draft = newDraft();
    renderShared(); save();
    const inputs = $$('.ps-row .sf-input', els.sharedSettings);
    inputs[inputs.length - 1]?.select();
  });
  return [...rows, add];
}

/* ---------- vyrovnání ---------- */
const settleDialog = $('#settleDialog');
let settleFor = null;

function openSettle(pid) {
  settleFor = pid;
  const person = personById(pid);
  const b = balances().get(pid);
  if (!person || !b?.amount) return;
  const owesMe = b.amount > 0;

  $('#settleTitle').textContent = `Vyrovnat · ${person.name}`;
  const body = $('#settleBody');
  const lead = el('p', 'settle-lead');
  // Věty bez skloňování jmen – u přezdívek by se to často nepovedlo.
  lead.append(
    `${owesMe ? `${person.name} ti dluží` : 'Dlužíš'} `,
    el('b', null, fmtCzk(Math.abs(b.amount))),
    ` za ${b.n} ${skloneni(b.n, 'nákup', 'nákupy', 'nákupů')}.`,
  );

  const choice = (value, title, sub, checked) => {
    const l = el('label', 'choice');
    const r = el('input');
    r.type = 'radio'; r.name = 'settleVia'; r.value = value; r.checked = checked;
    const s = el('span');
    s.append(el('strong', null, title), el('em', null, sub));
    l.append(r, s);
    return l;
  };
  const viaRent = person.settle === 'rent';
  const cash = choice('cash', owesMe ? 'Vybral jsem peníze' : 'Poslal jsem peníze',
    'Hotově nebo převodem. Dluh se tím uzavře.', !viaRent);
  const rent = choice('rent', owesMe ? 'Odečíst z nájmu' : 'Přičíst k nájmu',
    owesMe ? 'Na nájem pošleš o tuhle částku méně.' : 'Na nájem pošleš o tuhle částku víc.', viaRent);

  // Který nájem – období a položka.
  const rentWhere = el('div', 'field-row settle-rent');
  const perSel = el('select', 'sf-select');
  perSel.setAttribute('aria-label', 'Období');
  for (const p of data.periods) perSel.append(Object.assign(el('option', null, p.name), { value: p.id }));
  const itemSel = el('select', 'sf-select');
  itemSel.setAttribute('aria-label', 'Položka nájmu');
  const fillItems = () => {
    const p = data.periods.find((x) => x.id === perSel.value);
    const guess = guessRentItem(p);
    itemSel.replaceChildren(...rentOptions(p).map((it) => Object.assign(
      el('option', null, `${it.label || 'Bez názvu'} · ${fmtCzk(it.plan)}${it.paid ? ' · zaplaceno' : ''}`), { value: it.id })));
    if (guess) itemSel.value = guess.id;
  };
  perSel.value = guessRentPeriod()?.id;
  perSel.addEventListener('change', fillItems);
  fillItems();
  const wrapField = (label, control) => {
    const f = el('div', 'field');
    f.append(el('span', 'hint', label), control);
    return f;
  };
  rentWhere.append(wrapField('Období', perSel), wrapField('Položka', itemSel));

  // Zaplacený nájem už ponížit nejde – upozornit, ať to nezapadne.
  const paidWarn = el('p', 'hint settle-warn');
  const checkPaid = () => {
    const p = data.periods.find((x) => x.id === perSel.value);
    const it = p && allItems(p).find((x) => x.id === itemSel.value);
    paidWarn.hidden = !it?.paid;
    paidWarn.textContent = it?.paid
      ? `${it.label} v ${p.name} už máš zaplacený. Jestli se odečet má projevit až příště, založ nové období a vyber ho tady.`
      : '';
  };
  perSel.addEventListener('change', checkPaid);
  itemSel.addEventListener('change', checkPaid);
  checkPaid();

  const toggleRent = () => { rentWhere.hidden = paidWarn.hidden = !$('input[value="rent"]', body)?.checked; if (!rentWhere.hidden) checkPaid(); };
  body.replaceChildren(lead, cash, rent, rentWhere, paidWarn);
  $$('input[name="settleVia"]', body).forEach((r) => r.addEventListener('change', toggleRent));
  toggleRent();

  $('#settleOk').onclick = () => {
    const via = $('input[name="settleVia"]:checked', body).value;
    if (via === 'rent' && !itemSel.value) { toast('V tom období není položka, od které by šlo odečítat.'); return; }
    snapshot();
    const s = settlePerson(pid, { via, periodId: perSel.value, itemId: itemSel.value });
    settleDialog.close();
    renderAll(); save();
    if (!s) return;
    const p = data.periods.find((x) => x.id === s.periodId);
    const it = p && allItems(p).find((x) => x.id === s.itemId);
    toast(via === 'rent' && it
      ? `${it.label} v ${p.name}: pošleš ${fmtCzk(payAmount(it))}.`
      : `${person.name}: vyrovnáno ${fmtCzk(Math.abs(s.amount))}.`, 'Vrátit zpět', undo);
  };
  settleDialog.showModal();
}

/* ------------------------------------------------------------
   Vykreslení celku
   ------------------------------------------------------------ */
function renderAll() {
  document.body.classList.toggle('no-actual', !showActual());
  ensureShared();
  renderRail();
  renderTopbar();
  if (view === 'mesic') {
    renderSlabs();
    renderFigures();
    renderPay();
    renderIncome();
    renderBlocks();
    renderCategories();
  } else if (view === 'spolecne') {
    renderShared();
  } else {
    renderOverview();
    renderSplit();
  }
}

function setView(next) {
  view = next;
  els.viewMesic.hidden = next !== 'mesic';
  els.viewPrehled.hidden = next !== 'prehled';
  els.viewSpolecne.hidden = next !== 'spolecne';
  $$('.rail-tab').forEach((t) => t.classList.toggle('is-on', t.dataset.view === next));
}

/* ------------------------------------------------------------
   Období: zakládání a úpravy
   ------------------------------------------------------------ */
function blankPeriod(name, from, to) {
  return {
    id: uid(), name, from, to,
    income: [],
    blocks: DEFAULT_CATEGORIES.map(([n, icon, kind]) => ({ id: uid(), name: n, icon, kind, items: [] })),
  };
}

const periodDialog = $('#periodDialog');
const periodForm = $('#periodForm');
let dialogMode = 'new';

function openNewPeriod() {
  dialogMode = 'new';
  $('#periodDialogTitle').textContent = 'Nové období';
  $('#pdSubmit').textContent = 'Založit období';
  $('#pdCopyField').hidden = false;
  removeDeleteButton();

  const last = data.periods[data.periods.length - 1];
  const from = last ? last.to : todayIso();
  const to = addMonths(from, 1);
  const monthIdx = Number(from.split('-')[1]) - 1;
  $('#pdName').value = `${MESICE[monthIdx]} ${from.split('-')[0]}`;
  $('#pdFrom').value = from;
  $('#pdTo').value = to;
  periodDialog.showModal();
}

function openEditPeriod() {
  const p = period();
  dialogMode = 'edit';
  $('#periodDialogTitle').textContent = 'Upravit období';
  $('#pdSubmit').textContent = 'Uložit změny';
  $('#pdCopyField').hidden = true;
  $('#pdName').value = p.name;
  $('#pdFrom').value = p.from;
  $('#pdTo').value = p.to;
  addDeleteButton();
  periodDialog.showModal();
}

function addDeleteButton() {
  removeDeleteButton();
  if (data.periods.length <= 1) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-quiet';
  btn.id = 'pdDelete';
  btn.style.marginRight = 'auto';
  btn.style.color = 'var(--negative)';
  btn.textContent = 'Smazat období';
  btn.addEventListener('click', () => {
    const p = period();
    periodDialog.close();
    confirmDelete(`Smazat období „${p.name}“ i se vším, co v něm je?`, () => {
      snapshot();
      data.periods = data.periods.filter((x) => x.id !== p.id);
      activeId = data.periods[data.periods.length - 1].id;
      renderAll(); save();
      toast('Období smazáno.', 'Vrátit zpět', undo);
    });
  });
  $('.sheet-foot', periodDialog).prepend(btn);
}
function removeDeleteButton() { $('#pdDelete')?.remove(); }

periodForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#pdName').value.trim() || 'Období';
  const from = $('#pdFrom').value;
  const to = $('#pdTo').value;
  if (!from || !to) return;
  if (to < from) { toast('Datum „do“ musí být později než „od“.'); return; }

  if (dialogMode === 'edit') {
    const p = period();
    p.name = name; p.from = from; p.to = to;
  } else {
    const mode = periodForm.querySelector('input[name="copy"]:checked').value;
    const source = data.periods[data.periods.length - 1];
    let created;
    if (mode === 'empty' || !source) {
      created = blankPeriod(name, from, to);
    } else {
      created = clone(source);
      created.id = uid();
      created.name = name; created.from = from; created.to = to;
      created.income.forEach((i) => {
        i.id = uid();
        i.actual = null;
        if (mode === 'labels') i.plan = 0;
      });
      created.blocks.forEach((b) => {
        b.id = uid();
        b.items.forEach((i) => {
          i.id = uid();
          i.actual = null;
          setPaid(i, false);   // nový měsíc, nic ještě zaplacené není
          delete i.autoSkip;   // automatika zůstává, ruční výjimka ne
          if (i.split) { i.spends = []; delete i.closed; }   // balíček zůstane, útraty ne
          delete i.adjust;                                  // odečty z nájmu patří jen jednomu měsíci
          if (mode === 'labels') i.plan = 0;
        });
      });
    }
    data.periods.push(created);
    activeId = created.id;
  }
  periodDialog.close();
  setView('mesic');
  renderAll();
  save({ now: true });
});

/* ------------------------------------------------------------
   Potvrzení mazání
   ------------------------------------------------------------ */
const confirmDialog = $('#confirmDialog');
let confirmAction = null;
function confirmDelete(text, action) {
  $('#confirmText').textContent = text;
  confirmAction = action;
  confirmDialog.showModal();
}
$('#confirmOk').addEventListener('click', () => {
  confirmDialog.close();
  confirmAction?.();
  confirmAction = null;
});

/* ------------------------------------------------------------
   Nastavení
   ------------------------------------------------------------ */
const settingsDialog = $('#settingsDialog');

function renderAccountEditor() {
  const host = $('#accountEditor');
  host.replaceChildren(...data.accounts.map((a) => {
    const line = document.createElement('div');
    line.className = 'account-line';

    const sw = document.createElement('span');
    sw.className = 'account-swatch';
    sw.style.background = accColor(a);
    sw.style.setProperty('--swatch', accColor(a));

    const name = document.createElement('input');
    name.type = 'text';
    name.value = a.name;
    name.setAttribute('aria-label', 'Název účtu');
    name.addEventListener('input', () => {
      a.name = name.value;
      renderSlabs(); renderBlocks(); save();
    });

    const note = document.createElement('input');
    note.type = 'text';
    note.value = a.note || '';
    note.placeholder = 'Poznámka';
    note.setAttribute('aria-label', 'Poznámka k účtu');
    note.addEventListener('input', () => { a.note = note.value; renderSlabs(); save(); });

    // Samostatný převod, nebo rozdělení uvnitř jiného účtu?
    const parent = document.createElement('select');
    parent.className = 'account-parent';
    parent.setAttribute('aria-label', `Kam patří účet ${a.name}`);
    const solo = document.createElement('option');
    solo.value = '';
    solo.textContent = 'Samostatný převod';
    parent.append(solo);
    for (const other of data.accounts) {
      if (other.id === a.id || other.parent) continue;      // podúčet podúčtu nedává smysl
      if (childrenOf(a.id).length) continue;                // ani z rodiče podúčet
      const opt = document.createElement('option');
      opt.value = other.id;
      opt.textContent = 'Součást ' + other.name;
      parent.append(opt);
    }
    parent.value = a.parent || '';
    parent.disabled = parent.options.length === 1;
    parent.addEventListener('change', () => {
      if (parent.value) a.parent = parent.value; else delete a.parent;
      renderAccountEditor(); renderAll(); save();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.style.opacity = '1';
    del.setAttribute('aria-label', `Smazat účet ${a.name}`);
    del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"></use></svg>';
    del.disabled = data.accounts.length <= 1;
    del.addEventListener('click', () => {
      const kids = childrenOf(a.id);
      if (kids.length) {
        toast(`Nejdřív přesuň ${kids.map((k) => k.name).join(' a ')} jinam.`);
        return;
      }
      const used = data.periods.reduce((n, p) => n + p.blocks.reduce(
        (m, b) => m + b.items.filter((i) => i.account === a.id).length, 0), 0);
      const fallback = data.accounts.find((x) => x.id !== a.id);
      confirmDelete(
        used
          ? `Smazat účet „${a.name}“? ${used} položek se přesune na „${fallback.name}“.`
          : `Smazat účet „${a.name}“?`,
        () => {
          snapshot();
          for (const p of data.periods) {
            for (const b of p.blocks) {
              for (const it of b.items) if (it.account === a.id) it.account = fallback.id;
            }
          }
          data.accounts = data.accounts.filter((x) => x.id !== a.id);
          renderAccountEditor(); renderAll(); save();
          toast('Účet smazán.', 'Vrátit zpět', () => { undo(); renderAccountEditor(); });
        });
    });

    if (a.parent) line.classList.add('is-child');
    line.append(sw, name, note, parent, del);
    return line;
  }));
}

$('#addAccountBtn').addEventListener('click', () => {
  // Barvu spotřebuje jen samostatný převod; podúčty ji sdílí s rodičem.
  const tops = topAccounts();
  if (tops.length >= 4) {
    toast('Čtyři samostatné převody jsou maximum, aby zůstaly barvy rozlišitelné. Další účet udělej jako součást některého z nich.');
    return;
  }
  const used = new Set(tops.map((a) => a.slot));
  const slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 3;
  data.accounts.push({ id: uid(), name: 'Nový účet', note: '', slot });
  renderAccountEditor(); renderAll(); save();
});

$('#settingsBtn').addEventListener('click', () => {
  renderAccountEditor();
  renderSyncSettings();
  $('#dataHint').textContent = storageMode === 'server'
    ? 'Vše se ukládá do souboru data/rozpocet.json ve složce aplikace. Při každém uložení se dělá záloha.'
    : 'Data jsou uložená v tomhle zařízení. Zapni synchronizaci, ať o ně nepřijdeš a máš je i na počítači.';
  settingsDialog.showModal();
  closeRail();
});

/* ------------------------------------------------------------
   Export
   ------------------------------------------------------------ */
function download(filename, text, type) {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#exportJsonBtn').addEventListener('click', () => {
  download(`rozpocet-${todayIso()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Záloha stažena.');
});

$('#exportCsvBtn').addEventListener('click', () => {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['Období;Od;Do;Typ;Kategorie;Položka;Kam;Plán;Skutečnost;Zaplaceno'];
  for (const p of data.periods) {
    for (const i of p.income) {
      lines.push([p.name, p.from, p.to, 'Příjem', '', i.label, '', i.plan ?? 0, i.actual ?? '', ''].map(esc).join(';'));
    }
    for (const b of p.blocks) {
      for (const i of b.items) {
        const acc = accountById(i.account);
        const paid = i.split
          ? `po částech: ${spentOf(i)} z ${i.plan ?? 0}${i.closed ? ', uzavřeno' : ''}`
          : i.paid ? (i.paidAt ? fmtDate(i.paidAt) : 'ano') : '';
        lines.push([p.name, p.from, p.to, 'Výdaj', b.name, i.label, acc ? acc.name : '', i.plan ?? 0, i.actual ?? '', paid].map(esc).join(';'));
      }
    }
  }
  download(`rozpocet-${todayIso()}.csv`, lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Tabulka stažena. Otevře se v Excelu.');
});

/* ------------------------------------------------------------
   Motiv
   ------------------------------------------------------------ */
function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
}
$('#themeBtn').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  data.settings.theme = next;
  applyTheme(next);
  save();
});

/* ------------------------------------------------------------
   Ovládání panelu a další drobnosti
   ------------------------------------------------------------ */
function openRail() {
  els.rail.classList.add('is-open');
  els.railScrim.hidden = false;
  $('#railOpen').setAttribute('aria-expanded', 'true');
  $('#railClose').focus();
}
function closeRail() {
  els.rail.classList.remove('is-open');
  els.railScrim.hidden = true;
  $('#railOpen').setAttribute('aria-expanded', 'false');
}
$('#railOpen').addEventListener('click', openRail);
$('#railClose').addEventListener('click', () => { closeRail(); $('#railOpen').focus(); });
els.railScrim.addEventListener('click', closeRail);

$('#newPeriodBtn').addEventListener('click', () => { openNewPeriod(); closeRail(); });

$$('.rail-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    setView(tab.dataset.view);
    renderAll();
    closeRail();
  });
});

els.actualToggle.addEventListener('change', () => {
  data.settings.showActual = els.actualToggle.checked;
  renderAll();
  save();
});

$$('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.rail.classList.contains('is-open')) closeRail();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save({ now: true });
  }
});

let ticking = false;
document.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    document.body.classList.toggle('is-scrolled', window.scrollY > 120);
    ticking = false;
  });
}, { passive: true });

/* ------------------------------------------------------------
   Srdeční tep – aby se server po zavření okna sám vypnul
   ------------------------------------------------------------ */
// Na telefonu je horní lišta úzká – přepínač skutečnosti a motivu
// se přestěhují do bočního panelu a zpátky, když se okno roztáhne.
{
  const narrow = matchMedia('(max-width: 700px)');
  const tools = $('.topbar-tools');
  const moving = [$('.switch'), $('#themeBtn')];
  const place = () => {
    if (narrow.matches) $('#railTools').append(...moving);
    else tools.append(...moving);
  };
  narrow.addEventListener('change', place);
  place();
}

function startHeartbeat() {
  const clientId = Math.random().toString(36).slice(2);
  const beat = () => { fetch(`/api/tep?id=${clientId}`, { keepalive: true }).catch(() => {}); };
  beat();
  setInterval(beat, 15000);
  addEventListener('pagehide', () => {
    navigator.sendBeacon?.(`/api/tep?id=${clientId}&konec=1`);
  });
}

/* ------------------------------------------------------------
   Nastavení synchronizace
   ------------------------------------------------------------ */
$('#syncForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const repo = $('#syncRepo').value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const token = $('#syncToken').value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('Repozitář napiš jako uživatel/název, třeba jan/penize-data.'); $('#syncRepo').focus(); return; }
  if (!token) { $('#syncToken').focus(); return; }
  try { localStorage.setItem(LS_SYNC, JSON.stringify({ repo, token })); localStorage.removeItem(LS_BASE); }
  catch { toast('Tohle zařízení nedovolí uložit nastavení (soukromý režim?).'); return; }
  $('#syncToken').value = '';
  renderSyncSettings();
  await syncNow();
  if (syncState.status === 'ok') toast('Připojeno. Změny se teď synchronizují samy.');
  renderSyncSettings();
});
$('#syncNowBtn').addEventListener('click', () => syncNow());
$('#syncOffBtn').addEventListener('click', () => disconnectSync());

// Kdy synchronizovat: po startu, po návratu do aplikace, po připojení
// k internetu a každou minutu, dokud je okno vidět.
addEventListener('online', () => scheduleSync(300));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60 * 1000);

// Offline běh a ikona na plochu. Na PC to nevadí, soubory jdou vždy
// napřed ze serveru a z mezipaměti jen bez spojení.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ------------------------------------------------------------
   Start
   ------------------------------------------------------------ */
(async function start() {
  try {
    await load();
  } catch (err) {
    document.body.innerHTML =
      `<div style="padding:48px;max-width:520px;margin:auto;font-family:system-ui">
        <h1>Data se nepodařilo načíst</h1>
        <p>${err.message}</p>
        <p>Zkus aplikaci zavřít a spustit znovu.</p>
      </div>`;
    return;
  }
  applyTheme(data.settings.theme || 'system');
  els.actualToggle.checked = showActual();

  // Tužka pro úpravu období vedle názvu.
  const pencil = document.createElement('button');
  pencil.type = 'button';
  pencil.id = 'editPeriodBtn';
  pencil.className = 'icon-btn';
  pencil.setAttribute('aria-label', 'Upravit název a data období');
  pencil.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-pencil"></use></svg>';
  pencil.addEventListener('click', openEditPeriod);
  $('.topbar-id').after(pencil);

  setView('mesic');
  // Dohnat automatické platby, které odešly, zatímco byla aplikace zavřená.
  const autoPaid = autoPayAndTell();
  renderAll();
  if (autoPaid) save();
  else els.saveState.textContent = '';

  if (storageMode === 'server') startHeartbeat();
  document.body.classList.toggle('is-web', storageMode === 'local');
  // Hned po otevření si stáhnout, co se mezitím změnilo jinde.
  if (syncConfig()) syncNow();

  // A hlídat je i v otevřeném okně – třeba přes půlnoc.
  setInterval(() => {
    if (autoPayAndTell()) { renderAll(); save(); }
  }, 10 * 60 * 1000);
})();
