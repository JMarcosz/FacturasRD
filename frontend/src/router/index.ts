import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { publica: true, titulo: 'Acceso' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { titulo: 'Dashboard' },
    },
    {
      path: '/facturas',
      name: 'facturas',
      component: () => import('../views/FacturasView.vue'),
      meta: { titulo: 'Facturas' },
    },
    // /facturas/triaje desapareció: era una pantalla propia que agrupaba por
    // comercio las facturas sin clasificar o sin confirmar — ambas cosas ya
    // se ven en Facturas con la vista rápida "Por confirmar" (ver AppLayout,
    // que redirige el ítem "Triaje" del menú a /facturas?vista=por_confirmar).
    {
      path: '/facturas/:facturaId',
      name: 'factura-detalle',
      component: () => import('../views/FacturaDetalleView.vue'),
      props: true,
      meta: { titulo: 'Detalle de factura' },
    },
    {
      path: '/clientes',
      name: 'clientes',
      component: () => import('../views/ClientesView.vue'),
      meta: { titulo: 'Clientes' },
    },
    {
      path: '/reporteria',
      name: 'reporteria',
      component: () => import('../views/ReporteriaView.vue'),
      meta: { titulo: 'Reportería' },
    },
    {
      path: '/reglas',
      name: 'reglas',
      component: () => import('../views/ReglasView.vue'),
      meta: { titulo: 'Reglas' },
    },
    // La antigua ruta /periodos/:id/exportar desapareció: exportar es ahora un
    // bloque dentro de Reportería, como en el diseño.
    //
    // /periodos/:periodoId/revision también desapareció: era una segunda
    // pantalla de trabajo en lote que duplicaba las acciones de Facturas
    // (asignar cliente, editar en lote, eliminar) sobre las facturas de un
    // único período. Sus enlaces de entrada llevan ahora a Facturas filtrada
    // por ese cliente.
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.publica && !auth.autenticado) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.autenticado) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
