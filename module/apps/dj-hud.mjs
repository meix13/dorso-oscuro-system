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
            width: 1000,
            height: 600,
            classes: ["dorso_oscuro", "dj-hud-app"],
            resizable: true,
            tabs: [{ navSelector: ".dj-tabs", contentSelector: ".dj-body", initial: "radar" }]
        });
    }

    async getData() {
        const data = await super.getData();

        // 1. RADAR DE JUGADORES (Se mantiene igual)
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
        // Buscamos si ya existe una criatura activa (un actor temporal con nuestra flag)
        const criaturaActiva = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);

        if (criaturaActiva) {
            data.activeBoss = criaturaActiva;
            data.bossAlma = criaturaActiva.items.find(i => i.type === "carta_alma");
            const hand = game.cards.get(criaturaActiva.system.handId);
            const deck = game.cards.get(criaturaActiva.system.deckId);
            data.bossMano = hand?.cards || [];
            data.bossMazoSize = deck?.availableCards.length || 0;
        } else {
            // Si no hay activa, listamos todas las "Almas de Criatura" de la biblioteca del DJ
            data.disponibles = game.items.filter(i => i.type === "carta_alma" && i.system.esCriatura);
        }

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // SELECTOR DE CRIATURA
        html.find('.select-boss').click(async ev => {
            const bossId = ev.currentTarget.dataset.id;
            const bossTemplate = game.items.get(bossId);

            ui.notifications.info(`Invocando a ${bossTemplate.name}...`);

            // --- 1. GESTIÓN DE CARPETAS (CARTAS/CRIATURAS) ---
            let rootFolder = game.folders.find(f => f.name === "CARTAS" && f.type === "Actor");
            if (!rootFolder) rootFolder = await Folder.create({ name: "CARTAS", type: "Actor" });

            let subFolder = game.folders.find(f => f.name === "CRIATURAS" && f.type === "Actor" && f.folder?.id === rootFolder.id);
            if (!subFolder) subFolder = await Folder.create({ name: "CRIATURAS", type: "Actor", folder: rootFolder.id });

            // --- 2. CONSTRUCCIÓN DE LA URL DEL DORSO ---
            // Usamos el nombre de la plantilla de la criatura para la ruta
            const nombreLimpio = bossTemplate.name;
            const dorsoUrl = `img_varias/cards/cartas_v3/criaturas/${nombreLimpio}/${nombreLimpio}_dorso_cartas.jpg`;

            // --- 3. CREACIÓN DEL ACTOR TEMPORAL ---
            const bossActor = await Actor.create({
                name: `[BOSS] ${bossTemplate.name}`,
                type: "personaje",
                img: bossTemplate.img,
                folder: subFolder.id, // Lo metemos en la subcarpeta
                flags: {
                    dorso_oscuro: {
                        isBossSession: true,
                        dorsoUrl: dorsoUrl // Guardamos el dorso específico aquí
                    }
                }
            });

            // ... (Resto de la lógica de pasar ítems y registrar mazo se mantiene igual)
            const cartasRelacionadas = bossTemplate.folder?.id ? game.items.filter(i => i.folder?.id === bossTemplate.folder.id) : [bossTemplate];
            const itemsToCreate = cartasRelacionadas.map(i => i.toObject());
            await bossActor.createEmbeddedDocuments("Item", itemsToCreate);

            const dummySheet = new PersonajeSheet(bossActor);
            await dummySheet._registrarMazoDeJuego();

            const almaNueva = bossActor.items.find(i => i.name === bossTemplate.name);
            await bossActor.update({"system.almaActivaId": almaNueva.id});

            this.render(true);
        });

        // --- ZOOM DE CARTA (CLIC DERECHO) ---
        html.find('.boss-card-container').on('contextmenu', ev => {
            ev.preventDefault();
            const itemId = ev.currentTarget.dataset.itemId;
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            const item = actor?.items.get(itemId);

            if (item) {
                new ImagePopout(item.img, {
                    title: item.name,
                    uuid: item.uuid
                }).render(true);
            }
        });

        // --- DRAG & DROP: SIEMPRE BOCA ABAJO PARA EL DJ ---
        html.find('.boss-card-container').on('dragstart', ev => {
            const itemId = ev.currentTarget.dataset.itemId;
            const actor = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
            if (!actor || !itemId) return;

            const dorsoEspecial = actor.getFlag("dorso_oscuro", "dorsoUrl");

            const dragData = {
                type: "CartaDorsoOscuro",
                actorId: actor.id,
                itemId: itemId,
                faceDown: true, // <--- AHORA SIEMPRE ES TRUE POR DEFECTO
                backImg: dorsoEspecial
            };
            ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });



        // BOTÓN CERRAR JUEGO (SUPER CONFIRMACIÓN)
        html.find('.close-boss-game').click(async ev => {
            Dialog.confirm({
                title: "⚠️ FINALIZAR ENCUENTRO DE CRIATURA ⚠️",
                content: "<p style='text-align:center;'>Esto eliminará la Criatura actual, sus mazos y sus cartas del tablero.<br><b>¿Estás seguro?</b></p>",
                yes: async () => {
                    const boss = game.actors.find(a => a.flags.dorso_oscuro?.isBossSession);
                    if (boss) {
                        // Borramos sus tokens del tablero
                        const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === boss.id);
                        const ids = tokens.map(t => t.id);
                        await canvas.scene.deleteEmbeddedDocuments("Token", ids);

                        // Borramos sus mazos
                        if (boss.system.deckId) await game.cards.get(boss.system.deckId)?.delete();
                        if (boss.system.handId) await game.cards.get(boss.system.handId)?.delete();
                        if (boss.system.discardId) await game.cards.get(boss.system.discardId)?.delete();
                        if (boss.system.enJuegoId) await game.cards.get(boss.system.enJuegoId)?.delete();

                        // Borramos el actor temporal
                        await boss.delete();
                        ui.notifications.warn("Encuentro finalizado. Criatura retirada.");
                    }
                    this.render(true);
                }
            });
        });

        // BOTONES DE CONTROL (Recuperamos la lógica completa)
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
    } // <-- Cierra activateListeners

    // --- LÓGICA DE SINCRONIZACIÓN VISUAL DEL TABLERO
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