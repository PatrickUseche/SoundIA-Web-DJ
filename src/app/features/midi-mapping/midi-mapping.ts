import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MIXER_CONTROLS, MixerControl, controlLabel, midiControlLabel } from '../../core/midi/midi-mapping';
import { MidiMapperService } from '../../core/services/midi-mapper';
import { MidiService } from '../../core/services/midi';

/** Asignar los controles del aparato MIDI a los del mezclador: se elige uno y se mueve el del aparato. */
@Component({
  selector: 'app-midi-mapping',
  templateUrl: './midi-mapping.html',
})
export class MidiMappingComponent implements OnInit, OnDestroy {
  protected readonly mapper = inject(MidiMapperService);
  protected readonly midi = inject(MidiService);

  protected readonly controles = MIXER_CONTROLS;
  protected readonly etiqueta = controlLabel;

  ngOnInit(): void {
    this.mapper.start();
  }

  ngOnDestroy(): void {
    this.mapper.stop();
  }

  /** Texto de la asignacion de un control, por ejemplo "CC 14" o "Sin asignar". */
  asignacion(control: MixerControl): string {
    const controlId = this.mapper.assignedTo(control);
    return controlId === null ? 'Sin asignar' : midiControlLabel(controlId);
  }

  asignar(control: MixerControl): void {
    // Pulsar Asignar otra vez sobre el mismo control cancela la espera.
    if (this.mapper.learning() === control) {
      this.mapper.cancelLearning();
    } else {
      this.mapper.startLearning(control);
    }
  }

  quitar(control: MixerControl): void {
    this.mapper.clear(control);
  }

  restablecer(): void {
    this.mapper.reset();
  }

  get hayAsignaciones(): boolean {
    return Object.keys(this.mapper.mapping()).length > 0;
  }
}
