import { contextBridge, ipcRenderer } from 'electron';
import type { Attention, NookiApi, PetMotion, Snapshot } from '../shared/contracts.js';

const api: NookiApi = {
  getSnapshot: () => ipcRenderer.invoke('nooki:snapshot'),
  care: (action) => ipcRenderer.invoke('nooki:care', action),
  setSleeping: (asleep) => ipcRenderer.invoke('nooki:sleep', asleep),
  setCareMenuOpen: (open) => ipcRenderer.invoke('nooki:care-menu', open),
  goHome: () => ipcRenderer.invoke('nooki:home'),
  restore: () => ipcRenderer.invoke('nooki:restore'),
  openSettings: () => ipcRenderer.invoke('nooki:settings'),
  updateSettings: (settings) => ipcRenderer.invoke('nooki:update-settings', settings),
  downloadModel: (consent) => ipcRenderer.invoke('nooki:download-model', consent),
  cancelModelDownload: () => ipcRenderer.invoke('nooki:cancel-model'),
  removeModel: () => ipcRenderer.invoke('nooki:remove-model'),
  startDrag: () => ipcRenderer.invoke('nooki:drag-start'),
  dragPet: () => ipcRenderer.invoke('nooki:drag'),
  endDrag: () => ipcRenderer.invoke('nooki:drag-end'),
  onSnapshot: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Snapshot): void => listener(snapshot);
    ipcRenderer.on('nooki:snapshot', handler);
    return () => { ipcRenderer.removeListener('nooki:snapshot', handler); };
  },
  onAttention: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, attention: Attention): void => listener(attention);
    ipcRenderer.on('nooki:attention', handler);
    return () => { ipcRenderer.removeListener('nooki:attention', handler); };
  },
  onMotion: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, motion: PetMotion): void => listener(motion);
    ipcRenderer.on('nooki:motion', handler);
    return () => { ipcRenderer.removeListener('nooki:motion', handler); };
  },
};
contextBridge.exposeInMainWorld('nooki', Object.freeze(api));
