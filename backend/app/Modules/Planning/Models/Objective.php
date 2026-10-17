<?php

namespace App\Modules\Planning\Models;

use App\Traits\BelongsToEnterprise;
use App\Traits\HasActions;
use App\Traits\HasAuditFields;
use App\Traits\HasAxes;
use App\Traits\HasReference;
use App\Traits\HasWorkflowStates;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Traits\LogsActivity;
use App\Modules\Enterprise\Models\User;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Evaluation\Models\Indicateur;
use App\Modules\Leadership\Models\StrategicAxis;
use App\Modules\Processes\Models\Process;
use App\Modules\Support\Models\Document;

class Objective extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference, HasAxes, HasWorkflowStates, HasActions, LogsActivity, BelongsToEnterprise;

    protected $fillable = [
        'ref',
        'enterprise_id',
        'process_id',
        'site_id',
        'parent_objective_id',
        'strategic_axis_id',
        'workflow_state_id',
        'indicateur_id',
        'type',
        'is_smart_validated',
        'smart_criteria',
        'title',
        'description',
        'start_date',
        'level',
        'indicator',
        'indicator_name',
        'unit',
        'baseline_value',
        'target_value',
        'current_value',
        'progress',
        'milestones',
        'responsible_id',
        'deadline',
        'allocated_budget',
        'required_resources',
        'evaluation_method',
        'measurement_frequency',
        'applicable_norms',
        'status',
    ];

    protected $casts = [
        'deadline' => 'date',
        'start_date' => 'date',
        'is_smart_validated' => 'boolean',
        'smart_criteria' => 'array',
        'milestones' => 'array',
        'progress' => 'integer',
        'allocated_budget' => 'decimal:2',
        'applicable_norms' => 'array',
    ];

    protected static $logAttributes = ['ref', 'title', 'status', 'progress', 'current_value'];
    protected static $logOnlyDirty = true;

    public function getActivitylogOptions(): \Spatie\Activitylog\LogOptions
    {
        return \Spatie\Activitylog\LogOptions::defaults()
            ->logOnly(['ref', 'title', 'status', 'progress', 'current_value'])
            ->logOnlyDirty();
    }

    public function process(): BelongsTo
    {
        return $this->belongsTo(Process::class);
    }

    public function parentObjective(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_objective_id');
    }

    public function childObjectives(): HasMany
    {
        return $this->hasMany(self::class, 'parent_objective_id');
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function strategicAxis(): BelongsTo
    {
        return $this->belongsTo(StrategicAxis::class);
    }

    public function indicateur(): BelongsTo
    {
        return $this->belongsTo(Indicateur::class);
    }

    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function documents(): MorphToMany
    {
        return $this->morphToMany(Document::class, 'documentable');
    }

    public function processes(): MorphToMany
    {
        return $this->morphToMany(Process::class, 'processable');
    }

    public function updateProgress(): void
    {
        // Parent objectives report the average progress of their direct children.
        $childrenProgress = $this->childObjectives()
            ->selectRaw('AVG(COALESCE(progress, 0)) as avg_progress')
            ->value('avg_progress');

        if ($childrenProgress !== null) {
            $this->progress = min(100, max(0, (int) round((float) $childrenProgress)));
            $this->saveAndRefreshParentProgress();
            return;
        }

        // If objective has linked actions, compute average progress of those actions
        try {
            $actionsCount = $this->actions()->count();
        } catch (\Throwable $e) {
            $actionsCount = 0;
        }

        if ($actionsCount > 0) {
            // Use progress_rate if available, fallback to progress
            $avg = $this->actions()
                ->selectRaw('AVG(COALESCE(progress_rate, progress, 0)) as avg_progress')
                ->value('avg_progress');

            $this->progress = min(100, max(0, (int) round($avg ?? 0)));
            $this->saveAndRefreshParentProgress();
            return;
        }

        // Fallback to measured values when no linked actions exist.
        if (!is_numeric($this->target_value) || !is_numeric($this->current_value)) {
            $this->progress = 0;
            $this->saveAndRefreshParentProgress();
            return;
        }

        $baseline = is_numeric($this->baseline_value) ? (float) $this->baseline_value : 0.0;
        $target = (float) $this->target_value;
        $current = (float) $this->current_value;
        $range = $target - $baseline;
        $progress = abs($range) < 0.000001
            ? ($current === $target ? 100 : 0)
            : (($current - $baseline) / $range) * 100;
        $this->progress = min(100, max(0, round($progress)));
        $this->saveAndRefreshParentProgress();
    }

    private function saveAndRefreshParentProgress(): void
    {
        $this->save();
        $this->parentObjective()->first()?->updateProgress();
    }

    public function isAchieved(): bool
    {
        if (!is_numeric($this->current_value) || !is_numeric($this->target_value)) {
            return false;
        }

        $baseline = is_numeric($this->baseline_value) ? (float) $this->baseline_value : 0.0;
        $current = (float) $this->current_value;
        $target = (float) $this->target_value;

        return $target < $baseline ? $current <= $target : $current >= $target;
    }

    public function isOverdue(): bool
    {
        return $this->deadline && $this->deadline->isPast() && !$this->isAchieved();
    }
}
