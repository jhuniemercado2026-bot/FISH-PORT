<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('boats', function (Blueprint $table) {
            $table->id('boat_id');
            $table->string('boat_name', 50);
            $table->foreignId('owner_id')->constrained('boat_owners', 'owner_id');
            $table->foreignId('boat_type_id')->constrained('boat_types', 'boat_type_id');
            $table->string('image_path', 255)->nullable();
            $table->enum('status', ['active', 'expired', 'suspended', 'under_repair'])->default('active');
            $table->foreignId('created_by')->nullable()->constrained('users', 'user_id');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('boats');
    }
};
