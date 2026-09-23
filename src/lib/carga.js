export const claveEquipo = (nombre) => nombre.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function prepararEquipos(texto, existentes) {
  const nombres = texto.split(/\r?\n/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const vistos = new Set(existentes.map((e) => claveEquipo(e.nombre || '')));
  return nombres.map((nombre) => {
    const nombreKey = claveEquipo(nombre);
    const duplicado = vistos.has(nombreKey);
    vistos.add(nombreKey);
    return { nombre, nombreKey, duplicado };
  });
}

export function validarResultado(local, visitante) {
  if (String(local).trim() === '' || String(visitante).trim() === '') return 'Completá los puntos de ambos equipos.';
  if (![local, visitante].every((s) => Number.isSafeInteger(Number(s)) && Number(s) >= 0)) return 'Los puntos deben ser números enteros, iguales o mayores a cero.';
  if (Number(local) === Number(visitante)) return 'No se permiten empates. Cargá el resultado final del partido.';
  return '';
}
