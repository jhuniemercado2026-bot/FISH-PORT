<?php

namespace Tests\Feature;

use App\Events\NotificationUpdated;
use App\Http\Controllers\NotificationController;
use App\Models\BanyeraTransaction;
use App\Models\Boat;
use App\Models\Docking;
use App\Models\Notification;
use App\Models\User;
use App\Services\FrequentVisitingBoatNotificationService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class FrequentVisitingBoatNotificationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'visit_test', 'database.connections.visit_test' => [
            'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '',
        ]]);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-27 12:00:00', 'Asia/Manila'));
        Event::fake([NotificationUpdated::class]);
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('first_name')->default('Test');
            $table->string('last_name')->default('User');
            $table->string('role');
            $table->string('status');
            $table->timestamps();
        });
        Schema::create('boats', function (Blueprint $table) {
            $table->id('boat_id');
            $table->string('boat_name');
            $table->softDeletes();
            $table->timestamps();
        });
        foreach (['dockings' => 'docking_id', 'banyera_transactions' => 'banyera_id'] as $name => $id) {
            Schema::create($name, function (Blueprint $table) use ($id, $name) {
                $table->id($id);
                $table->string('boat_category')->default('visiting');
                $table->unsignedBigInteger('boat_id')->nullable();
                $table->string('visiting_boat_name');
                $table->unsignedBigInteger('visiting_boat_type_id')->default(1);
                $table->dateTime($name === 'dockings' ? 'docking_date' : 'transaction_date');
                $table->dateTime('voided_at')->nullable();
                $table->timestamps();
            });
        }
        $migration = glob(database_path('migrations/*create_notifications_table.php'))[0];
        (require $migration)->up();
        (require database_path('migrations/2026_10_27_000001_add_notification_deduplication_key.php'))->up();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        DB::purge('visit_test');
        parent::tearDown();
    }

    private function user(string $role = 'coordinator', string $status = 'offline'): User
    {
        return User::create(['role' => $role, 'status' => $status]);
    }

    private function visit(string $service, string $date, array $extra = []): Docking|BanyeraTransaction
    {
        $model = $service === 'docking' ? new Docking() : new BanyeraTransaction();
        $dateColumn = $service === 'docking' ? 'docking_date' : 'transaction_date';
        return $model->newQuery()->create(array_merge([
            'boat_category' => 'visiting', 'boat_id' => null, 'visiting_boat_name' => 'SEA STAR',
            'visiting_boat_type_id' => 1, $dateColumn => $date . ' 09:00:00',
        ], $extra));
    }

    public function test_third_visit_notifies_only_active_coordinators_and_services_are_separate(): void
    {
        $coordinator = $this->user();
        $secondCoordinator = $this->user('coordinator', 'online');
        $this->user('head');
        $this->user('inspector');
        $this->user('coordinator', 'deactivated');
        $this->visit('docking', '2026-10-01');
        $this->visit('docking', '2026-10-02');
        $this->visit('banyera', '2026-10-01');
        $this->assertDatabaseCount('notifications', 0);
        $third = $this->visit('docking', '2026-10-03');
        $this->assertDatabaseCount('notifications', 2);
        $this->assertEqualsCanonicalizing([$coordinator->getKey(), $secondCoordinator->getKey()], Notification::pluck('recipient_user_id')->all());
        $notice = Notification::first();
        $this->assertSame('frequent_visiting_docking', $notice->related_type);
        $this->assertSame($third->getKey(), $notice->related_id);
        $this->assertSame('SEA STAR has frequently visited the fish port for docking (3 visits in October 2026). Would you like to register this boat?', $notice->message);
        $this->visit('banyera', '2026-10-02');
        $this->visit('banyera', '2026-10-03');
        $this->assertSame(2, Notification::where('related_type', 'frequent_visiting_banyera')->count());
        Event::assertDispatchedTimes(NotificationUpdated::class, 4);
    }

    public function test_same_month_does_not_repeat_even_after_read_and_next_month_resets(): void
    {
        $coordinator = $this->user();
        foreach ([1, 2, 3] as $day) $this->visit('docking', sprintf('2026-10-%02d', $day));
        Notification::first()->update(['is_read' => true, 'read_at' => now()]);
        $this->visit('docking', '2026-10-04', ['visiting_boat_name' => ' sea star ']);
        app(FrequentVisitingBoatNotificationService::class)->syncForCoordinator($coordinator);
        $this->assertDatabaseCount('notifications', 1);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-20 12:00:00', 'Asia/Manila'));
        foreach ([1, 2] as $day) $this->visit('docking', sprintf('2026-11-%02d', $day));
        $this->assertDatabaseCount('notifications', 1);
        $this->visit('docking', '2026-11-03');
        $this->assertDatabaseCount('notifications', 2);
        $this->assertStringContainsString('November 2026', Notification::latest('notification_id')->first()->message);
    }

    public function test_voided_same_day_other_boat_types_and_future_visits_do_not_inflate_count(): void
    {
        $this->user();
        $this->visit('docking', '2026-10-01');
        $this->visit('docking', '2026-10-01');
        $this->visit('docking', '2026-10-02', ['voided_at' => now()]);
        $this->visit('docking', '2026-10-03', ['visiting_boat_type_id' => 2]);
        $this->visit('docking', '2026-10-30');
        $this->visit('docking', '2026-09-30');
        $this->visit('docking', '2026-10-04', ['visiting_boat_name' => 'OTHER BOAT']);
        $this->assertDatabaseCount('notifications', 0);
        $this->visit('docking', '2026-10-05');
        $this->visit('docking', '2026-10-06');
        $this->assertDatabaseCount('notifications', 1);
    }

    public function test_registered_boats_do_not_generate_registration_prompts(): void
    {
        $this->user();
        Boat::create(['boat_name' => 'sea star']);
        foreach ([1, 2, 3] as $day) $this->visit('banyera', sprintf('2026-10-%02d', $day));
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_existing_visits_are_reconciled_when_coordinator_reads_notifications(): void
    {
        $coordinator = $this->user();
        Docking::withoutEvents(function (): void {
            foreach ([1, 2, 3] as $day) $this->visit('docking', sprintf('2026-10-%02d', $day));
        });
        $this->assertDatabaseCount('notifications', 0);
        $this->actingAs($coordinator);
        $controller = new NotificationController();
        $summary = $controller->summary(Request::create('/api/notifications/summary'))->getData(true);
        $this->assertSame(1, $summary['unread_count']);
        $controller->index(Request::create('/api/notifications'));
        $this->assertDatabaseCount('notifications', 1);
    }

    public function test_rolled_back_visit_does_not_notify(): void
    {
        $this->user();
        $this->visit('docking', '2026-10-01');
        $this->visit('docking', '2026-10-02');
        DB::beginTransaction();
        $this->visit('docking', '2026-10-03');
        $this->assertDatabaseCount('notifications', 0);
        DB::rollBack();
        $this->assertDatabaseCount('notifications', 0);
    }
}
