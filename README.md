# NXTLI GEO Scan

Standalone Next.js app voor **geo.nxtli.com** — een premium landingspagina waar
ondernemers en marketeers een gratis AI-vindbaarheidsscan (Generative Engine
Optimization) van hun homepage laten doen, begeleid door **Brian**, de
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
