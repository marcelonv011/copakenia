// src/components/RequireAuth.jsx
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export default function RequireAuth() {
  const [user, setUser] = useState(undefined); // undefined = cargando
  const loc = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  if (user === undefined) {
    return (
      <div className='min-h-screen grid place-items-center text-gray-600'>
        Cargando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to='/login' state={{ from: loc }} replace />;
  }
  return <Outlet />;
}
