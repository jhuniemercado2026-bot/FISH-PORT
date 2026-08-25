<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ActivityLogUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public array $log)
    {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('activity-logs');
    }

    public function broadcastAs(): string
    {
        return 'created';
    }

    public function broadcastWith(): array
    {
        return [
            'log' => $this->log,
        ];
    }
}
