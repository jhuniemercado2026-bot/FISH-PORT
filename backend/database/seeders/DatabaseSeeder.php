<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::firstOrCreate([
            'email' => 'headofmeeo.opol@gmail.com',
        ], [
            'password' => Hash::make('password123'),
            'role' => 'head',
            'status' => 'active',
            'first_name' => 'Jhunie',
            'last_name' => 'Mercado',
        ]);

        User::firstOrCreate([
            'email' => 'test@example.com',
        ], [
            'password' => bcrypt('password'),
            'role' => 'head',
            'status' => 'active',
            'first_name' => 'Test',
            'last_name' => 'User',
        ]);

        User::firstOrCreate([
            'email' => 'occ.mercado.jhunie@gmail.com',
        ], [
            'password' => Hash::make('password123'),
            'role' => 'head',
            'status' => 'active',
            'first_name' => 'Jhunie',
            'last_name' => 'Mercado',
        ]);

        $this->call(BoatTypeLoadTestSeeder::class);
        $this->call(BoatLoadTestSeeder::class);
        $this->call(FeeLoadTestSeeder::class);
        $this->call(DockingLoadTestSeeder::class);
        $this->call(BillLoadTestSeeder::class);
        $this->call(PaymentLoadTestSeeder::class);
        $this->call(BanyeraLoadTestSeeder::class);
        $this->call(VehicleTicketLoadTestSeeder::class);
        $this->call(RemittanceLoadTestSeeder::class);
        $this->call(NotificationLoadTestSeeder::class);
        $this->call(ArchivesLoadTestSeeder::class);
    }
}
