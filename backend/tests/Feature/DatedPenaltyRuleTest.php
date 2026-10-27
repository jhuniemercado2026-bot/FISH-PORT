<?php

namespace Tests\Feature;

use App\Events\ActivityLogUpdated;
use App\Events\TransactionUpdated;
use App\Models\Bill;
use App\Models\BillingPenaltyRule;
use App\Models\BillingPenaltySetting;
use App\Models\User;
use App\Services\BillPenaltyService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatedPenaltyRuleTest extends TestCase
{
    private array $progressTokens = [];
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'dated_penalty_test', 'database.connections.dated_penalty_test' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]);
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id'); $table->string('email')->unique(); $table->string('password');
            $table->string('role'); $table->string('status'); $table->string('first_name'); $table->string('last_name'); $table->timestamps();
        });
        Schema::create('bills', function (Blueprint $table) {
            $table->increments('bill_id'); $table->string('bill_reference_no')->unique();
            $table->unsignedBigInteger('boat_id')->nullable(); $table->decimal('total_amount', 12, 2); $table->unsignedBigInteger('created_by')->nullable(); $table->timestamps();
        });
        Schema::create('payments', function (Blueprint $table) {
            $table->id('payment_id'); $table->unsignedInteger('bill_id'); $table->decimal('amount_paid', 12, 2); $table->dateTime('payment_date'); $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('user_id')->nullable(); $table->string('user_name'); $table->string('user_role')->nullable();
            $table->string('action'); $table->string('module'); $table->text('details')->nullable(); $table->string('severity'); $table->timestamps();
        });
        foreach (['2026_10_24_000001_add_boat_bill_penalties.php', '2026_10_25_000001_use_fixed_peso_boat_bill_penalties.php', '2026_10_25_000002_add_penalty_suspension.php'] as $migration) (require database_path('migrations/' . $migration))->up();
        Carbon::setTestNow(Carbon::parse('2026-10-24 10:00:00', 'Asia/Manila'));
        Event::fake([ActivityLogUpdated::class, TransactionUpdated::class]);
        Sanctum::actingAs($this->user('head'));
    }

    protected function tearDown(): void
    {
        foreach ($this->progressTokens as $token) Cache::store('file')->forget('penalty-toggle-progress:' . $token);
        Carbon::setTestNow(); parent::tearDown();
    }

    public function test_effective_dates_select_the_correct_saved_peso_rule_for_each_bill_period(): void
    {
        $bill = $this->bill('2026-01-03 10:00:00');
        $old = $this->rule(['effective_from' => '2026-01-01', 'effective_to' => '2026-03-31']);
        $new = $this->rule(['amount' => 100, 'effective_from' => '2026-04-01']);
        $this->assertSame('800.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1800.00', $bill->fresh()->total_amount);
        $this->assertSame(2, $bill->penalties()->where('penalty_rule_id', $old['id'])->count());
        $this->assertSame(7, $bill->penalties()->where('penalty_rule_id', $new['id'])->count());
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertDatabaseCount('bill_penalties', 9);
    }

    public function test_switch_off_only_removes_that_rules_unpaid_charges_and_on_restores_them(): void
    {
        $bill = $this->bill('2026-01-03 10:00:00');
        $old = $this->rule(['effective_from' => '2026-01-01', 'effective_to' => '2026-03-31']);
        $this->rule(['amount' => 100, 'effective_from' => '2026-04-01']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $old['id'], ['is_active' => false])->assertOk();
        $this->assertSame('700.00', $bill->fresh()->penalty_amount);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $old['id'], ['is_active' => true])->assertOk();
        $this->assertSame('800.00', $bill->fresh()->penalty_amount);
        $this->assertDatabaseCount('bill_penalties', 9);
    }

    public function test_two_month_rule_counts_from_bill_creation_and_respects_effective_dates(): void
    {
        $bill = $this->bill('2026-02-03 10:00:00');
        $this->rule(['interval_value' => 2, 'effective_from' => '2026-04-03', 'effective_to' => '2026-10-03']);
        $this->assertSame('200.00', $bill->fresh()->penalty_amount);
        $this->assertSame(['2026-04-03', '2026-06-03', '2026-08-03', '2026-10-03'],
            $bill->penalties()->get()->map(fn ($row) => $row->period_ended_at->toDateString())->all());
    }

    public function test_overlapping_enabled_windows_are_rejected_including_the_same_end_date(): void
    {
        $this->rule(['effective_from' => '2026-01-01', 'effective_to' => '2026-03-31']);
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['effective_from' => '2026-03-31']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->assertDatabaseCount('billing_penalty_rules', 1);
    }

    public function test_future_overlap_is_rejected_without_changing_current_dates_or_charges(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $current = $this->rule(['effective_from' => '2026-07-01']);
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['amount' => 100, 'effective_from' => '2026-11-01']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->assertNull(BillingPenaltyRule::findOrFail($current['id'])->effective_to);
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
        Carbon::setTestNow(Carbon::parse('2026-11-24 10:00:00', 'Asia/Manila'));
        $this->assertSame(1, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('200.00', $bill->fresh()->penalty_amount);
    }

    public function test_assessed_amount_and_interval_are_locked_but_dates_and_name_can_be_edited(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        $history = $bill->penalties()->get()->toJson();
        foreach ([['amount' => 100], ['interval_value' => 2]] as $change) {
            $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], $change)
                ->assertUnprocessable()->assertJsonValidationErrors('amount');
        }
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['effective_from' => '2026-08-01'])
            ->assertOk()->assertJsonPath('data.effective_from', '2026-08-01');
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['effective_to' => '2026-09-01'])
            ->assertUnprocessable()->assertJsonValidationErrors('effective_to');
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['name' => 'Original monthly fee', 'effective_to' => '2026-10-31'])->assertOk();
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
        $this->assertSame('50.00', BillingPenaltyRule::findOrFail($rule['id'])->amount);
        $this->assertSame($history, $bill->penalties()->get()->toJson());
    }

    public function test_archived_assessments_also_keep_the_original_rule_terms_locked(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        DB::table('bill_penalties')->where('penalty_rule_id', $rule['id'])->update([
            'original_penalty_rule_id' => $rule['id'], 'penalty_rule_id' => null,
        ]);
        $this->getJson('/api/settings/bill-penalty/rules')->assertOk()->assertJsonPath('data.0.has_assessments', true);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['amount' => 100])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
    }

    public function test_off_rule_still_reserves_its_dates_and_can_be_restored(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $wrong = $this->rule(['amount' => 1, 'effective_from' => '2026-07-01']);
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['amount' => 50, 'effective_from' => '2026-07-01']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->patchJson('/api/settings/bill-penalty/rules/' . $wrong['id'], ['is_active' => false])->assertOk();
        $this->assertSame('0.00', $bill->fresh()->penalty_amount);
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['amount' => 50, 'effective_from' => '2026-07-01']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['effective_from' => '2026-11-01', 'is_active' => false]))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->assertDatabaseCount('billing_penalty_rules', 1);
        $this->assertDatabaseCount('bill_penalties', 3);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $wrong['id'], ['is_active' => true])
            ->assertOk();
        $this->assertSame('3.00', $bill->fresh()->penalty_amount);
    }

    public function test_ending_an_open_rule_allows_a_new_rule_the_next_day_and_edits_cannot_overlap(): void
    {
        $current = $this->rule(['effective_from' => '2026-01-01']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $current['id'], ['effective_to' => '2026-03-31'])->assertOk();
        $next = $this->rule(['effective_from' => '2026-04-01', 'effective_to' => '2026-06-30']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $next['id'], ['effective_from' => '2026-03-31'])
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['effective_from' => '2026-02-01', 'effective_to' => '2026-02-28']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->rule(['effective_from' => '2025-12-01', 'effective_to' => '2025-12-31']);
        $this->assertDatabaseCount('billing_penalty_rules', 3);
    }

    public function test_settled_bill_is_not_recharged_when_a_record_is_reenabled(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false])->assertOk();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1000, 'payment_date' => '2026-10-24 10:01:00']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true])->assertOk();
        $this->assertSame('0.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1000.00', $bill->fresh()->total_amount);
    }

    public function test_rule_table_contains_rules_only_and_is_head_only(): void
    {
        $this->bill('2026-07-24 10:00:00');
        $this->rule(['name' => 'Monthly rule', 'effective_from' => '2026-07-01']);
        $this->assertDatabaseCount('bill_penalties', 3);
        $this->getJson('/api/settings/bill-penalty/rules?search=Monthly&status=on')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.has_assessments', true)
            ->assertJsonPath('data.0.name', 'Monthly rule')->assertJsonPath('data.0.status', 'on');
        Sanctum::actingAs($this->user('coordinator'));
        $this->getJson('/api/settings/bill-penalty/rules')->assertForbidden();
        $this->postJson('/api/settings/bill-penalty/rules', $this->values())->assertForbidden();
    }

    public function test_upgrade_imports_the_existing_rule_and_keeps_all_bill_amounts(): void
    {
        BillingPenaltySetting::whereKey(1)->update(['amount' => 50, 'is_active' => true]);
        $bill = $this->bill('2026-07-24 10:00:00');
        app(BillPenaltyService::class)->applyOverduePenalties();
        $this->enableRules();
        $this->assertDatabaseCount('billing_penalty_rules', 1);
        $this->assertSame(3, $bill->penalties()->whereNotNull('penalty_rule_id')->count());
        $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1150.00', $bill->fresh()->total_amount);
    }

    public function test_rule_off_preserves_fees_already_paid_and_never_changes_payment_records(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1020, 'payment_date' => '2026-10-24 10:01:00']);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false])->assertOk();
        $this->assertSame('20.00', $bill->fresh()->penalty_amount);
        $this->assertSame('1020.00', $bill->fresh()->total_amount);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true])->assertOk();
        $this->assertSame('1020.00', $bill->fresh()->total_amount);
        $this->assertEquals(1020, DB::table('payments')->sum('amount_paid'));
    }

    public function test_future_rules_report_on_and_off_and_reject_overlapping_dates(): void
    {
        $current = $this->rule(['effective_to' => '2026-10-31']);
        $future = $this->rule(['effective_from' => '2026-11-01']);
        $this->getJson('/api/settings/bill-penalty/rules?status=on')->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.status', 'on');
        $this->postJson('/api/settings/bill-penalty/rules', $this->values(['effective_from' => '2026-10-28']))
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
        $this->assertSame('2026-10-31', BillingPenaltyRule::findOrFail($current['id'])->effective_to->toDateString());
        $this->assertDatabaseCount('billing_penalty_rules', 2);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $future['id'], ['is_active' => false])->assertOk()
            ->assertJsonPath('data.status', 'off');
        $this->getJson('/api/settings/bill-penalty/rules?status=off')->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.status', 'off');
    }

    public function test_month_end_rule_boundaries_keep_the_original_bill_anniversary(): void
    {
        $bill = $this->bill('2026-01-31 10:00:00');
        $this->rule(['effective_from' => '2026-01-01', 'effective_to' => '2026-02-28']);
        $this->rule(['amount' => 100, 'effective_from' => '2026-03-01', 'effective_to' => '2026-03-31']);
        $this->assertSame(['2026-02-28', '2026-03-31'], $bill->penalties()->get()->map(fn ($row) => $row->period_ended_at->toDateString())->all());
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
    }

    public function test_dated_rules_keep_the_correct_instant_in_utc_storage(): void
    {
        $previous = date_default_timezone_get();
        config(['app.timezone' => 'UTC']); date_default_timezone_set('UTC');
        try {
            Carbon::setTestNow(Carbon::parse('2026-10-24T02:00:00Z'));
            $bill = $this->bill('2026-07-24 02:00:00');
            $this->rule(['effective_from' => '2026-07-01']);
            $this->assertSame('150.00', $bill->fresh()->penalty_amount);
            $this->assertSame(0, app(BillPenaltyService::class)->applyOverduePenalties());
            Carbon::setTestNow(Carbon::parse('2026-11-24T02:00:00Z'));
            $this->assertSame(1, app(BillPenaltyService::class)->applyOverduePenalties());
            $this->assertSame('200.00', $bill->fresh()->penalty_amount);
        } finally { date_default_timezone_set($previous); }
    }

    public function test_migration_can_be_retried_without_importing_duplicate_rules(): void
    {
        BillingPenaltySetting::whereKey(1)->update(['amount' => 50, 'is_active' => true]);
        $this->enableRules();
        (require database_path('migrations/2026_10_26_000001_add_dated_penalty_rules.php'))->up();
        $this->assertDatabaseCount('billing_penalty_rules', 1);
    }

    public function test_revenue_reports_follow_penalty_on_off_for_daily_monthly_and_yearly_totals(): void
    {
        $this->prepareRevenueTables();
        $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        $urls = [
            '/api/revenue-reports/daily?date=2026-07-24&transaction_type=penalty' => 150,
            '/api/revenue-reports/monthly?month=7&year=2026&transaction_type=penalty' => 150,
            '/api/revenue-reports/yearly?year=2026&transaction_type=penalty' => 150,
        ];
        foreach ($urls as $url => $amount) {
            $this->getJson($url)->assertOk()->assertJsonPath('totalRevenue', $amount)
                ->assertJsonPath('rows.0.sourceType', 'penalty');
        }
        $this->assertDashboardPenaltyRevenue(150);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false])->assertOk();
        foreach ($urls as $url => $amount) $this->getJson($url)->assertOk()->assertJsonPath('totalRevenue', 0)->assertJsonCount(0, 'rows');
        $this->assertDashboardPenaltyRevenue(0);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true])->assertOk();
        foreach ($urls as $url => $amount) $this->getJson($url)->assertOk()->assertJsonPath('totalRevenue', $amount);
        $this->assertDashboardPenaltyRevenue(150);
        $this->getJson('/api/revenue-reports/monthly?month=6&year=2026&transaction_type=penalty')->assertOk()->assertJsonPath('totalRevenue', 0);
    }

    public function test_penalty_revenue_preserves_paid_fees_and_allocates_payments_before_filtering_dates(): void
    {
        $this->prepareRevenueTables();
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule(['effective_from' => '2026-07-01']);
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1075, 'payment_date' => '2026-10-24 10:01:00', 'official_receipt_no' => 'OR-75']);
        $this->getJson('/api/revenue-reports/monthly?month=7&year=2026&transaction_type=penalty')
            ->assertOk()->assertJsonPath('totalRevenue', 150)->assertJsonCount(3, 'rows')
            ->assertJsonPath('rows.0.receivable', 0)->assertJsonPath('rows.1.receivable', 25)
            ->assertJsonPath('rows.2.receivable', 50)->assertJsonPath('rows.0.orNumber', 'OR-75');
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false])->assertOk();
        $response = $this->getJson('/api/revenue-reports/yearly?year=2026&transaction_type=penalty')
            ->assertOk()->assertJsonPath('totalRevenue', 75)->assertJsonCount(2, 'rows');
        $this->assertEquals(0, collect($response->json('rows'))->sum('receivable'));
        $this->assertDashboardPenaltyRevenue(75);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true])->assertOk();
        $this->getJson('/api/revenue-reports/yearly?year=2026&transaction_type=penalty')->assertOk()->assertJsonPath('totalRevenue', 75);
        $this->assertDashboardPenaltyRevenue(75);
    }

    public function test_old_bill_penalties_and_later_payments_stay_in_the_bill_fiscal_year(): void
    {
        $this->prepareRevenueTables();
        $bill = $this->bill('2025-11-24 10:00:00');
        $this->rule(['effective_from' => '2025-11-01']);
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 100, 'payment_date' => '2026-10-24 10:01:00']);
        $this->getJson('/api/revenue-reports/yearly?year=2025&transaction_type=penalty')
            ->assertOk()->assertJsonPath('totalRevenue', 550)->assertJsonCount(11, 'rows');
        $this->getJson('/api/revenue-reports/yearly?year=2026&transaction_type=penalty')
            ->assertOk()->assertJsonPath('totalRevenue', 0)->assertJsonCount(0, 'rows');
        $controller = new \App\Http\Controllers\DashboardController();
        $penalties = (new \ReflectionMethod($controller, 'penaltyRevenueData'))->invoke($controller);
        foreach ($penalties as $penalty) $this->assertSame('2025-11-24', $penalty['fiscal_date']);
        $payments = (new \ReflectionMethod($controller, 'paymentRevenueData'))->invoke($controller);
        $this->assertSame('2025-11-24', $payments[0]['fiscal_date']);
        $this->assertSame('2026-10-24', $payments[0]['payment_date']);
    }

    public function test_new_penalties_are_monthly_and_daily_or_yearly_periods_are_rejected(): void
    {
        $this->enableRules();
        foreach (['days', 'years'] as $unit) {
            $this->postJson('/api/settings/bill-penalty/rules', $this->values(['interval_unit' => $unit]))
                ->assertUnprocessable()->assertJsonValidationErrors('interval_unit');
        }
        $values = $this->values(['interval_value' => 2]);
        unset($values['interval_unit']);
        $rule = $this->postJson('/api/settings/bill-penalty/rules', $values)->assertCreated()
            ->assertJsonPath('data.interval_unit', 'months')->assertJsonPath('data.interval_value', 2)->json('data');
        foreach (['days', 'years'] as $unit) {
            $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['interval_unit' => $unit])
                ->assertUnprocessable()->assertJsonValidationErrors('interval_unit');
        }
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['interval_value' => 3])->assertOk()
            ->assertJsonPath('data.interval_unit', 'months')->assertJsonPath('data.interval_value', 3);
    }

    public function test_overdue_indicator_waits_for_the_full_monthly_interval_and_follows_off_on(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-31 09:59:59', 'Asia/Manila'));
        $bill = $this->bill('2026-01-31 10:00:00');
        $rule = $this->rule(['interval_value' => 2]);
        $this->assertFalse($bill->fresh()->hasOverdueMonthlyPenalty(0));
        Carbon::setTestNow(Carbon::parse('2026-03-31 10:00:00', 'Asia/Manila'));
        app(BillPenaltyService::class)->applyOverduePenalties();
        $this->assertTrue($bill->fresh()->hasOverdueMonthlyPenalty(0));
        $this->assertFalse($bill->fresh()->hasOverdueMonthlyPenalty(1050));
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false])->assertOk();
        $this->assertFalse($bill->fresh()->hasOverdueMonthlyPenalty(0));
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true])->assertOk();
        $this->assertTrue($bill->fresh()->hasOverdueMonthlyPenalty(0));
    }

    public function test_bill_payload_marks_paid_bills_not_overdue_even_when_penalty_history_remains(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $this->rule();
        DB::table('payments')->insert(['bill_id' => $bill->bill_id, 'amount_paid' => 1150, 'payment_date' => '2026-10-24 10:01:00']);
        $bill = $bill->fresh()->setRelation('createdBy', null)->setRelation('boat', null)->setRelation('items', collect());
        $controller = new \App\Http\Controllers\BillController();
        $payload = (new \ReflectionMethod($controller, 'transformBill'))->invoke($controller, $bill)->toArray();
        $this->assertFalse($payload['is_overdue']);
        $this->assertSame(0.0, $payload['balance']);
        $this->assertSame(1150.0, $payload['amount_paid']);
        $this->assertSame('150.00', $payload['penalty_amount']);
    }

    public function test_toggle_progress_completes_and_is_only_visible_to_the_requesting_head(): void
    {
        $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule();
        $token = $this->progressTokens[] = (string) Str::uuid();
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false, 'progress_id' => $token])->assertOk();
        $this->getJson('/api/settings/bill-penalty/progress/' . $token)->assertOk()
            ->assertJsonPath('data.status', 'completed')->assertJsonPath('data.progress', 100)
            ->assertJsonPath('data.processed', 1)->assertJsonPath('data.total', 1);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => true, 'progress_id' => $token])->assertConflict();
        $this->assertFalse(BillingPenaltyRule::findOrFail($rule['id'])->is_active);
        Sanctum::actingAs($this->user('other-head')->forceFill(['role' => 'head']));
        $this->getJson('/api/settings/bill-penalty/progress/' . $token)->assertForbidden();
        Sanctum::actingAs($this->user('coordinator'));
        $this->getJson('/api/settings/bill-penalty/progress/' . $token)->assertForbidden();
    }

    public function test_penalty_progress_reports_actual_processed_bill_counts(): void
    {
        $this->bill('2026-07-24 10:00:00');
        $this->bill('2026-07-24 10:00:00');
        $this->rule();
        $counts = [];
        app(\App\Services\DatedBillPenaltyService::class)->applyAll(false, function ($processed, $total) use (&$counts) {
            $counts[] = [$processed, $total];
        });
        $this->assertSame([[0, 2], [1, 2], [2, 2]], $counts);
    }

    public function test_failed_toggle_rolls_back_and_never_reports_one_hundred_percent(): void
    {
        $bill = $this->bill('2026-07-24 10:00:00');
        $rule = $this->rule();
        $token = $this->progressTokens[] = (string) Str::uuid();
        $service = \Mockery::mock(\App\Services\DatedBillPenaltyService::class);
        $service->shouldReceive('applyAll')->once()->andThrow(new \RuntimeException('Assessment failed'));
        $this->app->instance(\App\Services\DatedBillPenaltyService::class, $service);
        $this->patchJson('/api/settings/bill-penalty/rules/' . $rule['id'], ['is_active' => false, 'progress_id' => $token])->assertStatus(500);
        $response = $this->getJson('/api/settings/bill-penalty/progress/' . $token)->assertOk()->assertJsonPath('data.status', 'failed');
        $this->assertLessThan(100, $response->json('data.progress'));
        $this->assertTrue(BillingPenaltyRule::findOrFail($rule['id'])->is_active);
        $this->assertSame('150.00', $bill->fresh()->penalty_amount);
    }

    private function assertDashboardPenaltyRevenue(float $expected): void
    {
        $controller = new \App\Http\Controllers\DashboardController();
        $rows = (new \ReflectionMethod($controller, 'penaltyRevenueData'))->invoke($controller);
        $this->assertEquals($expected, array_sum(array_column($rows, 'amount')));
        foreach ($rows as $row) $this->assertMatchesRegularExpression('/^2026-\d{2}-24$/', $row['date']);
    }

    private function prepareRevenueTables(): void
    {
        Schema::create('boats', function (Blueprint $table) { $table->id('boat_id'); $table->string('boat_name'); });
        DB::table('boats')->insert(['boat_id' => 1, 'boat_name' => 'Revenue Test Boat']);
        Schema::table('payments', fn (Blueprint $table) => $table->string('official_receipt_no')->nullable());
    }

    private function enableRules(): void
    {
        if (!Schema::hasTable('billing_penalty_rules')) (require database_path('migrations/2026_10_26_000001_add_dated_penalty_rules.php'))->up();
        (require database_path('migrations/2026_10_26_000002_add_penalty_revision_origin.php'))->up();
    }

    private function values(array $values = []): array
    {
        return array_merge(['name' => 'Boat Penalty', 'amount' => 50, 'interval_value' => 1, 'interval_unit' => 'months',
            'effective_from' => '2026-01-01', 'effective_to' => null, 'is_active' => true], $values);
    }

    private function rule(array $values = []): array
    {
        $this->enableRules();
        return $this->postJson('/api/settings/bill-penalty/rules', $this->values($values))->assertCreated()->json('data');
    }

    private function bill(string $date): Bill
    {
        return Bill::forceCreate(['boat_id' => 1, 'total_amount' => 1000, 'created_at' => $date]);
    }

    private function user(string $role): User
    {
        return User::create(['email' => $role . '@test.example', 'password' => bcrypt('password'), 'role' => $role,
            'status' => 'online', 'first_name' => 'Test', 'last_name' => $role]);
    }
}
