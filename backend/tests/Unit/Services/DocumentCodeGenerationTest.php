<?php

namespace Tests\Unit\Services;

use App\Models\DocumentTypeCatalog;
use App\Models\Enterprise;
use App\Models\NomenclatureTemplate;
use App\Models\Site;
use App\Services\DocumentCodeGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class DocumentCodeGenerationTest extends TestCase
{
    use RefreshDatabase;

    private DocumentCodeGenerationService $service;
    private Enterprise $enterprise;
    private Site $site;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(DocumentCodeGenerationService::class);
        $this->enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create([
            'enterprise_id' => $this->enterprise->id,
        ]);
    }

    public function test_it_refuses_generation_when_no_published_template_exists(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->generateForSiteAndType($this->site->id, 'PROC');
    }

    public function test_it_generates_code_from_published_template(): void
    {
        $catalog = DocumentTypeCatalog::query()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'name' => 'Procédure',
            'abbreviation' => 'PROC',
            'is_active' => true,
        ]);

        $template = NomenclatureTemplate::query()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'document_type_catalog_id' => $catalog->id,
            'name' => 'Template PROC',
            'version' => 1,
            'status' => 'published',
            'is_active' => true,
            'separator' => '-',
            'format_structure' => [
                ['order' => 1, 'type' => 'document_type', 'label' => 'Type', 'length' => 4],
                ['order' => 2, 'type' => 'sequential_number', 'label' => 'Sequence', 'length' => 3],
            ],
        ]);

        $result = $this->service->generateForSiteAndType($this->site->id, 'PROC');

        $this->assertFalse($result['is_fallback']);
        $this->assertSame($template->id, $result['nomenclature_template_id']);
        $this->assertStringStartsWith('PROC-', $result['code']);
        $this->assertMatchesRegularExpression('/PROC-\d{3}/', $result['code']);
    }
}
