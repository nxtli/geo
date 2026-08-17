# NXTLI GEO Scan

Standalone Next.js app voor **geo.nxtli.com** — een premium landingspagina waar
ondernemers en marketeers een gratis AI-vindbaarheidsscan (Generative Engine
Optimization) van hun homepage laten doen, begeleid door **Charlie**, de
AI-analist van NXTLI, in een chatervaring.

Zie **[`docs/GEO.md`](docs/GEO.md)** voor de volledige documentatie: stack,
projectstructuur, environment variables, Supabase-migratie, het koppelen van de
bestaande Claude-skill, en deployment/DNS voor geo.nxtli.com.

## Snel starten

```bash
npm install
npm run dev          # http://localhost:3000
```

De scan werkt direct, ook zonder configuratie (mock-analyse, geen persistentie,
e-mail alleen voorbereid). Voor productie: zie `.env.example` en `docs/GEO.md`.

---

## Adverteren op de Radio — Prospect Finder & Scorer

In dezelfde app draait op **`/radio`** een interne prospecting-tool voor
accountmanager Eric: Nederlandse bedrijven vinden en prioriteren voor outbound
via LinkedIn/Waalaxy, op basis van **FIT × TIMING** in plaats van volume.

```bash
npm install
npm run dev          # http://localhost:3000/radio
```

Met een `ANTHROPIC_API_KEY` erbij kan de tool op `/radio/zoeken` **zelf
Nederlandse bedrijven vinden** (web search), hun website verifiëren, ze
onderzoeken en op prioriteit zetten — bedoeld om de lijst te vullen, niet om er
tien te vinden. Je kiest daar het verzorgingsgebied (provincies), de
bedrijfsgrootte (MKB staat standaard aan) en of er een aanleiding moet zijn.

Elke ronde kost API-credits, dus dat staat in beeld: een schatting in euro's vóór
de scan, en het werkelijke bedrag per ronde op **`/radio/historie`**.

Werkt ook direct zonder configuratie: een JSON-bestand als database en een
trefwoord-heuristiek als research-engine. Klik op **Demo-data laden** om de tool
met vier duidelijk gelabelde fictieve prospects te bekijken. Zet
`ANTHROPIC_API_KEY` voor de AI-analyse, en `POSTGRES_URL` om op Supabase te
draaien.

`/radio` en `/admin` zitten achter dezelfde Basic Auth (`ADMIN_USERNAME` /
`ADMIN_PASSWORD`, zie `proxy.ts`). In productie zijn ze zonder die credentials
geblokkeerd.

Volledige documentatie: **[`docs/RADIO.md`](docs/RADIO.md)**.
De architectuurkeuzes staan in **[`PLAN.md`](PLAN.md)**.
