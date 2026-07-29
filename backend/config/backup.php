<?php

return [
    'google_drive' => [
        'folder_id' => env('GOOGLE_DRIVE_BACKUP_FOLDER_ID', ''),
        'credentials_path' => env(
            'GOOGLE_DRIVE_CREDENTIALS_PATH',
            storage_path('app/private/google-drive-backup.json')
        ),
        'client_id' => env('GOOGLE_DRIVE_CLIENT_ID', ''),
        'client_secret' => env('GOOGLE_DRIVE_CLIENT_SECRET', ''),
        'refresh_token' => env('GOOGLE_DRIVE_REFRESH_TOKEN', ''),
    ],

    'database' => [
        'connection' => env('DB_BACKUP_CONNECTION', env('DB_CONNECTION')),
        'temp_path' => env('DB_BACKUP_TEMP_PATH', storage_path('app/backups/tmp')),
        'keep_local' => env('DB_BACKUP_KEEP_LOCAL', false),
        'local_path' => env('DB_BACKUP_LOCAL_PATH', storage_path('app/backups/local')),
        'filename_prefix' => env('DB_BACKUP_FILENAME_PREFIX', 'opol_fish_port_backup'),
        'schedule_time' => env('DB_BACKUP_DAILY_TIME', '22:00'),
    ],
];
