import { Container } from "./primitives";
import { CheckIcon } from "./icons";

const POINTS = [
  "AI-first websites die mensen én AI begrijpen",
  "Slimme automations en content­structuur",
  "Systemen die meegroeien met je bedrijf",
];

export function WhyNxtli() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
              Waarom NXTLI
            </div>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Wij bouwen websites en systemen die ook voor AI te begrijpen zijn
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              NXTLI is een AI-first studio en automation-partner. We helpen
              ondernemers en marketeers met AI-first websites, automations,
              contentstructuur en slimme systemen — niet alleen mooi, maar ook
              begrijpelijk voor mensen én AI.
            </p>

            <ul className="mt-7 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-ink">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand/10 to-accent/10 blur-2xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { k: "AI-first", v: "ontworpen voor mens & machine" },
                { k: "Automation", v: "minder handwerk, meer output" },
                { k: "Structuur", v: "content die AI kan citeren" },
                { k: "Resultaat", v: "vaker gevonden & genoemd" },
              ].map((s) => (
                <div
                  key={s.k}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-soft"
                >
                  <div className="font-display text-lg font-semibold text-brand">
                    {s.k}
                  </div>
                  <div className="mt-1 text-sm text-muted">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
