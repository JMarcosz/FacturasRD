<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import { useToast } from 'primevue/usetoast';
import { login } from '../api/auth';
import { useAuthStore } from '../stores/auth';

const email = ref('');
const password = ref('');
const cargando = ref(false);

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const toast = useToast();

const VENTAJAS = [
  {
    icono: 'pi-bolt',
    titulo: 'Escaneo con IA',
    detalle: 'Sube el PDF o la foto y los campos del 606/607 se llenan solos.',
  },
  {
    icono: 'pi-shield',
    titulo: 'Validación antes de declarar',
    detalle: 'NCF duplicados, RNC inválidos e ITBIS fuera de rango se detectan al vuelo.',
  },
  {
    icono: 'pi-send',
    titulo: 'TXT oficial en un clic',
    detalle: 'Formato exacto de la DGII, listo para la Oficina Virtual.',
  },
];

async function enviar() {
  cargando.value = true;
  try {
    const { accessToken, user } = await login(email.value, password.value);
    auth.establecerSesion(accessToken, user);
    const destino = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    router.push(destino ?? { name: 'dashboard' });
  } catch {
    toast.add({
      severity: 'error',
      summary: 'No se pudo entrar',
      detail: 'Correo o contraseña incorrectos.',
      life: 4000,
    });
  } finally {
    cargando.value = false;
  }
}

function recuperar() {
  toast.add({
    severity: 'info',
    summary: 'Recuperar contraseña',
    detail: 'Pídele a un administrador que restablezca tu clave.',
    life: 5000,
  });
}
</script>

<template>
  <div class="pagina">
    <div class="panel">
      <form class="acceso" @submit.prevent="enviar">
        <div class="marca">
          <div class="marca__logo">FR</div>
          <span class="marca__nombre">Facturas RD</span>
        </div>

        <div class="titulos">
          <span class="titulos__principal">Entra a tu escritorio</span>
          <span class="titulos__sub">Gestiona el 606 y 607 de todos tus clientes desde un solo lugar.</span>
        </div>

        <div class="campos">
          <div class="campo">
            <label for="email">Correo</label>
            <IconField>
              <InputIcon class="pi pi-envelope" />
              <InputText
                id="email"
                v-model="email"
                type="email"
                required
                autofocus
                autocomplete="username"
                placeholder="tu@correo.do"
                fluid
              />
            </IconField>
          </div>

          <div class="campo">
            <label for="password">Contraseña</label>
            <Password
              v-model="password"
              input-id="password"
              :feedback="false"
              toggle-mask
              required
              autocomplete="current-password"
              placeholder="••••••••"
              fluid
            />
          </div>
        </div>

        <Button type="submit" label="Entrar" :loading="cargando" class="entrar" />

        <span class="pie">
          ¿Olvidaste tu contraseña?
          <button type="button" class="pie__enlace" @click="recuperar">Recupérala aquí</button>
        </span>
      </form>

      <aside class="promo">
        <div class="promo__ventajas">
          <div v-for="v in VENTAJAS" :key="v.titulo" class="ventaja">
            <i class="pi" :class="v.icono"></i>
            <div class="ventaja__texto">
              <span class="ventaja__titulo">{{ v.titulo }}</span>
              <span class="ventaja__detalle">{{ v.detalle }}</span>
            </div>
          </div>
        </div>
        <span class="promo__nota">Cumple con los formatos oficiales 606 y 607 de la DGII.</span>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.pagina {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--fondo);
}
.panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--borde);
  border-radius: 16px;
  overflow: hidden;
  background: var(--superficie);
  min-height: 460px;
  width: 100%;
  max-width: 940px;
}

/* ── Formulario ── */
.acceso {
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
}
.marca {
  display: flex;
  align-items: center;
  gap: 10px;
}
.marca__logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radio-control);
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 800;
}
.marca__nombre {
  font-size: 16px;
  font-weight: 700;
}
.titulos {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.titulos__principal {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.4px;
}
.titulos__sub {
  font-size: 13px;
  color: var(--texto-suave);
}
.campos {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.campo label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--texto-suave);
}
.entrar {
  width: 100%;
  padding: 12px;
  font-size: 13.5px;
  font-weight: 700;
}
.pie {
  font-size: 11.5px;
  color: var(--texto-tenue);
  text-align: center;
}
.pie__enlace {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--teal);
  font-weight: 700;
  cursor: pointer;
}
.pie__enlace:hover {
  text-decoration: underline;
}

/* ── Lado promocional ── */
.promo {
  background: linear-gradient(160deg, #0f766e 0%, #115e59 55%, #134e4a 100%);
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 16px;
  color: #fff;
}
.promo__ventajas {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ventaja {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 11px;
  padding: 12px 13px;
}
.ventaja > i {
  font-size: 13px;
  margin-top: 2px;
}
.ventaja__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ventaja__titulo {
  font-size: 12.5px;
  font-weight: 700;
}
.ventaja__detalle {
  font-size: 11.5px;
  color: #c9f0ea;
  line-height: 1.45;
}
.promo__nota {
  font-size: 11.5px;
  color: #a7dcd4;
}

/* En pantallas estrechas el gradiente estorba: se apila y se oculta. */
@media (max-width: 820px) {
  .panel {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .promo {
    display: none;
  }
  .acceso {
    padding: 32px 24px;
  }
}
</style>
