<?php

namespace App\Modules\Evaluation\Models;

use App\Modules\Enterprise\Models\User;
use App\Modules\Improvement\Models\Action;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

/**
 * Décision de la revue de direction, rattachée à l'une des sorties de 9.3.3. Chaque décision devient une action suivie.
 */
class ManagementReviewDecision extends Model
{
    use BelongsToEnterprise;

    /** Sorties de 9.3.3 hors conclusions (pertinence, adéquation, efficacité), saisies séparément. */
    public const OUTPUT_TYPES = [
        'improvement' => 'Opportunités d\'amélioration continue',
        'system_changes_resources' => 'Changements à apporter au système de management et besoins en ressources',
        'objectives_not_met' => 'Actions lorsque les objectifs environnementaux ne sont pas atteints',
        'integration' => 'Intégration du système aux autres processus de l\'organisme',
        'strategic' => 'Implications pour l\'orientation stratégique',
    ];

    protected $fillable = ['enterprise_id', 'review_id', 'output_type', 'text', 'not_applicable', 'responsible_id', 'due_date', 'action_id', 'created_by'];

    protected function casts(): array
    {
        return ['not_applicable' => 'boolean', 'due_date' => 'date'];
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function action()
    {
        return $this->belongsTo(Action::class);
    }
}
