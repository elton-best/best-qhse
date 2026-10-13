import type { User, Risk, Action, Equipment, Training, Objective } from '../types';

export const mockUsers: User[] = [
  {
    id: '1',
    firstName: 'Marie',
    lastName: 'Dubois',
    email: 'marie.dubois@entreprise.fr',
    role: 'admin',
    department: 'Qualité',
    position: 'Responsable QHSE',
    avatar: undefined
  },
  {
    id: '2',
    firstName: 'Jean',
    lastName: 'Martin',
    email: 'jean.martin@entreprise.fr',
    role: 'manager',
    department: 'Production',
    position: 'Chef de production',
    avatar: undefined
  },
  {
    id: '3',
    firstName: 'Sophie',
    lastName: 'Bernard',
    email: 'sophie.bernard@entreprise.fr',
    role: 'employee',
    department: 'Maintenance',
    position: 'Technicien de maintenance',
    avatar: undefined
  }
];

export const mockRisks: Risk[] = [
  {
    id: '1',
    code: 'R-001',
    process: 'Production',
    description: 'Accident de travail sur machine',
    causes: 'Absence de formation, équipement défaillant',
    probability: 3,
    severity: 4,
    criticality: 12,
    status: 'in-progress',
    actions: 'Formation obligatoire, maintenance préventive',
    responsibleId: '1',
    createdAt: '2025-11-15',
    updatedAt: '2026-02-09'
  },
  {
    id: '2',
    code: 'R-002',
    process: 'Stockage',
    description: 'Pollution du sol par fuite chimique',
    causes: 'Conteneur défectueux, absence de bac de rétention',
    probability: 2,
    severity: 4,
    criticality: 8,
    status: 'open',
    actions: 'Installation bacs de rétention, contrôle hebdomadaire',
    responsibleId: '2',
    createdAt: '2025-12-01',
    updatedAt: '2026-02-09'
  }
];

export const mockActions: Action[] = [
  {
    id: '1',
    code: 'AC-2024-045',
    title: 'Mise à jour procédure stockage produits chimiques',
    description: 'Réviser et mettre à jour la procédure de stockage suite à l\'audit',
    type: 'corrective',
    responsibleId: '1',
    startDate: '2025-12-01',
    dueDate: '2026-01-15',
    status: 'overdue',
    progress: 65,
    priority: 'high',
    proof: undefined
  },
  {
    id: '2',
    code: 'AP-2024-012',
    title: 'Installation nouveau système de ventilation',
    description: 'Installation préventive pour améliorer la qualité de l\'air',
    type: 'preventive',
    responsibleId: '2',
    startDate: '2026-01-10',
    dueDate: '2026-03-10',
    status: 'in-progress',
    progress: 40,
    priority: 'medium',
    proof: undefined
  }
];

export const mockEquipment: Equipment[] = [
  {
    id: '1',
    code: 'EQP-001',
    name: 'Chariot élévateur Fenwick',
    category: 'Manutention',
    location: 'Entrepôt A',
    status: 'operational',
    lastMaintenanceDate: '2025-12-15',
    nextMaintenanceDate: '2026-03-15',
    maintenanceFrequency: 'Trimestrielle',
    proof: 'rapport-maintenance-001.pdf',
    responsibleId: '2'
  },
  {
    id: '2',
    code: 'EQP-002',
    name: 'Extincteur CO2',
    category: 'Sécurité incendie',
    location: 'Bureau étage 2',
    status: 'operational',
    lastMaintenanceDate: '2025-11-01',
    nextMaintenanceDate: '2026-11-01',
    maintenanceFrequency: 'Annuelle',
    proof: 'verif-extincteur-002.pdf',
    responsibleId: '3'
  }
];

export const mockTrainings: Training[] = [
  {
    id: '1',
    code: 'FORM-001',
    title: 'Habilitation électrique B1V',
    employeeId: '2',
    department: 'Maintenance',
    frequency: 'Annuelle',
    lastDate: '2025-02-01',
    nextDate: '2026-02-01',
    status: 'overdue',
    proof: undefined,
    mandatory: true,
    validityPeriod: 12
  },
  {
    id: '2',
    code: 'FORM-002',
    title: 'Sécurité incendie',
    employeeId: '1',
    department: 'Production',
    frequency: 'Annuelle',
    lastDate: '2025-06-15',
    nextDate: '2026-06-15',
    status: 'pending',
    proof: undefined,
    mandatory: true,
    validityPeriod: 12
  }
];

export const mockObjectives: Objective[] = [
  {
    id: '1',
    code: 'OBJ-Q-001',
    title: 'Satisfaction client',
    description: 'Atteindre un taux de satisfaction client de 90%',
    category: 'quality',
    target: 90,
    unit: '%',
    currentValue: 87,
    deadline: '2026-12-31',
    responsibleId: '1',
    status: 'on-track',
    indicators: [
      { id: '1', name: 'T1 2026', value: 85, date: '2026-03-31' },
      { id: '2', name: 'T2 2026', value: 87, date: '2026-06-30' }
    ]
  },
  {
    id: '2',
    code: 'OBJ-E-001',
    title: 'Réduction empreinte carbone',
    description: 'Réduire les émissions de CO2 de 15%',
    category: 'environment',
    target: -15,
    unit: '%',
    currentValue: -8,
    deadline: '2026-12-31',
    responsibleId: '1',
    status: 'at-risk',
    indicators: [
      { id: '1', name: 'T1 2026', value: -5, date: '2026-03-31' },
      { id: '2', name: 'T2 2026', value: -8, date: '2026-06-30' }
    ]
  }
];

// Helper functions
export const getUserById = (id: string): User | undefined => {
  return mockUsers.find(user => user.id === id);
};

export const getRisksByCriticality = (minCriticality: number): Risk[] => {
  return mockRisks.filter(risk => risk.criticality >= minCriticality);
};

export const getActionsByStatus = (status: Action['status']): Action[] => {
  return mockActions.filter(action => action.status === status);
};

export const getEquipmentByStatus = (status: Equipment['status']): Equipment[] => {
  return mockEquipment.filter(eq => eq.status === status);
};

export const getTrainingsByStatus = (status: Training['status']): Training[] => {
  return mockTrainings.filter(training => training.status === status);
};
