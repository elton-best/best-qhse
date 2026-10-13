import { describe, expect, it } from "vitest";

import {
  buildSwotPestelPayload,
  emptyIssuesForm,
  issuesFormFromRecord,
  INTERNAL_CRITERIA,
  EXTERNAL_CRITERIA,
} from "@/integrations/backend/context";
import { normalizeProcessSequences } from "@/integrations/backend/processes";

describe("SWOT/PESTEL context contract", () => {
  it("creates the complete Vue-compatible form shape", () => {
    const form = emptyIssuesForm();

    expect(Object.keys(form.internal)).toEqual([...INTERNAL_CRITERIA]);
    expect(Object.keys(form.external)).toEqual([...EXTERNAL_CRITERIA]);
    expect(form.majorIssues).toEqual([]);
  });

  it("serializes the React form to the Laravel payload", () => {
    const form = emptyIssuesForm();
    form.internal.culture.favorable.push("Culture qualité");
    form.external.legal.unfavorable.push("Nouvelle exigence");
    form.majorIssues.push("Maîtriser la conformité");
    form.synthesisInternal = "Synthèse interne";
    form.synthesisExternal = "Synthèse externe";

    const payload = buildSwotPestelPayload("12", form);

    expect(payload).toMatchObject({
      site_id: 12,
      type: "swot_pestel",
      title: "Analyse SWOT/PESTEL",
      swot_strengths: "Synthèse interne",
      pestel_political: "Synthèse externe",
    });
    expect(JSON.parse(String(payload.swot_weaknesses))).toEqual(form.internal);
    expect(JSON.parse(String(payload.swot_opportunities))).toEqual(form.external);
    expect(JSON.parse(String(payload.swot_threats))).toEqual(form.majorIssues);
  });

  it("hydrates JSON persisted by the former Vue screen", () => {
    const form = issuesFormFromRecord({
      swot_strengths: "Synthèse interne",
      swot_weaknesses: JSON.stringify({ culture: { favorable: ["Valeur"], unfavorable: [] } }),
      swot_opportunities: JSON.stringify({
        economic: { favorable: [], unfavorable: ["Inflation"] },
      }),
      swot_threats: JSON.stringify(["Enjeu prioritaire"]),
      pestel_political: "Synthèse externe",
    });

    expect(form.internal.culture.favorable).toEqual(["Valeur"]);
    expect(form.external.economic.unfavorable).toEqual(["Inflation"]);
    expect(form.majorIssues).toEqual(["Enjeu prioritaire"]);
    expect(form.synthesisInternal).toBe("Synthèse interne");
    expect(form.synthesisExternal).toBe("Synthèse externe");
  });

  it("hydrates process sequences with Vue and Laravel field variants", () => {
    const sequences = normalizeProcessSequences([{
      id: 44,
      inputDescription: "Commande",
      activities: "Traiter la commande",
      output_description: "Commande confirmée",
      subActivities: JSON.stringify(["Contrôler", "Valider"]),
      supplierProcesses: [{ name: "Approvisionnement" }],
      client_processes: JSON.stringify(["Expédition"]),
    }]);

    expect(sequences).toEqual([{
      id: "44",
      sequence_order: 1,
      input_description: "Commande",
      activity_description: "Traiter la commande",
      output_description: "Commande confirmée",
      sub_activities: ["Contrôler", "Valider"],
      supplier_processes: ["Approvisionnement"],
      client_processes: ["Expédition"],
      responsible_user_id: undefined,
      duration_minutes: undefined,
      documents: [],
    }]);
  });
});
