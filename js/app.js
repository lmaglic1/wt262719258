/*
 * app.js — povezivanje modula Evidencija sa stranicom (EcoTrack, Spirala 2, Zadatak 3)
 */
(function () {
  'use strict';

  const DEBOUNCE_MS = 300;
  const TRAJANJE_NOVOG_REDA_MS = 2000;

  function pokreni() {
    const tabela = document.querySelector('[data-testid="tabela"]');
    const forma = document.querySelector('[data-testid="forma"]');
    const poruke = document.getElementById('poruke');
    const karticaEmisija = document.querySelector('[data-testid="kartica-emisija"]');
    const karticaUsteda = document.querySelector('[data-testid="kartica-usteda"]');
    const karticaStatus = document.querySelector('[data-testid="kartica-status"]');
    if (!tabela || !forma || !poruke) return;

    const evidencija = Evidencija(tabela);

    // ---------- Kartice (samo textContent) ----------
    function azurirajKartice() {
      const emisija = evidencija.dajUkupnuEmisiju();
      const usteda = Math.round((emisija * 0.2 + Number.EPSILON) * 100) / 100;
      const imaIncident = evidencija.dajMjerenja({ samoIncidenti: true }).length > 0;

      if (karticaEmisija) karticaEmisija.textContent = String(emisija);
      if (karticaUsteda) karticaUsteda.textContent = String(usteda);
      if (karticaStatus) karticaStatus.textContent = imaIncident ? 'Kritično' : 'Normalno';
    }

    function prikaziPoruku(tekst, jeGreska) {
      poruke.textContent = tekst;
      poruke.classList.toggle('poruke--greska', jeGreska);
    }

    // ---------- Tabela ----------
    function pronadjiRed(id) {
      return Array.from(tabela.querySelectorAll('tbody tr'))
        .find((red) => red.dataset.id === String(id)) || null;
    }

    function dodajDugmeBrisanja(red) {
      if (red.querySelector('[data-akcija="obrisi"]')) return;
      const celija = document.createElement('td');
      const dugme = document.createElement('button');
      dugme.type = 'button';
      dugme.className = 'dugme-obrisi';
      dugme.dataset.akcija = 'obrisi';
      dugme.textContent = 'Obriši';
      dugme.setAttribute('aria-label', 'Obriši mjerenje ' + red.dataset.id);
      celija.appendChild(dugme);
      red.appendChild(celija);
    }

    tabela.addEventListener('click', function (dogadjaj) {
      const dugme = dogadjaj.target.closest('[data-akcija="obrisi"]');
      if (!dugme || !tabela.contains(dugme)) return;

      const red = dugme.closest('tr');
      const mjerenje = evidencija.dajMjerenja().find((m) => String(m.id) === red.dataset.id);
      if (!mjerenje || !evidencija.ukloniMjerenje(mjerenje.id)) return;

      azurirajKartice();
      prikaziPoruku('Mjerenje je obrisano.', false);
      tabela.dispatchEvent(new CustomEvent('mjerenje:uklonjeno', {
        bubbles: true,
        detail: { id: mjerenje.id }
      }));
    });

    // ---------- Forma ----------
    // Dozvoljeni datumi su samo iz tekuće godine (min/max se postavljaju dinamički).
    function postaviGraniceDatuma() {
      const poljeDatum = forma.elements.datum;
      if (!poljeDatum) return;
      const godina = new Date().getFullYear();
      poljeDatum.min = `${godina}-01-01`;
      poljeDatum.max = `${godina}-12-31`;
    }

    function parsirajDatumIzPolja(vrijednost) {
      const dijelovi = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vrijednost);
      return dijelovi ? new Date(+dijelovi[1], +dijelovi[2] - 1, +dijelovi[3]) : null;
    }

    function procitajFormu() {
      const polja = forma.elements;
      return {
        energent: polja.energent.value,
        kolicina: polja.kolicina.value,
        datum: parsirajDatumIzPolja(polja.datum.value),
        incident: polja.incident.checked
      };
    }

    function obradiSlanje() {
      const rezultat = evidencija.dodajMjerenje(procitajFormu());

      if (!rezultat.uspjesno) {
        prikaziPoruku(rezultat.greske.map((g) => g.poruka).join('\n'), true);
        const polje = forma.elements[rezultat.greske[0].polje];
        if (polje && typeof polje.focus === 'function') polje.focus();
        return;
      }

      const sva = evidencija.dajMjerenja();
      const novo = sva[sva.length - 1];
      const red = pronadjiRed(novo.id);
      if (red) {
        dodajDugmeBrisanja(red);
        red.classList.add('--new');
        setTimeout(() => red.classList.remove('--new'), TRAJANJE_NOVOG_REDA_MS);
      }

      azurirajKartice();
      forma.reset();
      prikaziPoruku('Mjerenje je uspješno dodano.', false);
      tabela.dispatchEvent(new CustomEvent('mjerenje:dodano', {
        bubbles: true,
        detail: { mjerenje: novo }
      }));
    }

    // Debounce: prvo slanje se obrađuje odmah, a svako sljedeće unutar 300 ms
    // se ignoriše (i ponovo pokreće odbrojavanje).
    let debounceTajmer = null;
    forma.addEventListener('submit', function (dogadjaj) {
      dogadjaj.preventDefault();
      const blokirano = debounceTajmer !== null;
      clearTimeout(debounceTajmer);
      debounceTajmer = setTimeout(() => { debounceTajmer = null; }, DEBOUNCE_MS);
      if (!blokirano) obradiSlanje();
    });

    // ---------- Početno stanje ----------
    postaviGraniceDatuma();
    tabela.querySelectorAll('tbody tr[data-id]').forEach(dodajDugmeBrisanja);
    azurirajKartice();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pokreni);
  } else {
    pokreni();
  }
})();
