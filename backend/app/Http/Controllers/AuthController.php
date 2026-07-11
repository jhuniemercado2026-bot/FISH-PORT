<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Services\ActivityLogService;

class AuthController extends Controller
{
    // ── Login ─────────────────────────────────────────────────────────────────
    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        // Find user by email
        $user = User::where('email', $request->email)->first();

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

        // Keep existing valid tokens intact so the web session and other clients
        // keep working when a user signs in from a new device.
        $token = $user->createToken('auth_token_' . $user->role)->plainTextToken;

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'User "' . $user->email . '" signed in successfully.',
            user: $user
        );

        return response()->json([
            'message' => 'Login successful.',
            'token'   => $token,
            'user'    => [
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

    // ── Logout ────────────────────────────────────────────────────────────────
    public function logout(Request $request)
    {
        $user = $request->user();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Security',
            details: 'User "' . $user->email . '" signed out.',
            user: $user
        );

        // Revoke only the current token
        $user->currentAccessToken()->delete();

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
}
