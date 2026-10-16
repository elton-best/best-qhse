import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditDrawer } from "@/components/app/audits/AuditDrawer";
import { PlansTab } from "@/components/app/audits/PlansTab";
import { ProposalsTab } from "@/components/app/audits/ProposalsTab";
import { BackendApiError } from "@/integrations/backend/client";

const mockRequest = vi.fn();

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

const people = [
  { id: 1, name: "Awa Koffi", qualified: true, independent: true, conflicts: [] },
  { id: 2, name: "Marc Pilote", qualified: false, independent: false, conflicts: ["pilote ou responsable du processus audité « Peinture »"] },
];

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("programme proposé", () => {
  it("classe les processus et explique chaque proposition", async () => {
    mockRequest.mockResolvedValue({ data: [
      { process_id: 7, process: "Peinture", code: "P1", score: 18, priority: "high", suggested_frequency: "biannual", last_audited_at: null, reasons: ["2 aspect(s) environnemental(aux) significatif(s)", "jamais audité"] },
    ] });
    const onPlan = vi.fn();
    wrap(<ProposalsTab siteId="1" onPlan={onPlan} />);

    expect(await screen.findByText("Peinture")).toBeTruthy();
    expect(screen.getByText("jamais audité")).toBeTruthy();
    expect(screen.getByText("Deux fois par an")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Planifier un audit" }));
    expect(onPlan).toHaveBeenCalledWith(7);
  });
});

describe("plan d'audit", () => {
  it("désactive un auditeur en conflit d'intérêt et signale l'absence de qualification", async () => {
    mockRequest.mockImplementation(async (path?: string) => (path?.startsWith("audits/eligible") ? { data: people } : { data: [] }));
    wrap(<PlansTab siteId="1" presetProcessId={7} />);

    await screen.findByRole("option", { name: /Marc Pilote/ });
    const marc = screen.getByRole("option", { name: /Marc Pilote/ }) as HTMLOptionElement;
    expect(marc.disabled).toBe(true);
    expect(marc.textContent).toContain("non indépendant");
    expect((screen.getByRole("option", { name: /Awa Koffi/ }) as HTMLOptionElement).textContent).toContain("qualifié");
  });

  it("affiche le conflit d'intérêt renvoyé par le serveur", async () => {
    mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
      if (path === "audits" && init?.method === "POST") {
        throw new BackendApiError("Conflit", 422, { conflicts: [{ name: "Awa Koffi", reason: "est à la fois auditeur et audité" }] });
      }
      return path?.startsWith("audits/eligible") ? { data: people } : { data: [] };
    });
    wrap(<PlansTab siteId="1" presetProcessId={7} />);
    await screen.findByRole("option", { name: /Awa Koffi/ });

    fireEvent.change(screen.getByLabelText("Intitulé *"), { target: { value: "Audit environnement" } });
    fireEvent.change(screen.getByLabelText("Auditeur responsable *"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Planifier" }));
    expect((await screen.findByText(/Conflit d'intérêt : Awa Koffi est à la fois auditeur et audité/)).textContent).toBeTruthy();
  });
});

describe("conduite de l'audit", () => {
  it("n'exige une gravité que pour les non-conformités", async () => {
    mockRequest.mockImplementation(async (path?: string) => {
      if (path === "audits/5") return { id: 5, ref: "AUD-5", title: "Audit", status: "in_progress", checklist: [] };
      if (path === "audits/iso-clauses") return { data: [{ clause: "6.1.2", questions: 2 }] };
      return { data: [] };
    });
    wrap(<AuditDrawer id={5} siteId="1" onClose={() => undefined} />);

    const select = await screen.findByLabelText("Classement");
    expect(screen.queryByLabelText("Gravité")).toBeNull();
    fireEvent.change(select, { target: { value: "nc_major" } });
    await waitFor(() => expect(screen.getByLabelText("Gravité")).toBeTruthy());
    expect(screen.getByText(/ouvre automatiquement une fiche/)).toBeTruthy();
    expect(screen.getByText("Point fort", { selector: "option" })).toBeTruthy();
  });
});
