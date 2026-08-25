<?php

namespace App\Services;

use App\Models\BanyeraTransaction;
use App\Models\Docking;
use App\Models\Notification;
use App\Models\VehicleTicket;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class VoidRequestNotificationService
{
    public function notifyRequester(string $transactionType, Model $record): void
    {
        $relatedType = $this->relatedType($transactionType, $record);
        $relatedId = $this->recordId($transactionType, $record);

        if (!$relatedType || !$relatedId) {
            return;
        }

        $requestNotification = Notification::query()
            ->where('related_type', $relatedType)
            ->where('related_id', $relatedId)
            ->whereNotNull('sender_user_id')
            ->latest('created_at')
            ->latest('notification_id')
            ->first();

        $requesterId = (int) ($requestNotification?->sender_user_id ?? 0);

        if ($requesterId <= 0 || $requesterId === (int) Auth::id()) {
            return;
        }

        Notification::create([
            'title' => 'Void request completed',
            'message' => $this->completedMessage($transactionType, $record),
            'recipient_user_id' => $requesterId,
            'sender_user_id' => Auth::id(),
            'related_type' => $relatedType,
            'related_id' => $relatedId,
            'is_read' => false,
        ]);
    }

    private function relatedType(string $transactionType, Model $record): ?string
    {
        if ($transactionType === 'tickets') {
            $ticketType = strtolower((string) $record->getAttribute('ticket_type'));

            return $ticketType === 'annual' ? 'void_request_annual_ticket' : 'void_request_daily_ticket';
        }

        return match ($transactionType) {
            'docking' => 'void_request_docking',
            'banyera' => 'void_request_banyera',
            default => null,
        };
    }

    private function recordId(string $transactionType, Model $record): ?int
    {
        $id = match ($transactionType) {
            'docking' => $record->getAttribute('docking_id'),
            'banyera' => $record->getAttribute('banyera_id'),
            'tickets' => $record->getAttribute('ticket_id'),
            default => $record->getKey(),
        };

        return $id ? (int) $id : null;
    }

    private function completedMessage(string $transactionType, Model $record): string
    {
        if ($transactionType === 'docking' && $record instanceof Docking) {
            $record->loadMissing('boat');
            $boatName = (string) ($record->boat?->boat_name ?? '');

            return 'Your request to void docking records, boat "' . $boatName . '", with fee "'
                . $this->formatMoney($record->docking_fee) . '" has been approved and voided.';
        }

        return 'Your request to void ' . $this->recordLabel($transactionType, $record) . ' has been approved and voided.';
    }

    private function formatMoney(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        return '₱' . number_format((float) $value, 2);
    }

    private function recordLabel(string $transactionType, Model $record): string
    {
        if ($transactionType === 'docking' && $record instanceof Docking) {
            $boatName = $record->boat?->boat_name;

            return 'docking record #' . $record->docking_id . ($boatName ? ' for boat "' . $boatName . '"' : '');
        }

        if ($transactionType === 'banyera' && $record instanceof BanyeraTransaction) {
            $boatName = $record->boat?->boat_name;

            return 'banyera transaction #' . $record->banyera_id . ($boatName ? ' for boat "' . $boatName . '"' : '');
        }

        if ($transactionType === 'tickets' && $record instanceof VehicleTicket) {
            $vehicleType = $record->vehicleType?->type_name;
            $plateNumber = trim((string) $record->plate_number);

            return strtolower((string) $record->ticket_type) . ' vehicle ticket #' . $record->ticket_id
                . ($plateNumber !== '' ? ' for plate "' . $plateNumber . '"' : '')
                . ($vehicleType ? ' (' . $vehicleType . ')' : '');
        }

        return 'transaction #' . ($record->getKey() ?? 'N/A');
    }
}
