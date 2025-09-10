// src/routes/Torneos.jsx
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

/* ============== Config ============== */
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
const PAGE_SIZE = 8;

/* ============== Helpers UI ============== */
const catIdx = (c) => {
  const i = CATEGORIAS.indexOf(c || '');
  return i === -1 ? 999 : i;
};
const catPillClass = (c = '') =>
  c.startsWith('Femenino')
    ? 'bg-pink-100 text-pink-700 ring-1 ring-pink-200'
    : 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';

const IconPlus = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path fill="currentColor" d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2z" />
  </svg>
);
const IconEdit = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      fill="currentColor"
      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
    />
  </svg>
);
const IconTrash = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      fill="currentColor"
      d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
    />
  </svg>
);
const IconArrowDown = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path fill="currentColor" d="M7 10l5 5 5-5z" />
  </svg>
);
const IconChevronRight = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...p}>
    <path fill="currentColor" d="M9 6l6 6-6 6z" />
  </svg>
);

const hueFromString = (s = '') => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
const Monogram = ({ name = 'Torneo' }) => {
  const h = hueFromString(name);
  return (
    <div
      className="w-11 h-11 rounded-xl grid place-items-center text-white font-semibold shadow-sm shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${h} 80% 55%) 0%, hsl(${(h + 40) % 360} 85% 45%) 100%)`,
      }}
      aria-hidden
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </div>
  );
};
const ago = (ts) => {
  const ms =
    ts?.seconds != null ? ts.seconds * 1000 : ts instanceof Date ? +ts : 0;
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.round(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const d = Math.round(hs / 24);
  return `hace ${d} día${d > 1 ? 's' : ''}`;
};

/* ============== Componente ============== */
export default function Torneos() {
  const nav = useNavigate();

  const [admin, setAdmin] = useState(false);
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const canManage = admin;

  // Crear/editar
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ nombre: '', categoria: 'U11' });
  const [editingId, setEditingId] = useState(null);

  // Confirmar borrado
  const [openConfirm, setOpenConfirm] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  // Filtros
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('Todas');
  const [sortBy, setSortBy] = useState('recientes');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Sheet móvil
  const [showFilters, setShowFilters] = useState(false);

  /* ---- Permisos ---- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        setAdmin(await isAdmin(u?.email));
      } catch {
        setAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  /* ---- Datos ---- */
  useEffect(() => {
    const q = collection(db, 'torneos');
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTorneos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        if (err.code === 'permission-denied') {
          alert('No tenés permisos para ver torneos. Revisá las reglas y si estás logueado.');
        } else {
          console.error(err);
        }
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* ---- Derivados ---- */
  const dynamicCatOptions = useMemo(() => {
    const present = new Set(torneos.map((t) => t.categoria).filter(Boolean));
    const fromData = CATEGORIAS.filter((c) => present.has(c));
    return fromData.length ? fromData : CATEGORIAS;
  }, [torneos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return torneos.filter((t) => {
      const okNombre = q === '' || (t.nombre || '').toLowerCase().includes(q);
      const okCat = catFilter === 'Todas' || (t.categoria || '') === catFilter;
      return okNombre && okCat;
    });
  }, [torneos, query, catFilter]);

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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, catFilter, sortBy]);

  const visible = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const canLoadMore = visibleCount < sorted.length;

  /* ---- CRUD ---- */
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
    if (!CATEGORIAS.includes(categoria)) return alert('Elegí una categoría válida');

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

  /* ============== Render ============== */
  return (
    <div className="space-y-6">
      {/* Hero / Header */}
      <div className="rounded-3xl p-[1px] bg-gradient-to-r from-sky-200 via-purple-200 to-pink-200">
        <div className="rounded-3xl bg-white/80 backdrop-blur-md border border-white/60 px-4 py-4 sm:px-5 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
                Torneos
              </h2>
              <p className="text-sm text-gray-600">Gestioná, buscá y filtrá tus torneos</p>
            </div>
            {canManage && (
              <button
                onClick={abrirCrear}
                className="group inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md active:scale-[0.98]"
              >
                <IconPlus className="opacity-90 group-hover:opacity-100" />
                <span className="hidden xs:inline">Crear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar sticky — móvil compacto */}
      <div className="sticky top-16 z-30">
        <div className="rounded-2xl bg-white/70 backdrop-blur-md border shadow-sm p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                className="w-full rounded-xl border px-10 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Buscar por nombre…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar torneos por nombre"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
            </div>

            {/* Botón Filtros solo en móvil */}
            <button
              onClick={() => setShowFilters(true)}
              className="sm:hidden rounded-xl border px-3 py-2 bg-gray-50 hover:bg-gray-100"
              aria-label="Abrir filtros"
            >
              Filtros
            </button>

            {/* Selects visibles en md+ */}
            <div className="hidden sm:flex gap-2">
              <div className="relative">
                <select
                  className="appearance-none rounded-xl border px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-blue-200"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  title="Filtrar por categoría"
                >
                  <option value="Todas">Todas las categorías</option>
                  {dynamicCatOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <IconArrowDown />
                </span>
              </div>
              <div className="relative">
                <select
                  className="appearance-none rounded-xl border px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-blue-200"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  title="Ordenar"
                >
                  <option value="recientes">Recientes</option>
                  <option value="antiguos">Antiguos</option>
                  <option value="nombreAZ">Nombre A→Z</option>
                  <option value="nombreZA">Nombre Z→A</option>
                  <option value="categoriaAZ">Categoría A→Z</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <IconArrowDown />
                </span>
              </div>
              {(query || catFilter !== 'Todas' || sortBy !== 'recientes') && (
                <button
                  className="rounded-xl border px-3 py-2 bg-gray-50 hover:bg-gray-100"
                  onClick={() => {
                    setQuery('');
                    setCatFilter('Todas');
                    setSortBy('recientes');
                  }}
                  title="Limpiar filtros"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Chips rápidas (md+) */}
          <div className="mt-3 hidden sm:flex gap-2 overflow-x-auto no-scrollbar">
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
        </div>
      </div>

      {/* Contador */}
      <div className="text-sm text-gray-600">
        Mostrando <b>{visible.length}</b> de <b>{sorted.length}</b> torneos
        {(query || catFilter !== 'Todas') && ' (filtrados)'}.
      </div>

      {/* Lista / Skeleton / Vacío */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading &&
          torneos.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-sm border animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}

        {!loading && visible.length === 0 && (
          <div className="col-span-full text-center bg-white border rounded-2xl p-10 shadow-sm">
            <div className="text-5xl mb-2">🗂️</div>
            <p className="text-gray-700 font-medium mb-1">No hay torneos para mostrar</p>
            <p className="text-gray-500 text-sm">Ajustá los filtros o creá un nuevo torneo.</p>
            {canManage && (
              <button
                onClick={abrirCrear}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
              >
                <IconPlus /> Crear torneo
              </button>
            )}
          </div>
        )}

        {visible.map((t) => (
          <div
            key={t.id}
            onClick={() => nav(`/torneo/${t.id}`)}
            className="group bg-white rounded-2xl shadow-sm border p-4 transition hover:shadow-lg cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Monogram name={t.nombre} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base sm:text-lg truncate">
                  {t.nombre}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${catPillClass(t.categoria)}`}>
                    {t.categoria || 'Sin categoría'}
                  </span>
                  {t.createdAt && (
                    <span className="text-xs text-gray-500">· {ago(t.createdAt)}</span>
                  )}
                </div>
              </div>

              <IconChevronRight className="text-gray-400 group-hover:text-gray-600" />

              {canManage && (
                <div
                  className="ml-1 flex gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    onClick={() => abrirEditar(t)}
                    className="w-10 h-10 grid place-items-center rounded-xl bg-amber-500 text-white hover:bg-amber-600 active:scale-95"
                    title="Editar"
                  >
                    <IconEdit />
                  </button>
                  <button
                    onClick={() => confirmarBorrar(t)}
                    className="w-10 h-10 grid place-items-center rounded-xl bg-red-600 text-white hover:bg-red-700 active:scale-95"
                    title="Borrar"
                  >
                    <IconTrash />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Paginación */}
      {visible.length > 0 && (
        <div className="flex justify-center pt-1">
          <button
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border shadow-sm hover:bg-gray-50 disabled:opacity-50 active:scale-[0.99]"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            disabled={!canLoadMore}
          >
            {canLoadMore ? (
              <>
                Ver más <span className="text-lg">↓</span>
              </>
            ) : (
              'Fin de la lista'
            )}
          </button>
        </div>
      )}

      {/* Modal Crear/Editar */}
      {openAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => {
            setOpenAdd(false);
            setEditingId(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              {editingId ? 'Editar torneo' : 'Crear torneo'}
            </h3>
            <form onSubmit={guardar} className="space-y-3">
              <div>
                <label className="text-sm">Nombre</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Ej. Apertura 2025"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm">Categoría</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenAdd(false);
                    setEditingId(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-gray-900 text-white hover:bg-black"
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => {
            setOpenConfirm(false);
            setToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Eliminar torneo</h3>
            <p className="text-sm text-gray-600">
              ¿Seguro que querés eliminar <b>{toDelete.nombre}</b>?<br />
              <span className="text-red-600">
                Las subcolecciones (equipos/partidos) no se borran automáticamente.
              </span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={() => {
                  setOpenConfirm(false);
                  setToDelete(null);
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={borrar}
                className="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-sheet de Filtros (móvil) */}
      {showFilters && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-end sm:hidden"
          onClick={() => setShowFilters(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white p-4 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 bg-gray-300 rounded-full mx-auto mb-3" />
            <h4 className="text-base font-semibold mb-3">Filtros</h4>

            <div className="space-y-3">
              <div>
                <label className="text-sm">Categoría</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                >
                  <option value="Todas">Todas</option>
                  {dynamicCatOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm">Orden</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="recientes">Recientes</option>
                  <option value="antiguos">Antiguos</option>
                  <option value="nombreAZ">Nombre A→Z</option>
                  <option value="nombreZA">Nombre Z→A</option>
                  <option value="categoriaAZ">Categoría A→Z</option>
                </select>
              </div>

              <div className="pt-1">
                <div className="text-xs text-gray-500 mb-1">Rápidos</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCatFilter('Todas')}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      catFilter === 'Todas'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white'
                    }`}
                  >
                    Todas
                  </button>
                  {dynamicCatOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCatFilter(c)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        catFilter === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  className="rounded-xl border px-3 py-2 bg-gray-50 hover:bg-gray-100"
                  onClick={() => {
                    setQuery('');
                    setCatFilter('Todas');
                    setSortBy('recientes');
                  }}
                >
                  Limpiar
                </button>
                {/* Botón cambiado a negro en vez de azul */}
                <button
                  className="rounded-xl px-4 py-2 text-white bg-gray-900 hover:bg-black"
                  onClick={() => setShowFilters(false)}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
