<?php

namespace App\Modules\Hse\Models;

use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

class AwarenessAttendance extends Model
{
    use BelongsToEnterprise;

    protected $fillable = ['enterprise_id', 'talk_id', 'user_id', 'name', 'organization', 'method', 'signed_at'];

    protected function casts(): array
    {
        return ['signed_at' => 'datetime'];
    }
}
