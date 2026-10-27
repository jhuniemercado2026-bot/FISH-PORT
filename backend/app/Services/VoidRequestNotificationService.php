<?php

namespace App\Services;

use App\Models\Notification;
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
            ->where('recipient_user_id', Auth::id())
            ->where('title', 'Void Request')
            ->whereNotNull('sender_user_id')
            ->latest('created_at')
            ->latest('notification_id')
            ->first();

        $requesterId = (int) ($requestNotification?->sender_user_id ?? 0);

        if ($requesterId <= 0 || $requesterId === (int) Auth::id()) {
            return;
        }

        Notification::create([
            'title' => 'Void Request Approved',
            'message' => $this->completedMessage($requestNotification),
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

    private function completedMessage(Notification $requestNotification): string
    {
        $originalMessage = trim((string) $requestNotification->message);
        $requestPrefix = ', requested to void ';
        $prefixPosition = strpos($originalMessage, $requestPrefix);
        $requestDetails = $prefixPosition === false
            ? 'Your request to void the ' . $originalMessage
            : 'Your request to void the ' . substr($originalMessage, $prefixPosition + strlen($requestPrefix));

        $reasonDelimiter = '. Reason: ';
        $reasonPosition = strpos($requestDetails, $reasonDelimiter);
        if ($reasonPosition === false) {
            return rtrim($requestDetails, '.') . ' has been approved by the Coordinator.';
        }

        $transactionDetails = substr($requestDetails, 0, $reasonPosition);
        $reason = trim(substr($requestDetails, $reasonPosition + strlen($reasonDelimiter)));

        return rtrim($transactionDetails, '.')
            . ' has been approved by the Coordinator. Reason: '
            . rtrim($reason, '.');
    }
}
