import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEquipos, validarResultado } from './carga.js';
import { calcularPosiciones } from './posiciones.js';

test('detecta equipos existentes y repetidos con acentos, espacios y mayúsculas', () => {
  const filas = prepararEquipos(' San Martín \r\nNorte\n norte \n\nClub   Sur', [{ nombre: 'SAN MARTIN' }]);
  assert.deepEqual(filas.map((f) => f.duplicado), [true, false, true, false]);
  assert.equal(filas[3].nombre, 'Club Sur');
  assert.deepEqual(prepararEquipos(' \n ', []), []);
});

test('rechaza resultados vacíos, negativos, decimales y empatados; acepta cero explícito', () => {
  for (const [l, v] of [['', '3'], ['3', ' '], ['-1', '4'], ['1.5', '4'], ['5', '5'], ['Infinity', '4']]) assert.ok(validarResultado(l, v));
  assert.equal(validarResultado('0', '20'), '');
  assert.equal(validarResultado('85', '70'), '');
});

test('conserva dos puntos por victoria y uno por derrota, excluyendo pendientes', () => {
  const equipos = [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }];
  const tabla = calcularPosiciones(equipos, [
    { jugado: true, equipoLocal: 'a', equipoVisitante: 'b', puntosLocal: 85, puntosVisitante: 70 },
    { jugado: false, equipoLocal: 'b', equipoVisitante: 'a', puntosLocal: 90, puntosVisitante: 0 },
  ]);
  assert.deepEqual(tabla.map(({ pts, pj }) => ({ pts, pj })), [{ pts: 2, pj: 1 }, { pts: 1, pj: 1 }]);
});
