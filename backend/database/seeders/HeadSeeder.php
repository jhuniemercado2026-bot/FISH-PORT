<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class HeadSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'headofmeeo.opol@gmail.com'],
            [
                'first_name' => 'Jhunie',
                'last_name' => 'Mercado',
                'password' => Hash::make('Password@123'),
                'role' => 'head',
                'status' => 'offline',
            ]
        );
    }
}
