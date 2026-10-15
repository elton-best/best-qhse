import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AesForm } from "@/components/app/aes/AesForm";
import { DEFAULT_SETTINGS, previewSignificance, suggestSensitivity } from "@/components/app/aes/aes-config";

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

const noCriteria = { legal: false, stakeholder: false };

describe("cotation des aspects (aperçu, le serveur fait foi)", () => {
  it("n'est pas significatif à 343 (343 < AES) et l'est au-dessus", () => {
    expect(previewSignificance({ gravity: 7, frequency: 7, sensitivity: 7, mastery: 1 }, noCriteria, DEFAULT_SETTINGS)).toMatchObject({
      criticality: 343,
      significant: false,
    });
    expect(previewSignificance({ gravity: 7, frequency: 7, sensitivity: 7, mastery: 5 }, noCriteria, DEFAULT_SETTINGS)).toMatchObject({
      criticality: 1715,
      significant: true,
      basis: "environmental",
    });
  });

  it("un critère additionnel relève un aspect mais seulement s'il est activé", () => {
    const low = { gravity: 1, frequency: 1, sensitivity: 1, mastery: 1 };
    expect(previewSignificance(low, { legal: true, stakeholder: false }, DEFAULT_SETTINGS)).toMatchObject({ significant: true, basis: "additional" });
    expect(
      previewSignificance(low, { legal: true, stakeholder: true }, { ...DEFAULT_SETTINGS, use_legal_criterion: false, use_stakeholder_criterion: false }),
    ).toMatchObject({ significant: false, basis: null });
  });

  it("suggère la sensibilité d'après le nombre de milieux sensibles (canevas)", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(suggestSensitivity)).toEqual([1, 1, 3, 3, 5, 7, 7]);
  });
});

describe("formulaire d'aspect", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ data: [] });
  });

  function renderForm(onSubmit = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AesForm aspect={null} siteId="1" settings={DEFAULT_SETTINGS} busy={false} error={null} onSubmit={onSubmit} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    return onSubmit;
  }

  it("calcule la significativité en direct à partir de G, F, S et M", () => {
    renderForm();
    expect(screen.getByText(/Renseignez G, F, S et M/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Gravité"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Fréquence / probabilité"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Sensibilité du milieu"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Maîtrise"), { target: { value: "5" } });

    expect(screen.getByText(/Cr = 525/)).toBeTruthy();
    expect(screen.getByText(/aspect significatif \(impact environnemental\)/)).toBeTruthy();
  });

  it("propose le niveau de sensibilité d'après les milieux cochés", () => {
    renderForm();
    ["Sol et sous-sol", "Eaux", "Air", "Milieu humain"].forEach((name) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) })));
    fireEvent.click(screen.getByRole("button", { name: /Appliquer S = 5/ }));
    expect((screen.getByLabelText("Sensibilité du milieu") as HTMLSelectElement).value).toBe("5");
  });

  it("refuse un envoi sans activité, aspect et impact, ou avec une cotation incomplète", () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByText(/obligatoires/)).toBeTruthy();

    const [activity, aspect] = screen.getAllByRole("textbox");
    fireEvent.change(activity!, { target: { value: "Éclairage" } });
    fireEvent.change(aspect!, { target: { value: "Consommation d'électricité" } });
    fireEvent.change(screen.getByLabelText("Gravité"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("n'envoie jamais le score ni la significativité calculés côté navigateur", () => {
    const onSubmit = renderForm();
    const texts = screen.getAllByRole("textbox");
    fireEvent.change(texts[0]!, { target: { value: "Éclairage" } });
    fireEvent.change(texts[1]!, { target: { value: "Électricité" } });
    fireEvent.change(texts.find((el) => (el as HTMLInputElement).value === "" && el.closest("div")?.textContent?.includes("Impact environnemental"))!, {
      target: { value: "Réchauffement" },
    });
    fireEvent.change(screen.getByLabelText("Gravité"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Fréquence / probabilité"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Sensibilité du milieu"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Maîtrise"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const sent = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toMatchObject({ gravity: 5, frequency: 7, sensitivity: 3, mastery: 5, site_id: "1", impact: "Réchauffement" });
    expect(sent).not.toHaveProperty("criticality_score");
    expect(sent).not.toHaveProperty("is_significant");
    expect(sent).not.toHaveProperty("significance_threshold");
    expect(sent).not.toHaveProperty("enterprise_id");
  });
});
