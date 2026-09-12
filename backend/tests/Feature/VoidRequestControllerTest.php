<?php

namespace Tests\Feature;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\Notification;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Models\VehicleType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoidRequestControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_void_request_can_be_sent_to_offline_coordinator(): void
    {
        $inspector = User::factory()->create(['role' => 'inspector', 'status' => 'offline']);
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'offline']);

        $vehicleType = VehicleType::create([
            'type_name' => 'Test Vehicle',
            'created_by' => $coordinator->user_id,
        ]);

        $fee = Fee::create([
            'fee_type_name' => FeeTypeName::VehicleTicketDaily->value,
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'amount' => 25,
            'effective_from' => now()->subDay()->toDateString(),
            'created_by' => $coordinator->user_id,
        ]);

        $ticket = VehicleTicket::create([
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'ticket_type' => 'daily',
            'fee_id' => $fee->fee_id,
            'daily_fee' => 25,
            'banyera_fee' => 0,
            'ticket_fee' => 25,
            'ticket_date' => '2026-09-12 08:14:00',
            'plate_number' => '',
            'created_by' => $inspector->user_id,
        ]);

        $this->actingAs($inspector, 'sanctum');

        $response = $this->postJson('/api/void-requests', [
            'transaction_type' => 'tickets',
            'transaction_id' => $ticket->ticket_id,
            'void_reason' => 'Wrong entry',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('notifications_count', 1);

        $this->assertSame(1, Notification::query()
            ->where('recipient_user_id', $coordinator->user_id)
            ->where('related_type', 'void_request_daily_ticket')
            ->where('related_id', $ticket->ticket_id)
            ->count());

        $this->assertSame(
            'Requested to void vehicle ticket, Test Vehicle in September 12, 2026 in 8:14 AM with ₱25.00. Reason: Wrong entry',
            Notification::query()
                ->where('recipient_user_id', $coordinator->user_id)
                ->where('related_type', 'void_request_daily_ticket')
                ->where('related_id', $ticket->ticket_id)
                ->value('message')
        );
    }
}
