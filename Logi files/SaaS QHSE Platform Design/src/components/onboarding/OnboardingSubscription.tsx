import { useState } from 'react';
import { Check, Sparkles, Shield, Leaf, Heart, Zap } from 'lucide-react';

interface OnboardingSubscriptionProps {
  onComplete: (selectedNorms: string[], totalPrice: number) => void;
}

export default function OnboardingSubscription({ onComplete }: OnboardingSubscriptionProps) {
  const [selectedNorms, setSelectedNorms] = useState<string[]>(['iso-9001']);

  const norms = [
    {
      id: 'iso-9001',
      name: 'ISO 9001',
      title: 'Management de la Qualité',
      icon: Shield,
      color: '#6366f1',
      price: 150,
      description: 'Améliorer la satisfaction client et la qualité des produits/services',
      features: [
        'Processus de management qualité',
        'Amélioration continue',
        'Satisfaction client',
        'Audit qualité',
        'Documentation qualité'
      ]
    },
    {
      id: 'iso-14001',
      name: 'ISO 14001',
      title: 'Management Environnemental',
      icon: Leaf,
      color: '#10b981',
      price: 150,
      description: 'Gérer l\'impact environnemental et réduire l\'empreinte écologique',
      features: [
        'Gestion environnementale',
        'Réduction des déchets',
        'Conformité réglementaire',
        'Bilan carbone',
        'Économie circulaire'
      ]
    },
    {
      id: 'iso-45001',
      name: 'ISO 45001',
      title: 'Santé et Sécurité au Travail',
      icon: Heart,
      color: '#ef4444',
      price: 150,
      description: 'Protéger la santé et sécurité des travailleurs',
      features: [
        'Prévention des risques',
        'Santé au travail',
        'Accidents du travail',
        'Équipements de protection',
        'Formation sécurité'
      ]
    },
    {
      id: 'iso-50001',
      name: 'ISO 50001',
      title: 'Management de l\'Énergie',
      icon: Zap,
      color: '#f59e0b',
      price: 150,
      description: 'Optimiser la consommation énergétique et réduire les coûts',
      features: [
        'Efficacité énergétique',
        'Réduction des coûts',
        'Performance énergétique',
        'Énergies renouvelables',
        'Tableau de bord énergie'
      ]
    }
  ];

  const toggleNorm = (normId: string) => {
    if (selectedNorms.includes(normId)) {
      // Empêcher de tout désélectionner
      if (selectedNorms.length > 1) {
        setSelectedNorms(selectedNorms.filter(id => id !== normId));
      }
    } else {
      setSelectedNorms([...selectedNorms, normId]);
    }
  };

  const calculateTotalPrice = () => {
    const basePrice = 150;
    const count = selectedNorms.length;
    
    // Remise progressive
    if (count === 4) return basePrice * 4 * 0.7; // -30% pour les 4
    if (count === 3) return basePrice * 3 * 0.8; // -20% pour 3
    if (count === 2) return basePrice * 2 * 0.9; // -10% pour 2
    return basePrice; // Prix normal pour 1
  };

  const totalPrice = calculateTotalPrice();
  const savedAmount = (150 * selectedNorms.length) - totalPrice;

  const handleSubscribe = () => {
    onComplete(selectedNorms, totalPrice);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#6366f1]/5 dark:from-gray-950 dark:via-gray-900 dark:to-[#6366f1]/10 flex items-center justify-center p-4 md:p-6">
      <div className="max-w-7xl w-full animate-[fadeIn_0.5s_ease]">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1]/10 rounded-full mb-4">
            <Sparkles className="w-4 h-4 text-[#6366f1]" />
            <span className="text-sm font-medium text-[#6366f1]">Bienvenue sur SMI QHSE</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Sélectionnez vos normes ISO
          </h1>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Choisissez une ou plusieurs normes pour votre système de management intégré. 
            <span className="block mt-1 font-medium text-[#10b981]">
              Plus vous choisissez de normes, plus vous économisez !
            </span>
          </p>
        </div>

        {/* Norms Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          {norms.map((norm) => {
            const Icon = norm.icon;
            const isSelected = selectedNorms.includes(norm.id);
            
            return (
              <div
                key={norm.id}
                onClick={() => toggleNorm(norm.id)}
                className={`
                  relative glass rounded-2xl p-6 cursor-pointer
                  transition-all duration-300 hover:scale-[1.02]
                  ${isSelected
                    ? 'ring-2 shadow-xl'
                    : 'hover:shadow-lg opacity-80'
                  }
                `}
                style={{
                  ringColor: isSelected ? norm.color : 'transparent',
                  boxShadow: isSelected ? `0 20px 40px ${norm.color}20` : ''
                }}
              >
                {/* Checkbox indicator */}
                <div className="absolute top-4 right-4">
                  <div 
                    className={`
                      w-6 h-6 rounded-md border-2 flex items-center justify-center
                      transition-all duration-200
                      ${isSelected
                        ? 'border-transparent'
                        : 'border-gray-300 dark:border-gray-600'
                      }
                    `}
                    style={{
                      backgroundColor: isSelected ? norm.color : 'transparent'
                    }}
                  >
                    {isSelected && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                </div>

                {/* Icon */}
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${norm.color}15` }}
                >
                  <Icon className="w-7 h-7" style={{ color: norm.color }} />
                </div>

                {/* Content */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    {norm.name}
                  </h3>
                  <p className="text-sm font-medium mb-2" style={{ color: norm.color }}>
                    {norm.title}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {norm.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {norm.price}€
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                      /mois
                    </span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2">
                  {norm.features.slice(0, 3).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: norm.color }} />
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Summary & Action */}
        <div className="glass rounded-2xl p-6 md:p-8 shadow-xl max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Summary */}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Récapitulatif de votre sélection
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {selectedNorms.length} {selectedNorms.length > 1 ? 'normes sélectionnées' : 'norme sélectionnée'}
              </p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedNorms.map(normId => {
                  const norm = norms.find(n => n.id === normId);
                  if (!norm) return null;
                  return (
                    <span 
                      key={normId}
                      className="px-3 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: norm.color }}
                    >
                      {norm.name}
                    </span>
                  );
                })}
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                    {Math.round(totalPrice)}€
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">/mois</span>
                </div>
                {savedAmount > 0 && (
                  <p className="text-sm font-medium text-[#10b981]">
                    Vous économisez {Math.round(savedAmount)}€/mois
                    {selectedNorms.length === 4 && ' (-30%)'}
                    {selectedNorms.length === 3 && ' (-20%)'}
                    {selectedNorms.length === 2 && ' (-10%)'}
                  </p>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubscribe}
                className="px-8 py-4 bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white font-bold rounded-xl shadow-lg shadow-[#6366f1]/30 hover:shadow-xl hover:scale-105 transition-all duration-200 whitespace-nowrap"
              >
                Continuer
              </button>
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                14 jours d'essai gratuit
              </p>
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">14 jours</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Essai gratuit</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Sans engagement</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Annulation libre</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Support 24/7</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Assistance incluse</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          💡 Astuce : Sélectionnez les 4 normes pour une économie maximale de 30%
        </p>
      </div>
    </div>
  );
}
