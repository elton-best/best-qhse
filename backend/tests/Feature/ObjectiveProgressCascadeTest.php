<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\Objective;
use App\Models\Process;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ObjectiveProgressCascadeTest extends TestCase
{
    use RefreshDatabase;

    public function test_parent_progress_is_the_average_of_children_and_refreshes_when_a_child_changes(): void
    {
        $process = Process::factory()->create();
        $common = [
            'process_id' => $process->id,
            'site_id' => $process->site_id,
            'required_resources' => 'Ressources existantes',
            'evaluation_method' => 'Mesure périodique documentée',
            'target_value' => 100,
            'baseline_value' => 0,
        ];

        $parent = Objective::query()->create($common + [
            'ref' => 'OBJ-CASCADE-PARENT',
            'title' => 'Objectif stratégique',
            'level' => 'strategic',
        ]);
        $firstChild = Objective::query()->create($common + [
            'ref' => 'OBJ-CASCADE-CHILD-1',
            'title' => 'Objectif tactique 1',
            'level' => 'tactical',
            'parent_objective_id' => $parent->id,
            'current_value' => 20,
        ]);
        $secondChild = Objective::query()->create($common + [
            'ref' => 'OBJ-CASCADE-CHILD-2',
            'title' => 'Objectif tactique 2',
            'level' => 'tactical',
            'parent_objective_id' => $parent->id,
            'current_value' => 60,
        ]);

        $firstChild->updateProgress();
        $secondChild->updateProgress();
        $parent->refresh()->updateProgress();

        $this->assertSame(40, $parent->fresh()->progress);

        $firstChild->update(['current_value' => 80]);
        $firstChild->updateProgress();

        $this->assertSame(70, $parent->fresh()->progress);

        $action = Action::factory()->create([
            'site_id' => $process->site_id,
            'process_id' => $process->id,
            'initiator_id' => $process->pilot_id,
            'responsible_id' => $process->pilot_id,
            'status' => 'in_progress',
            'progress' => 20,
        ]);
        $firstChild->addAction($action);
        $action->update(['progress' => 30]);

        $this->assertSame(30, $firstChild->fresh()->progress);
        $this->assertSame(45, $parent->fresh()->progress);
    }
}
