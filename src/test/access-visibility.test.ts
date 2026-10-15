import { describe, expect, it } from "vitest";
import { NAV_GROUPS, TOP_ITEMS, isNavItemVisible, type NavItem } from "@/components/app/nav";
import { normFamily } from "@/integrations/backend/norms";

const find = (slug: string): NavItem => {
  const item = [...TOP_ITEMS, ...NAV_GROUPS.flatMap((group) => group.items)].find((entry) => entry.slug === slug);
  if (!item) throw new Error(`rubrique inconnue : ${slug}`);
  return item;
};

describe("visibilité des modules selon l'offre et les normes", () => {
  it("normalise les codes de norme du catalogue", () => {
    expect(["ISO 14001:2015", "ISO-14001", "iso 14001", "ISO 50001:2018"].map(normFamily)).toEqual([
      "ISO 14001", "ISO 14001", "ISO 14001", "ISO 50001",
    ]);
    expect(normFamily("Norme interne")).toBe("Norme interne");
  });

  it("n'affiche que les sous-modules du catalogue d'accès quand il est connu", () => {
    const accessible = new Set(["aspects_environnementaux", "ipe", "politique"]);
    expect(isNavItemVisible(find("aspects-environnementaux"), undefined, accessible)).toBe(true);
    expect(isNavItemVisible(find("ipe"), undefined, accessible)).toBe(true);
    expect(isNavItemVisible(find("situation-energetique"), undefined, accessible)).toBe(false);
    expect(isNavItemVisible(find("audit-energetique"), undefined, accessible)).toBe(false);
  });

  it("garde les rubriques sans correspondance au catalogue (tâches, sites, paramètres)", () => {
    const accessible = new Set<string>();
    expect(isNavItemVisible(find("taches"), undefined, accessible)).toBe(true);
    expect(isNavItemVisible(find("sites"), undefined, accessible)).toBe(true);
  });

  it("se replie sur les normes actives tant que le catalogue n'est pas chargé", () => {
    expect(isNavItemVisible(find("situation-energetique"), new Set(["ISO 14001"]), undefined)).toBe(false);
    expect(isNavItemVisible(find("situation-energetique"), new Set(["ISO 50001"]), undefined)).toBe(true);
  });

  it("n'affiche le pilotage intégré qu'à partir de deux normes actives", () => {
    const integrated = find("systeme-integre");
    expect(isNavItemVisible(integrated, new Set(["ISO 14001"]), undefined)).toBe(false);
    expect(isNavItemVisible(integrated, new Set(["ISO 14001", "ISO 50001"]), undefined)).toBe(true);
  });
});
