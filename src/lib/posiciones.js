export function calcularPosiciones(equipos, partidos) {
  const tabla = {};
  equipos.forEach((e) => {
    tabla[e.id] = {
      equipoId: e.id,
      nombre: e.nombre,
      pj: 0,
      pg: 0,
      pp: 0,
      pts: 0,
    };
  });
  partidos.forEach((p) => {
    if (!p.jugado) return;
    const l = tabla[p.equipoLocal];
    const v = tabla[p.equipoVisitante];
    if (!l || !v) return;
    l.pj++;
    v.pj++;
    if (p.puntosLocal > p.puntosVisitante) {
      l.pg++;
      v.pp++;
    } else if (p.puntosLocal < p.puntosVisitante) {
      v.pg++;
      l.pp++;
    }
  });
  Object.values(tabla).forEach((r) => {
    r.pts = r.pg * 2 + r.pp * 1;
  });
  return Object.values(tabla).sort(
    (a, b) =>
      b.pts - a.pts ||
      b.pg - a.pg ||
      a.pp - b.pp ||
      a.nombre.localeCompare(b.nombre)
  );
}
