// module/sheets/objeto-sheet.mjs

export class ObjetoSheet extends foundry.appv1.sheets.ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "item", "mystery-theme"],
            template: "systems/dorso_oscuro/templates/objeto-sheet.hbs", // La ruta a tu nuevo HTML
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

        return context;
    }
}