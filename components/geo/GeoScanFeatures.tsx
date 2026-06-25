import { Card, Container, SectionHeading } from "./primitives";
import {
  BoltIcon,
  DocIcon,
  QuoteIcon,
  SearchIcon,
  ShieldIcon,
  TargetIcon,
} from "./icons";

const FEATURES = [
  {
    icon: SearchIcon,
    title: "Begrijpt AI wat je bedrijf doet?",
    body: "Als AI niet begrijpt wat jij doet, sla je de eerste vraag al mis.",
  },
  {
    icon: TargetIcon,
    title: "Zijn je diensten en doelgroep helder?",
    body: "Vaag aanbod = onzichtbaar voor AI. Wij checken of jouw propositie scherp genoeg is.",
  },
  {
    icon: QuoteIcon,
    title: "Beantwoord je de vragen van klanten?",
    body: "AI beantwoordt vragen. Als jouw content die vragen niet beantwoordt, besta je niet voor AI.",
  },
  {
    icon: DocIcon,
    title: "Is je content citeerbaar?",
    body: "Mag AI jou citeren? Alleen als je content concreet en helder genoeg is. Wij meten dat.",
  },
  {
    icon: ShieldIcon,
    title: "Zijn er signalen van vertrouwen?",
    body: "Vertrouwt AI jou? Alleen als er bewijs is. Cases, cijfers en referenties tellen zwaar mee.",
  },
  {
    icon: BoltIcon,
    title: "Welke content mist nog?",
    body: "Wat ontbreekt er nog? We benoemen exact welke content jou vaker in AI-antwoorden zet.",
  },
];

export function GeoScanFeatures() {
  return (
    <section
      id="wat-de-scan-analyseert"
      className="scroll-mt-24 bg-elevated/50 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          eyebrow="Wat de scan analyseert"
          title="Dit bepaalt of AI jou noemt of overslaat"
          intro="Brian beoordeelt je homepage op de criteria die bepalen of AI je begrijpt, vertrouwt en aanbeveelt."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-ink">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
