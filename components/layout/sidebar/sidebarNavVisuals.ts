import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  Calculator,
  CheckSquare,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Rocket,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';

/** Visual-only mapping for sidebar nav icons — does not affect routing or permissions. */
export type SidebarPageVisual = {
  Icon: LucideIcon;
  color: string;
};

export const SIDEBAR_PAGE_VISUALS: Record<string, SidebarPageVisual> = {
  dashboard: { Icon: LayoutDashboard, color: '#A78BFA' },
  transactions: { Icon: Calculator, color: '#22D3EE' },
  accounting: { Icon: ClipboardList, color: '#34D399' },
  personalTransactions: { Icon: Wallet, color: '#FB923C' },
  budgets: { Icon: BarChart3, color: '#8B5CF6' },
  projectSelling: { Icon: Rocket, color: '#3B82F6' },
  investmentManagement: { Icon: PiggyBank, color: '#EC4899' },
  projectManagement: { Icon: HardHat, color: '#FACC15' },
  vendorDirectory: { Icon: ShoppingCart, color: '#14B8A6' },
  pmConfig: { Icon: RefreshCw, color: '#38BDF8' },
  rentalManagement: { Icon: Building2, color: '#6366F1' },
  payroll: { Icon: Users, color: '#22C55E' },
  approvals: { Icon: CheckSquare, color: '#F59E0B' },
  settings: { Icon: Settings, color: '#94A3B8' },
};
