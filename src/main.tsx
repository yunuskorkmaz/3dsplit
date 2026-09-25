import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as actions from './state/actions';
import * as store from './state/store';
import { App } from './ui/App';
import './ui/styles.css';

// geliştirmede tarayıcı konsolundan / otomasyondan erişim için
if (import.meta.env.DEV) Object.assign(window, { app: { actions, store } });

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
