import { useState } from 'react';
import { Upload, Download, CheckCircle, AlertTriangle, Users } from 'lucide-react';

interface Employee {
  nom: string;
  prenom: string;
  email: string;
  poste: string;
  service: string;
  statut: string;
}

export default function EmployeeImport() {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const sampleData: Employee[] = [
    { nom: 'Dupont', prenom: 'Jean', email: 'jean.dupont@entreprise.fr', poste: 'Technicien', service: 'Production', statut: 'Actif' },
    { nom: 'Martin', prenom: 'Marie', email: 'marie.martin@entreprise.fr', poste: 'Responsable QHSE', service: 'Qualité', statut: 'Actif' },
    { nom: 'Bernard', prenom: 'Sophie', email: 'sophie.bernard@entreprise.fr', poste: 'Chef de projet', service: 'Management', statut: 'Actif' }
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setErrors([]);

    // Simulate import process
    setTimeout(() => {
      // Simulate validation errors
      const validationErrors: string[] = [];
      
      if (Math.random() > 0.7) {
        validationErrors.push('Ligne 5: Email invalide');
        validationErrors.push('Ligne 12: Service non reconnu');
      }

      setErrors(validationErrors);
      setImporting(false);
      
      if (validationErrors.length === 0) {
        setImported(true);
        setTimeout(() => setImported(false), 3000);
      }
    }, 2000);
  };

  const downloadTemplate = () => {
    // In a real app, this would download an actual Excel file
    alert('Téléchargement du modèle Excel...\n\nColonnes requises:\n- Nom\n- Prénom\n- Email\n- Poste\n- Service\n- Statut');
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Import de Collaborateurs</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Importez vos collaborateurs en masse via fichier Excel
        </p>
      </div>

      {/* Download Template */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">1. Téléchargez le modèle</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Commencez par télécharger notre modèle Excel avec les colonnes requises
            </p>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-6 py-3 bg-[#6366f1] text-white rounded-xl hover:scale-105 transition-all"
            >
              <Download className="w-4 h-4" />
              Télécharger le modèle Excel
            </button>
          </div>
        </div>
      </div>

      {/* Upload File */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center flex-shrink-0">
            <Upload className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">2. Importez votre fichier</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Remplissez le modèle et importez-le ici
            </p>
            
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={importing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <button
                disabled={importing}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-medium rounded-xl shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Import en cours...' : 'Sélectionner le fichier'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {imported && (
        <div className="glass rounded-xl p-4 border-l-4 border-[#10b981] bg-[#10b981]/5 animate-[scaleIn_0.2s_ease]">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-[#10b981] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-gray-900 dark:text-white mb-1">
                Import réussi !
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {sampleData.length} collaborateurs ont été importés avec succès
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="glass rounded-xl p-4 border-l-4 border-[#ef4444] bg-[#ef4444]/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[#ef4444] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-gray-900 dark:text-white mb-2">
                {errors.length} erreur{errors.length > 1 ? 's' : ''} détectée{errors.length > 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                    • {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-[#6366f1]" />
          <h3 className="font-bold text-gray-900 dark:text-white">
            Aperçu des données (modèle)
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Nom</th>
                <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Prénom</th>
                <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Email</th>
                <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Poste</th>
                <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Service</th>
                <th className="text-center py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((emp, index) => (
                <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{emp.nom}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{emp.prenom}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{emp.email}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{emp.poste}</td>
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{emp.service}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center">
                      <span className="px-3 py-1 bg-[#10b981]/10 text-[#10b981] rounded-lg text-xs font-medium">
                        {emp.statut}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructions */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Instructions</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] font-bold">•</span>
            <span>Le fichier doit être au format Excel (.xlsx) ou CSV</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] font-bold">•</span>
            <span>Les colonnes Nom, Prénom, Email sont obligatoires</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] font-bold">•</span>
            <span>Les emails doivent être uniques et valides</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] font-bold">•</span>
            <span>Le système vérifie automatiquement les doublons</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] font-bold">•</span>
            <span>Un email d'invitation sera envoyé à chaque collaborateur</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
