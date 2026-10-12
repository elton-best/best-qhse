<?php

namespace App\Modules\Planning\Models;

use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Processes\Models\Process;

class OperationalControl extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields;

    protected $fillable = [
        'enterprise_id',
        'site_id',
        'process_id',
        'title',
        'description',
        'control_points',
        'acceptance_criteria',
        'operating_instructions',
        'related_document_ids',
        'status',
    ];

    protected $casts = [
        'control_points' => 'array',
        'related_document_ids' => 'array',
    ];

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function process()
    {
        return $this->belongsTo(Process::class);
    }
}
