import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  PackageX,
  Boxes,
  ArrowLeft,
  History,
  Layers,
  Search,
  CheckCircle2,
  Plus,
  ShoppingBag,
  Eye,
  X,
  Printer,
  FileDown,
  RefreshCw,
} from 'lucide-react';
import { Product, ProductBatch, StockMovement, Order } from '../../types';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

export const StockAlertsView: React.FC = () => {
  const { products, batches, stockMovements, orders, setActivePath, receiveStock } = useApp();
  const { can } = useAuth();

  const [activeTab, setActiveTab] = useState<'all' | 'out_of_stock' | 'low_stock' | 'orders_affected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modals inside fullpage view
  const [receiveTargetProduct, setReceiveTargetProduct] = useState<Product | null>(null);
  const [receiveQty, setReceiveQty] = useState('1');
  const [receiveCost, setReceiveCost] = useState('');
  const [receiveWarehouse, setReceiveWarehouse] = useState('wh_shop');
  const [receiveSupplier, setReceiveSupplier] = useState('');
  const [isSubmittingReceive, setIsSubmittingReceive] = useState(false);

  // Sub-detail drawers / dialogs
  const [inspectHistoryProduct, setInspectHistoryProduct] = useState<Product | null>(null);
  const [inspectBatchProduct, setInspectBatchProduct] = useState<Product | null>(null);
  const [inspectOrdersProduct, setInspectOrdersProduct] = useState<Product | null>(null);

  // Group batches by product
  const batchesByProduct = useMemo(() => {
    const map = new Map<string, ProductBatch[]>();
    batches.forEach((b) => {
      const list = map.get(b.product_id) || [];
      list.push(b);
      map.set(b.product_id, list);
    });
    return map;
  }, [batches]);

  // Group movements by product
  const movementsByProduct = useMemo(() => {
    const map = new Map<string, StockMovement[]>();
    stockMovements.forEach((m) => {
      const list = map.get(m.product_id) || [];
      list.push(m);
      map.set(m.product_id, list);
    });
    return map;
  }, [stockMovements]);

  // Group active orders by product
  const activeOrdersByProduct = useMemo(() => {
    const map = new Map<string, Order[]>();
    orders.forEach((o) => {
      if (o.status === 'cancelled' || o.status === 'dispatched' || o.status === 'delivered') return;
      o.items.forEach((item) => {
        const list = map.get(item.product_id) || [];
        if (!list.some((existing) => existing.id === o.id)) {
          list.push(o);
        }
        map.set(item.product_id, list);
      });
    });
    return map;
  }, [orders]);

  // All alert products
  const alertProducts = useMemo(() => {
    return products.filter((p) => {
      const avail = p.stock_available ?? 0;
      const threshold = p.low_stock_threshold ?? 3;
      const isOut = avail <= 0;
      const isLow = avail > 0 && avail <= threshold;
      return isOut || isLow;
    });
  }, [products]);

  // Derived counts
  const outOfStockCount = useMemo(
    () => products.filter((p) => (p.stock_available ?? 0) <= 0).length,
    [products]
  );
  const lowStockCount = useMemo(
    () =>
      products.filter(
        (p) =>
          (p.stock_available ?? 0) > 0 &&
          (p.stock_available ?? 0) <= (p.low_stock_threshold ?? 3)
      ).length,
    [products]
  );
  const impactedOrdersCount = useMemo(() => {
    let count = 0;
    const seenOrderIds = new Set<string>();
    alertProducts.forEach((p) => {
      const linkedOrders = activeOrdersByProduct.get(p.id) || [];
      linkedOrders.forEach((o) => {
        if (!seenOrderIds.has(o.id)) {
          seenOrderIds.add(o.id);
          count++;
        }
      });
    });
    return count;
  }, [alertProducts, activeOrdersByProduct]);

  // Filtered alert list
  const filteredAlertList = useMemo(() => {
    return alertProducts.filter((p) => {
      const avail = p.stock_available ?? 0;
      const threshold = p.low_stock_threshold ?? 3;
      const isOut = avail <= 0;
      const isLow = avail > 0 && avail <= threshold;
      const hasActiveOrders = (activeOrdersByProduct.get(p.id)?.length ?? 0) > 0;

      if (activeTab === 'out_of_stock' && !isOut) return false;
      if (activeTab === 'low_stock' && !isLow) return false;
      if (activeTab === 'orders_affected' && !hasActiveOrders) return false;

      if (brandFilter !== 'all' && p.brand !== brandFilter) return false;
      if (categoryFilter !== 'all' && p.category_name !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${p.name} ${p.brand} ${p.sku} ${p.barcode} ${p.display_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [alertProducts, activeTab, brandFilter, categoryFilter, searchQuery, activeOrdersByProduct]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    alertProducts.forEach((p) => p.brand && set.add(p.brand));
    return Array.from(set).sort();
  }, [alertProducts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    alertProducts.forEach((p) => p.category_name && set.add(p.category_name));
    return Array.from(set).sort();
  }, [alertProducts]);

  // Navigate to product in main products view
  const handleJumpToProduct = (product: Product) => {
    try {
      sessionStorage.setItem('highlight_product_sku', product.sku);
      sessionStorage.setItem('highlight_product_id', product.id);
    } catch {}
    setActivePath('/inventory/products');
  };

  const handleOpenReceive = (product: Product) => {
    setReceiveTargetProduct(product);
    setReceiveQty('1');
    setReceiveCost(product.avg_cost ? String(product.avg_cost) : '');
    setReceiveWarehouse('wh_shop');
    setReceiveSupplier('');
  };

  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTargetProduct) return;
    setIsSubmittingReceive(true);
    try {
      await receiveStock({
        product_id: receiveTargetProduct.id,
        warehouse_id: receiveWarehouse,
        qty_received: Number(receiveQty),
        landed_cost_per_unit: Number(receiveCost),
        supplier_name: receiveSupplier || undefined,
        notes: 'Received via Stock Alerts view',
      });
      setReceiveTargetProduct(null);
    } catch (err: any) {
      alert(err.message || 'Failed to receive stock');
    } finally {
      setIsSubmittingReceive(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-1" id="stock-alerts-view">
      {/* Top Bar with Back Button */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActivePath('/inventory/products')}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Products</span>
          </button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h1 className="text-[13px] font-bold text-[var(--text)]">Stock Alerts & Out of Stock</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-mono">
            {outOfStockCount} OUT
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono">
            {lowStockCount} LOW
          </span>
        </div>
      </div>

      {/* KPI Cards (Minimalist, Compact, No Helper Text) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[var(--surface)] border border-rose-500/30 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase">
            <span>Out of Stock</span>
            <PackageX className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-300 mt-1 font-mono">
            {outOfStockCount}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-amber-500/30 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase">
            <span>Low Stock</span>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-300 mt-1 font-mono">
            {lowStockCount}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-blue-500/30 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase">
            <span>Orders Impacted</span>
            <ShoppingBag className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-300 mt-1 font-mono">
            {impactedOrdersCount}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-muted)] uppercase">
            <span>Total Alert SKUs</span>
            <Boxes className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
          <div className="text-xl font-black text-[var(--text)] mt-1 font-mono">
            {alertProducts.length} <span className="text-xs font-normal text-[var(--text-muted)]">/ {products.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Control */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 shadow-2xs">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            All Alerts ({alertProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('out_of_stock')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'out_of_stock'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            Out of Stock ({outOfStockCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('low_stock')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'low_stock'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            Low Stock ({lowStockCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders_affected')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'orders_affected'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/10'
            }`}
          >
            Impacted Orders ({impactedOrdersCount})
          </button>
        </div>

        {/* Search & Select Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search SKU, Name, Barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text)] font-medium"
          >
            <option value="all">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text)] font-medium"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main High-Density Minimalist Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-sunken)] border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wider font-bold">
              <tr>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Product Name & Brand</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Shop Floor</th>
                <th className="py-2.5 px-3 text-right">Main Store</th>
                <th className="py-2.5 px-3 text-right">Reserved</th>
                <th className="py-2.5 px-3 text-right">Available</th>
                <th className="py-2.5 px-3 text-right">Price</th>
                <th className="py-2.5 px-3 text-center">Impacted Orders</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredAlertList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No stock alerts found.
                  </td>
                </tr>
              ) : (
                filteredAlertList.map((product) => {
                  const avail = product.stock_available ?? 0;
                  const isOut = avail <= 0;
                  const shopStock = product.stock_by_warehouse?.find((w) => w.warehouse_id === 'wh_shop')?.on_hand ?? 0;
                  const mainStock = product.stock_by_warehouse?.find((w) => w.warehouse_id === 'wh_main')?.on_hand ?? 0;
                  const reservedStock = product.stock_reserved ?? 0;
                  const linkedOrders = activeOrdersByProduct.get(product.id) || [];

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-[var(--surface-hover)] transition-colors ${
                        isOut ? 'bg-rose-500/[0.02]' : 'bg-amber-500/[0.02]'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--accent)] whitespace-nowrap">
                        {product.sku}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          {product.photo_url ? (
                            <img
                              src={product.photo_url}
                              alt=""
                              className="w-7 h-7 rounded-lg object-cover border border-[var(--border)] bg-[var(--surface-sunken)] shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                              <Boxes className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--text)] truncate max-w-xs">
                              {product.name || product.display_name}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-2 font-mono">
                              <span>{product.brand}</span>
                              <span>•</span>
                              <span>{product.concentration} {product.size_variant}</span>
                              <span>•</span>
                              <span>{product.barcode}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isOut
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-600 text-white'
                          }`}
                        >
                          {isOut ? '0 OUT' : `${avail} LOW`}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-medium text-[var(--text)]">
                        {shopStock}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-medium text-[var(--text)]">
                        {mainStock}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {reservedStock}
                      </td>

                      <td
                        className={`py-2.5 px-3 text-right font-mono font-black ${
                          isOut ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {avail}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text)] whitespace-nowrap">
                        ৳{(product.selling_price || 0).toLocaleString()}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {linkedOrders.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setInspectOrdersProduct(
                                inspectOrdersProduct?.id === product.id ? null : product
                              )
                            }
                            className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-[10px] hover:bg-blue-500/20 cursor-pointer font-mono"
                          >
                            {linkedOrders.length} Orders
                          </button>
                        ) : (
                          <span className="text-[var(--text-muted)] font-mono">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleJumpToProduct(product)}
                            className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[11px] font-bold text-[var(--text)] flex items-center gap-1 cursor-pointer"
                            title="Open in Main Products Catalog"
                          >
                            <Eye className="w-3 h-3 text-[var(--accent)]" />
                            <span>Catalog</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setInspectHistoryProduct(
                                inspectHistoryProduct?.id === product.id ? null : product
                              )
                            }
                            className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[11px] font-bold text-[var(--text)] flex items-center gap-1 cursor-pointer"
                            title="Stock History Ledger"
                          >
                            <History className="w-3 h-3 text-blue-500" />
                            <span>History</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setInspectBatchProduct(
                                inspectBatchProduct?.id === product.id ? null : product
                              )
                            }
                            className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[11px] font-bold text-[var(--text)] flex items-center gap-1 cursor-pointer"
                            title="Batch & Inward Lot"
                          >
                            <Layers className="w-3 h-3 text-purple-500" />
                            <span>Batch</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenReceive(product)}
                            className="px-2.5 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90 text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Receive Stock"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Receive</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer: Stock History */}
      {inspectHistoryProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                <span>Stock Movements: {inspectHistoryProduct.name} ({inspectHistoryProduct.sku})</span>
              </div>
              <button
                onClick={() => setInspectHistoryProduct(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(movementsByProduct.get(inspectHistoryProduct.id) || []).length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                  No ledger movements found for this product.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-sunken)] text-[var(--text-muted)] font-bold border-b border-[var(--border)]">
                    <tr>
                      <th className="py-1.5 px-2.5">Date</th>
                      <th className="py-1.5 px-2.5">Reason</th>
                      <th className="py-1.5 px-2.5">Warehouse</th>
                      <th className="py-1.5 px-2.5 text-right">Delta</th>
                      <th className="py-1.5 px-2.5">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-mono">
                    {(movementsByProduct.get(inspectHistoryProduct.id) || []).map((m) => (
                      <tr key={m.id} className="hover:bg-[var(--surface-hover)]">
                        <td className="py-1.5 px-2.5 text-[var(--text-secondary)]">
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold uppercase text-[10px]">
                          {m.movement_reason}
                        </td>
                        <td className="py-1.5 px-2.5 text-[var(--text-secondary)]">
                          {m.warehouse_id === 'wh_shop' ? 'Shop Floor' : 'Main Store'}
                        </td>
                        <td
                          className={`py-1.5 px-2.5 text-right font-bold ${
                            m.quantity_delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                        </td>
                        <td className="py-1.5 px-2.5 text-[var(--text-muted)] truncate max-w-xs">
                          {m.notes || m.reference_id || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Batch & Lot Inward */}
      {inspectBatchProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                <span>Batch & Lots: {inspectBatchProduct.name} ({inspectBatchProduct.sku})</span>
              </div>
              <button
                onClick={() => setInspectBatchProduct(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(batchesByProduct.get(inspectBatchProduct.id) || []).length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                  No batches registered for this product.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                  {(batchesByProduct.get(inspectBatchProduct.id) || []).map((lot) => (
                    <div
                      key={lot.id}
                      className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--accent)]">{lot.batch_code}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                            lot.quantity_remaining > 0
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-[var(--surface)] text-[var(--text-muted)]'
                          }`}
                        >
                          {lot.quantity_remaining > 0 ? 'ACTIVE' : 'DEPLETED'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Qty: <strong>{lot.quantity_remaining}</strong> / {lot.quantity_received} units
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        Cost: ৳{(lot.purchase_cost || 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        Arrival: {lot.import_date || (lot.received_at ? new Date(lot.received_at).toLocaleDateString() : '—')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Impacted Orders */}
      {inspectOrdersProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <ShoppingBag className="w-4 h-4" />
                <span>Orders Waiting for {inspectOrdersProduct.sku}</span>
              </div>
              <button
                onClick={() => setInspectOrdersProduct(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[var(--surface-sunken)] text-[var(--text-muted)] border-b border-[var(--border)] font-bold">
                  <tr>
                    <th className="py-1.5 px-2.5">Invoice #</th>
                    <th className="py-1.5 px-2.5">Customer</th>
                    <th className="py-1.5 px-2.5">Status</th>
                    <th className="py-1.5 px-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(activeOrdersByProduct.get(inspectOrdersProduct.id) || []).map((o) => (
                    <tr key={o.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="py-1.5 px-2.5 font-bold text-[var(--accent)]">
                        {o.invoice_number}
                      </td>
                      <td className="py-1.5 px-2.5 text-[var(--text)] font-sans">
                        {o.customer_name} ({o.customer_phone})
                      </td>
                      <td className="py-1.5 px-2.5">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-[var(--text)]">
                        ৳{o.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Receive Stock */}
      {receiveTargetProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3.5 border-b border-[var(--border)] bg-[var(--surface-sunken)] flex items-center justify-between text-xs font-bold">
              <span>Receive Stock: {receiveTargetProduct.sku}</span>
              <button
                onClick={() => setReceiveTargetProduct(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitReceive} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-[var(--text)] block mb-1">Product</label>
                <input
                  disabled
                  value={`${receiveTargetProduct.display_name} (${receiveTargetProduct.sku})`}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text)] font-medium opacity-80"
                />
              </div>
              <div>
                <label className="font-bold text-[var(--text)] block mb-1">Warehouse</label>
                <select
                  value={receiveWarehouse}
                  onChange={(e) => setReceiveWarehouse(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-medium"
                >
                  <option value="wh_shop">Shop Floor (Showroom)</option>
                  <option value="wh_main">Main / Back-store (2nd Floor)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-[var(--text)] block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text)] block mb-1">Landed Cost / Unit (৳)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={receiveCost}
                    onChange={(e) => setReceiveCost(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-bold font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-[var(--text)] block mb-1">Supplier (Optional)</label>
                <input
                  type="text"
                  value={receiveSupplier}
                  onChange={(e) => setReceiveSupplier(e.target.value)}
                  placeholder="e.g. Dubai Wholesale Lot"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setReceiveTargetProduct(null)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] font-bold cursor-pointer hover:bg-[var(--surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReceive}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white font-bold cursor-pointer hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmittingReceive ? 'Receiving...' : 'Receive Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
