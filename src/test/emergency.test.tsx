import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactsTab } from "@/components/app/emergency/ContactsTab";
import { EventsTab } from "@/components/app/emergency/EventsTab";
import { ExercisesTab } from "@/components/app/emergency/ExercisesTab";
import { ResourcesTab } from "@/components/app/emergency/ResourcesTab";

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

const scenario = { id: 4, site_id: 1, title: "Déversement de gasoil", emergency_type: "Déversement", status: "operationnel" };
const contact = { id: 1, ref: "ANU-1", title: "Pompiers", category: "fire_brigade", job_role: null, phone: "+229 21 30 00 18", phone_alt: null, email: null, available_24h: true, procedure_id: null };
const event = {
  id: 9, ref: "URG-2026-001", title: "Fuite au dépôt", procedure_id: 4, event_type: null, severity: "major", status: "ongoing",
  declared_at: "2026-10-16T09:00:00Z", closed_at: null, description: null, plan_revision_requested: false, aspects_flagged: 0, debrief: null, lessons_actions: null,
  timeline: [{ at: "2026-10-16T09:00:00Z", by: "Awa", text: "Déclaration de la situation d'urgence." }],
  procedure: { id: 4, title: "Déversement de gasoil", status: "operationnel", procedure_steps: ["Arrêter la pompe", "Confiner avec le kit"], measures: null, evacuation_routes: "Sortie nord", assembly_points: "Parking" },
};

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function route(handlers: Record<string, (path: string, init?: RequestInit) => unknown>) {
  mockRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = Object.keys(handlers).sort((a, b) => b.length - a.length).find((candidate) => path.startsWith(candidate));
    if (!key) return { data: [] };
    return handlers[key]!(path, init);
  });
}

beforeEach(() => {
  mockRequest.mockReset();
  localStorage.setItem("lq-site", "1");
});

describe("annuaire d'urgence", () => {
  it("affiche des numéros appelables directement depuis un téléphone", async () => {
    route({ "emergency-contacts": () => ({ data: [contact] }), "emergency-procedures": () => ({ data: { data: [scenario] } }) });
    wrap(<ContactsTab siteId="1" />);

    const call = (await screen.findByLabelText("Appeler Pompiers")) as HTMLAnchorElement;
    expect(call.getAttribute("href")).toBe("tel:+2292130 0018".replace(" ", ""));
    expect(screen.getByText("24 h/24")).toBeTruthy();
    expect(screen.getByText("Pompiers", { selector: "h3" })).toBeTruthy();
  });

  it("refuse l'enregistrement d'un contact sans téléphone", async () => {
    route({ "emergency-contacts": () => ({ data: [] }), "emergency-procedures": () => ({ data: { data: [] } }) });
    wrap(<ContactsTab siteId="1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ajouter un contact/ }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "Voisin" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("alert").textContent).toContain("Téléphone");
  });
});

describe("moyens d'intervention", () => {
  it("signale les vérifications en retard et enregistre une vérification du jour", async () => {
    const resource = { id: 3, ref: "MOY-1", title: "Extincteur CO2", resource_type: "extinguisher", location: "Atelier", quantity: 2, specification: null, last_check_date: "2025-01-01", check_frequency_days: 365, next_check_date: "2026-01-01", status: "operational", is_overdue: true, procedure_id: null };
    route({ "emergency-resources/3": () => ({ id: 3 }), "emergency-resources": () => ({ data: [resource] }), "emergency-procedures": () => ({ data: { data: [] } }) });
    wrap(<ResourcesTab siteId="1" />);

    expect(await screen.findByText("En retard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Vérifié aujourd'hui/ }));
    await waitFor(() => {
      const call = mockRequest.mock.calls.find((c) => c[0] === "emergency-resources/3" && (c[1] as RequestInit).method === "PUT");
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ last_check_date: new Date().toISOString().slice(0, 10) });
    });
  });
});

describe("exercices", () => {
  it("impose les constats pour clôturer un exercice", async () => {
    const exercise = { id: 5, ref: "EXE-1", title: "Évacuation semestrielle", procedure_id: 4, exercise_type: "evacuation", planned_date: "2026-11-01", performed_date: null, participants_count: null, participants: null, description: null, findings: null, actions_required: null, stakeholders_informed: null, status: "planned", procedure: { id: 4, title: "Incendie", status: "operationnel" } };
    route({ "emergency-exercises/5/complete": () => ({ id: 5 }), "emergency-exercises": () => ({ data: [exercise] }), "emergency-procedures": () => ({ data: { data: [scenario] } }) });
    wrap(<ExercisesTab siteId="1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Saisir le compte rendu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clôturer l'exercice" }));
    expect(screen.getByRole("alert").textContent).toContain("Constats");
    expect(mockRequest.mock.calls.some((c) => String(c[0]).includes("/complete"))).toBe(false);

    const findings = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA" && el.closest("label")?.textContent?.includes("Constats"))!;
    fireEvent.change(findings, { target: { value: "Rassemblement atteint en 4 minutes." } });
    fireEvent.click(screen.getByRole("button", { name: "Clôturer l'exercice" }));
    await waitFor(() => expect(mockRequest.mock.calls.some((c) => c[0] === "emergency-exercises/5/complete")).toBe(true));
  });
});

describe("situations d'urgence réelles", () => {
  it("affiche la conduite à tenir et les numéros utiles à l'ouverture d'une situation en cours", async () => {
    route({ "emergency-events": () => ({ data: [event] }), "emergency-contacts": () => ({ data: [contact] }), "emergency-procedures": () => ({ data: { data: [scenario] } }) });
    wrap(<EventsTab siteId="1" />);

    fireEvent.click(await screen.findByText("Fuite au dépôt"));
    const guidance = (await screen.findByText("Conduite à tenir")).closest("section")!;
    expect(within(guidance).getByText("Arrêter la pompe")).toBeTruthy();
    expect(within(guidance).getByText(/Sortie nord/)).toBeTruthy();
    expect(await within(guidance).findByLabelText("Appeler Pompiers")).toBeTruthy();
  });

  it("exige 20 caractères de retour d'expérience pour clôturer", async () => {
    route({ "emergency-events/9/close": () => ({ id: 9 }), "emergency-events": () => ({ data: [event] }), "emergency-contacts": () => ({ data: [] }), "emergency-procedures": () => ({ data: { data: [scenario] } }) });
    wrap(<EventsTab siteId="1" />);

    fireEvent.click(await screen.findByText("Fuite au dépôt"));
    fireEvent.click(await screen.findByRole("button", { name: "Clôturer avec retour d'expérience" }));
    const close = (await screen.findByRole("button", { name: "Clôturer" })) as HTMLButtonElement;
    expect(close.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Analyse de la situation/), { target: { value: "Le kit anti-déversement était incomplet." } });
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    await waitFor(() => {
      const call = mockRequest.mock.calls.find((c) => c[0] === "emergency-events/9/close");
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ debrief: "Le kit anti-déversement était incomplet." });
    });
  });

  it("déclare une situation en trois informations", async () => {
    route({
      "emergency-events": (_p, init) => (init?.method === "POST" ? { ...event, id: 10 } : { data: [] }),
      "emergency-contacts": () => ({ data: [] }),
      "emergency-procedures": () => ({ data: { data: [scenario] } }),
    });
    wrap(<EventsTab siteId="1" />);

    fireEvent.click(await screen.findByRole("button", { name: /Déclarer une situation d'urgence/ }));
    fireEvent.change(await screen.findByPlaceholderText(/fuite de gasoil/), { target: { value: "Incendie de palettes" } });
    fireEvent.click(screen.getByRole("button", { name: "Déclarer" }));

    await waitFor(() => {
      const call = mockRequest.mock.calls.find((c) => c[0] === "emergency-events" && (c[1] as RequestInit | undefined)?.method === "POST");
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ title: "Incendie de palettes", severity: "major", site_id: "1" });
    });
  });
});
