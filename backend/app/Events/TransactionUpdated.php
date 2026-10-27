<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TransactionUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $type,
        public string $action,
        public array $record,
    ) {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('transactions');
    }

    public function broadcastAs(): string
    {
        return $this->action;
    }

    public function broadcastWith(): array
    {
        // Billing listeners refetch their data. Never publish the growing item,
        // payment, and penalty collections inside the realtime notification.
        $record = $this->type === 'billing'
            ? array_intersect_key($this->record, array_flip([
                'bill_id', 'boat_id', 'total_amount', 'penalty_amount',
                'created_at', 'updated_at', 'deleted_at',
            ]))
            : $this->record;

        return [
            'type' => $this->type,
            'action' => $this->action,
            'record' => \App\Services\SignatureStorage::redact($record),
        ];
    }
}
