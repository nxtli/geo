import Anthropic from "@anthropic-ai/sdk";
import type { GeoAnalysisInput, GeoAnalysisResult } from "../../types";
import {
  geoAnalysisJsonSchema,
  parseAnalysisResult,
  type GeoAnalysisProvider,
} from "../provider";
import { GEO_SYSTEM_PROMPT, buildAnalysisPrompt } from "../prompt";
import { logError, logInfo } from "../../logger";

/**
 * Analysis via the shared NXTLI organization Claude skill `geo-page-checker`.
 *
 * Invokes the skill through the Messages API Agent Skills surface:
 *   client.beta.messages.create with
 *     container: { skills: [{ type: "custom", skill_id, version }] }
 *     tools:     [{ type: "code_execution_20260521", name: "code_execution" }]
 *     betas:     ["code-execution-2025-08-25", "skills-2025-10-02"]
 *
 * The skill (its SKILL.md) drives HOW the homepage is assessed; our prompt
 * pins the OUTPUT to the GeoAnalysisResult schema, which we then validate.
 *
 * Config (server-side only):
 *   ANTHROPIC_API_KEY     – required; must belong to the org that owns the skill
 *   GEO_SKILL_NAME        – skill display name to resolve (default geo-page-checker)
 *   GEO_SKILL_ID          – optional: skip name lookup, use this skill_id directly
 *   GEO_SKILL_VERSION     – optional skill version (default "latest")
 *   GEO_ANALYSIS_MODEL    – optional model (default claude-opus-4-8)
 */
const SKILL_BETAS = ["code-execution-2025-08-25", "skills-2025-10-02"];
const ANTHROPIC_VERSION = "2023-06-01";

let cachedSkillId: string | null = null;

export class GeoSkillAnalysisProvider implements GeoAnalysisProvider {
  readonly id = "geo-skill";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async analyze(input: GeoAnalysisInput): Promise<GeoAnalysisResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("geo_skill_not_configured");

    const skillId = await resolveSkillId(apiKey);
    const version = process.env.GEO_SKILL_VERSION || "latest";
    const model = process.env.GEO_ANALYSIS_MODEL || "claude-opus-4-8";

    const client = new Anthropic({ apiKey });

    const params = {
      model,
      max_tokens: 16000,
      container: {
        skills: [{ type: "custom", skill_id: skillId, version }],
      },
      tools: [{ type: "code_execution_20260521", name: "code_execution" }],
      betas: SKILL_BETAS,
      system: GEO_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${buildAnalysisPrompt(input)}

Gebruik de geo-page-checker skill om deze homepage te beoordelen op AI-vindbaarheid. Geef je eindresultaat UITSLUITEND terug als één JSON-object (geen extra tekst, geen markdown) dat exact voldoet aan dit JSON-schema:

${JSON.stringify(geoAnalysisJsonSchema)}`,
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.beta.messages.create(params as any);

    if (response?.stop_reason === "refusal") {
      logError("analysis.geo-skill", "skill run returned refusal stop_reason");
      throw new Error("analysis_refused");
    }

    const text = collectText(response);
    if (!text) throw new Error("empty_skill_response");

    return parseAnalysisResult(JSON.parse(extractJson(text)));
  }
}

/**
 * Resolve the skill_id for the configured skill name via GET /v1/skills.
 * Cached per process. Set GEO_SKILL_ID to skip this lookup entirely.
 */
async function resolveSkillId(apiKey: string): Promise<string> {
  if (process.env.GEO_SKILL_ID) return process.env.GEO_SKILL_ID;
  if (cachedSkillId) return cachedSkillId;

  const wanted = (process.env.GEO_SKILL_NAME || "geo-page-checker").toLowerCase();

  const res = await fetch("https://api.anthropic.com/v1/skills?limit=100", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": "skills-2025-10-02",
    },
  });

  if (!res.ok) {
    throw new Error(`skills list responded ${res.status}`);
  }

  const json = await res.json();
  const items: unknown[] = Array.isArray(json?.data) ? json.data : [];

  const match = items.find((raw) => {
    const s = raw as Record<string, unknown>;
    const candidates = [s.name, s.display_name, s.title, s.slug, s.id]
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.toLowerCase());
    return candidates.includes(wanted);
  }) as Record<string, unknown> | undefined;

  const id = match?.id;
  if (typeof id !== "string") {
    throw new Error(
      `skill "${wanted}" not found in this organization (set GEO_SKILL_ID to override)`,
    );
  }

  logInfo("analysis.geo-skill", `resolved skill "${wanted}" -> ${id}`);
  cachedSkillId = id;
  return id;
}

function collectText(response: { content?: unknown }): string {
  const blocks = Array.isArray(response.content) ? response.content : [];
  return (blocks as Array<{ type?: string; text?: string }>)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

/** Pull the JSON object out of the model's text (tolerates fences / prose). */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return body.slice(start, end + 1);
  return body;
}
