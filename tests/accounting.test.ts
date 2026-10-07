import { describe, it, expect, beforeEach } from 'vitest';
import { MirageDB } from '../server/db';

describe('Accounting & Journal Engine Integrity Tests', () => {
  let db: MirageDB;

  beforeEach(() => {
    db = new MirageDB();
  });

  // 1. Unbalanced Entry Rejected
  it('1. rejects unbalanced journal entries (Dr != Cr)', () => {
    // Unbalanced manual journal entry
    expect(() => {
      db.createManualJournalEntry({
        date: '2026-03-01',
        reason: 'Unbalanced Test',
        lines: [
          { account_id: 'acc_cash', debit: 1000, credit: 0 },
          { account_id: 'acc_sales_rev', debit: 0, credit: 800 },
        ],
        actor_id: 'usr_owner',
        actor_name: 'Sobuj Sehk',
      });
    }).toThrow(/unbalanced/i);

    // Unbalanced direct postJournal
    expect(() => {
      db.postJournal(
        '2026-03-01',
        'manual',
        'TEST-UNBAL',
        'Unbalanced direct call',
        [
          { account_id: 'acc_cash', debit: 500, credit: 0 },
          { account_id: 'acc_bank', debit: 0, credit: 490 },
        ],
        'usr_owner'
      );
    }).toThrow(/unbalanced/i);
  });

  // 2. Duplicate Event Rejected (Idempotency)
  it('2. rejects duplicate posting of the same business event (source_type, source_id, event)', () => {
    // Post initial event
    const entry1 = db.postJournal(
      '2026-03-01',
      'sale',
      'ORD-9999',
      'Initial sale post',
      [
        { account_id: 'acc_cash', debit: 1200, credit: 0 },
        { account_id: 'acc_sales_rev', debit: 0, credit: 1200 },
      ],
      'usr_owner',
      'Sobuj Sehk',
      'pos_sale',
      'order',
      'ORD-9999',
      'sale'
    );
    expect(entry1).toBeDefined();
    expect(entry1.status).toBe('posted');

    // Attempt second post with identical source_type, source_id, event
    expect(() => {
      db.postJournal(
        '2026-03-01',
        'sale',
        'ORD-9999',
        'Duplicate sale attempt',
        [
          { account_id: 'acc_cash', debit: 1200, credit: 0 },
          { account_id: 'acc_sales_rev', debit: 0, credit: 1200 },
        ],
        'usr_owner',
        'Sobuj Sehk',
        'pos_sale',
        'order',
        'ORD-9999',
        'sale'
      );
    }).toThrow(/duplicate journal event rejected/i);
  });

  // 3. Reversal Works Once and Restores Balances
  it('3. allows reversing a posted entry once, links reversal_of, and blocks duplicate reversals', () => {
    const initialCash = db.accounts.get('acc_cash')?.balance || 0;
    const initialRent = db.accounts.get('acc_rent_exp')?.balance || 0;

    // Post an expense entry: Dr Rent Expense ৳5000, Cr Cash ৳5000
    const entry = db.postJournal(
      '2026-03-05',
      'expense',
      'EXP-TEST-01',
      'Rent Expense March',
      [
        { account_id: 'acc_rent_exp', debit: 5000, credit: 0 },
        { account_id: 'acc_cash', debit: 0, credit: 5000 },
      ],
      'usr_owner',
      'Sobuj Sehk',
      'expense',
      'expense',
      'EXP-TEST-01',
      'posted'
    );

    expect(db.accounts.get('acc_rent_exp')?.balance).toBe(initialRent + 5000);
    expect(db.accounts.get('acc_cash')?.balance).toBe(initialCash - 5000);

    // Reverse the entry
    const rev = db.reverseJournalEntry(entry.id, 'Wrong amount entered', 'usr_owner', 'Sobuj Sehk');
    expect(rev).toBeDefined();
    expect(rev.reversal_of).toBe(entry.entry_number);
    expect(entry.is_reversed).toBe(true);
    expect(entry.status).toBe('reversed');
    expect(entry.reversed_by).toBe(rev.entry_number);

    // Account balances are restored to pre-transaction level
    expect(db.accounts.get('acc_rent_exp')?.balance).toBe(initialRent);
    expect(db.accounts.get('acc_cash')?.balance).toBe(initialCash);

    // Second reversal attempt MUST fail
    expect(() => {
      db.reverseJournalEntry(entry.id, 'Attempting second reversal', 'usr_owner', 'Sobuj Sehk');
    }).toThrow(/already been reversed/i);
  });

  // 4. P&L Date Filter Strictly Honors Period
  it('4. filters P&L by journal lines dated within start_date..end_date and does not use cumulative balance', () => {
    // Clear or record test revenues on distinct dates
    db.postJournal(
      '2026-01-15',
      'sale',
      'ORD-JAN',
      'January Sale',
      [
        { account_id: 'acc_cash', debit: 3000, credit: 0 },
        { account_id: 'acc_sales_rev', debit: 0, credit: 3000 },
      ],
      'usr_owner',
      'Sobuj Sehk',
      'pos_sale',
      'order',
      'ORD-JAN',
      'sale'
    );

    db.postJournal(
      '2026-02-20',
      'sale',
      'ORD-FEB',
      'February Sale',
      [
        { account_id: 'acc_cash', debit: 7000, credit: 0 },
        { account_id: 'acc_sales_rev', debit: 0, credit: 7000 },
      ],
      'usr_owner',
      'Sobuj Sehk',
      'pos_sale',
      'order',
      'ORD-FEB',
      'sale'
    );

    // Report for January only: should see ৳3000, NOT ৳10000
    const janPnl = db.generateProfitLossReport('2026-01-01', '2026-01-31');
    expect(janPnl.revenue.product_sales).toBe(3000);

    // Report for February only: should see ৳7000, NOT ৳10000
    const febPnl = db.generateProfitLossReport('2026-02-01', '2026-02-28');
    expect(febPnl.revenue.product_sales).toBe(7000);

    // Report for both months: should see ৳10000
    const twoMonthPnl = db.generateProfitLossReport('2026-01-01', '2026-02-28');
    expect(twoMonthPnl.revenue.product_sales).toBe(10000);
  });

  // 5. Online Order COGS Snapshot at Packing
  it('5. locks COGS to avg_cost at packing time and uses that snapshot on delivery', () => {
    // Pick an existing seeded product
    const product = Array.from(db.products.values())[0];
    expect(product).toBeDefined();

    // Ensure shop floor inventory has known avg_cost
    const shopInv = db.inventory.get(`${product.id}_wh_shop`);
    if (shopInv) {
      shopInv.on_hand = 10;
      shopInv.avg_cost = 2000;
    }

    // Create an online order
    const order = db.createOrder({
      customer_name: 'Test Customer',
      customer_phone: '01711999888',
      delivery_address: 'House 1, Road 2, Dhaka',
      channel: 'messenger',
      fulfillment_method: 'steadfast',
      items: [{ product_id: product.id, quantity: 1, unit_price: 3500 }],
      actor_id: 'usr_owner',
      actor_name: 'Sobuj Sehk',
    });

    expect(order.status).toBe('confirmed');

    // Pack the order — this snapshots COGS from shopInv.avg_cost (2000)
    db.packOrder({
      order_id: order.id,
      actor_id: 'usr_packing',
      actor_name: 'Packing Staff',
    });

    expect(order.status).toBe('packed');
    expect(order.items[0].unit_cost_at_sale).toBe(2000);

    // Now simulate supplier cost inflation or product avg_cost change before courier delivers
    if (shopInv) {
      shopInv.avg_cost = 4500; // Drastic change after packing
    }
    product.avg_cost = 4500;

    // Book courier with Steadfast
    db.recordCourierBooking({
      order_id: order.id,
      consignment_id: 'TEST-CNS-999',
      tracking_code: 'TRK-999',
      actual_charge: 70,
      customer_delivery_charge: 70,
      actor_id: 'usr_owner',
      actor_name: 'Sobuj Sehk',
    });

    const booking = Array.from(db.courierBookings.values()).find(b => b.order_id === order.id);
    expect(booking).toBeDefined();

    // Delivery occurs via Steadfast status sync
    db.syncCourierStatus({
      booking_id: booking!.id,
      new_status: 'delivered',
      actor_id: 'usr_owner',
      actor_name: 'System',
    });

    expect(order.status).toBe('delivered');

    // Verify the posted journal entry used the packed unit_cost_at_sale (2000), NOT the current 4500
    const deliveredJe = db.journalEntries.find(j => j.reference_id === order.id && (j.transaction_type === 'pos_sale' || j.transaction_type === 'courier_delivered' as any));
    expect(deliveredJe).toBeDefined();

    const cogsLine = deliveredJe?.lines.find(l => l.account_id === 'acc_cogs');
    expect(cogsLine).toBeDefined();
    expect(cogsLine?.debit).toBe(2000); // ৳2000 locked at packing, NOT ৳4500
  });
});
