import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReadinessPage } from "@/components/app/guide/ReadinessPage";
import { SetupGuidePage } from "@/components/app/guide/SetupGuidePage";

const mockRequest = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params, className }: { children: React.ReactNode; params?: { section?: string }; className?: string }) => <a href={`/app/${params?.section ?? ""}`} className={className}>{children}</a>,
}));

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const step = (key: string, overrides: Record<string, unknown> = {}) => ({
  key, title: `Étape ${key}`, why: "Pourquoi", slug: key, state: "todo", count: 0, can_apply: true, applied_sector: null, ...overrides,
});

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("démarrage guidé", () => {
  const guide = { site: { id: 1, name: "Siège" }, done: 1, total: 3, sectors: [{ key: "industrie", label: "Industrie et fabrication" }], steps: [step("organisation", { state: "done", can_apply: false }), step("policy"), step("aspects", { state: "skipped" })] };

  it("n'autorise le préremplissage qu'une fois le secteur choisi, puis l'applique", async () => {
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => (init?.method === "POST" ? { data: { created: 1 } } : { data: guide }));
    wrap(<SetupGuidePage />);

    expect((await screen.findByRole("status")).textContent).toContain("1 étape(s) sur 3");
    const apply = screen.getAllByRole("button", { name: "Préremplir avec un exemple" })[0] as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Votre secteur/), { target: { value: "industrie" } });
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await waitFor(() => expect(mockRequest.mock.calls.some(([path, init]) => String(path).startsWith("setup-guide/policy/apply") && (init as RequestInit | undefined)?.method === "POST")).toBe(true));
  });

  it("permet de reprendre une étape reportée et ne propose pas de reporter une étape faite", async () => {
    mockRequest.mockResolvedValue({ data: guide });
    wrap(<SetupGuidePage />);
    expect(await screen.findByRole("button", { name: "Reprendre cette étape" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Plus tard" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Consulter" })).toBeTruthy();
  });
});

describe("préparation à la certification", () => {
  it("affiche le score, les articles et les manques avec le lien pour les corriger", async () => {
    mockRequest.mockResolvedValue({ data: {
      site: { id: 1, name: "Siège" }, score: 42.5, counts: { compliant: 1, to_complete: 1, missing: 1 },
      clauses: [
        { clause: "4.2", title: "Parties intéressées", status: "compliant", checks: [{ label: "Parties intéressées identifiées", state: "ok", detail: "5 sur 5", fix: "parties-interessees" }] },
        { clause: "9.3", title: "Revue de direction", status: "missing", checks: [{ label: "Revue signée dans les 12 derniers mois", state: "missing", detail: "Aucune revue de direction.", fix: "revue-direction" }] },
      ],
      gaps: [{ clause: "9.3", title: "Revue de direction", label: "Revue signée dans les 12 derniers mois", state: "missing", detail: "Aucune revue de direction.", fix: "revue-direction" }],
    } });
    wrap(<ReadinessPage />);

    expect((await screen.findByRole("status", { name: "Score de préparation" })).textContent).toContain("43 %");
    const fix = screen.getByRole("link", { name: "Corriger" }) as HTMLAnchorElement;
    expect(fix.getAttribute("href")).toBe("/app/revue-direction");
    expect(screen.getByText("Manquant", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Conforme", { selector: "span" })).toBeTruthy();
  });
});
