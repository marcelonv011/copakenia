import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  addDoc,
  deleteDoc,
  deleteField,
} from 'firebase/firestore';
import { isAdmin } from '../lib/firestore';

// --- UI helpers (coherente con Torneos.jsx) ---
const catPillClass = (c = '') =>
  c?.startsWith('Femenino')
    ? 'bg-pink-100 text-pink-700'
    : 'bg-blue-100 text-blue-700';

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox='0 0 24 24'
      aria-hidden='true'
    >
      <circle
        className='opacity-25'
        cx='12'
        cy='12'
        r='10'
        stroke='currentColor'
        strokeWidth='4'
        fill='none'
      ></circle>
      <path
        className='opacity-75'
        fill='currentColor'
        d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'
      ></path>
    </svg>
  );
}
const IconBack = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path fill='currentColor' d='M15 6l-6 6 6 6' />
  </svg>
);
const IconEdit = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path
      fill='currentColor'
      d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04l-2.34-2.34a1 1 0 0 0-1.41 0L15.13 6.53l3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z'
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
const IconScore = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path
      fill='currentColor'
      d='M3 5h18v14H3zM5 7h6v2H5zm0 4h6v2H5zm8-4h6v6h-6z'
    />
  </svg>
);
const IconPlus = (props) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...props}>
    <path fill='currentColor' d='M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2z' />
  </svg>
);

// Avatar por iniciales si no hay logo
const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
const Avatar = ({ name, logoUrl, size = 24 }) =>
  logoUrl ? (
    <img
      src={logoUrl}
      alt={name}
      className='rounded-full object-cover'
      style={{ width: size, height: size }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <div
      className='rounded-full bg-gray-200 text-gray-700 grid place-items-center font-semibold'
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </div>
  );

// --- Lógica de posiciones ---
function buildTable(partidosFinalizados, equiposMap) {
  const table = {};
  const ensure = (id) =>
    (table[id] ||= {
      id,
      nombre: equiposMap[id] || 'Equipo',
      pj: 0,
      pg: 0,
      pp: 0,
      pf: 0,
      pc: 0,
      dif: 0,
      pts: 0,
    });

  for (const p of partidosFinalizados) {
    const L = p.localId,
      V = p.visitanteId;
    if (!Number.isFinite(p.scoreLocal) || !Number.isFinite(p.scoreVisitante))
      continue;

    const tL = ensure(L),
      tV = ensure(V);
    tL.pj++;
    tV.pj++;
    tL.pf += p.scoreLocal;
    tL.pc += p.scoreVisitante;
    tV.pf += p.scoreVisitante;
    tV.pc += p.scoreLocal;

    if (p.scoreLocal === p.scoreVisitante) continue; // sin empates
    const localGana = p.scoreLocal > p.scoreVisitante;
    if (localGana) {
      tL.pg++;
      tV.pp++;
    } else {
      tV.pg++;
      tL.pp++;
    }
  }

  for (const id in table) {
    const t = table[id];
    t.dif = t.pf - t.pc;
    t.pts = t.pg * 2 + t.pp * 1;
  }

  return Object.values(table).sort(
    (a, b) =>
      b.pts - a.pts ||
      b.dif - a.dif ||
      b.pf - a.pf ||
      a.nombre.localeCompare(b.nombre)
  );
}

export default function Torneo() {
  const { id } = useParams(); // torneoId
  const nav = useNavigate();
  const { state, search } = useLocation();

  // --- Persistencia de invitado (state -> sessionStorage -> ?guest=1) ---
  const qsGuest = new URLSearchParams(search).get('guest') === '1';
  const [isGuest, setIsGuest] = useState(() => {
    const fromState = state?.guest;
    const fromStorage = sessionStorage.getItem('guest');
    if (typeof fromState === 'boolean') return fromState;
    if (fromStorage === 'true' || fromStorage === 'false')
      return fromStorage === 'true';
    return qsGuest;
  });
  useEffect(() => {
    if (typeof state?.guest === 'boolean') {
      sessionStorage.setItem('guest', String(state.guest));
      setIsGuest(state.guest);
    }
  }, [state?.guest]);

  const [admin, setAdmin] = useState(false);
  const canManage = admin && !isGuest; // 👈 sólo gestiona si NO es invitado

  const [torneo, setTorneo] = useState(null); // {nombre, categoria}
  const [equipos, setEquipos] = useState([]); // [{id, nombre, logoUrl?}]
  const [partidos, setPartidos] = useState([]); // [{...}]
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('fixture'); // fixture | resultados | posiciones | equipos

  // Modal resultado
  const [openResult, setOpenResult] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [scoreLocal, setScoreLocal] = useState('');
  const [scoreVisitante, setScoreVisitante] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal nuevo partido
  const [openMatch, setOpenMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({
    localId: '',
    visitanteId: '',
    fecha: '',
    cancha: '',
  });

  // Modal nuevo equipo
  const [openTeam, setOpenTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({ nombre: '', logoUrl: '' });

  // Modal confirmar eliminar partido
  const [openDeleteMatch, setOpenDeleteMatch] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState(null);

  // Cargar permisos por si entran directo
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAdmin(await isAdmin(u?.email));
    });
    return () => unsub();
  }, []);

  // Suscripciones
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const unsubTorneo = onSnapshot(doc(db, 'torneos', id), (d) => {
      setTorneo({ id: d.id, ...d.data() });
    });

    const unsubEquipos = onSnapshot(
      collection(db, 'torneos', id, 'equipos'),
      (snap) => setEquipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubPartidos = onSnapshot(
      query(collection(db, 'torneos', id, 'partidos'), orderBy('dia', 'asc')),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPartidos(arr);
        setLoading(false);
      }
    );

    return () => {
      unsubTorneo();
      unsubEquipos();
      unsubPartidos();
    };
  }, [id]);

  const equiposMap = useMemo(() => {
    const m = {};
    for (const e of equipos) m[e.id] = e.nombre;
    return m;
  }, [equipos]);

  // Derivados
  const fixture = useMemo(
    () => partidos.filter((p) => p.estado !== 'finalizado'),
    [partidos]
  );

  const resultados = useMemo(
    () =>
      partidos
        .filter((p) => p.estado === 'finalizado')
        .slice()
        .sort((a, b) => (b.dia?.seconds ?? 0) - (a.dia?.seconds ?? 0)),
    [partidos]
  );

  const posiciones = useMemo(
    () => buildTable(resultados, equiposMap),
    [resultados, equiposMap]
  );

  // Agrupar fixture por día (YYYY-MM-DD)
  const fixtureGrouped = useMemo(() => {
    const byDate = {};
    for (const p of fixture) {
      const key = p.dia?.seconds
        ? new Date(p.dia.seconds * 1000).toISOString().slice(0, 10)
        : 'Sin fecha';
      (byDate[key] ||= []).push(p);
    }
    const keys = Object.keys(byDate).sort();
    return keys.map((k) => ({ dateKey: k, matches: byDate[k] }));
  }, [fixture]);

  const fmtFecha = (ts) => {
    if (!ts?.seconds) return 'Sin fecha';
    const d = new Date(ts.seconds * 1000);
    const fecha = d.toLocaleDateString();
    const hora = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${fecha} · ${hora}`;
  };

  // --- Resultado ---
  const openResultado = (match) => {
    if (!canManage) return; // guard
    setEditingMatch(match);
    setScoreLocal(
      Number.isFinite(match?.scoreLocal) ? String(match.scoreLocal) : ''
    );
    setScoreVisitante(
      Number.isFinite(match?.scoreVisitante) ? String(match.scoreVisitante) : ''
    );
    setOpenResult(true);
  };
  const closeResultado = () => {
    setOpenResult(false);
    setEditingMatch(null);
    setScoreLocal('');
    setScoreVisitante('');
    setSaving(false);
  };
  const saveResultado = async (e) => {
    e.preventDefault();
    if (!canManage || !editingMatch) return; // guard
    const sl = Number(scoreLocal),
      sv = Number(scoreVisitante);
    if (!Number.isFinite(sl) || !Number.isFinite(sv) || sl < 0 || sv < 0)
      return alert('Cargá puntajes válidos.');
    if (sl === sv) return alert('No se permiten empates.');

    try {
      setSaving(true);
      await updateDoc(doc(db, 'torneos', id, 'partidos', editingMatch.id), {
        scoreLocal: sl,
        scoreVisitante: sv,
        estado: 'finalizado',
        updatedAt: serverTimestamp(),
      });
      closeResultado();
    } catch (err) {
      console.error(err);
      setSaving(false);
      alert('No se pudo guardar el resultado.');
    }
  };
  const revertirResultado = async (matchId) => {
    if (!canManage) return; // guard
    if (!confirm('¿Revertir este resultado a pendiente?')) return;
    try {
      await updateDoc(doc(db, 'torneos', id, 'partidos', matchId), {
        estado: 'pendiente',
        scoreLocal: deleteField(),
        scoreVisitante: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert('No se pudo revertir.');
    }
  };

  // --- Partidos (crear / confirmar borrar) ---
  const abrirNuevoPartido = () => {
    if (!canManage) return; // guard
    setMatchForm({ localId: '', visitanteId: '', fecha: '', cancha: '' });
    setOpenMatch(true);
  };
  const guardarPartido = async (e) => {
    e.preventDefault();
    if (!canManage) return; // guard
    const { localId, visitanteId, fecha, cancha } = matchForm;
    if (!localId || !visitanteId || localId === visitanteId)
      return alert('Elegí equipos distintos.');
    if (!fecha) return alert('Elegí fecha y hora.');
    if (!cancha || !cancha.trim()) return alert('Ingresá la cancha.');
    const dia = new Date(fecha);
    try {
      await addDoc(collection(db, 'torneos', id, 'partidos'), {
        localId,
        visitanteId,
        dia,
        cancha: cancha.trim(),
        estado: 'pendiente',
        createdAt: serverTimestamp(),
      });
      setOpenMatch(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el partido.');
    }
  };

  const solicitarBorrarPartido = (match) => {
    if (!canManage) return; // guard
    setMatchToDelete(match);
    setOpenDeleteMatch(true);
  };
  const cancelarBorrarPartido = () => {
    setOpenDeleteMatch(false);
    setMatchToDelete(null);
  };
  const ejecutarBorrarPartido = async () => {
    if (!canManage || !matchToDelete) return; // guard
    try {
      await deleteDoc(doc(db, 'torneos', id, 'partidos', matchToDelete.id));
      cancelarBorrarPartido();
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el partido.');
    }
  };

  // --- Equipos (crear/borrar) ---
  const abrirNuevoEquipo = () => {
    if (!canManage) return; // guard
    setTeamForm({ nombre: '', logoUrl: '' });
    setOpenTeam(true);
  };
  const guardarEquipo = async (e) => {
    e.preventDefault();
    if (!canManage) return; // guard
    const nombre = teamForm.nombre.trim();
    if (!nombre) return alert('Poné un nombre de equipo.');
    try {
      await addDoc(collection(db, 'torneos', id, 'equipos'), {
        nombre,
        logoUrl: teamForm.logoUrl.trim() || '',
        createdAt: serverTimestamp(),
      });
      setOpenTeam(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el equipo.');
    }
  };
  const borrarEquipo = async (teamId) => {
    if (!canManage) return; // guard
    const usado = partidos.some(
      (p) => p.localId === teamId || p.visitanteId === teamId
    );
    if (usado)
      return alert(
        'No podés borrar el equipo: está referenciado por partidos.'
      );
    if (!confirm('¿Eliminar este equipo?')) return;
    try {
      await deleteDoc(doc(db, 'torneos', id, 'equipos', teamId));
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el equipo.');
    }
  };

  const EquipoTag = ({ nombre, logoUrl }) => (
    <div className='inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-white'>
      <Avatar name={nombre} logoUrl={logoUrl} size={18} />
      <span className='text-xs'>{nombre}</span>
    </div>
  );

  return (
    <div className='space-y-5'>
      {/* Header con gradiente + Volver + acciones */}
      <div className='rounded-2xl p-[1px] bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200'>
        <div className='rounded-2xl bg-white/80 backdrop-blur-sm p-4 sm:p-5'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-2'>
              <div>
                <h2 className='text-xl sm:text-2xl font-bold tracking-tight'>
                  {torneo?.nombre || 'Torneo'}
                </h2>
                {torneo?.categoria && (
                  <div
                    className={`inline-block mt-1 text-xs font-medium px-2 py-1 rounded-full ${catPillClass(
                      torneo.categoria
                    )}`}
                  >
                    {torneo.categoria}
                  </div>
                )}
              </div>
            </div>

            <div className='flex items-center gap-2'>
              <div className='hidden sm:block text-sm text-gray-500 mr-2'>
                {equipos.length} equipos · {partidos.length} partidos
              </div>
              {canManage && (
                <>
                  <button
                    onClick={abrirNuevoEquipo}
                    className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700'
                    title='Nuevo equipo'
                  >
                    <IconPlus /> Equipo
                  </button>
                  <button
                    onClick={abrirNuevoPartido}
                    className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                    title='Nuevo partido'
                  >
                    <IconPlus /> Partido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className='rounded-2xl bg-white/70 backdrop-blur-md border shadow-sm p-2'>
        <div className='flex items-center gap-2 flex-wrap'>
          {['fixture', 'resultados', 'posiciones', 'equipos'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm border transition ${
                tab === t
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              {
                {
                  fixture: 'Fixture',
                  resultados: 'Resultados',
                  posiciones: 'Posiciones',
                  equipos: 'Equipos',
                }[t]
              }
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='rounded-2xl bg-white p-4 shadow-sm border'>
              <div className='h-4 w-40 bg-gray-200 rounded animate-pulse mb-3'></div>
              <div className='h-3 w-56 bg-gray-100 rounded animate-pulse'></div>
            </div>
          ))}
        </div>
      )}

      {/* FIXTURE */}
      {!loading && tab === 'fixture' && (
        <div className='space-y-4'>
          {fixtureGrouped.length === 0 && (
            <div className='text-center bg-white border rounded-2xl p-8 shadow-sm'>
              <div className='text-4xl mb-2'>📅</div>
              <p className='text-gray-600'>No hay partidos próximos.</p>
            </div>
          )}

          {fixtureGrouped.map(({ dateKey, matches }) => (
            <div key={dateKey} className='space-y-2'>
              <div className='text-sm text-gray-500'>
                {dateKey === 'Sin fecha'
                  ? 'Sin fecha'
                  : new Date(dateKey).toLocaleDateString()}
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {matches.map((p) => (
                  <div
                    key={p.id}
                    className='bg-white rounded-2xl shadow-sm border p-4'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='min-w-0'>
                        <div className='font-semibold truncate flex items-center gap-2'>
                          <Avatar
                            name={equiposMap[p.localId]}
                            logoUrl={
                              equipos.find((e) => e.id === p.localId)?.logoUrl
                            }
                          />{' '}
                          {equiposMap[p.localId] || 'Local'}
                          <span className='mx-1 text-gray-400'>vs</span>
                          <Avatar
                            name={equiposMap[p.visitanteId]}
                            logoUrl={
                              equipos.find((e) => e.id === p.visitanteId)
                                ?.logoUrl
                            }
                          />{' '}
                          {equiposMap[p.visitanteId] || 'Visitante'}
                        </div>
                        <div className='text-sm text-gray-500'>
                          {fmtFecha(p.dia)}
                          {p.cancha ? ` · ${p.cancha}` : ''}
                        </div>
                      </div>
                      {canManage && (
                        <div className='flex gap-2 shrink-0'>
                          <button
                            onClick={() => openResultado(p)}
                            className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                            title='Cargar resultado'
                          >
                            <IconScore /> Cargar
                          </button>
                          <button
                            onClick={() => solicitarBorrarPartido(p)}
                            className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
                            title='Eliminar partido'
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RESULTADOS */}
      {!loading && tab === 'resultados' && (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {resultados.length === 0 && (
            <div className='col-span-full text-center bg-white border rounded-2xl p-8 shadow-sm'>
              <div className='text-4xl mb-2'>🏀</div>
              <p className='text-gray-600'>Todavía no hay resultados.</p>
            </div>
          )}

          {resultados.map((p) => (
            <div
              key={p.id}
              className='bg-white rounded-2xl shadow-sm border p-4'
            >
              <div className='flex items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='font-semibold truncate flex items-center gap-2'>
                    <Avatar
                      name={equiposMap[p.localId]}
                      logoUrl={equipos.find((e) => e.id === p.localId)?.logoUrl}
                    />{' '}
                    {equiposMap[p.localId] || 'Local'}
                    <span className='px-2 py-0.5 rounded bg-gray-100'>
                      {typeof p.scoreLocal === 'number' ? p.scoreLocal : '-'}
                    </span>
                    <span className='text-gray-400'>–</span>
                    <span className='px-2 py-0.5 rounded bg-gray-100'>
                      {typeof p.scoreVisitante === 'number'
                        ? p.scoreVisitante
                        : '-'}
                    </span>
                    {equiposMap[p.visitanteId] || 'Visitante'}{' '}
                    <Avatar
                      name={equiposMap[p.visitanteId]}
                      logoUrl={
                        equipos.find((e) => e.id === p.visitanteId)?.logoUrl
                      }
                    />
                  </div>
                  <div className='text-sm text-gray-500'>
                    {fmtFecha(p.dia)}
                    {p.cancha ? ` · ${p.cancha}` : ''}
                  </div>
                </div>
                {canManage && (
                  <div className='flex gap-2 shrink-0'>
                    <button
                      onClick={() => openResultado(p)}
                      className='inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600'
                      title='Editar resultado'
                    >
                      <IconEdit /> Editar
                    </button>
                    <button
                      onClick={() => revertirResultado(p.id)}
                      className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                      title='Revertir a pendiente'
                    >
                      Revertir
                    </button>
                    <button
                      onClick={() => solicitarBorrarPartido(p)}
                      className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
                      title='Eliminar partido'
                    >
                      <IconTrash />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* POSICIONES */}
      {!loading && tab === 'posiciones' && (
        <div className='bg-white rounded-2xl shadow-sm border overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead className='bg-gray-50'>
              <tr className='text-gray-600'>
                <th className='text-left px-4 py-2'>#</th>
                <th className='text-left px-4 py-2'>Equipo</th>
                <th className='text-center px-4 py-2'>PJ</th>
                <th className='text-center px-4 py-2'>PG</th>
                <th className='text-center px-4 py-2'>PP</th>
                <th className='text-center px-4 py-2'>PF</th>
                <th className='text-center px-4 py-2'>PC</th>
                <th className='text-center px-4 py-2'>DIF</th>
                <th className='text-center px-4 py-2'>PTS</th>
              </tr>
            </thead>
            <tbody>
              {posiciones.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className='text-center text-gray-500 px-4 py-6'
                  >
                    Sin datos aún.
                  </td>
                </tr>
              )}
              {posiciones.map((t, i) => (
                <tr key={t.id} className='border-t'>
                  <td className='px-4 py-2'>{i + 1}</td>
                  <td className='px-4 py-2'>{t.nombre}</td>
                  <td className='px-4 py-2 text-center'>{t.pj}</td>
                  <td className='px-4 py-2 text-center'>{t.pg}</td>
                  <td className='px-4 py-2 text-center'>{t.pp}</td>
                  <td className='px-4 py-2 text-center'>{t.pf}</td>
                  <td className='px-4 py-2 text-center'>{t.pc}</td>
                  <td className='px-4 py-2 text-center'>{t.dif}</td>
                  <td className='px-4 py-2 text-center font-semibold'>
                    {t.pts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* EQUIPOS */}
      {!loading && tab === 'equipos' && (
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <div className='text-sm text-gray-600'>
              {equipos.length} equipos
            </div>
            {canManage && (
              <button
                onClick={abrirNuevoEquipo}
                className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700'
              >
                <IconPlus /> Nuevo equipo
              </button>
            )}
          </div>

          {equipos.length === 0 ? (
            <div className='text-center bg-white border rounded-2xl p-8 shadow-sm'>
              <div className='text-4xl mb-2'>👥</div>
              <p className='text-gray-600'>Todavía no hay equipos.</p>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
              {equipos.map((e) => (
                <div
                  key={e.id}
                  className='bg-white rounded-2xl shadow-sm border p-4 flex items-center justify-between'
                >
                  <div className='flex items-center gap-3 min-w-0'>
                    <Avatar name={e.nombre} logoUrl={e.logoUrl} size={28} />
                    <div className='truncate'>{e.nombre}</div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => borrarEquipo(e.id)}
                      className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
                      title='Eliminar equipo'
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Cargar/Editar resultado */}
      {openResult && editingMatch && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={closeResultado}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>Cargar resultado</h3>
            <div className='text-sm text-gray-600 mb-3'>
              <EquipoTag
                id={editingMatch.localId}
                nombre={equiposMap[editingMatch.localId] || 'Local'}
                logoUrl={
                  equipos.find((e) => e.id === editingMatch.localId)?.logoUrl
                }
              />{' '}
              vs{' '}
              <EquipoTag
                id={editingMatch.visitanteId}
                nombre={equiposMap[editingMatch.visitanteId] || 'Visitante'}
                logoUrl={
                  equipos.find((e) => e.id === editingMatch.visitanteId)
                    ?.logoUrl
                }
              />
              <div className='text-xs mt-1'>
                {fmtFecha(editingMatch.dia)}
                {editingMatch.cancha ? ` · ${editingMatch.cancha}` : ''}
              </div>
            </div>

            <form onSubmit={saveResultado} className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs text-gray-600'>
                    {equiposMap[editingMatch.localId] || 'Local'}
                  </label>
                  <input
                    type='number'
                    min={0}
                    inputMode='numeric'
                    className='mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200'
                    value={scoreLocal}
                    onChange={(e) => setScoreLocal(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className='text-xs text-gray-600'>
                    {equiposMap[editingMatch.visitanteId] || 'Visitante'}
                  </label>
                  <input
                    type='number'
                    min={0}
                    inputMode='numeric'
                    className='mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200'
                    value={scoreVisitante}
                    onChange={(e) => setScoreVisitante(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={closeResultado}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  disabled={saving}
                  className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60'
                >
                  {saving && <Spinner />} Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nuevo partido (cancha obligatoria) */}
      {openMatch && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenMatch(false)}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>Nuevo partido</h3>
            <form onSubmit={guardarPartido} className='space-y-3'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='text-sm'>Local</label>
                  <select
                    className='mt-1 w-full rounded-xl border px-3 py-2'
                    value={matchForm.localId}
                    onChange={(e) =>
                      setMatchForm((f) => ({ ...f, localId: e.target.value }))
                    }
                    required
                  >
                    <option value=''>Elegir…</option>
                    {equipos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='text-sm'>Visitante</label>
                  <select
                    className='mt-1 w-full rounded-xl border px-3 py-2'
                    value={matchForm.visitanteId}
                    onChange={(e) =>
                      setMatchForm((f) => ({
                        ...f,
                        visitanteId: e.target.value,
                      }))
                    }
                    required
                  >
                    <option value=''>Elegir…</option>
                    {equipos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='text-sm'>Fecha & hora</label>
                  <input
                    type='datetime-local'
                    className='mt-1 w-full rounded-xl border px-3 py-2'
                    value={matchForm.fecha}
                    onChange={(e) =>
                      setMatchForm((f) => ({ ...f, fecha: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className='text-sm'>Cancha</label>
                  <input
                    className='mt-1 w-full rounded-xl border px-3 py-2'
                    placeholder='Ej. Club A'
                    value={matchForm.cancha}
                    onChange={(e) =>
                      setMatchForm((f) => ({ ...f, cancha: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setOpenMatch(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nuevo equipo */}
      {openTeam && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenTeam(false)}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>Nuevo equipo</h3>
            <form onSubmit={guardarEquipo} className='space-y-3'>
              <div>
                <label className='text-sm'>Nombre</label>
                <input
                  className='mt-1 w-full rounded-xl border px-3 py-2'
                  placeholder='Ej. Los Tigres'
                  value={teamForm.nombre}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className='text-sm'>Logo (URL opcional)</label>
                <input
                  className='mt-1 w-full rounded-xl border px-3 py-2'
                  placeholder='https://…  o  /logos/tigres.png'
                  value={teamForm.logoUrl}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, logoUrl: e.target.value }))
                  }
                />
                <p className='text-xs text-gray-500 mt-1'>
                  Tip: colocá imágenes en <code>/public/logos</code> y usá rutas
                  como <code>/logos/tigres.png</code>.
                </p>
              </div>

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setOpenTeam(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700'
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminar partido */}
      {openDeleteMatch && matchToDelete && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={cancelarBorrarPartido}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              ¿Estás seguro que quieres eliminar el partido?
            </h3>
            <p className='text-sm text-gray-600 mb-3'>
              <EquipoTag
                id={matchToDelete.localId}
                nombre={equiposMap[matchToDelete.localId] || 'Local'}
                logoUrl={
                  equipos.find((e) => e.id === matchToDelete.localId)?.logoUrl
                }
              />{' '}
              vs{' '}
              <EquipoTag
                id={matchToDelete.visitanteId}
                nombre={equiposMap[matchToDelete.visitanteId] || 'Visitante'}
                logoUrl={
                  equipos.find((e) => e.id === matchToDelete.visitanteId)
                    ?.logoUrl
                }
              />
              <div className='text-xs mt-1'>
                {fmtFecha(matchToDelete.dia)}
                {matchToDelete.cancha ? ` · ${matchToDelete.cancha}` : ''}
              </div>
            </p>
            <div className='flex items-center justify-end gap-2 pt-2'>
              <button
                onClick={cancelarBorrarPartido}
                className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarBorrarPartido}
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
