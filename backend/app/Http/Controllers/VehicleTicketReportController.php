<?php

namespace App\Http\Controllers;

use App\Models\Fee;
use App\Models\VehicleTicket;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VehicleTicketReportController extends Controller
{
    private function formatTicketDateTimeValue($value): ?string
    {
        if (!$value) {
            return null;
        }

        $normalized = str_replace('T', ' ', (string) $value);
        $normalized = substr($normalized, 0, 19);
        if (strlen($normalized) === 10) {
            $normalized .= ' 00:00:00';
        }

        return Carbon::createFromFormat('Y-m-d H:i:s', $normalized, 'Asia/Manila')
            ->format('Y-m-d H:i:s');
    }

    private function applyUserFilter($query, Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId === null || $userId === '' || $userId === 'all') return $query;
        if (!ctype_digit((string) $userId)) abort(400, 'Invalid user filter.');

        return $query->where('vehicle_tickets.created_by', (int) $userId);
    }

    private function buildReportQuery()
    {
        return VehicleTicket::query()
            ->select([
                'vehicle_tickets.ticket_id',
                'vehicle_tickets.control_number',
                'vehicle_tickets.official_receipt_no',
                'vehicle_tickets.vehicle_type_id',
                'vehicle_tickets.plate_number',
                'vehicle_tickets.driver_name',
                'vehicle_tickets.ticket_type',
                'vehicle_tickets.fee_id',
                'vehicle_tickets.daily_fee',
                'vehicle_tickets.banyera_fee',
                'vehicle_tickets.ticket_fee',
                'vehicle_tickets.ticket_date',
                'vehicle_tickets.end_date',
                'vehicle_tickets.created_at',
            ])
            ->with([
                'vehicleType:vehicle_type_id,type_name',
                'fee:fee_id,fee_type_name,amount,vehicle_type_id,boat_type_id,effective_from,effective_to',
            ])
            ->whereNull('voided_at')
            ->orderBy('vehicle_tickets.ticket_date')
            ->orderBy('vehicle_tickets.created_at')
            ->orderBy('vehicle_tickets.ticket_id');
    }

    private function buildResponse($tickets, ?string $ticketType = null, bool $includeFees = false)
    {
        $tickets->transform(function (VehicleTicket $ticket) {
            $ticket->setAttribute(
                'ticket_date',
                $this->formatTicketDateTimeValue($ticket->getRawOriginal('ticket_date'))
            );

            return $ticket;
        });

        $payload = [
            'tickets' => $tickets->toArray(),
            'ticket_type' => $ticketType,
            'total_records' => $tickets->count(),
            'total_ticket_fee' => (float) $tickets->sum('ticket_fee'),
        ];

        if ($includeFees) {
            $payload['fees'] = Fee::forFormLookup()
                ->orderBy('fee_type_name')
                ->orderBy('effective_from', 'desc')
                ->get()
                ->toArray();
        }

        return response()->json($payload);
    }

    public function daily(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'ticket_type' => ['required', Rule::in(['daily', 'annual'])],
        ]);

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();
        $query = $this->buildReportQuery()
            ->where('vehicle_tickets.ticket_type', $validated['ticket_type'])
            ->whereDate('vehicle_tickets.ticket_date', $date);

        return $this->buildResponse($this->applyUserFilter($query, $request)->get(), $validated['ticket_type'], $validated['ticket_type'] === 'daily');
    }

    public function monthly(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'regex:/^(0[1-9]|1[0-2])$/'],
            'year' => ['required', 'digits:4'],
            'ticket_type' => ['required', Rule::in(['daily', 'annual'])],
        ]);

        $query = $this->buildReportQuery()
            ->where('vehicle_tickets.ticket_type', $validated['ticket_type'])
            ->whereYear('vehicle_tickets.ticket_date', (int) $validated['year'])
            ->whereMonth('vehicle_tickets.ticket_date', (int) $validated['month']);

        return $this->buildResponse($this->applyUserFilter($query, $request)->get(), $validated['ticket_type'], $validated['ticket_type'] === 'daily');
    }

    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
            'ticket_type' => ['required', Rule::in(['daily', 'annual'])],
        ]);

        $query = $this->buildReportQuery()
            ->where('vehicle_tickets.ticket_type', $validated['ticket_type'])
            ->whereYear('vehicle_tickets.ticket_date', (int) $validated['year']);

        return $this->buildResponse($this->applyUserFilter($query, $request)->get(), $validated['ticket_type'], $validated['ticket_type'] === 'daily');
    }
}
