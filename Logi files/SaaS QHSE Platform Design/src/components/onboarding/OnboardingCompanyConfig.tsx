import { useState } from 'react';
import { Building2, Check, Sparkles } from 'lucide-react';

interface OnboardingCompanyConfigProps {
  onComplete: () => void;
}

export default function OnboardingCompanyConfig({ onComplete }: OnboardingCompanyConfigProps) {
  const [activity, setActivity] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const suggestions = [
    'Conseil en QHSE',
    'Industrie manufacturière',
    'Construction et BTP',
    'Services professionnels',
    'Santé et médical',
    'Transport et logistique',
    'Agroalimentaire',
    'Chimie et pharmaceutique'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activity.trim()) {
      setShowSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 1500);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#6366f1] via-[#818cf8] to-[#10b981] flex items-center justify-center p-6">
        <div className="text-center animate-[scaleIn_0.5s_ease]">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-full mb-6">
            <Check className="w-12 h-12 text-[#10b981]" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Configuration terminée ! ✨
          </h1>
          <p className="text-xl text-white/90">
            Votre entreprise est prête
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#6366f1]/5 dark:from-gray-950 dark:via-gray-900 dark:to-[#6366f1]/10 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full animate-[fadeIn_0.5s_ease]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6366f1] to-[#818cf8] rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Configurez votre entreprise
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Dernière étape avant d'accéder à votre tableau de bord
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 shadow-xl">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Domaine d'activité principal *
            </label>
            <input
              type="text"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="Ex: Conseil en QHSE, Industrie manufacturière..."
              required
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Cette information nous aide à personnaliser votre expérience
            </p>
          </div>

          {/* Suggestions */}
          <div className="mb-8">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Suggestions:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setActivity(suggestion)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-[#6366f1]/10 dark:hover:bg-[#6366f1]/20 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:text-[#6366f1] transition-all duration-200 hover:scale-105"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* AI Suggestion */}
          <div className="mb-6 p-4 bg-gradient-to-r from-[#6366f1]/10 to-[#818cf8]/10 rounded-xl border border-[#6366f1]/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#6366f1] flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-gray-900 dark:text-white mb-1">
                  Assistant IA Grok disponible
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  Notre IA vous aidera à configurer vos processus QHSE selon votre secteur d'activité
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!activity.trim()}
            className={`
              w-full py-4 font-bold rounded-xl shadow-lg transition-all duration-200
              ${activity.trim()
                ? 'bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white shadow-[#6366f1]/30 hover:shadow-xl hover:scale-[1.02]'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }
            `}
          >
            Valider et accéder à mon tableau de bord
          </button>
        </form>

        {/* Progress Indicator */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10b981]" />
          <div className="w-2 h-2 rounded-full bg-[#10b981]" />
          <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
        </div>
      </div>
    </div>
  );
}
