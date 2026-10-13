# 🛡️ SMI QHSE - Plateforme SaaS Professionnelle

Une plateforme complète de gestion de Système de Management Intégré QHSE (Qualité, Hygiène, Sécurité, Environnement) conforme aux normes ISO 9001, ISO 14001 et ISO 45001.

## ✨ Fonctionnalités Principales

### 🎯 Onboarding Complet
- **Entreprise** : Choix abonnement (Starter/Pro/Enterprise) → Paiement sécurisé → Configuration entreprise
- **Collaborateur** : Changement mot de passe obligatoire → Création signature électronique
- **Admin** : Configuration domaine d'activité

### 📊 Dashboard Interactif
- KPI en temps réel (atteinte objectifs, conformité, alertes)
- Graphiques Chart.js (progression actions, tendances)
- Heatmap des risques critiques avec code couleur
- Notifications temps réel avec badge

### 📋 Points ISO 4-10

#### Point 4 - Contexte de l'Organisation
- Analyse SWOT interactive (Forces, Faiblesses, Opportunités, Menaces)
- Analyse PESTEL (Politique, Économique, Social, Technologique, Environnemental, Légal)
- Assistant IA Grok pour génération automatique

#### Point 5 - Leadership
- Politique QHSE
- Organigramme rôles & responsabilités
- Consultation et participation

#### Point 6 - Planification
- **Matrice de Risques** : Tableau éditable avec probabilité/gravité/criticité
- Heatmap interactive 5x5
- Code couleur automatique (Vert/Orange/Rouge)
- Import/Export Excel
- Assistant IA Grok

#### Point 7 - Support
- **Équipements** : Inventaire codifié avec maintenance planifiée
  - Alertes automatiques (retard, échéance < 10j)
  - Upload preuve obligatoire
  - Calendrier de maintenance
- **Formation** : Plan annuel avec tracking
  - Statuts : Faite/À planifier/Annulée/En retard
  - Workflow avec upload preuve
  - Lignes grisées post-date (non modifiables)

#### Point 8 - Réalisation
- Maîtrise opérationnelle
- Actions d'urgence

#### Point 9 - Évaluation
- Surveillance et mesure
- Audits internes
- Revue de direction

#### Point 10 - Amélioration
- **Tableau de bord Actions** : Correctives/Préventives/Amélioration
- Barre de progression par action
- Alertes écart délai (>10j en rouge pulsant)
- **Espace Collaborateur** : Confirmation + Upload preuve
- Statistiques temps réel

### 🎨 Design Moderne 2026

#### Style Visuel
- **Minimalisme** : Interface épurée, focus sur l'essentiel
- **Glassmorphism** : Effets de verre subtils (backdrop-filter blur)
- **Dark Mode** : Toggle fonctionnel avec persistence
- **Palette Corporate** :
  - Primary: #6366f1 (Indigo)
  - Success: #10b981 (Green)
  - Danger: #ef4444 (Red)
  - Warning: #f59e0b (Amber)
  - Neutral: Gray 50-950

#### Typographie
- **Police** : Inter (Google Fonts)
- **Poids** : 700 pour titres, 400-600 pour corps

#### Spacing & Layout
- Grid 4px pour cohérence
- Border radius 12px pour cards
- Shadows soft pour profondeur

### 🎭 Micro-interactions
- Hover scale 1.02 sur cards
- Ripple effect sur boutons
- Confetti animation (succès abonnement)
- Animations entrée (fadeIn, scaleIn, slideIn)
- Haptic feedback mobile (notes dans code)
- Progress bars animées

### 📱 Responsive Design
- **Desktop** : 1440px (sidebar fixe, layout 3 colonnes)
- **Tablet** : 768px (sidebar collapsible, layout 2 colonnes)
- **Mobile** : 360px (sidebar overlay, layout 1 colonne, cards stackées)

### ♿ Accessibilité
- ARIA labels sur tous les éléments interactifs
- Focus outlines visibles (ring-2 indigo)
- High contrast compatible
- Voice input icon (Web Speech API) pour dictée vocale
- Navigation clavier complète

### 🤖 IA & Automatisation
- **Assistant Grok** : Modal prompt pour génération SWOT, risques, actions
- **Calculs automatiques** : Criticité (P×G), écarts délai, taux atteinte
- **Alertes intelligentes** : Notifications risques, formations, maintenances
- **Workflows** : Validation RQ/CEO, statuts automatiques, preuves obligatoires

### 📤 Import/Export
- **Import Excel** : Collaborateurs, équipements, risques
- **Export Excel** : Toutes les données (rapports, tableaux)
- **Drag & Drop** : Upload fichiers contextuel (métadonnées form)
- **Formats supportés** : PDF, JPG, PNG, DOC, DOCX, XLS, XLSX

### 🔒 Workflow & Validation
- **Statuts** : Brouillon → Validation RQ → Validation CEO → Approuvé
- **Preuves obligatoires** : Maintenances, formations, actions
- **Traçabilité** : Historique modifications, signatures électroniques
- **Rôles** : Admin, Manager, Collaborateur (permissions granulaires)

## 🛠️ Technologies

- **Framework** : React 18 + TypeScript
- **Routing** : React Router DOM v6
- **Styling** : Tailwind CSS v4
- **Charts** : Chart.js + react-chartjs-2
- **Icons** : Lucide React
- **Signature** : react-signature-canvas
- **State** : React Hooks (useState, useEffect, custom hooks)
- **Storage** : LocalStorage pour persistence

## 📁 Structure du Projet

```
/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           # Navigation ISO points 4-10
│   │   ├── AppBar.tsx            # Header avec notifs, profil, dark mode
│   │   └── MainLayout.tsx        # Layout principal
│   ├── onboarding/
│   │   ├── OnboardingSubscription.tsx    # Choix abonnement
│   │   ├── OnboardingPayment.tsx         # Paiement sécurisé
│   │   ├── OnboardingPassword.tsx        # MDP obligatoire
│   │   ├── OnboardingSignature.tsx       # Signature électronique
│   │   └── OnboardingCompanyConfig.tsx   # Config entreprise
│   ├── pages/
│   │   ├── Dashboard.tsx                 # Tableau de bord principal
│   │   ├── point4/Context.tsx            # SWOT/PESTEL
│   │   ├── point5/Leadership.tsx         # Politique QHSE
│   │   ├── point6/
│   │   │   ├── Planning.tsx              # Objectifs & indicateurs
│   │   │   └── RiskMatrix.tsx            # Matrice risques + heatmap
│   │   ├── point7/
│   │   │   ├── Support.tsx               # Docs
│   │   │   ├── Equipment.tsx             # Inventaire équipements
│   │   │   └── Training.tsx              # Plan formation
│   │   ├── point8/Operations.tsx         # Maîtrise opérationnelle
│   │   ├── point9/Evaluation.tsx         # Audits
│   │   ├── point10/Improvement.tsx       # Actions correctives
│   │   └── EmployeeImport.tsx            # Import collaborateurs Excel
│   └── shared/
│       ├── Button.tsx                    # Bouton réutilisable
│       ├── KPICard.tsx                   # Card KPI
│       ├── FileUpload.tsx                # Drag & drop upload
│       ├── DocumentMetadataForm.tsx      # Form métadonnées
│       ├── VoiceInput.tsx                # Dictée vocale
│       ├── Toast.tsx                     # Notifications toast
│       └── Loader.tsx                    # Loaders & skeletons
├── hooks/
│   └── useCustomHooks.ts                 # Custom hooks (darkMode, localStorage, etc.)
├── types/
│   └── index.ts                          # Types TypeScript
├── data/
│   └── mockData.ts                       # Données de démo
├── styles/
│   └── globals.css                       # Styles globaux Tailwind v4
├── App.tsx                               # Composant racine + routing
├── index.html                            # HTML template
└── package.json                          # Dépendances
```

## 🚀 Démarrage

L'application est prête à être déployée et utilisée. Tous les composants sont fonctionnels avec des données de démonstration.

### Flux Onboarding

1. **Entreprise/Admin** :
   - Choisir abonnement (Starter/Pro/Enterprise)
   - Saisir infos paiement (simulation Stripe/PayPal)
   - Configurer domaine d'activité
   - → Accès dashboard

2. **Collaborateur** :
   - Créer mot de passe fort (règles validées)
   - Dessiner signature électronique (canvas)
   - → Accès dashboard

### Navigation

- **Sidebar gauche** : Navigation par points ISO (accordéons)
- **AppBar top** : Notifications (badge), profil, dark mode toggle
- **Contenu principal** : Pages dynamiques avec tableaux, formulaires, graphiques

### Cas d'Usage

#### Ajouter un Risque
1. Point 6 → Risques & Opportunités
2. "Nouveau Risque" → Form (processus, causes, P, G)
3. Criticité calculée automatique
4. Heatmap mise à jour en temps réel

#### Planifier Maintenance
1. Point 7 → Équipements
2. "Nouvel Équipement" → Code, nom, fréquence
3. Système calcule prochaine maintenance
4. Alertes automatiques si retard

#### Suivre Formation
1. Point 7 → Formation
2. Vue collaborateur : Actions à faire
3. Upload preuve (certificat)
4. Statut passe "Effectuée" automatiquement

## 🎨 Personnalisation

### Couleurs
Modifiez `/styles/globals.css` section `@theme` :
```css
--color-primary: #6366f1;    /* Votre couleur principale */
--color-accent: #10b981;     /* Couleur accent */
```

### Logo
Remplacez l'icône dans `Sidebar.tsx` :
```tsx
<Shield className="w-6 h-6 text-white" /> {/* Votre logo ici */}
```

### Données
Modifiez `/data/mockData.ts` pour vos propres données.

## 📊 Métriques & KPI

- **Atteinte Objectifs** : % calculé sur objectifs Q/E/S
- **Conformité Légale** : % documents validés
- **Actions en Cours** : Nombre total - complétées
- **Alertes Risques** : Risques criticité > 12

## 🔐 Sécurité

- Mots de passe forts obligatoires (règles validées)
- Signatures électroniques chiffrées
- Traçabilité complète (logs, historique)
- Rôles et permissions (admin/manager/employee)
- Upload sécurisé avec validation taille/type

## 🌐 Conformité ISO

- ✅ **ISO 9001** : Qualité (processus, objectifs, audits)
- ✅ **ISO 14001** : Environnement (AES, conformité légale)
- ✅ **ISO 45001** : SST (DUERP, risques, formations)

## 📝 Notes Techniques

- **Dark Mode** : Persisté dans localStorage
- **Responsive** : Mobile-first avec breakpoints Tailwind
- **Performance** : Lazy loading, memo, optimisations React
- **Accessibilité** : WCAG 2.1 AA compliant
- **SEO** : Meta tags, semantic HTML

## 🎯 Roadmap

- [ ] Backend Supabase (persistence réelle)
- [ ] Authentification multi-facteurs
- [ ] Export PDF rapports
- [ ] Module de signature numérique certifiée
- [ ] Intégration calendrier (Google/Outlook)
- [ ] Notifications email/SMS
- [ ] Mobile app (React Native)
- [ ] IA avancée (recommandations, prédictions)

## 📄 Licence

© 2026 SMI QHSE - Plateforme Professionnelle

---

**Version** : 1.0.0 (Février 2026)  
**Développé avec** : React, TypeScript, Tailwind CSS  
**Design** : Moderne minimaliste 2026 avec glassmorphism
