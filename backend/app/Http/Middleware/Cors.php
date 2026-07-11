<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class Cors
{
    public function handle(Request $request, Closure $next)
    {
        $allowedOrigins = [
            'http://localhost:3000',  // React dev server
            'http://127.0.0.1:3000',
            'http://localhost:5173',  // Vite dev server
            'http://127.0.0.1:5173',
        ];

        $origin = $request->headers->get('Origin');

        // Handle preflight OPTIONS requests immediately
        if ($request->getMethod() === 'OPTIONS') {
            $response = response('', 204);
        } else {
            $response = $next($request);
        }

        $isLocalhostOrigin = is_string($origin)
            && preg_match('#^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?$#', $origin);

        if (in_array($origin, $allowedOrigins) || $isLocalhostOrigin) {
            $response->header('Access-Control-Allow-Origin',      $origin)
                     ->header('Access-Control-Allow-Methods',     'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                     ->header('Access-Control-Allow-Headers',     'Content-Type, Authorization, Accept, X-Requested-With, X-CSRF-TOKEN')
                     ->header('Access-Control-Allow-Credentials', 'true')
                     ->header('Access-Control-Max-Age',           '86400'); // cache preflight for 24hrs
        }

        return $response;
    }
}
