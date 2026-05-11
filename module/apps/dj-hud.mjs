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
            height: 350, // ¡Altura ajustada al nuevo formato!
            classes: ["dorso_oscuro", "dj-hud-app"],
            resizable: true,
            minimizable: true,
            tabs: [{ navSelector: ".dj-tabs", contentSelector: ".dj-body", initial: "radar" }]
        });
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
            return {
                actor,
                system: actor.system,
                alma,
                cartas: {
                    mano: hand?.cards.size || 0,
                    mazo: deck?.availableCards.length || 0,
                    descarte: discard?.cards.size || 0,
                    eliminadas: eliminadas?.cards.size || 0
                }
            };
        });

        // 2. SECCIÓN DE CRIATURA
        const criaturaActiva = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);

        if (criaturaActiva) {
            data.activeBoss = criaturaActiva;
            data.bossAlma = criaturaActiva.items.find(i => i.type === "carta_alma");
            const hand = game.cards.get(criaturaActiva.system.handId);
            const deck = game.cards.get(criaturaActiva.system.deckId);

            // Separación de Poderes y Objetos en la mano
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
            // Catálogo de criaturas para seleccionar
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
            if (!rootFolder) rootFolder = await Folder.create({ name: "CARTAS", type: "Actor" });

            let subFolder = game.folders.find(f => f.name === "CRIATURAS" && f.type === "Actor" && f.folder?.id === rootFolder.id);
            if (!subFolder) subFolder = await Folder.create({ name: "CRIATURAS", type: "Actor", folder: rootFolder.id });

            // --- 3. CREACIÓN DEL BOSS (Con su Vida Maxima) ---
            const nombreLimpio = bossTemplate.name.toLowerCase().trim();
            const dorsoUrl = `img_varias/cards/cartas_v3/criaturas/${nombreLimpio}/${nombreLimpio}_dorso_cartas.jpg`;

            const bossActor = await Actor.create({
                name: `[BOSS] ${bossTemplate.name}`,
                type: "personaje",
                img: bossTemplate.img,
                folder: subFolder.id,
                flags: { dorso_oscuro: { isBossSession: true, dorsoUrl: dorsoUrl } }
            });

            const itemsToCreate = itemsParaElBoss.map(i => i.toObject());
            await bossActor.createEmbeddedDocuments("Item", itemsToCreate);

            const dummySheet = new PersonajeSheet(bossActor);
            await dummySheet._registrarMazoDeJuego();

            // Llenamos la vida del Boss y de su carta al máximo
            const almaNueva = bossActor.items.find(i => i.name === bossTemplate.name);
            await almaNueva.update({ "system.vida.value": almaNueva.system.vida.max });

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


        // --- FINALIZAR ENCUENTRO (Borrado de Mazos + CARPETA) ---
        html.find('.close-boss-game').click(async ev => {
            Dialog.confirm({
                title: "⚠️ FINALIZAR ENCUENTRO ⚠️",
                content: "<p style='text-align:center;'>Se eliminará la Criatura, sus mazos y su <b>carpeta de cartas</b>.<br>¿Estás seguro?</p>",
                yes: async () => {
                    const boss = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
                    if (boss) {

                        // 1. Borrar Tokens del tablero (Usamos los flags, que nunca fallan)
                        const tokens = canvas.tokens.placeables.filter(t => {
                            const f = t.document.flags.dorso_oscuro;
                            return f?.actorId === boss.id && f?.isCard;
                        });

                        if (tokens.length > 0) {
                            await canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id));
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

                        // 5. Borrar el Actor temporal
                        await boss.delete();
                        ui.notifications.warn("Encuentro finalizado. Base de datos limpia.");
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

            switch(btn.type) {
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
            }

            const newVal = btn.action === "plus" ? currentVal + 1 : currentVal - 1;

            await target.update({ [updatePath]: newVal });

            if (btn.type === "alma-vida" && newVal <= 0 && btn.action === "minus") {
                ui.notifications.warn(`¡El Alma de ${actor.name} ha caído! Es hora de mermar su Estabilidad.`);
            }

            const almaId = btn.itemId || actor.system.almaActivaId;
            await this._sincronizarTokenAlma(actor.id, almaId);
        });

// --- ROBAR TODO (Inteligente: Baraja SOLO el descarte) ---
        html.find('.boss-draw-all').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const hand = game.cards.get(actor.system.handId);
            const deck = game.cards.get(actor.system.deckId);
            const discard = game.cards.get(actor.system.discardId);

            if (!hand || !deck || !discard) return;

            // 1. Si el mazo está vacío, pasamos el descarte al mazo
            // Usamos deck.cards.size para mayor precisión en tiempo real
            if (deck.cards.size === 0) {
                if (discard.cards.size === 0) {
                    ui.notifications.warn("No quedan cartas ni en el mazo ni en el descarte.");
                    return;
                }

                const idsParaDevolver = discard.cards.map(c => c.id);
                await discard.pass(deck, idsParaDevolver);
                await deck.shuffle();
                ui.notifications.info("El mazo se ha barajado con las cartas del descarte.");
            }

            // 2. Robamos todo lo que haya en el mazo (re-calculamos tras el posible barajeo)
            const mazoActualizado = game.cards.get(deck.id);
            if (mazoActualizado.availableCards.length > 0) {
                await hand.draw(mazoActualizado, mazoActualizado.availableCards.length);
                ui.notifications.info("La criatura roba toda su reserva de cartas.");
            }
        });

        // --- FINALIZAR TURNO (Solo afecta a los Poderes) ---
        html.find('.boss-end-turn').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const enJuego = game.cards.get(actor.system.enJuegoId);
            const discard = game.cards.get(actor.system.discardId);

            // 1. Base de datos: Mover SOLO los poderes de "En Juego" a "Descarte"
            if (enJuego && discard && enJuego.cards.size > 0) {
                const poderesParaDescartar = enJuego.cards.filter(c => {
                    const itemId = c.getFlag("dorso_oscuro", "itemId");
                    const item = actor.items.get(itemId);
                    return item?.type === "carta_poder"; // Excluimos carta_objeto
                });

                if (poderesParaDescartar.length > 0) {
                    await enJuego.pass(discard, poderesParaDescartar.map(c => c.id));
                }
            }

            // 2. Tablero: Borrar los tokens que sean Poderes
            const tokens = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                return f?.actorId === actor.id && f?.isCard && f?.type === "carta_poder";
            });

            if (tokens.length > 0) {
                await canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id));
            }

            ui.notifications.info("Turno finalizado. Los poderes lanzados van al descarte.");
        });


        // --- FINALIZAR TURNO ---
        html.find('.boss-end-turn').click(async ev => {
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor) return;

            const enJuego = game.cards.get(actor.system.enJuegoId);
            const discard = game.cards.get(actor.system.discardId);

            // 1. Base de datos: Mover todas las cartas de "En Juego" a "Descarte"
            if (enJuego && discard && enJuego.cards.size > 0) {
                await enJuego.pass(discard, enJuego.cards.map(c => c.id));
            }

            // 2. Tablero: Borrar los tokens que sean cartas del Boss (dejando vivo el Alma)
            const tokens = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                return f?.actorId === actor.id && f?.isCard && f?.type !== "carta_alma";
            });

            if (tokens.length > 0) {
                await canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id));
            }

            ui.notifications.info("Turno finalizado. Cartas enviadas al descarte.");
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