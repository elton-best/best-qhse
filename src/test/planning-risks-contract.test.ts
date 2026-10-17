import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock("@/integrations/backend/client", () => ({
  backendApi: { request: requestMock },
}));

import { fetchRisks } from "@/integrations/backend/planningRisks";

describe("contrat risques et opportunités", () => {
  beforeEach(() => requestMock.mockReset());

  it("charge les deux registres séparément et conserve les identifiants identiques par type", async () => {
    requestMock
      .mockResolvedValueOnce({
        data: [{ id: 7, type: "risque", title: "Panne fournisseur" }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 7,
            type: "opportunities",
            attributes: { title: "Réduire le délai client" },
          },
        ],
        meta: { last_page: 1 },
      });

    const results = await fetchRisks({ site_id: "12", process_id: "4" });

    expect(requestMock).toHaveBeenNthCalledWith(1, expect.stringContaining("risks-opportunities?"));
    expect(requestMock).toHaveBeenNthCalledWith(2, expect.stringContaining("opportunities?"));
    expect(requestMock.mock.calls[1]?.[0]).toContain("site_id=12");
    expect(requestMock.mock.calls[1]?.[0]).toContain("process_id=4");
    expect(results).toMatchObject([
      { id: 7, type: "risque", title: "Panne fournisseur" },
      { id: 7, type: "opportunite", title: "Réduire le délai client" },
    ]);
  });
});
