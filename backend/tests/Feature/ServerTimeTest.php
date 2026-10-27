<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Tests\TestCase;

class ServerTimeTest extends TestCase
{
    public function test_server_clock_returns_uncached_manila_time_without_authentication(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-23T17:30:00.250Z'));

        try {
            $response = $this->getJson('/api/server-time');

            $response->assertOk()
                ->assertJsonPath('timezone', 'Asia/Manila')
                ->assertJsonPath('server_time', '2026-10-24T01:30:00+08:00')
                ->assertJsonPath('timestamp_ms', Carbon::now('UTC')->getTimestampMs());
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_server_clock_epoch_does_not_depend_on_application_timezone(): void
    {
        config(['app.timezone' => 'UTC']);
        Carbon::setTestNow(Carbon::parse('2026-12-31T16:00:00Z'));

        try {
            $this->getJson('/api/server-time')->assertOk()
                ->assertJsonPath('server_time', '2027-01-01T00:00:00+08:00')
                ->assertJsonPath('timestamp_ms', Carbon::now('UTC')->getTimestampMs());
        } finally {
            Carbon::setTestNow();
        }
    }
}
