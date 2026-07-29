<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TransactionLockUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public ?array $transactionLock)
    {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('transaction-lock');
    }

    public function broadcastAs(): string
    {
        return 'updated';
    }

    public function broadcastWith(): array
    {
        return [
            'transaction_lock' => $this->transactionLock,
        ];
    }
}
