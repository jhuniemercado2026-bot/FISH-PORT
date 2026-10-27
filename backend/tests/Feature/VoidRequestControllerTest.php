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

    public function test_void_request_approval_notifies_requester_with_original_details(): void
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

        $requestMessage = Notification::query()
            ->where('recipient_user_id', $coordinator->user_id)
            ->where('related_type', 'void_request_daily_ticket')
            ->where('related_id', $ticket->ticket_id)
            ->value('message');
        $this->assertStringContainsString(
            'requested to void vehicle ticket, Test Vehicle in September 12, 2026 in 8:14 AM with ₱25.00. Reason: Wrong entry',
            $requestMessage
        );

        $this->actingAs($coordinator, 'sanctum');

        $this->patchJson('/api/vehicle-tickets/' . $ticket->ticket_id . '/void', [
            'void_reason' => 'Wrong entry',
        ])->assertOk();

        $approvalNotification = Notification::query()
            ->where('recipient_user_id', $inspector->user_id)
            ->where('sender_user_id', $coordinator->user_id)
            ->where('related_type', 'void_request_daily_ticket')
            ->where('related_id', $ticket->ticket_id)
            ->where('title', 'Void Request Approved')
            ->firstOrFail();

        $this->assertSame(
            'Your request to void the vehicle ticket, Test Vehicle in September 12, 2026 in 8:14 AM with ₱25.00 has been approved by the Coordinator. Reason: Wrong entry',
            $approvalNotification->message
        );
    }
}
