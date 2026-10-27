<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \App\Models\Docking::observe(\App\Observers\VisitingBoatObserver::class);
        \App\Models\BanyeraTransaction::observe(\App\Observers\VisitingBoatObserver::class);
    }
}
