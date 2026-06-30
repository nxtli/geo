import { Container, SectionHeading } from "./primitives";

const STEPS = [
  {
    n: "01",
    title: "Start de chat met Brian",
    body: "Klik op de knop en Brian, onze AI-analist, neemt je in een paar stappen mee.",
  },
  {
    n: "02",
    title: "Vertel Brian over je bedrijf en doelgroep",
    body: "Een paar korte vragen over je bedrijf, aanbod en de vragen waarop je gevonden wilt worden.",
  },
  {
    n: "03",
    title: "Brian scant je homepage op AI-vindbaarheid",
    body: "We halen je homepage op, beoordelen de content en bepalen je AI Visibility Score.",
  },
  {
    n: "04",
    title: "Je krijgt direct concrete verbeterpunten",
    body: "Met concrete verbeterpunten — in de chat, als download én in je inbox.",
  },
];

export function GeoHowItWorks() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Hoe het werkt"
          title="Binnen een minuut weet je hoe goed AI jou vindt"
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface p-7">
              <div className="font-display text-3xl font-bold text-brand/30">
                {s.n}
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
