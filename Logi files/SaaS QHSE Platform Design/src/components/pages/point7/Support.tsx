export default function Support() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Point 7 - Support</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestion documentaire et ressources
        </p>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Documents QHSE</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:scale-[1.02] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center text-white text-xl">
                📄
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Procédures</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">24 documents</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:scale-[1.02] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-white text-xl">
                📋
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Instructions</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">38 documents</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:scale-[1.02] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-white text-xl">
                📊
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Enregistrements</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">156 documents</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:scale-[1.02] transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ef4444] to-[#dc2626] flex items-center justify-center text-white text-xl">
                ⚠️
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Consignes Sécurité</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">12 documents</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
