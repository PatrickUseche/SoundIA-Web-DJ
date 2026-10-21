import { Component } from '@angular/core';
import { AutoDjPanelComponent } from '../autodj-panel/autodj-panel';
import { DjConsoleComponent } from '../dj-console/dj-console';
import { LibraryComponent } from '../library/library';

/** Pantalla principal de DJ: la consola con los dos decks, el Auto-DJ y la biblioteca de pistas. */
@Component({
  selector: 'app-dj-page',
  imports: [DjConsoleComponent, AutoDjPanelComponent, LibraryComponent],
  template: `
    <div style="padding: 20px; font-family: sans-serif;">
      <h2>SoundIA DJ</h2>
      <app-dj-console />
      <app-autodj-panel />
      <app-library />
    </div>
  `,
})
export class DjPageComponent {}
