<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\Docking;
use App\Models\Fee;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DockingLoadTestSeeder extends Seeder
{
    private const BOAT_COUNT = 100;
    private const YEAR_TARGETS = [
        2025 => 500,
        2026 => 1000,
    ];

    private const YEAR_DEADLINES = [
        2025 => '2025-07-01',
        2026 => '2026-07-01',
    ];

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'calendar-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Calendar',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000000',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $boatType = BoatType::firstOrCreate(
            ['type_name' => 'Calendar Load Test Vessel'],
            ['created_by' => $user->user_id]
        );

        $owner = BoatOwner::firstOrCreate(
            [
                'owner_firstname' => 'Calendar',
                'owner_lastname' => 'Load Test',
            ],
            [
                'address' => 'Opol Fish Port',
                'contact_number' => '09000000000',
                'created_by' => $user->user_id,
            ]
        );

        $feesByYear = collect(array_keys(self::YEAR_TARGETS))->mapWithKeys(function (int $year) use ($boatType, $user) {
            $effectiveFrom = "{$year}-01-01";

            return [
                $year => Fee::firstOrCreate(
                    [
                        'fee_type_name' => FeeTypeName::Docking->value,
                        'boat_type_id' => $boatType->boat_type_id,
                        'vehicle_type_id' => null,
                        'effective_from' => $effectiveFrom,
                    ],
                    [
                        'amount' => 50,
                        'effective_to' => null,
                        'created_by' => $user->user_id,
                    ]
                ),
            ];
        });

        $this->call(BoatLoadTestSeeder::class);

        $boatIds = Boat::query()
            ->where('boat_name', 'like', 'Boat Test %')
            ->orderBy('boat_name')
            ->limit(self::BOAT_COUNT)
            ->pluck('boat_id')
            ->values();

        if ($boatIds->count() < self::BOAT_COUNT) {
            throw new \RuntimeException('Expected 100 Boat Test rows to exist before seeding Docking.');
        }

        $deadlineByYear = collect(self::YEAR_DEADLINES);

        $existingDockingBillIds = DB::table('bill_items')
            ->whereNotNull('docking_id')
            ->pluck('bill_id')
            ->unique();

        if ($existingDockingBillIds->isNotEmpty()) {
            DB::table('payments')->whereIn('bill_id', $existingDockingBillIds)->delete();
            DB::table('bill_items')->whereIn('bill_id', $existingDockingBillIds)->delete();
            DB::table('bills')->whereIn('bill_id', $existingDockingBillIds)->delete();
        }

        Docking::query()->delete();

        $rows = [];

        foreach (self::YEAR_TARGETS as $year => $targetCount) {
            $startDate = CarbonImmutable::parse("{$year}-01-01", 'Asia/Manila');
            $deadline = CarbonImmutable::parse($deadlineByYear[$year], 'Asia/Manila');
            $fee = $feesByYear[$year];

            foreach (range(0, $targetCount - 1) as $recordIndex) {
                $boatIndex = $recordIndex % $boatIds->count();
                $maxDays = $deadline->diffInDays($startDate);
                $dayOffset = $recordIndex % ($maxDays + 1);
                $date = $startDate->addDays($dayOffset);
                $boatId = $boatIds[$boatIndex];

                $rows[] = [
                    'boat_id' => $boatId,
                    'fee_id' => $fee->fee_id,
                    'docking_date' => $date
                        ->setTime(5 + ($boatIndex % 14), ($boatIndex * 7) % 60)
                        ->toDateTimeString(),
                    'docking_fee' => $fee->amount,
                    'created_by' => $user->user_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('dockings')->insert($chunk);
        }
    }
}
