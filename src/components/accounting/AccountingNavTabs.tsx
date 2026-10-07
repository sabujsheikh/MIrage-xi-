import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

export const AccountingNavTabs: React.FC = () => {
  const { activePath, setActivePath } = useApp();
  const { currentUser, can, tier } = useAuth();

  const canAccessSalesFinancialLedger = Boolean(
    currentUser && (
      tier === 1 ||
      tier === 2 ||
      can('view_sales_financial_ledger') ||
      currentUser.capabilities?.includes('view_sales_financial_ledger') ||
      currentUser.toggles?.['view_sales_financial_ledger'] === true
    )
  );

  const tabs = [
    { label: 'Journal Ledger', path: '/accounting/ledger' },
    ...(canAccessSalesFinancialLedger ? [{ label: 'Sales & Payments', path: '/accounting/sales-payments' }] : []),
    { label: 'Income', path: '/accounting/income' },
    { label: 'Expenses', path: '/accounting/expenses' },
    { label: 'Payment Accounts', path: '/accounting/payments' },
    { label: 'Salary & Payslips', path: '/accounting/salary' },
    { label: 'Reconciliation', path: '/accounting/reconciliation' },
    { label: 'Payable & Receivable', path: '/accounting/payable-receivable' },
    { label: 'Profit & Loss', path: '/accounting/pnl' },
    { label: 'Tax & VAT', path: '/accounting/tax' },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1.5 border-b border-[var(--border)] scrollbar-none">
      {tabs.map((tab) => {
        const isActive =
          activePath === tab.path ||
          (tab.path === '/accounting/ledger' &&
            (activePath === '/accounting' ||
              activePath === '/accounting/journal' ||
              activePath === '/accounting/journals')) ||
          (tab.path === '/accounting/tax' && activePath === '/accounting/vat');
        return (
          <button
            key={tab.path}
            onClick={() => setActivePath(tab.path)}
            className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isActive
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
