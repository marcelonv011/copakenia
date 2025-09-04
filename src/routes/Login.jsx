// src/routes/Login.jsx
import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';

const IconGoogle = (props) => (
  <svg viewBox='0 0 48 48' width='20' height='20' {...props}>
    <path
      fill='#FFC107'
      d='M43.6 20.5H42V20H24v8h11.3C33.9 31.7 29.5 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.1-.4-3.5z'
    />
    <path
      fill='#FF3D00'
      d='M6.3 14.7l6.6 4.8C14.8 16 19 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.4 6.3 14.7z'
    />
    <path
      fill='#4CAF50'
      d='M24 45c5.3 0 10.1-2 13.7-5.3l-6.3-5.2C29.3 36.6 26.8 37.5 24 37.5c-5.5 0-9.9-3.4-11.6-8.1l-6.6 5.1C8.8 40.3 15.9 45 24 45z'
    />
    <path
      fill='#1976D2'
      d='M43.6 20.5H42V20H24v8h11.3c-1.1 3.3-3.7 5.9-7 7.2l-6.3 5.2C36.2 42.9 42 38.4 44.6 31.9c.8-2.1 1.3-4.4 1.3-6.9 0-1.2-.1-2.1-.3-3.5z'
    />
  </svg>
);

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Si ya hay sesión (por redirect o porque quedó logueado), salir de /login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) window.location.assign('/torneos');
    });
    return () => unsub();
  }, []);

  // Al volver del redirect, Firebase entrega el resultado aquí
  useEffect(() => {
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user) window.location.assign('/torneos');
      })
      .catch((e) => {
        console.error('getRedirectResult:', e);
        setErr(describirAuthError(e));
      });
  }, []);

  const signInGoogle = async () => {
    setErr('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await setPersistence(auth, browserLocalPersistence);

      // 1) Probar POPUP
      await signInWithPopup(auth, provider);
      window.location.assign('/torneos');
    } catch (e) {
      // 2) Si el popup es bloqueado / no soportado -> REDIRECT
      const code = e?.code || '';
      if (
        code.includes('popup-blocked') ||
        code.includes('popup-closed-by-user') ||
        code.includes('operation-not-supported-in-this-environment')
      ) {
        try {
          await signInWithRedirect(auth, provider);
          return; // volverá por getRedirectResult/onAuthStateChanged
        } catch (er) {
          console.error('signInWithRedirect:', er);
          setErr(describirAuthError(er));
        }
      } else {
        console.error('signInWithPopup:', e);
        setErr(describirAuthError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'>
      <div className='w-full max-w-md p-[1px] rounded-2xl bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200'>
        <div className='rounded-2xl bg-white p-6'>
          <div className='text-center mb-6'>
            <h1 className='text-2xl font-bold'>Copa Kenia</h1>
            <p className='text-sm text-gray-600'>
              Accedé con tu cuenta de Google
            </p>
          </div>

          {err && (
            <div className='mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2'>
              {err}
            </div>
          )}

          <button
            onClick={signInGoogle}
            disabled={loading}
            className='w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white bg-gray-900 hover:bg-black disabled:opacity-60'
          >
            <IconGoogle />
            {loading ? 'Conectando…' : 'Continuar con Google'}
          </button>

          <div className='mt-6 text-xs text-gray-500 text-center'>
            Al continuar, aceptás los términos del torneo.
          </div>
        </div>
      </div>
    </div>
  );
}

function describirAuthError(e) {
  const code = e?.code || '';
  if (code.includes('unauthorized-domain')) {
    return 'Dominio no autorizado en Firebase Auth. Agregá "localhost" y "127.0.0.1" en Authentication → Settings → Authorized domains.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Proveedor Google deshabilitado. Habilitalo en Authentication → Sign-in method → Google.';
  }
  if (code.includes('network-request-failed')) {
    return 'Fallo de red. Revisá conexión y ad-blockers.';
  }
  if (code.includes('internal-error')) {
    return 'Error interno del navegador/SDK. Probá ventana privada o limpiar cookies de accounts.google.com.';
  }
  if (code.includes('popup')) {
    return 'El navegador bloqueó el popup. Probamos con redirección; si persiste, desactiva el bloqueador.';
  }
  return 'No se pudo iniciar sesión. Revisá consola para más detalles.';
}
