// src/routes/Login.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '../firebase';

// Forzar selector de cuenta SIEMPRE
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export default function Login() {
  const navigate = useNavigate();

  // Escuchamos el estado, pero NO redirigimos automáticamente
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      // no navigate aquí: dejamos que el usuario elija cuenta
    });
    return () => unsub();
  }, []);

  // Si el login fue por redirect (iOS / popups bloqueados), navegamos al volver
  useEffect(() => {
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user) navigate('/torneos', { replace: true });
      })
      .catch((e) => console.error('getRedirectResult error:', e));
  }, [navigate]);

  const login = async () => {
    try {
      // 1) Popup (rápido en desktop) + selector de cuenta
      await signInWithPopup(auth, provider);
      navigate('/torneos', { replace: true });
    } catch {
      // 2) Fallback: redirect (iOS / popups bloqueados)
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2) {
        console.error(e2);
        alert('No se pudo iniciar sesión.');
      }
    }
  };

  return (
    <div className='min-h-[70vh] grid place-items-center'>
      <div className='relative w-full max-w-4xl'>
        <div className='absolute inset-0 rounded-[28px] bg-white/40 backdrop-blur-md' />
        <div className='relative rounded-[28px] border border-white/60 shadow-2xl bg-white/70 p-6 sm:p-10'>

          {/* LOGOS arriba del título */}
          <img
            src='/src/img/logos.png'
            alt='Copa Kenia'
            className='h-40 sm:h-40 w-auto mx-auto mb-2 select-none pointer-events-none'
            draggable='false'
          />

          {/* Título */}
          <h1 className='text-4xl sm:text-6xl font-black tracking-tight text-gray-900 text-center drop-shadow'>
            Copa Kenia
          </h1>

          {/* Subtítulo */}
          <p className='text-center text-gray-600 mt-3 text-lg'>
            Accedé con tu cuenta de Google
          </p>

          {/* Botón */}
          <div className='mt-8 flex justify-center'>
            <button
              onClick={login}
              className='w-full sm:w-[720px] inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base sm:text-lg font-semibold text-white bg-[#101728] hover:bg-[#0c1220] transition shadow-lg'
            >
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' className='w-6 h-6'>
                <path fill='#FFC107' d='M43.611,20.083H42V20H24v8h11.303C33.538,32.675,29.163,36,24,36c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.869,5.053,29.702,3,24,3C12.955,3,4,11.955,4,23 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z'/>
                <path fill='#FF3D00' d='M6.306,14.691l6.571,4.819C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C34.869,5.053,29.702,3,24,3C16.318,3,9.656,7.337,6.306,14.691z'/>
                <path fill='#4CAF50' d='M24,43c5.114,0,9.728-1.953,13.191-5.129l-6.084-4.985C29.054,34.091,26.671,35,24,35 c-5.132,0-9.494-3.317-11.065-7.946l-6.53,5.03C9.705,38.556,16.338,43,24,43z'/>
                <path fill='#1976D2' d='M43.611,20.083H42V20H24v8h11.303c-1.084,3.105-3.282,5.489-6.196,6.886l0.001-0.001l6.084,4.985 C33.03,40.205,38,36,38,23C38,22.659,43.862,21.35,43.611,20.083z'/>
              </svg>
              Continuar con Google
            </button>
          </div>

          <p className='text-center text-sm text-gray-500 mt-6'>
            Al continuar, aceptás los términos del torneo.
          </p>
        </div>
      </div>
    </div>
  );
}
