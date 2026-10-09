import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { ToolTrackerService, TtDevice, TtSummary, TtTag } from '../../../core/services/tool-tracker';

const REFRESH_MS = 60_000;   // auto refresh every minute
const STALE_HOURS = 26;      // Walter reports daily; flag as late after this
const LOW_TAG_BATT = 2.7;    // iBS05 coin cell getting low

@Component({
  selector: 'app-tool-tracker',
  imports: [CommonModule, FormsModule],
  templateUrl: './tool-tracker.html',
  styles: [`
    /* Phone: each table row becomes a card (same idea as worker-logs EDIT-128) */
    @media (max-width: 640px) {
      .tt-table thead { display: none; }
      .tt-table, .tt-table tbody, .tt-table tr, .tt-table td { display: block; width: 100%; }
      .tt-table tr { margin-bottom: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; background: #fff; }
      .tt-table td { display: flex; justify-content: space-between; gap: 1rem; border: 0; border-bottom: 1px solid #f3f4f6; text-align: right; }
      .tt-table td[data-label]::before { content: attr(data-label); font-weight: 600; color: #4b5563; text-align: left; }
    }
  `],
})
export class ToolTracker implements OnInit, OnDestroy {
  data: TtSummary | null = null;
  loading = false;
  mapUrl: SafeResourceUrl | null = null;
  private mapSrc = '';
  private timer: any;

  // add / rename / remove UI state
  showAdd = false;
  newMac = '';
  newName = '';
  editingUuid: string | null = null;
  editName = '';
  armedDelete: string | null = null;
  adoptNames: Record<string, string> = {};

  readonly lowBatt = LOW_TAG_BATT;

  constructor(
    private tracker: ToolTrackerService,
    private sanitizer: DomSanitizer,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.timer = setInterval(() => {
      if (!this.editingUuid && document.visibilityState === 'visible') this.load();
    }, REFRESH_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  // ---------- data ----------
  load(): void {
    this.loading = true;
    this.tracker.getSummary().subscribe({
      next: (d) => {
        this.data = d;
        this.updateMap(d.devices[0]);
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.toastr.error(e?.error?.message || 'Could not load the tool tracker');
      },
    });
  }

  get device(): TtDevice | null {
    return this.data?.devices?.[0] ?? null;
  }

  get missingNames(): string {
    return (this.data?.tags || []).filter((t) => !t.inBox).map((t) => t.name).join(', ');
  }

  get isStale(): boolean {
    const d = this.device;
    if (!d?.lastReportOn) return true;
    return (Date.now() - new Date(d.lastReportOn).getTime()) / 3_600_000 > STALE_HOURS;
  }

  private updateMap(d?: TtDevice): void {
    if (!d || d.latitude === null || d.longitude === null) {
      this.mapUrl = null;
      this.mapSrc = '';
      return;
    }
    const dlat = 0.004, dlon = 0.006;
    const bbox = [d.longitude - dlon, d.latitude - dlat, d.longitude + dlon, d.latitude + dlat].join(',');
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${d.latitude},${d.longitude}`;
    if (src !== this.mapSrc) {
      this.mapSrc = src;
      this.mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(src);
    }
  }

  // ---------- display helpers ----------
  ago(date: string | null): string {
    if (!date) return 'never';
    const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
  }

  lteWord(rsrp: number | null): string {
    if (rsrp === null || rsrp === undefined) return '–';
    const q = rsrp > -90 ? 'excellent' : rsrp > -105 ? 'good' : rsrp > -115 ? 'fair' : 'weak';
    return `${rsrp} dBm (${q})`;
  }

  mapsLink(lat: number | null, lon: number | null): string {
    return `https://maps.google.com/?q=${lat},${lon}`;
  }

  trackByUuid = (_: number, t: TtTag) => t.uuid;

  // ---------- actions ----------
  addTool(mac: string, name: string, after?: () => void): void {
    this.tracker.addTag(mac, name).subscribe({
      next: () => {
        this.toastr.success(`Added "${name}"`);
        after?.();
        this.load();
      },
      error: (e) => this.toastr.error(e?.error?.message || 'Could not add tool'),
    });
  }

  submitAdd(): void {
    this.addTool(this.newMac, this.newName, () => {
      this.newMac = '';
      this.newName = '';
      this.showAdd = false;
    });
  }

  adopt(mac: string): void {
    this.addTool(mac, this.adoptNames[mac] || '', () => delete this.adoptNames[mac]);
  }

  startRename(t: TtTag): void {
    this.editingUuid = t.uuid;
    this.editName = t.name;
  }

  saveRename(): void {
    if (!this.editingUuid) return;
    this.tracker.renameTag(this.editingUuid, this.editName).subscribe({
      next: () => {
        this.editingUuid = null;
        this.toastr.success('Renamed');
        this.load();
      },
      error: (e) => this.toastr.error(e?.error?.message || 'Could not rename'),
    });
  }

  remove(t: TtTag): void {
    // Two-click confirm instead of a popup
    if (this.armedDelete !== t.uuid) {
      this.armedDelete = t.uuid;
      setTimeout(() => { if (this.armedDelete === t.uuid) this.armedDelete = null; }, 4000);
      return;
    }
    this.armedDelete = null;
    this.tracker.deleteTag(t.uuid).subscribe({
      next: () => {
        this.toastr.success(`Removed "${t.name}"`);
        this.load();
      },
      error: (e) => this.toastr.error(e?.error?.message || 'Could not remove'),
    });
  }
}
