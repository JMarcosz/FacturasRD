/**
 * Catálogo centralizado y versionado de Prompts para FacturasRD (Gemini 2.5 Flash).
 * Estructurado para máximo token caching y mínima redundancia.
 */

export const PROMPT_VERSION = 'extraction-v2';

/**
 * Prompt OCR Principal Conciso (Sprint 1 - Sección 4 del Plan Maestro).
 */
export const PROMPT_OCR_CORTO = `Eres un extractor fiscal especializado en comprobantes de República Dominicana.

Analiza visualmente la factura y extrae únicamente información sustentada por el documento.

REGLAS CRÍTICAS:
1. Identifica EMISOR y RECEPTOR:
   - EMISOR = quien vende o presta el servicio. Busca activamente en los márgenes superiores y letras pequeñas.
   - RECEPTOR = quien compra ("Facturado a:", "Cliente:", "Abonado:").
   - En EDEESTE, Claro y CAASD, la empresa prestadora es el EMISOR.

2. Identificadores Fiscales (RNC/Cédula):
   - Los RNC de grandes empresas suelen estar formateados con guiones (Ej: 1-01-82021-7 o 1-01-00157-7). 
   - Si encuentras un patrón similar, extrae los números, elimina TODOS los guiones y espacios, y devuelve únicamente los 9 dígitos limpios (Ej: 101820217).
   - NUNCA intercambies RNC del Emisor con el del Receptor.

3. Formato estricto de NCF (Autocorrección):
   - Un NCF tradicional SIEMPRE inicia con la letra 'B' mayúscula seguida de 10 dígitos. NUNCA empieza con números. Si el OCR lee "801...", debes corregirlo a "B01...".
   - Un e-CF SIEMPRE inicia con la letra 'E' mayúscula seguida de 12 dígitos. NUNCA empieza con 'F'. Si el OCR lee "F31...", debes corregirlo y buscar los ceros omitidos (Ej: "E31000...").

4. fechaEmision debe ser YYYY-MM-DD. En facturas electrónicas e-CF con fecha borrosa, toma la fecha de la firma digital.

5. Si un dato no existe, devuelve null. No inventes valores.`;

/**
 * Prompt de Recuperación Especializada de Fecha (Sección 9 del Plan Maestro).
 */
export const PROMPT_RETRY_FECHA = `Revisa exclusivamente la FECHA DE EMISIÓN de esta factura fiscal dominicana.

Necesito identificar la fecha asociada al comprobante/factura.

No utilices automáticamente:
- fecha de vencimiento;
- fecha de pago;
- fecha de corte;
- fecha de consumo;
- período facturado.

En comprobantes fiscales electrónicos (e-CF), si la fecha principal no es legible, extrae la fecha del sello de firma digital o certificación.

Devuelve ÚNICAMENTE un JSON con:
{
  "fechaEmision": "YYYY-MM-DD" | null
}`;

/**
 * Prompt de Recuperación Especializada de RNC / Cédula (Sección 10 del Plan Maestro).
 */
export const PROMPT_RETRY_RNC = `Revisa exclusivamente los identificadores fiscales de esta factura dominicana.

Presta especial atención a los márgenes superiores y a letras pequeñas.
Identifica el RNC o Cédula del EMISOR y del RECEPTOR.

RNC = 9 dígitos.
Cédula = 11 dígitos.

REGLA VITAL: Los RNC a menudo se imprimen con guiones (Ej: "1-01-82021-7"). Si detectas este formato, remueve los guiones y forma un string numérico continuo de 9 dígitos.

Devuelve ÚNICAMENTE un JSON con:
{
  "rncEmisor": string | null,
  "rncReceptor": string | null
}`;

/**
 * Prompt de Recuperación Especializada de NCF (Sección 11 del Plan Maestro).
 */
export const PROMPT_RETRY_NCF = `Revisa exclusivamente los comprobantes fiscales de esta factura.

Identifica:
1. NCF principal (NCF tradicional: 1 letra + 10 dígitos; e-CF: E + 12 dígitos).
2. NCF modificado (únicamente si existe en nota de crédito/débito).

No confundas NCF con RNC, número de factura interna, orden de compra o contrato.
No inventes caracteres ni completes ceros.

Devuelve ÚNICAMENTE un JSON con:
{
  "ncf": string | null,
  "ncfModificado": string | null
}`;

/**
 * Prompt de Recuperación Especializada de Roles Emisor / Receptor (Sección 12 del Plan Maestro).
 */
export const PROMPT_RETRY_ENTIDADES = `Revisa exclusivamente los roles de las entidades de esta factura.

Determina:
- EMISOR: Entidad que vende el bien o presta el servicio y emite el comprobante.
- RECEPTOR: Entidad que compra el bien o recibe el servicio.

En servicios de electricidad, agua y telecomunicaciones, la empresa prestadora es el EMISOR y el abonado es el RECEPTOR.

Extrae los nombres y RNCs exactamente como aparecen.

Devuelve ÚNICAMENTE un JSON con:
{
  "nombreEmisor": string | null,
  "rncEmisor": string | null,
  "nombreReceptor": string | null,
  "rncReceptor": string | null
}`;

/**
 * Prompt de Clasificación 606 sobre JSON (Sección 14 del Plan Maestro).
 */
export const PROMPT_CLASIFICADOR_606 = `Clasifica esta adquisición para el Formato 606 de la DGII.

Determina la naturaleza REAL de los bienes o servicios adquiridos utilizando principalmente las líneas de detalle y el contexto del proveedor.

Códigos Tipo de Bienes y Servicios DGII:
01 = Gastos de personal
02 = Trabajos, suministros y servicios (electricidad, agua, telecomunicaciones, suministros, limpieza)
03 = Arrendamientos
04 = Gastos de activos fijos
05 = Gastos de representación (restaurantes, hoteles, comidas de trabajo)
06 = Otras deducciones admitidas (software, licencias, suscripciones)
07 = Gastos financieros
08 = Gastos extraordinarios
09 = Compras y gastos que forman parte del costo de venta (mercancía para reventa, materia prima)
10 = Adquisiciones de activos (laptops, servidores, maquinaria, vehículos nuevos)
11 = Seguros

Reglas:
- Mercancía para reventa, materia prima o insumos productivos → clasificacion: "COSTO", tipoBienesServicios: "09".
- Servicios operativos, suministros, luz, teléfono, agua → clasificacion: "GASTO", tipoBienesServicios: "02".
- Alquileres → "GASTO", "03".
- Adquisición de activos → "GASTO", "10".
- Seguros → "GASTO", "11".

Devuelve ÚNICAMENTE un JSON con:
{
  "clasificacion": "COSTO" | "GASTO",
  "tipoBienesServicios": "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11",
  "formaPago": "01" | "02" | "03" | "04" | "05" | "06" | "07",
  "confianza": number (entre 0.0 y 1.0),
  "justificacion": string,
  "requiereRevision": boolean
}`;

/**
 * Prompt de Clasificación 607 sobre JSON (Sección 15 del Plan Maestro).
 */
export const PROMPT_CLASIFICADOR_607 = `Clasifica esta operación de venta para el Formato 607 de la DGII.

Determina el tipo de ingreso según la naturaleza REAL del bien o servicio vendido:
01 = Ingresos por operaciones (Venta habitual comercial de productos o servicios)
02 = Ingresos financieros
03 = Ingresos extraordinarios
04 = Ingresos por arrendamientos
05 = Ingresos por venta de activo depreciable
06 = Otros ingresos

Devuelve ÚNICAMENTE un JSON con:
{
  "tipoIngreso": "01" | "02" | "03" | "04" | "05" | "06",
  "confianza": number (entre 0.0 y 1.0),
  "justificacion": string,
  "requiereRevision": boolean
}`;
