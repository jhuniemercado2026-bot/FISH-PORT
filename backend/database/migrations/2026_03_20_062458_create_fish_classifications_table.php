<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fish_classifications', function (Blueprint $table) {
            $table->id('classification_id');

            $table->string('classification_name', 50)->unique();

            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users', 'user_id');

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fish_classifications');
    }
};
