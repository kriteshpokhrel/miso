import { contextBridge, ipcRenderer } from 'electron';
import type { Attention, MisoApi, PetMotion, Snapshot } from '../shared/contracts.js';

const api: MisoApi = {
  getSnapshot: () => ipcRenderer.invoke('miso:snapshot'),
  care: (action) => ipcRenderer.invoke('miso:care', action),
  setSleeping: (asleep) => ipcRenderer.invoke('miso:sleep', asleep),
  setCareMenuOpen: (open, restoreFocus) => ipcRenderer.invoke('miso:care-menu', open, restoreFocus),
  setStayPut: (stay) => ipcRenderer.invoke('miso:stay', stay),
  setFollowing: (follow) => ipcRenderer.invoke('miso:follow', follow),
  goHome: () => ipcRenderer.invoke('miso:home'),
  restore: () => ipcRenderer.invoke('miso:restore'),
  openSettings: () => ipcRenderer.invoke('miso:settings'),
  updateSettings: (settings) => ipcRenderer.invoke('miso:update-settings', settings),
  downloadModel: (consent) => ipcRenderer.invoke('miso:download-model', consent),
  cancelModelDownload: () => ipcRenderer.invoke('miso:cancel-model'),
  removeModel: () => ipcRenderer.invoke('miso:remove-model'),
  startDrag: () => ipcRenderer.invoke('miso:drag-start'),
  dragPet: () => ipcRenderer.invoke('miso:drag'),
  endDrag: () => ipcRenderer.invoke('miso:drag-end'),
  onSnapshot: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Snapshot): void => listener(snapshot);
    ipcRenderer.on('miso:snapshot', handler);
    return () => { ipcRenderer.removeListener('miso:snapshot', handler); };
  },
  onAttention: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, attention: Attention): void => listener(attention);
    ipcRenderer.on('miso:attention', handler);
    return () => { ipcRenderer.removeListener('miso:attention', handler); };
  },
  onMotion: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, motion: PetMotion): void => listener(motion);
    ipcRenderer.on('miso:motion', handler);
    return () => { ipcRenderer.removeListener('miso:motion', handler); };
  },
};
contextBridge.exposeInMainWorld('miso', Object.freeze(api));
