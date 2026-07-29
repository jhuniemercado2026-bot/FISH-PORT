<?php

use App\Enums\FeeTypeName;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fees', function (Blueprint $table) {
            $table->increments('fee_id');
            $table->enum('fee_type_name', FeeTypeName::values());
            $table->unsignedBigInteger('boat_type_id')->nullable();
            $table->unsignedInteger('vehicle_type_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->integer('created_by');
            $table->timestamps();

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fees');
    }
};
