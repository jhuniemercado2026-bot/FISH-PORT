<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\FishClassification;
use App\Models\User;
use App\Models\VehicleType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ArchivesLoadTestSeeder extends Seeder
{
    private const ARCHIVE_COUNT = 100;
    private const YEAR = 2026;

    public function run(): void
    {
        $now = now();
        $startDate = CarbonImmutable::parse(self::YEAR . '-01-01', 'Asia/Manila');

        $user = User::firstOrCreate(
            ['email' => 'archives-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'offline',
                'first_name' => 'Archives',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000002',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        Boat::withTrashed()->where('boat_name', 'like', 'Archives Load Boat %')->forceDelete();
        BoatOwner::withTrashed()
            ->where('owner_firstname', 'Archives')
            ->where('owner_lastname', 'like', 'Load Test%')
            ->forceDelete();
        BoatType::withTrashed()->where('type_name', 'like', 'Archives Load Test Vessel %')->forceDelete();
        VehicleType::withTrashed()->where('type_name', 'like', 'Archives Load Test Vehicle %')->forceDelete();
        FishClassification::withTrashed()->where('classification_name', 'like', 'Archives Load Test Fish %')->forceDelete();
        ActivityLog::where('user_id', $user->user_id)
            ->where('module', 'Archives')
            ->where('action', 'ARCHIVE')
            ->where('details', 'like', 'Archived %')
            ->delete();

        $boatTypes = collect(range(1, self::ARCHIVE_COUNT))->map(function (int $number) use ($user) {
            return BoatType::create([
                'type_name' => sprintf('Archives Load Test Vessel %03d', $number),
                'created_by' => $user->user_id,
            ]);
        });

        $owners = collect(range(1, self::ARCHIVE_COUNT))->map(function (int $number) use ($user) {
            return BoatOwner::create([
                'owner_firstname' => 'Archives',
                'owner_lastname' => sprintf('Load Test Owner %03d', $number),
                'address' => 'Opol Fish Port',
                'contact_number' => sprintf('090000%05d', $number),
                'created_by' => $user->user_id,
            ]);
        });

        $vehicleTypes = collect(range(1, self::ARCHIVE_COUNT))->map(function (int $number) use ($user) {
            return VehicleType::create([
                'type_name' => sprintf('Archives Load Test Vehicle %03d', $number),
                'created_by' => $user->user_id,
            ]);
        });

        $classifications = collect(range(1, self::ARCHIVE_COUNT))->map(function (int $number) use ($user) {
            return FishClassification::create([
                'classification_name' => sprintf('Archives Load Test Fish %03d', $number),
                'created_by' => $user->user_id,
            ]);
        });

        Boat::withTrashed()
            ->where('boat_name', 'like', 'Boat Test %')
            ->restore();

        $owners->each(function (BoatOwner $owner, int $index) use ($startDate, $user) {
            $archiveDate = $startDate->addDays(5 + $index)->setTime(9, 0);
            $owner->deleted_at = $archiveDate;
            $owner->save();

            ActivityLog::create([
                'user_id' => $user->user_id,
                'user_name' => sprintf('%s %s', $user->first_name, $user->last_name),
                'user_role' => $user->role,
                'action' => 'ARCHIVE',
                'module' => 'Archives',
                'details' => sprintf('Archived boat owner "%s %s".', $owner->owner_firstname, $owner->owner_lastname),
                'severity' => 'warning',
            ]);
        });

        $boatTypes->each(function (BoatType $boatType, int $index) use ($startDate, $user) {
            $archiveDate = $startDate->addDays(10 + $index)->setTime(10, 0);
            $boatType->deleted_at = $archiveDate;
            $boatType->save();

            ActivityLog::create([
                'user_id' => $user->user_id,
                'user_name' => sprintf('%s %s', $user->first_name, $user->last_name),
                'user_role' => $user->role,
                'action' => 'ARCHIVE',
                'module' => 'Archives',
                'details' => sprintf('Archived boat type "%s".', $boatType->type_name),
                'severity' => 'warning',
            ]);
        });

        $vehicleTypes->each(function (VehicleType $vehicleType, int $index) use ($startDate, $user) {
            $archiveDate = $startDate->addDays(15 + $index)->setTime(11, 0);
            $vehicleType->deleted_at = $archiveDate;
            $vehicleType->save();

            ActivityLog::create([
                'user_id' => $user->user_id,
                'user_name' => sprintf('%s %s', $user->first_name, $user->last_name),
                'user_role' => $user->role,
                'action' => 'ARCHIVE',
                'module' => 'Archives',
                'details' => sprintf('Archived vehicle type "%s".', $vehicleType->type_name),
                'severity' => 'warning',
            ]);
        });

        $classifications->each(function (FishClassification $classification, int $index) use ($startDate, $user) {
            $archiveDate = $startDate->addDays(20 + $index)->setTime(12, 0);
            $classification->deleted_at = $archiveDate;
            $classification->save();

            ActivityLog::create([
                'user_id' => $user->user_id,
                'user_name' => sprintf('%s %s', $user->first_name, $user->last_name),
                'user_role' => $user->role,
                'action' => 'ARCHIVE',
                'module' => 'Banyera',
                'details' => sprintf('Archived fish classification "%s".', $classification->classification_name),
                'severity' => 'warning',
            ]);
        });

    }
}
