// module/models.mjs

export class PersonajeData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            atributos: new fields.SchemaField({
                mental: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                social: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                fisico: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
            }),
            hp: new fields.SchemaField({
                value: new fields.NumberField({initial: 10, integer: true, min: 0}),
                max: new fields.NumberField({initial: 10, integer: true, min: 1})
            }),
            esencia: new fields.NumberField({initial: 1, integer: true, min: 1}),
            estabilidad: new fields.NumberField({initial: 15, integer: true, min: -11, max: 22}),
            cordura: new fields.NumberField({initial: 5, integer: true, min: 0, max: 5}),
            credito: new fields.NumberField({initial: 1, integer: true, min: 0, max: 5}),

            // NUEVO: Umbral de Daño
            umbral: new fields.NumberField({initial: 3, integer: true, min: 2, max: 4}),

            ocupacion: new fields.StringField({initial: ""}),
            edad: new fields.StringField({initial: ""}),
            procedencia: new fields.StringField({initial: ""}),

            // NUEVO: Notas
            notas: new fields.StringField({initial: ""}),
            // --- SISTEMA DE CARTAS ---
            energia: new fields.SchemaField({
                value: new fields.NumberField({initial: 0, integer: true, min: 0}),
                max: new fields.NumberField({initial: 7, integer: true}) // ¡NUEVO! Foundry necesita esto para saber dónde está el 100% de la barra azul
            }),
            merma: new fields.NumberField({initial: 0, integer: true, min: 0}),
            decadencia: new fields.NumberField({initial: 0, integer: true, min: 0}),
            // IDs de los contenedores de cartas nativos de Foundry
            deckId: new fields.StringField({initial: ""}),
            handId: new fields.StringField({initial: ""}),
            discardId: new fields.StringField({initial: ""}),
            almaActivaId: new fields.StringField({initial: ""}),
            eliminadasId: new fields.StringField({initial: ""}),
            enJuegoId: new fields.StringField({initial: ""})

        };
    }
}

export class HabilidadData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            descripcion: new fields.HTMLField(),
            valorMax: new fields.NumberField({initial: 3, min: 1, max: 12, integer: true}),
            valorActual: new fields.NumberField({initial: 3, min: 0, integer: true}),
            atributoBase: new fields.StringField({initial: "mental", choices: ["mental", "social", "fisico"]}),
            // NUEVO: Tipo de habilidad
            tipo: new fields.StringField({initial: "general", choices: ["tecnica", "general"]})
        };
    }
}

// Añade esto al final de module/models.mjs

// --- MODELOS DE CARTAS ---

// 1. Carta de Alma (El escudo del jugador)
export class CartaAlmaData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            vida: new fields.SchemaField({
                value: new fields.NumberField({initial: 10, integer: true, min: 0}),
                max: new fields.NumberField({initial: 10, integer: true, min: 1})
            }),
            energiaBase: new fields.NumberField({initial: 1, integer: true, min: 0}), // Energía que genera por turno
            elemento: new fields.StringField({initial: "ninguno", choices: ["vida", "muerte", "luz", "oscuridad", "ninguno"]}),
            energiaAportada: new fields.NumberField({initial: 0, integer: true, min: 0}),
            descripcion: new fields.HTMLField(),
            limiteManoBonus: new fields.NumberField({initial: 0, integer: true, min: 0}),
            esCriatura: new fields.BooleanField({initial: false}),
            carpetaSistema: new fields.StringField({ initial: "" }),
        };
    }
}

// 2. Carta de Poder / Objeto
export class CartaJugableData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            vida: new fields.SchemaField({
                value: new fields.NumberField({initial: 0, integer: true, min: 0}),
                max: new fields.NumberField({initial: 0, integer: true, min: 0})
            }),
            // ------------------------------------------------------
            costeEnergia: new fields.NumberField({initial: 1, integer: true, min: 0}),
            elemento: new fields.StringField({initial: "ninguno", choices: ["vida", "muerte", "luz", "oscuridad", "ninguno"]}),
            tipoAccion: new fields.StringField({initial: "otro", choices: ["ataque", "cura", "defensa", "otro"]}),
            formulaBase: new fields.StringField({initial: ""}),
            esInstantanea: new fields.BooleanField({initial: false}),
            desaparece: new fields.BooleanField({initial: false}),
            descripcion: new fields.HTMLField(),
            enBanquillo: new fields.BooleanField({initial: false}),
            limiteManoBonus: new fields.NumberField({initial: 0, integer: true, min: 0}),
            energiaAportada: new fields.NumberField({initial: 0, integer: true, min: 0}),
            carpetaSistema: new fields.StringField({ initial: "" }),
        };
    }
}

// 3. Carta de Equipo (Se baja al inicio y se queda)
export class CartaEquipoData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            formato: new fields.StringField({initial: "vertical", choices: ["vertical", "horizontal"]}),
            elemento: new fields.StringField({initial: "ninguno", choices: ["vida", "muerte", "luz", "oscuridad", "ninguno"]}),
            descripcion: new fields.HTMLField(),
            carpetaSistema: new fields.StringField({ initial: "" }),
        };
    }
}