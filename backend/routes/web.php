<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/hostinger-cron/schedule-run', function (Request $request) {
    $configuredToken = (string) config('services.hostinger_cron.token');
    $requestToken = (string) $request->query('token', '');

    if ($configuredToken === '' || ! hash_equals($configuredToken, $requestToken)) {
        abort(404);
    }

    Artisan::call('schedule:run');

    return response()->json([
        'ok' => true,
        'output' => trim(Artisan::output()),
    ]);
});
