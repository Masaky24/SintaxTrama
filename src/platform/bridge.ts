import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Invoke } from '../domain/types';
export const native = isTauri();
export const bridge: Invoke = (command, args) => {
  if (!native) return Promise.reject(new Error('La vista web no tiene acceso a archivos. Inicia la aplicación con Tauri para editar documentos locales.'));
  return invoke(command, args);
};
