import { useRef, useState } from 'react';
import { PenTool, RotateCcw, Check } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

interface OnboardingSignatureProps {
  onComplete: () => void;
}

export default function OnboardingSignature({ onComplete }: OnboardingSignatureProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const handleClear = () => {
    sigCanvas.current?.clear();
    setIsEmpty(true);
    setShowPreview(false);
  };

  const handleEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setIsEmpty(false);
    }
  };

  const handleValidate = () => {
    if (!isEmpty) {
      setShowPreview(true);
      setTimeout(() => {
        onComplete();
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#6366f1]/5 dark:from-gray-950 dark:via-gray-900 dark:to-[#6366f1]/10 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full animate-[fadeIn_0.5s_ease]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#6366f1] to-[#818cf8] rounded-2xl mb-4">
            <PenTool className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Créez votre signature électronique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Cette signature sera utilisée pour valider vos actions et documents
          </p>
        </div>

        {showPreview ? (
          <div className="glass rounded-2xl p-8 shadow-xl text-center animate-[scaleIn_0.3s_ease]">
            <Check className="w-16 h-16 text-[#10b981] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Signature enregistrée !
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Configuration de votre profil terminée
            </p>
          </div>
        ) : (
          <div className="glass rounded-2xl p-8 shadow-xl">
            {/* Canvas Container */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Signez dans le cadre ci-dessous
              </label>
              <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                <SignatureCanvas
                  ref={sigCanvas}
                  onEnd={handleEnd}
                  canvasProps={{
                    className: 'w-full h-64 cursor-crosshair',
                    style: { touchAction: 'none' }
                  }}
                  backgroundColor="transparent"
                  penColor={document.documentElement.classList.contains('dark') ? '#ffffff' : '#000000'}
                />
                
                {/* Placeholder */}
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <PenTool className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400 dark:text-gray-500 text-sm">
                        Dessinez votre signature ici
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleClear}
                disabled={isEmpty}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium
                  transition-all duration-200
                  ${isEmpty
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }
                `}
              >
                <RotateCcw className="w-5 h-5" />
                Effacer
              </button>
              <button
                type="button"
                onClick={handleValidate}
                disabled={isEmpty}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                  shadow-lg transition-all duration-200
                  ${isEmpty
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white shadow-[#6366f1]/30 hover:shadow-xl hover:scale-[1.02]'
                  }
                `}
              >
                <Check className="w-5 h-5" />
                Valider ma signature
              </button>
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-[#6366f1]/10 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] mt-2 flex-shrink-0" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-medium mb-1">À propos de votre signature:</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>• Utilisée pour valider les actions et documents QHSE</li>
                    <li>• Stockée de manière sécurisée et chiffrée</li>
                    <li>• Modifiable à tout moment dans vos paramètres</li>
                    <li>• Conforme aux normes de signature électronique</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10b981]" />
          <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
          <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}
