import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { enqueue, queued, resolveQueued } from "@/components/app/performance/offline-queue";
import { InstrumentsTab } from "@/components/app/performance/InstrumentsTab";
import { QuickEntryTab } from "@/components/app/performance/QuickEntryTab";
import { BackendApiError } from "@/integrations/backend/client";

const mockRequest = vi.fn();

vi.mock("@/integrations/backend/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/integrations/backend/client")>();
  return {
    ...mod,
    backendApi: { ...mod.backendApi, request: (...args: unknown[]) => (mockRequest as (...a: unknown[]) => Promise<unknown>)(...args) },
  };
});

const indicator = { id: 3, ref: "IEN-1", title: "Consommation d'eau", unit: "m³", site_id: 1, category: "water", frequency: "monthly", threshold_direction: "max", target_value: 100, alert_threshold: 150, normalization: "none", is_active: true };

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function serve(post: (body: Record<string, unknown>) => unknown) {
  mockRequest.mockImplementation(async (path?: string, init?: RequestInit) => {
    if (path === "indicator-readings" && init?.method === "POST") return post(JSON.parse(String(init.body)) as Record<string, unknown>);
    if (path?.startsWith("environmental-indicators")) return { data: [indicator] };
    if (path?.startsWith("monitoring-instruments")) return { data: [] };
    return { data: [] };
  });
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.clear();
});

describe("file d'attente hors connexion", () => {
  it("conserve les relevés non envoyés et retire ceux que le serveur a reçus", () => {
    const a = enqueue({ indicator_id: 1, value: 5 });
    const b = enqueue({ indicator_id: 1, value: 6 });
    expect(queued()).toHaveLength(2);

    resolveQueued([{ client_uuid: a.client_uuid, status: "created" }, { client_uuid: b.client_uuid, status: "rejected", message: "Unité incorrecte" }]);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]?.rejected).toBe("Unité incorrecte");
  });
});

describe("saisie rapide", () => {
  it("demande une confirmation explicite pour une valeur aberrante puis la renvoie confirmée", async () => {
    let calls = 0;
    serve((body) => {
      calls += 1;
      if (!body["confirm_outlier"]) throw new BackendApiError("Valeur très éloignée", 422, { code: "OUTLIER", needs_confirmation: true, message: "Valeur très éloignée des relevés précédents." });
      return { data: { id: 1, flags: ["outlier_confirmed"] } };
    });
    wrap(<QuickEntryTab siteId="1" />);

    await screen.findByRole("option", { name: /Consommation d'eau/ });
    fireEvent.change(screen.getByLabelText("Indicateur *"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Valeur \*/), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le relevé" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("très éloignée");
    fireEvent.click(screen.getByRole("button", { name: "Oui, la valeur est exacte" }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("met le relevé en file quand le réseau est indisponible", async () => {
    serve(() => { throw new BackendApiError("Le serveur est momentanément indisponible."); });
    wrap(<QuickEntryTab siteId="1" />);

    await screen.findByRole("option", { name: /Consommation d'eau/ });
    fireEvent.change(screen.getByLabelText("Indicateur *"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Valeur \*/), { target: { value: "42,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le relevé" }));

    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(queued()[0]).toMatchObject({ indicator_id: 3, value: 42.5 });
    expect(await screen.findByText(/1 relevé\(s\) en attente d'envoi/)).toBeTruthy();
  });

  it("refuse une valeur non numérique avant tout envoi", async () => {
    serve(() => ({ data: {} }));
    wrap(<QuickEntryTab siteId="1" />);
    await screen.findByRole("option", { name: /Consommation d'eau/ });
    fireEvent.change(screen.getByLabelText("Indicateur *"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Valeur \*/), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le relevé" }));
    expect(screen.getByRole("alert").textContent).toContain("valeur numérique");
  });
});

describe("registre des instruments", () => {
  it("signale les instruments dont l'étalonnage n'est plus valide", async () => {
    mockRequest.mockResolvedValue({
      data: [
        { id: 1, ref: "INS-1", title: "Compteur général", instrument_type: "meter", serial_number: null, location: null, measurement_range: null, last_calibration_date: "2025-01-01", calibration_frequency_days: 365, next_calibration_date: "2026-01-01", status: "in_service", validity: "expired" },
        { id: 2, ref: "INS-2", title: "Balance", instrument_type: "scale", serial_number: null, location: null, measurement_range: null, last_calibration_date: null, calibration_frequency_days: 365, next_calibration_date: null, status: "in_service", validity: "never_calibrated" },
      ],
    });
    wrap(<InstrumentsTab siteId="1" />);
    expect(await screen.findByText("Étalonnage expiré")).toBeTruthy();
    expect(screen.getByText("Jamais étalonné")).toBeTruthy();
  });
});
