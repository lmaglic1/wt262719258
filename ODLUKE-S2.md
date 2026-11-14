# ODLUKE-S2.md

## 1. Dodavanje reda u tabelu i textContent

Novi red se dodaje u `js/Evidencija.js`, **linija 265**:
```js
tbody.appendChild(napraviRed(mjerenje));
```
Red pravim u funkciji `napraviRed` (linija 223) sa `createElement('tr')` i `createElement('td')`, a ćelije punim u `popuniRed` (linije 212–220) samo preko `textContent`.

`textContent` sve što korisnik upiše tretira kao običan tekst. Kad bih koristila `innerHTML`, preglednik bi taj tekst parsirao kao HTML. Unos `<script>alert(1)</script>` bi tada postao pravi element u stranici. Sam `<script>` ubačen preko `innerHTML` se ne izvrši, ali napadač može koristiti npr. `<img src=x onerror="alert(1)">`, i taj kod se izvrši (XSS). Sa `textContent` se na ekranu samo prikažu znakovi `<script>alert(1)</script>`.

## 2. Immutability i Date

`{...mjerenje}` pravi plitku kopiju. Brojevi, stringovi i bool se kopiraju, ali `datum` je objekat, pa kopija i original dijele **isti** `Date`. Ako neko pozove `kopija.datum.setFullYear(2000)`, promijeni se i datum unutar modula.

Zato u funkciji `kopija` (linija 150) pravim novi Date objekat:
```js
datum: new Date(m.datum.getTime()),
```
Isto radim i pri unosu: `parsirajDatum` vraća novi `Date` umjesto da sačuva objekat koji je korisnik poslao.

## 3. aria-live="polite"

`#poruke` prikazuje potvrdu ili greške poslije slanja forme. To nije hitno, pa je `polite` dovoljan: čitač ekrana pročita poruku kad završi ono što trenutno čita. `assertive` bi prekinuo korisnika usred čitanja i služi samo za hitna upozorenja. Kod grešaka ionako prebacujem fokus na pogrešno polje, pa korisnik odmah zna gdje je problem.

## 4. Debounce

Bez debounce-a, brzi dupli klik na „Spremi" (ili Enter + klik) okine `submit` dva puta. Tako se isto mjerenje doda dvaput, sa dva reda u tabeli i duplom emisijom na karticama. U `app.js` (linije 118–125) prvo slanje se obradi odmah, a svako sljedeće u narednih 300 ms se ignoriše.

Bez JavaScript-a forma bi se poslala serveru i stranica bi se ponovo učitala. Preglednik tada sam prekida prethodni zahtjev pri novom slanju, pa klijentski debounce nema smisla. Duplikate bi tada morao spriječiti server.

## 5. Stabilno sortiranje

U `sortirajMjerenja` (linija 394) kod istog ključa odlučuje originalni indeks:
```js
.sort((a, b) => znak * uporedi(a.m[kljuc], b.m[kljuc]) || a.indeks - b.indeks)
```
Primjer: `sortirajMjerenja('energent', 'asc')` na mojoj početnoj tabeli. Sva četiri mjerenja za struju imaju isti ključ `"struja"`. Zbog stabilnosti ostaju u redoslijedu iz tabele (03.11., 14.10., 23.09., 02.09.), tj. i dalje sortirana po datumu opadajuće. Bez stabilnosti bi ta četiri reda mogla izaći izmiješana. Isto važi za `sortirajMjerenja('incident', 'desc')`: oba incidenta (voda 21.10. i struja 23.09.) ostaju u istom međusobnom redoslijedu kao u tabeli.
