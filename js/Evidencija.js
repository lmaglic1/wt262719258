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
    // trim() uklanja i &nbsp; ( )
    const tekst = vrijednost.replace(/^[\s ]+|[\s ]+$/g, '');
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
    const tekst = vrijednost.replace(/^[\s ]+|[\s ]+$/g, '');
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

  // ---------- Inicijalizacija ----------
  ucitajIzTabele();

  return Object.freeze({
    dajMjerenja,
    dodajMjerenje,
    ukloniMjerenje,
    azurirajMjerenje,
    brojMjerenja
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Evidencija;
}
