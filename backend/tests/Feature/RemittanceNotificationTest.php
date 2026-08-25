<?php

namespace Tests\Feature;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\Notification;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Models\VehicleType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RemittanceNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['broadcasting.default' => 'log']);
    }

    public function test_coordinator_remittance_notifies_active_heads(): void
    {
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'active']);
        $head = User::factory()->create(['role' => 'head', 'status' => 'active']);
        $inspector = User::factory()->create(['role' => 'inspector', 'status' => 'active']);
        $date = now('Asia/Manila')->toDateString();
        $this->createVehicleTicketCollection($coordinator, $date, 150);

        $this->actingAs($coordinator, 'sanctum');

        $response = $this->postJson('/api/remittances', [
            'date' => $date,
            'amount' => 150,
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'title' => 'New remittance submitted',
            'recipient_user_id' => $head->user_id,
            'sender_user_id' => $coordinator->user_id,
            'related_type' => 'remittance',
            'is_read' => false,
        ]);
        $this->assertSame(0, Notification::query()->where('recipient_user_id', $inspector->user_id)->count());
    }

    public function test_inspector_remittance_notifies_active_coordinators(): void
    {
        $inspector = User::factory()->create(['role' => 'inspector', 'status' => 'active']);
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'active']);
        $head = User::factory()->create(['role' => 'head', 'status' => 'active']);
        $date = now('Asia/Manila')->toDateString();
        $this->createVehicleTicketCollection($inspector, $date, 75);

        $this->actingAs($inspector, 'sanctum');

        $response = $this->postJson('/api/remittances', [
            'date' => $date,
            'amount' => 75,
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'title' => 'New remittance submitted',
            'recipient_user_id' => $coordinator->user_id,
            'sender_user_id' => $inspector->user_id,
            'related_type' => 'remittance',
            'is_read' => false,
        ]);
        $this->assertSame(0, Notification::query()->where('recipient_user_id', $head->user_id)->count());
    }

    public function test_remittance_reminder_notifies_only_online_inspectors_with_unsubmitted_ticket_collections(): void
    {
        $date = now('Asia/Manila')->toDateString();
        $onlinePendingInspector = User::factory()->create(['role' => 'inspector', 'status' => 'active']);
        $offlineInspector = User::factory()->create(['role' => 'inspector', 'status' => 'active']);
        $alreadySubmittedInspector = User::factory()->create(['role' => 'inspector', 'status' => 'active']);
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'active']);

        $onlinePendingInspector->createToken('test-online-inspector');
        $alreadySubmittedInspector->createToken('test-submitted-inspector');
        $coordinator->createToken('test-coordinator');

        $this->createVehicleTicketCollection($onlinePendingInspector, $date, 100);
        $this->createVehicleTicketCollection($offlineInspector, $date, 125);
        $this->createVehicleTicketCollection($alreadySubmittedInspector, $date, 150);
        $this->createVehicleTicketCollection($coordinator, $date, 175);

        Remittance::create([
            'date' => $date,
            'amount' => 150,
            'submitted_by' => $alreadySubmittedInspector->user_id,
        ]);

        $this->artisan('remittances:send-inspector-reminders', ['--date' => $date])
            ->assertExitCode(0);

        $this->assertDatabaseHas('notifications', [
            'title' => 'Remittance reminder',
            'recipient_user_id' => $onlinePendingInspector->user_id,
            'related_type' => 'remittance_reminder',
            'related_id' => $onlinePendingInspector->user_id,
            'is_read' => false,
        ]);
        $this->assertStringContainsString(
            'Please submit your remittance.',
            Notification::query()
                ->where('recipient_user_id', $onlinePendingInspector->user_id)
                ->where('title', 'Remittance reminder')
                ->value('message')
        );
        $this->assertSame(0, Notification::query()->where('recipient_user_id', $offlineInspector->user_id)->count());
        $this->assertSame(0, Notification::query()->where('recipient_user_id', $alreadySubmittedInspector->user_id)->count());
        $this->assertSame(0, Notification::query()->where('recipient_user_id', $coordinator->user_id)->count());

        $this->artisan('remittances:send-inspector-reminders', ['--date' => $date])
            ->assertExitCode(0);

        $this->assertSame(1, Notification::query()
            ->where('recipient_user_id', $onlinePendingInspector->user_id)
            ->where('title', 'Remittance reminder')
            ->count());
    }

    private function createVehicleTicketCollection(User $collector, string $date, float $amount): void
    {
        $vehicleType = VehicleType::create([
            'type_name' => 'Test Vehicle ' . $collector->user_id,
            'created_by' => $collector->user_id,
        ]);
        $fee = Fee::create([
            'fee_type_name' => FeeTypeName::VehicleTicketDaily->value,
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'amount' => $amount,
            'effective_from' => now('Asia/Manila')->subDay()->toDateString(),
            'created_by' => $collector->user_id,
        ]);

        VehicleTicket::create([
            'vehicle_type_id' => $vehicleType->vehicle_type_id,
            'plate_number' => 'TEST-' . $collector->user_id,
            'ticket_type' => 'daily',
            'fee_id' => $fee->fee_id,
            'daily_fee' => $amount,
            'ticket_fee' => $amount,
            'ticket_date' => $date,
            'created_by' => $collector->user_id,
        ]);
    }
}
