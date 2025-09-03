import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export default function Torneos() {
  const nav = useNavigate();
  const { state } = useLocation();
  const isGuest = Boolean(state?.guest);

  // Mock inicial. En el Paso 3 lo reemplazamos por Firestore.
  const torneos = useMemo(
    () => [
      { id: 't1', nombre: 'Apertura 2025', categoria: 'Primera' },
      { id: 't2', nombre: 'U17 2025', categoria: 'U17' },
    ],
    []
  );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold'>Seleccionar Torneo</h2>
        {!isGuest && (
          <button
            onClick={() => alert('En el Paso 3: crear torneo (Firestore)')}
            className='px-3 py-2 rounded bg-blue-600 text-white'
          >
            + Crear
          </button>
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {torneos.map((t) => (
          <div key={t.id} className='bg-white rounded-xl shadow p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='font-semibold'>{t.nombre}</div>
                <div className='text-sm text-gray-500'>{t.categoria}</div>
              </div>
              <div className='flex gap-2'>
                <button
                  onClick={() =>
                    alert(
                      'En el Paso 4: pantalla del Torneo con fixture/posiciones'
                    )
                  }
                  className='px-3 py-2 rounded bg-blue-600 text-white'
                >
                  Entrar
                </button>
                {!isGuest && (
                  <button
                    onClick={() =>
                      alert('En el Paso 3: borrar torneo (Firestore)')
                    }
                    className='px-3 py-2 rounded bg-red-600 text-white'
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
