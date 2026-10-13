import { useState } from 'react';
import { Plus, AlertTriangle, Clock, CheckCircle, TrendingUp, FileUp } from 'lucide-react';

interface Action {
  id: string;
  code: string;
  title: string;
  type: 'corrective' | 'preventive' | 'improvement';
  responsible: string;
  startDate: string;
  dueDate: string;
  status: 'open' | 'in-progress' | 'completed' | 'overdue';
  progress: number;
  daysOverdue: number;
  proof?: string;
}

export default function Improvement() {
  const [actions, setActions] = useState<Action[]>([
    {
      id: '1',
      code: 'AC-2024-045',
      title: 'Mise à jour procédure stockage produits chimiques',
      type: 'corrective',
      responsible: 'Marie Dubois',
      startDate: '2025-12-01',
      dueDate: '2026-01-15',
      status: 'overdue',
      progress: 65,
      daysOverdue: 12,
      proof: undefined
    },
    {
      id: '2',
      code: 'AP-2024-012',
      title: 'Installation nouveau système ventilation',
      type: 'preventive',
      responsible: 'Jean Martin',
      startDate: '2026-01-10',
      dueDate: '2026-03-10',
      status: 'in-progress',
      progress: 40,
      daysOverdue: 0,
      proof: undefined
    },
    {
      id: '3',
      code: 'AM-2025-008',
      title: 'Digitalisation documents QHSE',
      type: 'improvement',
      responsible: 'Sophie Bernard',
      startDate: '2025-11-15',
      dueDate: '2026-02-28',
      status: 'in-progress',
      progress: 75,
      daysOverdue: 0,
      proof: undefined
    },
    {
      id: '4',
      code: 'AC-2025-067',
      title: 'Correction non-conformité audit ISO 14001',
      type: 'corrective',
      responsible: 'Pierre Dupont',
      startDate: '2025-12-20',
      dueDate: '2026-01-20',
      status: 'overdue',
      progress: 55,
      daysOverdue: 8,
      proof: undefined
    },
    {
      id: '5',
      code: 'AP-2025-034',
      title: 'Formation nouveaux EPI',
      type: 'preventive',
      responsible: 'Luc Moreau',
      startDate: '2026-01-05',
      dueDate: '2026-02-05',
      status: 'completed',
      progress: 100,
      daysOverdue: 0,
      proof: 'formation-epi-jan2026.pdf'
    }
  ]);

  const [showCollaboratorView, setShowCollaboratorView] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-[#10b981]/10 text-[#10b981]';
      case 'in-progress': return 'bg-[#6366f1]/10 text-[#6366f1]';
      case 'open': return 'bg-gray-300 dark:bg-gray-700 text-gray-600';
      case 'overdue': return 'bg-[#ef4444]/10 text-[#ef4444]';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Terminée';
      case 'in-progress': return 'En cours';
      case 'open': return 'Ouverte';
      case 'overdue': return 'En retard';
      default: return status;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'corrective': return 'bg-[#ef4444] text-white';
      case 'preventive': return 'bg-[#f59e0b] text-white';
      case 'improvement': return 'bg-[#6366f1] text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'corrective': return 'Corrective';
      case 'preventive': return 'Préventive';
      case 'improvement': return 'Amélioration';
      default: return type;
    }
  };

  const handleUploadProof = (actionId: string) => {
    setUploadingFor(actionId);
    setTimeout(() => {
      setActions(prev => prev.map(a => 
        a.id === actionId 
          ? { ...a, proof: `preuve-action-${actionId}.pdf`, status: 'completed' as const, progress: 100 }
          : a
      ));
      setUploadingFor(null);
    }, 1000);
  };

  const stats = {
    total: actions.length,
    completed: actions.filter(a => a.status === 'completed').length,
    inProgress: actions.filter(a => a.status === 'in-progress').length,
    overdue: actions.filter(a => a.status === 'overdue').length,
    completionRate: Math.round((actions.filter(a => a.status === 'completed').length / actions.length) * 100)
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 dark:text-white mb-2">Point 10 - Amélioration Continue</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Tableau de bord des actions correctives et préventives
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowCollaboratorView(!showCollaboratorView)}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              showCollaboratorView
                ? 'bg-[#6366f1] text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Vue Collaborateur
          </button>
          <button className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-medium rounded-xl shadow-lg hover:scale-105 transition-all">
            <Plus className="w-5 h-5" />
            Nouvelle Action
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-[#6366f1]" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-[#10b981]" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Terminées</p>
          </div>
          <p className="text-2xl font-bold text-[#10b981]">{stats.completed}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-[#6366f1]" />
            <p className="text-sm text-gray-600 dark:text-gray-400">En cours</p>
          </div>
          <p className="text-2xl font-bold text-[#6366f1]">{stats.inProgress}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
            <p className="text-sm text-gray-600 dark:text-gray-400">En retard</p>
          </div>
          <p className="text-2xl font-bold text-[#ef4444]">{stats.overdue}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-[#10b981]" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Taux réussite</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completionRate}%</p>
        </div>
      </div>

      {/* Alert for overdue */}
      {stats.overdue > 0 && (
        <div className="glass rounded-xl p-4 border-l-4 border-[#ef4444] bg-[#ef4444]/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[#ef4444] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-gray-900 dark:text-white mb-1">
                {stats.overdue} action{stats.overdue > 1 ? 's' : ''} en retard avec écart {'>'}10 jours
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Les actions suivantes nécessitent une attention immédiate. Les délais dépassent le seuil critique.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions Table */}
      <div className="glass rounded-2xl p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Code</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Action</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Type</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Responsable</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Début</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Échéance</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Progression</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Écart délai</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Statut</th>
              {showCollaboratorView && (
                <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr 
                key={action.id}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900 dark:text-white">
                  {action.code}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 font-medium max-w-xs">
                  {action.title}
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-center">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getTypeColor(action.type)}`}>
                      {getTypeLabel(action.type)}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {action.responsible}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {new Date(action.startDate).toLocaleDateString('fr-FR')}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                  {new Date(action.dueDate).toLocaleDateString('fr-FR')}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          action.progress === 100 ? 'bg-[#10b981]' : 'bg-[#6366f1]'
                        }`}
                        style={{ width: `${action.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {action.progress}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  {action.daysOverdue > 0 ? (
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      action.daysOverdue > 10 ? 'bg-[#ef4444] text-white animate-pulse' : 'bg-[#f59e0b] text-white'
                    }`}>
                      +{action.daysOverdue}j
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-center">
                    <span className={`px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(action.status)}`}>
                      {getStatusLabel(action.status)}
                    </span>
                  </div>
                </td>
                {showCollaboratorView && (
                  <td className="py-3 px-4">
                    <div className="flex flex-col items-center gap-2">
                      {action.proof ? (
                        <button className="flex items-center gap-1 px-3 py-1 bg-[#10b981]/10 text-[#10b981] rounded-lg text-xs font-medium hover:scale-105 transition-all">
                          <CheckCircle className="w-3 h-3" />
                          Validée
                        </button>
                      ) : uploadingFor === action.id ? (
                        <div className="px-3 py-1 text-xs text-gray-500">
                          Upload...
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleUploadProof(action.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-[#6366f1] text-white rounded-lg text-xs font-medium hover:scale-105 transition-all"
                          >
                            <FileUp className="w-3 h-3" />
                            Preuve
                          </button>
                          <button className="flex items-center gap-1 px-3 py-1 bg-[#10b981] text-white rounded-lg text-xs font-medium hover:scale-105 transition-all">
                            <CheckCircle className="w-3 h-3" />
                            Confirmer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Collaborator View Info */}
      {showCollaboratorView && (
        <div className="glass rounded-xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Espace Collaborateur</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                1
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Consultation des actions</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Le collaborateur voit les actions qui lui sont assignées</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                2
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Upload preuve obligatoire</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Photos, documents, rapports prouvant la réalisation</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#10b981] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                ✓
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Confirmation finale</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Bouton "Confirmer" pour valider la clôture de l'action</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
