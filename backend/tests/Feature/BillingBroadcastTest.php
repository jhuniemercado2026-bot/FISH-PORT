<?php

namespace Tests\Feature;

use App\Events\TransactionUpdated;
use App\Http\Controllers\BillController;
use Illuminate\Support\Facades\Broadcast;
use Tests\TestCase;

class BillingBroadcastTest extends TestCase
{
    public function test_large_bills_publish_a_small_notification_without_losing_the_original_record(): void
    {
        $record = [
            'bill_id' => 88, 'boat_id' => 9, 'total_amount' => '888.00',
            'penalty_amount' => '0.00', 'created_at' => '2026-10-26T01:00:00Z',
            'items' => array_fill(0, 300, ['amount' => '2.96', 'description' => str_repeat('detail', 50)]),
            'line_items' => array_fill(0, 300, ['amount' => '2.96']),
            'boat' => ['owner' => ['contact_number' => 'private']],
        ];
        $this->assertGreaterThan(10240, strlen(json_encode($record)));

        foreach (['created', 'updated'] as $action) {
            $event = new TransactionUpdated('billing', $action, $record);
            $payload = $event->broadcastWith();
            $this->assertLessThan(10240, strlen(json_encode($payload)));
            $this->assertSame('billing', $payload['type']);
            $this->assertSame($action, $payload['action']);
            $this->assertSame(88, $payload['record']['bill_id']);
            $this->assertSame('888.00', $payload['record']['total_amount']);
            $this->assertArrayNotHasKey('items', $payload['record']);
            $this->assertArrayNotHasKey('line_items', $payload['record']);
            $this->assertArrayNotHasKey('boat', $payload['record']);
            $this->assertSame($record, $event->record);
        }
    }

    public function test_billing_archive_notification_keeps_its_identifiers(): void
    {
        $record = ['bill_id' => 88, 'boat_id' => 9, 'deleted_at' => '2026-10-26T01:00:00Z'];
        $this->assertSame($record, (new TransactionUpdated('billing', 'updated', $record))->broadcastWith()['record']);
    }

    public function test_other_transaction_events_keep_their_existing_payload(): void
    {
        $record = ['version' => 8, 'amount' => 50, 'is_active' => true];
        $this->assertSame($record, (new TransactionUpdated('bill-penalty-settings', 'updated', $record))->broadcastWith()['record']);
    }

    public function test_realtime_failure_does_not_escape_the_billing_save_notification(): void
    {
        Broadcast::shouldReceive('event')->once()->with(\Mockery::on(
            fn ($event) => $event instanceof TransactionUpdated && $event->type === 'billing' && $event->action === 'created'
        ))->andThrow(new \RuntimeException('Pusher unavailable'));

        $method = new \ReflectionMethod(BillController::class, 'broadcastBillingChange');
        $method->invoke(new BillController(), 'created', ['bill_id' => 88, 'total_amount' => '888.00']);
        $this->addToAssertionCount(1);
    }
}
