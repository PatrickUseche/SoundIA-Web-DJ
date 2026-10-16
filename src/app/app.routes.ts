import { Routes } from '@angular/router';
import { DashboradComponent } from './features/dashboard/dashboard';

export const routes: Routes = [
    { path: 'dashboard', component: DashboradComponent},
    { path: '', redirectTo: 'dashboard', pathMatch: 'full'}
];
