import type { GeoAnalysisResult, GeoLeadInput } from "../types";

/**
 * NXTLI-branded HTML report template. Self-contained (inline CSS) so it can be
 * served directly, printed to PDF by the browser, or handed to a headless
 * renderer (Puppeteer/Playwright) without external assets.
 */
export function renderReportHtml(params: {
  lead: Pick<GeoLeadInput, "company_name" | "homepage_url" | "name">;
  analysis: GeoAnalysisResult;
  date: string;
}): string {
  const { lead, analysis, date } = params;
  const score = analysis.visibility_score;
  const band =
    score >= 70 ? "Sterk" : score >= 45 ? "Gemiddeld" : "Te verbeteren";
  const bandColor =
    score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626";

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NXTLI GEO Scan — ${esc(lead.company_name)}</title>
<style>
  :root { --brand:#5850ec; --ink:#0f172a; --muted:#475569; --border:#e4e7ed; --soft:#eeefff; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background:#fff; line-height:1.55; }
  .page { max-width: 820px; margin: 0 auto; padding: 48px 40px; }
  .eyebrow { text-transform: uppercase; letter-spacing:.12em; font-size:12px; font-weight:700; color: var(--brand); }
  .cover { border:1px solid var(--border); border-radius:20px; padding:36px; background:linear-gradient(160deg,#fff, #f7f8ff); }
  h1 { font-size:30px; margin:.4em 0 .2em; letter-spacing:-.02em; }
  h2 { font-size:19px; margin:2em 0 .6em; letter-spacing:-.01em; }
  .meta { color: var(--muted); font-size:14px; }
  .scoreWrap { display:flex; align-items:center; gap:20px; margin-top:24px; }
  .score { font-size:54px; font-weight:800; line-height:1; }
  .badge { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; }
  .bar { height:10px; border-radius:999px; background:#eef0f4; overflow:hidden; margin-top:10px; }
  .bar > i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,var(--brand),#0ea5e9); }
  ul { margin:.3em 0; padding-left:1.1em; }
  li { margin:.3em 0; }
  .card { border:1px solid var(--border); border-radius:14px; padding:18px 20px; margin:10px 0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .pill { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--soft); color:var(--brand); }
  .muted { color: var(--muted); }
  .cta { margin-top:28px; border-radius:16px; padding:24px; background:var(--ink); color:#fff; }
  .cta a { color:#a5b4fc; }
  table { width:100%; border-collapse:collapse; }
  td { padding:8px 0; border-bottom:1px solid var(--border); vertical-align:top; }
  .foot { margin-top:40px; color:var(--muted); font-size:12px; border-top:1px solid var(--border); padding-top:16px; }
  @media (max-width:640px){ .grid{grid-template-columns:1fr;} .page{padding:28px 18px;} }
</style>
</head>
<body>
<div class="page">
  <section class="cover">
    <div class="eyebrow">NXTLI GEO Scan</div>
    <h1>AI-vindbaarheidsrapport</h1>
    <div class="meta">
      <strong>${esc(lead.company_name)}</strong><br/>
      ${esc(lead.homepage_url)}<br/>
      ${esc(date)}
    </div>
    <div class="scoreWrap">
      <div>
        <div class="score" style="color:${bandColor}">${score}<span style="font-size:20px;color:var(--muted)">/100</span></div>
        <span class="badge" style="background:${bandColor}">${band}</span>
      </div>
      <div style="flex:1">
        <div class="muted" style="font-size:13px">AI Visibility Score</div>
        <div class="bar"><i style="width:${score}%"></i></div>
      </div>
    </div>
  </section>

  <h2>Samenvatting</h2>
  <p>${esc(analysis.short_summary)}</p>

  <h2>Wat AI waarschijnlijk begrijpt van deze website</h2>
  <div class="card">${esc(analysis.what_ai_understands)}</div>
  ${
    analysis.likely_ai_positioning
      ? `<div class="card"><span class="pill">Positionering</span><p style="margin:.5em 0 0">${esc(
          analysis.likely_ai_positioning,
        )}</p></div>`
      : ""
  }

  <div class="grid">
    <div>
      <h2>Sterke punten</h2>
      ${list(analysis.strengths)}
    </div>
    <div>
      <h2>Gemiste kansen</h2>
      ${list(analysis.weaknesses)}
    </div>
  </div>

  ${
    analysis.missing_signals.length
      ? `<h2>Ontbrekende signalen</h2>${list(analysis.missing_signals)}`
      : ""
  }

  <h2>Content gaps</h2>
  ${list(analysis.content_gaps)}

  <h2>Concrete verbeterpunten</h2>
  ${list(analysis.quick_wins)}
  ${
    analysis.suggested_homepage_copy_improvements.length
      ? `<h2>Verbetervoorstellen homepage-copy</h2>${list(
          analysis.suggested_homepage_copy_improvements,
        )}`
      : ""
  }

  ${
    analysis.recommended_faq_questions.length
      ? `<h2>Aanbevolen FAQ-vragen</h2>${list(
          analysis.recommended_faq_questions.map((q) => q.question),
        )}`
      : ""
  }

  <h2>30-dagen actieplan</h2>
  <table>
    ${analysis.thirty_day_action_plan
      .map(
        (a) => `<tr>
          <td style="width:70%"><strong>${esc(a.title)}</strong><br/><span class="muted">${esc(a.why)}</span></td>
          <td style="text-align:right"><span class="pill">${esc(a.effort)}</span></td>
        </tr>`,
      )
      .join("")}
  </table>

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

function list(items: string[]): string {
  if (!items.length) return `<p class="muted">Geen punten gevonden.</p>`;
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
