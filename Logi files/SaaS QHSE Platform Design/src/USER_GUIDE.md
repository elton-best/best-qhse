# 📘 Guide Utilisateur - SMI QHSE

## Premiers Pas

### Création de Compte

#### Entreprise / Admin
1. **Choix abonnement** : Sélectionnez Starter, Professional ou Enterprise
2. **Paiement** : Saisissez coordonnées bancaires (14 jours gratuits)
3. **Configuration** : Renseignez votre domaine d'activité
4. **Accès** : Vous êtes redirigé vers le dashboard

#### Collaborateur
1. **Mot de passe** : Créez un mot de passe fort (8 car., maj, min, chiffre, spécial)
2. **Signature** : Dessinez votre signature électronique
3. **Accès** : Vous êtes redirigé vers le dashboard

## Navigation

### Sidebar (gauche)
- **Tableau de Bord** : Vue d'ensemble KPI
- **Point 4** : Contexte (SWOT, PESTEL)
- **Point 5** : Leadership (Politique)
- **Point 6** : Planification (Risques, Objectifs)
- **Point 7** : Support (Équipements, Formation)
- **Point 8** : Réalisation (Opérations)
- **Point 9** : Évaluation (Audits)
- **Point 10** : Amélioration (Actions)

### AppBar (haut)
- 🔔 **Notifications** : Badge rouge = non lues
- 🌙 **Dark Mode** : Basculer jour/nuit
- 👤 **Profil** : Paramètres, déconnexion

## Fonctionnalités Clés

### 📊 Analyse SWOT/PESTEL (Point 4)
1. Cliquez sur "Point 4 - Contexte"
2. Sélectionnez onglet SWOT ou PESTEL
3. Cliquez "Ajouter" pour créer une entrée
4. Utilisez "Générer avec Grok IA" pour auto-remplir

### ⚠️ Gestion des Risques (Point 6)
1. Allez dans "Risques & Opportunités"
2. Cliquez "Nouveau Risque"
3. Remplissez : Processus, Description, Causes
4. Saisissez Probabilité (1-5) et Gravité (1-5)
5. **Criticité calculée automatiquement** (P × G)
6. La heatmap se met à jour en temps réel

**Code couleur** :
- 🟢 Vert : Criticité 1-7 (acceptable)
- 🟠 Orange : Criticité 8-11 (moyen)
- 🔴 Rouge : Criticité 12-25 (critique)

### 🔧 Maintenance Équipements (Point 7.1)
1. "Point 7 → Équipements"
2. "Nouvel Équipement" → Code, Nom, Fréquence
3. Système planifie prochaine maintenance
4. **Alertes automatiques** :
   - 🔴 Retard : Échéance dépassée
   - 🟠 Urgent : Échéance < 10 jours
   - 🟢 OK : Échéance > 10 jours
5. **Upload preuve obligatoire** après maintenance

### 🎓 Suivi Formations (Point 7.2)
1. "Point 7 → Formation"
2. Consultez plan annuel
3. **Statuts** :
   - ✅ Effectuée : Preuve uploadée
   - ⏳ À planifier : En attente
   - 🚫 Annulée : Annulation
   - 🔴 En retard : Échéance dépassée
4. **Lignes grisées** : Date future, non modifiable
5. Upload preuve → Statut passe "Effectuée" automatiquement

### ✔️ Actions Correctives (Point 10)
1. "Point 10 → Amélioration"
2. Tableau de bord : Vue d'ensemble
3. **Types** :
   - 🔴 Corrective : Suite à non-conformité
   - 🟠 Préventive : Anticipation risque
   - 🔵 Amélioration : Optimisation
4. **Barre progression** : 0-100%
5. **Écart délai** :
   - Si > 10j : 🔴 Rouge pulsant
   - Si < 10j : 🟠 Orange
6. **Vue Collaborateur** :
   - Bouton "Preuve" : Upload document
   - Bouton "Confirmer" : Valider clôture

## Workflows

### Upload Document
1. Cliquez "Upload" ou glissez fichier
2. Formulaire métadonnées s'affiche :
   - Type (Procédure, Instruction, etc.)
   - Niveau (Direction, Management, etc.)
   - Processus
   - Axes ISO (9001, 14001, 45001)
   - Version
   - Statut (Brouillon, Approuvé, etc.)
3. "Enregistrer" → Document ajouté

### Validation Document
1. **Brouillon** → Créé par auteur
2. **En révision** → Envoyé au RQ
3. **Approuvé** → Validé par CEO
4. **Obsolète** → Archivé

## Astuces

### 🎨 Dark Mode
- Toggle en haut à droite
- Préférence sauvegardée automatiquement
- Adaptable en temps réel

### 🎤 Dictée Vocale
- Icône micro dans zones de texte
- Cliquez pour dicter (Chrome/Safari)
- Langue : Français

### 📥 Import Excel
1. Téléchargez modèle
2. Remplissez (respectez colonnes)
3. Importez
4. Rapport d'erreurs si problème

### 📊 Export Excel
- Bouton "Exporter" sur chaque tableau
- Génère fichier avec données actuelles

### 🤖 Assistant IA Grok
- Bouton "Générer avec Grok IA"
- Formulaires SWOT, Risques, Actions
- Génération automatique basée contexte

## Raccourcis Clavier

- `Ctrl/Cmd + K` : Recherche globale
- `Ctrl/Cmd + D` : Toggle dark mode
- `Esc` : Fermer modals
- `Tab` : Navigation formulaires

## Support

### FAQ
**Q: Comment réinitialiser mon mot de passe ?**
R: Menu Profil → Paramètres → Sécurité → Réinitialiser

**Q: Puis-je modifier une action validée ?**
R: Non, demandez à l'admin de la rouvrir

**Q: Format accepté pour preuves ?**
R: PDF, JPG, PNG, DOC, DOCX (max 10MB)

**Q: Comment inviter des collaborateurs ?**
R: Admin → Utilisateurs → Importer Excel ou Ajouter

### Contact
- 📧 Email : support@smi-qhse.fr
- 📞 Téléphone : +33 1 23 45 67 89
- 💬 Chat : En bas à droite (bientôt)

## Mises à Jour

**Version actuelle** : 1.0.0 (Février 2026)

### Nouveautés
- ✨ Interface moderne glassmorphism
- 🌙 Dark mode complet
- 📊 Heatmap risques interactive
- 🤖 Assistant IA Grok
- 📱 Responsive mobile

### À venir
- 🔔 Notifications email/SMS
- 📄 Export PDF rapports
- 📅 Intégration calendrier
- 📱 Application mobile
- 🔐 Authentification multi-facteurs

---

**Besoin d'aide ?** Contactez le support ou consultez la documentation complète sur https://docs.smi-qhse.fr
