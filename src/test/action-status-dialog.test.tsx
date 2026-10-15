import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionDetailDialog } from "@/components/app/planning/ActionsPage";
import type { PlanActionItem } from "@/integrations/backend/planningActions";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: {
      ...mod.backendApi,
      request: (...args: unknown[]) =>
        (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args),
    },
  };
});

function makeItem(overrides: Partial<PlanActionItem> = {}): PlanActionItem {
  return {
    id: 1,
    reference: "ACT-2026-001",
    title: "Action de test",
    description: "Description assez longue pour passer la validation.",
    status: "in_progress",
    rawStatus: "in_progress",
    type: "corrective",
    priority: "high",
    progress: 30,
    due_date: "2026-12-31",
    site_id: 1,
    site_name: "Site test",
    process_id: 1,
    process_title: "Processus test",
    process_code: "PRC-1",
    responsible_id: 2,
    responsible_name: "Responsable Test",
    responsible_email: "resp@test.local",
    source_type: null,
    source_id: null,
    source_ref: null,
    source_label: null,
    estimated_cost: null,
    actual_cost: null,
    required_resources: null,
    effectiveness_criteria: null,
    effectiveness_verified: false,
    completion_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    progress_notes: [],
    workflow_label: null,
    ...overrides,
  };
}

function renderDialog(item: PlanActionItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <ActionDetailDialog
        item={item}
        onClose={onClose}
        onEdit={vi.fn()}
        onProgress={vi.fn()}
        onDelete={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, client };
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe("ActionDetailDialog — changement de statut", () => {
  it("ouvre l'invite de commentaire, la garde ouverte pendant la saisie, puis envoie le statut", async () => {
    mockRequest.mockImplementation(async () => ({ ok: true }));
    renderDialog(makeItem());

    fireEvent.change(screen.getByLabelText("Nouveau statut"), {
      target: { value: "completed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));

    // L'invite doit apparaître (le titre existe aussi comme en-tête de section : on cible le dialogue)…
    const box0 = await screen.findByPlaceholderText("Motif du changement…");
    expect(box0).toBeInTheDocument();

    // …et rester ouverte pendant la saisie du commentaire.
    const box = screen.getByPlaceholderText("Motif du changement…");
    fireEvent.change(box, { target: { value: "Cause traitée, à vérifier" } });
    expect(screen.getByPlaceholderText("Motif du changement…")).toBeInTheDocument();
    expect(box).toHaveValue("Cause traitée, à vérifier");

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const [path, init] = mockRequest.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("actions/1/status");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      status: "completed",
      comments: "Cause traitée, à vérifier",
    });
  });

  it("garde l'invite ouverte quand l'item parent est remplacé (refetch après invalidation)", async () => {
    mockRequest.mockImplementation(async () => ({ ok: true }));
    const { rerender } = renderDialog(makeItem());

    fireEvent.change(screen.getByLabelText("Nouveau statut"), {
      target: { value: "completed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    await screen.findByPlaceholderText("Motif du changement…");

    // Simule le refetch : nouvel objet item, même dialogue (pas de `key`).
    const refreshed = makeItem({ updated_at: "2026-02-01T00:00:00Z" });
    expect(refreshed).not.toBe(makeItem());
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ActionDetailDialog
          item={refreshed}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onProgress={vi.fn()}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByPlaceholderText("Motif du changement…")).toBeInTheDocument();
  });
});
