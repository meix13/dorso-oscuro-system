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

            // Si por lo que sea no la encuentra en items, probamos por el ID guardado
            if (!data.bossAlma && criaturaActiva.system.almaActivaId) {
                data.bossAlma = criaturaActiva.items.get(criaturaActiva.system.almaActivaId);
            }

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
            data.disponibles = game.items.filter(i =>
                i.type === "carta_alma" &&
                i.system.esCriatura &&
                i.system.idCriatura !== ""
            );
        }


        // --- 3.  GESTIÓN DE EQUIPO  ---
        const unlocked = game.settings.get("dorso_oscuro", "equiposDesbloqueados") || {};

        // Buscamos todos los Items de tipo carta_equipo que existan en la barra lateral
        data.cartasEquipoMundo = game.items.filter(i => i.type === "carta_equipo").map(item => {
            return {
                id: item.id,
                name: item.name,
                img: item.img,
                formato: item.system.formato,
                isUnlocked: !!unlocked[item.id] // Booleano para el template
            };
        });

        return data;


        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- SELECTOR DE CRIATURA (BOSS) ACTUALIZADO ---
        html.find('.select-boss').click(async ev => {
            const almaId = ev.currentTarget.dataset.id;
            const almaItemOriginal = game.items.get(almaId);
            if (!almaItemOriginal) return;

            const idCriatura = almaItemOriginal.system.idCriatura;
            if (!idCriatura) return ui.notifications.error("Esta alma no tiene ID de Criatura.");

            // 1. Borrar sesión anterior si existe
            let oldBoss = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (oldBoss) await oldBoss.delete();

            // 2. Crear el Actor del Boss
            const bossActor = await Actor.create({
                name: `BOSS: ${almaItemOriginal.name}`,
                type: "personaje",
                img: almaItemOriginal.img,
                flags: { dorso_oscuro: { isBossSession: true, idCriatura: idCriatura } }
            });

            // 3. Importar los Ítems al Actor (Vital para la Vida y Energía)
            const mazoItemsMundo = game.items.filter(i =>
                i.system.idCriatura === idCriatura && i.system.esDeCriatura && i.type !== "carta_alma"
            );

            // Creamos copias de los items dentro del actor
            const itemsCreados = await bossActor.createEmbeddedDocuments("Item", [
                almaItemOriginal.toObject(),
                ...mazoItemsMundo.map(i => i.toObject())
            ]);

            const almaEnActor = itemsCreados.find(i => i.type === "carta_alma");

            // 4. Crear las 5 Pilas de Cartas (Mazo, Mano, Descarte, Juego, Eliminadas)
            const folder = game.folders.find(f => f.name === "MAZOS BOSS" && f.type === "Cards")
                || await Folder.create({name: "MAZOS BOSS", type: "Cards"});

            const createStack = async (suffix, type) => {
                return await Cards.create({
                    name: `${suffix} - ${almaItemOriginal.name}`,
                    type: type,
                    folder: folder.id
                });
            };

            const deck = await createStack("Mazo", "deck");
            const hand = await createStack("Mano", "hand");
            const discard = await createStack("Descarte", "pile");
            const enJuego = await createStack("En Juego", "pile");
            const eliminadas = await createStack("Eliminadas", "pile");

            // 5. Poblar el Mazo con los ítems del Actor
            const dorsoBoss = `systems/dorso_oscuro/assets/cartas/criaturas/${idCriatura}_dorso_cartas.jpg`;
            const cartasParaMazo = itemsCreados.filter(i => i.type !== "carta_alma").map(item => ({
                name: item.name,
                faces: [{ img: item.img, name: item.name }],
                back: { img: dorsoBoss },
                flags: { dorso_oscuro: { itemId: item.id } }
            }));

            await deck.createEmbeddedDocuments("Card", cartasParaMazo);
            await deck.shuffle();

            // 6. Vincular todo al Actor
            await bossActor.update({
                "system.almaActivaId": almaEnActor.id,
                "system.deckId": deck.id,
                "system.handId": hand.id,
                "system.discardId": discard.id,
                "system.enJuegoId": enJuego.id,
                "system.eliminadasId": eliminadas.id,
                "system.energia.value": almaItemOriginal.system.energiaAportada || 0
            });

            ui.notifications.info(`Boss ${almaItemOriginal.name} listo para el combate.`);
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

        // --- DRAG & DROP: BOCA ABAJO PARA EL DJ, BOCA ARRIBA PARA EL EQUIPO ---
        html.find('.boss-card-container').on('dragstart', ev => {
            const dataset = ev.currentTarget.dataset;
            const itemId = dataset.itemId;

            // 1. ¿Es una carta de equipo global?
            const globalItem = game.items.get(itemId);
            if (globalItem && globalItem.type === "carta_equipo") {
                const dragData = {
                    type: "CartaDorsoOscuro",
                    isGlobal: true, // ¡Flag mágica para avisar al sistema!
                    itemId: itemId,
                    faceDown: false // El equipo se baja boca arriba
                };
                ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
                return;
            }

            // 2. Si no es global, asumimos que es del Boss o un Jugador
            let actorId = dataset.actorId;
            let actor = game.actors.get(actorId);

            // Si no tiene actorId en el HTML, es de la mano del Boss
            if (!actor) {
                actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
                actorId = actor?.id;
            }

            if (!actor || !itemId) return;

            // Traductor de ID para cartas de la mano del Boss
            let finalItemId = itemId;
            if (actor.flags.dorso_oscuro?.isBossSession) {
                const hand = game.cards.get(actor.system.handId);
                const card = hand?.cards.get(itemId);
                if (card) finalItemId = card.getFlag("dorso_oscuro", "itemId");
            }

            const item = actor.items.get(finalItemId);
            if (!item) return;

            const faceDown = actor.flags.dorso_oscuro?.isBossSession && item.type !== "carta_equipo";
            const dorsoEspecial = actor.getFlag("dorso_oscuro", "dorsoUrl");

            const dragData = {
                type: "CartaDorsoOscuro",
                actorId: actorId,
                itemId: finalItemId,
                faceDown: faceDown,
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
                        // 1. Borrar Tokens del tablero (Modificado para incluir cartas de equipo)
                        const tokensABorrar = canvas.tokens.placeables.filter(t => {
                            const f = t.document.flags.dorso_oscuro;
                            const esDelBoss = f?.actorId === boss.id;
                            const esCartaEquipo = f?.isCard && f?.type === "carta_equipo";
                            return esDelBoss || esCartaEquipo;
                        });

                        if (tokensABorrar.length > 0) {
                            await canvas.scene.deleteEmbeddedDocuments("Token", tokensABorrar.map(t => t.id), { limpiezaTotal: true });
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

            const diff = newVal - currentVal;
            if (diff === 0) return;

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

            // Solo para cambios de vida (Almas o cartas en mesa)
            if (btn.type === "alma-vida" || btn.type === "carta-vida") {
                const tokenToAnimate = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === btn.itemId);
                if (tokenToAnimate) {
                    const isHeal = diff > 0;
                    const color = isHeal ? 0x66ff66 : 0xff2222; // Verde brillante o Rojo sangre
                    const text = isHeal ? `+${diff}` : `${diff}`;

                    // Magia nativa de Foundry: Lanza el número flotando sobre el token
                    canvas.interface.createScrollingText(tokenToAnimate.center, text, {
                        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
                        direction: isHeal ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
                        distance: 2 * canvas.grid.size,
                        fontSize: 48,
                        fill: color,
                        stroke: 0x000000,
                        strokeThickness: 4,
                        jitter: 0.25
                    });
                }
            }

            // Refresco visual del token en tablero si no murió
            if (btn.type === "carta-vida") {
                const tokenCarta = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === btn.itemId);
                if (tokenCarta) {
                    await tokenCarta.document.update({name: `❤️ ${newVal}  |  ${target.name}`});
                }
            }else {
                // --- CORRECCIÓN ---
                if (btn.type === "alma-vida" && newVal <= 0 && btn.action === "minus") {
                    ui.notifications.warn(`¡El Alma de ${actor.name} ha caído! Es hora de mermar su Estabilidad.`);
                }
                // Cogemos siempre la activa real del actor, no el itemId del botón
                const almaId = actor.system.almaActivaId;
                await this._sincronizarTokenAlma(actor.id, almaId);
            }


        });

        html.find('.boss-draw-all').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const hand = game.cards.get(actor.system.handId);
            const deck = game.cards.get(actor.system.deckId);
            const discard = game.cards.get(actor.system.discardId);

            if (!hand || !deck || !discard) return ui.notifications.error("Faltan pilas de cartas en este Boss.");

            // 1. Recuperar descarte
            if (discard.cards.size > 0) {
                await discard.pass(deck, discard.cards.map(c => c.id));
            }

            await deck.shuffle();

            // 2. Robar todo lo que haya en el mazo
            const mazoActualizado = game.cards.get(deck.id);
            if (mazoActualizado.availableCards.length > 0) {
                await hand.draw(mazoActualizado, mazoActualizado.availableCards.length);
                ui.notifications.info("Mazo completo robado a la mano.");
            }
            this.render(false);
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

        // En module/apps/dj-hud.mjs -> activateListeners(html)

        html.find('.toggle-equipo').click(async ev => {
            const itemId = ev.currentTarget.dataset.id;
            const item = game.items.get(itemId);
            if (!item) return;

            const unlocked = game.settings.get("dorso_oscuro", "equiposDesbloqueados");
            const newState = !unlocked[itemId];

            // 1. Guardar en el setting
            unlocked[itemId] = newState;
            await game.settings.set("dorso_oscuro", "equiposDesbloqueados", unlocked);

            // 2. Cambiar permisos nativos (OBSERVER para todos los jugadores si se desbloquea)
            const ownership = newState
                ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
                : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };

            await item.update({ ownership });

            // 3. Notificación y refresco
            ui.notifications.info(`Carta ${item.name} ${newState ? 'desbloqueada' : 'bloqueada'}`);
            this.render();
        });

        // --- GESTIÓN DE VIDA DIRECTA (CRIATURA BOSS) ---
        const updateBossLife = async (inputElement) => {
            const actorId = inputElement.dataset.actorId;
            const itemId = inputElement.dataset.itemId;
            const newVal = parseInt(inputElement.value) || 0;

            const actor = game.actors.get(actorId);
            const alma = actor?.items.get(itemId);
            if (!actor || !alma) return;

            const currentVal = alma.system.vida.value;
            const diff = newVal - currentVal;
            if (diff === 0) return; // Si no hay cambio real, ignoramos

            // Topamos la vida entre 0 y el Máximo
            const cappedVal = Math.max(0, Math.min(newVal, alma.system.vida.max));
            const realDiff = cappedVal - currentVal;

            // 1. Guardamos la nueva vida
            await alma.update({"system.vida.value": cappedVal});

            // 2. Animación de texto flotante en la mesa
            const tokenToAnimate = canvas.tokens.placeables.find(t => t.document.flags.dorso_oscuro?.itemId === itemId);
            if (tokenToAnimate) {
                const isHeal = realDiff > 0;
                const color = isHeal ? 0x66ff66 : 0xff2222;
                const text = isHeal ? `+${realDiff}` : `${realDiff}`;

                canvas.interface.createScrollingText(tokenToAnimate.center, text, {
                    anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
                    direction: isHeal ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
                    distance: 2 * canvas.grid.size,
                    fontSize: 48,
                    fill: color,
                    stroke: 0x000000,
                    strokeThickness: 4,
                    jitter: 0.25
                });
            }

            // 3. Avisar si la criatura cae
            if (cappedVal <= 0 && currentVal > 0) {
                ui.notifications.warn(`¡La Criatura ${actor.name} ha caído!`);
            }

            // 4. Sincronizar el título del Token en la mesa (solo si no está oculta)
            await this._sincronizarTokenAlma(actor.id, itemId);

            // 5. Refrescar interfaz del DJ (sin saltos de scroll)
            this.render(false);
        };

        // Si el DJ cambia el número y pulsa Enter o hace clic fuera
        html.find('.boss-life-input').change(async ev => {
            await updateBossLife(ev.currentTarget);
        });

        // Si el DJ hace clic en el botón de sincronizar (el icono de reciclaje verde)
        html.find('.boss-life-update').click(async ev => {
            const input = $(ev.currentTarget).siblings('.boss-life-input')[0];
            await updateBossLife(input);
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

        // --- PROTECCIÓN DEL NOMBRE DEL BOSS ---
        const isFaceDown = almaToken.document.getFlag("dorso_oscuro", "isFaceDown");
        let nombreHUD = "";

        if (isFaceDown && actor.flags.dorso_oscuro?.isBossSession) {
            nombreHUD = "Criatura Oculta";
        } else {
            nombreHUD = `❤️ ${vidaActual}  |  ⚡ ${energiaActual}`;
            if (merma > 0) nombreHUD += `  |  ⏬ ${merma}`;
            if (decadencia > 0) nombreHUD += `  |  🩸 ${decadencia}`;
            nombreHUD += `  |  ${almaItem.name}`;
        }

        const effects = [];
        if (merma > 0) effects.push("icons/svg/downgrade.svg");
        if (decadencia > 0) effects.push("icons/svg/blood.svg");

        await almaToken.document.update({
            name: nombreHUD,
            effects: effects
        });
    }





    async _onToggleEquipo(itemId) {
        const unlocked = game.settings.get("dorso_oscuro", "equiposDesbloqueados");
        const newState = !unlocked[itemId];

        // 1. Actualizar el estado global
        unlocked[itemId] = newState;
        await game.settings.set("dorso_oscuro", "equiposDesbloqueados", unlocked);

        // 2. Gestionar permisos (Poner a "Observador" para todos los jugadores)
        const item = game.items.get(itemId);
        if (item) {
            const ownership = newState ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
            await item.update({ ownership });
        }
    }


    static obtenerMazoCriatura(idCriatura) {
        if (!idCriatura) return [];

        // Buscamos todas las cartas que:
        // 1. Sean de criatura
        // 2. Tengan el ID específico
        // 3. NO sean el alma (para no meter el alma en el mazo de robo)
        return game.items.filter(i =>
            i.system.idCriatura === idCriatura &&
            i.system.esDeCriatura === true &&
            i.type !== "carta_alma"
        );
    }
}