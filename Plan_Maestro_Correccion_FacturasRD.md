# Plan Maestro de Corrección — FacturasRD

## Objetivo

Optimizar la digitalización y clasificación de facturas con Gemini 2.5 Flash para procesar grandes volúmenes (100–1,000+ facturas) reduciendo tokens y aumentando la precisión.

La estrategia central es:

> **Gemini ve e interpreta. El Schema estructura. TypeScript valida. Gemini solo vuelve a intervenir cuando realmente existe una duda.**

---

# 1. Arquitectura objetivo

```text
                    FACTURA / PDF / IMAGEN
                              │
                              ▼
                 ┌────────────────────────┐
                 │ Gemini 2.5 Flash       │
                 │                        │
                 │ Prompt OCR corto       │
                 │ + JSON Schema          │
                 └───────────┬────────────┘
                             │
                             ▼
                    JSON EXTRAÍDO
                             │
                             ▼
                 ┌──────────────────────┐
                 │ VALIDACIÓN LOCAL     │
                 │ TypeScript           │
                 └──────────┬───────────┘
                            │
                 ┌──────────┴───────────┐
                 │                      │
              VÁLIDO                 SOSPECHOSO
                 │                      │
                 ▼                      ▼
             GUARDAR              RETRY ESPECÍFICO
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                             RNC       NCF      FECHA
                              │         │         │
                              └─────────┼─────────┘
                                        ▼
                                  RESULTADO FINAL
                                        │
                                        ▼
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                    CLASIFICAR 606                CLASIFICAR 607
```

---

# 2. Principio fundamental

No se debe intentar meter toda la lógica de FacturasRD dentro del prompt.

Separar responsabilidades:

### Gemini

Responsable de:

- Interpretar visualmente la factura.
- Identificar emisor y receptor.
- Asociar identificadores a entidades.
- Identificar NCF.
- Identificar la fecha de emisión.
- Extraer líneas de detalle.
- Extraer montos.
- Resolver ambigüedades visuales/contextuales.

### JSON Schema

Responsable de:

- Estructura de salida.
- Tipos.
- Campos.
- Nullable.
- Arrays.
- Enums.
- Descripciones de campos.

### Backend / TypeScript

Responsable de:

- Validación de RNC/Cédula.
- Validación de NCF.
- Validación de fechas.
- Validación de montos.
- Consistencia entre campos.
- Detección de posibles inversiones emisor/receptor.
- Determinar si se necesita retry.

### Gemini Retry

Responsable únicamente de resolver campos concretos que fallaron.

### Clasificadores 606/607

Trabajan sobre el JSON extraído, no sobre la imagen, siempre que la información extraída sea suficiente.

---

# 3. Estructura recomendada

```text
src/
├── extraccion/
│   ├── gemini/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   └── gemini.service.ts
│   │
│   ├── validation/
│   │   ├── rnc.validator.ts
│   │   ├── ncf.validator.ts
│   │   ├── date.validator.ts
│   │   ├── amount.validator.ts
│   │   ├── entity.validator.ts
│   │   └── extraction.validator.ts
│   │
│   ├── retry/
│   │   ├── retry-rnc.ts
│   │   ├── retry-ncf.ts
│   │   ├── retry-date.ts
│   │   └── retry-entities.ts
│   │
│   └── classification/
│       ├── 606/
│       └── 607/
```

---

# 4. Prompt OCR principal

El prompt principal debe ser pequeño y concentrarse exclusivamente en interpretación visual/fiscal.

```text
Eres un extractor fiscal especializado en comprobantes de República Dominicana.

Analiza visualmente la factura y extrae únicamente información sustentada por el documento.

REGLAS CRÍTICAS:

1. Identifica correctamente EMISOR y RECEPTOR según su rol en la operación, no solamente por posición visual.
   - EMISOR = quien vende o presta el servicio.
   - RECEPTOR = quien compra o recibe el servicio.
   - En servicios públicos, telecomunicaciones, agua y electricidad, la empresa prestadora es el emisor y el abonado es el receptor.

2. Asocia cada RNC/Cédula con la entidad a la que pertenece. Nunca intercambies RNC/Cédula, NCF, teléfono, cuenta, contrato, medidor u otros números.

3. Extrae el NCF fiscal real. No inventes caracteres, no completes ceros y no confundas NCF con RNC/Cédula.

4. `fechaEmision` debe ser la fecha correspondiente a la emisión del comprobante. No la sustituyas automáticamente por vencimiento, pago, corte, consumo, período, firma digital o certificación.

5. Extrae los nombres exactamente como aparecen. No reconstruyas nombres usando conocimiento externo.

6. No calcules ni inventes valores que no aparezcan en el documento.

7. Si un dato no puede determinarse con evidencia suficiente, devuelve `null`.

8. Conserva todos los dígitos y ceros de identificadores fiscales.

9. Devuelve únicamente los datos solicitados por el esquema.

La precisión fiscal es más importante que completar todos los campos.
```

---

# 5. JSON Schema

La estructura JSON no debe describirse extensamente dentro del prompt.

Debe enviarse mediante `responseSchema`.

Ejemplo:

```typescript
const CAMPO_TEXTO: Schema = {
  type: Type.STRING,
  nullable: true,
};

const CAMPO_MONTO: Schema = {
  type: Type.STRING,
  nullable: true,
  description: "Monto numérico sin símbolo monetario ni separadores de miles.",
};

const CAMPO_FECHA: Schema = {
  type: Type.STRING,
  nullable: true,
  description: "Fecha de emisión en formato YYYY-MM-DD.",
};
```

Ejemplo de propiedades:

```typescript
export const ESQUEMA_HECHOS: Schema = {
  type: Type.OBJECT,
  properties: {
    rncEmisor: {
      ...CAMPO_TEXTO,
      description: "RNC o cédula del emisor, únicamente dígitos.",
    },

    nombreEmisor: {
      ...CAMPO_TEXTO,
      description: "Nombre fiscal/comercial del emisor tal como aparece.",
    },

    rncReceptor: {
      ...CAMPO_TEXTO,
      description: "RNC o cédula del receptor, únicamente dígitos.",
    },

    nombreReceptor: {
      ...CAMPO_TEXTO,
      description: "Nombre del receptor tal como aparece.",
    },

    ncf: {
      ...CAMPO_TEXTO,
      description: "NCF principal del comprobante.",
    },

    ncfModificado: {
      ...CAMPO_TEXTO,
      description: "NCF afectado por nota de crédito/débito.",
    },

    fechaEmision: {
      ...CAMPO_FECHA,
    },

    // resto de propiedades...
  },
};
```

Configuración:

```typescript
config: {
  responseMimeType: "application/json",
  responseSchema: ESQUEMA_HECHOS,
}
```

---

# 6. Validadores locales

## RNC / Cédula

```typescript
export function isValidRncOrCedula(value: string | null): boolean {
  if (!value) return false;

  return /^\d{9}$/.test(value) ||
         /^\d{11}$/.test(value);
}
```

## NCF

```typescript
export function isValidNcf(value: string | null): boolean {
  if (!value) return false;

  return /^[A-Z]\d{10}$/.test(value) ||
         /^E\d{12}$/.test(value);
}
```

## Fecha

```typescript
export function isValidDate(value: string | null): boolean {
  if (!value) return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}
```

## Monto

```typescript
export function isValidAmount(value: string | null): boolean {
  if (value === null) return true;

  return /^\d+(\.\d+)?$/.test(value);
}
```

---

# 7. Quality Gate

Después de cada extracción:

```text
Extraction
    ↓
Quality Gate
```

Modelo:

```typescript
interface ValidationIssue {
  field: string;
  code: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  requiresReview: boolean;
  issues: ValidationIssue[];
}
```

Ejemplo:

```typescript
function validateExtraction(data: Hechos): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (data.rncEmisor && !isValidRncOrCedula(data.rncEmisor)) {
    issues.push({
      field: "rncEmisor",
      code: "INVALID_IDENTIFIER",
      severity: "error",
    });
  }

  if (data.ncf && !isValidNcf(data.ncf)) {
    issues.push({
      field: "ncf",
      code: "INVALID_NCF",
      severity: "error",
    });
  }

  if (data.fechaEmision && !isValidDate(data.fechaEmision)) {
    issues.push({
      field: "fechaEmision",
      code: "INVALID_DATE",
      severity: "error",
    });
  }

  return {
    valid: issues.length === 0,
    requiresReview: issues.length > 0,
    issues,
  };
}
```

---

# 8. Sistema de Retry especializado

No volver a enviar la factura con el prompt completo cuando falle un campo.

Ejemplo:

```text
Factura
  ↓
Gemini
  ↓
RNC ✓
NCF ✓
Monto ✓
Fecha ❌
  ↓
Retry FECHA
```

No:

```text
Imagen + prompt gigante completo
```

---

# 9. Prompt de recuperación de fecha

```text
Revisa exclusivamente la FECHA DE EMISIÓN de esta factura fiscal dominicana.

Necesito identificar la fecha asociada al comprobante/factura.

No utilices automáticamente:
- fecha de vencimiento;
- fecha de pago;
- fecha de corte;
- fecha de consumo;
- período facturado;
- fecha de firma digital;
- fecha de certificación.

Selecciona únicamente una fecha que el documento identifique o relacione claramente con la emisión del comprobante.

Si existen varias fechas y no existe evidencia suficiente para distinguir la fecha de emisión, devuelve null.

Devuelve únicamente:

{
  "fechaEmision": "YYYY-MM-DD" | null
}
```

---

# 10. Prompt de recuperación de RNC/Cédula

```text
Revisa exclusivamente los identificadores fiscales de esta factura.

Identifica el RNC o Cédula del EMISOR y del RECEPTOR.

EMISOR = quien vende o presta el servicio.
RECEPTOR = quien compra o recibe el servicio.

No confundas RNC/Cédula con:
- NCF;
- teléfono;
- número de cliente;
- número de cuenta;
- número de contrato;
- número de medidor;
- orden de compra.

RNC = 9 dígitos.
Cédula = 11 dígitos.

Conserva los ceros iniciales y elimina únicamente separadores como guiones o espacios.

Si no existe evidencia suficiente, devuelve null.

Devuelve únicamente:

{
  "rncEmisor": string | null,
  "rncReceptor": string | null
}
```

---

# 11. Prompt de recuperación de NCF

```text
Revisa exclusivamente los comprobantes fiscales de esta factura.

Identifica:

1. NCF principal.
2. NCF modificado, únicamente si existe.

NCF tradicional:
1 letra + 10 dígitos.

e-CF:
E + 12 dígitos.

No confundas NCF con RNC, número de factura interna, orden de compra, cliente o contrato.

No inventes caracteres.
No completes ceros.
No elimines ceros pertenecientes al NCF.

Si un NCF modificado no está explícitamente identificado, devuelve null.

Devuelve únicamente:

{
  "ncf": string | null,
  "ncfModificado": string | null
}
```

---

# 12. Prompt de recuperación de emisor/receptor

```text
Revisa exclusivamente los roles de las entidades de esta factura.

Determina:

EMISOR:
Entidad que vende el bien o presta el servicio y emite el comprobante.

RECEPTOR:
Entidad que compra el bien o recibe el servicio.

No utilices únicamente la posición de los nombres en la factura.

Utiliza las etiquetas y el contexto de la operación:
- Emisor
- Proveedor
- Vendedor
- Cliente
- Comprador
- Facturado a
- Abonado
- Titular
- Receptor

En servicios de electricidad, agua y telecomunicaciones, la empresa prestadora es el EMISOR y el abonado es el RECEPTOR.

Extrae los nombres exactamente como aparecen.
No reconstruyas nombres mediante conocimiento externo.

Devuelve únicamente:

{
  "nombreEmisor": string | null,
  "rncEmisor": string | null,
  "nombreReceptor": string | null,
  "rncReceptor": string | null
}
```

---

# 13. Separar extracción de clasificación

No mezclar:

```text
IMAGEN
↓
Extracción + 606 + 607
```

Usar:

```text
IMAGEN
↓
EXTRACCIÓN
↓
JSON
↓
VALIDACIÓN
↓
606 / 607
```

La clasificación debe utilizar el JSON extraído siempre que sea suficiente.

---

# 14. Clasificador 606

Entrada:

```json
{
  "nombreEmisor": "EDESUR DOMINICANA",
  "rncEmisor": "101618787",
  "lineas": [
    {
      "descripcion": "Servicio de energía eléctrica",
      "cantidad": "1",
      "precioUnitario": "5000",
      "importe": "5000"
    }
  ],
  "montoTotal": "5900",
  "formaPagoImpresa": "Crédito"
}
```

Prompt:

```text
Clasifica esta adquisición para el Formato 606 de la DGII.

Determina la naturaleza REAL de los bienes o servicios adquiridos utilizando principalmente las líneas de detalle y el contexto del proveedor.

Códigos:

01 = Gastos de personal
02 = Trabajos, suministros y servicios
03 = Arrendamientos
04 = Gastos de activos fijos
05 = Gastos de representación
06 = Otras deducciones admitidas
07 = Gastos financieros
08 = Gastos extraordinarios
09 = Compras y gastos que forman parte del costo de venta
10 = Adquisiciones de activos
11 = Seguros

Reglas:
- Mercancía para reventa, materia prima o insumos productivos → 09.
- Servicios operativos como electricidad, agua, telecomunicaciones y suministros → 02.
- Alquileres → 03.
- Adquisición de activos → 10.
- Seguros → 11.
- No clasifiques por una palabra aislada.
- No inventes información.
- Si la información es insuficiente, utiliza la clasificación más sustentada y marca `requiereRevision: true`.

Devuelve únicamente el JSON definido por el schema.
```

---

# 15. Clasificador 607

Prompt:

```text
Clasifica esta operación de venta para el Formato 607 de la DGII.

Determina el tipo de ingreso según la naturaleza REAL del bien o servicio vendido.

Códigos:

01 = Ingresos por operaciones
02 = Ingresos financieros
03 = Ingresos extraordinarios
04 = Ingresos por arrendamientos
05 = Ingresos por venta de activo depreciable
06 = Otros ingresos

Reglas:
- Clasifica según lo vendido, no según el nombre del cliente.
- Venta habitual de productos o servicios → 01.
- Intereses, rendimientos o ingresos financieros → 02.
- Arrendamientos → 04.
- Venta de activos depreciables → 05.
- No utilices 06 simplemente porque el concepto sea poco claro.
- No inventes información.
- Si la naturaleza de la operación no puede determinarse razonablemente, marca `requiereRevision: true`.

Devuelve únicamente el JSON definido por el schema.
```

---

# 16. Catálogos y reglas fiscales

Los catálogos 606/607 y las reglas fiscales deben tener una fuente/versionado en el backend.

No depender exclusivamente del conocimiento del modelo.

Recomendación:

```text
src/
└── fiscal/
    ├── dgii/
    │   ├── 606/
    │   ├── 607/
    │   └── versions/
    └── catalogs/
```

Cuando cambien los catálogos o instructivos de la DGII, actualizar esta capa.

---

# 17. Concurrencia

Para 100–1,000 facturas:

No enviar las 1,000 simultáneamente.

Comenzar con:

```typescript
const CONCURRENCY = 5;
```

Medir:

- RPM;
- errores;
- latencia;
- throughput;
- costo.

Después probar:

```text
5
10
15
20
```

hasta encontrar el punto óptimo.

Más concurrencia no necesariamente significa mayor velocidad.

---

# 18. Métricas

Guardar métricas por factura:

```typescript
interface AiExtractionMetrics {
  model: string;
  promptVersion: string;

  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;

  durationMs: number;

  initialExtractionValid: boolean;
  retryPerformed: boolean;
  retryReason?: string;

  finalValid: boolean;
}
```

Esto permitirá medir:

```text
RNC:
97.8% correcto primera llamada

NCF:
99.1%

Fecha:
91.3%

Emisor/receptor:
88.7%
```

Los porcentajes son ejemplos; deben calcularse con datos reales.

---

# 19. Versionado de prompts

No mantener un único prompt que se modifica constantemente.

Usar:

```text
prompts/
├── extraction/
│   ├── v1.ts
│   └── v2.ts
│
├── retry/
│   ├── rnc.v1.ts
│   ├── ncf.v1.ts
│   ├── date.v1.ts
│   └── entities.v1.ts
│
├── classification/
│   ├── 606.v1.ts
│   └── 607.v1.ts
```

Guardar con cada análisis:

```text
promptVersion = "extraction-v2"
```

Esto permitirá comparar versiones.

---

# 20. Caching

Gemini 2.5 Flash dispone de caching implícito.

Por eso el prompt común debe ser exactamente igual para todas las facturas y colocarse antes del contenido específico de cada factura.

Patrón:

```text
PROMPT BASE
SCHEMA
FACTURA
```

Evitar introducir información variable antes del prompt común.

Medir `usage.total_cached_tokens` para saber si realmente se está reutilizando contexto.

No implementar caching explícito como primera optimización.

Primero:

1. Prompt corto.
2. Schema.
3. Validadores.
4. Retries.
5. Clasificación separada.
6. Métricas.

Después evaluar caching explícito si sigue siendo necesario.

---

# 21. Flujo definitivo

```text
                    FACTURA
                       │
                       ▼
             ┌──────────────────┐
             │ Gemini Extraction│
             │                  │
             │ Prompt corto     │
             │ JSON Schema      │
             └────────┬─────────┘
                      │
                      ▼
                EXTRACTION JSON
                      │
                      ▼
             ┌──────────────────┐
             │ Local Validator  │
             └────────┬─────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
           OK                 ERROR
            │                   │
            │             ┌─────┴─────┐
            │             ▼           ▼
            │           NCF         FECHA
            │             │           │
            │             └─────┬─────┘
            │                   ▼
            │             Gemini Retry
            │                   │
            └──────────┬────────┘
                       ▼
                DATOS DEFINITIVOS
                       │
          ┌────────────┴────────────┐
          │                         │
       COMPRA                     VENTA
          │                         │
          ▼                         ▼
    Gemini 606                  Gemini 607
          │                         │
          ▼                         ▼
      CLASIFICACIÓN             CLASIFICACIÓN
          │                         │
          └────────────┬────────────┘
                       ▼
                      DB
```

---

# 22. Orden exacto de implementación

## Sprint 1 — Extracción

1. Mantener `ESQUEMA_HECHOS`.
2. Reemplazar prompt actual por prompt corto.
3. Activar Structured Output.
4. Implementar validadores de:
   - RNC;
   - Cédula;
   - NCF;
   - fecha;
   - monto.

## Sprint 2 — Recovery

5. Implementar:
   - `retryRnc()`
   - `retryNcf()`
   - `retryDate()`
   - `retryEntities()`
6. Crear Quality Gate.
7. Ejecutar retries únicamente cuando existan problemas.

## Sprint 3 — Clasificación

8. Separar extracción de clasificación.
9. Clasificador 606 recibe JSON.
10. Clasificador 607 recibe JSON.

## Sprint 4 — Escalabilidad

11. Implementar concurrencia controlada.
12. Medir tokens.
13. Medir tokens cacheados.
14. Medir latencia.
15. Medir retries.

## Sprint 5 — Optimización avanzada

16. Evaluar caching explícito.
17. Crear dataset de facturas reales.
18. Medir precisión por campo.
19. Ajustar únicamente las reglas que realmente generan errores.

---

# 23. Resultado esperado

### Antes

```text
1 factura
   ↓
Prompt enorme
   ↓
Gemini
```

Con 1,000:

```text
1000 × prompt enorme
```

### Después

```text
1 factura
   ↓
Prompt pequeño
+
Schema
   ↓
Gemini
   ↓
Validación TypeScript
   ↓
Mayoría → terminado

Casos problemáticos
   ↓
Retry específico
```

La clasificación:

```text
JSON extraído
   ↓
Prompt pequeño
   ↓
606 / 607
```

---

# 24. Prioridad recomendada

La prioridad para implementar es:

1. **Prompt OCR corto.**
2. **JSON Schema completo.**
3. **Validadores determinísticos.**
4. **Quality Gate.**
5. **Retries especializados.**
6. **Separación de extracción y clasificación.**
7. **Métricas.**
8. **Concurrencia controlada.**
9. **Medición de caching.**
10. **Caching explícito si los resultados lo justifican.**

## Principio final

> **No intentes convertir a Gemini en todo el sistema fiscal.**

Gemini debe ser el **lector fiscal inteligente**.

Tu backend debe ser el **auditor determinístico**.

Esta separación permite procesar grandes volúmenes con menor consumo de tokens, menor cantidad de reintentos y mayor control sobre errores de RNC, NCF, fechas, emisor/receptor, montos y clasificación.
