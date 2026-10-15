import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ComplianceRegisterPage } from "@/components/app/compliance/ComplianceRegisterPage";
import { EvaluationDialog } from "@/components/app/compliance/EvaluationDialog";
import type { Obligation } from "@/integrations/backend/compliance";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: {
      ...mod.backendApi,
      request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args),
    },
  };
});

function obligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 5, ref: "OBL-2026-0005", title: "Gestion des déchets", source_type: "decree", authority: null, source_url: null, site_id: 1,
    aspect: { id: 2, site_id: 1, name: "Déchets", norms: [] }, regulatory_reference: "Décret n° 2024-123", description: null,
    applicable_requirement: null, watch_source: null, entry_into_force_date: null, regulatory_change_status: "existing", validity_status: "in_force",
    compliance_status: "not_evaluated", is_applicable: null, applicability_justification: null, permit_number: null, expiry_date: null,
    last_evaluation_date: null, next_evaluation_date: null, evaluation_frequency: "annual", responsible_id: null, responsible_name: null,
    analysis_status: "analyzed", analysis_note: null, agreement_parent_id: null, comments: null, environmental_aspects: [], actions: [],
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("évaluation de conformité", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: {} });
  });

  it("exige une preuve pour déclarer une obligation conforme", () => {
    wrap(<EvaluationDialog obligation={obligation({ is_applicable: true })} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'évaluation" }));
    expect(screen.getByRole("alert").textContent).toContain("preuve");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("exige l'organisme pour une évaluation externe", () => {
    wrap(<EvaluationDialog obligation={obligation({ is_applicable: true })} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Document, enregistrement/), { target: { value: "Rapport" } });
    fireEvent.click(screen.getByLabelText(/partie externe/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'évaluation" }));
    expect(screen.getByRole("alert").textContent).toContain("organisme externe");
  });

  it("propose de consigner un écart déjà traité et l'envoie au serveur", async () => {
    const onDone = vi.fn();
    wrap(<EvaluationDialog obligation={obligation({ is_applicable: true })} onClose={vi.fn()} onDone={onDone} />);
    fireEvent.change(screen.getByDisplayValue("Conforme"), { target: { value: "non_compliant" } });
    fireEvent.click(screen.getByLabelText(/déjà corrigé/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'évaluation" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const call = mockRequest.mock.calls.find((entry) => entry[0] === "compliance-obligations/5/evaluations")!;
    const body = (call[1] as RequestInit).body as FormData;
    expect(body.get("result")).toBe("non_compliant");
    expect(body.get("gap_already_treated")).toBe("1");
    expect(onDone.mock.calls[0]![0]).toContain("écart traité");
  });
});

describe("registre des obligations", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    localStorage.setItem("lq-site", "1");
    mockRequest.mockImplementation(async (path: string) => {
      if (path.startsWith("compliance-obligations?") || path === "compliance-obligations") return { data: [obligation(), obligation({ id: 6, ref: "OBL-2026-0006", title: "Permis de rejet", is_applicable: true, compliance_status: "compliant", source_type: "permit" })] };
      if (path.startsWith("compliance-obligations/5/evaluations")) return { data: [] };
      if (path.startsWith("compliance-obligations/5/applicability")) return { success: true };
      return { data: [] };
    });
  });

  it("signale les obligations à qualifier et enregistre l'applicabilité avec justification", async () => {
    wrap(<ComplianceRegisterPage />);
    expect(await screen.findByText("Gestion des déchets")).toBeTruthy();
    expect(screen.getByText("À qualifier")).toBeTruthy();
    expect(screen.getAllByText("Permis / autorisation").length).toBeGreaterThan(1);

    fireEvent.click(screen.getByText("Gestion des déchets"));
    fireEvent.click(await screen.findByRole("button", { name: "Déterminer l'applicabilité" }));

    const save = await screen.findByRole("button", { name: "Enregistrer la décision" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Pourquoi cette obligation s'applique/), { target: { value: "Nous produisons des déchets dangereux." } });
    fireEvent.click(save);

    await waitFor(() => {
      const call = mockRequest.mock.calls.find((entry) => entry[0] === "compliance-obligations/5/applicability");
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ is_applicable: true, justification: "Nous produisons des déchets dangereux." });
    });
  });
});
