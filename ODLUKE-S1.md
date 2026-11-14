# ODLUKE.md

## 1. Flexbox ili Grid

**Flexbox:** koristila sam ga za meni u zaglavlju (`.meni ul`) i za zaglavlje (`.zaglavlje`).
Linkovi u meniju su u jednom redu i različite su dužine. Flexbox svakom linku da onoliko mjesta koliko mu treba, a sa `flex-wrap` se prebace u novi red kad nema mjesta. Profil sam pomjerila skroz desno sa `margin-left: auto`.
Da sam tu koristila Grid, morala bih unaprijed odrediti kolone. Svi linkovi bi dobili jednako široke ćelije iako nisu iste dužine, pa bi kratki imali višak prostora. Za svaki novi link u meniju morala bih mijenjati `grid-template-columns`.

**Grid:** koristila sam ga za kartice (`.kartice`):
```css
grid-template-columns: repeat(auto-fit, minmax(var(--sirina-kartice), 1fr)); /* --sirina-kartice = 250px */
```
Grid sam računa koliko kartica od min. 250px stane u red, pa se kartice same prebace iz 3 u 2 pa u 1 kolonu, bez `@media` upita. Sve kartice su iste širine i poravnate su u kolone.
Sa Flexboxom bi svaki red bio zaseban. Npr. kad su 2 kartice gore i 1 dolje, ta donja bi se razvukla preko cijelog reda (sa `flex: 1`) i ne bi bila iste širine kao gornje. Za isti efekat bi mi trebali media upiti ili fiksne širine.

## 2. CSS specifičnost

U mom CSS-u nema nijednog `!important`.
Konflikte sam izbjegla tako što skoro svugdje koristim jednu klasu kao selektor (`.kartica`, `.profil-meni`, `.polje`), a ID selektore u CSS-u uopšte ne koristim. Tako su svi selektori slične jačine.
Kod validacije `.polje input:valid` i `.polje input:user-invalid` imaju istu specifičnost. Pravilo za grešku je napisano poslije pravila za validno polje, pa kod iste specifičnosti pobjeđuje ono koje je zadnje u datoteci.
Tamna tema samo mijenja vrijednosti varijabli u `:root`. Ne pišem nova pravila za iste elemente, pa ni tu nema sukoba.

## 3. Šta bi se desilo bez `box-sizing: border-box`

Bez toga važi `content-box`, što znači da se `width` i `height` odnose samo na sadržaj, a `padding` i `border` se dodaju na to.

Moje kartice imaju `height: 100%` (da budu iste visine u redu), `padding` od 1rem i border od 1px. Bez `border-box` kartica bi bila viša od svoje ćelije u gridu. Zato bi izlazila preko donje granice i ulazila u razmak, a u jednoj koloni dodirivala bi karticu ili naslov ispod sebe.
Širina kartica se ne bi promijenila jer im nisam zadala `width`, pa ih grid sam rastegne na širinu kolone.
Isti problem bi bio i u formi: polja imaju `width: 100%` + padding + border, pa bi izašla van okvira forme.

Provjerila sam ovo tako što sam privremeno obrisala `box-sizing` i pogledala stranicu u pregledniku.

## Stacking context (dropdown preko kartice)

Kad pređem mišem preko kartice, `transform: scale()` napravi novi stacking context za tu karticu.
Zaglavlje ima `position: relative` i `z-index: 2`, a kartica nema z-index pa je na nivou 0. Zato je zaglavlje, zajedno sa padajućim menijem koji je unutar njega, uvijek iznad kartice.
Sticky zaglavlje tabele ima `z-index: 1` da bude iznad redova tabele, ali ispod glavnog zaglavlja. Brojevi su mali i stoje u varijablama `--z-tabela` i `--z-zaglavlje`.
