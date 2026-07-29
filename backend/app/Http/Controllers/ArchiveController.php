<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\BanyeraTransaction;
use App\Models\Docking;
use App\Models\FishClassification;
use App\Models\VehicleType;
use App\Models\VehicleTicket;
use Illuminate\Http\Request;

class ArchiveController extends Controller
{
    public function index(Request $request)
    {
        if (!$request->boolean('all') && $request->filled('type')) {
            return $this->paginatedArchiveResponse($request);
        }

        // Load all archived resource groups in one response so the archive page can render instantly.
        $boats = Boat::with(['owner', 'boatType', 'createdBy'])
            ->archived()
            ->latest('deleted_at')
            ->get();

        $boatArchiveLogs = ActivityLog::query()
            ->where('module', 'Archives')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived boat "%')
            ->latest('created_at')
            ->get();

        $boatArchivedBy = [];
        foreach ($boatArchiveLogs as $log) {
            if (!preg_match('/Archived boat "([^"]*)"\./', (string) $log->details, $matches)) {
                continue;
            }

            $boatName = trim((string) $matches[1]);
            if ($boatName === '' || isset($boatArchivedBy[$boatName])) {
                continue;
            }

            $boatArchivedBy[$boatName] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $boats->each(function ($boat) use ($boatArchivedBy) {
            $boat->createdBy?->append('full_name');
            $boat->setAttribute('archived_by', $boatArchivedBy[(string) $boat->boat_name] ?? null);
        });

        $boatOwners = BoatOwner::with(['createdBy'])
            ->withCount('activeBoats as boats_count')
            ->archived()
            ->latest('deleted_at')
            ->get();

        $boatOwnerArchiveLogs = ActivityLog::query()
            ->where('module', 'Archives')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived boat owner "%')
            ->latest('created_at')
            ->get();

        $boatOwnerArchivedBy = [];
        foreach ($boatOwnerArchiveLogs as $log) {
            if (!preg_match('/Archived boat owner "([^"]*)"\./', (string) $log->details, $matches)) {
                continue;
            }

            $ownerName = trim((string) $matches[1]);
            if ($ownerName === '' || isset($boatOwnerArchivedBy[$ownerName])) {
                continue;
            }

            $boatOwnerArchivedBy[$ownerName] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $boatOwners->each(function ($owner) use ($boatOwnerArchivedBy) {
            $owner->append('full_name');
            $owner->createdBy?->append('full_name');
            $owner->setAttribute('archived_by', $boatOwnerArchivedBy[(string) $owner->full_name] ?? null);
        });

        $boatTypes = BoatType::with(['createdBy'])
            ->withCount('activeBoats as boats_count')
            ->archived()
            ->latest('deleted_at')
            ->get();

        $boatTypeArchiveLogs = ActivityLog::query()
            ->where('module', 'Archives')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived boat type "%')
            ->latest('created_at')
            ->get();

        $boatTypeArchivedBy = [];
        foreach ($boatTypeArchiveLogs as $log) {
            if (!preg_match('/Archived boat type "([^"]*)"\./', (string) $log->details, $matches)) {
                continue;
            }

            $typeName = trim((string) $matches[1]);
            if ($typeName === '' || isset($boatTypeArchivedBy[$typeName])) {
                continue;
            }

            $boatTypeArchivedBy[$typeName] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $boatTypes->each(function ($boatType) use ($boatTypeArchivedBy) {
            $boatType->createdBy?->append('full_name');
            $boatType->setAttribute('archived_by', $boatTypeArchivedBy[(string) $boatType->type_name] ?? null);
        });

        $dockings = collect();
        $banyeraTransactions = collect();

        $fishClassifications = FishClassification::with(['createdBy'])
            ->withCount('activeBanyeraItems as fish_using_count')
            ->onlyTrashed()
            ->latest('deleted_at')
            ->get();

        $fishClassificationArchiveLogs = ActivityLog::query()
            ->where('module', 'Banyera')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived fish classification "%')
            ->latest('created_at')
            ->get();

        $fishClassificationArchivedBy = [];
        foreach ($fishClassificationArchiveLogs as $log) {
            if (!preg_match('/Archived fish classification "([^"]*)"\./', (string) $log->details, $matches)) {
                continue;
            }

            $classificationName = trim((string) $matches[1]);
            if ($classificationName === '' || isset($fishClassificationArchivedBy[$classificationName])) {
                continue;
            }

            $fishClassificationArchivedBy[$classificationName] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $fishClassifications->each(function ($classification) use ($fishClassificationArchivedBy) {
            $classification->createdBy?->append('full_name');
            $classification->setAttribute(
                'archived_by',
                $fishClassificationArchivedBy[(string) $classification->classification_name] ?? null
            );
        });

        $vehicleTypes = VehicleType::with(['createdBy'])
            ->withCount('activeVehicleTickets as tickets_count')
            ->onlyTrashed()
            ->latest('deleted_at')
            ->get();

        $vehicleTypeArchiveLogs = ActivityLog::query()
            ->where('module', 'Archives')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived vehicle type "%')
            ->latest('created_at')
            ->get();

        $vehicleTypeArchivedBy = [];
        foreach ($vehicleTypeArchiveLogs as $log) {
            if (!preg_match('/Archived vehicle type "([^"]*)"\./', (string) $log->details, $matches)) {
                continue;
            }

            $typeName = trim((string) $matches[1]);
            if ($typeName === '' || isset($vehicleTypeArchivedBy[$typeName])) {
                continue;
            }

            $vehicleTypeArchivedBy[$typeName] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $vehicleTypes->each(function ($vehicleType) use ($vehicleTypeArchivedBy) {
            $vehicleType->createdBy?->append('full_name');
            $vehicleType->setAttribute(
                'archived_by',
                $vehicleTypeArchivedBy[(string) $vehicleType->type_name] ?? null
            );
        });

        $vehicleTickets = collect();

        return response()->json([
            'boats' => $boats,
            'boatOwners' => $boatOwners,
            'boatTypes' => $boatTypes,
            'dockings' => $dockings,
            'banyeraTransactions' => $banyeraTransactions,
            'fishClassifications' => $fishClassifications,
            'vehicleTypes' => $vehicleTypes,
            'vehicleTickets' => $vehicleTickets,
        ]);
    }

    private function paginatedArchiveResponse(Request $request)
    {
        $type = (string) $request->input('type', 'boats');
        $perPage = max(1, min((int) $request->input('per_page', 25), 100));
        $search = trim((string) $request->input('search', ''));

        $query = $this->archiveQueryForType($type);
        $this->applyArchiveSearch($query, $type, $search);
        $this->applyFiscalYear($query, $request, 'deleted_at');

        $paginated = $query
            ->latest('deleted_at')
            ->paginate($perPage)
            ->appends($request->query());

        $items = collect($paginated->items());
        $this->attachArchivedBy($type, $items);
        $items = $this->transformArchiveItems($type, $items);

        return response()->json([
            'data' => $items->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
            'stats' => $this->archiveStats(),
        ]);
    }

    private function transformArchiveItems(string $type, $items)
    {
        return $items->map(fn ($item) => $this->transformArchiveItem($type, $item));
    }

    private function transformArchiveItem(string $type, $item)
    {
        $createdBy = $this->getCreatedByData($item);
        $archivedBy = $this->getArchivedByData($item);
        $deletedAt = $item->deleted_at ?? $item->archived_at ?? null;

        return match ($type) {
            'boatOwners' => [
                'owner_id' => $item->owner_id,
                'full_name' => $item->full_name ?? trim(($item->owner_firstname ?? '') . ' ' . ($item->owner_lastname ?? '')),
                'owner_firstname' => $item->owner_firstname,
                'owner_lastname' => $item->owner_lastname,
                'address' => $item->address,
                'contact_number' => $item->contact_number,
                'created_at' => $item->created_at,
                'deleted_at' => $deletedAt,
                'created_by' => $createdBy,
                'archived_by' => $archivedBy,
            ],
            'boatTypes' => [
                'boat_type_id' => $item->boat_type_id,
                'type_name' => $item->type_name,
                'created_at' => $item->created_at,
                'deleted_at' => $deletedAt,
                'created_by' => $createdBy,
                'archived_by' => $archivedBy,
            ],
            'fishClassifications' => [
                'classification_id' => $item->classification_id,
                'classification_name' => $item->classification_name,
                'created_at' => $item->created_at,
                'deleted_at' => $deletedAt,
                'created_by' => $createdBy,
                'archived_by' => $archivedBy,
            ],
            'vehicleTypes' => [
                'vehicle_type_id' => $item->vehicle_type_id,
                'type_name' => $item->type_name,
                'created_at' => $item->created_at,
                'deleted_at' => $deletedAt,
                'created_by' => $createdBy,
                'archived_by' => $archivedBy,
            ],
            default => [
                'boat_id' => $item->boat_id,
                'boat_name' => $item->boat_name,
                'image_path' => $item->image_path,
                'owner' => [
                    'owner_id' => $item->owner_id ?? null,
                    'owner_firstname' => $item->owner?->owner_firstname ?? $item->owner_firstname ?? null,
                    'owner_lastname' => $item->owner?->owner_lastname ?? $item->owner_lastname ?? null,
                    'address' => $item->owner?->address ?? $item->owner?->address ?? null,
                    'contact_number' => $item->owner?->contact_number ?? $item->owner?->contact_number ?? null,
                ],
                'boat_type' => $this->getRelatedTypeData($item->boatType ?? $item->boat_type),
                'created_at' => $item->created_at,
                'deleted_at' => $deletedAt,
                'created_by' => $createdBy,
                'archived_by' => $archivedBy,
            ],
        };
    }

    private function getCreatedByData($item): ?array
    {
        $user = $item->createdBy ?? $item->created_by ?? null;
        if (!$user) {
            return null;
        }

        return [
            'user_id' => $user->user_id ?? $user->id ?? null,
            'first_name' => $user->first_name ?? null,
            'last_name' => $user->last_name ?? null,
            'full_name' => $user->full_name ?? trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
        ];
    }

    private function getArchivedByData($item): ?array
    {
        $archivedBy = $item->archived_by ?? $item->archivedBy ?? null;
        if (!$archivedBy) {
            return null;
        }

        return [
            'user_id' => $archivedBy['user_id'] ?? $archivedBy->user_id ?? null,
            'full_name' => $archivedBy['full_name'] ?? $archivedBy->full_name ?? null,
            'role' => $archivedBy['role'] ?? $archivedBy->role ?? null,
        ];
    }

    private function getRelatedTypeData($relation): ?array
    {
        if (!$relation) {
            return null;
        }

        return [
            'id' => $relation->boat_type_id ?? $relation->vehicle_type_id ?? $relation->id ?? null,
            'type_name' => $relation->type_name ?? null,
        ];
    }

    private function archiveQueryForType(string $type)
    {
        return match ($type) {
            'boatOwners' => BoatOwner::with(['createdBy'])
                ->archived(),
            'boatTypes' => BoatType::with(['createdBy'])
                ->archived(),
            'fishClassifications' => FishClassification::with(['createdBy'])
                ->onlyTrashed(),
            'vehicleTypes' => VehicleType::with(['createdBy'])
                ->onlyTrashed(),
            default => Boat::with(['owner', 'boatType', 'createdBy'])
                ->archived(),
        };
    }

    private function applyArchiveSearch($query, string $type, string $search): void
    {
        if ($search === '') {
            return;
        }

        match ($type) {
            'boatOwners' => $query->where(function ($inner) use ($search) {
                $nameTokens = collect(preg_split('/\s+/', $search) ?: [])
                    ->map(fn ($token) => trim((string) $token))
                    ->filter()
                    ->values();

                $inner
                    ->where('owner_firstname', 'like', "{$search}%")
                    ->orWhere('owner_lastname', 'like', "{$search}%")
                    ->orWhere(function ($nameQuery) use ($nameTokens) {
                        $nameTokens->each(function (string $token) use ($nameQuery) {
                            $nameQuery->where(function ($tokenQuery) use ($token) {
                                $tokenQuery
                                    ->where('owner_firstname', 'like', "{$token}%")
                                    ->orWhere('owner_lastname', 'like', "{$token}%");
                            });
                        });
                    });
            }),
            'boatTypes' => $query->where('type_name', 'like', "{$search}%"),
            'fishClassifications' => $query->where('classification_name', 'like', "%{$search}%"),
            'vehicleTypes' => $query->where('type_name', 'like', "%{$search}%"),
            default => $query->where('boat_name', 'like', "{$search}%"),
        };
    }

    private function attachArchivedBy(string $type, $items): void
    {
        if ($items->isEmpty()) {
            return;
        }

        if ($type === 'boatOwners') {
            $items->each(fn ($owner) => $owner->append('full_name'));
        }

        $patterns = [
            'boats' => ['Archives', 'Archived boat "%', '/Archived boat "([^"]*)"\./', fn ($item) => (string) $item->boat_name],
            'boatOwners' => ['Archives', 'Archived boat owner "%', '/Archived boat owner "([^"]*)"\./', fn ($item) => (string) $item->full_name],
            'boatTypes' => ['Archives', 'Archived boat type "%', '/Archived boat type "([^"]*)"\./', fn ($item) => (string) $item->type_name],
            'fishClassifications' => ['Banyera', 'Archived fish classification "%', '/Archived fish classification "([^"]*)"\./', fn ($item) => (string) $item->classification_name],
            'vehicleTypes' => ['Archives', 'Archived vehicle type "%', '/Archived vehicle type "([^"]*)"\./', fn ($item) => (string) $item->type_name],
        ];

        [$module, $like, $regex, $keyResolver] = $patterns[$type] ?? $patterns['boats'];
        $logs = ActivityLog::query()
            ->where('module', $module)
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', $like)
            ->latest('created_at')
            ->get();

        $archivedBy = [];
        foreach ($logs as $log) {
            if (!preg_match($regex, (string) $log->details, $matches)) {
                continue;
            }

            $name = trim((string) $matches[1]);
            if ($name === '' || isset($archivedBy[$name])) {
                continue;
            }

            $archivedBy[$name] = [
                'user_id' => $log->user_id,
                'full_name' => $log->user_name,
                'role' => $log->user_role,
            ];
        }

        $items->each(function ($item) use ($archivedBy, $keyResolver) {
            $item->createdBy?->append('full_name');
            $item->setAttribute('archived_by', $archivedBy[$keyResolver($item)] ?? null);
        });
    }

    private function archiveStats(): array
    {
        $counts = [
            'boats' => Boat::archived()->count(),
            'boatOwners' => BoatOwner::archived()->count(),
            'boatTypes' => BoatType::archived()->count(),
            'fishClassifications' => FishClassification::onlyTrashed()->count(),
            'vehicleTypes' => VehicleType::onlyTrashed()->count(),
        ];

        $today = now('Asia/Manila')->toDateString();

        return [
            'counts' => $counts,
            'total' => array_sum($counts),
            'archived_today' =>
                Boat::archived()->whereDate('deleted_at', $today)->count()
                + BoatOwner::archived()->whereDate('deleted_at', $today)->count()
                + BoatType::archived()->whereDate('deleted_at', $today)->count()
                + FishClassification::onlyTrashed()->whereDate('deleted_at', $today)->count()
                + VehicleType::onlyTrashed()->whereDate('deleted_at', $today)->count(),
        ];
    }
}
