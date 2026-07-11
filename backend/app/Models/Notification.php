<?php

namespace App\Models;

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

    public function recipientUser()
    {
        return $this->belongsTo(User::class, 'recipient_user_id', 'user_id');
    }

    public function senderUser()
    {
        return $this->belongsTo(User::class, 'sender_user_id', 'user_id');
    }
}
