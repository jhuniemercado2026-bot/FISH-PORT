<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\BanyeraTransaction;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\Fee;
use App\Models\FishClassification;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class BanyeraLoadTestSeeder extends Seeder
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
            ['email' => 'banyera-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Banyera',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000001',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $boatType = BoatType::firstOrCreate(
            ['type_name' => 'Banyera Load Test Vessel'],
            ['created_by' => $user->user_id]
        );

        $owner = BoatOwner::firstOrCreate(
            [
                'owner_firstname' => 'Banyera',
                'owner_lastname' => 'Load Test',
            ],
            [
                'address' => 'Opol Fish Port',
                'contact_number' => '09000000001',
                'created_by' => $user->user_id,
            ]
        );

        $feesByYear = collect(array_keys(self::YEAR_TARGETS))->mapWithKeys(function (int $year) use ($boatType, $user) {
            $effectiveFrom = "{$year}-01-01";

            return [
                $year => Fee::firstOrCreate(
                    [
                        'fee_type_name' => FeeTypeName::Banyera->value,
                        'boat_type_id' => $boatType->boat_type_id,
                        'vehicle_type_id' => null,
                        'effective_from' => $effectiveFrom,
                    ],
                    [
                        'amount' => 20,
                        'effective_to' => null,
                        'created_by' => $user->user_id,
                    ]
                ),
            ];
        });

        $classifications = collect([
            'Tamban',
            'Tulingan',
            'Bangus',
            'Galunggong',
            'Bisugo',
        ])->map(function (string $name) use ($user) {
            $classification = FishClassification::withTrashed()->firstOrCreate(
                ['classification_name' => $name],
                ['created_by' => $user->user_id]
            );

            if ($classification->trashed()) {
                $classification->restore();
            }

            return $classification;
        })->values();

        $this->call(BoatLoadTestSeeder::class);

        $boatIds = Boat::query()
            ->where('boat_name', 'like', 'Boat Test %')
            ->orderBy('boat_name')
            ->limit(self::BOAT_COUNT)
            ->pluck('boat_id')
            ->values();

        if ($boatIds->count() < self::BOAT_COUNT) {
            throw new \RuntimeException('Expected 100 Boat Test rows to exist before seeding Banyera.');
        }

        $banyeraIds = BanyeraTransaction::query()
            ->where(function ($query) {
                foreach (array_keys(self::YEAR_TARGETS) as $year) {
                    $query->orWhereYear('transaction_date', $year);
                }
            })
            ->pluck('banyera_id');

        if ($banyeraIds->isNotEmpty()) {
            $billIds = DB::table('bill_items')
                ->whereIn('banyera_id', $banyeraIds)
                ->pluck('bill_id');

            if ($billIds->isNotEmpty()) {
                DB::table('payments')->whereIn('bill_id', $billIds)->delete();
                DB::table('bill_items')->whereIn('bill_id', $billIds)->delete();
                DB::table('bills')->whereIn('bill_id', $billIds)->delete();
            }

            DB::table('banyera_items')->whereIn('banyera_id', $banyeraIds)->delete();
            BanyeraTransaction::query()->whereIn('banyera_id', $banyeraIds)->delete();
        }

        $deadlineByYear = collect(self::YEAR_DEADLINES);
        $itemRows = [];

        foreach (self::YEAR_TARGETS as $year => $targetCount) {
            $startDate = CarbonImmutable::parse("{$year}-01-01", 'Asia/Manila');
            $deadline = CarbonImmutable::parse($deadlineByYear[$year], 'Asia/Manila');
            $fee = $feesByYear[$year];

            foreach (range(0, $targetCount - 1) as $recordIndex) {
                $boatIndex = $recordIndex % $boatIds->count();
                $maxDays = $deadline->diffInDays($startDate);
                $dayOffset = $recordIndex % ($maxDays + 1);
                $boatId = $boatIds[$boatIndex];
                $date = $startDate->addDays($dayOffset);
                $quantity = 1 + (($boatIndex + $dayOffset) % 8);
                $daug = (($boatIndex + $dayOffset) % 5) * 5;
                $subtotal = ($quantity * (float) $fee->amount) + $daug;
                $transactionDate = $date
                    ->setTime(6 + ($boatIndex % 12), ($boatIndex * 11) % 60)
                    ->toDateTimeString();

                $banyeraId = DB::table('banyera_transactions')->insertGetId([
                    'boat_id' => $boatId,
                    'transaction_date' => $transactionDate,
                    'total_fee' => $subtotal,
                    'created_by' => $user->user_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $classification = $classifications[($boatIndex + $dayOffset) % $classifications->count()];

                $itemRows[] = [
                    'banyera_id' => $banyeraId,
                    'classification_id' => $classification->classification_id,
                    'quantity' => $quantity,
                    'fee_id' => $fee->fee_id,
                    'subtotal' => $subtotal,
                    'daug' => $daug,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($itemRows, 500) as $chunk) {
            DB::table('banyera_items')->insert($chunk);
        }
    }
}
