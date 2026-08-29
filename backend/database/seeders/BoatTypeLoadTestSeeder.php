<?php

namespace Database\Seeders;

use App\Models\BoatType;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class BoatTypeLoadTestSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'boat-type-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Boat',
                'last_name' => 'Type Test',
            ]
        );

        foreach (range(1, 50) as $number) {
            BoatType::firstOrCreate(
                ['type_name' => sprintf('Type Test %d', $number)],
                ['created_by' => $user->user_id]
            );
        }
    }
}
