<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\Bill;
use App\Models\BillItem;
use App\Models\Boat;
use App\Models\Docking;
use App\Models\Fee;
use App\Models\Payment;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class BillLoadTestSeeder extends Seeder
{
    private const BILL_COUNTS_BY_YEAR = [
        2025 => 200,
        2026 => 200,
    ];

    private const REFERENCE_START = 900001;

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'bill-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Bill',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000003',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $fees = Fee::query()
            ->where('fee_type_name', FeeTypeName::Docking->value)
            ->whereHas('boatType', fn ($query) => $query->where('type_name', 'Calendar Load Test Vessel'))
            ->whereIn('effective_from', ['2025-01-01', '2026-01-01'])
            ->pluck('fee_id');

        if ($fees->count() < 2) {
            $this->call(DockingLoadTestSeeder::class);

            $fees = Fee::query()
                ->where('fee_type_name', FeeTypeName::Docking->value)
                ->whereHas('boatType', fn ($query) => $query->where('type_name', 'Calendar Load Test Vessel'))
                ->whereIn('effective_from', ['2025-01-01', '2026-01-01'])
                ->pluck('fee_id');
        }

        $this->call(BoatLoadTestSeeder::class);

        $boatIds = Boat::query()
            ->where('boat_name', 'like', 'Boat Test %')
            ->orderBy('boat_id')
            ->limit(100)
            ->pluck('boat_id');

        if ($boatIds->isEmpty()) {
            throw new \RuntimeException('Expected 100 Boat Test rows to exist before seeding bills.');
        }

        $yearDockings = [];
        $totalBillCount = array_sum(self::BILL_COUNTS_BY_YEAR);

        foreach (self::BILL_COUNTS_BY_YEAR as $year => $yearCount) {
            $yearDockings[$year] = Docking::query()
                ->whereIn('boat_id', $boatIds)
                ->whereIn('fee_id', $fees)
                ->whereNull('voided_at')
                ->whereYear('docking_date', $year)
                ->orderBy('docking_date')
                ->orderBy('docking_id')
                ->limit($yearCount)
                ->get(['docking_id', 'boat_id', 'docking_fee', 'docking_date']);

            if ($yearDockings[$year]->count() < $yearCount) {
                $this->call(DockingLoadTestSeeder::class);

                $yearDockings[$year] = Docking::query()
                    ->whereIn('boat_id', $boatIds)
                    ->whereIn('fee_id', $fees)
                    ->whereNull('voided_at')
                    ->whereYear('docking_date', $year)
                    ->orderBy('docking_date')
                    ->orderBy('docking_id')
                    ->limit($yearCount)
                    ->get(['docking_id', 'boat_id', 'docking_fee', 'docking_date']);
            }

            if ($yearDockings[$year]->count() < $yearCount) {
                throw new \RuntimeException(sprintf('Expected %d docking rows for %s before seeding bills.', $yearCount, $year));
            }
        }

        $billCount = 0;

        DB::transaction(function () use ($yearDockings, $now, $user, &$billCount, $totalBillCount) {
            $references = collect(range(0, $totalBillCount - 1))
                ->map(fn (int $index) => (string) (self::REFERENCE_START + $index));

            $existingBillIds = Bill::query()
                ->whereIn('bill_reference_no', $references)
                ->pluck('bill_id');

            if ($existingBillIds->isNotEmpty()) {
                Payment::query()->whereIn('bill_id', $existingBillIds)->delete();
                BillItem::query()->whereIn('bill_id', $existingBillIds)->delete();
                Bill::query()->whereIn('bill_id', $existingBillIds)->delete();
            }

            $billRows = [];
            $itemRows = [];
            $sequence = 0;

            foreach ($yearDockings as $year => $dockings) {
                foreach ($dockings->values() as $docking) {
                    $billRows[] = [
                        'bill_reference_no' => (string) (self::REFERENCE_START + $sequence),
                        'boat_id' => $docking->boat_id,
                        'total_amount' => $docking->docking_fee,
                        'created_by' => $user->user_id,
                        'created_at' => $docking->docking_date,
                        'updated_at' => $now,
                    ];
                    $sequence++;
                }
            }

            foreach (array_chunk($billRows, 500) as $chunk) {
                DB::table('bills')->insert($chunk);
            }

            $billCount = count($billRows);

            $billIdsByReference = Bill::query()
                ->whereIn('bill_reference_no', $references)
                ->pluck('bill_id', 'bill_reference_no');

            $sequence = 0;

            foreach ($yearDockings as $year => $dockings) {
                foreach ($dockings->values() as $docking) {
                    $reference = (string) (self::REFERENCE_START + $sequence);
                    $itemRows[] = [
                        'bill_id' => $billIdsByReference[$reference],
                        'transaction_type' => 'docking',
                        'docking_id' => $docking->docking_id,
                        'banyera_id' => null,
                        'amount' => $docking->docking_fee,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    $sequence++;
                }
            }

            foreach (array_chunk($itemRows, 500) as $chunk) {
                DB::table('bill_items')->insert($chunk);
            }
        });

        if ($this->command) {
            $this->command->info(sprintf('BillLoadTestSeeder: %s bills created with references from %s to %s.',
                $billCount,
                self::REFERENCE_START,
                self::REFERENCE_START + $billCount - 1
            ));

            foreach (self::BILL_COUNTS_BY_YEAR as $year => $count) {
                $yearStart = self::REFERENCE_START + array_sum(array_slice(self::BILL_COUNTS_BY_YEAR, 0, array_search($year, array_keys(self::BILL_COUNTS_BY_YEAR), true)));
                $yearEnd = $yearStart + $count - 1;
                $this->command->info(sprintf('  %s: %s bills (%s to %s)', $year, $count, $yearStart, $yearEnd));
            }
        }
    }
}
