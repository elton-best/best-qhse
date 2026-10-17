@extends('pdf.layouts.master')

@section('title', 'Politique QHSE - Version ' . $policy->version)

@section('styles')
    <style>
        .meta { background: #f3f4f6; padding: 15px; border-radius: 5px; margin-bottom: 30px; }
    </style>
@endsection

@section('content')
    <div class="header">
        <h1>Politique QHSE</h1>
        <p><strong>Version:</strong> {{ $policy->version }} | <strong>Date:</strong> {{ $policy->effective_date?->format('d/m/Y') ?? 'N/A' }}</p>
    </div>

    <div class="meta">
        <strong>Statut:</strong> {{ $policy->status === 'validated' ? 'Validée' : 'Brouillon' }}
        @if($policy->validated_by_direction_at)
        <br><strong>Validée le:</strong> {{ $policy->validated_by_direction_at->format('d/m/Y à H:i') }}
        @endif
        @if($policy->validated_by_user_id)
        <br><strong>Approbation électronique:</strong>
        {{ $policy->validatedBy?->name ?? ('Utilisateur #' . $policy->validated_by_user_id) }}
        @endif
    </div>

    <h2>Mission</h2>
    <p>{{ $policy->mission }}</p>

    @if($policy->vision)
    <h2>Vision</h2>
    <p>{{ $policy->vision }}</p>
    @endif

    @if($policy->values && count($policy->values) > 0)
    <h2>Valeurs</h2>
    <ul>
        @foreach($policy->values as $value)
        <li>{{ $value }}</li>
        @endforeach
    </ul>
    @endif

    @if($policy->commitments && count($policy->commitments) > 0)
    <h2>Engagements</h2>
    <ul>
        @foreach($policy->commitments as $commitment)
        <li>{{ $commitment }}</li>
        @endforeach
    </ul>
    @endif

    @if($policy->quality_policy)
    <h2>Politique Qualité</h2>
    <p>{{ $policy->quality_policy }}</p>
    @endif

    @if($policy->environmental_policy)
    <h2>Politique Environnementale</h2>
    <p>{{ $policy->environmental_policy }}</p>
    @endif

    @if($policy->health_safety_policy)
    <h2>Politique Santé & Sécurité</h2>
    <p>{{ $policy->health_safety_policy }}</p>
    @endif

    @if($policy->ethics_charter)
    <h2>Charte éthique</h2>
    <p>{{ $policy->ethics_charter }}</p>
    @endif

    @if(is_array($policy->customer_orientation_reviews) && count($policy->customer_orientation_reviews) > 0)
    <h2>Revue annuelle de l’orientation client (5.1.2)</h2>
    @foreach($policy->customer_orientation_reviews as $review)
        <h3>Période {{ $review['period_year'] ?? '—' }} — {{ !empty($review['reviewed_at']) ? 'signée le ' . $review['reviewed_at'] : 'brouillon' }}</h3>
        @php
            $customerOrientationLabels = [
                'requirements' => 'Exigences clients et légales déterminées, comprises et satisfaites',
                'risk_opportunity' => 'Risques et opportunités concernant le client traités',
                'satisfaction' => 'Amélioration de la satisfaction maintenue comme priorité',
            ];
            $customerOrientationStatuses = [
                'demontre' => 'Démontré',
                'ecart' => 'Écart à traiter',
                'non_applicable' => 'Non applicable',
            ];
        @endphp
        @foreach($customerOrientationLabels as $controlId => $label)
            @php
                $answer = $review['items'][$controlId] ?? [];
            @endphp
            <p><strong>{{ $label }} — {{ $customerOrientationStatuses[$answer['status'] ?? ''] ?? 'À évaluer' }}</strong></p>
            @if(!empty($answer['rationale']))
                <p>Décision / justification : {{ $answer['rationale'] }}</p>
            @endif
            @if(!empty($answer['evidence']))
                <p>Preuve : {{ $answer['evidence'] }}</p>
            @endif
        @endforeach
    @endforeach
    @endif
@endsection
