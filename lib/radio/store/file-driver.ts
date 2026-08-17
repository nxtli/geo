/**
 * JSON-bestand-driver — de default, zodat de tool direct na `npm install` werkt
 * zonder database of configuratie.
 *
 * Twee dingen die een naïeve implementatie fout doet, en hier wél goed gaan:
 *
 *  1. SCHRIJVEN IS GESERIALISEERD. Alle writes lopen door één promise-keten, dus
 *     twee gelijktijdige requests kunnen elkaars wijziging niet overschrijven
 *     (read-modify-write race).
 *  2. SCHRIJVEN IS ATOMISCH. Er wordt naar een tijdelijk bestand geschreven en
 *     daarna gerenamed, zodat een crash halverwege geen half JSON-bestand
 *     achterlaat — dat zou de hele prospectlijst onleesbaar maken.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Prospect, RunRecord } from "../types";
import type { RadioStoreDriver } from "./driver";
import { toProspect, toRunRecord } from "./serialize";
import { logError, logInfo } from "../../geo/logger";

const DEFAULT_PATH = ".data/radio-prospects.json";

/**
 * Hoeveel runs we bewaren. Een run is een paar honderd bytes; met deze grens
 * blijft de historie ruim een jaar bruikbaar zonder dat het bestand onbeperkt
 * groeit.
 */
const MAX_RUNS = 250;

interface FileShape {
  version: 1;
  prospects: Record<string, unknown>[];
  runs: Record<string, unknown>[];
}

export class FileStoreDriver implements RadioStoreDriver {
  readonly id = "file";
  private readonly path: string;
  /** Schrijfketen: elke write wacht op de vorige. */
  private queue: Promise<unknown> = Promise.resolve();
  /** init() draait één keer per instantie, ook bij gelijktijdige aanroepen. */
  private ensured: Promise<void> | null = null;
  /** Teller voor unieke tijdelijke bestandsnamen. */
  private writeSeq = 0;

  constructor(path?: string) {
    this.path = resolve(process.cwd(), path || process.env.RADIO_DATA_FILE || DEFAULT_PATH);
  }

  describe(): string {
    return `JSON-bestand (${this.path})`;
  }

  /**
   * Gecached: elke operatie roept init() aan, maar het aanmaken van het bestand
   * mag maar één keer gebeuren. Zonder deze cache racen gelijktijdige requests
   * met elkaar op het lege startbestand.
   */
  init(): Promise<void> {
    if (!this.ensured) {
      this.ensured = (async () => {
        await mkdir(dirname(this.path), { recursive: true });
        try {
          await readFile(this.path, "utf8");
        } catch {
          // Via de schrijfketen, zodat dit niet met een mutatie kan kruisen.
          await this.mutate(async () => true);
          logInfo("radio.store.file", `nieuwe prospect-store aangemaakt: ${this.path}`);
        }
      })().catch((error) => {
        this.ensured = null; // volgende poging mag opnieuw
        throw error;
      });
    }
    return this.ensured;
  }

  async listAll(): Promise<Prospect[]> {
    const data = await this.readFile();
    return data.prospects.map(toProspect);
  }

  async get(id: string): Promise<Prospect | null> {
    const all = await this.listAll();
    return all.find((p) => p.id === id) ?? null;
  }

  insert(prospect: Prospect): Promise<Prospect> {
    return this.mutate(async (data) => {
      if (data.prospects.some((row) => String(row.id) === prospect.id)) {
        throw new Error(`prospect_exists:${prospect.id}`);
      }
      data.prospects.push(prospect as unknown as Record<string, unknown>);
      return prospect;
    });
  }

  save(prospect: Prospect): Promise<Prospect | null> {
    return this.mutate(async (data) => {
      const index = data.prospects.findIndex((row) => String(row.id) === prospect.id);
      if (index < 0) return null;
      data.prospects[index] = prospect as unknown as Record<string, unknown>;
      return prospect;
    });
  }

  remove(id: string): Promise<boolean> {
    return this.mutate(async (data) => {
      const before = data.prospects.length;
      data.prospects = data.prospects.filter((row) => String(row.id) !== id);
      return data.prospects.length < before;
    });
  }

  async appendRun(run: RunRecord): Promise<void> {
    await this.mutate(async (data) => {
      data.runs.push(run as unknown as Record<string, unknown>);
      // Oudste eruit als de historie vol is; nieuwste staan achteraan.
      if (data.runs.length > MAX_RUNS) data.runs = data.runs.slice(-MAX_RUNS);
      return true;
    });
  }

  async listRuns(limit = 50): Promise<RunRecord[]> {
    const data = await this.readFile();
    return data.runs
      .map(toRunRecord)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, Math.max(1, limit));
  }

  /**
   * Lees-wijzig-schrijf onder de schrijfketen. De callback krijgt de VERSE
   * inhoud en mag die muteren; daarna wordt er atomisch weggeschreven.
   * Bij `undefined` als resultaat wordt er niet geschreven.
   */
  private mutate<T>(fn: (data: FileShape) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.readFile();
      const result = await fn(data);
      // Niets gewijzigd (bijv. onbekend id) → geen schrijfactie nodig.
      if (result === null || result === false) return result;
      await this.writeFile(data);
      return result;
    });
    // Houd de keten intact, ook als deze write faalt.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readFile(): Promise<FileShape> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as FileShape).prospects)
      ) {
        const shape = parsed as FileShape;
        return {
          version: 1,
          prospects: shape.prospects,
          // `runs` kwam er later bij: een bestand van vóór de run-historie mag
          // niet zijn prospects verliezen omdat de sleutel ontbreekt.
          runs: Array.isArray(shape.runs) ? shape.runs : [],
        };
      }
      return { version: 1, prospects: [], runs: [] };
    } catch (error) {
      // Ontbrekend bestand is normaal (eerste run). Kapotte JSON is dat niet:
      // log het, maar geef een lege store terug zodat de app blijft werken.
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT") logError("radio.store.file", error);
      return { version: 1, prospects: [], runs: [] };
    }
  }

  private async writeFile(data: FileShape): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    // Unieke tijdelijke naam per write: twee writes mogen elkaars temp-bestand
    // nooit wegrenamen (dat gaf een ENOENT bij gelijktijdig gebruik).
    const tmp = `${this.path}.${process.pid}.${++this.writeSeq}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.path);
  }
}
