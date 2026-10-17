<?php

namespace App\Modules\Planning\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Modules\Processes\Models\Process;

class Opportunity extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    protected $fillable = [
        'ref',
        'enterprise_id',
        'process_id',
        'site_id',
        'opportunity_number',
        'title',
        'description',
        'exploitation_actions',
        'source_category',
        'source_detail',
        'assessment_method',
        'desired_effect',
        'opportunity_decision',
        'decision_rationale',
        'quality_status',
        'legacy_process_risk_opportunity_id',
        'probabilite',
        'gravite',
        'criticite',
        'niveau',
        'probabilite_residuelle',
        'gravite_residuelle',
        'criticite_residuelle',
        'planned_actions',
        'normes_iso',
        'effectiveness_result',
        'effectiveness_review',
        'effectiveness_review_date',
        'effectiveness_reviewed_by',
        'potential_impact',
        'feasibility_score',
        'priority_level',
        'action_ids',
        'responsible_id',
        'responsible_user_id',
        'deadline',
        'status',
        'applicable_norms',
    ];

    protected function casts(): array
    {
        return [
            'feasibility_score' => 'integer',
            'action_ids' => 'array',
            'applicable_norms' => 'array',
            'planned_actions' => 'array',
            'normes_iso' => 'array',
            'deadline' => 'date',
            'effectiveness_review_date' => 'date',
        ];
    }

    protected static function booted()
    {
        static::creating(function (Opportunity $opportunity) {
            if (!$opportunity->enterprise_id && $opportunity->site_id) {
                $opportunity->enterprise_id = Site::where('id', $opportunity->site_id)->value('enterprise_id');
            }
            if (empty($opportunity->opportunity_number)) {
                $month = strtoupper(now()->format('M'));
                $year = now()->format('Y');
                $prefix = "OPP_{$month}_{$year}_";
                $last = static::where('opportunity_number', 'like', $prefix . '%')->orderBy('id', 'desc')->first();
                $seq = 1;
                if ($last && preg_match('/_(\\d+)$/', $last->opportunity_number, $matches)) {
                    $seq = (int) $matches[1] + 1;
                }
                $opportunity->opportunity_number = $prefix . str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
            }
        });
    }

    public function process()
    {
        return $this->belongsTo(Process::class);
    }
    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }
    public function site()
    {
        return $this->belongsTo(Site::class);
    }
    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }
    public function responsibleUser()
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public function effectivenessReviewedBy()
    {
        return $this->belongsTo(User::class, 'effectiveness_reviewed_by');
    }
}
