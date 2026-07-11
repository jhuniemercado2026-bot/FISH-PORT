<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_keeps_existing_tokens_available_for_the_same_user(): void
    {
        $user = User::factory()->create([
            'email' => 'coordinator@example.com',
            'password' => bcrypt('secret123'),
            'role' => 'coordinator',
            'status' => 'active',
        ]);

        $existingToken = $user->createToken('web-session')->plainTextToken;

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ]);

        $response->assertOk();
        $response->assertJsonPath('user.role', 'coordinator');

        $this->assertSame(2, $user->fresh()->tokens()->count());
        $this->assertNotNull($user->fresh()->tokens()->where('name', 'web-session')->first());

        $this->assertNotEmpty($response->json('token'));
        $this->assertNotSame($existingToken, $response->json('token'));
    }
}
