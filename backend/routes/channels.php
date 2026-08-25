<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->user_id === (int) $id;
});

Broadcast::channel('accounts.online', function ($user) {
    return [
        'id' => (string) $user->user_id,
        'user_id' => $user->user_id,
        'name' => $user->full_name ?: $user->email,
        'email' => $user->email,
        'role' => $user->role,
    ];
});
