import { Component } from '@angular/core';
import { AutoDjPanelComponent } from '../autodj-panel/autodj-panel';
import { DjConsoleComponent } from '../dj-console/dj-console';
import { LibraryComponent } from '../library/library';
import { MidiMappingComponent } from '../midi-mapping/midi-mapping';
import { MidiPanelComponent } from '../midi-panel/midi-panel';

/** Pantalla principal de DJ: la consola con los dos decks, el Auto-DJ, la biblioteca y el controlador MIDI. */
@Component({
  selector: 'app-dj-page',
  imports: [DjConsoleComponent, AutoDjPanelComponent, LibraryComponent, MidiPanelComponent, MidiMappingComponent],
  template: `
    <div style="padding: 20px; font-family: sans-serif;">
      <h2>SoundIA DJ</h2>
      <app-dj-console />
      <app-autodj-panel />
      <app-library />
      <app-midi-panel />
      <app-midi-mapping />
    </div>
  `,
})
export class DjPageComponent {}
