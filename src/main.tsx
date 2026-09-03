import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initPersistence, useAppStore } from '@/store/useAppStore';
import './index.css';

// Hidrata a operação corrente do IndexedDB e liga o autosave (tudo local).
initPersistence();
void useAppStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
