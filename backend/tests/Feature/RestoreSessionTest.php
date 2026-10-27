<?php

namespace Tests\Feature;

use App\Events\AccountStatusUpdated;
use App\Events\MasterDataUpdated;
use App\Http\Controllers\BackupRecoveryController;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use ReflectionMethod;
use Tests\TestCase;

class RestoreSessionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Never import SQL or modify the configured development database.
        config([
            'database.default' => 'restore_test',
            'database.connections.restore_test' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '',
            ],
            'sanctum.guard' => [],
        ]);

        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('first_name');
            $table->string('last_name');
            $table->string('role');
            $table->string('status');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->text('payload');
            $table->integer('last_activity');
        });
        Event::fake([MasterDataUpdated::class, AccountStatusUpdated::class]);
    }

    public function test_restore_revokes_every_other_role_and_imported_token_but_preserves_uploader(): void
    {
        $actor = $this->user('uploader', 'head');
        $actorToken = $actor->createToken('current-web-login')->plainTextToken;
        $otherUsers = [
            $this->user('other-head', 'head'),
            $this->user('coordinator', 'coordinator'),
            $this->user('inspector', 'inspector'),
            $this->user('deactivated', 'inspector', 'deactivated'),
        ];
        $otherTokens = array_map(fn ($user) => $user->createToken('live-login')->plainTextToken, $otherUsers);
        $tokens = $actor->tokens()->get()->map->getAttributes()->all();
        $session = ['id' => 'uploader-session', 'user_id' => $actor->getKey(), 'payload' => 'live', 'last_activity' => time()];

        // Simulate an older SQL backup replacing the live authentication tables.
        PersonalAccessToken::query()->delete();
        $importedToken = $otherUsers[0]->createToken('old-backup-login')->plainTextToken;
        DB::table('sessions')->insert([
            'id' => 'old-session', 'user_id' => $otherUsers[0]->getKey(), 'payload' => 'old', 'last_activity' => time(),
        ]);
        User::whereKey($actor->getKey())->update(['password' => 'outdated-password', 'status' => 'deactivated']);

        $count = $this->invalidateSessions($actor, $tokens, [$session]);

        $this->assertSame(4, $count);
        $this->assertNotNull(PersonalAccessToken::findToken($actorToken));
        foreach ([...$otherTokens, $importedToken] as $token) {
            $this->assertNull(PersonalAccessToken::findToken($token));
        }
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseCount('sessions', 1);
        $this->assertDatabaseHas('sessions', ['id' => 'uploader-session']);
        $this->assertSame($actor->password, $actor->fresh()->password);
        $this->assertSame('online', $actor->fresh()->status);
        foreach ($otherUsers as $user) {
            $this->assertSame($user->status === 'deactivated' ? 'deactivated' : 'offline', $user->fresh()->status);
        }
        Event::assertDispatched(MasterDataUpdated::class, fn ($event) =>
            $event->resource === 'database' && $event->action === 'restored'
            && $event->record['excluded_user_id'] === $actor->getKey()
            && in_array('head', $event->record['affected_roles'], true)
        );

        $this->withToken($actorToken)->getJson('/api/me')->assertOk()->assertJsonPath('user.user_id', $actor->getKey());
        $this->app['auth']->forgetGuards();
        $this->withToken($otherTokens[0])->getJson('/api/me')->assertUnauthorized();
    }

    public function test_uploader_is_retained_when_backup_predates_account(): void
    {
        $actor = $this->user('new-head', 'head');
        $actorToken = $actor->createToken('live-login')->plainTextToken;
        $tokens = $actor->tokens()->get()->map->getAttributes()->all();
        DB::table('users')->delete();
        DB::table('personal_access_tokens')->delete();

        $this->assertSame(0, $this->invalidateSessions($actor, $tokens));
        $this->withToken($actorToken)->getJson('/api/me')->assertOk()->assertJsonPath('user.email', $actor->email);
    }

    public function test_broadcast_failure_does_not_prevent_session_revocation(): void
    {
        $actor = $this->user('uploader', 'head');
        $other = $this->user('other-head', 'head');
        $actorToken = $actor->createToken('live-login')->plainTextToken;
        $otherToken = $other->createToken('live-login')->plainTextToken;
        $tokens = $actor->tokens()->get()->map->getAttributes()->all();
        Broadcast::shouldReceive('event')->once()->andThrow(new \RuntimeException('Pusher unavailable'));

        $this->assertSame(1, $this->invalidateSessions($actor, $tokens));
        $this->assertNotNull(PersonalAccessToken::findToken($actorToken));
        $this->assertNull(PersonalAccessToken::findToken($otherToken));
    }

    private function invalidateSessions(User $actor, array $tokens, array $sessions = []): int
    {
        $method = new ReflectionMethod(BackupRecoveryController::class, 'logoutOtherUsersAfterRestore');

        return $method->invoke(new BackupRecoveryController(), $actor, $tokens, $sessions);
    }

    private function user(string $name, string $role, string $status = 'online'): User
    {
        return User::create([
            'email' => $name . '@example.com', 'password' => bcrypt('password'),
            'first_name' => $name, 'last_name' => 'Test', 'role' => $role, 'status' => $status,
        ]);
    }
}
