<?php

namespace App\Jobs;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendExistingFeeNotificationsToAccount implements ShouldQueue
{
    use Queueable;

    private const RECIPIENT_ROLES = ['coordinator', 'inspector'];

    public function __construct(
        public int $recipientUserId,
        public ?int $senderUserId,
    ) {
    }

    public function handle(): void
    {
        $recipient = User::query()
            ->where('user_id', $this->recipientUserId)
            ->whereIn('role', self::RECIPIENT_ROLES)
            ->first(['user_id']);

        if (!$recipient) {
            return;
        }

        Fee::query()
            ->with(['boatType', 'vehicleType'])
            ->select([
                'fee_id',
                'fee_type_name',
                'boat_type_id',
                'vehicle_type_id',
                'amount',
                'effective_from',
                'effective_to',
            ])
            ->orderBy('fee_id')
            ->chunkById(100, function ($fees) use ($recipient) {
                foreach ($fees as $fee) {
                    Notification::firstOrCreate(
                        [
                            'recipient_user_id' => $recipient->user_id,
                            'related_type' => 'fee',
                            'related_id' => $fee->fee_id,
                            'title' => 'Fee Reference',
                        ],
                        [
                            'message' => $this->messageForFee($fee),
                            'sender_user_id' => $this->senderUserId,
                            'is_read' => false,
                        ]
                    );
                }
            }, 'fee_id');
    }

    private function messageForFee(Fee $fee): string
    {
        $feeType = $this->getFeeTypeLabel($fee);
        $applicableTo = $this->formatFeeApplicableLabel($fee);
        $amount = '₱' . number_format((float) $fee->amount, 2);
        $effectiveFrom = optional($fee->effective_from)->format('F j, Y') ?? 'the selected date';
        $effectiveTo = optional($fee->effective_to)->format('F j, Y');
        $effectivity = $effectiveTo
            ? $effectiveFrom . ' to ' . $effectiveTo
            : 'starting ' . $effectiveFrom;

        return $feeType . ' fee for ' . $applicableTo . ' is set to ' . $amount . ', effective ' . $effectivity . '.';
    }

    private function getFeeTypeLabel(Fee $fee): string
    {
        $feeTypeName = $fee->getAttribute('fee_type_name');

        if ($feeTypeName instanceof FeeTypeName) {
            return $feeTypeName->value;
        }

        return $fee->fee_name ?? ((string) $feeTypeName ?: 'Unknown Fee');
    }

    private function formatFeeApplicableLabel(Fee $fee): string
    {
        if ($fee->vehicleType?->type_name) {
            return $fee->vehicleType->type_name;
        }

        if ($fee->boatType?->type_name) {
            return $fee->boatType->type_name;
        }

        return 'General';
    }
}
