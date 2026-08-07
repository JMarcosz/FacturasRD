import { defineStore } from 'pinia';
import type { Usuario } from '../types';

const STORAGE_KEY = 'facturas.auth';

interface EstadoAuth {
  token: string | null;
  usuario: Usuario | null;
}

function cargarEstadoInicial(): EstadoAuth {
  const crudo = localStorage.getItem(STORAGE_KEY);
  if (!crudo) return { token: null, usuario: null };
  try {
    return JSON.parse(crudo) as EstadoAuth;
  } catch {
    return { token: null, usuario: null };
  }
}

export const useAuthStore = defineStore('auth', {
  state: (): EstadoAuth => cargarEstadoInicial(),
  getters: {
    autenticado: (state) => Boolean(state.token),
  },
  actions: {
    establecerSesion(token: string, usuario: Usuario) {
      this.token = token;
      this.usuario = usuario;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, usuario }));
    },
    cerrarSesion() {
      this.token = null;
      this.usuario = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});
