<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, Notifiable, HasApiTokens;

    // ── Primary Key ───────────────────────────────────────────────────────────
    protected $primaryKey = 'user_id';

    // ── Fillable ──────────────────────────────────────────────────────────────
    protected $fillable = [
        'email',
        'password',
        'role',
        'status',
        'first_name',
        'last_name',
        'gender',
        'contact_number',
        'birthday',
        'address',
        'profile_image',
        'created_by',
    ];

    // ── Hidden ────────────────────────────────────────────────────────────────
    protected $hidden = [
        'password',
    ];

    // ── Casts ─────────────────────────────────────────────────────────────────
    protected $casts = [
        'birthday'   => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ── Always append these computed fields to JSON ───────────────────────────
    protected $appends = [
        'full_name',

    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function createdUsers()
    {
        return $this->hasMany(User::class, 'created_by', 'user_id');
    }

    public function dockings()
    {
        return $this->hasMany(Docking::class, 'created_by', 'user_id');
    }

    public function banyeraTransactions()
    {
        return $this->hasMany(BanyeraTransaction::class, 'created_by', 'user_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'received_by', 'user_id');
    }

    public function bills()
    {
        return $this->hasMany(Bill::class, 'created_by', 'user_id');
    }

    public function vehicleTickets()
    {
        return $this->hasMany(VehicleTicket::class, 'created_by', 'user_id');
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class, 'user_id', 'user_id');
    }

    public function receivedNotifications()
    {
        return $this->hasMany(Notification::class, 'recipient_user_id', 'user_id');
    }

    public function sentNotifications()
    {
        return $this->hasMany(Notification::class, 'sender_user_id', 'user_id');
    }

    // ── Accessors (auto-appended) ─────────────────────────────────────────────

    // Returns the full public URL of the profile image, or null
    public function getProfileImageUrlAttribute(): ?string
    {
        if (!$this->profile_image) return null;
        return Storage::disk('public')->url($this->profile_image);
    }

    // "Juan dela Cruz"
    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    // "head" → "Head of MEEO", etc.
    public function getRoleLabelAttribute(): string
    {
        return match ($this->role) {
            'head'        => 'Head of MEEO',
            'coordinator' => 'Coordinator',
            'inspector'   => 'Inspector',
            default       => ucfirst($this->role),
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function scopeForTableIndex(Builder $query, array $options = []): Builder
    {
        $query->select([
            'user_id',
            'email',
            'role',
            'status',
            'first_name',
            'last_name',
            'gender',
            'contact_number',
            'birthday',
            'address',
            'profile_image',
            'created_by',
            'created_at',
            'updated_at',
        ]);

        if (!empty($options['exclude_user_id'])) {
            $query->where('user_id', '!=', $options['exclude_user_id']);
        }

        return $query;
    }

    public function scopeSearchTable(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        return $query->where('email', 'like', "%{$search}%");
    }

    public function scopeTableFilters(Builder $query, array $filters = []): Builder
    {
        $status = $filters['status'] ?? null;
        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        $role = $filters['role'] ?? null;
        if ($role && $role !== 'all') {
            $query->where('role', $role);
        }

        return $query;
    }

    public function scopeTableSort(Builder $query, ?string $sort = null): Builder
    {
        return match ($sort) {
            'created_at_asc' => $query->orderBy('created_at')->orderBy('user_id'),
            'email_asc' => $query->orderBy('email')->orderByDesc('created_at')->orderByDesc('user_id'),
            'email_desc' => $query->orderByDesc('email')->orderByDesc('created_at')->orderByDesc('user_id'),
            default => $query->orderByDesc('created_at')->orderByDesc('user_id'),
        };
    }
}
