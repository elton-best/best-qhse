import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KycPage } from "@/components/superadmin/KycPage";
import { StepUpProvider } from "@/components/superadmin/StepUp";
import { meetsPasswordPolicy, passwordRequirements } from "@/lib/password-strength";
import { BackendApiError } from "@/integrations/backend/client";
import { saRequest, setStepUpHandler, useSaMutations } from "@/integrations/backend/superadmin";

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

const enterprise = {
  id: 7, ref: "ENT-007", name: "Société Alpha", email: "alpha@test.local", registration_number: "RB/COT/01",
  status: "pending", approval_status: "pending", rejection_reason: null, suspension_reason: null, trial_ends_at: null,
  created_at: "2026-10-01T10:00:00Z", rccm_number: "RB/COT/01", ifu_number: "123",
  enterprise_admin: { id: 1, name: "Awa D.", email: "awa@alpha.test", phone: null },
  documents: [{ id: 3, type: "RCCM", preview_url: "https://signed.example/preview", download_url: "https://signed.example/download" }],
  sites: [], users: [],
};

function renderKyc() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StepUpProvider>
        <KycPage />
      </StepUpProvider>
    </QueryClientProvider>,
  );
}

function route(handlers: Record<string, (init?: RequestInit) => unknown>) {
  mockRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((candidate) => path.startsWith(candidate));
    if (!key) throw new Error(`appel inattendu : ${path}`);
    return handlers[key]!(init);
  });
}

describe("confirmation de sécurité des actions sensibles", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    setStepUpHandler(null);
  });

  it("rejoue l'action après la saisie du code", async () => {
    const handler = vi.fn().mockResolvedValue(true);
    setStepUpHandler(handler);
    mockRequest
      .mockRejectedValueOnce(new BackendApiError("MFA", 423, { code: "MFA_REQUIRED", mfa_token: "tok-1" }))
      .mockResolvedValueOnce({ success: true });

    await expect(saRequest("superadmin/enterprises/7/approve", { method: "POST" })).resolves.toEqual({ success: true });
    expect(handler).toHaveBeenCalledWith("tok-1");
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("n'exécute pas l'action si la confirmation est refusée", async () => {
    setStepUpHandler(vi.fn().mockResolvedValue(false));
    mockRequest.mockRejectedValueOnce(new BackendApiError("MFA", 423, { code: "MFA_REQUIRED", mfa_token: "tok-1" }));
    await expect(saRequest("superadmin/enterprises/7/approve")).rejects.toBeInstanceOf(BackendApiError);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("laisse passer les autres erreurs sans demander de code", async () => {
    const handler = vi.fn();
    setStepUpHandler(handler);
    mockRequest.mockRejectedValueOnce(new BackendApiError("Interdit", 403, { message: "Interdit" }));
    await expect(saRequest("superadmin/stats")).rejects.toThrow("Interdit");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("validation KYC", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    setStepUpHandler(null);
  });

  it("liste les dossiers en attente et affiche les pièces avec des liens signés", async () => {
    route({
      "superadmin/enterprises/7": () => ({ data: enterprise }),
      "superadmin/enterprises": () => ({ data: [enterprise], meta: { current_page: 1, last_page: 1, per_page: 15, total: 1 } }),
    });
    renderKyc();

    fireEvent.click(await screen.findByRole("button", { name: "Examiner le dossier" }));
    const preview = await screen.findByText("Aperçu");
    expect((preview.closest("a") as HTMLAnchorElement).href).toBe("https://signed.example/preview");
    expect((screen.getByText("Télécharger") as HTMLAnchorElement).href).toBe("https://signed.example/download");
    expect(screen.getAllByText("KYC en attente").length).toBeGreaterThan(0);
  });

  it("valide un dossier après confirmation, avec le code de sécurité si le serveur l'exige", async () => {
    let approveCalls = 0;
    route({
      "superadmin/enterprises/7/approve": () => {
        approveCalls += 1;
        if (approveCalls === 1) throw new BackendApiError("MFA", 423, { code: "MFA_REQUIRED", mfa_token: "tok-9" });
        return { success: true };
      },
      "superadmin/enterprises/7": () => ({ data: enterprise }),
      "superadmin/enterprises": () => ({ data: [enterprise], meta: { current_page: 1, last_page: 1, per_page: 15, total: 1 } }),
      "auth/mfa/verify": () => ({ success: true }),
    });
    renderKyc();

    fireEvent.click(await screen.findByRole("button", { name: "Examiner le dossier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Valider le KYC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));

    fireEvent.change(await screen.findByLabelText("Code de vérification"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(approveCalls).toBe(2));
    const verify = mockRequest.mock.calls.find((call) => call[0] === "auth/mfa/verify")!;
    expect(JSON.parse((verify[1] as RequestInit).body as string)).toEqual({ token: "tok-9", code: "123456" });
  });

  it("exige un motif d'au moins 10 caractères pour rejeter", async () => {
    const reject = vi.fn(() => ({ success: true }));
    route({
      "superadmin/enterprises/7/reject": reject,
      "superadmin/enterprises/7": () => ({ data: enterprise }),
      "superadmin/enterprises": () => ({ data: [enterprise], meta: { current_page: 1, last_page: 1, per_page: 15, total: 1 } }),
    });
    renderKyc();

    fireEvent.click(await screen.findByRole("button", { name: "Examiner le dossier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rejeter" }));
    const reason = (await screen.findAllByRole("textbox")).at(-1)!;
    fireEvent.change(reason, { target: { value: "trop court" } });
    const confirm = screen.getAllByRole("button", { name: "Rejeter" }).at(-1)!;
    fireEvent.click(confirm);
    expect(reject).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: "Pièce RCCM illisible, merci de la redéposer." } });
    fireEvent.click(confirm);
    await waitFor(() => expect(reject).toHaveBeenCalledTimes(1));
  });
});

describe("changement de mot de passe obligatoire", () => {
  it("envoie le mot de passe avec sa confirmation, comme l'exige le serveur", async () => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true });
    const client = new QueryClient();
    let mutate: ReturnType<typeof useSaMutations>["changeOwnPassword"]["mutateAsync"] | undefined;
    function Probe() {
      mutate = useSaMutations().changeOwnPassword.mutateAsync;
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await mutate!("Nouveau#Motdepasse2026");
    const call = mockRequest.mock.calls.find((entry) => entry[0] === "auth/profile")!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      password: "Nouveau#Motdepasse2026",
      password_confirmation: "Nouveau#Motdepasse2026",
    });
  });
});

describe("politique de mot de passe (identique au serveur)", () => {
  it.each([
    ["abcdefgh1", false],
    ["ABCDEFGH1", false],
    ["Abcdefgh", false],
    ["Ab1defg", false],
    ["Motdepasse2026", true],
    ["Nouveau#Motdepasse2026", true],
  ])("%s -> %s", (password, expected) => {
    expect(meetsPasswordPolicy(password)).toBe(expected);
  });

  it("indique précisément le critère manquant", () => {
    expect(passwordRequirements("abcdefgh1").filter((r) => !r.ok).map((r) => r.label)).toEqual(["Une lettre majuscule"]);
  });
});
