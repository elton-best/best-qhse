<?php

namespace App\Http\Resources;

use App\Http\Resources\Base\JsonApiResource;

class ModificationResource extends JsonApiResource
{
    protected function getAttributes(): array
    {
        return [
            'ref' => $this->ref,
            'number' => $this->number,
            'date' => $this->date?->toISOString(),
            'object' => $this->object,
            'description' => $this->description,
            'objectives' => $this->objectives,
            'consequences' => $this->consequences,
            'required_resources' => $this->required_resources,
            'validated_at' => $this->validated_at?->toISOString(),
            'status' => $this->status,
            'workflow_status' => $this->workflow_status,
            'initiator_id' => $this->initiator_id,
            'rq_verified_by' => $this->rq_verified_by,
            'rq_verified_at' => $this->rq_verified_at?->toISOString(),
            'rq_notes' => $this->rq_notes,
            'ceo_approved_by' => $this->ceo_approved_by,
            'ceo_approved_at' => $this->ceo_approved_at?->toISOString(),
            'ceo_notes' => $this->ceo_notes,
            'modification_results' => $this->modification_results,
            'surveillance_results' => $this->surveillance_results,
            'affected_document_ids' => $this->affected_document_ids,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    protected function getRelationships(): array
    {
        return [
            'site' => new SiteResource($this->whenLoaded('site')),
            'initiator' => new UserResource($this->whenLoaded('initiator')),
            'responsible' => new UserResource($this->whenLoaded('responsible')),
            'rqVerifier' => new UserResource($this->whenLoaded('rqVerifier')),
            'ceoApprover' => new UserResource($this->whenLoaded('ceoApprover')),
            'validator' => new UserResource($this->whenLoaded('validator')),
        ];
    }
}

