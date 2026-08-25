<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BoatOwnerSignatureAudit extends Model
{
    protected $primaryKey = 'signature_audit_id';

    protected $fillable = [
        'owner_id',
        'signature_data_url',
        'signature_public_id',
        'signed_at',
        'inspector_id',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
    ];

    public function owner()
    {
        return $this->belongsTo(BoatOwner::class, 'owner_id', 'owner_id');
    }

    public function inspector()
    {
        return $this->belongsTo(User::class, 'inspector_id', 'user_id');
    }
}
