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
            $response->headers->set('Access-Control-Allow-Origin',      $origin);
            $response->headers->set('Access-Control-Allow-Methods',     'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers',     'Content-Type, Authorization, Accept, X-Requested-With, X-CSRF-TOKEN');
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->headers->set('Access-Control-Max-Age',           '86400'); // cache preflight for 24hrs
            $response->headers->set('Access-Control-Expose-Headers',    'Content-Disposition');
        }

        return $response;
    }
}
