// src/routes/Torneo.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
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
} from "firebase/firestore";
import { isAdmin } from "../lib/firestore";

/* ---------------- UI helpers ---------------- */
const catPillClass = (c = "") =>
  c?.startsWith("Femenino")
    ? "bg-pink-100 text-pink-700"
    : "bg-blue-100 text-blue-700";

function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

const IconBack = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path fill="currentColor" d="M15 6l-6 6 6 6" />
  </svg>
);
const IconEdit = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      fill="currentColor"
      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04l-2.34-2.34a1 1 0 0 0-1.41 0L15.13 6.53l3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"
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
const IconScore = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      fill="currentColor"
      d="M3 5h18v14H3zM5 7h6v2H5zm0 4h6v2H5zm8-4h6v6h-6z"
    />
  </svg>
);
const IconPlus = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path fill="currentColor" d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2z" />
  </svg>
);
const IconUpload = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path fill="currentColor" d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z" />
  </svg>
);

/* Avatar / EquipoTag */
const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
const Avatar = ({ name, logoUrl, size = 24 }) =>
  logoUrl ? (
    <img
      src={logoUrl}
      alt={name}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  ) : (
    <div
      className="rounded-full bg-gray-200 text-gray-700 grid place-items-center font-semibold"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </div>
  );
const EquipoTag = ({ nombre, logoUrl }) => (
  <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-white">
    <Avatar name={nombre} logoUrl={logoUrl} size={18} />
    <span className="text-xs">{nombre}</span>
  </span>
);

/* Normalizar nombre para comparaciones (case/acentos/espacios) */
const nameKey = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/* === Helpers de imagen & upload (Cloudinary unsigned) === */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function compressImageFileToDataURL(
  file,
  {
    maxSize = 256, // lado máx px (sobra para logos)
    mimeType = "image/webp", // webp = liviano
    quality = 0.85,
  } = {}
) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  try {
    const out = canvas.toDataURL(mimeType, quality);
    if (!out || out.length < 20) throw new Error("webp falló");
    return out;
  } catch {
    return canvas.toDataURL("image/png");
  }
}

function dataURLtoBlob(dataURL) {
  const [head, body] = dataURL.split(",");
  const mime = head.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binStr = atob(body);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadToCloudinary(fileOrDataURL, folder = "logos") {
  const cloudName = import.meta.env.VITE_CLD_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLD_UPLOAD_PRESET;
  if (!cloudName || !preset) {
    throw new Error("Cloudinary no está configurado (revisá .env)");
  }

  const form = new FormData();
  if (typeof fileOrDataURL === "string" && fileOrDataURL.startsWith("data:")) {
    form.append("file", dataURLtoBlob(fileOrDataURL));
  } else {
    form.append("file", fileOrDataURL); // File nativo
  }
  form.append("upload_preset", preset);
  if (folder) form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: form,
    }
  );
  if (!res.ok) throw new Error("Upload falló");
  const json = await res.json();
  return json.secure_url; // <- URL pública
}

/* Fecha/hora */
function fmtFecha(ts) {
  if (!ts) return "Sin fecha";
  const d = ts?.seconds
    ? new Date(ts.seconds * 1000)
    : ts instanceof Date
    ? ts
    : null;
  if (!d) return "Sin fecha";
  const fecha = d.toLocaleDateString();
  const hora = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fecha} · ${hora}`;
}

/* Devuelve 'YYYY-MM-DDTHH:mm' en HORA LOCAL para inputs datetime-local */
function toDatetimeLocalValue(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/* === Helpers de fecha LOCAL para agrupar y mostrar === */
function ymdLocal(d) {
  // Devuelve 'YYYY-MM-DD' en **hora local**
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function labelFromYMD(ymd) {
  // ymd = 'YYYY-MM-DD' -> etiqueta local (evitamos parsear UTC)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "Sin fecha";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

/* Tabla posiciones builder */
function buildTable(partidosFinalizados, equiposMap) {
  const table = {};
  const ensure = (id) =>
    (table[id] ||= {
      id,
      nombre: equiposMap[id] || "Equipo",
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

/* ---------- Playoffs helpers (NUEVO) ---------- */
const PO_FASES = ["octavos", "cuartos", "semi", "final"];
const nextFase = (f) =>
  f === "octavos"
    ? "cuartos"
    : f === "cuartos"
    ? "semi"
    : f === "semi"
    ? "final"
    : null;
const isPO = (f) => PO_FASES.includes(String(f || ""));

/** Devuelve id del ganador (no se permiten empates) */
const ganadorDe = (match, sl, sv) => {
  if (!isPO(match?.fase)) return null;
  return sl > sv ? match.localId : match.visitanteId;
};

/** Devuelve id del perdedor (no se permiten empates) */
const perdedorDe = (match, sl, sv) => {
  if (!isPO(match?.fase)) return null;
  return sl > sv ? match.visitanteId : match.localId;
};


/* ---------- Button style helpers (global, compacto) ---------- */
const BTN =
  // móvil: compacto por defecto
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium " +
  "shadow-sm ring-1 ring-black/5 transition " +
  // desktop: igual o levemente más chico
  "sm:px-3 sm:py-2 sm:text-sm";

const BTN_FULL = "w-full sm:w-auto";

const BTN_SOFT = "bg-white border hover:bg-gray-50 active:bg-gray-100";

const BTN_PRIMARY =
  "text-white bg-gradient-to-r from-blue-600 to-indigo-600 sm:hover:from-blue-700 sm:hover:to-indigo-700";

const BTN_WARN = "text-white bg-amber-500 sm:hover:bg-amber-600";
const BTN_DANGER = "text-white bg-red-600 sm:hover:bg-red-700";
const BTN_MUTED = "bg-gray-100 hover:bg-gray-200";
const BTN_DARK = "text-white bg-gray-900 sm:hover:bg-black";

/* Tarjeta partido (lista) */
function MatchRow({
  localId,
  visitanteId,
  scoreLocal,
  scoreVisitante,
  equipos,
  equiposMap,
  ts,
  cancha,
  interzonal,
  onEditScore,
  onEditMeta,
  onDelete,
  onRevert,
  canManage,
  isResult = false,
  tops,
}) {
  const logoL = equipos.find((e) => e.id === localId)?.logoUrl;
  const logoV = equipos.find((e) => e.id === visitanteId)?.logoUrl;

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4">
      {/* Cabecera: equipos */}
      {/* Cabecera: equipos + badge interzonal */}
      <div className="font-semibold text-base sm:text-[1rem]">
        <div className="sm:flex sm:items-center sm:flex-wrap sm:gap-2">
          {/* Local */}
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={equiposMap[localId]} logoUrl={logoL} />
            <span className="min-w-0 break-words">
              {equiposMap[localId] || "Local"}
            </span>
          </div>

          {/* Separador / marcador */}
          {isResult ? (
            <div className="flex items-center gap-1 my-1 sm:my-0 sm:mx-1">
              <span className="px-2 py-0.5 rounded bg-gray-100">
                {typeof scoreLocal === "number" ? scoreLocal : "-"}
              </span>
              <span className="text-gray-400">–</span>
              <span className="px-2 py-0.5 rounded bg-gray-100">
                {typeof scoreVisitante === "number" ? scoreVisitante : "-"}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 my-1 sm:my-0 sm:mx-1">vs</span>
          )}

          {/* Visitante */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-w-0 break-words">
              {equiposMap[visitanteId] || "Visitante"}
            </span>
            <Avatar name={equiposMap[visitanteId]} logoUrl={logoV} />
          </div>

          {/* Badge interzonal (derecha) */}
          {interzonal && (
            <span className="ml-auto mt-2 sm:mt-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow">
              Interzonal
            </span>
          )}
        </div>
      </div>

      {/* Meta (solo desktop) */}
      <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
        <span>
          {fmtFecha(ts)}
          {cancha ? ` · ${cancha}` : ""}
        </span>

        {canManage && (
          <button
            type="button"
            onClick={onEditMeta}
            className="text-xs px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
            title="Editar fecha y cancha"
          >
            Editar
          </button>
        )}
      </div>

      {/* Tops (si existen) */}
      {isResult && (tops?.local?.nombre || tops?.visitante?.nombre) && (
        <div className="mt-2 text-sm text-gray-700 space-y-1">
          {tops?.local?.nombre && (
            <div>
              <b>{equiposMap[localId] || "Local"}:</b> {tops.local.nombre} (
              {tops.local.puntos ?? 0})
            </div>
          )}
          {tops?.visitante?.nombre && (
            <div>
              <b>{equiposMap[visitanteId] || "Visitante"}:</b>{" "}
              {tops.visitante.nombre} ({tops.visitante.puntos ?? 0})
            </div>
          )}
        </div>
      )}

      {/* Acciones */}
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onEditScore}
            className={`${BTN} ${isResult ? BTN_WARN : BTN_PRIMARY}`}
            title={isResult ? "Editar resultado" : "Cargar resultado"}
          >
            {isResult ? <IconEdit /> : <IconScore />}
            {isResult ? "Editar" : "Cargar"}
          </button>

          {isResult && onRevert && (
            <button
              onClick={onRevert}
              className={`${BTN} ${BTN_MUTED}`}
              title="Revertir a pendiente"
            >
              Revertir
            </button>
          )}

          <button
            onClick={onDelete}
            className={`${BTN} ${BTN_DANGER}`}
            title="Eliminar partido"
          >
            <IconTrash />
          </button>
        </div>
      )}
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
  // Helper de grupo (usa el state `equipos` del componente)
  const groupOf = (teamId) => {
    if (!teamId) return "";
    const g = equipos.find((e) => e.id === teamId)?.grupo || "";
    return String(g).toUpperCase().trim();
  };

  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fixture");

  // 👉 Flechas de tabs
  const tabsScrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  /* Resultado (modal) */
  const [openResult, setOpenResult] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [scoreLocal, setScoreLocal] = useState("");
  const [scoreVisitante, setScoreVisitante] = useState("");
  const [saving, setSaving] = useState(false);
  // Máximos anotadores
  const [topLocalName, setTopLocalName] = useState("");
  const [topLocalPts, setTopLocalPts] = useState("");
  const [topVisName, setTopVisName] = useState("");
  const [topVisPts, setTopVisPts] = useState("");

  /* Nuevo partido/equipo (modales) */
  const [openMatch, setOpenMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({
    localId: "",
    visitanteId: "",
    fecha: "",
    cancha: "",
    interzonal: false,
  });

  // Devuelve equipos elegibles para el select de "local" o "visitante"
  const elegiblesPara = (side) => {
    const inter = matchForm.interzonal;
    const otherId =
      side === "local" ? matchForm.visitanteId : matchForm.localId;
    const otherGroup = groupOf(otherId); // "A" | "B" | "" (sin grupo)

    return equipos
      .filter((e) => {
        if (e.id === otherId) return false; // nunca el mismo equipo
        const g = groupOf(e.id);

        if (inter) {
          // Interzonal: deben ser de grupos distintos y ambos con grupo
          if (!g) return false; // sin grupo, no va en interzonal
          if (otherGroup) return g !== otherGroup;
          return true; // si el otro no está elegido (o sin grupo), mostrar los que sí tienen grupo
        } else {
          // NO interzonal
          if (otherGroup) {
            if (!g) return true; // permitir combinar con "sin grupo"
            return g === otherGroup; // mismo grupo
          }
          return true; // si el otro no tiene grupo, cualquiera
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const [openTeam, setOpenTeam] = useState(false);

  const [teamForm, setTeamForm] = useState({
    nombre: "",
    logoUrl: "",
    grupo: "",
  });
  const newLogoInputRef = useRef(null);
  const [teamLogoName, setTeamLogoName] = useState("");

  const [teamUploadBusy, setTeamUploadBusy] = useState(false);
  const [teamUploadError, setTeamUploadError] = useState("");

  // --- Editar equipo ---
  const [openEditTeam, setOpenEditTeam] = useState(false);
  const gLocalSel = groupOf(matchForm.localId);
  const gVisSel = groupOf(matchForm.visitanteId);
  const gruposDistintos = !!gLocalSel && !!gVisSel && gLocalSel !== gVisSel;
  const requiereInterzonal = gruposDistintos && !matchForm.interzonal;
  const [editingTeam, setEditingTeam] = useState(null); // objeto equipo
  const [editTeamForm, setEditTeamForm] = useState({
    nombre: "",
    logoUrl: "",
    grupo: "",
  });
  const editLogoInputRef = useRef(null);
  const [editLogoName, setEditLogoName] = useState("");

  const [editUploadBusy, setEditUploadBusy] = useState(false);
  const [editUploadError, setEditUploadError] = useState("");

  // Mensaje de error (inline en el modal de Editar equipo)
  const [editTeamError, setEditTeamError] = useState("");

  function abrirEditarEquipo(equipo) {
    setEditingTeam(equipo);
    setEditTeamForm({
      nombre: equipo?.nombre || "",
      logoUrl: equipo?.logoUrl || "",
      grupo: (equipo?.grupo || "").toString().toUpperCase(),
    });
    setOpenEditTeam(true);
  }

  async function guardarEdicionEquipo(e) {
    e.preventDefault();
    if (!canManage || !editingTeam) return;

    // limpiar error previo
    setEditTeamError("");

    const nombre = (editTeamForm.nombre || "").trim();
    if (!nombre) {
      setEditTeamError("Poné un nombre de equipo.");
      return;
    }
    const key = nameKey(nombre);
    const existe = equipos.some(
      (t) => t.id !== editingTeam.id && nameKey(t.nombre || "") === key
    );
    if (existe) {
      setEditTeamError(
        `"${nombre}" ya existe. Cambiá el nombre (ej.: "${nombre} Azul").`
      );
      return;
    }

    // --- 🔒 Regla: si ya jugó en su grupo actual, no puede cambiar de grupo ---
    const oldGroup = (editingTeam?.grupo || "").toString().trim().toUpperCase();
    const newGroup = (editTeamForm.grupo || "").toString().trim().toUpperCase();

    if (oldGroup && newGroup !== oldGroup) {
      const jugoEnSuGrupo = partidos.some((p) => {
        const g = (p.grupo || "").toString().toUpperCase();
        const esDelMismoGrupo = g && g === oldGroup;
        const esEsteEquipo =
          p.localId === editingTeam.id || p.visitanteId === editingTeam.id;
        const esFaseRegular = !p.fase;
        return esFaseRegular && esDelMismoGrupo && esEsteEquipo;
      });

      if (jugoEnSuGrupo) {
        setEditTeamError(
          `Este equipo ya disputó un partido contra otro equipo del grupo ${oldGroup}.`
        );
        return; // bloqueamos el cambio de grupo
      }
    }
    // --- fin regla ---

    const payload = {
      nombre,
      nombreKey: key,
      logoUrl: (editTeamForm.logoUrl || "").trim(),
    };
    if (newGroup) payload.grupo = newGroup;
    else payload.grupo = deleteField(); // quitar grupo si queda vacío

    try {
      await updateDoc(
        doc(db, "torneos", id, "equipos", editingTeam.id),
        payload
      );
      setOpenEditTeam(false);
      setEditingTeam(null);
    } catch (err) {
      console.error(err);
      setEditTeamError("No se pudo guardar la edición del equipo.");
    }
  }

  /* Confirmar borrar partido (modal) */
  const [openDeleteMatch, setOpenDeleteMatch] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState(null);

  /* Editar fecha/cancha (modal) */
  const [openEditMeta, setOpenEditMeta] = useState(false);
  const [metaMatch, setMetaMatch] = useState(null);
  const [metaFecha, setMetaFecha] = useState("");
  const [metaCancha, setMetaCancha] = useState("");

  /* Fase final – Modo (mutuamente excluyente) */
  const [modoFase, setModoFase] = useState(null); // 'copas' | 'playoffs' | null

  /* Fase final – Copas */
  const [faseCopas, setFaseCopas] = useState(null);
  const [openCopasManual, setOpenCopasManual] = useState(false);
  const [copasSel, setCopasSel] = useState({ oro: [], plata: [], bronce: [] });
  const [copaMax, setCopaMax] = useState({ oro: 1, plata: 1, bronce: 2 });

  /* Modal: mini-fixture copas */
  const [openCopaModal, setOpenCopaModal] = useState(false);
  const [copaModalKey, setCopaModalKey] = useState(null); // 'copa-oro' | 'copa-plata' | 'copa-bronce'
  const [copaModalPairs, setCopaModalPairs] = useState([]); // [{localId, visitanteId, fecha, cancha}]

  /* Fase final – Playoffs */
  const [openPOConfig, setOpenPOConfig] = useState(false);
  const [poN, setPoN] = useState(4); // 2|4|8|16
  const [poSeleccion, setPoSeleccion] = useState([]);
  const [poPairs, setPoPairs] = useState([]); // [{localId, visitanteId, fecha, cancha, slot}]

  // Modal de programación del siguiente cruce de Playoffs
  const [openPOProgram, setOpenPOProgram] = useState(false);
  const [poProgramForm, setPoProgramForm] = useState({
    matchId: null, // si ya existe el partido de la siguiente fase
    fase: "", // 'cuartos' | 'semi' | 'final'
    faseLabel: "", // etiqueta linda para el modal
    poSlot: null, // slot del partido siguiente
    localId: "",
    visitanteId: "",
    fecha: "", // datetime-local (yyyy-MM-ddTHH:mm)
    cancha: "",
  });

  // --- Helpers para 3.º puesto + Final (modal doble) ---
function sCanchaPreferida() {
  const semis = fasePartidos.filter((m) => m.fase === "semi");
  if (semis.length >= 2) {
    const c0 = semis[0]?.cancha || "";
    const c1 = semis[1]?.cancha || "";
    if (c0 && c1 && c0 === c1) return c0;
    return c0 || c1 || "A definir";
  }
  return "A definir";
}

function abrirProgramarDefiniciones({
  perd0, perd1, gan0, gan1,
  tercerExistente, finalExistente,
}) {
  const porDefectoTercer = toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000));
  const porDefectoFinal  = toDatetimeLocalValue(new Date(Date.now() + 3 * 60 * 60 * 1000));

  setPoDefsForm({
    labelTercer: "3.º puesto",
    labelFinal: "Final",
    tercer: {
      matchId: tercerExistente?.id || null,
      localId: perd0,
      visitanteId: perd1,
      fecha: tercerExistente?.dia?.seconds
        ? toDatetimeLocalValue(new Date(tercerExistente.dia.seconds * 1000))
        : porDefectoTercer,
      cancha: (tercerExistente?.cancha || sCanchaPreferida()),
    },
    final: {
      matchId: finalExistente?.id || null,
      localId: gan0,
      visitanteId: gan1,
      fecha: finalExistente?.dia?.seconds
        ? toDatetimeLocalValue(new Date(finalExistente.dia.seconds * 1000))
        : porDefectoFinal,
      cancha: (finalExistente?.cancha || sCanchaPreferida()),
    },
  });
  setOpenPODefs(true);
}

async function guardarDefsProgramacion(e) {
  e.preventDefault();
  if (!canManage) return;

  const { tercer, final } = poDefsForm;

  const writes = [];
  const mkPayload = (fase, slot, d) => ({
    localId: d.localId,
    visitanteId: d.visitanteId,
    estado: "pendiente",
    fase,
    poSlot: slot,
    dia: new Date(d.fecha),
    cancha: (d.cancha || "").trim(),
    updatedAt: serverTimestamp(),
  });

  // 3.º puesto
  if (tercer.localId && tercer.visitanteId && tercer.fecha && tercer.cancha) {
    if (tercer.matchId) {
      writes.push(updateDoc(doc(db, "torneos", id, "partidos", tercer.matchId), mkPayload("tercer", 0, tercer)));
    } else {
      writes.push(addDoc(collection(db, "torneos", id, "partidos"), { ...mkPayload("tercer", 0, tercer), createdAt: serverTimestamp() }));
    }
  }

  // Final
  if (final.localId && final.visitanteId && final.fecha && final.cancha) {
    if (final.matchId) {
      writes.push(updateDoc(doc(db, "torneos", id, "partidos", final.matchId), mkPayload("final", 0, final)));
    } else {
      writes.push(addDoc(collection(db, "torneos", id, "partidos"), { ...mkPayload("final", 0, final), createdAt: serverTimestamp() }));
    }
  }

  try {
    await Promise.all(writes);
    setOpenPODefs(false);
  } catch (err) {
    console.error(err);
    alert("No se pudo programar las definiciones.");
  }
}


  // Modal doble: 3.º puesto + Final
const [openPODefs, setOpenPODefs] = useState(false);
const [poDefsForm, setPoDefsForm] = useState({
  labelTercer: "3.º puesto",
  labelFinal: "Final",
  tercer: { matchId: null, localId: "", visitanteId: "", fecha: "", cancha: "" },
  final:  { matchId: null, localId: "", visitanteId: "", fecha: "", cancha: "" },
});


  // Abrir modal con datos precargados (si ya existe, trae fecha/cancha)
  function abrirProgramarSiguiente({
  matchId = null,
  fase,
  poSlot,
  localId,
  visitanteId,
  fechaExistente,
  canchaExistente,
}) {
  const porDefecto = toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000));
  const faseLabel =
    ({ cuartos: "Cuartos de final", semi: "Semifinal", tercer: "3.º puesto", final: "Final" }[fase]) || fase;

  setPoProgramForm({
    matchId,
    fase,
    faseLabel,
    poSlot,
    localId,
    visitanteId,
    fecha: fechaExistente
      ? toDatetimeLocalValue(new Date(fechaExistente.seconds * 1000))
      : porDefecto,
    cancha: canchaExistente || "",
  });
  setOpenPOProgram(true);
}


  async function guardarProgramacionSiguiente(e) {
    e.preventDefault();
    if (!canManage) return;

    const { matchId, fase, poSlot, localId, visitanteId, fecha, cancha } =
      poProgramForm;
    const dia = fecha ? new Date(fecha) : new Date(Date.now() + 60 * 60 * 1000);

    try {
      if (matchId) {
        // Actualizar partido existente (pudo haberse creado como placeholder)
        await updateDoc(doc(db, "torneos", id, "partidos", matchId), {
          localId,
          visitanteId,
          dia,
          cancha: cancha.trim(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Crear partido nuevo de la siguiente fase
        await addDoc(collection(db, "torneos", id, "partidos"), {
          localId,
          visitanteId,
          estado: "pendiente",
          fase,
          poSlot,
          dia,
          cancha: cancha.trim(),
          createdAt: serverTimestamp(),
        });
      }
      setOpenPOProgram(false);
      setPoProgramForm({
        matchId: null,
        fase: "",
        faseLabel: "",
        poSlot: null,
        localId: "",
        visitanteId: "",
        fecha: "",
        cancha: "",
      });
    } catch (err) {
      console.error(err);
      alert("No se pudo programar el partido."); // si querés, lo cambiamos por banner inline también
    }
  }

  /* GRUPOS – modal programar fixtures por grupo */
  const [openGrupoModal, setOpenGrupoModal] = useState(false);
  const [grupoModalKey, setGrupoModalKey] = useState(null); // 'A' | 'B' ...
  const [grupoModalPairs, setGrupoModalPairs] = useState([]); // [{localId, visitanteId, fecha, cancha}]

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

    const unsubTorneo = onSnapshot(doc(db, "torneos", id), (d) =>
      setTorneo({ id: d.id, ...d.data() })
    );
    const unsubEquipos = onSnapshot(
      collection(db, "torneos", id, "equipos"),
      (snap) => setEquipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPartidos = onSnapshot(
      query(collection(db, "torneos", id, "partidos"), orderBy("dia", "asc")),
      (snap) => {
        setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    const unsubCopas = onSnapshot(
      doc(db, "torneos", id, "fases", "copas"),
      (d) => setFaseCopas(d.exists() ? d.data() : null),
      () => setFaseCopas(null)
    );
    const unsubConfig = onSnapshot(
      doc(db, "torneos", id, "fases", "config"),
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

  /* === GRUPOS === */
  const gruposActivos = useMemo(() => {
    const set = new Set();
    equipos.forEach((e) => {
      const g = (e.grupo || "").toString().trim().toUpperCase();
      if (g) set.add(g);
    });
    return Array.from(set).sort();
  }, [equipos]);

  const equiposPorGrupo = useMemo(() => {
    const map = {};
    equipos.forEach((e) => {
      const g = (e.grupo || "").toString().trim().toUpperCase() || "";
      if (!g) return;
      (map[g] ||= []).push(e);
    });
    for (const g in map)
      map[g].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return map;
  }, [equipos]);

  /* Derivados: fase regular */
  const fixture = useMemo(
    () => partidos.filter((p) => p.estado !== "finalizado" && !p.fase),
    [partidos]
  );
  const resultados = useMemo(
    () =>
      partidos
        .filter((p) => p.estado === "finalizado" && !p.fase)
        .slice()
        .sort((a, b) => (b.dia?.seconds ?? 0) - (a.dia?.seconds ?? 0)),
    [partidos]
  );

  // === NUEVO: resultados agrupados por grupo ===
  const resultadosPorGrupo = useMemo(() => {
    const map = {};
    for (const p of resultados) {
      const g = p.interzonal
        ? "INTERZONAL"
        : (p.grupo || "").toString().trim().toUpperCase() || "SIN_GRUPO";
      (map[g] ||= []).push(p);
    }
    for (const g in map) {
      map[g].sort((a, b) => (b.dia?.seconds ?? 0) - (a.dia?.seconds ?? 0));
    }
    const orden = Object.keys(map).sort((a, b) => {
      if (a === "SIN_GRUPO" && b !== "SIN_GRUPO") return 1;
      if (b === "SIN_GRUPO" && a !== "SIN_GRUPO") return -1;
      return a.localeCompare(b);
    });
    return orden.map((g) => ({ grupo: g, matches: map[g] }));
  }, [resultados]);

  // Posiciones generales (solo si no hay múltiples grupos)
  const posicionesGenerales = useMemo(
    () => buildTable(resultados, equiposMap),
    [resultados, equiposMap]
  );

  // Posiciones por grupo (cuando hay 2+ grupos)
  const posicionesPorGrupo = useMemo(() => {
    const out = {};
    for (const g of gruposActivos) {
      // 1) Partidos dentro del grupo g
      const intra = resultados.filter(
        (p) => (p.grupo || "").toUpperCase() === g
      );

      // 2) Interzonales donde participa un equipo del grupo g
      const inter = resultados.filter(
        (p) =>
          p.interzonal === true &&
          ((
            equipos.find((e) => e.id === p.localId)?.grupo || ""
          ).toUpperCase() === g ||
            (
              equipos.find((e) => e.id === p.visitanteId)?.grupo || ""
            ).toUpperCase() === g)
      );

      // 3) Tabla con ambos tipos y luego filtramos sólo equipos del grupo g
      const tablaCompleta = buildTable([...intra, ...inter], equiposMap);
      const idsGrupo = new Set(
        equipos
          .filter((e) => (e.grupo || "").toUpperCase() === g)
          .map((e) => e.id)
      );
      out[g] = tablaCompleta.filter((t) => idsGrupo.has(t.id));
    }
    return out;
  }, [resultados, equipos, equiposMap, gruposActivos]);

  const fixtureGrouped = useMemo(() => {
    const byDate = {};
    for (const p of fixture) {
      const d = p.dia?.seconds ? new Date(p.dia.seconds * 1000) : null;
      const key = d ? ymdLocal(d) : "Sin fecha"; // 👈 clave en horario local
      (byDate[key] ||= []).push(p);
    }
    return Object.keys(byDate)
      .sort()
      .map((k) => ({ dateKey: k, matches: byDate[k] }));
  }, [fixture]);

  /* Derivados: fases (playoffs/copas) */
  const fasePartidos = useMemo(
    () => partidos.filter((p) => p.fase),
    [partidos]
  );
  const hayFaseFinal = !!faseCopas || fasePartidos.length > 0;

  const fasesOrder = ["octavos", "cuartos", "semi", "tercer", "final", "otros"];
const faseLabels = {
  octavos: "Octavos",
  cuartos: "Cuartos",
  semi: "Semifinales",
  tercer: "3.º puesto",
  final: "Final",
  otros: "Otros",
};

  const faseGrouped = useMemo(() => {
    const map = {};
    for (const m of fasePartidos) (map[m.fase || "otros"] ||= []).push(m);
    return fasesOrder
      .filter((k) => map[k])
      .map((k) => ({ fase: k, matches: map[k] }));
  }, [fasePartidos]);

  const cupMatches = useMemo(() => {
    const out = { "copa-oro": [], "copa-plata": [], "copa-bronce": [] };
    for (const m of fasePartidos) {
      if (m.fase === "copa-oro") out["copa-oro"].push(m);
      if (m.fase === "copa-plata") out["copa-plata"].push(m);
      if (m.fase === "copa-bronce") out["copa-bronce"].push(m);
    }
    return out;
  }, [fasePartidos]);

  // POSICIONES por COPA (usa buildTable)
  const posicionesCopas = useMemo(() => {
    const finales = {
      "copa-oro": [],
      "copa-plata": [],
      "copa-bronce": [],
    };
    for (const p of fasePartidos) {
      const f = String(p.fase || "");
      if (!f.startsWith("copa-")) continue;
      if (p.estado !== "finalizado") continue;
      if (!Number.isFinite(p.scoreLocal) || !Number.isFinite(p.scoreVisitante))
        continue;
      finales[f].push(p);
    }
    return {
      "copa-oro": buildTable(finales["copa-oro"], equiposMap),
      "copa-plata": buildTable(finales["copa-plata"], equiposMap),
      "copa-bronce": buildTable(finales["copa-bronce"], equiposMap),
    };
  }, [fasePartidos, equiposMap]);

  // ¿Hay copas en juego? (para mostrar el tab)
  const hayCopasEnJuego = useMemo(() => {
    return (
      !!faseCopas ||
      cupMatches["copa-oro"]?.length ||
      cupMatches["copa-plata"]?.length ||
      cupMatches["copa-bronce"]?.length
    );
  }, [faseCopas, cupMatches]);

  /* ---------- Resultado ---------- */
  const openResultado = (match) => {
    if (!canManage) return;
    setEditingMatch(match);
    setScoreLocal(
      Number.isFinite(match?.scoreLocal) ? String(match.scoreLocal) : ""
    );
    setScoreVisitante(
      Number.isFinite(match?.scoreVisitante) ? String(match.scoreVisitante) : ""
    );
    // precargar máximos si existían
    setTopLocalName(match?.tops?.local?.nombre || "");
    setTopLocalPts(
      Number.isFinite(match?.tops?.local?.puntos)
        ? String(match.tops.local.puntos)
        : ""
    );
    setTopVisName(match?.tops?.visitante?.nombre || "");
    setTopVisPts(
      Number.isFinite(match?.tops?.visitante?.puntos)
        ? String(match.tops.visitante.puntos)
        : ""
    );
    setOpenResult(true);
  };
  const closeResultado = () => {
    setOpenResult(false);
    setEditingMatch(null);
    setScoreLocal("");
    setScoreVisitante("");
    setTopLocalName("");
    setTopLocalPts("");
    setTopVisName("");
    setTopVisPts("");
    setSaving(false);
  };

/** Avanza automáticamente y, cuando se cierran las dos semis,
 *  abre UN SOLO modal con 3.º puesto (ARRIBA) y FINAL (ABAJO). */
async function avanzarPlayoffsSiCorresponde(match, sl, sv) {
  if (!canManage) return;
  if (!isPO(match?.fase)) return;
  if (!Number.isFinite(sl) || !Number.isFinite(sv) || sl === sv) return;

  // Sólo nos interesa el caso "semi" para disparar el modal doble.
  if (match.fase !== "semi") return;

  // 🔧 FUSIÓN LOCAL: tomamos fasePartidos actual y "inyectamos" el resultado recién guardado
  const fasePartidosMerged = fasePartidos.map((m) =>
    m.id === match.id
      ? {
          ...m,
          estado: "finalizado",
          scoreLocal: sl,
          scoreVisitante: sv,
        }
      : m
  );

  // ¿Tenemos las dos semifinales con slot?
  const semis = fasePartidosMerged
    .filter((m) => m.fase === "semi")
    .filter((m) => Number.isFinite(m.poSlot));

  // Cerradas (finalizado y con scores válidos)
  const semisCerradas = semis.filter(
    (m) =>
      m.estado === "finalizado" &&
      Number.isFinite(m.scoreLocal) &&
      Number.isFinite(m.scoreVisitante)
  );

  if (semisCerradas.length !== 2) return;

  const s0 = semisCerradas.find((m) => m.poSlot === 0) || semisCerradas[0];
  const s1 = semisCerradas.find((m) => m.poSlot === 1) || semisCerradas[1];

  const gan0 = ganadorDe(s0, s0.scoreLocal, s0.scoreVisitante);
  const gan1 = ganadorDe(s1, s1.scoreLocal, s1.scoreVisitante);
  const perd0 = perdedorDe(s0, s0.scoreLocal, s0.scoreVisitante);
  const perd1 = perdedorDe(s1, s1.scoreLocal, s1.scoreVisitante);

  if (!gan0 || !gan1 || !perd0 || !perd1) return;

  // ¿Ya existen placeholders de 3.º y final?
  const tercerExistente =
    fasePartidosMerged.find((m) => m.fase === "tercer" && m.poSlot === 0) ||
    null;
  const finalExistente =
    fasePartidosMerged.find((m) => m.fase === "final" && m.poSlot === 0) ||
    null;

  abrirProgramarDefiniciones({
    perd0,
    perd1,
    gan0,
    gan1,
    tercerExistente,
    finalExistente,
  });
}




  const saveResultado = async (e) => {
    e.preventDefault();
    if (!canManage || !editingMatch) return;
    const sl = Number(scoreLocal),
      sv = Number(scoreVisitante);
    if (!Number.isFinite(sl) || !Number.isFinite(sv) || sl < 0 || sv < 0)
      return alert("Cargá puntajes válidos.");
    if (sl === sv) return alert("No se permiten empates.");

    const lPts = topLocalPts === "" ? null : Number(topLocalPts);
    const vPts = topVisPts === "" ? null : Number(topVisPts);
    if (
      (topLocalName && !Number.isFinite(lPts)) ||
      (topVisName && !Number.isFinite(vPts))
    ) {
      return alert("Puntos de máximo anotador inválidos.");
    }
    const tops =
      topLocalName || topVisName
        ? {
            local: topLocalName
              ? { nombre: topLocalName.trim(), puntos: lPts ?? 0 }
              : undefined,
            visitante: topVisName
              ? { nombre: topVisName.trim(), puntos: vPts ?? 0 }
              : undefined,
          }
        : undefined;

    try {
      setSaving(true);
      await updateDoc(doc(db, "torneos", id, "partidos", editingMatch.id), {
        scoreLocal: sl,
        scoreVisitante: sv,
        estado: "finalizado",
        ...(tops ? { tops } : {}),
        updatedAt: serverTimestamp(),
      });

      // Avanzar cuadro si corresponde
      await avanzarPlayoffsSiCorresponde(editingMatch, sl, sv);

      closeResultado();
    } catch (err) {
      console.error(err);
      setSaving(false);
      alert("No se pudo guardar el resultado.");
    }
  };

  const revertirResultado = async (matchId) => {
    if (!canManage) return;
    if (!confirm("¿Revertir este resultado a pendiente?")) return;
    try {
      await updateDoc(doc(db, "torneos", id, "partidos", matchId), {
        estado: "pendiente",
        scoreLocal: deleteField(),
        scoreVisitante: deleteField(),
        tops: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert("No se pudo revertir.");
    }
  };

  /* ---------- Editar fecha/cancha ---------- */
  const openEditarMeta = (match) => {
    if (!canManage) return;
    setMetaMatch(match);
    setMetaFecha(
      match?.dia?.seconds
        ? toDatetimeLocalValue(new Date(match.dia.seconds * 1000))
        : ""
    );
    setMetaCancha(match?.cancha || "");
    setOpenEditMeta(true);
  };

  const closeEditarMeta = () => {
    setOpenEditMeta(false);
    setMetaMatch(null);
    setMetaFecha("");
    setMetaCancha("");
  };

  const guardarMeta = async (e) => {
    e.preventDefault();
    if (!canManage || !metaMatch) return;
    if (!metaFecha) return alert("Elegí fecha y hora.");
    if (!metaCancha.trim()) return alert("Ingresá la cancha.");
    try {
      await updateDoc(doc(db, "torneos", id, "partidos", metaMatch.id), {
        dia: new Date(metaFecha),
        cancha: metaCancha.trim(),
        updatedAt: serverTimestamp(),
      });
      closeEditarMeta();
    } catch (err) {
      console.error(err);
      alert("No se pudo actualizar fecha/cancha.");
    }
  };

  /* ---------- CRUD Partidos/Equipos ---------- */
  const guardarPartido = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    const { localId, visitanteId, fecha, cancha, interzonal } = matchForm;

    if (!localId || !visitanteId || localId === visitanteId)
      return alert("Elegí equipos distintos.");
    if (!fecha) return alert("Elegí fecha y hora.");
    if (!cancha || !cancha.trim()) return alert("Ingresá la cancha.");

    try {
      const gLocal = (
        equipos.find((x) => x.id === localId)?.grupo || ""
      ).toUpperCase();
      const gVis = (
        equipos.find((x) => x.id === visitanteId)?.grupo || ""
      ).toUpperCase();

      if (gLocal && gVis && gLocal !== gVis && !interzonal) {
        return alert(
          'Los equipos son de grupos distintos. Marcá "Partido interzonal".'
        );
      }

      // Si es interzonal, DEBE ser entre grupos distintos
      if (interzonal) {
        if (!gLocal || !gVis || gLocal === gVis) {
          return alert(
            "Interzonal debe ser entre equipos de grupos diferentes (A vs B)."
          );
        }
      }

      // grupo sólo cuando NO es interzonal y ambos están en el mismo grupo
      const grupo = !interzonal && gLocal && gLocal === gVis ? gLocal : "";

      const payload = {
        localId,
        visitanteId,
        dia: new Date(fecha),
        cancha: cancha.trim(),
        estado: "pendiente",
        createdAt: serverTimestamp(),
      };
      if (grupo) payload.grupo = grupo; // sólo si hay valor
      if (interzonal) payload.interzonal = true; // sólo si es true

      await addDoc(collection(db, "torneos", id, "partidos"), payload);

      setOpenMatch(false);
    } catch (err) {
      console.error(err);
      alert("No se pudo crear el partido.");
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
      await deleteDoc(doc(db, "torneos", id, "partidos", matchToDelete.id));
      cancelarBorrarPartido();
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar el partido.");
    }
  };
  const borrarEquipo = async (teamId) => {
    if (!canManage) return;
    const usado = partidos.some(
      (p) => p.localId === teamId || p.visitanteId === teamId
    );
    if (usado)
      return alert(
        "No podés borrar el equipo: está referenciado por partidos."
      );
    if (!confirm("¿Eliminar este equipo?")) return;
    try {
      await deleteDoc(doc(db, "torneos", id, "equipos", teamId));
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar el equipo.");
    }
  };

  async function eliminarPlayoffs() {
    const po = fasePartidos.filter(
      (m) => !String(m.fase || "").startsWith("copa-")
    );
    await Promise.all(
      po.map((m) => deleteDoc(doc(db, "torneos", id, "partidos", m.id)))
    );
  }
  async function eliminarCopasFase() {
    const cups = fasePartidos.filter((m) =>
      String(m.fase || "").startsWith("copa-")
    );
    await Promise.all(
      cups.map((m) => deleteDoc(doc(db, "torneos", id, "partidos", m.id)))
    );
    try {
      await deleteDoc(doc(db, "torneos", id, "fases", "copas"));
    } catch (e) {
      console.warn("Copas: no se pudo eliminar (puede no existir):", e);
    }
  }

  const cambiarModo = async (nuevo) => {
    if (!canManage) return;
    if (nuevo === modoFase) return;
    try {
      if (nuevo === "copas") {
        const hayPO = fasePartidos.some(
          (m) => !String(m.fase || "").startsWith("copa-")
        );
        if (
          hayPO &&
          !confirm(
            "Cambiar a Copas eliminará todos los cruces de Playoffs. ¿Continuar?"
          )
        )
          return;
        await eliminarPlayoffs();
      } else if (nuevo === "playoffs") {
        const hayCopas =
          !!faseCopas ||
          fasePartidos.some((m) => String(m.fase || "").startsWith("copa-"));
        if (
          hayCopas &&
          !confirm(
            "Cambiar a Playoffs eliminará las asignaciones y partidos de Copas. ¿Continuar?"
          )
        )
          return;
        await eliminarCopasFase();
      }

      await setDoc(
        doc(db, "torneos", id, "fases", "config"),
        { modo: nuevo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setModoFase(nuevo);
    } catch (e) {
      console.error(e);
      alert("No se pudo cambiar el modo.");
    }
  };

  /* ---------- Copas ---------- */
  const recomendacionCopas = useMemo(() => {
    if (gruposActivos.length < 2) {
      const ids = posicionesGenerales.map((t) => t.id);
      return {
        oro: ids[0] ? [ids[0]] : [],
        plata: ids[1] ? [ids[1]] : [],
        bronce: ids.slice(2, 4),
      };
    }
    const oro = [],
      plata = [],
      bronce = [];
    for (const g of gruposActivos) {
      const tabla = posicionesPorGrupo[g] || [];
      if (tabla[0]) oro.push(tabla[0].id);
      if (tabla[1]) plata.push(tabla[1].id);
      if (tabla[2]) bronce.push(tabla[2].id);
    }
    return { oro, plata, bronce };
  }, [posicionesGenerales, posicionesPorGrupo, gruposActivos]);

  const asignarCopasAuto = async () => {
    if (!canManage) return;
    if (modoFase !== "copas")
      return alert(
        "El modo activo es Playoffs. Cambiá a Copas para usar esta sección."
      );
    try {
      await setDoc(doc(db, "torneos", id, "fases", "copas"), {
        ...recomendacionCopas,
        cupos: {
          oro: Math.max(1, recomendacionCopas.oro.length),
          plata: Math.max(1, recomendacionCopas.plata.length),
          bronce: Math.max(0, recomendacionCopas.bronce.length),
        },
        updatedAt: serverTimestamp(),
      });
      alert("Copas asignadas automáticamente.");
    } catch (e) {
      console.error(e);
      alert("No se pudo asignar copas.");
    }
  };

  const abrirCopasManual = () => {
    if (!canManage) return;
    if (modoFase !== "copas")
      return alert(
        "El modo activo es Playoffs. Cambiá a Copas para usar esta sección."
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
    if (gruposActivos.length >= 2) return autoRellenarCopasDesdeGrupos();
    const top = posicionesGenerales.map((t) => t.id);
    const oro = top.slice(0, copaMax.oro);
    const plata = top.slice(copaMax.oro, copaMax.oro + copaMax.plata);
    const bronce = top.slice(
      copaMax.oro + copaMax.plata,
      copaMax.oro + copaMax.plata + copaMax.bronce
    );
    setCopasSel({ oro, plata, bronce });
  };
  const autoRellenarCopasDesdeGrupos = () => {
    const oro = [],
      plata = [],
      bronce = [];
    for (const g of gruposActivos) {
      const t = posicionesPorGrupo[g] || [];
      if (t[0]) oro.push(t[0].id);
      if (t[1]) plata.push(t[1].id);
      if (t[2]) bronce.push(t[2].id);
    }
    setCopasSel({
      oro: oro.slice(0, copaMax.oro),
      plata: plata.slice(0, copaMax.plata),
      bronce: bronce.slice(0, copaMax.bronce),
    });
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
    if (modoFase !== "copas")
      return alert(
        "El modo activo es Playoffs. Cambiá a Copas para usar esta sección."
      );

    const { oro, plata, bronce } = copasSel;
    if (
      oro.length > copaMax.oro ||
      plata.length > copaMax.plata ||
      bronce.length > copaMax.bronce
    )
      return alert("No superes los cupos configurados.");
    const picks = [...oro, ...plata, ...bronce];
    if (new Set(picks).size !== picks.length)
      return alert("Un equipo no puede estar en más de una copa.");

    try {
      await setDoc(doc(db, "torneos", id, "fases", "copas"), {
        oro,
        plata,
        bronce,
        cupos: { ...copaMax },
        updatedAt: serverTimestamp(),
      });
      setOpenCopasManual(false);
    } catch (e2) {
      console.error("guardarCopasManual error:", e2);
      alert("No se pudo guardar la configuración de copas.");
    }
  };

  const abrirModalFixtureCopa = (claveCopa, ids) => {
    if (!canManage) return;
    if (modoFase !== "copas")
      return alert(
        "El modo activo es Playoffs. Cambiá a Copas para usar esta sección."
      );
    if (!ids || ids.length < 2)
      return alert("Se necesitan al menos 2 equipos en la copa.");
    const pairs = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.push({
          localId: ids[i],
          visitanteId: ids[j],
          fecha: "",
          cancha: "",
        });
    setCopaModalKey(claveCopa);
    setCopaModalPairs(pairs);
    setOpenCopaModal(true);
  };

  const guardarFixtureCopaConDetalles = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== "copas")
      return alert(
        "El modo activo es Playoffs. Cambiá a Copas para usar esta sección."
      );
    if (!copaModalKey || !copaModalPairs.length) return;
    for (const p of copaModalPairs) {
      if (!p.fecha)
        return alert("Completá fecha y hora en todos los partidos.");
      if (!p.cancha?.trim())
        return alert("Completá la cancha en todos los partidos.");
    }
    try {
      const existentes = fasePartidos.filter((m) => m.fase === copaModalKey);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, "torneos", id, "partidos", m.id))
        )
      );
      await Promise.all(
        copaModalPairs.map((p) =>
          addDoc(collection(db, "torneos", id, "partidos"), {
            localId: p.localId,
            visitanteId: p.visitanteId,
            estado: "pendiente",
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
      alert("Mini-fixture de copa creado.");
    } catch (err) {
      console.error(err);
      alert("No se pudo crear el mini-fixture.");
    }
  };

  /* ---------- Playoffs ---------- */
  const seedName = (n) =>
    n === 2
      ? "final"
      : n === 4
      ? "semi"
      : n === 8
      ? "cuartos"
      : n === 16
      ? "octavos"
      : "otros";

  // NUEVO: recomputar cruces iniciales con programación
  const recomputePoPairs = (selIds, n) => {
    const rankIndex = new Map(posicionesGenerales.map((t, i) => [t.id, i]));
    const ordered = selIds
      .slice()
      .sort((a, b) => (rankIndex.get(a) ?? 999) - (rankIndex.get(b) ?? 999));
    const pairs = [];
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const localId = ordered[i];
      const visitanteId = ordered[ordered.length - 1 - i];
      pairs.push({ localId, visitanteId, fecha: "", cancha: "", slot: i });
    }
    setPoPairs(pairs);
  };

  const abrirPOConfig = () => {
    if (!canManage) return;
    if (modoFase !== "playoffs")
      return alert(
        "El modo activo es Copas. Cambiá a Playoffs para usar esta sección."
      );
    const maxN = Math.min(posicionesGenerales.length, 16);
    const defaultN = [16, 8, 4, 2].find((k) => k <= maxN) || 2;
    const selected = posicionesGenerales.slice(0, defaultN).map((t) => t.id);
    setPoN(defaultN);
    setPoSeleccion(selected);
    recomputePoPairs(selected, defaultN); // precarga cruces
    setOpenPOConfig(true);
  };

  const guardarPOConfig = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (modoFase !== "playoffs")
      return alert(
        "El modo activo es Copas. Cambiá a Playoffs para usar esta sección."
      );
    if (poSeleccion.length !== poN)
      return alert(`Elegí exactamente ${poN} equipos.`);
    if (poPairs.length !== poN / 2) return alert("Faltan cruces.");

    for (const p of poPairs) {
      if (!p.fecha)
        return alert("Completá fecha y hora en todos los partidos.");
      if (!p.cancha?.trim())
        return alert("Completá la cancha en todos los partidos.");
    }

    const fase = seedName(poN);
    try {
      const existentes = fasePartidos.filter((m) => m.fase === fase);
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, "torneos", id, "partidos", m.id))
        )
      );
      for (const p of poPairs) {
        await addDoc(collection(db, "torneos", id, "partidos"), {
          localId: p.localId,
          visitanteId: p.visitanteId,
          estado: "pendiente",
          fase,
          poSlot: p.slot,
          dia: new Date(p.fecha),
          cancha: p.cancha.trim(),
          createdAt: serverTimestamp(),
        });
      }
      setOpenPOConfig(false);
    } catch (e2) {
      console.error(e2);
      alert("No se pudieron crear los cruces.");
    }
  };

  const borrarCrucesFaseFinal = async () => {
    if (!canManage) return;
    if (modoFase !== "playoffs") return alert("El modo activo es Copas.");
    if (!fasePartidos.length) return;
    if (!confirm("¿Eliminar TODOS los cruces de la fase final?")) return;
    try {
      await Promise.all(
        fasePartidos.map((m) =>
          deleteDoc(doc(db, "torneos", id, "partidos", m.id))
        )
      );
    } catch (e) {
      console.error(e);
      alert("No se pudieron eliminar los cruces.");
    }
  };

  /* ---------- GRUPOS: programar fixture por grupo ---------- */
  const abrirModalFixtureGrupo = (g) => {
    if (!canManage) return;
    const equiposG = (equiposPorGrupo[g] || []).map((e) => e.id);
    if (equiposG.length < 2)
      return alert("Ese grupo necesita al menos 2 equipos.");
    const pairs = [];
    for (let i = 0; i < equiposG.length; i++)
      for (let j = i + 1; j < equiposG.length; j++)
        pairs.push({
          localId: equiposG[i],
          visitanteId: equiposG[j],
          fecha: "",
          cancha: "",
        });
    setGrupoModalKey(g);
    setGrupoModalPairs(pairs);
    setOpenGrupoModal(true);
  };

  const guardarFixtureGrupo = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!grupoModalKey || !grupoModalPairs.length) return;
    for (const p of grupoModalPairs) {
      if (!p.fecha)
        return alert("Completá fecha y hora en todos los partidos.");
      if (!p.cancha?.trim())
        return alert("Completá la cancha en todos los partidos.");
    }
    try {
      const existentes = partidos.filter(
        (m) => !m.fase && (m.grupo || "").toUpperCase() === grupoModalKey
      );
      await Promise.all(
        existentes.map((m) =>
          deleteDoc(doc(db, "torneos", id, "partidos", m.id))
        )
      );
      await Promise.all(
        grupoModalPairs.map((p) =>
          addDoc(collection(db, "torneos", id, "partidos"), {
            localId: p.localId,
            visitanteId: p.visitanteId,
            estado: "pendiente",
            grupo: grupoModalKey,
            dia: new Date(p.fecha),
            cancha: p.cancha.trim(),
            createdAt: serverTimestamp(),
          })
        )
      );
      setOpenGrupoModal(false);
      setGrupoModalKey(null);
      setGrupoModalPairs([]);
      alert("Fixture del grupo creado.");
    } catch (err) {
      console.error(err);
      alert("No se pudo crear el fixture del grupo.");
    }
  };

  /* -------------------- RENDER -------------------- */
  const tabs = [
    "fixture",
    "resultados",
    "posiciones",
    ...(hayCopasEnJuego ? ["pos-copas"] : []), // << NUEVO
    "goleadores",
    "equipos",
    ...(admin || hayFaseFinal ? ["fase"] : []),
  ];

  const irAPosCopas = () => {
    setTab("pos-copas");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const irAPosiciones = () => {
    setTab("posiciones");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  // 👉 Mostrar/ocultar flechas y desplazar el contenedor de tabs
  function updateTabArrows() {
    const el = tabsScrollRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 0;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setShowLeft(canLeft);
    setShowRight(canRight);
  }
  function scrollTabs(dir = 1) {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 220, behavior: "smooth" });
  }

  useEffect(() => {
    updateTabArrows();
    const el = tabsScrollRef.current;
    if (!el) return;
    const onScroll = () => updateTabArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateTabArrows);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateTabArrows);
    };
  }, [tabs.length]);

  // Ranking de goleadores (a partir de tops por partido)
  const goleadores = useMemo(() => {
    const acc = {};
    for (const p of resultados) {
      const push = (side, teamId) => {
        const t = p?.tops?.[side];
        if (!t?.nombre) return;
        const puntos = Number(t.puntos);
        if (!Number.isFinite(puntos)) return;
        const key = `${teamId}::${nameKey(t.nombre)}`;
        if (!acc[key])
          acc[key] = {
            nombre: t.nombre.trim(),
            equipoId: teamId,
            equipo: equiposMap[teamId] || "Equipo",
            total: 0,
            pj: 0,
          };
        acc[key].total += puntos;
        acc[key].pj += 1;
      };
      push("local", p.localId);
      push("visitante", p.visitanteId);
    }
    return Object.values(acc).sort(
      (a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre)
    );
  }, [resultados, equiposMap]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl p-[1px] bg-gradient-to-r from-blue-200/60 via-purple-200/60 to-pink-200/60">
        <div className="rounded-2xl bg-white/70 backdrop-blur-md p-4 sm:p-5 border border-white/40">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => nav(-1)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 bg-white hover:bg-gray-50 text-gray-700"
                title="Volver"
              >
                <IconBack /> <span className="hidden sm:inline">Volver</span>
              </button>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {torneo?.nombre || "Torneo"}
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

            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-sm text-gray-700 mr-2">
                {equipos.length} equipos · {partidos.length} partidos
              </div>
              {canManage && (
                <>
                  <button
                    onClick={() => setOpenTeam(true)}
                    className={`${BTN} ${BTN_PRIMARY} from-sky-600 to-blue-600 px-3 py-2 text-sm rounded-xl whitespace-nowrap shrink-0`}
                  >
                    Equipo
                  </button>

                  <button
                    onClick={() => setOpenMatch(true)}
                    className={`${BTN} ${BTN_PRIMARY} from-indigo-600 to-purple-600 px-3 py-2 text-sm rounded-xl whitespace-nowrap shrink-0`}
                  >
                    Partido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-md border shadow-sm">
        <div className="relative">
          {/* fundido lateral */}
          <div className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-white/90 to-transparent rounded-l-2xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white/90 to-transparent rounded-r-2xl" />

          {/* Flecha izquierda */}
          {showLeft && (
            <button
              onClick={() => scrollTabs(-1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 grid place-items-center rounded-full bg-white/90 backdrop-blur-sm shadow ring-1 ring-black/10 hover:shadow-md active:scale-95"
              aria-label="Desplazar a la izquierda"
            >
              <IconBack />
            </button>
          )}

          {/* Flecha derecha (IconBack rotado) */}
          {showRight && (
            <button
              onClick={() => scrollTabs(1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 grid place-items-center rounded-full bg-white/90 backdrop-blur-sm shadow ring-1 ring-black/10 hover:shadow-md active:scale-95"
              aria-label="Desplazar a la derecha"
            >
              <IconBack style={{ transform: "rotate(180deg)" }} />
            </button>
          )}

          {/* Contenedor scrollable */}
          <div
            className="overflow-x-auto no-scrollbar px-9"
            ref={tabsScrollRef}
            onScroll={updateTabArrows}
          >
            <div className="flex gap-2 p-2 min-w-max">
              {tabs.map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={[
                      "relative px-4 py-2 rounded-xl text-sm border transition whitespace-nowrap",
                      active
                        ? "text-white border-transparent bg-gradient-to-r from-slate-800 to-gray-900 shadow-sm"
                        : "bg-white hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {
                      {
                        fixture: "Fixture",
                        resultados: "Resultados",
                        posiciones: "Posiciones",
                        "pos-copas": "Posiciones copas",
                        goleadores: "Goleadores",
                        equipos: "Equipos",
                        fase: "Fase final",
                      }[t]
                    }

                    {/* subrayado sutil al estar activo */}
                    {active && (
                      <span className="absolute left-3 right-3 -bottom-[6px] h-[3px] rounded-full bg-gray-900/80" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-3"></div>
              <div className="h-3 w-56 bg-gray-100 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      )}

      {/* FIXTURE */}
      {!loading && tab === "fixture" && (
        <div className="space-y-4">
          {fixtureGrouped.length === 0 ? (
            <div className="text-center bg-white border rounded-2xl p-8 shadow-sm">
              <div className="text-4xl mb-2">📅</div>
              <p className="text-gray-600">No hay partidos próximos.</p>
            </div>
          ) : (
            fixtureGrouped.map(({ dateKey, matches }) => (
              <div key={dateKey} className="space-y-2">
                <div className="text-sm text-gray-500">
                  {dateKey === "Sin fecha"
                    ? "Sin fecha"
                    : labelFromYMD(dateKey)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {matches.map((p) => (
                    <MatchRow
                      key={p.id}
                      localId={p.localId}
                      visitanteId={p.visitanteId}
                      equipos={equipos}
                      equiposMap={equiposMap}
                      ts={p.dia}
                      cancha={p.cancha}
                      interzonal={p.interzonal === true}
                      canManage={canManage}
                      onEditScore={() => openResultado(p)}
                      onEditMeta={() => openEditarMeta(p)}
                      onDelete={() => solicitarBorrarPartido(p)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* RESULTADOS (agrupados por grupo) */}
      {!loading && tab === "resultados" && (
        <>
          {resultados.length === 0 ? (
            <div className="text-center bg-white border rounded-2xl p-8 shadow-sm">
              <div className="text-4xl mb-2">🏀</div>
              <p className="text-gray-600">Todavía no hay resultados.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {resultadosPorGrupo.map(({ grupo, matches }) => (
                <div key={grupo} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-900 text-white">
                      {grupo === "SIN_GRUPO"
                        ? "Sin grupo"
                        : grupo === "INTERZONAL"
                        ? "Interzonal"
                        : `Grupo ${grupo}`}
                    </span>

                    <span className="text-sm text-gray-500">
                      {matches.length} resultado
                      {matches.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        interzonal={p.interzonal === true}
                        canManage={canManage}
                        isResult
                        tops={p.tops}
                        onEditScore={() => openResultado(p)}
                        onDelete={() => solicitarBorrarPartido(p)}
                        onRevert={() => revertirResultado(p.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* POSICIONES */}
      {!loading && tab === "posiciones" && (
        <>
          {gruposActivos.length >= 2 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gruposActivos.map((g) => (
                <div
                  key={g}
                  className="rounded-2xl bg-white p-4 shadow-sm border"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-lg font-semibold">Grupo {g}</div>
                    {canManage && (
                      <button
                        onClick={() => abrirModalFixtureGrupo(g)}
                        className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm"
                      >
                        Programar grupo
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    {equiposPorGrupo[g]?.map((e) => e.nombre).join(" · ") ||
                      "Sin equipos"}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[680px] text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-gray-600">
                          <th className="text-left px-4 py-2 w-10">#</th>
                          <th className="text-left px-4 py-2">Equipo</th>
                          <th className="text-center px-2 py-2 w-14">PJ</th>
                          <th className="text-center px-2 py-2 w-14">PG</th>
                          <th className="text-center px-2 py-2 w-14">PP</th>
                          {/* 👇 ya no ocultamos en mobile */}
                          <th className="text-center px-2 py-2 w-16">PF</th>
                          <th className="text-center px-2 py-2 w-16">PC</th>
                          <th className="text-center px-2 py-2 w-16">DIF</th>
                          <th className="text-center px-2 py-2 w-16">PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(posicionesPorGrupo[g] || []).map((t, i) => {
                          const team = equipos.find((e) => e.id === t.id);
                          return (
                            <tr
                              key={`${g}-${t.id}`}
                              className="border-t odd:bg-white even:bg-gray-50"
                            >
                              <td className="px-4 py-2">{i + 1}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Avatar
                                    name={t.nombre}
                                    logoUrl={team?.logoUrl}
                                    size={20}
                                  />
                                  <span className="truncate">{t.nombre}</span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.pj}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.pg}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.pp}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.pf}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.pc}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                {t.dif}
                              </td>
                              <td className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                                {t.pts}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
              <table className="min-w-[680px] sm:min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-gray-600">
                    <th className="text-left px-4 py-2">#</th>
                    <th className="text-left px-4 py-2">Equipo</th>
                    <th className="text-center px-4 py-2">PJ</th>
                    <th className="text-center px-4 py-2">PG</th>
                    <th className="text-center px-4 py-2">PP</th>
                    <th className="text-center px-4 py-2">PF</th>
                    <th className="text-center px-4 py-2">PC</th>
                    <th className="text-center px-4 py-2">DIF</th>
                    <th className="text-center px-4 py-2">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {posicionesGenerales.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-center text-gray-500 px-4 py-6"
                      >
                        Sin datos aún.
                      </td>
                    </tr>
                  ) : (
                    posicionesGenerales.map((t, i) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-4 py-2">{i + 1}</td>
                        <td className="px-4 py-2">{t.nombre}</td>
                        <td className="px-4 py-2 text-center">{t.pj}</td>
                        <td className="px-4 py-2 text-center">{t.pg}</td>
                        <td className="px-4 py-2 text-center">{t.pp}</td>
                        <td className="px-4 py-2 text-center">{t.pf}</td>
                        <td className="px-4 py-2 text-center">{t.pc}</td>
                        <td className="px-4 py-2 text-center">{t.dif}</td>
                        <td className="px-4 py-2 text-center font-semibold">
                          {t.pts}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* POSICIONES – COPAS (Oro / Plata / Bronce) */}
      {!loading && tab === "pos-copas" && (
        <div className="space-y-4">
          <h3 className="font-semibold text-xl">Posiciones por copa</h3>

          {[
            {
              key: "copa-oro",
              title: "Copa Oro",
              ribbonFrom: "from-amber-500",
              ribbonTo: "to-yellow-500",
            },
            {
              key: "copa-plata",
              title: "Copa Plata",
              ribbonFrom: "from-slate-500",
              ribbonTo: "to-gray-500",
            },
            {
              key: "copa-bronce",
              title: "Copa Bronce",
              ribbonFrom: "from-orange-500",
              ribbonTo: "to-amber-600",
            },
          ].map(({ key, title, ribbonFrom, ribbonTo }) => (
            <div
              key={key}
              className="rounded-2xl border shadow-sm bg-white overflow-hidden"
            >
              {/* header con cintillo */}
              <div
                className={`px-4 py-3 border-b bg-gradient-to-r ${ribbonFrom} ${ribbonTo} text-white`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/20 text-xs">
                    Tabla
                  </span>
                  <h4 className="font-semibold">{title}</h4>
                </div>
              </div>

              {posicionesCopas[key].length === 0 ? (
                /* estado vacío */
                <div className="px-6 py-10 text-center text-gray-500">
                  <div className="text-4xl mb-2">📭</div>
                  <div>Sin datos aún.</div>
                </div>
              ) : (
                /* tabla */
                <div className="overflow-x-auto">
                  <table className="min-w-[680px] text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-600">
                        <th className="text-left px-4 py-2 w-10">#</th>
                        <th className="text-left px-4 py-2">Equipo</th>
                        <th className="text-center px-2 py-2 w-14">PJ</th>
                        <th className="text-center px-2 py-2 w-14">PG</th>
                        <th className="text-center px-2 py-2 w-14">PP</th>
                        <th className="text-center px-2 py-2 w-16">PF</th>
                        <th className="text-center px-2 py-2 w-16">PC</th>
                        <th className="text-center px-2 py-2 w-16">DIF</th>
                        <th className="text-center px-2 py-2 w-16">PTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(posicionesCopas[key] || []).map((t, i) => {
                        const team = equipos.find((e) => e.id === t.id);
                        return (
                          <tr
                            key={`${key}-${t.id}`}
                            className="border-t odd:bg-white even:bg-gray-50"
                          >
                            <td className="px-4 py-2">{i + 1}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar
                                  name={t.nombre}
                                  logoUrl={team?.logoUrl}
                                  size={20}
                                />
                                <span className="truncate">{t.nombre}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">{t.pj}</td>
                            <td className="px-2 py-2 text-center">{t.pg}</td>
                            <td className="px-2 py-2 text-center">{t.pp}</td>
                            <td className="px-2 py-2 text-center">{t.pf}</td>
                            <td className="px-2 py-2 text-center">{t.pc}</td>
                            <td className="px-2 py-2 text-center">{t.dif}</td>
                            <td className="px-2 py-2 text-center font-semibold">
                              {t.pts}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* GOLEADORES */}
      {!loading && tab === "goleadores" && (
        <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-gray-600">
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Jugador</th>
                <th className="text-left px-4 py-2">Equipo</th>
                <th className="text-center px-4 py-2">PTS tot</th>
                <th className="text-center px-4 py-2">PJ</th>
                <th className="text-center px-4 py-2">Prom.</th>
              </tr>
            </thead>
            <tbody>
              {goleadores.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-gray-500 px-4 py-6"
                  >
                    Todavía no hay máximos anotadores cargados.
                  </td>
                </tr>
              ) : (
                goleadores.map((g, i) => (
                  <tr key={`${g.equipoId}-${g.nombre}`} className="border-t">
                    <td className="px-4 py-2">{i + 1}</td>
                    <td className="px-4 py-2">{g.nombre}</td>
                    <td className="px-4 py-2">{g.equipo}</td>
                    <td className="px-4 py-2 text-center font-semibold">
                      {g.total}
                    </td>
                    <td className="px-4 py-2 text-center">{g.pj}</td>
                    <td className="px-4 py-2 text-center">
                      {g.pj ? (g.total / g.pj).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* EQUIPOS */}
      {!loading && tab === "equipos" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {equipos.length} equipos
            </div>
            {canManage && (
              <button
                onClick={() => setOpenTeam(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl text-white
               bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700
               whitespace-nowrap shrink-0"
              >
                Nuevo equipo
              </button>
            )}
          </div>

          {equipos.length === 0 ? (
            <div className="text-center bg-white border rounded-2xl p-8 shadow-sm">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-gray-600">Todavía no hay equipos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {equipos.map((e) => (
                <div
                  key={e.id}
                  className="bg-white rounded-2xl shadow-sm border p-4 flex flex-col gap-3"
                >
                  {/* Encabezado */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={e.nombre} logoUrl={e.logoUrl} size={28} />
                    <div className="font-medium truncate">{e.nombre}</div>
                    {e.grupo ? (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        Grupo {String(e.grupo).toUpperCase()}
                      </span>
                    ) : (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                        Sin grupo
                      </span>
                    )}
                  </div>

                  {/* Footer: editar / borrar */}
                  {canManage && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => abrirEditarEquipo(e)}
                        className={`${BTN} ${BTN_SOFT}`}
                        title="Editar equipo"
                      >
                        <IconEdit />
                        <span className="sm:hidden">Editar</span>
                      </button>
                      <button
                        onClick={() => borrarEquipo(e.id)}
                        className={`${BTN} ${BTN_DANGER}`}
                        title="Eliminar equipo"
                      >
                        <IconTrash />
                        <span className="sm:hidden">Eliminar</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FASE FINAL */}
      {!loading && tab === "fase" && (
        <div className="space-y-3">
          {/* Selector de modo */}
          {canManage && (
            <div className="rounded-2xl bg-white p-4 shadow-sm border flex items-center gap-3 flex-wrap">
              <div className="font-semibold">Modo de fase:</div>
              <div className="flex items-center gap-2">
                <button
                  className={`px-3 py-2 rounded-xl border ${
                    modoFase === "copas"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white hover:bg-gray-50"
                  }`}
                  onClick={() => cambiarModo("copas")}
                >
                  Copas
                </button>
                <button
                  className={`px-3 py-2 rounded-xl border ${
                    modoFase === "playoffs"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white hover:bg-gray-50"
                  }`}
                  onClick={() => cambiarModo("playoffs")}
                >
                  Playoffs
                </button>
              </div>
              {!modoFase && (
                <div className="text-sm text-gray-600">
                  Elegí un modo para empezar.
                </div>
              )}
            </div>
          )}

          {/* Panel COPAS */}
          {modoFase === "copas" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm border">
              <h3 className="font-semibold text-lg">
                Copas (Oro / Plata / Bronce)
              </h3>
              <p className="text-sm text-gray-600">
                Definí cupos y equipos por copa. Generá el mini-fixture con
                fecha/hora/cancha.
              </p>
              <div className="mt-4 rounded-2xl border p-4 bg-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-lg">
                      Posiciones por copa
                    </h4>
                    <p className="text-sm text-gray-600">
                      Mirá las tablas de Copa Oro, Plata y Bronce.
                    </p>
                  </div>

                  <button
                    onClick={irAPosCopas}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white 
                 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    Ver posiciones de copas
                  </button>
                </div>
              </div>
              {/* Posiciones por copa → botón que lleva a la pestaña Posiciones */}
              <div className="mt-4 rounded-2xl border p-4 bg-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-lg">
                      Posiciones de la fase de grupos
                    </h4>
                    <p className="text-sm text-gray-600">
                      Consultá la tabla completa (general y por grupos) en la
                      pestaña Posiciones.
                    </p>
                  </div>

                  <button
                    onClick={irAPosiciones}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white 
                 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    Ver tabla de posiciones
                  </button>
                </div>
              </div>
              {/* OTROS BLOQUES (debajo, sin compartir fila con posiciones) */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-medium mb-2">Actual</div>
                  {!faseCopas ? (
                    <div className="text-xs text-gray-500">Sin asignar</div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div>
                        <b>Oro:</b>{" "}
                        {(faseCopas.oro || [])
                          .map((id) => equiposMap[id])
                          .join(", ") || "-"}
                      </div>
                      <div>
                        <b>Plata:</b>{" "}
                        {(faseCopas.plata || [])
                          .map((id) => equiposMap[id])
                          .join(", ") || "-"}
                      </div>
                      <div>
                        <b>Bronce:</b>{" "}
                        {(faseCopas.bronce || [])
                          .map((id) => equiposMap[id])
                          .join(", ") || "-"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-medium mb-2">Sugerencia</div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <b>Oro:</b>{" "}
                      {(recomendacionCopas.oro || [])
                        .map((id) => equiposMap[id])
                        .join(", ") || "-"}
                    </div>
                    <div>
                      <b>Plata:</b>{" "}
                      {(recomendacionCopas.plata || [])
                        .map((id) => equiposMap[id])
                        .join(", ") || "-"}
                    </div>
                    <div>
                      <b>Bronce:</b>{" "}
                      {(recomendacionCopas.bronce || [])
                        .map((id) => equiposMap[id])
                        .join(", ") || "-"}
                    </div>
                  </div>
                </div>

                {canManage && (
                  <div className="rounded-2xl border p-4">
                    <div className="text-sm font-medium mb-2">Acciones</div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={asignarCopasAuto}
                        className="px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
                      >
                        Asignar recomendación
                      </button>
                      <button
                        onClick={abrirCopasManual}
                        className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
                      >
                        Elegir manualmente…
                      </button>
                      <button
                        onClick={autoRellenarCopas}
                        className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
                      >
                        Autorrellenar{" "}
                        {gruposActivos.length >= 2
                          ? "por grupos"
                          : "por posiciones"}
                      </button>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() =>
                            abrirModalFixtureCopa(
                              "copa-oro",
                              faseCopas?.oro || []
                            )
                          }
                          className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
                        >
                          Mini-fixture (Oro)
                        </button>
                        <button
                          onClick={() =>
                            abrirModalFixtureCopa(
                              "copa-plata",
                              faseCopas?.plata || []
                            )
                          }
                          className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
                        >
                          Mini-fixture (Plata)
                        </button>
                        <button
                          onClick={() =>
                            abrirModalFixtureCopa(
                              "copa-bronce",
                              faseCopas?.bronce || []
                            )
                          }
                          className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
                        >
                          Mini-fixture (Bronce)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>{" "}
              {/* ← CIERRE de la grilla de 3 columnas */}
              {/* Acciones debajo (a todo el ancho en mobile) */}
              {(cupMatches["copa-oro"].length ||
                cupMatches["copa-plata"].length ||
                cupMatches["copa-bronce"].length) && (
                <div className="mt-4 space-y-4">
                  {["copa-oro", "copa-plata", "copa-bronce"].map((ck) =>
                    cupMatches[ck].length ? (
                      <div key={ck} className="space-y-2">
                        <div className="text-sm font-medium text-gray-700">
                          {ck === "copa-oro"
                            ? "Copa Oro"
                            : ck === "copa-plata"
                            ? "Copa Plata"
                            : "Copa Bronce"}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                              isResult={p.estado === "finalizado"}
                              tops={p.tops}
                              onEditScore={() => openResultado(p)}
                              onEditMeta={() => openEditarMeta(p)}
                              onDelete={() => solicitarBorrarPartido(p)}
                              onRevert={
                                p.estado === "finalizado"
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
              )}
            </div>
          )}

          {/* Panel PLAYOFFS */}
          {modoFase === "playoffs" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Playoffs</h3>
                  <p className="text-sm text-gray-600">
                    Elegí cuántos entran (2, 4, 8, 16), programá hora/cancha y
                    se arman cruces por siembra.
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      onClick={abrirPOConfig}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                    >
                      <IconPlus /> Generar
                    </button>
                    {fasePartidos.length > 0 && (
                      <button
                        onClick={borrarCrucesFaseFinal}
                        className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                      >
                        Borrar cruces
                      </button>
                    )}
                  </div>
                )}
              </div>

              {faseGrouped.length === 0 ? (
                <div className="text-center bg-white border rounded-2xl p-8 shadow-sm mt-3">
                  <div className="text-4xl mb-2">🏆</div>
                  <p className="text-gray-600">Aún no hay cruces.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {faseGrouped.map(({ fase, matches }) => (
                    <div key={fase} className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        {faseLabels[fase] || fase}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            isResult={p.estado === "finalizado"}
                            tops={p.tops}
                            onEditScore={() => openResultado(p)}
                            onEditMeta={() => openEditarMeta(p)}
                            onDelete={() => solicitarBorrarPartido(p)}
                            onRevert={
                              p.estado === "finalizado"
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={closeResultado}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">Cargar resultado</h3>
            <div className="text-sm text-gray-600 mb-3">
              <EquipoTag
                nombre={equiposMap[editingMatch.localId] || "Local"}
                logoUrl={
                  equipos.find((e) => e.id === editingMatch.localId)?.logoUrl
                }
              />{" "}
              vs{" "}
              <EquipoTag
                nombre={equiposMap[editingMatch.visitanteId] || "Visitante"}
                logoUrl={
                  equipos.find((e) => e.id === editingMatch.visitanteId)
                    ?.logoUrl
                }
              />
              <div className="text-xs mt-1">
                {fmtFecha(editingMatch.dia)}
                {editingMatch.cancha ? ` · ${editingMatch.cancha}` : ""}
              </div>
            </div>

            <form onSubmit={saveResultado} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">
                    {equiposMap[editingMatch.localId] || "Local"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                    value={scoreLocal}
                    onChange={(e) => setScoreLocal(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">
                    {equiposMap[editingMatch.visitanteId] || "Visitante"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border px-3 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                    value={scoreVisitante} // <-- antes decía scoreLocal
                    onChange={(e) => setScoreVisitante(e.target.value)} // <-- antes setScoreLocal
                    required
                  />
                </div>
              </div>

              {/* Máximos anotadores */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-600 mb-1">
                    Máximo anotador del equipo:{" "}
                    {equiposMap[editingMatch.localId] || "Local"}
                  </div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 mb-2"
                    placeholder="Jugador (opcional)"
                    value={topLocalName}
                    onChange={(e) => setTopLocalName(e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Puntos"
                    value={topLocalPts}
                    onChange={(e) => setTopLocalPts(e.target.value)}
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-gray-600 mb-1">
                    Máximo anotador del equipo:{" "}
                    {equiposMap[editingMatch.visitanteId] || "Visitante"}
                  </div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 mb-2"
                    placeholder="Jugador (opcional)"
                    value={topVisName}
                    onChange={(e) => setTopVisName(e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Puntos"
                    value={topVisPts}
                    onChange={(e) => setTopVisPts(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeResultado}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
                >
                  {saving && <Spinner />} Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openPODefs && canManage && (
  <div
    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
    onClick={() => setOpenPODefs(false)}
  >
    <div
      className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-lg font-semibold mb-1">Programar definiciones</h3>
      <p className="text-sm text-gray-600 mb-3">
        Primero 3.º puesto (arriba) y luego la Final (abajo).
      </p>

      <form onSubmit={guardarDefsProgramacion} className="space-y-5">
        {/* 3.º PUESTO */}
        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">{poDefsForm.labelTercer}</div>
          <div className="text-sm text-gray-600 mb-2">
            <EquipoTag
              nombre={equiposMap[poDefsForm.tercer.localId] || "Local"}
              logoUrl={equipos.find((e) => e.id === poDefsForm.tercer.localId)?.logoUrl}
            />{" "}
            vs{" "}
            <EquipoTag
              nombre={equiposMap[poDefsForm.tercer.visitanteId] || "Visitante"}
              logoUrl={equipos.find((e) => e.id === poDefsForm.tercer.visitanteId)?.logoUrl}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Fecha & hora</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={poDefsForm.tercer.fecha}
                onChange={(e) =>
                  setPoDefsForm((f) => ({ ...f, tercer: { ...f.tercer, fecha: e.target.value } }))
                }
                required
              />
            </div>
            <div>
              <label className="text-sm">Cancha</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={poDefsForm.tercer.cancha}
                onChange={(e) =>
                  setPoDefsForm((f) => ({ ...f, tercer: { ...f.tercer, cancha: e.target.value } }))
                }
                placeholder="Ej. Club A"
                required
              />
            </div>
          </div>
        </div>

        {/* FINAL */}
        <div className="rounded-xl border p-4">
          <div className="font-medium mb-2">{poDefsForm.labelFinal}</div>
          <div className="text-sm text-gray-600 mb-2">
            <EquipoTag
              nombre={equiposMap[poDefsForm.final.localId] || "Local"}
              logoUrl={equipos.find((e) => e.id === poDefsForm.final.localId)?.logoUrl}
            />{" "}
            vs{" "}
            <EquipoTag
              nombre={equiposMap[poDefsForm.final.visitanteId] || "Visitante"}
              logoUrl={equipos.find((e) => e.id === poDefsForm.final.visitanteId)?.logoUrl}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Fecha & hora</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={poDefsForm.final.fecha}
                onChange={(e) =>
                  setPoDefsForm((f) => ({ ...f, final: { ...f.final, fecha: e.target.value } }))
                }
                required
              />
            </div>
            <div>
              <label className="text-sm">Cancha</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={poDefsForm.final.cancha}
                onChange={(e) =>
                  setPoDefsForm((f) => ({ ...f, final: { ...f.final, cancha: e.target.value } }))
                }
                placeholder="Ej. Club A"
                required
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpenPODefs(false)}
            className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            Guardar ambas
          </button>
        </div>
      </form>
    </div>
  </div>
)}


      {/* Programar siguiente cruce (Playoffs) */}
      {openPOProgram && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenPOProgram(false)}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">
              Programar {poProgramForm.faseLabel}
            </h3>
            <div className="text-sm text-gray-600 mb-3">
              <EquipoTag
                nombre={equiposMap[poProgramForm.localId] || "Local"}
                logoUrl={
                  equipos.find((e) => e.id === poProgramForm.localId)?.logoUrl
                }
              />{" "}
              vs{" "}
              <EquipoTag
                nombre={equiposMap[poProgramForm.visitanteId] || "Visitante"}
                logoUrl={
                  equipos.find((e) => e.id === poProgramForm.visitanteId)
                    ?.logoUrl
                }
              />
            </div>

            <form onSubmit={guardarProgramacionSiguiente} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Fecha & hora</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={poProgramForm.fecha}
                    onChange={(e) =>
                      setPoProgramForm((f) => ({ ...f, fecha: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-sm">Cancha</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="Ej. Club A"
                    value={poProgramForm.cancha}
                    onChange={(e) =>
                      setPoProgramForm((f) => ({
                        ...f,
                        cancha: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenPOProgram(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nuevo partido */}
      {openMatch && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenMatch(false)}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">Nuevo partido</h3>
            {matchForm.interzonal && (
              <div className="mb-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow">
                Interzonal · A vs B
              </div>
            )}

            <form onSubmit={guardarPartido} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* LOCAL */}
                <div>
                  <label className="text-sm">Local</label>
                  <select
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={matchForm.localId}
                    onChange={(e) => {
                      const nextLocal = e.target.value;
                      const gL = groupOf(nextLocal);
                      const gV = groupOf(matchForm.visitanteId);
                      // Si es interzonal y el visitante pertenece al mismo grupo, lo limpio
                      if (
                        matchForm.interzonal &&
                        nextLocal &&
                        matchForm.visitanteId &&
                        gL &&
                        gV &&
                        gL === gV
                      ) {
                        setMatchForm((f) => ({
                          ...f,
                          localId: nextLocal,
                          visitanteId: "",
                        }));
                      } else {
                        setMatchForm((f) => ({ ...f, localId: nextLocal }));
                      }
                    }}
                    required
                  >
                    <option value="">Elegir…</option>
                    {elegiblesPara("local").map((e) => {
                      const gOpt = groupOf(e.id);
                      return (
                        <option key={e.id} value={e.id}>
                          {e.nombre} {gOpt ? `· Grupo ${gOpt}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {/* chip de grupo del local */}
                  {matchForm.localId && (
                    <div className="text-xs text-gray-500 mt-1">
                      Grupo: {groupOf(matchForm.localId) || "—"}
                    </div>
                  )}
                </div>

                {/* VISITANTE */}
                <div>
                  <label className="text-sm">Visitante</label>
                  <select
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={matchForm.visitanteId}
                    onChange={(e) => {
                      const nextVis = e.target.value;
                      const gL = groupOf(matchForm.localId);
                      const gV = groupOf(nextVis);
                      // Si es interzonal y el local pertenece al mismo grupo, lo limpio
                      if (
                        matchForm.interzonal &&
                        nextVis &&
                        matchForm.localId &&
                        gL &&
                        gV &&
                        gL === gV
                      ) {
                        setMatchForm((f) => ({
                          ...f,
                          visitanteId: nextVis,
                          localId: "",
                        }));
                      } else {
                        setMatchForm((f) => ({ ...f, visitanteId: nextVis }));
                      }
                    }}
                    required
                  >
                    <option value="">Elegir…</option>
                    {elegiblesPara("visitante").map((e) => {
                      const gOpt = groupOf(e.id);
                      return (
                        <option key={e.id} value={e.id}>
                          {e.nombre} {gOpt ? `· Grupo ${gOpt}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {/* chip de grupo del visitante */}
                  {matchForm.visitanteId && (
                    <div className="text-xs text-gray-500 mt-1">
                      Grupo: {groupOf(matchForm.visitanteId) || "—"}
                    </div>
                  )}
                </div>
              </div>

              {/* AVISO cuando es obligatorio marcar Interzonal */}
              {requiereInterzonal && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20">
                    ⚠️
                  </span>
                  Los equipos elegidos son de <b>grupos distintos</b>. Debés
                  marcar <i>“Partido interzonal”</i>.
                </div>
              )}

              {/* Toggle Interzonal, más bonito */}
              <label className="flex items-start gap-3 rounded-2xl border px-3 py-3 bg-gradient-to-r from-sky-50 to-indigo-50">
                <input
                  type="checkbox"
                  className="mt-1 accent-indigo-600 w-4 h-4"
                  checked={matchForm.interzonal}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked) {
                      const gL = groupOf(matchForm.localId);
                      const gV = groupOf(matchForm.visitanteId);
                      if (
                        matchForm.localId &&
                        matchForm.visitanteId &&
                        gL &&
                        gV &&
                        gL === gV
                      ) {
                        setMatchForm((f) => ({
                          ...f,
                          interzonal: true,
                          visitanteId: "",
                        }));
                        return;
                      }
                    }
                    setMatchForm((f) => ({ ...f, interzonal: checked }));
                  }}
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    Partido interzonal
                  </div>
                  <div className="text-sm text-gray-700">
                    A vs B (grupos distintos). Si los equipos son de grupos
                    diferentes, <b>debe</b> estar marcado.
                  </div>
                  {matchForm.interzonal && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow">
                      Interzonal activo
                    </span>
                  )}
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Fecha & hora</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={matchForm.fecha}
                    onChange={(e) =>
                      setMatchForm((f) => ({ ...f, fecha: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-sm">Cancha</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="Ej. Club A"
                    value={matchForm.cancha}
                    onChange={(e) =>
                      setMatchForm((f) => ({ ...f, cancha: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenMatch(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={requiereInterzonal}
                  title={
                    requiereInterzonal
                      ? 'Debés marcar "Partido interzonal".'
                      : ""
                  }
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white
             bg-gradient-to-r from-indigo-600 to-purple-600
             hover:from-indigo-700 hover:to-purple-700
             disabled:opacity-60 disabled:cursor-not-allowed"
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenTeam(false)}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">Nuevo equipo</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nombre = (teamForm.nombre || "").trim();
                if (!nombre) return alert("Poné un nombre de equipo.");
                const key = nameKey(nombre);
                const existe = equipos.some(
                  (t) => nameKey(t.nombre || "") === key
                );
                if (existe) {
                  alert(
                    `"${nombre}" ya existe. Diferencialo (ej.: "${nombre} Azul").`
                  );
                  return;
                }
                const grupoNew = (teamForm.grupo || "").trim().toUpperCase();
                const teamPayload = {
                  nombre,
                  logoUrl: (teamForm.logoUrl || "").trim(),
                  nombreKey: key,
                  createdAt: serverTimestamp(),
                };
                if (grupoNew) teamPayload.grupo = grupoNew;

                addDoc(collection(db, "torneos", id, "equipos"), teamPayload)
                  .then(() => setOpenTeam(false))
                  .catch((err) => {
                    console.error(err);
                    alert("No se pudo crear el equipo.");
                  });
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm">Nombre</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  placeholder="Ej. Los Tigres"
                  value={teamForm.nombre}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="text-sm">Logo</label>

                {/* Subir desde celular/PC */}
                <div className="mt-1 flex items-center gap-3 flex-wrap">
                  {/* input real oculto */}
                  <input
                    ref={newLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      setTeamUploadError("");
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setTeamLogoName(file.name);
                      try {
                        setTeamUploadBusy(true);
                        const dataURL = await compressImageFileToDataURL(file, {
                          maxSize: 256,
                        });
                        const url = await uploadToCloudinary(dataURL, "logos");
                        setTeamForm((f) => ({ ...f, logoUrl: url }));
                      } catch (err) {
                        console.error(err);
                        setTeamUploadError(
                          "No se pudo subir el logo. Probá otra imagen."
                        );
                      } finally {
                        setTeamUploadBusy(false);
                      }
                    }}
                  />

                  {/* botón visible */}
                  <button
                    type="button"
                    onClick={() => newLogoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    <IconUpload /> Seleccionar archivo
                  </button>

                  {/* nombre del archivo */}
                  <span className="text-sm text-gray-600 truncate max-w-[60%]">
                    {teamLogoName || "Ningún archivo seleccionado"}
                  </span>

                  {/* estado de subida */}
                  {teamUploadBusy && (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <Spinner className="w-4 h-4" /> Subiendo…
                    </span>
                  )}
                </div>

                {/* Preview + limpiar */}
                {teamForm.logoUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={teamForm.logoUrl}
                      alt="logo"
                      className="rounded-md object-cover border"
                      style={{ width: 48, height: 48 }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setTeamForm((f) => ({ ...f, logoUrl: "" }))
                      }
                      className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs"
                    >
                      Quitar logo
                    </button>
                  </div>
                )}

                {/* Alternativa por URL (opcional) */}
                <div className="mt-2">
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="o pegá una URL (opcional)"
                    value={teamForm.logoUrl}
                    onChange={(e) =>
                      setTeamForm((f) => ({
                        ...f,
                        logoUrl: e.target.value.trim(),
                      }))
                    }
                  />
                </div>

                {/* Estado */}
                {teamUploadBusy && (
                  <div className="text-xs text-gray-600 mt-1">
                    Subiendo logo…
                  </div>
                )}
                {teamUploadError && (
                  <div className="text-xs text-red-600 mt-1">
                    {teamUploadError}
                  </div>
                )}
                {!teamForm.logoUrl && !teamUploadBusy && (
                  <p className="text-xs text-gray-500 mt-1">
                    Tip: también podés pegar una URL si ya tenés el logo
                    hosteado.
                  </p>
                )}
              </div>

              {/* NUEVO: Grupo */}
              <div>
                <label className="text-sm">Grupo (opcional)</label>
                <div className="flex flex-col gap-2">
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="Ej. A, B, C…"
                    value={teamForm.grupo}
                    onChange={(e) =>
                      setTeamForm((f) => ({
                        ...f,
                        grupo: e.target.value.toUpperCase().slice(0, 3),
                      }))
                    }
                  />
                  {/* Atajos de grupos existentes */}
                  {gruposActivos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {gruposActivos.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setTeamForm((f) => ({ ...f, grupo: g }))
                          }
                          className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
                          title={`Usar grupo ${g}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Usá una letra (A, B, C) o un nombre corto. Se muestra como
                  “Grupo A”.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenTeam(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Editar equipo */}
      {openEditTeam && editingTeam && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenEditTeam(false)}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">Editar equipo</h3>
            {editTeamError && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
                {editTeamError}
              </div>
            )}

            <form onSubmit={guardarEdicionEquipo} className="space-y-3">
              <div>
                <label className="text-sm">Nombre</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  value={editTeamForm.nombre}
                  onChange={(e) =>
                    setEditTeamForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  required
                />
              </div>

              <div>
                <label className="text-sm">Logo</label>

                {/* Subir desde celular/PC */}
                <div className="mt-1 flex items-center gap-3 flex-wrap">
                  {/* input real oculto */}
                  <input
                    ref={editLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      setEditUploadError("");
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEditLogoName(file.name);
                      try {
                        setEditUploadBusy(true);
                        const dataURL = await compressImageFileToDataURL(file, {
                          maxSize: 256,
                        });
                        const url = await uploadToCloudinary(dataURL, "logos");
                        setEditTeamForm((f) => ({ ...f, logoUrl: url }));
                      } catch (err) {
                        console.error(err);
                        setEditUploadError(
                          "No se pudo subir el logo. Probá otra imagen."
                        );
                      } finally {
                        setEditUploadBusy(false);
                      }
                    }}
                  />

                  {/* botón visible */}
                  <button
                    type="button"
                    onClick={() => editLogoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    <IconUpload /> Seleccionar archivo
                  </button>

                  {/* nombre del archivo */}
                  <span className="text-sm text-gray-600 truncate max-w-[60%]">
                    {editLogoName || "Ningún archivo seleccionado"}
                  </span>

                  {/* estado de subida */}
                  {editUploadBusy && (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <Spinner className="w-4 h-4" /> Subiendo…
                    </span>
                  )}
                </div>

                {/* Preview + limpiar */}
                {editTeamForm.logoUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={editTeamForm.logoUrl}
                      alt="logo"
                      className="rounded-md object-cover border"
                      style={{ width: 48, height: 48 }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditTeamForm((f) => ({ ...f, logoUrl: "" }))
                      }
                      className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs"
                    >
                      Quitar logo
                    </button>
                  </div>
                )}

                {/* Alternativa por URL (opcional) */}
                <div className="mt-2">
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="o pegá una URL (opcional)"
                    value={editTeamForm.logoUrl}
                    onChange={(e) =>
                      setEditTeamForm((f) => ({
                        ...f,
                        logoUrl: e.target.value.trim(),
                      }))
                    }
                  />
                </div>

                {/* Estado */}
                {editUploadBusy && (
                  <div className="text-xs text-gray-600 mt-1">
                    Subiendo logo…
                  </div>
                )}
                {editUploadError && (
                  <div className="text-xs text-red-600 mt-1">
                    {editUploadError}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm">Grupo (opcional)</label>
                <div className="flex flex-col gap-2">
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="Ej. A, B, C… (vacío para quitar grupo)"
                    value={editTeamForm.grupo}
                    onChange={(e) => {
                      setEditTeamError("");
                      setEditTeamForm((f) => ({
                        ...f,
                        grupo: e.target.value.toUpperCase().slice(0, 3),
                      }));
                    }}
                  />
                  {gruposActivos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {gruposActivos.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setEditTeamForm((f) => ({ ...f, grupo: g }))
                          }
                          className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
                        >
                          {g}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setEditTeamForm((f) => ({ ...f, grupo: "" }))
                        }
                        className="px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm"
                        title="Quitar grupo"
                      >
                        Sin grupo
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Dejá vacío para quitar el grupo.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenEditTeam(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmar eliminar partido */}
      {openDeleteMatch && matchToDelete && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={cancelarBorrarPartido}
        >
          <div
            className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease] max-h-[90vh] overflow-y-auto mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              ¿Estás seguro que quieres eliminar el partido?
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              <EquipoTag
                nombre={equiposMap[matchToDelete.localId] || "Local"}
                logoUrl={
                  equipos.find((e) => e.id === matchToDelete.localId)?.logoUrl
                }
              />{" "}
              vs{" "}
              <EquipoTag
                nombre={equiposMap[matchToDelete.visitanteId] || "Visitante"}
                logoUrl={
                  equipos.find((e) => e.id === matchToDelete.visitanteId)
                    ?.logoUrl
                }
              />
              <div className="text-xs mt-1">
                {fmtFecha(matchToDelete.dia)}
                {matchToDelete.cancha ? ` · ${matchToDelete.cancha}` : ""}
              </div>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={cancelarBorrarPartido}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarBorrarPartido}
                className="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copas manual (mejorado + scrollable) */}
      {openCopasManual && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpenCopasManual(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header sticky */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg sm:text-xl font-semibold">
                  Asignar copas (manual)
                </h3>
                <button
                  onClick={() => setOpenCopasManual(false)}
                  className="px-3 py-1.5 rounded-xl border bg-white hover:bg-gray-50 text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Contenido scrollable */}
            <form
              onSubmit={guardarCopasManual}
              className="overflow-y-auto px-5 py-4 space-y-4"
            >
              {/* Cupos */}
              <div className="rounded-2xl border p-4">
                <div className="text-sm font-medium mb-3">Cupos por copa</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="w-14">Oro</span>
                    <input
                      type="number"
                      min={0}
                      max={equipos.length}
                      className="w-24 rounded-xl border px-3 py-2"
                      value={copaMax.oro}
                      onChange={(e) => {
                        const n = Math.max(
                          0,
                          Math.min(
                            equipos.length,
                            parseInt(e.target.value || "0", 10)
                          )
                        );
                        setCopaMax((m) => ({ ...m, oro: n }));
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="w-14">Plata</span>
                    <input
                      type="number"
                      min={0}
                      max={equipos.length}
                      className="w-24 rounded-xl border px-3 py-2"
                      value={copaMax.plata}
                      onChange={(e) => {
                        const n = Math.max(
                          0,
                          Math.min(
                            equipos.length,
                            parseInt(e.target.value || "0", 10)
                          )
                        );
                        setCopaMax((m) => ({ ...m, plata: n }));
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="w-14">Bronce</span>
                    <input
                      type="number"
                      min={0}
                      max={equipos.length}
                      className="w-24 rounded-xl border px-3 py-2"
                      value={copaMax.bronce}
                      onChange={(e) => {
                        const n = Math.max(
                          0,
                          Math.min(
                            equipos.length,
                            parseInt(e.target.value || "0", 10)
                          )
                        );
                        setCopaMax((m) => ({ ...m, bronce: n }));
                      }}
                    />
                  </label>

                  <div className="sm:ml-auto">
                    <button
                      type="button"
                      onClick={autoRellenarCopas}
                      className="w-full sm:w-auto px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
                    >
                      Autorrellenar{" "}
                      {gruposActivos.length >= 2
                        ? "por grupos"
                        : "por posiciones"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Selección */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {["oro", "plata", "bronce"].map((copa) => (
                  <div
                    key={copa}
                    className="rounded-2xl border p-0 overflow-hidden bg-white"
                  >
                    <div className="px-4 py-3 font-medium border-b capitalize">
                      Copa {copa}
                    </div>

                    {/* Lista scrollable por columna (ordenada por grupo y nombre) */}
                    <div className="max-h-80 overflow-y-auto p-3 space-y-1">
                      {equipos
                        .slice()
                        .sort((a, b) => {
                          const ga = (a.grupo || "").toString().toUpperCase();
                          const gb = (b.grupo || "").toString().toUpperCase();
                          return (
                            ga.localeCompare(gb) ||
                            a.nombre.localeCompare(b.nombre)
                          );
                        })
                        .map((e) => {
                          const checked = (copasSel[copa] || []).includes(e.id);
                          const disabled =
                            !checked &&
                            (copasSel[copa]?.length || 0) >=
                              (copaMax[copa] || 0);
                          const g = (e.grupo || "")
                            .toString()
                            .trim()
                            .toUpperCase();
                          return (
                            <label
                              key={`${copa}-${e.id}`}
                              className={`flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 cursor-pointer hover:bg-gray-50 ${
                                disabled ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                              title={disabled ? "Cupo completo" : ""}
                            >
                              <input
                                type="checkbox"
                                className="accent-gray-800 w-4 h-4"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleCopa(copa, e.id)}
                              />
                              <span className="truncate">{e.nombre}</span>

                              {/* Chip de grupo al extremo derecho */}
                              <span
                                className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                                  g
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-gray-50 text-gray-400"
                                }`}
                              >
                                {g ? `Grupo ${g}` : "Sin grupo"}
                              </span>
                            </label>
                          );
                        })}
                    </div>

                    <div className="px-4 py-2 text-xs text-gray-500 border-t">
                      {copasSel[copa]?.length || 0}/{copaMax[copa]}{" "}
                      seleccionados
                    </div>
                  </div>
                ))}
              </div>
            </form>

            {/* Footer sticky */}
            <div className="sticky bottom-0 z-10 bg-white/80 backdrop-blur border-t px-5 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenCopasManual(false)}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                formAction="submit"
                onClick={guardarCopasManual}
                className="px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mini-fixture Copas */}
      {openCopaModal && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenCopaModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              Mini-fixture{" "}
              {copaModalKey === "copa-oro"
                ? "Copa Oro"
                : copaModalKey === "copa-plata"
                ? "Copa Plata"
                : "Copa Bronce"}
            </h3>
            <form
              onSubmit={guardarFixtureCopaConDetalles}
              className="space-y-3"
            >
              {copaModalPairs.map((p, idx) => (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="text-sm font-medium mb-2">
                    {equiposMap[p.localId]} vs {equiposMap[p.visitanteId]}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm">Fecha & hora</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-xl border px-3 py-2"
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
                    <div className="md:col-span-2">
                      <label className="text-sm">Cancha</label>
                      <input
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        placeholder="Ej. Club A"
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenCopaModal(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
                >
                  Crear partidos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Fixture por Grupo */}
      {openGrupoModal && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenGrupoModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              Programar cruces · Grupo {grupoModalKey}
            </h3>
            <form onSubmit={guardarFixtureGrupo} className="space-y-3">
              {grupoModalPairs.map((p, idx) => (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="text-sm font-medium mb-2">
                    {equiposMap[p.localId]} vs {equiposMap[p.visitanteId]}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm">Fecha & hora</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        value={p.fecha}
                        onChange={(e) =>
                          setGrupoModalPairs((arr) => {
                            const copy = arr.slice();
                            copy[idx] = { ...copy[idx], fecha: e.target.value };
                            return copy;
                          })
                        }
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm">Cancha</label>
                      <input
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        placeholder="Ej. Club A"
                        value={p.cancha}
                        onChange={(e) =>
                          setGrupoModalPairs((arr) => {
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
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenGrupoModal(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
                >
                  Crear partidos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editar fecha/cancha */}
      {openEditMeta && metaMatch && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={closeEditarMeta}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              Editar fecha y cancha
            </h3>
            <div className="text-sm text-gray-600 mb-3">
              {equiposMap[metaMatch.localId]} vs{" "}
              {equiposMap[metaMatch.visitanteId]}
            </div>

            <form onSubmit={guardarMeta} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Fecha & hora</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={metaFecha}
                    onChange={(e) => setMetaFecha(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm">Cancha</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="Ej. Club A"
                    value={metaCancha}
                    onChange={(e) => setMetaCancha(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditarMeta}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-white bg-gray-900 hover:bg-black"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playoffs config (con programación) */}
      {openPOConfig && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] grid place-items-center px-4"
          onClick={() => setOpenPOConfig(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl animate-[fadeIn_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">Generar playoffs</h3>

            <form onSubmit={guardarPOConfig} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">Cantidad de equipos:</span>
                {[2, 4, 8, 16]
                  .filter((n) => n <= posicionesGenerales.length)
                  .map((n) => (
                    <label
                      key={n}
                      className="inline-flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="poN"
                        value={n}
                        checked={poN === n}
                        onChange={() => {
                          setPoN(n);
                          const ids = posicionesGenerales
                            .slice(0, n)
                            .map((t) => t.id);
                          setPoSeleccion(ids);
                          recomputePoPairs(ids, n);
                        }}
                      />
                      <span>{n}</span>
                    </label>
                  ))}
                {posicionesGenerales.length < 2 && (
                  <span className="text-xs text-gray-500">
                    No hay suficientes equipos.
                  </span>
                )}
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium mb-2">
                  Seleccioná {poN} equipos
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto pr-1">
                  {posicionesGenerales.map((t) => {
                    const checked = poSeleccion.includes(t.id);
                    const disabled = !checked && poSeleccion.length >= poN;
                    return (
                      <label
                        key={`po-${t.id}`}
                        className={`flex items-center gap-2 text-sm ${
                          disabled ? "opacity-50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            setPoSeleccion((prev) => {
                              const set = new Set(prev);
                              if (set.has(t.id)) set.delete(t.id);
                              else if (set.size < poN) set.add(t.id);
                              const arr = Array.from(set);
                              recomputePoPairs(arr, poN);
                              return arr;
                            });
                          }}
                        />
                        <span className="truncate">{t.nombre}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {poSeleccion.length}/{poN} seleccionados
                </div>
              </div>

              <div className="rounded-xl border p-3 bg-gray-50">
                <div className="text-sm font-medium mb-1">
                  Vista previa (siembra)
                </div>
                <ul className="list-disc pl-5 text-sm text-gray-700">
                  {(() => {
                    const rankIndex = new Map(
                      posicionesGenerales.map((t, i) => [t.id, i])
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

              {/* NUEVO: Programación inicial */}
              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium mb-1">
                  Programación inicial (fecha/hora & cancha)
                </div>
                {poPairs.length === 0 ? (
                  <div className="text-xs text-gray-500">
                    Seleccioná {poN} equipos para ver los cruces.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {poPairs.map((pr, idx) => (
                      <div key={idx} className="rounded-xl border p-3">
                        <div className="text-sm font-medium mb-2">
                          {equiposMap[pr.localId]} vs{" "}
                          {equiposMap[pr.visitanteId]}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-sm">Fecha & hora</label>
                            <input
                              type="datetime-local"
                              className="mt-1 w-full rounded-xl border px-3 py-2"
                              value={pr.fecha}
                              onChange={(e) =>
                                setPoPairs((arr) => {
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
                          <div className="md:col-span-2">
                            <label className="text-sm">Cancha</label>
                            <input
                              className="mt-1 w-full rounded-xl border px-3 py-2"
                              placeholder="Ej. Club A"
                              value={pr.cancha}
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
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenPOConfig(false)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
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
