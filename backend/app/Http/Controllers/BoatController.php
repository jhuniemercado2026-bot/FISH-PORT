<?php

namespace App\Http\Controllers;

use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class BoatController extends Controller
{
    private function normalizeBoatName(?string $value): string
    {
        return trim((string) $value);
    }

    private function boatNameAlreadyExists(string $boatName, ?int $ignoreBoatId = null): bool
    {
        $normalizedBoatName = mb_strtolower($this->normalizeBoatName($boatName));

        return Boat::withTrashed()
            ->when($ignoreBoatId, fn ($query) => $query->where('boat_id', '!=', $ignoreBoatId))
            ->get(['boat_id', 'boat_name'])
            ->contains(fn ($boat) => mb_strtolower($this->normalizeBoatName($boat->boat_name)) === $normalizedBoatName);
    }

    private function boatRelations(): array
    {
        return Boat::managementRelations();
    }

    private function boatIndexQuery()
    {
        return Boat::forManagementIndex();
    }

    private function prepareBoatForResponse(Boat $boat): Boat
    {
        $boat->makeVisible('image_path');
        $boat->makeHidden(['created_by']);

        return $boat;
    }

    private function meta($paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'from' => $paginator->firstItem(),
            'to' => $paginator->lastItem(),
        ];
    }

    private function emptyMeta(int $perPage): array
    {
        return [
            'current_page' => 1,
            'last_page' => 1,
            'per_page' => $perPage,
            'total' => 0,
            'from' => 0,
            'to' => 0,
        ];
    }

    private function paginatedPayload($query, bool $paginated, int $page, int $perPage, callable $prepare): array
    {
        if (!$paginated) {
            $items = $query->get();
            $items->each($prepare);

            return [
                'data' => $items,
                'meta' => [
                    ...$this->emptyMeta($perPage),
                    'total' => $items->count(),
                    'from' => $items->isNotEmpty() ? 1 : 0,
                    'to' => $items->count(),
                ],
            ];
        }

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $paginator->getCollection()->each($prepare);

        return [
            'data' => $paginator->items(),
            'meta' => $this->meta($paginator),
        ];
    }

    private function highlightedPage($query, string $primaryKey, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where($primaryKey, (int) $highlightId)
            ->first([$primaryKey, 'created_at']);

        if (!$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($primaryKey, $target) {
                $positionQuery
                    ->where('created_at', '>', $target->created_at)
                    ->orWhere(function ($tieQuery) use ($primaryKey, $target) {
                        $tieQuery
                            ->where('created_at', $target->created_at)
                            ->where($primaryKey, '>', $target->{$primaryKey});
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    private function applyBoatIndexFilters($query, Request $request)
    {
        return $query->managementFilters(
            $request->query('search', ''),
            $request->query('status', 'all'),
            $request->query('owner', 'all'),
            $request->query('boat_type', 'all')
        );
    }

    public function index(Request $request)
    {
        $query = $this->applyBoatIndexFilters($this->boatIndexQuery(), $request)
            ->latest('created_at');

        $withLookups = $request->boolean('with_lookups');

        if ($request->boolean('all') && !$withLookups) {
            $boats = $query->get();
            $boats->each(fn ($boat) => $this->prepareBoatForResponse($boat));

            return response()->json($boats);
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $boatsPage = max((int) $request->query('boats_page', 1), 1);

        if ($request->boolean('boats_paginated')) {
            $boatsPage = $this->highlightedPage($query, 'boat_id', $request->query('highlight_boat_id'), $boatsPage, $perPage);
        }

        $boatsPayload = $this->paginatedPayload(
            $query,
            $request->boolean('boats_paginated'),
            $boatsPage,
            $perPage,
            function (Boat $boat) {
                $this->prepareBoatForResponse($boat);
            }
        );

        $boatTypes = [];
        $owners = [];

        if ($withLookups) {
            $boatTypes = 
                
                \App\Models\BoatType::active()
                ->select('boat_type_id', 'type_name')
                ->orderByDesc('created_at')
                ->orderByDesc('boat_type_id')
                ->get();

            $owners = \App\Models\BoatOwner::active()
                ->select('owner_id', 'owner_firstname', 'owner_lastname', 'address', 'contact_number')
                ->orderByDesc('created_at')
                ->orderByDesc('owner_id')
                ->get();

            $owners->each(function ($owner) {
                if (method_exists($owner, 'append')) {
                    $owner->append('full_name');
                }
            });
        }

        return response()->json([
            'boats' => $boatsPayload['data'],
            'boatsMeta' => $boatsPayload['meta'],
            'boatTypes' => $boatTypes,
            'owners' => $owners,
            'stats' => [
                'total_registered' => Boat::active()->count(),
                'active_boats' => Boat::active()->where('status', 'active')->count(),
                'expired_boats' => Boat::active()->where('status', 'expired')->count(),
                'suspended_boats' => Boat::active()->where('status', 'suspended')->count(),
                'under_repair_boats' => Boat::active()->where('status', 'under_repair')->count(),
            ],
        ]);
    }

    public function legacyIndex()
    {
        $boats = $this->boatIndexQuery()
            ->latest('created_at')
            ->get();

        $boats->each(function ($boat) {
            $boat->createdBy?->append('full_name');
        });

        return response()->json($boats);
    }

    public function store(Request $request)
    {
        $request->merge([
            'boat_name' => $this->normalizeBoatName($request->input('boat_name')),
        ]);

        $validated = $request->validate([
            'boat_name'       => 'required|string|max:50',
            'owner_id'        => ['required', 'integer', function ($attribute, $value, $fail) {
                if (!BoatOwner::withTrashed()->where('owner_id', $value)->exists()) {
                    $fail('The selected owner is invalid.');
                }
            }],
            'boat_type_id'    => ['required', 'integer', function ($attribute, $value, $fail) {
                if (!BoatType::withTrashed()->where('boat_type_id', $value)->exists()) {
                    $fail('The selected boat type is invalid.');
                }
            }],
            'status'          => 'nullable|in:active,expired,suspended,under_repair',
        ]);

        if ($this->boatNameAlreadyExists($validated['boat_name'])) {
            return response()->json([
                'message' => 'A boat with this name already exists.',
                'errors' => [
                    'boat_name' => ['A boat with this name already exists.'],
                ],
            ], 422);
        }

        $boat = Boat::create([
            ...$validated,
            'created_by' => Auth::id(),
        ]);

        $boat->load($this->boatRelations());
        $boat->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Boat Management',
            details: 'Created registered boat "' . $boat->boat_name . '".',
            user: Auth::user()
        );

        return response()->json($boat, 201);
    }

    public function show($id)
    {
        $boat = Boat::forManagementIndex()
                    ->findOrFail($id);

        return response()->json($boat);
    }

    public function update(Request $request, $id)
    {
        $boat = Boat::findOrFail($id);
        $previousBoatName = $boat->boat_name;

        if ($request->has('boat_name')) {
            $request->merge([
                'boat_name' => $this->normalizeBoatName($request->input('boat_name')),
            ]);
        }

        $validated = $request->validate([
            'boat_name'       => 'sometimes|required|string|max:50',
            'owner_id'        => ['sometimes', 'required', 'integer', function ($attribute, $value, $fail) {
                if (!BoatOwner::withTrashed()->where('owner_id', $value)->exists()) {
                    $fail('The selected owner is invalid.');
                }
            }],
            'boat_type_id'    => ['sometimes', 'required', 'integer', function ($attribute, $value, $fail) {
                if (!BoatType::withTrashed()->where('boat_type_id', $value)->exists()) {
                    $fail('The selected boat type is invalid.');
                }
            }],
            'status'          => 'nullable|in:active,expired,suspended,under_repair',
        ]);

        if (array_key_exists('boat_name', $validated) && $this->boatNameAlreadyExists($validated['boat_name'], (int) $boat->boat_id)) {
            return response()->json([
                'message' => 'A boat with this name already exists.',
                'errors' => [
                    'boat_name' => ['A boat with this name already exists.'],
                ],
            ], 422);
        }

        $boat->update($validated);
        $boat->load(['owner' => function ($query) {
            $query->select('owner_id', 'owner_firstname', 'owner_lastname', 'address', 'contact_number')->withTrashed();
        }, 'boatType' => function ($query) {
            $query->select('boat_type_id', 'type_name')->withTrashed();
        }, 'createdBy:user_id,first_name,last_name']);
        $boat->owner?->append('full_name');
        $boat->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Boat Management',
            details: 'Updated registered boat "' . $previousBoatName . '" to "' . $boat->boat_name . '".',
            user: Auth::user()
        );

        return response()->json($boat);
    }

    public function destroy($id)
    {
        $boat = Boat::findOrFail($id);

        $hasTransactions = $boat->dockings()->exists()
            || $boat->banyeraTransactions()->exists();

        if ($hasTransactions) {
            return response()->json([
                'message' => 'This boat has existing docking or banyera transactions and cannot be archived.',
            ], 422);
        }

        $boat->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Archives',
            details: 'Archived boat "' . $boat->boat_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat archived successfully.']);
    }

    public function restore($id)
    {
        $boat = Boat::withTrashed()->findOrFail($id);
        $boat->restore();

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Archives',
            details: 'Restored boat "' . $boat->boat_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat restored successfully.']);
    }

    public function forceDelete($id)
    {
        $boat = Boat::onlyTrashed()->findOrFail($id);

        if ($boat->image_path && Storage::disk('public')->exists($boat->image_path)) {
            Storage::disk('public')->delete($boat->image_path);
        }

        $details = 'Permanently deleted archived boat "' . $boat->boat_name . '".';
        $boat->forceDelete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Archives',
            details: $details,
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat permanently deleted successfully.']);
    }

    public function uploadImage(Request $request, $id)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $boat = Boat::findOrFail($id);
        $path = $request->file('image')->store('boats', 'public');

        $boat->update(['image_path' => $path]);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Boat Management',
            details: 'Updated boat image for "' . $boat->boat_name . '".',
            user: Auth::user()
        );

        return response()->json([
            'message'    => 'Image uploaded successfully.',
            'image_path' => $path,
        ]);
    }
}
