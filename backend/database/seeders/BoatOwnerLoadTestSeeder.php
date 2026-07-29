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

        $ownersToRemove = BoatOwner::withTrashed()
            ->where(function ($query) use ($user): void {
                $query->where('created_by', $user->user_id)
                    ->orWhere(function ($legacyQuery): void {
                        $legacyQuery->where('owner_firstname', 'Boat')
                            ->where('owner_lastname', 'Test Owner');
                    })
                    ->orWhere(function ($legacyQuery): void {
                        $legacyQuery->where('owner_firstname', 'Owner')
                            ->where('owner_lastname', 'like', 'Test %');
                    });
            })
            ->get();

        if ($ownersToRemove->isNotEmpty()) {
            $ownerIds = $ownersToRemove->pluck('owner_id')->all();
            $replacementOwner = BoatOwner::query()
                ->where('created_by', $user->user_id)
                ->orderBy('owner_id')
                ->first();

            if ($replacementOwner) {
                \App\Models\Boat::query()
                    ->whereIn('owner_id', $ownerIds)
                    ->update(['owner_id' => $replacementOwner->owner_id]);
            }

            BoatOwner::query()
                ->whereIn('owner_id', $ownerIds)
                ->delete();
        }

        $firstNames = ['Eric', 'Juan', 'Maria', 'Rosa', 'Luis', 'Ana', 'Miguel', 'Grace', 'Renzo', 'Nina'];
        $lastNames = ['Santos', 'Dela Cruz', 'Reyes', 'Garcia', 'Mendoza', 'Lopez', 'Torres', 'Aquino', 'Cruz', 'Pangilinan'];

        foreach (range(1, 50) as $number) {
            $firstName = $firstNames[($number - 1) % count($firstNames)];
            $lastName = $lastNames[(int) floor(($number - 1) / count($firstNames)) % count($lastNames)];

            BoatOwner::create([
                'owner_firstname' => $firstName,
                'owner_lastname' => $lastName,
                'address' => 'Opol Fish Port',
                'contact_number' => sprintf('09000000%03d', $number),
                'created_by' => $user->user_id,
            ]);
        }
    }
}
