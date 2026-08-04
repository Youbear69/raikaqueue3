import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './admin/admin-layout.component';
import { GallerySettingsComponent } from './admin/gallery-settings.component';
import { ImagesComponent } from './admin/images.component';
import { NavSettingsComponent } from './admin/nav-settings.component';
import { RegisterSettingsComponent } from './admin/register-settings.component';
import { SiteSettingsComponent } from './admin/site-settings.component';
import { UsersComponent } from './admin/users.component';
import { ControlComponent } from './control/control.component';
import { GalleryComponent } from './gallery/gallery.component';
import { HomeComponent } from './home/home.component';
import { MasterComponent } from './master/master.component';
import { RegisterComponent } from './register/register.component';
import { WidgetListComponent } from './widget-list/widget-list.component';
import { WidgetComponent } from './widget/widget.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'gallery', component: GalleryComponent },
  { path: 'widget', component: WidgetComponent },
  { path: 'widget-list', component: WidgetListComponent },
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: 'control', component: ControlComponent },
      { path: 'master', component: MasterComponent },
      { path: 'settings', component: SiteSettingsComponent },
      { path: 'register-settings', component: RegisterSettingsComponent },
      { path: 'nav-settings', component: NavSettingsComponent },
      { path: 'gallery-settings', component: GallerySettingsComponent },
      { path: 'images', component: ImagesComponent },
      { path: 'users', component: UsersComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
