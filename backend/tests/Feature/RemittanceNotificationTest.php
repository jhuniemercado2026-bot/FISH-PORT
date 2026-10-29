<?php

namespace Tests\Feature;

use App\Enums\FeeTypeName;
use App\Models\BanyeraTransaction;
use App\Models\Docking;
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
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'offline']);
        $head = User::factory()->create(['role' => 'head', 'status' => 'offline']);
        $inspector = User::factory()->create(['role' => 'inspector', 'status' => 'offline']);
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
        $inspector = User::factory()->create(['role' => 'inspector', 'status' => 'offline']);
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'offline']);
        $head = User::factory()->create(['role' => 'head', 'status' => 'offline']);
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

    public function test_today_collection_progress_includes_pending_inspector_collection_amount(): void
    {
        $coordinator = User::factory()->create(['role' => 'coordinator']);
        $inspector = User::factory()->create(['role' => 'inspector']);
        $date = now('Asia/Manila')->toDateString();
        $this->createVehicleTicketCollection($inspector, $date, 125);
        $fee = Fee::query()->where('created_by', $inspector->user_id)->firstOrFail();

        Docking::create([
            'boat_category' => 'visiting',
            'visiting_boat_name' => 'Visiting Docking Test',
            'fee_id' => $fee->fee_id,
            'docking_date' => $date,
            'docking_fee' => 30,
            'created_by' => $inspector->user_id,
        ]);

        BanyeraTransaction::create([
            'boat_category' => 'visiting',
            'visiting_boat_name' => 'Visiting Banyera Test',
            'transaction_date' => $date,
            'total_fee' => 45,
            'created_by' => $inspector->user_id,
        ]);

        $annualOnlyInspector = User::factory()->create(['role' => 'inspector']);
        $dailyTicket = VehicleTicket::query()
            ->where('created_by', $inspector->user_id)
            ->firstOrFail();
        VehicleTicket::create([
            'vehicle_type_id' => $dailyTicket->vehicle_type_id,
            'ticket_type' => 'annual',
            'fee_id' => $dailyTicket->fee_id,
            'ticket_fee' => 900,
            'ticket_date' => $date,
            'plate_number' => 'ANNUAL-TEST',
            'created_by' => $annualOnlyInspector->user_id,
        ]);

        $this->actingAs($coordinator, 'sanctum');

        $response = $this->getJson('/api/remittances/today-collection?date=' . $date)
            ->assertOk();
        $users = collect($response->json('remittance_progress.users'))->keyBy('user_id');

        $this->assertCount(2, $users);
        $this->assertFalse($users->get($inspector->user_id)['has_remitted']);
        $this->assertSame(200.0, (float) $users->get($inspector->user_id)['collection_amount']);
        $this->assertSame(900.0, (float) $users->get($annualOnlyInspector->user_id)['collection_amount']);
    }

    public function test_remittance_reminder_notifies_only_online_inspectors_with_unsubmitted_ticket_collections(): void
    {
        $date = now('Asia/Manila')->toDateString();
        $onlinePendingInspector = User::factory()->create(['role' => 'inspector', 'status' => 'online']);
        $offlineInspector = User::factory()->create(['role' => 'inspector', 'status' => 'offline']);
        $alreadySubmittedInspector = User::factory()->create(['role' => 'inspector', 'status' => 'online']);
        $coordinator = User::factory()->create(['role' => 'coordinator', 'status' => 'online']);

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

    public function test_offline_remittance_keeps_original_date_and_can_be_retried(): void
    {
        $inspector = User::factory()->create(['role' => 'inspector']);
        User::factory()->create(['role' => 'coordinator', 'status' => 'offline']);
        $date = now('Asia/Manila')->subDays(3)->toDateString();
        $this->createVehicleTicketCollection($inspector, $date, 75);
        $this->actingAs($inspector, 'sanctum');
        $payload = ['date' => $date, 'amount' => 75, 'offline_submission' => true];

        $first = $this->postJson('/api/remittances', $payload)->assertCreated();
        $this->postJson('/api/remittances', $payload)->assertOk()
            ->assertJsonPath('remittance.date', $date)
            ->assertJsonPath('remittance.remittance_id', $first->json('remittance.remittance_id'));
        $this->assertDatabaseCount('remittances', 1);
        $this->assertSame(1, Notification::query()->where('title', 'New remittance submitted')->count());
        $this->getJson('/api/remittances/today-collection?date=' . $date . '&summary=1&breakdown=1')
            ->assertOk()
            ->assertJsonPath('has_submitted_remittance', true)
            ->assertJsonPath('amount', 0)
            ->assertJsonPath('breakdown', []);
        $this->getJson('/api/remittances/' . $first->json('remittance.remittance_id'))
            ->assertOk()
            ->assertJsonCount(1, 'remittance.breakdown');

        $this->postJson('/api/remittances', [...$payload, 'amount' => 70])->assertUnprocessable();
        $this->postJson('/api/remittances', ['date' => $date, 'amount' => 75])->assertUnprocessable();
        $this->assertDatabaseCount('remittances', 1);
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
