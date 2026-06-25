# JSON-LD schema-templates

Plak-klare structured data om een pagina beter interpreteerbaar te maken voor zoek- en
AI-machines. Vul de templates met de echte gegevens van de pagina. Verzin niets - laat een
veld weg of markeer het als `[invullen: ...]` als de info ontbreekt.

Plaats het schema in een `<script type="application/ld+json">`-blok in de `<head>` of body.
Meerdere blokken op een pagina mag; combineer types die bij de pagina passen. Alle property-namen
hieronder zijn letterlijk volgens schema.org. Per type staat kort wat Google **vereist** voor een
rich result en wat **aanbevolen** is.

> **Valideer altijd voor plaatsing** met de Rich Results Test
> (`https://search.google.com/test/rich-results`) en/of de schema.org-validator
> (`https://validator.schema.org/`). Schema met een tikfout wordt stil genegeerd.
> Type-naslag: `https://schema.org/[TypeNaam]`.

## Welk type kies je?

- **Organization** - de aanbieder/uitgever zelf; nuttig op elke pagina om de entiteit vast te
  leggen. Gebruik dit als er geen fysiek bezoekadres centraal staat.
- **LocalBusiness** - de aanbieder met een fysiek adres en/of openingstijden. Subtype van
  Organization; kies waar mogelijk een specifieker subtype (`Restaurant`, `Dentist`, `Store`,
  `ProfessionalService`...).
- **Person** - een auteur, trainer, expert of teamlid. Belangrijk voor E-E-A-T en auteursentiteit.
- **Service** - een dienst zonder vaste productprijs (maatwerk, consultancy, een dienstpakket).
- **Product** + **Offer** - een product of dienst met een concrete prijs die niet als cursus telt.
- **Course** (+ **CourseInstance**) - een training, cursus, leergang, workshop of opleiding.
- **Event** - een eenmalig of gepland evenement met datum en locatie.
- **Article** / **NewsArticle** / **BlogPosting** - een blog, nieuwsbericht of inhoudelijk artikel.
- **FAQPage** - zodra er een door de aanbieder geschreven FAQ op de pagina staat (een
  gezaghebbend antwoord per vraag). Vrijwel elke pagina die je verbetert krijgt dit.
- **HowTo** - een stappenplan/instructie ("hoe doe je X").
- **Review** / **AggregateRating** - om reviews machine-leesbaar te maken. Altijd genest in het
  Product, Course, Service, LocalBusiness of de Organization. Gebruik alleen echte cijfers.
- **WebSite** (+ **SearchAction**) en **WebPage** / **BreadcrumbList** - site- en navigatiestructuur
  vastleggen (sitelinks searchbox en broodkruimels).

Tip: koppel je losse blokken met `@id`'s, of bundel ze in een `@graph` (zie onderaan), zodat een
model ziet dat ze bij elkaar horen (de Organization is de `provider` van de Course, enz.).

---

## Organization

Geen eigen rich result, maar voedt de kennispaneel- en merkherkenning. `name`, `url` en `logo`
zijn de basis; `sameAs` (officiele profielen) is een sterke entiteits-/GEO-hefboom.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "[Organisatie]",
  "url": "[https://...]",
  "logo": "[https://.../logo.png]",
  "description": "[Wat de organisatie doet, kort en feitelijk.]",
  "email": "[e-mailadres]",
  "telephone": "[+31...]",
  "foundingDate": "[JJJJ-MM-DD]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[straat + nummer]",
    "postalCode": "[postcode]",
    "addressLocality": "[plaats]",
    "addressRegion": "[provincie]",
    "addressCountry": "NL"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "[+31...]",
    "contactType": "customer service",
    "email": "[e-mailadres]",
    "availableLanguage": ["nl", "en"]
  },
  "sameAs": [
    "[https://www.linkedin.com/company/...]",
    "[https://www.instagram.com/...]",
    "[https://nl.wikipedia.org/wiki/...]"
  ]
}
```

## LocalBusiness

Subtype van Organization met locatie en openingstijden. **Google vereist `name` en `address`**;
de rest is aanbevolen. Gebruik waar mogelijk een specifieker subtype dan `LocalBusiness`.

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[Organisatie]",
  "description": "[Wat de organisatie doet, kort en feitelijk.]",
  "url": "[https://...]",
  "image": "[https://.../foto.jpg]",
  "telephone": "[+31...]",
  "priceRange": "[bv. EUR EUR of $$]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[straat + nummer]",
    "postalCode": "[postcode]",
    "addressLocality": "[plaats]",
    "addressCountry": "NL"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "[52.xxxxx]",
    "longitude": "[4.xxxxx]"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "17:00"
    }
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[bv. 4.8]",
    "reviewCount": "[aantal]"
  }
}
```

## Person

Voor een auteur, trainer of expert. Geen eigen rich result, maar de kern voor E-E-A-T en het
koppelen van content aan een herkenbare menselijke bron. `sameAs` en `knowsAbout` zijn sterk.

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "[Voor- en achternaam]",
  "url": "[https://.../over-mij]",
  "image": "[https://.../portret.jpg]",
  "jobTitle": "[functie]",
  "description": "[Korte bio met relevante credentials.]",
  "worksFor": {
    "@type": "Organization",
    "name": "[Organisatie]",
    "url": "[https://...]"
  },
  "knowsAbout": ["[onderwerp 1]", "[onderwerp 2]"],
  "alumniOf": "[opleiding/instelling]",
  "sameAs": [
    "[https://www.linkedin.com/in/...]",
    "[https://...]"
  ]
}
```

## Service

Voor een dienst zonder vaste productprijs. Koppel via `provider` aan je Organization. Meerdere
diensten bundel je met `hasOfferCatalog`.

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "[Naam van de dienst]",
  "serviceType": "[bv. GEO-audit]",
  "description": "[Wat de dienst inhoudt, voor wie, wat het oplevert.]",
  "provider": {
    "@type": "Organization",
    "name": "[Aanbieder]",
    "url": "[https://...]"
  },
  "areaServed": {
    "@type": "Country",
    "name": "Nederland"
  },
  "offers": {
    "@type": "Offer",
    "price": "[bedrag of laat weg bij maatwerk]",
    "priceCurrency": "EUR",
    "url": "[aanvraag-URL]"
  },
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "[Naam pakket/diensten]",
    "itemListElement": [
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "[Deeldienst 1]"
        }
      }
    ]
  }
}
```

## Product + Offer

Google toont prijs/sterren als er `name` is plus minstens een van `offers`, `review` of
`aggregateRating`. **Offer vereist `price` en `priceCurrency`** (ISO 4217, bv. `EUR`).

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "[Productnaam]",
  "description": "[Feitelijke omschrijving]",
  "image": "[https://.../product.jpg]",
  "sku": "[artikelnummer]",
  "brand": {
    "@type": "Brand",
    "name": "[Merk]"
  },
  "offers": {
    "@type": "Offer",
    "price": "[bedrag, zonder valutateken]",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "priceValidUntil": "[JJJJ-MM-DD]",
    "itemCondition": "https://schema.org/NewCondition",
    "url": "[URL]"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[bv. 4.8]",
    "reviewCount": "[aantal]"
  }
}
```

## Course (+ CourseInstance)

**Google vereist `name`** voor Course; voor de uitgebreide "course info" zijn `provider`,
`offers` en `hasCourseInstance` aanbevolen. `CourseInstance` is de geplande uitvoering.

```json
{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "[Naam van de cursus/leergang]",
  "description": "[Korte, feitelijke omschrijving: wat, voor wie, wat levert het op.]",
  "provider": {
    "@type": "Organization",
    "name": "[Aanbieder]",
    "url": "[https://...]"
  },
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": "[online / onsite / blended]",
    "startDate": "[JJJJ-MM-DD]",
    "endDate": "[JJJJ-MM-DD]",
    "courseWorkload": "[bv. PT2H per week]",
    "location": {
      "@type": "Place",
      "name": "[locatie]",
      "address": "[adres]"
    },
    "instructor": {
      "@type": "Person",
      "name": "[trainer]"
    }
  },
  "offers": {
    "@type": "Offer",
    "price": "[bedrag zonder valutateken, bv. 1250]",
    "priceCurrency": "EUR",
    "category": "[bv. excl. btw]",
    "url": "[aanmeld-URL]"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[bv. 4.8]",
    "reviewCount": "[bv. 234]"
  }
}
```

## Event

**Google vereist `name`, `startDate` en `location`.** Gebruik `VirtualLocation` (met `url`) voor
online events; bij hybride een array van beide. Datums in ISO 8601 met tijdzone.

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "[Naam]",
  "description": "[Korte omschrijving]",
  "startDate": "[JJJJ-MM-DDTHH:MM+02:00]",
  "endDate": "[JJJJ-MM-DDTHH:MM+02:00]",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "eventStatus": "https://schema.org/EventScheduled",
  "image": "[https://.../event.jpg]",
  "location": {
    "@type": "Place",
    "name": "[locatie]",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "[straat + nummer]",
      "postalCode": "[postcode]",
      "addressLocality": "[plaats]",
      "addressCountry": "NL"
    }
  },
  "organizer": {
    "@type": "Organization",
    "name": "[Organisator]",
    "url": "[https://...]"
  },
  "offers": {
    "@type": "Offer",
    "price": "[bedrag]",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "validFrom": "[JJJJ-MM-DD]",
    "url": "[ticket-URL]"
  }
}
```

## Article / NewsArticle / BlogPosting

Kies `NewsArticle` voor nieuws, `BlogPosting` voor een blog, anders `Article`. Geen veld is
strikt vereist, maar gebruik `headline`, `image`, `datePublished`, `author` en `publisher`.
Maak `author` een object (Person of Organization), geen kale tekst.

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Titel, max ~110 tekens]",
  "description": "[Korte samenvatting]",
  "image": ["[https://.../afbeelding-16x9.jpg]"],
  "datePublished": "[JJJJ-MM-DDTHH:MM+02:00]",
  "dateModified": "[JJJJ-MM-DDTHH:MM+02:00]",
  "author": {
    "@type": "Person",
    "name": "[Auteur]",
    "url": "[https://.../over-de-auteur]"
  },
  "publisher": {
    "@type": "Organization",
    "name": "[Uitgever]",
    "logo": {
      "@type": "ImageObject",
      "url": "[https://.../logo.png]"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "[canonieke URL van het artikel]"
  }
}
```

## FAQPage

Altijd geschikt zodra er een door de aanbieder geschreven FAQ op de pagina staat. **Vereist:
`mainEntity` met `Question`'s, elk met `name` (de vraag) en `acceptedAnswer.text`.**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[De vraag, letterlijk]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Het antwoord; begin met een zelfstandige zin die de vraag volledig beantwoordt.]"
      }
    },
    {
      "@type": "Question",
      "name": "[Volgende vraag]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Volgend antwoord]"
      }
    }
  ]
}
```

> Gebruik **FAQPage** alleen voor een eigen, gezaghebbende Q&A (een antwoord per vraag). Voor
> forum-/community-pagina's waar een vraag meerdere gebruikersantwoorden heeft, gebruik je
> **QAPage** (een `Question` met `acceptedAnswer` en/of `suggestedAnswer`, plus `answerCount`).
> Meng ze niet. (Google toont FAQ-rich-results sinds 2023 beperkt, maar de markup blijft waardevol
> voor AI-extractie/GEO.)

## HowTo

Voor een stappenplan. Google toont hier geen rich result meer, maar de markup is geldig en
nuttig voor AI/GEO. Tijden in ISO 8601-duur (`PT30M`).

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "[De taak, bv. Zo richt je X in]",
  "totalTime": "PT30M",
  "supply": [{ "@type": "HowToSupply", "name": "[benodigdheid]" }],
  "tool": [{ "@type": "HowToTool", "name": "[gereedschap]" }],
  "step": [
    {
      "@type": "HowToStep",
      "name": "[Stapnaam]",
      "text": "[De instructie in een zelfstandige zin.]",
      "url": "[https://...#stap1]",
      "image": "[https://.../stap1.jpg]"
    }
  ]
}
```

## Review + AggregateRating

Beide nesten in het host-item (Product, Course, Service, LocalBusiness...) - nooit los, en geen
"self-serving" review van een organisatie over zichzelf. **Review vereist `itemReviewed`,
`reviewRating` (met `ratingValue`) en `author`. AggregateRating vereist `ratingValue` plus
`reviewCount` of `ratingCount`.**

```json
{
  "@context": "https://schema.org",
  "@type": "Review",
  "itemReviewed": {
    "@type": "Product",
    "name": "[Wat wordt beoordeeld]"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "[bv. 5]",
    "bestRating": "5",
    "worstRating": "1"
  },
  "author": {
    "@type": "Person",
    "name": "[Naam reviewer]"
  },
  "datePublished": "[JJJJ-MM-DD]",
  "reviewBody": "[De volledige review als tekst.]"
}
```

```json
{
  "@type": "AggregateRating",
  "ratingValue": "[bv. 4.8]",
  "reviewCount": "[aantal reviews]",
  "bestRating": "5",
  "worstRating": "1"
}
```

## WebSite (+ SearchAction) en WebPage

`WebSite` legt de sitenaam vast en kan een sitelinks-searchbox aanzetten. De
`query-input` en de `{search_term_string}`-placeholder zijn verplicht voor die feature.

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "[Sitenaam]",
  "url": "[https://example.com/]",
  "publisher": {
    "@type": "Organization",
    "name": "[Organisatie]"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://example.com/?s={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "[Paginatitel]",
  "url": "[https://...]",
  "description": "[Korte omschrijving]",
  "inLanguage": "nl-NL",
  "isPartOf": { "@type": "WebSite", "url": "[https://example.com/]" },
  "primaryImageOfPage": { "@type": "ImageObject", "url": "[https://...]" },
  "datePublished": "[JJJJ-MM-DD]",
  "dateModified": "[JJJJ-MM-DD]"
}
```

Bruikbare `WebPage`-subtypes: `AboutPage`, `ContactPage`, `FAQPage`, `CollectionPage`, `ProfilePage`.

## BreadcrumbList

Broodkruimelpad; voedt het broodkruimel-rich-result. `position` is een oplopend geheel getal
vanaf 1; het laatste item is de huidige pagina.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "[Categorie]",
      "item": "https://example.com/categorie/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "[Huidige pagina]"
    }
  ]
}
```

---

## Meerdere types combineren met @graph

Heeft een pagina meerdere entiteiten (bv. een Organization die de provider is van een Course,
plus een FAQPage en een BreadcrumbList), bundel ze dan in een `@graph` en verbind ze met `@id`'s:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#org",
      "name": "[Aanbieder]",
      "url": "https://example.com/"
    },
    {
      "@type": "Course",
      "name": "[Cursus]",
      "provider": { "@id": "https://example.com/#org" }
    },
    {
      "@type": "FAQPage",
      "mainEntity": []
    }
  ]
}
```
