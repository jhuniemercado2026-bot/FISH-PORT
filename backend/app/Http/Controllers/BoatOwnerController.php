<?php

namespace App\Http\Controllers;

use App\Models\BoatOwner;
use App\Models\BoatOwnerSignatureAudit;
use App\Services\ActivityLogService;
use Carbon\Carbon;
use Cloudinary\Cloudinary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BoatOwnerController extends Controller
{
    private function cloudinaryUrl(): ?string
    {
        $cloudinaryUrl = config('services.cloudinary.url');
        if ($cloudinaryUrl) {
            return $cloudinaryUrl;
        }

        $cloudName = config('services.cloudinary.cloud_name');
        $apiKey = config('services.cloudinary.api_key');
        $apiSecret = config('services.cloudinary.api_secret');

        if (! $cloudName || ! $apiKey || ! $apiSecret) {
            return null;
        }

        return sprintf('cloudinary://%s:%s@%s', $apiKey, $apiSecret, $cloudName);
    }

    private function uploadSignatureToCloudinary(string $signatureDataUrl): array
    {
        if (! str_starts_with(trim($signatureDataUrl), 'data:image/')) {
            return [
                'url' => $signatureDataUrl,
                'public_id' => null,
            ];
        }

        $cloudinaryUrl = $this->cloudinaryUrl();
        if (! $cloudinaryUrl) {
            abort(500, 'Cloudinary is not configured. Please set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
        }

        $upload = (new Cloudinary($cloudinaryUrl))->uploadApi()->upload(
            $signatureDataUrl,
            [
                'folder' => 'Opol Fish Port/Signature',
                'resource_type' => 'image',
            ]
        );

        $url = $upload['secure_url'] ?? $upload['url'] ?? null;
        $publicId = $upload['public_id'] ?? null;

        if (! $url || ! $publicId) {
            abort(500, 'Cloudinary upload did not return complete signature image details.');
        }

        return [
            'url' => $url,
            'public_id' => $publicId,
        ];
    }

    private function recordSignatureAudit(BoatOwner $owner): void
    {
        if (empty($owner->owner_signature_data_url)) {
            return;
        }

        BoatOwnerSignatureAudit::create([
            'owner_id' => $owner->owner_id,
            'signature_data_url' => $owner->owner_signature_data_url,
            'signature_public_id' => $owner->owner_signature_public_id,
            'signed_at' => $owner->owner_signature_signed_at,
            'inspector_id' => $owner->owner_signature_updated_by,
        ]);
    }

    public function index(Request $request)
    {
        $query = BoatOwner::forManagementIndex()
            ->managementFilters($request->query('search', ''), $request->query('usage', $request->query('status', 'all')))
            ->latest();

        if ($request->boolean('all')) {
            $owners = $query->get();
            $owners->each(function ($o) {
                $o->append('full_name');
                $o->createdBy?->append('full_name');
                $o->ownerSignatureUpdatedByUser?->append('full_name');
            });

            return response()->json($owners);
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $owners = $query->paginate($perPage);

        $owners->getCollection()->transform(function ($o) {
            $o->append('full_name');
            $o->createdBy?->append('full_name');
            $o->ownerSignatureUpdatedByUser?->append('full_name');

            return $o;
        });

        return response()->json([
            'data' => $owners->items(),
            'meta' => [
                'current_page' => $owners->currentPage(),
                'last_page' => $owners->lastPage(),
                'per_page' => $owners->perPage(),
                'total' => $owners->total(),
                'from' => $owners->firstItem(),
                'to' => $owners->lastItem(),
            ],
            'stats' => [
                'total_owners' => BoatOwner::withTrashed()->count(),
                'boat_owners_in_use' => BoatOwner::active()->has('activeBoats')->count(),
                'boat_owners_not_in_use' => BoatOwner::active()->doesntHave('activeBoats')->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'owner_firstname' => 'required|string|max:50',
            'owner_lastname'  => 'required|string|max:50',
            'address'         => 'required|string',
            'contact_number'  => 'nullable|string|max:11',
            'owner_signature_data_url' => 'nullable|string|max:2000000',
            'owner_signature_signed_at' => 'nullable|date',
        ]);

        if (!empty($validated['owner_signature_data_url'])) {
            $uploadedSignature = $this->uploadSignatureToCloudinary($validated['owner_signature_data_url']);
            $validated['owner_signature_data_url'] = $uploadedSignature['url'];
            $validated['owner_signature_public_id'] = $uploadedSignature['public_id'];
            $validated['owner_signature_signed_at'] = isset($validated['owner_signature_signed_at'])
                ? Carbon::parse($validated['owner_signature_signed_at'], 'Asia/Manila')->format('Y-m-d H:i:s')
                : Carbon::now('Asia/Manila')->format('Y-m-d H:i:s');
            $validated['owner_signature_updated_by'] = Auth::id();
        }

        $owner = BoatOwner::create([
            ...$validated,
            'created_by' => Auth::id(),
        ]);

        $this->recordSignatureAudit($owner);

        $owner->load([
            'createdBy:user_id,first_name,last_name,email',
            'ownerSignatureUpdatedByUser:user_id,first_name,last_name,email',
        ]);
        $owner->loadCount('activeBoats as boats_count');
        $owner->append('full_name');
        $owner->createdBy?->append('full_name');
        $owner->ownerSignatureUpdatedByUser?->append('full_name');
        $owner->makeHidden(['updated_at', 'deleted_at']);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Boat Management',
            details: 'Created boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json($owner, 201);
    }

    public function show($id)
    {
        $owner = BoatOwner::with([
                              'createdBy:user_id,first_name,last_name,email',
                              'ownerSignatureUpdatedByUser:user_id,first_name,last_name,email',
                          ])
                          ->withCount('activeBoats as boats_count')
                          ->findOrFail($id);

        $owner->append('full_name');
        $owner->createdBy?->append('full_name');
        $owner->ownerSignatureUpdatedByUser?->append('full_name');

        return response()->json($owner);
    }

    public function signatureAudits($id)
    {
        $owner = BoatOwner::findOrFail($id);
        $audits = $owner->signatureAudits()
            ->with('inspector:user_id,first_name,last_name,email')
            ->orderBy('signed_at')
            ->orderBy('signature_audit_id')
            ->get()
            ->map(function ($audit) {
                $audit->inspector?->append('full_name');

                return [
                    'signature_audit_id' => $audit->signature_audit_id,
                    'signature_data_url' => $audit->signature_data_url,
                    'signature_public_id' => $audit->signature_public_id,
                    'signed_at' => $audit->signed_at,
                    'inspector' => $audit->inspector,
                ];
            });

        return response()->json($audits);
    }


    public function update(Request $request, $id)
    {
        $owner = BoatOwner::findOrFail($id);
        $previousValues = [
            'first_name' => $owner->owner_firstname,
            'last_name' => $owner->owner_lastname,
            'address' => $owner->address,
            'contact_number' => $owner->contact_number,
            'signature' => $owner->owner_signature_data_url ? 'Signed' : '',
        ];

        $validated = $request->validate([
            'owner_firstname' => 'sometimes|required|string|max:50',
            'owner_lastname'  => 'sometimes|required|string|max:50',
            'address'         => 'sometimes|required|string',
            'contact_number'  => 'nullable|string|max:11',
            'owner_signature_data_url' => 'nullable|string|max:2000000',
            'owner_signature_signed_at' => 'nullable|date',
        ]);

        if (array_key_exists('owner_signature_data_url', $validated) && !empty($validated['owner_signature_data_url'])) {
            $uploadedSignature = $this->uploadSignatureToCloudinary($validated['owner_signature_data_url']);
            $validated['owner_signature_data_url'] = $uploadedSignature['url'];
            $validated['owner_signature_public_id'] = $uploadedSignature['public_id'];
            $validated['owner_signature_signed_at'] = isset($validated['owner_signature_signed_at'])
                ? Carbon::parse($validated['owner_signature_signed_at'], 'Asia/Manila')->format('Y-m-d H:i:s')
                : Carbon::now('Asia/Manila')->format('Y-m-d H:i:s');
            $validated['owner_signature_updated_by'] = Auth::id();
        }

        $owner->update($validated);
        $owner->load('ownerSignatureUpdatedByUser:user_id,first_name,last_name,email');
        $owner->append('full_name');
        $owner->ownerSignatureUpdatedByUser?->append('full_name');
        if (array_key_exists('owner_signature_updated_by', $validated)) {
            $this->recordSignatureAudit($owner);
        }
        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $previousValues,
            [
                'first_name' => $owner->owner_firstname,
                'last_name' => $owner->owner_lastname,
                'address' => $owner->address,
                'contact_number' => $owner->contact_number,
                'signature' => $owner->owner_signature_data_url ? 'Signed' : '',
            ],
            [
                'first_name' => 'first name',
                'last_name' => 'last name',
                'address' => 'address',
                'contact_number' => 'contact number',
                'signature' => 'signature',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Boat Management',
            details: 'Updated boat owner "' . $owner->full_name . '"' . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        return response()->json([
            'owner_id' => $owner->owner_id,
            'owner_firstname' => $owner->owner_firstname,
            'owner_lastname' => $owner->owner_lastname,
            'address' => $owner->address,
            'contact_number' => $owner->contact_number,
            'owner_signature_data_url' => $owner->owner_signature_data_url,
            'owner_signature_public_id' => $owner->owner_signature_public_id,
            'owner_signature_signed_at' => $owner->owner_signature_signed_at,
            'owner_signature_updated_by' => $owner->owner_signature_updated_by,
            'owner_signature_updated_by_user' => $owner->ownerSignatureUpdatedByUser,
            'full_name' => $owner->full_name,
        ]);
    }

    public function destroy($id)
    {
        $owner = BoatOwner::findOrFail($id);

        $owner->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Archives',
            details: 'Archived boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner archived successfully.']);
    }

    public function restore($id)
    {
        $owner = BoatOwner::withTrashed()->findOrFail($id);
        $owner->restore();

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Archives',
            details: 'Restored boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner restored successfully.']);
    }

    public function forceDelete($id)
    {
        $owner = BoatOwner::onlyTrashed()->withCount('boats')->findOrFail($id);

        if ($owner->boats_count > 0) {
            return response()->json([
                'message' => 'This boat owner is still linked to existing boats and cannot be permanently deleted.',
            ], 422);
        }

        $details = 'Permanently deleted archived boat owner "' . $owner->full_name . '".';
        $owner->forceDelete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Archives',
            details: $details,
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner permanently deleted successfully.']);
    }
}
