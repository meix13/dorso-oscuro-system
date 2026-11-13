// module/apps/solicitar-tirada.mjs

const SOCKET_CHANNEL = "system.dorso_oscuro";

const ATRIBUTOS_LABEL = {
    mental: "Mental",
    fisico: "Físico",
    social: "Social"
};

const dialogosAbiertos = new Set();

/**
 * Devuelve todos los actores de tipo personaje jugables (excluyendo Boss, Papelera, Almas temporales y fichas de mesa).
 */
export function obtenerPersonajesJugadores() {
    return game.actors
        .filter(a =>
            a.type === "personaje" &&
            !a.flags?.dorso_oscuro?.isBossSession &&
            !a.flags?.dorso_oscuro?.isPapelera &&
            !a.flags?.dorso_oscuro?.isTempAlma &&
            !a.system?.esFichaMesa
        )
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Comprueba si un usuario no-GM es dueño del actor objetivo.
 */
function esDuenoObjetivo(actor, user) {
    if (!actor || !user || user.isGM) return false;
    if (user.character?.id === actor.id) return true;
    return actor.testUserPermission(user, "OWNER");
}

/**
 * Ejecuta una tirada de característica (Mental, Físico o Social) y la publica en el chat.
 */
export async function ejecutarTiradaAtributo(actor, atributo, { solicitadoPorDJ = false, motivo = "" } = {}) {
    const formulaDado = actor.system?.atributos?.[atributo] || "1d6";
    const nombreAttr = ATRIBUTOS_LABEL[atributo] || atributo.toUpperCase();

    const roll = new Roll(formulaDado);
    await roll.evaluate();

    let flavor = `<h3><i class="fas fa-dice-d20"></i> Tirada de Característica: ${nombreAttr.toUpperCase()}</h3>`;
    if (solicitadoPorDJ) {
        flavor += `<p style="font-size: 12px; color: #aaa; margin: 2px 0;"><i>Tirada solicitada por el Director de Juego</i></p>`;
    }
    if (motivo) {
        flavor += `<p style="font-size: 12px; color: #d4c4a8; margin: 2px 0;"><b>Motivo:</b> ${foundry.utils.escapeHTML(motivo)}</p>`;
    }

    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor
    });
}

/**
 * Abre el diálogo de tirada de habilidad para un actor e ítem concreto.
 * Permite tirar aunque tenga 0 puntos disponibles (en ese caso no podrá gastar puntos).
 */
export function abrirDialogoTiradaHabilidad(actor, item, { solicitadoPorDJ = false, motivo = "", requestId = null } = {}) {
    if (!actor || !item) return;

    const puntosDisponibles = Math.max(0, Number(item.system?.valorActual) || 0);
    const atributoBase = item.system?.atributoBase || "mental";
    const nombreAttr = ATRIBUTOS_LABEL[atributoBase] || atributoBase.toUpperCase();
    const dadoAtributo = actor.system?.atributos?.[atributoBase] || "1d6";
    const sinPuntos = puntosDisponibles <= 0;

    const headerSolicitud = solicitadoPorDJ
        ? `<div style="background: rgba(139,0,0,0.35); border: 1px solid #8b0000; border-radius: 5px; padding: 6px 8px; margin-bottom: 10px; font-size: 13px; color: #ffcccc;">
                <i class="fas fa-dragon" style="color: #ffaa00;"></i> <b>El Director de Juego solicita esta tirada</b>
                ${motivo ? `<div style="margin-top: 4px; color: #f5e6c8;">"${foundry.utils.escapeHTML(motivo)}"</div>` : ""}
           </div>`
        : "";

    const avisoSinPuntos = sinPuntos
        ? `<p style="font-size: 12px; color: #ffaa00; margin: 6px 0 0 0;">No te quedan puntos en esta habilidad: puedes lanzar igualmente sin gastar puntos (${dadoAtributo}).</p>`
        : "";

    const titulo = solicitadoPorDJ ? `Tirada Solicitada: ${item.name} (${actor.name})` : `Usar ${item.name}`;

    if (requestId) dialogosAbiertos.add(requestId);

    const dlg = new Dialog({
        title: titulo,
        content: `
            <div style="padding: 10px; text-align: center; color: #e0e0e0;">
                ${headerSolicitud}
                <p style="font-size: 15px; margin-bottom: 10px;">
                    <b>${foundry.utils.escapeHTML(actor.name)}</b> — <b>${foundry.utils.escapeHTML(item.name)}</b><br>
                    <span style="font-size: 12px; color: #aaa;">Característica: <b>${nombreAttr}</b> (${dadoAtributo})</span>
                </p>
                <p style="font-size: 14px; margin-bottom: 12px;">
                    ¿Cuántos puntos de <b>${foundry.utils.escapeHTML(item.name)}</b> quieres gastar?<br>
                    <span style="font-size: 12px; color: #aaa;">(Máximo disponible: ${puntosDisponibles})</span>
                </p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <i class="fas fa-bolt" style="color: ${sinPuntos ? "#666" : "#00ccff"}; font-size: 24px;"></i>
                    <input type="number" id="puntos-gasto" value="0" min="0" max="${puntosDisponibles}" ${sinPuntos ? "disabled" : ""}
                           style="width: 80px; height: 45px; text-align: center; background: #111; color: ${sinPuntos ? "#777" : "#fff"}; border: 2px solid ${sinPuntos ? "#555" : "#00ccff"}; font-size: 24px; font-weight: bold; border-radius: 5px; font-family: 'Kalam', cursive;">
                </div>
                ${avisoSinPuntos}
            </div>
        `,
        buttons: {
            lanzar: {
                icon: '<i class="fas fa-dice"></i>',
                label: "Lanzar Dado",
                callback: async (htmlContent) => {
                    let gasto = sinPuntos ? 0 : parseInt(htmlContent.find("#puntos-gasto").val(), 10);
                    if (isNaN(gasto)) gasto = 0;

                    if (gasto > puntosDisponibles || gasto < 0) {
                        return ui.notifications.error("Cantidad de puntos inválida.");
                    }

                    if (gasto > 0) {
                        await item.update({ "system.valorActual": puntosDisponibles - gasto });
                    }

                    const formula = gasto > 0 ? `${dadoAtributo} + ${gasto}` : `${dadoAtributo}`;
                    const roll = new Roll(formula);
                    await roll.evaluate();

                    let flavor = `<h3><i class="fas fa-dice-d20"></i> ${foundry.utils.escapeHTML(item.name)}</h3>Utiliza Característica <b>${nombreAttr.toUpperCase()}</b> gastando <b>${gasto}</b> punto(s).`;
                    if (solicitadoPorDJ) {
                        flavor += `<br><span style="font-size: 12px; color: #aaa;"><i>Solicitada por el Director de Juego${motivo ? `: ${foundry.utils.escapeHTML(motivo)}` : ""}</i></span>`;
                    }

                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        flavor
                    });
                }
            }
        },
        close: () => {
            if (requestId) dialogosAbiertos.delete(requestId);
        },
        default: "lanzar"
    }, { width: 370, classes: ["dorso_oscuro", "dialog"] });

    dlg.render(true);
}

/**
 * Abre el diálogo en el cliente del jugador cuando recibe una solicitud del DJ.
 */
export function mostrarDialogoTiradaSolicitada(req) {
    if (!req || !req.actorId) return;
    if (req.requestId && dialogosAbiertos.has(req.requestId)) return;

    const actor = game.actors.get(req.actorId);
    if (!actor) {
        return ui.notifications.warn("No se encontró el personaje para la tirada solicitada.");
    }

    if (req.tipo === "habilidad") {
        const item = (req.itemId ? actor.items.get(req.itemId) : null)
            || actor.items.find(i => i.type === "habilidad" && i.name === req.skillName);

        if (!item) {
            return ui.notifications.warn(`${actor.name} no posee la habilidad "${req.skillName || ""}".`);
        }

        abrirDialogoTiradaHabilidad(actor, item, {
            solicitadoPorDJ: true,
            motivo: req.motivo || "",
            requestId: req.requestId || null
        });
        return;
    }

    // Tirada de Característica (Mental / Físico / Social)
    const atributo = req.atributo || "mental";
    const nombreAttr = ATRIBUTOS_LABEL[atributo] || atributo.toUpperCase();
    const formulaDado = actor.system?.atributos?.[atributo] || "1d6";

    if (req.requestId) dialogosAbiertos.add(req.requestId);

    const dlg = new Dialog({
        title: `Tirada Solicitada: ${nombreAttr} (${actor.name})`,
        content: `
            <div style="padding: 10px; text-align: center; color: #e0e0e0;">
                <div style="background: rgba(139,0,0,0.35); border: 1px solid #8b0000; border-radius: 5px; padding: 6px 8px; margin-bottom: 12px; font-size: 13px; color: #ffcccc;">
                    <i class="fas fa-dragon" style="color: #ffaa00;"></i> <b>El Director de Juego solicita una tirada</b>
                    ${req.motivo ? `<div style="margin-top: 4px; color: #f5e6c8;">"${foundry.utils.escapeHTML(req.motivo)}"</div>` : ""}
                </div>
                <p style="font-size: 16px; margin-bottom: 6px;">
                    <b>${foundry.utils.escapeHTML(actor.name)}</b>
                </p>
                <p style="font-size: 15px; color: #00ccff; margin-bottom: 4px;">
                    Característica: <b>${nombreAttr}</b>
                </p>
                <p style="font-size: 14px; color: #aaa;">
                    Dado asignado: <b style="color: #fff;">${formulaDado.toUpperCase()}</b>
                </p>
            </div>
        `,
        buttons: {
            lanzar: {
                icon: '<i class="fas fa-dice"></i>',
                label: `Lanzar ${formulaDado.toUpperCase()}`,
                callback: async () => {
                    await ejecutarTiradaAtributo(actor, atributo, {
                        solicitadoPorDJ: true,
                        motivo: req.motivo || ""
                    });
                }
            }
        },
        close: () => {
            if (req.requestId) dialogosAbiertos.delete(req.requestId);
        },
        default: "lanzar"
    }, { width: 360, classes: ["dorso_oscuro", "dialog"] });

    dlg.render(true);
}

/**
 * Abre la ventana del DJ para seleccionar PJ(s) y la Característica o Habilidad a solicitar.
 */
export function abrirDialogoSolicitarTirada(actorIdInicial = null) {
    if (!game.user.isGM) return;

    const personajes = obtenerPersonajesJugadores();
    if (personajes.length === 0) {
        return ui.notifications.warn("No hay personajes de jugadores disponibles en la partida.");
    }

    const defaultIds = actorIdInicial && personajes.some(p => p.id === actorIdInicial)
        ? [actorIdInicial]
        : [personajes[0].id];

    const checkboxesPJs = personajes.map(p => {
        const checked = defaultIds.includes(p.id) ? "checked" : "";
        const conectado = game.users.some(u => !u.isGM && u.active && (u.character?.id === p.id || p.testUserPermission(u, "OWNER")));
        const estadoColor = conectado ? "#66ff66" : "#888";
        const estadoTitulo = conectado ? "Jugador conectado" : "Jugador desconectado (recibirá el botón en el chat)";
        return `
            <label style="display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: rgba(255,255,255,0.04); border: 1px solid #444; border-radius: 5px; cursor: pointer;">
                <input type="checkbox" class="do-req-actor-chk" value="${p.id}" ${checked}>
                <img src="${p.img}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid #666;">
                <span style="flex: 1; color: #f0e6d2; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${foundry.utils.escapeHTML(p.name)}</span>
                <span title="${estadoTitulo}" style="width: 8px; height: 8px; border-radius: 50%; background: ${estadoColor}; flex: 0 0 auto;"></span>
            </label>
        `;
    }).join("");

    const content = `
        <div class="do-solicitar-tirada-form" style="padding: 8px; color: #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="font-weight: bold; color: #ffaa00; font-size: 13px;">1. Selecciona Personaje(s)</label>
                <div style="display: flex; gap: 6px;">
                    <button type="button" class="do-req-select-all" style="font-size: 11px; padding: 2px 8px; cursor: pointer;">Todos</button>
                    <button type="button" class="do-req-select-none" style="font-size: 11px; padding: 2px 8px; cursor: pointer;">Ninguno</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; max-height: 160px; overflow-y: auto; margin-bottom: 12px; padding: 4px; background: rgba(0,0,0,0.35); border: 1px solid #333; border-radius: 5px;">
                ${checkboxesPJs}
            </div>

            <div style="margin-bottom: 10px;">
                <label style="font-weight: bold; color: #ffaa00; font-size: 13px; display: block; margin-bottom: 6px;">2. ¿Qué quieres solicitar?</label>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <label style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px; background: rgba(0,0,0,0.45); border: 1px solid #555; border-radius: 5px; cursor: pointer;">
                        <input type="radio" name="do-req-tipo" value="caracteristica" checked>
                        <span>Característica</span>
                    </label>
                    <label style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px; background: rgba(0,0,0,0.45); border: 1px solid #555; border-radius: 5px; cursor: pointer;">
                        <input type="radio" name="do-req-tipo" value="habilidad">
                        <span>Habilidad</span>
                    </label>
                </div>

                <div id="do-req-panel-caracteristica">
                    <select id="do-req-atributo" style="width: 100%; padding: 6px; background: #141414; color: #fff; border: 1px solid #00ccff; border-radius: 4px; font-size: 14px;">
                        <option value="mental">Mental</option>
                        <option value="fisico">Físico</option>
                        <option value="social">Social</option>
                    </select>
                </div>

                <div id="do-req-panel-habilidad" style="display: none;">
                    <select id="do-req-habilidad" style="width: 100%; padding: 6px; background: #141414; color: #fff; border: 1px solid #00ccff; border-radius: 4px; font-size: 14px;"></select>
                </div>
            </div>

            <div>
                <label style="font-weight: bold; color: #aaa; font-size: 12px; display: block; margin-bottom: 4px;">Motivo / Nota (opcional)</label>
                <input type="text" id="do-req-motivo" placeholder="Ej: Para escuchar tras la puerta..." style="width: 100%; padding: 6px; background: #141414; color: #fff; border: 1px solid #444; border-radius: 4px;">
            </div>
        </div>
    `;

    const actualizarListaHabilidades = (htmlContent) => {
        const selectedIds = [];
        htmlContent.find(".do-req-actor-chk:checked").each(function () {
            selectedIds.push($(this).val());
        });

        const selectHab = htmlContent.find("#do-req-habilidad");
        const valorPrevio = selectHab.val();
        selectHab.empty();

        const actores = selectedIds.map(id => game.actors.get(id)).filter(Boolean);
        if (actores.length === 0) {
            selectHab.append(`<option value="">Selecciona al menos un personaje...</option>`);
            return;
        }

        // Recopilamos las habilidades (si hay 1 PJ, mostramos sus puntos actuales/max)
        const mapaHabs = new Map();
        for (const actor of actores) {
            const habs = actor.items.filter(i => i.type === "habilidad");
            for (const h of habs) {
                if (!mapaHabs.has(h.name)) {
                    mapaHabs.set(h.name, {
                        name: h.name,
                        tipo: h.system?.tipo || "general",
                        atributoBase: h.system?.atributoBase || "mental",
                        valorActual: h.system?.valorActual ?? 0,
                        valorMax: h.system?.valorMax ?? 0
                    });
                }
            }
        }

        const lista = Array.from(mapaHabs.values()).sort((a, b) => a.name.localeCompare(b.name));
        if (lista.length === 0) {
            selectHab.append(`<option value="">Este personaje no tiene habilidades</option>`);
            return;
        }

        const generales = lista.filter(h => h.tipo === "general");
        const tecnicas = lista.filter(h => h.tipo === "tecnica");

        const crearOpciones = (items) => items.map(h => {
            const attr = ATRIBUTOS_LABEL[h.atributoBase] || h.atributoBase;
            const puntosTxt = actores.length === 1 ? ` — ${h.valorActual}/${h.valorMax} pts` : "";
            return `<option value="${foundry.utils.escapeHTML(h.name)}">${foundry.utils.escapeHTML(h.name)} (${attr}${puntosTxt})</option>`;
        }).join("");

        if (generales.length > 0) {
            selectHab.append(`<optgroup label="Habilidades Generales">${crearOpciones(generales)}</optgroup>`);
        }
        if (tecnicas.length > 0) {
            selectHab.append(`<optgroup label="Habilidades Técnicas">${crearOpciones(tecnicas)}</optgroup>`);
        }

        if (valorPrevio && lista.some(h => h.name === valorPrevio)) {
            selectHab.val(valorPrevio);
        }
    };

    new Dialog({
        title: "Solicitar Tirada a Jugadores",
        content,
        buttons: {
            enviar: {
                icon: '<i class="fas fa-paper-plane"></i>',
                label: "Solicitar Tirada",
                callback: async (htmlContent) => {
                    const selectedIds = [];
                    htmlContent.find(".do-req-actor-chk:checked").each(function () {
                        selectedIds.push($(this).val());
                    });

                    if (selectedIds.length === 0) {
                        return ui.notifications.warn("Debes seleccionar al menos un personaje.");
                    }

                    const tipo = htmlContent.find('input[name="do-req-tipo"]:checked').val();
                    const atributo = htmlContent.find("#do-req-atributo").val();
                    const skillName = htmlContent.find("#do-req-habilidad").val();
                    const motivo = (htmlContent.find("#do-req-motivo").val() || "").trim();

                    if (tipo === "habilidad" && !skillName) {
                        return ui.notifications.warn("Selecciona una habilidad válida.");
                    }

                    const requests = [];
                    for (const actorId of selectedIds) {
                        const actor = game.actors.get(actorId);
                        if (!actor) continue;

                        if (tipo === "habilidad") {
                            const item = actor.items.find(i => i.type === "habilidad" && i.name === skillName);
                            if (!item) {
                                ui.notifications.warn(`${actor.name} no tiene la habilidad "${skillName}". Se omite.`);
                                continue;
                            }
                            requests.push({
                                requestId: foundry.utils.randomID(),
                                actorId: actor.id,
                                actorName: actor.name,
                                tipo: "habilidad",
                                itemId: item.id,
                                skillName: item.name,
                                motivo
                            });
                        } else {
                            requests.push({
                                requestId: foundry.utils.randomID(),
                                actorId: actor.id,
                                actorName: actor.name,
                                tipo: "caracteristica",
                                atributo,
                                motivo
                            });
                        }
                    }

                    if (requests.length === 0) return;

                    // 1. Emitir por socket para abrir el diálogo automáticamente en los clientes de los jugadores
                    game.socket.emit(SOCKET_CHANNEL, {
                        action: "solicitarTirada",
                        requests
                    });

                    // 2. Publicar tarjeta en el chat como respaldo (por si algún jugador cerró el diálogo o no estaba atento)
                    for (const req of requests) {
                        const actor = game.actors.get(req.actorId);
                        const owners = game.users
                            .filter(u => !u.isGM && (u.character?.id === actor.id || actor.testUserPermission(u, "OWNER")))
                            .map(u => u.id);

                        const whisper = Array.from(new Set([...owners, game.user.id]));
                        const etiquetaTirada = req.tipo === "habilidad"
                            ? `Habilidad: <b>${foundry.utils.escapeHTML(req.skillName)}</b>`
                            : `Característica: <b>${ATRIBUTOS_LABEL[req.atributo] || req.atributo}</b>`;

                        await ChatMessage.create({
                            speaker: { alias: "Director de Juego" },
                            whisper,
                            content: `
                                <div style="background: rgba(20,15,15,0.92); border: 1px solid #8b0000; border-radius: 6px; padding: 8px; color: #f0e6d2;">
                                    <div style="font-weight: bold; color: #ffaa00; margin-bottom: 4px;">
                                        <i class="fas fa-dice-d20"></i> Tirada Solicitada para ${foundry.utils.escapeHTML(req.actorName)}
                                    </div>
                                    <div style="font-size: 13px; margin-bottom: 6px;">${etiquetaTirada}</div>
                                    ${req.motivo ? `<div style="font-size: 12px; color: #ccc; font-style: italic; margin-bottom: 6px;">"${foundry.utils.escapeHTML(req.motivo)}"</div>` : ""}
                                    <button type="button" class="do-btn-tirada-solicitada" style="width: 100%; background: #8b0000; color: #fff; border: 1px solid #ff4444; border-radius: 4px; padding: 5px; font-weight: bold; cursor: pointer;">
                                        <i class="fas fa-dice"></i> Realizar Tirada
                                    </button>
                                </div>
                            `,
                            flags: {
                                dorso_oscuro: {
                                    solicitudTirada: req
                                }
                            }
                        });
                    }

                    ui.notifications.info(`Solicitud de tirada enviada a ${requests.length} personaje(s).`);
                }
            },
            cancelar: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancelar"
            }
        },
        render: (htmlContent) => {
            actualizarListaHabilidades(htmlContent);

            htmlContent.find(".do-req-actor-chk").change(() => actualizarListaHabilidades(htmlContent));

            htmlContent.find(".do-req-select-all").click(() => {
                htmlContent.find(".do-req-actor-chk").prop("checked", true);
                actualizarListaHabilidades(htmlContent);
            });

            htmlContent.find(".do-req-select-none").click(() => {
                htmlContent.find(".do-req-actor-chk").prop("checked", false);
                actualizarListaHabilidades(htmlContent);
            });

            htmlContent.find('input[name="do-req-tipo"]').change(function () {
                const esHab = $(this).val() === "habilidad";
                htmlContent.find("#do-req-panel-habilidad").toggle(esHab);
                htmlContent.find("#do-req-panel-caracteristica").toggle(!esHab);
            });
        },
        default: "enviar"
    }, { width: 460, classes: ["dorso_oscuro", "dialog"] }).render(true);
}

/**
 * Registra los listeners de socket y del botón en mensajes de chat.
 */
export function inicializarSistemaTiradasSolicitadas() {
    game.socket.on(SOCKET_CHANNEL, (payload) => {
        if (!payload || payload.action !== "solicitarTirada") return;
        if (!Array.isArray(payload.requests)) return;

        for (const req of payload.requests) {
            const actor = game.actors.get(req.actorId);
            if (!actor) continue;
            if (esDuenoObjetivo(actor, game.user)) {
                mostrarDialogoTiradaSolicitada(req);
            }
        }
    });

    Hooks.on("renderChatMessageHTML", (message, htmlElement) => {
        const req = message.getFlag("dorso_oscuro", "solicitudTirada");
        if (!req) return;

        const botones = htmlElement.querySelectorAll(".do-btn-tirada-solicitada");
        botones.forEach(btn => {
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                const actor = game.actors.get(req.actorId);
                if (!actor) {
                    return ui.notifications.warn("El personaje ya no existe en la partida.");
                }
                if (!game.user.isGM && !esDuenoObjetivo(actor, game.user)) {
                    return ui.notifications.warn("Esta tirada pertenece a otro jugador.");
                }
                mostrarDialogoTiradaSolicitada(req);
            });
        });
    });
}
