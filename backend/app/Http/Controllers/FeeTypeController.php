<?php

namespace App\Http\Controllers;

use App\Models\FeeType;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FeeTypeController extends Controller
{
    public function index()
    {
        $feeTypes = FeeType::with('createdBy')
            ->withCount('activeFees as fees_count')
            ->active()
            ->latest('created_at')
            ->get();

        $feeTypes->each(function ($type) {
            $type->createdBy?->append('full_name');
            $type->setAttribute('created_by_name', $type->createdBy?->full_name ?? $type->createdBy?->email);
        });

        return response()->json($feeTypes);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'fee_name' => 'required|string|max:100|unique:fee_types,fee_name',
        ]);

        $feeType = FeeType::create([
            'fee_name' => $validated['fee_name'],
            'created_by' => Auth::id(),
        ]);

        $feeType->load('createdBy');
        $feeType->loadCount('activeFees as fees_count');
        $feeType->createdBy?->append('full_name');
        $feeType->setAttribute('created_by_name', $feeType->createdBy?->full_name ?? $feeType->createdBy?->email);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Set Fees',
            details: 'Created fee type "' . $feeType->fee_name . '".',
            user: Auth::user()
        );

        return response()->json($feeType, 201);
    }

    public function show($id)
    {
        $feeType = FeeType::with('createdBy')
            ->withCount('activeFees as fees_count')
            ->findOrFail($id);

        $feeType->createdBy?->append('full_name');
        $feeType->setAttribute('created_by_name', $feeType->createdBy?->full_name ?? $feeType->createdBy?->email);

        return response()->json($feeType);
    }

    public function update(Request $request, $id)
    {
        $feeType = FeeType::findOrFail($id);

        $validated = $request->validate([
            'fee_name' => 'required|string|max:100|unique:fee_types,fee_name,' . $id . ',fee_type_id',
        ]);

        $feeType->update($validated);
        $feeType->load('createdBy');
        $feeType->loadCount('activeFees as fees_count');
        $feeType->createdBy?->append('full_name');
        $feeType->setAttribute('created_by_name', $feeType->createdBy?->full_name ?? $feeType->createdBy?->email);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Set Fees',
            details: 'Updated fee type "' . $feeType->fee_name . '".',
            user: Auth::user()
        );

        return response()->json($feeType);
    }

    public function destroy($id)
    {
        $feeType = FeeType::findOrFail($id);

        if ($feeType->activeFees()->exists()) {
            return response()->json([
                'message' => 'This fee type has usage count and cannot be archived.',
            ], 422);
        }

        $feeType->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Set Fees',
            details: 'Archived fee type "' . $feeType->fee_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Fee type archived successfully.']);
    }

    public function restore($id)
    {
        $feeType = FeeType::withTrashed()->findOrFail($id);
        $feeType->restore();

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Set Fees',
            details: 'Restored fee type "' . $feeType->fee_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Fee type restored successfully.']);
    }

    public function forceDelete($id)
    {
        $feeType = FeeType::onlyTrashed()->withCount('fees')->findOrFail($id);

        if ($feeType->fees_count > 0) {
            return response()->json(['message' => 'This fee type is still linked to fee records.'], 422);
        }

        $details = 'Permanently deleted archived fee type "' . $feeType->fee_name . '".';
        $feeType->forceDelete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Set Fees',
            details: $details,
            user: Auth::user()
        );

        return response()->json(['message' => 'Fee type permanently deleted successfully.']);
    }
}
