import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewDrawer } from "@/components/app/review/ReviewDrawer";
import { ReviewPage } from "@/components/app/review/ReviewPage";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const outputTypes = {
  improvement: "Opportunités d'amélioration continue", system_changes_resources: "Changements du système et ressources",
  objectives_not_met: "Actions si objectifs non atteints", integration: "Intégration aux autres processus", strategic: "Implications stratégiques",
};
const workspace = (overrides: Record<string, unknown> = {}) => ({
  review: { id: 4, ref: "MR-1", title: "Revue 2026", status: "planned", actual_date: null },
  dossier: null, sessions: [], conclusions: null, decisions: [], output_types: outputTypes, record: null,
  readiness: ["Générez le dossier d'entrée (9.3.2).", "Enregistrez au moins une réunion."], ...overrides,
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function serve(ws: unknown) {
  mockRequest.mockImplementation(async (path?: string) => {
    if (path === "management-reviews/4/workspace") return { data: ws };
    if (path?.startsWith("management-reviews/schedule")) return { data: { interval_months: 12, state: "overdue", next_due: "2026-01-10", last: null, planned: [] } };
    if (path?.startsWith("users")) return { data: [{ id: 9, name: "Awa Koffi" }] };
    return { data: [] };
  });
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("revue de direction", () => {
  it("signale une revue en retard", async () => {
    serve(workspace());
    wrap(<ReviewPage />);
    expect((await screen.findByRole("status")).textContent).toContain("en retard");
  });

  it("bloque la signature tant qu'il reste des points à traiter et les liste", async () => {
    serve(workspace());
    wrap(<ReviewDrawer id={4} onClose={() => undefined} />);
    expect(await screen.findByText("Enregistrez au moins une réunion.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Signer et archiver la revue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("autorise la signature quand tout est traité", async () => {
    serve(workspace({ readiness: [] }));
    wrap(<ReviewDrawer id={4} onClose={() => undefined} />);
    const button = (await screen.findByRole("button", { name: "Signer et archiver la revue" })) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("exige responsable et échéance pour une décision, sauf si la sortie est déclarée sans objet", async () => {
    serve(workspace());
    wrap(<ReviewDrawer id={4} onClose={() => undefined} />);
    fireEvent.change(await screen.findByLabelText(/Décision ou motif/), { target: { value: "Former les chefs d'atelier au tri." } });
    const save = screen.getByRole("button", { name: "Enregistrer la décision" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Sans objet cette année/));
    expect(save.disabled).toBe(false);
    expect(screen.queryByLabelText(/Responsable/)).toBeNull();
  });

  it("affiche une revue signée en lecture seule avec son empreinte", async () => {
    serve(workspace({ readiness: [], record: { signed_at: "2026-10-16T10:00:00Z", signed_by: "Direction", sha256: "ab".repeat(32), intact: true }, decisions: [] }));
    wrap(<ReviewDrawer id={4} onClose={() => undefined} />);
    expect(await screen.findByText(/Intégrité vérifiée/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer la décision" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Signer et archiver la revue" })).toBeNull();
  });
});
