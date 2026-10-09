import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ToolTracker } from './tool-tracker/tool-tracker';

const routes: Routes = [
  {
    path: '',
    component: ToolTracker,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ToolTrackerRoutingModule {}
