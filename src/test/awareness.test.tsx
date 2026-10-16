import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AwarenessCampaignsPage } from "@/components/app/awareness";
import { CampaignPlayer } from "@/components/app/awareness/CampaignPlayer";
import { PublicAwarenessPage } from "@/components/app/awareness/PublicAwarenessPage";
import { BackendApiError } from "@/integrations/backend/client";
import type { Content } from "@/integrations/backend/awareness";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const content = (overrides: Partial<Content> = {}): Content => ({
  campaign: { id: 1, ref: "CSN-1", title: "Sensibilisation 2026", objective: null, status: "active", end_date: null },
  aspects: [{ id: 1, aspect_number: "A1", aspect: "Émission de COV", impact: "Pollution de l'air" }],
  materials: [
    { id: 10, topic: "policy", type: "sheet", title: "Notre politique", body: "Nous nous engageons.", url: null, pass_mark: 70, questions: [], done: false },
    { id: 11, topic: "consequences", type: "quiz", title: "Quiz", body: null, url: null, pass_mark: 70, questions: [{ question: "Quel bac ?", options: ["Vert", "Jaune"] }], done: false },
  ],
  completed_at: null, attestation_number: null, ...overrides,
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("parcours du participant", () => {
  it("enregistre l'accusé de lecture et affiche les aspects liés au travail", async () => {
    const onRead = vi.fn().mockResolvedValue(undefined);
    render(<CampaignPlayer content={content()} onRead={onRead} onQuiz={vi.fn()} onAttestation={vi.fn()} />);

    expect(screen.getByText(/Émission de COV/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("0 support(s) validé(s) sur 2");
    fireEvent.click(screen.getByRole("button", { name: "J'ai lu et compris" }));
    await waitFor(() => expect(onRead).toHaveBeenCalledWith(10));
  });

  it("n'active le quiz que lorsque toutes les questions ont une réponse, et signale un score insuffisant", async () => {
    const onQuiz = vi.fn().mockResolvedValue({ score: 0, passed: false, correct: 0, total: 1, completed: false, attestation_number: null });
    render(<CampaignPlayer content={content()} onRead={vi.fn()} onQuiz={onQuiz} onAttestation={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "Valider mes réponses" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Jaune"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onQuiz).toHaveBeenCalledWith(11, [1]));
    expect((await screen.findByRole("alert")).textContent).toContain("70 % sont nécessaires");
  });

  it("propose l'attestation une fois la campagne terminée", () => {
    const done = content({ completed_at: "2026-10-16T10:00:00Z", attestation_number: "ATT-2026-000005", materials: content().materials.map((m) => ({ ...m, done: true })) });
    render(<CampaignPlayer content={done} onRead={vi.fn()} onQuiz={vi.fn()} onAttestation={vi.fn()} />);
    expect(screen.getByText(/ATT-2026-000005/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Télécharger l'attestation/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "J'ai lu et compris" })).toBeNull();
  });
});

describe("page publique d'une personne extérieure", () => {
  it("charge la campagne par le lien personnel et affiche une erreur claire si le lien est invalide", async () => {
    mockRequest.mockResolvedValueOnce({ data: { ...content(), participant: { name: "Koffi", organization: "ABC" } } });
    const { unmount } = wrap(<PublicAwarenessPage token="tok" />);
    expect(await screen.findByText("Koffi — ABC")).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledWith("public/awareness/tok");
    unmount();

    mockRequest.mockRejectedValueOnce(new BackendApiError("Ressource introuvable.", 404));
    wrap(<PublicAwarenessPage token="mauvais" />);
    expect((await screen.findByRole("alert")).textContent).toContain("introuvable");
  });
});

describe("page des campagnes", () => {
  it("masque la gestion à un salarié sans droit et ne garde que ses sensibilisations", async () => {
    mockRequest.mockImplementation(async (path?: string) => {
      if (path?.startsWith("awareness-campaigns")) throw new BackendApiError("Accès refusé.", 403);
      return { data: [] };
    });
    wrap(<AwarenessCampaignsPage />);
    expect(await screen.findByText(/Aucune sensibilisation ne vous est adressée/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Campagnes" })).toBeNull());
    expect(screen.getByRole("tab", { name: "Mes sensibilisations" })).toBeTruthy();
  });

  it("signe la causerie quand la page est ouverte depuis le QR code", async () => {
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
      if (path === "awareness-talks/sign" && init?.method === "POST") return { data: { talk: "Tri des déchets", already_signed: false } };
      return { data: [] };
    });
    wrap(<AwarenessCampaignsPage signingToken="abc123" />);
    await waitFor(() => expect(mockRequest.mock.calls.some(([path]) => path === "awareness-talks/sign")).toBe(true));
    const call = mockRequest.mock.calls.find(([path]) => path === "awareness-talks/sign")!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ token: "abc123" });
  });
});
