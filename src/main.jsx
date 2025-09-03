import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './routes/Login.jsx';
import Torneos from './routes/Torneos.jsx';
import Torneo from './routes/Torneo.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App />}>
          <Route index element={<Login />} />
          <Route path='/torneos' element={<Torneos />} />
          <Route path='/torneo/:id' element={<Torneo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
