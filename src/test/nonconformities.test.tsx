import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NcDrawer } from "@/components/app/nonconformities/NcDrawer";
import { OpportunitiesPage } from "@/components/app/nonconformities/OpportunitiesPage";
import { QuickDeclare } from "@/components/app/nonconformities/QuickDeclare";
import { queued } from "@/components/app/nonconformities/offline-queue";
import { BackendApiError } from "@/integrations/backend/client";
import type { Nc } from "@/integrations/backend/nonconformities";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const nc = (overrides: Partial<Nc> = {}): Nc => ({
  id: 7, ref: "NC-7", title: "Fuite de gasoil", description: "Fuite près de la cuve nord.", status: "open", severity: "major", report_source: "incident", location: "Cuve nord",
  environmental_impact: true, immediate_action: null, impact_mitigation: null, corrective_decision: null, decision_justification: null, root_cause_method: null,
  is_recurrent: false, deadline: null, escalation_level: 0, effectiveness_verified: null, sme_update_required: false, sme_update_done: false, sme_update_note: null,
  photos: null, five_whys: null, created_at: "2026-10-01", resolution_date: null, ...overrides,
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.clear();
  localStorage.setItem("lq-site", "1");
  mockRequest.mockImplementation(async () => ({ data: [] }));
});

describe("déclaration rapide", () => {
  it("exige la source et une description avant tout envoi", () => {
    wrap(<QuickDeclare />);
    fireEvent.click(screen.getByRole("button", { name: "Déclarer" }));
    expect(screen.getByRole("alert").textContent).toContain("source");
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "incident" } });
    fireEvent.change(screen.getByLabelText(/Que s'est-il passé/), { target: { value: "court" } });
    fireEvent.click(screen.getByRole("button", { name: "Déclarer" }));
    expect(screen.getByRole("alert").textContent).toContain("10 caractères");
  });

  it("conserve la déclaration sur l'appareil quand le réseau est indisponible", async () => {
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
      if (path === "non-conformities/quick-declare" && init?.method === "POST") throw new BackendApiError("Serveur indisponible.");
      return { data: [] };
    });
    wrap(<QuickDeclare />);
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "report" } });
    fireEvent.change(screen.getByLabelText(/Que s'est-il passé/), { target: { value: "Bidons de solvant sans bac de rétention." } });
    fireEvent.click(screen.getByRole("button", { name: "Déclarer" }));

    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(queued()[0]).toMatchObject({ report_source: "report" });
    expect(await screen.findByText(/1 déclaration\(s\) en attente d'envoi/)).toBeTruthy();
  });
});

describe("traitement guidé d'une non-conformité", () => {
  it("n'ouvre l'analyse des causes qu'une fois l'action corrective décidée", () => {
    wrap(<NcDrawer nc={nc()} onClose={() => undefined} />);
    expect(screen.getByText("1. Traitement immédiat")).toBeTruthy();
    expect(screen.queryByText("3. Analyse des causes")).toBeNull();
    expect(screen.getByText(/majeure ou critique ne peut pas être écartée/)).toBeTruthy();
  });

  it("signale les non-conformités similaires pour juger de la récurrence", async () => {
    mockRequest.mockImplementation(async (path?: string) => (path?.endsWith("/similar") ? { data: [{ id: 3, ref: "NC-3", title: "Fuite précédente", status: "closed", date: "2026-06-01" }] } : { data: [] }));
    wrap(<NcDrawer nc={nc({ corrective_decision: "required" })} onClose={() => undefined} />);
    expect(await screen.findByText(/1 non-conformité\(s\) similaire\(s\)/)).toBeTruthy();
    expect(screen.getByText(/NC-3 — Fuite précédente/)).toBeTruthy();
    expect(screen.queryByText("4. Plan correctif")).toBeNull();
  });

  it("affiche l'escalade d'un retard et la mise à jour du système à faire avant clôture", () => {
    wrap(<NcDrawer nc={nc({ corrective_decision: "required", root_cause_method: "five_why", escalation_level: 2, sme_update_required: true, sme_update_note: "Ajouter le contrôle au plan de maintenance." })} onClose={() => undefined} />);
    expect(screen.getByText(/escalade de niveau 2/)).toBeTruthy();
    expect(screen.getByText(/Mise à jour du système à faire/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clôturer" })).toBeTruthy();
  });
});

describe("registre des opportunités", () => {
  it("exige un motif et, pour adopter, un responsable et une échéance", async () => {
    mockRequest.mockImplementation(async (path?: string) => {
      if (path?.startsWith("improvement-suggestions?")) return { data: [{ id: 1, ref: "SUG-1", title: "Mutualiser les collectes", description: "Réduire les trajets.", status: "pending", impact: "medium", source_type: "audit_finding", source_ref: "FND-1", decision_note: null }] };
      if (path === "improvement-suggestions/summary") return { data: { total: 1, by_status: { pending: 1 }, by_source: { audit_finding: 1 }, adopted_done: 0, adopted_open: 0, pending: 1 } };
      return { data: [] };
    });
    wrap(<OpportunitiesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Décider" }));

    const adopt = screen.getByRole("button", { name: "Adopter" }) as HTMLButtonElement;
    const reject = screen.getByRole("button", { name: "Écarter" }) as HTMLButtonElement;
    expect(adopt.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Motif de la décision/), { target: { value: "Peu d'impact pour le coût engagé." } });
    expect(reject.disabled).toBe(false);
    expect(adopt.disabled).toBe(true);
  });
});
