import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { isAdmin } from '../lib/firestore';
export default function Torneos() {
  const nav = useNavigate();
  const { state } = useLocation();
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [torneos, setTorneos] = useState([]);
  const guest = state?.guest;
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAdmin(await isAdmin(u?.email));
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const q = collection(db, 'torneos');
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTorneos(
        arr.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        )
      );
    });
    return () => unsub();
  }, []);
  const crear = async () => {
    const nombre = prompt('Nombre del torneo');
    if (!nombre) return;
    const categoria = prompt('Categoría (U13, U15, U17, Primera)') || 'Primera';
    await addDoc(collection(db, 'torneos'), {
      nombre,
      categoria,
      createdAt: serverTimestamp(),
    });
  };
  const eliminar = async (id) => {
    if (
      !confirm(
        'Eliminar torneo? (subcolecciones no se borran con deleteDoc: limpia manual o usa Cloud Functions)'
      )
    )
      return;
    await deleteDoc(doc(db, 'torneos', id));
  };
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold'>Seleccionar Torneo</h2>
        {admin && !guest && (
          <button
            onClick={crear}
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
                    nav(`/torneo/${t.id}`, {
                      state: {
                        admin: admin && !guest,
                      },
                    })
                  }
                  className='px-3 py-2 rounded bg-blue-600 textwhite'
                >
                  Entrar
                </button>
                {admin && !guest && (
                  <button
                    onClick={() => eliminar(t.id)}
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
