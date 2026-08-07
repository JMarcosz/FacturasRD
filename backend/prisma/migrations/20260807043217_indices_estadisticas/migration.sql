-- CreateIndex
CREATE INDEX "exportaciones_createdAt_idx" ON "exportaciones"("createdAt");

-- CreateIndex
CREATE INDEX "facturas_fechaComprobante_idx" ON "facturas"("fechaComprobante");

-- CreateIndex
CREATE INDEX "facturas_clienteId_formato_idx" ON "facturas"("clienteId", "formato");

-- CreateIndex
CREATE INDEX "facturas_periodoId_idx" ON "facturas"("periodoId");

-- CreateIndex
CREATE INDEX "facturas_documentoId_idx" ON "facturas"("documentoId");

-- CreateIndex
CREATE INDEX "validaciones_facturaId_severidad_idx" ON "validaciones"("facturaId", "severidad");
