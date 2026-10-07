import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { JournalEntry, Account } from '../../types';
import { AccountingNavTabs } from './AccountingNavTabs';
import {
  Search,
  Download,
  Plus,
  X,
  ArrowUpDown,
  RotateCcw,
  CheckCircle2,
  FileText,
  ExternalLink,
} from 'lucide-react';

export const JournalView: React.FC = () => {
  const { journalEntries, accounts, postJournalEntry, reverseJournalEntry, orders, expenses } = useApp();
  const { currentUser, can, tier } = useAuth();

  const canManage = Boolean(
    currentUser && (
      tier === 1 ||
      tier === 2 ||
      currentUser.tier === 1 ||
      currentUser.tier === 2 ||
      can('manage_accounts') ||
      currentUser.capabilities?.includes('manage_accounts') ||
      currentUser.toggles?.['manage_accounts'] === true
    )
  );

  const safeJournalEntries: JournalEntry[] = Array.isArray(journalEntries) ? journalEntries : [];
  const safeAccounts: Account[] = Array.isArray(accounts) ? accounts : [];

  // Filter Bar state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'reversed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting state
  const [sortField, setSortField] = useState<'date' | 'entry_number' | 'amount'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Detail Modal state
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // Reversal Dialog state
  const [reversalTarget, setReversalTarget] = useState<JournalEntry | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [isReversing, setIsReversing] = useState<boolean>(false);

  // New Manual Entry Modal state
  const [showNewEntryModal, setShowNewEntryModal] = useState<boolean>(false);
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newRef, setNewRef] = useState<string>('');
  const [newReason, setNewReason] = useState<string>('');
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lines, setLines] = useState<
    { account_id: string; debit: string; credit: string; line_desc: string }[]
  >([
    { account_id: safeAccounts[0]?.id || 'acc_cash', debit: '', credit: '', line_desc: '' },
    { account_id: safeAccounts[1]?.id || 'acc_sales_rev', debit: '', credit: '', line_desc: '' },
  ]);

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    return safeJournalEntries
      .filter((entry) => {
        const entryDate = (entry.date || '').slice(0, 10);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;

        if (accountFilter !== 'all') {
          const touchesAccount = (entry.lines || []).some(
            (l) => l.account_id === accountFilter
          );
          if (!touchesAccount) return false;
        }

        const isManual = entry.source === 'manual' || entry.transaction_type === 'manual_adjustment';
        if (sourceFilter === 'manual' && !isManual) return false;
        if (sourceFilter === 'auto' && isManual) return false;

        const isRev = entry.status === 'reversed' || entry.is_reversed;
        if (statusFilter === 'reversed' && !isRev) return false;
        if (statusFilter === 'posted' && isRev) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchNum = (entry.entry_number || '').toLowerCase().includes(q);
          const matchDesc = (entry.description || '').toLowerCase().includes(q);
          const matchRef = (entry.reference_id || '').toLowerCase().includes(q);
          const matchUser = (entry.created_by_name || '').toLowerCase().includes(q);
          const matchLine = (entry.lines || []).some(
            (l) =>
              (l.account_name || '').toLowerCase().includes(q) ||
              (l.account_id || '').toLowerCase().includes(q) ||
              (l.line_desc || '').toLowerCase().includes(q)
          );
          if (!matchNum && !matchDesc && !matchRef && !matchUser && !matchLine) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'date') {
          const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
          return sortAsc ? diff : -diff;
        } else if (sortField === 'entry_number') {
          return sortAsc
            ? a.entry_number.localeCompare(b.entry_number)
            : b.entry_number.localeCompare(a.entry_number);
        } else {
          const diff = (a.total_debit || 0) - (b.total_debit || 0);
          return sortAsc ? diff : -diff;
        }
      });
  }, [
    safeJournalEntries,
    startDate,
    endDate,
    accountFilter,
    sourceFilter,
    statusFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  // Filtered Totals
  const { filteredTotalDebit, filteredTotalCredit } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const entry of filteredEntries) {
      debits += Number(entry.total_debit) || 0;
      credits += Number(entry.total_credit) || 0;
    }
    return {
      filteredTotalDebit: Math.round(debits * 100) / 100,
      filteredTotalCredit: Math.round(credits * 100) / 100,
    };
  }, [filteredEntries]);

  // New Entry line calculations
  const panelTotalDebit = useMemo(() => {
    return lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  }, [lines]);

  const panelTotalCredit = useMemo(() => {
    return lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  }, [lines]);

  const panelDifference = useMemo(() => {
    return Math.round(Math.abs(panelTotalDebit - panelTotalCredit) * 100) / 100;
  }, [panelTotalDebit, panelTotalCredit]);

  const isPanelValid = useMemo(() => {
    return (
      newReason.trim().length > 0 &&
      lines.length >= 2 &&
      panelTotalDebit > 0 &&
      panelDifference <= 0.01 &&
      lines.every((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
    );
  }, [newReason, lines, panelTotalDebit, panelDifference]);

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Entry Number',
      'Source',
      'Description',
      'Reference',
      'Account Code',
      'Account Name',
      'Debit (BDT)',
      'Credit (BDT)',
      'Line Note',
      'User',
      'Status',
      'Reversal Of',
    ];

    const rows: string[] = [];
    rows.push(headers.join(','));

    for (const entry of filteredEntries) {
      const source = entry.source === 'manual' ? 'Manual' : 'Automated';
      const status = entry.status === 'reversed' || entry.is_reversed ? 'Reversed' : 'Posted';
      for (const line of entry.lines) {
        const clean = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
        rows.push(
          [
            clean((entry.date || '').slice(0, 10)),
            clean(entry.entry_number),
            clean(source),
            clean(entry.description),
            clean(entry.reference_id || ''),
            clean(line.account_id),
            clean(line.account_name),
            (line.debit || 0).toFixed(2),
            (line.credit || 0).toFixed(2),
            clean(line.line_desc || ''),
            clean(entry.created_by_name),
            clean(status),
            clean(entry.reversal_of || ''),
          ].join(',')
        );
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `journal_ledger_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add line to manual entry
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { account_id: safeAccounts[0]?.id || 'acc_cash', debit: '', credit: '', line_desc: '' },
    ]);
  };

  // Remove line from manual entry
  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit manual journal entry
  const handleSaveManualEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isPanelValid) return;

    setIsSaving(true);
    setPanelError(null);

    try {
      await postJournalEntry({
        date: newDate,
        reference_id: newRef.trim() || undefined,
        reason: newReason.trim(),
        lines: lines.map((l) => ({
          account_id: l.account_id,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          line_desc: l.line_desc.trim() || undefined,
        })),
        actor_id: currentUser?.id || 'usr_owner',
        actor_name: currentUser?.name || 'Authorized User',
      });

      setNewReason('');
      setNewRef('');
      setLines([
        { account_id: safeAccounts[0]?.id || 'acc_cash', debit: '', credit: '', line_desc: '' },
        { account_id: safeAccounts[1]?.id || 'acc_sales_rev', debit: '', credit: '', line_desc: '' },
      ]);
      setShowNewEntryModal(false);
    } catch (err: any) {
      setPanelError(err.message || 'Failed to post manual journal entry.');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Reversal
  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTarget) return;
    if (!reversalReason.trim()) {
      setReversalError('Reversal reason is required.');
      return;
    }

    setIsReversing(true);
    setReversalError(null);

    try {
      await reverseJournalEntry(reversalTarget.id, reversalReason.trim());
      setReversalTarget(null);
      setReversalReason('');
      setSelectedEntry(null);
    } catch (err: any) {
      setReversalError(err.message || 'Failed to reverse journal entry.');
    } finally {
      setIsReversing(false);
    }
  };

  // Find linked context details for the selected modal
  const linkedOrder = useMemo(() => {
    if (!selectedEntry?.reference_id) return null;
    return orders.find(
      (o) =>
        o.id === selectedEntry.reference_id ||
        o.invoice_number === selectedEntry.reference_id
    );
  }, [selectedEntry, orders]);

  const linkedExpense = useMemo(() => {
    if (!selectedEntry?.reference_id) return null;
    return expenses.find(
      (ex) =>
        ex.id === selectedEntry.reference_id ||
        ex.expense_number === selectedEntry.reference_id ||
        ex.receipt_reference === selectedEntry.reference_id
    );
  }, [selectedEntry, expenses]);

  return (
    <div className="space-y-3 font-sans text-xs text-gray-900 dark:text-gray-100">
      {/* Accounting Section Navigation Tabs */}
      <AccountingNavTabs />

      {/* 1. Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Journal Ledger
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => {
                setPanelError(null);
                setShowNewEntryModal(true);
              }}
              className="px-2.5 py-1.5 bg-gray-900 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-black text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Entry</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="px-2.5 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Clean, Minimalist Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded-lg text-xs">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-900 dark:text-gray-100 focus:outline-hidden"
            title="Start Date"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-900 dark:text-gray-100 focus:outline-hidden"
            title="End Date"
          />
        </div>

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="px-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden max-w-[180px]"
        >
          <option value="all">All Accounts</option>
          {safeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} - {a.name}
            </option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as any)}
          className="px-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
        >
          <option value="all">All Sources</option>
          <option value="auto">Automated</option>
          <option value="manual">Manual</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
        >
          <option value="all">All Status</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entry #, reference, description, account..."
            className="w-full pl-8 pr-2 py-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
          />
        </div>

        {(startDate || endDate || accountFilter !== 'all' || sourceFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setAccountFilter('all');
              setSourceFilter('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="px-2 py-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 underline cursor-pointer text-xs"
          >
            Reset
          </button>
        )}
      </div>

      {/* 3. Clean, Minimalist Journal Ledger Table */}
      <div className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[calc(100vh-250px)]">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-[11px] z-10 select-none">
              <tr>
                <th
                  onClick={() => {
                    if (sortField === 'date') setSortAsc(!sortAsc);
                    else {
                      setSortField('date');
                      setSortAsc(false);
                    }
                  }}
                  className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 w-28 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Date</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>

                <th
                  onClick={() => {
                    if (sortField === 'entry_number') setSortAsc(!sortAsc);
                    else {
                      setSortField('entry_number');
                      setSortAsc(true);
                    }
                  }}
                  className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 w-32 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Entry Number</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>

                <th className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 w-28 whitespace-nowrap">
                  Reference
                </th>

                <th className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 min-w-[240px]">
                  Description
                </th>

                <th className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 min-w-[200px]">
                  Accounts Involved
                </th>

                <th
                  onClick={() => {
                    if (sortField === 'amount') setSortAsc(!sortAsc);
                    else {
                      setSortField('amount');
                      setSortAsc(false);
                    }
                  }}
                  className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 text-right w-28 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Debit</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>

                <th className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 text-right w-28 whitespace-nowrap">
                  Credit
                </th>

                <th className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-800 w-24 text-center whitespace-nowrap">
                  Status
                </th>

                <th className="py-2.5 px-3 w-28 whitespace-nowrap">
                  Recorded By
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-sans text-xs">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500 dark:text-gray-400">
                    No journal ledger entries found.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isRev = entry.status === 'reversed' || entry.is_reversed;
                  const accountSummaries = (entry.lines || [])
                    .map((l) => l.account_name || l.account_id)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(' / ');

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors ${
                        isRev ? 'bg-gray-50/50 dark:bg-gray-900/30' : ''
                      }`}
                    >
                      {/* Date */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">
                        {(entry.date || '').slice(0, 10)}
                      </td>

                      {/* Entry Number */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 font-mono font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {entry.entry_number}
                      </td>

                      {/* Reference */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap truncate max-w-[120px]">
                        {entry.reference_id || '—'}
                      </td>

                      {/* Description */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 truncate max-w-[280px]">
                        {entry.description || '—'}
                      </td>

                      {/* Accounts Involved */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 truncate max-w-[220px]">
                        {accountSummaries || '—'}
                      </td>

                      {/* Debit */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-right font-mono text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">
                        {(entry.total_debit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Credit */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-right font-mono text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">
                        {(entry.total_credit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 border-r border-gray-100 dark:border-gray-800 text-center whitespace-nowrap">
                        <span className={`font-medium ${isRev ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                          {isRev ? 'Reversed' : 'Posted'}
                        </span>
                      </td>

                      {/* Recorded By */}
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap truncate max-w-[120px]">
                        {entry.created_by_name || 'System'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* 4. Balanced Footer */}
            <tfoot className="sticky bottom-0 bg-gray-50 dark:bg-gray-950 border-t-2 border-gray-200 dark:border-gray-800 font-mono font-bold text-xs text-gray-900 dark:text-gray-100 z-10">
              <tr>
                <td colSpan={5} className="py-2.5 px-3 text-right font-sans font-semibold text-gray-700 dark:text-gray-300">
                  Total ({filteredEntries.length} entries):
                </td>
                <td className="py-2.5 px-3 text-right border-r border-gray-200 dark:border-gray-800">
                  {filteredTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-right border-r border-gray-200 dark:border-gray-800">
                  {filteredTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={2} className="py-2.5 px-3 font-sans text-left font-normal text-gray-500 dark:text-gray-400">
                  {Math.abs(filteredTotalDebit - filteredTotalCredit) <= 0.01 ? (
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Balanced</span>
                  ) : (
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      Imbalance: {Math.abs(filteredTotalDebit - filteredTotalCredit).toFixed(2)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. Detailed Pop-up Modal Window for Transaction History & Breakdown */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto font-sans animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Journal Entry {selectedEntry.entry_number}
                </h2>
                <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                  {(selectedEntry.date || '').slice(0, 10)}
                </div>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-1 rounded-md cursor-pointer transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Transaction Key Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-gray-50 dark:bg-gray-950 p-3.5 rounded-lg border border-gray-200 dark:border-gray-800">
              <div>
                <div className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400">
                  Status
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                  {selectedEntry.status === 'reversed' || selectedEntry.is_reversed ? 'Reversed' : 'Posted'}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400">
                  Source
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                  {selectedEntry.source === 'manual' || selectedEntry.transaction_type === 'manual_adjustment' ? 'Manual' : 'Automated'}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400">
                  Reference
                </div>
                <div className="font-mono text-gray-900 dark:text-gray-100 mt-0.5">
                  {selectedEntry.reference_id || '—'}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400">
                  Recorded By
                </div>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5">
                  {selectedEntry.created_by_name || 'System'}
                </div>
              </div>

              <div className="col-span-2 sm:col-span-4 pt-1 border-t border-gray-200 dark:border-gray-800">
                <div className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400">
                  Description / Memo
                </div>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5">
                  {selectedEntry.description || '—'}
                </div>
              </div>
            </div>

            {/* Reversal Audit Trail Details */}
            {(selectedEntry.is_reversed || selectedEntry.status === 'reversed') && (
              <div className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  Reversal Audit Details
                </div>
                {selectedEntry.reversed_by && (
                  <div className="text-gray-700 dark:text-gray-300">
                    Reversing Entry: <span className="font-mono font-medium">{selectedEntry.reversed_by}</span>
                  </div>
                )}
                {selectedEntry.reversal_reason && (
                  <div className="text-gray-700 dark:text-gray-300">
                    Reason: <span>{selectedEntry.reversal_reason}</span>
                  </div>
                )}
                {selectedEntry.reversed_at && (
                  <div className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                    Reversed at: {new Date(selectedEntry.reversed_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* If this is itself a reversal entry */}
            {selectedEntry.reversal_of && (
              <div className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-xs">
                <span className="text-gray-600 dark:text-gray-400">This transaction reverses original entry: </span>
                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{selectedEntry.reversal_of}</span>
              </div>
            )}

            {/* Double-entry Debit and Credit Breakdown Table */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-left font-sans text-xs border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Account</th>
                    <th className="py-2 px-3">Line Memo</th>
                    <th className="py-2 px-3 text-right w-28">Debit (৳)</th>
                    <th className="py-2 px-3 text-right w-28">Credit (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                  {selectedEntry.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                      <td className="py-2 px-3 font-sans text-gray-900 dark:text-gray-100">
                        {l.account_name || l.account_id}
                      </td>
                      <td className="py-2 px-3 font-sans text-gray-500 dark:text-gray-400">
                        {l.line_desc || '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                        {l.debit > 0 ? l.debit.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                        {l.credit > 0 ? l.credit.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 font-mono font-bold">
                  <tr>
                    <td colSpan={2} className="py-2 px-3 font-sans text-right uppercase text-[10px] text-gray-700 dark:text-gray-300">
                      Total
                    </td>
                    <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                      {selectedEntry.total_debit.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                      {selectedEntry.total_credit.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Linked Context / History if present */}
            {(linkedOrder || linkedExpense) && (
              <div className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                  <span>Linked Business Record</span>
                </div>
                {linkedOrder && (
                  <div className="text-gray-700 dark:text-gray-300">
                    Order: <span className="font-mono font-medium">{linkedOrder.invoice_number}</span> ({linkedOrder.customer_name}) — Total: ৳{linkedOrder.total.toLocaleString()}
                  </div>
                )}
                {linkedExpense && (
                  <div className="text-gray-700 dark:text-gray-300">
                    Expense: <span className="font-mono font-medium">{linkedExpense.expense_number || linkedExpense.id}</span> ({linkedExpense.category}) — Amount: ৳{linkedExpense.amount.toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
              <div>
                {!selectedEntry.is_reversed && selectedEntry.status !== 'reversed' && canManage && (
                  <button
                    onClick={() => {
                      setReversalTarget(selectedEntry);
                      setReversalReason('');
                      setReversalError(null);
                    }}
                    className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reverse Entry</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-1.5 bg-gray-900 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-black text-xs font-semibold rounded-md cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Reversal Reason Dialog */}
      {reversalTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleConfirmReversal}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 font-sans text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="border-b border-gray-200 dark:border-gray-800 pb-2.5 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                Reverse Journal Entry {reversalTarget.entry_number}
              </h3>
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-gray-600 dark:text-gray-400">
              A balancing reversal entry will be generated, swapping Debits and Credits and restoring account balances.
            </div>

            {reversalError && (
              <div className="p-2.5 bg-gray-100 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 text-xs">
                {reversalError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Reason for Reversal
              </label>
              <input
                type="text"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Reason for reversal..."
                autoFocus
                required
                className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reversalReason.trim() || isReversing}
                className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-black rounded text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isReversing ? 'Processing...' : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. New Manual Entry Modal */}
      {showNewEntryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto font-sans text-xs animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="pb-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">New Journal Entry</h2>
              </div>
              <button
                onClick={() => setShowNewEntryModal(false)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isPanelValid) handleSaveManualEntry();
              }}
              className="space-y-4"
            >
              {panelError && (
                <div className="p-2.5 bg-gray-100 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 text-xs">
                  {panelError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-900 dark:text-gray-100 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Reference / Voucher #
                  </label>
                  <input
                    type="text"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    placeholder="e.g. JV-1001"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-900 dark:text-gray-100 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Description / Explanation
                </label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Business explanation for this entry..."
                  rows={2}
                  required
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
                />
              </div>

              {/* Lines Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Journal Lines</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-gray-800 dark:text-gray-200 font-semibold hover:underline cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left font-sans text-xs border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-semibold">
                      <tr>
                        <th className="py-2 px-2.5">Account</th>
                        <th className="py-2 px-2.5 w-24 text-right">Debit (৳)</th>
                        <th className="py-2 px-2.5 w-24 text-right">Credit (৳)</th>
                        <th className="py-2 px-2.5">Line Memo</th>
                        <th className="py-2 px-2.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {lines.map((l, idx) => (
                        <tr key={idx} className="bg-white dark:bg-gray-900">
                          <td className="p-1.5">
                            <select
                              value={l.account_id}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLines((prev) =>
                                  prev.map((line, i) =>
                                    i === idx ? { ...line, account_id: val } : line
                                  )
                                );
                              }}
                              className="w-full p-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
                            >
                              {safeAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  [{a.code}] {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.debit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLines((prev) =>
                                  prev.map((line, i) =>
                                    i === idx ? { ...line, debit: val, credit: val ? '' : line.credit } : line
                                  )
                                );
                              }}
                              placeholder="0.00"
                              className="w-full p-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-right text-gray-900 dark:text-gray-100 focus:outline-hidden"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.credit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLines((prev) =>
                                  prev.map((line, i) =>
                                    i === idx ? { ...line, credit: val, debit: val ? '' : line.debit } : line
                                  )
                                );
                              }}
                              placeholder="0.00"
                              className="w-full p-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-right text-gray-900 dark:text-gray-100 focus:outline-hidden"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={l.line_desc}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLines((prev) =>
                                  prev.map((line, i) =>
                                    i === idx ? { ...line, line_desc: val } : line
                                  )
                                );
                              }}
                              placeholder="Line memo"
                              className="w-full p-1 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-gray-100 focus:outline-hidden"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            {lines.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer p-1"
                                title="Remove line"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 font-mono font-bold">
                      <tr>
                        <td className="py-2 px-2.5 text-right uppercase text-[10px] font-sans text-gray-700 dark:text-gray-300">
                          Totals:
                        </td>
                        <td className="py-2 px-2.5 text-right">{panelTotalDebit.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right">{panelTotalCredit.toFixed(2)}</td>
                        <td colSpan={2} className="py-2 px-2.5 text-xs font-sans text-gray-600 dark:text-gray-400">
                          {panelDifference <= 0.01 && panelTotalDebit > 0 ? (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Balanced</span>
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              Diff: {panelDifference.toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowNewEntryModal(false)}
                  className="px-3.5 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isPanelValid || isSaving}
                  className="px-4 py-1.5 bg-gray-900 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-black rounded text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-xs"
                >
                  {isSaving ? 'Posting...' : 'Save & Post Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
