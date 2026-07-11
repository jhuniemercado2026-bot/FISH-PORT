<?php

namespace Database\Seeders;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Models\VehicleType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class VehicleTicketLoadTestSeeder extends Seeder
{
    private const VEHICLE_TYPE_COUNT = 10;
    private const YEAR_TARGETS = [
        2025 => 500,
        2026 => 1000,
    ];

    private const YEAR_DEADLINES = [
        2025 => '2025-07-01',
        2026 => '2026-07-01',
    ];

    private const DAILY_COUNTS = [
        2025 => 250,
        2026 => 500,
    ];

    private const ANNUAL_COUNTS = [
        2025 => 250,
        2026 => 500,
    ];

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'vehicle-ticket-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'inspector',
                'status' => 'active',
                'first_name' => 'Vehicle Ticket',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000002',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $vehicleTypes = collect(range(1, self::VEHICLE_TYPE_COUNT))->map(function (int $number) use ($user) {
            return VehicleType::firstOrCreate(
                ['type_name' => sprintf('Vehicle Ticket Load Type %02d', $number)],
                ['created_by' => $user->user_id]
            );
        })->values();

        $feesByYearAndType = collect(array_keys(self::YEAR_TARGETS))->mapWithKeys(function (int $year) use ($vehicleTypes, $user) {
            $effectiveFrom = "{$year}-01-01";

            return [
                $year => $vehicleTypes->mapWithKeys(function (VehicleType $vehicleType, int $index) use ($effectiveFrom, $user) {
                    $dailyFee = Fee::firstOrCreate(
                        [
                            'fee_type_name' => FeeTypeName::VehicleTicketDaily->value,
                            'boat_type_id' => null,
                            'vehicle_type_id' => $vehicleType->vehicle_type_id,
                            'effective_from' => $effectiveFrom,
                        ],
                        [
                            'amount' => 20 + ($index * 5),
                            'effective_to' => null,
                            'created_by' => $user->user_id,
                        ]
                    );

                    $annualFee = Fee::firstOrCreate(
                        [
                            'fee_type_name' => FeeTypeName::VehicleTicketAnnual->value,
                            'boat_type_id' => null,
                            'vehicle_type_id' => $vehicleType->vehicle_type_id,
                            'effective_from' => $effectiveFrom,
                        ],
                        [
                            'amount' => 500 + ($index * 25),
                            'effective_to' => null,
                            'created_by' => $user->user_id,
                        ]
                    );

                    return [
                        $vehicleType->vehicle_type_id => [
                            'daily' => $dailyFee,
                            'annual' => $annualFee,
                        ],
                    ];
                }),
            ];
        });

        VehicleTicket::query()
            ->where(function ($query) {
                $query->whereYear('ticket_date', 2025)
                    ->orWhereYear('ticket_date', 2026);
            })
            ->delete();

        $rows = [];
        $dailySequence = 0;
        $annualSequence = 0;

        foreach (self::YEAR_TARGETS as $year => $targetCount) {
            $dailyTarget = self::DAILY_COUNTS[$year];
            $annualTarget = self::ANNUAL_COUNTS[$year];
            $startDate = CarbonImmutable::parse("{$year}-01-01", 'Asia/Manila');
            $deadline = CarbonImmutable::parse(self::YEAR_DEADLINES[$year], 'Asia/Manila');
            $maxDays = $deadline->diffInDays($startDate);
            $feesByType = $feesByYearAndType[$year];

            for ($ticketIndex = 1; $ticketIndex <= $dailyTarget; $ticketIndex++) {
                $dailySequence++;
                $vehicleType = $vehicleTypes[($ticketIndex - 1) % $vehicleTypes->count()];
                $fee = $feesByType[$vehicleType->vehicle_type_id]['daily'];
                $banyeraFee = (($ticketIndex - 1) % 4) * 5;
                $ticketFee = (float) $fee->amount + $banyeraFee;
                $ticketDate = $startDate->addDays(($ticketIndex - 1) % ($maxDays + 1));

                $rows[] = [
                    'control_number' => null,
                    'official_receipt_no' => null,
                    'vehicle_type_id' => $vehicleType->vehicle_type_id,
                    'plate_number' => sprintf('DL-%d-%05d', $year, $dailySequence),
                    'driver_name' => sprintf('Daily Test %d', $dailySequence),
                    'ticket_type' => 'daily',
                    'fee_id' => $fee->fee_id,
                    'daily_fee' => (float) $fee->amount,
                    'banyera_fee' => (float) $banyeraFee,
                    'ticket_fee' => $ticketFee,
                    'ticket_date' => $ticketDate->toDateString(),
                    'end_date' => null,
                    'created_by' => $user->user_id,
                    'void_reason' => null,
                    'voided_at' => $dailySequence % 20 === 0 ? $ticketDate->setTime(15, 0)->toDateTimeString() : null,
                    'voided_by' => $dailySequence % 20 === 0 ? $user->user_id : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            for ($ticketIndex = 1; $ticketIndex <= $annualTarget; $ticketIndex++) {
                $annualSequence++;
                $vehicleType = $vehicleTypes[($ticketIndex - 1) % $vehicleTypes->count()];
                $fee = $feesByType[$vehicleType->vehicle_type_id]['annual'];
                $ticketDate = $startDate->addDays(($ticketIndex - 1) % ($maxDays + 1));

                $rows[] = [
                    'control_number' => sprintf('A%05d', $annualSequence),
                    'official_receipt_no' => sprintf('%06d', $annualSequence),
                    'vehicle_type_id' => $vehicleType->vehicle_type_id,
                    'plate_number' => sprintf('AN-%d-%05d', $year, $annualSequence),
                    'driver_name' => sprintf('Annual Test %d', $annualSequence),
                    'ticket_type' => 'annual',
                    'fee_id' => $fee->fee_id,
                    'daily_fee' => 0,
                    'banyera_fee' => 0,
                    'ticket_fee' => (float) $fee->amount,
                    'ticket_date' => $ticketDate->toDateString(),
                    'end_date' => $ticketDate->addYear()->subDay()->toDateString(),
                    'created_by' => $user->user_id,
                    'void_reason' => null,
                    'voided_at' => $annualSequence % 20 === 0 ? $ticketDate->setTime(15, 0)->toDateTimeString() : null,
                    'voided_by' => $annualSequence % 20 === 0 ? $user->user_id : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('vehicle_tickets')->insert($chunk);
        }
    }
}
