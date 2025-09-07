// src/routes/Torneo.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  setDoc,
  where,
  getDocs,
} from 'firebase/firestore';
import { isAdmin } from '../lib/firestore';

/* ---------------- UI helpers ---------------- */
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
      />
      <path
        className='opacity-75'
        fill='currentColor'
        d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'
      />
    </svg>
  );
}
const IconBack = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path fill='currentColor' d='M15 6l-6 6 6 6' />
  </svg>
);
const IconEdit = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04l-2.34-2.34a1 1 0 0 0-1.41 0L15.13 6.53l3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z'
    />
  </svg>
);
const IconTrash = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'
    />
  </svg>
);
const IconScore = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M3 5h18v14H3zM5 7h6v2H5zm0 4h6v2H5zm8-4h6v6h-6z'
    />
  </svg>
);
const IconPlus = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path fill='currentColor' d='M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2z' />
  </svg>
);

/* ---------- Helpers visuales Fase Final ---------- */
const IconTrophy = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M6 2h12v2h3v3a5 5 0 0 1-5 5c-.9 1.2-2.2 2-3.7 2.4V17h3v2H8v-2h3.7v-2.6C10.2 12 8.9 11.2 8 10A5 5 0 0 1 3 7V4h3V2zm13 4v1a3 3 0 0 1-3 3V4h3v2zM5 6V4h3v6A3 3 0 0 1 5 7V6z'
    />
  </svg>
);
const IconBracket = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M5 4h4v2H7v12h2v2H5V4zm10 0h4v16h-4v-2h2V6h-2V4z'
    />
  </svg>
);

const CupTag = ({ tipo }) => {
  const map = {
    'copa-oro': 'bg-amber-100 text-amber-700 border-amber-200',
    'copa-plata': 'bg-slate-100 text-slate-700 border-slate-200',
    'copa-bronce': 'bg-orange-100 text-orange-700 border-orange-200',
  };
  const label =
    tipo === 'copa-oro'
      ? 'Copa Oro'
      : tipo === 'copa-plata'
      ? 'Copa Plata'
      : 'Copa Bronce';
  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border text-xs font-medium ${map[tipo]}`}
    >
      <IconTrophy /> {label}
    </span>
  );
};

const StageBadge = ({ fase }) => {
  const text =
    {
      final: 'Final',
      semi: 'Semifinales',
      cuartos: 'Cuartos',
      octavos: 'Octavos',
    }[fase] || fase;
  return (
    <span className='inline-block px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100'>
      {text}
    </span>
  );
};

const FancyPanel = ({ icon, title, subtitle, right, children }) => (
  <div className='rounded-2xl border shadow-sm bg-white overflow-hidden'>
    <div className='p-[1px] bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300'>
      <div className='flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3'>
        <div className='flex items-center gap-2'>
          <div className='rounded-xl bg-gray-900 text-white p-2'>{icon}</div>
          <div>
            <div className='font-semibold leading-tight'>{title}</div>
            {subtitle && (
              <div className='text-xs text-gray-500'>{subtitle}</div>
            )}
          </div>
        </div>
        {right}
      </div>
    </div>
    <div className='p-4'>{children}</div>
  </div>
);

/* Avatar / EquipoTag */
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
const EquipoTag = ({ nombre, logoUrl }) => (
  <span className='inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-white'>
    <Avatar name={nombre} logoUrl={logoUrl} size={18} />
    <span className='text-xs'>{nombre}</span>
  </span>
);

/* Fecha/hora */
function fmtFecha(ts) {
  if (!ts) return 'Sin fecha';
  const d = ts?.seconds
    ? new Date(ts.seconds * 1000)
    : ts instanceof Date
    ? ts
    : null;
  if (!d) return 'Sin fecha';
  const fecha = d.toLocaleDateString();
  const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora}`;
}

/* Tabla posiciones */
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
    if (p.scoreLocal === p.scoreVisitante) continue;
    if (p.scoreLocal > p.scoreVisitante) {
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

/* Fila partido */
function MatchRow({
  localId,
  visitanteId,
  scoreLocal,
  scoreVisitante,
  equipos,
  equiposMap,
  ts,
  cancha,
  onEditScore,
  onDelete,
  onRevert,
  canManage,
  isResult = false,
}) {
  const logoL = equipos.find((e) => e.id === localId)?.logoUrl;
  const logoV = equipos.find((e) => e.id === visitanteId)?.logoUrl;

  return (
    <div className='bg-white rounded-2xl shadow-sm border p-4'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0 w-full'>
          <div className='font-semibold flex items-center gap-2 flex-wrap'>
            <Avatar name={equiposMap[localId]} logoUrl={logoL} />{' '}
            {equiposMap[localId] || 'Local'}
            {isResult ? (
              <>
                <span className='px-2 py-0.5 rounded bg-gray-100'>
                  {typeof scoreLocal === 'number' ? scoreLocal : '-'}
                </span>
                <span className='text-gray-400'>–</span>
                <span className='px-2 py-0.5 rounded bg-gray-100'>
                  {typeof scoreVisitante === 'number' ? scoreVisitante : '-'}
                </span>
              </>
            ) : (
              <span className='mx-1 text-gray-400'>vs</span>
            )}
            <span className='truncate'>
              {equiposMap[visitanteId] || 'Visitante'}
            </span>
            <Avatar name={equiposMap[visitanteId]} logoUrl={logoV} />
          </div>

          <div className='text-sm text-gray-500'>
            {fmtFecha(ts)}
            {cancha ? ` · ${cancha}` : ''}
          </div>

          {canManage && (
            <div className='flex flex-col sm:flex-row gap-2 mt-3'>
              <button
                onClick={onEditScore}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white ${
                  isResult
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                }`}
                title={isResult ? 'Editar resultado' : 'Cargar resultado'}
              >
                {isResult ? <IconEdit /> : <IconScore />}
                {isResult ? 'Editar' : 'Cargar'}
              </button>

              {isResult && onRevert && (
                <button
                  onClick={onRevert}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                  title='Revertir a pendiente'
                >
                  Revertir
                </button>
              )}

              <button
                onClick={onDelete}
                className='px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700'
                title='Eliminar partido'
              >
                <IconTrash />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================= Componente ========================= */
export default function Torneo() {
  const { id } = useParams();
  const nav = useNavigate();

  const [admin, setAdmin] = useState(false);
  const canManage = admin;

  const [torneo, setTorneo] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('fixture');

  /* Resultado (modal) */
  const [openResult, setOpenResult] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [scoreLocal, setScoreLocal] = useState('');
  const [scoreVisitante, setScoreVisitante] = useState('');
  const [saving, setSaving] = useState(false);

  /* Nuevo partido/equipo (modales) */
  const [openMatch, setOpenMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({
    localId: '',
    visitanteId: '',
    fecha: '',
    cancha: '',
  });
  const [openTeam, setOpenTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({ nombre: '', logoUrl: '' });

  /* Confirmar borrar partido (modal) */
  const [openDeleteMatch, setOpenDeleteMatch] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState(null);

  /* Fase final – Modo (mutuamente excluyente) */
  const [modoFase, setModoFase] = useState(null); // 'copas' | 'playoffs' | null

  /* Fase final – Copas */
  const [faseCopas, setFaseCopas] = useState(null); // { oro:[], plata:[], bronce:[], cupos:{oro,plata,bronce} }
  const [openCopasManual, setOpenCopasManual] = useState(false);
  const [copasSel, setCopasSel] = useState({ oro: [], plata: [], bronce: [] });
  const [copaMax, setCopaMax] = useState({ oro: 1, plata: 1, bronce: 2 });

  /* Modal: fixture de copas con fecha/hora/cancha */
  const [openCopaModal, setOpenCopaModal] = useState(false);
  const [copaModalKey, setCopaModalKey] = useState(null); // 'copa-oro' | 'copa-plata' | 'copa-bronce'
  const [copaModalPairs, setCopaModalPairs] = useState([]); // [{localId, visitanteId, fecha, cancha}]

  /* Fase final – Playoffs */
  const [openPOConfig, setOpenPOConfig] = useState(false);
  const [poN, setPoN] = useState(4); // 2|4|8|16
  const [poSeleccion, setPoSeleccion] = useState([]);
  const [openPOModal, setOpenPOModal] = useState(false);
  const [poFaseKey, setPoFaseKey] = useState(null); // 'final'|'semi'|'cuartos'|'octavos'
  const [poPairs, setPoPairs] = useState([]); // [{localId, visitanteId, fecha, cancha}]

  /* Permisos */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        setAdmin(await isAdmin(u?.email));
      } catch (err) {
        console.debug('isAdmin falló o no hay usuario', err);
        setAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  /* Suscripciones */
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const unsubTorneo = onSnapshot(doc(db, 'torneos', id), (d) =>
      setTorneo({ id: d.id, ...d.data() })
    );
    const unsubEquipos = onSnapshot(
      collection(db, 'torneos', id, 'equipos'),
      (snap) => setEquipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPartidos = onSnapshot(
      query(collection(db, 'torneos', id, 'partidos'), orderBy('dia', 'asc')),
      (snap) => {
        setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    const unsubCopas = onSnapshot(
      doc(db, 'torneos', id, 'fases', 'copas'),
      (d) => setFaseCopas(d.exists() ? d.data() : null),
      () => setFaseCopas(null)
    );
    const unsubConfig = onSnapshot(
      doc(db, 'torneos', id, 'fases', 'config'),
      (d) => setModoFase(d.exists() ? d.data()?.modo ?? null : null),
      () => setModoFase(null)
    );

    return () => {
      unsubTorneo();
      unsubEquipos();
      unsubPartidos();
      unsubCopas();
      unsubConfig();
    };
  }, [id]);

  /* Map id->nombre */
  const equiposMap = useMemo(() => {
    const m = {};
    for (const e of equipos) m[e.id] = e.nombre;
    return m;
  }, [equipos]);

  /* Derivados: fase regular */
  const fixture = useMemo(
    () => partidos.filter((p) => p.estado !== 'finalizado' && !p.fase),
    [partidos]
  );
  const resultados = useMemo(
    () =>
      partidos
        .filter((p) => p.estado === 'finalizado' && !p.fase)
        .slice()
        .sort((a, b) => (b.dia?.seconds ?? 0) - (a.dia?.seconds ?? 0)),
    [partidos]
  );
  const posiciones = useMemo(
    () => buildTable(resultados, equiposMap),
    [resultados, equiposMap]
  );
  const fixtureGrouped = useMemo(() => {
    const byDate = {};
    for (const p of fixture) {
      const key = p.dia?.seconds
        ? new Date(p.dia.seconds * 1000).toISOString().slice(0, 10)
        : 'Sin fecha';
      (byDate[key] ||= []).push(p);
    }
    return Object.keys(byDate)
      .sort()
      .map((k) => ({ dateKey: k, matches: byDate[k] }));
  }, [fixture]);

  /* Derivados: fases */
  const fasePartidos = useMemo(
    () => partidos.filter((p) => p.fase),
    [partidos]
  );
  const hayFaseFinal = !!faseCopas || fasePartidos.length > 0;

  const fasesOrder = ['octavos', 'cuartos', 'semi', 'final', 'otros'];
  const faseLabels = {
    octavos: 'Octavos',
    cuartos: 'Cuartos',
    semi: 'Semifinales',
    final: 'Final',
    otros: 'Otros',
  };
  const faseGrouped = useMemo(() => {
    const map = {};
    for (const m of fasePartidos) (map[m.fase || 'otros'] ||= []).push(m);
    return fasesOrder
      .filter((k) => map[k])
      .map((k) => ({ fase: k, matches: map[k] }));
  }, [fasePartidos]);

  const cupMatches = useMemo(() => {
    const out = { 'copa-oro': [], 'copa-plata': [], 'copa-bronce': [] };
    for (const m of fasePartidos) {
      if (m.fase === 'copa-oro') out['copa-oro'].push(m);
      if (m.fase === 'copa-plata') out['copa-plata'].push(m);
      if (m.fase === 'copa-bronce') out['copa-bronce'].push(m);
    }
    return out;
  }, [fasePartidos]);

  /* ---------- TABLAS por COPA ---------- */
  const cupResults = useMemo(
    () => ({
      'copa-oro': cupMatches['copa-oro'].filter(
        (p) => p.estado === 'finalizado'
      ),
      'copa-plata': cupMatches['copa-plata'].filter(
        (p) => p.estado === 'finalizado'
      ),
      'copa-bronce': cupMatches['copa-bronce'].filter(
        (p) => p.estado === 'finalizado'
      ),
    }),
    [cupMatches]
  );

  const cupTables = useMemo(
    () => ({
      'copa-oro': buildTable(cupResults['copa-oro'], equiposMap),
      'copa-plata': buildTable(cupResults['copa-plata'], equiposMap),
      'copa-bronce': buildTable(cupResults['copa-bronce'], equiposMap),
    }),
    [cupResults, equiposMap]
  );

  /* ---------- Resultado ---------- */
  const openResultado = (match) => {
    if (!canManage) return;
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

  // Avance automático de Playoffs (octavos->cuartos->semi->final)
  const avanzarPlayoffsSiCorresponde = async (faseActual) => {
    const mapNext = { octavos: 'cuartos', cuartos: 'semi', semi: 'final' };
    const nextFase = mapNext[faseActual];
    if (!nextFase) return;

    try {
      const partidosRef = collection(db, 'torneos', id, 'partidos');

      // Traer TODOS los partidos de la fase actual
      const snap = await getDocs(
        query(partidosRef, where('fase', '==', faseActual))
      );
      const actuales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (
        !actuales.length ||
        !actuales.every(
          (m) =>
            m.estado === 'finalizado' &&
            Number.isFinite(m.scoreLocal) &&
            Number.isFinite(m.scoreVisitante)
        )
      ) {
        return; // todavía faltan cerrar partidos
      }

      // Determinar ganadores en orden cronológico
      const ordenados = actuales
        .slice()
        .sort(
          (a, b) =>
            (a.dia?.seconds ?? 0) - (b.dia?.seconds ?? 0) ||
            (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
        );

      const winners = ordenados.map((m) =>
        m.scoreLocal > m.scoreVisitante ? m.localId : m.visitanteId
      );

      // Pairs de ganadores: (0 vs 1), (2 vs 3), ...
      const pairs = [];
      for (let i = 0; i < winners.length; i += 2) {
        if (winners[i] && winners[i + 1])
          pairs.push([winners[i], winners[i + 1]]);
      }
      if (pairs.length === 0) return;

      // Traer existentes de la siguiente fase
      const snapNext = await getDocs(
        query(partidosRef, where('fase', '==', nextFase))
      );
      let nextMatches = snapNext.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Si ya hay partidos finalizados en la siguiente fase, no tocamos nada
      if (nextMatches.some((m) => m.estado === 'finalizado')) return;

      // Ordenar existentes por horario/creación para mapear 1 a 1
      nextMatches = nextMatches
        .slice()
        .sort(
          (a, b) =>
            (a.dia?.seconds ?? 0) - (b.dia?.seconds ?? 0) ||
            (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
        );

      if (nextMatches.length === pairs.length) {
        // Actualizar en lugar de crear
        await Promise.all(
          nextMatches.map((m, idx) => {
            const [L, V] = pairs[idx] || [];
            if (!L || !V) return Promise.resolve();
            return updateDoc(doc(db, 'torneos', id, 'partidos', m.id), {
              localId: L,
              visitanteId: V,
              estado: 'pendiente',
              cancha: m.cancha ?? '',
              scoreLocal: deleteField(),
              scoreVisitante: deleteField(),
              updatedAt: serverTimestamp(),
            });
          })
        );
      } else {
        // Borrar no-finalizados y crear nuevos
        await Promise.all(
          nextMatches
            .filter((m) => m.estado !== 'finalizado')
            .map((m) => deleteDoc(doc(db, 'torneos', id, 'partidos', m.id)))
        );
        await Promise.all(
          pairs.map(([L, V]) =>
            addDoc(partidosRef, {
              localId: L,
              visitanteId: V,
              estado: 'pendiente',
              fase: nextFase,
              cancha: '',
              createdAt: serverTimestamp(),
            })
          )
        );
      }
    } catch (err) {
      console.error('Auto avance playoffs error:', err);
    }
  };

  const saveResultado = async (e) => {
    e.preventDefault();
    if (!canManage || !editingMatch) return;
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

      // Si corresponde, avanzar automáticamente la llave
      if (
        editingMatch?.fase &&
        ['octavos', 'cuartos', 'semi'].includes(editingMatch.fase)
      ) {
        await avanzarPlayoffsSiCorresponde(editingMatch.fase);
      }

      closeResultado();
    } catch (err) {
      console.error(err);
      setSaving(false);
      alert('No se pudo guardar el resultado.');
    }
  };

  const revertirResultado = async (matchId) => {
    if (!canManage) return;
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

  /* ---------- CRUD Partidos/Equipos ---------- */
  const guardarPartido = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    const { localId, visitanteId, fecha, cancha } = matchForm;
    if (!localId || !visitanteId || localId === visitanteId)
      return alert('Elegí equipos distintos.');
    if (!fecha) return alert('Elegí fecha y hora.');
    if (!cancha || !cancha.trim()) return alert('Ingresá la cancha.');
    try {
      await addDoc(collection(db, 'torneos', id, 'partidos'), {
        localId,
        visitanteId,
        dia: new Date(fecha),
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
    if (!canManage) return;
    setMatchToDelete(match);
    setOpenDeleteMatch(true);
  };
  const cancelarBorrarPartido = () => {
    setOpenDeleteMatch(false);
    setMatchToDelete(null);
  };
  const ejecutarBorrarPartido = async () => {
    if (!canManage || !matchToDelete) return;
    try {
      await deleteDoc(doc(db, 'torneos', id, 'partidos', matchToDelete.id));
      cancelarBorrarPartido();
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el partido.');
    }
  };
  const borrarEquipo = async (teamId) => {
    if (!canManage) return;
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

  /* ---------- Modo Fase (mutuamente excluyente) ---------- */
  const eliminarPlayoffs = async () => {
    const po = fasePartidos.filter(
      (m) => !String(m.fase || '').startsWith('copa-')
    );
    await Promise.all(
      po.map((m) => deleteDoc(doc(db, 'torneos', id, 'partidos', m.id)))
    );
  };
  const eliminarCopas = async () => {
    const cups = fasePartidos.filter((m) =>
      String(m.fase || '').startsWith('copa-')
    );
    await Promise.all(
      cups.map((m) => deleteDoc(doc(db, 'torneos', id, 'partidos', m.id)))
    );
    try {
      await deleteDoc(doc(db, 'torneos', id, 'fases', 'copas'));
    } catch (err) {
      console.debug('Ignorado al borrar doc de copas:', err);
    }
  };
  const cambiarModo = async (nuevo) => {
    if (!canManage) return;
    if (nuevo === modoFase) return;
    try {
      if (nuevo === 'copas') {
        const hayPO = fasePartidos.some(
          (m) => !String(m.fase || '').startsWith('copa-')
        );
        if (
          hayPO &&
          !confirm(
            'Cambiar a Copas eliminará todos los cruces de Playoffs. ¿Continuar?'
          )
        )
          return;
        await eliminarPlayoffs();
      } else if (nuevo === 'playoffs') {
        const hayCopas =
          !!faseCopas ||
          fasePartidos.some((m) => String(m.fase || '').startsWith('copa-'));
        if (
          hayCopas &&
          !confirm(
            'Cambiar a Playoffs eliminará las asignaciones y partidos de Copas. ¿Continuar?'
          )
        )
          return;
        await eliminarCopas();
      }
      await setDoc(
        doc(db, 'torneos', id, 'fases', 'config'),
        { modo: nuevo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setModoFase(nuevo);
    } catch (e) {
      console.error(e);
      alert('No se pudo cambiar el modo.');
    }
  };

  /* ---------- Copas ---------- */
  const recomendacionCopas = useMemo(() => {
    const ids = posiciones.map((t) => t.id);
    return {
      oro: ids[0] ? [ids[0]] : [],
      plata: ids[1] ? [ids[1]] : [],
      bronce: ids.slice(2, 4),
    };
  }, [posiciones]);

  const asignarCopasAuto = async () => {
    if (!canManage) return;
    if (modoFase !== 'copas')
      return alert(
        'El modo activo es Playoffs. Cambiá a Copas para usar esta sección.'
      );
    try {
      await setDoc(doc(db, 'torneos', id, 'fases', 'copas'), {
        ...recomendacionCopas,
        cupos: { oro: 1, plata: 1, bronce: 2 },
        updatedAt: serverTimestamp(),
      });
      alert('Copas asignadas automáticamente.');
    } catch (e) {
      console.error(e);
      alert('No se pudo asignar copas.');
    }
  };

  const abrirCopasManual = () => {
    if (!canManage) return;
    if (modoFase !== 'copas')
      return alert(
        'El modo activo es Playoffs. Cambiá a Copas para usar esta sección.'
      );
    const base = faseCopas ||
      recomendacionCopas || {
        oro: [],
        plata: [],
        bronce: [],
        cupos: { oro: 1, plata: 1, bronce: 2 },
      };
    setCopasSel({
      oro: base.oro || [],
      plata: base.plata || [],
      bronce: base.bronce || [],
    });
    setCopaMax({
      oro: Number(base?.cupos?.oro ?? (base.oro?.length || 1)),
      plata: Number(base?.cupos?.plata ?? (base.plata?.length || 1)),
      bronce: Number(base?.cupos?.bronce ?? (base.bronce?.length || 2)),
    });
    setOpenCopasManual(true);
  };

  const autoRellenarCopas = () => {
    const top = posiciones.map((t) => t.id);
    const oro = top.slice(0, copaMax.oro);
    const plata = top.slice(copaMax.oro, copaMax.oro + copaMax.plata);
    const bronce = top.slice(
      copaMax.oro + copaMax.plata,
      copaMax.oro + copaMax.plata + copaMax.bronce
    );
    setCopasSel({ oro, plata, bronce });
  };

  const toggleCopa = (copa, teamId) => {
    setCopasSel((prev) => {
      const next = {
        oro: prev.oro.filter((x) => x !== teamId),
        plata: prev.plata.filter((x) => x !== teamId),
        bronce: prev.bronce.filter((x) => x !== teamId),
      };
      const arr = new Set(next[copa]);
      arr.has(teamId) ? arr.delete(teamId) : arr.add(teamId);
      next[copa] = Array.from(arr);
      return next;
    });
  };

  const guardarCopasManual = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== 'copas')
      return alert(
        'El modo activo es Playoffs. Cambiá a Copas para usar esta sección.'
      );

    const { oro, plata, bronce } = copasSel;
    if (
      oro.length > copaMax.oro ||
      plata.length > copaMax.plata ||
      bronce.length > copaMax.bronce
    )
      return alert('No superes los cupos configurados.');
    const picks = [...oro, ...plata, ...bronce];
    if (new Set(picks).size !== picks.length)
      return alert('Un equipo no puede estar en más de una copa.');

    try {
      await setDoc(doc(db, 'torneos', id, 'fases', 'copas'), {
        oro,
        plata,
        bronce,
        cupos: { ...copaMax },
        updatedAt: serverTimestamp(),
      });
      setOpenCopasManual(false);
    } catch (e2) {
      console.error('guardarCopasManual error:', e2);
      alert('No se pudo guardar la configuración de copas.');
    }
  };

  const abrirModalFixtureCopa = (claveCopa, ids) => {
    if (!canManage) return;
    if (modoFase !== 'copas')
      return alert(
        'El modo activo es Playoffs. Cambiá a Copas para usar esta sección.'
      );
    if (!ids || ids.length < 2)
      return alert('Se necesitan al menos 2 equipos en la copa.');
    const pairs = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.push({
          localId: ids[i],
          visitanteId: ids[j],
          fecha: '',
          cancha: '',
        });
    setCopaModalKey(claveCopa);
    setCopaModalPairs(pairs);
    setOpenCopaModal(true);
  };

  const guardarFixtureCopaConDetalles = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== 'copas')
      return alert(
        'El modo activo es Playoffs. Cambiá a Copas para usar esta sección.'
      );
    if (!copaModalKey || !copaModalPairs.length) return;

    for (const p of copaModalPairs) {
      if (!p.fecha)
        return alert('Completá fecha y hora en todos los partidos.');
      if (!p.cancha?.trim())
        return alert('Completá la cancha en todos los partidos.');
    }

    try {
      const existentes = fasePartidos.filter((m) => m.fase === copaModalKey);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, 'torneos', id, 'partidos', m.id))
        )
      );
      await Promise.all(
        copaModalPairs.map((p) =>
          addDoc(collection(db, 'torneos', id, 'partidos'), {
            localId: p.localId,
            visitanteId: p.visitanteId,
            estado: 'pendiente',
            fase: copaModalKey,
            dia: new Date(p.fecha),
            cancha: p.cancha.trim(),
            createdAt: serverTimestamp(),
          })
        )
      );
      setOpenCopaModal(false);
      setCopaModalKey(null);
      setCopaModalPairs([]);
      alert('Mini-fixture de copa creado.');
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el mini-fixture.');
    }
  };

  /* ---------- Playoffs ---------- */
  const seedName = (n) =>
    n === 2
      ? 'final'
      : n === 4
      ? 'semi'
      : n === 8
      ? 'cuartos'
      : n === 16
      ? 'octavos'
      : 'otros';

  const abrirPOConfig = () => {
    if (!canManage) return;
    if (modoFase !== 'playoffs')
      return alert(
        'El modo activo es Copas. Cambiá a Playoffs para usar esta sección.'
      );
    const maxN = Math.min(posiciones.length, 16);
    const defaultN = [16, 8, 4, 2].find((k) => k <= maxN) || 2;
    setPoN(defaultN);
    setPoSeleccion(posiciones.slice(0, defaultN).map((t) => t.id));
    setOpenPOConfig(true);
  };

  const guardarPOConfig = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== 'playoffs')
      return alert(
        'El modo activo es Copas. Cambiá a Playoffs para usar esta sección.'
      );
    if (poSeleccion.length !== poN)
      return alert(`Elegí exactamente ${poN} equipos.`);

    const rankIndex = new Map(posiciones.map((t, i) => [t.id, i]));
    const ordered = poSeleccion
      .slice()
      .sort((a, b) => (rankIndex.get(a) ?? 999) - (rankIndex.get(b) ?? 999));
    const fase = seedName(poN);

    // Preparar modal para asignar fecha/hora/cancha de los cruces creados
    const pairs = [];
    for (let i = 0; i < ordered.length / 2; i++) {
      const L = ordered[i],
        V = ordered[ordered.length - 1 - i];
      pairs.push({ localId: L, visitanteId: V, fecha: '', cancha: '' });
    }
    setPoFaseKey(fase);
    setPoPairs(pairs);
    setOpenPOConfig(false);
    setOpenPOModal(true);
  };

  const guardarPlayoffsConDetalles = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== 'playoffs') return alert('El modo activo es Copas.');
    if (!poFaseKey || !poPairs.length) return;

    for (const p of poPairs) {
      if (!p.fecha) return alert('Completá fecha y hora en todos los cruces.');
      if (!p.cancha?.trim())
        return alert('Completá la cancha en todos los cruces.');
    }

    try {
      // borrar existentes de esta fase (si los hay)
      const existentes = fasePartidos.filter((m) => m.fase === poFaseKey);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, 'torneos', id, 'partidos', m.id))
        )
      );
      // crear cruces con detalles
      await Promise.all(
        poPairs.map((p) =>
          addDoc(collection(db, 'torneos', id, 'partidos'), {
            localId: p.localId,
            visitanteId: p.visitanteId,
            estado: 'pendiente',
            fase: poFaseKey,
            dia: new Date(p.fecha),
            cancha: p.cancha.trim(),
            createdAt: serverTimestamp(),
          })
        )
      );
      setOpenPOModal(false);
      setPoFaseKey(null);
      setPoPairs([]);
      alert('Cruces de playoffs creados.');
    } catch (e2) {
      console.error(e2);
      alert('No se pudieron crear los cruces.');
    }
  };

  const borrarCrucesFaseFinal = async () => {
    if (!canManage) return;
    if (modoFase !== 'playoffs') return alert('El modo activo es Copas.');
    if (!fasePartidos.length) return;
    if (!confirm('¿Eliminar TODOS los cruces de la fase final?')) return;
    try {
      await Promise.all(
        fasePartidos.map((m) =>
          deleteDoc(doc(db, 'torneos', id, 'partidos', m.id))
        )
      );
    } catch (e) {
      console.error(e);
      alert('No se pudieron eliminar los cruces.');
    }
  };

  /* -------------------- RENDER -------------------- */
  const tabs = [
    'fixture',
    'resultados',
    'posiciones',
    'equipos',
    ...(admin || hayFaseFinal ? ['fase'] : []),
  ];

  return (
    <div className='space-y-5'>
      {/* Header */}
      <div className='rounded-2xl p-[1px] bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200'>
        <div className='rounded-2xl bg-white/80 backdrop-blur-sm p-4 sm:p-5'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => nav(-1)}
                className='inline-flex items-center gap-2 rounded-xl border px-3 py-2 bg-white hover:bg-gray-50 text-gray-700'
                title='Volver'
              >
                <IconBack /> <span className='hidden sm:inline'>Volver</span>
              </button>
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
                    onClick={() => setOpenTeam(true)}
                    className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700'
                    title='Nuevo equipo'
                  >
                    <IconPlus /> Equipo
                  </button>
                  <button
                    onClick={() => setOpenMatch(true)}
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
          {tabs.map((t) => (
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
                  fase: 'Fase final',
                }[t]
              }
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
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
          {(() => {
            const byDate = fixtureGrouped;
            if (byDate.length === 0) {
              return (
                <div className='text-center bg-white border rounded-2xl p-8 shadow-sm'>
                  <div className='text-4xl mb-2'>📅</div>
                  <p className='text-gray-600'>No hay partidos próximos.</p>
                </div>
              );
            }
            return byDate.map(({ dateKey, matches }) => (
              <div key={dateKey} className='space-y-2'>
                <div className='text-sm text-gray-500'>
                  {dateKey === 'Sin fecha'
                    ? 'Sin fecha'
                    : new Date(dateKey).toLocaleDateString()}
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  {matches.map((p) => (
                    <MatchRow
                      key={p.id}
                      localId={p.localId}
                      visitanteId={p.visitanteId}
                      equipos={equipos}
                      equiposMap={equiposMap}
                      ts={p.dia}
                      cancha={p.cancha}
                      canManage={canManage}
                      onEditScore={() => openResultado(p)}
                      onDelete={() => solicitarBorrarPartido(p)}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* RESULTADOS */}
      {!loading && tab === 'resultados' && (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {resultados.length === 0 ? (
            <div className='col-span-full text-center bg-white border rounded-2xl p-8 shadow-sm'>
              <div className='text-4xl mb-2'>🏀</div>
              <p className='text-gray-600'>Todavía no hay resultados.</p>
            </div>
          ) : (
            resultados.map((p) => (
              <MatchRow
                key={p.id}
                localId={p.localId}
                visitanteId={p.visitanteId}
                scoreLocal={p.scoreLocal}
                scoreVisitante={p.scoreVisitante}
                equipos={equipos}
                equiposMap={equiposMap}
                ts={p.dia}
                cancha={p.cancha}
                canManage={canManage}
                isResult
                onEditScore={() => openResultado(p)}
                onDelete={() => solicitarBorrarPartido(p)}
                onRevert={() => revertirResultado(p.id)}
              />
            ))
          )}
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
              {posiciones.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className='text-center text-gray-500 px-4 py-6'
                  >
                    Sin datos aún.
                  </td>
                </tr>
              ) : (
                posiciones.map((t, i) => (
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
                ))
              )}
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
                onClick={() => setOpenTeam(true)}
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

      {/* FASE FINAL */}
      {!loading && tab === 'fase' && (
        <div className='space-y-4'>
          {/* Selector de modo (solo admin) */}
          {canManage && (
            <FancyPanel
              icon={<IconTrophy />}
              title='Fase final'
              subtitle='Elegí si se define por Copas o Playoffs'
              right={
                <div className='flex items-center gap-2'>
                  <button
                    className={`px-3 py-2 rounded-xl border text-sm ${
                      modoFase === 'copas'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                    onClick={() => cambiarModo('copas')}
                  >
                    Copas
                  </button>
                  <button
                    className={`px-3 py-2 rounded-xl border text-sm ${
                      modoFase === 'playoffs'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                    onClick={() => cambiarModo('playoffs')}
                  >
                    Playoffs
                  </button>
                </div>
              }
            >
              {!modoFase && (
                <div className='text-sm text-gray-600'>
                  Seleccioná un modo para configurar la fase final.
                </div>
              )}
            </FancyPanel>
          )}

          {/* ---- Panel COPAS ---- */}
          {modoFase === 'copas' && (
            <FancyPanel
              icon={<IconTrophy />}
              title='Copas · Oro / Plata / Bronce'
              subtitle={
                canManage
                  ? 'Definí cupos, asigná equipos y generá el mini-fixture'
                  : 'Resumen y partidos de las copas'
              }
              right={
                canManage ? (
                  <div className='flex flex-wrap gap-2'>
                    <button
                      onClick={asignarCopasAuto}
                      className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black text-sm'
                    >
                      Asignar recomendación
                    </button>
                    <button
                      onClick={abrirCopasManual}
                      className='px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm'
                    >
                      Elegir manualmente…
                    </button>
                  </div>
                ) : null
              }
            >
              {/* Resumen copas */}
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3 mb-4'>
                {['oro', 'plata', 'bronce'].map((k) => {
                  const ids = faseCopas?.[k] || [];
                  const key =
                    k === 'oro'
                      ? 'copa-oro'
                      : k === 'plata'
                      ? 'copa-plata'
                      : 'copa-bronce';
                  return (
                    <div key={k} className='rounded-xl border p-3 bg-white'>
                      <div className='flex items-center justify-between mb-1'>
                        <CupTag tipo={key} />
                        <span className='text-xs text-gray-500'>
                          {ids.length} equipos
                        </span>
                      </div>
                      <div className='text-sm text-gray-700 min-h-[1.5rem]'>
                        {ids.length ? (
                          ids.map((id2) => equiposMap[id2]).join(', ')
                        ) : (
                          <span className='text-gray-400'>Sin asignar</span>
                        )}
                      </div>
                      {canManage && ids.length >= 2 && (
                        <button
                          onClick={() => abrirModalFixtureCopa(key, ids)}
                          className='mt-3 w-full px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm'
                        >
                          Generar mini-fixture
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* TABLAS por copa */}
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                {['copa-oro', 'copa-plata', 'copa-bronce'].map((ck) => {
                  const tabla = cupTables[ck];
                  const titulo =
                    ck === 'copa-oro'
                      ? 'Tabla · Copa Oro'
                      : ck === 'copa-plata'
                      ? 'Tabla · Copa Plata'
                      : 'Tabla · Copa Bronce';

                  return (
                    <div
                      key={ck}
                      className='rounded-2xl border bg-white overflow-hidden'
                    >
                      <div className='px-3 py-2 bg-gray-50 border-b text-sm font-semibold flex items-center gap-2'>
                        <CupTag tipo={ck} /> <span>{titulo}</span>
                      </div>
                      <div className='overflow-x-auto'>
                        <table className='min-w-full text-xs'>
                          <thead>
                            <tr className='text-gray-600'>
                              <th className='text-left px-3 py-1.5'>#</th>
                              <th className='text-left px-3 py-1.5'>Equipo</th>
                              <th className='text-center px-2 py-1.5'>PJ</th>
                              <th className='text-center px-2 py-1.5'>PG</th>
                              <th className='text-center px-2 py-1.5'>PP</th>
                              <th className='text-center px-2 py-1.5'>PF</th>
                              <th className='text-center px-2 py-1.5'>PC</th>
                              <th className='text-center px-2 py-1.5'>DIF</th>
                              <th className='text-center px-2 py-1.5'>PTS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabla.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={9}
                                  className='px-3 py-2 text-center text-gray-500'
                                >
                                  Sin resultados aún.
                                </td>
                              </tr>
                            ) : (
                              tabla.map((t, i) => (
                                <tr key={t.id} className='border-t'>
                                  <td className='px-3 py-1.5'>{i + 1}</td>
                                  <td className='px-3 py-1.5'>{t.nombre}</td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.pj}
                                  </td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.pg}
                                  </td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.pp}
                                  </td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.pf}
                                  </td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.pc}
                                  </td>
                                  <td className='px-2 py-1.5 text-center'>
                                    {t.dif}
                                  </td>
                                  <td className='px-2 py-1.5 text-center font-semibold'>
                                    {t.pts}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Partidos de copas */}
              {cupMatches['copa-oro'].length ||
              cupMatches['copa-plata'].length ||
              cupMatches['copa-bronce'].length ? (
                <div className='space-y-5 mt-4'>
                  {['copa-oro', 'copa-plata', 'copa-bronce'].map((ck) =>
                    cupMatches[ck].length ? (
                      <div key={ck} className='space-y-2'>
                        <div className='flex items-center justify-between'>
                          <CupTag tipo={ck} />
                          <span className='text-xs text-gray-500'>
                            {cupMatches[ck].length} partido
                            {cupMatches[ck].length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                          {cupMatches[ck].map((p) => (
                            <MatchRow
                              key={p.id}
                              localId={p.localId}
                              visitanteId={p.visitanteId}
                              scoreLocal={p.scoreLocal}
                              scoreVisitante={p.scoreVisitante}
                              equipos={equipos}
                              equiposMap={equiposMap}
                              ts={p.dia}
                              cancha={p.cancha}
                              canManage={canManage}
                              isResult={p.estado === 'finalizado'}
                              onEditScore={() => canManage && openResultado(p)}
                              onDelete={() =>
                                canManage && solicitarBorrarPartido(p)
                              }
                              onRevert={
                                p.estado === 'finalizado' && canManage
                                  ? () => revertirResultado(p.id)
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className='text-sm text-gray-500 mt-2'>
                  No hay partidos de copas aún.
                </div>
              )}
            </FancyPanel>
          )}

          {/* ---- Panel PLAYOFFS ---- */}
          {modoFase === 'playoffs' && (
            <FancyPanel
              icon={<IconBracket />}
              title='Playoffs'
              subtitle={
                canManage
                  ? 'Elegí participantes y definí cruces; la llave avanza sola cuando se cierran los partidos'
                  : 'Cruces y resultados'
              }
              right={
                canManage ? (
                  <div className='flex gap-2'>
                    <button
                      onClick={abrirPOConfig}
                      className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-sm'
                    >
                      <IconPlus /> Generar
                    </button>
                    {fasePartidos.length > 0 && (
                      <button
                        onClick={borrarCrucesFaseFinal}
                        className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm'
                      >
                        Borrar cruces
                      </button>
                    )}
                  </div>
                ) : null
              }
            >
              {faseGrouped.length === 0 ? (
                <div className='text-center bg-white border rounded-2xl p-8 shadow-sm'>
                  <div className='text-4xl mb-2'>🏆</div>
                  <p className='text-gray-600'>Aún no hay cruces.</p>
                </div>
              ) : (
                <div className='space-y-5'>
                  {faseGrouped.map(({ fase, matches }) => (
                    <div key={fase} className='space-y-2'>
                      <div className='flex items-center justify-between'>
                        <StageBadge fase={fase} />
                        <span className='text-xs text-gray-500'>
                          {matches.length} partido
                          {matches.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                        {matches.map((p) => (
                          <MatchRow
                            key={p.id}
                            localId={p.localId}
                            visitanteId={p.visitanteId}
                            scoreLocal={p.scoreLocal}
                            scoreVisitante={p.scoreVisitante}
                            equipos={equipos}
                            equiposMap={equiposMap}
                            ts={p.dia}
                            cancha={p.cancha}
                            canManage={canManage}
                            isResult={p.estado === 'finalizado'}
                            onEditScore={() => canManage && openResultado(p)}
                            onDelete={() =>
                              canManage && solicitarBorrarPartido(p)
                            }
                            onRevert={
                              p.estado === 'finalizado' && canManage
                                ? () => revertirResultado(p.id)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FancyPanel>
          )}

          {/* Si no hay modo elegido y el usuario no es admin, mostramos un cartel neutro */}
          {!modoFase && !canManage && (
            <div className='rounded-2xl bg-white p-6 shadow-sm border text-center text-gray-600'>
              Próximamente: definición de la fase final.
            </div>
          )}
        </div>
      )}

      {/* =================== MODALES =================== */}

      {/* Cargar/Editar resultado */}
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
                nombre={equiposMap[editingMatch.localId] || 'Local'}
                logoUrl={
                  equipos.find((e) => e.id === editingMatch.localId)?.logoUrl
                }
              />{' '}
              vs{' '}
              <EquipoTag
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

      {/* Nuevo partido */}
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

      {/* Nuevo equipo */}
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nombre = teamForm.nombre.trim();
                if (!nombre) return alert('Poné un nombre de equipo.');
                addDoc(collection(db, 'torneos', id, 'equipos'), {
                  nombre,
                  logoUrl: teamForm.logoUrl.trim() || '',
                  createdAt: serverTimestamp(),
                })
                  .then(() => setOpenTeam(false))
                  .catch((err) => {
                    console.error(err);
                    alert('No se pudo crear el equipo.');
                  });
              }}
              className='space-y-3'
            >
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
                  Tip: agregá imágenes en <code>/public/logos</code> y usá rutas
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

      {/* Confirmar eliminar partido */}
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
                nombre={equiposMap[matchToDelete.localId] || 'Local'}
                logoUrl={
                  equipos.find((e) => e.id === matchToDelete.localId)?.logoUrl
                }
              />{' '}
              vs{' '}
              <EquipoTag
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

      {/* Copas manual */}
      {openCopasManual && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenCopasManual(false)}
        >
          <div
            className='w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[80vh] overflow-y-auto'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              Asignar copas (manual)
            </h3>

            <form onSubmit={guardarCopasManual} className='space-y-4'>
              <div className='rounded-xl border p-3'>
                <div className='text-sm font-medium mb-2'>Cupos por copa</div>
                <div className='flex flex-wrap gap-4 items-center'>
                  {['oro', 'plata', 'bronce'].map((copa) => (
                    <label
                      key={`lim-${copa}`}
                      className='flex items-center gap-2 text-sm'
                    >
                      <span className='capitalize w-16'>{copa}</span>
                      <input
                        type='number'
                        min={0}
                        max={equipos.length}
                        className='w-24 rounded-xl border px-2 py-1'
                        value={copaMax[copa]}
                        onChange={(e) => {
                          const n = Math.max(
                            0,
                            Math.min(
                              equipos.length,
                              parseInt(e.target.value, 10) || 0
                            )
                          );
                          setCopaMax((m) => ({ ...m, [copa]: n }));
                        }}
                      />
                    </label>
                  ))}
                  <button
                    type='button'
                    onClick={autoRellenarCopas}
                    className='ml-auto px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm'
                    title='Autorrellenar desde posiciones'
                  >
                    Autorrellenar por posiciones
                  </button>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                {['oro', 'plata', 'bronce'].map((copa) => (
                  <div key={copa} className='rounded-xl border p-3'>
                    <div className='text-sm font-medium mb-2 capitalize'>
                      Copa {copa}
                    </div>
                    <div className='space-y-1 max-h-72 overflow-auto pr-1'>
                      {equipos.map((e) => {
                        const checked = (copasSel[copa] || []).includes(e.id);
                        const disabled =
                          !checked &&
                          (copasSel[copa]?.length || 0) >= (copaMax[copa] || 0);
                        return (
                          <label
                            key={`${copa}-${e.id}`}
                            className={`flex items-center gap-2 text-sm ${
                              disabled ? 'opacity-60' : ''
                            }`}
                          >
                            <input
                              type='checkbox'
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleCopa(copa, e.id)}
                            />
                            <span className='truncate'>{e.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className='text-xs text-gray-500 mt-2'>
                      {copasSel[copa]?.length || 0}/{copaMax[copa]}{' '}
                      seleccionados
                    </div>
                  </div>
                ))}
              </div>

              <div className='flex items-center justify-end gap-2'>
                <button
                  type='button'
                  onClick={() => setOpenCopasManual(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black'
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mini-fixture Copas */}
      {openCopaModal && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenCopaModal(false)}
        >
          <div
            className='w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[80vh] overflow-y-auto'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              Mini-fixture{' '}
              {copaModalKey === 'copa-oro'
                ? 'Copa Oro'
                : copaModalKey === 'copa-plata'
                ? 'Copa Plata'
                : 'Copa Bronce'}
            </h3>
            <form
              onSubmit={guardarFixtureCopaConDetalles}
              className='space-y-3'
            >
              {copaModalPairs.map((p, idx) => (
                <div key={idx} className='rounded-xl border p-3'>
                  <div className='text-sm font-medium mb-2'>
                    {equiposMap[p.localId]} vs {equiposMap[p.visitanteId]}
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                    <div>
                      <label className='text-sm'>Fecha & hora</label>
                      <input
                        type='datetime-local'
                        className='mt-1 w-full rounded-xl border px-3 py-2'
                        value={p.fecha}
                        onChange={(e) =>
                          setCopaModalPairs((arr) => {
                            const copy = arr.slice();
                            copy[idx] = { ...copy[idx], fecha: e.target.value };
                            return copy;
                          })
                        }
                        required
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <label className='text-sm'>Cancha</label>
                      <input
                        className='mt-1 w-full rounded-xl border px-3 py-2'
                        placeholder='Ej. Club A'
                        value={p.cancha}
                        onChange={(e) =>
                          setCopaModalPairs((arr) => {
                            const copy = arr.slice();
                            copy[idx] = {
                              ...copy[idx],
                              cancha: e.target.value,
                            };
                            return copy;
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setOpenCopaModal(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black'
                >
                  Crear partidos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playoffs: selección */}
      {openPOConfig && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenPOConfig(false)}
        >
          <div
            className='w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[80vh] overflow-y-auto'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>Generar playoffs</h3>

            <form onSubmit={guardarPOConfig} className='space-y-4'>
              <div className='flex flex-wrap items-center gap-3'>
                <span className='text-sm'>Cantidad de equipos:</span>
                {[2, 4, 8, 16]
                  .filter((n) => n <= posiciones.length)
                  .map((n) => (
                    <label
                      key={n}
                      className='inline-flex items-center gap-2 text-sm'
                    >
                      <input
                        type='radio'
                        name='poN'
                        value={n}
                        checked={poN === n}
                        onChange={() => {
                          setPoN(n);
                          setPoSeleccion(
                            posiciones.slice(0, n).map((t) => t.id)
                          );
                        }}
                      />
                      <span>{n}</span>
                    </label>
                  ))}
                {posiciones.length < 2 && (
                  <span className='text-xs text-gray-500'>
                    No hay suficientes equipos.
                  </span>
                )}
              </div>

              <div className='rounded-xl border p-3'>
                <div className='text-sm font-medium mb-2'>
                  Seleccioná {poN} equipos
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto pr-1'>
                  {posiciones.map((t) => {
                    const checked = poSeleccion.includes(t.id);
                    const disabled = !checked && poSeleccion.length >= poN;
                    return (
                      <label
                        key={`po-${t.id}`}
                        className={`flex items-center gap-2 text-sm ${
                          disabled ? 'opacity-50' : ''
                        }`}
                      >
                        <input
                          type='checkbox'
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            setPoSeleccion((prev) => {
                              const set = new Set(prev);
                              if (set.has(t.id)) set.delete(t.id);
                              else if (set.size < poN) set.add(t.id);
                              return Array.from(set);
                            });
                          }}
                        />
                        <span className='truncate'>{t.nombre}</span>
                      </label>
                    );
                  })}
                </div>
                <div className='text-xs text-gray-500 mt-2'>
                  {poSeleccion.length}/{poN} seleccionados
                </div>
              </div>

              <div className='rounded-xl border p-3 bg-gray-50'>
                <div className='text-sm font-medium mb-1'>
                  Vista previa (siembra)
                </div>
                <ul className='list-disc pl-5 text-sm text-gray-700'>
                  {(() => {
                    const rankIndex = new Map(
                      posiciones.map((t, i) => [t.id, i])
                    );
                    const ordered = poSeleccion
                      .slice()
                      .sort(
                        (a, b) =>
                          (rankIndex.get(a) ?? 999) - (rankIndex.get(b) ?? 999)
                      );
                    const pairs = [];
                    for (let i = 0; i < Math.floor(ordered.length / 2); i++) {
                      pairs.push(
                        `${equiposMap[ordered[i]]} vs ${
                          equiposMap[ordered[ordered.length - 1 - i]]
                        }`
                      );
                    }
                    return pairs.length ? (
                      pairs.map((s, i) => <li key={i}>{s}</li>)
                    ) : (
                      <li>No hay suficientes seleccionados.</li>
                    );
                  })()}
                </ul>
              </div>

              <div className='flex items-center justify-end gap-2'>
                <button
                  type='button'
                  onClick={() => setOpenPOConfig(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                >
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playoffs: completar fecha/hora/cancha antes de crear */}
      {openPOModal && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenPOModal(false)}
        >
          <div
            className='w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[80vh] overflow-y-auto'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              {poFaseKey ? faseLabels[poFaseKey] || poFaseKey : 'Cruces'}
            </h3>
            <form onSubmit={guardarPlayoffsConDetalles} className='space-y-3'>
              {poPairs.map((p, idx) => (
                <div key={idx} className='rounded-xl border p-3'>
                  <div className='text-sm font-medium mb-2'>
                    {equiposMap[p.localId]} vs {equiposMap[p.visitanteId]}
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                    <div>
                      <label className='text-sm'>Fecha & hora</label>
                      <input
                        type='datetime-local'
                        className='mt-1 w-full rounded-xl border px-3 py-2'
                        value={p.fecha}
                        onChange={(e) =>
                          setPoPairs((arr) => {
                            const copy = arr.slice();
                            copy[idx] = { ...copy[idx], fecha: e.target.value };
                            return copy;
                          })
                        }
                        required
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <label className='text-sm'>Cancha</label>
                      <input
                        className='mt-1 w-full rounded-xl border px-3 py-2'
                        placeholder='Ej. Club A'
                        value={p.cancha}
                        onChange={(e) =>
                          setPoPairs((arr) => {
                            const copy = arr.slice();
                            copy[idx] = {
                              ...copy[idx],
                              cancha: e.target.value,
                            };
                            return copy;
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setOpenPOModal(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black'
                >
                  Crear cruces
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
