<?php

namespace Tests\Feature;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\User;
use App\Models\VehicleType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VehicleTicketControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_rejects_archived_vehicle_type(): void
    {
        $user = User::factory()->create(['role' => 'coordinator', 'status' => 'active']);
        $vehicleType = VehicleType::create([
            'type_name' => 'Archived Test Vehicle',
            'created_by' => $user->user_id,
        ]);
        $vehicleType->delete();

        $fee = Fee::create([
            'fee_type_name' => FeeTypeName::VehicleTicketDaily->value,
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'amount' => 25,
            'effective_from' => now()->subDay()->toDateString(),
            'created_by' => $user->user_id,
        ]);

        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/vehicle-tickets', [
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'plate_number' => 'ABC123',
            'ticket_type' => 'daily',
            'fee_id' => $fee->fee_id,
            'ticket_fee' => 25,
            'ticket_date' => now()->toDateString(),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('vehicle_type_id');
    }
}
