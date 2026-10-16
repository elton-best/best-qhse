import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConformityTab } from "@/components/app/duerp/ConformityTab";
import { previewScore } from "@/components/app/duerp/duerp-config";
import { RiskForm } from "@/components/app/duerp/RiskForm";
import { DuerpPage } from "@/components/app/duerp/DuerpPage";
import type { Scales } from "@/integrations/backend/duerp";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const row = (level: number, label: string) => ({ level, label, score_value: level });
const scales: Scales = {
  gravity: [row(1, "Faible"), row(2, "Moyenne"), row(3, "Grave"), row(4, "Très grave")],
  frequency: [row(1, "Rare"), row(2, "Occasionnelle"), row(3, "Fréquente"), row(4, "Permanente")],
  maitrise: [row(1, "Bonne"), row(2, "Moyenne"), row(3, "Faible ou absente")],
};

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("cotation du risque", () => {
  it("calcule le risque brut puis évalué avec la maîtrise des mesures existantes", () => {
    expect(previewScore(scales, { gravity: 4, frequency: 4, maitrise: 3 })).toMatchObject({ raw: 16, assessed: 48, assessedLevel: "Significatif" });
    expect(previewScore(scales, { gravity: 2, frequency: 2, maitrise: 1 })).toMatchObject({ raw: 4, assessed: 4, assessedLevel: "Faible" });
    expect(previewScore(scales, { gravity: 2, frequency: 2 })).toBeNull();
  });
});

describe("fiche de risque", () => {
  it("affiche l'aperçu de la cotation pendant la saisie", () => {
    wrap(<RiskForm danger={null} units={[]} families={[]} scales={scales} locked={false} busy={false} onSubmit={async () => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Gravité *"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Fréquence d'exposition *"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Maîtrise des mesures existantes *"), { target: { value: "3" } });
    expect(screen.getByText("48")).toBeTruthy();
  });

  it("verrouille l'évaluation d'un document figé mais laisse le suivi de l'action", () => {
    wrap(<RiskForm danger={null} units={[]} families={[]} scales={scales} locked busy={false} onSubmit={async () => undefined} onCancel={() => undefined} />);
    expect(screen.getByLabelText("Gravité *").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Avancement de l'action").matches(":disabled")).toBe(false);
  });
});

describe("conformité INRS", () => {
  it("distingue les points bloquants des simples alertes", async () => {
    mockRequest.mockResolvedValue({
      data: {
        ready: false,
        checks: [
          { code: "dated", label: "Date d'évaluation renseignée (R.4121-1)", ok: true, blocking: true, detail: null },
          { code: "significant_plan", label: "Tout risque significatif a un plan d'actions", ok: false, blocking: true, detail: "2 risque(s) significatif(s) sans plan complet." },
          { code: "consultation", label: "Consultation des travailleurs tracée", ok: false, blocking: false, detail: "Indiquez les personnes consultées." },
        ],
        summary: { dangers: 3, units: 1, by_level: { Faible: 1, Moyen: 0, Significatif: 2 }, residual_by_level: { Faible: 0, Moyen: 0, Significatif: 0 }, actions_overdue: 0, actions_done: 0, families_missing: [] },
      },
    });
    wrap(<ConformityTab duerpId={5} />);
    expect(await screen.findByText("Bloquant")).toBeTruthy();
    expect(screen.getByText("À surveiller")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("points bloquants");
  });
});

describe("création du DUERP", () => {
  it("envoie la date d'évaluation et la prochaine mise à jour à 12 mois", async () => {
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
      if (init?.method === "POST") return { data: { id: 1 } };
      return path?.startsWith("duerp") ? { data: [] } : { data: [] };
    });
    wrap(<DuerpPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Créer le DUERP" }));
    await waitFor(() => expect(mockRequest.mock.calls.some(([path, init]) => path === "duerp" && (init as RequestInit | undefined)?.method === "POST")).toBe(true));
    const call = mockRequest.mock.calls.find(([path, init]) => path === "duerp" && (init as RequestInit | undefined)?.method === "POST")!;
    const body = JSON.parse(String((call[1] as RequestInit).body)) as Record<string, string>;
    expect(body["evaluation_date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body["next_evaluation_date"]! > body["evaluation_date"]!).toBe(true);
    expect(body["site_id"]).toBe("1");
  });
});
