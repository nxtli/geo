/**
 * Alle AI-modellen van de scan op één plek.
 *
 * Elke lijst staat op volgorde: eerst het nieuwste model, daarna het vorige als
 * terugval. Geeft de leverancier een fout op het eerste model (uitgezet,
 * hernoemd, andere parameters), dan probeert de scan het volgende. Zo blijft
 * de scan werken en laten de logs zien welk model vervangen moet worden.
 *
 * Gecontroleerd op 12 november 2026 in de documentatie van de leveranciers.
 * Loop deze lijst elk kwartaal na: modelnamen verouderen snel.
 */

/** Analyse en rapport. */
export const ANALYSIS_MODELS = ["claude-sonnet-5-5", "claude-sonnet-4-6"];

/** Charlie in de chat. */
export const CHAT_MODELS = ["claude-haiku-5-5", "claude-haiku-4-5"];

/** "Wat AI over je zegt". */
export const PROBE_MODELS = {
  openai: ["gpt-6.1-terra", "gpt-6-luna", "gpt-4o-mini"],
  gemini: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"],
  /** Perplexity kent sinds de Agent API geen modelnaam meer maar een "effort". */
  perplexity: ["fast", "sonar"],
  grok: ["grok-4.7", "grok-4.3"],
};

/**
 * De volgorde waarin de scan modellen probeert. Een waarde in de
 * omgevingsvariabele gaat voor; de standaardlijst blijft de terugval.
 */
export function candidates(envName: string, defaults: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env[envName]?.trim();
  return [...new Set([...(override ? [override] : []), ...defaults])];
}
