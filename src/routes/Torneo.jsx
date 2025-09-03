import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { calcularPosiciones } from '../lib/posiciones';
export default function Torneo() {
  const { id } = useParams();
  const { state } = useLocation();
  const admin = Boolean(state?.admin);
  const nav = useNavigate();
  const [torneo, setTorneo] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [tab, setTab] = useState('fixture');
  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'torneos', id), (snap) =>
      setTorneo({
        id: snap.id,
        ...snap.data(),
      })
    );
    const unsub2 = onSnapshot(
      collection(db, 'torneos', id, 'equipos'),
      (snap) => setEquipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsub3 = onSnapshot(
      collection(db, 'torneos', id, 'partidos'),
      (snap) => setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [id]);
  const posiciones = useMemo(
    () => calcularPosiciones(equipos, partidos),
    [equipos, partidos]
  );
  const agregarEquipo = async () => {
    const nombre = prompt('Nombre del equipo');
    if (!nombre) return;
    const logo = prompt('URL del logo (opcional)') || '';
    await addDoc(collection(db, 'torneos', id, 'equipos'), { nombre, logo });
  };
  const agregarPartido = async () => {
    const fecha = prompt('Fecha (YYYY-MM-DD)');
    if (!fecha) return;
    if (equipos.length < 2) return alert('Necesitás tener al menos 2 equipos.');
    const local = prompt('ID equipo local (copia desde lista)');
    const visitante = prompt('ID equipo visitante');
    if (!local || !visitante || local === visitante) return;
    await addDoc(collection(db, 'torneos', id, 'partidos'), {
      fecha,
      equipoLocal: local,
      equipoVisitante: visitante,
      puntosLocal: null,
      puntosVisitante: null,
      jugado: false,
    });
  };
  const cargarResultado = async (p) => {
    const l = Number(prompt(`Puntos ${p.equipoLocal}`));
    const v = Number(prompt(`Puntos ${p.equipoVisitante}`));
    if (Number.isNaN(l) || Number.isNaN(v) || l < 0 || v < 0) return;
    await setDoc(doc(db, 'torneos', id, 'partidos', p.id), {
      ...p,
      puntosLocal: l,
      puntosVisitante: v,
      jugado: true,
    });
  };
  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2'>
        <button onClick={() => nav('/torneos')} className='text-blue-600'>
          Volver
        </button>
        <h2 className='text-xl font-bold'>{torneo?.nombre}</h2>
        <span className='px-2 py-0.5 text-sm rounded bg-blue-100 textblue-700'>
          {torneo?.categoria}
        </span>
      </div>
      <div className='flex gap-2 overflow-x-auto'>
        {['fixture', 'resultados', 'posiciones', 'equipos'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded ${
              tab === t ? 'bg-blue-600 textwhite' : 'bg-white'
            } shadow`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'fixture' && (
        <div className='space-y-3'>
          <div className='flex justify-between items-center'>
            <h3 className='font-semibold text-lg'>Calendario</h3>
            {admin && (
              <button
                onClick={agregarPartido}
                className='px-3 py-2 rounded bg-blue-600 text-white'
              >
                + Partido
              </button>
            )}
          </div>
          {[...partidos]
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map((p) => (
              <div key={p.id} className='bg-white rounded-xl p-4 shadow'>
                <div className='flex items-center justify-between text-sm textgray-500 mb-2'>
                  <span>{p.fecha}</span>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      p.jugado
                        ? 'bggreen-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {p.jugado ? 'Finalizado' : 'Programado'}
                  </span>
                </div>
                <div className='grid grid-cols-3 items-center'>
                  <div className='text-center'>
                    <div className='font-semibold'>{p.equipoLocal}</div>
                  </div>
                  <div className='text-center'>
                    {p.jugado ? (
                      <div className='text-xl font-bold'>
                        {p.puntosLocal} -{p.puntosVisitante}
                      </div>
                    ) : (
                      <div className='text-gray-500'>VS</div>
                    )}
                  </div>
                  <div className='text-center'>
                    <div className='font-semibold'>{p.equipoVisitante}</div>
                  </div>
                </div>
                {admin && (
                  <div className='mt-3 flex justify-center'>
                    <button
                      onClick={() => cargarResultado(p)}
                      className='px-3 py-1 rounded bg-blue-500 text-white'
                    >
                      {p.jugado ? 'Editar' : 'Cargar resultado'}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      {tab === 'resultados' && (
        <div className='space-y-3'>
          <h3 className='font-semibold text-lg'>Resultados</h3>
          {[...partidos]
            .filter((p) => p.jugado)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map((p) => (
              <div key={p.id} className='bg-white rounded-xl p-4 shadow'>
                <div className='flex items-center justify-between text-sm textgray-500 mb-2'>
                  <span>{p.fecha}</span>
                  <span>
                    {p.puntosLocal === p.puntosVisitante
                      ? 'Empate'
                      : 'Ganó ' +
                        (p.puntosLocal > p.puntosVisitante
                          ? p.equipoLocal
                          : p.equipoVisitante)}
                  </span>
                </div>
                <div className='grid grid-cols-3 items-center'>
                  <div className='text-center font-semibold'>
                    {p.equipoLocal}
                  </div>
                  <div className='text-center text-xl fontbold'>
                    {p.puntosLocal} - {p.puntosVisitante}
                  </div>
                  <div className='text-center fontsemibold'>
                    {p.equipoVisitante}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
      {tab === 'posiciones' && (
        <div className='space-y-3'>
          <h3 className='font-semibold text-lg'>Tabla de Posiciones</h3>
          <div className='bg-white rounded-xl shadow overflow-hidden'>
            <table className='w-full'>
              <thead className='bg-gray-50 text-xs text-gray-500'>
                <tr>
                  <th className='px-4 py-2 text-left'>Pos</th>
                  <th className='px-4 py-2 text-left'>Equipo</th>
                  <th className='px-4 py-2'>PJ</th>
                  <th className='px-4 py-2'>PG</th>
                  <th className='px-4 py-2'>PP</th>
                  <th className='px-4 py-2'>Pts</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.length === 0 && (
                  <tr>
                    <td
                      colSpan='6'
                      className='px-4 py-6 text-center textgray-500'
                    >
                      Sin datos aún
                    </td>
                  </tr>
                )}
                {posiciones.map((r, idx) => (
                  <tr key={r.equipoId} className='border-t'>
                    <td className='px-4 py-2'>{idx + 1}</td>
                    <td className='px-4 py-2'>{r.nombre}</td>
                    <td className='px-4 py-2 text-center'>{r.pj}</td>
                    <td className='px-4 py-2 text-center'>{r.pg}</td>
                    <td className='px-4 py-2 text-center'>{r.pp}</td>
                    <td className='px-4 py-2 text-center fontsemibold'>
                      {r.pts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'equipos' && (
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h3 className='font-semibold text-lg'>Equipos</h3>
            {admin && (
              <button
                onClick={agregarEquipo}
                className='px-3 py-2 rounded bg-blue-600 text-white'
              >
                + Equipo
              </button>
            )}
          </div>
          <div className='grid grid-cols-1 gap-3'>
            {equipos.map((eq) => (
              <div
                key={eq.id}
                className='bg-white rounded-xl shadow p-4 flex items-center justify-between'
              >
                <div>
                  <div className='font-semibold'>{eq.nombre}</div>
                  <div className='text-xs text-gray-500'>ID: {eq.id}</div>
                </div>
                {eq.logo && (
                  <img
                    src={eq.logo}
                    alt='logo'
                    className='w-10 h-10 rounded-full object-contain bg-white'
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
