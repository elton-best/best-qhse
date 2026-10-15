import { describe, expect, it } from "vitest";
import {
  REALISATION_RESOURCES,
  normalizeRealisationPayload,
  statusLabelOf,
  type RealisationKey,
} from "@/integrations/backend/realisation";
import { toRelationOptions } from "@/integrations/backend/energy";

const ENERGY_KEYS: RealisationKey[] = [
  "energy_baseline",
  "energy_collection",
  "energy_objective",
  "energy_design",
  "energy_purchase",
  "energy_equipment",
  "energy_monitoring",
  "energy_compliance",
  "energy_audit",
];

describe("contrat ISO 50001 React ↔ Laravel", () => {
  it("expose une ressource Laravel dédiée par section énergie", () => {
    const endpoints = ENERGY_KEYS.map((key) => REALISATION_RESOURCES[key]);
    expect(new Set(endpoints).size).toBe(ENERGY_KEYS.length);
    endpoints.forEach((endpoint) => expect(endpoint).toMatch(/^energy-/));
  });

  it("convertit les libellés FR en codes et retire les champs inconnus", () => {
    const payload = normalizeRealisationPayload(
      "energy_purchase",
      {
        title: "Contrat électricité",
        energy_type: "Électricité",
        quantity: 1000,
        unit_price: 85,
        responsible_id: "12",
        provider_partner_id: "4",
        enterprise_id: 999, // ne doit jamais partir du navigateur
        champ_inconnu: "x",
      },
      "Commandé",
    );
    expect(payload).toEqual({
      title: "Contrat électricité",
      energy_type: "Électricité",
      quantity: 1000,
      unit_price: 85,
      responsible_id: 12,
      provider_partner_id: 4,
      status: "ordered",
    });
    expect(payload).not.toHaveProperty("enterprise_id");
  });

  it("n'envoie pas les valeurs calculées par le serveur (écarts de surveillance)", () => {
    const payload = normalizeRealisationPayload(
      "energy_monitoring",
      { title: "Janvier", measured_value: 1100, deviation: 100, deviation_percent: 10, ipe_id: "3" },
      "Enregistré",
    );
    expect(payload).not.toHaveProperty("deviation");
    expect(payload).not.toHaveProperty("deviation_percent");
    expect(payload["ipe_id"]).toBe(3);
    expect(payload["status"]).toBe("recorded");
  });

  it("restitue le libellé FR d'un statut backend", () => {
    expect(statusLabelOf("energy_objective", { id: 1, status: "in_progress" })).toBe("En cours");
    expect(statusLabelOf("energy_audit", { id: 1, status: "completed" })).toBe("Réalisé");
    expect(statusLabelOf("energy_compliance", { id: 1, status: "action_open" })).toBe("Action ouverte");
  });

  it("construit les options relationnelles depuis les réponses paginées ou en liste", () => {
    expect(
      toRelationOptions("ipe", [{ id: 1, nom: "kWh/t" }, { id: 2 }, { nom: "sans id" }]),
    ).toEqual([
      { value: "1", label: "kWh/t" },
      { value: "2", label: "#2" },
    ]);
    expect(toRelationOptions("users", { data: [{ id: 7, name: "Awa" }] })).toEqual([
      { value: "7", label: "Awa" },
    ]);
  });
});
