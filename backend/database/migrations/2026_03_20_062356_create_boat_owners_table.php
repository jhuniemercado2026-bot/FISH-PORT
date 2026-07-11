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
        Schema::create('boat_owners', function (Blueprint $table) {
            $table->id('owner_id');
            $table->string('owner_firstname', 50);
            $table->string('owner_lastname', 50);
            $table->text('address');
            $table->string('contact_number', 11)->nullable();
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
        Schema::dropIfExists('boat_owners');
    }
};
