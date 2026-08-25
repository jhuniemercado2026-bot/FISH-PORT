<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MasterDataUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $resource,
        public string $action,
        public ?array $record = null,
    ) {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('master-data');
    }

    public function broadcastAs(): string
    {
        return 'updated';
    }

    public function broadcastWith(): array
    {
        return [
            'resource' => $this->resource,
            'action' => $this->action,
            'record' => $this->record,
        ];
    }
}
