import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeDetail } from "@/components/app/changes/ChangeDetail";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const base = {
  id: 5, ref: "CHG-2026-001", title: "Nouvelle ligne de peinture", site_id: 1, change_type: "new_process", origin: "internal", duration: "permanent",
  is_planned: true, description: null, planned_start_date: null, planned_end_date: null, responsible_id: null, impact_analysis: null,
  affected_aspect_ids: null, resources_requested: null, resources_decision: null, resources_decision_note: null, unplanned_consequences: null,
  mitigation_measures: null, decision_note: null, decided_at: null, review_result: null, review_note: null, tasks: [],
};

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function serve(change: Record<string, unknown>) {
  mockRequest.mockImplementation(async (path?: string) => (path?.startsWith("management-changes/") ? change : { data: [] }));
}

beforeEach(() => mockRequest.mockReset());

describe("fiche de changement", () => {
  it("présente les sept dimensions de l'analyse d'impact avant approbation", async () => {
    serve({ ...base, status: "requested" });
    wrap(<ChangeDetail id={5} siteId="1" onClose={() => undefined} />);

    expect(await screen.findByText(/Analyse d'impact \(obligatoire/)).toBeTruthy();
    for (const label of ["Aspects environnementaux", "Obligations de conformité", "Risques et opportunités", "Compétences", "Informations documentées", "Situations d'urgence", "Fournisseurs et prestataires"]) {
      expect(screen.getByText(`${label} concerné(es)`)).toBeTruthy();
    }
  });

  it("n'affiche la décision que lorsque le changement attend l'approbation, et exige le motif d'un refus côté serveur", async () => {
    serve({ ...base, status: "awaiting_approval", impact_analysis: { aspects: { impacted: true, note: "Nouvelles émissions de COV" } } });
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new Error("Le motif du refus est obligatoire.");
      return path?.startsWith("management-changes/") ? { ...base, status: "awaiting_approval", impact_analysis: { aspects: { impacted: true, note: "Nouvelles émissions de COV" } } } : { data: [] };
    });
    wrap(<ChangeDetail id={5} siteId="1" onClose={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("motif du refus"));
    expect(screen.queryByText(/Analyse d'impact \(obligatoire/)).toBeNull();
  });

  it("propose la revue seulement une fois toutes les tâches terminées", async () => {
    serve({ ...base, status: "implemented" });
    wrap(<ChangeDetail id={5} siteId="1" onClose={() => undefined} />);
    expect(await screen.findByText("Revue après mise en œuvre")).toBeTruthy();

  });
});
