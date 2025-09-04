// src/App.jsx
import { Outlet, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

export default function App() {
  const [user, setUser] = useState(null);

  // Mantener en estado el usuario actual (sirve para mostrar avatar/email y para el botón Salir)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // src/App.jsx
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      sessionStorage.clear();
      // 👇 mejor que navigate cuando hay issues con popup/redirect state
      window.location.assign('/login');
    } catch (e) {
      console.error('Error al salir:', e);
    }
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <header className='sticky top-0 z-40 bg-white/80 backdrop-blur border-b'>
        <div className='max-w-5xl mx-auto px-4 py-3 flex items-center justify-between'>
          <Link to={user ? '/torneos' : '/login'} className='font-semibold'>
            Copa Kenia
          </Link>

          {/* Lado derecho: user info + salir */}
          {user ? (
            <div className='flex items-center gap-3'>
              <div className='hidden sm:block text-sm text-gray-600 truncate max-w-[180px]'>
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
                  {(user.email || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className='text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200'
                title='Cerrar sesión'
              >
                Salir
              </button>
            </div>
          ) : (
            <div className='text-sm text-gray-500'>No conectado</div>
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
