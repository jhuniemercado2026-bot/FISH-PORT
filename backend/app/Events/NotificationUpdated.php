<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public Notification $notification)
    {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('notifications.' . $this->notification->recipient_user_id);
    }

    public function broadcastAs(): string
    {
        return 'updated';
    }

    public function broadcastWith(): array
    {
        return [
            'notification' => [
                'notification_id' => $this->notification->notification_id,
                'recipient_user_id' => $this->notification->recipient_user_id,
                'sender_user_id' => $this->notification->sender_user_id,
                'related_type' => $this->notification->related_type,
                'related_id' => $this->notification->related_id,
                'title' => $this->notification->title,
                'message' => $this->notification->message,
                'is_read' => (bool) $this->notification->is_read,
                'read_at' => $this->notification->read_at?->toIso8601String(),
                'created_at' => $this->notification->created_at?->toIso8601String(),
            ],
        ];
    }
}
