import {
  PackagingMaterial,
  PackagingStockMovement,
  PackagingCategory,
  PackagingStockMovementReason,
  PackagingRule,
  PackagingSettings,
  PackagingCount,
  PackagingCountItem,
  PackagingConversion,
  PackagingUsageReportItem,
  PackagingBuyListItem,
  PackagingPurchase,
  PackagingPurchaseLine,
  PackagingMonthClose,
} from '../src/types';

// Helper: Parse and adjust ISO/UTC strings into Asia/Dhaka (UTC+6) date components
export function getDhakaDateParts(dateStr: string): {
  year: number;
  month: number;
  day: number;
  yearMonth: string;
  dateOnly: string;
} {
  const date = new Date(dateStr);
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const dhakaTime = new Date(utc + (3600000 * 6));
  const year = dhakaTime.getFullYear();
  const m = dhakaTime.getMonth() + 1;
  const d = dhakaTime.getDate();
  const monthStr = m < 10 ? `0${m}` : `${m}`;
  const dayStr = d < 10 ? `0${d}` : `${d}`;
  return {
    year,
    month: m,
    day: d,
    yearMonth: `${year}-${monthStr}`,
    dateOnly: `${year}-${monthStr}-${dayStr}`,
  };
}

// Check if a given month is closed
export function isMonthClosed(db: any, dateStr: string): boolean {
  if (!dateStr) return false;
  const month = dateStr.slice(0, 7); // "YYYY-MM"
  return db.packagingMonthCloses.has(month);
}

// Generate sequential purchase number per year ('PKG-YYYY-NNN')
export function generatePurchaseNumber(db: any, dateStr: string): string {
  const year = dateStr.slice(0, 4);
  const prefix = `PKG-${year}-`;
  let maxSeq = 0;
  for (const p of db.packagingPurchases.values()) {
    if (p.purchase_number.startsWith(prefix)) {
      const parts = p.purchase_number.split('-');
      const seqStr = parts[2];
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  const seqPadded = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqPadded}`;
}

// Weighted average cost calculator by replaying the material's non-void ledger in effective_at order
export function replayCosting(db: any, material_id: string): number {
  const mat = db.packagingMaterials.get(material_id);
  if (!mat) return 0;

  const voidReasons = ['PURCHASE_VOID', 'COUNT_VOID', 'ADJUSTMENT_VOID'];
  const movements = db.packagingStockMovements.filter((m: any) => {
    if (m.material_id !== material_id) return false;
    if (m.reversed_by) return false;
    if (voidReasons.includes(m.reason)) return false;
    return true;
  });

  // Sort by effective_at ascending, falling back to created_at
  movements.sort((a: any, b: any) => {
    const timeA = a.effective_at || a.created_at;
    const timeB = b.effective_at || b.created_at;
    return timeA.localeCompare(timeB);
  });

  let qty = 0;
  let cost = mat.unit_cost; // initial fallback

  for (const m of movements) {
    if (m.quantity_delta > 0 && (m.reason === 'PURCHASE' || m.reason === 'OPENING_BALANCE')) {
      if (qty + m.quantity_delta > 0) {
        cost = (qty * cost + m.quantity_delta * m.unit_cost) / (qty + m.quantity_delta);
        qty += m.quantity_delta;
      } else {
        qty += m.quantity_delta;
        cost = m.unit_cost;
      }
    } else {
      qty += m.quantity_delta;
    }
  }

  const allMovements = db.packagingStockMovements.filter((m: any) => m.material_id === material_id);
  const totalOnHand = allMovements.reduce((acc: number, m: any) => acc + m.quantity_delta, 0);

  mat.on_hand = totalOnHand;
  mat.available = mat.on_hand - mat.reserved;
  mat.unit_cost = Number(cost.toFixed(2));
  mat.updated_at = new Date().toISOString();

  return mat.unit_cost;
}

export function validatePackagingBarcode(db: any, barcode?: string, track_scan?: boolean, currentMaterialId?: string): void {
  const trimmed = barcode ? barcode.trim() : '';
  if (track_scan && !trimmed) {
    throw new Error('Barcode is required when scan tracking is enabled');
  }
  if (!trimmed) return;
  const clean = trimmed.toLowerCase();

  // Check unique among non-empty packaging barcodes
  for (const [id, m] of db.packagingMaterials.entries()) {
    if (id !== currentMaterialId && m.barcode && m.barcode.trim().toLowerCase() === clean) {
      throw new Error(`Barcode "${barcode}" is already registered as ${m.name}`);
    }
  }
  // Check products
  for (const p of db.products.values()) {
    if (p.barcode && p.barcode.trim().toLowerCase() === clean) {
      throw new Error(`Barcode "${barcode}" conflicts with product barcode for "${p.display_name}"`);
    }
  }
  // Check orders
  for (const o of db.orders.values()) {
    if (o.invoice_number && o.invoice_number.trim().toLowerCase() === clean) {
      throw new Error(`Barcode "${barcode}" conflicts with order invoice number "${o.invoice_number}"`);
    }
  }
}

export function calculatePackagingConversion(conv: PackagingConversion): number {
  if (conv.method === 'sample') {
    if (conv.sample_pieces && conv.sample_pieces > 0 && conv.sample_grams && conv.sample_grams > 0) {
      return Number((conv.sample_grams / conv.sample_pieces).toFixed(3));
    }
    return 0;
  }
  if (conv.method === 'dimensions') {
    const w = conv.width_cm || 0;
    const l = conv.length_cm || 0;
    const thickMicron = conv.thickness_micron || 0;
    const densityMap: Record<string, number> = {
      LDPE: 0.92,
      HDPE: 0.95,
      PP: 0.90,
    };
    const density = conv.polymer ? (densityMap[conv.polymer] || 0.92) : 0.92;
    const areaCm2 = 2 * w * l;
    const thickCm = thickMicron / 10000;
    const grams = areaCm2 * thickCm * density;
    return Number(grams.toFixed(3));
  }
  return 0;
}

export function createPackagingMaterial(db: any, params: {
  name: string;
  barcode?: string;
  sku?: string;
  category: PackagingCategory;
  unit: string;
  reorder_level: number;
  unit_cost: number;
  notes?: string;
  opening_stock?: number;
  track_scan?: boolean;
  grams_per_piece?: number;
  conversion?: PackagingConversion;
  actor_id?: string;
  actor_name?: string;
}): PackagingMaterial {
  const id = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const trackScan = params.track_scan !== undefined ? Boolean(params.track_scan) : params.category === 'carton';
  const barcode = params.barcode ? params.barcode.trim() : '';
  validatePackagingBarcode(db, barcode, trackScan);

  let gramsPerPiece = params.grams_per_piece;
  if (params.conversion) {
    const calculated = calculatePackagingConversion(params.conversion);
    if (calculated > 0) gramsPerPiece = calculated;
  }

  const openingStock = Math.max(0, Number(params.opening_stock) || 0);
  const mat: PackagingMaterial = {
    id,
    name: params.name.trim(),
    barcode: barcode || undefined,
    sku: (params.sku || barcode || params.name.slice(0, 6).toUpperCase()).trim(),
    category: params.category,
    unit: params.unit || 'piece',
    on_hand: openingStock,
    reserved: 0,
    available: openingStock,
    reorder_level: Number(params.reorder_level) || 0,
    unit_cost: Number(params.unit_cost) || 0,
    notes: params.notes,
    active: true,
    track_scan: trackScan,
    grams_per_piece: gramsPerPiece,
    conversion: params.conversion,
    created_at: now,
    updated_at: now,
  };
  db.packagingMaterials.set(id, mat);
  if (openingStock > 0) {
    db.packagingStockMovements.push({
      id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      material_id: id,
      material_name: mat.name,
      barcode: mat.barcode || '',
      quantity_delta: openingStock,
      reason: 'OPENING_BALANCE',
      unit_cost: mat.unit_cost,
      created_by: params.actor_id || 'system',
      created_by_name: params.actor_name || 'System',
      created_at: now,
      effective_at: now,
      notes: 'Opening stock at creation',
    });
  }
  db.logAudit(
    params.actor_id || 'system',
    params.actor_name || 'System',
    'packaging_material_created',
    'packaging_material',
    id,
    `Created ${mat.name}`
  );
  return mat;
}

export function updatePackagingMaterial(
  db: any,
  id: string,
  params: Partial<PackagingMaterial>,
  actor_id?: string,
  actor_name?: string
): PackagingMaterial | null {
  const mat = db.packagingMaterials.get(id);
  if (!mat) return null;
  const before = { ...mat };
  const nextTrackScan = params.track_scan !== undefined ? Boolean(params.track_scan) : Boolean(mat.track_scan);
  const nextBarcode = params.barcode !== undefined ? (params.barcode || '').trim() : (mat.barcode || '');

  if (params.barcode !== undefined || params.track_scan !== undefined) {
    validatePackagingBarcode(db, nextBarcode, nextTrackScan, id);
  }

  if (params.name !== undefined) mat.name = params.name.trim();
  if (params.barcode !== undefined) mat.barcode = nextBarcode || undefined;
  if (params.sku !== undefined) mat.sku = params.sku.trim();
  if (params.category !== undefined) mat.category = params.category;
  if (params.unit !== undefined) mat.unit = params.unit;
  if (params.reorder_level !== undefined) mat.reorder_level = Number(params.reorder_level) || 0;
  if (params.unit_cost !== undefined) mat.unit_cost = Number(params.unit_cost) || 0;
  if (params.notes !== undefined) mat.notes = params.notes;
  if (params.active !== undefined) mat.active = Boolean(params.active);
  if (params.track_scan !== undefined) mat.track_scan = Boolean(params.track_scan);
  if (params.grams_per_piece !== undefined) mat.grams_per_piece = params.grams_per_piece;
  if (params.conversion !== undefined) {
    mat.conversion = params.conversion;
    const calculated = calculatePackagingConversion(params.conversion);
    if (calculated > 0) mat.grams_per_piece = calculated;
  }

  mat.updated_at = new Date().toISOString();
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_material_updated',
    'packaging_material',
    id,
    `Updated ${mat.name}`,
    JSON.stringify(before),
    JSON.stringify(mat)
  );
  return mat;
}

export function deletePackagingMaterial(db: any, id: string, actor_id?: string, actor_name?: string): boolean {
  const mat = db.packagingMaterials.get(id);
  if (!mat) return false;
  mat.active = false;
  mat.updated_at = new Date().toISOString();
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_material_archived',
    'packaging_material',
    id,
    `Archived ${mat.name}`
  );
  return true;
}

// RESTORE item active status
export function restorePackagingMaterial(db: any, id: string, actor_id?: string, actor_name?: string): boolean {
  const mat = db.packagingMaterials.get(id);
  if (!mat) return false;
  mat.active = true;
  mat.updated_at = new Date().toISOString();
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_material_restored',
    'packaging_material',
    id,
    `Restored ${mat.name}`
  );
  return true;
}

// Legacy receiver — kept as thin delegate
export function receivePackagingStock(
  db: any,
  paramOrId: string | {
    material_id: string;
    quantity: number;
    unit_cost: number;
    payment_account_id?: string;
    purchase_date?: string;
    supplier_name?: string;
    reference_note?: string;
    actor_id?: string;
    actor_name?: string;
  },
  legacyQty?: number,
  legacyCost?: number,
  legacyRef?: string,
  legacyActorId?: string,
  legacyActorName?: string
): PackagingMaterial | null {
  let material_id: string;
  let quantity: number;
  let unit_cost: number;
  let payment_account_id: string | undefined;
  let purchase_date: string | undefined;
  let supplier_name: string | undefined;
  let reference_note: string | undefined;
  let actor_id: string | undefined;
  let actor_name: string | undefined;

  if (typeof paramOrId === 'object') {
    material_id = paramOrId.material_id;
    quantity = Number(paramOrId.quantity) || 0;
    unit_cost = Number(paramOrId.unit_cost) || 0;
    payment_account_id = paramOrId.payment_account_id;
    purchase_date = paramOrId.purchase_date;
    supplier_name = paramOrId.supplier_name;
    reference_note = paramOrId.reference_note;
    actor_id = paramOrId.actor_id;
    actor_name = paramOrId.actor_name;
  } else {
    material_id = paramOrId;
    quantity = Number(legacyQty) || 0;
    unit_cost = Number(legacyCost) || 0;
    reference_note = legacyRef;
    actor_id = legacyActorId;
    actor_name = legacyActorName;
  }

  const mat = db.packagingMaterials.get(material_id);
  if (!mat || quantity <= 0) return null;

  const now = new Date().toISOString();
  const purchaseDate = purchase_date || now.split('T')[0];

  // Prevent closed month receipts
  if (isMonthClosed(db, purchaseDate)) {
    throw new Error(`Month containing date ${purchaseDate} is closed.`);
  }

  // Create movement
  const effectiveAt = `${purchaseDate}T12:00:00+06:00`;
  db.packagingStockMovements.push({
    id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    material_id,
    material_name: mat.name,
    barcode: mat.barcode || '',
    quantity_delta: quantity,
    reason: 'PURCHASE',
    unit_cost,
    reference_note: reference_note || (supplier_name ? `Purchased from ${supplier_name}` : undefined),
    created_by: actor_id || 'system',
    created_by_name: actor_name || 'System',
    created_at: now,
    effective_at: effectiveAt,
  });

  replayCosting(db, material_id);

  // Accounting Expense
  const totalAmount = Number((quantity * unit_cost).toFixed(2));
  if (totalAmount > 0 && payment_account_id) {
    db.recordExpense({
      category_id: 'cat_packaging',
      expense_account_id: 'acc_pack_exp',
      payment_account_id,
      amount: totalAmount,
      date: purchaseDate,
      description: `Packaging purchase${supplier_name ? ` - ${supplier_name}` : ''} (${mat.name} x ${quantity} ${mat.unit})`,
      receipt_reference: reference_note || mat.sku,
      actor_id: actor_id || 'system',
      actor_name: actor_name || 'System',
    });
  }

  return mat;
}

export function usePackagingStock(
  db: any,
  material_id: string,
  quantity: number,
  order_id: string,
  actor_id?: string,
  actor_name?: string
): PackagingMaterial | null {
  const mat = db.packagingMaterials.get(material_id);
  if (!mat || mat.available < quantity) return null;
  const now = new Date().toISOString();
  mat.on_hand -= quantity;
  mat.available -= quantity;
  mat.updated_at = now;
  db.packagingStockMovements.push({
    id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    material_id,
    material_name: mat.name,
    barcode: mat.barcode || '',
    quantity_delta: -quantity,
    reason: 'PACKAGING_USED',
    unit_cost: mat.unit_cost,
    reference_id: order_id,
    reference_note: `Packed order ${order_id}`,
    created_by: actor_id || 'system',
    created_by_name: actor_name || 'System',
    created_at: now,
    effective_at: now,
  });
  return mat;
}

// ----------------------------------------------------------------------------
// PURCHASES SECTION
// ----------------------------------------------------------------------------

export function createPurchase(db: any, payload: any, actor: { id: string; name: string }): PackagingPurchase {
  const purchaseDate = payload.date || new Date().toISOString().split('T')[0];

  if (isMonthClosed(db, purchaseDate)) {
    throw new Error(`Month containing date ${purchaseDate} is closed.`);
  }

  if (!payload.payment_account_id) {
    throw new Error('Payment account is required to post a packaging purchase expense');
  }

  const paymentAcc = db.paymentAccounts.get(payload.payment_account_id);
  if (!paymentAcc) {
    throw new Error(`Payment account not found: ${payload.payment_account_id}`);
  }

  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error('Purchase must contain at least one line item');
  }

  const processedLines: PackagingPurchaseLine[] = [];
  let calculatedTotal = 0;

  for (const line of payload.lines) {
    const mat = db.packagingMaterials.get(line.material_id);
    if (!mat) {
      throw new Error(`Material not found: ${line.material_id}`);
    }
    if (!mat.active) {
      throw new Error(`Cannot purchase archived material: ${mat.name}`);
    }

    const enteredQty = Number(line.entered_qty);
    if (isNaN(enteredQty) || enteredQty <= 0) {
      throw new Error(`Line quantity must be greater than zero for material: ${mat.name}`);
    }

    const enteredUnit = line.entered_unit || 'piece';
    if (enteredUnit === 'kg' && !mat.grams_per_piece) {
      throw new Error(`Material "${mat.name}" has no weight conversion defined; cannot purchase in kg.`);
    }

    // Integer checks for 'piece'
    if (enteredUnit === 'piece' && mat.unit === 'piece' && enteredQty % 1 !== 0) {
      throw new Error(`Material "${mat.name}" unit is "piece" and cannot accept fractional purchase quantities.`);
    }

    let pieces = 0;
    const piecesPerKg = mat.grams_per_piece ? Number((1000 / mat.grams_per_piece).toFixed(2)) : 0;

    if (enteredUnit === 'kg') {
      pieces = Math.floor(enteredQty * piecesPerKg);
      if (line.pieces_override) {
        pieces = Math.max(1, Math.floor(line.pieces_override));
      }
    } else {
      pieces = enteredQty;
    }

    if (pieces <= 0) {
      throw new Error(`Line total resolved pieces must be at least 1 for material: ${mat.name}`);
    }

    // Cost computation
    let unitCost = Number(line.unit_cost) || 0;
    let lineTotal = Number(line.line_total) || 0;

    if (lineTotal > 0) {
      unitCost = Number((lineTotal / pieces).toFixed(4));
    } else if (unitCost > 0) {
      lineTotal = Number((pieces * unitCost).toFixed(2));
    } else {
      throw new Error(`Either unit_cost or line_total must be specified and greater than zero for material: ${mat.name}`);
    }

    processedLines.push({
      material_id: mat.id,
      material_name: mat.name,
      unit: mat.unit,
      entered_qty: enteredQty,
      entered_unit: enteredUnit,
      pieces,
      unit_cost: unitCost,
      line_total: lineTotal,
      pieces_override: line.pieces_override,
    });

    calculatedTotal += lineTotal;
  }

  const purchaseId = `pkgpur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const purchaseNum = generatePurchaseNumber(db, purchaseDate);
  const now = new Date().toISOString();

  // Post single professional expense in accounting
  const expenseRec = db.recordExpense({
    category_id: 'cat_packaging',
    expense_account_id: 'acc_pack_exp',
    payment_account_id: payload.payment_account_id,
    amount: calculatedTotal,
    date: purchaseDate,
    description: `Packaging purchase ${purchaseNum}${payload.supplier ? ` from ${payload.supplier}` : ''}`,
    receipt_reference: payload.reference || purchaseNum,
    actor_id: actor.id,
    actor_name: actor.name,
  });

  const effectiveAt = `${purchaseDate}T12:00:00+06:00`;

  // Write PURCHASE movements
  for (const line of processedLines) {
    db.packagingStockMovements.push({
      id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      material_id: line.material_id,
      material_name: line.material_name,
      barcode: db.packagingMaterials.get(line.material_id)?.barcode || '',
      quantity_delta: line.pieces,
      reason: 'PURCHASE',
      unit_cost: line.unit_cost,
      reference_id: purchaseId,
      reference_note: purchaseNum,
      created_by: actor.id,
      created_by_name: actor.name,
      created_at: now,
      effective_at: effectiveAt,
    });
  }

  const purchase: PackagingPurchase = {
    id: purchaseId,
    purchase_number: purchaseNum,
    date: purchaseDate,
    supplier: payload.supplier,
    reference: payload.reference,
    payment_account_id: payload.payment_account_id,
    payment_account_name: paymentAcc.name,
    total: Number(calculatedTotal.toFixed(2)),
    expense_id: expenseRec.id,
    status: 'active',
    lines: processedLines,
    revision: 1,
    created_by_id: actor.id,
    created_by_name: actor.name,
    created_at: now,
  };

  db.packagingPurchases.set(purchaseId, purchase);

  // Recalculate average costs for all affected materials
  for (const line of processedLines) {
    replayCosting(db, line.material_id);
  }

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_purchase_created',
    'packaging_purchase',
    purchaseId,
    `Recorded purchase ${purchaseNum} for ৳${calculatedTotal.toLocaleString()}`
  );

  return purchase;
}

export function voidPurchase(db: any, id: string, reason: string, actor: { id: string; name: string }): PackagingPurchase {
  if (!reason || !reason.trim()) {
    throw new Error('Void reason is required');
  }

  const purchase = db.packagingPurchases.get(id);
  if (!purchase) {
    throw new Error('Purchase not found');
  }

  if (purchase.status === 'voided') {
    // Return custom error so server.ts can handle 409
    const err: any = new Error('Purchase is already voided');
    err.statusCode = 409;
    throw err;
  }

  if (isMonthClosed(db, purchase.date)) {
    throw new Error(`Month containing purchase date ${purchase.date} is closed.`);
  }

  const now = new Date().toISOString();

  // Create reversing movements
  for (const line of purchase.lines) {
    // Find original movement
    const origMov = db.packagingStockMovements.find(
      (m: any) => m.reference_id === purchase.id && m.material_id === line.material_id && m.reason === 'PURCHASE' && !m.reversed_by
    );

    const movId = `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.packagingStockMovements.push({
      id: movId,
      material_id: line.material_id,
      material_name: line.material_name,
      barcode: db.packagingMaterials.get(line.material_id)?.barcode || '',
      quantity_delta: -line.pieces,
      reason: 'PURCHASE_VOID',
      unit_cost: line.unit_cost,
      reference_id: purchase.id,
      reference_note: `${purchase.purchase_number} - Voided`,
      created_by: actor.id,
      created_by_name: actor.name,
      created_at: now,
      effective_at: origMov ? origMov.effective_at : `${purchase.date}T12:00:00+06:00`,
      reverses: origMov ? origMov.id : undefined,
    });

    if (origMov) {
      origMov.reversed_by = movId;
    }
  }

  // Void Expense inside accounting
  try {
    db.voidExpense(purchase.expense_id, actor.id, actor.name, reason);
  } catch (expErr) {
    // Fail-safe or logged
  }

  purchase.status = 'voided';
  purchase.voided_at = now;
  purchase.voided_by_name = actor.name;
  purchase.void_reason = reason;

  // Replay costing for all lines
  for (const line of purchase.lines) {
    replayCosting(db, line.material_id);
  }

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_purchase_voided',
    'packaging_purchase',
    id,
    `Voided purchase ${purchase.purchase_number}: ${reason}`
  );

  return purchase;
}

export function updatePurchase(db: any, id: string, payload: any, actor: { id: string; name: string }): PackagingPurchase {
  const oldPurchase = db.packagingPurchases.get(id);
  if (!oldPurchase) {
    throw new Error('Purchase not found');
  }

  if (oldPurchase.status === 'voided') {
    throw new Error('Cannot edit a voided purchase');
  }

  // Check if original date or new date is closed
  if (isMonthClosed(db, oldPurchase.date)) {
    throw new Error(`Original purchase month (${oldPurchase.date.slice(0, 7)}) is closed.`);
  }

  const newDate = payload.date || oldPurchase.date;
  if (isMonthClosed(db, newDate)) {
    throw new Error(`Target purchase month (${newDate.slice(0, 7)}) is closed.`);
  }

  // Validate the new payload before editing anything
  if (!payload.payment_account_id) {
    throw new Error('Payment account is required to post a packaging purchase expense');
  }
  const paymentAcc = db.paymentAccounts.get(payload.payment_account_id);
  if (!paymentAcc) {
    throw new Error(`Payment account not found: ${payload.payment_account_id}`);
  }

  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error('Purchase must contain at least one line item');
  }

  // Void the old purchase atomically
  voidPurchase(db, id, 'Edited', actor);

  // Build the new purchase keeping the same purchase_number
  const processedLines: PackagingPurchaseLine[] = [];
  let calculatedTotal = 0;

  for (const line of payload.lines) {
    const mat = db.packagingMaterials.get(line.material_id);
    if (!mat) {
      throw new Error(`Material not found: ${line.material_id}`);
    }
    if (!mat.active) {
      throw new Error(`Cannot purchase archived material: ${mat.name}`);
    }

    const enteredQty = Number(line.entered_qty);
    if (isNaN(enteredQty) || enteredQty <= 0) {
      throw new Error(`Line quantity must be greater than zero for material: ${mat.name}`);
    }

    const enteredUnit = line.entered_unit || 'piece';
    if (enteredUnit === 'kg' && !mat.grams_per_piece) {
      throw new Error(`Material "${mat.name}" has no weight conversion defined.`);
    }

    // Integer checks for 'piece'
    if (enteredUnit === 'piece' && mat.unit === 'piece' && enteredQty % 1 !== 0) {
      throw new Error(`Material "${mat.name}" unit is "piece" and cannot accept fractional purchase quantities.`);
    }

    let pieces = 0;
    const piecesPerKg = mat.grams_per_piece ? Number((1000 / mat.grams_per_piece).toFixed(2)) : 0;

    if (enteredUnit === 'kg') {
      pieces = Math.floor(enteredQty * piecesPerKg);
      if (line.pieces_override) {
        pieces = Math.max(1, Math.floor(line.pieces_override));
      }
    } else {
      pieces = enteredQty;
    }

    let unitCost = Number(line.unit_cost) || 0;
    let lineTotal = Number(line.line_total) || 0;

    if (lineTotal > 0) {
      unitCost = Number((lineTotal / pieces).toFixed(4));
    } else if (unitCost > 0) {
      lineTotal = Number((pieces * unitCost).toFixed(2));
    } else {
      throw new Error(`Cost must be provided for: ${mat.name}`);
    }

    processedLines.push({
      material_id: mat.id,
      material_name: mat.name,
      unit: mat.unit,
      entered_qty: enteredQty,
      entered_unit: enteredUnit,
      pieces,
      unit_cost: unitCost,
      line_total: lineTotal,
      pieces_override: line.pieces_override,
    });

    calculatedTotal += lineTotal;
  }

  const purchaseId = `pkgpur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  // Post new expense
  const expenseRec = db.recordExpense({
    category_id: 'cat_packaging',
    expense_account_id: 'acc_pack_exp',
    payment_account_id: payload.payment_account_id,
    amount: calculatedTotal,
    date: newDate,
    description: `Packaging purchase ${oldPurchase.purchase_number}${payload.supplier ? ` from ${payload.supplier}` : ''} (Edit Rev ${oldPurchase.revision + 1})`,
    receipt_reference: payload.reference || oldPurchase.purchase_number,
    actor_id: actor.id,
    actor_name: actor.name,
  });

  const effectiveAt = `${newDate}T12:00:00+06:00`;

  // Write new movements
  for (const line of processedLines) {
    db.packagingStockMovements.push({
      id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      material_id: line.material_id,
      material_name: line.material_name,
      barcode: db.packagingMaterials.get(line.material_id)?.barcode || '',
      quantity_delta: line.pieces,
      reason: 'PURCHASE',
      unit_cost: line.unit_cost,
      reference_id: purchaseId,
      reference_note: oldPurchase.purchase_number,
      created_by: actor.id,
      created_by_name: actor.name,
      created_at: now,
      effective_at: effectiveAt,
    });
  }

  const newPurchase: PackagingPurchase = {
    id: purchaseId,
    purchase_number: oldPurchase.purchase_number,
    date: newDate,
    supplier: payload.supplier,
    reference: payload.reference,
    payment_account_id: payload.payment_account_id,
    payment_account_name: paymentAcc.name,
    total: Number(calculatedTotal.toFixed(2)),
    expense_id: expenseRec.id,
    status: 'active',
    lines: processedLines,
    revision: oldPurchase.revision + 1,
    edited_from: oldPurchase.id,
    created_by_id: actor.id,
    created_by_name: actor.name,
    created_at: now,
  };

  db.packagingPurchases.set(purchaseId, newPurchase);

  // Recalculate average costs for everything affected by BOTH old and new purchases
  const allAffectedMaterials = Array.from(
    new Set([...oldPurchase.lines.map((l: any) => l.material_id), ...processedLines.map(l => l.material_id)])
  );
  for (const matId of allAffectedMaterials) {
    replayCosting(db, matId);
  }

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_purchase_updated',
    'packaging_purchase',
    purchaseId,
    `Updated purchase ${oldPurchase.purchase_number} to Rev ${newPurchase.revision}`
  );

  return newPurchase;
}

export function listPurchases(db: any, filter?: { from?: string; to?: string; status?: string }): PackagingPurchase[] {
  let list = Array.from(db.packagingPurchases.values()) as PackagingPurchase[];
  if (filter?.status) {
    list = list.filter(p => p.status === filter.status);
  }
  if (filter?.from) {
    list = list.filter(p => p.date >= filter.from!);
  }
  if (filter?.to) {
    list = list.filter(p => p.date <= filter.to!);
  }
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ----------------------------------------------------------------------------
// COUNTS AND ADJUSTMENTS
// ----------------------------------------------------------------------------

export function recordPackagingCount(db: any, params: {
  counted_at?: string;
  notes?: string;
  items: { material_id: string; counted_quantity: number; notes?: string }[];
  actor_id?: string;
  actor_name?: string;
}): PackagingCount {
  const id = `pkgcnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const counted_at = params.counted_at || now;
  const countItems: PackagingCountItem[] = [];

  for (const item of params.items) {
    const mat = db.packagingMaterials.get(item.material_id);
    if (!mat) continue;
    if (!mat.active) {
      throw new Error(`Cannot submit counts for archived material: ${mat.name}`);
    }

    const counted_quantity = Number(item.counted_quantity);
    if (isNaN(counted_quantity) || counted_quantity < 0) {
      throw new Error(`Counted quantity must be non-negative for material: ${mat.name}`);
    }

    if (mat.unit === 'piece' && counted_quantity % 1 !== 0) {
      throw new Error(`Material "${mat.name}" has unit "piece" and cannot accept fractional counts.`);
    }

    const system_quantity = mat.on_hand;
    const diff = counted_quantity - system_quantity;
    const total_cost_diff = Number((diff * mat.unit_cost).toFixed(2));

    mat.on_hand = counted_quantity;
    mat.available = mat.on_hand - mat.reserved;
    mat.last_counted_at = counted_at;
    mat.last_counted_by_name = params.actor_name || 'Staff';
    mat.updated_at = now;

    countItems.push({
      material_id: mat.id,
      material_name: mat.name,
      barcode: mat.barcode,
      system_quantity,
      counted_quantity,
      difference: diff,
      unit_cost: mat.unit_cost,
      total_cost_diff,
      notes: item.notes,
    });

    if (diff !== 0) {
      db.packagingStockMovements.push({
        id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        material_id: mat.id,
        material_name: mat.name,
        barcode: mat.barcode || '',
        quantity_delta: diff,
        reason: 'COUNT_ADJUSTMENT',
        unit_cost: mat.unit_cost,
        reference_id: id,
        reference_note: `Manual count adjustment (${diff > 0 ? '+' : ''}${diff})`,
        created_by: params.actor_id || 'system',
        created_by_name: params.actor_name || 'System',
        created_at: now,
        effective_at: now,
      });
    }
  }

  const countRecord: PackagingCount = {
    id,
    counted_at,
    counted_by: params.actor_id || 'system',
    counted_by_name: params.actor_name || 'Staff',
    notes: params.notes,
    items: countItems,
    created_at: now,
    status: 'active',
  };

  db.packagingCounts.set(id, countRecord);
  db.logAudit(
    params.actor_id || 'system',
    params.actor_name || 'System',
    'packaging_count_recorded',
    'packaging_count',
    id,
    `Recorded packaging physical count (${countItems.length} items checked)`
  );
  return countRecord;
}

export function voidCount(db: any, id: string, reason: string, actor: { id: string; name: string }): PackagingCount {
  if (!reason || !reason.trim()) {
    throw new Error('Void reason is required');
  }

  const countRecord = db.packagingCounts.get(id);
  if (!countRecord) {
    throw new Error('Count record not found');
  }

  if (countRecord.status === 'voided') {
    const err: any = new Error('Count record is already voided');
    err.statusCode = 409;
    throw err;
  }

  // Perms check: Tier 1-3 allowed. Tier 4 allowed ONLY if they are the creator AND count is < 30 mins old.
  const user = db.users.get(actor.id);
  const userTier = user ? user.tier : 3;
  const isCreator = countRecord.counted_by === actor.id;
  const minutesOld = (Date.now() - new Date(countRecord.created_at).getTime()) / 60000;
  const allowed = userTier <= 3 || (isCreator && minutesOld < 30);

  if (!allowed) {
    throw new Error('You are not authorized to void this physical count record.');
  }

  const now = new Date().toISOString();

  // Create reversing COUNT_VOID movements
  for (const item of countRecord.items) {
    if (item.difference === 0) continue;

    const origMov = db.packagingStockMovements.find(
      (m: any) => m.reference_id === countRecord.id && m.material_id === item.material_id && m.reason === 'COUNT_ADJUSTMENT' && !m.reversed_by
    );

    const movId = `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.packagingStockMovements.push({
      id: movId,
      material_id: item.material_id,
      material_name: item.material_name,
      barcode: item.barcode || '',
      quantity_delta: -item.difference,
      reason: 'COUNT_VOID',
      unit_cost: item.unit_cost,
      reference_id: countRecord.id,
      reference_note: 'Void count adjustment',
      created_by: actor.id,
      created_by_name: actor.name,
      created_at: now,
      effective_at: origMov ? origMov.effective_at : countRecord.counted_at,
      reverses: origMov ? origMov.id : undefined,
    });

    if (origMov) {
      origMov.reversed_by = movId;
    }

    // Set correct stock quantities immediately
    const mat = db.packagingMaterials.get(item.material_id);
    if (mat) {
      mat.on_hand -= item.difference;
      mat.available = mat.on_hand - mat.reserved;
      mat.updated_at = now;
    }
  }

  countRecord.status = 'voided';
  countRecord.voided_at = now;
  countRecord.voided_by_name = actor.name;
  countRecord.void_reason = reason;

  // Restore last_counted_at and last_counted_by_name for each material
  const activeCounts = (Array.from(db.packagingCounts.values()) as PackagingCount[])
    .filter((c: any) => c.id !== id && c.status !== 'voided')
    .sort((a: any, b: any) => new Date(b.counted_at).getTime() - new Date(a.counted_at).getTime());

  for (const item of countRecord.items) {
    const mat = db.packagingMaterials.get(item.material_id);
    if (!mat) continue;

    const lastMatch = activeCounts.find((c: any) => c.items.some((i: any) => i.material_id === mat.id));
    if (lastMatch) {
      mat.last_counted_at = lastMatch.counted_at;
      mat.last_counted_by_name = lastMatch.counted_by_name;
    } else {
      mat.last_counted_at = undefined;
      mat.last_counted_by_name = undefined;
    }
  }

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_count_voided',
    'packaging_count',
    id,
    `Voided packaging physical count record: ${reason}`
  );

  return countRecord;
}

export function getPackagingCounts(db: any): PackagingCount[] {
  return Array.from(db.packagingCounts.values()) as PackagingCount[];
}

export function createAdjustment(
  db: any,
  params: {
    material_id: string;
    quantity_delta: number;
    reason: 'DAMAGE' | 'LOSS' | 'ADJUSTMENT';
    note: string;
  },
  actor: { id: string; name: string }
): PackagingStockMovement {
  if (!params.note || !params.note.trim()) {
    throw new Error('Adjustment explanation note is required');
  }

  const mat = db.packagingMaterials.get(params.material_id);
  if (!mat) {
    throw new Error('Material not found');
  }
  if (!mat.active) {
    throw new Error('Cannot adjust stock of an archived material');
  }

  const delta = Number(params.quantity_delta);
  if (isNaN(delta) || delta === 0) {
    throw new Error('Adjustment delta must be non-zero');
  }

  if (mat.unit === 'piece' && delta % 1 !== 0) {
    throw new Error(`Material "${mat.name}" has unit "piece" and cannot accept fractional adjustments.`);
  }

  if ((params.reason === 'DAMAGE' || params.reason === 'LOSS') && delta > 0) {
    throw new Error('DAMAGE and LOSS adjustments must be negative stock changes');
  }

  if (mat.on_hand + delta < 0) {
    throw new Error(`Adjustment would take on_hand below zero. Available quantity: ${mat.on_hand}`);
  }

  const now = new Date().toISOString();
  mat.on_hand += delta;
  mat.available = mat.on_hand - mat.reserved;
  mat.updated_at = now;

  const movement: PackagingStockMovement = {
    id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    material_id: mat.id,
    material_name: mat.name,
    barcode: mat.barcode || '',
    quantity_delta: delta,
    reason: params.reason,
    unit_cost: mat.unit_cost,
    reference_note: params.note,
    created_by: actor.id,
    created_by_name: actor.name,
    created_at: now,
    effective_at: now,
  };

  db.packagingStockMovements.push(movement);

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_adjustment_recorded',
    'packaging_material',
    mat.id,
    `Recorded adjustment: ${delta > 0 ? '+' : ''}${delta} ${mat.unit} of ${mat.name} (${params.reason})`
  );

  return movement;
}

export function reverseMovement(db: any, id: string, actor: { id: string; name: string }): PackagingStockMovement {
  const movement = db.packagingStockMovements.find((m: any) => m.id === id);
  if (!movement) {
    throw new Error('Movement not found');
  }

  const reversibleReasons = ['DAMAGE', 'LOSS', 'ADJUSTMENT'];
  if (!reversibleReasons.includes(movement.reason)) {
    throw new Error(`Movements of type "${movement.reason}" cannot be reversed individually.`);
  }

  if (movement.reversed_by) {
    throw new Error('Movement is already reversed');
  }

  const mat = db.packagingMaterials.get(movement.material_id);
  if (!mat) {
    throw new Error('Material not found');
  }

  const reverseDelta = -movement.quantity_delta;
  if (mat.on_hand + reverseDelta < 0) {
    throw new Error(`Reversal would take material "${mat.name}" on_hand below zero. Current stock: ${mat.on_hand}`);
  }

  const now = new Date().toISOString();
  mat.on_hand += reverseDelta;
  mat.available = mat.on_hand - mat.reserved;
  mat.updated_at = now;

  const reversalId = `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const reversal: PackagingStockMovement = {
    id: reversalId,
    material_id: movement.material_id,
    material_name: movement.material_name,
    barcode: movement.barcode || '',
    quantity_delta: reverseDelta,
    reason: 'ADJUSTMENT_VOID',
    unit_cost: movement.unit_cost,
    reference_id: movement.id,
    reference_note: `Reverses adjustment ID ${movement.id}`,
    created_by: actor.id,
    created_by_name: actor.name,
    created_at: now,
    effective_at: movement.effective_at || movement.created_at,
    reverses: movement.id,
  };

  movement.reversed_by = reversalId;
  db.packagingStockMovements.push(reversal);

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_adjustment_reversed',
    'packaging_material',
    mat.id,
    `Reversed adjustment ${movement.id} (${reverseDelta > 0 ? '+' : ''}${reverseDelta})`
  );

  return reversal;
}

// ----------------------------------------------------------------------------
// RULES CRUD
// ----------------------------------------------------------------------------

export function getPackagingRules(db: any): PackagingRule[] {
  return Array.from(db.packagingRules.values());
}

export function createPackagingRule(db: any, params: {
  name: string;
  min_pieces: number;
  max_pieces?: number | null;
  material_id: string;
  quantity: number;
  active?: boolean;
  actor_id?: string;
  actor_name?: string;
}): PackagingRule {
  const id = `pkgrule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const rule: PackagingRule = {
    id,
    name: params.name.trim(),
    min_pieces: Math.max(1, Number(params.min_pieces) || 1),
    max_pieces: params.max_pieces !== undefined && params.max_pieces !== null ? Number(params.max_pieces) : null,
    material_id: params.material_id,
    quantity: Math.max(1, Number(params.quantity) || 1),
    active: params.active !== undefined ? Boolean(params.active) : true,
    created_at: now,
    updated_at: now,
  };
  db.packagingRules.set(id, rule);
  db.logAudit(
    params.actor_id || 'system',
    params.actor_name || 'System',
    'packaging_rule_created',
    'packaging_rule',
    id,
    `Created packaging rule "${rule.name}"`
  );
  return rule;
}

export function updatePackagingRule(
  db: any,
  id: string,
  params: Partial<PackagingRule>,
  actor_id?: string,
  actor_name?: string
): PackagingRule | null {
  const rule = db.packagingRules.get(id);
  if (!rule) return null;
  if (params.name !== undefined) rule.name = params.name.trim();
  if (params.min_pieces !== undefined) rule.min_pieces = Math.max(1, Number(params.min_pieces) || 1);
  if (params.max_pieces !== undefined) rule.max_pieces = params.max_pieces !== null ? Number(params.max_pieces) : null;
  if (params.material_id !== undefined) rule.material_id = params.material_id;
  if (params.quantity !== undefined) rule.quantity = Math.max(1, Number(params.quantity) || 1);
  if (params.active !== undefined) rule.active = Boolean(params.active);
  rule.updated_at = new Date().toISOString();
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_rule_updated',
    'packaging_rule',
    id,
    `Updated packaging rule "${rule.name}"`
  );
  return rule;
}

export function deletePackagingRule(db: any, id: string, actor_id?: string, actor_name?: string): boolean {
  const rule = db.packagingRules.get(id);
  if (!rule) return false;
  db.packagingRules.delete(id);
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_rule_deleted',
    'packaging_rule',
    id,
    `Deleted packaging rule "${rule.name}"`
  );
  return true;
}

// ----------------------------------------------------------------------------
// SETTINGS
// ----------------------------------------------------------------------------

export function getPackagingSettings(db: any): PackagingSettings {
  return db.packagingSettings;
}

export function updatePackagingSettings(
  db: any,
  params: Partial<PackagingSettings>,
  actor_id?: string,
  actor_name?: string
): PackagingSettings {
  if (params.cover_days !== undefined) {
    db.packagingSettings.cover_days = Math.max(1, Number(params.cover_days) || 30);
  }
  db.logAudit(
    actor_id || 'system',
    actor_name || 'System',
    'packaging_settings_updated',
    'packaging_settings',
    'settings',
    `Updated packaging target cover days to ${db.packagingSettings.cover_days}`
  );
  return db.packagingSettings;
}

// ----------------------------------------------------------------------------
// REPLENISHMENT & BUY LIST
// ----------------------------------------------------------------------------

export function getPackagingStockStatus(mat: PackagingMaterial): string {
  if (mat.on_hand <= 0) return 'out_of_stock';
  if (mat.on_hand <= mat.reorder_level * 0.5) return 'critical';
  if (mat.on_hand <= mat.reorder_level) return 'low_stock';
  return 'healthy';
}

export function getPackagingBuyList(db: any, params?: { cover_days?: number }): PackagingBuyListItem[] {
  const coverDays = Math.max(1, params?.cover_days || db.packagingSettings.cover_days || 30);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Exclude archived/inactive rows
  const activeMaterials = Array.from(db.packagingMaterials.values()).filter((m: any) => m.active);

  return activeMaterials.map((mat: any) => {
    const recentMovs = db.packagingStockMovements.filter(
      (m: any) =>
        m.material_id === mat.id &&
        (m.effective_at || m.created_at) >= thirtyDaysAgo &&
        ['PACKAGING_USED', 'PACKAGING_USED_SCAN', 'PACKAGING_USED_RULE'].includes(m.reason)
    );

    const recentUsed = recentMovs.reduce((sum: number, m: any) => sum + Math.abs(m.quantity_delta), 0);
    const daily_usage_rate = Number((recentUsed / 30).toFixed(2));
    const days_of_stock_left =
      daily_usage_rate > 0
        ? Number((mat.on_hand / daily_usage_rate).toFixed(1))
        : mat.on_hand > 0
        ? 999
        : 0;

    const targetQty = Math.ceil(daily_usage_rate * coverDays);
    const recommended_reorder_qty = Math.max(
      0,
      targetQty > mat.on_hand ? targetQty - mat.on_hand : mat.on_hand <= mat.reorder_level ? mat.reorder_level * 2 - mat.on_hand : 0
    );
    const estimated_cost = Number((recommended_reorder_qty * mat.unit_cost).toFixed(2));
    const status = getPackagingStockStatus(mat) as any;

    return {
      material_id: mat.id,
      material_name: mat.name,
      sku: mat.sku,
      category: mat.category,
      unit: mat.unit,
      on_hand: mat.on_hand,
      reorder_level: mat.reorder_level,
      unit_cost: mat.unit_cost,
      daily_usage_rate,
      days_of_stock_left,
      target_cover_days: coverDays,
      recommended_reorder_qty,
      estimated_cost,
      status,
    };
  });
}

// ----------------------------------------------------------------------------
// MONTHLY REPORT AND Month Close
// ----------------------------------------------------------------------------

export function getPackagingUsageReport(db: any, params: { month: string }): any {
  const month = params.month; // "YYYY-MM"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Month parameter is required and must be in YYYY-MM format');
  }

  // If month is already closed, return the stored immutable snapshot
  if (db.packagingMonthCloses.has(month)) {
    return db.packagingMonthCloses.get(month);
  }

  // Start & End in Asia/Dhaka (+06:00)
  const startIso = `${month}-01T00:00:00.000+06:00`;
  const startTime = new Date(startIso).getTime();

  const parts = month.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextMStr = nextM < 10 ? `0${nextM}` : `${nextM}`;
  const nextStartIso = `${nextY}-${nextMStr}-01T00:00:00.000+06:00`;
  const endTime = new Date(nextStartIso).getTime() - 1;

  // Active or historically moved materials
  const allMaterials = Array.from(db.packagingMaterials.values()) as PackagingMaterial[];
  const reportRows: PackagingUsageReportItem[] = [];
  let consumption_cost = 0;

  for (const mat of allMaterials) {
    const allMovs = db.packagingStockMovements.filter((m: any) => m.material_id === mat.id);
    const hasHistory = allMovs.some((mov: any) => {
      const t = new Date(mov.effective_at || mov.created_at).getTime();
      return t >= startTime && t <= endTime;
    });

    if (!mat.active && !hasHistory) {
      continue;
    }

    let opening_quantity = 0;
    let purchased = 0;
    let used_tracked = 0;
    let used_counted = 0;
    let other = 0;

    for (const mov of allMovs) {
      const t = new Date(mov.effective_at || mov.created_at).getTime();
      if (t < startTime) {
        opening_quantity += mov.quantity_delta;
      } else if (t <= endTime) {
        if (mov.reason === 'PURCHASE' || mov.reason === 'PURCHASE_VOID') {
          purchased += mov.quantity_delta;
        } else if (['PACKAGING_USED', 'PACKAGING_USED_SCAN', 'PACKAGING_USED_RULE'].includes(mov.reason)) {
          used_tracked += Math.abs(mov.quantity_delta);
        } else if (mov.reason === 'COUNT_ADJUSTMENT' || mov.reason === 'COUNT_VOID') {
          used_counted += -mov.quantity_delta;
        } else if (mov.reason !== 'OPENING_BALANCE') {
          other += mov.quantity_delta;
        } else {
          opening_quantity += mov.quantity_delta;
        }
      }
    }

    const closing_quantity = opening_quantity + purchased - used_tracked - used_counted + other;
    const used_total = opening_quantity + purchased - closing_quantity;

    // Unit Cost at Month End (Replay only movements up to month end)
    const voidReasons = ['PURCHASE_VOID', 'COUNT_VOID', 'ADJUSTMENT_VOID'];
    const costingMovs = allMovs.filter((mov: any) => {
      const t = new Date(mov.effective_at || mov.created_at).getTime();
      if (t > endTime) return false;
      if (mov.reversed_by) return false;
      if (voidReasons.includes(mov.reason)) return false;
      return true;
    });

    costingMovs.sort((a: any, b: any) => {
      const timeA = a.effective_at || a.created_at;
      const timeB = b.effective_at || b.created_at;
      return timeA.localeCompare(timeB);
    });

    let replayedQty = 0;
    let replayedCost = mat.unit_cost; // initial fallback

    for (const mov of costingMovs) {
      if (mov.quantity_delta > 0 && (mov.reason === 'PURCHASE' || mov.reason === 'OPENING_BALANCE')) {
        if (replayedQty + mov.quantity_delta > 0) {
          replayedCost = (replayedQty * replayedCost + mov.quantity_delta * mov.unit_cost) / (replayedQty + mov.quantity_delta);
          replayedQty += mov.quantity_delta;
        } else {
          replayedQty += mov.quantity_delta;
          replayedCost = mov.unit_cost;
        }
      } else {
        replayedQty += mov.quantity_delta;
      }
    }

    const monthEndUnitCost = Number(replayedCost.toFixed(2));
    const cost_used = Number((used_total * monthEndUnitCost).toFixed(2));
    consumption_cost += cost_used;

    // Last physical count dated in/before this month
    const validCounts = (Array.from(db.packagingCounts.values()) as PackagingCount[]).filter(
      (c: any) => c.status !== 'voided' && new Date(c.counted_at).getTime() <= endTime && c.items.some((i: any) => i.material_id === mat.id)
    );
    let lastCountedAt: string | undefined;
    if (validCounts.length > 0) {
      validCounts.sort((a: any, b: any) => new Date(b.counted_at).getTime() - new Date(a.counted_at).getTime());
      lastCountedAt = validCounts[0].counted_at;
    }

    reportRows.push({
      material_id: mat.id,
      material_name: mat.name,
      sku: mat.sku,
      category: mat.category,
      unit: mat.unit,
      opening_quantity,
      received_quantity: purchased,
      used_quantity: used_tracked,
      adjusted_quantity: other - used_counted, // backwards compatibility
      closing_quantity,
      unit_cost: monthEndUnitCost,
      total_used_cost: cost_used,
    });
  }

  // Monthly active purchases total
  let purchase_amount = 0;
  for (const p of db.packagingPurchases.values()) {
    if (p.status === 'active' && p.date.startsWith(month)) {
      purchase_amount += p.total;
    }
  }

  // Delivered orders by business_date, then delivery_date, then created_at (Asia/Dhaka)
  const getOrderDate = (o: any): string => {
    if (o.business_date) return o.business_date;
    if (o.delivery_date) return o.delivery_date;
    return getDhakaDateParts(o.created_at).dateOnly;
  };

  const delivered_orders = Array.from(db.orders.values()).filter(
    (o: any) => o.status === 'delivered' && getOrderDate(o).startsWith(month)
  ).length;

  const cost_per_order = delivered_orders > 0 ? Number((consumption_cost / delivered_orders).toFixed(2)) : null;

  return {
    month,
    rows: reportRows,
    totals: {
      purchase_amount: Number(purchase_amount.toFixed(2)),
      consumption_cost: Number(consumption_cost.toFixed(2)),
      delivered_orders,
      cost_per_order,
    },
    as_of: new Date().toISOString(),
  };
}

export function closeMonth(db: any, month: string, actor: { id: string; name: string }): PackagingMonthClose {
  if (db.packagingMonthCloses.has(month)) {
    const err: any = new Error(`Month ${month} is already closed.`);
    err.statusCode = 409;
    throw err;
  }

  const report = getPackagingUsageReport(db, { month });
  const closeRecord: PackagingMonthClose = {
    id: `pkgcls_${month}_${Date.now()}`,
    month,
    closed_at: new Date().toISOString(),
    closed_by: actor.id,
    closed_by_name: actor.name,
    rows: report.rows,
    totals: report.totals,
  };

  db.packagingMonthCloses.set(month, closeRecord);

  db.logAudit(
    actor.id,
    actor.name,
    'packaging_month_closed',
    'packaging_month_close',
    month,
    `Closed month ${month} with consumption cost ৳${report.totals.consumption_cost.toLocaleString()} across ${report.rows.length} materials`
  );

  return closeRecord;
}

// ----------------------------------------------------------------------------
// LEDGER INVARIANT & DEVIATIONS
// ----------------------------------------------------------------------------

export function verifyLedger(db: any): string[] {
  const mismatched: string[] = [];
  for (const mat of db.packagingMaterials.values()) {
    const movements = db.packagingStockMovements.filter((m: any) => m.material_id === mat.id);
    const sum = movements.reduce((acc: number, m: any) => acc + m.quantity_delta, 0);
    if (mat.on_hand !== sum) {
      mismatched.push(mat.id);
      db.logAudit(
        'system',
        'System',
        'ledger_mismatch_detected',
        'packaging_material',
        mat.id,
        `Ledger sum mismatch for ${mat.name} (SKU: ${mat.sku}): Material On Hand = ${mat.on_hand}, Ledger Sum = ${sum}`
      );
    }
  }
  return mismatched;
}

// ----------------------------------------------------------------------------
// PACKING STATION ORDER DEDUCTIONS
// ----------------------------------------------------------------------------

export function deductPackagingForOrder(
  db: any,
  order: any,
  scanned_barcodes?: string[],
  actor_id?: string,
  actor_name?: string
): void {
  if (order.packaging_deducted) {
    return;
  }
  order.packaging_deducted = true;

  const totalPieces = order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
  const now = new Date().toISOString();

  // 1. Rule deductions
  const activeRules = (Array.from(db.packagingRules.values()) as PackagingRule[]).filter((r: any) => r.active);
  for (const rule of activeRules) {
    const minOk = totalPieces >= rule.min_pieces;
    const maxOk = rule.max_pieces === null || rule.max_pieces === undefined || totalPieces <= rule.max_pieces;
    if (minOk && maxOk && rule.quantity > 0) {
      const mat = db.packagingMaterials.get(rule.material_id);
      if (mat) {
        // Skip rule deduction if this material's barcode is scanned
        const isScanned = Array.isArray(scanned_barcodes) && scanned_barcodes.some(
          b => b && mat.barcode && b.trim().toLowerCase() === mat.barcode.trim().toLowerCase()
        );
        if (isScanned) {
          continue;
        }

        const toDeduct = Math.min(rule.quantity, Math.max(0, mat.on_hand));
        if (toDeduct > 0) {
          mat.on_hand -= toDeduct;
          mat.available = mat.on_hand - mat.reserved;
          mat.updated_at = now;
          db.packagingStockMovements.push({
            id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            material_id: mat.id,
            material_name: mat.name,
            barcode: mat.barcode || '',
            quantity_delta: -toDeduct,
            reason: 'PACKAGING_USED_RULE',
            unit_cost: mat.unit_cost,
            reference_id: order.id,
            reference_note: `Rule "${rule.name}" for order ${order.invoice_number}`,
            created_by: actor_id || 'system',
            created_by_name: actor_name || 'System',
            created_at: now,
            effective_at: now,
          });
        }
      }
    }
  }

  // 2. Scan deductions
  if (Array.isArray(scanned_barcodes) && scanned_barcodes.length > 0) {
    for (const scannedBarcode of scanned_barcodes) {
      if (!scannedBarcode || !scannedBarcode.trim()) continue;
      const clean = scannedBarcode.trim().toLowerCase();
      const mat = (Array.from(db.packagingMaterials.values()) as PackagingMaterial[]).find(
        (m: any) => m.track_scan && m.barcode && m.barcode.trim().toLowerCase() === clean
      );
      if (mat) {
        // Set package_box_size on order when empty
        if (mat.category === 'carton' && !order.package_box_size) {
          order.package_box_size = mat.name;
        }

        const toDeduct = Math.min(1, Math.max(0, mat.on_hand));
        if (toDeduct > 0) {
          mat.on_hand -= toDeduct;
          mat.available = mat.on_hand - mat.reserved;
          mat.updated_at = now;
          db.packagingStockMovements.push({
            id: `pkgmov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            material_id: mat.id,
            material_name: mat.name,
            barcode: mat.barcode || '',
            quantity_delta: -toDeduct,
            reason: 'PACKAGING_USED_SCAN',
            unit_cost: mat.unit_cost,
            reference_id: order.id,
            reference_note: `Scanned at packing for order ${order.invoice_number}`,
            created_by: actor_id || 'system',
            created_by_name: actor_name || 'System',
            created_at: now,
            effective_at: now,
          });
        }
      }
    }
  }
}
