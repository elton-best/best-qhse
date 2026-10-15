import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionsPage } from "@/components/app/planning/ActionsPage";

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
      auth: {
        ...mod.backendApi.auth,
        me: async () => ({ id: 2, email: "admin@test.local", permissions: [] }),
      },
    },
  };
});

function rawAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    reference: "ACT-2026-001",
    title: "Action de test",
    description: "Description assez longue pour passer la validation.",
    status: "in_progress",
    type: "corrective",
    priority: "high",
    progress: 30,
    due_date: "2026-12-31",
    deadline: "2026-12-31",
    site_id: 1,
    site: { id: 1, name: "Site test" },
    process_id: 1,
    process: { id: 1, title: "Processus test", code: "PRC-1" },
    responsible_id: 2,
    responsible: { id: 2, name: "Responsable Test", email: "resp@test.local" },
    progress_notes: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

let serverStatus = "in_progress";
let serverResponsible = 2;
let serverExtra = 0;
let lastStatusBody: unknown = null;

function setupApi() {
  mockRequest.mockImplementation(async (path: unknown, init?: RequestInit) => {
    const url = String(path);
    if (url === "actions/1/status" && init?.method === "POST") {
      lastStatusBody = JSON.parse(String(init.body));
      serverStatus = (lastStatusBody as { status: string }).status;
      return rawAction({ status: serverStatus, responsible_id: serverResponsible });
    }
    if (url.startsWith("actions?")) {
      const rows = [rawAction({ status: serverStatus, responsible_id: serverResponsible })];
      for (let i = 0; i < serverExtra; i++) {
        rows.push(
          rawAction({
            id: 100 + i,
            reference: `ACT-2026-1${String(i).padStart(2, "0")}`,
            title: `Action extra ${i + 1}`,
            status: "assigned",
          }),
        );
      }
      return { data: rows, current_page: 1 };
    }
    if (url.startsWith("users?") || url.startsWith("sites?")) return { data: [] };
    if (url.startsWith("processes?")) return { data: [] };
    throw new Error(`Unhandled API path in test: ${url}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const authRoute = createRoute({ getParentRoute: () => rootRoute, id: "_authenticated" });
  const appRoute = createRoute({
    getParentRoute: () => authRoute,
    path: "app",
  });
  const sectionRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "$section",
    component: ActionsPage,
  });
  const tree = rootRoute.addChildren([authRoute.addChildren([appRoute.addChildren([sectionRoute])])]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/app/actions"] }),
    context: { queryClient },
  });
  window.localStorage.setItem("lq-site", "");
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

beforeEach(() => {
  mockRequest.mockReset();
  serverStatus = "in_progress";
  serverResponsible = 2;
  serverExtra = 0;
  lastStatusBody = null;
  window.localStorage.clear();
  setupApi();
});

describe("ActionsPage — board ReUI + changement de statut", () => {
  it("affiche 2 colonnes avec la carte dans À suivre", async () => {
    renderPage();
    await screen.findByText("Action de test");
    const board = document.querySelector("[data-slot='kanban-board']");
    expect(board).not.toBeNull();
    const headers = Array.from(board!.querySelectorAll("p.text-sm.font-bold")).map(
      (el) => el.textContent,
    );
    expect(headers).toEqual(["À suivre", "Terminées"]);
    const col = board!.querySelector("[data-slot='kanban-column']");
    expect(col?.textContent).toContain("Action de test");
  }, 15000);

  it("pagine les colonnes à 4 cartes par page", async () => {
    serverExtra = 5;
    renderPage();
    await screen.findByText("Action de test");
    expect(screen.getByText("Action extra 3")).toBeInTheDocument();
    expect(screen.queryByText("Action extra 4")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Page suivante/ }));
    expect(await screen.findByText("Action extra 4")).toBeInTheDocument();
    expect(screen.getByText("Action extra 5")).toBeInTheDocument();
    expect(screen.queryByText("Action extra 1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
  }, 15000);

  it("change le statut via le détail et déplace la carte en Terminées", async () => {
    renderPage();

    const card = await screen.findByText("Action de test");
    expect(card).toBeInTheDocument();

    // Ouvre le détail.
    fireEvent.click(card);
    await screen.findByText("Changer le statut");

    // Change le statut et ouvre l'invite.
    fireEvent.change(screen.getByLabelText("Nouveau statut"), {
      target: { value: "completed" },
    });
    const detailAppliquer = screen
      .getAllByRole("button", { name: "Appliquer" })
      .find((b) => b.classList.contains("shrink-0"));
    expect(detailAppliquer).toBeDefined();
    fireEvent.click(detailAppliquer as HTMLElement);

    // L'invite de commentaire apparaît et reste ouverte pendant la saisie.
    const box = await screen.findByPlaceholderText("Motif du changement…");
    fireEvent.change(box, { target: { value: "Cause traitée" } });
    expect(
      screen.queryByPlaceholderText("Motif du changement…"),
    ).toBeInTheDocument();

    // Confirme.
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Appliquer" }),
    );

    // Le backend reçoit le bon payload…
    await waitFor(() => expect(lastStatusBody).not.toBeNull());
    expect(lastStatusBody).toEqual({ status: "completed", comments: "Cause traitée" });

    // …et après refetch la carte passe en colonne Terminées.
    await waitFor(
      () => {
        const board = document.querySelector("[data-slot='kanban-board']");
        const doneCol = within(board as HTMLElement)
          .getByText("Terminées")
          .closest("[data-slot='kanban-column']");
        expect(doneCol?.textContent).toContain("Action de test");
      },
      { timeout: 5000 },
    );
  }, 15000);

  it("change le statut via le bouton Statut de la carte (dialogue rapide)", async () => {
    renderPage();

    const card = await screen.findByText("Action de test");
    expect(card).toBeInTheDocument();

    const statutBtns = screen.getAllByRole("button", { name: "Statut" });
    expect(statutBtns.length).toBeGreaterThan(0);
    fireEvent.click(statutBtns[0] as HTMLElement);

    const dialog = await screen.findByRole("dialog", { name: "Changer le statut" });
    fireEvent.change(within(dialog).getByLabelText("Nouveau statut"), {
      target: { value: "completed" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Motif du changement…"), {
      target: { value: "Vérifiée sur site" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Appliquer" }));

    await waitFor(() => expect(lastStatusBody).not.toBeNull());
    expect(lastStatusBody).toEqual({ status: "completed", comments: "Vérifiée sur site" });
    await waitFor(
      () => {
        const board = document.querySelector("[data-slot='kanban-board']");
        const doneCol = within(board as HTMLElement)
          .getByText("Terminées")
          .closest("[data-slot='kanban-column']");
        expect(doneCol?.textContent).toContain("Action de test");
      },
      { timeout: 5000 },
    );
  }, 15000);

  it("grise le bouton Statut quand l'utilisateur n'est ni responsable ni habilité", async () => {
    serverResponsible = 99;
    renderPage();

    await screen.findByText("Action de test");
    const statutBtn = screen.getAllByRole("button", { name: "Statut" })[0] as HTMLElement;
    expect(statutBtn).toBeDisabled();
  }, 15000);
});
