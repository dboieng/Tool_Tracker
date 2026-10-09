import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api/api.service';

// ---------- Types (match backend/services/toolTrackerService.js) ----------
export interface TtDevice {
  uuid: string;
  name: string;
  lastReportOn: string | null;
  batteryV: number | null;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyM: number | null;
  gpsOn: string | null;
  lteRsrp: number | null;
}

export interface TtTag {
  uuid: string;
  mac: string;
  name: string;
  notes: string | null;
  inBox: boolean;
  lastSeenOn: string | null;
  lastInBoxOn: string | null;
  lastRssi: number | null;
  batteryV: number | null;
  deviceName: string | null;
}

export interface TtUnknown {
  mac: string;
  lastSeenOn: string;
  lastRssi: number | null;
  batteryV: number | null;
  deviceName: string | null;
  reports: number;
}

export interface TtChange {
  change: 'RETURNED' | 'LEFT';
  toolName: string;
  on: string;
  latitude: number | null;
  longitude: number | null;
  deviceName: string | null;
}

export interface TtSummary {
  devices: TtDevice[];
  tags: TtTag[];
  unknown: TtUnknown[];
  changes: TtChange[];
  summary: { tools: number; inBox: number };
}

const BASE = 'tool-tracker';

@Injectable({ providedIn: 'root' })
export class ToolTrackerService {
  constructor(private api: ApiService) {}

  getSummary(): Observable<TtSummary> {
    return this.api.get<any>(`${BASE}/summary`).pipe(map((r) => r.data));
  }

  addTag(mac: string, name: string): Observable<TtTag> {
    return this.api.post<any>(`${BASE}/tags`, { mac, name }).pipe(map((r) => r.data));
  }

  renameTag(uuid: string, name: string): Observable<TtTag> {
    return this.api.put<any>(`${BASE}/tags/${uuid}`, { name }).pipe(map((r) => r.data));
  }

  deleteTag(uuid: string): Observable<unknown> {
    return this.api.delete<any>(`${BASE}/tags/${uuid}`);
  }
}
