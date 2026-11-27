import {
  CHECK_IDS,
  CHECK_REGISTRY,
  LCP_ATTENTION_MAX_MS,
  LCP_PASS_MAX_MS,
  RECENT_MAX_AGE_DAYS,
  THIN_WORD_COUNT,
  type CheckId,
} from "./checks";
import { logError } from "./logger";
import {
  checkMachineAuth,
  MAX_URL_LENGTH,
  MAX_URLS,
  pageCheckBodySchema,
  type PageCheckBody,
  type PageCheckResponse,
} from "./page-check";
import { scanPageArgsSchema, type ScanPageArgs, type ScanPageResult } from "./scan-page";

/**
 * A minimal, stateless MCP server over Streamable HTTP for the page check.
 *
 * Every POST carries one JSON-RPC 2.0 message and a request is answered with
 * one `application/json` response: no SSE stream, no sessions, no
 * `Mcp-Session-Id`. The page-check tools return exactly what POST
 * /api/geo/page-check returns. A route lists only the tools it has deps for:
 * app/api/geo/mcp/route.ts serves the page check, and
 * app/api/geo/mcp/scan/route.ts serves the full scan (`geo_scan_page`), with
 * the longer time budget the site scan has.
 */

export const MCP_SERVER_NAME = "geo";
export const MCP_SERVER_VERSION = "0.1.0";
/** Newest first; the first one is answered when the client asks for another. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

export type JsonRpcId = string | number;

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: Record<string, unknown>;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  /** Null only when the request id could not be read. */
  id: JsonRpcId | null;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/** A full scan, or the scan route's rate limit saying when to come back. */
export type ScanPageOutcome = { ok: true; result: ScanPageResult } | { ok: false; retryAfterSeconds: number };

export interface McpDeps {
  /** Runs the page check; the route passes `runPageCheck` with the env-built deps. */
  checkPages?: (body: PageCheckBody) => Promise<PageCheckResponse>;
  /** Runs one full site scan (lib/geo/scan-page.ts), behind the scan route's rate limit. */
  scanPage?: (args: ScanPageArgs) => Promise<ScanPageOutcome>;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

/**
 * One sentence per check: what it measures and what passes. Typed by CheckId,
 * so a new check fails the typecheck until it is described here.
 */
export const CHECK_DESCRIPTIONS: Record<CheckId, string> = {
  author_publisher:
    "Whether the page names an author and a publisher in JSON-LD or meta tags; passes when both are named, and a site name alone is attention.",
  recency: `The page's published and modified dates; passes when a plausible date is at most ${RECENT_MAX_AGE_DAYS} days old; n/a on a homepage without a date.`,
  structured_data:
    "The JSON-LD on the page, judged by page type (home, product, article, FAQ, other); passes when the type that page should declare is present at the top level.",
  clarity: `Whether the core offer or message is clear in the first screen (a model verdict with a one-line reason, when the model is on), with the structure as evidence: title, meta description, a single h1, heading order and body text (at least ${THIN_WORD_COUNT} words, not a JavaScript-only shell). Without a verdict it passes when all of the structure is present and in order.`,
  speed: `Mobile Largest Contentful Paint: the real-user 75th percentile over 28 days from the Chrome UX Report API (for the page, else for the site), or from PageSpeed Insights when CrUX has none; otherwise one PageSpeed Insights lab run (a slow lab run is measured twice and the lower kept); passes at ${LCP_PASS_MAX_MS / 1000} s or less, attention up to ${LCP_ATTENTION_MAX_MS / 1000} s; unknown with Lighthouse's reason when it could not load the page; n/a when it was not measured (the measurement took too long or the quota was exhausted).`,
  external:
    "Off-page confirmation from free signals: review markup, sameAs and profile links, and links to review sites; passes with review evidence and a profile signal.",
};

export const CHECK_PAGES_TOOL = "geo_check_pages";
export const LIST_CHECKS_TOOL = "geo_list_checks";
export const SCAN_PAGE_TOOL = "geo_scan_page";

/** The page-check tools; the input schema mirrors `pageCheckBodySchema`. */
export const MCP_TOOLS = [
  {
    name: CHECK_PAGES_TOOL,
    description:
      `Runs measured GEO checks on up to ${MAX_URLS} web pages and returns, per page, each check's status ` +
      "(pass, attention, fail, unknown, n/a), a one-line summary, the facts measured and a short piece of evidence, " +
      "plus whether robots.txt blocks AI or search crawlers and whether llms.txt exists. The results are measured " +
      "facts from fetching the pages, not opinions. A call can take up to two minutes, mostly for the speed check; " +
      "pass `checks` to run only some of them.",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          description: `The page URLs to check (http or https), 1 to ${MAX_URLS}. Duplicates are checked once.`,
          items: { type: "string", minLength: 1, maxLength: MAX_URL_LENGTH },
          minItems: 1,
          maxItems: MAX_URLS,
        },
        checks: {
          type: "array",
          description: `Which checks to run; leave out to run all of them. See ${LIST_CHECKS_TOOL}.`,
          items: { type: "string", enum: [...CHECK_IDS] },
        },
      },
      required: ["urls"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: LIST_CHECKS_TOOL,
    description:
      `Lists the checks ${CHECK_PAGES_TOOL} can run: each check's id, label, and what it measures and what passes. ` +
      "Takes no arguments and makes no network calls.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

/** The full-scan tool; the input schema mirrors `scanPageArgsSchema`. */
export const SCAN_TOOLS = [
  {
    name: SCAN_PAGE_TOOL,
    description:
      "Runs the GEO site's full scan on one page, the same scan visitors get on the site: it reads the page, " +
      "scores it against the GEO scorecard with a language model and renders the site's own report. Returns the " +
      "scorecard (scores, criteria, actions), a short preview, the report as self-contained HTML in " +
      "`structuredContent.report_html`, and a PDF URL when the site stores PDFs (else null). No lead, e-mail or " +
      "notification is created. A call can take up to five minutes. Pass the company name and the questions buyers " +
      "ask for a sharper report.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The page to scan (http or https).", minLength: 1, maxLength: MAX_URL_LENGTH },
        company: { type: "string", description: "The company or brand name; defaults to the page's host.", maxLength: 200 },
        questions: {
          type: "string",
          description: "Questions buyers ask an AI assistant that this page should answer, one per line.",
          maxLength: 2000,
        },
        offer: { type: "string", description: "What the company offers, in a sentence or two.", maxLength: 2000 },
        audience: { type: "string", description: "Who the page is for.", maxLength: 2000 },
      },
      required: ["url"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

/** The tools a route serves: the page check, the full scan, or both. */
export function toolsFor(deps: McpDeps): ((typeof MCP_TOOLS)[number] | (typeof SCAN_TOOLS)[number])[] {
  return [...(deps.checkPages ? MCP_TOOLS : []), ...(deps.scanPage ? SCAN_TOOLS : [])];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

export function rpcError(id: JsonRpcId | null, code: number, message: string): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: Record<string, unknown>): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function textResult(text: string, structuredContent?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}), isError: false };
}

function toolError(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function negotiateVersion(requested: string): string {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

/** The registry's checks with their descriptions, in registry order. */
export function listChecks(): { id: CheckId; label: string; description: string }[] {
  return CHECK_REGISTRY.map((check) => ({ id: check.id, label: check.label, description: CHECK_DESCRIPTIONS[check.id] }));
}

async function callCheckPages(
  args: Record<string, unknown>,
  checkPages: NonNullable<McpDeps["checkPages"]>,
): Promise<ToolResult> {
  const parsed = pageCheckBodySchema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`);
    return toolError(`Invalid arguments. ${issues.join("; ")}`);
  }
  try {
    const response = await checkPages(parsed.data);
    return textResult(JSON.stringify(response), response as unknown as Record<string, unknown>);
  } catch (error) {
    // runPageCheck catches per URL; this only guards against the unexpected.
    logError("mcp.geo_check_pages", error);
    return toolError("The page check failed unexpectedly. Try again later.");
  }
}

async function callScanPage(
  args: Record<string, unknown>,
  scan: NonNullable<McpDeps["scanPage"]>,
): Promise<ToolResult> {
  const parsed = scanPageArgsSchema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`);
    return toolError(`Invalid arguments. ${issues.join("; ")}`);
  }
  try {
    const outcome = await scan(parsed.data);
    if (!outcome.ok) {
      return toolError(`Too many scans right now. Try again in ${outcome.retryAfterSeconds} seconds.`);
    }
    // The text leaves the report HTML out: it is long, and only a renderer needs it.
    const { report_html: _html, ...summary } = outcome.result;
    return textResult(JSON.stringify(summary), outcome.result as unknown as Record<string, unknown>);
  } catch (error) {
    logError("mcp.geo_scan_page", error);
    return toolError("The scan failed unexpectedly. Try again later.");
  }
}

async function callTool(id: JsonRpcId, params: unknown, deps: McpDeps): Promise<JsonRpcResponse> {
  if (!isObject(params) || typeof params.name !== "string") {
    return rpcError(id, INVALID_PARAMS, "tools/call needs a string `name`");
  }
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!isObject(args)) return rpcError(id, INVALID_PARAMS, "`arguments` must be an object");

  if (params.name === CHECK_PAGES_TOOL && deps.checkPages) {
    return rpcResult(id, { ...(await callCheckPages(args, deps.checkPages)) });
  }
  if (params.name === SCAN_PAGE_TOOL && deps.scanPage) {
    return rpcResult(id, { ...(await callScanPage(args, deps.scanPage)) });
  }
  if (params.name === LIST_CHECKS_TOOL && deps.checkPages) {
    const checks = listChecks();
    return rpcResult(id, { ...textResult(JSON.stringify({ checks }), { checks }) });
  }
  return rpcError(id, INVALID_PARAMS, `Unknown tool: ${params.name}`);
}

/**
 * Handles one JSON-RPC message. Returns the response for a request, or null
 * for a notification or a response sent by the client (neither is answered).
 * Batches are rejected: MCP 2025-06-18 dropped them.
 */
export async function handleMcpMessage(message: unknown, deps: McpDeps): Promise<JsonRpcResponse | null> {
  if (Array.isArray(message)) return rpcError(null, INVALID_REQUEST, "Batch requests are not supported");
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return rpcError(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message");
  }
  if (typeof message.method !== "string") {
    // A response from the client (to a server request we never send).
    if ("result" in message || "error" in message) return null;
    return rpcError(null, INVALID_REQUEST, "Missing method");
  }
  if (!("id" in message)) return null; // notification, e.g. notifications/initialized
  if (!isId(message.id)) return rpcError(null, INVALID_REQUEST, "The id must be a string or a number");

  const id = message.id;
  const params = message.params;
  switch (message.method) {
    case "initialize": {
      if (!isObject(params) || typeof params.protocolVersion !== "string") {
        return rpcError(id, INVALID_PARAMS, "initialize needs a string `protocolVersion`");
      }
      return rpcResult(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: toolsFor(deps) });
    case "tools/call":
      return callTool(id, params, deps);
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** 404 when the token is unset, 401 when it does not match; null when allowed. */
function authFailure(request: Request, token: string | undefined): Response | null {
  const auth = checkMachineAuth(request.headers.get("authorization"), token);
  if (auth === "not_found") return json({ error: "not found" }, 404);
  if (auth === "unauthorized") return json({ error: "unauthorized" }, 401);
  return null;
}

/**
 * The POST handler: auth exactly as the page-check route, then one message.
 * A request is answered 200 with its JSON-RPC response; a notification or
 * client response 202 with no body; unparseable JSON 400 with -32700; a
 * message that is not a valid request (a batch included) 400 with -32600.
 */
export async function handleMcpPost(request: Request, token: string | undefined, deps: McpDeps): Promise<Response> {
  const denied = authFailure(request, token);
  if (denied) return denied;

  let message: unknown;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return json(rpcError(null, PARSE_ERROR, "Parse error"), 400);
  }

  const response = await handleMcpMessage(message, deps);
  if (response === null) return new Response(null, { status: 202 });
  const unreadable = "error" in response && response.id === null;
  return json(response, unreadable ? 400 : 200);
}

/**
 * GET and DELETE: auth first (so a switched-off endpoint stays a 404), then
 * 405. There is no SSE stream to open and no session to end.
 */
export function handleMcpNotAllowed(request: Request, token: string | undefined): Response {
  const denied = authFailure(request, token);
  if (denied) return denied;
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
