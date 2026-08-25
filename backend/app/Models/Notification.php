<?php

namespace App\Models;

use App\Events\NotificationUpdated;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $primaryKey = 'notification_id';
    public const UPDATED_AT = null;

    protected $fillable = [
        'title',
        'message',
        'recipient_user_id',
        'sender_user_id',
        'related_type',
        'related_id',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'recipient_user_id' => 'integer',
        'sender_user_id' => 'integer',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::created(fn (Notification $notification) => static::broadcastNotificationUpdate($notification));
        static::updated(fn (Notification $notification) => static::broadcastNotificationUpdate($notification));
        static::deleted(fn (Notification $notification) => static::broadcastNotificationUpdate($notification));
    }

    private static function broadcastNotificationUpdate(Notification $notification): void
    {
        if (!$notification->recipient_user_id) {
            return;
        }

        try {
            broadcast(new NotificationUpdated($notification));
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    public function recipientUser()
    {
        return $this->belongsTo(User::class, 'recipient_user_id', 'user_id');
    }

    public function senderUser()
    {
        return $this->belongsTo(User::class, 'sender_user_id', 'user_id');
    }
}
