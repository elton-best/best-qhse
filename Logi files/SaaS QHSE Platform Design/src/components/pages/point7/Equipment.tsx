import { useState } from 'react';
import { Plus, Upload, Download, Calendar, AlertTriangle, CheckCircle, Clock, FileUp } from 'lucide-react';

interface Equipment {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  status: 'operational' | 'maintenance' | 'broken';
  lastMaintenance: string;
  nextMaintenance: string;
  daysUntil: number;
  proof?: string;
}

export default function Equipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([
    {
      id: '1',
      code: 'EQP-001',
      name: 'Chariot élévateur Fenwick',
      category: 'Manutention',
      location: 'Entrepôt A',
      status: 'operational',
      lastMaintenance: '2025-12-15',
      nextMaintenance: '2026-03-15',
      daysUntil: 34,
      proof: 'rapport-maintenance-001.pdf'
    },
    {
      id: '2',
      code: 'EQP-002',
      name: 'Extincteur CO2',
      category: 'Sécurité incendie',
      location: 'Bureau étage 2',
      status: 'operational',
      lastMaintenance: '2025-11-01',
      nextMaintenance: '2026-11-01',
      daysUntil: 265,
      proof: 'verif-extincteur-002.pdf'
    },
    {
      id: '3',
      code: 'EQP-003',
      name: 'Compresseur Atlas Copco',
      category: 'Production',
      location: 'Atelier mécanique',
      status: 'maintenance',
      lastMaintenance: '2025-10-20',
      nextMaintenance: '2026-01-20',
      daysUntil: -20,
      proof: undefined
    },
    {
      id: '4',
      code: 'EQP-004',
      name: 'Pont roulant 5T',
      category: 'Manutention',
      location: 'Hall production',
      status: 'operational',
      lastMaintenance: '2026-01-05',
      nextMaintenance: '2026-07-05',
      daysUntil: 146,
      proof: 'controle-pont-004.pdf'
    },
    {
      id: '5',
      code: 'EQP-005',
      name: 'Détecteur fumée zone A',
      category: 'Sécurité incendie',
      location: 'Production zone A',
      status: 'broken',
      lastMaintenance: '2025-09-15',
      nextMaintenance: '2026-02-15',
      daysUntil: -5,
      proof: undefined
    }
  ]);

  const [showCalendar, setShowCalendar] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'bg-[#10b981]/10 text-[#10b981]';
      case 'maintenance': return 'bg-[#f59e0b]/10 text-[#f59e0b]';
      case 'broken': return 'bg-[#ef4444]/10 text-[#ef4444]';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'operational': return 'Opérationnel';
      case 'maintenance': return 'Maintenance';
      case 'broken': return 'Hors service';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational': return CheckCircle;
      case 'maintenance': return Clock;
      case 'broken': return AlertTriangle;
      default: return CheckCircle;
    }
  };

  const getDaysColor = (days: number) => {
    if (days < 0) return 'text-[#ef4444] font-bold'; // Overdue
    if (days <= 10) return 'text-[#f59e0b] font-bold'; // Warning
    return 'text-gray-900 dark:text-white';
  };

  const handleUploadProof = (equipmentId: string) => {
    setUploadingFor(equipmentId);
    // Simulate file upload
    setTimeout(() => {
      setEquipment(prev => prev.map(eq => 
        eq.id === equipmentId 
          ? { ...eq, proof: `preuve-${equipmentId}.pdf` }
          : eq
      ));
      setUploadingFor(null);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 dark:text-white mb-2">Point 7.1 - Ressources & Équipements</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Inventaire codifié et plan de maintenance
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
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] text-white rounded-xl hover:scale-105 transition-all"
          >
            <Calendar className="w-4 h-4" />
            Calendrier
          </button>
          <button className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-medium rounded-xl shadow-lg hover:scale-105 transition-all">
            <Plus className="w-5 h-5" />
            Nouvel Équipement
          </button>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 border-l-4 border-[#ef4444]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-[#ef4444]" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">2</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Maintenances en retard</p>
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 border-l-4 border-[#f59e0b]">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-[#f59e0b]" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">1</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">À prévoir sous 10 jours</p>
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 border-l-4 border-[#10b981]">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-[#10b981]" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">2</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Opérationnels</p>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="glass rounded-2xl p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Code</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Équipement</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Catégorie</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Localisation</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Dernière Maintenance</th>
              <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Prochaine Maintenance</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Jours restants</th>
              <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Preuve</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => {
              const StatusIcon = getStatusIcon(eq.status);
              return (
                <tr 
                  key={eq.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-3 px-4 text-sm font-mono font-medium text-gray-900 dark:text-white">{eq.code}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 font-medium">{eq.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{eq.category}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{eq.location}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center">
                      <span className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(eq.status)}`}>
                        <StatusIcon className="w-3 h-3" />
                        {getStatusLabel(eq.status)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(eq.lastMaintenance).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(eq.nextMaintenance).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-sm font-medium ${getDaysColor(eq.daysUntil)}`}>
                      {eq.daysUntil < 0 ? `En retard (${Math.abs(eq.daysUntil)}j)` : `${eq.daysUntil}j`}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center">
                      {eq.proof ? (
                        <button className="flex items-center gap-1 px-3 py-1 bg-[#10b981]/10 text-[#10b981] rounded-lg text-xs font-medium hover:scale-105 transition-all">
                          <CheckCircle className="w-3 h-3" />
                          Voir
                        </button>
                      ) : uploadingFor === eq.id ? (
                        <div className="px-3 py-1 text-xs text-gray-500">
                          Upload...
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUploadProof(eq.id)}
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

      {/* Calendar View (simplified) */}
      {showCalendar && (
        <div className="glass rounded-2xl p-6 animate-[scaleIn_0.2s_ease]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Planning de Maintenance - Février 2026</h3>
            <button
              onClick={() => setShowCalendar(false)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Fermer
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
              <div key={day} className="text-center text-sm font-bold text-gray-700 dark:text-gray-300 py-2">
                {day}
              </div>
            ))}
            
            {[...Array(28)].map((_, i) => {
              const day = i + 1;
              const hasEvent = day === 15 || day === 20;
              return (
                <div
                  key={i}
                  className={`
                    aspect-square rounded-lg flex flex-col items-center justify-center text-sm
                    ${hasEvent 
                      ? 'bg-[#6366f1] text-white font-bold cursor-pointer hover:scale-105' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }
                    transition-all
                  `}
                >
                  <span>{day}</span>
                  {hasEvent && <span className="text-[10px] mt-1">🔧</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
