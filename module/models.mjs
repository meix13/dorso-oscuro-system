// module/models.mjs

/**
 * Modelo para los Atributos (Mental, Social, Físico)
 */
// module/models.mjs

export class PersonajeData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            // Atributos de dados (lo que ya teníamos)
            atributos: new fields.SchemaField({
                mental: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                social: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                fisico: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
            }),
            // Salud (Objeto con actual/máximo)
            hp: new fields.SchemaField({
                value: new fields.NumberField({initial: 10, integer: true, min: 0}),
                max: new fields.NumberField({initial: 10, integer: true, min: 1})
            }),
            // --- NUEVAS CARACTERÍSTICAS ---
            esencia: new fields.NumberField({
                initial: 1,
                integer: true,
                min: 1 // Valor > 0
            }),
            estabilidad: new fields.NumberField({
                initial: 15,
                integer: true,
                min: -11,
                max: 22
            }),
            cordura: new fields.NumberField({
                initial: 5,
                integer: true,
                min: 0,
                max: 5
            }),
            credito: new fields.NumberField({
                initial: 1,
                integer: true,
                min: 0,
                max: 5
            }),
            // --- DATOS BIOGRÁFICOS ---
            ocupacion: new fields.StringField({initial: ""}),
            edad: new fields.StringField({initial: ""}),
            procedencia: new fields.StringField({initial: ""})
        };
    }
}

/**
 * Modelo para las Habilidades (Items)
 */
export class HabilidadData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            descripcion: new fields.HTMLField(),
            valorMax: new fields.NumberField({initial: 3, min: 1, max: 5, integer: true}),
            valorActual: new fields.NumberField({initial: 3, min: 0, integer: true}),
            atributoBase: new fields.StringField({initial: "mental", choices: ["mental", "social", "fisico"]})
        };
    }
}