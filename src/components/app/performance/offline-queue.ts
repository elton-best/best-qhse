import type { ReadingInput } from "@/integrations/backend/performance";

/**
 * File d'attente des relevés saisis sans connexion (M14-03). Chaque relevé garde un identifiant client unique :
 * le serveur ignore un relevé déjà reçu, la synchronisation peut donc être relancée sans risque de doublon.
 */
const KEY = "lq-readings-queue";

export type QueuedReading = ReadingInput & { client_uuid: string; queued_at: string; rejected?: string };

const read = (): QueuedReading[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedReading[]) : [];
  } catch {
    return [];
  }
};

const write = (items: QueuedReading[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* stockage indisponible : la file reste en mémoire de la session uniquement */
  }
};

export const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const queued = (): QueuedReading[] => read();

export function enqueue(input: ReadingInput): QueuedReading {
  const item: QueuedReading = { ...input, client_uuid: input.client_uuid ?? newClientId(), queued_at: new Date().toISOString() };
  write([...read().filter((existing) => existing.client_uuid !== item.client_uuid), item]);
  return item;
}

export function resolveQueued(results: { client_uuid: string; status: "created" | "exists" | "rejected"; message?: string }[]): void {
  const byId = new Map(results.map((result) => [result.client_uuid, result]));
  write(read().flatMap((item) => {
    const result = byId.get(item.client_uuid);
    if (!result || result.status !== "rejected") return result ? [] : [item];
    return [{ ...item, rejected: result.message ?? "Relevé refusé." }];
  }));
}

export function discard(clientUuid: string): void {
  write(read().filter((item) => item.client_uuid !== clientUuid));
}
