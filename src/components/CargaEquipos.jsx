import { useRef, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { prepararEquipos } from '../lib/carga';

export default function CargaEquipos({ torneoId, equipos, onClose, onSuccess }) {
  const [texto, setTexto] = useState('');
  const [grupo, setGrupo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const filas = prepararEquipos(texto, equipos);
  const nuevos = filas.filter((f) => !f.duplicado);
  const grupos = [...new Set(equipos.map((e) => e.grupo).filter(Boolean))].sort();

  async function guardar(e) {
    e.preventDefault();
    if (busy.current || !nuevos.length || nuevos.length > 100) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const batch = writeBatch(db);
      for (const { nombre, nombreKey } of nuevos) {
        batch.set(doc(collection(db, 'torneos', torneoId, 'equipos')), {
          nombre, nombreKey, logoUrl: '', createdAt: serverTimestamp(),
          ...(grupo.trim() ? { grupo: grupo.trim().toUpperCase() } : {}),
        });
      }
      await batch.commit();
      onSuccess(`${nuevos.length} equipos agregados.`);
      onClose();
    } catch {
      setError('No se pudieron guardar los equipos. Tu lista sigue acá para volver a intentar.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 bg-black/40 grid place-items-center p-4'>
      <section role='dialog' aria-modal='true' aria-labelledby='carga-equipos-title' className='w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl'>
        <h3 id='carga-equipos-title' className='text-lg font-semibold'>Agregar varios equipos</h3>
        <p className='text-sm text-gray-600 mt-1 mb-4'>Pegá un equipo por línea. Podés agregar los logos después desde Editar equipo.</p>
        <form onSubmit={guardar}>
          <fieldset disabled={saving} className='space-y-3'>
            <label className='block text-sm'>Nombres de los equipos
              <textarea autoFocus required rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Los Tigres\nClub Norte\nSan Martín'} className='mt-1 w-full rounded-xl border p-3' />
            </label>
            <label className='block text-sm'>Grupo para esta lista (opcional)
              <input list='grupos-carga' maxLength={3} value={grupo} onChange={(e) => setGrupo(e.target.value.toUpperCase())} placeholder='Sin grupo' className='mt-1 w-full rounded-xl border p-3' />
              <datalist id='grupos-carga'>{grupos.map((g) => <option key={g} value={g} />)}</datalist>
            </label>
            <p className='text-sm' role='status'>{nuevos.length} para agregar · {filas.length - nuevos.length} repetidos que se omitirán</p>
            {filas.length > 0 && <ul className='max-h-40 overflow-y-auto rounded-xl bg-gray-50 p-3 text-sm space-y-1'>{filas.map((f, i) => <li key={i}>{f.nombre}{f.duplicado ? ' — Ya incluido, se omite' : ` — ${grupo.trim() ? `Grupo ${grupo.trim()}` : 'Sin grupo'}`}</li>)}</ul>}
            {nuevos.length > 100 && <p role='alert'>Agregá hasta 100 equipos por vez.</p>}
            {error && <p role='alert' className='text-sm text-red-700'>{error}</p>}
            <div className='flex flex-wrap justify-end gap-2 pt-2'>
              <button type='button' onClick={onClose} className='rounded-xl border px-4 py-3'>Cancelar</button>
              <button disabled={!nuevos.length || nuevos.length > 100} className='rounded-xl bg-blue-600 text-white px-4 py-3 disabled:opacity-50'>{saving ? 'Guardando…' : `Agregar ${nuevos.length} equipos`}</button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
