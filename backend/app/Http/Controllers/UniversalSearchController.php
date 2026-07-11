<?php

namespace App\Http\Controllers;

use App\Models\BanyeraTransaction;
use App\Models\Bill;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\Docking;
use App\Models\Fee;
use App\Models\FishClassification;
use App\Models\Payment;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Models\VehicleType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class UniversalSearchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);

        $query = trim((string) ($validated['q'] ?? ''));
        $limit = (int) ($validated['limit'] ?? 30);

        if (mb_strlen($query) < 1) {
            return response()->json(['results' => []]);
        }

        $isHead = strtolower((string) $request->user()?->role) === 'head';
        $results = collect()
            ->merge($this->boats($query))
            ->merge($this->boatTypes($query))
            ->merge($this->boatOwners($query))
            ->merge($this->bills($query))
            ->merge($this->payments($query))
            ->merge($this->dockings($query))
            ->merge($this->banyera($query))
            ->merge($this->fishClassifications($query))
            ->merge($this->vehicleTypes($query))
            ->merge($this->vehicleTickets($query))
            ->merge($this->remittances($query))
            ->merge($this->statements($query));

        if ($isHead) {
            $results = $results
                ->merge($this->users($query, $request->user()?->user_id))
                ->merge($this->fees($query));
        }

        $ranked = $results
            ->map(fn (array $item) => array_merge($item, ['score' => $this->score($item, $query)]))
            ->sortBy([
                ['score', 'desc'],
                ['title', 'asc'],
            ])
            ->take($limit)
            ->values()
            ->map(fn (array $item) => collect($item)->except('score', 'searchText')->all());

        return response()->json(['results' => $ranked]);
    }

    private function boats(string $search): Collection
    {
        return Boat::forManagementIndex()
            ->managementFilters($search)
            ->latest('created_at')
            ->limit(8)
            ->get()
            ->map(function (Boat $boat) {
                $ownerName = trim(($boat->owner?->owner_firstname ?? '') . ' ' . ($boat->owner?->owner_lastname ?? '')) ?: '-';
                $boatType = $boat->boatType?->type_name ?: '-';
                $title = $boat->boat_name ?: "Boat #{$boat->boat_id}";
                $subtitle = $this->join([$ownerName, $boatType, $this->titleCase($boat->status ?: 'Active')]);

                return $this->result("boat-{$boat->boat_id}", $title, $subtitle, 'Registered Boats', "/registered-boats?highlight=boat-{$boat->boat_id}", [$title, $subtitle]);
            });
    }

    private function boatTypes(string $search): Collection
    {
        return BoatType::forManagementIndex()
            ->managementFilters($search)
            ->latest()
            ->limit(6)
            ->get()
            ->map(function (BoatType $type) {
                $title = $type->type_name ?: "Boat Type #{$type->boat_type_id}";

                return $this->result(
                    "boat-type-{$type->boat_type_id}",
                    $title,
                    '',
                    'Boat Type',
                    "/boat-type?highlight=boat-type-{$type->boat_type_id}",
                    [$title]
                );
            });
    }

    private function boatOwners(string $search): Collection
    {
        return BoatOwner::forManagementIndex()
            ->managementFilters($search)
            ->latest()
            ->limit(6)
            ->get()
            ->map(function (BoatOwner $owner) {
                $title = trim(($owner->owner_firstname ?? '') . ' ' . ($owner->owner_lastname ?? '')) ?: "Boat Owner #{$owner->owner_id}";

                return $this->result(
                    "boat-owner-{$owner->owner_id}",
                    $title,
                    '',
                    'Boat Owner',
                    "/boat-owners?highlight=boat-owner-{$owner->owner_id}",
                    [$title]
                );
            });
    }

    private function bills(string $search): Collection
    {
        return Bill::query()
            ->with(['boat:boat_id,boat_name,boat_type_id', 'boat.boatType:boat_type_id,type_name'])
            ->where(function ($query) use ($search) {
                $query->where('bill_reference_no', 'like', "%{$search}%")
                    ->orWhere('total_amount', 'like', "%{$search}%")
                    ->orWhereHas('boat', fn ($boat) => $boat->where('boat_name', 'like', "%{$search}%"))
                    ->orWhereHas('boat.boatType', fn ($type) => $type->where('type_name', 'like', "%{$search}%"));
            })
            ->latest('bill_id')
            ->limit(8)
            ->get()
            ->map(function (Bill $bill) {
                $title = $this->formatReference($bill->bill_reference_no) ?: "Bill #{$bill->bill_id}";
                $boatName = $bill->boat?->boat_name ?: '-';
                $boatType = $bill->boat?->boatType?->type_name ?: '-';
                $subtitle = $this->join([$boatName, $boatType, $this->date($bill->created_at), $this->money($bill->total_amount)]);

                return $this->result("bill-{$bill->bill_id}", $title, $subtitle, 'Bills', "/billing?highlight=bill-{$bill->bill_id}", [$title, $subtitle]);
            });
    }

    private function payments(string $search): Collection
    {
        return Payment::query()
            ->leftJoin('bills as b', 'b.bill_id', '=', 'payments.bill_id')
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->where(function ($query) use ($search) {
                $query->where('payments.payment_reference_no', 'like', "%{$search}%")
                    ->orWhere('payments.amount_paid', 'like', "%{$search}%")
                    ->orWhereDate('payments.payment_date', $search)
                    ->orWhere('boat.boat_name', 'like', "%{$search}%");
            })
            ->select('payments.*', 'boat.boat_name')
            ->latest('payments.payment_id')
            ->limit(8)
            ->get()
            ->map(function ($payment) {
                $title = $payment->payment_reference_no ?: "Payment #{$payment->payment_id}";
                $subtitle = $this->join([
                    $payment->boat_name ?: '-',
                    $this->date($payment->payment_date ?: $payment->created_at),
                    $this->money($payment->amount_paid),
                ]);

                return $this->result("payment-{$payment->payment_id}", $title, $subtitle, 'Payments', "/payments?highlight=payment-{$payment->payment_id}", [$title, $payment->boat_name, $this->date($payment->payment_date ?: $payment->created_at), $this->money($payment->amount_paid)]);
            });
    }

    private function dockings(string $search): Collection
    {
        return Docking::forTableIndex()
            ->searchTable($search)
            ->orderByDesc('docking_date')
            ->orderByDesc('created_at')
            ->orderByDesc('docking_id')
            ->limit(8)
            ->get()
            ->map(function (Docking $docking) {
                $title = $docking->boat?->boat_name ?: "Docking #{$docking->docking_id}";
                $subtitle = $this->join([$docking->boat?->boatType?->type_name ?: '-', $this->date($docking->docking_date), $this->money($docking->docking_fee)]);
                return $this->result("docking-{$docking->docking_id}", $title, $subtitle, 'Docking', "/docking?highlight=docking-{$docking->docking_id}", [$title, $subtitle]);
            });
    }

    private function banyera(string $search): Collection
    {
        return BanyeraTransaction::forTableIndex(true)
            ->searchTable($search)
            ->orderByDesc('banyera_transactions.transaction_date')
            ->orderByDesc('banyera_transactions.created_at')
            ->orderByDesc('banyera_transactions.banyera_id')
            ->limit(8)
            ->get()
            ->map(function (BanyeraTransaction $transaction) {
                $reference = 'BNY-' . str_pad((string) $transaction->banyera_id, 4, '0', STR_PAD_LEFT);
                $title = $transaction->boat?->boat_name ?: $reference;
                $subtitle = $this->join([$transaction->boat?->boatType?->type_name ?: '-', $this->date($transaction->transaction_date), $this->money($transaction->total_fee)]);

                return $this->result("banyera-{$transaction->banyera_id}", $title, $subtitle, 'Banyera', "/banyera?highlight=banyera-{$transaction->banyera_id}", [$title, $subtitle]);
            });
    }

    private function fishClassifications(string $search): Collection
    {
        return FishClassification::query()
            ->whereNull('deleted_at')
            ->where('classification_name', 'like', "{$search}%")
            ->orderBy('classification_name')
            ->orderBy('classification_id')
            ->limit(8)
            ->get()
            ->map(function (FishClassification $classification) {
                $title = $classification->classification_name ?: "Fish Classification #{$classification->classification_id}";

                return $this->result(
                    "fish-classification-{$classification->classification_id}",
                    $title,
                    '',
                    'Fish Classifications',
                    "/banyera?tab=classifications&highlight=fish-classification-{$classification->classification_id}",
                    [$title]
                );
            });
    }

    private function vehicleTypes(string $search): Collection
    {
        return VehicleType::query()
            ->whereNull('deleted_at')
            ->where('type_name', 'like', "{$search}%")
            ->orderBy('type_name')
            ->orderBy('vehicle_type_id')
            ->limit(6)
            ->get()
            ->map(function (VehicleType $type) {
                $title = $type->type_name ?: "Vehicle Type #{$type->vehicle_type_id}";

                return $this->result(
                    "vehicle-type-{$type->vehicle_type_id}",
                    $title,
                    '',
                    'Vehicle Types',
                    "/vehicle-tickets?tab=types&highlight=vehicle-type-{$type->vehicle_type_id}",
                    [$title]
                );
            });
    }

    private function vehicleTickets(string $search): Collection
    {
        $mapTicket = function (VehicleTicket $ticket) {
            $title = $ticket->vehicleType?->type_name ?: "Ticket #{$ticket->ticket_id}";
            $isAnnual = strtolower((string) $ticket->ticket_type) === 'annual';
            $subtitle = $isAnnual
                ? $this->join([$ticket->plate_number, $ticket->driver_name, $this->date($ticket->ticket_date), $this->money($ticket->ticket_fee)])
                : $this->join([$this->date($ticket->ticket_date), $this->money($ticket->ticket_fee)]);
            $group = $isAnnual ? 'Annual Vehicle Tickets' : 'Daily Vehicle Tickets';
            $searchValues = $isAnnual
                ? [$title, $ticket->plate_number, $ticket->driver_name, $this->date($ticket->ticket_date), $this->money($ticket->ticket_fee)]
                : [$title, $this->date($ticket->ticket_date), $this->money($ticket->ticket_fee)];

            $tab = $isAnnual ? 'annual' : 'daily';

            return $this->result(
                "ticket-{$ticket->ticket_id}",
                $title,
                $subtitle,
                $group,
                "/vehicle-tickets?tab={$tab}&highlight=ticket-{$ticket->ticket_id}",
                $searchValues
            );
        };

        $dailyTickets = VehicleTicket::query()
            ->with(['vehicleType:vehicle_type_id,type_name'])
            ->where('ticket_type', 'daily')
            ->where(function ($dailyFields) use ($search) {
                $dailyFields
                    ->where('ticket_fee', 'like', "%{$search}%")
                    ->orWhereDate('ticket_date', $search)
                    ->orWhereHas('vehicleType', fn ($type) => $type->where('type_name', 'like', "%{$search}%"));
            })
            ->latest('ticket_id')
            ->limit(8)
            ->get()
            ->map($mapTicket);

        $annualTickets = VehicleTicket::query()
            ->with(['vehicleType:vehicle_type_id,type_name'])
            ->where('ticket_type', 'annual')
            ->where(function ($annualFields) use ($search) {
                $annualFields
                    ->where('plate_number', 'like', "%{$search}%")
                    ->orWhere('driver_name', 'like', "%{$search}%")
                    ->orWhere('ticket_fee', 'like', "%{$search}%")
                    ->orWhereDate('ticket_date', $search)
                    ->orWhereHas('vehicleType', fn ($type) => $type->where('type_name', 'like', "%{$search}%"));
            })
            ->latest('ticket_id')
            ->limit(8)
            ->get()
            ->map($mapTicket);

        return collect()
            ->merge($dailyTickets)
            ->merge($annualTickets);
    }

    private function remittances(string $search): Collection
    {
        return Remittance::query()
            ->where(function ($query) use ($search) {
                $query->where('remittance_reference_no', 'like', "%{$search}%")
                    ->orWhere('amount', 'like', "%{$search}%")
                    ->orWhere('surplus', 'like', "%{$search}%")
                    ->orWhere('deficit', 'like', "%{$search}%")
                    ->orWhere('remarks', 'like', "%{$search}%")
                    ->orWhereDate('date', $search);
            })
            ->latest('remittance_id')
            ->limit(6)
            ->get()
            ->map(fn (Remittance $remittance) => $this->result(
                "remittance-{$remittance->remittance_id}",
                $remittance->remittance_reference_no ?: $this->date($remittance->date),
                $this->join([$this->date($remittance->date), $this->money($remittance->amount)]),
                'Remittance',
                "/remittance?highlight=remittance-{$remittance->remittance_id}",
                [$remittance->remittance_reference_no, $remittance->remarks]
            ));
    }

    private function users(string $search, ?int $currentUserId): Collection
    {
        return User::query()
            ->where('user_id', '!=', $currentUserId)
            ->where('email', 'like', "%{$search}%")
            ->latest('user_id')
            ->limit(6)
            ->get()
            ->map(function (User $user) {
                return $this->result(
                    "user-{$user->user_id}",
                    $user->email ?: 'User',
                    '',
                    'Manage Accounts',
                    "/manage-accounts?highlight=user-{$user->user_id}",
                    [$user->email]
                );
            });
    }

    private function statements(string $search): Collection
    {
        return Boat::query()
            ->where('boat_name', 'like', "%{$search}%")
            ->latest('boat_id')
            ->limit(6)
            ->get()
            ->map(function (Boat $boat) {
                $title = $boat->boat_name ?: "Boat #{$boat->boat_id}";

                return $this->result(
                    "boat-{$boat->boat_id}",
                    $title,
                    '',
                    'Statement of Account',
                    "/statement-of-account?highlight=boat-{$boat->boat_id}",
                    [$title]
                );
            });
    }

    private function fees(string $search): Collection
    {
        return Fee::query()
            ->with(['boatType:boat_type_id,type_name', 'vehicleType:vehicle_type_id,type_name'])
            ->where(function ($query) use ($search) {
                $query->where('fee_type_name', 'like', "%{$search}%")
                    ->orWhere('amount', 'like', "%{$search}%")
                    ->orWhereHas('boatType', fn ($type) => $type->where('type_name', 'like', "%{$search}%"))
                    ->orWhereHas('vehicleType', fn ($type) => $type->where('type_name', 'like', "%{$search}%"));
            })
            ->latest('fee_id')
            ->limit(6)
            ->get()
            ->map(function (Fee $fee) {
                $title = (string) ($fee->fee_name ?: $fee->fee_type_name ?: "Fee #{$fee->fee_id}");
                $subtitle = $this->join([$fee->boatType?->type_name ?: $fee->vehicleType?->type_name, $this->money($fee->amount)]);

                return $this->result("fee-{$fee->fee_id}", $title, $subtitle, 'Set Fees', "/set-fees?highlight=fee-{$fee->fee_id}", [$title, $subtitle]);
            });
    }

    private function result(string $id, string $title, string $subtitle, string $group, string $path, array $searchValues): array
    {
        return [
            'id' => $id,
            'title' => $title,
            'subtitle' => $subtitle,
            'group' => $group,
            'path' => $path,
            'searchText' => implode(' ', array_filter($searchValues, fn ($value) => trim((string) $value) !== '')),
        ];
    }

    private function score(array $item, string $query): int
    {
        $needle = mb_strtolower(trim($query));
        $title = mb_strtolower((string) ($item['title'] ?? ''));
        $subtitle = mb_strtolower((string) ($item['subtitle'] ?? ''));
        $searchText = mb_strtolower((string) ($item['searchText'] ?? ''));
        $score = 0;

        if ($title === $needle) {
            $score += 1200;
        } elseif (str_starts_with($title, $needle)) {
            $score += 900;
        } elseif (str_contains($title, $needle)) {
            $score += 600;
        }

        if (str_starts_with($subtitle, $needle)) {
            $score += 250;
        } elseif (str_contains($subtitle, $needle)) {
            $score += 150;
        }

        foreach (preg_split('/\s+/', $needle) ?: [] as $token) {
            if ($token === '') {
                continue;
            }

            if (str_starts_with($title, $token)) {
                $score += 120;
            } elseif (str_contains($title, $token)) {
                $score += 80;
            }

            if (str_contains($subtitle, $token)) {
                $score += 40;
            }
            if (str_contains($searchText, $token)) {
                $score += 25;
            }
        }

        return $score;
    }

    private function join(array $values): string
    {
        return collect($values)
            ->filter(fn ($value) => trim((string) $value) !== '')
            ->implode(' | ');
    }

    private function date($value): string
    {
        if (!$value) {
            return '-';
        }

        return optional($value instanceof \DateTimeInterface ? $value : date_create((string) $value))->format('M j, Y') ?: '-';
    }

    private function money($value): string
    {
        return 'PHP ' . number_format((float) $value, 2);
    }

    private function titleCase(?string $value): string
    {
        return ucwords(strtolower(str_replace('_', ' ', (string) $value)));
    }

    private function formatReference(?string $value): string
    {
        $digits = preg_replace('/\D/', '', (string) $value);

        return $digits ? str_pad(substr($digits, -6), 6, '0', STR_PAD_LEFT) : '';
    }
}
