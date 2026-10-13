<?php

namespace App\Http\Resources;

use App\Http\Resources\Base\JsonApiResource;

class ResponsibilityResource extends JsonApiResource
{
    protected function getAttributes(): array
    {
        return [
            'ref' => $this->ref,
            'process_id' => $this->process_id,
            'role_title' => $this->role_title,
            'level' => $this->level,
            'roles' => $this->roles,
            'responsibilities' => $this->responsibilities,
            'authorities' => $this->authorities,
            'deliverables' => $this->deliverables,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    protected function getRelationships(): array
    {
        return [
            'process' => new ProcessResource($this->whenLoaded('process')),
            'user' => new UserResource($this->whenLoaded('user')),
        ];
    }
}

