import { afterEach, describe, it, expect, vi } from "vitest";
import { CHECK_IDS } from "../checks";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import { pageCheckBodySchema, runPageCheck, type PageCheckBody, type PageCheckDeps } from "../page-check";
import {
  CHECK_PAGES_TOOL,
  INVALID_PARAMS,
  INVALID_REQUEST,
  LATEST_PROTOCOL_VERSION,
  LIST_CHECKS_TOOL,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  handleMcpMessage,
  handleMcpNotAllowed,
  handleMcpPost,
  type JsonRpcResponse,
  type McpDeps,
} from "../mcp";

const NOW = new Date("2026-11-24T12:00:00Z");
const TOKEN = "test-token";
const HTML = `<html><head><title>Pagina</title></head><body><h1>Pagina</h1><p>tekst</p></body></html>`;

function fakeScrape(url: string): ScrapeResult {
  return {
    text: null,
    metadata: { fetched: true, status: 200, title: "Meta titel" },
    robotsTxt: "",
    llmsTxtPresent: true,
    facts: extractPageFacts(HTML, url),
    robots: analyzeRobots("", url),
  };
}

/** Network-free page-check deps: a mocked fetch and a fixed clock. */
function pageDeps(): PageCheckDeps {
  return { fetchPage: vi.fn(async (url: string) => fakeScrape(url)), now: () => NOW };
}

function mcpDeps(checkPages?: McpDeps["checkPages"]): McpDeps {
  const deps = pageDeps();
  return { checkPages: checkPages ?? ((body: PageCheckBody) => runPageCheck(body, deps)) };
}

function request(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

function resultOf(response: JsonRpcResponse | null): Record<string, unknown> {
  if (!response || !("result" in response)) throw new Error(`expected a result, got ${JSON.stringify(response)}`);
  return response.result;
}

function errorOf(response: JsonRpcResponse | null): { code: number; message: string } {
  if (!response || !("error" in response)) throw new Error(`expected an error, got ${JSON.stringify(response)}`);
  return response.error;
}

function post(body: string, token: string | null = TOKEN): Request {
  return new Request("https://geo.example/api/geo/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("initialize", () => {
  it("answers the requested protocol version when it is supported", async () => {
    for (const version of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
      const result = resultOf(await handleMcpMessage(request("initialize", { protocolVersion: version }), mcpDeps()));
      expect(result.protocolVersion).toBe(version);
    }
  });

  it("answers the latest version when the requested one is unknown", async () => {
    const result = resultOf(await handleMcpMessage(request("initialize", { protocolVersion: "2099-01-01" }), mcpDeps()));
    expect(result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("declares the tools capability and the server name", async () => {
    const result = resultOf(
      await handleMcpMessage(request("initialize", { protocolVersion: "2025-06-18", capabilities: {} }), mcpDeps()),
    );
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.serverInfo).toMatchObject({ name: "geo" });
  });

  it("rejects initialize without a protocolVersion as invalid params", async () => {
    expect(errorOf(await handleMcpMessage(request("initialize", {}), mcpDeps())).code).toBe(INVALID_PARAMS);
  });
});

describe("message kinds", () => {
  it("returns null for a notification", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, mcpDeps())).toBeNull();
  });

  it("returns null for a response sent by the client", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 7, result: {} }, mcpDeps())).toBeNull();
  });

  it("answers ping with an empty result", async () => {
    expect(resultOf(await handleMcpMessage(request("ping"), mcpDeps()))).toEqual({});
  });

  it("rejects a batch with -32600", async () => {
    const response = await handleMcpMessage([request("ping"), request("ping", undefined, 2)], mcpDeps());
    expect(errorOf(response).code).toBe(INVALID_REQUEST);
  });

  it("rejects a message without jsonrpc 2.0", async () => {
    expect(errorOf(await handleMcpMessage({ id: 1, method: "ping" }, mcpDeps())).code).toBe(INVALID_REQUEST);
  });

  it("answers an unknown method with -32601 and the request id", async () => {
    const response = await handleMcpMessage(request("resources/list", undefined, "abc"), mcpDeps());
    expect(errorOf(response).code).toBe(METHOD_NOT_FOUND);
    expect(response?.id).toBe("abc");
  });
});

describe("tools/list", () => {
  it("lists both tools with an object input schema", async () => {
    const result = resultOf(await handleMcpMessage(request("tools/list"), mcpDeps()));
    const tools = result.tools as { name: string; description: string; inputSchema: { type: string } }[];
    expect(tools.map((tool) => tool.name)).toEqual([CHECK_PAGES_TOOL, LIST_CHECKS_TOOL]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("mirrors the body schema in the geo_check_pages input schema", async () => {
    const result = resultOf(await handleMcpMessage(request("tools/list"), mcpDeps()));
    const [checkPages] = result.tools as { inputSchema: Record<string, unknown> }[];
    expect(checkPages.inputSchema).toMatchObject({
      required: ["urls"],
      properties: {
        urls: { minItems: 1, maxItems: 10, items: { type: "string", maxLength: 2048 } },
        checks: { items: { enum: [...CHECK_IDS] } },
      },
    });
  });
});

describe("tools/call geo_check_pages", () => {
  it("returns the same object the HTTP path returns for the same input", async () => {
    const args = { urls: ["https://example.com/", "https://example.com/pricing"], checks: ["clarity", "recency"] };
    const deps = pageDeps();
    const direct = await runPageCheck(pageCheckBodySchema.parse(args), deps);

    const result = resultOf(
      await handleMcpMessage(
        request("tools/call", { name: CHECK_PAGES_TOOL, arguments: args }),
        mcpDeps((body) => runPageCheck(body, deps)),
      ),
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual(direct);
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(direct);
  });

  it("returns isError for invalid arguments without calling the check", async () => {
    const checkPages = vi.fn<McpDeps["checkPages"]>();
    const result = resultOf(
      await handleMcpMessage(
        request("tools/call", { name: CHECK_PAGES_TOOL, arguments: { urls: [] } }),
        mcpDeps(checkPages),
      ),
    );
    expect(result.isError).toBe(true);
    expect(checkPages).not.toHaveBeenCalled();
  });

  it("returns isError for more than ten urls", async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
    const result = resultOf(
      await handleMcpMessage(request("tools/call", { name: CHECK_PAGES_TOOL, arguments: { urls } }), mcpDeps()),
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError and logs when the check throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = resultOf(
      await handleMcpMessage(
        request("tools/call", { name: CHECK_PAGES_TOOL, arguments: { urls: ["https://example.com/"] } }),
        mcpDeps(async () => {
          throw new Error("boom");
        }),
      ),
    );
    expect(result.isError).toBe(true);
    expect(logged).toHaveBeenCalled();
  });
});

describe("tools/call geo_list_checks", () => {
  it("returns every registered check with a label and a description", async () => {
    const result = resultOf(await handleMcpMessage(request("tools/call", { name: LIST_CHECKS_TOOL }), mcpDeps()));
    const { checks } = result.structuredContent as { checks: { id: string; label: string; description: string }[] };
    expect(checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
    for (const check of checks) {
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.description.length).toBeGreaterThan(0);
    }
  });
});

describe("tools/call errors", () => {
  it("answers an unknown tool with -32602", async () => {
    const response = await handleMcpMessage(request("tools/call", { name: "geo_nope" }), mcpDeps());
    expect(errorOf(response).code).toBe(INVALID_PARAMS);
  });

  it("answers a call without a name with -32602", async () => {
    expect(errorOf(await handleMcpMessage(request("tools/call", {}), mcpDeps())).code).toBe(INVALID_PARAMS);
  });
});

describe("handleMcpPost", () => {
  const ping = JSON.stringify(request("ping"));

  it("answers 404 when the token is not configured", async () => {
    expect((await handleMcpPost(post(ping), undefined, mcpDeps())).status).toBe(404);
  });

  it("answers 401 on a wrong token", async () => {
    expect((await handleMcpPost(post(ping, "wrong"), TOKEN, mcpDeps())).status).toBe(401);
  });

  it("answers 401 without a token", async () => {
    expect((await handleMcpPost(post(ping, null), TOKEN, mcpDeps())).status).toBe(401);
  });

  it("answers a request with 200 and one JSON response", async () => {
    const response = await handleMcpPost(post(ping), TOKEN, mcpDeps());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("answers a notification with 202 and no body", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const response = await handleMcpPost(post(body), TOKEN, mcpDeps());
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("answers invalid JSON with 400 and -32700", async () => {
    const response = await handleMcpPost(post("{not json"), TOKEN, mcpDeps());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } });
  });

  it("answers a batch with 400 and -32600", async () => {
    const response = await handleMcpPost(post(JSON.stringify([request("ping")])), TOKEN, mcpDeps());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(INVALID_REQUEST);
  });

  it("answers an unknown method with 200 and a JSON-RPC error", async () => {
    const response = await handleMcpPost(post(JSON.stringify(request("nope"))), TOKEN, mcpDeps());
    expect(response.status).toBe(200);
    expect((await response.json()).error.code).toBe(METHOD_NOT_FOUND);
  });
});

describe("handleMcpNotAllowed", () => {
  const get = (token: string | null) =>
    new Request("https://geo.example/api/geo/mcp", {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it("answers GET with 405 and Allow: POST", () => {
    const response = handleMcpNotAllowed(get(TOKEN), TOKEN);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 404 before 405 when the token is not configured", () => {
    expect(handleMcpNotAllowed(get(TOKEN), undefined).status).toBe(404);
  });
});
