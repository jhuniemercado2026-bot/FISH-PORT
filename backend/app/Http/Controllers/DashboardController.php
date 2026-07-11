<?php

namespace App\Http\Controllers;

use App\Models\BanyeraTransaction;
use App\Models\Bill;
use App\Models\Boat;
use App\Models\Docking;
use App\Models\Payment;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;

class DashboardController extends Controller
{
    public function index()
    {
        return response()->json([
            'boats' => Boat::query()
                ->select(['boat_id'])
                ->active()
                ->get(),
            'vehicleTickets' => VehicleTicket::query()
                ->select(['ticket_id', 'ticket_date', 'ticket_fee', 'voided_at', 'created_at'])
                ->get()
                ->map(fn (VehicleTicket $ticket) => [
                    'ticket_id' => $ticket->ticket_id,
                    'ticket_date' => optional($ticket->ticket_date)->toDateString(),
                    'ticket_fee' => (float) $ticket->ticket_fee,
                    'voided_at' => optional($ticket->voided_at)->toIso8601String(),
                    'is_voided' => (bool) $ticket->voided_at,
                    'created_at' => optional($ticket->created_at)->toIso8601String(),
                ]),
            'banyeraTransactions' => BanyeraTransaction::query()
                ->select(['banyera_id', 'boat_id', 'transaction_date', 'total_fee', 'voided_at', 'created_at'])
                ->with([
                    'boat:boat_id,boat_name,boat_type_id',
                    'boat.boatType:boat_type_id,type_name',
                    'items:item_id,banyera_id,classification_id,quantity,subtotal',
                    'items.classification:classification_id,classification_name',
                ])
                ->whereNull('voided_at')
                ->get()
                ->map(fn (BanyeraTransaction $transaction) => [
                    'banyera_id' => $transaction->banyera_id,
                    'transaction_id' => $transaction->banyera_id,
                    'boat_id' => $transaction->boat_id,
                    'transaction_date' => optional($transaction->transaction_date)->toDateString(),
                    'total_fee' => (float) $transaction->total_fee,
                    'created_at' => optional($transaction->created_at)->toIso8601String(),
                    'boat' => $transaction->boat ? [
                        'boat_id' => $transaction->boat->boat_id,
                        'boat_name' => $transaction->boat->boat_name,
                        'boat_type' => $transaction->boat->boatType ? [
                            'type_name' => $transaction->boat->boatType->type_name,
                        ] : null,
                        'boatType' => $transaction->boat->boatType ? [
                            'type_name' => $transaction->boat->boatType->type_name,
                        ] : null,
                    ] : null,
                    'items' => $transaction->items->map(fn ($item) => [
                        'quantity' => (float) $item->quantity,
                        'subtotal' => (float) $item->subtotal,
                        'classification_name' => $item->classification?->classification_name,
                        'classification' => $item->classification ? [
                            'classification_name' => $item->classification->classification_name,
                        ] : null,
                    ])->values(),
                ]),
            'bills' => Bill::query()
                ->select(['bill_id', 'total_amount', 'created_at'])
                ->with(['items:bill_item_id,bill_id,transaction_type,docking_id,banyera_id,amount'])
                ->get()
                ->map(fn (Bill $bill) => [
                    'bill_id' => $bill->bill_id,
                    'total_amount' => (float) $bill->total_amount,
                    'created_at' => optional($bill->created_at)->toIso8601String(),
                    'items' => $bill->items->map(fn ($item) => [
                        'transaction_type' => $item->transaction_type,
                        'docking_id' => $item->docking_id,
                        'banyera_id' => $item->banyera_id,
                        'amount' => (float) $item->amount,
                    ])->values(),
                ]),
            'payments' => Payment::query()
                ->select(['payment_id', 'bill_id', 'amount_paid', 'payment_date', 'created_at'])
                ->get()
                ->map(fn (Payment $payment) => [
                    'payment_id' => $payment->payment_id,
                    'bill_id' => $payment->bill_id,
                    'amount_paid' => (float) $payment->amount_paid,
                    'payment_date' => optional($payment->payment_date)->toDateString(),
                    'created_at' => optional($payment->created_at)->toIso8601String(),
                ]),
            'remittances' => Remittance::query()
                ->select(['remittance_id', 'date', 'amount', 'status', 'created_at'])
                ->get()
                ->map(fn (Remittance $remittance) => [
                    'remittance_id' => $remittance->remittance_id,
                    'date' => optional($remittance->date)->toDateString(),
                    'amount' => (float) $remittance->amount,
                    'status' => $remittance->status,
                    'created_at' => optional($remittance->created_at)->toIso8601String(),
                ]),
            'dockings' => Docking::query()
                ->select(['docking_id', 'boat_id', 'docking_date', 'docking_fee', 'voided_at', 'created_at'])
                ->with(['boat:boat_id,boat_name,boat_type_id', 'boat.boatType:boat_type_id,type_name'])
                ->whereNull('voided_at')
                ->get()
                ->map(fn (Docking $docking) => [
                    'docking_id' => $docking->docking_id,
                    'boat_id' => $docking->boat_id,
                    'docking_date' => optional($docking->docking_date)->toDateString(),
                    'docking_fee' => (float) $docking->docking_fee,
                    'created_at' => optional($docking->created_at)->toIso8601String(),
                    'boat' => $docking->boat ? [
                        'boat_id' => $docking->boat->boat_id,
                        'boat_name' => $docking->boat->boat_name,
                        'boat_type' => $docking->boat->boatType ? [
                            'type_name' => $docking->boat->boatType->type_name,
                        ] : null,
                        'boatType' => $docking->boat->boatType ? [
                            'type_name' => $docking->boat->boatType->type_name,
                        ] : null,
                    ] : null,
                ]),
            'users' => User::query()
                ->select(['user_id'])
                ->get(),
        ]);
    }
}
