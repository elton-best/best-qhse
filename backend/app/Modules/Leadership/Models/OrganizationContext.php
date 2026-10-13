<?php

namespace App\Modules\Leadership\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;

class OrganizationContext extends Model
{
    //

    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    protected $fillable = [
        'ref',
        'enterprise_id',
        'site_id',
        'title',
        'is_active',
        'year',
        'internal_strengths',
        'internal_weaknesses',
        'external_opportunities',
        'external_threats',
        'political_factors',
        'economic_factors',
        'social_factors',
        'technological_factors',
        'environmental_factors',
        'legal_factors',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function site()
    {
        return $this->belongsTo(Site::class, 'site_id');
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class, 'enterprise_id');
    }

    public function issues()
    {
        return $this->hasMany(ContextIssue::class, 'context_id');
    }

    /**
     * Enjeux majeurs (synthèse) : enjeux marqués is_major.
     */
    public function majorIssues()
    {
        return $this->hasMany(ContextIssue::class, 'context_id')->where('is_major', true);
    }
}
