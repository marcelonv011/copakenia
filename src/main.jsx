import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './routes/Login.jsx';
import Torneos from './routes/Torneos.jsx';
import Torneo from './routes/Torneo.jsx'; // 👈 importar la pantalla nueva

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to='/login' replace />} />
          <Route path='/login' element={<Login />} />
          <Route path='/torneos' element={<Torneos />} />
          <Route path='/torneo/:id' element={<Torneo />} />{' '}
          {/* 👈 ruta que faltaba */}
          <Route path='*' element={<Navigate to='/torneos' replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
