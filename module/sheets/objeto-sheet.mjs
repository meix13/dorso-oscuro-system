// module/sheets/objeto-sheet.mjs

export class ObjetoSheet extends foundry.appv1.sheets.ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            // Reemplazamos "mystery-theme" por "mystery-paper-theme"
            classes: ["dorso_oscuro", "sheet", "item", "mystery-paper-theme"],
            template: "systems/dorso_oscuro/templates/objeto-sheet.hbs",
            width: 450,
            height: 520
        });
    }

    async getData() {
        const context = super.getData();
        const item = context.item;

        context.system = item.system;

        context.isGM = game.user.isGM;
        context.owner = item.isOwner;

        // 2. Identidad: ¿Qué tipo de objeto somos exactamente?
        // Pasamos variables booleanas (true/false) para que Handlebars (HTML) pueda usar {{#if isArma}}
        context.isArma = item.type === "arma";
        context.isObjeto = item.type === "objeto";

        // 3. Editor de texto V14: Preparamos la descripción para que sea un editor rico
        context.enrichedDescription = await TextEditor.enrichHTML(item.system.descripcion || "", {
            async: true,
            secrets: item.isOwner
        });

        const habilidadesArma = game.items.filter(i => i.type === "habilidad" && i.system.se_usa_con_arma);

        // Creamos un objeto para pasárselo a selectOptions
        context.opcionesHabilidades = {"": "--- Ninguna ---"};
        habilidadesArma.forEach(h => {
            context.opcionesHabilidades[h.name] = h.name;
        });

        return context;
    }
}