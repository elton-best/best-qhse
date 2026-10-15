<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmergencyProcedure extends Model
{
    use BelongsToEnterprise, HasAuditFields, HasFactory, SoftDeletes;

    protected $fillable = [
        'enterprise_id',
        'site_id',
        'responsible_id',
        'emergency_type',
        'title',
        'measures',
        'deadline',
        'status',
        'procedure_steps',
        'emergency_contacts',
        'required_equipment',
        'training_required',
        'trained_users',
        'last_drill_date',
        'next_drill_date',
        'drill_report',
        'document_path',
        'aspect_id',
        'hazard_nature',
        'probable_scale',
        'neighbour_risk',
        'prevention_actions',
        'mitigation_actions',
        'internal_communication',
        'external_communication',
        'evacuation_routes',
        'assembly_points',
        'next_review_date',
        'last_reviewed_at',
        'review_reason',
    ];

    protected $casts = [
        'deadline' => 'date',
        'procedure_steps' => 'array',
        'emergency_contacts' => 'array',
        'required_equipment' => 'array',
        'training_required' => 'boolean',
        'trained_users' => 'array',
        'last_drill_date' => 'date',
        'next_drill_date' => 'date',
        'next_review_date' => 'date',
        'last_reviewed_at' => 'date',
    ];

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
        return $this->belongsTo(\App\Models\User::class, 'responsible_id');
    }

    /** Aspect environnemental d'origine (M4-07) : le scénario en est issu. */
    public function aspect()
    {
        return $this->belongsTo(EnvironmentalAspect::class, 'aspect_id');
    }

    public function contacts()
    {
        return $this->hasMany(EmergencyContact::class, 'procedure_id');
    }

    public function exercises()
    {
        return $this->hasMany(EmergencyExercise::class, 'procedure_id');
    }

    public function events()
    {
        return $this->hasMany(EmergencyEvent::class, 'procedure_id');
    }
}
