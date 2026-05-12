import { PersonajeSheet } from "../sheets/personaje-sheet.mjs";

export class DJHUD extends Application {
    constructor(options = {}) {
        super(options);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "dj-hud",
            title: "Panel del Director de Juego",
            template: "systems/dorso_oscuro/templates/apps/dj-hud.hbs",
            width: 1200,
            height: 350, // Volvemos a tu altura original compacta
            classes: ["dorso_oscuro", "dj-hud-app"],
            resizable: true,
            minimizable: true,
            tabs: [{ navSelector: ".dj-tabs", contentSelector: ".dj-body", initial: "radar" }]
        });
    }

    // --- BOTÓN DE MINIMIZAR ---
    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons.unshift({
            label: "Minimizar",
            class: "minimize-hud",
            icon: "fas fa-minus",
            onclick: ev => {
                if (this._minimized) this.maximize();
                else this.minimize();
            }
        });
        return buttons;
    }

    async getData() {
        const data = await super.getData();

        // 1. RADAR DE JUGADORES
        const personajes = game.actors.filter(a => a.type === "personaje" && a.hasPlayerOwner && a.system.almaActivaId);

        data.jugadores = personajes.map(actor => {
            const alma = actor.items.get(actor.system.almaActivaId);
            const hand = game.cards.get(actor.system.handId);
            const deck = game.cards.get(actor.system.deckId);
            const discard = game.cards.get(actor.system.discardId);
            const eliminadas = game.cards.get(actor.system.eliminadasId);
            const enJuego = game.cards.get(actor.system.enJuegoId);

            // Buscamos TODOS los poderes/objetos con vida "En Juego" de este jugador
            const cartasVivasEnMesa = [];
            if (enJuego) {
                enJuego.cards.forEach(c => {
                    const itemId = c.getFlag("dorso_oscuro", "itemId");
                    const item = actor.items.get(itemId);
                    if (item && (item.type === "carta_poder" || item.type === "carta_objeto") && item.system.vida?.max > 0) {
                        cartasVivasEnMesa.push(item);
                    }
                });
            }

            return {
                actor,
                system: actor.system,
                alma,
                cartasVivas: cartasVivasEnMesa,
                cartas: {
                    mano: hand?.cards.size || 0,
                    mazo: deck?.availableCards.length || 0,
                    descarte: discard?.cards.size || 0,
                    eliminadas: eliminadas?.cards.size || 0
                }
            };
        });

        // 2. SECCIÓN DE CRIATURA (BOSS)
        const criaturaActiva = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
        if (criaturaActiva) {
            data.activeBoss = criaturaActiva;
            data.bossAlma = criaturaActiva.items.find(i => i.type === "carta_alma");
            const hand = game.cards.get(criaturaActiva.system.handId);
            const deck = game.cards.get(criaturaActiva.system.deckId);
            const enJuegoBoss = game.cards.get(criaturaActiva.system.enJuegoId); // Buscamos su mesa

            // --- NUEVO: Buscamos cartas con vida activas del Boss ---
            const cartasVivasBossEnMesa = [];
            if (enJuegoBoss) {
                enJuegoBoss.cards.forEach(c => {
                    const itemId = c.getFlag("dorso_oscuro", "itemId");
                    const item = criaturaActiva.items.get(itemId);
                    if (item && (item.type === "carta_poder" || item.type === "carta_objeto") && item.system.vida?.max > 0) {
                        cartasVivasBossEnMesa.push(item);
                    }
                });
            }
            data.bossCartasVivas = cartasVivasBossEnMesa;
            // --------------------------------------------------------

            const manoTotal = hand?.cards || [];
            data.bossPoderes = manoTotal.filter(c => {
                const item = criaturaActiva.items.get(c.getFlag("dorso_oscuro", "itemId"));
                return item?.type === "carta_poder";
            });
            data.bossObjetos = manoTotal.filter(c => {
                const item = criaturaActiva.items.get(c.getFlag("dorso_oscuro", "itemId"));
                return item?.type === "carta_objeto";
            });

            data.bossMazoSize = deck?.availableCards.length || 0;
            const token = canvas.tokens.placeables.find(t => t.actor?.id === criaturaActiva.id);
            data.bossIsFaceDown = token ? token.document.getFlag("dorso_oscuro", "isFaceDown") : true;
        } else {
            data.disponibles = game.items.filter(i => i.type === "carta_alma" && i.system.esCriatura);
        }

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- SELECTOR DE CRIATURA ---
        html.find('.select-boss').click(async ev => {
            const bossId = ev.currentTarget.dataset.id;
            const bossTemplate = game.items.get(bossId);

            ui.notifications.info(`Invocando a ${bossTemplate.name}...`);

            // --- 1. LOCALIZAR LA RAÍZ DE LA CRIATURA ---
            const carpetaAlma = bossTemplate.folder;
            // CORRECCIÓN: Foundry usa .folder para ver quién es el padre, no .parent
            const carpetaRaizBoss = carpetaAlma?.folder;

            let itemsParaElBoss = [];
            if (carpetaRaizBoss) {
                // Buscamos todos los ítems que cuelguen de la carpeta raíz o de sus subcarpetas
                itemsParaElBoss = game.items.filter(i => {
                    let f = i.folder;
                    while (f) {
                        if (f.id === carpetaRaizBoss.id) return true;
                        f = f.folder; // CORRECCIÓN: Subimos al siguiente padre
                    }
                    return false;
                });
            } else {
                // Si no hay estructura, al menos nos llevamos el alma seleccionada
                itemsParaElBoss = [bossTemplate];
            }

            // --- 2. GESTIÓN DE CARPETAS DE ACTORES (CARTAS/CRIATURAS) ---
            let rootFolder = game.folders.find(f => f.name === "CARTAS" && f.type === "Actor");
            if (!rootFolder) rootFolder = await Folder.create({name: "CARTAS", type: "Actor"});

            let subFolder = game.folders.find(f => f.name === "CRIATURAS" && f.type === "Actor" && f.folder?.id === rootFolder.id);
            if (!subFolder) subFolder = await Folder.create({name: "CRIATURAS", type: "Actor", folder: rootFolder.id});

            // --- 3. CREACIÓN DEL BOSS (Preparado para la nueva Base de Datos) ---
            // Intentamos leer el "nombre de sistema" (ej: "la_gargola") que pondremos con el Excel.
            let nombreSistema = bossTemplate.system.carpetaSistema;

            // Si es una carta antigua creada a mano que no tiene esa etiqueta, la limpiamos a lo bestia:
            // Quitamos acentos, cambiamos espacios por guiones bajos y lo ponemos en minúsculas.
            if (!nombreSistema) {
                nombreSistema = bossTemplate.name.toLowerCase().trim()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quita tildes
                    .replace(/\s+/g, '_'); // Cambia espacios por _
            }

            const dorsoUrl = `img_varias/cards/cartas_v3/criaturas/${nombreSistema}/${nombreSistema}_dorso_cartas.jpg`;

            const bossActor = await Actor.create({
                name: `[BOSS] ${bossTemplate.name}`,
                type: "personaje",
                img: bossTemplate.img,
                folder: subFolder.id,
                flags: {dorso_oscuro: {isBossSession: true, dorsoUrl: dorsoUrl}}
            });

            const itemsToCreate = itemsParaElBoss.map(i => i.toObject());
            await bossActor.createEmbeddedDocuments("Item", itemsToCreate);

            const dummySheet = new PersonajeSheet(bossActor);
            await dummySheet._registrarMazoDeJuego();

            // Llenamos la vida del Boss y de su carta al máximo
            const almaNueva = bossActor.items.find(i => i.name === bossTemplate.name);
            await almaNueva.update({"system.vida.value": almaNueva.system.vida.max});

            await bossActor.update({
                "system.almaActivaId": almaNueva.id,
                "system.hp.value": almaNueva.system.vida.max,
                "system.hp.max": almaNueva.system.vida.max
            });

            this.render(true);
        });

        // --- ZOOM DE CARTA (CLIC DERECHO) ---
        html.find('.boss-card-container').on('contextmenu', ev => {
            ev.preventDefault();
            let itemId = ev.currentTarget.dataset.itemId;
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor || !itemId) return;

            // Traductor de ID: Si es una carta de la mano, buscamos el ID del Item original
            const hand = game.cards.get(actor.system.handId);
            const card = hand?.cards.get(itemId);
            if (card) itemId = card.getFlag("dorso_oscuro", "itemId");

            const item = actor.items.get(itemId);
            if (item) {
                new ImagePopout(item.img, {
                    title: item.name,
                    uuid: item.uuid
                }).render(true);
            }
        });

        // --- DRAG & DROP: SIEMPRE BOCA ABAJO PARA EL DJ ---
        html.find('.boss-card-container').on('dragstart', ev => {
            let itemId = ev.currentTarget.dataset.itemId;
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor || !itemId) return;

            // Traductor de ID: Igual que en el zoom
            const hand = game.cards.get(actor.system.handId);
            const card = hand?.cards.get(itemId);
            if (card) itemId = card.getFlag("dorso_oscuro", "itemId");

            const dorsoEspecial = actor.getFlag("dorso_oscuro", "dorsoUrl");

            const dragData = {
                type: "CartaDorsoOscuro",
                actorId: actor.id,
                itemId: itemId,
                faceDown: true, // Siempre oculta al caer
                backImg: dorsoEspecial
            };
            ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });


        // --- FINALIZAR ENCUENTRO (Borrado de Mazos, CARPETA y Almas Temporales) ---
        html.find('.close-boss-game').click(async ev => {
            Dialog.confirm({
                title: "⚠️ FINALIZAR ENCUENTRO ⚠️",
                content: "<p style='text-align:center;'>Se eliminará la Criatura, sus mazos, su carpeta y <b>las almas temporales de los jugadores</b>.<br>¿Estás seguro?</p>",
                yes: async () => {

                    // --- NUEVO: 0. LIMPIEZA GLOBAL DE ALMAS TEMPORALES ---
                    // Buscamos todos los actores que se hayan creado como "Alma Temporal" y los borramos
                    const almasTemporales = game.actors.filter(a => a.flags.dorso_oscuro?.isTempAlma);
                    if (almasTemporales.length > 0) {
                        for (let alma of almasTemporales) {
                            try {
                                await alma.delete();
                            } catch (error) {
                                console.warn("Dorso Oscuro | No se pudo borrar un alma temporal", error);
                            }
                        }
                    }

                    // --- LIMPIEZA DEL BOSS ---
                    const boss = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
                    if (boss) {
                        // 1. Borrar Tokens del tablero
                        const tokens = canvas.tokens.placeables.filter(t => {
                            const f = t.document.flags.dorso_oscuro;
                            return f?.actorId === boss.id;
                        });

                        if (tokens.length > 0) {
                            await canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id), { limpiezaTotal: true });
                        }

                        // 2. Identificar la Carpeta de Cartas antes de borrar las pilas
                        const rootCardsFolder = game.folders.find(f => f.name === "PARTIDAS" && f.type === "Cards");
                        const actorCardsFolder = game.folders.find(f => f.name === boss.name && f.type === "Cards" && f.folder?.id === rootCardsFolder?.id);

                        // 3. Borrar las 5 Pilas de Cartas (Cards)
                        const pilas = ["deckId", "handId", "discardId", "enJuegoId", "eliminadasId"];
                        for (let key of pilas) {
                            const id = boss.system[key];
                            if (id) {
                                const stack = game.cards.get(id);
                                if (stack) await stack.delete();
                            }
                        }

                        // 4. Borrar la Carpeta ahora que está vacía
                        if (actorCardsFolder) await actorCardsFolder.delete();

                        // 5. Borrar el Actor temporal del Boss
                        await boss.delete();
                        ui.notifications.warn("Encuentro finalizado. Base de datos limpia al 100%.");
                    } else if (almasTemporales.length > 0) {
                        ui.notifications.info("Se han limpiado las almas temporales de los jugadores.");
                    }

                    this.render(true);
                }
            });
        });


        // --- BOTONES DE CONTROL DEL RADAR ---
        html.find('.dj-control').click(async ev => {
            const btn = ev.currentTarget.dataset;
            const actor = game.actors.get(btn.actorId);
            if (!actor) return;

            let updatePath = "";
            let currentVal = 0;
            let target = actor;

            switch (btn.type) {
                case "alma-vida":
                    const alma = actor.items.get(btn.itemId);
                    if (!alma) return;
                    target = alma;
                    updatePath = "system.vida.value";
                    currentVal = alma.system.vida.value;
                    break;
                case "energia":
                    updatePath = "system.energia.value";
                    currentVal = actor.system.energia.value;
                    break;
                case "merma":
                    updatePath = "system.merma";
                    currentVal = actor.system.merma;
                    break;
                case "decadencia":
                    updatePath = "system.decadencia";
                    currentVal = actor.system.decadencia;
                    break;
                case "estabilidad":
                    updatePath = "system.estabilidad";
                    currentVal = actor.system.estabilidad;
                    break;
                case "carta-vida":
                    const cartaMesa = actor.items.get(btn.itemId);
                    if (!cartaMesa) return;
                    target = cartaMesa;
                    updatePath = "system.vida.value";
                    currentVal = cartaMesa.system.vida.value;
                    break;
            }

            let newVal = btn.action === "plus" ? currentVal + 1 : currentVal - 1;
            if (newVal < 0) newVal = 0;

            // --- LÓGICA DE MUERTE DE CARTA EN TIEMPO REAL ---
            if (btn.type === "carta-vida" && newVal === 0 && currentVal > 0 && btn.action === "minus") {
                const isBoss = actor.flags.dorso_oscuro?.isBossSession;

                // Determinamos el nombre del destino para el mensaje
                let destinoMensaje = "Descarte";
                if (!isBoss && target.system.desaparece) {
                    destinoMensaje = "Destierro (Eliminadas)";
                }

                Dialog.confirm({
                    title: "La carta ha sido destruida",
                    content: `<p style="text-align:center;"><b>${target.name}</b> se ha quedado sin vida.<br>¿Retirar del tablero (${destinoMensaje})?</p>`,
                    yes: async () => {
                        await target.update({[updatePath]: 0});
                        const tokenCarta = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === btn.itemId);
                        // Al borrar el token, el Hook "deleteToken" en sistema.js ya se encarga
                        // de enviarlo al sitio correcto (Discard o Eliminadas).
                        if (tokenCarta) await canvas.scene.deleteEmbeddedDocuments("Token", [tokenCarta.id]);
                    },
                    no: async () => {
                        await target.update({[updatePath]: 0});
                        const tokenCarta = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === btn.itemId);
                        if (tokenCarta) await tokenCarta.document.update({name: `❤️ 0  |  ${target.name}`});
                    }
                });
                return;
            }

            await target.update({[updatePath]: newVal});

            // Refresco visual del token en tablero si no murió
            if (btn.type === "carta-vida") {
                const tokenCarta = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === btn.itemId);
                if (tokenCarta) {
                    await tokenCarta.document.update({name: `❤️ ${newVal}  |  ${target.name}`});
                }
            }

            if (btn.type === "alma-vida" && newVal <= 0 && btn.action === "minus") {
                ui.notifications.warn(`¡El Alma de ${actor.name} ha caído! Es hora de mermar su Estabilidad.`);
            }

            const almaId = btn.itemId || actor.system.almaActivaId;
            await this._sincronizarTokenAlma(actor.id, almaId);
        });

// --- ROBAR TODO (Inteligente: Baraja SOLO el descarte) ---
        // --- ROBAR TODO (Siempre recupera descarte y roba todo el mazo) ---
        html.find('.boss-draw-all').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const hand = game.cards.get(actor.system.handId);
            const deck = game.cards.get(actor.system.deckId);
            const discard = game.cards.get(actor.system.discardId);

            if (!hand || !deck || !discard) return;

            // 1. Pasamos SIEMPRE todo el descarte al mazo (sin importar si el mazo tiene cartas o no)
            if (discard.cards.size > 0) {
                const idsParaDevolver = discard.cards.map(c => c.id);
                await discard.pass(deck, idsParaDevolver);
            }

            // 2. Barajamos para asegurar que el sistema actualiza bien las referencias internas
            await deck.shuffle();

            // 3. Robamos TODA la reserva disponible del mazo directamente a la mano
            const mazoActualizado = game.cards.get(deck.id);
            if (mazoActualizado.availableCards.length > 0) {
                await hand.draw(mazoActualizado, mazoActualizado.availableCards.length);
                ui.notifications.info("La criatura ha recuperado todas sus cartas (Mazo + Descarte).");
            } else {
                ui.notifications.warn("No quedan cartas para robar.");
            }
        });

        // --- FINALIZAR TURNO DEL BOSS ---
        html.find('.boss-end-turn').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const enJuego = game.cards.get(actor.system.enJuegoId);
            const discard = game.cards.get(actor.system.discardId);

            const tokensABorrar = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                if (f?.actorId === actor.id && f?.isCard && f?.type !== "carta_alma") {
                    const item = actor.items.get(f.itemId);
                    if (!item) return true;

                    // 1. Si tiene vida máxima > 0 y aún le queda vida, SE SALVA.
                    if (item.system.vida && item.system.vida.max > 0 && item.system.vida.value > 0) return false;

                    // 2. Si es un objeto normal (vida base 0), SE SALVA (se queda en mesa).
                    if (item.type === "carta_objeto" && (!item.system.vida || item.system.vida.max === 0)) return false;

                    // 3. Poderes normales, o cartas con vida que se han quedado a 0 HP sin ser borradas, SE VAN.
                    return true;
                }
                return false;
            });

            if (tokensABorrar.length > 0) {
                await canvas.scene.deleteEmbeddedDocuments("Token", tokensABorrar.map(t => t.id));
            }

            ui.notifications.info("Turno finalizado. Cartas resueltas enviadas al descarte/eliminadas.");
        });

    }

    // --- LÓGICA DE SINCRONIZACIÓN VISUAL DEL TABLERO ---
    async _sincronizarTokenAlma(actorId, almaId) {
        const actor = game.actors.get(actorId);
        const almaItem = actor.items.get(almaId);
        if (!actor || !almaItem) return;

        const almaToken = canvas.tokens.placeables.find(t => {
            const f = t.document.flags.dorso_oscuro;
            return f?.isCard && f?.actorId === actorId && f?.type === "carta_alma";
        });

        if (!almaToken) return;

        if (almaToken.actor) {
            await almaToken.actor.update({
                "system.hp.value": almaItem.system.vida.value,
                "system.hp.max": almaItem.system.vida.max,
                "system.energia.value": actor.system.energia.value
            });
        }

        const vidaActual = almaItem.system.vida.value;
        const energiaActual = actor.system.energia.value;
        const merma = actor.system.merma || 0;
        const decadencia = actor.system.decadencia || 0;

        let nombreHUD = `❤️ ${vidaActual}  |  ⚡ ${energiaActual}`;
        if (merma > 0) nombreHUD += `  |  ⏬ ${merma}`;
        if (decadencia > 0) nombreHUD += `  |  🩸 ${decadencia}`;
        nombreHUD += `  |  ${almaItem.name}`;

        const effects = [];
        if (merma > 0) effects.push("icons/svg/downgrade.svg");
        if (decadencia > 0) effects.push("icons/svg/blood.svg");

        await almaToken.document.update({
            name: nombreHUD,
            effects: effects
        });
    }
}