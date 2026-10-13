export default function Evaluation() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Point 9 - Évaluation</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Surveillance, mesure et audits internes
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">12</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Indicateurs suivis</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">4</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Audits réalisés</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">2</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Revues de direction</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Prochains Audits</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                <span className="text-[#6366f1] font-bold">Q</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Audit ISO 9001</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Prévu le 25/03/2026</p>
              </div>
            </div>
            <span className="px-4 py-2 bg-[#6366f1]/10 text-[#6366f1] rounded-lg text-sm font-medium">
              Dans 44 jours
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                <span className="text-[#10b981] font-bold">E</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Audit ISO 14001</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Prévu le 15/04/2026</p>
              </div>
            </div>
            <span className="px-4 py-2 bg-[#10b981]/10 text-[#10b981] rounded-lg text-sm font-medium">
              Dans 65 jours
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
