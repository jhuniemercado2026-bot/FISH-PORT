import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App.jsx';
import ActivityLogsRealtimeBridge from './components/ActivityLogsRealtimeBridge.jsx';
import AccountStatusRealtimeBridge from './components/AccountStatusRealtimeBridge.jsx';
import DashboardRealtimeBridge from './components/DashboardRealtimeBridge.jsx';
import NotificationsRealtimeBridge from './components/NotificationsRealtimeBridge.jsx';
import TransactionLockRealtimeBridge from './components/TransactionLockRealtimeBridge.jsx';
import TransactionsRealtimeBridge from './components/TransactionsRealtimeBridge.jsx';
import { queryClient } from './lib/queryClient';

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <TransactionLockRealtimeBridge />
    <TransactionsRealtimeBridge />
    <DashboardRealtimeBridge />
    <NotificationsRealtimeBridge />
    <ActivityLogsRealtimeBridge />
    <AccountStatusRealtimeBridge />
    <App />
  </QueryClientProvider>
);
