import { Outlet, useNavigate, useLocation } from 'react-router-dom';

export default function App() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const showBack = pathname !== '/login';

  return (
    <div className='min-h-screen bg-gray-50 text-gray-900'>
      <header className='sticky top-0 z-50 bg-white shadow-sm'>
        <div className='max-w-screen-md mx-auto px-4 py-3 flex items-center justify-between'>
          <button
            onClick={() => nav(-1)}
            className={`text-blue-600 ${
              showBack ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label='Volver'
          >
            ⬅
          </button>
          <h1 className='font-bold'>Torneo Básquet</h1>
          <div className='w-5' /> {/* separador */}
        </div>
      </header>

      <main className='max-w-screen-md mx-auto px-4 py-4'>
        <Outlet />
      </main>
    </div>
  );
}
