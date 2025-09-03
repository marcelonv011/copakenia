import { useNavigate } from 'react-router-dom';

export default function Login() {
  const nav = useNavigate();

  return (
    <div className='min-h-[70vh] flex flex-col items-center justify-center gap-6'>
      <div className='w-20 h-20 rounded-full bg-blue-600 text-white grid place-items-center text-3xl'>
        🏀
      </div>
      <h2 className='text-2xl font-bold'>Basket Torneo</h2>
      <p className='text-gray-600 -mt-3 text-center'>
        Sistema de gestión de torneos
      </p>

      {/* Botones temporales: en el Paso 2 reemplazamos por Login con Google */}
      <button
        onClick={() => nav('/torneos', { state: { guest: true } })}
        className='w-full max-w-xs py-3 rounded-lg bg-green-600 text-white font-semibold'
      >
        Entrar como invitado
      </button>
      <button
        onClick={() => nav('/torneos')}
        className='w-full max-w-xs py-3 rounded-lg bg-blue-600 text-white font-semibold'
      >
        Simular login (provisorio)
      </button>

      <div className='text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded'>
        Próximo paso: Login con Google + rol admin desde Firestore.
      </div>
    </div>
  );
}
