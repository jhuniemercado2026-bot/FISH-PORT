import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App.jsx';
import NotificationsRealtimeBridge from './components/NotificationsRealtimeBridge.jsx';
import TransactionLockRealtimeBridge from './components/TransactionLockRealtimeBridge.jsx';
import { queryClient } from './lib/queryClient';

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <TransactionLockRealtimeBridge />
    <NotificationsRealtimeBridge />
    <App />
  </QueryClientProvider>
);
