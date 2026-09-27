<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\Boat;
use App\Models\BoatOwner;
use App\Models\BoatType;
use App\Models\Fee;
use App\Models\User;
use App\Models\VehicleType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SeedersFor2025 extends Seeder
{
    public function run(): void
    {
        $headUser = User::updateOrCreate(
            ['email' => 'headofmeeo.opol@gmail.com'],
            [
                'first_name' => 'Jhunie',
                'last_name' => 'Mercado',
                'password' => Hash::make('Password@123'),
                'role' => 'head',
                'status' => 'offline',
            ]
        );

        $boatTypeNames = ['Hapa-Hapa', 'Lantsa', 'Pamboat', 'Yacht'];
        $boatTypeMap = [];

        foreach ($boatTypeNames as $boatTypeName) {
            $boatTypeMap[$boatTypeName] = BoatType::updateOrCreate(
                ['type_name' => $boatTypeName],
                ['created_by' => $headUser->user_id]
            );
        }

        $boatNames = [
            'MV Sagrada Familia',
            'FB Don Bosco',
            'MV Santa Clarita',
            'FB Bantayan',
            'MV Sea Breeze',
            'FB Kalinaw',
            'MV Ocean Pearl',
            'FB Bangkero',
            'MV San Nicolas',
            'FB Malinawon',
        ];

        $vehicleTypeNames = ['motorcycle', 'tricab', 'van', 'multicab', 'jeep'];
        $vehicleTypeMap = [];

        foreach ($vehicleTypeNames as $vehicleTypeName) {
            $vehicleTypeMap[$vehicleTypeName] = VehicleType::updateOrCreate(
                ['type_name' => $vehicleTypeName],
                ['created_by' => $headUser->user_id]
            );
        }

        $boatEntries = [];
        foreach ($boatNames as $index => $boatName) {
            $owner = BoatOwner::updateOrCreate(
                [
                    'owner_firstname' => 'Owner',
                    'owner_lastname' => 'Boat ' . ($index + 1),
                ],
                [
                    'address' => 'Opol Fish Port',
                    'contact_number' => '0900000' . str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                    'created_by' => $headUser->user_id,
                ]
            );

            $boatType = $boatTypeMap[$boatTypeNames[$index % count($boatTypeNames)]];

            $boatEntries[] = [
                'boat_name' => $boatName,
                'owner_id' => $owner->owner_id,
                'boat_type_id' => $boatType->boat_type_id,
                'status' => 'active',
                'created_by' => $headUser->user_id,
            ];
        }

        $createdBoats = [];
        foreach ($boatEntries as $boatEntry) {
            $boat = Boat::updateOrCreate(
                ['boat_name' => $boatEntry['boat_name']],
                [
                    'owner_id' => $boatEntry['owner_id'],
                    'boat_type_id' => $boatEntry['boat_type_id'],
                    'status' => $boatEntry['status'],
                    'created_by' => $boatEntry['created_by'],
                ]
            );

            $createdBoats[] = $boat;
        }

        $dockingFee = Fee::updateOrCreate(
            [
                'fee_type_name' => FeeTypeName::Docking->value,
                'boat_type_id' => $boatTypeMap['Hapa-Hapa']->boat_type_id,
                'vehicle_type_id' => null,
                'effective_from' => '2025-01-01',
            ],
            [
                'amount' => 20.00,
                'effective_to' => null,
                'created_by' => $headUser->user_id,
            ]
        );

        $banyeraFee = Fee::updateOrCreate(
            [
                'fee_type_name' => FeeTypeName::Banyera->value,
                'boat_type_id' => $boatTypeMap['Hapa-Hapa']->boat_type_id,
                'vehicle_type_id' => null,
                'effective_from' => '2025-01-01',
            ],
            [
                'amount' => 20.00,
                'effective_to' => null,
                'created_by' => $headUser->user_id,
            ]
        );

        $ticketFee = Fee::updateOrCreate(
            [
                'fee_type_name' => FeeTypeName::VehicleTicketDaily->value,
                'boat_type_id' => null,
                'vehicle_type_id' => $vehicleTypeMap['motorcycle']->vehicle_type_id,
                'effective_from' => '2025-01-01',
            ],
            [
                'amount' => 20.00,
                'effective_to' => null,
                'created_by' => $headUser->user_id,
            ]
        );

        $this->seedDockings($createdBoats, $dockingFee->fee_id, $headUser->user_id);
        $this->seedBanyeraTransactions($createdBoats, $banyeraFee->fee_id, $headUser->user_id);
        $this->seedVehicleTickets($vehicleTypeMap, $ticketFee->fee_id, $headUser->user_id);
    }

    private function seedDockings(array $boats, int $feeId, int $createdBy): void
    {
        $now = now();
        $baseDate = CarbonImmutable::create(2025, 1, 1, 7, 0, 0, 'Asia/Manila');
        $rows = [];
        $total = 10000;

        for ($i = 0; $i < $total; $i++) {
            $boat = $boats[$i % count($boats)];
            $date = $baseDate
                ->addDays($i % 365)
                ->addHours(($i * 7) % 24)
                ->addMinutes(($i * 11) % 60);

            $rows[] = [
                'boat_id' => $boat->boat_id,
                'fee_id' => $feeId,
                'docking_date' => $date->toDateTimeString(),
                'docking_fee' => 20.00,
                'created_by' => $createdBy,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) >= 500) {
                DB::table('dockings')->insert($rows);
                $rows = [];
            }
        }

        if ($rows) {
            DB::table('dockings')->insert($rows);
        }
    }

    private function seedBanyeraTransactions(array $boats, int $feeId, int $createdBy): void
    {
        $now = now();
        $baseDate = CarbonImmutable::create(2025, 1, 1, 6, 0, 0, 'Asia/Manila');
        $rows = [];
        $total = 10000;

        for ($i = 0; $i < $total; $i++) {
            $boat = $boats[$i % count($boats)];
            $date = $baseDate
                ->addDays($i % 365)
                ->addHours(($i * 5) % 24)
                ->addMinutes(($i * 13) % 60);

            $rows[] = [
                'boat_id' => $boat->boat_id,
                'transaction_date' => $date->toDateTimeString(),
                'total_fee' => 20.00,
                'created_by' => $createdBy,
                'void_reason' => null,
                'voided_at' => null,
                'voided_by' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) >= 500) {
                DB::table('banyera_transactions')->insert($rows);
                $rows = [];
            }
        }

        if ($rows) {
            DB::table('banyera_transactions')->insert($rows);
        }
    }

    private function seedVehicleTickets(array $vehicleTypeMap, int $feeId, int $createdBy): void
    {
        $now = now();
        $baseDate = CarbonImmutable::create(2025, 1, 1, 9, 0, 0, 'Asia/Manila');
        $vehicleTypes = array_values($vehicleTypeMap);
        $rows = [];
        $total = 10000;

        for ($i = 0; $i < $total; $i++) {
            $vehicleType = $vehicleTypes[$i % count($vehicleTypes)];
            $date = $baseDate
                ->addDays($i % 365)
                ->addHours(($i * 3) % 24)
                ->addMinutes(($i * 17) % 60);

            $rows[] = [
                'control_number' => sprintf('%06d', $i + 1),
                'official_receipt_no' => sprintf('%07d', $i + 1),
                'vehicle_type_id' => $vehicleType->vehicle_type_id,
                'plate_number' => '2025-' . str_pad((string) ($i + 1), 6, '0', STR_PAD_LEFT),
                'driver_name' => 'John Doe',
                'ticket_type' => 'daily',
                'fee_id' => $feeId,
                'daily_fee' => 20.00,
                'banyera_fee' => 0.00,
                'ticket_fee' => 20.00,
                'ticket_date' => $date->toDateTimeString(),
                'end_date' => null,
                'created_by' => $createdBy,
                'void_reason' => null,
                'voided_at' => null,
                'voided_by' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) >= 500) {
                DB::table('vehicle_tickets')->insert($rows);
                $rows = [];
            }
        }

        if ($rows) {
            DB::table('vehicle_tickets')->insert($rows);
        }
    }
}
