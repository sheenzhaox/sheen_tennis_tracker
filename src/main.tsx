import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { startBackgroundSync } from './storage/sync';
import './index.css';

// Ask the browser not to evict local match data under storage pressure.
navigator.storage?.persist?.();
startBackgroundSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
