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
        return [
            'type' => $this->type,
            'action' => $this->action,
            'record' => $this->record,
        ];
    }
}
