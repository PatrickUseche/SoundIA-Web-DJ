import { Component, OnInit, computed, inject } from '@angular/core';
import { StyleModelTarget } from '../../core/models/autodj';
import { StyleModelService } from '../../core/services/style-model';

interface Parametro {
  nombre: string;
  gana: boolean;
  enUso: boolean;
  texto: string;
}

function describir(nombre: string, objetivo: StyleModelTarget, enUso: boolean): Parametro {
  const error = (valor: number | null) => (valor === null ? '?' : valor.toFixed(2).replace('.', ','));
  const comparacion = `error ${error(objetivo.modelError)} frente a ${error(objetivo.rulesError)} de las reglas`;
  const texto = objetivo.wins
    ? `gana a las reglas (${comparacion})`
    : objetivo.evaluated === 0
      ? 'todavía no hay datos de este parámetro'
      : `todavía no gana a las reglas (${comparacion})`;
  return { nombre, gana: objetivo.wins, enUso, texto };
}

/**
 * Cuanto lleva aprendido la IA de tu estilo y si se esta usando. Solo aprende de tus mezclas buenas; hasta tener las
 * suficientes el Auto-DJ usa sus reglas, y aun con el modelo encendido solo cambia lo que gana a las reglas.
 */
@Component({
  selector: 'app-style-model-panel',
  templateUrl: './style-model-panel.html',
})
export class StyleModelPanelComponent implements OnInit {
  protected readonly modelo = inject(StyleModelService);

  protected readonly faltan = computed(() => {
    const info = this.modelo.info();
    return info ? Math.max(info.required - info.goodRecordings, 0) : 0;
  });

  protected readonly progreso = computed(() => {
    const info = this.modelo.info();
    return info ? Math.min(info.goodRecordings, info.required) : 0;
  });

  protected readonly parametros = computed<Parametro[]>(() => {
    const info = this.modelo.info();
    if (!info?.evaluation) {
      return [];
    }
    return [
      describir('Compases de solape', info.evaluation.bars, info.inUse?.bars ?? false),
      describir('Punto del cambio de graves', info.evaluation.bassSwap, info.inUse?.bassSwap ?? false),
    ];
  });

  protected readonly siguiente = computed(() => {
    const parte = this.modelo.info()?.nextTrack;
    if (!parte) {
      return null;
    }
    const precision = parte.evaluation?.accuracy;
    return {
      correcciones: parte.corrections,
      necesarias: parte.required,
      faltan: Math.max(parte.required - parte.corrections, 0),
      lista: parte.ready,
      gana: parte.evaluation?.wins ?? false,
      enUso: parte.inUse ?? false,
      aciertos: precision === null || precision === undefined ? null : Math.round(precision * 100),
    };
  });

  ngOnInit(): void {
    this.modelo.load();
  }

  protected alternar(): void {
    const info = this.modelo.info();
    if (info) {
      this.modelo.setEnabled(!info.enabled);
    }
  }
}
