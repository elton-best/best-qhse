import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BackButton } from "@/components/app/BackButton";

function setup(entries: string[], index: number) {
  const root = createRootRoute({ component: () => <BackButton fallback="/home" /> });
  const routes = ["/", "/home", "/a", "/b"].map((path) => createRoute({ getParentRoute: () => root, path, component: () => null }));
  const history = createMemoryHistory({ initialEntries: entries, initialIndex: index });
  const router = createRouter({ routeTree: root.addChildren(routes), history });
  render(<RouterProvider router={router} />);
  return router;
}

describe("bouton retour", () => {
  it("revient à l'écran précédent de l'historique", async () => {
    const router = setup(["/a", "/b"], 1);
    fireEvent.click(await screen.findByRole("button", { name: /Retour/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/a"));
  });

  it("utilise la page de repli quand il n'y a pas d'historique", async () => {
    const router = setup(["/b"], 0);
    fireEvent.click(await screen.findByRole("button", { name: /Retour/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
  });
});
