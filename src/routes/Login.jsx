import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle } from '../firebase';
import { useNavigate } from 'react-router-dom';
export default function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) nav('/torneos');
    });
    return () => unsub();
  }, [nav]);
  const entrarInvitado = () => nav('/torneos', { state: { guest: true } });
  const entrarGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      nav('/torneos');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className='min-h-[70vh] flex flex-col items-center justify-center gap-6'>
      <div className='w-20 h-20 rounded-full bg-blue-600 text-white grid place-items-center text-3xl'>
        {' '}
      </div>
      <h2 className='text-2xl font-bold'>Basket Torneo</h2>
      <p className='text-gray-600 -mt-3'>Sistema de gestión de torneos</p>
      <button
        onClick={entrarGoogle}
        disabled={loading}
        className='w-full max-w-xs py-3 rounded-lg bg-blue-600 text-white font-semibold'
      >
        {loading ? 'Entrando...' : 'Entrar con Google'}
      </button>
      <button
        onClick={entrarInvitado}
        className='w-full max-w-xs py-3 rounded-lg bg-green-600 text-white font-semibold'
      >
        Ver como invitado
      </button>
      <div className='text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded'>
        Tip: agrega tu email a la colección <b>admins</b> para tener permisos de
        admin.
      </div>
    </div>
  );
}
