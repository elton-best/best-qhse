<?php

namespace App\Modules\Hse\Models;

use Carbon\CarbonInterface;

/**
 * Instrument de surveillance et de mesure (ISO 14001 §7.1.5, §9.1.1) : étalonnage, échéances, validité des mesures.
 */
class MonitoringInstrument extends ManagedRecord
{
    protected static string $referencePrefix = 'INS';

    protected $table = 'monitoring_instruments';

    public const TYPES = ['meter', 'scale', 'sensor', 'analyzer', 'thermometer', 'flow_meter', 'other'];

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'instrument_type', 'serial_number', 'location',
        'measurement_range', 'accuracy', 'last_calibration_date', 'calibration_frequency_days', 'next_calibration_date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'last_calibration_date' => 'date',
            'next_calibration_date' => 'date',
            'calibration_frequency_days' => 'integer',
        ];
    }

    /** Une mesure n'est fiable que si l'instrument est en service et son étalonnage valide à la date de la mesure. */
    public function isValidOn(CarbonInterface $date): bool
    {
        return $this->status === 'in_service'
            && $this->next_calibration_date !== null
            && $date->startOfDay()->lte($this->next_calibration_date->copy()->startOfDay());
    }

    public function calibrations()
    {
        return $this->hasMany(InstrumentCalibration::class, 'instrument_id')->orderByDesc('calibrated_on')->orderByDesc('id');
    }
}
