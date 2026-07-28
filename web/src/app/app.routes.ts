import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './admin/admin-layout.component';
import { SiteSettingsComponent } from './admin/site-settings.component';
import { ControlComponent } from './control/control.component';
import { HomeComponent } from './home/home.component';
import { MasterComponent } from './master/master.component';
import { RegisterComponent } from './register/register.component';
import { WidgetListComponent } from './widget-list/widget-list.component';
import { WidgetComponent } from './widget/widget.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'widget', component: WidgetComponent },
  { path: 'widget-list', component: WidgetListComponent },
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: 'control', component: ControlComponent },
      { path: 'master', component: MasterComponent },
      { path: 'settings', component: SiteSettingsComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
