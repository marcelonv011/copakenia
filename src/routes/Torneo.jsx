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
const IconCalendar = (p) => (
  <svg viewBox='0 0 24 24' width='18' height='18' {...p}>
    <path
      fill='currentColor'
      d='M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm13 6H4v10h16V8z'
    />
  </svg>
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

/* Tabla posiciones (reutilizable para copas y fase regular) */
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

  /* Programar rondas PO (semis/final) */
  const [openPORoundModal, setOpenPORoundModal] = useState(false);
  const [poRoundKey, setPoRoundKey] = useState(null); // 'semi' | 'final'
  const [poRoundItems, setPoRoundItems] = useState([]); // [{id, localId, visitanteId, fecha, cancha}]

  /* Permisos */
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
  /* Tablas de posiciones por COPA */
  const cupTables = useMemo(() => {
    const fin = (key) =>
      fasePartidos.filter((p) => p.fase === key && p.estado === 'finalizado');
    return {
      oro: buildTable(fin('copa-oro'), equiposMap),
      plata: buildTable(fin('copa-plata'), equiposMap),
      bronce: buildTable(fin('copa-bronce'), equiposMap),
    };
  }, [fasePartidos, equiposMap]);

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
      console.debug(
        'Ignorado al borrar fases/copas:',
        err?.code || err?.message || err
      );
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
            fase: copaModalKey, // 'copa-oro' | 'copa-plata' | 'copa-bronce'
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

    try {
      // borrar fase existente de este mismo nombre
      const existentes = fasePartidos.filter((m) => m.fase === fase);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, 'torneos', id, 'partidos', m.id))
        )
      );

      // crear cruces 1–N, 2–(N-1)...
      const baseHora = Date.now() + 60 * 60 * 1000;
      let slot = 0;
      for (let i = 0; i < ordered.length / 2; i++) {
        const L = ordered[i],
          V = ordered[ordered.length - 1 - i];
        await addDoc(collection(db, 'torneos', id, 'partidos'), {
          localId: L,
          visitanteId: V,
          estado: 'pendiente',
          fase, // 'octavos' | 'cuartos' | 'semi' | 'final'
          poRound: fase, // redundante pero claro
          poSlot: slot++, // 0..(n/2 - 1)
          dia: new Date(baseHora + i * 3600000),
          cancha: '',
          createdAt: serverTimestamp(),
        });
      }
      setOpenPOConfig(false);
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

  /* Helpers Playoffs: ganadores y programación de siguientes rondas */
  const winnersOf = (round) => {
    const ms = fasePartidos.filter(
      (m) => m.fase === round && m.estado === 'finalizado'
    );
    return ms
      .map((m) => ({
        winnerId:
          (m.scoreLocal ?? 0) > (m.scoreVisitante ?? 0)
            ? m.localId
            : m.visitanteId,
        poSlot: m.poSlot ?? 0,
      }))
      .sort((a, b) => (a.poSlot ?? 0) - (b.poSlot ?? 0));
  };
  const countRound = (round) =>
    fasePartidos.filter((m) => m.fase === round).length;

  const openProgramNextRound = (round) => {
    if (!canManage) return;
    const prev =
      round === 'final' ? 'semi' : round === 'semi' ? 'cuartos' : 'octavos';
    const W = winnersOf(prev).map((w) => w.winnerId);
    if (
      (round === 'semi' && W.length < 4) ||
      (round === 'final' && W.length < 2)
    ) {
      return alert('Aún faltan resultados para armar esta ronda.');
    }
    // armar pares consecutivos: (0,1), (2,3)...
    const items = [];
    for (let i = 0; i < W.length; i += 2) {
      items.push({
        id: null,
        localId: W[i],
        visitanteId: W[i + 1],
        fecha: '',
        cancha: '',
        poSlot: i / 2,
      });
    }
    setPoRoundKey(round); // 'semi' | 'final'
    setPoRoundItems(items);
    setOpenPORoundModal(true);
  };

  const guardarProgramacionRound = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!poRoundKey || !poRoundItems.length) return;

    for (const r of poRoundItems) {
      if (!r.fecha)
        return alert('Completá fecha y hora en todos los partidos.');
      if (!r.cancha?.trim())
        return alert('Completá la cancha en todos los partidos.');
    }
    try {
      // Borrar existentes de esa ronda y recrear (seguro y simple)
      const existentes = fasePartidos.filter((m) => m.fase === poRoundKey);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, 'torneos', id, 'partidos', m.id))
        )
      );
      await Promise.all(
        poRoundItems.map((r) =>
          addDoc(collection(db, 'torneos', id, 'partidos'), {
            localId: r.localId,
            visitanteId: r.visitanteId,
            estado: 'pendiente',
            fase: poRoundKey,
            poRound: poRoundKey,
            poSlot: r.poSlot ?? 0,
            dia: new Date(r.fecha),
            cancha: r.cancha.trim(),
            createdAt: serverTimestamp(),
          })
        )
      );
      setOpenPORoundModal(false);
      setPoRoundItems([]);
      setPoRoundKey(null);
      alert('Ronda programada.');
    } catch (err) {
      console.error(err);
      alert('No se pudo programar la ronda.');
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
        <div className='space-y-3'>
          {/* Selector de modo: SOLO admin */}
          {canManage ? (
            <div className='rounded-2xl bg-white p-4 shadow-sm border flex items-center gap-3 flex-wrap'>
              <div className='font-semibold'>Modo de fase:</div>
              <div className='flex items-center gap-2'>
                <button
                  className={`px-3 py-2 rounded-xl border ${
                    modoFase === 'copas'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => cambiarModo('copas')}
                  title='Cambiar a Copas'
                >
                  Copas
                </button>
                <button
                  className={`px-3 py-2 rounded-xl border ${
                    modoFase === 'playoffs'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => cambiarModo('playoffs')}
                  title='Cambiar a Playoffs'
                >
                  Playoffs
                </button>
              </div>
              {!modoFase && (
                <div className='text-sm text-gray-600'>
                  Elegí un modo para empezar.
                </div>
              )}
            </div>
          ) : (
            // Invitado ve solo una etiqueta del modo actual (si hay)
            modoFase && (
              <div className='rounded-2xl bg-white p-3 shadow-sm border inline-flex items-center gap-2'>
                <span className='text-sm text-gray-600'>Modo:</span>
                <span className='px-2 py-1 rounded-full text-xs font-medium bg-gray-900 text-white'>
                  {modoFase === 'copas' ? 'Copas' : 'Playoffs'}
                </span>
              </div>
            )
          )}

          {/* Panel COPAS */}
          {modoFase === 'copas' && (
            <div className='rounded-2xl bg-white p-4 shadow-sm border'>
              <h3 className='font-semibold text-lg'>
                Copas (Oro / Plata / Bronce)
              </h3>
              <p className='text-sm text-gray-600'>
                Definí cupos y equipos por copa. Generá el mini-fixture con
                fecha/hora/cancha.
              </p>

              <div className='mt-3 grid grid-cols-1 md:grid-cols-3 gap-3'>
                {/* Actual */}
                <div className='rounded-xl border p-3'>
                  <div className='text-sm font-medium mb-2'>Actual</div>
                  {!faseCopas ? (
                    <div className='text-xs text-gray-500'>Sin asignar</div>
                  ) : (
                    <div className='space-y-2 text-sm'>
                      <div>
                        <b>Oro:</b>{' '}
                        {(faseCopas.oro || [])
                          .map((id) => equiposMap[id])
                          .join(', ') || '-'}
                      </div>
                      <div>
                        <b>Plata:</b>{' '}
                        {(faseCopas.plata || [])
                          .map((id) => equiposMap[id])
                          .join(', ') || '-'}
                      </div>
                      <div>
                        <b>Bronce:</b>{' '}
                        {(faseCopas.bronce || [])
                          .map((id) => equiposMap[id])
                          .join(', ') || '-'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sugerencia */}
                <div className='rounded-xl border p-3'>
                  <div className='text-sm font-medium mb-2'>Sugerencia</div>
                  <div className='space-y-2 text-sm'>
                    <div>
                      <b>Oro:</b>{' '}
                      {(recomendacionCopas.oro || [])
                        .map((id) => equiposMap[id])
                        .join(', ') || '-'}
                    </div>
                    <div>
                      <b>Plata:</b>{' '}
                      {(recomendacionCopas.plata || [])
                        .map((id) => equiposMap[id])
                        .join(', ') || '-'}
                    </div>
                    <div>
                      <b>Bronce:</b>{' '}
                      {(recomendacionCopas.bronce || [])
                        .map((id) => equiposMap[id])
                        .join(', ') || '-'}
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className='rounded-xl border p-3'>
                  <div className='text-sm font-medium mb-2'>Acciones</div>
                  {canManage ? (
                    <div className='flex flex-col gap-2'>
                      <button
                        onClick={asignarCopasAuto}
                        className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black'
                      >
                        Asignar recomendación
                      </button>
                      <button
                        onClick={abrirCopasManual}
                        className='px-3 py-2 rounded-xl border bg-white hover:bg-gray-50'
                      >
                        Elegir manualmente…
                      </button>
                      <button
                        onClick={() =>
                          abrirModalFixtureCopa(
                            'copa-oro',
                            faseCopas?.oro || []
                          )
                        }
                        className='mt-2 w-full px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm flex items-center gap-2'
                      >
                        <IconCalendar /> Generar mini-fixture (Oro)
                      </button>
                      <button
                        onClick={() =>
                          abrirModalFixtureCopa(
                            'copa-plata',
                            faseCopas?.plata || []
                          )
                        }
                        className='w-full px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm flex items-center gap-2'
                      >
                        <IconCalendar /> Generar mini-fixture (Plata)
                      </button>
                      <button
                        onClick={() =>
                          abrirModalFixtureCopa(
                            'copa-bronce',
                            faseCopas?.bronce || []
                          )
                        }
                        className='w-full px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm flex items-center gap-2'
                      >
                        <IconCalendar /> Generar mini-fixture (Bronce)
                      </button>
                    </div>
                  ) : (
                    <div className='text-xs text-gray-500'>Solo admin</div>
                  )}
                </div>
              </div>

              {/* Partidos de copas */}
              {(cupMatches['copa-oro'].length ||
                cupMatches['copa-plata'].length ||
                cupMatches['copa-bronce'].length) && (
                <div className='mt-4 space-y-6'>
                  {['copa-oro', 'copa-plata', 'copa-bronce'].map((ck) =>
                    cupMatches[ck].length ? (
                      <div key={ck} className='space-y-2'>
                        <div className='text-sm font-semibold text-gray-800'>
                          {ck === 'copa-oro'
                            ? 'Copa Oro'
                            : ck === 'copa-plata'
                            ? 'Copa Plata'
                            : 'Copa Bronce'}
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
                              onEditScore={() => openResultado(p)}
                              onDelete={() => solicitarBorrarPartido(p)}
                              onRevert={
                                p.estado === 'finalizado'
                                  ? () => revertirResultado(p.id)
                                  : undefined
                              }
                            />
                          ))}
                        </div>

                        {/* Tabla posiciones copa */}
                        {(() => {
                          const key =
                            ck === 'copa-oro'
                              ? 'oro'
                              : ck === 'copa-plata'
                              ? 'plata'
                              : 'bronce';
                          const rows = cupTables[key];
                          return rows.length ? (
                            <div className='bg-white rounded-xl border mt-2 overflow-x-auto'>
                              <table className='min-w-full text-sm'>
                                <thead className='bg-gray-50'>
                                  <tr className='text-gray-600'>
                                    <th className='text-left px-3 py-2'>#</th>
                                    <th className='text-left px-3 py-2'>
                                      Equipo
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PJ
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PG
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PP
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PF
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PC
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      DIF
                                    </th>
                                    <th className='text-center px-3 py-2'>
                                      PTS
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((t, i) => (
                                    <tr key={t.id} className='border-t'>
                                      <td className='px-3 py-2'>{i + 1}</td>
                                      <td className='px-3 py-2'>{t.nombre}</td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.pj}
                                      </td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.pg}
                                      </td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.pp}
                                      </td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.pf}
                                      </td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.pc}
                                      </td>
                                      <td className='px-3 py-2 text-center'>
                                        {t.dif}
                                      </td>
                                      <td className='px-3 py-2 text-center font-semibold'>
                                        {t.pts}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          )}

          {/* Panel PLAYOFFS */}
          {modoFase === 'playoffs' && (
            <div className='rounded-2xl bg-white p-4 shadow-sm border'>
              <div className='flex items-center justify-between'>
                <div>
                  <h3 className='font-semibold text-lg'>Playoffs</h3>
                  <p className='text-sm text-gray-600'>
                    Elegí cuántos entran (2, 4, 8, 16) y se arman cruces por
                    siembra.
                  </p>
                </div>
                {canManage && (
                  <div className='flex gap-2 flex-wrap justify-end'>
                    <button
                      onClick={abrirPOConfig}
                      className='inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                    >
                      <IconPlus /> Generar
                    </button>

                    {/* Botones para programar rondas con fecha/hora/cancha */}
                    {winnersOf('cuartos').length === 4 &&
                      countRound('semi') < 2 && (
                        <button
                          onClick={() => openProgramNextRound('semi')}
                          className='inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white hover:bg-black'
                          title='Programar semifinales'
                        >
                          <IconCalendar /> Programar semifinales
                        </button>
                      )}
                    {winnersOf('semi').length === 2 &&
                      countRound('final') < 1 && (
                        <button
                          onClick={() => openProgramNextRound('final')}
                          className='inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white hover:bg-black'
                          title='Programar final'
                        >
                          <IconCalendar /> Programar final
                        </button>
                      )}

                    {fasePartidos.length > 0 && (
                      <button
                        onClick={borrarCrucesFaseFinal}
                        className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                      >
                        Borrar cruces
                      </button>
                    )}
                  </div>
                )}
              </div>

              {faseGrouped.length === 0 ? (
                <div className='text-center bg-white border rounded-2xl p-8 shadow-sm mt-3'>
                  <div className='text-4xl mb-2'>🏆</div>
                  <p className='text-gray-600'>Aún no hay cruces.</p>
                </div>
              ) : (
                <div className='mt-3 space-y-4'>
                  {faseGrouped.map(({ fase, matches }) => (
                    <div key={fase} className='space-y-2'>
                      <div className='text-sm font-medium text-gray-700'>
                        {faseLabels[fase] || fase}
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
                            onEditScore={() => openResultado(p)}
                            onDelete={() => solicitarBorrarPartido(p)}
                            onRevert={
                              p.estado === 'finalizado'
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
            className='w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              Asignar copas (manual)
            </h3>

            <form onSubmit={guardarCopasManual} className='space-y-4'>
              {/* Cupos */}
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

              {/* Selección de equipos */}
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
            className='w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
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
              <div className='max-h-[60vh] overflow-auto pr-1'>
                {copaModalPairs.map((p, idx) => (
                  <div key={idx} className='rounded-xl border p-3 mb-2'>
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
                              copy[idx] = {
                                ...copy[idx],
                                fecha: e.target.value,
                              };
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
              </div>

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

      {/* Playoffs: Programar Semis/Final (fecha/hora/cancha) */}
      {openPORoundModal && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenPORoundModal(false)}
        >
          <div
            className='w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className='text-lg font-semibold mb-3'>
              {poRoundKey === 'semi'
                ? 'Programar semifinales'
                : 'Programar final'}
            </h3>

            <form onSubmit={guardarProgramacionRound} className='space-y-3'>
              <div className='max-h-[60vh] overflow-auto pr-1'>
                {poRoundItems.map((r, idx) => (
                  <div key={idx} className='rounded-xl border p-3 mb-2'>
                    <div className='text-sm font-medium mb-2'>
                      {equiposMap[r.localId]} vs {equiposMap[r.visitanteId]}
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                      <div>
                        <label className='text-sm'>Fecha & hora</label>
                        <input
                          type='datetime-local'
                          className='mt-1 w-full rounded-xl border px-3 py-2'
                          value={r.fecha}
                          onChange={(e) =>
                            setPoRoundItems((arr) => {
                              const copy = arr.slice();
                              copy[idx] = {
                                ...copy[idx],
                                fecha: e.target.value,
                              };
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
                          value={r.cancha}
                          onChange={(e) =>
                            setPoRoundItems((arr) => {
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
              </div>

              <div className='flex items-center justify-end gap-2 pt-2'>
                <button
                  type='button'
                  onClick={() => setOpenPORoundModal(false)}
                  className='px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  className='px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black'
                >
                  Guardar partidos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playoffs config */}
      {openPOConfig && canManage && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4'
          onClick={() => setOpenPOConfig(false)}
        >
          <div
            className='w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]'
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
