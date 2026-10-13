export default function Leadership() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      <div>
        <h1 className="text-gray-900 dark:text-white mb-2">Point 5 - Leadership</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Politique QHSE, rôles et responsabilités
        </p>
      </div>

      <div className="glass rounded-2xl p-8">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Politique QHSE 2026</h3>
        <div className="prose dark:prose-invert max-w-none">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Notre entreprise s'engage à maintenir les plus hauts standards en matière de Qualité, 
            Hygiène, Sécurité et Environnement.
          </p>
          <ul className="space-y-2 text-gray-600 dark:text-gray-400">
            <li>✓ Conformité aux normes ISO 9001, 14001, 45001</li>
            <li>✓ Protection de la santé et sécurité de nos collaborateurs</li>
            <li>✓ Réduction de notre impact environnemental</li>
            <li>✓ Amélioration continue de nos processus</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
