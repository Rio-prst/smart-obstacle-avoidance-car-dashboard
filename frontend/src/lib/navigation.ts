import {
  BarChart3,
  ClipboardList,
  Gamepad2,
  History,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Kendali', path: '/control', icon: Gamepad2 },
  { label: 'Riwayat', path: '/history', icon: History },
  { label: 'Sesi Uji', path: '/sessions', icon: ClipboardList },
  { label: 'Analisis', path: '/analytics', icon: BarChart3 },
  { label: 'Konfigurasi', path: '/config', icon: Settings },
];

export function getPageTitle(pathname: string): string {
  const activeItem = navItems.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );

  return activeItem?.label ?? 'Dashboard';
}
