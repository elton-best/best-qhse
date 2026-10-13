import { useState } from 'react';
import { Plus, Edit, Trash2, Upload, Download, Sparkles } from 'lucide-react';

interface Risk {
  id: string;
  number: string;
  process: string;
  risk: string;
  causes: string;
  prob: number;
  grav: number;
  criticite: number;
  actions: string;
  status: 'open' | 'in-progress' | 'closed';
}

export default function RiskMatrix() {
  const [risks, setRisks] = useState<Risk[]>([
    {
      id: '1',
      number: 'R-001',
      process: 'Production',
      risk: 'Accident de travail machine',
      causes: 'Absence de formation, équipement défaillant',
      prob: 3,
      grav: 4,
      criticite: 12,
      actions: 'Formation obligatoire, maintenance préventive',
      status: 'in-progress'
    },
    {
      id: '2',
      number: 'R-002',
      process: 'Stockage chimique',
      risk: 'Pollution du sol',
      causes: 'Fuite conteneur, absence de bac de rétention',
      prob: 2,
      grav: 4,
      criticite: 8,
      actions: 'Installation bacs, contrôle hebdomadaire',
      status: 'open'
    },
    {
      id: '3',
      number: 'R-003',
      process: 'Maintenance électrique',
      risk: 'Électrocution',
      causes: 'Non-respect consignation, formation insuffisante',
      prob: 3,
      grav: 5,
      criticite: 15,
      actions: 'Procédure LOTO, habilitation électrique',
      status: 'in-progress'
    },
    {
      id: '4',
      number: 'R-004',
      process: 'Livraison transport',
      risk: 'Accident de la route',
      causes: 'Fatigue conducteur, conditions météo',
      prob: 2,
      grav: 3,
      criticite: 6,
      actions: 'Repos obligatoire, report si météo',
      status: 'closed'
    },
    {
      id: '5',
      number: 'R-005',
      process: 'Administration RH',
      risk: 'Fuite données personnelles',
      causes: 'Cybersécurité faible, formation RGPD',
      prob: 3,
      grav: 3,
      criticite: 9,
      actions: 'Firewall, formation RGPD annuelle',
      status: 'in-progress'
    }
  ]);

  const [showAddModal, setShowAddModal] = useState(false);

  const getCriticalityColor = (criticite: number) => {
    if (criticite >= 12) return 'bg-[#ef4444] text-white';
    if (criticite >= 8) return 'bg-[#f59e0b] text-white';
    return 'bg-[#10b981] text-white';
  };

  const getCriticalityLabel = (criticite: number) => {
    if (criticite >= 12) return 'Critique';
    if (criticite >= 8) return 'Moyen';
    return 'Faible';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-[#ef4444]/10 text-[#ef4444]';
      case 'in-progress': return 'bg-[#f59e0b]/10 text-[#f59e0b]';
      case 'closed': return 'bg-[#10b981]/10 text-[#10b981]';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Ouvert';
      case 'in-progress': return 'En cours';
      case 'closed': return 'Clôturé';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 dark:text-white mb-2">Point 6 - Risques & Opportunités</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Matrice de criticité et plan d'actions
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:scale-105 transition-all">
            <Upload className="w-4 h-4" />
            Importer Excel
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:scale-105 transition-all">
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white rounded-xl shadow-lg hover:scale-105 transition-all">
            <Sparkles className="w-4 h-4" />
            Grok IA
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-medium rounded-xl shadow-lg hover:scale-105 transition-all"
          >
            <Plus className="w-5 h-5" />
            Nouveau Risque
          </button>
        </div>
      </div>

      {/* Heatmap Visualization */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Heatmap de Criticité</h3>
        <div className="grid grid-cols-6 gap-2">
          {/* Header row */}
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400"></div>
          {[1, 2, 3, 4, 5].map((g) => (
            <div key={g} className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
              Gravité {g}
            </div>
          ))}
          
          {/* Probability rows */}
          {[5, 4, 3, 2, 1].map((p) => (
            <>
              <div className="flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-400">
                Prob {p}
              </div>
              {[1, 2, 3, 4, 5].map((g) => {
                const value = p * g;
                const hasRisk = risks.some(r => r.prob === p && r.grav === g);
                return (
                  <div
                    key={`${p}-${g}`}
                    className={`
                      h-16 rounded-lg flex items-center justify-center font-bold text-lg
                      ${value >= 12 ? 'bg-[#ef4444] text-white' :
                        value >= 8 ? 'bg-[#f59e0b] text-white' :
                        'bg-[#10b981] text-white'}
                      ${hasRisk ? 'ring-4 ring-white dark:ring-gray-900 scale-105 shadow-xl' : 'opacity-60'}
                      transition-all duration-200
                    `}
                  >
                    {hasRisk && '●'}
                  </div>
                );
              })}
            </>
          ))}
        </div>
        
        <div className="flex items-center justify-center gap-6 mt-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#10b981]" />
            <span className="text-gray-600 dark:text-gray-400">Faible (1-7)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#f59e0b]" />
            <span className="text-gray-600 dark:text-gray-400">Moyen (8-11)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#ef4444]" />
            <span className="text-gray-600 dark:text-gray-400">Critique (12-25)</span>
          </div>
        </div>
      </div>

      {/* Risk Table */}
      <div className="glass rounded-2xl p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">N°</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Processus</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Risque</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Causes</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Prob</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Grav</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Crit</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Niveau</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Actions</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((risk) => (
              <tr 
                key={risk.id} 
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">{risk.number}</td>
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{risk.process}</td>
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{risk.risk}</td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{risk.causes}</td>
                <td className="py-3 px-4 text-center text-sm font-medium text-gray-900 dark:text-white">{risk.prob}</td>
                <td className="py-3 px-4 text-center text-sm font-medium text-gray-900 dark:text-white">{risk.grav}</td>
                <td className="py-3 px-4 text-center text-sm font-bold text-gray-900 dark:text-white">{risk.criticite}</td>
                <td className="py-3 px-4">
                  <div className="flex justify-center">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getCriticalityColor(risk.criticite)}`}>
                      {getCriticalityLabel(risk.criticite)}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{risk.actions}</td>
                <td className="py-3 px-4">
                  <div className="flex justify-center">
                    <span className={`px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(risk.status)}`}>
                      {getStatusLabel(risk.status)}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
                      <Edit className="w-4 h-4 text-[#6366f1]" />
                    </button>
                    <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
                      <Trash2 className="w-4 h-4 text-[#ef4444]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Statistics */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Risques</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{risks.length}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Critiques</p>
          <p className="text-2xl font-bold text-[#ef4444]">
            {risks.filter(r => r.criticite >= 12).length}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Moyens</p>
          <p className="text-2xl font-bold text-[#f59e0b]">
            {risks.filter(r => r.criticite >= 8 && r.criticite < 12).length}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Faibles</p>
          <p className="text-2xl font-bold text-[#10b981]">
            {risks.filter(r => r.criticite < 8).length}
          </p>
        </div>
      </div>
    </div>
  );
}
