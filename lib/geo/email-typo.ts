/**
 * Herkent een waarschijnlijke tikfout in het domein van een e-mailadres.
 * Geeft het verbeterde adres terug, of null als er niets opvalt.
 *
 * De chat gebruikt dit als vraag ("Bedoel je ...?"), nooit als blokkade: een
 * ongewoon domein kan gewoon kloppen.
 */
const KNOWN_DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl",
  "live.nl", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "ziggo.nl", "kpnmail.nl", "planet.nl", "xs4all.nl", "home.nl", "hetnet.nl",
  "upcmail.nl", "casema.nl", "quicknet.nl", "telfort.nl", "chello.nl", "online.nl", "zonnet.nl",
];

const TLD_FIXES: Record<string, string> = {
  con: "com", cmo: "com", ocm: "com", vom: "com", xom: "com", comm: "com", coml: "com", cim: "com",
  nll: "nl", ml: "nl", nk: "nl", bl: "nl", n: "nl",
};

/** Afstand tussen twee woorden: een letter erbij, eraf, anders of omgewisseld telt als 1. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function suggestEmailFix(email: string): string | null {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (!domain || KNOWN_DOMAINS.includes(domain)) return null;

  // 1. Bijna een bekend domein: gmial.com, hotmai.com, outlok.com.
  const near = KNOWN_DOMAINS.find((known) => distance(domain, known) === 1);
  if (near) return `${local}@${near}`;

  // 2. Een tikfout in de extensie van een ander domein: bedrijf.con, bedrijf.nll.
  const dot = domain.lastIndexOf(".");
  if (dot > 0) {
    const fixed = TLD_FIXES[domain.slice(dot + 1)];
    if (fixed) return `${local}@${domain.slice(0, dot)}.${fixed}`;
  }
  return null;
}
