<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendInspectorRemittanceReminders extends Command
{
    protected $signature = 'remittances:send-inspector-reminders {--date= : Reminder date in YYYY-MM-DD format}';

    protected $description = 'Send daily remittance reminders to online inspectors with vehicle ticket collections.';

    public function handle(): int
    {
        $date = $this->reminderDate();
        $sentCount = 0;

        $collectorIds = VehicleTicket::query()
            ->whereDate('ticket_date', $date)
            ->whereNull('voided_at')
            ->whereNotNull('created_by')
            ->distinct()
            ->pluck('created_by')
            ->map(fn ($userId) => (int) $userId)
            ->filter()
            ->values();

        if ($collectorIds->isEmpty()) {
            $this->info('No vehicle ticket collections found for ' . $date . '.');

            return self::SUCCESS;
        }

        User::query()
            ->whereIn('user_id', $collectorIds)
            ->where('role', 'inspector')
            ->where('status', 'online')
            ->whereHas('tokens', function ($query) {
                $query->where(function ($tokenQuery) {
                    $tokenQuery
                        ->whereNull('expires_at')
                        ->orWhere('expires_at', '>', now());
                });
            })
            ->orderBy('user_id')
            ->chunkById(100, function ($inspectors) use ($date, &$sentCount) {
                foreach ($inspectors as $inspector) {
                    if ($this->hasSubmittedRemittance($inspector, $date)) {
                        continue;
                    }

                    $this->sendReminder($inspector, $date);
                    $sentCount++;
                }
            }, 'user_id');

        $this->info("Sent {$sentCount} inspector remittance reminder(s) for {$date}.");

        return self::SUCCESS;
    }

    private function reminderDate(): string
    {
        $date = trim((string) $this->option('date'));

        if ($date !== '') {
            return Carbon::parse($date, 'Asia/Manila')->toDateString();
        }

        return now('Asia/Manila')->toDateString();
    }

    private function hasSubmittedRemittance(User $inspector, string $date): bool
    {
        return Remittance::query()
            ->whereDate('date', $date)
            ->where('submitted_by', $inspector->user_id)
            ->exists();
    }

    private function sendReminder(User $inspector, string $date): void
    {
        $amount = (float) VehicleTicket::query()
            ->whereDate('ticket_date', $date)
            ->where('created_by', $inspector->user_id)
            ->whereNull('voided_at')
            ->sum('ticket_fee');

        $displayDate = Carbon::parse($date, 'Asia/Manila')->format('F j, Y');
        $message = 'You have vehicle ticket collections for ' . $displayDate .
            ' totaling ₱' . number_format($amount, 2) .
            '. Please submit your remittance.';

        $notification = Notification::query()
            ->where('recipient_user_id', $inspector->user_id)
            ->where('related_type', 'remittance_reminder')
            ->where('related_id', $inspector->user_id)
            ->where('title', 'Remittance reminder')
            ->whereDate('created_at', $date)
            ->first();

        if (!$notification) {
            $notification = new Notification([
                'recipient_user_id' => $inspector->user_id,
                'related_type' => 'remittance_reminder',
                'related_id' => $inspector->user_id,
                'title' => 'Remittance reminder',
            ]);
        }

        $notification->fill([
            'message' => $message,
            'sender_user_id' => null,
            'is_read' => false,
            'read_at' => null,
        ]);

        $notification->save();
    }
}
