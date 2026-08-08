-- Backfill: preserva correcciones manuales de rncCedula que hoy pueden haber
-- divergido de identificacionEmisor/identificacionReceptor (un PATCH normal
-- nunca las resincronizaba). A partir de esta migración el valor declarado
-- siempre se deriva en vivo de formato + identificacionEmisor/identificacionReceptor
-- (ver dgii/rnc.ts:identificacionDeclarada), así que cualquier corrección que
-- solo vivía en rncCedula se pierde si no se copia primero al lado
-- correspondiente antes de eliminar la columna.
UPDATE "facturas"
SET "identificacionReceptor" = "rncCedula"
WHERE "formato" = 'F607'::"FormatoDgii"
  AND "rncCedula" <> ''
  AND "rncCedula" IS DISTINCT FROM "identificacionReceptor";

UPDATE "facturas"
SET "identificacionEmisor" = "rncCedula"
WHERE "formato" = 'F606'::"FormatoDgii"
  AND "rncCedula" <> ''
  AND "rncCedula" IS DISTINCT FROM "identificacionEmisor";

-- AlterTable
ALTER TABLE "facturas" DROP COLUMN "rncCedula";
