<?php

namespace App\Modules\Hse\Models;

use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;

class EmergencyProcedure extends Model
{
    use BelongsToEnterprise, HasFactory, SoftDeletes, HasAuditFields;

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
}
