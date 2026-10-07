/**
 * Literal implementation of Section 36.4a NAV_CONFIG
 * The single source of truth for sidebar navigation
 */

export interface NavChild {
  label: string;
  path: string;
  badgeKey?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: NavChild[];
  requiresTier?: string[];
  badgeKey?: string;
}

export const LEGACY_PATH_ALIASES: Record<string, string> = {
  '/accounting': '/accounting/ledger',
  '/accounting/journal': '/accounting/ledger',
  '/accounting/journals': '/accounting/ledger',
  '/accounting/vat': '/accounting/tax',
  '/operations/packaging': '/inventory/packaging',
  '/operations/staff': '/staff',
  '/hr': '/staff',
  '/hr/employees': '/staff',
  '/hr/attendance': '/staff',
  '/hr/leaves': '/staff',
  '/hr/payroll': '/staff',
  '/hr/recruitment': '/staff',
  '/hr/performance': '/staff',
  '/hr/offboarding': '/staff',
};

export const PAGE_TITLE_OVERRIDES: Record<string, string> = {
  '/accounting': 'Journal Ledger',
  '/accounting/ledger': 'Journal Ledger',
  '/accounting/journal': 'Journal Ledger',
  '/packing': 'Packing Station',
  '/accounting/salary': 'Payroll',
  '/payroll': 'Payroll',
  '/profile': 'My Profile',
  '/my-profile': 'My Profile',
  '/settings': 'Settings',
  '/audit-log': 'Audit Log',
  '/inventory/packaging/count': 'Count',
  '/inventory/packaging/purchase': 'Purchase',
  // Preserving other special switch returns:
  '/orders': 'All Orders',
  '/courier/bookings': 'Courier Bookings',
  '/accounting/pnl': 'Financial Reports',
  '/accounting/payments': 'Daily Till',
  '/accounting/cash-register': 'Daily Till',
  '/settings/security': 'System Security',
  '/inventory/ledger': 'Stock Movements',
};

export function resolveNavPath(path: string): string {
  if (!path) return path;
  const [base, query] = path.split('?');
  const resolved = LEGACY_PATH_ALIASES[base] || base;
  return query !== undefined ? `${resolved}?${query}` : resolved;
}

export const NAV_CONFIG: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/dashboard' },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'ShoppingCart',
    children: [
      { label: 'New Order', path: '/orders/new' },
      { label: 'Walk-in Sale', path: '/orders/walk-in' },
      { label: "Today's Orders", path: '/orders/today' },
      { label: 'Scheduled Orders', path: '/orders/scheduled', badgeKey: 'scheduled_orders' },
      { label: 'Pre-Orders', path: '/orders/pre-orders', badgeKey: 'pre_orders' },
      { label: 'All Sales & Orders', path: '/orders' },
      { label: 'Cancelled Orders', path: '/orders/cancelled' },
      { label: 'Returns & RTO', path: '/orders/returns' },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'Users',
    requiresTier: ['owner', 'general_manager', 'manager', 'packing_staff'],
    children: [
      { label: 'Customers', path: '/customers' },
      { label: 'Suppliers', path: '/purchasing/suppliers' },
    ],
  },
  {
    id: 'packing',
    label: 'Packing',
    icon: 'PackageCheck',
    path: '/packing',
    badgeKey: 'pending_packing',
    requiresTier: ['owner', 'general_manager', 'manager', 'packing_staff'],
  },
  {
    id: 'staff',
    label: 'Staff',
    icon: 'UserCheck',
    path: '/staff',
    requiresTier: ['owner', 'general_manager', 'manager', 'packing_staff'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Boxes',
    children: [
      { label: 'Products', path: '/inventory/products' },
      { label: 'Stock Report', path: '/inventory/stock-report' },
      { label: 'Locations', path: '/inventory/locations' },
      { label: 'Stock Movements', path: '/inventory/movements' },
      { label: 'Stock Transfer', path: '/inventory/transfer' },
      { label: 'Batches', path: '/inventory/batches' },
      { label: 'Testers', path: '/inventory/testers' },
      { label: 'Packaging Materials', path: '/inventory/packaging' },
      { label: 'Fragrance Notes', path: '/inventory/fragrance-notes' },
    ],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    icon: 'Truck',
    requiresTier: ['owner', 'general_manager', 'manager'],
    children: [
      { label: 'Purchase Orders', path: '/purchasing/orders' },
      { label: 'Purchase Returns', path: '/purchasing/returns' },
    ],
  },
  {
    id: 'courier',
    label: 'Courier',
    icon: 'Send',
    requiresTier: ['owner', 'general_manager', 'manager', 'packing_staff'],
    children: [
      { label: 'Booking History', path: '/courier/bookings' },
      { label: 'Live Tracking', path: '/courier/tracking' },
      { label: 'RTO Tracking', path: '/courier/rto' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    icon: 'Landmark',
    requiresTier: ['owner', 'general_manager'],
    children: [
      { label: 'Journal Ledger', path: '/accounting/ledger' },
      { label: 'Sales & Payments', path: '/accounting/sales-payments' },
      { label: 'Income', path: '/accounting/income' },
      { label: 'Expenses', path: '/accounting/expenses' },
      { label: 'Payment Accounts', path: '/accounting/payments' },
      { label: 'Salary & Payslips', path: '/accounting/salary' },
      { label: 'Reconciliation', path: '/accounting/reconciliation' },
      { label: 'Payable & Receivable', path: '/accounting/payable-receivable' },
      { label: 'Profit & Loss', path: '/accounting/pnl' },
      { label: 'Tax & VAT', path: '/accounting/tax' },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    icon: 'Tag',
    requiresTier: ['owner', 'general_manager', 'manager'],
    children: [
      { label: 'Pricing Engine', path: '/pricing/engine' },
      { label: 'Market/Competitor Data', path: '/pricing/market' },
    ],
  },
  { id: 'reports', label: 'Reports', icon: 'FileBarChart', path: '/reports', requiresTier: ['owner', 'general_manager', 'manager'] },
  { id: 'users', label: 'Users & Roles', icon: 'ShieldCheck', path: '/settings/users', requiresTier: ['owner', 'general_manager'] },
  { id: 'audit', label: 'Audit Log', icon: 'History', path: '/audit-log', requiresTier: ['owner', 'general_manager'] },
  { id: 'settings', label: 'Settings', icon: 'Settings', path: '/settings', requiresTier: ['owner', 'general_manager'] },
];
