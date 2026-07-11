<?php

namespace Database\Seeders;

use App\Models\BoatOwner;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class BoatOwnerLoadTestSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'boat-owner-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'active',
                'first_name' => 'Boat',
                'last_name' => 'Owner Test',
            ]
        );

        foreach (range(1, 50) as $number) {
            BoatOwner::firstOrCreate(
                [
                    'owner_firstname' => 'Owner',
                    'owner_lastname' => sprintf('Test %d', $number),
                ],
                [
                    'address' => 'Opol Fish Port',
                    'contact_number' => sprintf('090000000%02d', $number),
                    'created_by' => $user->user_id,
                ]
            );
        }
    }
}
