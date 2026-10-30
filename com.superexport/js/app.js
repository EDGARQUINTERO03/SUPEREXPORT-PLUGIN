/* =========================================================
   SuperExport — lógica del panel
   SECCIONES
     A. Preferencias guardadas
     B. Utilidades de interfaz
     C. Cola de órdenes al motor (solo lo más reciente se procesa)
     D. Paso 1 · Logos
     E. Paso 2 · Color (esquemas, ajuste, colores de marca)
     F. Paso 3 · Formatos
     G. Paso 4 · Exportar
     H. Inicio
   ========================================================= */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  // =====================================================
  // A. PREFERENCIAS (se recuerdan entre sesiones)
  // =====================================================
  var CLAVE_PREFS = "superexport.prefs.v1";

  function esquemasPorDefecto() {
    return [
      { id: "original", nombre: "Original", activa: true, tipo: "original", regla: "mantener", fondo: "claro", mapa: [] },
      { id: "negro", nombre: "Negro", activa: true, tipo: "tinta", tinta: "negro", papel: "blanco", regla: "mantener", fondo: "claro", mapa: [] },
      { id: "blanco", nombre: "Blanco", activa: true, tipo: "tinta", tinta: "blanco", papel: "fondo", regla: "mantener", fondo: "oscuro", mapa: [] },
      { id: "grises", nombre: "Grises", activa: true, tipo: "grises", regla: "mantener", fondo: "claro", mapa: [] },
      { id: "invertida", nombre: "Invertida", activa: false, tipo: "mapa", regla: "invertida", fondo: "oscuro", mapa: [] }
    ];
  }

  var P = {
    columnas: 3, separacion: 50,
    versiones: esquemasPorDefecto(), paleta: [], tintasMarca: false, tintasOff: [],
    formatos: { AI: false, PDF: false, EPS: false, SVG: false, PNG: false, JPG: false },
    calidadJPG: 100, fondosJPG: [], contornos: true, maestroAI: true, maestroPDF: true,
    porLogo: true, carpeta: ""
  };
  try {
    // Si no hay preferencias nuevas, se recuperan las de la versión anterior
    var guardadas = JSON.parse(localStorage.getItem(CLAVE_PREFS) || localStorage.getItem("logopack.prefs.v1") || "null");
    if (guardadas) for (var k in guardadas) P[k] = guardadas[k];
  } catch (e) {}
  if (!P.versiones || !P.versiones.length) P.versiones = esquemasPorDefecto();

  var temporizadorGuardar = null;
  function guardar() {
    clearTimeout(temporizadorGuardar);
    temporizadorGuardar = setTimeout(function () {
      try { localStorage.setItem(CLAVE_PREFS, JSON.stringify(P)); } catch (e) {}
    }, 300);
  }

  // =====================================================
  // B. UTILIDADES DE INTERFAZ
  // =====================================================
  function el(etiqueta, attrs, hijos) {
    var n = document.createElement(etiqueta);
    for (var a in attrs || {}) {
      if (a === "clase") n.className = attrs[a];
      else if (a === "texto") n.textContent = attrs[a];
      else if (a.indexOf("on") === 0) n.addEventListener(a.substr(2), attrs[a]);
      else n.setAttribute(a, attrs[a]);
    }
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
    return n;
  }

  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function muestra(hex) {
    var m = el("span", { clase: "muestra" + (hex ? "" : " vacia") });
    if (hex) m.style.background = "#" + hex;
    return m;
  }

  function casilla(texto, marcada, alCambiar) {
    var input = el("input", { type: "checkbox" });
    input.checked = !!marcada;
    input.addEventListener("change", function () { alCambiar(input.checked); });
    return el("label", { clase: "casilla" }, [input, el("span", { clase: "caja" }), el("span", { texto: texto })]);
  }

  function selector(opciones, valor, alCambiar) {
    var s = el("select");
    opciones.forEach(function (o, i) {
      var op = el("option", { value: String(i), texto: o.t });
      if (o.d === valor) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener("change", function () { alCambiar(opciones[parseInt(s.value, 10)].d); });
    return s;
  }

  function estado(texto, tipo) {
    $("estadoTexto").textContent = texto;
    $("estado").className = "estado" + (tipo === "aviso" ? " aviso" : "");
    $("puntoEstado").className = "punto" + (tipo === "aviso" ? " aviso" : "");
  }

  function confirmar(texto, textoSi) {
    return new Promise(function (resolver) {
      $("modalTexto").textContent = texto;
      $("modalSi").textContent = textoSi || "Aceptar";
      $("modal").hidden = false;
      function cerrar(v) { $("modal").hidden = true; $("modalSi").onclick = $("modalNo").onclick = null; resolver(v); }
      $("modalSi").onclick = function () { cerrar(true); };
      $("modalNo").onclick = function () { cerrar(false); };
    });
  }

  function aviso(texto) {
    return new Promise(function (resolver) {
      $("modalTexto").textContent = texto;
      $("modalSi").textContent = "Entendido";
      $("modalNo").hidden = true;
      $("modal").hidden = false;
      $("modalSi").onclick = function () { $("modal").hidden = true; $("modalNo").hidden = false; resolver(); };
    });
  }

  function contiene(arr, x) { return arr.indexOf(x) >= 0; }
  function quitarDe(arr, x) { return arr.filter(function (y) { return y !== x; }); }

  function hexARGB(hex) { return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)]; }
  function grisDeHex(hex) { var c = hexARGB(hex); return (1 - (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255) * 100; }

  // =====================================================
  // C. COLA DE ÓRDENES AL MOTOR
  //    Las acciones del usuario se hacen en orden. Las actualizaciones
  //    automáticas (miniaturas, vista previa) se juntan: solo cuenta la última.
  // =====================================================
  var ocupado = false, cola = [];
  var pendiente = { colores: false, miniLogos: false, vistasTodas: false, vistasIds: {}, paquete: null };

  function llamar(funcion, args, alTerminar) {
    if (ocupado) { cola.push([funcion, args, alTerminar]); return; }
    ocupado = true;
    $("indicador").className = "punto trabajando";
    Puente.ejecutar(funcion, args).then(function (o) {
      ocupado = false;
      $("indicador").className = "punto";
      if (!o || !o.ok) estado("⚠ " + (o && o.error ? o.error : "Algo salió mal."), "aviso");
      else {
        if (o.mensaje) estado(o.mensaje);
        if (alTerminar) { try { alTerminar(o); } catch (e) { estado("⚠ " + e.message, "aviso"); } }
      }
      siguiente();
    });
  }

  function siguiente() {
    if (ocupado) return;
    if (cola.length) { var c = cola.shift(); llamar(c[0], c[1], c[2]); return; }
    if (pendiente.miniLogos) { pendiente.miniLogos = false; refrescarMiniLogos(); return; }
    if (pendiente.colores) { pendiente.colores = false; refrescarColores(); return; }
    if (pendiente.vistasTodas) { pendiente.vistasTodas = false; pendiente.vistasIds = {}; refrescarVistas(); return; }
    var ids = Object.keys(pendiente.vistasIds);
    if (ids.length) { pendiente.vistasIds = {}; refrescarVistas(ids); return; }
    if (pendiente.paquete) { var m = pendiente.paquete; pendiente.paquete = null; refrescarPaquete(m); }
  }

  // =====================================================
  // D. PASO 1 · LOGOS
  // =====================================================
  var logos = [], seleccion = -1;

  function opcionesMesas() { return { columnas: P.columnas, separacion: P.separacion, margen: 0, mismoTamano: false }; }

  function pintar(o) {
    logos = o.logos || [];
    if (typeof o.seleccion === "number") seleccion = o.seleccion;
    if (seleccion >= logos.length) seleccion = logos.length - 1;
    if (!$("nombreMarca").value && o.documento) $("nombreMarca").value = o.documento;
    if (!P.carpeta && o.carpeta) { P.carpeta = o.carpeta; guardar(); }
    renderLogos();
    renderLogoPrevia();
    renderResumen();
  }

  var miniLogos = {};   // nombre del logo -> ruta de su miniatura

  function renderLogos() {
    var ul = $("listaLogos");
    vaciar(ul);
    $("cuentaLogos").textContent = logos.length;
    if (!logos.length) {
      ul.appendChild(el("li", { clase: "vacio", texto: "Aún no hay logos. Selecciona uno en tu mesa de trabajo y pulsa Agregar." }));
    }
    logos.forEach(function (nombre, i) {
      var ruta = miniLogos[nombre];
      var mini = el("span", { clase: "mini-logo" }, [ruta ? el("img", { src: Puente.urlArchivo(ruta), alt: "" }) : el("span", { clase: "cargando" })]);

      // El nombre se edita directamente: Enter o clic fuera para guardar, Esc para cancelar
      var inp = el("input", { type: "text", value: nombre, clase: "nombre", title: "Clic para cambiar el nombre" });
      inp.addEventListener("focus", function () { marcar(i); });
      inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") inp.blur();
        if (ev.key === "Escape") { inp.value = nombre; inp.blur(); }
      });
      inp.addEventListener("change", function () { confirmarRenombre(i, inp.value); });

      var li = el("li", { clase: i === seleccion ? "sel" : "" }, [el("span", { clase: "num", texto: (i < 9 ? "0" : "") + (i + 1) }), mini, inp]);
      li.addEventListener("click", function (ev) {
        if (ev.target === inp) return;
        marcar(i);
        llamar("enfocar", [i]);
      });
      ul.appendChild(li);
    });
    actualizarBotonesLista();
  }

  // Marca una fila como seleccionada sin redibujar la lista (así no se pierde lo que se escribe)
  function marcar(i) {
    seleccion = i;
    Array.prototype.forEach.call($("listaLogos").children, function (li, k) { li.classList.toggle("sel", k === i); });
    actualizarBotonesLista();
  }

  function actualizarBotonesLista() {
    ["btSubir", "btBajar", "btQuitar"].forEach(function (id) { $(id).disabled = seleccion < 0 || !logos.length; });
  }

  function confirmarRenombre(i, texto) {
    texto = texto.trim();
    if (!texto || texto === logos[i]) { renderLogos(); return; }
    var anterior = logos[i];
    llamar("renombrar", [i, texto], function (o) {
      // La miniatura sigue siendo la misma: se pasa al nombre nuevo
      var nuevo = (o.logos || [])[i];
      if (nuevo && miniLogos[anterior]) { miniLogos[nuevo] = miniLogos[anterior]; delete miniLogos[anterior]; }
      logosCambiaron(o, false);
    });
  }

  function refrescarMiniLogos() {
    if (!logos.length) return;
    if (ocupado) { pendiente.miniLogos = true; return; }
    llamar("miniaturas", [72], function (o) {
      var nuevas = {};
      (o.logos || logos).forEach(function (n, k) { if (o.vistas && o.vistas[k]) nuevas[n] = o.vistas[k]; });
      miniLogos = nuevas;
      renderLogos();
    });
  }

  // Después de agregar, quitar, mover o renombrar logos, todo lo demás se pone al día solo
  function logosCambiaron(o, coloresPudieronCambiar) {
    pintar(o);
    if (coloresPudieronCambiar) refrescarMiniLogos();
    if (coloresPudieronCambiar && (colores.length || pasoActual === 2)) refrescarColores();
    refrescarPaquete("siAbierta");
  }

  $("btAgregar").onclick = function () {
    llamar("agregar", [$("nombreLogo").value, opcionesMesas()], function (o) {
      $("nombreLogo").value = "";
      logosCambiaron(o, true);
    });
  };
  $("nombreLogo").addEventListener("keydown", function (ev) { if (ev.key === "Enter") $("btAgregar").onclick(); });
  $("btSubir").onclick = function () { if (seleccion > 0) llamar("mover", [seleccion, -1, opcionesMesas()], function (o) { logosCambiaron(o, false); }); };
  $("btBajar").onclick = function () { if (seleccion >= 0 && seleccion < logos.length - 1) llamar("mover", [seleccion, 1, opcionesMesas()], function (o) { logosCambiaron(o, false); }); };
  $("btQuitar").onclick = function () {
    if (seleccion < 0) return;
    confirmar("¿Quitar «" + logos[seleccion] + "» de la lista?\n\nEl logo no se borra: se aparta a un lado y se elimina su mesa de trabajo.", "Quitar")
      .then(function (si) { if (si) llamar("quitar", [seleccion, opcionesMesas()], function (o) { logosCambiaron(o, true); }); });
  };
  function cambiarColumnas(d) {
    P.columnas = Math.max(1, Math.min(10, P.columnas + d));
    $("columnas").textContent = P.columnas;
    guardar();
    if (logos.length) llamar("reordenar", [opcionesMesas()], function (o) { logosCambiaron(o, false); });
  }
  $("colMenos").onclick = function () { cambiarColumnas(-1); };
  $("colMas").onclick = function () { cambiarColumnas(1); };
  $("separacion").addEventListener("change", function () {
    P.separacion = Math.max(0, parseFloat($("separacion").value) || 0);
    guardar();
    if (logos.length) llamar("reordenar", [opcionesMesas()], function (o) { logosCambiaron(o, false); });
  });
  $("btReordenar").onclick = function () { llamar("reordenar", [opcionesMesas()], function (o) { logosCambiaron(o, false); }); };
  $("btLimpiar").onclick = function () {
    confirmar("Se borrarán las mesas de trabajo que no pertenecen a ningún logo de la lista (por ejemplo, la mesa original).", "Borrar")
      .then(function (si) { if (si) llamar("limpiarMesas", [], pintar); });
  };

  // =====================================================
  // E. PASO 2 · COLOR
  // =====================================================
  var colores = [], vistas = {}, ajustandoId = null, TAM_MINI = 120;
  var REGLAS = [
    { d: "mantener", t: "Se quedan igual" },
    { d: "tinta", t: "Todo color → negro, lo blanco se queda" },
    { d: "invertida", t: "Negros → blanco, blancos → fondo" },
    { d: "todoNegro", t: "Todo negro (silueta)" },
    { d: "todoBlanco", t: "Todo blanco (silueta)" }
  ];
  var TIPOS = [
    { d: "original", t: "Original (sin cambios)" },
    { d: "tinta", t: "Una tinta (por contraste)" },
    { d: "mapa", t: "Cambiar colores uno por uno" },
    { d: "grises", t: "Escala de grises" }
  ];

  function logoPrevia() { return Math.max(0, parseInt($("logoPrevia").value, 10) || 0); }

  // Todos los esquemas: los editables + uno por cada color de la marca (si está activado)
  function esquemas() {
    var r = P.versiones.map(function (v) {
      return { ref: v, id: v.id, nombre: v.nombre, tipo: v.tipo, regla: v.regla, fondo: v.fondo, mapa: v.mapa || [],
               tinta: v.tinta || "", papel: v.papel || "", activa: v.activa !== false, editable: true };
    });
    if (P.tintasMarca) P.paleta.forEach(function (p) {
      var claro = grisDeHex(p.hex) < 20;
      r.push({ id: "tinta:" + p.clave, nombre: "Tinta " + String(p.nombre).replace(/^#/, ""), tipo: "tinta", regla: "mantener",
               fondo: claro ? "oscuro" : "claro", mapa: [], tinta: "P:" + p.clave, papel: claro ? "fondo" : "blanco",
               activa: !contiene(P.tintasOff, p.clave), editable: false, clave: p.clave });
    });
    return r;
  }

  function paraMotor(e) {
    return { id: e.id, nombre: e.nombre, tipo: e.tipo, regla: e.regla, fondo: e.fondo, mapa: e.mapa || [],
             tinta: e.tinta || "", papel: e.papel || "" };
  }
  function activosParaMotor() { return esquemas().filter(function (e) { return e.activa; }).map(paraMotor); }
  function porId(id) { return P.versiones.filter(function (v) { return v.id === id; })[0] || null; }

  function renderLogoPrevia() {
    var s = $("logoPrevia"), previo = logoPrevia();
    vaciar(s);
    logos.forEach(function (n, i) { s.appendChild(el("option", { value: String(i), texto: n })); });
    if (logos.length) s.value = String(Math.min(previo, logos.length - 1));
  }

  function renderEsquemas() {
    var cont = $("esquemas");
    vaciar(cont);
    esquemas().forEach(function (e) {
      var img = vistas[e.id] ? el("img", { src: Puente.urlArchivo(vistas[e.id]), alt: e.nombre }) : el("span", { clase: "cargando" });
      var t = el("div", { clase: "tarjeta" + (e.activa ? "" : " apagada") + (ajustandoId === e.id ? " ajustando" : "") }, [
        el("div", { clase: "miniatura", id: "mini-" + e.id }, [img]),
        casilla(e.nombre, e.activa, function (v) {
          if (e.editable) e.ref.activa = v;
          else P.tintasOff = v ? quitarDe(P.tintasOff, e.clave) : P.tintasOff.concat([e.clave]);
          guardar(); renderEsquemas(); renderResumen(); refrescarPaquete("siAbierta");
        }),
        e.editable
          ? el("button", { clase: "btn mini" + (ajustandoId === e.id ? " principal" : ""), texto: ajustandoId === e.id ? "Ajustando" : "Ajustar",
                           onclick: function () { ajustandoId = ajustandoId === e.id ? null : e.id; renderEsquemas(); renderAjuste(); } })
          : el("div", { clase: "tag", texto: "color de marca" })
      ]);
      cont.appendChild(t);
    });
  }

  // Cambia solo la imagen de una tarjeta
  function ponerImagen(id, ruta) {
    vistas[id] = ruta;
    var caja = $("mini-" + id);
    if (!caja || !ruta) return;
    vaciar(caja);
    caja.appendChild(el("img", { src: Puente.urlArchivo(ruta) }));
  }

  // Lo que pasa cuando cambia un esquema: su miniatura y la vista previa del paquete
  function esquemaCambio(ver) {
    guardar();
    refrescarVistas([ver.id]);
    refrescarPaquete("siAbierta");
    renderResumen();
  }

  // --- Resultado de cada color (para mostrarlo en "uno por uno") ---
  function destinoExplicito(ver, clave) {
    var m = (ver.mapa || []).filter(function (x) { return x[0] === clave; })[0];
    return m ? m[1] : null;
  }
  function destinoEfectivo(ver, col) {
    var d = destinoExplicito(ver, col.clave);
    if (d) return d;
    switch (ver.regla) {
      case "tinta": return col.gris > 8 ? "negro" : "blanco";
      case "invertida": return col.gris >= 80 ? "blanco" : (col.gris <= 8 ? "fondo" : "mantener");
      case "todoNegro": return "negro";
      case "todoBlanco": return "blanco";
    }
    return "mantener";
  }
  function hexDestino(ver, col) {
    var d = destinoEfectivo(ver, col);
    if (d === "mantener") return col.hex;
    if (d === "negro") return "000000";
    if (d === "blanco") return "FFFFFF";
    if (d === "fondo") return ver.fondo === "oscuro" ? "262626" : "FFFFFF";
    if (d === "quitar") return null;
    if (d.indexOf("P:") === 0) {
      var p = P.paleta.filter(function (x) { return "P:" + x.clave === d; })[0];
      if (p) return p.hex;
    }
    return col.hex;
  }
  function fijarDestino(ver, clave, destino) {
    ver.mapa = (ver.mapa || []).filter(function (x) { return x[0] !== clave; });
    if (destino) ver.mapa.push([clave, destino]);
  }
  function opcionesDestino() {
    return [
      { t: "Automático", d: null }, { t: "Mantener igual", d: "mantener" }, { t: "Negro", d: "negro" },
      { t: "Blanco", d: "blanco" }, { t: "Color del fondo", d: "fondo" }, { t: "Transparente", d: "quitar" }
    ].concat(P.paleta.map(function (p) { return { t: "Marca " + p.nombre, d: "P:" + p.clave }; }));
  }

  // --- Ajuste del esquema elegido (los cambios se aplican al momento) ---
  function renderAjuste() {
    var cont = $("ajuste");
    vaciar(cont);
    var ver = ajustandoId ? porId(ajustandoId) : null;
    if (!ver) return;
    if (!ver.tinta) ver.tinta = "negro";
    if (!ver.papel) ver.papel = "blanco";

    var nombre = el("input", { type: "text", value: ver.nombre });
    nombre.addEventListener("change", function () {
      var n = nombre.value.trim(); if (!n) return;
      ver.nombre = n; guardar(); renderEsquemas(); renderAjusteTitulo(); refrescarPaquete("siAbierta");
    });
    var fondo = el("div", { clase: "segmentos" }, ["claro", "oscuro"].map(function (f) {
      return el("button", { clase: ver.fondo === f ? "activo" : "", texto: f === "claro" ? "Claro" : "Oscuro",
                            onclick: function () { ver.fondo = f; renderAjuste(); esquemaCambio(ver); } });
    }));
    var tipo = selector(TIPOS, ver.tipo, function (d) { ver.tipo = d; renderAjuste(); esquemaCambio(ver); });

    var caja = el("div", { clase: "ajuste" }, [
      el("h3", { id: "tituloAjuste" }),
      el("div", { clase: "etiqueta", texto: "Nombre" }), nombre,
      el("div", { clase: "fila", style: "margin-top:10px" }, [el("span", { clase: "crece", texto: "Fondo" }), fondo]),
      el("div", { clase: "etiqueta", texto: "Tipo" }), tipo
    ]);
    cont.appendChild(caja);
    renderAjusteTitulo();

    if (ver.tipo === "tinta") {
      var tintas = [{ t: "Negro", d: "negro" }, { t: "Blanco", d: "blanco" }]
        .concat(P.paleta.map(function (p) { return { t: "Marca " + p.nombre, d: "P:" + p.clave }; }));
      caja.appendChild(el("p", { clase: "nota", texto: "Lo que va sobre el fondo se pinta con la tinta; lo que va encima de otra forma queda como hueco." }));
      caja.appendChild(el("div", { clase: "etiqueta", texto: "Color de la tinta" }));
      caja.appendChild(selector(tintas, ver.tinta, function (d) { ver.tinta = d; esquemaCambio(ver); }));
      caja.appendChild(el("div", { clase: "etiqueta", texto: "Color de los huecos" }));
      caja.appendChild(selector([{ t: "Blanco", d: "blanco" }, { t: "Color del fondo", d: "fondo" }], ver.papel,
        function (d) { ver.papel = d; esquemaCambio(ver); }));
    } else if (ver.tipo === "mapa") {
      caja.appendChild(el("div", { clase: "etiqueta", texto: "Colores en «Automático»" }));
      caja.appendChild(selector(REGLAS, ver.regla, function (d) { ver.regla = d; renderAjuste(); esquemaCambio(ver); }));
      var mapa = el("div", { clase: "mapa" });
      if (!colores.length) mapa.appendChild(el("p", { clase: "nota", texto: "Leyendo los colores del logo…" }));
      var opts = opcionesDestino();
      colores.slice(0, 12).forEach(function (col) {
        var res = muestra(hexDestino(ver, col));
        var sel = selector(opts, destinoExplicito(ver, col.clave), function (d) {
          fijarDestino(ver, col.clave, d);
          var nuevo = muestra(hexDestino(ver, col));
          res.parentNode.replaceChild(nuevo, res); res = nuevo;
          esquemaCambio(ver);
        });
        mapa.appendChild(el("div", { clase: "fila-color" }, [muestra(col.hex), el("span", { clase: "cod", texto: col.nombre }), el("span", { texto: "→" }), sel, res]));
      });
      if (colores.length > 12) mapa.appendChild(el("p", { clase: "nota", texto: "+" + (colores.length - 12) + " colores más usan la regla automática." }));
      caja.appendChild(mapa);
    } else {
      caja.appendChild(el("p", { clase: "nota", texto: ver.tipo === "grises" ? "Cada color pasa a su gris equivalente." : "Conserva los colores originales del logo." }));
    }

    caja.appendChild(el("div", { clase: "btns", style: "margin-top:14px; justify-content:space-between" }, [
      el("button", { clase: "btn peligro", texto: "Eliminar", onclick: function () {
        if (P.versiones.length <= 1) { estado("Debe quedar al menos un esquema.", "aviso"); return; }
        confirmar("¿Eliminar el esquema «" + ver.nombre + "»?", "Eliminar").then(function (si) {
          if (!si) return;
          P.versiones = P.versiones.filter(function (v) { return v !== ver; });
          ajustandoId = null; guardar(); renderEsquemas(); renderAjuste(); renderResumen(); refrescarPaquete("siAbierta");
        });
      } }),
      el("button", { clase: "btn", texto: "Listo", onclick: function () { ajustandoId = null; renderEsquemas(); renderAjuste(); } })
    ]));
  }

  function renderAjusteTitulo() {
    var ver = porId(ajustandoId), h = $("tituloAjuste");
    if (!ver || !h) return;
    vaciar(h);
    h.appendChild(document.createTextNode("Ajustar "));
    h.appendChild(el("span", { texto: ver.nombre }));
  }

  // --- Colores de la marca ---
  function renderPaleta() {
    var cont = $("paleta");
    vaciar(cont);
    $("cuentaColores").textContent = P.paleta.length || "";
    if (!P.paleta.length) cont.appendChild(el("p", { clase: "nota", texto: "Aún no hay colores: se tomarán del logo automáticamente." }));
    P.paleta.forEach(function (c, i) {
      var sw = el("div", { clase: "swatch", title: c.nombre }); sw.style.background = "#" + c.hex;
      cont.appendChild(el("div", { clase: "color" }, [sw, el("div", { clase: "pie" }, [
        el("span", { texto: c.hex }),
        el("button", { clase: "quitar", title: "Quitar", texto: "✕", onclick: function () { quitarColor(i); } })
      ])]));
    });
    renderFondosJPG();
  }

  function agregarColores(lista) {
    var nuevos = [];
    lista.forEach(function (c) {
      if (P.paleta.some(function (p) { return p.clave === c.clave; })) return;
      P.paleta.push({ nombre: c.nombre, clave: c.clave, hex: c.hex });
      nuevos.push("tinta:" + c.clave);
    });
    paletaCambio(nuevos);
    return nuevos.length;
  }

  function quitarColor(i) {
    var q = P.paleta.splice(i, 1)[0];
    P.tintasOff = quitarDe(P.tintasOff, q.clave);
    P.fondosJPG = quitarDe(P.fondosJPG, q.clave);
    delete vistas["tinta:" + q.clave];
    P.versiones.forEach(function (v) {
      var antes = (v.mapa || []).length;
      v.mapa = (v.mapa || []).filter(function (x) { return x[1] !== "P:" + q.clave; });
      var cambio = v.mapa.length !== antes;
      if (v.tinta === "P:" + q.clave) { v.tinta = "negro"; cambio = true; }
      if (cambio) refrescarVistas([v.id]);
    });
    paletaCambio([]);
  }

  function paletaCambio(idsNuevos) {
    guardar();
    renderPaleta();
    if (P.tintasMarca) { renderEsquemas(); if (idsNuevos.length) refrescarVistas(idsNuevos); }
    if (ajustandoId) renderAjuste();
    renderResumen();
    refrescarPaquete("siAbierta");
  }

  // Si la marca aún no tiene colores, se toman los del logo (sin blanco ni negro puros)
  function coloresUtiles() { return colores.filter(function (c) { return c.gris > 3 && c.gris < 97; }); }
  function paletaAutomatica() {
    if (P.paleta.length || !colores.length) return;
    var n = agregarColores(coloresUtiles());
    if (n) estado("Tomé " + n + " colores del logo como colores de marca.");
  }

  // --- Comunicación con el motor ---
  function refrescarColores() {
    if (!logos.length) return;
    if (ocupado) { pendiente.colores = true; return; }
    llamar("colores", [logoPrevia()], function (o) {
      colores = o.colores || [];
      paletaAutomatica();
      if (ajustandoId) renderAjuste();
      refrescarVistas();
    });
  }

  function refrescarVistas(ids) {
    if (!logos.length) return;
    if (ocupado) {
      if (!ids) pendiente.vistasTodas = true;
      else ids.forEach(function (id) { pendiente.vistasIds[id] = true; });
      return;
    }
    var envio = esquemas().filter(function (e) { return !ids || contiene(ids, e.id); });
    if (!envio.length) return;
    estado(envio.length === 1 ? "Actualizando miniatura…" : "Actualizando " + envio.length + " miniaturas…");
    llamar("vistas", [logoPrevia(), envio.map(paraMotor), TAM_MINI], function (o) {
      (o.vistas || []).forEach(function (ruta, k) { ponerImagen(envio[k].id, ruta); });
      estado("Listo.");
    });
  }

  $("logoPrevia").addEventListener("change", refrescarColores);
  $("tintasMarca").addEventListener("change", function () {
    P.tintasMarca = $("tintasMarca").checked; guardar();
    renderEsquemas();
    if (P.tintasMarca) {
      if (!P.paleta.length) estado("Agrega colores de la marca abajo.");
      else refrescarVistas(P.paleta.map(function (p) { return "tinta:" + p.clave; }));
    }
    renderResumen(); refrescarPaquete("siAbierta");
  });
  $("btNuevoEsquema").onclick = function () {
    var v = { id: "v" + Date.now(), nombre: "Propio " + (P.versiones.length + 1), activa: true, tipo: "tinta",
              tinta: P.paleta.length ? "P:" + P.paleta[0].clave : "negro", papel: "blanco", regla: "mantener", fondo: "claro", mapa: [] };
    P.versiones.push(v);
    ajustandoId = v.id;
    renderEsquemas(); renderAjuste();
    esquemaCambio(v);
  };
  $("btHex").onclick = function () {
    var t = $("hexNuevo").value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    if (t.length !== 6) { estado("⚠ El HEX debe tener 6 caracteres, por ejemplo FF762C.", "aviso"); return; }
    agregarColores([{ nombre: "#" + t, clave: "HEX:" + t, hex: t }]);
    $("hexNuevo").value = "";
  };
  $("hexNuevo").addEventListener("keydown", function (ev) { if (ev.key === "Enter") $("btHex").onclick(); });
  $("btSelector").onclick = function () {
    llamar("elegirColor", [], function (o) {
      if (o.colores && o.colores.length) agregarColores(o.colores);
      else estado("No se agregó ningún color.");
    });
  };
  $("btDelLogo").onclick = function () {
    if (!colores.length) { refrescarColores(); return; }
    estado(agregarColores(coloresUtiles()) + " colores agregados a la marca.");
  };

  // =====================================================
  // F. PASO 3 · FORMATOS
  // =====================================================
  var FORMATOS = [
    ["PDF", "Vectorial, para imprenta y para enviar"], ["AI", "Editable en Illustrator"],
    ["SVG", "Vectorial para web"], ["EPS", "Para imprentas y programas antiguos"],
    ["PNG", "Imagen con fondo transparente"], ["JPG", "Imagen con fondo de color"]
  ];

  function renderFormatos() {
    var cont = $("formatos");
    vaciar(cont);
    FORMATOS.forEach(function (f) {
      cont.appendChild(el("button", { clase: "formato" + (P.formatos[f[0]] ? " activo" : ""), onclick: function () {
        P.formatos[f[0]] = !P.formatos[f[0]]; guardar();
        renderFormatos(); renderResumen();
        refrescarPaquete("abrir");
      } }, [el("b", { texto: f[0] }), el("small", { texto: f[1] })]));
    });
  }

  function renderFondosJPG() {
    var cont = $("fondosJPG");
    vaciar(cont);
    if (!P.paleta.length) { cont.appendChild(el("p", { clase: "nota", texto: "Agrega colores de marca en el paso 02 para usarlos de fondo." })); return; }
    P.paleta.forEach(function (c) {
      var activo = contiene(P.fondosJPG, c.clave);
      var m = muestra(c.hex);
      cont.appendChild(el("button", { clase: "chip" + (activo ? " activo" : ""), onclick: function () {
        P.fondosJPG = activo ? quitarDe(P.fondosJPG, c.clave) : P.fondosJPG.concat([c.clave]);
        guardar(); renderFondosJPG(); renderResumen(); refrescarPaquete("siAbierta");
      } }, [m, "#" + c.hex]));
    });
  }

  // Reúne todas las opciones en un objeto para el motor
  function cfgActual() {
    return {
      nombre: $("nombreMarca").value, carpeta: P.carpeta, versiones: activosParaMotor(),
      formatos: JSON.parse(JSON.stringify(P.formatos)), pngs: [1200], jpg: 1200, calidadJPG: P.calidadJPG,
      mismoTamano: false, margen: 0, contornos: P.contornos, maestroAI: P.maestroAI, maestroPDF: P.maestroPDF,
      porLogo: P.porLogo,
      fondosJPG: P.paleta.filter(function (c) { return contiene(P.fondosJPG, c.clave); })
        .map(function (c) { return { nombre: c.nombre, clave: c.clave, hex: c.hex, gris: grisDeHex(c.hex) }; })
    };
  }

  // modo: "abrir" | "forzar" | "siAbierta" (solo si la vista previa ya está abierta)
  function refrescarPaquete(modo) {
    if (!logos.length) { if (modo !== "siAbierta") estado("Primero agrega logos en el paso 01."); return; }
    var cfg = cfgActual();
    if (!cfg.versiones.length) { if (modo !== "siAbierta") estado("⚠ Marca al menos un esquema en el paso 02.", "aviso"); return; }
    if (ocupado) {
      var fuerza = { siAbierta: 1, abrir: 2, forzar: 3 };
      if (!pendiente.paquete || fuerza[modo] > fuerza[pendiente.paquete]) pendiente.paquete = modo;
      return;
    }
    if (modo !== "siAbierta") estado("Armando la vista previa del paquete…");
    cfg.forzar = (modo === "forzar");
    cfg.soloSiAbierta = (modo === "siAbierta");
    llamar("paquete", [cfg]);
  }

  $("btVerPaquete").onclick = function () { refrescarPaquete("forzar"); };
  $("btCerrarPaquete").onclick = function () { llamar("cerrarPaquete", []); };
  $("calidadJPG").addEventListener("input", function () { $("calidadValor").textContent = $("calidadJPG").value + "%"; });
  $("calidadJPG").addEventListener("change", function () { P.calidadJPG = parseInt($("calidadJPG").value, 10); guardar(); refrescarPaquete("siAbierta"); });
  ["maestroAI", "maestroPDF", "contornos"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      P[id] = $(id).checked; guardar(); renderResumen();
      if (id === "contornos") refrescarPaquete("siAbierta");
    });
  });

  // =====================================================
  // G. PASO 4 · EXPORTAR
  // =====================================================
  function renderResumen() {
    var nFmt = FORMATOS.filter(function (f) { return P.formatos[f[0]]; }).length;
    var nEsq = esquemas().filter(function (e) { return e.activa; }).length;
    var cont = $("resumen");
    vaciar(cont);
    [[logos.length, "Logos"], [nEsq, "Esquemas"], [nFmt, "Formatos"], [logos.length * nEsq * nFmt, "Archivos aprox."]].forEach(function (d) {
      cont.appendChild(el("div", { clase: "dato" }, [el("b", { texto: String(d[0]) }), el("span", { texto: d[1] })]));
    });
    var ex = $("extras");
    vaciar(ex);
    if (P.formatos.JPG && P.fondosJPG.length) ex.appendChild(el("li", { texto: "JPG sobre " + P.fondosJPG.length + (P.fondosJPG.length === 1 ? " fondo" : " fondos") + " de marca" }));
    if (P.maestroAI) ex.appendChild(el("li", { texto: "Archivo maestro .ai" }));
    if (P.maestroPDF) ex.appendChild(el("li", { texto: "PDF con todas las mesas" }));
    $("ruta").textContent = P.carpeta || "Escritorio";
    $("ruta").title = P.carpeta || "";
  }

  $("btCarpeta").onclick = function () {
    Puente.elegirCarpeta().then(function (r) { if (r) { P.carpeta = r; guardar(); renderResumen(); } });
  };
  Array.prototype.forEach.call(document.querySelectorAll("#organizacion button"), function (b) {
    b.onclick = function () {
      P.porLogo = b.getAttribute("data-v") === "logo"; guardar();
      Array.prototype.forEach.call(document.querySelectorAll("#organizacion button"), function (x) {
        x.classList.toggle("activo", x === b);
      });
    };
  });

  $("btExportar").onclick = function () {
    var cfg = cfgActual();
    var hayFormato = FORMATOS.some(function (f) { return P.formatos[f[0]]; });
    if (!logos.length) { estado("⚠ Primero agrega logos.", "aviso"); irAPaso(1); return; }
    if (!cfg.versiones.length) { estado("⚠ Marca al menos un esquema de color.", "aviso"); irAPaso(2); return; }
    if (!hayFormato && !cfg.maestroAI && !cfg.maestroPDF) { estado("⚠ Elige al menos un formato.", "aviso"); irAPaso(3); return; }
    $("btExportar").disabled = true;
    $("btExportar").textContent = "Generando…";
    estado("Generando el paquete… puede tardar según la cantidad de logos y formatos.");
    llamar("exportar", [cfg], function (o) { pintar(o); aviso(o.mensaje); });
    // El botón vuelve a su estado cuando la cola se vacía
    var revisar = setInterval(function () {
      if (!ocupado && !cola.length) { clearInterval(revisar); $("btExportar").disabled = false; $("btExportar").textContent = "Generar paquete"; }
    }, 400);
  };

  // =====================================================
  // H. INICIO
  // =====================================================
  var pasoActual = 1;
  function irAPaso(n) {
    pasoActual = n;
    Array.prototype.forEach.call(document.querySelectorAll("#pasos button"), function (b) {
      b.classList.toggle("activo", parseInt(b.getAttribute("data-paso"), 10) === n);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".paso"), function (s) { s.classList.toggle("activo", s.id === "paso" + n); });
    $("contenido").scrollTop = 0;
    if (n === 2 && logos.length && !colores.length) refrescarColores();
    if (n === 4) renderResumen();
  }
  Array.prototype.forEach.call(document.querySelectorAll("#pasos button"), function (b) {
    b.onclick = function () { irAPaso(parseInt(b.getAttribute("data-paso"), 10)); };
  });

  // Valores iniciales de los controles
  $("columnas").textContent = P.columnas;
  $("separacion").value = P.separacion;
  $("tintasMarca").checked = !!P.tintasMarca;
  $("calidadJPG").value = P.calidadJPG;
  $("calidadValor").textContent = P.calidadJPG + "%";
  $("maestroAI").checked = !!P.maestroAI;
  $("maestroPDF").checked = !!P.maestroPDF;
  $("contornos").checked = !!P.contornos;
  Array.prototype.forEach.call(document.querySelectorAll("#organizacion button"), function (x) {
    x.classList.toggle("activo", (x.getAttribute("data-v") === "logo") === !!P.porLogo);
  });

  renderLogos(); renderEsquemas(); renderPaleta(); renderFormatos(); renderResumen();
  if (!Puente.enIllustrator) estado("Modo demostración: abre el panel dentro de Illustrator para trabajar con tus archivos.");
  llamar("listar", [], function (o) {
    pintar(o);
    refrescarMiniLogos();
    if (Puente.enIllustrator) estado("Listo. Selecciona un logo en tu mesa de trabajo y pulsa Agregar.");
  });
})();
