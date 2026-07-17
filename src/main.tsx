import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource-variable/space-grotesk/index.css';
import './design-system/tokens.css';
import './design-system/typography.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { useSimulationStore } from './state/simulation-store.ts';

declare global {
  interface Window {
    /** Debug/e2e handle to the simulation store (same access devtools already have). */
    __KINETIFLUX_STORE__?: typeof useSimulationStore;
  }
}
window.__KINETIFLUX_STORE__ = useSimulationStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
