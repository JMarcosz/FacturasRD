<script setup lang="ts">
import { ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Textarea from 'primevue/textarea';
import { importarClientes } from '../api/clientes';
import type { CrearClienteInput } from '../api/clientes';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [val: boolean], 'importado': [] }>();

const toast = useToast();
const inputTexto = ref('');
const clientesPreview = ref<CrearClienteInput[]>([]);
const procesando = ref(false);
const errorMsg = ref('');

function cerrar() {
  emit('update:visible', false);
  inputTexto.value = '';
  clientesPreview.value = [];
  errorMsg.value = '';
}

function parseCSV(text: string): CrearClienteInput[] {
  const lineas = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) return [];
  
  // Asumimos primera fila headers o datos directos.
  // Intentaremos detectar si es header
  let startIdx = 0;
  if (lineas[0].toLowerCase().includes('rnc') || lineas[0].toLowerCase().includes('nombre')) {
    startIdx = 1;
  }
  
  const separador = text.includes('\t') ? '\t' : ',';
  const result: CrearClienteInput[] = [];
  
  for (let i = startIdx; i < lineas.length; i++) {
    const cols = lineas[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length >= 2) {
      result.push({
        rnc: cols[0],
        nombre: cols[1],
        tipoIngresoDefault: cols[2] || undefined,
        tasaItbis: cols[3] ? Number(cols[3]) : undefined,
        aplicaProporcionalidad: cols[4] ? cols[4].toLowerCase() === 'true' || cols[4] === '1' : undefined
      });
    }
  }
  return result;
}

function parseJSON(text: string): CrearClienteInput[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data.map(item => ({
        rnc: String(item.rnc || ''),
        nombre: String(item.nombre || ''),
        tipoIngresoDefault: item.tipoIngresoDefault,
        tasaItbis: item.tasaItbis !== undefined ? Number(item.tasaItbis) : undefined,
        aplicaProporcionalidad: item.aplicaProporcionalidad === true || item.aplicaProporcionalidad === 'true'
      })).filter(c => c.rnc && c.nombre);
    }
  } catch (e) {}
  return [];
}

function procesarInput() {
  errorMsg.value = '';
  let data: CrearClienteInput[] = [];
  const txt = inputTexto.value.trim();
  
  if (txt.startsWith('[')) {
    data = parseJSON(txt);
  } else {
    data = parseCSV(txt);
  }
  
  if (data.length === 0) {
    errorMsg.value = 'No se encontraron clientes válidos en el texto. Asegúrate de incluir RNC y Nombre.';
  } else {
    clientesPreview.value = data;
  }
}

async function confirmarImportacion() {
  if (clientesPreview.value.length === 0) return;
  
  procesando.value = true;
  try {
    const res = await importarClientes(clientesPreview.value);
    const detalle = res.fallidos.length
      ? `${res.procesados} de ${res.total} clientes importados. ${res.fallidos.length} con error: ${res.fallidos
          .slice(0, 3)
          .map((f) => `${f.rnc} (${f.motivo})`)
          .join('; ')}`
      : `${res.procesados} clientes importados.`;
    toast.add({
      severity: res.fallidos.length ? 'warn' : 'success',
      summary: 'Importación completada',
      detail: detalle,
      life: 8000,
    });
    emit('importado');
    cerrar();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error al importar', detail: e?.response?.data?.message || 'Revisa el formato.' });
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v) => emit('update:visible', v)"
    header="Importar Clientes en Bloque"
    modal
    :style="{ width: '800px' }"
    :closable="!procesando"
  >
    <div class="contenedor-importar">
      <p class="instrucciones">
        Pega el contenido de tu archivo CSV, Excel (separado por tabulaciones) o JSON aquí.<br>
        Columnas esperadas: <strong>RNC, Nombre, Tipo Ingreso, Tasa ITBIS, Aplica Proporcionalidad</strong>.
      </p>
      
      <div v-if="clientesPreview.length === 0">
        <Textarea v-model="inputTexto" rows="10" class="w-full input-area" placeholder="Ejemplo CSV:
130456789,Constructora del Este SRL,01,0.18,true
101123456,Servicios IT,02,0.18,false" />
        <small v-if="errorMsg" class="p-error">{{ errorMsg }}</small>
      </div>

      <div v-else>
        <p class="preview-titulo">Vista previa ({{ clientesPreview.length }} registros):</p>
        <DataTable :value="clientesPreview" :paginator="true" :rows="5" size="small">
          <Column field="rnc" header="RNC"></Column>
          <Column field="nombre" header="Nombre"></Column>
          <Column field="tipoIngresoDefault" header="Tipo Ingreso"></Column>
          <Column field="tasaItbis" header="Tasa ITBIS"></Column>
          <Column field="aplicaProporcionalidad" header="Prop.">
            <template #body="slotProps">
              {{ slotProps.data.aplicaProporcionalidad ? 'Sí' : 'No' }}
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
    <template #footer>
      <Button label="Cancelar" icon="pi pi-times" text severity="secondary" @click="cerrar" :disabled="procesando" />
      <Button v-if="clientesPreview.length === 0" label="Procesar Texto" icon="pi pi-cog" @click="procesarInput" />
      <Button v-else label="Importar" icon="pi pi-check" severity="success" :loading="procesando" @click="confirmarImportacion" />
      <Button v-if="clientesPreview.length > 0 && !procesando" label="Atrás" icon="pi pi-arrow-left" text @click="clientesPreview = []" />
    </template>
  </Dialog>
</template>

<style scoped>
.contenedor-importar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.instrucciones {
  font-size: 13px;
  color: var(--texto-suave);
  margin: 0;
  line-height: 1.4;
}
.input-area {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
}
.preview-titulo {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px 0;
}
</style>
