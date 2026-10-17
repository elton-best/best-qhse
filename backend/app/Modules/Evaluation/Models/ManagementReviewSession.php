<?php

namespace App\Modules\Evaluation\Models;

use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

class ManagementReviewSession extends Model
{
    use BelongsToEnterprise;

    protected $fillable = ['enterprise_id', 'review_id', 'held_on', 'attendees', 'notes', 'created_by'];

    protected function casts(): array
    {
        return ['held_on' => 'date', 'attendees' => 'array'];
    }
}
