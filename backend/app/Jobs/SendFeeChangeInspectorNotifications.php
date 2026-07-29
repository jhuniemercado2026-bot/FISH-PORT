<?php

namespace App\Jobs;

use App\Enums\FeeTypeName;
use App\Models\Fee;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendFeeChangeInspectorNotifications implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $feeId,
        public string $action,
        public ?int $senderUserId,
    ) {
    }

    public function handle(): void
    {
        $fee = Fee::with(['boatType', 'vehicleType'])->find($this->feeId);

        if (!$fee) {
            return;
        }

        $feeType = $this->getFeeTypeLabel($fee);
        $applicableTo = $this->formatFeeApplicableLabel($fee);
        $amount = 'PHP ' . number_format((float) $fee->amount, 2);
        $effectiveFrom = optional($fee->effective_from)->format('F j, Y') ?? 'the selected date';
        $effectiveTo = optional($fee->effective_to)->format('F j, Y');
        $effectivity = $effectiveTo
            ? $effectiveFrom . ' to ' . $effectiveTo
            : 'starting ' . $effectiveFrom;
        $title = $this->action === 'created' ? 'New fee set' : 'Fee updated';
        $message = $feeType . ' fee for ' . $applicableTo . ' has been set to ' . $amount . ', effective ' . $effectivity . '.';

        User::query()
            ->where('role', 'inspector')
            ->select('user_id')
            ->chunkById(100, function ($inspectors) use ($fee, $title, $message) {
                foreach ($inspectors as $inspector) {
                    Notification::create([
                        'title' => $title,
                        'message' => $message,
                        'recipient_user_id' => $inspector->user_id,
                        'sender_user_id' => $this->senderUserId,
                        'related_type' => 'fee',
                        'related_id' => $fee->fee_id,
                        'is_read' => false,
                    ]);
                }
            }, 'user_id');
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
