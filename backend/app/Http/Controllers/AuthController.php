<?php

namespace App\Http\Controllers;

use App\Events\AccountStatusUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\PHPMailerService;

class AuthController extends Controller
{
    private const FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS = 59;
    private const FORGOT_PASSWORD_RESEND_DAILY_LIMIT = 3;
    private const VERIFICATION_CODE_LIMIT_MESSAGE = 'You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.';

    // ── Login ─────────────────────────────────────────────────────────────────
    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
            'client_type' => 'sometimes|string|in:web,mobile',
        ]);

        // Find user by email
        $user = User::where('email', strtolower(trim($request->email)))->first();

        // Email not found
        if (!$user) {
            return response()->json([
                'message' => 'Email does not exist.',
                'errors'  => [
                    'email' => ['No account found with this email address.']
                ]
            ], 404);
        }

        // Wrong password
        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Incorrect password.',
                'errors'  => [
                    'password' => ['The password you entered is incorrect.']
                ]
            ], 401);
        }

        // Account deactivated
        if ($user->status === 'deactivated') {
            return response()->json([
                'message' => 'Account deactivated.',
                'errors'  => [
                    'email' => ['Your account has been deactivated. Please contact the administrator.']
                ]
            ], 403);
        }

        $role = strtolower(trim((string) $user->role));

        if ($request->input('client_type') === 'web' && ! in_array($role, ['head', 'coordinator'], true)) {
            return response()->json([
                'message' => 'Only head and coordinator accounts can sign in on the website.',
                'errors' => [
                    'role' => ['Only head and coordinator accounts can sign in on the website.'],
                ],
            ], 403);
        }

        // Keep existing valid tokens intact so the web session and other clients
        // keep working when a user signs in from a new device.
        $token = $user->createToken('auth_token_' . $role)->plainTextToken;

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'User "' . $user->email . '" signed in successfully.',
            user: $user
        );

        $user->update(['status' => 'online']);
        $user->refresh();
        $this->broadcastAccountStatus($user, 'online');

        return response()->json([
            'message' => 'Login successful.',
            'token'   => $token,
            'user'    => [
                'user_id'           => $user->user_id,
                'email'             => $user->email,
                'role'              => $role,
                'role_label'        => $user->role_label,
                'status'            => $user->status,
                'first_name'        => $user->first_name,
                'last_name'         => $user->last_name,
                'gender'            => $user->gender,
                'full_name'         => $user->full_name,
                'contact_number'    => $user->contact_number,
                'birthday'          => $user->birthday,
                'address'           => $user->address,
                'profile_image'     => $user->profile_image,
                'profile_image_url' => $user->profile_image_url, // ✅ full storage URL
            ],
        ], 200);
    }

    public function checkForgotPasswordEmail(Request $request, PHPMailerService $mailer)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $isResendRequest = $request->boolean('resend');
        $email = strtolower(trim($validated['email']));
        $user = User::query()
            ->where('email', $email)
            ->first();

        if (!$user) {
            return response()->json([
                'message' => 'Email does not exist.',
                'errors' => [
                    'email' => ['No account found with this email address.'],
                ],
            ], 404);
        }

        if ($user->status === 'deactivated') {
            return response()->json([
                'message' => 'Account deactivated.',
                'errors' => [
                    'email' => ['Your account has been deactivated. Please contact the administrator.'],
                ],
            ], 403);
        }

        $sendCount = $this->forgotPasswordResendCount($email);

        if ($sendCount >= self::FORGOT_PASSWORD_RESEND_DAILY_LIMIT) {
            return response()->json([
                'message' => self::VERIFICATION_CODE_LIMIT_MESSAGE,
                'remaining_resends' => 0,
            ], 429);
        }

        if ($isResendRequest) {
            $cooldownSecondsRemaining = $this->forgotPasswordResendCooldownSecondsRemaining($email);
            if ($cooldownSecondsRemaining > 0) {
                return response()->json([
                    'message' => 'Please wait before requesting another code.',
                    'retry_after' => $cooldownSecondsRemaining,
                    'remaining_resends' => max(0, self::FORGOT_PASSWORD_RESEND_DAILY_LIMIT - $sendCount),
                ], 429);
            }
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put($this->forgotPasswordCodeCacheKey($email), [
            'code_hash' => Hash::make($code),
            'verified' => false,
            'expires_at' => now()->endOfDay()->toIso8601String(),
        ], now()->endOfDay());

        $sent = $mailer->sendPasswordChangeCodeEmail(
            $user->email,
            trim($user->full_name) !== '' ? $user->full_name : $user->email,
            $code,
            'forgot_password'
        );

        if (!$sent) {
            Cache::forget($this->forgotPasswordCodeCacheKey($email));

            return response()->json([
                'message' => 'Unable to send the verification code email.',
            ], 500);
        }

        $sendCount = $this->incrementForgotPasswordResendCount($email);
        $remainingResends = max(0, self::FORGOT_PASSWORD_RESEND_DAILY_LIMIT - $sendCount);

        if ($remainingResends === 0) {
            Cache::put($this->forgotPasswordCodeCacheKey($email), [
                'code_hash' => Hash::make($code),
                'verified' => false,
                'expires_at' => now()->endOfDay()->toIso8601String(),
            ], now()->endOfDay());
        }

        if ($isResendRequest) {
            Cache::put(
                $this->forgotPasswordResendCooldownKey($email),
                now()->addSeconds(self::FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS)->timestamp,
                now()->addSeconds(self::FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS)
            );
        }

        return response()->json([
            'message' => 'Verification code sent successfully.',
            'exists' => true,
            'retry_after' => $isResendRequest ? self::FORGOT_PASSWORD_RESEND_COOLDOWN_SECONDS : 0,
            'remaining_resends' => $remainingResends,
        ], 200);
    }

    public function verifyForgotPasswordCode(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'verification_code' => 'required|digits:6',
        ]);

        $email = strtolower(trim($validated['email']));
        $cachedCode = Cache::get($this->forgotPasswordCodeCacheKey($email));

        if (!$cachedCode || empty($cachedCode['code_hash'])) {
            return response()->json([
                'message' => 'The verification code has expired. Please request a new verification code.',
                'errors' => [
                    'verification_code' => ['The verification code has expired. Please request a new verification code.'],
                ],
            ], 422);
        }

        if (!Hash::check($validated['verification_code'], $cachedCode['code_hash'])) {
            return response()->json([
                'message' => 'Invalid verification code.',
                'errors' => [
                    'verification_code' => ['The verification code you entered is invalid.'],
                ],
            ], 422);
        }

        Cache::put($this->forgotPasswordCodeCacheKey($email), [
            ...$cachedCode,
            'verified' => true,
        ], now()->endOfDay());

        return response()->json([
            'message' => 'Verification code confirmed.',
        ], 200);
    }

    public function resetForgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'verification_code' => 'required|digits:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $email = strtolower(trim($validated['email']));
        $cachedCode = Cache::get($this->forgotPasswordCodeCacheKey($email));

        if (!$cachedCode || empty($cachedCode['code_hash']) || empty($cachedCode['verified'])) {
            return response()->json([
                'message' => 'Please verify your code before changing your password.',
                'errors' => [
                    'verification_code' => ['Please verify your code before changing your password.'],
                ],
            ], 422);
        }

        if (!Hash::check($validated['verification_code'], $cachedCode['code_hash'])) {
            return response()->json([
                'message' => 'Invalid verification code.',
                'errors' => [
                    'verification_code' => ['The verification code you entered is invalid.'],
                ],
            ], 422);
        }

        $user = User::query()->where('email', $email)->first();

        if (!$user) {
            return response()->json([
                'message' => 'Email does not exist.',
                'errors' => [
                    'email' => ['No account found with this email address.'],
                ],
            ], 404);
        }

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        Cache::forget($this->forgotPasswordCodeCacheKey($email));

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'Reset password for "' . $user->email . '".',
            user: $user
        );

        return response()->json([
            'message' => 'Password changed successfully.',
        ], 200);
    }

    // ── Logout ────────────────────────────────────────────────────────────────
    public function logout(Request $request)
    {
        $user = $request->user();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'User "' . $user->email . '" logged out successfully.',
            user: $user
        );

        // Revoke only the current token
        $user->currentAccessToken()->delete();
        $hasOtherActiveSessions = $user->tokens()->exists();

        if ($user->status !== 'deactivated' && ! $hasOtherActiveSessions) {
            $user->update(['status' => 'offline']);
            $user->refresh();
            $this->broadcastAccountStatus($user, 'offline');
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ], 200);
    }

    // ── Get Authenticated User ────────────────────────────────────────────────
    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => [
                'user_id'           => $user->user_id,
                'email'             => $user->email,
                'role'              => $user->role,
                'role_label'        => $user->role_label,
                'status'            => $user->status,
                'first_name'        => $user->first_name,
                'last_name'         => $user->last_name,
                'gender'            => $user->gender,
                'full_name'         => $user->full_name,
                'contact_number'    => $user->contact_number,
                'birthday'          => $user->birthday,
                'address'           => $user->address,
                'profile_image'     => $user->profile_image,
                'profile_image_url' => $user->profile_image_url, // ✅ full storage URL
            ],
        ], 200);
    }

    private function broadcastAccountStatus(User $user, string $presenceStatus): void
    {
        try {
            broadcast(new AccountStatusUpdated([
                'user_id' => $user->user_id,
                'id' => $user->user_id,
                'email' => $user->email,
                'name' => $user->full_name ?: $user->email,
                'role' => $user->role,
                'status' => $user->status,
                'presence_status' => $presenceStatus,
            ]));
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function forgotPasswordCodeCacheKey(string $email): string
    {
        return 'forgot_password_code_' . sha1(strtolower(trim($email)));
    }

    private function forgotPasswordResendCountKey(string $email): string
    {
        return 'forgot_password_code_resend_count_' . sha1(strtolower(trim($email))) . '_' . now()->toDateString();
    }

    private function forgotPasswordResendCooldownKey(string $email): string
    {
        return 'forgot_password_code_resend_cooldown_' . sha1(strtolower(trim($email)));
    }

    private function forgotPasswordResendCount(string $email): int
    {
        return (int) Cache::get($this->forgotPasswordResendCountKey($email), 0);
    }

    private function incrementForgotPasswordResendCount(string $email): int
    {
        $key = $this->forgotPasswordResendCountKey($email);
        $count = $this->forgotPasswordResendCount($email) + 1;
        Cache::put($key, $count, now()->endOfDay());

        return $count;
    }

    private function forgotPasswordResendCooldownSecondsRemaining(string $email): int
    {
        $cooldownUntil = Cache::get($this->forgotPasswordResendCooldownKey($email));

        if (!$cooldownUntil) {
            return 0;
        }

        return max(0, (int) $cooldownUntil - now()->timestamp);
    }
}
