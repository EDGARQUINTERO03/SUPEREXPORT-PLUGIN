/* =========================================================
   SuperExport — PUENTE entre el panel (HTML) y el motor (Illustrator)
   - Dentro de Illustrator: envía cada orden al motor SuperExport_core.jsxinc.
   - Fuera de Illustrator (navegador): modo demostración con datos de prueba,
     para ver y diseñar el panel sin abrir Illustrator.
   ========================================================= */

var Puente = (function () {
  var VERSION_MOTOR = "7.3";       // debe coincidir con VERSION_MOTOR del motor
  var cep = window.__adobe_cep__;
  var enIllustrator = !!(cep && cep.evalScript);

  // Convierte la respuesta del motor (clave=valor&...) en un objeto
  function leerRespuesta(txt) {
    txt = String(txt || "");
    if (txt.indexOf("ok=") !== 0) return { ok: false, error: "Respuesta inesperada del motor: " + txt.substr(0, 300) };
    var o = {}, pares = txt.split("&");
    pares.forEach(function (par) {
      var p = par.split("="), clave = p[0], valor = p.slice(1).join("=");
      if (clave === "ok") o.ok = (valor === "1");
      else if (clave === "seleccion") o.seleccion = parseInt(valor, 10);
      else if (clave === "logos") o.logos = valor ? valor.split(",").map(decodeURIComponent) : [];
      else if (clave === "colores") {
        o.colores = !valor ? [] : valor.split(",").map(function (c) {
          var f = c.split(";");
          return { clave: decodeURIComponent(f[0]), hex: f[1], nombre: decodeURIComponent(f[2]), gris: parseFloat(f[3]) };
        });
      } else if (clave === "vistas") o.vistas = valor.split(",").map(decodeURIComponent);
      else o[clave] = decodeURIComponent(valor);
    });
    return o;
  }

  // Ruta de la carpeta del panel en disco
  function rutaPanel() {
    var p = decodeURI(cep.getSystemPath("extension"));
    if (/^file:\/\/\/[A-Za-z]:/.test(p)) return p.replace("file:///", "");
    return p.replace("file://", "");
  }

  function evalScript(codigo) {
    return new Promise(function (resolver) { cep.evalScript(codigo, resolver); });
  }

  // ---------- Dentro de Illustrator ----------
  function ejecutarReal(funcion, args) {
    var motor = rutaPanel() + "/jsx/SuperExport_core.jsxinc";
    var datos = encodeURIComponent(JSON.stringify(args || []));
    var codigo =
      "(function(){try{" +
      "if(!$.global.LP||$.global.LP.version!=='" + VERSION_MOTOR + "')" +
      "$.evalFile(new File(decodeURIComponent('" + encodeURIComponent(motor) + "')));" +
      "return $.global.LP.ejecutar('" + funcion + "',eval(decodeURIComponent('" + datos + "')));" +
      "}catch(e){return 'ok=0&error='+encodeURIComponent(e.message+(e.line?' (línea '+e.line+')':''));}})()";
    return evalScript(codigo).then(leerRespuesta);
  }

  function elegirCarpetaReal() {
    return evalScript("(function(){var f=Folder.selectDialog('¿Dónde guardo el paquete?');return f?encodeURIComponent(f.fsName):'';})()")
      .then(function (r) { return r && r !== "EvalScript error." ? decodeURIComponent(r) : ""; });
  }

  // Ruta de archivo → dirección que puede mostrar una <img>
  function urlArchivo(ruta) {
    if (!ruta) return "";
    if (/^data:/.test(ruta)) return ruta;
    var r = String(ruta).replace(/\\/g, "/");
    return "file://" + (r.charAt(0) === "/" ? "" : "/") + encodeURI(r).replace(/#/g, "%23");
  }

  // ---------- Modo demostración (navegador) ----------
  var demo = {
    logos: ["Horizontal", "Isotipo", "Vertical"],
    colores: [
      { clave: "RGB:5,23,10", hex: "05170A", nombre: "#05170A", gris: 92 },
      { clave: "RGB:7,70,52", hex: "074634", nombre: "#074634", gris: 78 },
      { clave: "RGB:255,118,44", hex: "FF762C", nombre: "#FF762C", gris: 40 },
      { clave: "RGB:241,234,212", hex: "F1EAD4", nombre: "#F1EAD4", gris: 9 },
      { clave: "RGB:255,255,255", hex: "FFFFFF", nombre: "#FFFFFF", gris: 0 }
    ],
    paquete: false
  };

  function resumenDemo(extra) {
    var r = { ok: true, documento: "SuperExport_Demo", carpeta: "C:/Usuarios/Diseño/Escritorio", logos: demo.logos.slice() };
    for (var k in extra) r[k] = extra[k];
    return r;
  }

  // Dibuja una miniatura de ejemplo (círculo + "03") aplicando el esquema de forma aproximada
  function miniaturaDemo(v) {
    var fondo = v.fondoColor ? "#" + v.fondoColor.split(":").pop() : (v.fondo === "oscuro" ? "#262626" : "#F2F2F2");
    var circulo = "#05170A", mano = "#FF762C", texto = "#05170A", cero = "#FF762C";
    function tinta(d) { return d === "negro" ? "#000000" : d === "blanco" ? "#FFFFFF" : d && d.indexOf("P:") === 0 ? "#" + d.split(":").pop().replace(/^RGB.*/, "FF762C") : "#000000"; }
    if (v.tipo === "tinta") {
      var t = v.tinta && v.tinta.indexOf("HEX:") >= 0 ? "#" + v.tinta.split(":").pop() : tinta(v.tinta);
      if (v.tinta && v.tinta.indexOf("RGB:") >= 0) { var n = v.tinta.split(":").pop().split(","); t = "rgb(" + n.join(",") + ")"; }
      var hueco = v.papel === "fondo" ? fondo : "#FFFFFF";
      circulo = t; mano = hueco; texto = t; cero = t;
    } else if (v.tipo === "grises") {
      circulo = "#1A1A1A"; mano = "#8C8C8C"; texto = "#1A1A1A"; cero = "#8C8C8C";
    } else if (v.tipo === "mapa" && v.regla === "invertida") {
      circulo = "#FFFFFF"; mano = "#FF762C"; texto = "#FFFFFF"; cero = "#FF762C";
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="' + fondo + '"/>' +
      '<circle cx="34" cy="60" r="20" fill="' + circulo + '"/><path d="M26 52h12l4 6-6 10h-8l-4-8z" fill="' + mano + '"/>' +
      '<rect x="60" y="54" width="34" height="5" fill="' + texto + '"/><rect x="60" y="62" width="24" height="4" fill="' + texto + '"/>' +
      '<text x="88" y="68" font-family="Arial Black" font-size="14" fill="' + cero + '">SE</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Miniatura de ejemplo para la lista de logos (una forma distinta por logo)
  function logoDemo(i) {
    var formas = [
      '<circle cx="18" cy="32" r="10" fill="#05170A"/><rect x="32" y="27" width="22" height="4" fill="#05170A"/><rect x="32" y="34" width="14" height="3" fill="#FF762C"/>',
      '<circle cx="32" cy="32" r="16" fill="#05170A"/><path d="M26 26h10l4 6-5 8h-7l-3-7z" fill="#FF762C"/>',
      '<circle cx="32" cy="22" r="10" fill="#05170A"/><rect x="20" y="36" width="24" height="4" fill="#05170A"/><rect x="24" y="43" width="16" height="3" fill="#FF762C"/>',
      '<ellipse cx="32" cy="34" rx="15" ry="13" fill="#05170A"/><circle cx="26" cy="28" r="4" fill="#fff"/><circle cx="38" cy="28" r="4" fill="#fff"/><path d="M22 42h20l-4 6h-12z" fill="#FF762C"/>'
    ];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#F2F2F2"/>' + formas[i % formas.length] + '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function ejecutarDemo(funcion, args) {
    return new Promise(function (resolver) {
      setTimeout(function () {
        var a = args || [], r;
        switch (funcion) {
          case "listar": r = resumenDemo({}); break;
          case "agregar":
            var nom = (a[0] || "").trim() || "Logo_0" + (demo.logos.length + 1);
            demo.logos.push(nom);
            r = resumenDemo({ mensaje: "Agregado: " + nom + " (mesa de trabajo creada).", seleccion: demo.logos.length - 1 });
            break;
          case "quitar":
            var q = demo.logos.splice(a[0], 1)[0];
            r = resumenDemo({ mensaje: "Quitado de la lista: " + q + ".", seleccion: Math.min(a[0], demo.logos.length - 1) });
            break;
          case "renombrar": demo.logos[a[0]] = a[1]; r = resumenDemo({ mensaje: "Renombrado a " + a[1] + ".", seleccion: a[0] }); break;
          case "mover":
            var d = a[0] + a[1];
            if (d >= 0 && d < demo.logos.length) { var t = demo.logos[a[0]]; demo.logos[a[0]] = demo.logos[d]; demo.logos[d] = t; }
            r = resumenDemo({ mensaje: "Orden actualizado.", seleccion: Math.max(0, Math.min(d, demo.logos.length - 1)) });
            break;
          case "reordenar": r = resumenDemo({ mensaje: "Mesas de trabajo reordenadas." }); break;
          case "limpiarMesas": r = resumenDemo({ mensaje: "1 mesa de trabajo eliminada." }); break;
          case "enfocar": r = resumenDemo({ seleccion: a[0] }); break;
          case "colores": r = resumenDemo({ colores: demo.colores, mensaje: demo.colores.length + " colores detectados." }); break;
          case "vistas": r = resumenDemo({ vistas: (a[1] || []).map(miniaturaDemo) }); break;
          case "miniaturas": r = resumenDemo({ vistas: demo.logos.map(function (n, i) { return logoDemo(i); }) }); break;
          case "paquete":
            if (a[0] && a[0].soloSiAbierta && !demo.paquete) { r = resumenDemo({}); break; }
            demo.paquete = true;
            r = resumenDemo({ mensaje: "Vista previa lista (demostración)." });
            break;
          case "cerrarPaquete": demo.paquete = false; r = resumenDemo({ mensaje: "Vista previa cerrada." }); break;
          case "elegirColor":
            var hex = ["5B3FD9", "2BB673", "F2C230", "E8456B"][Math.floor(Math.random() * 4)];
            r = resumenDemo({ colores: [{ clave: "HEX:" + hex, hex: hex, nombre: "#" + hex, gris: 40 }] });
            break;
          case "exportar": r = resumenDemo({ mensaje: "Paquete listo (demostración): los archivos se generan dentro de Illustrator." }); break;
          default: r = { ok: false, error: "Función desconocida: " + funcion };
        }
        resolver(r);
      }, funcion === "vistas" ? 350 : 120);
    });
  }

  return {
    enIllustrator: enIllustrator,
    ejecutar: enIllustrator ? ejecutarReal : ejecutarDemo,
    elegirCarpeta: enIllustrator ? elegirCarpetaReal : function () { return Promise.resolve("D:/Clientes/Marca"); },
    urlArchivo: urlArchivo
  };
})();
