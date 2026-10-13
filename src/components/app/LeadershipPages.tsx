/**
 * Couche de compatibilité — chaque section Leadership a désormais sa page isolée :
 * - src/components/app/leadership/PolicyPage.tsx (Politique QHSE)
 * - src/components/app/leadership/OrgChartPage.tsx (Organigramme)
 * - src/components/app/leadership/CollaboratorsPage.tsx (Liste du personnel)
 * - src/components/app/leadership/JobDescriptionsPage.tsx (Fiches de poste)
 * - src/components/app/leadership/ResponsibilitiesPage.tsx (Responsabilités)
 *
 * Aucune bande de navigation commune : chaque page est autonome.
 */
export { PolicyPage } from "@/components/app/leadership/PolicyPage";
export { OrgChartPage } from "@/components/app/leadership/OrgChartPage";
export { CollaboratorsPage } from "@/components/app/leadership/CollaboratorsPage";
export { JobDescriptionsPage } from "@/components/app/leadership/JobDescriptionsPage";
export { ResponsibilitiesPage } from "@/components/app/leadership/ResponsibilitiesPage";
