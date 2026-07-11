<?php

namespace App\Http\Controllers;

use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use Illuminate\Http\Request;

class BoatManagementController extends Controller
{
    private function usageFilter(Request $request, string $usageKey, string $statusKey): string
    {
        return (string) $request->query($usageKey, $request->query($statusKey, 'all'));
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

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $boatsPage = max((int) $request->query('boats_page', 1), 1);
        $boatTypesPage = max((int) $request->query('boat_types_page', 1), 1);
        $ownersPage = max((int) $request->query('owners_page', 1), 1);
        $boatOnly = $request->boolean('boat') || $request->boolean('boats_only');
        $typesOnly = $request->boolean('types') || $request->boolean('boat_types') || $request->boolean('boat-types');
        $ownersOnly = $request->boolean('owners') || $request->boolean('boat_owners');
        $includeBoats = $request->boolean('include_boats', true);
        $includeBoatTypes = $request->boolean('include_boat_types', true);
        $includeOwners = $request->boolean('include_owners', true);

        if ($boatOnly) {
            $includeBoats = true;
            $includeBoatTypes = false;
            $includeOwners = false;
        } elseif ($typesOnly) {
            $includeBoats = false;
            $includeBoatTypes = true;
            $includeOwners = false;
        } elseif ($ownersOnly) {
            $includeBoats = false;
            $includeBoatTypes = false;
            $includeOwners = true;
        }

        $boatsQuery = $includeBoats
            ? Boat::forManagementIndex()
                ->managementFilters(
                    $request->query('boats_search', ''),
                    $request->query('boats_status', 'all'),
                    $request->query('owner', 'all'),
                    $request->query('boat_type', 'all')
                )
                ->withCount(['dockings', 'banyeraTransactions'])
                ->orderByDesc('created_at')
                ->orderByDesc('boat_id')
            : null;
        $boatTypesQuery = $includeBoatTypes ? BoatType::forManagementIndex()
            ->managementFilters(
                $request->query('boat_types_search', ''),
                $this->usageFilter($request, 'boat_types_usage', 'boat_types_status')
            )
            ->orderByDesc('created_at')
            ->orderByDesc('boat_type_id') : null;
        $ownersQuery = $includeOwners ? BoatOwner::forManagementIndex()
            ->managementFilters(
                $request->query('owners_search', ''),
                $this->usageFilter($request, 'owners_usage', 'owners_status')
            )
            ->orderByDesc('created_at')
            ->orderByDesc('owner_id') : null;

        if ($request->boolean('boats_paginated')) {
            $boatsPage = $this->highlightedPage($boatsQuery, 'boat_id', $request->query('highlight_boat_id'), $boatsPage, $perPage);
        }

        if ($request->boolean('boat_types_paginated')) {
            $boatTypesPage = $this->highlightedPage($boatTypesQuery, 'boat_type_id', $request->query('highlight_boat_type_id'), $boatTypesPage, $perPage);
        }

        if ($request->boolean('owners_paginated')) {
            $ownersPage = $this->highlightedPage($ownersQuery, 'owner_id', $request->query('highlight_owner_id'), $ownersPage, $perPage);
        }

        $boatsPayload = $includeBoats
            ? $this->paginatedPayload(
                $boatsQuery,
                $request->boolean('boats_paginated'),
                $boatsPage,
                $perPage,
                function (Boat $boat) {
                    $boat->makeVisible('image_path');
                    $boat->owner?->append('full_name');
                    $boat->createdBy?->append('full_name');
                }
            )
            : ['data' => [], 'meta' => $this->emptyMeta($perPage)];

        $boatTypesPayload = $includeBoatTypes
            ? $this->paginatedPayload(
                $boatTypesQuery,
                $request->boolean('boat_types_paginated'),
                $boatTypesPage,
                $perPage,
                fn (BoatType $type) => $type->createdBy?->append('full_name')
            )
            : ['data' => [], 'meta' => $this->emptyMeta($perPage)];

        $ownersPayload = $includeOwners
            ? $this->paginatedPayload(
                $ownersQuery,
                $request->boolean('owners_paginated'),
                $ownersPage,
                $perPage,
                function (BoatOwner $owner) {
                    $owner->append('full_name');
                    $owner->createdBy?->append('full_name');
                }
            )
            : ['data' => [], 'meta' => $this->emptyMeta($perPage)];

        $stats = [];

        if ($includeBoats) {
            $stats = [
                'total_registered' => Boat::active()->count(),
                'active_boats' => Boat::active()->where('status', 'active')->count(),
                'expired_boats' => Boat::active()->where('status', 'expired')->count(),
                'suspended_boats' => Boat::active()->where('status', 'suspended')->count(),
                'under_repair_boats' => Boat::active()->where('status', 'under_repair')->count(),
            ];
        }

        if ($includeBoatTypes) {
            $stats = [
                ...$stats,
                'total_types' => BoatType::active()->count(),
                'boat_types_in_use' => BoatType::active()->has('activeBoats')->count(),
                'boat_types_not_in_use' => BoatType::active()->doesntHave('activeBoats')->count(),
            ];
        }

        if ($includeOwners) {
            $stats = [
                ...$stats,
                'total_owners' => BoatOwner::active()->count(),
                'boat_owners_in_use' => BoatOwner::active()->has('activeBoats')->count(),
                'boat_owners_not_in_use' => BoatOwner::active()->doesntHave('activeBoats')->count(),
            ];
        }

        if ($boatOnly) {
            return response()->json([
                'boats' => $boatsPayload['data'],
                'boatsMeta' => $boatsPayload['meta'],
                'stats' => $stats,
            ]);
        }

        if ($typesOnly) {
            return response()->json([
                'boatTypes' => $boatTypesPayload['data'],
                'boatTypesMeta' => $boatTypesPayload['meta'],
                'stats' => $stats,
            ]);
        }

        if ($ownersOnly) {
            return response()->json([
                'owners' => $ownersPayload['data'],
                'ownersMeta' => $ownersPayload['meta'],
                'stats' => $stats,
            ]);
        }

        return response()->json([
            'boats' => $boatsPayload['data'],
            'boatsMeta' => $boatsPayload['meta'],
            'boatTypes' => $boatTypesPayload['data'],
            'boatTypesMeta' => $boatTypesPayload['meta'],
            'owners' => $ownersPayload['data'],
            'ownersMeta' => $ownersPayload['meta'],
            'stats' => $stats,
        ]);
    }
}
