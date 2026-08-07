-- CreateTable
CREATE TABLE "cliente_rnc_alias" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "rnc" TEXT NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_rnc_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_rnc_alias_rnc_key" ON "cliente_rnc_alias"("rnc");

-- CreateIndex
CREATE INDEX "cliente_rnc_alias_clienteId_idx" ON "cliente_rnc_alias"("clienteId");

-- AddForeignKey
ALTER TABLE "cliente_rnc_alias" ADD CONSTRAINT "cliente_rnc_alias_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
