<?php

namespace Database\Seeders;

use App\Models\Notification;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class NotificationLoadTestSeeder extends Seeder
{
    private const YEAR_TARGETS = [
        2026 => 100,
    ];

    public function run(): void
    {
        if (!Schema::hasTable('notifications')) {
            return;
        }

        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'notification-load-test@example.com'],
            [
                'password' => bcrypt('password'),
                'role' => 'inspector',
                'status' => 'active',
                'first_name' => 'Notification',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000000',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        // Use the requested head account as recipient so the frontend can display the seeded notifications.
        $recipientUsers = User::query()
            ->where('email', 'headofmeeo.opol@gmail.com')
            ->pluck('user_id')
            ->toArray();

        if (empty($recipientUsers)) {
            $recipientUsers = [$user->user_id];
        }

        // Delete existing load test notifications
        $existingNotificationIds = Notification::query()
            ->where('title', 'like', 'Notification Load Test %')
            ->pluck('notification_id');

        if ($existingNotificationIds->isNotEmpty()) {
            Notification::query()->whereIn('notification_id', $existingNotificationIds)->delete();
        }

        $rows = [];

        foreach (self::YEAR_TARGETS as $year => $targetCount) {
            $startDate = CarbonImmutable::parse("{$year}-01-01", 'Asia/Manila');

            foreach (range(0, $targetCount - 1) as $recordIndex) {
                $dayOffset = intdiv($recordIndex, 10);
                $date = $startDate->addDays($dayOffset);
                $notificationNumber = $recordIndex + 1;

                $relatedTypes = ['user', 'account', 'system'];
                $relatedType = $relatedTypes[$recordIndex % count($relatedTypes)];
                $isRead = $recordIndex % 3 === 0; // Every 3rd notification is read
                $readAt = $isRead ? $date->addHours(rand(1, 24))->toDateTimeString() : null;

                $recipientUserId = $recipientUsers[$recordIndex % count($recipientUsers)];

                $rows[] = [
                    'title' => sprintf('Notification Load Test %04d', $notificationNumber),
                    'message' => sprintf('This is a load test notification number %04d for testing purposes.', $notificationNumber),
                    'recipient_user_id' => $recipientUserId,
                    'sender_user_id' => $user->user_id,
                    'related_type' => $relatedType,
                    'related_id' => $notificationNumber,
                    'is_read' => $isRead,
                    'read_at' => $readAt,
                    'created_at' => $date->toDateTimeString(),
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('notifications')->insert($chunk);
        }
    }
}
