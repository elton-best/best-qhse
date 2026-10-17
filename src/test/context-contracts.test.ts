import { describe, expect, it } from "vitest";

import {
  buildSwotPestelPayload,
  countIncompleteClimateAssessments,
  emptyIssuesForm,
  issuesFormFromRecord,
  newContextIssue,
  INTERNAL_CRITERIA,
  EXTERNAL_CRITERIA,
} from "@/integrations/backend/context";
import { normalizeProcessSequences } from "@/integrations/backend/processes";

describe("SWOT/PESTEL context contract", () => {
  it("creates the complete React context form shape", () => {
    const form = emptyIssuesForm();

    expect(Object.keys(form.internal)).toEqual([...INTERNAL_CRITERIA]);
    expect(Object.keys(form.external)).toEqual([...EXTERNAL_CRITERIA]);
    expect(form.majorIssues).toEqual([]);
  });

  it("serializes the React form to the Laravel payload", () => {
    const form = emptyIssuesForm();
    form.internal["culture"]!.favorable.push({
      ...newContextIssue(),
      text: "Culture qualité",
      climate_change_relevant: true,
    });
    form.external["legal"]!.unfavorable.push({
      ...newContextIssue(),
      text: "Nouvelle exigence",
      climate_change_relevant: false,
      climate_change_rationale: "Aucun lien identifié avec les activités du site.",
    });
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
    expect(JSON.parse(String(payload["swot_weaknesses"]))).toEqual(form.internal);
    expect(JSON.parse(String(payload["swot_opportunities"]))).toEqual(form.external);
    expect(JSON.parse(String(payload["swot_threats"]))).toEqual(form.majorIssues);
  });

  it("hydrates legacy string issues without losing the climate assessment prompt", () => {
    const form = issuesFormFromRecord({
      swot_strengths: "Synthèse interne",
      swot_weaknesses: JSON.stringify({ culture: { favorable: ["Valeur"], unfavorable: [] } }),
      swot_opportunities: JSON.stringify({
        economic: { favorable: [], unfavorable: ["Inflation"] },
      }),
      swot_threats: JSON.stringify(["Enjeu prioritaire"]),
      pestel_political: "Synthèse externe",
    });

    expect(form.internal["culture"]!.favorable).toMatchObject([
      {
        text: "Valeur",
        climate_change_relevant: null,
        climate_change_rationale: "",
      },
    ]);
    expect(form.external["economic"]!.unfavorable).toMatchObject([
      {
        text: "Inflation",
        climate_change_relevant: null,
        climate_change_rationale: "",
      },
    ]);
    expect(form.majorIssues).toEqual(["Enjeu prioritaire"]);
    expect(form.synthesisInternal).toBe("Synthèse interne");
    expect(form.synthesisExternal).toBe("Synthèse externe");
  });

  it("requires a relevance decision and a rationale for a negative climate assessment", () => {
    const form = emptyIssuesForm();
    form.internal["culture"]!.favorable.push({
      ...newContextIssue(),
      text: "Dépendance à une ressource sensible au climat",
    });
    expect(countIncompleteClimateAssessments(form)).toBe(1);

    form.internal["culture"]!.favorable[0]!.climate_change_relevant = false;
    expect(countIncompleteClimateAssessments(form)).toBe(1);

    form.internal["culture"]!.favorable[0]!.climate_change_rationale =
      "La ressource n’est pas utilisée sur ce site.";
    expect(countIncompleteClimateAssessments(form)).toBe(0);
  });

  it("hydrates process sequences with legacy and Laravel field variants", () => {
    const sequences = normalizeProcessSequences([
      {
        id: 44,
        inputDescription: "Commande",
        activities: "Traiter la commande",
        output_description: "Commande confirmée",
        subActivities: JSON.stringify(["Contrôler", "Valider"]),
        supplierProcesses: [{ name: "Approvisionnement" }],
        client_processes: JSON.stringify(["Expédition"]),
      },
    ]);

    expect(sequences).toEqual([
      {
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
      },
    ]);
  });
});
