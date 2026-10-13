export default function Operations() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Point 8 - Réalisation</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Maîtrise opérationnelle et actions d'urgence
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Maîtrise Opérationnelle</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Production en conformité</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Contrôles qualité OK</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Procédures respectées</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">Actions d'Urgence</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#ef4444]/10 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[#ef4444] text-white flex items-center justify-center text-xs font-bold">
                !
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Plan d'urgence incendie</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Dernière révision: 15/01/2026</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[#f59e0b]/10 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[#f59e0b] text-white flex items-center justify-center text-xs font-bold">
                !
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Procédure évacuation</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Dernière révision: 10/01/2026</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
