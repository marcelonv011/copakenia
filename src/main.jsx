// src/main.jsx  (o src/index.jsx si ahí tenés el router)
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
                <Torneos/>
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
