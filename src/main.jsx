// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './routes/Login.jsx';
import Torneos from './routes/Torneos.jsx';
import Torneo from './routes/Torneo.jsx';
import RequireAuth from './components/RequireAuth.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App />}>
          {/* pública */}
          <Route index element={<Login />} />
          <Route path='login' element={<Login />} />

          {/* privadas */}
          <Route
            path='torneos'
            element={
              <RequireAuth>
                <Torneos />
              </RequireAuth>
            }
          />
          <Route
            path='torneo/:id'
            element={
              <RequireAuth>
                <Torneo />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// === PWA: registrar el Service Worker (usa /public/sw.js) ===
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.error('SW register failed:', err));
  });
}
