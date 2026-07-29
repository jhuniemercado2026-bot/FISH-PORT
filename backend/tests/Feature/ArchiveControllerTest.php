<?php

namespace Tests\Feature;

use App\Http\Controllers\ArchiveController;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ArchiveControllerTest extends TestCase
{
    #[Test]
    public function it_does_not_include_usage_counts_in_archived_items(): void
    {
        $controller = new ArchiveController();
        $method = new \ReflectionMethod($controller, 'transformArchiveItem');
        $method->setAccessible(true);

        $owner = new \stdClass();
        $owner->owner_id = 1;
        $owner->owner_firstname = 'Eric';
        $owner->owner_lastname = 'Santos';
        $owner->address = 'Opol Fish Port';
        $owner->contact_number = '09000000001';
        $owner->boats_count = 3;
        $owner->created_at = now();
        $owner->deleted_at = now();
        $owner->createdBy = null;
        $owner->archived_by = null;

        $result = $method->invoke($controller, 'boatOwners', $owner);

        $this->assertArrayNotHasKey('boats_count', $result);
    }
}
