/**
 * Esperómetro de Cami ❤️
 * Lógica principal de la aplicación web con persistencia doble (Archivos JSON + localStorage + GitHub API optional)
 */

// Estado global de la app
let appState = {
  tiempoAcumulado: {
    total_segundos: 0,
    dias: 0,
    horas: 0,
    minutos: 0,
    segundos: 0,
    total_esperas_registradas: 0
  },
  top10: [],
  cronometroActivo: false,
  timestampInicio: null,
  intervaloTimer: null,
  pendingWaitDuration: 0,
  pendingWaitStart: null
};

// Elementos del DOM
const elValDias = document.getElementById('val-dias');
const elValHoras = document.getElementById('val-horas');
const elValMinutos = document.getElementById('val-minutos');
const elValSegundos = document.getElementById('val-segundos');
const elFunEquivalence = document.getElementById('fun-equivalence');
const elStatusPill = document.getElementById('status-pill');

const elBtnStart = document.getElementById('btn-start');
const elBtnStop = document.getElementById('btn-stop');

const elActiveBanner = document.getElementById('active-wait-banner');
const elLiveStopwatch = document.getElementById('live-stopwatch');
const elLiveSubtext = document.getElementById('live-subtext');

const elTop10List = document.getElementById('top10-list');

// Modal elementos
const modalTop10 = document.getElementById('modal-top10');
const formTop10Desc = document.getElementById('form-top10-desc');
const inputActivity = document.getElementById('input-activity');
const modalDurationHighlight = document.getElementById('modal-duration-highlight');

const modalSync = document.getElementById('modal-sync');
const btnOpenSync = document.getElementById('btn-open-sync');
const btnCloseSync = document.getElementById('btn-close-sync');
const btnExportJson = document.getElementById('btn-export-json');
const btnDownloadBoth = document.getElementById('btn-download-both');
const inputImportJson = document.getElementById('input-import-json');
const btnSaveGhConfig = document.getElementById('btn-save-gh-config');
const ghRepoInput = document.getElementById('gh-repo');
const ghTokenInput = document.getElementById('gh-token');

// Frases divertidas mientras Papá espera
const FRASES_ESPERA = [
  "Papá repasando la historia de la humanidad en la mente... ☕",
  "Camila asegurando que el flequillo esté 100% perfecto 💇‍♀️",
  "Buscando el zapato izquierdo que desapareció mágicamente 👠",
  "Nivel de paciencia de Papá: Sayayin Fase 4 🧘‍♂️",
  "Tranquilo Papá, los grandes momentos requieren tiempo ✨",
  "Dulce de Papá lista en 3... 2... (o 20 minutos) ❤️"
];

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  await cargarDatosPersistentes();
  recuperarCronometroEnCurso();
  renderizarPantalla();
  configurarEventos();
});

// Cargar archivos JSON o desde localStorage
async function cargarDatosPersistentes() {
  let cargadoDesdeArchivos = false;

  try {
    // Intentar leer tiempo_acumulado.json y top10_esperas.json directamente del servidor/repositorio
    const respTiempo = await fetch('tiempo_acumulado.json', { cache: 'no-cache' });
    const respTop10 = await fetch('top10_esperas.json', { cache: 'no-cache' });

    if (respTiempo.ok && respTop10.ok) {
      const dataTiempo = await respTiempo.json();
      const dataTop10 = await respTop10.json();

      appState.tiempoAcumulado = dataTiempo;
      appState.top10 = Array.isArray(dataTop10) ? dataTop10 : [];
      cargadoDesdeArchivos = true;
    }
  } catch (err) {
    console.warn("No se pudieron leer archivos JSON estáticos directos, utilizando caché local:", err);
  }

  // Si no se pudieron leer del servidor estático, usar copia guardada en localStorage
  if (!cargadoDesdeArchivos) {
    const localTiempo = localStorage.getItem('esperometro_tiempo');
    const localTop10 = localStorage.getItem('esperometro_top10');

    if (localTiempo) appState.tiempoAcumulado = JSON.parse(localTiempo);
    if (localTop10) appState.top10 = JSON.parse(localTop10);
  }

  // Garantizar cálculo coherente de D/H/M/S
  descomponerSegundos(appState.tiempoAcumulado.total_segundos || 0);

  // Cargar configuración de GitHub Sync si existe
  const savedGhRepo = localStorage.getItem('esperometro_gh_repo');
  const savedGhToken = localStorage.getItem('esperometro_gh_token');
  if (savedGhRepo && ghRepoInput) ghRepoInput.value = savedGhRepo;
  if (savedGhToken && ghTokenInput) ghTokenInput.value = savedGhToken;
}

// Guardar persistentemente en archivos local + localStorage (+ GitHub API si configurado)
async function guardarDatosPersistentes() {
  // 1. Guardar en localStorage inmediatamente
  localStorage.setItem('esperometro_tiempo', JSON.stringify(appState.tiempoAcumulado));
  localStorage.setItem('esperometro_top10', JSON.stringify(appState.top10));

  // 2. Intentar guardar en backend local Python si está activo (/api/guardar)
  try {
    await fetch('/api/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tiempo_acumulado: appState.tiempoAcumulado,
        top10_esperas: appState.top10
      })
    });
  } catch (e) {
    // Si no hay server Python activo, es normal en GitHub Pages puro
  }

  // 3. Sincronizar automáticamente con GitHub API si Papá configuró su Token
  const repo = localStorage.getItem('esperometro_gh_repo');
  const token = localStorage.getItem('esperometro_gh_token');
  if (repo && token) {
    sincronizarConGitHubAPI(repo, token);
  }
}

// Convertir total de segundos acumulados en Días, Horas, Minutos, Segundos
function descomponerSegundos(totalSec) {
  const total = Math.max(0, Math.floor(totalSec));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;

  appState.tiempoAcumulado.total_segundos = total;
  appState.tiempoAcumulado.dias = dias;
  appState.tiempoAcumulado.horas = horas;
  appState.tiempoAcumulado.minutos = minutos;
  appState.tiempoAcumulado.segundos = segundos;
}

// Formatear segundos en string legible "01h 15m 30s" o "45m 12s"
function formatearDuracion(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  }
  return `${pad(m)}m ${pad(s)}s`;
}

// Renderizar la pantalla completa
function renderizarPantalla() {
  const t = appState.tiempoAcumulado;
  const pad = (n) => String(n).padStart(2, '0');

  elValDias.textContent = pad(t.dias || 0);
  elValHoras.textContent = pad(t.horas || 0);
  elValMinutos.textContent = pad(t.minutos || 0);
  elValSegundos.textContent = pad(t.segundos || 0);

  // Equivalencia divertida
  const totalHorasFloat = ((t.total_segundos || 0) / 3600).toFixed(1);
  const peliculas = (t.total_segundos / 7200).toFixed(1);
  const episodiosDisney = Math.floor(t.total_segundos / 1320);

  elFunEquivalence.innerHTML = `
    <i class="fa-solid fa-sparkles"></i> ¡Equivale a <strong>${totalHorasFloat} horas totales</strong> 
    (~${peliculas} películas o <strong>${episodiosDisney} episodios</strong> de series)!
  `;

  // Render Top 10
  renderizarTop10();
}

// Renderizar la lista de las Top 10 Esperas Más Prolongadas
function renderizarTop10() {
  elTop10List.innerHTML = '';

  if (!appState.top10 || appState.top10.length === 0) {
    elTop10List.innerHTML = `
      <div class="top10-item" style="justify-content:center; text-align:center; padding:20px;">
        <span style="color:#6b7280; font-size:0.84rem;">Aún no hay esperas registradas. ¡Activa el cronómetro cuando Camila se arregle!</span>
      </div>
    `;
    return;
  }

  // Ordenar de mayor a menor duración
  const ordenados = [...appState.top10].sort((a, b) => b.duracion_segundos - a.duracion_segundos).slice(0, 10);

  ordenados.forEach((item, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const iconMedal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

    const div = document.createElement('div');
    div.className = `top10-item ${rankClass}`;
    div.innerHTML = `
      <div class="rank-badge">${iconMedal}</div>
      <div class="top10-content">
        <div class="top10-desc" title="${escapeHtml(item.descripcion)}">${escapeHtml(item.descripcion)}</div>
        <div class="top10-meta"><i class="fa-regular fa-calendar-days"></i> ${item.fecha || ''} ${item.hora ? '&bull; ' + item.hora : ''}</div>
      </div>
      <div class="top10-duration">${item.duracion_formateada || formatearDuracion(item.duracion_segundos)}</div>
    `;
    elTop10List.appendChild(div);
  });
}

// Configurar listeners de botones y controles
function configurarEventos() {
  // Botón ACTIVAR CRONÓMETRO
  elBtnStart.addEventListener('click', iniciarCronometro);

  // Botón DETENER CRONÓMETRO
  elBtnStop.addEventListener('click', detenerCronometro);

  // Chips rápidos en el modal Top 10
  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      inputActivity.value = chip.dataset.chip;
    });
  });

  // Guardar descripción Top 10
  formTop10Desc.addEventListener('submit', (e) => {
    e.preventDefault();
    finalizarRegistroTop10(inputActivity.value.trim());
  });

  // Modal Sync / GitHub
  btnOpenSync.addEventListener('click', () => modalSync.classList.remove('hidden'));
  btnCloseSync.addEventListener('click', () => modalSync.classList.add('hidden'));

  // Exportar archivos JSON manualmente
  btnExportJson.addEventListener('click', descargarArchivosJSON);
  btnDownloadBoth.addEventListener('click', descargarArchivosJSON);

  // Cargar archivo JSON manual
  inputImportJson.addEventListener('change', importarArchivoJSON);

  // Guardar configuración GitHub
  btnSaveGhConfig.addEventListener('click', () => {
    const r = ghRepoInput.value.trim();
    const t = ghTokenInput.value.trim();
    localStorage.setItem('esperometro_gh_repo', r);
    localStorage.setItem('esperometro_gh_token', t);
    alert('Configuración guardada. La app actualizará tiempo_acumulado.json y top10_esperas.json en GitHub.');
    sincronizarConGitHubAPI(r, t);
    modalSync.classList.add('hidden');
  });
}

// Iniciar cronómetro de espera
function iniciarCronometro() {
  if (appState.cronometroActivo) return;

  appState.cronometroActivo = true;
  appState.timestampInicio = Date.now();
  localStorage.setItem('esperometro_timer_start', String(appState.timestampInicio));

  // Cambiar estado visual de botones y banner
  elBtnStart.classList.add('running-mode');
  elBtnStop.classList.remove('disabled');
  elBtnStop.disabled = false;

  elStatusPill.className = 'status-pill active';
  elStatusPill.innerHTML = '<span class="dot"></span> ⏱️ ESPERA EN CURSO HASTA QUE CAMILA ESTÉ LISTA';

  elActiveBanner.classList.remove('hidden');

  let indexFrase = 0;
  actualizarTimerEnVivo();

  appState.intervaloTimer = setInterval(() => {
    actualizarTimerEnVivo();
    // Cambiar frase graciosa cada 12 segundos
    const transcurridos = Math.floor((Date.now() - appState.timestampInicio) / 1000);
    if (transcurridos % 12 === 0) {
      indexFrase = (indexFrase + 1) % FRASES_ESPERA.length;
      elLiveSubtext.textContent = FRASES_ESPERA[indexFrase];
    }
  }, 1000);
}

// Si la página se refrescó a mitad de espera, recuperar el timer en curso
function recuperarCronometroEnCurso() {
  const tsGuardo = localStorage.getItem('esperometro_timer_start');
  if (tsGuardo) {
    const ts = parseInt(tsGuardo, 10);
    if (!isNaN(ts) && ts > 0) {
      appState.timestampInicio = ts;
      appState.cronometroActivo = false;
      iniciarCronometro();
    }
  }
}

// Actualizar reloj digital en vivo
function actualizarTimerEnVivo() {
  if (!appState.timestampInicio) return;
  const transcurridosSec = Math.floor((Date.now() - appState.timestampInicio) / 1000);

  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(transcurridosSec / 3600);
  const m = Math.floor((transcurridosSec % 3600) / 60);
  const s = transcurridosSec % 60;

  elLiveStopwatch.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Detener cronómetro de espera
function detenerCronometro() {
  if (!appState.cronometroActivo || !appState.timestampInicio) return;

  const finTimestamp = Date.now();
  const duracionSegundos = Math.max(1, Math.floor((finTimestamp - appState.timestampInicio) / 1000));

  // Limpiar timer
  clearInterval(appState.intervaloTimer);
  appState.cronometroActivo = false;
  appState.timestampInicio = null;
  localStorage.removeItem('esperometro_timer_start');

  // Restaurar estado visual
  elBtnStart.classList.remove('running-mode');
  elBtnStop.classList.add('disabled');
  elBtnStop.disabled = true;

  elStatusPill.className = 'status-pill idle';
  elStatusPill.innerHTML = '<span class="dot"></span> En espera de la próxima salida';
  elActiveBanner.classList.add('hidden');

  // SUMAR AL TIEMPO TOTAL ACUMULADO HISTÓRICO
  appState.tiempoAcumulado.total_segundos += duracionSegundos;
  appState.tiempoAcumulado.total_esperas_registradas = (appState.tiempoAcumulado.total_esperas_registradas || 0) + 1;
  appState.tiempoAcumulado.ultima_actualizacion = new Date().toISOString();

  descomponerSegundos(appState.tiempoAcumulado.total_segundos);
  renderizarPantalla();
  guardarDatosPersistentes();

  // VERIFICAR SI ESTA ESPERA ENTRA EN EL TOP 10
  evaluarEntradaTop10(duracionSegundos);
}

// Comprobar si la espera entra en el Top 10 más largas
function evaluarEntradaTop10(duracionSegundos) {
  const topActual = appState.top10 || [];
  let entraEnTop10 = false;

  if (topActual.length < 10) {
    entraEnTop10 = true;
  } else {
    // Si hay 10 elementos, comparar contra la más corta del top 10
    const duracionMinima = Math.min(...topActual.map(x => x.duracion_segundos));
    if (duracionSegundos > duracionMinima) {
      entraEnTop10 = true;
    }
  }

  if (entraEnTop10) {
    appState.pendingWaitDuration = duracionSegundos;
    appState.pendingWaitStart = new Date();

    modalDurationHighlight.textContent = formatearDuracion(duracionSegundos);
    inputActivity.value = '';
    document.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('selected'));
    modalTop10.classList.remove('hidden');
  } else {
    alert(`✅ Espera de ${formatearDuracion(duracionSegundos)} sumada al total histórico acumulado.`);
  }
}

// Guardar entrada en Top 10 con la descripción ingresada por Papá
function finalizarRegistroTop10(descripcion) {
  const duracionSec = appState.pendingWaitDuration;
  const fechaObj = appState.pendingWaitStart || new Date();

  const fechaStr = fechaObj.toISOString().split('T')[0];
  const horaStr = fechaObj.toTimeString().slice(0, 5);

  const nuevaEspera = {
    posicion: 0,
    duracion_segundos: duracionSec,
    duracion_formateada: formatearDuracion(duracionSec),
    fecha: fechaStr,
    hora: horaStr,
    descripcion: descripcion || "Camila alistándose con super poderes"
  };

  appState.top10.push(nuevaEspera);

  // Ordenar descendente y conservar sólo el Top 10
  appState.top10.sort((a, b) => b.duracion_segundos - a.duracion_segundos);
  appState.top10 = appState.top10.slice(0, 10);

  // Re-asignar posiciones 1 a 10
  appState.top10.forEach((item, idx) => {
    item.posicion = idx + 1;
  });

  guardarDatosPersistentes();
  renderizarTop10();
  modalTop10.classList.add('hidden');
}

// Descargar tiempo_acumulado.json y top10_esperas.json al dispositivo
function descargarArchivosJSON() {
  descargarJSON(appState.tiempoAcumulado, 'tiempo_acumulado.json');
  setTimeout(() => {
    descargarJSON(appState.top10, 'top10_esperas.json');
  }, 400);
}

function descargarJSON(obj, filename) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
  const link = document.createElement('a');
  link.setAttribute("href", dataStr);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Importar archivo JSON manual
function importarArchivoJSON(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        appState.top10 = parsed;
        alert('✅ Archivo top10_esperas.json cargado correctamente.');
      } else if (parsed && typeof parsed.total_segundos === 'number') {
        appState.tiempoAcumulado = parsed;
        descomponerSegundos(parsed.total_segundos);
        alert('✅ Archivo tiempo_acumulado.json cargado correctamente.');
      }
      renderizarPantalla();
      guardarDatosPersistentes();
    } catch (err) {
      alert('Error al leer el archivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Sincronizar directamente con GitHub REST API si el usuario ingresó un Token PAT
async function sincronizarConGitHubAPI(repo, token) {
  const apiBase = `https://api.github.com/repos/${repo}/contents`;

  async function actualizarArchivo(path, nuevoContenidoObj) {
    try {
      const getUrl = `${apiBase}/${path}`;
      const getResp = await fetch(getUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let sha = '';
      if (getResp.ok) {
        const fileInfo = await getResp.json();
        sha = fileInfo.sha;
      }

      const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(nuevoContenidoObj, null, 2))));

      const putBody = {
        message: `Actualización automática de ${path} en Esperómetro de Cami`,
        content: contentB64
      };
      if (sha) putBody.sha = sha;

      await fetch(getUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });
    } catch (err) {
      console.warn(`GitHub API push para ${path} falló:`, err);
    }
  }

  await actualizarArchivo('tiempo_acumulado.json', appState.tiempoAcumulado);
  await actualizarArchivo('top10_esperas.json', appState.top10);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
