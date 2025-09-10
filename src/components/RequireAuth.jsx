// src/components/RequireAuth.jsx
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export default function RequireAuth({ children }) {
  // loading | in | out
  const [status, setStatus] = useState('loading');
  const location = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setStatus(u ? 'in' : 'out');
    });
    return () => unsub();
  }, []);

  if (status === 'loading') {
    return (
      <div className='min-h-[50vh] grid place-items-center text-gray-600'>
        Cargando…
      </div>
    );
  }

  if (status === 'out') {
    // Guarda a dónde quería ir, por si luego querés volver
    return <Navigate to='/login' replace state={{ from: location }} />;
  }

  return children;
}
