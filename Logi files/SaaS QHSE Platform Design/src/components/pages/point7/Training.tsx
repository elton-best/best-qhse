import { useState } from 'react';
import { Plus, Upload, Download, AlertTriangle, CheckCircle, X, FileUp } from 'lucide-react';

interface Training {
  id: string;
  code: string;
  title: string;
  employee: string;
  department: string;
  frequency: string;
  lastDate: string;
  nextDate: string;
  status: 'done' | 'pending' | 'cancelled' | 'overdue';
  proof?: string;
  daysUntil: number;
}

export default function Training() {
  const [trainings, setTrainings] = useState<Training[]>([
    {
      id: '1',
      code: 'FORM-001',
      title: 'Habilitation électrique B1V',
      employee: 'Jean Dupont',
      department: 'Maintenance',
      frequency: 'Annuelle',
      lastDate: '2025-02-01',
      nextDate: '2026-02-01',
      status: 'overdue',
      proof: undefined,
      daysUntil: -8
    },
    {
      id: '2',
      code: 'FORM-002',
      title: 'Sécurité incendie',
      employee: 'Marie Martin',
      department: 'Production',
      frequency: 'Annuelle',
      lastDate: '2025-06-15',
      nextDate: '2026-06-15',
      status: 'pending',
      proof: undefined,
      daysUntil: 126
    },
    {
      id: '3',
      code: 'FORM-003',
      title: 'CACES R489 cat 3',
      employee: 'Pierre Dubois',
      department: 'Logistique',
      frequency: '5 ans',
      lastDate: '2024-03-20',
      nextDate: '2029-03-20',
      status: 'done',
      proof: 'caces-pierre.pdf',
      daysUntil: 1134
    },
    {
      id: '4',
      code: 'FORM-004',
      title: 'Gestes et postures',
      employee: 'Sophie Bernard',
      department: 'Production',
      frequency: '2 ans',
      lastDate: '2024-11-10',
      nextDate: '2026-11-10',
      status: 'pending',
      proof: undefined,
      daysUntil: 274
    },
    {
      id: '5',
      code: 'FORM-005',
      title: 'SST (Sauveteur Secouriste)',
      employee: 'Luc Moreau',
      department: 'Administration',
      frequency: '2 ans',
      lastDate: '2024-09-05',
      nextDate: '2026-09-05',
      status: 'cancelled',
      proof: undefined,
      daysUntil: 208
    },
    {
      id: '6',
      code: 'FORM-006',
      title: 'Manipulation extincteurs',
      employee: 'Ensemble du personnel',
      department: 'Tous',
      frequency: 'Annuelle',
      lastDate: '2025-12-10',
      nextDate: '2026-12-10',
      status: 'done',
      proof: 'formation-extincteurs-dec2025.pdf',
      daysUntil: 304
    }
  ]);

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-[#10b981]/10 text-[#10b981]';
      case 'pending': return 'bg-[#6366f1]/10 text-[#6366f1]';
      case 'cancelled': return 'bg-gray-300 dark:bg-gray-700 text-gray-500';
      case 'overdue': return 'bg-[#ef4444]/10 text-[#ef4444]';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'done': return 'Effectuée';
      case 'pending': return 'À planifier';
      case 'cancelled': return 'Annulée';
      case 'overdue': return 'En retard';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return CheckCircle;
      case 'pending': return AlertTriangle;
      case 'cancelled': return X;
      case 'overdue': return AlertTriangle;
      default: return CheckCircle;
    }
  };

  const isRowDisabled = (training: Training) => {
    const nextDate = new Date(training.nextDate);
    const today = new Date();
    return nextDate > today && training.status !== 'overdue';
  };

  const handleUploadProof = (trainingId: string) => {
    setUploadingFor(trainingId);
    setTimeout(() => {
      setTrainings(prev => prev.map(t => 
        t.id === trainingId 
          ? { ...t, proof: `preuve-formation-${trainingId}.pdf`, status: 'done' as const }
          : t
      ));
      setUploadingFor(null);
    }, 1000);
  };

  const stats = {
    total: trainings.length,
    done: trainings.filter(t => t.status === 'done').length,
    pending: trainings.filter(t => t.status === 'pending').length,
    overdue: trainings.filter(t => t.status === 'overdue').length,
    cancelled: trainings.filter(t => t.status === 'cancelled').length
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 dark:text-white mb-2">Point 7.2 - Compétences & Formation</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Plan de formation annuel et suivi des habilitations
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
          <button className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-medium rounded-xl shadow-lg hover:scale-105 transition-all">
            <Plus className="w-5 h-5" />
            Nouvelle Formation
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Effectuées</p>
          <p className="text-2xl font-bold text-[#10b981]">{stats.done}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">À planifier</p>
          <p className="text-2xl font-bold text-[#6366f1]">{stats.pending}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">En retard</p>
          <p className="text-2xl font-bold text-[#ef4444]">{stats.overdue}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Annulées</p>
          <p className="text-2xl font-bold text-gray-500">{stats.cancelled}</p>
        </div>
      </div>

      {/* Alerts */}
      {stats.overdue > 0 && (
        <div className="glass rounded-xl p-4 border-l-4 border-[#ef4444] bg-[#ef4444]/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[#ef4444] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-gray-900 dark:text-white mb-1">
                {stats.overdue} formation{stats.overdue > 1 ? 's' : ''} en retard !
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Les formations suivantes dépassent leur date de validité. Action requise immédiatement.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Training Table */}
      <div className="glass rounded-2xl p-6 overflow-x-auto">
        <div className="mb-4 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-300" />
            <span>Ligne grisée = Date future (non modifiable)</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Code</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Formation</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Collaborateur</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Service</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Fréquence</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Dernière date</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Prochaine date</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Preuve</th>
            </tr>
          </thead>
          <tbody>
            {trainings.map((training) => {
              const StatusIcon = getStatusIcon(training.status);
              const disabled = isRowDisabled(training);
              
              return (
                <tr 
                  key={training.id}
                  className={`
                    border-b border-gray-100 dark:border-gray-800 
                    ${disabled 
                      ? 'bg-gray-200 dark:bg-gray-800 opacity-60' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }
                    transition-colors
                  `}
                >
                  <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900 dark:text-white">
                    {training.code}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {training.title}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {training.employee}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {training.department}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {training.frequency}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(training.lastDate).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(training.nextDate).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center">
                      <span className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(training.status)}`}>
                        <StatusIcon className="w-3 h-3" />
                        {getStatusLabel(training.status)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center">
                      {training.proof ? (
                        <button className="flex items-center gap-1 px-3 py-1 bg-[#10b981]/10 text-[#10b981] rounded-lg text-xs font-medium hover:scale-105 transition-all">
                          <CheckCircle className="w-3 h-3" />
                          Voir
                        </button>
                      ) : uploadingFor === training.id ? (
                        <div className="px-3 py-1 text-xs text-gray-500">
                          Upload...
                        </div>
                      ) : disabled ? (
                        <span className="text-xs text-gray-400">-</span>
                      ) : (
                        <button
                          onClick={() => handleUploadProof(training.id)}
                          className="flex items-center gap-1 px-3 py-1 bg-[#6366f1]/10 text-[#6366f1] rounded-lg text-xs font-medium hover:scale-105 transition-all"
                        >
                          <FileUp className="w-3 h-3" />
                          Upload
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Workflow Info */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Workflow de validation</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              1
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Planification</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Le RQ planifie la formation selon la fréquence réglementaire</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              2
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Réalisation</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Le collaborateur suit la formation et obtient son attestation</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              3
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Upload preuve obligatoire</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Certificat ou attestation à télécharger (PDF, JPG)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#10b981] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              ✓
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Validation</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Statut passe automatiquement à "Effectuée"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
