import { Outlet, useNavigate } from 'react-router-dom';
export default function App() {
  const nav = useNavigate();
  return (
    <div className='min-h-screen bg-gray-50'>
      <header className='sticky top-0 z-50 bg-white shadow'>
        <div className='max-w-screen-md mx-auto px-4 py-3 flex items-center justify-between'>
          <button onClick={() => nav(-1)} className='text-blue-600'>
            {' '}
          </button>
          <h1 className='font-bold'>Torneo Básquet</h1>
          <div />
        </div>
      </header>
      <main className='max-w-screen-md mx-auto px-4 py-4'>
        <Outlet />
      </main>
    </div>
  );
}
