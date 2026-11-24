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

/**
 * A minimal, stateless MCP server over Streamable HTTP for the page check.
 *
 * Every POST carries one JSON-RPC 2.0 message and a request is answered with
 * one `application/json` response: no SSE stream, no sessions, no
 * `Mcp-Session-Id`. The tools return exactly what POST /api/geo/page-check
 * returns. The route (app/api/geo/mcp/route.ts) only wires the environment.
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

export interface McpDeps {
  /** Runs the page check; the route passes `runPageCheck` with the env-built deps. */
  checkPages: (body: PageCheckBody) => Promise<PageCheckResponse>;
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
  recency: `The page's published and modified dates; passes when a plausible date is at most ${RECENT_MAX_AGE_DAYS} days old.`,
  structured_data:
    "The JSON-LD on the page, judged by page type (home, product, article, FAQ, other); passes when the type that page should declare is present at the top level.",
  clarity: `Whether the core offer or message is clear in the first screen (a model verdict with a one-line reason, when the model is on), with the structure as evidence: title, meta description, a single h1, heading order and body text (at least ${THIN_WORD_COUNT} words, not a JavaScript-only shell). Without a verdict it passes when all of the structure is present and in order.`,
  speed: `Mobile Largest Contentful Paint from PageSpeed Insights; passes at ${LCP_PASS_MAX_MS / 1000} s or less, attention up to ${LCP_ATTENTION_MAX_MS / 1000} s.`,
  external:
    "Off-page confirmation from free signals: review markup, sameAs and profile links, and links to review sites; passes with review evidence and a profile signal.",
};

export const CHECK_PAGES_TOOL = "geo_check_pages";
export const LIST_CHECKS_TOOL = "geo_list_checks";

/** The tool list; the input schema mirrors `pageCheckBodySchema`. */
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

async function callCheckPages(args: Record<string, unknown>, deps: McpDeps): Promise<ToolResult> {
  const parsed = pageCheckBodySchema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`);
    return toolError(`Invalid arguments. ${issues.join("; ")}`);
  }
  try {
    const response = await deps.checkPages(parsed.data);
    return textResult(JSON.stringify(response), response as unknown as Record<string, unknown>);
  } catch (error) {
    // runPageCheck catches per URL; this only guards against the unexpected.
    logError("mcp.geo_check_pages", error);
    return toolError("The page check failed unexpectedly. Try again later.");
  }
}

async function callTool(id: JsonRpcId, params: unknown, deps: McpDeps): Promise<JsonRpcResponse> {
  if (!isObject(params) || typeof params.name !== "string") {
    return rpcError(id, INVALID_PARAMS, "tools/call needs a string `name`");
  }
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!isObject(args)) return rpcError(id, INVALID_PARAMS, "`arguments` must be an object");

  if (params.name === CHECK_PAGES_TOOL) {
    return rpcResult(id, { ...(await callCheckPages(args, deps)) });
  }
  if (params.name === LIST_CHECKS_TOOL) {
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
      return rpcResult(id, { tools: MCP_TOOLS });
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
