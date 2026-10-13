import { useState } from 'react';
import { Eye, EyeOff, Check, X, Shield } from 'lucide-react';

interface OnboardingPasswordProps {
  onComplete: () => void;
}

export default function OnboardingPassword({ onComplete }: OnboardingPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordRules = [
    { text: 'Au moins 8 caractères', test: (p: string) => p.length >= 8 },
    { text: 'Une lettre majuscule', test: (p: string) => /[A-Z]/.test(p) },
    { text: 'Une lettre minuscule', test: (p: string) => /[a-z]/.test(p) },
    { text: 'Un chiffre', test: (p: string) => /\d/.test(p) },
    { text: 'Un caractère spécial (!@#$%^&*)', test: (p: string) => /[!@#$%^&*]/.test(p) }
  ];

  const allRulesPassed = passwordRules.every(rule => rule.test(password));
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSubmit = allRulesPassed && passwordsMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      onComplete();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#6366f1]/5 dark:from-gray-950 dark:via-gray-900 dark:to-[#6366f1]/10 flex items-center justify-center p-6">
      <div className="max-w-md w-full animate-[fadeIn_0.5s_ease]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6366f1] to-[#818cf8] rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Sécurisez votre compte
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Créez un mot de passe fort pour votre première connexion
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 shadow-xl">
          {/* Password Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez votre mot de passe"
                required
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Password Rules */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Exigences du mot de passe:
            </p>
            <div className="space-y-2">
              {passwordRules.map((rule, index) => {
                const passed = rule.test(password);
                return (
                  <div key={index} className="flex items-center gap-2">
                    {passed ? (
                      <Check className="w-4 h-4 text-[#10b981]" />
                    ) : (
                      <X className="w-4 h-4 text-gray-400" />
                    )}
                    <span className={`text-sm ${
                      passed 
                        ? 'text-[#10b981] font-medium' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {rule.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                required
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showConfirm ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {passwordsMatch ? (
                  <>
                    <Check className="w-4 h-4 text-[#10b981]" />
                    <span className="text-sm text-[#10b981] font-medium">
                      Les mots de passe correspondent
                    </span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-[#ef4444]" />
                    <span className="text-sm text-[#ef4444]">
                      Les mots de passe ne correspondent pas
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`
              w-full py-4 font-bold rounded-xl shadow-lg transition-all duration-200
              ${canSubmit
                ? 'bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white shadow-[#6366f1]/30 hover:shadow-xl hover:scale-[1.02]'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }
            `}
          >
            Valider et continuer
          </button>
        </form>

        {/* Security Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            🔒 Votre mot de passe est chiffré et sécurisé
          </p>
        </div>
      </div>
    </div>
  );
}
