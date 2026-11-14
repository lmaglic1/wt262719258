/*
 * Evidencija.js — modul za evidenciju mjerenja potrošnje (EcoTrack, Spirala 2)
 * Factory funkcija: svi podaci i pomoćne funkcije su privatni (closure),
 * a van modula se vraća samo objekat sa javnim metodama.
 */
function Evidencija(tabelaRef, opcije) {
  'use strict';

  // ---------- Provjera tabele ----------
  const prozor = tabelaRef && tabelaRef.ownerDocument && tabelaRef.ownerDocument.defaultView;
  const KlasaTabele = (prozor && prozor.HTMLTableElement) ||
    (typeof HTMLTableElement !== 'undefined' ? HTMLTableElement : null);
  if (!KlasaTabele || !(tabelaRef instanceof KlasaTabele)) {
    throw new Error('Neispravna tabela!');
  }

  // ---------- Konstante i opcije ----------
  const ENERGENTI = ['struja', 'plin', 'voda'];
  const KOLONE = ['energent', 'kolicina', 'datum', 'incident'];
  const DA_VRIJEDNOSTI = ['da', 'yes', '1', 'x', '✓'];

  const op = opcije || {};
  const faktoriEmisije = Object.assign({ struja: 0.5, plin: 2.0, voda: 0.001 }, op.faktoriEmisije);
  const jedinice = Object.assign({ struja: 'kWh', plin: 'm3', voda: 'm3' }, op.jedinice);

  // ---------- Privatno stanje ----------
  const dokument = tabelaRef.ownerDocument;
  const mjerenja = []; // {id, energent, kolicina, datum, incident}
  let sljedeciId = 1;
  const kolone = odrediKolone();

  // ---------- Pomoćne funkcije ----------
  function zaokruzi(broj) {
    return Math.round((broj + Number.EPSILON) * 100) / 100;
  }

  function normalizujTekst(tekst) {
    // "Količina" -> "kolicina"
    return String(tekst).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  }

  function jeDatum(vrijednost) {
    return Object.prototype.toString.call(vrijednost) === '[object Date]';
  }

  function imaNajviseDvijeDecimale(broj) {
    return Math.abs(Math.round(broj * 100) - broj * 100) < 1e-6;
  }

  // Vraća pozitivan broj sa <= 2 decimale ili null.
  function parsirajKolicinu(vrijednost) {
    if (typeof vrijednost === 'number') {
      return Number.isFinite(vrijednost) && vrijednost > 0 && imaNajviseDvijeDecimale(vrijednost)
        ? vrijednost : null;
    }
    if (typeof vrijednost !== 'string') return null;
    // uklanja whitespace i &nbsp; na početku i kraju
    const tekst = vrijednost.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(tekst)) return null;
    const broj = parseFloat(tekst.replace(',', '.'));
    return broj > 0 ? broj : null;
  }

  function napraviDatum(godina, mjesec, dan) {
    const datum = new Date(godina, mjesec - 1, dan);
    const ispravan = datum.getFullYear() === godina &&
      datum.getMonth() === mjesec - 1 &&
      datum.getDate() === dan;
    return ispravan ? datum : null;
  }

  // Podržani formati: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY ili Date objekat. Vraća novi Date ili null.
  function parsirajDatum(vrijednost) {
    if (jeDatum(vrijednost)) {
      return isNaN(vrijednost.getTime()) ? null : new Date(vrijednost.getTime());
    }
    if (typeof vrijednost !== 'string') return null;
    const tekst = vrijednost.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
    let dijelovi = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tekst);
    if (dijelovi) return napraviDatum(+dijelovi[1], +dijelovi[2], +dijelovi[3]);
    dijelovi = /^(\d{1,2})([./])(\d{1,2})\2(\d{4})$/.exec(tekst);
    if (dijelovi) return napraviDatum(+dijelovi[4], +dijelovi[3], +dijelovi[1]);
    return null;
  }

  function dvijeCifre(broj) {
    return String(broj).padStart(2, '0');
  }

  function formatirajISO(datum) {
    return `${datum.getFullYear()}-${dvijeCifre(datum.getMonth() + 1)}-${dvijeCifre(datum.getDate())}`;
  }

  function formatirajPrikaz(datum) {
    return `${dvijeCifre(datum.getDate())}.${dvijeCifre(datum.getMonth() + 1)}.${datum.getFullYear()}`;
  }

  function parsirajIncident(celija) {
    const checkbox = celija.querySelector('input[type="checkbox"]');
    if (checkbox) return checkbox.checked;
    return DA_VRIJEDNOSTI.includes(celija.textContent.trim().toLowerCase());
  }

  // Redoslijed kolona čita se iz <thead> (data-kolona ili tekst zaglavlja).
  // Ako zaglavlje ne postoji, podrazumijeva se: energent, količina, datum, incident.
  function odrediKolone() {
    const podrazumijevano = { energent: 0, kolicina: 1, datum: 2, incident: 3 };
    const thead = tabelaRef.tHead;
    if (!thead || thead.rows.length === 0) return podrazumijevano;

    const pronadjeno = {};
    Array.from(thead.rows[thead.rows.length - 1].cells).forEach((celija, indeks) => {
      const naziv = normalizujTekst(celija.dataset.kolona || celija.textContent);
      if (KOLONE.includes(naziv) && !(naziv in pronadjeno)) pronadjeno[naziv] = indeks;
    });
    return KOLONE.every((k) => k in pronadjeno) ? pronadjeno : podrazumijevano;
  }

  function postojiId(id) {
    return mjerenja.some((m) => String(m.id) === String(id));
  }

  function generisiId() {
    while (postojiId(sljedeciId)) sljedeciId++;
    return sljedeciId++;
  }

  // Zadržava postojeći data-id iz HTML-a ako je jedinstven, inače generiše novi.
  function preuzmiId(postojeci) {
    if (postojeci === undefined || postojeci === '' || postojiId(postojeci)) return generisiId();
    const broj = Number(postojeci);
    return Number.isInteger(broj) && String(broj) === postojeci ? broj : postojeci;
  }

  function sviRedovi() {
    const redovi = [];
    Array.from(tabelaRef.tBodies).forEach((tbody) => redovi.push(...tbody.rows));
    return redovi;
  }

  function nadjiRed(id) {
    return sviRedovi().find((red) => red.dataset.id === String(id)) || null;
  }

  function nadjiIndeks(id) {
    return mjerenja.findIndex((m) => String(m.id) === String(id));
  }

  // Kopija sa novim Date objektom, da izmjena kopije ne utiče na interno stanje.
  function kopija(m) {
    return {
      id: m.id,
      energent: m.energent,
      kolicina: m.kolicina,
      datum: new Date(m.datum.getTime()),
      incident: m.incident
    };
  }

  function ucitajIzTabele() {
    sviRedovi().forEach((red) => {
      const celija = (kolona) => red.cells[kolone[kolona]];
      if (KOLONE.some((k) => !celija(k))) return;

      const energent = normalizujTekst(celija('energent').textContent);
      const kolicina = parsirajKolicinu(celija('kolicina').textContent);
      const datum = parsirajDatum(celija('datum').textContent);
      if (!ENERGENTI.includes(energent) || kolicina === null || datum === null) return; // red se preskače

      const id = preuzmiId(red.dataset.id);
      red.dataset.id = String(id);
      mjerenja.push({ id, energent, kolicina, datum, incident: parsirajIncident(celija('incident')) });
    });
  }

  // samoPrisutna = true -> provjeravaju se samo polja koja postoje u objektu (za ažuriranje)
  function validiraj(ulaz, samoPrisutna) {
    const obj = ulaz && typeof ulaz === 'object' ? ulaz : {};
    const greske = [];
    const vrijednosti = {};
    const provjeri = (polje) => !samoPrisutna || Object.prototype.hasOwnProperty.call(obj, polje);

    if (provjeri('energent')) {
      const energent = typeof obj.energent === 'string' ? obj.energent.trim().toLowerCase() : '';
      if (ENERGENTI.includes(energent)) vrijednosti.energent = energent;
      else greske.push({ polje: 'energent', poruka: 'Energent mora biti struja, plin ili voda.' });
    }

    if (provjeri('kolicina')) {
      const kolicina = parsirajKolicinu(obj.kolicina);
      if (kolicina !== null) vrijednosti.kolicina = kolicina;
      else greske.push({ polje: 'kolicina', poruka: 'Količina mora biti pozitivan broj sa najviše dvije decimale.' });
    }

    if (provjeri('datum')) {
      const datum = parsirajDatum(obj.datum);
      if (datum && datum.getFullYear() === new Date().getFullYear()) vrijednosti.datum = datum;
      else greske.push({ polje: 'datum', poruka: 'Datum mora biti validan datum unutar tekuće godine.' });
    }

    if (provjeri('incident')) {
      if (obj.incident === undefined && !samoPrisutna) vrijednosti.incident = false;
      else if (typeof obj.incident === 'boolean') vrijednosti.incident = obj.incident;
      else greske.push({ polje: 'incident', poruka: 'Incident mora biti true ili false.' });
    }

    return { greske, vrijednosti };
  }

  // Popunjava ćelije reda isključivo kroz textContent (bez innerHTML).
  function popuniRed(red, m) {
    red.cells[kolone.energent].textContent = m.energent.charAt(0).toUpperCase() + m.energent.slice(1);
    red.cells[kolone.kolicina].textContent = String(m.kolicina).replace('.', ',');
    red.cells[kolone.kolicina].title = jedinice[m.energent] || '';
    red.cells[kolone.datum].textContent = formatirajPrikaz(m.datum);

    const celijaIncident = red.cells[kolone.incident];
    const checkbox = celijaIncident.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = m.incident;
    else celijaIncident.textContent = m.incident ? 'Da' : 'Ne';
  }

  function napraviRed(m) {
    const red = dokument.createElement('tr');
    red.dataset.id = String(m.id);
    const brojKolona = Math.max(...KOLONE.map((k) => kolone[k])) + 1;
    for (let i = 0; i < brojKolona; i++) {
      red.appendChild(dokument.createElement('td'));
    }
    popuniRed(red, m);
    return red;
  }

  function filtriraj(filter) {
    const f = filter && typeof filter === 'object' ? filter : {};
    const energent = typeof f.energent === 'string' && f.energent.trim() !== ''
      ? f.energent.trim().toLowerCase() : null;
    const od = f.odDatuma != null ? parsirajDatum(f.odDatuma) : null;
    const doDatuma = f.doDatuma != null ? parsirajDatum(f.doDatuma) : null;
    // granice su uključive (cijeli dan)
    const pocetak = od && new Date(od.getFullYear(), od.getMonth(), od.getDate());
    const kraj = doDatuma && new Date(doDatuma.getFullYear(), doDatuma.getMonth(), doDatuma.getDate() + 1);

    return mjerenja.filter((m) =>
      (!energent || m.energent === energent) &&
      (!pocetak || m.datum >= pocetak) &&
      (!kraj || m.datum < kraj) &&
      (!f.samoIncidenti || m.incident)
    );
  }

  // ---------- Javne metode: CRUD ----------
  function dajMjerenja(filter) {
    return filtriraj(filter).map(kopija);
  }

  function dodajMjerenje(obj) {
    const { greske, vrijednosti } = validiraj(obj, false);
    if (greske.length > 0) return { uspjesno: false, greske };

    const mjerenje = Object.assign({ id: generisiId() }, vrijednosti);
    mjerenja.push(mjerenje);

    const tbody = tabelaRef.tBodies[0] || tabelaRef.appendChild(dokument.createElement('tbody'));
    tbody.appendChild(napraviRed(mjerenje));
    return { uspjesno: true, greske: [] };
  }

  function ukloniMjerenje(id) {
    const indeks = nadjiIndeks(id);
    if (indeks === -1) return false;
    mjerenja.splice(indeks, 1);
    const red = nadjiRed(id);
    if (red) red.remove();
    return true;
  }

  function azurirajMjerenje(id, izmjene) {
    const indeks = nadjiIndeks(id);
    if (indeks === -1) {
      return { uspjesno: false, greske: [{ polje: 'id', poruka: 'Mjerenje sa datim id-em ne postoji.' }] };
    }
    const { greske, vrijednosti } = validiraj(izmjene, true);
    if (greske.length > 0) return { uspjesno: false, greske };

    Object.assign(mjerenja[indeks], vrijednosti);
    const red = nadjiRed(id);
    if (red) popuniRed(red, mjerenja[indeks]);
    return { uspjesno: true, greske: [] };
  }

  function brojMjerenja() {
    return mjerenja.length;
  }

  // ---------- Javne metode: analitika ----------
  function dajUkupnuEmisiju(filter) {
    const ukupno = filtriraj(filter)
      .reduce((zbir, m) => zbir + m.kolicina * (Number(faktoriEmisije[m.energent]) || 0), 0);
    return zaokruzi(ukupno);
  }

  function izracunajStatistiku() {
    const statistika = {};
    ENERGENTI.forEach((energent) => {
      const kolicine = mjerenja.filter((m) => m.energent === energent).map((m) => m.kolicina);
      if (kolicine.length === 0) return;
      const ukupno = kolicine.reduce((a, b) => a + b, 0);
      statistika[energent] = {
        broj: kolicine.length,
        ukupno,
        prosjek: ukupno / kolicine.length,
        min: Math.min(...kolicine),
        max: Math.max(...kolicine)
      };
    });
    return statistika;
  }

  function dajStatistikuPoEnergentu() {
    const statistika = izracunajStatistiku();
    Object.keys(statistika).forEach((energent) => {
      statistika[energent].ukupno = zaokruzi(statistika[energent].ukupno);
      statistika[energent].prosjek = zaokruzi(statistika[energent].prosjek);
    });
    return statistika;
  }

  // Period se računa unazad od današnjeg dana (uključujući današnji dan).
  function prosjecnaPotrosnja(energent, period) {
    const e = typeof energent === 'string' ? energent.trim().toLowerCase() : '';
    const danas = new Date();
    const kraj = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() + 1);
    let pocetak;
    if (period === 'sedmica') pocetak = new Date(kraj.getFullYear(), kraj.getMonth(), kraj.getDate() - 7);
    else if (period === 'mjesec') pocetak = new Date(kraj.getFullYear(), kraj.getMonth() - 1, kraj.getDate());
    else if (period === 'godina') pocetak = new Date(kraj.getFullYear() - 1, kraj.getMonth(), kraj.getDate());
    else return 0;

    const uPeriodu = mjerenja.filter((m) => m.energent === e && m.datum >= pocetak && m.datum < kraj);
    if (uPeriodu.length === 0) return 0;
    return zaokruzi(uPeriodu.reduce((zbir, m) => zbir + m.kolicina, 0) / uPeriodu.length);
  }

  function detektujAnomalije() {
    const statistika = izracunajStatistiku();
    const anomalije = [];
    mjerenja.forEach((m) => {
      let razlog = null; // prioritet: incident > visoka_potrosnja > negativna_potrosnja
      if (m.incident) razlog = 'incident';
      else if (m.kolicina > 3 * statistika[m.energent].prosjek) razlog = 'visoka_potrosnja';
      else if (m.kolicina < 0) razlog = 'negativna_potrosnja';
      if (razlog) anomalije.push({ id: m.id, razlog });
    });
    return anomalije;
  }

  function csvPolje(vrijednost) {
    const tekst = String(vrijednost);
    return /[",\r\n]/.test(tekst) ? `"${tekst.replace(/"/g, '""')}"` : tekst;
  }

  function generisiIzvjestaj(format) {
    const f = typeof format === 'string' ? format.trim().toLowerCase() : '';
    const podaci = mjerenja.map((m) => ({
      id: m.id,
      energent: m.energent,
      kolicina: m.kolicina,
      datum: formatirajISO(m.datum),
      incident: m.incident
    }));

    if (f === 'json') return JSON.stringify(podaci);
    if (f === 'csv') {
      const zaglavlje = ['id'].concat(KOLONE);
      const redovi = podaci.map((p) => zaglavlje.map((k) => csvPolje(p[k])).join(','));
      return [zaglavlje.join(',')].concat(redovi).join('\n');
    }
    return '';
  }

  function uporedi(a, b) {
    if (typeof a === 'string') return a.localeCompare(b);
    return Number(a) - Number(b); // brojevi, Date (timestamp) i bool (false < true)
  }

  // Stabilno: kod jednakih ključeva odlučuje originalni indeks.
  function sortirajMjerenja(kljuc, smjer) {
    const kopije = mjerenja.map(kopija);
    if (!KOLONE.includes(kljuc)) return kopije;
    const znak = smjer === 'desc' ? -1 : 1;
    return kopije
      .map((m, indeks) => ({ m, indeks }))
      .sort((a, b) => znak * uporedi(a.m[kljuc], b.m[kljuc]) || a.indeks - b.indeks)
      .map((par) => par.m);
  }

  function grupisiPoDanu() {
    const grupe = {};
    mjerenja.forEach((m) => {
      const kljuc = formatirajISO(m.datum);
      if (!grupe[kljuc]) grupe[kljuc] = [];
      grupe[kljuc].push(kopija(m));
    });
    const rezultat = {};
    Object.keys(grupe).sort().forEach((kljuc) => {
      rezultat[kljuc] = grupe[kljuc];
    });
    return rezultat;
  }

  // ---------- Javne metode: dodatno (Zadatak 4) ----------
  function brojDanaIzmedju(od, doDatuma) {
    const MS_U_DANU = 24 * 60 * 60 * 1000;
    const a = Date.UTC(od.getFullYear(), od.getMonth(), od.getDate());
    const b = Date.UTC(doDatuma.getFullYear(), doDatuma.getMonth(), doDatuma.getDate());
    return Math.round((b - a) / MS_U_DANU);
  }

  // Linearna regresija (metoda najmanjih kvadrata) na mjerenjima iz zadnjih 30 dana.
  function prognozirajPotrosnju(energent, brojDana) {
    const e = typeof energent === 'string' ? energent.trim().toLowerCase() : '';
    const dana = Number(brojDana);
    if (!Number.isInteger(dana) || dana <= 0) return [];

    const danas = new Date();
    const pocetak = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() - 30);
    const kraj = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() + 1);
    const tacke = mjerenja
      .filter((m) => m.energent === e && m.datum >= pocetak && m.datum < kraj)
      .map((m) => ({ x: brojDanaIzmedju(pocetak, m.datum), y: m.kolicina }));
    if (tacke.length < 2) return [];

    const n = tacke.length;
    const sumaX = tacke.reduce((s, t) => s + t.x, 0);
    const sumaY = tacke.reduce((s, t) => s + t.y, 0);
    const sumaXY = tacke.reduce((s, t) => s + t.x * t.y, 0);
    const sumaXX = tacke.reduce((s, t) => s + t.x * t.x, 0);
    const imenilac = n * sumaXX - sumaX * sumaX;
    const nagib = imenilac === 0 ? 0 : (n * sumaXY - sumaX * sumaY) / imenilac;
    const odsjecak = (sumaY - nagib * sumaX) / n;

    const prognoza = [];
    for (let i = 1; i <= dana; i++) {
      const datum = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() + i);
      const x = brojDanaIzmedju(pocetak, datum);
      prognoza.push({ datum, kolicina: Math.max(0, zaokruzi(odsjecak + nagib * x)) });
    }
    return prognoza;
  }

  // ---------- Inicijalizacija ----------
  ucitajIzTabele();

  return Object.freeze({
    dajMjerenja,
    dodajMjerenje,
    ukloniMjerenje,
    azurirajMjerenje,
    brojMjerenja,
    dajUkupnuEmisiju,
    dajStatistikuPoEnergentu,
    prosjecnaPotrosnja,
    detektujAnomalije,
    generisiIzvjestaj,
    sortirajMjerenja,
    grupisiPoDanu,
    prognozirajPotrosnju
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Evidencija;
}
