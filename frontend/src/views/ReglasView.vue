<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Message from 'primevue/message';
import AppLayout from '../components/AppLayout.vue';
import EncabezadoPantalla from '../components/ui/EncabezadoPantalla.vue';
import TarjetaPanel from '../components/ui/TarjetaPanel.vue';
import Pastilla from '../components/ui/Pastilla.vue';
import { apiReglas } from '../api/reglas';
import { listarClientes } from '../api/clientes';
import { useCatalogosStore } from '../stores/catalogos';
import type { Cliente, Formato, ReglaComercio } from '../types';

const toast = useToast();
const catalogos = useCatalogosStore();

const reglas = ref<ReglaComercio[]>([]);
const clientes = ref<Cliente[]>([]);
const cargando = ref(true);
const errorCarga = ref('');

// Dialog state
const dialogo = ref(false);
const guardando = ref(false);
const errorForm = ref('');
const reglaEditando = ref<string | null>(null);

const form = reactive({
  rnc: '',
  nombre: '',
  clienteId: null as string | null,
  formato: null as Formato | null,
  tipoIngreso: null as string | null,
  formaVenta: null as string | null,
  tipoBienesServicios: null as string | null,
  formaPago: null as string | null,
  activo: true,
});

async function cargar() {
  cargando.value = true;
  errorCarga.value = '';
  try {
    const [reglasData, clientesData] = await Promise.all([
      apiReglas.listar(),
      listarClientes()
    ]);
    reglas.value = reglasData;
    clientes.value = clientesData;
  } catch (e: any) {
    errorCarga.value = 'No se pudieron cargar las reglas.';
  } finally {
    cargando.value = false;
  }
}

function abrirDialogo(regla?: ReglaComercio) {
  errorForm.value = '';
  if (regla) {
    reglaEditando.value = regla.id;
    form.rnc = regla.rnc;
    form.nombre = regla.nombre;
    form.clienteId = regla.clienteId;
    form.formato = regla.formato;
    form.tipoIngreso = regla.tipoIngreso;
    form.formaVenta = regla.formaVenta;
    form.tipoBienesServicios = regla.tipoBienesServicios;
    form.formaPago = regla.formaPago;
    form.activo = regla.activo;
  } else {
    reglaEditando.value = null;
    form.rnc = '';
    form.nombre = '';
    form.clienteId = null;
    form.formato = null;
    form.tipoIngreso = null;
    form.formaVenta = null;
    form.tipoBienesServicios = null;
    form.formaPago = null;
    form.activo = true;
  }
  dialogo.value = true;
}

async function guardar() {
  if (!form.rnc.trim() || !form.nombre.trim()) {
    errorForm.value = 'RNC y nombre son obligatorios.';
    return;
  }
  guardando.value = true;
  errorForm.value = '';
  try {
    if (reglaEditando.value) {
      await apiReglas.actualizar(reglaEditando.value, { ...form });
      toast.add({ severity: 'success', summary: 'Regla actualizada', life: 3000 });
    } else {
      await apiReglas.crear({ ...form });
      toast.add({ severity: 'success', summary: 'Regla creada', life: 3000 });
    }
    dialogo.value = false;
    await cargar();
  } catch (e: any) {
    errorForm.value = e?.response?.data?.message || 'Error al guardar.';
  } finally {
    guardando.value = false;
  }
}

async function eliminar(id: string) {
  if (!confirm('¿Seguro que deseas eliminar esta regla?')) return;
  try {
    await apiReglas.eliminar(id);
    toast.add({ severity: 'info', summary: 'Regla eliminada', life: 3000 });
    await cargar();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error al eliminar', life: 3000 });
  }
}

async function toggleActivo(regla: ReglaComercio) {
  try {
    await apiReglas.actualizar(regla.id, { activo: !regla.activo });
    await cargar();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error al actualizar', life: 3000 });
  }
}

onMounted(() => {
  catalogos.cargar();
  cargar();
});
</script>

<template>
  <AppLayout>
    <div class="reglas">
      <EncabezadoPantalla
        titulo="Reglas por Comercio"
        subtitulo="Configura cómo clasificar automáticamente las facturas de proveedores y clientes recurrentes."
      >
        <template #acciones>
          <button type="button" class="boton-primario" @click="abrirDialogo()">+ Nueva regla</button>
        </template>
      </EncabezadoPantalla>

      <TarjetaPanel v-if="cargando" class="aviso">Cargando reglas...</TarjetaPanel>
      <TarjetaPanel v-else-if="errorCarga">
        <div class="aviso__error">
          <i class="pi pi-exclamation-circle"></i>
          <span>{{ errorCarga }}</span>
          <button type="button" class="enlace" @click="cargar()">Reintentar</button>
        </div>
      </TarjetaPanel>
      <TarjetaPanel v-else-if="!reglas.length">
        <div class="vacio">
          <div class="vacio__icono"><i class="pi pi-sliders-h"></i></div>
          <span class="vacio__titulo">No hay reglas configuradas</span>
          <span class="vacio__texto">
            Crea reglas basadas en RNC para preclasificar el tipo de ingreso, bienes o servicios,
            formato y forma de pago de las facturas entrantes automáticamente.
          </span>
          <button type="button" class="boton-primario" @click="abrirDialogo()">+ Nueva regla</button>
        </div>
      </TarjetaPanel>
      
      <div v-else class="lista-reglas">
        <TarjetaPanel v-for="r in reglas" :key="r.id" class="regla-tarjeta">
          <div class="regla-tarjeta__cabecera">
            <div class="regla-tarjeta__info">
              <span class="regla-tarjeta__nombre">{{ r.nombre }}</span>
              <span class="regla-tarjeta__rnc">RNC: {{ r.rnc }}</span>
              <Pastilla :texto="r.activo ? 'Activa' : 'Inactiva'" :tono="r.activo ? 'ok' : 'neutro'" />
            </div>
            <div class="regla-tarjeta__acciones">
              <Button
                icon="pi pi-power-off"
                size="small"
                :severity="r.activo ? 'secondary' : 'success'"
                text
                @click="toggleActivo(r)"
                :title="r.activo ? 'Desactivar' : 'Activar'"
                :aria-label="r.activo ? 'Desactivar regla' : 'Activar regla'"
              />
              <Button icon="pi pi-pencil" size="small" text @click="abrirDialogo(r)" title="Editar" aria-label="Editar regla" />
              <Button icon="pi pi-trash" size="small" severity="danger" text @click="eliminar(r.id)" title="Eliminar" aria-label="Eliminar regla" />
            </div>
          </div>
          <div class="regla-tarjeta__detalles">
            <div class="metrica" v-if="r.clienteId">
              <span class="metrica__label">Cliente asignado</span>
              <span class="metrica__valor">{{ clientes.find(c => c.id === r.clienteId)?.nombre || 'Desconocido' }}</span>
            </div>
            <div class="metrica" v-if="r.formato">
              <span class="metrica__label">Formato</span>
              <span class="metrica__valor">{{ r.formato }}</span>
            </div>
            <div class="metrica" v-if="r.tipoIngreso">
              <span class="metrica__label">Tipo Ingreso</span>
              <span class="metrica__valor">{{ r.tipoIngreso }}</span>
            </div>
            <div class="metrica" v-if="r.tipoBienesServicios">
              <span class="metrica__label">Bienes/Servicios</span>
              <span class="metrica__valor">{{ r.tipoBienesServicios }}</span>
            </div>
            <div class="metrica">
              <span class="metrica__label">Aplicada</span>
              <span class="metrica__valor">{{ r.vecesAplicada }} veces</span>
            </div>
          </div>
        </TarjetaPanel>
      </div>
    </div>

    <Dialog
      v-model:visible="dialogo"
      modal
      :header="reglaEditando ? 'Editar regla' : 'Nueva regla'"
      :draggable="false"
      :style="{ width: '540px' }"
      :breakpoints="{ '640px': '92vw' }"
    >
      <form class="form" @submit.prevent="guardar">
        <div class="form__campo">
          <label for="r-rnc">RNC del Comercio</label>
          <InputText id="r-rnc" v-model="form.rnc" autocomplete="off" />
        </div>
        <div class="form__campo">
          <label for="r-nombre">Nombre Comercial</label>
          <InputText id="r-nombre" v-model="form.nombre" autocomplete="off" />
        </div>
        <div class="form__campo form__campo--ancho">
          <label for="r-cliente">Asignar a Cliente Contribuyente (opcional)</label>
          <Select
            id="r-cliente"
            v-model="form.clienteId"
            :options="clientes"
            option-label="nombre"
            option-value="id"
            show-clear
            placeholder="Ninguno (aplica a todos o según factura)"
          />
        </div>
        <div class="form__campo">
          <label for="r-formato">Formato</label>
          <Select
            id="r-formato"
            v-model="form.formato"
            :options="['F606', 'F607']"
            show-clear
            placeholder="No forzar"
          />
        </div>
        <div class="form__campo">
          <label for="r-tingreso">Tipo de Ingreso</label>
          <Select
            id="r-tingreso"
            v-model="form.tipoIngreso"
            :options="catalogos.catalogos.tiposIngreso607.map(t => ({ label: `${t.codigo} - ${t.descripcion}`, value: t.codigo }))"
            option-label="label"
            option-value="value"
            show-clear
            placeholder="No forzar"
          />
        </div>
        <div class="form__campo">
          <label for="r-tbienes">Tipo Bienes/Servicios (606)</label>
          <Select
            id="r-tbienes"
            v-model="form.tipoBienesServicios"
            :options="catalogos.catalogos.tiposBienesServicios606.map(t => ({ label: `${t.codigo} - ${t.descripcion}`, value: t.codigo }))"
            option-label="label"
            option-value="value"
            show-clear
            placeholder="No forzar"
          />
        </div>
        <div class="form__campo">
          <label for="r-fpago">Forma de Pago (606)</label>
          <Select
            id="r-fpago"
            v-model="form.formaPago"
            :options="catalogos.catalogos.formasPago606.map(t => ({ label: `${t.codigo} - ${t.descripcion}`, value: t.codigo }))"
            option-label="label"
            option-value="value"
            show-clear
            placeholder="No forzar"
          />
        </div>
        <div class="form__campo form__campo--casilla">
          <Checkbox v-model="form.activo" input-id="r-activo" binary />
          <label for="r-activo">Regla activa</label>
        </div>
        <Message v-if="errorForm" severity="error" :closable="false" class="form__error">{{ errorForm }}</Message>
      </form>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardando" @click="dialogo = false" />
        <Button label="Guardar" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>
  </AppLayout>
</template>

<style scoped>
.reglas {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.boton-primario {
  border: 0;
  background: var(--teal);
  color: #fff;
  border-radius: var(--radio-control);
  padding: 9px 15px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.boton-primario:hover {
  background: var(--teal-oscuro);
}
.enlace {
  border: 0;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--teal);
  cursor: pointer;
}
.enlace:hover {
  color: var(--teal-oscuro);
}
.lista-reglas {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.regla-tarjeta {
  padding: 16px;
}
.regla-tarjeta__cabecera {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--borde-tenue);
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.regla-tarjeta__info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.regla-tarjeta__nombre {
  font-weight: 600;
  font-size: 14px;
}
.regla-tarjeta__rnc {
  color: var(--texto-suave);
  font-size: 12px;
  font-family: monospace;
}
.regla-tarjeta__acciones {
  display: flex;
  gap: 4px;
}
.regla-tarjeta__detalles {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.metrica {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metrica__label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--texto-debil);
}
.metrica__valor {
  font-size: 13px;
  font-weight: 600;
}
.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form__campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form__campo--ancho {
  grid-column: 1 / -1;
}
.form__campo--casilla {
  flex-direction: row;
  align-items: center;
  gap: 9px;
  align-self: end;
  padding-bottom: 8px;
  grid-column: 1 / -1;
}
.form__campo label {
  font-size: 11px;
  font-weight: 600;
  color: var(--texto-suave);
}
.form__campo--casilla label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--texto-medio);
  cursor: pointer;
}
.form__error {
  grid-column: 1 / -1;
}
.aviso {
  font-size: 13px;
  color: var(--texto-suave);
}
.aviso__error {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--error);
  font-size: 13px;
}
.vacio {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 34px 16px;
}
.vacio__icono {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--teal-suave);
  color: var(--teal);
  font-size: 19px;
}
.vacio__titulo {
  font-size: 15px;
  font-weight: 600;
}
.vacio__texto {
  font-size: 12.5px;
  color: var(--texto-suave);
  max-width: 430px;
  line-height: 1.5;
}
.vacio .boton-primario {
  margin-top: 4px;
}

@media (max-width: 768px) {
  .form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .regla-tarjeta { padding: 12px; }
  .regla-tarjeta__nombre { font-size: 13px; }
  .regla-tarjeta__detalles { gap: 12px; }
  .metrica__label { font-size: 10px; }
  .metrica__valor { font-size: 12px; }
  .lista-reglas { gap: 10px; }
  .vacio__icono { width: 36px; height: 36px; border-radius: 10px; font-size: 16px; }
  .vacio__titulo { font-size: 14px; }
  .vacio__texto { font-size: 11.5px; }
}
</style>
