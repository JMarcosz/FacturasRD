-- CreateEnum
CREATE TYPE "OrigenCliente" AS ENUM ('MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "confirmado" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "origen" "OrigenCliente" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "rncVerificado" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "clasificacionConfirmada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "reglas_comercio" (
    "id" TEXT NOT NULL,
    "rnc" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clienteId" TEXT,
    "formato" "FormatoDgii",
    "tipoIngreso" TEXT,
    "formaVenta" TEXT,
    "tipoBienesServicios" TEXT,
    "formaPago" TEXT,
    "vecesAplicada" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_comercio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reglas_comercio_rnc_key" ON "reglas_comercio"("rnc");

-- AddForeignKey
ALTER TABLE "reglas_comercio" ADD CONSTRAINT "reglas_comercio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
