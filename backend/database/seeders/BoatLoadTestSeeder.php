<?php

namespace Database\Seeders;

use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class BoatLoadTestSeeder extends Seeder
{
    public function run(): void
    {
        $boatTestRows = Boat::withTrashed()
            ->where('boat_name', 'like', 'Boat Test %')
            ->orderBy('boat_name')
            ->orderBy('boat_id')
            ->get();

        $boatTestRows->each(function (Boat $boat) {
            $boat->restore();
        });

        $boatTestRows->groupBy('boat_name')
            ->each(function ($boats) {
                $masterBoat = $boats->first();

                $boats->skip(1)->each(function (Boat $duplicate) use ($masterBoat) {
                    $duplicate->dockings()->update(['boat_id' => $masterBoat->boat_id]);
                    $duplicate->banyeraTransactions()->update(['boat_id' => $masterBoat->boat_id]);
                    $duplicate->bills()->update(['boat_id' => $masterBoat->boat_id]);
                    $duplicate->forceDelete();
                });
            });

        Boat::query()
            ->where('boat_name', 'like', '%Load Boat%')
            ->whereNull('deleted_at')
            ->delete();

        // Ensure any boat rows not part of the shared test set are removed.
        Boat::query()
            ->where('boat_name', 'not like', 'Boat Test %')
            ->delete();

        $user = User::firstOrCreate(
            ['email' => 'boat-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'active',
                'first_name' => 'Boat',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000099',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $this->call(BoatTypeLoadTestSeeder::class);
        $this->call(BoatOwnerLoadTestSeeder::class);

        $boatTypes = BoatType::query()
            ->where('type_name', 'like', 'Type Test %')
            ->orderBy('type_name')
            ->limit(50)
            ->get();

        if ($boatTypes->count() < 50) {
            throw new \RuntimeException('Expected 50 Type Test rows to exist before seeding boats.');
        }

        $ownerUser = User::query()
            ->where('email', 'boat-owner-load-test@example.com')
            ->first();

        if (! $ownerUser) {
            throw new \RuntimeException('Expected the boat owner test user to exist before seeding boats.');
        }

        $boatOwners = BoatOwner::query()
            ->where('created_by', $ownerUser->user_id)
            ->whereNull('deleted_at')
            ->orderBy('owner_lastname')
            ->orderBy('owner_firstname')
            ->limit(50)
            ->get();

        if ($boatOwners->count() < 50) {
            throw new \RuntimeException('Expected 50 owner rows from BoatOwnerLoadTestSeeder before seeding boats.');
        }

        foreach (range(1, 100) as $number) {
            $boatType = $boatTypes[($number - 1) % $boatTypes->count()];
            $boatOwner = $number <= $boatOwners->count()
                ? $boatOwners[$number - 1]
                : $boatOwners[($number - 1) % $boatOwners->count()];

            Boat::updateOrCreate(
                ['boat_name' => sprintf('Boat Test %d', $number)],
                [
                    'owner_id' => $boatOwner->owner_id,
                    'boat_type_id' => $boatType->boat_type_id,
                    'status' => 'active',
                    'created_by' => $user->user_id,
                ]
            );
        }

        $usedOwnerIds = Boat::query()
            ->where('boat_name', 'like', 'Boat Test %')
            ->whereNull('deleted_at')
            ->whereNotNull('owner_id')
            ->pluck('owner_id')
            ->filter()
            ->unique()
            ->values();

        if ($usedOwnerIds->count() < $boatOwners->count()) {
            throw new \RuntimeException('Expected every seeded boat owner to be connected to at least one boat.');
        }

        BoatType::query()
            ->where('type_name', 'Boat Test Vessel')
            ->delete();

        BoatOwner::query()
            ->where('owner_firstname', 'Boat')
            ->where('owner_lastname', 'Test Owner')
            ->delete();
    }
}
