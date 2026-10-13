import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import OnboardingSubscription from './components/onboarding/OnboardingSubscription';
import OnboardingPayment from './components/onboarding/OnboardingPayment';
import OnboardingPassword from './components/onboarding/OnboardingPassword';
import OnboardingSignature from './components/onboarding/OnboardingSignature';
import OnboardingCompanyConfig from './components/onboarding/OnboardingCompanyConfig';
import Dashboard from './components/pages/Dashboard';
import Context from './components/pages/point4/Context';
import Leadership from './components/pages/point5/Leadership';
import Planning from './components/pages/point6/Planning';
import RiskMatrix from './components/pages/point6/RiskMatrix';
import Support from './components/pages/point7/Support';
import Equipment from './components/pages/point7/Equipment';
import Training from './components/pages/point7/Training';
import Operations from './components/pages/point8/Operations';
import Evaluation from './components/pages/point9/Evaluation';
import Improvement from './components/pages/point10/Improvement';

export default function App() {
  const [userType, setUserType] = useState<'none' | 'company' | 'employee' | 'admin'>('none');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [subscriptionComplete, setSubscriptionComplete] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [passwordComplete, setPasswordComplete] = useState(false);
  const [signatureComplete, setSignatureComplete] = useState(false);
  const [companyConfigComplete, setCompanyConfigComplete] = useState(false);

  useEffect(() => {
    // Simulate user type detection - in real app, this would come from auth
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('userType') || 'company';
    setUserType(type as any);
  }, []);

  const handleSubscriptionComplete = (selectedNorms: string[], totalPrice: number) => {
    // Store selected norms and price if needed
    console.log('Selected norms:', selectedNorms, 'Total price:', totalPrice);
    setSubscriptionComplete(true);
  };

  const handlePaymentComplete = () => {
    setPaymentComplete(true);
    if (userType === 'company') {
      // Company admin needs to configure company
      setOnboardingStep(1);
    }
  };

  const handlePasswordComplete = () => {
    setPasswordComplete(true);
  };

  const handleSignatureComplete = () => {
    setSignatureComplete(true);
  };

  const handleCompanyConfigComplete = () => {
    setCompanyConfigComplete(true);
  };

  const isOnboardingComplete = () => {
    if (userType === 'company' || userType === 'admin') {
      return subscriptionComplete && paymentComplete && companyConfigComplete;
    }
    if (userType === 'employee') {
      return passwordComplete && signatureComplete;
    }
    return false;
  };

  // Show onboarding flow if not complete
  if (!isOnboardingComplete()) {
    if (userType === 'company' || userType === 'admin') {
      if (!subscriptionComplete) {
        return <OnboardingSubscription onComplete={handleSubscriptionComplete} />;
      }
      if (!paymentComplete) {
        return <OnboardingPayment onComplete={handlePaymentComplete} />;
      }
      if (!companyConfigComplete) {
        return <OnboardingCompanyConfig onComplete={handleCompanyConfigComplete} />;
      }
    }
    
    if (userType === 'employee') {
      if (!passwordComplete) {
        return <OnboardingPassword onComplete={handlePasswordComplete} />;
      }
      if (!signatureComplete) {
        return <OnboardingSignature onComplete={handleSignatureComplete} />;
      }
    }
  }

  return (
    <Router>
      <div className={darkMode ? 'dark' : ''}>
        <MainLayout darkMode={darkMode} setDarkMode={setDarkMode}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            
            {/* Point 4 - Contexte */}
            <Route path="/context" element={<Context />} />
            
            {/* Point 5 - Leadership */}
            <Route path="/leadership" element={<Leadership />} />
            
            {/* Point 6 - Planification */}
            <Route path="/planning" element={<Planning />} />
            <Route path="/planning/risks" element={<RiskMatrix />} />
            
            {/* Point 7 - Support */}
            <Route path="/support" element={<Support />} />
            <Route path="/support/equipment" element={<Equipment />} />
            <Route path="/support/training" element={<Training />} />
            
            {/* Point 8 - Réalisation */}
            <Route path="/operations" element={<Operations />} />
            
            {/* Point 9 - Évaluation */}
            <Route path="/evaluation" element={<Evaluation />} />
            
            {/* Point 10 - Amélioration */}
            <Route path="/improvement" element={<Improvement />} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
      </div>
    </Router>
  );
}