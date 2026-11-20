import { Component, OnInit, computed, inject } from '@angular/core';
import { StyleModelTarget } from '../../core/models/autodj';
import { StyleModelService } from '../../core/services/style-model';

interface Parameter {
  displayName: string;
  isWinner: boolean;
  isUsed: boolean;
  bodyText: string;
}

function describeItem(displayName: string, modelTarget: StyleModelTarget, isUsed: boolean): Parameter {
  const error = (rawValue: number | null) => (rawValue === null ? '?' : rawValue.toFixed(2).replace('.', ','));
  const comparison = `error ${error(modelTarget.modelError)} frente a ${error(modelTarget.rulesError)} de las reglas`;
  const bodyText = modelTarget.wins
    ? `gana a las reglas (${comparison})`
    : modelTarget.evaluated === 0
      ? 'todavía no hay datos de este parámetro'
      : `todavía no gana a las reglas (${comparison})`;
  return { displayName, isWinner: modelTarget.wins, isUsed, bodyText };
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

  protected readonly missingText = computed(() => {
    const info = this.modelo.info();
    return info ? Math.max(info.required - info.goodRecordings, 0) : 0;
  });

  protected readonly playbackProgress = computed(() => {
    const info = this.modelo.info();
    return info ? Math.min(info.goodRecordings, info.required) : 0;
  });

  protected readonly parameters = computed<Parameter[]>(() => {
    const info = this.modelo.info();
    if (!info?.evaluation) {
      return [];
    }
    return [
      describeItem('Compases de solape', info.evaluation.bars, info.inUse?.bars ?? false),
      describeItem('Punto del cambio de graves', info.evaluation.bassSwap, info.inUse?.bassSwap ?? false),
    ];
  });

  protected readonly upcoming = computed(() => {
    const part = this.modelo.info()?.nextTrack;
    if (!part) {
      return null;
    }
    const precision = part.evaluation?.accuracy;
    return {
      correcciones: part.corrections,
      necesarias: part.required,
      missingText: Math.max(part.required - part.corrections, 0),
      itemList: part.ready,
      isWinner: part.evaluation?.wins ?? false,
      isUsed: part.inUse ?? false,
      aciertos: precision === null || precision === undefined ? null : Math.round(precision * 100),
    };
  });

  ngOnInit(): void {
    this.modelo.load();
  }

  protected toggleState(): void {
    const info = this.modelo.info();
    if (info) {
      this.modelo.setEnabled(!info.enabled);
    }
  }
}
