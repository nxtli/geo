import { Container, SectionHeading } from "./primitives";
import { SearchIcon, SparkIcon } from "./icons";

export function GeoProblem() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Waarom dit telt"
          title="SEO maakt je vindbaar in Google. Maar word je ook genoemd door AI?"
          intro="Steeds vaker krijgen mensen hun antwoord rechtstreeks van AI-tools in plaats van uit een lijst met zoekresultaten. Wie daar niet in voorkomt, wordt simpelweg niet overwogen."
        />

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-soft">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-muted">
              <SearchIcon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">
              Klassieke SEO
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Gericht op rankings, keywords en links. Je verschijnt in een lijst,
              de gebruiker klikt zelf door.
            </p>
          </div>

          <div className="rounded-2xl border border-brand/30 bg-brand-soft/50 p-7 shadow-soft">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-fg">
              <SparkIcon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">
              AI-vindbaarheid (GEO)
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              AI-tools kijken anders naar content: ze zoeken naar duidelijke
              expertise, betrouwbare signalen, gestructureerde informatie en
              concrete antwoorden op vragen van je doelgroep.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-muted">
          Je website kan prima vindbaar zijn in Google, maar alsnog onzichtbaar
          blijven in AI-antwoorden. Deze scan laat zien of jouw website duidelijk
          genoeg is om door AI-systemen begrepen, samengevat en aanbevolen te
          worden.
        </p>
      </Container>
    </section>
  );
}
