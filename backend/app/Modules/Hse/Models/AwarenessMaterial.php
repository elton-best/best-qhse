<?php

namespace App\Modules\Hse\Models;

use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

class AwarenessMaterial extends Model
{
    use BelongsToEnterprise;

    public const TYPES = ['sheet', 'video', 'quiz'];

    protected $fillable = ['enterprise_id', 'campaign_id', 'topic', 'type', 'title', 'body', 'url', 'questions', 'pass_mark', 'position'];

    protected function casts(): array
    {
        return ['questions' => 'array', 'pass_mark' => 'integer'];
    }

    public function campaign()
    {
        return $this->belongsTo(AwarenessCampaign::class, 'campaign_id');
    }

    /**
     * Contenu proposé à un participant : les bonnes réponses du quiz ne sont jamais exposées.
     *
     * @return array<string, mixed>
     */
    public function forParticipant(): array
    {
        return [
            'id' => $this->id,
            'topic' => $this->topic,
            'type' => $this->type,
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
            'pass_mark' => $this->pass_mark,
            'questions' => collect($this->questions ?? [])->map(fn (array $q) => ['question' => $q['question'] ?? '', 'options' => $q['options'] ?? []])->all(),
        ];
    }
}
