/**
 * TALLER PRO — FRONTEND OPERATIVO (FASE 3)
 * Gestión de Roles, JWT Token, Consultas, Vehículos, Personas,
 * Buscador API Speero + Ingreso Manual (URL/Base64), Inventario, Despachos y Kardex/Facturación.
 */

// URL del contenedor Backend en Render
const DEFAULT_API_BASE_URL = "https://taller-mecanica.onrender.com";

const state = {
    apiBaseUrl: DEFAULT_API_BASE_URL.replace(/\/+$/, ""),
    token: localStorage.getItem("tp_token") || null,
    user: null,
    activeModule: null,
    roles: [],
    estados: [],
    personas: [],
    mecanicos: [],
    vehiculos: [],
    consultas: [],
    productos: [],
    inventario: [],
    solicitudes: [],
    facturas: [],
    kardex: [],
    usuarios: [],
};

// Matriz estricta de permisos de módulos según rol
const ROLE_MODULES = {
    Administrador: [
        { id: "consultas", label: "Consultas y Diagnóstico" },
        { id: "vehiculos", label: "Vehículos" },
        { id: "personas", label: "Personas" },
        { id: "productos", label: "Productos (API / Manual)" },
        { id: "inventario", label: "Inventario y Despachos" },
        { id: "facturacion", label: "Facturación y Kardex" },
        { id: "usuarios", label: "Usuarios y Roles" },
    ],
    Mecanico: [
        { id: "consultas", label: "Consultas y Diagnóstico" },
        { id: "vehiculos", label: "Vehículos" },
        { id: "productos", label: "Productos y Solicitudes" },
    ],
    Recepcionista: [
        { id: "facturacion", label: "Facturación y Kardex" },
        { id: "personas", label: "Personas" },
        { id: "consultas", label: "Consultas" },
        { id: "vehiculos", label: "Vehículos" },
    ],
    Bodeguero: [
        { id: "productos", label: "Productos (API / Compra)" },
        { id: "inventario", label: "Inventario y Despachos" },
    ],
};

// =============================================================================
// UTILIDADES DE INTERFAZ Y RED
// =============================================================================
function notify(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button type="button" class="btn btn-sm" style="padding:2px 6px;">×</button>
    `;
    el.querySelector("button").addEventListener("click", () => el.remove());
    stack.appendChild(el);
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 4200);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatMoney(val) {
    const num = Number(val || 0);
    return `Q${num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dtStr) {
    if (!dtStr) return "—";
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    return d.toLocaleString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getStatusBadge(nombreEstado) {
    const lower = (nombreEstado || "").toLowerCase();
    if (["activo", "finalizado", "despachado"].includes(lower)) {
        return `<span class="badge badge-ok">${escapeHtml(nombreEstado)}</span>`;
    }
    if (["pendiente", "en diagnostico", "en reparacion"].includes(lower)) {
        return `<span class="badge badge-warn">${escapeHtml(nombreEstado)}</span>`;
    }
    if (["inactivo", "rechazado"].includes(lower)) {
        return `<span class="badge badge-danger">${escapeHtml(nombreEstado)}</span>`;
    }
    return `<span class="badge badge-info">${escapeHtml(nombreEstado)}</span>`;
}

function renderSkeletonRows(tbodyId, cols = 5, rows = 3) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    let html = "";
    for (let r = 0; r < rows; r++) {
        html += "<tr>";
        for (let c = 0; c < cols; c++) {
            html += `<td><div class="skeleton-line" style="width:${60 + ((r + c) % 3) * 15}%"></div></td>`;
        }
        html += "</tr>";
    }
    tbody.innerHTML = html;
}

function renderEmptyRow(tbodyId, cols, title, desc) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="${cols}">
                <div class="empty-state">
                    <div class="empty-state-title">${escapeHtml(title)}</div>
                    <div class="empty-state-desc">${escapeHtml(desc)}</div>
                </div>
            </td>
        </tr>
    `;
}

async function apiFetch(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };
    if (state.token) {
        headers["Authorization"] = `Bearer ${state.token}`;
    }

    const baseUrl = (state.apiBaseUrl || "").replace(/\/+$/, "");
    const fullUrl = path.startsWith("http") ? path : `${baseUrl}${path}`;

    const response = await fetch(fullUrl, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        clearSession();
        throw new Error("Sesión expirada o no autorizada.");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Error en la operación solicitada.");
    }
    return data;
}

// =============================================================================
// GESTIÓN DE SESIÓN Y NAVEGACIÓN POR ROL
// =============================================================================
function clearSession() {
    state.token = null;
    state.user = null;
    localStorage.removeItem("tp_token");
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
}

async function initSession() {
    if (!state.token) {
        clearSession();
        return;
    }
    try {
        const me = await apiFetch("/api/auth/me");
        state.user = me;
        await enterWorkspace();
    } catch (err) {
        clearSession();
    }
}

async function enterWorkspace() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");

    document.getElementById("current-user-name").textContent = state.user.persona_nombre || state.user.alias;
    document.getElementById("current-user-role").textContent = state.user.rol_nombre.toUpperCase();

    // Cargar catálogos base (roles y estados)
    const [roles, estados] = await Promise.all([
        apiFetch("/api/roles").catch(() => []),
        apiFetch("/api/estados").catch(() => []),
    ]);
    state.roles = roles;
    state.estados = estados;

    buildSidebarByRole();
    adjustUIByRole();
    await refreshKPIs();

    const allowed = ROLE_MODULES[state.user.rol_nombre] || ROLE_MODULES.Mecanico;
    if (allowed.length > 0) {
        await switchModule(allowed[0].id);
    }
}

function buildSidebarByRole() {
    const navList = document.getElementById("nav-list");
    const allowed = ROLE_MODULES[state.user.rol_nombre] || [];
    navList.innerHTML = allowed
        .map(
            (mod) => `
            <li>
                <button type="button" class="nav-item" data-module="${mod.id}">
                    <span class="nav-item-left">
                        <span class="nav-indicator"></span>
                        <span>${escapeHtml(mod.label)}</span>
                    </span>
                </button>
            </li>
        `
        )
        .join("");

    navList.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => switchModule(btn.dataset.module));
    });
}

function adjustUIByRole() {
    const rol = (state.user.rol_nombre || "").toLowerCase();

    // Mecánico: puede ver vehículos pero no crear/editar propietarios; puede ver productos y solicitarlos a bodega
    const panelFormVehiculo = document.getElementById("panel-form-vehiculo");
    if (panelFormVehiculo) {
        if (rol === "mecanico") {
            panelFormVehiculo.classList.add("hidden");
        } else {
            panelFormVehiculo.classList.remove("hidden");
        }
    }

    // En módulo Productos: Bodeguero y Admin ven buscador API Speero y compra; Mecánico ve catálogo y solicitud desde consultas
    const panelSpeero = document.getElementById("panel-speero-api");
    const panelCompra = document.getElementById("panel-compra-bodega");
    if (rol === "mecanico") {
        panelSpeero.classList.add("hidden");
        panelCompra.classList.add("hidden");
    } else {
        panelSpeero.classList.remove("hidden");
        panelCompra.classList.remove("hidden");
    }

    // En módulo Consultas: Recepcionista registra consultas pero solicitud de repuestos es para Mecánico / Admin
    const panelSolRepuesto = document.getElementById("panel-solicitar-repuesto");
    if (rol === "recepcionista") {
        panelSolRepuesto.classList.add("hidden");
    } else {
        panelSolRepuesto.classList.remove("hidden");
    }
}

async function refreshKPIs() {
    try {
        const res = await apiFetch("/api/dashboard/resumen");
        document.getElementById("kpi-consultas").textContent = res.consultas_activas;
        document.getElementById("kpi-solicitudes").textContent = res.solicitudes_pendientes;
        document.getElementById("kpi-stock").textContent = res.unidades_inventario;
        document.getElementById("kpi-facturado").textContent = formatMoney(res.total_facturado);
        document.getElementById("db-engine-badge").textContent = res.motor_bd.includes("PostgreSQL") ? "POSTGRES" : "SQLITE";
    } catch (_) {
        // Silencioso
    }
}

async function switchModule(moduleId) {
    state.activeModule = moduleId;
    document.querySelectorAll(".module-view").forEach((sec) => sec.classList.add("hidden"));
    const target = document.getElementById(`view-${moduleId}`);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.module === moduleId);
    });

    const allowed = ROLE_MODULES[state.user.rol_nombre] || [];
    const found = allowed.find((m) => m.id === moduleId);
    document.getElementById("active-module-title").textContent = found ? found.label : moduleId;

    await refreshKPIs();

    if (moduleId === "consultas") {
        await loadConsultasModule();
    } else if (moduleId === "vehiculos") {
        await loadVehiculosModule();
    } else if (moduleId === "personas") {
        await loadPersonasModule();
    } else if (moduleId === "productos") {
        await loadProductosModule();
    } else if (moduleId === "inventario") {
        await loadInventarioModule();
    } else if (moduleId === "facturacion") {
        await loadFacturacionModule();
    } else if (moduleId === "usuarios") {
        await loadUsuariosModule();
    }
}

// =============================================================================
// MÓDULO 1: CONSULTAS Y SOLICITUDES DE REPUESTOS
// =============================================================================
async function loadConsultasModule() {
    renderSkeletonRows("tbody-consultas", 7, 3);
    renderSkeletonRows("tbody-solicitudes-consulta", 7, 2);

    const rol = (state.user.rol_nombre || "").toLowerCase();
    const promises = [
        apiFetch("/api/consultas"),
        apiFetch("/api/vehiculos"),
        apiFetch("/api/usuarios/mecanicos"),
    ];

    if (rol === "administrador" || rol === "mecanico") {
        promises.push(apiFetch("/api/productos"));
        promises.push(apiFetch("/api/solicitudes"));
    }

    const [consultas, vehiculos, mecanicos, productos = [], solicitudes = []] = await Promise.all(promises);
    state.consultas = consultas;
    state.vehiculos = vehiculos;
    state.mecanicos = mecanicos;
    state.productos = productos;
    state.solicitudes = solicitudes;

    // Poblar selects de formulario de consulta
    const selVehiculo = document.getElementById("consulta-vehiculo");
    selVehiculo.innerHTML = vehiculos.length
        ? vehiculos
              .map(
                  (v) =>
                      `<option value="${v.id_vehiculo}">${escapeHtml(v.placa)} — VIN: ${escapeHtml(v.vin)} (${escapeHtml(
                          v.propietario_nombre
                      )})</option>`
              )
              .join("")
        : `<option value="">Sin vehículos registrados</option>`;

    const selMecanico = document.getElementById("consulta-mecanico");
    selMecanico.innerHTML = mecanicos
        .map((m) => `<option value="${m.id_usuario}">${escapeHtml(m.persona_nombre)} (@${escapeHtml(m.alias)})</option>`)
        .join("");

    // Estados aplicables a consultas
    const estadosConsulta = state.estados.filter((e) =>
        ["pendiente", "en diagnostico", "en reparacion", "finalizado"].includes(e.nombre.toLowerCase())
    );
    const selEstado = document.getElementById("consulta-estado");
    selEstado.innerHTML = estadosConsulta
        .map((e) => `<option value="${e.id_estado}">${escapeHtml(e.nombre)}</option>`)
        .join("");

    // Poblar selects de solicitud de repuestos a bodega
    const consultasActivas = consultas.filter((c) => c.estado_nombre.toLowerCase() !== "finalizado");
    const selSolConsulta = document.getElementById("sol-consulta");
    selSolConsulta.innerHTML = consultasActivas.length
        ? consultasActivas
              .map(
                  (c) =>
                      `<option value="${c.id_consulta}">Consulta #${c.id_consulta} — ${escapeHtml(
                          c.vehiculo_placa
                      )} (${escapeHtml(c.propietario_nombre)})</option>`
              )
              .join("")
        : `<option value="">No hay consultas activas</option>`;

    const selSolProducto = document.getElementById("sol-producto");
    selSolProducto.innerHTML = productos.length
        ? productos
              .map(
                  (p) =>
                      `<option value="${p.id_producto}" ${p.stock_total <= 0 ? "disabled" : ""}>${escapeHtml(
                          p.nombre
                      )} — Stock: ${p.stock_total} | ${formatMoney(p.precio_venta_actual)}</option>`
              )
              .join("")
        : `<option value="">Sin productos en catálogo</option>`;

    renderConsultasTable();
    renderSolicitudesConsultaTable();
}

function renderConsultasTable() {
    if (!state.consultas.length) {
        renderEmptyRow("tbody-consultas", 7, "Sin consultas registradas", "Utiliza el panel izquierdo para ingresar un vehículo a diagnóstico.");
        return;
    }

    const tbody = document.getElementById("tbody-consultas");
    tbody.innerHTML = state.consultas
        .map(
            (c) => `
            <tr>
                <td class="mono">#${c.id_consulta}</td>
                <td>
                    <div style="font-weight:600;" class="mono">${escapeHtml(c.vehiculo_placa)}</div>
                    <div style="font-size:11.5px; color:var(--text-secondary);">${escapeHtml(c.propietario_nombre)}</div>
                </td>
                <td>
                    <div>${escapeHtml(c.mecanico_nombre)}</div>
                    <div class="mono" style="font-size:11px; color:var(--text-muted);">@${escapeHtml(c.mecanico_alias)}</div>
                </td>
                <td>${getStatusBadge(c.estado_nombre)}</td>
                <td style="max-width:290px;">
                    <div style="font-weight:500;">${escapeHtml(c.detalle_consulta)}</div>
                    <div style="font-size:11.5px; color:var(--text-secondary); margin-top:3px;">
                        <strong>Diag:</strong> ${escapeHtml(c.detalle_diagnostico || "Pendiente de diagnóstico")}
                    </div>
                </td>
                <td class="mono" style="font-size:11px;">
                    <div>Ing: ${formatDate(c.fecha_ingreso)}</div>
                    <div style="color:var(--text-muted);">Sal: ${formatDate(c.fecha_salida)}</div>
                </td>
                <td>
                    <button type="button" class="btn btn-sm" onclick="editConsulta(${c.id_consulta})">
                        Diagnosticar / Editar
                    </button>
                </td>
            </tr>
        `
        )
        .join("");
}

function renderSolicitudesConsultaTable() {
    const tbody = document.getElementById("tbody-solicitudes-consulta");
    if (!state.solicitudes || !state.solicitudes.length) {
        renderEmptyRow(
            "tbody-solicitudes-consulta",
            7,
            "Sin solicitudes de repuestos",
            "Cuando el mecánico solicite repuestos para una consulta, aparecerán aquí con su estado de despacho."
        );
        return;
    }

    tbody.innerHTML = state.solicitudes
        .map(
            (s) => `
            <tr>
                <td class="mono">#${s.id_solicitud}</td>
                <td>
                    <span class="mono">#${s.id_consulta}</span> — <strong class="mono">${escapeHtml(s.vehiculo_placa)}</strong>
                </td>
                <td>${escapeHtml(s.producto_nombre)}</td>
                <td class="mono">${s.cantidad}</td>
                <td class="mono">${formatMoney(s.sub_total_estimado)}</td>
                <td>${getStatusBadge(s.estado_nombre)}</td>
                <td class="mono" style="font-size:11px;">${formatDate(s.fecha_solicitud)}</td>
            </tr>
        `
        )
        .join("");
}

window.editConsulta = function (idConsulta) {
    const c = state.consultas.find((item) => item.id_consulta === idConsulta);
    if (!c) return;
    document.getElementById("consulta-id-edit").value = c.id_consulta;
    document.getElementById("consulta-vehiculo").value = c.id_vehiculo;
    document.getElementById("consulta-mecanico").value = c.id_usuario;
    document.getElementById("consulta-estado").value = c.id_estado;
    document.getElementById("consulta-detalle").value = c.detalle_consulta;
    document.getElementById("consulta-diagnostico").value = c.detalle_diagnostico || "";

    const btnFin = document.getElementById("btn-finalizar-consulta");
    if (c.estado_nombre.toLowerCase() !== "finalizado") {
        btnFin.classList.remove("hidden");
    } else {
        btnFin.classList.add("hidden");
    }
    notify(`Editando consulta #${c.id_consulta} (${c.vehiculo_placa})`, "info");
};

function resetFormConsulta() {
    document.getElementById("form-consulta").reset();
    document.getElementById("consulta-id-edit").value = "";
    document.getElementById("btn-finalizar-consulta").classList.add("hidden");
}

// =============================================================================
// MÓDULO 2: VEHÍCULOS
// =============================================================================
async function loadVehiculosModule(query = "") {
    renderSkeletonRows("tbody-vehiculos", 6, 3);
    const url = query ? `/api/vehiculos?q=${encodeURIComponent(query)}` : "/api/vehiculos";
    const [vehiculos, personas] = await Promise.all([
        apiFetch(url),
        apiFetch("/api/personas").catch(() => []),
    ]);
    state.vehiculos = vehiculos;
    state.personas = personas;

    const selPersona = document.getElementById("vehiculo-persona");
    if (selPersona) {
        selPersona.innerHTML = personas
            .map((p) => `<option value="${p.id_persona}">${escapeHtml(p.nombre)} — NIT: ${escapeHtml(p.nit)}</option>`)
            .join("");
    }

    if (!vehiculos.length) {
        renderEmptyRow("tbody-vehiculos", 6, "Sin vehículos encontrados", "No existen vehículos que coincidan con el criterio actual.");
        return;
    }

    const canEdit = (state.user.rol_nombre || "").toLowerCase() !== "mecanico";
    const tbody = document.getElementById("tbody-vehiculos");
    tbody.innerHTML = vehiculos
        .map(
            (v) => `
            <tr>
                <td class="mono">#${v.id_vehiculo}</td>
                <td class="mono" style="font-weight:600;">${escapeHtml(v.placa)}</td>
                <td class="mono" style="color:var(--text-secondary);">${escapeHtml(v.vin)}</td>
                <td>${escapeHtml(v.propietario_nombre)}</td>
                <td class="mono">${escapeHtml(v.propietario_nit)}</td>
                <td>
                    ${
                        canEdit
                            ? `<button type="button" class="btn btn-sm" onclick="editVehiculo(${v.id_vehiculo})">Editar</button>`
                            : `<span class="badge">Solo Lectura</span>`
                    }
                </td>
            </tr>
        `
        )
        .join("");
}

window.editVehiculo = function (idVehiculo) {
    const v = state.vehiculos.find((x) => x.id_vehiculo === idVehiculo);
    if (!v) return;
    document.getElementById("vehiculo-id-edit").value = v.id_vehiculo;
    document.getElementById("vehiculo-persona").value = v.id_persona;
    document.getElementById("vehiculo-placa").value = v.placa;
    document.getElementById("vehiculo-vin").value = v.vin;
    notify(`Editando vehículo ${v.placa}`, "info");
};

// =============================================================================
// MÓDULO 3: PERSONAS
// =============================================================================
async function loadPersonasModule(query = "") {
    renderSkeletonRows("tbody-personas", 7, 4);
    const url = query ? `/api/personas?q=${encodeURIComponent(query)}` : "/api/personas";
    const personas = await apiFetch(url);
    state.personas = personas;

    if (!personas.length) {
        renderEmptyRow("tbody-personas", 7, "Sin personas registradas", "Registra clientes o personal en el formulario lateral.");
        return;
    }

    const tbody = document.getElementById("tbody-personas");
    tbody.innerHTML = personas
        .map(
            (p) => `
            <tr>
                <td class="mono">#${p.id_persona}</td>
                <td style="font-weight:500;">${escapeHtml(p.nombre)}</td>
                <td class="mono">${escapeHtml(p.nit)}</td>
                <td class="mono">${escapeHtml(p.telefono || "—")}</td>
                <td>${escapeHtml(p.email || "—")}</td>
                <td class="mono">${p.edad || "—"} / ${escapeHtml(p.sexo || "—")}</td>
                <td>
                    <button type="button" class="btn btn-sm" onclick="editPersona(${p.id_persona})">Editar</button>
                </td>
            </tr>
        `
        )
        .join("");
}

window.editPersona = function (idPersona) {
    const p = state.personas.find((x) => x.id_persona === idPersona);
    if (!p) return;
    document.getElementById("persona-id-edit").value = p.id_persona;
    document.getElementById("persona-nombre").value = p.nombre;
    document.getElementById("persona-nit").value = p.nit;
    document.getElementById("persona-telefono").value = p.telefono || "";
    document.getElementById("persona-email").value = p.email || "";
    document.getElementById("persona-edad").value = p.edad || "";
    document.getElementById("persona-sexo").value = p.sexo || "";
    notify(`Editando ficha de ${p.nombre}`, "info");
};

// =============================================================================
// MÓDULO 4: PRODUCTOS, API SPEERO E INGRESO MANUAL (URL / BASE64)
// =============================================================================
async function loadProductosModule(query = "") {
    renderSkeletonRows("tbody-productos", 6, 4);
    const url = query ? `/api/productos?q=${encodeURIComponent(query)}` : "/api/productos";
    const productos = await apiFetch(url);
    state.productos = productos;

    if (!productos.length) {
        renderEmptyRow("tbody-productos", 6, "Catálogo vacío", "Busca repuestos en la API Speero o regístralos manualmente para abastecer bodega.");
        return;
    }

    const rol = (state.user.rol_nombre || "").toLowerCase();
    const fallbackSvg = "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
    );

    const tbody = document.getElementById("tbody-productos");
    tbody.innerHTML = productos
        .map((p) => {
            const imgSrc = p.url_imagen && p.url_imagen.trim() ? p.url_imagen : fallbackSvg;
            const stockClass = p.stock_total > 0 ? "badge-ok" : "badge-danger";
            return `
            <tr>
                <td class="mono">#${p.id_producto}</td>
                <td>
                    <div class="thumb-cell">
                        <img
                            src="${escapeHtml(imgSrc)}"
                            alt="img"
                            class="product-thumb"
                            data-zoom-src="${escapeHtml(imgSrc)}"
                            data-zoom-caption="${escapeHtml(p.nombre)}"
                            onerror="this.src='${fallbackSvg}'"
                        />
                        <div>
                            <div style="font-weight:500;">${escapeHtml(p.nombre)}</div>
                            <div class="mono" style="font-size:10.5px; color:var(--text-muted);">
                                ${p.url_imagen && p.url_imagen.startsWith("data:image") ? "Imagen Base64" : "Imagen URL"}
                            </div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${stockClass}">${p.stock_total} uds</span></td>
                <td class="mono">${formatMoney(p.ultimo_costo_compra)}</td>
                <td class="mono" style="font-weight:600; color:var(--status-ok);">${formatMoney(p.precio_venta_actual)}</td>
                <td>
                    ${
                        rol === "mecanico"
                            ? `<button type="button" class="btn btn-sm btn-primary" onclick="irASolicitarProducto(${p.id_producto})">Solicitar a Bodega</button>`
                            : `<button type="button" class="btn btn-sm" onclick="prellenarRecompra(${p.id_producto})">Reabastecer</button>`
                    }
                </td>
            </tr>
        `;
        })
        .join("");
}

window.prellenarRecompra = function (idProducto) {
    const p = state.productos.find((x) => x.id_producto === idProducto);
    if (!p) return;
    document.getElementById("compra-id-producto").value = p.id_producto;
    document.getElementById("compra-nombre").value = p.nombre;
    document.getElementById("compra-url-imagen").value = p.url_imagen || "";
    document.getElementById("compra-costo").value = p.ultimo_costo_compra || 100;
    updateCostoVentaPreview();
    updateImagePreview(p.url_imagen || "");
    notify(`Producto #${p.id_producto} cargado para nueva compra de inventario.`, "info");
};

window.irASolicitarProducto = async function (idProducto) {
    await switchModule("consultas");
    const selProd = document.getElementById("sol-producto");
    if (selProd) selProd.value = idProducto;
    document.getElementById("sol-cantidad").focus();
    notify("Selecciona la consulta activa y confirma la cantidad a solicitar al bodeguero.", "info");
};

window.cambiarPaginaSpeero = function (targetPage) {
    consultarSpeeroAPI(targetPage);
};

async function consultarSpeeroAPI(page = 1) {
    const currentPage = typeof page === "number" && page >= 1 ? page : 1;
    const q = document.getElementById("speero-query").value.trim();
    if (!q) {
        notify("Ingresa el término de búsqueda para Speero API (ej. brake, filter).", "error");
        return;
    }

    const badge = document.getElementById("speero-status-badge");
    const container = document.getElementById("speero-results-container");
    const notice = document.getElementById("speero-notice");
    const tbody = document.getElementById("tbody-speero");
    const paginationEl = document.getElementById("speero-pagination");

    badge.textContent = `Consultando Pág. ${currentPage}...`;
    badge.className = "badge badge-warn";
    container.classList.remove("hidden");
    renderSkeletonRows("tbody-speero", 5, 3);

    const fallbackSvg = "data:image/svg+xml;utf8," + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
    );

    try {
        const res = await apiFetch(
            `/api/productos/buscar-externo?q=${encodeURIComponent(q)}&page=${currentPage}&locale=en`
        );
        const items = res.results || res.resultados || [];
        const totalItems = Number(res.total || items.length);
        const perPage = Number(res.perPage || 20);
        const activePage = Number(res.page || currentPage);
        const totalPages = Number(res.totalPages || Math.max(1, Math.ceil(totalItems / perPage)));

        if (res.api_online && items.length > 0) {
            badge.textContent = `Speero API: ${totalItems} encontrados (Pág. ${activePage}/${totalPages})`;
            badge.className = "badge badge-ok";
            notice.className = "notice-banner";
            notice.textContent =
                res.mensaje ||
                `Mostrando ${items.length} de ${totalItems} resultados para "${res.query || q}" (Página ${activePage} de ${totalPages}).`;
            notice.classList.remove("hidden");

            tbody.innerHTML = items
                .map((item) => {
                    const oemCode = item.oem || item.sku || "S/N";
                    const gradeText = (item.grade || "aftermarket").toUpperCase();
                    const gradeBadgeClass = gradeText === "OEM" ? "badge-info" : "";
                    const inStock = item.inStock !== false;
                    const imgUrl = item.image || item.url_imagen || fallbackSvg;
                    const priceAmount =
                        item.price && typeof item.price === "object"
                            ? item.price.amount
                            : item.precio_sugerido || 0;
                    const priceCurrency =
                        item.price && typeof item.price === "object"
                            ? item.price.currency || "SAR"
                            : item.moneda || "SAR";
                    const displayName = item.name || item.nombre || oemCode;

                    const safeItemJson = JSON.stringify({
                        oem: oemCode,
                        name: displayName,
                        nombre: `${displayName} [OEM: ${oemCode}]`,
                        image: item.image || item.url_imagen || "",
                        url: item.url || "",
                        grade: item.grade || "aftermarket",
                        amount: Number(priceAmount) || 0,
                        currency: priceCurrency,
                    }).replace(/'/g, "&#39;");

                    return `
                    <tr>
                        <td>
                            <div class="mono" style="font-weight:600;">${escapeHtml(oemCode)}</div>
                            <span class="badge ${gradeBadgeClass}" style="margin-top:3px; font-size:10px;">${escapeHtml(gradeText)}</span>
                        </td>
                        <td>
                            <div class="thumb-cell">
                                <img
                                    src="${escapeHtml(imgUrl)}"
                                    alt="OEM ${escapeHtml(oemCode)}"
                                    class="product-thumb"
                                    data-zoom-src="${escapeHtml(imgUrl)}"
                                    data-zoom-caption="${escapeHtml(displayName)} — OEM: ${escapeHtml(oemCode)}"
                                    onerror="this.src='${fallbackSvg}'"
                                />
                                <div>
                                    <div style="font-weight:500;">${escapeHtml(displayName)}</div>
                                    ${
                                        item.url
                                            ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="mono" style="font-size:11px; color:var(--accent); text-decoration:none;">Ver ficha en Speero ↗</a>`
                                            : `<span class="mono" style="font-size:11px; color:var(--text-muted);">OEM: ${escapeHtml(oemCode)}</span>`
                                    }
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="badge ${inStock ? "badge-ok" : "badge-danger"}">
                                ${inStock ? "En Stock" : "Sin Stock"}
                            </span>
                        </td>
                        <td class="mono" style="font-weight:600;">
                            ${Number(priceAmount).toFixed(2)} ${escapeHtml(priceCurrency)}
                        </td>
                        <td>
                            <button type="button" class="btn btn-sm btn-primary" onclick='seleccionarItemSpeero(${safeItemJson})'>
                                Seleccionar para Comprar
                            </button>
                        </td>
                    </tr>
                `;
                })
                .join("");

            renderSpeeroPagination(activePage, totalPages, totalItems, perPage);
        } else {
            badge.textContent = "Modo Ingreso Manual Activo";
            badge.className = "badge badge-warn";
            notice.className = "notice-banner warn";
            notice.textContent = res.mensaje;
            notice.classList.remove("hidden");
            if (paginationEl) paginationEl.classList.add("hidden");

            renderEmptyRow(
                "tbody-speero",
                5,
                "API externa sin respuesta o sin coincidencias",
                "Se ha prellenado el nombre buscado en el formulario inferior para que ingreses manualmente los datos y su imagen (URL o Base64)."
            );

            document.getElementById("compra-id-producto").value = "";
            document.getElementById("compra-nombre").value = q;
            document.getElementById("compra-costo").focus();
        }
    } catch (err) {
        badge.textContent = "Error de Conexión";
        badge.className = "badge badge-danger";
        if (paginationEl) paginationEl.classList.add("hidden");
        notify(err.message, "error");
    }
}

function renderSpeeroPagination(activePage, totalPages, totalItems, perPage) {
    const paginationEl = document.getElementById("speero-pagination");
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.classList.add("hidden");
        return;
    }

    const startItem = (activePage - 1) * perPage + 1;
    const endItem = Math.min(totalItems, activePage * perPage);

    // Calcular ventana de páginas (ej. 5 páginas visibles alrededor de la actual)
    const maxButtons = 5;
    let startPage = Math.max(1, activePage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    let pageButtonsHtml = `
        <button type="button" class="page-btn" ${activePage <= 1 ? "disabled" : ""} onclick="cambiarPaginaSpeero(1)" title="Primera página">«</button>
        <button type="button" class="page-btn" ${activePage <= 1 ? "disabled" : ""} onclick="cambiarPaginaSpeero(${activePage - 1})" title="Página anterior">‹ Ant</button>
    `;

    for (let p = startPage; p <= endPage; p++) {
        pageButtonsHtml += `
            <button type="button" class="page-btn ${p === activePage ? "active" : ""}" onclick="cambiarPaginaSpeero(${p})">
                ${p}
            </button>
        `;
    }

    pageButtonsHtml += `
        <button type="button" class="page-btn" ${activePage >= totalPages ? "disabled" : ""} onclick="cambiarPaginaSpeero(${activePage + 1})" title="Página siguiente">Sig ›</button>
        <button type="button" class="page-btn" ${activePage >= totalPages ? "disabled" : ""} onclick="cambiarPaginaSpeero(${totalPages})" title="Última página">»</button>
    `;

    paginationEl.innerHTML = `
        <div class="pagination-info">
            Mostrando artículos <strong class="mono">${startItem}–${endItem}</strong> de <strong class="mono">${totalItems}</strong>
            (Página <strong class="mono">${activePage}</strong> de <strong class="mono">${totalPages}</strong>)
        </div>
        <div class="pagination-controls">
            ${pageButtonsHtml}
        </div>
    `;
    paginationEl.classList.remove("hidden");
}

window.seleccionarItemSpeero = function (item) {
    document.getElementById("compra-id-producto").value = "";
    document.getElementById("compra-nombre").value = item.nombre || `${item.name} [OEM: ${item.oem}]`;
    document.getElementById("compra-url-imagen").value = item.image || item.url_imagen || "";
    document.getElementById("compra-costo").value = item.amount || item.precio_sugerido || 100;
    updateCostoVentaPreview();
    updateImagePreview(item.image || item.url_imagen || "");
    notify(`Repuesto OEM ${item.oem || ""} cargado en el formulario de compra. Indica cantidad y confirma.`, "success");
};

function updateCostoVentaPreview() {
    const costo = parseFloat(document.getElementById("compra-costo").value) || 0;
    const venta = costo * 1.2;
    document.getElementById("compra-venta-calc").value = formatMoney(venta);
}

function updateImagePreview(src) {
    const box = document.getElementById("compra-img-preview");
    if (!src || !src.trim()) {
        box.innerHTML = `<span>Vista previa de imagen (URL / Base64)</span>`;
        return;
    }
    box.innerHTML = `<img src="${escapeHtml(src.trim())}" alt="Vista previa" onerror="this.parentElement.innerHTML='<span>No se pudo cargar la vista previa de la URL</span>'" />`;
}

// =============================================================================
// MÓDULO 5: INVENTARIO Y DESPACHO DE SOLICITUDES A KARDEX/FACTURA
// =============================================================================
async function loadInventarioModule() {
    renderSkeletonRows("tbody-despachos-bodega", 9, 3);
    renderSkeletonRows("tbody-inventario-lotes", 6, 4);

    const [solicitudes, lotes] = await Promise.all([
        apiFetch("/api/solicitudes"),
        apiFetch("/api/inventario"),
    ]);
    state.solicitudes = solicitudes;
    state.inventario = lotes;

    renderColaDespachos();
    renderLotesInventario();
}

function renderColaDespachos() {
    if (!state.solicitudes.length) {
        renderEmptyRow("tbody-despachos-bodega", 9, "Sin solicitudes de repuestos", "No hay solicitudes registradas por los mecánicos.");
        return;
    }

    const tbody = document.getElementById("tbody-despachos-bodega");
    tbody.innerHTML = state.solicitudes
        .map((s) => {
            const esPendiente = s.estado_nombre.toLowerCase() === "pendiente";
            const tieneStock = s.stock_disponible >= s.cantidad;
            return `
            <tr>
                <td class="mono">#${s.id_solicitud}</td>
                <td>
                    <span class="mono">#${s.id_consulta}</span> — <strong class="mono">${escapeHtml(s.vehiculo_placa)}</strong>
                </td>
                <td>${escapeHtml(s.solicitante_nombre)}</td>
                <td style="font-weight:500;">${escapeHtml(s.producto_nombre)}</td>
                <td class="mono" style="font-weight:600;">${s.cantidad}</td>
                <td class="mono">${s.stock_disponible} uds</td>
                <td class="mono">${formatMoney(s.sub_total_estimado)}</td>
                <td>${getStatusBadge(s.estado_nombre)}</td>
                <td>
                    ${
                        esPendiente
                            ? `<div style="display:flex; gap:6px;">
                                <button type="button" class="btn btn-sm btn-success" ${
                                    !tieneStock ? "disabled title='Stock insuficiente'" : ""
                                } onclick="despacharSolicitud(${s.id_solicitud})">
                                    Despachar → Kardex
                                </button>
                                <button type="button" class="btn btn-sm btn-danger" onclick="rechazarSolicitud(${s.id_solicitud})">
                                    Rechazar
                                </button>
                               </div>`
                            : `<span class="mono" style="font-size:11px; color:var(--text-muted);">
                                ${escapeHtml(s.despachador_nombre || "Procesado")} (${formatDate(s.fecha_despacho)})
                               </span>`
                    }
                </td>
            </tr>
        `;
        })
        .join("");
}

function renderLotesInventario() {
    if (!state.inventario.length) {
        renderEmptyRow("tbody-inventario-lotes", 6, "Sin lotes en inventario", "Registra compras desde el módulo de Productos.");
        return;
    }

    const tbody = document.getElementById("tbody-inventario-lotes");
    tbody.innerHTML = state.inventario
        .map(
            (l) => `
            <tr>
                <td class="mono">#${l.id_inventario}</td>
                <td style="font-weight:500;">${escapeHtml(l.producto_nombre)} <span class="mono" style="color:var(--text-muted);">(ID #${l.id_producto})</span></td>
                <td class="mono">${formatMoney(l.costo_compra)}</td>
                <td class="mono" style="color:var(--status-ok); font-weight:600;">${formatMoney(l.costo_venta)}</td>
                <td class="mono" style="font-size:11.5px;">${formatDate(l.fecha_compra)}</td>
                <td>
                    <span class="badge ${l.cantidad > 0 ? "badge-ok" : "badge-danger"}">${l.cantidad} disponibles</span>
                </td>
            </tr>
        `
        )
        .join("");
}

window.despacharSolicitud = async function (idSolicitud) {
    try {
        const res = await apiFetch(`/api/solicitudes/${idSolicitud}/despachar`, { method: "POST" });
        notify(
            `Despacho #${idSolicitud} completado. Asociado a Factura #${res.id_factura} (Kardex #${res.id_kardex}) por ${formatMoney(
                res.sub_total
            )}.`,
            "success"
        );
        await loadInventarioModule();
        await refreshKPIs();
    } catch (err) {
        notify(err.message, "error");
    }
};

window.rechazarSolicitud = async function (idSolicitud) {
    try {
        const res = await apiFetch(`/api/solicitudes/${idSolicitud}/rechazar`, { method: "POST" });
        notify(res.mensaje, "info");
        await loadInventarioModule();
        await refreshKPIs();
    } catch (err) {
        notify(err.message, "error");
    }
};

// =============================================================================
// MÓDULO 6: FACTURACIÓN Y KARDEX
// =============================================================================
async function loadFacturacionModule() {
    renderSkeletonRows("tbody-facturas", 9, 3);
    renderSkeletonRows("tbody-kardex-general", 7, 3);

    const [facturas, kardex] = await Promise.all([
        apiFetch("/api/facturacion"),
        apiFetch("/api/kardex"),
    ]);
    state.facturas = facturas;
    state.kardex = kardex;

    if (!facturas.length) {
        renderEmptyRow("tbody-facturas", 9, "Sin facturas emitidas", "Las facturas se vinculan automáticamente a cada consulta registrada.");
    } else {
        const tbodyF = document.getElementById("tbody-facturas");
        tbodyF.innerHTML = facturas
            .map(
                (f) => `
                <tr>
                    <td class="mono" style="font-weight:600;">FAC-${String(f.id_factura).padStart(4, "0")}</td>
                    <td class="mono">#${f.id_consulta}</td>
                    <td>
                        <div style="font-weight:500;">${escapeHtml(f.cliente_nombre)}</div>
                        <div class="mono" style="font-size:11px; color:var(--text-secondary);">NIT: ${escapeHtml(f.cliente_nit)}</div>
                    </td>
                    <td class="mono">${escapeHtml(f.vehiculo_placa)}</td>
                    <td>${escapeHtml(f.mecanico_nombre)}</td>
                    <td>${getStatusBadge(f.estado_consulta)}</td>
                    <td class="mono">${f.total_items} uds (${f.items_kardex.length} renglones)</td>
                    <td class="mono" style="font-weight:600; color:var(--status-ok);">${formatMoney(f.total_factura)}</td>
                    <td>
                        <button type="button" class="btn btn-sm btn-primary" onclick="verDetalleFactura(${f.id_factura})">
                            Ver Factura / Kardex
                        </button>
                    </td>
                </tr>
            `
            )
            .join("");
    }

    if (!kardex.length) {
        renderEmptyRow("tbody-kardex-general", 7, "Sin movimientos en Kardex", "Al despachar repuestos desde Bodega se registran automáticamente aquí.");
    } else {
        const tbodyK = document.getElementById("tbody-kardex-general");
        tbodyK.innerHTML = kardex
            .map(
                (k) => `
                <tr>
                    <td class="mono">#${k.id_kardex}</td>
                    <td class="mono">FAC-${String(k.id_factura).padStart(4, "0")}</td>
                    <td class="mono">#${k.id_producto}</td>
                    <td style="font-weight:500;">${escapeHtml(k.producto_nombre)}</td>
                    <td class="mono">${k.cantidad}</td>
                    <td class="mono">${formatMoney(k.precio_unitario)}</td>
                    <td class="mono" style="font-weight:600;">${formatMoney(k.sub_total)}</td>
                </tr>
            `
            )
            .join("");
    }
}

window.verDetalleFactura = function (idFactura) {
    const f = state.facturas.find((x) => x.id_factura === idFactura);
    if (!f) return;

    document.getElementById("modal-factura-title").textContent = `Factura FAC-${String(f.id_factura).padStart(4, "0")} // Consulta #${f.id_consulta}`;
    document.getElementById("modal-factura-subtitle").textContent = `Vehículo Placa ${f.vehiculo_placa} (VIN: ${f.vehiculo_vin}) — Estado: ${f.estado_consulta}`;

    const itemsRows = f.items_kardex.length
        ? f.items_kardex
              .map(
                  (item) => `
                <tr>
                    <td class="mono">#${item.id_kardex}</td>
                    <td class="mono">#${item.id_producto}</td>
                    <td>${escapeHtml(item.producto_nombre)}</td>
                    <td class="mono">${item.cantidad}</td>
                    <td class="mono">${formatMoney(item.precio_unitario)}</td>
                    <td class="mono" style="font-weight:600;">${formatMoney(item.sub_total)}</td>
                </tr>
            `
              )
              .join("")
        : `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:18px;">Sin repuestos cargados al Kardex en esta consulta.</td></tr>`;

    document.getElementById("modal-factura-body").innerHTML = `
        <div class="form-row" style="margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
            <div>
                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Datos del Cliente</div>
                <div style="font-weight:600; font-size:13.5px; margin-top:2px;">${escapeHtml(f.cliente_nombre)}</div>
                <div class="mono" style="font-size:12px; color:var(--text-secondary);">NIT: ${escapeHtml(f.cliente_nit)} | Tel: ${escapeHtml(f.cliente_telefono || "N/A")}</div>
            </div>
            <div>
                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Datos de la Consulta</div>
                <div style="font-weight:500; margin-top:2px;">Mecánico: ${escapeHtml(f.mecanico_nombre)}</div>
                <div class="mono" style="font-size:11.5px; color:var(--text-secondary);">Ingreso: ${formatDate(f.fecha_ingreso)} | Salida: ${formatDate(f.fecha_salida)}</div>
            </div>
        </div>

        <div style="margin-bottom:14px; padding:10px 12px; background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:4px;">
            <div style="font-size:11.5px; color:var(--text-secondary);"><strong>Motivo de Consulta:</strong> ${escapeHtml(f.detalle_consulta)}</div>
            <div style="font-size:11.5px; color:var(--text-secondary); margin-top:4px;"><strong>Diagnóstico Técnico:</strong> ${escapeHtml(f.detalle_diagnostico || "En proceso")}</div>
        </div>

        <div class="table-wrap" style="border:1px solid var(--border-default); border-radius:4px;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID Kardex</th>
                        <th>ID Prod.</th>
                        <th>Repuesto Despachado</th>
                        <th>Cantidad</th>
                        <th>Precio Unitario</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>
        </div>

        <div style="margin-top:16px; display:flex; align-items:center; justify-content:space-between; padding-top:12px; border-top:1px solid var(--border-default);">
            <span style="color:var(--text-secondary); font-size:12px;">Total de unidades en Kardex: <strong class="mono">${f.total_items}</strong></span>
            <div style="font-size:15px; font-weight:600;">
                Total Factura: <span class="mono" style="color:var(--status-ok);">${formatMoney(f.total_factura)}</span>
            </div>
        </div>
    `;

    document.getElementById("modal-factura").classList.remove("hidden");
};

// =============================================================================
// MÓDULO 7: USUARIOS Y ROLES (ADMINISTRADOR)
// =============================================================================
async function loadUsuariosModule() {
    renderSkeletonRows("tbody-usuarios", 6, 4);
    const [usuarios, personas] = await Promise.all([
        apiFetch("/api/usuarios"),
        apiFetch("/api/personas"),
    ]);
    state.usuarios = usuarios;
    state.personas = personas;

    document.getElementById("usuario-persona").innerHTML = personas
        .map((p) => `<option value="${p.id_persona}">${escapeHtml(p.nombre)} (NIT: ${escapeHtml(p.nit)})</option>`)
        .join("");

    document.getElementById("usuario-rol").innerHTML = state.roles
        .map((r) => `<option value="${r.id_rol}">${escapeHtml(r.nombre)}</option>`)
        .join("");

    const estadosUsuario = state.estados.filter((e) => ["activo", "inactivo"].includes(e.nombre.toLowerCase()));
    document.getElementById("usuario-estado").innerHTML = estadosUsuario
        .map((e) => `<option value="${e.id_estado}">${escapeHtml(e.nombre)}</option>`)
        .join("");

    const tbody = document.getElementById("tbody-usuarios");
    tbody.innerHTML = usuarios
        .map(
            (u) => `
            <tr>
                <td class="mono">#${u.id_usuario}</td>
                <td class="mono" style="font-weight:600;">@${escapeHtml(u.alias)}</td>
                <td>${escapeHtml(u.persona_nombre)}</td>
                <td><span class="badge badge-info">${escapeHtml(u.rol_nombre)}</span></td>
                <td>${getStatusBadge(u.estado_nombre)}</td>
                <td>
                    <button type="button" class="btn btn-sm" onclick="editUsuario(${u.id_usuario})">Editar</button>
                </td>
            </tr>
        `
        )
        .join("");
}

window.editUsuario = function (idUsuario) {
    const u = state.usuarios.find((x) => x.id_usuario === idUsuario);
    if (!u) return;
    document.getElementById("usuario-id-edit").value = u.id_usuario;
    document.getElementById("usuario-persona").value = u.id_persona;
    document.getElementById("usuario-rol").value = u.id_rol;
    document.getElementById("usuario-estado").value = u.id_estado;
    document.getElementById("usuario-alias").value = u.alias;
    document.getElementById("usuario-password").value = "";
    notify(`Editando usuario @${u.alias}`, "info");
};

// =============================================================================
// EVENT LISTENERS E INICIALIZACIÓN
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Login Form
    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const alias = document.getElementById("login-alias").value.trim();
        const contrasenia = document.getElementById("login-password").value;
        const btn = document.getElementById("login-submit-btn");
        btn.disabled = true;
        btn.textContent = "Verificando credenciales...";
        try {
            const data = await apiFetch("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ alias, contrasenia }),
            });
            state.token = data.token;
            state.user = data;
            localStorage.setItem("tp_token", data.token);
            notify(`Bienvenido, ${data.persona_nombre} (${data.rol_nombre})`, "success");
            await enterWorkspace();
        } catch (err) {
            notify(err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Iniciar Sesión";
        }
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", async () => {
        try {
            await apiFetch("/api/auth/logout", { method: "POST" });
        } catch (_) {}
        clearSession();
        notify("Sesión finalizada correctamente.", "info");
    });

    // 2. Formulario de Consulta
    document.getElementById("form-consulta").addEventListener("submit", async (e) => {
        e.preventDefault();
        const idEdit = document.getElementById("consulta-id-edit").value;
        const payload = {
            id_vehiculo: Number(document.getElementById("consulta-vehiculo").value),
            id_usuario: Number(document.getElementById("consulta-mecanico").value),
            id_estado: Number(document.getElementById("consulta-estado").value),
            detalle_consulta: document.getElementById("consulta-detalle").value,
            detalle_diagnostico: document.getElementById("consulta-diagnostico").value,
        };
        try {
            if (idEdit) {
                await apiFetch(`/api/consultas/${idEdit}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                notify(`Consulta #${idEdit} actualizada.`, "success");
            } else {
                await apiFetch("/api/consultas", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                notify("Nueva consulta registrada y vinculada a facturación.", "success");
            }
            resetFormConsulta();
            await loadConsultasModule();
            await refreshKPIs();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-finalizar-consulta").addEventListener("click", async () => {
        const idEdit = document.getElementById("consulta-id-edit").value;
        if (!idEdit) return;
        try {
            await apiFetch(`/api/consultas/${idEdit}`, {
                method: "PUT",
                body: JSON.stringify({
                    detalle_diagnostico: document.getElementById("consulta-diagnostico").value,
                    finalizar: true,
                }),
            });
            notify(`Consulta #${idEdit} finalizada con fecha de salida registrada.`, "success");
            resetFormConsulta();
            await loadConsultasModule();
            await refreshKPIs();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-reset-consulta").addEventListener("click", resetFormConsulta);
    document.getElementById("btn-refresh-consultas").addEventListener("click", () => loadConsultasModule());

    // Solicitud de repuestos del Mecánico al Bodeguero
    document.getElementById("form-solicitud-repuesto").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            id_consulta: Number(document.getElementById("sol-consulta").value),
            id_producto: Number(document.getElementById("sol-producto").value),
            cantidad: Number(document.getElementById("sol-cantidad").value),
        };
        try {
            await apiFetch("/api/solicitudes", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            notify("Solicitud enviada a Bodega. Al despacharse se asociará al Kardex/Factura.", "success");
            document.getElementById("sol-cantidad").value = 1;
            await loadConsultasModule();
            await refreshKPIs();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    // 3. Formulario de Vehículos
    document.getElementById("form-vehiculo").addEventListener("submit", async (e) => {
        e.preventDefault();
        const idEdit = document.getElementById("vehiculo-id-edit").value;
        const payload = {
            id_persona: Number(document.getElementById("vehiculo-persona").value),
            placa: document.getElementById("vehiculo-placa").value,
            vin: document.getElementById("vehiculo-vin").value,
        };
        try {
            if (idEdit) {
                await apiFetch(`/api/vehiculos/${idEdit}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                notify("Vehículo actualizado correctamente.", "success");
            } else {
                await apiFetch("/api/vehiculos", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                notify("Vehículo registrado exitosamente.", "success");
            }
            document.getElementById("form-vehiculo").reset();
            document.getElementById("vehiculo-id-edit").value = "";
            await loadVehiculosModule();
            await refreshKPIs();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-reset-vehiculo").addEventListener("click", () => {
        document.getElementById("form-vehiculo").reset();
        document.getElementById("vehiculo-id-edit").value = "";
    });
    document.getElementById("btn-search-vehiculos").addEventListener("click", () => {
        loadVehiculosModule(document.getElementById("search-vehiculos").value);
    });

    // 4. Formulario de Personas
    document.getElementById("form-persona").addEventListener("submit", async (e) => {
        e.preventDefault();
        const idEdit = document.getElementById("persona-id-edit").value;
        const edadVal = document.getElementById("persona-edad").value;
        const payload = {
            nombre: document.getElementById("persona-nombre").value,
            nit: document.getElementById("persona-nit").value,
            telefono: document.getElementById("persona-telefono").value || null,
            email: document.getElementById("persona-email").value || null,
            edad: edadVal ? Number(edadVal) : null,
            sexo: document.getElementById("persona-sexo").value || null,
        };
        try {
            if (idEdit) {
                await apiFetch(`/api/personas/${idEdit}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                notify("Datos de persona actualizados.", "success");
            } else {
                await apiFetch("/api/personas", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                notify("Persona registrada en base de datos.", "success");
            }
            document.getElementById("form-persona").reset();
            document.getElementById("persona-id-edit").value = "";
            await loadPersonasModule();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-reset-persona").addEventListener("click", () => {
        document.getElementById("form-persona").reset();
        document.getElementById("persona-id-edit").value = "";
    });
    document.getElementById("btn-search-personas").addEventListener("click", () => {
        loadPersonasModule(document.getElementById("search-personas").value);
    });

    // 5. Productos, Buscador Speero API y Conversión Imagen Base64
    document.getElementById("btn-speero-search").addEventListener("click", () => consultarSpeeroAPI(1));
    document.getElementById("speero-query").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            consultarSpeeroAPI(1);
        }
    });

    // Tooltip flotante de ampliación de imagen al pasar el cursor sobre cualquier miniatura (.product-thumb)
    const zoomTooltip = document.getElementById("img-zoom-tooltip");
    const zoomTargetImg = document.getElementById("img-zoom-target");
    const zoomCaption = document.getElementById("img-zoom-caption");

    function positionZoomTooltip(clientX, clientY) {
        if (!zoomTooltip || zoomTooltip.classList.contains("hidden")) return;
        const offset = 16;
        const tooltipWidth = 260;
        const tooltipHeight = 270;
        let left = clientX + offset;
        let top = clientY + offset;

        if (left + tooltipWidth > window.innerWidth - 12) {
            left = clientX - tooltipWidth - offset;
        }
        if (top + tooltipHeight > window.innerHeight - 12) {
            top = Math.max(12, window.innerHeight - tooltipHeight - 12);
        }

        zoomTooltip.style.left = `${left}px`;
        zoomTooltip.style.top = `${top}px`;
    }

    document.addEventListener("mouseover", (e) => {
        const thumb = e.target.closest(".product-thumb");
        if (!thumb || !zoomTooltip) return;
        const src = thumb.getAttribute("data-zoom-src") || thumb.getAttribute("src");
        const caption = thumb.getAttribute("data-zoom-caption") || thumb.getAttribute("alt") || "";
        if (!src) return;

        zoomTargetImg.src = src;
        zoomCaption.textContent = caption;
        zoomTooltip.classList.remove("hidden");
        positionZoomTooltip(e.clientX, e.clientY);
    });

    document.addEventListener("mousemove", (e) => {
        if (zoomTooltip && !zoomTooltip.classList.contains("hidden")) {
            positionZoomTooltip(e.clientX, e.clientY);
        }
    });

    document.addEventListener("mouseout", (e) => {
        const thumb = e.target.closest(".product-thumb");
        if (thumb && zoomTooltip) {
            zoomTooltip.classList.add("hidden");
        }
    });

    document.getElementById("compra-costo").addEventListener("input", updateCostoVentaPreview);
    document.getElementById("compra-url-imagen").addEventListener("input", (e) => {
        updateImagePreview(e.target.value);
    });

    // Convertir imagen local seleccionada a Base64 automáticamente
    document.getElementById("compra-file-base64").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result;
            document.getElementById("compra-url-imagen").value = base64String;
            updateImagePreview(base64String);
            notify("Imagen convertida a formato Base64 y lista para guardar.", "info");
        };
        reader.readAsDataURL(file);
    });

    document.getElementById("form-compra-producto").addEventListener("submit", async (e) => {
        e.preventDefault();
        const idProd = document.getElementById("compra-id-producto").value;
        const payload = {
            id_producto: idProd ? Number(idProd) : null,
            nombre: document.getElementById("compra-nombre").value,
            url_imagen: document.getElementById("compra-url-imagen").value || null,
            costo_compra: parseFloat(document.getElementById("compra-costo").value),
            cantidad: parseInt(document.getElementById("compra-cantidad").value, 10),
        };
        try {
            const lote = await apiFetch("/api/inventario/comprar", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            notify(
                `Compra registrada: +${lote.cantidad} uds de "${lote.producto_nombre}" (Costo venta: ${formatMoney(lote.costo_venta)}).`,
                "success"
            );
            document.getElementById("form-compra-producto").reset();
            document.getElementById("compra-id-producto").value = "";
            updateCostoVentaPreview();
            updateImagePreview("");
            await loadProductosModule();
            await refreshKPIs();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-reset-compra").addEventListener("click", () => {
        document.getElementById("form-compra-producto").reset();
        document.getElementById("compra-id-producto").value = "";
        updateCostoVentaPreview();
        updateImagePreview("");
    });

    document.getElementById("btn-refresh-productos").addEventListener("click", () => loadProductosModule());
    document.getElementById("btn-search-productos-local").addEventListener("click", () => {
        loadProductosModule(document.getElementById("search-productos-local").value);
    });

    // 6. Inventario y Facturación
    document.getElementById("btn-refresh-inventario").addEventListener("click", () => loadInventarioModule());
    document.getElementById("btn-refresh-facturacion").addEventListener("click", () => loadFacturacionModule());

    // Modal Factura
    document.getElementById("btn-close-modal-factura").addEventListener("click", () => {
        document.getElementById("modal-factura").classList.add("hidden");
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.getElementById("modal-factura").classList.add("hidden");
        }
    });

    // 7. Formulario de Usuarios (Admin)
    document.getElementById("form-usuario").addEventListener("submit", async (e) => {
        e.preventDefault();
        const idEdit = document.getElementById("usuario-id-edit").value;
        const pw = document.getElementById("usuario-password").value;
        const payload = {
            id_persona: Number(document.getElementById("usuario-persona").value),
            id_rol: Number(document.getElementById("usuario-rol").value),
            id_estado: Number(document.getElementById("usuario-estado").value),
            alias: document.getElementById("usuario-alias").value,
        };
        if (pw) payload.contrasenia = pw;

        try {
            if (idEdit) {
                await apiFetch(`/api/usuarios/${idEdit}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                notify("Usuario actualizado.", "success");
            } else {
                if (!pw) {
                    notify("Debes especificar una contraseña para el nuevo usuario.", "error");
                    return;
                }
                await apiFetch("/api/usuarios", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                notify("Usuario creado con contraseña cifrada en bcrypt.", "success");
            }
            document.getElementById("form-usuario").reset();
            document.getElementById("usuario-id-edit").value = "";
            await loadUsuariosModule();
        } catch (err) {
            notify(err.message, "error");
        }
    });

    document.getElementById("btn-reset-usuario").addEventListener("click", () => {
        document.getElementById("form-usuario").reset();
        document.getElementById("usuario-id-edit").value = "";
    });

    initSession();
});
