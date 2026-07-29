<?php

namespace Tests\Feature;

use App\Models\BanyeraTransaction;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\Docking;
use App\Models\Fee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_keeps_existing_tokens_available_for_the_same_user(): void
    {
        $user = User::factory()->create([
            'email' => 'coordinator@example.com',
            'password' => bcrypt('secret123'),
            'role' => 'coordinator',
            'status' => 'active',
        ]);

        $existingToken = $user->createToken('web-session')->plainTextToken;

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ]);

        $response->assertOk();
        $response->assertJsonPath('user.role', 'coordinator');

        $this->assertSame(2, $user->fresh()->tokens()->count());
        $this->assertNotNull($user->fresh()->tokens()->where('name', 'web-session')->first());

        $this->assertNotEmpty($response->json('token'));
        $this->assertNotSame($existingToken, $response->json('token'));
    }

    public function test_billing_creation_rejects_voided_transactions(): void
    {
        $user = User::factory()->create(['role' => 'coordinator', 'status' => 'active']);
        $boatOwner = BoatOwner::factory()->create();
        $boatType = BoatType::factory()->create();
        $boat = Boat::factory()->create([
            'owner_id' => $boatOwner->owner_id,
            'boat_type_id' => $boatType->boat_type_id,
            'status' => 'active',
        ]);
        $fee = Fee::factory()->create();

        $docking = Docking::create([
            'boat_id' => $boat->boat_id,
            'fee_id' => $fee->fee_id,
            'docking_date' => now(),
            'docking_fee' => 100,
            'created_by' => $user->user_id,
            'voided_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/bills', [
            'boat_id' => $boat->boat_id,
            'items' => [
                [
                    'transaction_type' => 'docking',
                    'docking_id' => $docking->docking_id,
                    'amount' => 100,
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('items');
    }
}
