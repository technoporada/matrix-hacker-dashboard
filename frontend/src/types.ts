export type ThemeKey = 'matrix' | 'amber' | 'ice';

export interface ThemeColors {
  name: string; bg: string; bg2: string; text: string;
  border: string; muted: string; accent: string; canvas: string;
  dim: string; glow: string; label: string;
}

export interface LogEntry {
  timestamp: string; type: string; message: string;
}

export interface ScraperResult {
  type: string; title?: string; text?: string; url?: string;
}

export interface WhoisResult {
  domain: string; registrar: string; created: string; expires: string; nameservers: string[];
}

export interface GeoIpResult {
  ip: string; hostname?: string; country: string; region: string; city: string;
  ll: number[]; timezone: string; coordinates: string; org: string;
}

export interface PortResult {
  port: number; status: string; service: string;
}

export interface SubdomainResult {
  subdomain: string; exists: boolean;
}

export interface SslResult {
  domain: string; issuer: string; subject: string; valid_from: string; valid_to: string;
}

export interface HistoryScan {
  id: string; type: string; target: string; summary?: string;
  results?: unknown; created_at: string; notes?: string;
  preview?: string;
}
