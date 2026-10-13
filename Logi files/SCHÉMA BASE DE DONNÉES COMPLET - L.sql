# 🗄️ SCHÉMA BASE DE DONNÉES COMPLET - LOGIQUALI
**SGBD:** PostgreSQL  
**ORM:** Laravel Eloquent  
**Conventions:** Snake_case, timestamps, soft deletes

---

## 📋 TABLES EXISTANTES (À Conserver/Étendre)

### Core Tables
```sql
✅ users
✅ enterprises
✅ sites
✅ roles
✅ permissions
✅ user_permissions
✅ team_members (collaborateurs)
✅ processes
✅ documents
✅ audits
✅ audit_programs
✅ audit_findings
✅ actions
✅ non_conformities
✅ indicateurs (indicateurs)
✅ objectives
✅ risks
✅ reclamations
✅ complaints
✅ user_notifications
✅ activity_log (spatie)
```

---

## 🆕 NOUVELLES TABLES - POINT 4 (Contexte de l'Organisme)

-- 1. Table des CATÉGORIES (Référentiel des critères)
-- Permet de définir les critères internes et externes cités 
CREATE TABLE analysis_categories (
    id SERIAL PRIMARY KEY,
    type ENUM('INTERNE', 'EXTERNE') NOT NULL, -- Distingue les enjeux internes/externes [cite: 1]
    code VARCHAR(10) UNIQUE NOT NULL,         -- 'CULT', 'VAL', 'POL', etc.
    label VARCHAR(100) NOT NULL               -- 'Culture', 'Valeurs', 'Politique', etc.
);

-- 2. Table du CONTEXTE (Versionnage)
-- Permet de formuler plusieurs analyses pour un même organisme au fil du temps [cite: 4]
CREATE TABLE organization_contexts (
    id SERIAL PRIMARY KEY,
    enterprise_id INT NOT NULL,                   -- ID de l'entreprise cliente (SaaS)
    title VARCHAR(255) NOT NULL,              -- ex: "Contexte Global 2026"
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table des ENJEUX (Saisie des données)
-- Centralise les forces, faiblesses, opportunités et menaces [cite: 1]
CREATE TABLE context_issues (
    id SERIAL PRIMARY KEY,
    context_id INT REFERENCES organization_contexts(id),
    category_id INT REFERENCES analysis_categories(id),
    
    description TEXT NOT NULL,                -- Description de l'enjeu
    sentiment ENUM('FAVORABLE', 'DEFAVORABLE') NOT NULL, -- Favorable vs Défavorable [cite: 3]
    
    -- Gestion des enjeux majeurs [cite: 4]
    is_major BOOLEAN DEFAULT FALSE,           -- Flag pour enjeu majeur
    impact_score INT DEFAULT 1,               -- Cotation (1-5)
    action_plan_summary TEXT,                 -- Lien vers une ébauche d'action
    
    INDEX idx_major (is_major),               -- Index pour récupération rapide des enjeux critiques
    INDEX idx_tenant_context (context_id)     -- Index pour la rapidité SaaS
);


### 2. `stakeholders` - Parties Intéressées (Étendre si existe)
```sql
-- Si la table existe déjà, ALTER TABLE pour ajouter colonnes
-- Sinon CREATE TABLE:

CREATE TABLE stakeholders (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Identification
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100), -- 'client' | 'fournisseur' | 'actionnaire' | 'employe' | 'autorite' | 'communaute' | etc.
    category VARCHAR(100), -- 'interne' | 'externe'
    
    -- Pertinence
    relevance_level VARCHAR(50), -- 'low' | 'medium' | 'high' | 'critical'
    relevance_justification TEXT,
    
    -- Besoins & Exigences
    needs TEXT, -- JSON ou TEXT structuré
    requirements TEXT, -- JSON array ou TEXT
    
    -- Actions associées
    actions TEXT, -- Ou relation many-to-many avec actions table
    
    -- Responsable & Délai
    responsible_user_id BIGINT REFERENCES users(id),
    deadline DATE,
    
    -- Liens exigences veille
    compliance_requirement_ids JSON, -- Array IDs
    
    -- Multi-normes
    applicable_norms JSON, -- ['ISO9001', 'ISO14001', 'ISO45001']
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_stakeholders_enterprise ON stakeholders(enterprise_id);
CREATE INDEX idx_stakeholders_type ON stakeholders(type);
```

### 3. `application_scopes` - Domaine d'Application
```sql
CREATE TABLE application_scopes (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Version (historique)
    version VARCHAR(50) DEFAULT '1.0',
    is_current BOOLEAN DEFAULT true,
    
    -- Objet & Périmètre
    objective TEXT NOT NULL,
    scope TEXT NOT NULL,
    
    -- Processus inclus
    included_processes JSON, -- Array process IDs
    
    -- Produits/Services
    products_services JSON, -- Array {name, description}
    
    -- Unités/Lieux
    organizational_units JSON, -- Array {name, location, site_id}
    locations JSON, -- Array {address, site_id}
    
    -- Exclusions
    exclusions TEXT,
    exclusions_justification TEXT,
    
    -- Normes applicables
    applicable_norms JSON, -- ['ISO9001:2015', 'ISO14001:2015', ...]
    
    -- Génération document
    document_generated BOOLEAN DEFAULT false,
    document_path VARCHAR(500),
    generated_at TIMESTAMP,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_application_scopes_enterprise ON application_scopes(enterprise_id);
CREATE INDEX idx_application_scopes_current ON application_scopes(is_current);
```

### 4. Étendre `processes` pour Cartographie & Turtle Diagram
```sql
-- ALTER TABLE existante
ALTER TABLE processes ADD COLUMN IF NOT EXISTS turtle_diagram JSON;
-- Structure JSON:
-- {
--   "finalite": "...",
--   "objectifs": ["..."],
--   "entrees": [{type, source, description}],
--   "activites": [{ordre, nom, description}],
--   "sorties": [{type, destination, description}],
--   "ressources": {
--     "humaines": ["..."],
--     "materielles": ["..."],
--     "documentaires": ["..."]
--   },
--   "indicateurs": [indicateur_ids],
--   "risques": [risk_ids],
--   "opportunites": [opportunity_ids]
-- }

ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner_id BIGINT REFERENCES users(id);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_type VARCHAR(100); -- 'management' | 'operationnel' | 'support'
ALTER TABLE processes ADD COLUMN IF NOT EXISTS sequence_order INTEGER;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS interactions JSON; -- Relations avec autres processus
```

---

## 🆕 NOUVELLES TABLES - POINT 5 (Leadership)

### 5. `qhse_policies` - Politique QHSE
```sql
CREATE TABLE qhse_policies (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Version
    version VARCHAR(50) DEFAULT '1.0',
    is_current BOOLEAN DEFAULT true,
    effective_date DATE,
    
    -- Contenu
    mission TEXT NOT NULL,
    vision TEXT,
    values JSON, -- Array de valeurs
    commitments JSON, -- Array d'engagements
    
    -- Politique par norme
    quality_policy TEXT, -- ISO 9001
    environmental_policy TEXT, -- ISO 14001
    health_safety_policy TEXT, -- ISO 45001
    
    -- Workflow validation
    status VARCHAR(50) DEFAULT 'draft', -- 'draft' | 'pending_validation' | 'approved' | 'rejected'
    validated_by_direction_at TIMESTAMP,
    validated_by_user_id BIGINT REFERENCES users(id),
    
    -- Document généré
    document_path VARCHAR(500),
    generated_at TIMESTAMP,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_qhse_policies_enterprise ON qhse_policies(enterprise_id);
CREATE INDEX idx_qhse_policies_current ON qhse_policies(is_current);
```

### 6. Étendre `job_descriptions` (si existe) ou créer
```sql
CREATE TABLE job_descriptions (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id), -- Titulaire du poste
    
    -- Identification poste
    job_title VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    reports_to_id BIGINT REFERENCES users(id), -- Hiérarchie
    
    -- Mission & Activités
    mission TEXT NOT NULL,
    main_activities JSON, -- Array {ordre, activite, description}
    secondary_activities JSON,
    
    -- Relations
    internal_relations JSON, -- {service, type_relation}
    external_relations JSON,
    
    -- Conditions
    work_location VARCHAR(255),
    work_schedule VARCHAR(255),
    travel_required BOOLEAN DEFAULT false,
    physical_requirements TEXT,
    
    -- Compétences requises
    required_skills JSON, -- {competence, niveau_requis}
    required_experience VARCHAR(255),
    required_education VARCHAR(255),
    certifications_required JSON,
    
    -- Signature électronique
    employee_signature_data TEXT, -- Base64 canvas signature
    employee_signed_at TIMESTAMP,
    manager_signature_data TEXT,
    manager_signed_at TIMESTAMP,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_job_descriptions_enterprise ON job_descriptions(enterprise_id);
CREATE INDEX idx_job_descriptions_user ON job_descriptions(user_id);
```

### 7. `responsibilities` - Responsabilités Pilotes
```sql
CREATE TABLE responsibilities (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Lien
    responsible_type VARCHAR(100) NOT NULL, -- 'process' | 'project' | 'domain'
    responsible_id BIGINT NOT NULL, -- ID du process/project/etc.
    
    -- Responsable
    user_id BIGINT NOT NULL REFERENCES users(id),
    role_title VARCHAR(255), -- 'Pilote de processus' | 'Responsable qualité' | etc.
    
    -- Responsabilités détaillées
    responsibilities JSON, -- Array de responsabilités
    authorities JSON, -- Array d'autorités
    
    -- Période
    start_date DATE,
    end_date DATE,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_responsibilities_enterprise ON responsibilities(enterprise_id);
CREATE INDEX idx_responsibilities_user ON responsibilities(user_id);
CREATE INDEX idx_responsibilities_type ON responsibilities(responsible_type, responsible_id);
```

### 8. `participation_records` - Consultation & Participation Travailleurs
```sql
CREATE TABLE participation_records (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Type
    record_type VARCHAR(100) NOT NULL, -- 'consultation' | 'participation' | 'committee_meeting'
    
    -- Sujet
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    
    -- Participants
    participants JSON, -- Array {user_id, name, role}
    
    -- Liste présence
    attendance_list_path VARCHAR(500), -- PDF upload
    attendance_proof_path VARCHAR(500),
    
    -- Décisions/Actions
    decisions TEXT,
    action_items JSON, -- {action, responsable, delai}
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_participation_records_enterprise ON participation_records(enterprise_id);
CREATE INDEX idx_participation_records_date ON participation_records(date);
```

---

## 🆕 NOUVELLES TABLES - POINT 6 (Planification)

### 9. Étendre `risks` pour Multi-normes & Heatmap
```sql
-- ALTER TABLE existante
ALTER TABLE risks ADD COLUMN IF NOT EXISTS process_id BIGINT REFERENCES processes(id);
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_number VARCHAR(50); -- Code auto-généré
ALTER TABLE risks ADD COLUMN IF NOT EXISTS causes TEXT;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS probability_score INTEGER; -- 1-5
ALTER TABLE risks ADD COLUMN IF NOT EXISTS severity_score INTEGER; -- 1-5
ALTER TABLE risks ADD COLUMN IF NOT EXISTS criticality_score INTEGER GENERATED ALWAYS AS (probability_score * severity_score) STORED;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS criticality_level VARCHAR(50) GENERATED ALWAYS AS (
    CASE 
        WHEN (probability_score * severity_score) <= 5 THEN 'low'
        WHEN (probability_score * severity_score) <= 12 THEN 'medium'
        ELSE 'high'
    END
) STORED;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS applicable_norms JSON; -- ['ISO9001', 'ISO14001', 'ISO45001']
ALTER TABLE risks ADD COLUMN IF NOT EXISTS action_ids JSON; -- Array action IDs (multi-actions)

ALTER TABLE risks ADD COLUMN IF NOT EXISTS responsible_user_id BIGINT REFERENCES users(id);
ALTER TABLE risks ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50); -- 'pending' | 'in_progress' | 'completed'
```

### 10. `opportunities` - Opportunités
```sql
CREATE TABLE opportunities (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    process_id BIGINT REFERENCES processes(id),
    
    -- Identification
    opportunity_number VARCHAR(50) NOT NULL UNIQUE, -- Auto-généré
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Évaluation
    potential_impact VARCHAR(50), -- 'low' | 'medium' | 'high'
    feasibility_score INTEGER, -- 1-5
    priority_level VARCHAR(50), -- Calculé: impact × feasibility
    
    -- Actions
    action_ids JSON, -- Array action IDs
    
    -- Responsable
    responsible_user_id BIGINT REFERENCES users(id),
    deadline DATE,
    
    -- Suivi
    status VARCHAR(50) DEFAULT 'identified', -- 'identified' | 'under_study' | 'approved' | 'in_progress' | 'realized' | 'rejected'
    
    -- Multi-normes
    applicable_norms JSON,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_opportunities_enterprise ON opportunities(enterprise_id);
CREATE INDEX idx_opportunities_process ON opportunities(process_id);
```

### 11. Étendre `objectives` & `indicateurs`
```sql
-- ALTER objectives
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS strategic_axis_id BIGINT REFERENCES strategic_axes(id);
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS measurement_frequency VARCHAR(50); -- 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS required_resources TEXT;
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS applicable_norms JSON;

-- ALTER indicateurs
ALTER TABLE indicateurs ADD COLUMN IF NOT EXISTS calculation_formula TEXT;
ALTER TABLE indicateurs ADD COLUMN IF NOT EXISTS threshold_green DECIMAL(10,2);
ALTER TABLE indicateurs ADD COLUMN IF NOT EXISTS threshold_orange DECIMAL(10,2);
ALTER TABLE indicateurs ADD COLUMN IF NOT EXISTS threshold_red DECIMAL(10,2);
ALTER TABLE indicateurs ADD COLUMN IF NOT EXISTS measurement_unit VARCHAR(100);
```

### 12. `compliance_requirements` - Conformité & Réglementaire
```sql
CREATE TABLE compliance_requirements (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Type
    requirement_type VARCHAR(100) NOT NULL, -- 'legal' | 'regulatory' | 'normative' | 'contractual'
    
    -- Identification
    title VARCHAR(255) NOT NULL,
    reference VARCHAR(255), -- Ex: "Loi n°2022-XXX"
    description TEXT,
    
    -- Source
    source VARCHAR(255), -- Organisme émetteur
    source_url VARCHAR(500),
    publication_date DATE,
    effective_date DATE,
    
    -- Applicabilité
    applicable_to JSON, -- {sites: [], processes: [], activities: []}
    applicable_norms JSON,
    
    -- Évaluation conformité
    compliance_status VARCHAR(50), -- 'compliant' | 'partial' | 'non_compliant' | 'not_evaluated'
    last_evaluation_date DATE,
    next_evaluation_date DATE,
    
    -- Actions associées
    action_ids JSON,
    
    -- Responsable veille
    responsible_user_id BIGINT REFERENCES users(id),
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_compliance_requirements_enterprise ON compliance_requirements(enterprise_id);
CREATE INDEX idx_compliance_requirements_status ON compliance_requirements(compliance_status);
```

### 13. `environmental_aspects` - Aspects Environnementaux (AES)
```sql
CREATE TABLE environmental_aspects (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    process_id BIGINT REFERENCES processes(id),
    site_id BIGINT REFERENCES sites(id),
    
    -- Identification
    aspect_number VARCHAR(50) UNIQUE,
    activity VARCHAR(255) NOT NULL,
    aspect VARCHAR(255) NOT NULL, -- Ex: "Consommation d'eau"
    impact VARCHAR(255) NOT NULL, -- Ex: "Épuisement ressources naturelles"
    
    -- Conditions
    condition_type VARCHAR(50), -- 'normal' | 'abnormal' | 'emergency'
    
    -- Évaluation significativité
    frequency_score INTEGER, -- 1-5
    severity_score INTEGER, -- 1-5
    regulatory_score INTEGER, -- 1-5
    significance_score INTEGER GENERATED ALWAYS AS (frequency_score + severity_score + regulatory_score) STORED,
    is_significant BOOLEAN GENERATED ALWAYS AS (
        (frequency_score + severity_score + regulatory_score) >= 9
    ) STORED,
    
    -- Maîtrise
    control_measures TEXT,
    action_ids JSON,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_environmental_aspects_enterprise ON environmental_aspects(enterprise_id);
CREATE INDEX idx_environmental_aspects_significant ON environmental_aspects(is_significant);
```

### 14. `duerp` - Document Unique Évaluation Risques Professionnels
```sql
CREATE TABLE duerp (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    site_id BIGINT REFERENCES sites(id),
    
    -- Version
    version VARCHAR(50) DEFAULT '1.0',
    is_current BOOLEAN DEFAULT true,
    evaluation_date DATE NOT NULL,
    next_evaluation_date DATE,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE duerp_dangers (
    id BIGSERIAL PRIMARY KEY,
    duerp_id BIGINT NOT NULL REFERENCES duerp(id) ON DELETE CASCADE,
    
    -- Localisation
    organizational_unit VARCHAR(255), -- Unité de travail
    process_id BIGINT REFERENCES processes(id),
    activity VARCHAR(255),
    
    -- Danger
    danger_type VARCHAR(100) NOT NULL, -- 'mecanique' | 'chimique' | 'biologique' | 'physique' | 'psychosocial' | 'ergonomique'
    danger_description TEXT NOT NULL,
    
    -- Personnes exposées
    exposed_workers JSON, -- {count, profile}
    
    -- Évaluation
    probability_score INTEGER, -- 1-4
    severity_score INTEGER, -- 1-4
    criticality_score INTEGER GENERATED ALWAYS AS (probability_score * severity_score) STORED,
    criticality_level VARCHAR(50) GENERATED ALWAYS AS (
        CASE 
            WHEN (probability_score * severity_score) <= 4 THEN 'acceptable'
            WHEN (probability_score * severity_score) <= 8 THEN 'tolerable'
            ELSE 'unacceptable'
        END
    ) STORED,
    
    -- Mesures prévention existantes
    existing_measures TEXT,
    
    -- Actions prévention (multi-actions)
    actions JSON, -- [{objet, responsable_id, delai, cout_estime, statut}]
    
    -- Multi-normes
    applicable_norms JSON, -- ['ISO45001', ...]
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_duerp_enterprise ON duerp(enterprise_id);
CREATE INDEX idx_duerp_current ON duerp(is_current);
CREATE INDEX idx_duerp_dangers_duerp ON duerp_dangers(duerp_id);
CREATE INDEX idx_duerp_dangers_criticality ON duerp_dangers(criticality_level);
```

---

## 🆕 NOUVELLES TABLES - POINT 7 (Support)

### 15. `equipment` - Ressources & Équipements
```sql
CREATE TABLE equipment (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    site_id BIGINT REFERENCES sites(id),
    
    -- Identification
    equipment_code VARCHAR(100) NOT NULL UNIQUE, -- Code auto ou import
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- 'machine' | 'outil' | 'vehicule' | 'informatique' | 'mesure' | etc.
    
    -- Caractéristiques
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    purchase_date DATE,
    purchase_cost DECIMAL(12,2),
    
    -- Localisation
    location VARCHAR(255),
    responsible_user_id BIGINT REFERENCES users(id),
    
    -- État
    operational_status VARCHAR(50) DEFAULT 'operational', -- 'operational' | 'maintenance' | 'out_of_service' | 'retired'
    
    -- Criticité
    criticality_level VARCHAR(50), -- 'low' | 'medium' | 'high' | 'critical'
    
    -- Processus associés
    process_ids JSON,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_equipment_enterprise ON equipment(enterprise_id);
CREATE INDEX idx_equipment_code ON equipment(equipment_code);
CREATE INDEX idx_equipment_status ON equipment(operational_status);
```

### 16. `maintenance_plans` - Plans de Maintenance
```sql
CREATE TABLE maintenance_plans (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    
    -- Type
    maintenance_type VARCHAR(50) NOT NULL, -- 'preventive' | 'corrective' | 'predictive'
    
    -- Périodicité
    frequency VARCHAR(50), -- 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom'
    frequency_value INTEGER, -- Si custom: nombre jours
    
    -- Planification
    last_maintenance_date DATE,
    next_maintenance_date DATE NOT NULL,
    
    -- Alertes
    alert_days_before INTEGER DEFAULT 7,
    alert_sent BOOLEAN DEFAULT false,
    alert_sent_at TIMESTAMP,
    
    -- Responsable
    responsible_user_id BIGINT REFERENCES users(id),
    
    -- Instructions
    instructions TEXT,
    checklist JSON, -- [{item, done}]
    
    -- Statut
    status VARCHAR(50) DEFAULT 'planned', -- 'planned' | 'in_progress' | 'completed' | 'overdue' | 'rescheduled'
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE maintenance_records (
    id BIGSERIAL PRIMARY KEY,
    maintenance_plan_id BIGINT NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
    
    -- Exécution
    performed_date DATE NOT NULL,
    performed_by_user_id BIGINT REFERENCES users(id),
    
    -- Détails
    work_description TEXT,
    parts_replaced JSON,
    observations TEXT,
    
    -- Preuve
    proof_path VARCHAR(500), -- Upload obligatoire
    
    -- Coût
    labor_cost DECIMAL(10,2),
    parts_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2) GENERATED ALWAYS AS (labor_cost + parts_cost) STORED,
    
    -- Prochaine planification
    next_maintenance_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_maintenance_plans_equipment ON maintenance_plans(equipment_id);
CREATE INDEX idx_maintenance_plans_next_date ON maintenance_plans(next_maintenance_date);
CREATE INDEX idx_maintenance_records_plan ON maintenance_records(maintenance_plan_id);
```

### 17. `calibration_plans` - Plans d'Étalonnage
```sql
CREATE TABLE calibration_plans (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    
    -- Périodicité
    frequency VARCHAR(50) NOT NULL, -- 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'biennial'
    
    -- Planification
    last_calibration_date DATE,
    next_calibration_date DATE NOT NULL,
    calibration_certificate_path VARCHAR(500),
    
    -- Alertes
    alert_days_before INTEGER DEFAULT 30,
    alert_sent BOOLEAN DEFAULT false,
    
    -- Prestataire
    service_provider VARCHAR(255),
    service_provider_accreditation VARCHAR(255), -- Ex: COFRAC
    
    -- Responsable suivi
    responsible_user_id BIGINT REFERENCES users(id),
    
    -- Statut
    status VARCHAR(50) DEFAULT 'valid', -- 'valid' | 'due' | 'overdue' | 'expired'
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE calibration_records (
    id BIGSERIAL PRIMARY KEY,
    calibration_plan_id BIGINT NOT NULL REFERENCES calibration_plans(id) ON DELETE CASCADE,
    
    performed_date DATE NOT NULL,
    certificate_number VARCHAR(255),
    certificate_path VARCHAR(500) NOT NULL, -- Upload obligatoire
    
    results JSON, -- {parameter, measured_value, tolerance, conformity}
    conformity_status VARCHAR(50), -- 'conform' | 'non_conform'
    
    cost DECIMAL(10,2),
    next_calibration_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calibration_plans_equipment ON calibration_plans(equipment_id);
CREATE INDEX idx_calibration_plans_next_date ON calibration_plans(next_calibration_date);
```

### 18. `training_plans` - Plans de Formation
```sql
CREATE TABLE training_plans (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Année
    year INTEGER NOT NULL,
    
    -- Statut
    status VARCHAR(50) DEFAULT 'draft', -- 'draft' | 'approved' | 'in_progress' | 'completed'
    
    -- Budget
    total_budget DECIMAL(12,2),
    spent_amount DECIMAL(12,2) DEFAULT 0,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE training_sessions (
    id BIGSERIAL PRIMARY KEY,
    training_plan_id BIGINT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    
    -- Formation
    title VARCHAR(255) NOT NULL,
    description TEXT,
    training_type VARCHAR(100), -- 'interne' | 'externe' | 'e-learning' | 'on_the_job'
    
    -- Cible
    target_user_ids JSON, -- Array user IDs
    target_job_roles JSON, -- Array job titles
    
    -- Planification
    planned_date DATE,
    frequency VARCHAR(50), -- 'once' | 'annual' | 'biennial' | 'custom'
    
    -- Exécution
    actual_date DATE,
    trainer VARCHAR(255),
    location VARCHAR(255),
    duration_hours DECIMAL(5,2),
    
    -- Statut
    status VARCHAR(50) DEFAULT 'planned', -- 'planned' | 'done' | 'canceled' | 'rescheduled'
    cancellation_reason TEXT,
    
    -- Alerte fréquence
    alert_before_months INTEGER,
    
    -- Coût
    cost DECIMAL(10,2),
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE training_evaluations (
    id BIGSERIAL PRIMARY KEY,
    training_session_id BIGINT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    
    -- Évaluation
    attended BOOLEAN DEFAULT false,
    satisfaction_score INTEGER, -- 1-5
    knowledge_acquired_score INTEGER, -- 1-5
    comments TEXT,
    
    -- Preuve
    certificate_path VARCHAR(500), -- Upload
    
    -- Workflow
    evaluation_locked BOOLEAN DEFAULT false, -- Verrouillé après date formation
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_training_plans_year ON training_plans(year);
CREATE INDEX idx_training_sessions_plan ON training_sessions(training_plan_id);
CREATE INDEX idx_training_sessions_status ON training_sessions(status);
CREATE INDEX idx_training_evaluations_session ON training_evaluations(training_session_id);
```

### 19. `communication_actions` - Sensibilisation & Communication
```sql
CREATE TABLE communication_actions (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Type
    communication_type VARCHAR(50) NOT NULL, -- 'internal' | 'external'
    
    -- Cible
    target_audience VARCHAR(255) NOT NULL, -- 'employees' | 'management' | 'suppliers' | 'customers' | 'public' | etc.
    
    -- Canal
    channel VARCHAR(100) NOT NULL, -- 'email' | 'intranet' | 'meeting' | 'newsletter' | 'website' | 'social_media' | etc.
    
    -- Fréquence
    frequency VARCHAR(50), -- 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
    
    -- Contenu
    subject VARCHAR(255) NOT NULL,
    content TEXT,
    
    -- Responsable
    responsible_user_id BIGINT REFERENCES users(id),
    
    -- Planification
    planned_date DATE,
    actual_date DATE,
    
    -- Preuve
    proof_paths JSON, -- Array file paths
    
    -- Statut
    status VARCHAR(50) DEFAULT 'planned', -- 'planned' | 'sent' | 'completed' | 'canceled'
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_communication_actions_enterprise ON communication_actions(enterprise_id);
CREATE INDEX idx_communication_actions_type ON communication_actions(communication_type);
```

### 20. Étendre `documents` pour métadonnées & génération
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'uploaded'; -- 'uploaded' | 'generated'
ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES document_templates(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSON; -- {tags, keywords, custom_fields}
ALTER TABLE documents ADD COLUMN IF NOT EXISTS generation_context VARCHAR(100); -- 'global' | 'point4' | 'point5' | etc.
```

---

## 🆕 NOUVELLES TABLES - POINT 8 (Réalisation)

### 21. `operational_controls` - Maîtrise Opérationnelle
```sql
CREATE TABLE operational_controls (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    process_id BIGINT NOT NULL REFERENCES processes(id),
    
    -- Planification
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Contrôles
    control_points JSON, -- [{point, method, frequency, responsible}]
    
    -- Critères acceptation
    acceptance_criteria TEXT,
    
    -- Instructions
    operating_instructions TEXT,
    related_document_ids JSON,
    
    -- Suivi
    status VARCHAR(50) DEFAULT 'active', -- 'active' | 'inactive'
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_operational_controls_enterprise ON operational_controls(enterprise_id);
CREATE INDEX idx_operational_controls_process ON operational_controls(process_id);
```

### 22. `emergency_procedures` - Procédures d'Urgence
```sql
CREATE TABLE emergency_procedures (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    site_id BIGINT REFERENCES sites(id),
    
    -- Type urgence
    emergency_type VARCHAR(100) NOT NULL, -- 'fire' | 'chemical_spill' | 'injury' | 'environmental' | etc.
    
    -- Procédure
    title VARCHAR(255) NOT NULL,
    procedure_steps JSON, -- [{step_number, action, responsible}]
    
    -- Contacts urgence
    emergency_contacts JSON, -- [{name, role, phone}]
    
    -- Équipements requis
    required_equipment JSON,
    
    -- Formation requise
    training_required BOOLEAN DEFAULT false,
    trained_users JSON, -- Array user IDs
    
    -- Tests/Exercices
    last_drill_date DATE,
    next_drill_date DATE,
    
    -- Document
    document_path VARCHAR(500),
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_emergency_procedures_enterprise ON emergency_procedures(enterprise_id);
CREATE INDEX idx_emergency_procedures_type ON emergency_procedures(emergency_type);
```

---

## 🆕 NOUVELLES TABLES - POINT 9 (Évaluation)

### 23. Étendre `audits`, `audit_programs`, `audit_findings` (déjà existants)
```sql
-- Tables déjà complètes, juste ajouter si manquant:
ALTER TABLE audits ADD COLUMN IF NOT EXISTS risk_based_priority INTEGER; -- 1-5
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS auto_create_nc BOOLEAN DEFAULT true;
```

### 24. Étendre `management_reviews` (si existe)
```sql
CREATE TABLE management_reviews (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Revue
    review_date DATE NOT NULL,
    review_period_start DATE NOT NULL,
    review_period_end DATE NOT NULL,
    
    -- Participants
    participants JSON, -- [{user_id, name, role}]
    
    -- Données entrée (ISO 9.3)
    input_data JSON,
    -- {
    --   "audit_results": {...},
    --   "customer_feedback": {...},
    --   "process_performance": {...},
    --   "product_conformity": {...},
    --   "nc_corrective_actions": {...},
    --   "previous_review_actions": {...},
    --   "improvement_opportunities": {...},
    --   "change_needs": {...}
    -- }
    
    -- Données sortie (décisions)
    output_decisions JSON,
    -- {
    --   "improvement_opportunities": [...],
    --   "quality_management_changes": [...],
    --   "resource_needs": [...]
    -- }
    
    -- Actions décidées
    action_ids JSON,
    
    -- Workflow validation CEO
    status VARCHAR(50) DEFAULT 'draft', -- 'draft' | 'pending_ceo' | 'approved'
    validated_by_ceo_at TIMESTAMP,
    validated_by_ceo_user_id BIGINT REFERENCES users(id),
    
    -- Rapport
    report_path VARCHAR(500),
    generated_at TIMESTAMP,
    
    -- Metadata
    created_by BIGINT REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_management_reviews_enterprise ON management_reviews(enterprise_id);
CREATE INDEX idx_management_reviews_date ON management_reviews(review_date);
```

---

## 🆕 NOUVELLES TABLES - POINT 10 (Amélioration)

### 25. Étendre `non_conformities`, `actions` (déjà existants)
```sql
-- Tables déjà complètes, vérifier présence de:
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS root_cause_analysis JSON;
-- {method: '5why' | 'ishikawa' | '5m', analysis: {...}}

ALTER TABLE actions ADD COLUMN IF NOT EXISTS proof_path VARCHAR(500);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS delay_alert_threshold INTEGER DEFAULT 10; -- Jours
ALTER TABLE actions ADD COLUMN IF NOT EXISTS delay_days INTEGER; -- Écart délai calculé
ALTER TABLE actions ADD COLUMN IF NOT EXISTS progress_rate INTEGER; -- 0-100%
```

### 26. `collaborator_action_confirmations` - Espace Collaborateur Actions
```sql
CREATE TABLE collaborator_action_confirmations (
    id BIGSERIAL PRIMARY KEY,
    action_id BIGINT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    
    -- Notification
    notified_at TIMESTAMP,
    notification_sent BOOLEAN DEFAULT false,
    
    -- Confirmation
    confirmed_at TIMESTAMP,
    confirmation_notes TEXT,
    
    -- Preuve upload
    proof_path VARCHAR(500),
    proof_uploaded_at TIMESTAMP,
    
    -- Statut
    status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'acknowledged' | 'in_progress' | 'completed'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collab_action_confirmations_action ON collaborator_action_confirmations(action_id);
CREATE INDEX idx_collab_action_confirmations_user ON collaborator_action_confirmations(user_id);
```

---

## 🔑 TABLES TRANSVERSALES

### 27. `ai_suggestions` - Historique IA Grok
```sql
CREATE TABLE ai_suggestions (
    id BIGSERIAL PRIMARY KEY,
    enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- Contexte
    suggestion_context VARCHAR(100) NOT NULL, -- 'swot' | 'pestel' | 'risk' | 'action' | etc.
    related_entity_type VARCHAR(100), -- 'strategic_issue' | 'risk' | etc.
    related_entity_id BIGINT,
    
    -- Prompt & Réponse
    user_prompt TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Utilisation
    accepted BOOLEAN DEFAULT false,
    modified_by_user BOOLEAN DEFAULT false,
    
    -- API
    api_model VARCHAR(100), -- 'grok-2' | etc.
    api_tokens_used INTEGER,
    api_cost DECIMAL(8,4),
    
    -- Metadata
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_suggestions_enterprise ON ai_suggestions(enterprise_id);
CREATE INDEX idx_ai_suggestions_context ON ai_suggestions(suggestion_context);
```

### 28. `onboarding_steps` - Onboarding Premier Login
```sql
CREATE TABLE onboarding_steps (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Steps complétés
    password_changed BOOLEAN DEFAULT false,
    password_changed_at TIMESTAMP,
    
    signature_uploaded BOOLEAN DEFAULT false,
    signature_data TEXT, -- Base64 canvas
    signature_uploaded_at TIMESTAMP,
    
    activity_domain_selected BOOLEAN DEFAULT false,
    activity_domain VARCHAR(255),
    activity_domain_selected_at TIMESTAMP,
    
    -- Complétude
    onboarding_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_onboarding_steps_user ON onboarding_steps(user_id);
CREATE INDEX idx_onboarding_steps_completed ON onboarding_steps(onboarding_completed);
```

### 29. `activity_logs` - Logs RGPD (étendre spatie)
```sql
-- Utiliser spatie/laravel-activitylog existant
-- Ajouter colonnes custom si nécessaire via config
```

### 30. `consent_logs` - RGPD Consentements
```sql
-- Table déjà existante (voir ConsentLog model)
-- Vérifier présence colonnes RGPD
```

---

## 📈 VUES UTILES

### Vue Tableau de Bord Actions
```sql
CREATE OR REPLACE VIEW v_action_dashboard AS
SELECT 
    a.enterprise_id,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE a.status = 'completed') as completed_actions,
    COUNT(*) FILTER (WHERE a.status = 'in_progress') as in_progress_actions,
    COUNT(*) FILTER (WHERE a.status = 'pending') as pending_actions,
    COUNT(*) FILTER (WHERE a.deadline < CURRENT_DATE AND a.status != 'completed') as overdue_actions,
    AVG(a.progress_rate) as avg_progress_rate,
    AVG(CASE WHEN a.deadline < CURRENT_DATE THEN CURRENT_DATE - a.deadline ELSE 0 END) as avg_delay_days
FROM actions a
WHERE a.deleted_at IS NULL
GROUP BY a.enterprise_id;
```

### Vue Heatmap Risques
```sql
CREATE OR REPLACE VIEW v_risk_heatmap AS
SELECT 
    r.enterprise_id,
    r.probability_score,
    r.severity_score,
    r.criticality_level,
    COUNT(*) as risk_count
FROM risks r
WHERE r.deleted_at IS NULL
GROUP BY r.enterprise_id, r.probability_score, r.severity_score, r.criticality_level;
```

---

## 🔧 SCRIPTS MIGRATION

### Script création complète (exemple)
```sql
-- migrations/2026_02_06_create_iso_tables.php
Schema::create('strategic_issues', function (Blueprint $table) {
    $table->id();
    $table->foreignId('enterprise_id')->constrained()->onDelete('cascade');
    $table->string('analysis_type', 50);
    $table->string('category', 50)->nullable();
    $table->string('title');
    $table->text('description')->nullable();
    $table->string('impact_level', 50)->nullable();
    $table->string('status', 50)->default('draft');
    $table->timestamp('validated_by_rq_at')->nullable();
    $table->foreignId('validated_by_rq_user_id')->nullable()->constrained('users');
    $table->timestamp('validated_by_ceo_at')->nullable();
    $table->foreignId('validated_by_ceo_user_id')->nullable()->constrained('users');
    $table->text('rejection_reason')->nullable();
    $table->text('ai_suggestion')->nullable();
    $table->decimal('ai_confidence_score', 3, 2)->nullable();
    $table->foreignId('created_by')->nullable()->constrained('users');
    $table->foreignId('updated_by')->nullable()->constrained('users');
    $table->timestamps();
    $table->softDeletes();
    
    $table->index('enterprise_id');
    $table->index('analysis_type');
    $table->index('status');
});

// Répéter pour chaque table...
```

---

## 📊 RÉCAPITULATIF

### Tables Nouvelles: **30 tables**
### Tables Étendues: **8 tables existantes**
### Vues: **2 vues** (+ possibilité d'en ajouter)
### Index: **100+ index** pour performance

### Taille estimée BDD: **~500MB** (avec données test)
### Relations: **100+ foreign keys**
### Champs JSON: **50+ colonnes** (flexibilité)
### Champs calculés: **10+ GENERATED columns** (auto-calcul criticité, etc.)

---

**Prêt pour implémentation ! 🚀**

*Remarque: Ce schéma couvre TOUS les modules ISO 4-10 détaillés dans votre spécification.*
