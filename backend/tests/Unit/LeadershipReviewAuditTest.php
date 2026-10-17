<?php

namespace Tests\Unit;

use App\Modules\Leadership\Controllers\QhsePolicyController;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use ReflectionMethod;
use Tests\TestCase;

class LeadershipReviewAuditTest extends TestCase
{
    public function test_review_cannot_be_marked_complete_with_missing_checklist_answers(): void
    {
        $request = Request::create('/api/v1/qhse-policies/1', 'PUT');
        $request->setUserResolver(fn () => (object) ['id' => 42]);
        $validated = [
            'leadership_reviews' => [[
                'period_year' => 2026,
                'reviewed_at' => now()->toISOString(),
                'items' => [
                    'a' => ['status' => 'demontre', 'rationale' => 'Preuve documentée'],
                ],
            ]],
        ];

        try {
            $this->normalizeReviews($validated, $request);
            $this->fail('Une revue incomplète ne doit pas être acceptée.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey(
                'leadership_reviews.0.items.b.status',
                $exception->errors(),
            );
        }
    }

    public function test_completed_review_records_the_authenticated_reviewer(): void
    {
        $request = Request::create('/api/v1/qhse-policies/1', 'PUT');
        $request->setUserResolver(fn () => (object) ['id' => 42]);
        $items = [];
        foreach (range('a', 'l') as $itemId) {
            $items[$itemId] = [
                'status' => 'demontre',
                'rationale' => 'Élément vérifié.',
                'evidence' => '',
            ];
        }
        $validated = [
            'leadership_reviews' => [[
                'period_year' => 2026,
                'reviewed_at' => now()->toISOString(),
                'reviewed_by' => 999,
                'items' => $items,
            ]],
        ];

        $this->normalizeReviews($validated, $request);

        $this->assertSame(42, $validated['leadership_reviews'][0]['reviewed_by']);
    }

    public function test_customer_orientation_review_requires_evidence_for_each_control(): void
    {
        $request = Request::create('/api/v1/qhse-policies/1', 'PUT');
        $request->setUserResolver(fn () => (object) ['id' => 42]);
        $validated = [
            'customer_orientation_reviews' => [[
                'period_year' => 2026,
                'reviewed_at' => now()->toISOString(),
                'items' => [
                    'requirements' => [
                        'status' => 'demontre',
                        'rationale' => 'Les contrats sont revus.',
                        'evidence' => 'REV-COM-2026-02',
                    ],
                    'risk_opportunity' => [
                        'status' => 'demontre',
                        'rationale' => 'Les risques client sont évalués.',
                        'evidence' => '',
                    ],
                    'satisfaction' => [
                        'status' => 'demontre',
                        'rationale' => 'Les tendances sont suivies.',
                        'evidence' => 'KPI-SAT-2026',
                    ],
                ],
            ]],
        ];

        try {
            $this->normalizeCustomerOrientationReviews($validated, $request);
            $this->fail('Une revue sans preuve vérifiable ne doit pas être acceptée.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey(
                'customer_orientation_reviews.0.items.risk_opportunity.evidence',
                $exception->errors(),
            );
        }
    }

    public function test_completed_customer_orientation_review_records_authenticated_reviewer(): void
    {
        $request = Request::create('/api/v1/qhse-policies/1', 'PUT');
        $request->setUserResolver(fn () => (object) ['id' => 42]);
        $validated = [
            'customer_orientation_reviews' => [[
                'period_year' => 2026,
                'reviewed_at' => now()->toISOString(),
                'reviewed_by' => 999,
                'items' => [
                    'requirements' => [
                        'status' => 'demontre',
                        'rationale' => 'Les exigences sont suivies.',
                        'evidence' => 'REV-COM-2026-02',
                    ],
                    'risk_opportunity' => [
                        'status' => 'demontre',
                        'rationale' => 'Les risques sont traités.',
                        'evidence' => 'RISK-12',
                    ],
                    'satisfaction' => [
                        'status' => 'ecart',
                        'rationale' => 'Un plan de progrès est ouvert.',
                        'evidence' => 'PLAN-SAT-04',
                    ],
                ],
            ]],
        ];

        $this->normalizeCustomerOrientationReviews($validated, $request);

        $this->assertSame(42, $validated['customer_orientation_reviews'][0]['reviewed_by']);
    }

    private function normalizeReviews(array &$validated, Request $request): void
    {
        $controller = new QhsePolicyController();
        $method = new ReflectionMethod($controller, 'normalizeLeadershipReviews');
        $method->setAccessible(true);
        $arguments = [&$validated, $request];
        $method->invokeArgs($controller, $arguments);
    }

    private function normalizeCustomerOrientationReviews(array &$validated, Request $request): void
    {
        $controller = new QhsePolicyController();
        $method = new ReflectionMethod($controller, 'normalizeCustomerOrientationReviews');
        $method->setAccessible(true);
        $arguments = [&$validated, $request];
        $method->invokeArgs($controller, $arguments);
    }
}
