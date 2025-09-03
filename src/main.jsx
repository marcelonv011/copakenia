import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './routes/Login.jsx';
import Torneos from './routes/Torneos.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to='/login' replace />} />
          <Route path='/login' element={<Login />} />
          <Route path='/torneos' element={<Torneos />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
