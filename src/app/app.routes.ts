import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard';
import { DjPageComponent } from './features/dj-page/dj-page';

export const routes: Routes = [
    { path: 'dj', component: DjPageComponent},
    { path: 'dashboard', component: DashboardComponent},
    { path: '', redirectTo: 'dashboard', pathMatch: 'full'}
];
