import { describe, it, expect, beforeEach } from 'vitest';
import { MirageDB } from '../server/db';

describe('Journal Ledger UI & API Operations', () => {
  let db: MirageDB;

  beforeEach(() => {
    db = new MirageDB();
  });

  it('verifies seeded journal entries exist and are balanced', () => {
    expect(db.journalEntries.length).toBeGreaterThanOrEqual(8);
    for (const entry of db.journalEntries) {
      expect(entry.total_debit).toBe(entry.total_credit);
      const sumDr = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const sumCr = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
      expect(Math.abs(sumDr - sumCr)).toBeLessThanOrEqual(0.01);
    }
  });

  it('verifies opening balance entry exists with proper accounts', () => {
    const ob = db.journalEntries.find(j => (j.description || '').toLowerCase().includes('opening balance') || j.reference_id?.includes('OB'));
    expect(ob).toBeDefined();
    expect(ob?.total_debit).toBe(1903500);
    expect(ob?.total_credit).toBe(1903500);
    expect(ob?.lines.some(l => l.account_id === 'acc_cash' && l.debit === 45000)).toBe(true);
    expect(ob?.lines.some(l => l.account_id === 'acc_equity' && l.credit === 1483500)).toBe(true);
  });

  it('verifies reversal history linking', () => {
    const revEntry = db.journalEntries.find(j => j.reversal_of === 'JE-2026-0007');
    expect(revEntry).toBeDefined();
    expect(revEntry?.description).toContain('Reversal of JE-2026-0007');

    const origEntry = db.journalEntries.find(j => j.entry_number === 'JE-2026-0007');
    expect(origEntry).toBeDefined();
    expect(origEntry?.status).toBe('reversed');
    expect(origEntry?.is_reversed).toBe(true);
    expect(origEntry?.reversed_by).toBe('JE-2026-0008');
    expect(origEntry?.reversal_reason).toBeTruthy();
  });

  it('verifies manual journal creation through createManualJournalEntry', () => {
    const newEntry = db.createManualJournalEntry({
      date: '2026-03-28',
      reference_id: 'JV-MAN-01',
      reason: 'Stationery and supplies reimbursement',
      lines: [
        { account_id: 'acc_office_exp', debit: 650, credit: 0, line_desc: 'Paper & markers' },
        { account_id: 'acc_cash', debit: 0, credit: 650, line_desc: 'Petty cash payment' },
      ],
      actor_id: 'usr_owner',
      actor_name: 'Sobuj Sehk',
    });

    expect(newEntry).toBeDefined();
    expect(newEntry.total_debit).toBe(650);
    expect(newEntry.total_credit).toBe(650);
    expect(newEntry.status).toBe('posted');
    expect(db.journalEntries[0].id).toBe(newEntry.id);
  });

  it('verifies reversal with mandatory reason swaps lines and restores balances', () => {
    const je = db.createManualJournalEntry({
      date: '2026-03-28',
      reference_id: 'JV-REV-TEST',
      reason: 'Temporary test entry',
      lines: [
        { account_id: 'acc_bank', debit: 12000, credit: 0 },
        { account_id: 'acc_cash', debit: 0, credit: 12000 },
      ],
      actor_id: 'usr_owner',
      actor_name: 'Sobuj Sehk',
    });

    const rev = db.reverseJournalEntry(je.id, 'Wrong account debited', 'usr_owner', 'Sobuj Sehk');
    expect(rev).toBeDefined();
    expect(rev.reversal_of).toBe(je.entry_number);
    expect(rev.lines.find(l => l.account_id === 'acc_bank')?.credit).toBe(12000);
    expect(rev.lines.find(l => l.account_id === 'acc_cash')?.debit).toBe(12000);

    expect(je.is_reversed).toBe(true);
    expect(je.status).toBe('reversed');
    expect(je.reversed_by).toBe(rev.entry_number);
  });
});
