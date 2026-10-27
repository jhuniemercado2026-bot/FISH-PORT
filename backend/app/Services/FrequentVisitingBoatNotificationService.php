<?php

namespace App\Services;

use App\Models\BanyeraTransaction;
use App\Models\Boat;
use App\Models\Docking;
use App\Models\Notification;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class FrequentVisitingBoatNotificationService
{
    private const THRESHOLD = 3;

    public function forVisit(Docking|BanyeraTransaction $visit, ?User $recipient = null): void
    {
        if ($visit->boat_category !== 'visiting' || $visit->voided_at || $visit->boat_id) return;
        $name = trim((string) $visit->visiting_boat_name);
        if ($name === '') return;
        $normalizedName = mb_strtolower($name);
        // Boat names are unique across the registration list, including archived boats.
        if (Boat::withTrashed()->whereRaw('LOWER(TRIM(boat_name)) = ?', [$normalizedName])->exists()) return;

        $isDocking = $visit instanceof Docking;
        $service = $isDocking ? 'docking' : 'banyera';
        $dateColumn = $isDocking ? 'docking_date' : 'transaction_date';
        $date = CarbonImmutable::parse($visit->getAttribute($dateColumn), 'Asia/Manila');
        $query = $this->monthQuery($visit, $dateColumn, $date)
            ->whereRaw('LOWER(TRIM(visiting_boat_name)) = ?', [$normalizedName])
            ->where('visiting_boat_type_id', $visit->visiting_boat_type_id);
        $count = (clone $query)->selectRaw("COUNT(DISTINCT DATE({$dateColumn})) AS visits")->value('visits');
        if ((int) $count < self::THRESHOLD) return;

        $key = 'frequent-visit:' . $service . ':' . $date->format('Y-m') . ':'
            . hash('sha256', $normalizedName . ':' . $visit->visiting_boat_type_id);
        $recipients = User::query()->where('role', 'coordinator')->where('status', '!=', 'deactivated')
            ->when($recipient, fn ($q) => $q->whereKey($recipient->getKey()))->get();
        foreach ($recipients as $coordinator) {
            Notification::firstOrCreate([
                'recipient_user_id' => $coordinator->getKey(),
                'deduplication_key' => $key,
            ], [
                'sender_user_id' => null,
                'title' => 'Frequent Visiting Boat — ' . ucfirst($service),
                'message' => $name . ' has frequently visited the fish port for ' . $service
                    . ' (' . $count . ' visits in ' . $date->format('F Y') . '). Would you like to register this boat?',
                'related_type' => 'frequent_visiting_' . $service,
                'related_id' => $visit->getKey(),
                'is_read' => false,
            ]);
        }
    }

    /** Include boats that reached the threshold before this feature was installed. */
    public function syncForCoordinator(User $user): void
    {
        if ($user->role !== 'coordinator' || $user->status === 'deactivated') return;
        foreach ([new Docking(), new BanyeraTransaction()] as $model) {
            $dateColumn = $model instanceof Docking ? 'docking_date' : 'transaction_date';
            $ids = $this->monthQuery($model, $dateColumn, CarbonImmutable::now('Asia/Manila'))
                ->selectRaw('MIN(' . $model->getKeyName() . ') AS visit_id')
                ->groupByRaw('LOWER(TRIM(visiting_boat_name)), visiting_boat_type_id')
                ->havingRaw("COUNT(DISTINCT DATE({$dateColumn})) >= ?", [self::THRESHOLD])
                ->pluck('visit_id');
            foreach ($model->newQuery()->whereKey($ids)->get() as $visit) {
                $this->forVisit($visit, $user);
            }
        }
    }

    private function monthQuery(Docking|BanyeraTransaction $model, string $dateColumn, CarbonImmutable $date): Builder
    {
        $now = CarbonImmutable::now('Asia/Manila');
        return $model->newQuery()->where('boat_category', 'visiting')->whereNull('boat_id')->whereNull('voided_at')
            ->where($dateColumn, '>=', $date->startOfMonth())
            ->where($dateColumn, '<', $date->startOfMonth()->addMonth())
            ->where($dateColumn, '<=', $now);
    }
}
