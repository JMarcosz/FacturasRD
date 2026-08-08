<script setup lang="ts">
import { ref, watch } from 'vue';
import Pastilla from './ui/Pastilla.vue';
import { obtenerDiagnostico } from '../api/documentos';
import { fmtMonto } from '../formato';
import type { Diagnostico } from '../types';

const props = defineProps<{ documentoId: string }>();

const diagnostico = ref<Diagnostico | null>(null);
const cargando = ref(false);

async function cargar() {
  cargando.value = true;
  try {
    diagnostico.value = await obtenerDiagnostico(props.documentoId);
  } finally {
    cargando.value = false;
  }
}

watch(() => props.documentoId, cargar, { immediate: true });

function tonoConfianza(c: number | null): 'ok' | 'alerta' | 'error' | 'neutro' {
  if (c === null) return 'neutro';
  if (c >= 0.9) return 'ok';
  if (c >= 0.8) return 'alerta';
  return 'error';
}

/** El lado declarado a la DGII: emisor en 606, receptor en 607 — ver FacturaDetalleView.vue. */
function identificacionDeclaradaDe(f: {
  formato: string | null;
  identificacionEmisor: string | null;
  identificacionReceptor: string | null;
}): string {
  if (f.formato === 'F607') return f.identificacionReceptor ?? '';
  if (f.formato === 'F606') return f.identificacionEmisor ?? '';
  return '';
}
</script>

<template>
  <div class="diagnostico">
    <p v-if="cargando" class="estado">Cargando…</p>

    <template v-else-if="diagnostico">
      <section class="bloque">
        <h4>Campos que devolvió el modelo</h4>
        <table class="tabla">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Valor</th>
              <th>Confianza</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in diagnostico.camposModelo" :key="c.nombre">
              <td class="tabla__campo">{{ c.nombre }}</td>
              <td>{{ c.valor ?? '—' }}</td>
              <td>
                <Pastilla
                  v-if="c.confidence !== null"
                  :texto="`${Math.round(c.confidence * 100)}%`"
                  :tono="tonoConfianza(c.confidence)"
                />
                <span v-else class="estado">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="diagnostico.factura" class="bloque">
        <h4>Factura final derivada</h4>
        <table class="tabla">
          <tbody>
            <tr>
              <td class="tabla__campo">RNC / Cédula</td>
              <td>{{ identificacionDeclaradaDe(diagnostico.factura) || '—' }}</td>
            </tr>
            <tr>
              <td class="tabla__campo">NCF</td>
              <td>{{ diagnostico.factura.ncf || '—' }}</td>
            </tr>
            <tr>
              <td class="tabla__campo">Fecha comprobante</td>
              <td>{{ diagnostico.factura.fechaComprobante?.slice(0, 10) ?? '—' }}</td>
            </tr>
            <tr>
              <td class="tabla__campo">Monto facturado</td>
              <td>RD$ {{ fmtMonto(diagnostico.factura.montoFacturado) }}</td>
            </tr>
            <tr>
              <td class="tabla__campo">ITBIS facturado</td>
              <td>RD$ {{ fmtMonto(diagnostico.factura.itbisFacturado) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="diagnostico.factura.validaciones.length" class="validaciones">
          <Pastilla
            v-for="v in diagnostico.factura.validaciones"
            :key="v.id"
            :texto="v.mensaje"
            :tono="v.severidad === 'ERROR' ? 'error' : 'alerta'"
          />
        </div>
      </section>

      <section class="bloque">
        <h4>Texto OCR completo</h4>
        <pre class="ocr">{{ diagnostico.ocrTexto || '(sin texto)' }}</pre>
      </section>
    </template>
  </div>
</template>

<style scoped>
.diagnostico {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.estado {
  margin: 0;
  font-size: 12.5px;
  color: var(--texto-tenue);
}
.bloque {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bloque h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--texto-debil);
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.tabla th {
  text-align: left;
  padding: 7px 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--texto-debil);
  font-weight: 700;
  border-bottom: 1px solid var(--borde-tenue);
  background: var(--superficie-tenue);
}
.tabla td {
  padding: 7px 8px;
  border-bottom: 1px solid #f2f4f6;
  color: var(--texto-medio);
  word-break: break-word;
}
.tabla__campo {
  font-weight: 600;
  color: var(--texto);
  white-space: nowrap;
}
.validaciones {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  margin-top: 4px;
}
.ocr {
  white-space: pre-wrap;
  max-height: 320px;
  overflow: auto;
  background: var(--superficie-tenue);
  border: 1px solid var(--borde-tenue);
  border-radius: 8px;
  padding: 10px;
  font-size: 11.5px;
  line-height: 1.5;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
