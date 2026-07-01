import type { GeoAnalysisResult, GeoLeadInput } from "../types";

/**
 * NXTLI-branded HTML report. Self-contained (inline CSS) so it can be served
 * directly, printed to PDF by the browser, or rendered headlessly.
 *
 * Layout puts the key insights + priority improvements at the very top, then
 * the score breakdown, technical check and detailed findings — all with clear,
 * marker-coded bullet lists (✓ sterk, → kans, + gap, numbered priorities).
 */
export function renderReportHtml(params: {
  lead: Pick<GeoLeadInput, "company_name" | "homepage_url" | "name">;
  analysis: GeoAnalysisResult;
  date: string;
}): string {
  const { lead, analysis, date } = params;
  const score = analysis.visibility_score;
  const band = score >= 70 ? "Sterk" : score >= 45 ? "Gemiddeld" : "Te verbeteren";
  const bandColor = score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626";

  const a = analysis;

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NXTLI GEO Scan: ${esc(lead.company_name)}</title>
<style>
  :root { --brand:#0c90a1; --accent:#03b2b8; --ink:#0f172a; --muted:#475569; --subtle:#94a3b8; --border:#e6e8ee; --soft:#e0f6f7; --bg:#f7f8fb; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background: var(--bg); line-height:1.6; }
  .page { max-width: 800px; margin: 0 auto; padding: 40px 22px 64px; }
  .eyebrow { text-transform: uppercase; letter-spacing:.14em; font-size:11px; font-weight:800; color: var(--brand); }
  h1 { font-size:28px; margin:.4em 0 .15em; letter-spacing:-.02em; }
  h2 { font-size:18px; margin:0 0 2px; letter-spacing:-.01em; }
  p { margin:.5em 0; }
  .meta { color: var(--muted); font-size:13.5px; }
  .card { border:1px solid var(--border); border-radius:18px; background:#fff; padding:26px; }
  .section { margin-top:26px; }
  .section-head { display:flex; align-items:baseline; gap:10px; margin-bottom:10px; }
  .section-sub { color:var(--subtle); font-size:13px; }

  /* Cover + score */
  .cover { background:linear-gradient(160deg,#fff,#f1f3ff); }
  .scoreWrap { display:flex; align-items:center; gap:22px; margin-top:22px; flex-wrap:wrap; }
  .score { font-size:56px; font-weight:800; line-height:1; }
  .badge { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; }
  .bar { height:9px; border-radius:999px; background:#eaecf3; overflow:hidden; }
  .bar > i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,var(--brand),var(--accent)); }

  /* Bullet lists with coded markers */
  .ilist { list-style:none; margin:6px 0 0; padding:0; }
  .ilist li { display:flex; gap:11px; margin:9px 0; align-items:flex-start; font-size:14.5px; }
  .mk { flex:0 0 auto; width:21px; height:21px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; line-height:1; margin-top:1px; }
  .mk-good{ background:#dcfce7; color:#15803d; }
  .mk-opp{ background:#ffedd5; color:#c2410c; }
  .mk-gap{ background:#e0f2fe; color:#0369a1; }
  .mk-num{ background:var(--soft); color:var(--brand); font-size:11px; }
  .ilist li .t { flex:1; }
  .ilist li .t small { color:var(--muted); display:block; font-size:13px; margin-top:1px; }

  .twocol { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .subcard { border:1px solid var(--border); border-radius:14px; padding:16px 18px; background:#fff; }
  .subcard .h { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  .quote { border-left:3px solid var(--soft); padding:2px 0 2px 14px; margin:10px 0; color:var(--ink); font-size:14.5px; }

  /* Score breakdown */
  .rowscore { display:grid; grid-template-columns: 1fr 120px 56px; gap:14px; align-items:center; padding:11px 0; border-bottom:1px solid var(--border); }
  .rowscore:last-child{ border-bottom:0; }
  .rowscore .lbl { font-weight:600; }
  .rowscore .lbl small { display:block; color:var(--muted); font-weight:400; font-size:12.5px; }
  .rowscore .num { text-align:right; font-weight:700; white-space:nowrap; }
  .rowtotal { display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:12px; border-top:2px solid var(--ink); font-weight:800; font-size:16px; }

  /* Technical check */
  .tcheck { display:flex; gap:12px; align-items:flex-start; padding:11px 0; border-bottom:1px solid var(--border); }
  .tcheck:last-child{ border-bottom:0; }
  .tcheck .lbl { flex:0 0 38%; font-weight:600; font-size:14px; }
  .tcheck .det { flex:1; color:var(--muted); font-size:13.5px; }
  .tbadge { display:inline-block; padding:2px 9px; border-radius:999px; font-size:11px; font-weight:800; color:#fff; }

  .cta { margin-top:30px; border-radius:18px; padding:26px; background:var(--ink); color:#fff; }
  .cta a { color:#a5b4fc; }
  .foot { margin-top:34px; color:var(--subtle); font-size:12px; border-top:1px solid var(--border); padding-top:16px; }
  .muted { color:var(--muted); }
  @media (max-width:620px){ .twocol{grid-template-columns:1fr;} .rowscore{grid-template-columns:1fr 80px 48px;} }
</style>
</head>
<body>
<div class="page">

  <section class="card cover">
    <div class="eyebrow">NXTLI GEO Scan</div>
    <h1>AI-vindbaarheidsrapport</h1>
    <div class="meta"><strong>${esc(lead.company_name)}</strong> · ${esc(lead.homepage_url)} · ${esc(date)}</div>
    <div class="scoreWrap">
      <div>
        <div class="score" style="color:${bandColor}">${score}<span style="font-size:20px;color:var(--subtle)">/100</span></div>
        <span class="badge" style="background:${bandColor}">${band}</span>
      </div>
      <div style="flex:1;min-width:180px">
        <div class="muted" style="font-size:13px;margin-bottom:8px">AI Visibility Score</div>
        <div class="bar"><i style="width:${score}%"></i></div>
      </div>
    </div>
  </section>

  <!-- KEY INSIGHTS — top of the report -->
  <section class="section">
    <div class="card">
      <div class="eyebrow">Belangrijkste inzichten</div>
      <p class="lead" style="font-size:16px;margin-top:8px">${esc(a.short_summary)}</p>
      <div class="twocol" style="margin-top:16px">
        <div class="subcard">
          <div class="h" style="color:#15803d">Sterk</div>
          ${ilist(a.strengths, "good", "Geen sterke punten gevonden.")}
        </div>
        <div class="subcard">
          <div class="h" style="color:#c2410c">Grootste kansen</div>
          ${ilist(a.weaknesses, "opp", "Geen kansen gevonden.")}
        </div>
      </div>
    </div>
  </section>

  <!-- PRIORITY IMPROVEMENTS — also near the top -->
  <section class="section">
    <div class="card">
      <div class="section-head"><h2>Direct oppakken</h2><span class="section-sub">grootste impact eerst</span></div>
      ${numlist(a.quick_wins, "Geen directe verbeterpunten.")}
    </div>
  </section>

  <!-- SCORE BREAKDOWN -->
  <section class="section">
    <div class="card">
      <div class="section-head"><h2>Hoe de score is opgebouwd</h2><span class="section-sub">per onderdeel</span></div>
      ${
        a.category_scores.length
          ? a.category_scores
              .map(
                (c) => `<div class="rowscore">
                  <div class="lbl">${esc(c.label)}<small>${esc(c.summary)}</small></div>
                  <div class="bar"><i style="width:${pct(c.score, c.max)}%"></i></div>
                  <div class="num">${c.score}<span class="muted">/${c.max}</span></div>
                </div>`,
              )
              .join("") +
            `<div class="rowtotal"><span>Totaalscore</span><span style="color:${bandColor}">${score}/100</span></div>`
          : `<p class="muted">Geen onderverdeling beschikbaar.</p>`
      }
    </div>
  </section>

  <!-- TECHNICAL CHECK -->
  <section class="section">
    <div class="card">
      <div class="section-head"><h2>Technische check</h2><span class="section-sub">kan AI je pagina lezen & vertrouwen?</span></div>
      ${
        a.technical_checks.length
          ? a.technical_checks
              .map(
                (t) => `<div class="tcheck">
                  <div class="lbl">${esc(t.label)}</div>
                  <div class="det">${techBadge(t.status)} ${esc(t.detail)}</div>
                </div>`,
              )
              .join("") +
            `<p class="muted" style="font-size:12.5px;margin-top:12px">Snelheid (Core Web Vitals) is in deze scan niet gemeten.</p>`
          : `<p class="muted">Geen technische check beschikbaar.</p>`
      }
    </div>
  </section>

  <!-- DETAIL -->
  <section class="section">
    <div class="card">
      <div class="section-head"><h2>Wat AI van je site begrijpt</h2></div>
      <p>${esc(a.what_ai_understands)}</p>
      ${a.likely_ai_positioning ? `<p class="quote">${esc(a.likely_ai_positioning)}</p>` : ""}
    </div>
  </section>

  ${
    a.missing_signals.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>Ontbrekende signalen</h2><span class="section-sub">vertrouwen & bewijs</span></div>
          ${ilist(a.missing_signals, "opp", "")}
        </div></section>`
      : ""
  }

  ${
    a.content_gaps.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>Content gaps</h2><span class="section-sub">wat nog mist</span></div>
          ${ilist(a.content_gaps, "gap", "")}
        </div></section>`
      : ""
  }

  ${
    a.recommended_pages.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>Aanbevolen pagina's om te maken</h2><span class="section-sub">vergroot je AI-vindbaarheid</span></div>
          ${ilist(a.recommended_pages, "gap", "")}
        </div></section>`
      : ""
  }

  ${
    a.suggested_homepage_copy_improvements.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>Verbetervoorstellen voor je homepage-copy</h2></div>
          ${a.suggested_homepage_copy_improvements.map((s) => `<p class="quote">${esc(s)}</p>`).join("")}
        </div></section>`
      : ""
  }

  ${
    a.recommended_faq_questions.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>Aanbevolen FAQ-vragen</h2><span class="section-sub">sterkste GEO-format</span></div>
          ${ilist(
            a.recommended_faq_questions.map((q) => ({ title: q.question, sub: q.why })),
            "gap",
            "",
          )}
        </div></section>`
      : ""
  }

  ${
    a.thirty_day_action_plan.length
      ? `<section class="section"><div class="card">
          <div class="section-head"><h2>30-dagen actieplan</h2><span class="section-sub">geprioriteerd</span></div>
          <ul class="ilist">
            ${a.thirty_day_action_plan
              .map(
                (act, i) => `<li>
                  <span class="mk mk-num">${i + 1}</span>
                  <span class="t"><strong>${esc(act.title)}</strong>
                    <small>${esc(act.why)} · <em>inspanning: ${esc(act.effort)}</em></small></span>
                </li>`,
              )
              .join("")}
          </ul>
        </div></section>`
      : ""
  }

  <div class="cta">
    <strong>Wil je dat NXTLI dit voor je uitwerkt?</strong>
    <p style="margin:.5em 0 0">Plan een korte GEO-strategiesessie. We bouwen websites en systemen die niet alleen mooi zijn, maar ook begrijpelijk voor mensen én AI. <a href="https://nxtli.com">nxtli.com</a></p>
  </div>

  <div class="foot">
    Dit rapport is automatisch gegenereerd door Brian, de AI-analist van NXTLI, op basis van je homepage en aangeleverde gegevens. © NXTLI.
  </div>
</div>
</body>
</html>`;
}

type Item = string | { title: string; sub?: string };

/** Marker-coded bullet list. kind: good (✓) | opp (→) | gap (+). */
function ilist(items: Item[], kind: "good" | "opp" | "gap", empty: string): string {
  if (!items.length) return empty ? `<p class="muted">${esc(empty)}</p>` : "";
  const mark = kind === "good" ? "✓" : kind === "opp" ? "→" : "+";
  const cls = kind === "good" ? "mk-good" : kind === "opp" ? "mk-opp" : "mk-gap";
  return `<ul class="ilist">${items
    .map((it) => {
      const title = typeof it === "string" ? it : it.title;
      const sub = typeof it === "string" ? "" : it.sub;
      return `<li><span class="mk ${cls}">${mark}</span><span class="t">${esc(title)}${
        sub ? `<small>${esc(sub)}</small>` : ""
      }</span></li>`;
    })
    .join("")}</ul>`;
}

/** Numbered priority list (for quick wins / actions). */
function numlist(items: string[], empty: string): string {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="ilist">${items
    .map(
      (it, i) =>
        `<li><span class="mk mk-num">${i + 1}</span><span class="t">${esc(it)}</span></li>`,
    )
    .join("")}</ul>`;
}

function pct(score: number, max: number): number {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

function techBadge(status: string): string {
  const map: Record<string, { bg: string; label: string }> = {
    goed: { bg: "#16a34a", label: "Goed" },
    aandacht: { bg: "#d97706", label: "Aandacht" },
    blokker: { bg: "#dc2626", label: "Blokker" },
    onbekend: { bg: "#94a3b8", label: "Onbekend" },
  };
  const s = map[status] ?? map.onbekend;
  return `<span class="tbadge" style="background:${s.bg}">${s.label}</span>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
