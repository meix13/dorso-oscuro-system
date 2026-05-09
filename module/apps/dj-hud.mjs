export class DJHUD extends Application {
    constructor(options = {}) {
        super(options);
    }

    static get defaultOptions() {
        // ¡Añadimos foundry.utils. delante del mergeObject!
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "dj-hud",
            title: "Panel del Director de Juego",
            template: "systems/dorso_oscuro/templates/apps/dj-hud.hbs",
            width: 800,
            height: 400,
            classes: ["dorso_oscuro", "dj-hud-app"],
            resizable: true
        });
    }

    async getData() {
        const data = super.getData();

        // 1. Buscamos todos los personajes que tengan asignado un jugador (hasPlayerOwner)
        const jugadores = game.actors.filter(a => a.type === "personaje" && a.hasPlayerOwner);

        // 2. Extraemos sus datos y el alma activa que tienen equipada
        data.jugadores = jugadores.map(actor => {
            const activeSoulId = actor.system.almas?.activa;
            const activeSoul = activeSoulId ? actor.items.get(activeSoulId) : null;
            return {
                actor: actor,
                alma: activeSoul
            };
        });

        return data;
    }
}