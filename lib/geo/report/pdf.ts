import { logInfo } from "../logger";

/**
 * PDF adapter layer.
 *
 * Default behaviour: no binary PDF is generated server-side. The report is
 * served as a self-contained HTML page (see app/api/geo/report/[id]) which the
 * visitor can "Print → Save as PDF", and which a headless renderer can consume.
 *
 * To produce a real PDF later, implement one of the strategies below behind
 * this same interface — nothing else in the app needs to change:
 *
 *  - Puppeteer / Playwright: render the HTML and `page.pdf()`. (Playwright +
 *    Chromium are available in this environment via PLAYWRIGHT_BROWSERS_PATH.)
 *  - An external PDF service (e.g. a /pdf microservice or a SaaS API): POST the
 *    HTML, store the returned file (e.g. in Supabase Storage), return its URL.
 *
 * `generatePdf` returns a URL to the stored PDF, or null when PDF generation
 * is not configured (the HTML report + email still work).
 */
export interface PdfResult {
  pdfUrl: string | null;
}

export async function generatePdf(_params: {
  html: string;
  scanRequestId: string | null;
}): Promise<PdfResult> {
  const strategy = process.env.GEO_PDF_STRATEGY?.trim();

  if (!strategy || strategy === "none") {
    logInfo("pdf", "PDF generation not configured — serving HTML report only");
    return { pdfUrl: null };
  }

  // TODO(NXTLI): implement when a PDF strategy is chosen.
  // switch (strategy) {
  //   case "playwright": return { pdfUrl: await renderWithPlaywright(_params) };
  //   case "service":    return { pdfUrl: await renderWithService(_params) };
  // }

  logInfo("pdf", `unknown GEO_PDF_STRATEGY "${strategy}" — skipping PDF`);
  return { pdfUrl: null };
}
