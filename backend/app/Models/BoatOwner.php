<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Builder;
use App\Models\User;
use App\Models\Boat;

class BoatOwner extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'owner_id';

    protected $appends = ['full_name'];

    protected $fillable = [
        'owner_firstname',
        'owner_lastname',
        'address',
        'contact_number',
        'owner_signature_data_url',
        'owner_signature_public_id',
        'owner_signature_signed_at',
        'owner_signature_updated_by',
        'created_by',
    ];

    protected $casts = [
        'owner_signature_signed_at' => 'datetime',
    ];

    protected $hidden = [
        'updated_at',
    ];

    // ── Accessors ──
    public function getFullNameAttribute(): string
    {
        return trim("{$this->owner_firstname} {$this->owner_lastname}");
    }

    // ── Relationships ──
    public function boats()
    {
        return $this->hasMany(Boat::class, 'owner_id', 'owner_id');
    }

    public function activeBoats()
    {
        return $this->hasMany(Boat::class, 'owner_id', 'owner_id')
                    ->whereNull('deleted_at');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function ownerSignatureUpdatedByUser()
    {
        return $this->belongsTo(User::class, 'owner_signature_updated_by', 'user_id');
    }

    public function signatureAudits()
    {
        return $this->hasMany(BoatOwnerSignatureAudit::class, 'owner_id', 'owner_id');
    }

    // ── Scopes ──
    public function scopeActive($query)
    {
        return $query->whereNull($this->getQualifiedDeletedAtColumn());
    }

    public function scopeArchived($query)
    {
        return $query->onlyTrashed();
    }

    public function scopeForManagementIndex(Builder $query): Builder
    {
        return $query
            ->with([
                'createdBy:user_id,first_name,last_name,email',
                'ownerSignatureUpdatedByUser:user_id,first_name,last_name,email',
            ])
            ->withCount('activeBoats as boats_count')
            ->active();
    }

    public function scopeSearchManagement(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        $nameTokens = collect(preg_split('/\s+/', $search) ?: [])
            ->map(fn ($token) => trim((string) $token))
            ->filter()
            ->values();

        return $query->where(function (Builder $inner) use ($search, $nameTokens) {
            $inner
                ->where('owner_firstname', 'like', "{$search}%")
                ->orWhere('owner_lastname', 'like', "{$search}%")
                ->orWhere(function (Builder $nameQuery) use ($nameTokens) {
                    $nameTokens->each(function (string $token) use ($nameQuery) {
                        $nameQuery->where(function (Builder $tokenQuery) use ($token) {
                            $tokenQuery
                                ->where('owner_firstname', 'like', "{$token}%")
                                ->orWhere('owner_lastname', 'like', "{$token}%");
                        });
                    });
                });
        });
    }

    public function scopeUsageStatus(Builder $query, ?string $status): Builder
    {
        $status = match ($status) {
            'active' => 'used',
            'inactive' => 'unused',
            default => $status,
        };

        return $query
            ->when($status === 'used', fn (Builder $filtered) => $filtered->has('activeBoats'))
            ->when($status === 'unused', fn (Builder $filtered) => $filtered->doesntHave('activeBoats'));
    }

    public function scopeManagementFilters(Builder $query, ?string $search = '', ?string $status = 'all'): Builder
    {
        return $query
            ->searchManagement($search)
            ->usageStatus($status);
    }
}
