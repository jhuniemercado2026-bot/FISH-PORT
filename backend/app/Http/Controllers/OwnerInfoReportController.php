<?php

namespace App\Http\Controllers;

use App\Models\BoatOwner;
use Illuminate\Http\Request;

class OwnerInfoReportController extends Controller
{
    public function index(Request $request)
    {
        // Optimize: Use pagination to prevent loading all owners into memory
        $perPage = (int) $request->query('per_page', 1000);
        $perPage = min($perPage, 1000); // Cap at 1000
        $userId = $request->query('user_id');
        if ($userId !== null && $userId !== '' && $userId !== 'all' && !ctype_digit((string) $userId)) {
            abort(400, 'Invalid user filter.');
        }
        $ownerId = $request->query('owner_id');
        if ($ownerId !== null && $ownerId !== '' && $ownerId !== 'all' && !ctype_digit((string) $ownerId)) {
            abort(400, 'Invalid owner filter.');
        }

        $query = BoatOwner::withTrashed()
            ->with([
                'ownerSignatureUpdatedByUser:user_id,first_name,last_name,email',
                'signatureAudits' => function ($auditQuery) {
                    $auditQuery
                        ->with(['inspector:user_id,first_name,last_name,email'])
                        ->orderByDesc('signed_at')
                        ->orderByDesc('signature_audit_id');
                },
                'boats:boat_id,owner_id,boat_name',
            ])
            ->orderBy('owner_lastname')
            ->orderBy('owner_firstname')
            ->select([
                'owner_id',
                'owner_firstname',
                'owner_lastname',
                'address',
                'contact_number',
                'owner_signature_data_url',
                'owner_signature_public_id',
                'owner_signature_signed_at',
                'owner_signature_updated_by',
                'created_by',
                'deleted_at',
            ]);

        if ($userId !== null && $userId !== '' && $userId !== 'all') {
            $query->where('created_by', (int) $userId);
        }

        if ($ownerId !== null && $ownerId !== '' && $ownerId !== 'all') {
            $query->where('owner_id', (int) $ownerId);
        }

        $owners = $query->paginate($perPage);

        return response()->json([
            'data' => $owners->items(),
            'pagination' => [
                'total' => $owners->total(),
                'per_page' => $owners->perPage(),
                'current_page' => $owners->currentPage(),
                'last_page' => $owners->lastPage(),
            ],
        ]);
    }
}
