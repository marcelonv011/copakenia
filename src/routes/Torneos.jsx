import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { isAdmin } from '../lib/firestore';

// Categorías (masculino + femenino)
const CATEGORIAS = [
  'U11',
  'U13',
  'U15',
  'U17',
  'U19',
  'Primera',
  'Femenino U11',
  'Femenino U13',
  'Femenino U15',
  'Femenino U17',
  'Femenino U19',
  'Femenino Primera',
];

// Tamaño de página (paginación cliente)
const PAGE_SIZE = 8;

// Helper: índice canónico de categoría
const catIdx = (c) => {
  const i = CATEGORIAS.indexOf(c || '');
  return i === -1 ? 999 : i;
};

// Pill de categoría (colores distintos)
const catPillClass = (c = '') =>
  c.startsWith('Femenino')
    ? 'bg-pink-100 text-pink-700'
    : 'bg-blue-100 text-blue-700';

// Iconitos (SVG inline, sin libs)
const IconPlus = (props) => (
  <svg viewBox='0 0 24 24' width='20' height='20' {...props}>
    <path fill='currentColor' d='M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2z' />
  </svg>
);
const IconEdit = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path
      fill='currentColor'
      d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
    />
  </svg>
);
const IconTrash = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path
      fill='currentColor'
      d='M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'
    />
  </svg>
);
const IconArrowDown = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path fill='currentColor' d='M7 10l5 5 5-5z' />
  </svg>
);

export default function Torneos() {
  const nav = useNavigate();

  const [admin, setAdmin] = useState(false);
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const canManage = admin; // CRUD solo si está en admins

  // Crear/editar
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ nombre: '', categoria: 'U11' });
  const [editingId, setEditingId] = useState(null);

  // Confirmar borrado
  const [openConfirm, setOpenConfirm] = useState(false);
  const [toDelete, setToDelete] = useState(null); // {id, nombre}

  // Búsqueda / filtro / orden / paginación
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('Todas');
  const [sortBy, setSortBy] = useState('recientes'); // recientes | antiguos | nombreAZ | nombreZA | categoriaAZ
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Admin
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAdmin(await isAdmin(u?.email));
    });
    return () => unsub();
  }, []);

  // Suscripción a torneos (cliente)
  useEffect(() => {
    const q = collection(db, 'torneos');
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTorneos(arr);
        setLoading(false);
      },
      (err) => {
        if (err.code === 'permission-denied') {
          alert(
            'No tenés permisos para ver torneos. Revisá las reglas y si estás logueado.'
          );
        } else {
          console.error(err);
        }
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Opciones de categoría dinámicas
  const dynamicCatOptions = useMemo(() => {
    const present = new Set(torneos.map((t) => t.categoria).filter(Boolean));
    const fromData = CATEGORIAS.filter((c) => present.has(c));
    return fromData.length ? fromData : CATEGORIAS;
  }, [torneos]);

  // Filtro
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return torneos.filter((t) => {
      const okNombre = q === '' || (t.nombre || '').toLowerCase().includes(q);
      const okCat = catFilter === 'Todas' || (t.categoria || '') === catFilter;
      return okNombre && okCat;
    });
  }, [torneos, query, catFilter]);

  // Orden
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const getTS = (t) => t.createdAt?.seconds ?? 0;
    switch (sortBy) {
      case 'antiguos':
        arr.sort((a, b) => getTS(a) - getTS(b));
        break;
      case 'nombreAZ':
        arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        break;
      case 'nombreZA':
        arr.sort((a, b) => (b.nombre || '').localeCompare(a.nombre || ''));
        break;
      case 'categoriaAZ':
        arr.sort(
          (a, b) =>
            catIdx(a.categoria) - catIdx(b.categoria) ||
            (a.nombre || '').localeCompare(b.nombre || '')
        );
        break;
      case 'recientes':
      default:
        arr.sort((a, b) => getTS(b) - getTS(a));
        break;
    }
    return arr;
  }, [filtered, sortBy]);

  // Reset paginado al cambiar filtros
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, catFilter, sortBy]);

  const visible = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount]
  );
  const canLoadMore = visibleCount < sorted.length;

  // Helpers
  const abrirCrear = () => {
    setEditingId(null);
    setForm({ nombre: '', categoria: 'U11' });
    setOpenAdd(true);
  };
  const abrirEditar = (t) => {
    setEditingId(t.id);
    setForm({ nombre: t.nombre || '', categoria: t.categoria || 'U11' });
    setOpenAdd(true);
  };
  const guardar = async (e) => {
    e.preventDefault();
    const nombre = form.nombre.trim();
    const categoria = form.categoria;
    if (!nombre) return alert('Poné un nombre para el torneo');
    if (!CATEGORIAS.includes(categoria))
      return alert('Elegí una categoría válida');

    if (editingId) {
      await updateDoc(doc(db, 'torneos', editingId), { nombre, categoria });
    } else {
      await addDoc(collection(db, 'torneos'), {
        nombre,
        categoria,
        createdAt: serverTimestamp(),
      });
    }
    setOpenAdd(false);
    setEditingId(null);
    setForm({ nombre: '', categoria: 'U11' });
  };
  const confirmarBorrar = (t) => {
    setToDelete({ id: t.id, nombre: t.nombre });
    setOpenConfirm(true);
  };
  const borrar = async () => {
    if (!toDelete) return;
    await deleteDoc(doc(db, 'torneos', toDelete.id));
    setOpenConfirm(false);
    setToDelete(null);
  };

  return (
    <div className='space-y-5'>
      {/* Hero / Header con gradiente */}
      <div className='rounded-2xl p-[1px] bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200'>
        <div className='rounded-2xl bg-white/80 backdrop-blur-sm p-4 sm:p-5'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h2 className='text-xl sm:text-2xl font-bold tracking-tight'>
                Torneos
              </h2>
              <p className='text-sm text-gray-600'>
                Gestioná, buscá y filtrá tus torneos
              </p>
            </div>
            {canManage && (
              <button
                onClick={abrirCrear}
                className='group inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
              >
                <IconPlus className='opacity-90 group-hover:opacity-100' />
                <span className='hidden sm:inline'>Crear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar “glass” sticky */}
      <div className='sticky top-16 z-30'>
        <div className='rounded-2xl bg-white/70 backdrop-blur-md border shadow-sm p-3'>
          <div className='flex flex-col sm:flex-row sm:items-center gap-3'>
            {/* Buscador */}
            <div className='relative w-full sm:max-w-md'>
              <input
                className='w-full rounded-xl border px-10 py-2 outline-none focus:ring-2 focus:ring-blue-200'
                placeholder='Buscar por nombre…'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label='Buscar torneos por nombre'
              />
              <span className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'>
                🔎
              </span>
            </div>

            {/* Selects */}
            <div className='flex gap-2 flex-wrap'>
              <div className='relative'>
                <select
                  className='appearance-none rounded-xl border px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-blue-200'
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  title='Filtrar por categoría'
                >
                  <option value='Todas'>Todas las categorías</option>
                  {dynamicCatOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400'>
                  <IconArrowDown />
                </span>
              </div>

              <div className='relative'>
                <select
                  className='appearance-none rounded-xl border px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-blue-200'
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  title='Ordenar'
                >
                  <option value='recientes'>Recientes</option>
                  <option value='antiguos'>Antiguos</option>
                  <option value='nombreAZ'>Nombre A→Z</option>
                  <option value='nombreZA'>Nombre Z→A</option>
                  <option value='categoriaAZ'>Categoría A→Z</option>
                </select>
                <span className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400'>
                  <IconArrowDown />
                </span>
              </div>

              {(query || catFilter !== 'Todas' || sortBy !== 'recientes') && (
                <button
                  className='rounded-xl border px-3 py-2 bg-gray-50 hover:bg-gray-100'
                  onClick={() => {
                    setQuery('');
                    setCatFilter('Todas');
                    setSortBy('recientes');
                  }}
                  title='Limpiar filtros'
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Chips rápidas */}
          {dynamicCatOptions.length > 0 && (
            <div className='mt-3 flex gap-2 overflow-x-auto no-scrollbar'>
              <button
                onClick={() => setCatFilter('Todas')}
                className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
                  catFilter === 'Todas'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                Todas
              </button>
              {dynamicCatOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
                    catFilter === c
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contador */}
      <div className='text-sm text-gray-600'>
        Mostrando <b>{visible.length}</b> de <b>{sorted.length}</b> torneos
        {(query || catFilter !== 'Todas') && ' (filtrados)'}.
      </div>

      {/* Lista / Skeleton / Vacío */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {loading &&
          torneos.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='rounded-2xl bg-white p-4 shadow-sm border'>
              <div className='h-4 w-40 bg-gray-200 rounded animate-pulse mb-3'></div>
              <div className='h-3 w-56 bg-gray-100 rounded animate-pulse'></div>
            </div>
          ))}

        {!loading && visible.length === 0 && (
          <div className='col-span-full text-center bg-white border rounded-2xl p-8 shadow-sm'>
            <div className='text-4xl mb-2'>🧐</div>
            <p className='text-gray-600'>No hay torneos para mostrar.</p>
            {canManage && (
              <button
                onClick={abrirCrear}
                className='mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700'
              >
                <IconPlus /> Crear el primero
              </button>
            )}
          </div>
        )}

        {visible.map((t) => (
          <div
            key={t.id}
            className='bg-white rounded-2xl shadow-sm border p-4 transition hover:shadow-md'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='font-semibold text-lg truncate'>{t.nombre}</div>
                <div className='mt-1 flex items-center gap-2'>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${catPillClass(
                      t.categoria
                    )}`}
                  >
                    {t.categoria || 'Sin categoría'}
                  </span>
                </div>
              </div>

              <div className='flex gap-2 shrink-0'>
                <button
                  onClick={() => nav(`/torneo/${t.id}`)}
                  className='px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700'
                  title='Entrar'
                >
                  Entrar
                </button>
                {canManage && (
                  <>
                    <button
                      onClick={() => abrirEditar(t)}
                      className='px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600'
                      title='Editar'
                    >
                      <span className='inline-flex items-center gap-1'>
                        <IconEdit />
                        Editar
                      </span>
                    </button>
                    <button
                      onClick={() => confirmarBorrar(t)}
                      className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
                      title='Borrar'
                    >
                      <span className='inline-flex items-center gap-1'>
                        <IconTrash />
                        Borrar
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paginación (cliente) */}
      {visible.length > 0 && (
        <div className='flex justify-center pt-1'>
          <button
            className='inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border shadow-sm hover:bg-gray-50 disabled:opacity-50'
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            disabled={!canLoadMore}
          >
            {canLoadMore ? (
              <>
                Ver más <span className='text-lg'>↓</span>
              </>
            ) : (
              'Fin de la lista'
            )}
          </button>
        </div>
      )}

      {/* FAB móvil para crear */}
      {canManage && (
        <button
          onClick={abrirCrear}
          className='md:hidden fixed right-4 bottom-20 inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700'
          aria-label='Crear torneo'
          title='Crear torneo'
        >
          <IconPlus />
        </button>
      )}

      {/* Modal Crear/Editar */}
      {openAdd && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => {
            setOpenAdd(false);
            setEditingId(null);
          }}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              {editingId ? 'Editar torneo' : 'Crear torneo'}
            </h3>
            <form onSubmit={guardar} className='space-y-3'>
              <div>
                <label className='text-sm'>Nombre</label>
                <input
                  className='mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200'
                  placeholder='Ej. Apertura 2025'
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  autoFocus
                />
              </div>

              <div>
                <label className='text-sm'>Categoría</label>
                <select
                  className='mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200'
                  value={form.categoria}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoria: e.target.value }))
                  }
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => {
                    setOpenAdd(false);
                    setEditingId(null);
                  }}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700'
                >
                  {editingId ? 'Guardar cambios' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Borrado */}
      {openConfirm && toDelete && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => {
            setOpenConfirm(false);
            setToDelete(null);
          }}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-2'>Eliminar torneo</h3>
            <p className='text-sm text-gray-600'>
              ¿Seguro que querés eliminar <b>{toDelete.nombre}</b>?<br />
              <span className='text-red-600'>
                Las subcolecciones (equipos/partidos) no se borran
                automáticamente.
              </span>
            </p>
            <div className='flex items-center justify-end gap-2 pt-4'>
              <button
                onClick={() => {
                  setOpenConfirm(false);
                  setToDelete(null);
                }}
                className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
              >
                Cancelar
              </button>
              <button
                onClick={borrar}
                className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
