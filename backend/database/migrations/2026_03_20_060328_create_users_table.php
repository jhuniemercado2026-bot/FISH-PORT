<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('email', 150)->unique();
            $table->string('password');
            $table->enum('role', ['head', 'coordinator', 'inspector']);
            $table->enum('status', ['online', 'offline', 'deactivated'])->default('offline');
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->enum('gender', ['male', 'female'])->nullable();
            $table->string('contact_number', 50)->nullable();
            $table->date('birthday')->nullable();
            $table->text('address')->nullable();
            $table->string('profile_image', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')
                  ->references('user_id')
                  ->on('users')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
