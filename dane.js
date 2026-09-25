/* ============================================================
   Daně a pojištění živnostníka na vedlejší činnost při zaměstnání
   Jen výpočty – žádné okno, žádná data. Testy: node --test app/test

   Předpoklady (platí pro Petra, ukazují se i v aplikaci):
   – podnikání je vedlejší činnost a celý rok trvá zaměstnání,
   – slevu na poplatníka uplatňuje zaměstnavatel, takže z podnikání
     jde celá daň 15 % (23 % až nad 36násobkem průměrné mzdy),
   – zdravotní pojištění nemá minimum, platí za tebe zaměstnavatel,
   – sociální pojištění jen nad rozhodnou částkou.
   ============================================================ */

/* Čísla, která se mění každý rok. Nový rok se přidá sem – vláda je
   schvaluje nařízením obvykle v září předchozího roku. */
export const ROKY = {
  2026: {
    prumernaMzda: 48967,
    rozhodna: 117521,   // rozhodná částka pro vedlejší činnost (zisk za celý rok)
    minVZ: 5387,        // minimální měsíční vyměřovací základ, vedlejší činnost
    zdroj: 'ČSSZ, Přehled nejdůležitějších údajů pro rok 2026',
  },
  2027: {
    prumernaMzda: 51663,
    rozhodna: 123992,
    minVZ: 5683,
    zdroj: 'nařízení vlády schválené 21. 9. 2026 (Podnikatel.cz, Peníze.cz)',
  },
};

export const SAZBY = {
  dan: 0.15,
  socialni: 0.292,
  socialniZaklad: 0.55,   // vyměřovací základ = 55 % zisku
  zdravotni: 0.135,
  zdravotniZaklad: 0.5,   // vyměřovací základ = 50 % zisku
  dph: 0.21,
};

export const LIMITY = {
  priznani: 20000,        // hrubé příjmy z podnikání za rok, nad které zaměstnanec podává přiznání
  pausalStrop: 2000000,   // paušální výdaje se počítají nejvýš z těchto příjmů
  dph: 2000000,           // obrat za kalendářní rok, nad který vzniká registrace k DPH
  dphHned: 2536500,       // obrat, od kterého je člověk plátcem hned
  zalohyDan: 30000,       // daň z podnikání, od které se platí zálohy na daň
};

// Procento paušálních výdajů podle druhu příjmu (§ 7 odst. 7 ZDP).
export const PAUSALY = [
  [60, 'Živnost (kromě řemeslné) – focení, obchod'],
  [80, 'Řemeslná živnost nebo zemědělství'],
  [40, 'Jiná samostatná činnost, třeba autorská práva mimo živnost'],
  [30, 'Pronájem majetku v podnikání'],
];

export function parametry(rok) {
  if (ROKY[rok]) return { rok, ...ROKY[rok], odhad: false };
  const zname = Object.keys(ROKY).map(Number).sort((a, b) => a - b);
  const podle = rok < zname[0] ? zname[0] : zname.filter((k) => k < rok).pop();
  return { rok, ...ROKY[podle], odhad: true, podle };
}

/* Počet měsíců, ve kterých se v roce podnikalo. Počítá se každý měsíc,
   ve kterém činnost trvala aspoň den. Bez data zahájení celý rok. */
export function mesiceCinnosti(rok, zahajeni, ukonceni = null) {
  let od = 1;
  let doM = 12;
  if (zahajeni) {
    const [y, m] = zahajeni.split('-').map(Number);
    if (y > rok) return 0;
    if (y === rok) od = m;
  }
  if (ukonceni) {
    const [y, m] = ukonceni.split('-').map(Number);
    if (y < rok) return 0;
    if (y === rok) doM = m;
  }
  return Math.max(0, doM - od + 1);
}

/* Rozhodná částka se krátí o dvanáctinu (zaokrouhlenou nahoru) za každý
   měsíc, ve kterém se nepodnikalo. */
export function rozhodnaZaMesice(rozhodna, mesice) {
  if (mesice <= 0) return 0;
  return rozhodna - Math.ceil(rozhodna / 12) * (12 - mesice);
}

/* Daň a pojištění za rok. Vrátí obě varianty výdajů (paušál i skutečné)
   a tu, která se použije: vybranou, nebo při „auto“ tu levnější. */
export function spocitej({ rok, prijmy = 0, vydaje = 0, mesice = 12, rezim = 'auto', pausal = 60 }) {
  const par = parametry(rok);
  const hranice = rozhodnaZaMesice(par.rozhodna, mesice);
  const priznani = prijmy > LIMITY.priznani;

  const varianta = (druh, v) => {
    const zisk = prijmy - v;
    const z = Math.max(0, zisk);
    const dan = priznani ? Math.round(z * SAZBY.dan) : 0;
    const zdrVZ = Math.ceil(z * SAZBY.zdravotniZaklad);
    const zdr = Math.ceil(zdrVZ * SAZBY.zdravotni);
    const socPovinne = mesice > 0 && z > 0 && z >= hranice;
    const socVZ = socPovinne ? Math.max(Math.ceil(z * SAZBY.socialniZaklad), par.minVZ * mesice) : 0;
    const soc = Math.ceil(socVZ * SAZBY.socialni);
    return { druh, vydaje: v, zisk, dan, zdrVZ, zdr, socVZ, soc, socPovinne, celkem: dan + zdr + soc };
  };

  const pausalVydaje = Math.round(Math.min(Math.max(prijmy, 0), LIMITY.pausalStrop) * pausal / 100);
  const P = varianta('pausal', pausalVydaje);
  const S = varianta('skutecne', Math.max(0, vydaje));
  // Při shodě paušál: nemusí se dokládat výdaje.
  const lepsi = S.celkem < P.celkem ? 'skutecne' : 'pausal';
  const druh = rezim === 'pausal' || rezim === 'skutecne' ? rezim : lepsi;
  const v = druh === 'pausal' ? P : S;

  return {
    rok, par, mesice, hranice, prijmy, priznani, pausalPct: pausal, rezim,
    pausal: P, skutecne: S, lepsi, ...v,
  };
}

/* Kolik z každé další koruny příjmu padne na daň a pojištění, když se nic
   nepřeskočí. Skoky na hranicích (přiznání, sociální) vrací skoky(). */
export function sazbaNaKorunu(v) {
  const podil = v.druh === 'pausal' && v.prijmy < LIMITY.pausalStrop ? 1 - v.pausalPct / 100 : 1;
  const dan = v.priznani ? SAZBY.dan : 0;
  const soc = v.socPovinne ? SAZBY.socialni * SAZBY.socialniZaklad : 0;
  return podil * (dan + SAZBY.zdravotni * SAZBY.zdravotniZaklad + soc);
}

// Sazba, jakou by měl příjem, kdyby už byl nad hranicí pro přiznání.
export function sazbaPoPriznani(v) {
  return sazbaNaKorunu({ ...v, priznani: true });
}

/* Hranice, které ještě nejsou překročené: kolik příjmů do nich zbývá
   a kolik najednou přibude, až se přeskočí. */
export function skoky(v) {
  const out = [];
  const podil = v.druh === 'pausal' ? 1 - v.pausalPct / 100 : 1;
  const vydajePevne = v.druh === 'pausal' ? 0 : v.vydaje;
  const ziskPri = (prijmy) => Math.max(0, v.druh === 'pausal' ? prijmy * podil : prijmy - vydajePevne);

  if (!v.priznani) {
    out.push({
      co: 'priznani',
      zbyva: LIMITY.priznani - v.prijmy,
      pridej: Math.round(ziskPri(LIMITY.priznani) * SAZBY.dan),
    });
  }
  if (!v.socPovinne && v.mesice > 0 && v.hranice > 0) {
    const prijmyNaHranici = v.druh === 'pausal'
      ? Math.ceil(v.hranice / podil)
      : v.hranice + vydajePevne;
    const vz = Math.max(Math.ceil(v.hranice * SAZBY.socialniZaklad), v.par.minVZ * v.mesice);
    out.push({
      co: 'socialni',
      zbyva: Math.max(0, prijmyNaHranici - v.prijmy),
      prijmyNaHranici,
      pridej: Math.ceil(vz * SAZBY.socialni),
    });
  }
  return out;
}

/* Kolik odložit z jednotlivých plateb. Každá platba nese přesně to, o co
   se s ní zvedla daň a pojištění za rok – v pořadí, jak peníze přišly,
   s výdaji zapsanými do toho dne. Součet sedí na celkovou částku za rok
   (u paušálu přesně, u skutečných výdajů po odečtení pozdějších výdajů). */
export function rozpisRezerv({ rok, prijmy, vydaje = [], mesice = 12, rezim = 'auto', pausal = 60 }) {
  const serazene = [...prijmy].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.poradi ?? 0) - (b.poradi ?? 0));
  const vyd = [...vydaje].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const out = new Map();
  let kumP = 0;
  for (const it of serazene) {
    const kumV = vyd.filter((x) => (x.date || '') <= (it.date || '')).reduce((s, x) => s + (x.castka || 0), 0);
    const pred = spocitej({ rok, prijmy: kumP, vydaje: kumV, mesice, rezim, pausal }).celkem;
    kumP += it.castka || 0;
    const po = spocitej({ rok, prijmy: kumP, vydaje: kumV, mesice, rezim, pausal }).celkem;
    out.set(it.id, Math.max(0, po - pred));
  }
  return out;
}

/* Zálohy, které přijdou v dalším roce. Zdravotní zálohy zaměstnanec na
   vedlejší činnost neplatí, sociální jen když zisk přesáhl hranici. */
export function zalohyPristiRok(v) {
  const dalsi = parametry(v.rok + 1);
  const socialni = v.socPovinne && v.mesice
    ? Math.ceil(Math.max(Math.ceil(v.socVZ / v.mesice), dalsi.minVZ) * SAZBY.socialni)
    : 0;
  return { socialni, dan: v.dan > LIMITY.zalohyDan };
}

/* ------------------------------------------------------------
   Termíny
   ------------------------------------------------------------ */
// Velikonoční neděle (gregoriánský výpočet).
function velikonoce(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesic = Math.floor((h + l - 7 * m + 114) / 31);
  const den = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mesic - 1, den));
}

const iso = (d) => d.toISOString().slice(0, 10);
const denUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

export function svatky(y) {
  const pevne = ['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'];
  const out = new Set(pevne.map((md) => `${y}-${md}`));
  const v = velikonoce(y);
  out.add(iso(new Date(v.getTime() - 2 * 86400000)));   // Velký pátek
  out.add(iso(new Date(v.getTime() + 1 * 86400000)));   // Velikonoční pondělí
  return out;
}

// Připadne-li konec lhůty na víkend nebo svátek, posouvá se na nejbližší pracovní den.
export function pracovniDen(s) {
  const d = denUTC(s);
  for (let i = 0; i < 10; i++) {
    const t = iso(d);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !svatky(d.getUTCFullYear()).has(t)) return t;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return iso(d);
}

export function plusMesic(s, n = 1) {
  const [y, m, d] = s.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, last));
  return iso(base);
}

export function plusDny(s, n) {
  const d = denUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/* Termíny za daňový rok. OSVČ má datovou schránku, takže přiznání podává
   elektronicky a platí pro ni delší lhůta (1. 5., po víkendu dál).
   Přehledy pro ČSSZ a pojišťovnu se podávají do měsíce po lhůtě pro přiznání. */
export function terminy(rok, { priznani = true } = {}) {
  const Y = rok + 1;
  const dap = pracovniDen(`${Y}-05-01`);
  const lhutaDap = priznani ? dap : pracovniDen(`${Y}-04-01`);
  const prehledy = pracovniDen(plusMesic(lhutaDap, 1));
  return { dap: priznani ? dap : null, prehledy, rokPodani: Y };
}

// DPH identifikované osoby: přiznání a platba do 25. dne následujícího měsíce.
export function terminDphZaMesic(ym) {
  const [y, m] = ym.split('-').map(Number);
  return pracovniDen(plusMesic(`${y}-${String(m).padStart(2, '0')}-25`, 1));
}

// Oznámení zahájení: ČSSZ do 8. dne následujícího měsíce, pojišťovna do 8 dnů.
export function terminyZahajeni(zahajeni) {
  const [y, m] = zahajeni.split('-').map(Number);
  const cssz = pracovniDen(plusMesic(`${y}-${String(m).padStart(2, '0')}-08`, 1));
  const zp = pracovniDen(plusDny(zahajeni, 8));
  return { cssz, zp, ucetFu: pracovniDen(plusDny(zahajeni, 15)) };
}
