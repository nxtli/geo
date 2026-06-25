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
    body: "We toetsen of je kernaanbod in één oogopslag duidelijk is voor een AI-systeem.",
  },
  {
    icon: TargetIcon,
    title: "Zijn je diensten en doelgroep helder?",
    body: "Komt scherp naar voren wat je aanbiedt, voor wie, en waarom jij?",
  },
  {
    icon: QuoteIcon,
    title: "Beantwoord je de vragen van klanten?",
    body: "Sluit je content aan op de echte vragen die je doelgroep aan AI stelt?",
  },
  {
    icon: DocIcon,
    title: "Is je content citeerbaar?",
    body: "Is je informatie concreet en gestructureerd genoeg om samengevat of geciteerd te worden?",
  },
  {
    icon: ShieldIcon,
    title: "Zijn er signalen van vertrouwen?",
    body: "Tonen je pagina's autoriteit en bewijs: cases, cijfers, referenties?",
  },
  {
    icon: BoltIcon,
    title: "Welke content mist nog?",
    body: "We benoemen de gaps die je vaker genoemd kunnen maken in AI-antwoorden.",
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
          title="Zes vragen waar AI-systemen op letten"
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
