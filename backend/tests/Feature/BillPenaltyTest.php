<?php

namespace Tests\Feature;

use App\Events\ActivityLogUpdated;
use App\Events\TransactionUpdated;
use App\Models\Bill;
use App\Models\BillingPenaltySetting;
use App\Models\User;
use App\Services\BillPenaltyService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BillPenaltyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.default' => 'penalty_test',
            'database.connections.penalty_test' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        ]);
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role');
            $table->string('status');
            $table->string('first_name');
            $table->string('last_name');
            $table->timestamps();
        });
        Schema::create('bills', function (Blueprint $table) {
            $table->increments('bill_id');
            $table->string('bill_reference_no')->unique();
            $table->unsignedBigInteger('boat_id')->nullable();
            $table->decimal('total_amount', 12, 2);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
        Schema::create('payments', function (Blueprint $table) {
            $table->id('payment_id');
            $table->unsignedInteger('bill_id');
            $table->decimal('amount_paid', 12, 2);
            $table->dateTime('payment_date');
            $table->timestamps();
        });
        Schema::create('boats', function (Blueprint $table) {
            $table->id('boat_id');
            $table->string('boat_name');
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('user_name');
            $table->string('user_role')->nullable();
            $table->string('action');
            $table->string('module');
            $table->text('details')->nullable();
            $table->string('severity');
            $table->timestamps();
        });
        (require database_path('migrations/2026_10_24_000001_add_boat_bill_penalties.php'))->up();
        (require database_path('migrations/2026_10_25_000001_use_fixed_peso_boat_bill_penalties.php'))->up();
        (require database_path('migrations/2026_10_25_000002_add_penalty_suspension.php'))->up();
        Carbon::setTestNow(Carbon::parse('2026-10-24 10:00:00', 'Asia/Manila'));
        Event::fake([ActivityLogUpdated::class, TransactionUpdated::class]);
        Storage::fake('local');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_three_months_produce_three_simple_penalties_without_duplicates(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        $this->assertSame(3, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1150.00', $bill->fresh()->total_amount);
        $this->assertSame([50.0, 50.0, 50.0], $bill->penalties()->get()->map(fn ($row) => (float) $row->amount)->all());
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertDatabaseCount('bill_penalties', 3);
        Carbon::setTestNow(Carbon::parse('2026-11-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(1, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('200.00', $bill->fresh()->penalty_amount);
    }

    public function test_partial_payments_keep_the_fixed_fee_for_each_unpaid_period(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 400, 'payment_date' => '2026-09-01 10:00:00']);
        app(BillPenaltyService::class)->applyOverduePenalties();
        $this->assertSame([50.0, 50.0, 50.0], $bill->penalties()->get()->map(fn ($row) => (float) $row->amount)->all());
        $this->assertSame('1150.00', $bill->fresh()->total_amount);
    }

    public function test_paid_bills_and_inactive_rules_receive_no_new_charges(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->configure();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1000, 'payment_date' => '2026-08-01 10:00:00']);
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('1000.00', $bill->fresh()->total_amount);
    }

    public function test_month_end_boundaries_keep_the_original_anniversary(): void
    {
        $this->configure();
        $bill = $this->bill('2026-01-31 10:00:00');
        Carbon::setTestNow(Carbon::parse('2026-03-31 10:00:00', 'Asia/Manila'));
        $this->assertSame(2, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame(['2026-02-28', '2026-03-31'], $bill->penalties()->get()->map(fn ($row) => $row->period_ended_at->toDateString())->all());
    }

    public function test_days_and_years_count_only_complete_periods(): void
    {
        $this->configure(['interval_unit' => 'days', 'interval_value' => 10]);
        $bill = $this->bill('2026-10-01 10:00:00');
        $this->assertSame(2, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('100.00', $bill->fresh()->penalty_amount);
        $this->configure(['interval_unit' => 'years', 'version' => 2]);
        $yearBill = $this->bill('2024-02-29 10:00:00');
        Carbon::setTestNow(Carbon::parse('2026-02-28 10:00:00', 'Asia/Manila'));
        $this->assertSame(2, app(BillPenaltyService::class)->applyToBill($yearBill->bill_id));
    }

    public function test_head_can_configure_and_toggle_but_other_roles_cannot(): void
    {
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', [
            'amount' => 150, 'interval_value' => 1, 'interval_unit' => 'months', 'is_active' => true,
        ])->assertOk()->assertJsonPath('data.is_active', true);
        $this->getJson('/api/settings/bill-penalty')->assertOk()->assertJsonPath('data.amount', '150.00');
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        foreach (['coordinator', 'inspector'] as $role) {
            Sanctum::actingAs($this->user($role));
            $this->getJson('/api/settings/bill-penalty')->assertForbidden();
            $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertForbidden();
        }
    }

    public function test_setting_validation_rejects_invalid_amounts_and_periods(): void
    {
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertUnprocessable()->assertJsonValidationErrors('amount');
        foreach ([0, -1, 0.001, 10000000000] as $amount) {
            $this->patchJson('/api/settings/bill-penalty', ['amount' => $amount, 'interval_value' => 0, 'interval_unit' => 'weeks'])
                ->assertUnprocessable()->assertJsonValidationErrors(['amount', 'interval_value', 'interval_unit']);
        }
        $this->patchJson('/api/settings/bill-penalty', ['percentage' => 5])
            ->assertUnprocessable()->assertJsonValidationErrors('percentage');
    }

    public function test_edits_keep_existing_charges_and_apply_new_amount_only_to_future_periods(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['amount' => 100])->assertOk();
        Carbon::setTestNow(Carbon::parse('2026-11-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(1, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('250.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1250.00', $bill->fresh()->total_amount);
    }

    public function test_financial_requests_assess_penalties_before_returning_balances(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        Sanctum::actingAs($this->user('head'));
        Route::middleware(['auth:sanctum', \App\Http\Middleware\ApplyBoatBillPenalties::class])
            ->get('/api/bills/{id}/penalty-test', fn ($id) => Bill::findOrFail($id)->only(['total_amount', 'penalty_amount']));
        $this->getJson('/api/bills/' . $bill->bill_id . '/penalty-test')
            ->assertOk()->assertJsonPath('total_amount', '1150.00')->assertJsonPath('penalty_amount', '150.00');
    }

    public function test_paid_principal_does_not_create_interest_on_remaining_penalties(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1000, 'payment_date' => '2026-10-24 10:01:00']);
        Carbon::setTestNow(Carbon::parse('2027-01-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
    }

    public function test_disabled_rule_pauses_assessment_and_reactivation_catches_up_without_duplicates(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        BillingPenaltySetting::whereKey(1)->update(['is_active' => false]);
        Carbon::setTestNow(Carbon::parse('2026-12-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('0.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1000.00', $bill->fresh()->total_amount);
        BillingPenaltySetting::whereKey(1)->update(['is_active' => true]);
        $this->assertSame(2, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('250.00', $bill->fresh()->penalty_amount);
    }

    public function test_new_interval_starts_after_the_last_assessed_period(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['interval_value' => 2])->assertOk();
        Carbon::setTestNow(Carbon::parse('2026-11-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        Carbon::setTestNow(Carbon::parse('2026-12-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(1, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('200.00', $bill->fresh()->penalty_amount);
    }

    public function test_statement_line_items_include_and_reconcile_penalty_charges(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        $bill = $bill->fresh()->load('penalties');
        $item = new \App\Models\BillItem(['amount' => 1000, 'transaction_type' => 'docking']);
        $item->setRelation('docking', null);
        $bill->setRelation('items', collect([$item]));
        $bill->setRelation('boat', null);
        $bill->setRelation('createdBy', null);
        $method = new \ReflectionMethod(\App\Http\Controllers\BillController::class, 'transformBill');
        $payload = $method->invoke(new \App\Http\Controllers\BillController(), $bill);
        $this->assertCount(4, $payload->line_items);
        $this->assertEquals((float) $payload->total_amount, $payload->line_items->sum('amount'));
        $this->assertSame('penalty', $payload->line_items[1]['transaction_type']);
        $this->assertStringContainsString('period 1', $payload->line_items[1]['description']);
        $this->assertStringContainsString('PHP 50.00', $payload->line_items[1]['description']);
        $this->assertStringNotContainsString('%', $payload->line_items[1]['description']);
    }

    public function test_scheduled_command_assesses_outstanding_periods(): void
    {
        $this->configure();
        $this->bill('2026-07-24 10:00:00');
        $this->artisan('bills:apply-penalties')->expectsOutput('Assessed 3 penalty period(s).')->assertExitCode(0);
    }

    public function test_periods_keep_the_correct_instant_when_server_storage_uses_utc(): void
    {
        $previousTimezone = date_default_timezone_get();
        config(['app.timezone' => 'UTC']);
        date_default_timezone_set('UTC');
        try {
            $this->configure();
            Carbon::setTestNow(Carbon::parse('2026-10-24T02:00:00Z'));
            $bill = $this->bill('2026-07-24 02:00:00');
            $this->assertSame(3, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
            Carbon::setTestNow(Carbon::parse('2026-11-24T02:00:00Z'));
            $this->assertSame(1, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
            $this->assertSame('200.00', $bill->fresh()->penalty_amount);
        } finally {
            date_default_timezone_set($previousTimezone);
        }
    }

    public function test_fixed_fee_is_independent_of_the_unpaid_bill_amount(): void
    {
        $this->configure(['amount' => 50.25]);
        foreach ([200, 2000] as $principal) {
            $bill = $this->bill('2026-07-24 10:00:00');
            $bill->update(['total_amount' => $principal]);
            $this->assertSame(3, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
            $this->assertSame('150.75', $bill->fresh()->penalty_amount);
            $this->assertEquals($principal + 150.75, (float) $bill->fresh()->total_amount);
            $this->assertSame('50.25', $bill->penalties()->first()->fixed_amount);
        }
    }

    public function test_small_peso_amount_keeps_centavo_precision(): void
    {
        $this->configure(['amount' => 0.01]);
        $bill = $this->bill('2026-07-24 10:00:00');
        $this->assertSame(3, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertSame('0.03', $bill->fresh()->penalty_amount);
        $this->assertSame('1000.03', $bill->fresh()->total_amount);
    }

    public function test_peso_migration_preserves_historical_percentage_charges(): void
    {
        $migration = require database_path('migrations/2026_10_25_000001_use_fixed_peso_boat_bill_penalties.php');
        $migration->down();
        BillingPenaltySetting::whereKey(1)->update(['percentage' => 5, 'is_active' => true]);
        $oldVersion = BillingPenaltySetting::findOrFail(1)->version;
        $bill = $this->bill('2026-07-24 10:00:00');
        $bill->forceFill(['total_amount' => 1050, 'penalty_amount' => 50])->save();
        $bill->penalties()->create([
            'period_number' => 1, 'settings_version' => $oldVersion,
            'schedule_anchor_at' => '2026-07-24 10:00:00', 'schedule_period_number' => 1,
            'period_ended_at' => '2026-08-24 10:00:00', 'percentage' => 5,
            'interval_value' => 1, 'interval_unit' => 'months', 'base_amount' => 1000, 'amount' => 50,
        ]);
        $migration->up();
        $settings = BillingPenaltySetting::findOrFail(1);
        $this->assertSame('0.00', $settings->amount);
        $this->assertFalse($settings->is_active);
        $this->assertSame($oldVersion + 1, $settings->version);
        $this->assertSame('50.00', $bill->penalties()->first()->amount);
        $this->assertSame('5.00', $bill->penalties()->first()->percentage);
        $this->assertNull($bill->penalties()->first()->fixed_amount);
        $bill->load('penalties');
        $bill->setRelation('items', collect());
        $bill->setRelation('boat', null);
        $bill->setRelation('createdBy', null);
        $method = new \ReflectionMethod(\App\Http\Controllers\BillController::class, 'transformBill');
        $payload = $method->invoke(new \App\Http\Controllers\BillController(), $bill);
        $this->assertStringContainsString('PHP 50.00', $payload->line_items[0]['description']);
        $this->assertStringNotContainsString('%', $payload->line_items[0]['description']);
        $this->assertSame(0, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->configure(['amount' => 25]);
        $this->assertSame(3, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertSame('75.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1075.00', $bill->fresh()->total_amount);
        $backups = Storage::disk('local')->files('penalty-repairs');
        $this->assertCount(1, $backups);
        $backup = json_decode(Storage::disk('local')->get($backups[0]), true);
        $this->assertSame('50.00', $backup['penalty_amount']);
        $this->assertSame('5.00', $backup['assessments'][0]['percentage']);
    }

    public function test_legacy_one_peso_entries_are_rebuilt_from_bill_creation_using_current_peso_rule(): void
    {
        $this->configure(['amount' => 20]);
        $bill = $this->legacyBill();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 400, 'payment_date' => '2026-07-15 10:00:00']);
        $this->assertSame(8, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertSame('160.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1160.00', $bill->fresh()->total_amount);
        $rows = $bill->penalties()->get();
        $this->assertCount(8, $rows);
        $this->assertSame(array_fill(0, 8, 20.0), $rows->map(fn ($row) => (float) $row->amount)->all());
        $this->assertSame('2026-03-03', $rows->first()->period_ended_at->toDateString());
        $this->assertSame('2026-10-03', $rows->last()->period_ended_at->toDateString());
        $this->assertSame(0, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertCount(1, Storage::disk('local')->files('penalty-repairs'));
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_legacy_repair_replaces_mixed_percentage_and_peso_rows_without_adding_twice(): void
    {
        $this->configure(['amount' => 50, 'interval_value' => 2]);
        $bill = $this->legacyBill();
        $bill->penalties()->create([
            'period_number' => 5, 'settings_version' => 1,
            'schedule_anchor_at' => '2026-10-03 10:00:00', 'schedule_period_number' => 1,
            'period_ended_at' => '2026-10-13 10:00:00', 'percentage' => 0, 'fixed_amount' => 20,
            'interval_value' => 10, 'interval_unit' => 'days', 'base_amount' => 1000, 'amount' => 20,
        ]);
        $bill->forceFill(['penalty_amount' => 24, 'total_amount' => 1024])->save();
        $this->assertSame(4, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertSame('200.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1200.00', $bill->fresh()->total_amount);
        $this->assertDatabaseCount('bill_penalties', 4);
    }

    public function test_legacy_repair_leaves_fully_paid_bills_unchanged(): void
    {
        $this->configure(['amount' => 20]);
        $bill = $this->legacyBill();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1004, 'payment_date' => '2026-10-05 10:00:00']);
        $this->assertSame(0, app(BillPenaltyService::class)->applyToBill($bill->bill_id));
        $this->assertSame('4.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1004.00', $bill->fresh()->total_amount);
        $this->assertCount(0, Storage::disk('local')->files('penalty-repairs'));
    }

    public function test_legacy_repair_aborts_before_changing_a_bill_when_backup_fails(): void
    {
        $this->configure(['amount' => 20]);
        $bill = $this->legacyBill();
        $disk = \Mockery::mock();
        $disk->shouldReceive('put')->once()->andReturn(false);
        Storage::shouldReceive('disk')->once()->with('local')->andReturn($disk);
        try {
            app(BillPenaltyService::class)->applyToBill($bill->bill_id);
            $this->fail('Repair must stop if the original entries cannot be backed up.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Unable to back up', $error->getMessage());
        }
        $this->assertSame('4.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1004.00', $bill->fresh()->total_amount);
        $this->assertDatabaseCount('bill_penalties', 4);
    }

    public function test_switch_off_and_on_updates_bill_balances_in_the_settings_request(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyToBill($bill->bill_id);
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk();
        $this->assertSame('0.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1000.00', $bill->fresh()->total_amount);
        $this->assertSame(0.0, $bill->penalties()->get()->sum(fn ($row) => $row->effective_amount));
        $this->assertDatabaseCount('bill_penalties', 3);
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertOk();
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1150.00', $bill->fresh()->total_amount);
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertOk();
        $this->assertSame('1150.00', $bill->fresh()->total_amount);
        $this->assertDatabaseCount('bill_penalties', 3);
        Event::assertDispatched(TransactionUpdated::class, fn ($event) => $event->type === 'bill-penalty-settings');
    }

    public function test_penalties_stay_removed_when_bill_is_paid_while_switch_is_off(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyToBill($bill->bill_id);
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1000, 'payment_date' => '2026-10-24 10:01:00']);
        Carbon::setTestNow(Carbon::parse('2026-12-24 10:00:00', 'Asia/Manila'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertOk();
        $this->assertSame('0.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1000.00', $bill->fresh()->total_amount);
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_switch_off_removes_only_unpaid_fees_without_creating_overpayment(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyToBill($bill->bill_id);
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1020, 'payment_date' => '2026-10-24 10:01:00']);
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk();
        $this->assertSame('20.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1020.00', $bill->fresh()->total_amount);
        $this->assertSame(20.0, $bill->penalties()->get()->sum(fn ($row) => $row->effective_amount));
        $this->assertEquals(1020, DB::table('payments')->sum('amount_paid'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => true])->assertOk();
        $this->assertSame('1020.00', $bill->fresh()->total_amount);
    }

    public function test_statement_line_items_exclude_suspended_penalties(): void
    {
        $this->configure();
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyToBill($bill->bill_id);
        Sanctum::actingAs($this->user('head'));
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk();
        $bill = $bill->fresh()->load('penalties');
        $bill->setRelation('items', collect([new \App\Models\BillItem(['amount' => 1000, 'transaction_type' => 'other'])]));
        $bill->setRelation('boat', null);
        $bill->setRelation('createdBy', null);
        $method = new \ReflectionMethod(\App\Http\Controllers\BillController::class, 'transformBill');
        $payload = $method->invoke(new \App\Http\Controllers\BillController(), $bill);
        $this->assertCount(1, $payload->line_items);
        $this->assertEquals((float) $payload->total_amount, $payload->line_items->sum('amount'));
    }

    public function test_coordinator_can_read_live_penalty_state_but_cannot_change_it(): void
    {
        $this->configure();
        Sanctum::actingAs($this->user('coordinator'));
        $this->getJson('/api/settings/bill-penalty/state')->assertOk()
            ->assertJsonPath('data.is_active', true)->assertJsonPath('data.amount', '50.00');
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertForbidden();
    }

    public function test_head_penalty_table_lists_bill_dates_amounts_and_searches_boats(): void
    {
        $this->configure();
        DB::table('boats')->insert(['boat_id' => 1, 'boat_name' => 'Pacific Star']);
        $bill = $this->bill('2026-07-24 10:00:00');
        Sanctum::actingAs($this->user('head'));
        $this->getJson('/api/settings/bill-penalty/entries?search=Pacific')
            ->assertOk()->assertJsonPath('meta.total', 3)->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.bill_id', $bill->bill_id)
            ->assertJsonPath('data.0.boat_name', 'Pacific Star')
            ->assertJsonPath('data.0.period_number', 3)
            ->assertJsonPath('data.0.amount', 50)->assertJsonPath('data.0.applied_amount', 50)
            ->assertJsonPath('data.0.status', 'applied');
        $this->getJson('/api/settings/bill-penalty/entries?search=' . $bill->bill_reference_no)
            ->assertOk()->assertJsonPath('meta.total', 3);
        $this->getJson('/api/settings/bill-penalty/entries?search=missing')
            ->assertOk()->assertJsonPath('meta.total', 0)->assertJsonCount(0, 'data');
    }

    public function test_penalty_table_filters_suspended_entries_and_keeps_original_fee(): void
    {
        $this->configure();
        $this->bill('2026-07-24 10:00:00');
        Sanctum::actingAs($this->user('head'));
        $this->getJson('/api/settings/bill-penalty/entries')->assertOk();
        $this->patchJson('/api/settings/bill-penalty', ['is_active' => false])->assertOk();
        $this->getJson('/api/settings/bill-penalty/entries?status=suspended')->assertOk()
            ->assertJsonPath('meta.total', 3)->assertJsonPath('data.0.amount', 50)
            ->assertJsonPath('data.0.applied_amount', 0)->assertJsonPath('data.0.status', 'suspended');
        $this->getJson('/api/settings/bill-penalty/entries?status=applied')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_penalty_table_is_paginated_and_restricted_to_head_accounts(): void
    {
        $this->configure();
        $this->bill('2025-10-24 10:00:00');
        foreach (['coordinator', 'inspector'] as $role) {
            Sanctum::actingAs($this->user($role));
            $this->getJson('/api/settings/bill-penalty/entries')->assertForbidden();
        }
        Sanctum::actingAs($this->user('head'));
        $this->getJson('/api/settings/bill-penalty/entries?page=2&per_page=10')->assertOk()
            ->assertJsonPath('meta.total', 12)->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.last_page', 2)->assertJsonCount(2, 'data');
        $this->getJson('/api/settings/bill-penalty/entries?status=invalid&per_page=1000')
            ->assertUnprocessable()->assertJsonValidationErrors(['status', 'per_page']);
    }

    private function legacyBill(): Bill
    {
        $bill = $this->bill('2026-02-03 10:00:00');
        $bill->forceFill(['total_amount' => 1004, 'penalty_amount' => 4])->save();
        foreach ([4, 6, 8, 10] as $index => $month) {
            $bill->penalties()->create([
                'period_number' => $index + 1, 'settings_version' => 1,
                'schedule_anchor_at' => '2026-02-03 10:00:00', 'schedule_period_number' => $index + 1,
                'period_ended_at' => sprintf('2026-%02d-03 10:00:00', $month), 'percentage' => 0.10,
                'interval_value' => 2, 'interval_unit' => 'months', 'base_amount' => 1000, 'amount' => 1,
            ]);
        }
        return $bill;
    }

    private function configure(array $values = []): void
    {
        BillingPenaltySetting::whereKey(1)->update(array_merge([
            'amount' => 50, 'interval_value' => 1, 'interval_unit' => 'months', 'is_active' => true,
        ], $values));
    }

    private function bill(string $issued): Bill
    {
        return Bill::forceCreate(['boat_id' => 1, 'total_amount' => 1000, 'created_at' => $issued]);
    }

    private function user(string $role): User
    {
        return User::create([
            'email' => $role . '@test.example', 'password' => bcrypt('password'), 'role' => $role,
            'status' => 'online', 'first_name' => 'Test', 'last_name' => $role,
        ]);
    }
}
