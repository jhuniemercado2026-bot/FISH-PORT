<?php

namespace App\Enums;

enum FeeTypeName: string
{
    case Banyera = 'Banyera';
    case Docking = 'Docking';
    case VehicleTicketDaily = 'Vehicle Ticket Daily';
    case VehicleTicketAnnual = 'Vehicle Ticket Annual';

    public static function values(): array
    {
        return array_map(
            static fn (self $case) => $case->value,
            self::cases()
        );
    }
}
