<?php

namespace Tests\Feature;

use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UniversalSearchControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_universal_search_filters_results_by_fiscal_year(): void
    {
        $user = User::create([
            'email' => 'search@example.com',
            'password' => bcrypt('secret123'),
            'role' => 'head',
            'status' => 'offline',
            'first_name' => 'Search',
            'last_name' => 'User',
        ]);

        $owner = BoatOwner::create([
            'owner_firstname' => 'Owner',
            'owner_lastname' => 'One',
            'address' => 'Address',
            'contact_number' => '123456789',
        ]);
        $boatType = BoatType::create([
            'type_name' => 'Type One',
        ]);

        $oldBoat = Boat::create([
            'boat_name' => 'FiscalYearBoat2024',
            'owner_id' => $owner->owner_id,
            'boat_type_id' => $boatType->boat_type_id,
            'status' => 'active',
            'created_by' => $user->user_id,
        ]);
        $oldBoat->forceFill(['created_at' => Carbon::create(2024, 1, 10, 12, 0, 0)])->saveQuietly();

        $newBoat = Boat::create([
            'boat_name' => 'FiscalYearBoat2025',
            'owner_id' => $owner->owner_id,
            'boat_type_id' => $boatType->boat_type_id,
            'status' => 'active',
            'created_by' => $user->user_id,
        ]);
        $newBoat->forceFill(['created_at' => Carbon::create(2025, 1, 10, 12, 0, 0)])->saveQuietly();

        $this->actingAs($user, 'sanctum');

        $response = $this->getJson('/api/universal-search?q=FiscalYearBoat&fiscal_year=2025');

        $response->assertOk();

        $results = collect($response->json('results'));

        $this->assertTrue($results->contains(fn ($item) => ($item['title'] ?? null) === 'FiscalYearBoat2025'));
        $this->assertFalse($results->contains(fn ($item) => ($item['title'] ?? null) === 'FiscalYearBoat2024'));
    }
}
