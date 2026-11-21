# Sää – sovelluksen tekninen kuvaus

Yksi HTML-tiedosto (`public/index.html`), ei käännösvaihetta. Valinnainen välityspalvelin `proxy/worker.js` (Cloudflare Worker).

## Julkaisu

- Tuotanto: **https://saaennuste.web.app** (Firebase Hosting, sivusto `saaennuste` projektissa `saaennuste-4166b`).
- Jokainen muutos `main`-haaraan julkaistaan automaattisesti (`.github/workflows/firebase-hosting-merge.yml`).
- Jokaisesta pull requestista syntyy oma esikatseluosoite, joka näkyy PR:n kommentissa (`firebase-hosting-pull-request.yml`).
- Julkaisu tarvitsee GitHubin salaisuuden `FIREBASE_SERVICE_ACCOUNT` (Firebase-projektin palvelutilin JSON-avain). Avaintiedostoa ei koskaan tallenneta repoon.

## Käynnistys

- **Paikallisesti:** aja `public`-kansiossa `python3 -m http.server 8080` ja avaa `http://localhost:8080`.
  (Pelkkä tiedoston tuplaklikkaus `file://`-osoitteella lähettää yr.no:lle Origin-arvon `null`, jolloin pyynnöt voivat estyä.)
- **Tuotanto:** lataa `index.html` mihin tahansa staattiseen hostaukseen (Cloudflare Pages, Netlify, GitHub Pages) ja ota `proxy/worker.js` käyttöön (ohje tiedoston alussa). Liitä workerin osoite: Asetukset → Datayhteys.
- Jos sääpalveluihin ei saada yhteyttä (esim. esikatseluikkunassa), sovellus siirtyy automaattisesti **esikatselutilaan** simuloidulla datalla ja näyttää siitä ilmoituksen.

## Datalähteet

| Tieto | Lähde | Huomiot |
|---|---|---|
| Nykyinen sää, 24 h, 5 päivää | MET Norway Locationforecast 2.0 `/complete` | Ilmainen, ei avainta. Vaatii tunnisteen: selaimesta Origin-otsake riittää pienelle liikenteelle, muuten worker asettaa User-Agentin. Käyttää valmista `apparent_air_temperature`-kenttää (Tuntuu kuin), varalla tuulen hyytävyyskaava. |
| Sanallinen sadetutkaennuste | MET Norway Nowcast 2.0 | Tutkapohjainen 5 min välein, 2 h eteenpäin; kattaa Pohjoismaat (myös Suomen). Alueen ulkopuolella teksti johdetaan tuntiennusteesta. |
| Sadetutkan karttakuva | RainViewer `weather-maps.json` + Leaflet, CARTO-taustakartta | Vuoden 2026 alusta ilmaisversiossa vain menneet 2 h, yksi värimaailma ja max zoom 7 (karttaa voi zoomata, tutkakuva skaalautuu). Maininta "Weather data by RainViewer" pakollinen – on mukana. Vain henkilökohtaiseen/pienimuotoiseen käyttöön. |
| Revontulivahti | NOAA SWPC: Kp-ennuste (3 h jaksot) + OVATION-nowcast | Kp-ennusteen JSON-muoto muuttui keväällä 2026 (rivit objekteina) – jäsennin tukee molempia. |
| Paikkahaku | Sisäänrakennettu lista + Open-Meteo Geocoding | |
| Auringon nousu/lasku, päivä/yö | Lasketaan laitteella (aurinkokulma) | Ei verkkopyyntöä; kaamos ja yötön yö tunnistetaan. |

## Revontulivahdin logiikka

Jokaiselle tulevan yön tunnille, jolloin aurinko on yli 10° horisontin alla:

1. **Aktiivisuus**: Kp-ennuste verrattuna leveyspiirin kynnykseen (≈ Kp 1,5 + 0,4 × (68° − leveys); Helsinki ≈ 4,5, Rovaniemi ≈ 2, Kilpisjärvi ≈ 1). Lähitunneille myös OVATION-todennäköisyys (pohjoista horisonttia painottaen).
2. **Pilvisyys** yr.no:n tuntikohtaisesta `cloud_area_fraction`-arvosta.
3. Pistemäärä = aktiivisuus × selkeys → paras 1–3 tunnin ikkuna ja sanallinen ennuste.

Kortti näkyy isona vain, kun revontulet ovat mahdollisia; muuten yhden rivin tila. Kesällä (ei pimeää) vahti piiloutuu.

## Ilmiökortit (näkyvät vain tarvittaessa)

- Puuskat ≥ 15 m/s (kova tuuli ≥ 20 m/s)
- Ukkosen todennäköisyys ≥ 25 % tai ukkossymboli
- Mustan jään riski: lämpötila laskee nollan alle 18 h sisällä ja edeltävinä tunteina on satanut tai ilma on hyvin kosteaa
- Lunta tulossa syyskuu–marraskuu (mahdollinen ensilumi)
- Helle: ≥ 27 °C (Ilmatieteen laitoksen hellepäivän raja); ≥ 3 päivää = helleaalto
- Kova pakkanen ≤ −25 °C

## Visuaalisuus

- **Teemat:** Lasi (lasimorfismi), Paperi (vaalea, tumma teksti), Yö (OLED-musta), Revontuli.
- **Koko ruudun sää:** jokainen paneeli piirtää oman taivaansa omalle alueelleen (sade, lumi, räntä, sumu, pilvet, salamat, tähdet, kuu, auringon hehku, revontulet). Värit seuraavat sekä säätä että auringon korkeutta – aurinkoinen yö on tähtitaivas, ei päivätaivas.
- **Luettavuus:** tekstikortit ovat sumennettua, tummennettua lasia, joten valkoinen teksti erottuu myös kirkkaalla lumitaivaalla.
- **Akku:** Animaatiot Täysi / Kevyt (puolet partikkeleista, 30 fps) / Pois. Animaatio pysähtyy, kun välilehti ei ole näkyvissä, ja käyttöjärjestelmän "vähennä liikettä" -asetus kytkee ne oletuksena pois.
- **Esikatselu:** Asetuksissa voi pakottaa taustatehosteen (sade, ukkonen, lumi, kirkas yö revontulineen jne.) tehosteiden kokeilemiseksi.

## Jatkokehitysideoita

- Ilmatieteen laitoksen (FMI) avoin WMS-tutka Suomen tarkempaan tutkakuvaan ja FMI:n viralliset varoitukset (CAP-syöte).
- PWA-asennus (manifest + service worker) puhelimen kotinäytölle.
- Lumen syvyys ja kelirikko/liukkausennuste FMI:ltä.
