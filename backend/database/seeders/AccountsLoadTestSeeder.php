<?php

namespace Database\Seeders;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AccountsLoadTestSeeder extends Seeder
{
    private const YEAR_TARGETS = [
        2026 => 1000,
    ];

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'accounts-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Accounts',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000000',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        // Delete existing load test accounts
        $existingUserIds = User::query()
            ->where('email', 'like', 'accounts-load-test-user-%@example.com')
            ->pluck('user_id');

        if ($existingUserIds->isNotEmpty()) {
            User::query()->whereIn('user_id', $existingUserIds)->delete();
        }

        $rows = [];

        foreach (self::YEAR_TARGETS as $year => $targetCount) {
            $startDate = CarbonImmutable::parse("{$year}-01-01", 'Asia/Manila');

            foreach (range(0, $targetCount - 1) as $recordIndex) {
                $dayOffset = intdiv($recordIndex, 10);
                $date = $startDate->addDays($dayOffset);
                $userNumber = $recordIndex + 1;

                $roles = ['coordinator', 'inspector'];
                $role = $roles[$recordIndex % count($roles)];
                $genders = ['male', 'female'];
                $gender = $genders[$recordIndex % count($genders)];
                $statuses = ['online', 'offline', 'deactivated'];
                $status = $statuses[$recordIndex % count($statuses)];

                $rows[] = [
                    'email' => sprintf('accounts-load-test-user-%04d@example.com', $userNumber),
                    'password' => Hash::make('password'),
                    'role' => $role,
                    'status' => $status,
                    'first_name' => sprintf('LoadTest%04d', $userNumber),
                    'last_name' => sprintf('User%04d', $userNumber),
                    'gender' => $gender,
                    'contact_number' => sprintf('09%010d', $userNumber),
                    'birthday' => $date->subYears(rand(20, 50))->toDateString(),
                    'address' => 'Opol Fish Port',
                    'created_by' => $user->user_id,
                    'created_at' => $date->toDateTimeString(),
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('users')->insert($chunk);
        }
    }
}
