/**
 * NXTLI GEO — domain types.
 *
 * These mirror the Supabase tables (see supabase/migrations) and the contract
 * of the AI analysis layer. Keep them in sync with the SQL schema.
 */

export type GeoScanStatus =
  | "pending"
  | "scanning"
  | "completed"
  | "failed";

/** A lead captured by Charlie during the chat. Maps to `geo_leads`. */
export interface GeoLead {
  id: string;
  created_at: string;
  name: string;
  email: string;
  /** No longer collected (phone step removed) — null for new leads. */
  phone: string | null;
  job_title: string;
  company_name: string;
  homepage_url: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors: string | null;
  consent: boolean;
  source: string;
}

/** Everything Charlie collected, before persistence. */
export interface GeoLeadInput {
  name: string;
  email: string;
  job_title: string;
  company_name: string;
  homepage_url: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors?: string | null;
  consent: boolean;
}

/** A scan run. Maps to `geo_scan_requests`. */
export interface GeoScanRequest {
  id: string;
  created_at: string;
  lead_id: string;
  status: GeoScanStatus;
  homepage_url: string;
  raw_input: GeoLeadInput;
  analysis_result: GeoAnalysisResult | null;
  report_url: string | null;
  pdf_url: string | null;
  email_sent_at: string | null;
  error_message: string | null;
  /** Token usage of the analysis call, for cost reporting. */
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  visibility_score: number | null;
}

/** Token usage returned by an analysis provider, for cost accounting. */
export interface GeoUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/** The structured report. Maps to `geo_scan_reports`. */
export interface GeoScanReport {
  id: string;
  created_at: string;
  scan_request_id: string;
  lead_id: string;
  visibility_score: number | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  content_gaps: string[];
  priority_actions: PriorityAction[];
  report_html: string | null;
  pdf_url: string | null;
}

export interface PriorityAction {
  title: string;
  why: string;
  effort: "laag" | "midden" | "hoog";
}

export interface RecommendedFaq {
  question: string;
  why: string;
}

/** A per-category score that makes up the total (sums to 100). */
export interface CategoryScore {
  key: string;
  label: string;
  score: number;
  max: number;
  summary: string;
}

/** Oordeel per criterium van de scorecard. "nvt" = niet te beoordelen, telt niet mee. */
export type CriterionVerdict = "voldoet" | "deels" | "niet" | "nvt";

export interface CriterionResult {
  /** Id uit lib/geo/knowledge/scorecard.json, bijvoorbeeld "B1". */
  id: string;
  verdict: CriterionVerdict;
  /** Wat er op de pagina is gezien. */
  finding: string;
  /** Letterlijk citaat van de pagina als bewijs, of leeg. */
  quote: string;
}

/** Eén concreet advies dat een mens of AI-collega direct kan uitvoeren. */
export interface GeoAction {
  title: string;
  /** Criterium of poortwachter waar het advies bij hoort ("B1", "P1"). */
  criterion: string;
  why: string;
  /** Waar op de pagina (kop, alinea, bestand). */
  where: string;
  /** Huidige tekst of code, letterlijk. Leeg als er niets staat. */
  before: string;
  /** Voorstel. Ontbrekende feiten staan als [invullen: ...]. */
  after: string;
  owner: string;
  effort: "laag" | "midden" | "hoog";
  /** Controleerbare toets: wanneer is dit advies af. */
  done_when: string;
  /** Punten die dit advies in de scorecard oplevert (0 bij poortwachters). */
  points: number;
  /** Bewijskracht van de onderliggende aanname + bron. */
  evidence_grade: string;
  source: string;
}

/** Kennis over de koper. Komt uit het Marketingbrein of uit de chat. */
export interface BuyerContext {
  /** Waar de kennis vandaan komt: bepaalt hoe stellig het rapport mag zijn. */
  origin: "marketingbrein" | "bezoeker";
  audiences: string[];
  questions: Array<{ text: string; source: string; ref?: string }>;
  decision_criteria: string[];
  offers: string[];
  competitors: string[];
  positioning: string | null;
  /** Kennis die ontbreekt en de analyse beperkt. */
  gaps: string[];
}

export type TechnicalStatus = "goed" | "aandacht" | "blokker" | "onbekend";

/** A single technical-check item, reported separately from the content score. */
export interface TechnicalCheck {
  label: string;
  status: TechnicalStatus;
  detail: string;
}

/**
 * Input handed to the AI analysis layer.
 * `page_content` / `metadata` are optional — populated only if homepage
 * fetching succeeded server-side.
 */
export interface GeoAnalysisInput {
  homepage_url: string;
  company_name: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors?: string | null;
  page_content?: string | null;
  metadata?: GeoPageMetadata | null;
  /** Contents of /robots.txt (best-effort), for AI-crawler access check. */
  robots_txt?: string | null;
  /** Whether /llms.txt was found. undefined = not checked. */
  llms_txt_present?: boolean;
  /** Gemeten feiten uit HTML en headers (lib/geo/facts/page.ts). */
  facts?: import("./facts/page").PageFacts | null;
  /** Toegang per AI-bot, door de parser bepaald (lib/geo/facts/robots.ts). */
  robots?: import("./facts/robots").RobotsReport | null;
  /** Kennis over de koper uit het Marketingbrein. Zonder: afgeleid uit de chatvelden. */
  buyer?: BuyerContext | null;
}

export interface GeoPageMetadata {
  title?: string | null;
  description?: string | null;
  fetched: boolean;
  status?: number | null;
  word_count?: number | null;
  /** Content of the <meta name="robots"> tag, if present (e.g. "noindex"). */
  meta_robots?: string | null;
  /** Whether at least one JSON-LD (<script type="application/ld+json">) block is present. */
  has_json_ld?: boolean;
  /** Number of <h1> tags found in the raw HTML. */
  h1_count?: number;
  /** Number of <h1>/<h2>/<h3> tags found in the raw HTML. */
  heading_count?: number;
}

/**
 * Structured output of the AI analysis. This is the canonical contract any
 * analysis provider (Claude, mock, or the existing NXTLI skill) must return.
 */
export interface GeoAnalysisResult {
  /** Versie van de rubric waarmee dit resultaat is gemaakt ("1" = oude scan). */
  rubric_version: string;
  visibility_score: number; // 0-100, sum of category_scores (capped when blocked)
  category_scores: CategoryScore[];
  /** Oordeel per criterium (rubric 2). Leeg bij oude resultaten. */
  criteria: CriterionResult[];
  /** Concrete adviezen, op prioriteit. */
  actions: GeoAction[];
  /** Een poortwachter faalt: de score is afgetopt. */
  blocked: boolean;
  /** Reden waarom er geen score is (bijv. pagina niet opgehaald). Anders null. */
  unscored_reason: string | null;
  technical_checks: TechnicalCheck[];
  /** Gemeld, telt niet mee in de score (schema, llms.txt, canonical). */
  hygiene: TechnicalCheck[];
  /** Wat de scan wel en niet heeft gemeten. */
  scope_notes: string[];
  /** Het merk waar de beoordeling over gaat (van de pagina, anders ingevuld). */
  subject_name?: string;
  short_summary: string;
  what_ai_understands: string;
  likely_ai_positioning: string;
  /** Before/after of how an AI assistant would answer about the business. */
  ai_answer_comparison: AiAnswerComparison;
  /** What each real LLM returns when asked about the business (the table). */
  llm_visibility: LlmVisibilityRow[];
  strengths: string[];
  weaknesses: string[];
  missing_signals: string[];
  content_gaps: string[];
  recommended_pages: string[];
  recommended_faq_questions: RecommendedFaq[];
  quick_wins: string[];
  thirty_day_action_plan: PriorityAction[];
  suggested_homepage_copy_improvements: string[];
}

/** One side of the AI-answer before/after (a quote + short labels). */
export interface AiAnswerSide {
  answer: string;
  tags: string[];
}

/**
 * How an AI assistant would answer about the business now (vague, based on the
 * current page) versus how it could read with concrete, citeerbare facts.
 */
export interface AiAnswerComparison {
  current: AiAnswerSide;
  improved: AiAnswerSide;
}

/** One row of the "what each LLM says about you" table. */
export interface LlmVisibilityRow {
  /** Human label, e.g. "ChatGPT (OpenAI)". */
  engine: string;
  /** What that system actually returned about the business. */
  answer: string;
  /** Whether the business appears to be known/found in that answer. */
  found: boolean;
}

/** What the /api/geo/scan endpoint returns to the chat client. */
export interface GeoScanResponse {
  ok: boolean;
  scan_request_id?: string;
  status: GeoScanStatus;
  /** Short preview Charlie shows in the chat. */
  preview?: {
    visibility_score: number;
    category_scores: CategoryScore[];
    short_summary: string;
    strengths: string[];
    quick_wins: string[];
    /** Gezet als er geen score is; de chat toont dan de reden. */
    unscored_reason?: string | null;
  };
  report_url?: string | null;
  /**
   * Het rapport zelf. De chat opent dit als de link niet werkt, bijvoorbeeld
   * in een omgeving zonder database waar het rapport alleen in het geheugen van
   * één serverinstantie staat.
   */
  report_html?: string;
  email_queued?: boolean;
  /**
   * True when the scan was blocked by the one-scan-per-email gate. The preview /
   * report_url then point to the user's EARLIER scan, and `message` explains it.
   */
  blocked?: boolean;
  /** User-safe message. Never contains technical/internal detail. */
  message?: string;
}
