import { create } from 'zustand';

export interface Risk {
  id: string;
  code: string;
  processus: string;
  description: string;
  type: 'risque' | 'opportunite';
  probabilite: 1 | 2 | 3 | 4 | 5;
  gravite: 1 | 2 | 3 | 4 | 5;
  criticite: number;
  niveau: 'faible' | 'moyen' | 'eleve' | 'critique';
  actions: string[];
  responsable: string;
  dateEvaluation: Date;
  statut: 'identifie' | 'en_cours' | 'maitrise' | 'clos';
}

export interface Objective {
  id: string;
  code: string;
  axe: string;
  libelle: string;
  indicateur: string;
  cible: number;
  realise: number;
  unite: string;
  frequence: 'mensuel' | 'trimestriel' | 'annuel';
  responsable: string;
  progression: number;
  statut: 'en_cours' | 'atteint' | 'non_atteint';
  dateDebut: Date;
  dateFin: Date;
}

export interface Action {
  id: string;
  code: string;
  type: 'corrective' | 'preventive' | 'amelioration';
  objet: string;
  origine: string;
  responsable: string;
  dateOuverture: Date;
  dateEcheance: Date;
  dateCloture?: Date;
  preuve?: string;
  statut: 'ouverte' | 'en_cours' | 'realisee' | 'validee' | 'cloturee';
  retard: number;
}

interface QHSEState {
  risks: Risk[];
  objectives: Objective[];
  actions: Action[];
  
  // Actions
  addRisk: (risk: Omit<Risk, 'id' | 'code' | 'criticite' | 'niveau'>) => void;
  updateRisk: (id: string, updates: Partial<Risk>) => void;
  addObjective: (objective: Omit<Objective, 'id' | 'code' | 'progression'>) => void;
  updateObjective: (id: string, updates: Partial<Objective>) => void;
  addAction: (action: Omit<Action, 'id' | 'code' | 'retard'>) => void;
  updateAction: (id: string, updates: Partial<Action>) => void;
}

const calculateCriticite = (probabilite: number, gravite: number) => probabilite * gravite;

const calculateNiveau = (criticite: number): Risk['niveau'] => {
  if (criticite <= 4) return 'faible';
  if (criticite <= 9) return 'moyen';
  if (criticite <= 16) return 'eleve';
  return 'critique';
};

const calculateRetard = (dateEcheance: Date, dateCloture?: Date) => {
  const endDate = dateCloture || new Date();
  const diff = endDate.getTime() - new Date(dateEcheance).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

export const useQHSEStore = create<QHSEState>((set, get) => ({
  risks: [
    {
      id: '1',
      code: 'RSQ-2024-001',
      processus: 'Production',
      description: 'Risque de non-conformité produit lié aux équipements vieillissants',
      type: 'risque',
      probabilite: 3,
      gravite: 4,
      criticite: 12,
      niveau: 'eleve',
      actions: ['Maintenance préventive renforcée', 'Plan de renouvellement'],
      responsable: 'Pierre Martin',
      dateEvaluation: new Date('2024-01-15'),
      statut: 'en_cours',
    },
    {
      id: '2',
      code: 'RSQ-2024-002',
      processus: 'Logistique',
      description: 'Risque de rupture approvisionnement fournisseur critique',
      type: 'risque',
      probabilite: 2,
      gravite: 5,
      criticite: 10,
      niveau: 'eleve',
      actions: ['Diversification fournisseurs', 'Stock sécurité'],
      responsable: 'Marie Leroy',
      dateEvaluation: new Date('2024-02-20'),
      statut: 'maitrise',
    },
    {
      id: '3',
      code: 'OPP-2024-001',
      processus: 'Commercial',
      description: 'Opportunité certification ISO 14001 pour nouveaux marchés',
      type: 'opportunite',
      probabilite: 4,
      gravite: 4,
      criticite: 16,
      niveau: 'critique',
      actions: ['Audit gap', 'Plan de mise en conformité'],
      responsable: 'Sophie Bernard',
      dateEvaluation: new Date('2024-01-10'),
      statut: 'en_cours',
    },
    {
      id: '4',
      code: 'RSQ-2024-003',
      processus: 'RH',
      description: 'Risque perte de compétences clés (départs retraite)',
      type: 'risque',
      probabilite: 4,
      gravite: 3,
      criticite: 12,
      niveau: 'eleve',
      actions: ['Plan succession', 'Formation tutorat'],
      responsable: 'Jean Dupont',
      dateEvaluation: new Date('2024-03-01'),
      statut: 'identifie',
    },
    {
      id: '5',
      code: 'RSQ-2024-004',
      processus: 'Production',
      description: 'Risque accident manutention charges lourdes',
      type: 'risque',
      probabilite: 2,
      gravite: 4,
      criticite: 8,
      niveau: 'moyen',
      actions: ['Formation gestes et postures', 'EPI adaptés'],
      responsable: 'Pierre Martin',
      dateEvaluation: new Date('2024-02-15'),
      statut: 'maitrise',
    },
  ],

  objectives: [
    {
      id: '1',
      code: 'OBJ-2024-001',
      axe: 'Qualité',
      libelle: 'Réduire le taux de non-conformité produit',
      indicateur: 'Taux NC',
      cible: 2,
      realise: 2.8,
      unite: '%',
      frequence: 'mensuel',
      responsable: 'Pierre Martin',
      progression: 71,
      statut: 'en_cours',
      dateDebut: new Date('2024-01-01'),
      dateFin: new Date('2024-12-31'),
    },
    {
      id: '2',
      code: 'OBJ-2024-002',
      axe: 'Sécurité',
      libelle: 'Zéro accident avec arrêt',
      indicateur: "Nb accidents avec arrêt",
      cible: 0,
      realise: 1,
      unite: 'accidents',
      frequence: 'mensuel',
      responsable: 'Marie Leroy',
      progression: 50,
      statut: 'en_cours',
      dateDebut: new Date('2024-01-01'),
      dateFin: new Date('2024-12-31'),
    },
    {
      id: '3',
      code: 'OBJ-2024-003',
      axe: 'Environnement',
      libelle: 'Réduire consommation énergétique',
      indicateur: 'kWh/unité produite',
      cible: 15,
      realise: 14.2,
      unite: 'kWh',
      frequence: 'trimestriel',
      responsable: 'Sophie Bernard',
      progression: 100,
      statut: 'atteint',
      dateDebut: new Date('2024-01-01'),
      dateFin: new Date('2024-12-31'),
    },
    {
      id: '4',
      code: 'OBJ-2024-004',
      axe: 'Qualité',
      libelle: 'Satisfaction client > 90%',
      indicateur: 'Score NPS',
      cible: 90,
      realise: 87,
      unite: '%',
      frequence: 'trimestriel',
      responsable: 'Jean Dupont',
      progression: 97,
      statut: 'en_cours',
      dateDebut: new Date('2024-01-01'),
      dateFin: new Date('2024-12-31'),
    },
  ],

  actions: [
    {
      id: '1',
      code: 'AC-2024-001',
      type: 'corrective',
      objet: 'Mise à jour procédure contrôle réception',
      origine: 'Audit interne',
      responsable: 'Pierre Martin',
      dateOuverture: new Date('2024-01-10'),
      dateEcheance: new Date('2024-02-28'),
      dateCloture: new Date('2024-02-25'),
      preuve: 'procedure_v2.pdf',
      statut: 'cloturee',
      retard: 0,
    },
    {
      id: '2',
      code: 'AC-2024-002',
      type: 'preventive',
      objet: 'Formation nouveau logiciel GMAO',
      origine: 'Revue de direction',
      responsable: 'Marie Leroy',
      dateOuverture: new Date('2024-02-01'),
      dateEcheance: new Date('2024-03-15'),
      statut: 'en_cours',
      retard: 0,
    },
    {
      id: '3',
      code: 'AC-2024-003',
      type: 'corrective',
      objet: 'Correction écart stockage produits chimiques',
      origine: 'NC-2024-005',
      responsable: 'Sophie Bernard',
      dateOuverture: new Date('2024-01-20'),
      dateEcheance: new Date('2024-02-05'),
      statut: 'realisee',
      preuve: 'photos_stockage.zip',
      retard: 0,
    },
    {
      id: '4',
      code: 'AC-2024-004',
      type: 'amelioration',
      objet: 'Digitalisation fiches de poste',
      origine: 'Suggestion collaborateur',
      responsable: 'Jean Dupont',
      dateOuverture: new Date('2024-01-05'),
      dateEcheance: new Date('2024-01-25'),
      statut: 'ouverte',
      retard: 15,
    },
  ],

  addRisk: (risk) =>
    set((state) => {
      const code = `RSQ-${new Date().getFullYear()}-${String(state.risks.length + 1).padStart(3, '0')}`;
      const criticite = calculateCriticite(risk.probabilite, risk.gravite);
      const niveau = calculateNiveau(criticite);
      return {
        risks: [
          ...state.risks,
          {
            ...risk,
            id: Math.random().toString(36).slice(2),
            code,
            criticite,
            niveau,
          },
        ],
      };
    }),

  updateRisk: (id, updates) =>
    set((state) => ({
      risks: state.risks.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };
        if (updates.probabilite || updates.gravite) {
          updated.criticite = calculateCriticite(updated.probabilite, updated.gravite);
          updated.niveau = calculateNiveau(updated.criticite);
        }
        return updated;
      }),
    })),

  addObjective: (objective) =>
    set((state) => {
      const code = `OBJ-${new Date().getFullYear()}-${String(state.objectives.length + 1).padStart(3, '0')}`;
      const progression = Math.min(100, Math.round((objective.realise / objective.cible) * 100));
      return {
        objectives: [
          ...state.objectives,
          {
            ...objective,
            id: Math.random().toString(36).slice(2),
            code,
            progression,
          },
        ],
      };
    }),

  updateObjective: (id, updates) =>
    set((state) => ({
      objectives: state.objectives.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, ...updates };
        if (updates.realise !== undefined || updates.cible !== undefined) {
          updated.progression = Math.min(100, Math.round((updated.realise / updated.cible) * 100));
        }
        return updated;
      }),
    })),

  addAction: (action) =>
    set((state) => {
      const code = `AC-${new Date().getFullYear()}-${String(state.actions.length + 1).padStart(3, '0')}`;
      const retard = calculateRetard(action.dateEcheance, action.dateCloture);
      return {
        actions: [
          ...state.actions,
          {
            ...action,
            id: Math.random().toString(36).slice(2),
            code,
            retard,
          },
        ],
      };
    }),

  updateAction: (id, updates) =>
    set((state) => ({
      actions: state.actions.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, ...updates };
        updated.retard = calculateRetard(updated.dateEcheance, updated.dateCloture);
        return updated;
      }),
    })),
}));
