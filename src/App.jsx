// src/App.jsx
import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      sessionStorage.clear();
      window.location.assign('/login');
    } catch (err) {
      console.error('Error al salir:', err);
    }
  };

  return (
    <div className='min-h-screen'>
      {/* Header (branding NO clickeable) */}
      <header className='sticky top-0 z-40'>
        <div className='max-w-5xl mx-auto px-4 py-3 flex items-center justify-between'>
          <div
            className='flex items-center gap-3 px-3 py-2 rounded-2xl
                       bg-white/80 backdrop-blur ring-1 ring-black/5 shadow-sm
                       cursor-default select-none'
            title='Copa Kenia'
          >
            {/* 👇 Mantiene proporción del archivo (no lo recorta) */}
            <span className='text-xl sm:text-2xl font-bold tracking-tight text-gray-900'>
              Copa Kenia Comercial Eldorad
            </span>
          </div>

          {user ? (
            <div className='flex items-center gap-3'>
              <div className='hidden sm:block text-sm text-gray-700 truncate max-w-[180px]'>
                {user.displayName || user.email}
              </div>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt='avatar'
                  className='w-8 h-8 rounded-full object-cover'
                  referrerPolicy='no-referrer'
                />
              ) : (
                <div className='w-8 h-8 rounded-full bg-gray-200 grid place-items-center text-gray-600 text-sm'>
                  {(user?.email || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className='text-sm px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white/90 ring-1 ring-black/5'
                title='Cerrar sesión'
              >
                Salir
              </button>
            </div>
          ) : (
            <div className='text-sm text-gray-600 bg-white/70 px-3 py-1.5 rounded-xl ring-1 ring-black/5'>
              No conectado
            </div>
          )}
        </div>
      </header>

      {/* Contenido */}
      <main className='max-w-5xl mx-auto px-4 py-4'>
        <Outlet />
      </main>
    </div>
  );
}
