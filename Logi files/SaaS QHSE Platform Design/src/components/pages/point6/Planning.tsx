export default function Planning() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Point 6 - Planification</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Objectifs et indicateurs QHSE
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Objectifs Qualité</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Satisfaction client</span>
              <span className="font-bold text-[#10b981]">92%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Taux non-conformité</span>
              <span className="font-bold text-[#10b981]">{'<'}2%</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Objectifs Environnement</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Réduction CO2</span>
              <span className="font-bold text-[#10b981]">-15%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Recyclage déchets</span>
              <span className="font-bold text-[#10b981]">85%</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Objectifs SST</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Zéro accident</span>
              <span className="font-bold text-[#10b981]">0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Taux formation</span>
              <span className="font-bold text-[#10b981]">100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
