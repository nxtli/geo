/**
 * De storage-driver-interface.
 *
 * Bewust PRIMITIEF gehouden: lezen, schrijven, verwijderen. Filteren, sorteren
 * en statistieken gebeuren in pure functies (lib/radio/filters.ts) bovenop de
 * volledige lijst. Dat scheelt een tweede implementatie van alle filterlogica
 * in SQL en houdt die logica testbaar zonder database.
 *
 * Die keuze past bij de schaal van deze tool (honderden tot enkele duizenden
 * prospects). Groeit dat richting tienduizenden, dan is de plek om te
 * optimaliseren `listAll()` in de Postgres-driver: geef daar een WHERE/ORDER BY
 * mee en laat de filterfuncties de rest doen.
 */

import type { Prospect, RunRecord } from "../types";

export interface RadioStoreDriver {
  /** Stabiele identifier: "file" of "postgres". */
  readonly id: string;
  /** Menselijke uitleg voor de UI ("JSON-bestand .data/…"). */
  describe(): string;
  /** Zorg dat de opslag klaar is voor gebruik (tabel/bestand). */
  init(): Promise<void>;
  listAll(): Promise<Prospect[]>;
  get(id: string): Promise<Prospect | null>;
  /** Voeg toe. Gooit als het id al bestaat. */
  insert(prospect: Prospect): Promise<Prospect>;
  /** Overschrijf een bestaande prospect volledig. Null als het id onbekend is. */
  save(prospect: Prospect): Promise<Prospect | null>;
  remove(id: string): Promise<boolean>;

  /**
   * Leg een afgeronde zoek- of researchronde vast. Append-only: een run wordt
   * nooit bijgewerkt, zodat de historie een verslag blijft en geen momentopname.
   */
  appendRun(run: RunRecord): Promise<void>;
  /** De laatste runs, nieuwste eerst. */
  listRuns(limit?: number): Promise<RunRecord[]>;
}
