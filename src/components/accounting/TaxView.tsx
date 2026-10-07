import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { AccountingNavTabs } from './AccountingNavTabs';
import { Download, RefreshCw, Plus, FileText, CheckCircle2 } from 'lucide-react';

interface TaxData {
  statutory_profile: {
    company_name: string;
    bin: string;
    tin: string;
    tax_circle: string;
    customs_commissionerate: string;
    vat_reg_date: string;
    status: string;
  };
  rates: {
    retail_perfume_vat_percent: number;
    standard_import_vat_percent: number;
    advance_income_tax_ait_percent: number;
    payroll_withholding_active: boolean;
  };
  summary: {
    total_taxable_sales: number;
    output_vat: number;
    input_vat_credit: number;
    net_vat_payable: number;
    payroll_tax_withheld: number;
    total_tax_liability: number;
  };
  vat_sales_register: Array<{
    id: string;
    order_id: string;
    invoice_number: string;
    date: string;
    channel: string;
    customer_name: string;
    customer_phone: string;
    taxable_amount: number;
    vat_rate_percent: number;
    vat_amount: number;
    total_with_vat: number;
    status: string;
  }>;
  input_tax_register: Array<{
    id: string;
    po_number: string;
    supplier_name: string;
    date: string;
    taxable_cost: number;
    tax_type: string;
    rate_percent: number;
    input_vat_credit: number;
    status: string;
  }>;
  chalan_deposits: Array<{
    id: string;
    entry_number: string;
    date: string;
    description: string;
    chalan_number: string;
    amount: number;
    user: string;
    status: string;
  }>;
}

export const TaxView: React.FC = () => {
  const { sessionToken, currentUser, can, tier } = useAuth();
  const { paymentAccounts, refreshAll } = useApp();

  const canManage = Boolean(
    currentUser && (
      tier === 1 ||
      tier === 2 ||
      can('manage_accounts') ||
      currentUser.capabilities?.includes('manage_accounts')
    )
  );

  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'input' | 'chalans' | 'profile'>('sales');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Record Deposit Modal
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [depositTaxType, setDepositTaxType] = useState<'vat' | 'payroll' | 'ait'>('vat');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositChalanNumber, setDepositChalanNumber] = useState<string>('');
  const [depositDate, setDepositDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [depositAccountId, setDepositAccountId] = useState<string>('pacc_bank_brac');
  const [depositNotes, setDepositNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchTaxData = async () => {
    setLoading(true);
    try {
      const token = sessionToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('mirage_session_token') : null);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (currentUser?.id) headers['x-authenticated-user-id'] = currentUser.id;

      const res = await fetch('/api/accounting/tax', { headers });
      if (res.ok) {
        const data = await res.json();
        setTaxData(data);
      }
    } catch (err) {
      console.error('Failed to fetch tax data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxData();
  }, [sessionToken]);

  const filteredSales = useMemo(() => {
    if (!taxData?.vat_sales_register) return [];
    if (!searchQuery.trim()) return taxData.vat_sales_register;
    const q = searchQuery.toLowerCase();
    return taxData.vat_sales_register.filter(
      (s) =>
        s.invoice_number?.toLowerCase().includes(q) ||
        s.customer_name?.toLowerCase().includes(q) ||
        s.customer_phone?.includes(q)
    );
  }, [taxData, searchQuery]);

  const handleRecordDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(depositAmount);
    if (!amt || amt <= 0) {
      setSubmitError('Enter a valid deposit amount.');
      return;
    }
    if (!depositChalanNumber.trim()) {
      setSubmitError('Treasury chalan number is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const token = sessionToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('mirage_session_token') : null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (currentUser?.id) headers['x-authenticated-user-id'] = currentUser.id;

      const res = await fetch('/api/accounting/tax/deposit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tax_type: depositTaxType,
          amount: amt,
          chalan_number: depositChalanNumber.trim(),
          deposit_date: depositDate,
          payment_account_id: depositAccountId,
          notes: depositNotes.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to record deposit');
      }

      setShowDepositModal(false);
      setDepositAmount('');
      setDepositChalanNumber('');
      setDepositNotes('');
      await fetchTaxData();
      await refreshAll();
    } catch (err: any) {
      setSubmitError(err.message || 'Error recording tax payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (!taxData) return;
    const headers = [
      'Type',
      'Identifier',
      'Date',
      'Entity',
      'Taxable Amount',
      'Rate %',
      'Tax Amount',
      'Status',
    ];
    const rows: string[] = [headers.join(',')];

    taxData.vat_sales_register.forEach((s) => {
      rows.push(
        [
          'Output VAT',
          `"${s.invoice_number}"`,
          `"${s.date.slice(0, 10)}"`,
          `"${s.customer_name}"`,
          s.taxable_amount,
          s.vat_rate_percent,
          s.vat_amount,
          `"${s.status}"`,
        ].join(',')
      );
    });

    taxData.input_tax_register.forEach((i) => {
      rows.push(
        [
          'Input VAT Credit',
          `"${i.po_number}"`,
          `"${i.date.slice(0, 10)}"`,
          `"${i.supplier_name}"`,
          i.taxable_cost,
          i.rate_percent,
          i.input_vat_credit,
          `"${i.status}"`,
        ].join(',')
      );
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tax_vat_register_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3 font-sans text-xs">
      <AccountingNavTabs />

      {/* Screen Header */}
      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
        <div>
          <h1 className="text-base font-bold text-[var(--text)] tracking-tight">
            Tax & VAT
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => {
                setSubmitError(null);
                setShowDepositModal(true);
              }}
              className="px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold rounded hover:opacity-90 cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Tax Deposit
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold rounded hover:bg-[var(--surface-hover)] cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={fetchTaxData}
            className="p-1.5 border border-[var(--border)] rounded hover:bg-[var(--surface-hover)] text-[var(--text)] cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="p-2.5 bg-[var(--card)] border border-[var(--border)] rounded">
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Output VAT (Sales)</div>
          <div className="text-base font-bold font-mono text-[var(--text)] tabular-nums mt-0.5">
            ৳{(taxData?.summary.output_vat || 0).toLocaleString()}
          </div>
        </div>
        <div className="p-2.5 bg-[var(--card)] border border-[var(--border)] rounded">
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Input VAT Credit</div>
          <div className="text-base font-bold font-mono text-emerald-500 tabular-nums mt-0.5">
            ৳{(taxData?.summary.input_vat_credit || 0).toLocaleString()}
          </div>
        </div>
        <div className="p-2.5 bg-[var(--card)] border border-[var(--border)] rounded">
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Net VAT Payable</div>
          <div className="text-base font-bold font-mono text-amber-500 tabular-nums mt-0.5">
            ৳{(taxData?.summary.net_vat_payable || 0).toLocaleString()}
          </div>
        </div>
        <div className="p-2.5 bg-[var(--card)] border border-[var(--border)] rounded">
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Payroll Tax Withheld</div>
          <div className="text-base font-bold font-mono text-[var(--text)] tabular-nums mt-0.5">
            ৳{(taxData?.summary.payroll_tax_withheld || 0).toLocaleString()}
          </div>
        </div>
        <div className="p-2.5 bg-[var(--card)] border border-[var(--border)] rounded col-span-2 sm:col-span-1">
          <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Total Tax Due</div>
          <div className="text-base font-bold font-mono text-rose-500 tabular-nums mt-0.5">
            ৳{(taxData?.summary.total_tax_liability || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Segmented Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-1">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'sales'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          VAT Sales Register ({taxData?.vat_sales_register.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('input')}
          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'input'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Input Tax Credits ({taxData?.input_tax_register.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('chalans')}
          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'chalans'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Treasury Deposits ({taxData?.chalan_deposits.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'profile'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          BIN & Statutory Rates
        </button>
      </div>

      {/* TAB 1: VAT SALES REGISTER */}
      {activeTab === 'sales' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-1 px-2 bg-[var(--card)] border border-[var(--border)] rounded text-xs">
            <span className="text-[var(--text-muted)] font-medium">Search:</span>
            <input
              type="text"
              placeholder="Invoice #, customer, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-xs flex-1 max-w-xs text-[var(--text)]"
            />
          </div>

          <div className="border border-[var(--border)] rounded overflow-x-auto bg-[var(--card)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-semibold">Invoice #</th>
                  <th className="py-2 px-3 font-semibold">Date</th>
                  <th className="py-2 px-3 font-semibold">Channel</th>
                  <th className="py-2 px-3 font-semibold">Customer</th>
                  <th className="py-2 px-3 font-semibold text-right">Taxable (৳)</th>
                  <th className="py-2 px-3 font-semibold text-right">Rate</th>
                  <th className="py-2 px-3 font-semibold text-right">VAT (৳)</th>
                  <th className="py-2 px-3 font-semibold text-right">Total (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-[var(--text-muted)]">
                      No sales records found.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="py-2 px-3 font-mono font-semibold text-[var(--text)]">{s.invoice_number}</td>
                      <td className="py-2 px-3 font-mono text-[var(--text-muted)]">{s.date.slice(0, 10)}</td>
                      <td className="py-2 px-3 capitalize text-[var(--text)]">{s.channel}</td>
                      <td className="py-2 px-3 text-[var(--text)]">{s.customer_name}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--text)]">
                        {s.taxable_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                        {s.vat_rate_percent}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-amber-500">
                        {s.vat_amount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-[var(--text)]">
                        {s.total_with_vat.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INPUT TAX CREDITS */}
      {activeTab === 'input' && (
        <div className="border border-[var(--border)] rounded overflow-x-auto bg-[var(--card)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                <th className="py-2 px-3 font-semibold">PO / Bill of Entry</th>
                <th className="py-2 px-3 font-semibold">Date</th>
                <th className="py-2 px-3 font-semibold">Supplier</th>
                <th className="py-2 px-3 font-semibold">Tax Category</th>
                <th className="py-2 px-3 font-semibold text-right">Taxable Cost (৳)</th>
                <th className="py-2 px-3 font-semibold text-right">Credit Rate</th>
                <th className="py-2 px-3 font-semibold text-right">Input Credit (৳)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(taxData?.input_tax_register || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[var(--text-muted)]">
                    No input tax records.
                  </td>
                </tr>
              ) : (
                taxData?.input_tax_register.map((i) => (
                  <tr key={i.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-2 px-3 font-mono font-semibold text-[var(--text)]">{i.po_number}</td>
                    <td className="py-2 px-3 font-mono text-[var(--text-muted)]">{i.date.slice(0, 10)}</td>
                    <td className="py-2 px-3 text-[var(--text)]">{i.supplier_name}</td>
                    <td className="py-2 px-3 text-[var(--text)]">{i.tax_type}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--text)]">
                      {i.taxable_cost.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                      {i.rate_percent}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-emerald-500">
                      {i.input_vat_credit.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: TREASURY DEPOSITS & CHALANS */}
      {activeTab === 'chalans' && (
        <div className="border border-[var(--border)] rounded overflow-x-auto bg-[var(--card)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                <th className="py-2 px-3 font-semibold">Chalan #</th>
                <th className="py-2 px-3 font-semibold">Date</th>
                <th className="py-2 px-3 font-semibold">Description</th>
                <th className="py-2 px-3 font-semibold">Journal Entry</th>
                <th className="py-2 px-3 font-semibold text-right">Amount (৳)</th>
                <th className="py-2 px-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(taxData?.chalan_deposits || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[var(--text-muted)]">
                    No treasury chalan deposits recorded yet.
                  </td>
                </tr>
              ) : (
                taxData?.chalan_deposits.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-2 px-3 font-mono font-bold text-[var(--text)]">{c.chalan_number}</td>
                    <td className="py-2 px-3 font-mono text-[var(--text-muted)]">{c.date.slice(0, 10)}</td>
                    <td className="py-2 px-3 text-[var(--text)]">{c.description}</td>
                    <td className="py-2 px-3 font-mono text-[var(--text-muted)]">{c.entry_number}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-emerald-500">
                      ৳{c.amount.toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-semibold text-emerald-500 capitalize">{c.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: BIN & STATUTORY RATES */}
      {activeTab === 'profile' && taxData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded space-y-2">
            <div className="font-bold text-[var(--text)] border-b border-[var(--border)] pb-1">
              National Board of Revenue Registration
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <span className="text-[var(--text-muted)] font-medium">Business Name</span>
              <span className="font-semibold text-[var(--text)]">{taxData.statutory_profile.company_name}</span>

              <span className="text-[var(--text-muted)] font-medium">BIN (13-Digit)</span>
              <span className="font-mono font-bold text-[var(--accent)]">{taxData.statutory_profile.bin}</span>

              <span className="text-[var(--text-muted)] font-medium">e-TIN</span>
              <span className="font-mono font-bold text-[var(--text)]">{taxData.statutory_profile.tin}</span>

              <span className="text-[var(--text-muted)] font-medium">Tax Circle & Zone</span>
              <span className="text-[var(--text)]">{taxData.statutory_profile.tax_circle}</span>

              <span className="text-[var(--text-muted)] font-medium">Customs Office</span>
              <span className="text-[var(--text)]">{taxData.statutory_profile.customs_commissionerate}</span>

              <span className="text-[var(--text-muted)] font-medium">Registration Status</span>
              <span className="text-emerald-500 font-semibold">{taxData.statutory_profile.status}</span>
            </div>
          </div>

          <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded space-y-2">
            <div className="font-bold text-[var(--text)] border-b border-[var(--border)] pb-1">
              Statutory Tax & VAT Rates Matrix
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <span className="text-[var(--text-muted)] font-medium">Retail Perfume Trade VAT</span>
              <span className="font-mono font-bold text-[var(--text)]">
                {taxData.rates.retail_perfume_vat_percent.toFixed(1)}%
              </span>

              <span className="text-[var(--text-muted)] font-medium">Standard Import VAT</span>
              <span className="font-mono font-bold text-[var(--text)]">
                {taxData.rates.standard_import_vat_percent.toFixed(1)}%
              </span>

              <span className="text-[var(--text-muted)] font-medium">Advance Income Tax (AIT)</span>
              <span className="font-mono font-bold text-[var(--text)]">
                {taxData.rates.advance_income_tax_ait_percent.toFixed(1)}%
              </span>

              <span className="text-[var(--text-muted)] font-medium">Salary Withholding Tax</span>
              <span className="text-emerald-500 font-semibold">Active (Account 2060)</span>
            </div>
          </div>
        </div>
      )}

      {/* RECORD DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg max-w-md w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="font-bold text-sm text-[var(--text)]">Record Tax Deposit / Chalan</h3>
              <button
                onClick={() => setShowDepositModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
                {submitError}
              </div>
            )}

            <form onSubmit={handleRecordDeposit} className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[var(--text-muted)] font-semibold mb-1">Tax Liability Category</label>
                <select
                  value={depositTaxType}
                  onChange={(e) => setDepositTaxType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)] font-medium"
                >
                  <option value="vat">Output VAT Payable (Acc 2070)</option>
                  <option value="payroll">Payroll Tax Withholding (Acc 2060)</option>
                  <option value="ait">Supplier AIT Withholding (Acc 2080)</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] font-semibold mb-1">Treasury Chalan Number</label>
                <input
                  type="text"
                  placeholder="e.g. TR-2026-CH-9021"
                  value={depositChalanNumber}
                  onChange={(e) => setDepositChalanNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)] font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[var(--text-muted)] font-semibold mb-1">Amount (BDT)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="৳"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)] font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-muted)] font-semibold mb-1">Deposit Date</label>
                  <input
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)] font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] font-semibold mb-1">Payment Bank Account</label>
                <select
                  value={depositAccountId}
                  onChange={(e) => setDepositAccountId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)] font-medium"
                >
                  {(paymentAccounts || []).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.account_type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] font-semibold mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="Sonali Bank treasury branch deposit"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs text-[var(--text)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="px-3 py-1.5 border border-[var(--border)] rounded text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold rounded text-xs hover:opacity-90 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
