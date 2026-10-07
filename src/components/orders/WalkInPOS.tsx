import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Scan,
  ShoppingCart,
  Trash2,
  DollarSign,
  CreditCard,
  Smartphone,
  Landmark,
  Wallet,
  SplitSquareVertical,
  Search,
  Printer,
  Store,
  Coins,
  Clock,
  Package,
  Building2,
  CheckCircle2,
  Receipt,
  Camera,
  Download,
  Image as ImageIcon,
  Check,
  FileText,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Product, Order } from '../../types';
import { InvoiceModal } from './InvoiceModal';
import { Modal } from '../common/Modal';
import { CustomerLookupInput } from '../common/CustomerLookupInput';
import { generateInvoicePdf } from '../../lib/invoicePdf';
import { copyInvoiceToClipboard, saveInvoiceAsImage } from '../../lib/invoiceCapture';

export const WalkInPOS: React.FC = () => {
  const { products, createOrder, activeCashierClosing, unclosedCashierDays, setActivePath, settings } = useApp();
  const { currentUser } = useAuth();

  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Persistent POS state via sessionStorage
  const [customerName, setCustomerName] = useState<string>(() => {
    try {
      return sessionStorage.getItem('mirage_pos_cust_name') || 'Walk-in Customer';
    } catch {
      return 'Walk-in Customer';
    }
  });

  const [customerPhone, setCustomerPhone] = useState<string>(() => {
    try {
      return sessionStorage.getItem('mirage_pos_cust_phone') || '01700000000';
    } catch {
      return '01700000000';
    }
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autoAddTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAddIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [autoAddCountdown, setAutoAddCountdown] = useState<{
    product: Product;
    secondsRemaining: number;
  } | null>(null);

  const [cart, setCart] = useState<
    {
      product: Product;
      quantity: number;
      priceType: 'retail' | 'wholesale' | 'custom';
      unitPrice: number;
      retailPrice: number;
      wholesalePrice: number;
      discount: number;
    }[]
  >(() => {
    try {
      const saved = sessionStorage.getItem('mirage_pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bkash' | 'nagad' | 'bank' | 'card' | 'split'>('cash');
  const [bankAccount, setBankAccount] = useState<'acc_bank' | 'acc_bank_personal'>('acc_bank');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [bkashAmount, setBkashAmount] = useState<number>(0);
  const [nagadAmount, setNagadAmount] = useState<number>(0);
  const [bankAmount, setBankAmount] = useState<number>(0);
  const [businessBankAmount, setBusinessBankAmount] = useState<number>(0);
  const [personalBankAmount, setPersonalBankAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [transactionRef, setTransactionRef] = useState<string>('');

  const [wholesaleMode, setWholesaleMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('mirage_pos_wholesale') === 'true';
    } catch {
      return false;
    }
  });
  const [confirmWholesale, setConfirmWholesale] = useState<boolean>(false);

  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [orderDiscountMode, setOrderDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<boolean>(false);
  const [showPrintChoiceModal, setShowPrintChoiceModal] = useState<boolean>(false);
  const [isCapturingInvoice, setIsCapturingInvoice] = useState<boolean>(false);
  const [posToastMessage, setPosToastMessage] = useState<string | null>(null);

  const showPosToast = (msg: string) => {
    setPosToastMessage(msg);
    setTimeout(() => setPosToastMessage(null), 3500);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem('mirage_pos_cart', JSON.stringify(cart));
      sessionStorage.setItem('mirage_pos_cust_name', customerName);
      sessionStorage.setItem('mirage_pos_cust_phone', customerPhone);
      sessionStorage.setItem('mirage_pos_wholesale', String(wholesaleMode));
    } catch (e) {}
  }, [cart, customerName, customerPhone, wholesaleMode]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemDiscountTotal = cart.reduce((sum, item) => sum + item.discount, 0);
  const orderDiscountAmount =
    orderDiscountMode === 'percent'
      ? (subtotal - itemDiscountTotal) * (Math.max(0, Math.min(100, orderDiscount)) / 100)
      : Math.max(0, orderDiscount);
  const finalTotal = Math.max(0, subtotal - itemDiscountTotal - orderDiscountAmount);

  const splitReceived =
    cashAmount + bkashAmount + nagadAmount + businessBankAmount + personalBankAmount + cardAmount;
  const splitRemaining = Math.max(0, finalTotal - splitReceived);

  const wholesalePriceFor = (prod: Product): number =>
    prod.wholesale_type === 'separate' || (
      prod.wholesale_type === undefined &&
      typeof prod.wholesale_price === 'number' &&
      prod.wholesale_price > 0 &&
      prod.wholesale_price !== (prod.selling_price ?? 0)
    )
      ? (typeof prod.wholesale_price === 'number' ? prod.wholesale_price : prod.selling_price)
      : prod.selling_price;

  const priceFor = (prod: Product, wholesale: boolean) =>
    wholesale ? wholesalePriceFor(prod) : prod.selling_price;

  const setSaleMode = (wholesale: boolean) => {
    setWholesaleMode(wholesale);
    setCart(prev =>
      prev.map(it => {
        const targetPrice = wholesale ? it.wholesalePrice : it.retailPrice;
        return {
          ...it,
          priceType: wholesale ? 'wholesale' : 'retail',
          unitPrice: targetPrice,
        };
      })
    );
  };

  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashAmount(finalTotal);
    } else if (paymentMethod === 'bkash') {
      setBkashAmount(finalTotal);
    } else if (paymentMethod === 'nagad') {
      setNagadAmount(finalTotal);
    } else if (paymentMethod === 'bank') {
      setBankAmount(finalTotal);
    } else if (paymentMethod === 'card') {
      setCardAmount(finalTotal);
    }
  }, [finalTotal, paymentMethod]);

  const addProductToCart = useCallback((prod: Product) => {
    setErrorMsg(null);
    const retailPrice = prod.selling_price || 0;
    const wholesalePrice = wholesalePriceFor(prod);
    const initialPriceType = wholesaleMode ? 'wholesale' : 'retail';
    const initialUnitPrice = initialPriceType === 'wholesale' ? wholesalePrice : retailPrice;

    setCart(prev => {
      const existingIndex = prev.findIndex(c => c.product.id === prod.id);
      const currentCartQty = existingIndex >= 0 ? prev[existingIndex].quantity : 0;
      const available = prod.stock_available ?? 0;

      if (currentCartQty + 1 > available) {
        setErrorMsg(`Cannot add ${prod.display_name} — only ${available} available`);
        return prev;
      }

      if (existingIndex >= 0) {
        return prev.map((it, idx) => (idx === existingIndex ? { ...it, quantity: it.quantity + 1 } : it));
      } else {
        return [
          ...prev,
          {
            product: prod,
            quantity: 1,
            priceType: initialPriceType,
            unitPrice: initialUnitPrice,
            retailPrice,
            wholesalePrice,
            discount: 0,
          },
        ];
      }
    });
  }, [wholesaleMode]);

  const matchingProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return products.filter(p => {
      const displayName = (p.display_name || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();

      if (barcode === query) return true;
      if (sku === query || sku.includes(query)) return true;
      if (displayName.includes(query)) return true;
      if (name.includes(query)) return true;
      if (brand.includes(query)) return true;
      if (`${brand} ${name}`.includes(query)) return true;
      return false;
    });
  }, [products, searchQuery]);

  useEffect(() => {
    if (autoAddTimeoutRef.current) {
      clearTimeout(autoAddTimeoutRef.current);
      autoAddTimeoutRef.current = null;
    }
    if (autoAddIntervalRef.current) {
      clearInterval(autoAddIntervalRef.current);
      autoAddIntervalRef.current = null;
    }

    const query = searchQuery.trim();
    if (!query) {
      setAutoAddCountdown(null);
      return;
    }

    if (matchingProducts.length === 1) {
      const match = matchingProducts[0];
      const initialDelay = 1.0;
      let remaining = initialDelay;

      setAutoAddCountdown({ product: match, secondsRemaining: initialDelay });

      autoAddIntervalRef.current = setInterval(() => {
        remaining = Math.max(0, +(remaining - 0.2).toFixed(1));
        setAutoAddCountdown(prev => (prev ? { ...prev, secondsRemaining: remaining } : null));
      }, 200);

      autoAddTimeoutRef.current = setTimeout(() => {
        addProductToCart(match);
        setSearchQuery('');
        setAutoAddCountdown(null);
        searchInputRef.current?.focus();
      }, initialDelay * 1000);
    } else {
      setAutoAddCountdown(null);
    }

    return () => {
      if (autoAddTimeoutRef.current) clearTimeout(autoAddTimeoutRef.current);
      if (autoAddIntervalRef.current) clearTimeout(autoAddIntervalRef.current);
    };
  }, [searchQuery, matchingProducts, addProductToCart]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingProducts.length === 1) {
        addProductToCart(matchingProducts[0]);
        setSearchQuery('');
        setAutoAddCountdown(null);
      } else if (matchingProducts.length > 0) {
        addProductToCart(matchingProducts[0]);
        setSearchQuery('');
        setAutoAddCountdown(null);
      }
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    setErrorMsg(null);
    const item = cart[index];
    const newQty = item.quantity + delta;
    const available = item.product.stock_available ?? 0;

    if (newQty <= 0) {
      setCart(prev => prev.filter((_, i) => i !== index));
      return;
    }

    if (newQty > available) {
      setErrorMsg(`Cannot set quantity to ${newQty} — only ${available} in stock`);
      return;
    }

    setCart(prev => prev.map((it, idx) => (idx === index ? { ...it, quantity: newQty } : it)));
  };

  const setItemPriceType = (index: number, type: 'retail' | 'wholesale') => {
    setCart(prev =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const targetPrice = type === 'wholesale' ? it.wholesalePrice : it.retailPrice;
        return {
          ...it,
          priceType: type,
          unitPrice: targetPrice,
        };
      })
    );
  };

  const setCustomUnitPrice = (index: number, newPrice: number) => {
    setErrorMsg(null);
    const price = Math.max(0, newPrice);
    setCart(prev =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        let determinedType: 'retail' | 'wholesale' | 'custom' = 'custom';
        if (price === it.retailPrice) determinedType = 'retail';
        else if (price === it.wholesalePrice) determinedType = 'wholesale';
        return {
          ...it,
          priceType: determinedType,
          unitPrice: price,
        };
      })
    );
  };

  const setItemDiscount = (index: number, discount: number) => {
    setErrorMsg(null);
    const clean = Number.isFinite(discount) ? Math.max(0, discount) : 0;
    setCart(prev =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const maxDisc = it.unitPrice * it.quantity;
        return { ...it, discount: Math.min(clean, maxDisc) };
      })
    );
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const query = barcodeInput.trim();
    const matched = products.find(p => p.barcode === query || p.sku.toLowerCase() === query.toLowerCase());
    if (matched) {
      addProductToCart(matched);
      setBarcodeInput('');
    } else {
      setErrorMsg(`Product "${query}" not found.`);
    }
  };

  const clearCartSession = () => {
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('01700000000');
    setWholesaleMode(false);
    try {
      sessionStorage.removeItem('mirage_pos_cart');
      sessionStorage.removeItem('mirage_pos_cust_name');
      sessionStorage.removeItem('mirage_pos_cust_phone');
      sessionStorage.removeItem('mirage_pos_wholesale');
    } catch (e) {}
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setErrorMsg('Order list is empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const paymentInfo: any[] = [];
      const pushPay = (method: string, amount: number, account_id: string) => {
        if (amount > 0) {
          paymentInfo.push({
            method,
            amount: Math.round(amount),
            account_id,
            transaction_ref: transactionRef || undefined,
          });
        }
      };

      if (paymentMethod === 'split') {
        const splitParts = [
          { method: 'cash', amount: cashAmount, account_id: 'acc_cash' },
          { method: 'bkash', amount: bkashAmount, account_id: 'acc_bkash' },
          { method: 'nagad', amount: nagadAmount, account_id: 'acc_nagad' },
          { method: 'bank', amount: businessBankAmount, account_id: 'acc_bank' },
          { method: 'bank', amount: personalBankAmount, account_id: 'acc_bank_personal' },
          { method: 'card', amount: cardAmount, account_id: 'acc_bank' },
        ];
        const splitSum = splitParts.reduce((s, p) => s + p.amount, 0);
        if (splitSum > finalTotal + 0.5) {
          throw new Error(`Payment total (৳${splitSum.toLocaleString()}) exceeds Total Due (৳${finalTotal.toLocaleString()}).`);
        }
        splitParts.forEach(p => pushPay(p.method, p.amount, p.account_id));
      } else if (paymentMethod === 'bank') {
        pushPay('bank', Math.min(bankAmount, finalTotal), bankAccount);
      } else if (paymentMethod === 'card') {
        pushPay('card', Math.min(cardAmount, finalTotal), 'acc_bank');
      } else if (paymentMethod === 'bkash') {
        pushPay('bkash', Math.min(bkashAmount, finalTotal), 'acc_bkash');
      } else if (paymentMethod === 'nagad') {
        pushPay('nagad', Math.min(nagadAmount, finalTotal), 'acc_nagad');
      } else {
        pushPay('cash', Math.min(cashAmount, finalTotal), 'acc_cash');
      }

      if (paymentInfo.length === 0) {
        throw new Error('No payment amount entered.');
      }

      const order = await createOrder({
        customer_name: customerName || 'Walk-in Customer',
        customer_phone: customerPhone || '01700000000',
        channel: 'walk-in',
        fulfillment_method: 'n_a_walk_in',
        sale_type: wholesaleMode ? 'wholesale' : 'retail',
        business_date: activeCashierClosing?.business_date || new Date().toISOString().slice(0, 10),
        items: cart.map(it => ({
          product_id: it.product.id,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          discount_amount: it.discount,
        })),
        delivery_charge: 0,
        discount_amount: Math.round(orderDiscountAmount),
        payment_info: paymentInfo,
      });

      setCompletedOrder(order);
      setShowPrintChoiceModal(true); // Show print destination choice (POS Print vs Invoice Print)
      clearCartSession();
      setOrderDiscount(0);
    } catch (err: any) {
      setErrorMsg(err.message || 'Checkout failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 max-w-full mx-auto px-1" id="walk-in-pos-view">
      {/* Top Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-[13px] font-bold text-[var(--text)]">Walk-in Order POS</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Wholesale Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              if (wholesaleMode) {
                setSaleMode(false);
              } else {
                setConfirmWholesale(true);
              }
            }}
            className={`px-3 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              wholesaleMode
                ? 'bg-[var(--accent-secondary)] text-white border-[var(--accent-secondary)] shadow-xs'
                : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{wholesaleMode ? 'Wholesale Mode ON' : 'Wholesale'}</span>
          </button>

          {/* Invoice Button (Professional Mirage Perfumes Branded Invoice View & Customer Confirmation) */}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[var(--text)] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title="Open Invoice (Screenshot / Save Image / PDF for customer confirmation)"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Invoice Preview</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActivePath('/orders/daily-closing')}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-all ${
              unclosedCashierDays.length > 0
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{unclosedCashierDays.length > 0 ? 'Closing Due' : 'Closing'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2 bg-[color-mix(in_srgb,var(--status-red)_10%,transparent)] border border-[color-mix(in_srgb,var(--status-red)_30%,transparent)] text-[var(--status-red)] rounded-xl text-[12px] font-medium">
          {errorMsg}
        </div>
      )}

      {/* Main POS Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Area: Order Items List */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-2xs space-y-2.5">
            {/* Search and Auto-Add bar */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--accent)] absolute left-3 top-3" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search product by name or SKU to add to order list..."
                    className="w-full pl-9 pr-24 py-2.5 text-[13px] font-medium bg-[var(--surface-sunken)] border border-[var(--border)] rounded-xl focus:ring-1 focus:ring-[var(--accent)] focus:outline-hidden"
                  />
                  {autoAddCountdown && (
                    <div className="absolute right-2 top-2 px-2 py-0.5 bg-[var(--accent)] text-white text-[10px] font-mono font-bold rounded-lg flex items-center gap-1 shadow-xs animate-pulse">
                      <Clock className="w-3 h-3" />
                      <span>{autoAddCountdown.secondsRemaining}s</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1 w-40">
                  <div className="relative flex-1">
                    <Scan className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={e => setBarcodeInput(e.target.value)}
                      placeholder="Barcode"
                      className="w-full pl-8 pr-2 py-2 text-[11px] font-mono bg-[var(--surface-sunken)] border border-[var(--border)] rounded-xl focus:outline-hidden"
                    />
                  </div>
                </form>
              </div>

              {matchingProducts.length > 0 && searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-30 max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                  {matchingProducts.map(prod => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        addProductToCart(prod);
                        setSearchQuery('');
                        setAutoAddCountdown(null);
                      }}
                      className="p-2.5 flex items-center justify-between hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {prod.photo_url ? (
                          <img
                            src={prod.photo_url}
                            alt=""
                            className="w-9 h-9 object-cover rounded-lg border border-[var(--border)] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-[12px] text-[var(--text)] line-clamp-1">{prod.display_name}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                            SKU: {prod.sku} • Stock: {prod.stock_available ?? 0}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono font-bold text-[12px] text-[var(--accent)]">
                        ৳{priceFor(prod, wholesaleMode).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main Order Items Table */}
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] max-h-[580px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--surface-sunken)] border-b border-[var(--border)] text-[10px] text-[var(--text-secondary)] uppercase font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Item Details</th>
                    <th className="p-2.5 text-center w-28">QTY</th>
                    <th className="p-2.5 w-48">UNIT PRICE (MIXED PRICING)</th>
                    <th className="p-2.5 text-center w-24">DISCOUNT</th>
                    <th className="p-2.5 text-right w-24">TOTAL</th>
                    <th className="p-2.5 text-center w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-[12px] text-[var(--text-secondary)]">
                        Order list is empty. Search above or scan barcode to add items.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[var(--surface-hover)]">
                        <td className="p-2.5">
                          <div className="flex items-center gap-2.5">
                            {item.product.photo_url ? (
                              <img
                                src={item.product.photo_url}
                                alt=""
                                className="w-9 h-9 object-cover rounded-lg border border-[var(--border)] shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-[12px] text-[var(--text)] line-clamp-1">{item.product.display_name}</div>
                              <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                                SKU: {item.product.sku}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="p-2.5 text-center">
                          <div className="inline-flex items-center border border-[var(--border)] rounded-lg bg-[var(--surface)]">
                            <button
                              type="button"
                              onClick={() => updateQuantity(idx, -1)}
                              className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
                            >
                              -
                            </button>
                            <span className="px-2 font-mono font-bold text-[12px]">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(idx, 1)}
                              className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="inline-flex items-center bg-[var(--surface-sunken)] border border-[var(--border)] rounded-md p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setItemPriceType(idx, 'retail')}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                                  item.priceType === 'retail'
                                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                                }`}
                                title="Retail Price"
                              >
                                R
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemPriceType(idx, 'wholesale')}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                                  item.priceType === 'wholesale'
                                    ? 'bg-[var(--accent-secondary)] text-white shadow-2xs'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                                }`}
                                title="Wholesale Price"
                              >
                                W
                              </button>
                            </div>

                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1.5 text-[11px] text-[var(--text-secondary)] font-mono">৳</span>
                              <input
                                type="number"
                                min="0"
                                value={item.unitPrice}
                                onChange={e => setCustomUnitPrice(idx, Number(e.target.value))}
                                className="w-full pl-5 pr-1.5 py-1 text-right font-mono font-semibold text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-1 focus:ring-[var(--accent)] focus:outline-hidden"
                                title="Unit Price (৳)"
                              />
                            </div>
                          </div>
                        </td>

                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            min="0"
                            value={item.discount}
                            onChange={e => setItemDiscount(idx, Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right font-mono text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--status-red)] focus:outline-hidden"
                            title="Item Discount (৳)"
                          />
                        </td>

                        <td className="p-2.5 text-right font-mono font-bold text-[13px] text-[var(--text)]">
                          ৳{(item.unitPrice * item.quantity - item.discount).toLocaleString()}
                        </td>

                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}
                            className="text-[var(--text-secondary)] hover:text-[var(--status-red)] cursor-pointer p-1"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Area: Payment & Settlement Panel */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-[13px] font-bold text-[var(--text)]">Settlement & Payment ({cart.length} items)</h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCartSession}
                  className="text-[11px] text-[var(--status-red)] hover:underline cursor-pointer font-medium"
                >
                  Clear Order
                </button>
              )}
            </div>

            <CustomerLookupInput
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              customerPhone={customerPhone}
              onCustomerPhoneChange={setCustomerPhone}
              layout="pos"
              showAddress={false}
            />

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bkash')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'bkash'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>bKash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('nagad')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'nagad'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Nagad</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'bank'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Bank</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('split')}
                  className={`p-2 rounded-xl border font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    paymentMethod === 'split'
                      ? 'bg-[var(--accent-secondary)] text-white border-[var(--accent-secondary)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                  <span>Split</span>
                </button>
              </div>

              {paymentMethod === 'bank' && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setBankAccount('acc_bank')}
                    className={`p-1.5 rounded-lg border font-semibold cursor-pointer ${
                      bankAccount === 'acc_bank' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sunken)]'
                    }`}
                  >
                    Business Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => setBankAccount('acc_bank_personal')}
                    className={`p-1.5 rounded-lg border font-semibold cursor-pointer ${
                      bankAccount === 'acc_bank_personal' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sunken)]'
                    }`}
                  >
                    Personal Bank
                  </button>
                </div>
              )}

              {paymentMethod === 'split' && (
                <div className="mt-2 space-y-1 bg-[var(--surface-sunken)] p-2 rounded-lg text-[11px]">
                  <div className="flex justify-between font-bold">
                    <span>Remaining Due:</span>
                    <span className={`font-mono ${splitRemaining > 0.5 ? 'text-[var(--status-red)]' : 'text-[var(--status-green)]'}`}>
                      ৳{splitRemaining.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-28 text-[var(--text-secondary)]">Cash</span>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={e => setCashAmount(Number(e.target.value))}
                      className="w-24 px-1.5 py-0.5 text-right font-mono bg-[var(--surface)] border rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-28 text-[var(--text-secondary)]">bKash</span>
                    <input
                      type="number"
                      value={bkashAmount}
                      onChange={e => setBkashAmount(Number(e.target.value))}
                      className="w-24 px-1.5 py-0.5 text-right font-mono bg-[var(--surface)] border rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-28 text-[var(--text-secondary)]">Nagad</span>
                    <input
                      type="number"
                      value={nagadAmount}
                      onChange={e => setNagadAmount(Number(e.target.value))}
                      className="w-24 px-1.5 py-0.5 text-right font-mono bg-[var(--surface)] border rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-28 text-[var(--text-secondary)]">Business Bank</span>
                    <input
                      type="number"
                      value={businessBankAmount}
                      onChange={e => setBusinessBankAmount(Number(e.target.value))}
                      className="w-24 px-1.5 py-0.5 text-right font-mono bg-[var(--surface)] border rounded"
                    />
                  </div>
                </div>
              )}

              {paymentMethod !== 'cash' && paymentMethod !== 'split' && (
                <input
                  type="text"
                  value={transactionRef}
                  onChange={e => setTransactionRef(e.target.value)}
                  placeholder="Transaction Ref ID (optional)"
                  className="mt-1.5 w-full px-2 py-1 text-[11px] font-mono bg-[var(--surface-sunken)] border rounded-xl"
                />
              )}
            </div>

            <div className="bg-[var(--surface-sunken)] p-3 rounded-xl border space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Subtotal:</span>
                <span className="font-mono font-semibold">৳{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Order Discount:</span>
                <input
                  type="number"
                  min="0"
                  value={orderDiscount}
                  onChange={e => setOrderDiscount(Number(e.target.value))}
                  className="w-20 px-1.5 py-0.5 text-right font-mono text-[var(--status-red)] bg-[var(--surface)] border rounded"
                />
              </div>
              <div className="border-t pt-1.5 flex justify-between items-center text-[13px] font-bold text-[var(--accent)]">
                <span>Total Due:</span>
                <span className="font-mono text-[14px]">৳{finalTotal.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={isSubmitting || cart.length === 0}
              className="w-full py-2.5 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-xl hover:opacity-90 shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Processing...' : wholesaleMode ? `Complete Wholesale Sale (৳${finalTotal.toLocaleString()})` : `Complete Sale (৳${finalTotal.toLocaleString()})`}
            </button>
          </div>
        </div>
      </div>

      {/* Professional Branded Mirage Perfumes Invoice Modal (Pre-order verification & customer confirmation) */}
      {showInvoiceModal && cart.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white text-black rounded-2xl shadow-2xl max-w-2xl w-full my-4 overflow-hidden border border-gray-200 flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150 relative">
            {/* Toast Notification */}
            {posToastMessage && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
                <Check className="w-3.5 h-3.5" />
                <span>{posToastMessage}</span>
              </div>
            )}

            {/* Top Action Bar (Compact, Clean & Minimalist) */}
            <div className="px-4 py-2.5 bg-gray-900 text-white flex items-center justify-between gap-2 shrink-0 no-print">
              <div className="text-xs font-bold tracking-tight text-gray-200">
                Invoice Preview
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  disabled={isCapturingInvoice}
                  onClick={async () => {
                    setIsCapturingInvoice(true);
                    const res = await copyInvoiceToClipboard('walkin-invoice-preview-doc');
                    setIsCapturingInvoice(false);
                    if (res.success) {
                      showPosToast(res.message || 'Invoice screenshot copied to clipboard!');
                    }
                  }}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  title="Copy screenshot to clipboard for customer confirmation"
                >
                  <Camera className="w-3 h-3" />
                  <span>{isCapturingInvoice ? '...' : 'Copy Screenshot'}</span>
                </button>

                <button
                  type="button"
                  disabled={isCapturingInvoice}
                  onClick={async () => {
                    setIsCapturingInvoice(true);
                    const filename = `Mirage-Invoice-Preview-${Date.now()}.png`;
                    const ok = await saveInvoiceAsImage('walkin-invoice-preview-doc', filename);
                    setIsCapturingInvoice(false);
                    if (ok) {
                      showPosToast('Invoice image downloaded!');
                    }
                  }}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  title="Save invoice as PNG image file"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Save Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const tempOrder = {
                      id: 'draft',
                      order_number: 'DRAFT',
                      invoice_number: `DFT-${Date.now().toString().slice(-5)}`,
                      channel: 'walk-in',
                      customer_name: customerName,
                      customer_phone: customerPhone,
                      items: cart.map((it, idx) => ({
                        id: `item-${idx}`,
                        order_id: 'draft',
                        product_id: it.product.id,
                        product_name: it.product.display_name,
                        sku: it.product.sku,
                        barcode: it.product.barcode || '',
                        quantity: it.quantity,
                        unit_price: it.unitPrice,
                        discount_amount: it.discount,
                        total_price: it.unitPrice * it.quantity - it.discount,
                      })),
                      subtotal,
                      discount_amount: Math.round(orderDiscountAmount),
                      delivery_charge: 0,
                      total: finalTotal,
                      status: 'pending',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    } as unknown as Order;
                    generateInvoicePdf(tempOrder, {
                      business_name: settings?.business_name || 'Mirage Perfumes',
                      business_phone: settings?.phone || '+880 1994 505 935',
                      business_address: settings?.address || 'Dhaka, Bangladesh',
                    });
                  }}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-gray-700"
                >
                  <Download className="w-3 h-3" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-gray-700"
                >
                  <Printer className="w-3 h-3" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-md cursor-pointer ml-0.5"
                  title="Close"
                >
                  <span className="text-base leading-none font-bold">&times;</span>
                </button>
              </div>
            </div>

            {/* Printable Document View (Direct, Compact & Clean, No Huge Blank Margins) */}
            <div className="flex-1 overflow-y-auto bg-white p-5 sm:p-7">
              <div id="walkin-invoice-preview-doc" className="w-full bg-white space-y-5">
                {/* Header Branding */}
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <h1 className="text-2xl font-serif font-black tracking-[0.18em] text-black uppercase leading-tight">
                      MIRAGE
                    </h1>
                    <p className="text-[9px] font-sans tracking-[0.42em] text-gray-700 uppercase pl-0.5">
                      PERFUMES
                    </p>
                  </div>

                  {/* Calligraphic Script Emblem */}
                  <div className="text-right">
                    <div className="font-serif italic font-black text-xl tracking-tighter text-black flex flex-col items-end leading-none">
                      <span className="font-serif text-2xl italic tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
                        Mirage
                      </span>
                      <span className="text-xs font-serif tracking-widest uppercase -mt-0.5 font-bold text-gray-900">
                        Perfumes
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3-Column Metadata Block */}
                <div className="grid grid-cols-3 gap-4 text-[11px] pt-1">
                  {/* FROM */}
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                      FROM
                    </div>
                    <div className="font-bold text-black">{settings?.business_name || 'Mirage Perfumes'}</div>
                    <div className="text-gray-800">{settings?.address || 'Dhaka, Bangladesh'}</div>
                    <div className="text-gray-800">{settings?.phone || '+880 1994 505 935'}</div>
                    <div className="text-gray-800">support@mirageperfumesbd.com</div>
                  </div>

                  {/* BILL TO */}
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                      BILL TO
                    </div>
                    <div className="text-gray-600 font-medium text-[10px]">Client / Customer Name</div>
                    <div className="font-bold text-black">{customerName || 'Walk-in Customer'}</div>
                    {customerPhone && (
                      <div className="text-gray-800 font-mono">{customerPhone}</div>
                    )}
                  </div>

                  {/* DATE & INVOICE */}
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                      DATE
                    </div>
                    <div className="font-medium text-black">
                      {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="text-gray-600 text-[10px] font-mono mt-0.5">
                      Status: <strong className="text-black uppercase">{wholesaleMode ? 'Wholesale Order' : 'Walk-in Order'}</strong>
                    </div>
                  </div>
                </div>

                {/* Itemized Table with Solid Black Header */}
                <div className="pt-1">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-black text-white font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-2.5 text-left">ITEM</th>
                        <th className="py-2 px-2.5 text-center w-14">QTY</th>
                        <th className="py-2 px-2.5 text-right w-24">PRICE</th>
                        <th className="py-2 px-2.5 text-right w-24">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cart.map((it, idx) => {
                        const lineTotal = it.unitPrice * it.quantity - it.discount;
                        return (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-2.5 px-2.5 font-medium text-gray-900">
                              {it.product.display_name}
                            </td>
                            <td className="py-2.5 px-2.5 text-center text-gray-800 font-mono">
                              {it.quantity}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono text-gray-800 whitespace-nowrap">
                              {it.unitPrice.toLocaleString()} BDT
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono font-medium text-gray-900 whitespace-nowrap">
                              {lineTotal.toLocaleString()} BDT
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary Stack (Right Aligned) */}
                <div className="flex justify-end pt-1">
                  <div className="w-56 space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between py-0.5 text-gray-700">
                      <span className="font-sans">Subtotal</span>
                      <span className="font-medium">{subtotal.toLocaleString()} BDT</span>
                    </div>

                    {orderDiscount > 0 && (
                      <div className="flex justify-between py-0.5 text-gray-700">
                        <span className="font-sans">Discount</span>
                        <span className="font-medium">{orderDiscount.toLocaleString()} BDT</span>
                      </div>
                    )}

                    <div className="flex justify-between py-0.5 text-gray-700">
                      <span className="font-sans">Payable</span>
                      <span className="font-medium">{finalTotal.toLocaleString()} BDT</span>
                    </div>

                    <div className="flex justify-between pt-2 pb-0.5 text-[13px] font-bold text-black border-t-2 border-black mt-1">
                      <span className="font-sans font-black">Total Due</span>
                      <span className="font-black font-mono">{finalTotal.toLocaleString()} BDT</span>
                    </div>
                  </div>
                </div>

                {/* Footer / Payment Section (Directly below Total Due, no artificial gap) */}
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <div className="space-y-0.5 text-[10px]">
                    <div className="font-bold uppercase tracking-wider text-gray-600 text-[9px]">
                      PAYMENT
                    </div>
                    <div className="font-medium text-gray-900 capitalize">{paymentMethod}</div>
                  </div>

                  <div className="text-[11px] font-serif italic text-gray-700 pt-0.5">
                    Thank you for choosing Mirage Perfumes.
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Modal Actions: Only Clean Confirm & Place Order Button */}
            <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowInvoiceModal(false);
                  handleCheckout();
                }}
                disabled={isSubmitting || cart.length === 0}
                className="w-full sm:w-auto px-6 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Confirm & Place Order (৳{finalTotal.toLocaleString()})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Completed Sale Print Destination Choice (POS Print vs Invoice Print) */}
      {showPrintChoiceModal && completedOrder && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowPrintChoiceModal(false);
            setCompletedOrder(null);
          }}
          title="Sale Completed Successfully — Select Printer"
          size="sm"
        >
          <div className="space-y-4 p-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-[var(--text)]">Order #{completedOrder.invoice_number} created successfully!</p>
            <p className="text-xs text-[var(--text-secondary)]">Choose how you want to print this order:</p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  // POS Thermal Print
                  window.print();
                  setShowPrintChoiceModal(false);
                  setCompletedOrder(null);
                }}
                className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-xs font-bold flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-5 h-5 text-[var(--accent)]" />
                <span>POS Print (Thermal)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  // Invoice A4 Print via generateInvoicePdf
                  generateInvoicePdf(completedOrder, {
                    business_name: settings?.business_name || 'MIRAGE PERFUME',
                    business_phone: settings?.phone || '+8801999033027',
                    business_address: settings?.address || 'Banani, Dhaka, Bangladesh',
                  });
                  setShowPrintChoiceModal(false);
                  setCompletedOrder(null);
                }}
                className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-xs font-bold flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-5 h-5 text-[var(--accent-secondary)]" />
                <span>Invoice Print (A4)</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPrintChoiceModal(false);
                  setCompletedOrder(null);
                }}
                className="text-xs text-[var(--text-secondary)] hover:underline cursor-pointer"
              >
                Skip Printing (New Sale)
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice Modal for completed order */}
      {completedOrder && !showPrintChoiceModal && (
        <InvoiceModal
          order={completedOrder}
          isOpen={showInvoiceModal}
          onClose={() => {
            setShowInvoiceModal(false);
            setCompletedOrder(null);
          }}
        />
      )}

      {confirmWholesale && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmWholesale(false)}
          title="Enable Wholesale Mode?"
          size="sm"
        >
          <div className="space-y-4 p-2">
            <p className="text-xs text-[var(--text-secondary)]">
              Switching to Wholesale will apply wholesale pricing rules to all items in the order list.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmWholesale(false)}
                className="px-3 py-1.5 rounded border text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaleMode(true);
                  setConfirmWholesale(false);
                }}
                className="px-3 py-1.5 rounded bg-[var(--accent-secondary)] text-white text-xs font-semibold"
              >
                Enable Wholesale
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
