<?php

namespace App\Http\Resources;

use App\Http\Resources\Base\JsonApiResource;

class OpportunityResource extends JsonApiResource
{
    protected function getAttributes(): array
    {
        return [
            'ref' => $this->ref,
            'code' => $this->ref,
            'process_id' => $this->process_id,
            'site_id' => $this->site_id,
            'enterprise_id' => $this->enterprise_id,
            'title' => $this->title,
            'description' => $this->description,
            'source_category' => $this->source_category,
            'source_detail' => $this->source_detail,
            'assessment_method' => $this->assessment_method,
            'desired_effect' => $this->desired_effect,
            'opportunity_decision' => $this->opportunity_decision,
            'decision_rationale' => $this->decision_rationale,
            'probabilite' => $this->probabilite,
            'gravite' => $this->gravite,
            'criticite' => $this->criticite,
            'niveau' => $this->niveau,
            'probabilite_residuelle' => $this->probabilite_residuelle,
            'gravite_residuelle' => $this->gravite_residuelle,
            'criticite_residuelle' => $this->criticite_residuelle,
            'planned_actions' => $this->planned_actions ?? [],
            'actions_prevues' => $this->exploitation_actions,
            'normes_iso' => $this->normes_iso ?? $this->applicable_norms ?? [],
            'responsible_user_id' => $this->responsible_user_id ?? $this->responsible_id,
            'responsible_id' => $this->responsible_id,
            'effectiveness_result' => $this->effectiveness_result,
            'effectiveness_review' => $this->effectiveness_review,
            'effectiveness_review_date' => $this->effectiveness_review_date?->toDateString(),
            'effectiveness_reviewed_by' => $this->effectiveness_reviewed_by,
            'deadline' => $this->deadline?->toISOString(),
            'target_date' => $this->deadline?->toDateString(),
            'status' => $this->quality_status ?: $this->legacyStatusToQualityStatus($this->status),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    protected function getRelationships(): array
    {
        return [
            'site' => new SiteResource($this->whenLoaded('site')),
            'process' => new ProcessResource($this->whenLoaded('process')),
            'responsible' => new UserResource($this->whenLoaded('responsible')),
            'responsibleUser' => new UserResource($this->whenLoaded('responsibleUser')),
            'effectivenessReviewedBy' => new UserResource($this->whenLoaded('effectivenessReviewedBy')),
        ];
    }

    private function legacyStatusToQualityStatus(?string $status): string
    {
        return match ($status) {
            'evaluated' => 'en_cours',
            'exploited' => 'traite',
            'monitored' => 'surveille',
            default => 'identifie',
        };
    }
}

