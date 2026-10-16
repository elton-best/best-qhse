<?php

namespace App\Modules\Support\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CalibrationRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'calibration_plan_id',
        'performed_date',
        'certificate_number',
        'certificate_path',
        'results',
        'conformity_status',
        'impact_analysis',
        'impact_assessed',
        'cost',
        'next_calibration_date',
    ];

    protected $casts = [
        'performed_date' => 'date',
        'results' => 'array',
        'impact_assessed' => 'boolean',
        'cost' => 'decimal:2',
        'next_calibration_date' => 'date',
    ];

    public function calibrationPlan()
    {
        return $this->belongsTo(CalibrationPlan::class);
    }
}
