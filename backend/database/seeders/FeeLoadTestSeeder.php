<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\BoatType;
use App\Models\Fee;
use App\Models\User;
use App\Models\VehicleType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class FeeLoadTestSeeder extends Seeder
{
    private const FEE_COUNT = 110;
    private const VEHICLE_TYPE_NAMES = [
        'Tricab',
        'Rela',
        'Motorcycle',
        'Multicab',
        'Private Car',
        'Van',
        'Pickup',
        'Truck',
        'Delivery Van',
        'Tricycle',
    ];

    private static function startDate(): string
    {
        return CarbonImmutable::now('Asia/Manila')->startOfYear()->toDateString();
    }

    public function run(): void
    {
        $now = now();
        $startDateValue = self::startDate();

        $user = User::firstOrCreate(
            ['email' => 'fee-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'head',
                'status' => 'offline',
                'first_name' => 'Fee',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000005',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $boatTypes = BoatType::query()
            ->where('type_name', 'like', 'Type Test %')
            ->orderBy('boat_type_id')
            ->get();

        if ($boatTypes->isEmpty()) {
            throw new \RuntimeException('Expected current boat type seed data to exist before seeding fees.');
        }

        $vehicleTypes = collect(self::VEHICLE_TYPE_NAMES)->map(function (string $typeName, int $index) use ($user) {
            $oldTypeName = sprintf('Vehicle Ticket Load Type %02d', $index + 1);
            $vehicleType = VehicleType::withTrashed()->where('type_name', $typeName)->first();

            if (!$vehicleType) {
                $vehicleType = VehicleType::withTrashed()->where('type_name', $oldTypeName)->first();

                if ($vehicleType) {
                    $vehicleType->type_name = $typeName;
                    $vehicleType->save();
                }
            }

            if (!$vehicleType) {
                $vehicleType = VehicleType::create([
                    'type_name' => $typeName,
                    'created_by' => $user->user_id,
                ]);
            }

            if ($vehicleType->trashed()) {
                $vehicleType->restore();
            }

            return $vehicleType;
        })->values();

        $feeIds = Fee::query()
            ->where('created_by', $user->user_id)
            ->pluck('fee_id');

        if ($feeIds->isNotEmpty()) {
            DB::table('vehicle_tickets')->whereIn('fee_id', $feeIds)->delete();
            Fee::query()->whereIn('fee_id', $feeIds)->forceDelete();
        }

        $startDate = CarbonImmutable::parse($startDateValue, 'Asia/Manila');
        $rows = [];

        foreach (range(1, self::FEE_COUNT) as $sequence) {
            $effectiveFrom = $startDate->addDays(intdiv($sequence - 1, 10) * 30);
            $effectiveTo = $effectiveFrom->addDays(29);
            $boatTypeId = null;
            $vehicleTypeId = null;
            $feeType = FeeTypeName::Docking;
            $amount = 100 + (($sequence - 1) * 5);

            if ($sequence > 50) {
                $feeType = $sequence % 2 === 1 ? FeeTypeName::VehicleTicketDaily : FeeTypeName::VehicleTicketAnnual;
                $vehicleTypeId = $vehicleTypes[(($sequence - 51) % $vehicleTypes->count())]->vehicle_type_id;
                $amount = $feeType === FeeTypeName::VehicleTicketDaily
                    ? 25 + ((($sequence - 51) % 10) * 5)
                    : 550 + ((($sequence - 51) % 10) * 25);
            } else {
                $boatTypeId = $boatTypes[($sequence - 1) % $boatTypes->count()]->boat_type_id;
            }

            $rows[] = [
                'fee_type_name' => $feeType->value,
                'boat_type_id' => $boatTypeId,
                'vehicle_type_id' => $vehicleTypeId,
                'amount' => $amount,
                'effective_from' => $effectiveFrom->toDateString(),
                'effective_to' => $effectiveTo->toDateString(),
                'created_by' => $user->user_id,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('fees')->insert($chunk);
        }
    }
}
