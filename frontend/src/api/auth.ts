import { http } from './client';
import type { Usuario } from '../types';

export interface LoginResponse {
  accessToken: string;
  user: Usuario;
}

export function login(email: string, password: string) {
  return http.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data);
}
