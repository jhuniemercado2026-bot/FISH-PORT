<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\BoatTypeController;
use App\Http\Controllers\BoatController;
use App\Http\Controllers\BoatManagementController;
use App\Http\Controllers\BoatOwnerController;
use App\Http\Controllers\BanyeraTransactionController;
use App\Http\Controllers\DockingController;
use App\Http\Controllers\FeeController;
use App\Http\Controllers\FeeReportController;
use App\Http\Controllers\VehicleTypeController;
use App\Http\Controllers\VehicleTicketController;
use App\Http\Controllers\BillController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\CollectionController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\RemittanceController;
use App\Http\Controllers\ArchiveController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\UniversalSearchController;
use App\Http\Controllers\RevenueReportController;
use App\Http\Controllers\RemittanceReportController;
use App\Http\Controllers\BillingReportController;
use App\Http\Controllers\BanyeraReportController;
use App\Http\Controllers\BfarReportController;
use App\Http\Controllers\VehicleTicketReportController;
use App\Http\Controllers\RegisteredBoatsReportController;
use App\Http\Controllers\OwnerInfoReportController;
use App\Http\Controllers\DockingReportController;
use App\Http\Controllers\BackupRecoveryController;

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

Route::post('login', [AuthController::class, 'login']);

/*
|--------------------------------------------------------------------------
| Protected Routes (Sanctum Token Required)
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me',      [AuthController::class, 'me']);
    Route::post('me/password/send-code', [UserController::class, 'sendAuthenticatedPasswordChangeCode']);
    Route::post('me/password/verify-code', [UserController::class, 'verifyAuthenticatedPasswordChangeCode']);
    Route::get('dashboard-data', [DashboardController::class, 'index']);
    Route::put('dashboard-monthly-target', [DashboardController::class, 'saveMonthlyTarget']);
    Route::put('dashboard-yearly-target', [DashboardController::class, 'saveYearlyTarget']);
    Route::get('universal-search', [UniversalSearchController::class, 'index']);
    Route::get('boat-management', [BoatManagementController::class, 'index']);

    /*
    |----------------------------------------------------------------------
    | Activity Logs
    |----------------------------------------------------------------------
    */
    Route::get('activity-logs', [ActivityLogController::class, 'index']); // GET /api/activity-logs
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::get('transaction-lock', [\App\Http\Controllers\TransactionLockController::class, 'index']);
    Route::patch('notifications/{id}/read', [NotificationController::class, 'markRead']);
        Route::get('notifications/summary', [NotificationController::class, 'summary']);

    Route::prefix('database')->group(function () {
        Route::get('backup', [BackupRecoveryController::class, 'download']);
        Route::post('recover', [BackupRecoveryController::class, 'recover']);
    });

    /*
    |----------------------------------------------------------------------
    | Users
    |----------------------------------------------------------------------
    */
    Route::prefix('users')->group(function () {
        Route::get('/',                  [UserController::class, 'index']);       // GET    /api/users
        Route::post('/',                 [UserController::class, 'store']);       // POST   /api/users
        Route::post('send-invite',       [UserController::class, 'sendInvite']);  // POST   /api/users/send-invite
        Route::get('{id}',               [UserController::class, 'show']);        // GET    /api/users/{id}
        Route::put('{id}',               [UserController::class, 'update']);      // PUT    /api/users/{id}
        Route::post('{id}/password/send-code', [UserController::class, 'sendPasswordChangeCode']);
        Route::post('{id}/password/verify-code', [UserController::class, 'verifyPasswordChangeCode']);
        Route::post('{id}/upload-image', [UserController::class, 'uploadImage']); // POST   /api/users/{id}/upload-image
        Route::patch('{id}/deactivate',  [UserController::class, 'deactivate']);  // PATCH  /api/users/{id}/deactivate
        Route::patch('{id}/reactivate',  [UserController::class, 'reactivate']);  // PATCH  /api/users/{id}/reactivate
        Route::delete('{id}',            [UserController::class, 'destroy']);     // DELETE /api/users/{id}
    });

    /*
    |----------------------------------------------------------------------
    | Boat Types
    |----------------------------------------------------------------------
    */
    Route::prefix('boat-types')->group(function () {
        Route::get('/',              [BoatTypeController::class, 'index']);   // GET    /api/boat-types
        Route::post('/',             [BoatTypeController::class, 'store']);   // POST   /api/boat-types
        Route::get('{id}',           [BoatTypeController::class, 'show']);    // GET    /api/boat-types/{id}
        Route::put('{id}',           [BoatTypeController::class, 'update']);  // PUT    /api/boat-types/{id}
        Route::patch('{id}/archive', [BoatTypeController::class, 'destroy']); // PATCH  /api/boat-types/{id}/archive
        Route::patch('{id}/restore', [BoatTypeController::class, 'restore']); // PATCH  /api/boat-types/{id}/restore
        Route::delete('{id}/permanent', [BoatTypeController::class, 'forceDelete']); // DELETE /api/boat-types/{id}/permanent
    });

    /*
    |----------------------------------------------------------------------
    | Boat Owners
    |----------------------------------------------------------------------
    */
    Route::prefix('boat-owners')->group(function () {
        Route::get('/',              [BoatOwnerController::class, 'index']);   // GET    /api/boat-owners
        Route::post('/',             [BoatOwnerController::class, 'store']);   // POST   /api/boat-owners
        Route::get('{id}',           [BoatOwnerController::class, 'show']);    // GET    /api/boat-owners/{id}
        Route::put('{id}',           [BoatOwnerController::class, 'update']);  // PUT    /api/boat-owners/{id}
        Route::patch('{id}/archive', [BoatOwnerController::class, 'destroy']); // PATCH  /api/boat-owners/{id}/archive
        Route::patch('{id}/restore', [BoatOwnerController::class, 'restore']); // PATCH  /api/boat-owners/{id}/restore
        Route::delete('{id}/permanent', [BoatOwnerController::class, 'forceDelete']); // DELETE /api/boat-owners/{id}/permanent
    });

    /*
    |----------------------------------------------------------------------
    | Fees
    |----------------------------------------------------------------------
    */
    Route::prefix('fees')->group(function () {
        Route::get('/',              [FeeController::class, 'index']);
        Route::post('/',             [FeeController::class, 'store']);
        Route::get('{id}',           [FeeController::class, 'show']);
        Route::put('{id}',           [FeeController::class, 'update']);
    });

    Route::prefix('vehicle-tickets')->group(function () {
        Route::get('/', [VehicleTicketController::class, 'index']);
        Route::post('/', [VehicleTicketController::class, 'store'])->middleware('transactions.unlocked');
        Route::get('{id}', [VehicleTicketController::class, 'show']);
        Route::put('{id}', [VehicleTicketController::class, 'update'])->middleware('transactions.unlocked');
        Route::patch('{id}/void', [VehicleTicketController::class, 'void'])->middleware('transactions.unlocked');
        Route::patch('{id}/unvoid', [VehicleTicketController::class, 'unvoid'])->middleware('transactions.unlocked');
        Route::patch('{id}/archive', [VehicleTicketController::class, 'destroy'])->middleware('transactions.unlocked');
    });
    Route::get('daily-vehicle-tickets', [VehicleTicketController::class, 'dailyIndex']);
    Route::get('annual-vehicle-tickets', [VehicleTicketController::class, 'annualIndex']);

    Route::get('vehicle-types', [VehicleTypeController::class, 'index']);
    Route::post('vehicle-types', [VehicleTypeController::class, 'store']);
    Route::put('vehicle-types/{id}', [VehicleTypeController::class, 'update']);
    Route::patch('vehicle-types/{id}/archive', [VehicleTypeController::class, 'destroy']);
    Route::patch('vehicle-types/{id}/restore', [VehicleTypeController::class, 'restore']);

    Route::prefix('bills')->group(function () {
        Route::get('/', [BillController::class, 'index']);
        Route::post('/', [BillController::class, 'store'])->middleware('transactions.unlocked');
        Route::get('{id}', [BillController::class, 'show']);
        Route::put('{id}', [BillController::class, 'update'])->middleware('transactions.unlocked');
        Route::patch('{id}/archive', [BillController::class, 'destroy'])->middleware('transactions.unlocked');
    });
    Route::get('boat-statement', [BillController::class, 'boatStatement']);
    Route::get('owner-statement', [BillController::class, 'ownerStatement']);

    Route::prefix('payments')->group(function () {
        Route::get('/', [PaymentController::class, 'index']);
        Route::post('/', [PaymentController::class, 'store'])->middleware('transactions.unlocked');
        Route::get('{id}', [PaymentController::class, 'show']);
        Route::put('{id}', [PaymentController::class, 'update'])->middleware('transactions.unlocked');
    });
    Route::get('collections', [CollectionController::class, 'index']);

    Route::prefix('remittances')->group(function () {
        Route::get('today-system-cash-received', [RemittanceController::class, 'todaySystemCashReceived']);
        Route::get('/', [RemittanceController::class, 'index']);
        Route::post('/', [RemittanceController::class, 'store']);
        Route::put('{id}', [RemittanceController::class, 'update']);
        Route::patch('{id}/remit', [RemittanceController::class, 'remit']);
        Route::patch('{id}/unremit', [RemittanceController::class, 'unremit']);
    });

    /*
    |----------------------------------------------------------------------
    | Revenue Reports
    |----------------------------------------------------------------------
    */
    Route::prefix('revenue-reports')->group(function () {
        Route::get('daily', [RevenueReportController::class, 'daily']);
        Route::get('monthly', [RevenueReportController::class, 'monthly']);
        Route::get('yearly', [RevenueReportController::class, 'yearly']);
    });
    Route::prefix('remittance-reports')->group(function () {
        Route::get('daily', [RemittanceReportController::class, 'daily']);
        Route::get('monthly', [RemittanceReportController::class, 'monthly']);
        Route::get('yearly', [RemittanceReportController::class, 'yearly']);
    });
    Route::prefix('billing-reports')->group(function () {
        Route::get('daily', [BillingReportController::class, 'daily']);
        Route::get('monthly', [BillingReportController::class, 'monthly']);
        Route::get('yearly', [BillingReportController::class, 'yearly']);
    });
    Route::prefix('banyera-reports')->group(function () {
        Route::get('daily', [BanyeraReportController::class, 'daily']);
        Route::get('monthly', [BanyeraReportController::class, 'monthly']);
        Route::get('yearly', [BanyeraReportController::class, 'yearly']);
    });
    Route::prefix('bfar-reports')->group(function () {
        Route::get('daily', [BfarReportController::class, 'daily']);
        Route::get('monthly', [BfarReportController::class, 'monthly']);
        Route::get('yearly', [BfarReportController::class, 'yearly']);
    });
    Route::prefix('vehicle-ticket-reports')->group(function () {
        Route::get('daily', [VehicleTicketReportController::class, 'daily']);
        Route::get('monthly', [VehicleTicketReportController::class, 'monthly']);
        Route::get('yearly', [VehicleTicketReportController::class, 'yearly']);
    });
    Route::prefix('fees-reports')->group(function () {
        Route::get('yearly', [FeeReportController::class, 'yearly']);
    });
    Route::prefix('registered-boats-reports')->group(function () {
        Route::get('/', [RegisteredBoatsReportController::class, 'index']);
    });
    Route::prefix('owner-info-reports')->group(function () {
        Route::get('/', [OwnerInfoReportController::class, 'index']);
    });
    Route::prefix('docking-reports')->group(function () {
        Route::get('daily', [DockingReportController::class, 'daily']);
        Route::get('monthly', [DockingReportController::class, 'monthly']);
        Route::get('yearly', [DockingReportController::class, 'yearly']);
    });
    /*
    |----------------------------------------------------------------------
    | Boats
    |----------------------------------------------------------------------
    */
    Route::prefix('boats')->group(function () {
        Route::get('/',                  [BoatController::class, 'index']);       // GET    /api/boats
        Route::post('/',                 [BoatController::class, 'store']);       // POST   /api/boats
        Route::get('{id}',               [BoatController::class, 'show']);        // GET    /api/boats/{id}
        Route::put('{id}',               [BoatController::class, 'update']);      // PUT    /api/boats/{id}
        Route::post('{id}/upload-image', [BoatController::class, 'uploadImage']); // POST   /api/boats/{id}/upload-image
        Route::patch('{id}/archive',     [BoatController::class, 'destroy']);     // PATCH  /api/boats/{id}/archive
        Route::patch('{id}/restore',     [BoatController::class, 'restore']);     // PATCH  /api/boats/{id}/restore
        Route::delete('{id}/permanent',  [BoatController::class, 'forceDelete']); // DELETE /api/boats/{id}/permanent
    });

    /*
    |----------------------------------------------------------------------
    | Dockings
    |----------------------------------------------------------------------
    */
    Route::get('docking-calendar', [DockingController::class, 'calendar']);

    Route::prefix('dockings')->group(function () {
        Route::get('/',         [DockingController::class, 'index']);   // GET    /api/dockings
        Route::post('/',        [DockingController::class, 'store'])->middleware('transactions.unlocked');   // POST   /api/dockings
        Route::get('{id}',      [DockingController::class, 'show']);    // GET    /api/dockings/{id}
        Route::put('{id}',      [DockingController::class, 'update'])->middleware('transactions.unlocked');  // PUT    /api/dockings/{id}
        Route::patch('{id}/void', [DockingController::class, 'void'])->middleware('transactions.unlocked');
        Route::patch('{id}/restore', [DockingController::class, 'unvoid'])->middleware('transactions.unlocked');
        Route::delete('{id}',   [DockingController::class, 'destroy'])->middleware('transactions.unlocked'); // DELETE /api/dockings/{id}
    });

    Route::get('fish-classifications', [BanyeraTransactionController::class, 'classifications']);
    Route::post('fish-classifications', [BanyeraTransactionController::class, 'storeClassification']);
    Route::put('fish-classifications/{id}', [BanyeraTransactionController::class, 'updateClassification']);
    Route::delete('fish-classifications/{id}', [BanyeraTransactionController::class, 'destroyClassification']);
    Route::patch('fish-classifications/{id}/restore', [BanyeraTransactionController::class, 'restoreClassification']);
    Route::get('banyera-transactions', [BanyeraTransactionController::class, 'index']);
    Route::post('banyera-transactions', [BanyeraTransactionController::class, 'store'])->middleware('transactions.unlocked');
    Route::put('banyera-transactions/{id}', [BanyeraTransactionController::class, 'update'])->middleware('transactions.unlocked');
    Route::patch('banyera-transactions/{id}/void', [BanyeraTransactionController::class, 'void'])->middleware('transactions.unlocked');
    Route::patch('banyera-transactions/{id}/restore', [BanyeraTransactionController::class, 'unvoid'])->middleware('transactions.unlocked');
    Route::delete('banyera-transactions/{id}', [BanyeraTransactionController::class, 'destroy'])->middleware('transactions.unlocked');

    /*
    |----------------------------------------------------------------------
    | Archives
    |----------------------------------------------------------------------
    */
    Route::get('archives', [ArchiveController::class, 'index']); // GET /api/archives
});
