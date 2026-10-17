<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Models\Context;
use App\Modules\Leadership\Models\ContextReview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContextReviewController extends Controller
{
    use AuthorizesSiteAccess;

    public function index(Request $request, Context $context)
    {
        $this->assertSiteAccess($request, (int) $context->site_id);

        $reviews = $context->reviews()
            ->with('reviewer')
            ->get()
            ->map(fn (ContextReview $review) => $this->reviewData($review));

        return response()->json(['data' => $reviews]);
    }

    public function store(Request $request, Context $context)
    {
        $this->assertSiteAccess($request, (int) $context->site_id);

        $validated = $request->validate([
            'summary' => 'required|string|min:10|max:5000',
        ]);

        if (!$context->review_frequency_months) {
            throw ValidationException::withMessages([
                'review_frequency_months' => 'Enregistrez d’abord une fréquence de revue pour le contexte.',
            ]);
        }

        $review = DB::transaction(function () use ($request, $context, $validated): ContextReview {
            $reviewedAt = now();
            $review = ContextReview::create([
                'context_id' => $context->id,
                'reviewer_user_id' => $request->user()?->id,
                'reviewed_at' => $reviewedAt,
                'summary' => $validated['summary'],
                'snapshot' => $context->fresh()->attributesToArray(),
            ]);

            $context->forceFill([
                'last_reviewed_at' => $reviewedAt,
                'next_review_at' => $reviewedAt
                    ->copy()
                    ->addMonths((int) $context->review_frequency_months)
                    ->toDateString(),
            ])->save();

            return $review->load('reviewer');
        });

        return response()->json(['data' => $this->reviewData($review)], 201);
    }

    private function reviewData(ContextReview $review): array
    {
        $reviewer = $review->reviewer;
        $name = trim(implode(' ', array_filter([
            $reviewer?->last_name,
            $reviewer?->first_name,
        ])));

        return [
            'id' => $review->id,
            'reviewed_at' => $review->reviewed_at?->toISOString(),
            'reviewer_name' => $name !== '' ? $name : ($reviewer?->name ?? $reviewer?->email),
            'summary' => $review->summary,
            'snapshot' => $review->snapshot,
        ];
    }

}
