-- DropIndex
DROP INDEX "documentos_periodoId_sha256_key";

-- AlterTable
ALTER TABLE "documentos" ALTER COLUMN "periodoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "formato" "FormatoDgii",
ALTER COLUMN "periodoId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "documentos_sha256_key" ON "documentos"("sha256");

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

