# public/

Static assets served from the site root.

## Brian's profielfoto

Voeg Brian's profielfoto hier toe als **`brian.jpg`** (een vierkante/portret
foto werkt het best — hij wordt rond bijgesneden):

```
public/brian.jpg
```

Zodra dit bestand bestaat, verschijnt de foto automatisch in de chat-header,
de chatberichten en de hero-preview. Tot die tijd toont de UI netjes een
"B"-monogram als fallback (zie components/geo/BrianAvatar.tsx).

> Wil je een andere bestandsnaam of -formaat (bijv. brian.png/.webp), pas dan
> het pad `/brian.jpg` aan in components/geo/BrianAvatar.tsx.
