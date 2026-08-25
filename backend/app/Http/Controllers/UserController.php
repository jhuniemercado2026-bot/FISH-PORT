<?php

namespace App\Http\Controllers;

use App\Events\AccountStatusUpdated;
use App\Events\MasterDataUpdated;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\PHPMailerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    private const PASSWORD_CHANGE_RESEND_COOLDOWN_SECONDS = 59;
    private const PASSWORD_CHANGE_RESEND_DAILY_LIMIT = 3;
    private const VERIFICATION_CODE_LIMIT_MESSAGE = 'You have reached the verification code limit for today. Please use the latest verification code sent to your email. This code expires within this day.';

    private function manageableAccountRoles(?User $actor): array
    {
        return match ($actor?->role) {
            'head' => ['coordinator'],
            'coordinator' => ['inspector'],
            default => [],
        };
    }

    private function abortIfCannotAccessAccounts(Request $request): array
    {
        $roles = $this->manageableAccountRoles($request->user());

        abort_if(empty($roles), 403, 'You are not allowed to manage accounts.');

        return $roles;
    }

    private function abortIfCannotManageTarget(Request $request, User $target): void
    {
        $roles = $this->manageableAccountRoles($request->user());

        abort_if(
            empty($roles) || ! in_array($target->role, $roles, true),
            403,
            'You are not allowed to manage this account.'
        );
    }

    private function isSelf(Request $request, User $target): bool
    {
        return (int) ($request->user()?->user_id ?? 0) === (int) $target->user_id;
    }

    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('user_id', (int) $highlightId)
            ->first(['user_id', 'created_at']);

        if (!$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('created_at', '>', $target->created_at)
                    ->orWhere(function ($idTieQuery) use ($target) {
                        $idTieQuery
                            ->where('created_at', $target->created_at)
                            ->where('user_id', '>', $target->user_id);
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    // ── Get all users ─────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $this->abortIfCannotAccessAccounts($request);

        $query = $this->usersIndexQuery($request);

        if ($request->boolean('all')) {
            $users = (clone $query)
                ->tableSort($request->input('sort', 'created_at_desc'))
                ->get()
                ->makeHidden('password')
                ->values();

            return response()->json(['data' => $users], 200);
        }

        $perPage = max(1, min((int) $request->input('per_page', 10), 100));
        $page = max((int) $request->input('page', 1), 1);
        $sortedQuery = (clone $query)->tableSort($request->input('sort', 'created_at_desc'));
        $page = $this->highlightedPage($sortedQuery, $request->input('highlight_user_id'), $page, $perPage);
        $paginated = (clone $query)
            ->tableSort($request->input('sort', 'created_at_desc'))
            ->paginate($perPage, ['*'], 'page', $page)
            ->appends($request->query());

        $users = collect($paginated->items())->map(fn ($user) => $user->makeHidden('password'))->values();

        return response()->json([
            'data' => $users,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
            'stats' => $request->boolean('include_stats', true) ? $this->usersStats($request) : null,
        ], 200);
    }

    // ── Get a single user ─────────────────────────────────────────────────────
    public function show($id)
    {
        // ⚠️ Do NOT use ->select() — it prevents $appends accessors from running
        $user = User::findOrFail($id)->makeHidden('password');

        if (! $this->isSelf(request(), $user)) {
            $this->abortIfCannotManageTarget(request(), $user);
        }

        return response()->json(['data' => $user], 200);
    }

    // ── Create a new user ─────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $manageableRoles = $this->abortIfCannotAccessAccounts($request);

        $validated = $request->validate([
            'email'          => 'required|email|max:150|unique:users,email',
            'password'       => 'required|string|min:8|confirmed',
            'role'           => ['required', Rule::in($manageableRoles)],
            'first_name'     => 'required|string|max:100',
            'last_name'      => 'required|string|max:100',
            'gender'         => 'nullable|in:male,female',
            'contact_number' => 'nullable|string|max:50',
            'birthday'       => 'nullable|date',
            'address'        => 'nullable|string',
            'profile_image'  => 'nullable|string|max:255',
        ]);

        $user = User::create([
            ...$validated,
            'password'   => Hash::make($validated['password']),
            'status'     => 'active',
            'created_by' => auth()->id(),
        ]);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Manage Accounts',
            details: 'Created user account for "' . $user->email . '".',
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'created', $user->makeHidden('password')->toArray()));

        return response()->json([
            'message' => 'User created successfully.',
            'data'    => $user->makeHidden('password'),
        ], 201);
    }

    // Send email invite and create a basic account entry for the user
    public function sendInvite(Request $request, PHPMailerService $mailer)
    {
        $manageableRoles = $this->abortIfCannotAccessAccounts($request);

        $validated = $request->validate([
            'email' => 'required|email|max:150|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'role' => ['required', Rule::in($manageableRoles)],
        ]);

        DB::beginTransaction();

        try {
            $user = User::create([
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => $validated['role'],
                'status' => 'active',
                'first_name' => '',
                'last_name' => '',
                'created_by' => auth()->id(),
            ]);

            $sent = $mailer->sendWelcomeEmail(
                $user->email,
                $user->full_name,
                $validated['password'],
                auth()->user()?->role,
                $user->role
            );

            if (!$sent) {
                DB::rollBack();

                return response()->json([
                    'message' => 'Unable to send the account email. The user was not created.',
                ], 500);
            }

            DB::commit();

            app(ActivityLogService::class)->log(
                action: 'INSERT',
                module: 'Manage Accounts',
                details: 'Created invited account for "' . $user->email . '" and sent login credentials.',
                user: auth()->user()
            );

            broadcast(new MasterDataUpdated('users', 'created', $user->fresh()->makeHidden('password')->toArray()));

            return response()->json([
                'message' => 'User created and credentials sent successfully.',
                'data' => $user->fresh()->makeHidden('password'),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to create the invited user.',
            ], 500);
        }
    }

    // ── Update an existing user ───────────────────────────────────────────────
    public function update(Request $request, $id)
    {
        $user = User::findOrFail($id);

        if ($request->boolean('send_password_change_code')) {
            return $this->sendPasswordChangeCode($request, app(PHPMailerService::class), $id);
        }

        if ($request->boolean('verify_password_change_code')) {
            return $this->verifyPasswordChangeCode($request, $id);
        }

        $isSelf = $this->isSelf($request, $user);

        if (! $isSelf) {
            $this->abortIfCannotManageTarget($request, $user);
        }

        $validated = $request->validate([
            'email'          => 'sometimes|email|max:150|unique:users,email,' . $id . ',user_id',
            'password'       => 'nullable|string|min:8|confirmed',
            'role'           => 'sometimes|in:head,coordinator,inspector',
            'status'         => 'sometimes|in:active,deactivated',
            'first_name'     => 'sometimes|string|max:100',
            'last_name'      => 'sometimes|string|max:100',
            'gender'         => 'nullable|in:male,female',
            'contact_number' => 'nullable|string|max:50',
            'birthday'       => 'nullable|date',
            'address'        => 'nullable|string',
            'profile_image'  => 'nullable|string|max:255',
        ]);

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        if ($isSelf) {
            unset($validated['role'], $validated['status']);
        }

        if (array_key_exists('role', $validated) && ! $isSelf) {
            $manageableRoles = $this->manageableAccountRoles($request->user());
            abort_if(! in_array($validated['role'], $manageableRoles, true), 403, 'You are not allowed to assign this role.');
        }

        $user->update($validated);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Manage Accounts',
            details: 'Updated account details for "' . $user->email . '".',
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'updated', $user->fresh()->makeHidden('password')->toArray()));

        return response()->json([
            'message' => 'User updated successfully.',
            'data'    => $user->fresh()->makeHidden('password'),
        ], 200);
    }

    public function sendPasswordChangeCode(Request $request, PHPMailerService $mailer, $id)
    {
        $user = User::findOrFail($id);
        $isResendRequest = $request->boolean('resend_password_change_code');

        if ((int) $request->user()->user_id !== (int) $user->user_id) {
            return response()->json([
                'message' => 'You are not allowed to change this password.',
            ], 403);
        }

        $validated = $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect.',
                'errors' => [
                    'current_password' => ['The current password you entered is incorrect.'],
                ],
            ], 422);
        }

        if (Hash::check($validated['new_password'], $user->password)) {
            return response()->json([
                'message' => 'New password must be different from your current password.',
                'errors' => [
                    'new_password' => ['Please choose a different password from your current one.'],
                ],
            ], 422);
        }

        $sendCount = $this->passwordChangeResendCount($user->user_id);

        if ($sendCount >= self::PASSWORD_CHANGE_RESEND_DAILY_LIMIT) {
            return response()->json([
                'message' => self::VERIFICATION_CODE_LIMIT_MESSAGE,
                'remaining_resends' => 0,
            ], 429);
        }

        if ($isResendRequest) {
            $cooldownSecondsRemaining = $this->passwordChangeResendCooldownSecondsRemaining($user->user_id);
            if ($cooldownSecondsRemaining > 0) {
                return response()->json([
                    'message' => 'Please wait before requesting another code.',
                    'retry_after' => $cooldownSecondsRemaining,
                    'remaining_resends' => max(0, self::PASSWORD_CHANGE_RESEND_DAILY_LIMIT - $sendCount),
                ], 429);
            }
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put($this->passwordChangeCacheKey($user->user_id), [
            'code_hash' => Hash::make($code),
            'expires_at' => now()->endOfDay()->toIso8601String(),
        ], now()->endOfDay());

        $sent = $mailer->sendPasswordChangeCodeEmail(
            $user->email,
            trim($user->full_name) !== '' ? $user->full_name : $user->email,
            $code,
            'change_password'
        );

        if (!$sent) {
            Cache::forget($this->passwordChangeCacheKey($user->user_id));

            return response()->json([
                'message' => 'Unable to send the verification code email.',
            ], 500);
        }

        $sendCount = $this->incrementPasswordChangeResendCount($user->user_id);
        $remainingResends = max(0, self::PASSWORD_CHANGE_RESEND_DAILY_LIMIT - $sendCount);

        if ($remainingResends === 0) {
            Cache::put($this->passwordChangeCacheKey($user->user_id), [
                'code_hash' => Hash::make($code),
                'expires_at' => now()->endOfDay()->toIso8601String(),
            ], now()->endOfDay());
        }

        if ($isResendRequest) {
            Cache::put(
                $this->passwordChangeResendCooldownKey($user->user_id),
                now()->addSeconds(self::PASSWORD_CHANGE_RESEND_COOLDOWN_SECONDS)->timestamp,
                now()->addSeconds(self::PASSWORD_CHANGE_RESEND_COOLDOWN_SECONDS)
            );
        }

        return response()->json([
            'message' => 'Verification code sent successfully.',
            'retry_after' => $isResendRequest ? self::PASSWORD_CHANGE_RESEND_COOLDOWN_SECONDS : 0,
            'remaining_resends' => $remainingResends,
        ], 200);
    }

    public function sendAuthenticatedPasswordChangeCode(Request $request, PHPMailerService $mailer)
    {
        return $this->sendPasswordChangeCode($request, $mailer, $request->user()->user_id);
    }

    public function verifyPasswordChangeCode(Request $request, $id)
    {
        $user = User::findOrFail($id);

        if ((int) $request->user()->user_id !== (int) $user->user_id) {
            return response()->json([
                'message' => 'You are not allowed to change this password.',
            ], 403);
        }

        $validated = $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|confirmed',
            'verification_code' => 'required|digits:6',
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect.',
                'errors' => [
                    'current_password' => ['The current password you entered is incorrect.'],
                ],
            ], 422);
        }

        if (Hash::check($validated['new_password'], $user->password)) {
            return response()->json([
                'message' => 'New password must be different from your current password.',
                'errors' => [
                    'new_password' => ['Please choose a different password from your current one.'],
                ],
            ], 422);
        }

        $cachedCode = Cache::get($this->passwordChangeCacheKey($user->user_id));

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

        $user->update([
            'password' => Hash::make($validated['new_password']),
        ]);

        Cache::forget($this->passwordChangeCacheKey($user->user_id));

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'Updated password for "' . $user->email . '".',
            user: $user
        );

        return response()->json([
            'message' => 'Password changed successfully.',
        ], 200);
    }

    public function verifyAuthenticatedPasswordChangeCode(Request $request)
    {
        return $this->verifyPasswordChangeCode($request, $request->user()->user_id);
    }

    // ── Upload profile image ──────────────────────────────────────────────────
    public function uploadImage(Request $request, $id)
    {
        $user = User::findOrFail($id);

        if (! $this->isSelf($request, $user)) {
            $this->abortIfCannotManageTarget($request, $user);
        }

        $request->validate([
            'profile_image' => 'required|image|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        // Delete old image if it exists
        if ($user->profile_image && Storage::disk('public')->exists($user->profile_image)) {
            Storage::disk('public')->delete($user->profile_image);
        }

        // Store new image under storage/app/public/profile_images/
        $path = $request->file('profile_image')->store('profile_images', 'public');

        $user->update(['profile_image' => $path]);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Manage Accounts',
            details: 'Updated profile image for "' . $user->email . '".',
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'updated', $user->fresh()->makeHidden('password')->toArray()));

        return response()->json([
            'message'           => 'Profile image updated successfully.',
            'profile_image'     => $path,
            'profile_image_url' => Storage::disk('public')->url($path),
        ], 200);
    }

    // ── Deactivate a user ─────────────────────────────────────────────────────
    public function deactivate($id)
    {
        $user = User::findOrFail($id);
        $this->abortIfCannotManageTarget(request(), $user);

        $user->update(['status' => 'deactivated']);
        $user->tokens()->delete();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Manage Accounts',
            details: 'Deactivated account "' . $user->email . '".',
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'updated', $user->fresh()->makeHidden('password')->toArray()));
        broadcast(new AccountStatusUpdated([
            'user_id' => $user->user_id,
            'id' => $user->user_id,
            'email' => $user->email,
            'name' => $user->full_name ?: $user->email,
            'role' => $user->role,
            'status' => $user->status,
            'presence_status' => 'offline',
        ]));

        return response()->json([
            'message' => 'User deactivated successfully.',
        ], 200);
    }

    public function reactivate($id)
    {
        $user = User::findOrFail($id);
        $this->abortIfCannotManageTarget(request(), $user);

        $user->update(['status' => 'active']);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Manage Accounts',
            details: 'Reactivated account "' . $user->email . '".',
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'updated', $user->fresh()->makeHidden('password')->toArray()));

        return response()->json([
            'message' => 'User reactivated successfully.',
        ], 200);
    }

    // ── Delete a user permanently ─────────────────────────────────────────────
    public function destroy($id)
    {
        $user = User::findOrFail($id);
        $this->abortIfCannotManageTarget(request(), $user);

        // Delete profile image from storage
        if ($user->profile_image && Storage::disk('public')->exists($user->profile_image)) {
            Storage::disk('public')->delete($user->profile_image);
        }

        $details = 'Deleted user account "' . $user->email . '" permanently.';
        $user->tokens()->delete();
        $user->delete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Manage Accounts',
            details: $details,
            user: auth()->user()
        );

        broadcast(new MasterDataUpdated('users', 'deleted', [
            'user_id' => $user->user_id,
        ]));

        return response()->json([
            'message' => 'User deleted successfully.',
        ], 200);
    }

    private function usersIndexQuery(Request $request)
    {
        $manageableRoles = $this->manageableAccountRoles($request->user());

        return User::query()
            ->forTableIndex([
                'exclude_user_id' => $request->boolean('exclude_current') && $request->user()
                    ? $request->user()->user_id
                    : null,
            ])
            ->whereIn('role', $manageableRoles)
            ->searchTable($request->input('search'))
            ->tableFilters([
                'status' => $request->input('status'),
                'role' => $request->input('role'),
            ]);
    }

    private function usersStats(Request $request): array
    {
        $query = User::query()
            ->whereIn('role', $this->manageableAccountRoles($request->user()));

        if ($request->boolean('exclude_current') && $request->user()) {
            $query->where('user_id', '!=', $request->user()->user_id);
        }

        return [
            'total' => (clone $query)->count(),
            'active' => (clone $query)->where('status', 'active')->count(),
            'deactivated' => (clone $query)->where('status', 'deactivated')->count(),
        ];
    }

    private function passwordChangeCacheKey(int $userId): string
    {
        return 'password_change_code_' . $userId;
    }

    private function passwordChangeResendCountKey(int $userId): string
    {
        return 'password_change_code_resend_count_' . $userId . '_' . now()->toDateString();
    }

    private function passwordChangeResendCooldownKey(int $userId): string
    {
        return 'password_change_code_resend_cooldown_' . $userId;
    }

    private function passwordChangeResendCount(int $userId): int
    {
        return (int) Cache::get($this->passwordChangeResendCountKey($userId), 0);
    }

    private function incrementPasswordChangeResendCount(int $userId): int
    {
        $key = $this->passwordChangeResendCountKey($userId);
        $count = $this->passwordChangeResendCount($userId) + 1;
        Cache::put($key, $count, now()->endOfDay());

        return $count;
    }

    private function passwordChangeResendCooldownSecondsRemaining(int $userId): int
    {
        $cooldownUntil = Cache::get($this->passwordChangeResendCooldownKey($userId));

        if (!$cooldownUntil) {
            return 0;
        }

        return max(0, (int) $cooldownUntil - now()->timestamp);
    }
}
