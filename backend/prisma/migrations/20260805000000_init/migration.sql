-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CONTADOR');

-- CreateEnum
CREATE TYPE "FormatoDgii" AS ENUM ('F606', 'F607');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'REVISADO', 'EXPORTADO');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('PENDIENTE', 'PROCESANDO', 'EXTRAIDO', 'ERROR');

-- CreateEnum
CREATE TYPE "OrigenFactura" AS ENUM ('IA', 'MANUAL', 'EDITADA');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('ERROR', 'WARNING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'CONTADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "rnc" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoIngresoDefault" TEXT,
    "tasaItbis" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "aplicaProporcionalidad" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "yyyymm" TEXT NOT NULL,
    "formato" "FormatoDgii" NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "paginas" INTEGER,
    "rutaArchivo" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "cuOperationId" TEXT,
    "rawJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "rncCedula" TEXT NOT NULL,
    "tipoIdentificacion" TEXT NOT NULL,
    "ncf" TEXT NOT NULL,
    "ncfModificado" TEXT,
    "fechaComprobante" TIMESTAMP(3),
    "fechaRetencionOPago" TIMESTAMP(3),
    "tipoIngreso" TEXT,
    "tipoBienesServicios" TEXT,
    "formaPago" TEXT,
    "tipoRetencionISR" TEXT,
    "montoFacturado" DECIMAL(18,2) NOT NULL,
    "itbisFacturado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "itbisRetenido" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "itbisPercibido" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retencionRenta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isrPercibido" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isc" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otrosImpuestos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "propinaLegal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "montoServicios" DECIMAL(18,2),
    "montoBienes" DECIMAL(18,2),
    "itbisSujetoProporcionalidad" DECIMAL(18,2),
    "itbisLlevadoCosto" DECIMAL(18,2),
    "itbisPorAdelantar" DECIMAL(18,2),
    "montoEfectivo" DECIMAL(18,2),
    "montoChequeTransferencia" DECIMAL(18,2),
    "montoTarjeta" DECIMAL(18,2),
    "montoVentaCredito" DECIMAL(18,2),
    "montoBonos" DECIMAL(18,2),
    "montoPermuta" DECIMAL(18,2),
    "montoOtrasFormas" DECIMAL(18,2),
    "confidences" JSONB,
    "regionesOrigen" JSONB,
    "revisada" BOOLEAN NOT NULL DEFAULT false,
    "origen" "OrigenFactura" NOT NULL DEFAULT 'IA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_factura" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "precioUnitario" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "clasificacion" TEXT,

    CONSTRAINT "lineas_factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validaciones" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "severidad" "Severidad" NOT NULL,
    "campo" TEXT,
    "mensaje" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportaciones" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "cantidadRegistros" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exportaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_rnc_key" ON "clientes"("rnc");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_clienteId_yyyymm_formato_key" ON "periodos"("clienteId", "yyyymm", "formato");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_periodoId_sha256_key" ON "documentos"("periodoId", "sha256");

-- AddForeignKey
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validaciones" ADD CONSTRAINT "validaciones_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exportaciones" ADD CONSTRAINT "exportaciones_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

