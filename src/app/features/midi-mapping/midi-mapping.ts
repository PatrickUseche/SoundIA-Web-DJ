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

  protected readonly controls = MIXER_CONTROLS;
  protected readonly labelText = controlLabel;

  ngOnInit(): void {
    this.mapper.start();
  }

  ngOnDestroy(): void {
    this.mapper.stop();
  }

  /**
   * Texto de la asignación de un control, por ejemplo "Canal 2 · CC 14" o "Sin asignar". Las asignaciones
   * guardadas antes de distinguir el canal valen para cualquiera y se muestran como "CC 14 (cualquier canal)".
   */
  assignmentLabel(control: MixerControl): string {
    const assignedControl = this.mapper.assignedTo(control);
    if (assignedControl === null) {
      return 'Sin asignar';
    }
    return assignedControl.channel === null
      ? `${midiControlLabel(assignedControl.controlId)} (cualquier canal)`
      : midiControlLabel(assignedControl.controlId, assignedControl.channel);
  }

  assignControl(control: MixerControl): void {
    // Pulsar Asignar otra vez sobre el mismo control cancela la espera.
    if (this.mapper.learning() === control) {
      this.mapper.cancelLearning();
    } else {
      this.mapper.startLearning(control);
    }
  }

  removeItem(control: MixerControl): void {
    this.mapper.clear(control);
  }

  resetValue(): void {
    this.mapper.reset();
  }

  get hasAssignments(): boolean {
    return Object.keys(this.mapper.mapping()).length > 0;
  }
}
