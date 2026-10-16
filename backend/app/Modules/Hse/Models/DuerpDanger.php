<?php

namespace App\Modules\Hse\Models;

use App\Models\Process;
use App\Models\Risk;
use App\Models\User;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DuerpDanger extends Model
{
    use HasAuditFields, HasFactory, SoftDeletes;

    protected $table = 'duerp_dangers';

    /**
     * Standard 14 INRS risk families from the official DUERP reference document.
     */
    public const INRS_FAMILIES = [
        'Risques de trébuchement, heurt ou autre chute de plain-pied',
        'Risques de chute de hauteur',
        'Risques liés aux circulations internes de véhicules',
        'Risques routiers en mission',
        'Risques liés à la charge physique (manutention, postures, TMS)',
        'Risques liés aux équipements de travail (machines, outils, écrans)',
        'Risques liés aux produits, émissions et déchets (chimiques/biologiques)',
        'Risques d\'incendie et d\'explosion',
        'Risques d\'origine électrique',
        'Risques liés au bruit et ambiances sonores',
        'Risques liés aux vibrations',
        'Risques liés aux rayonnements (ionisants, optiques, électromagnétiques)',
        'Risques liés aux ambiances lumineuses et thermiques (chaleur, froid)',
        'Risques psychosociaux (stress, agressions, charge mentale)',
    ];

    protected $fillable = [
        'duerp_id',
        'organizational_unit',
        'process_id',
        'work_unit_id',
        'risk_family_id',
        'work_unit',
        'activity',
        'activity_name',
        'inrs_family',
        'dangerous_situation',
        'identified_risks',
        'consequences',
        'gravity',
        'frequency',
        'raw_risk_score',
        'raw_risk_level',
        'existing_preventions',
        'mitigation_level',
        'mitigation_coef',
        'prevention_actions',
        'responsible_id',
        'responsible_name',
        'deadline',
        'action_status', // en_continu, en_cours, realise
        'action_evaluation_date',
        'action_effectivity_criteria',
        'action_efficacy_criteria',
        'observations',
        'residual_gravity',
        'residual_frequency',
        'residual_risk_score',
        'residual_risk_level',
        'danger_type',
        'danger_description',
        'exposed_workers',
        'probability_score',
        'severity_score',
        'criticality_score',
        'criticality_level',
        'existing_measures',
        'actions',
        'applicable_norms',
        'exposed_workers_count',
        'prevention_type',
        'action_done_at',
        'assessed_risk_score',
        'assessed_risk_level',
        'residual_mitigation_coef',
        'needs_review',
        'review_reason',
    ];

    protected $casts = [
        'gravity' => 'integer',
        'frequency' => 'integer',
        'raw_risk_score' => 'integer',
        'mitigation_coef' => 'float',
        'residual_gravity' => 'integer',
        'residual_frequency' => 'integer',
        'residual_risk_score' => 'integer',
        'deadline' => 'date',
        'action_evaluation_date' => 'date',
        'exposed_workers' => 'array',
        'actions' => 'array',
        'applicable_norms' => 'array',
        'exposed_workers_count' => 'integer',
        'action_done_at' => 'date',
        'assessed_risk_score' => 'integer',
        'residual_mitigation_coef' => 'float',
        'needs_review' => 'boolean',
        'probability_score' => 'integer',
        'severity_score' => 'integer',
        'criticality_score' => 'integer',
    ];

    /**
     * Les scores sont calculés par DuerpScoringService selon les échelles de l'entreprise.
     * Ce repli ne sert que si un enregistrement est créé sans passer par le service.
     */
    protected static function booted()
    {
        static::saving(function (DuerpDanger $danger) {
            if ($danger->raw_risk_score === null && $danger->gravity !== null && $danger->frequency !== null) {
                $danger->raw_risk_score = (int) $danger->gravity * (int) $danger->frequency;
            }
        });
    }

    public function duerp()
    {
        return $this->belongsTo(Duerp::class, 'duerp_id');
    }

    public function workUnit()
    {
        return $this->belongsTo(DuerpWorkUnit::class, 'work_unit_id');
    }

    public function riskFamily()
    {
        return $this->belongsTo(DuerpRiskFamily::class, 'risk_family_id');
    }

    public function process()
    {
        return $this->belongsTo(Process::class);
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }
}
