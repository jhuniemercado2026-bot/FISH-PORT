<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('database:backup-google-drive')
    ->dailyAt(config('backup.database.schedule_time', '22:00'))
    ->timezone(config('app.timezone', 'UTC'))
    ->withoutOverlapping();

Schedule::command('remittances:send-inspector-reminders')
    ->dailyAt('13:30')
    ->timezone(config('app.timezone', 'Asia/Manila'))
    ->withoutOverlapping();
