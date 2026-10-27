<?php

namespace App\Observers;

use App\Models\BanyeraTransaction;
use App\Models\Docking;
use App\Services\FrequentVisitingBoatNotificationService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class VisitingBoatObserver implements ShouldHandleEventsAfterCommit
{
    public function saved(Docking|BanyeraTransaction $visit): void
    {
        if (!$visit->wasRecentlyCreated && !$visit->wasChanged([
            'boat_category', 'boat_id', 'visiting_boat_name', 'visiting_boat_type_id',
            'docking_date', 'transaction_date', 'voided_at',
        ])) return;

        try {
            app(FrequentVisitingBoatNotificationService::class)->forVisit($visit);
        } catch (\Throwable $error) {
            // A notification failure must not make a saved transaction look failed.
            // The coordinator's next notification refresh reconciles missed alerts.
            report($error);
        }
    }
}
