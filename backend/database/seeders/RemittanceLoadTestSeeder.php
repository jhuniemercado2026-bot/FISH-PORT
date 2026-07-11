<?php

namespace Database\Seeders;

use App\Models\Remittance;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class RemittanceLoadTestSeeder extends Seeder
{
    private const REMITTANCES_PER_YEAR = [
        2025 => 100,
        2026 => 150,
    ];
    // 6-digit numeric references start
    private const REFERENCE_START = 100001;

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'remittance-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'coordinator',
                'status' => 'active',
                'first_name' => 'Remittance',
                'last_name' => 'Load Test',
                'gender' => 'female',
                'contact_number' => '09000000005',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        DB::transaction(function () use ($now, $user) {
            // Remove any previously inserted test references in our numeric range
            $total = array_sum(self::REMITTANCES_PER_YEAR);
            $references = collect(range(0, $total - 1))
                ->map(fn (int $index) => (string) (self::REFERENCE_START + $index));

            Remittance::query()
                ->whereIn('remittance_reference_no', $references)
                ->delete();

            $rows = [];
            $sequence = 0;

            foreach (self::REMITTANCES_PER_YEAR as $year => $count) {
                $startDate = CarbonImmutable::parse($year . '-01-01', 'Asia/Manila');

                for ($i = 0; $i < $count; $i++) {
                    $sequence++;
                    $date = $startDate->addDays($i);
                    $amount = 1000;
                    $surplus = 0;
                    $deficit = 0;

                    $rows[] = [
                        'remittance_reference_no' => str_pad((string) (self::REFERENCE_START + $sequence - 1), 6, '0', STR_PAD_LEFT),
                        'date' => $date->toDateString(),
                        'amount' => $amount,
                        'surplus' => $surplus,
                        'deficit' => $deficit,
                        'status' => $sequence % 4 === 0 ? 'remitted' : 'pending',
                        'submitted_by' => $user->user_id,
                        'created_at' => $date->setTime(16, $sequence % 60)->toDateTimeString(),
                        'updated_at' => $now,
                    ];
                }
            }

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('remittances')->insert($chunk);
            }
        });
    }
}
