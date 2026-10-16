import type { Declaration } from "@/integrations/backend/nonconformities";

/** File d'attente des déclarations saisies sans connexion ; le serveur ignore une déclaration déjà reçue (identifiant client unique). */
const KEY = "lq-nc-queue";

export type QueuedDeclaration = Declaration & { client_uuid: string; queued_at: string; rejected?: string };

const read = (): QueuedDeclaration[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedDeclaration[]) : [];
  } catch {
    return [];
  }
};
const write = (items: QueuedDeclaration[]): void => {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* stockage indisponible */ }
};

export const newId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const queued = (): QueuedDeclaration[] => read();

export function enqueue(input: Declaration): QueuedDeclaration {
  const item: QueuedDeclaration = { ...input, client_uuid: input.client_uuid ?? newId(), queued_at: new Date().toISOString() };
  write([...read().filter((i) => i.client_uuid !== item.client_uuid), item]);
  return item;
}

export function resolve(results: { client_uuid: string; status: string; message?: string }[]): void {
  const byId = new Map(results.map((r) => [r.client_uuid, r]));
  write(read().flatMap((item) => {
    const result = byId.get(item.client_uuid);
    if (!result) return [item];
    return result.status === "rejected" ? [{ ...item, rejected: result.message ?? "Déclaration refusée." }] : [];
  }));
}

export const discard = (clientUuid: string): void => write(read().filter((i) => i.client_uuid !== clientUuid));
