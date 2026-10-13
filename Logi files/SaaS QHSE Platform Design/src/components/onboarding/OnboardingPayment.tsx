import { useState } from 'react';
import { CreditCard, Lock, PartyPopper, Smartphone, Phone } from 'lucide-react';

interface OnboardingPaymentProps {
  onComplete: () => void;
}

export default function OnboardingPayment({ onComplete }: OnboardingPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<'mobile-money' | 'card'>('mobile-money');
  
  // Mobile Money fields
  const [mobileOperator, setMobileOperator] = useState('mtn');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileName, setMobileName] = useState('');
  
  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  
  const [showSuccess, setShowSuccess] = useState(false);

  const operators = [
    { id: 'mtn', name: 'MTN Mobile Money', countries: ['Bénin', 'Togo'], color: '#FFCC00' },
    { id: 'moov', name: 'Moov Money', countries: ['Bénin', 'Togo'], color: '#009FE3' },
    { id: 'togocel', name: 'Togocel Cash', countries: ['Togo'], color: '#E30613' },
    { id: 'celtiis', name: 'Celtiis Cash', countries: ['Bénin'], color: '#FF6B00' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccess(true);
    
    // Confetti animation and redirect
    setTimeout(() => {
      onComplete();
    }, 2000);
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    return formatted.substring(0, 19);
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.substring(0, 2)}/${cleaned.substring(2, 4)}`;
    }
    return cleaned;
  };

  const formatMobileNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned.substring(0, 10);
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#6366f1] via-[#818cf8] to-[#10b981] flex items-center justify-center p-6">
        <div className="text-center animate-[scaleIn_0.5s_ease]">
          <div className="inline-flex items-center justify-center w-32 h-32 bg-white rounded-full mb-6 animate-bounce">
            <PartyPopper className="w-16 h-16 text-[#6366f1]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Bienvenue ! 🎉
          </h1>
          <p className="text-xl text-white/90 mb-2">
            Votre essai gratuit est activé
          </p>
          <p className="text-white/70">
            Redirection vers votre tableau de bord...
          </p>
          
          {/* Confetti animation */}
          <div className="fixed inset-0 pointer-events-none">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white rounded-full animate-[fadeIn_2s_ease]"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  opacity: Math.random() * 0.7 + 0.3
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#6366f1]/5 dark:from-gray-950 dark:via-gray-900 dark:to-[#6366f1]/10 flex items-center justify-center p-4 md:p-6">
      <div className="max-w-3xl w-full animate-[fadeIn_0.5s_ease]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1]/10 rounded-full mb-4">
            <Lock className="w-5 h-5 text-[#6366f1]" />
            <span className="text-sm md:text-base font-medium text-[#6366f1]">Paiement sécurisé</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Informations de paiement
          </h1>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400">
            Aucun prélèvement pendant les 14 jours d'essai
          </p>
        </div>

        {/* Payment Method Selector */}
        <div className="mb-6">
          <label className="block text-base md:text-lg font-bold text-gray-900 dark:text-white mb-4">
            Choisissez votre mode de paiement
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setPaymentMethod('mobile-money')}
              className={`
                flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200
                ${paymentMethod === 'mobile-money'
                  ? 'border-[#6366f1] bg-[#6366f1]/5 shadow-lg shadow-[#6366f1]/20'
                  : 'border-gray-300 dark:border-gray-700 hover:border-[#6366f1]/50'
                }
              `}
            >
              <Smartphone className="w-10 h-10 text-[#6366f1]" />
              <div className="text-center">
                <div className="font-bold text-gray-900 dark:text-white text-lg mb-1">
                  Mobile Money
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  MTN, Moov, etc.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`
                flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200
                ${paymentMethod === 'card'
                  ? 'border-[#6366f1] bg-[#6366f1]/5 shadow-lg shadow-[#6366f1]/20'
                  : 'border-gray-300 dark:border-gray-700 hover:border-[#6366f1]/50'
                }
              `}
            >
              <CreditCard className="w-10 h-10 text-[#6366f1]" />
              <div className="text-center">
                <div className="font-bold text-gray-900 dark:text-white text-lg mb-1">
                  Carte Visa
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Paiement sécurisé
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 md:p-8 shadow-xl">
          {paymentMethod === 'mobile-money' ? (
            <>
              {/* Mobile Money Form */}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <Smartphone className="w-6 h-6 text-[#6366f1]" />
                Paiement Mobile Money
              </h2>

              {/* Operator Selection */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-4">
                  Sélectionnez votre opérateur
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {operators.map((operator) => (
                    <button
                      key={operator.id}
                      type="button"
                      onClick={() => setMobileOperator(operator.id)}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 text-left
                        ${mobileOperator === operator.id
                          ? 'border-[#6366f1] bg-[#6366f1]/5 shadow-md'
                          : 'border-gray-300 dark:border-gray-700 hover:border-[#6366f1]/50'
                        }
                      `}
                    >
                      <div className="font-bold text-gray-900 dark:text-white text-base mb-1">
                        {operator.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {operator.countries.join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Number */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Numéro de téléphone
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(formatMobileNumber(e.target.value))}
                    placeholder="97 12 34 56"
                    required
                    className="w-full px-5 py-4 pl-14 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                  />
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Entrez votre numéro sans indicatif pays
                </p>
              </div>

              {/* Name */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={mobileName}
                  onChange={(e) => setMobileName(e.target.value)}
                  placeholder="Jean Dupont"
                  required
                  className="w-full px-5 py-4 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                />
              </div>

              {/* Info Notice */}
              <div className="flex items-start gap-3 p-4 bg-[#6366f1]/10 rounded-xl mb-6">
                <Smartphone className="w-6 h-6 text-[#6366f1] flex-shrink-0 mt-1" />
                <div className="text-sm md:text-base">
                  <p className="font-bold text-gray-900 dark:text-white mb-2">
                    Comment ça marche ?
                  </p>
                  <ol className="text-gray-700 dark:text-gray-300 space-y-1 list-decimal list-inside">
                    <li>Vous recevrez un code USSD sur votre téléphone</li>
                    <li>Composez le code pour confirmer le paiement</li>
                    <li>Entrez votre code PIN Mobile Money</li>
                    <li>Votre abonnement sera activé instantanément</li>
                  </ol>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Card Payment Form */}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-[#6366f1]" />
                Paiement par Carte Visa
              </h2>

              {/* Card Number */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Numéro de carte
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    required
                    className="w-full px-5 py-4 pl-14 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                  />
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                </div>
              </div>

              {/* Expiry & CVV */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                    Date d'expiration
                  </label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/AA"
                    maxLength={5}
                    required
                    className="w-full px-5 py-4 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 3))}
                    placeholder="123"
                    maxLength={3}
                    required
                    className="w-full px-5 py-4 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Cardholder Name */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Titulaire de la carte
                </label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Jean Dupont"
                  required
                  className="w-full px-5 py-4 text-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                />
              </div>
            </>
          )}

          {/* Security Notice */}
          <div className="flex items-start gap-3 p-5 bg-[#10b981]/10 rounded-xl mb-6">
            <Lock className="w-6 h-6 text-[#10b981] flex-shrink-0 mt-1" />
            <div className="text-sm md:text-base">
              <p className="font-bold text-gray-900 dark:text-white mb-1">
                Vos données sont protégées
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Nous utilisons le chiffrement SSL 256-bit et ne stockons jamais vos informations de paiement.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-5 text-lg bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white font-bold rounded-xl shadow-lg shadow-[#6366f1]/30 hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
          >
            Activer mon essai gratuit 14 jours
          </button>

          <p className="text-sm text-center text-gray-600 dark:text-gray-400 mt-4">
            En continuant, vous acceptez nos conditions d'utilisation
          </p>
        </form>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
          <span className="text-sm text-gray-600 dark:text-gray-400">Paiement sécurisé par:</span>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow text-sm font-bold text-gray-900 dark:text-white">
              {paymentMethod === 'mobile-money' ? 'Mobile Money' : 'Stripe'}
            </div>
            <div className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow text-sm font-bold text-gray-900 dark:text-white">
              SSL 256-bit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
