import { useState } from 'react';
import { FileText, Tag, Layers, Target, GitBranch, Hash, CheckCircle } from 'lucide-react';

interface DocumentMetadataFormProps {
  onSubmit: (metadata: DocumentMetadata) => void;
  onCancel: () => void;
}

export interface DocumentMetadata {
  type: string;
  level: string;
  process: string;
  axis: string[];
  version: string;
  status: string;
}

export default function DocumentMetadataForm({ onSubmit, onCancel }: DocumentMetadataFormProps) {
  const [metadata, setMetadata] = useState<DocumentMetadata>({
    type: '',
    level: '',
    process: '',
    axis: [],
    version: '1.0',
    status: 'draft'
  });

  const documentTypes = [
    'Procédure',
    'Instruction de travail',
    'Enregistrement',
    'Formulaire',
    'Plan',
    'Rapport',
    'Politique'
  ];

  const levels = [
    'Niveau 1 - Direction',
    'Niveau 2 - Management',
    'Niveau 3 - Opérationnel',
    'Niveau 4 - Support'
  ];

  const processes = [
    'Management',
    'Production',
    'Maintenance',
    'Logistique',
    'Qualité',
    'Environnement',
    'Sécurité',
    'Ressources Humaines'
  ];

  const axes = [
    'ISO 9001 - Qualité',
    'ISO 14001 - Environnement',
    'ISO 45001 - SST'
  ];

  const statuses = [
    { value: 'draft', label: 'Brouillon', color: 'bg-gray-300 text-gray-700' },
    { value: 'review', label: 'En révision', color: 'bg-[#f59e0b] text-white' },
    { value: 'approved', label: 'Approuvé', color: 'bg-[#10b981] text-white' },
    { value: 'obsolete', label: 'Obsolète', color: 'bg-[#ef4444] text-white' }
  ];

  const handleAxisToggle = (axis: string) => {
    setMetadata(prev => ({
      ...prev,
      axis: prev.axis.includes(axis)
        ? prev.axis.filter(a => a !== axis)
        : [...prev.axis, axis]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(metadata);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease]">
      <form 
        onSubmit={handleSubmit}
        className="glass rounded-2xl p-8 max-w-2xl w-full shadow-2xl animate-[scaleIn_0.2s_ease] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Métadonnées du document</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Complétez les informations requises</p>
          </div>
        </div>

        {/* Type de document */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Tag className="w-4 h-4" />
            Type de document *
          </label>
          <select
            value={metadata.type}
            onChange={(e) => setMetadata({ ...metadata, type: e.target.value })}
            required
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
          >
            <option value="">Sélectionner un type</option>
            {documentTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Niveau */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Layers className="w-4 h-4" />
            Niveau hiérarchique *
          </label>
          <select
            value={metadata.level}
            onChange={(e) => setMetadata({ ...metadata, level: e.target.value })}
            required
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
          >
            <option value="">Sélectionner un niveau</option>
            {levels.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>

        {/* Processus */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <GitBranch className="w-4 h-4" />
            Processus concerné *
          </label>
          <select
            value={metadata.process}
            onChange={(e) => setMetadata({ ...metadata, process: e.target.value })}
            required
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
          >
            <option value="">Sélectionner un processus</option>
            {processes.map((process) => (
              <option key={process} value={process}>{process}</option>
            ))}
          </select>
        </div>

        {/* Axes ISO */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            <Target className="w-4 h-4" />
            Axes ISO concernés *
          </label>
          <div className="space-y-2">
            {axes.map((axis) => (
              <label
                key={axis}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={metadata.axis.includes(axis)}
                  onChange={() => handleAxisToggle(axis)}
                  className="w-5 h-5 text-[#6366f1] border-gray-300 rounded focus:ring-[#6366f1]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{axis}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Version */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Hash className="w-4 h-4" />
            Version
          </label>
          <input
            type="text"
            value={metadata.version}
            onChange={(e) => setMetadata({ ...metadata, version: e.target.value })}
            placeholder="1.0"
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
          />
        </div>

        {/* Statut */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            <CheckCircle className="w-4 h-4" />
            Statut *
          </label>
          <div className="grid grid-cols-2 gap-3">
            {statuses.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setMetadata({ ...metadata, status: status.value })}
                className={`
                  px-4 py-3 rounded-xl font-medium text-sm transition-all
                  ${metadata.status === status.value
                    ? status.color + ' scale-105 shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                `}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="flex-1 px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white font-bold rounded-xl shadow-lg shadow-[#6366f1]/30 hover:scale-105 transition-all"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
