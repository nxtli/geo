/**
 * Postgres-driver — gebruikt dezelfde `pg`-pool en connectiestring-detectie als
 * de GEO-app, dus dezelfde Supabase-database.
 *
 * De INSERT/UPDATE wordt GEGENEREERD uit `flattenProspect()`, niet met de hand
 * uitgeschreven. Een nieuw veld toevoegen betekent daardoor: kolom in het
 * schema + veld in flattenProspect, en de driver volgt automatisch. Zo kan de
 * kolomlijst hier niet uit de pas lopen met het model.
 */

import type { Prospect } from "../types";
import type { RadioStoreDriver } from "./driver";
import { flattenProspect, toProspect } from "./serialize";
import { RADIO_SCHEMA_SQL } from "./schema";
import { query, isDbConfigured } from "../../geo/supabase/db";
import { logInfo } from "../../geo/logger";

/** Kolommen die in Postgres jsonb zijn en dus geserialiseerd moeten worden. */
const JSONB_COLUMNS = new Set([
  "fit_components",
  "knockouts",
  "why_interesting",
  "triggers",
  "sales_angles",
  "evidence",
  "personalization",
]);

/** Kolommen die niet in de UPDATE-tak horen (blijven staan bij een upsert). */
const IMMUTABLE_COLUMNS = new Set(["id", "created_at"]);

export class PostgresStoreDriver implements RadioStoreDriver {
  readonly id = "postgres";
  private ensured: Promise<void> | null = null;

  describe(): string {
    return "Postgres (tabel radio_prospects)";
  }

  static isAvailable(): boolean {
    return isDbConfigured();
  }

  /** Idempotente migratie, één keer per proces. */
  init(): Promise<void> {
    if (!this.ensured) {
      this.ensured = (async () => {
        await query(RADIO_SCHEMA_SQL);
        logInfo("radio.store.postgres", "schema radio_prospects gereed");
      })().catch((error) => {
        // Niet cachen bij een fout: een volgende poging mag het opnieuw proberen.
        this.ensured = null;
        throw error;
      });
    }
    return this.ensured;
  }

  async listAll(): Promise<Prospect[]> {
    await this.init();
    const rows = await query<Record<string, unknown>>(
      `select * from public.radio_prospects
       order by priority_score desc nulls last, created_at desc`,
    );
    return rows.map(toProspect);
  }

  async get(id: string): Promise<Prospect | null> {
    await this.init();
    const rows = await query<Record<string, unknown>>(
      `select * from public.radio_prospects where id = $1`,
      [id],
    );
    return rows[0] ? toProspect(rows[0]) : null;
  }

  async insert(prospect: Prospect): Promise<Prospect> {
    await this.init();
    const existing = await this.get(prospect.id);
    if (existing) throw new Error(`prospect_exists:${prospect.id}`);
    await this.upsert(prospect);
    return prospect;
  }

  async save(prospect: Prospect): Promise<Prospect | null> {
    await this.init();
    const existing = await this.get(prospect.id);
    if (!existing) return null;
    await this.upsert(prospect);
    return prospect;
  }

  async remove(id: string): Promise<boolean> {
    await this.init();
    const rows = await query<{ id: string }>(
      `delete from public.radio_prospects where id = $1 returning id`,
      [id],
    );
    return rows.length > 0;
  }

  /** INSERT … ON CONFLICT (id) DO UPDATE, opgebouwd uit flattenProspect. */
  private async upsert(prospect: Prospect): Promise<void> {
    const flat = flattenProspect(prospect);
    const columns = Object.keys(flat);
    const values = columns.map((column) => {
      const value = flat[column];
      if (JSONB_COLUMNS.has(column)) return JSON.stringify(value ?? null);
      return value ?? null;
    });

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const updates = columns
      .filter((c) => !IMMUTABLE_COLUMNS.has(c))
      .map((c) => `${c} = excluded.${c}`)
      .join(", ");

    await query(
      `insert into public.radio_prospects (${columns.join(", ")})
       values (${placeholders})
       on conflict (id) do update set ${updates}`,
      values,
    );
  }
}
