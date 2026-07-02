# public/

Static assets served from the site root.

## Charlie's profielfoto

Voeg Charlie's profielfoto hier toe als **`charlie.jpg`** (een vierkante/portret
foto werkt het best — hij wordt rond bijgesneden):

```
public/charlie.jpg
```

Zodra dit bestand bestaat, verschijnt de foto automatisch in de chat-header,
de chatberichten en de hero-preview. Tot die tijd toont de UI netjes een
"B"-monogram als fallback (zie components/geo/CharlieAvatar.tsx).

> Wil je een andere bestandsnaam of -formaat (bijv. charlie.png/.webp), pas dan
> het pad `/charlie.jpg` aan in components/geo/CharlieAvatar.tsx.
