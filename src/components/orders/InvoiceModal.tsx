import React, { useState } from 'react';
import { Printer, X, Download, Sparkles, Camera, Image as ImageIcon, Check } from 'lucide-react';
import { Order } from '../../types';
import { useApp } from '../../context/AppContext';
import { generateInvoicePdf } from '../../lib/invoicePdf';
import { copyInvoiceToClipboard, saveInvoiceAsImage } from '../../lib/invoiceCapture';

interface InvoiceModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, isOpen, onClose }) => {
  const { settings } = useApp();
  const [isCapturing, setIsCapturing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  if (order.order_type === 'merchant_fulfillment') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[var(--border)] space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--text)]">Merchant Dropship Order</h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Per the Dropship Fulfillment workflow, customer invoices are not printed for these orders. Only the external 100×100mm Dropship Parcel Sticker is used.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold rounded-xl cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const businessName = settings?.business_name || 'Mirage Perfumes';
  const businessPhone = settings?.phone || '+880 1994 505 935';
  const businessAddress = settings?.address || 'Dhaka, Bangladesh';
  const businessEmail = 'support@mirageperfumesbd.com';

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

  const subtotal = order.subtotal || order.items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
  const discount = order.discount_amount || 0;
  const deliveryCharge = order.delivery_charge || 0;
  const payable = subtotal - discount + deliveryCharge;
  const advancePaid = order.paid_amount || (order.payments && order.payments.length > 0 ? order.payments.reduce((sum, p) => sum + (p.amount || 0), 0) : (order.status === 'delivered' || order.status === 'dispatched' ? order.total : 0));
  const totalDue = Math.max(0, payable - advancePaid);

  const paymentMethodName = order.payments?.[0]?.method
    ? order.payments[0].method.charAt(0).toUpperCase() + order.payments[0].method.slice(1)
    : order.channel === 'walk-in'
    ? 'Cash'
    : 'Cash on Delivery';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyScreenshot = async () => {
    setIsCapturing(true);
    const res = await copyInvoiceToClipboard('printable-invoice-document');
    setIsCapturing(false);
    if (res.success) {
      showToast(res.message || 'Invoice screenshot copied to clipboard!');
    }
  };

  const handleSaveAsImage = async () => {
    setIsCapturing(true);
    const filename = `Mirage-Invoice-${order.invoice_number || 'Order'}.png`;
    const ok = await saveInvoiceAsImage('printable-invoice-document', filename);
    setIsCapturing(false);
    if (ok) {
      showToast('Invoice image downloaded!');
    }
  };

  const handlePrintPdf = () => {
    generateInvoicePdf(order, {
      business_name: businessName,
      business_phone: businessPhone,
      business_address: businessAddress,
    });
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Modal Card */}
      <div className="bg-white text-black rounded-2xl shadow-2xl max-w-2xl w-full my-4 overflow-hidden border border-gray-200 flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150 relative">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
            <Check className="w-3.5 h-3.5" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Action Bar (Compact, Clean & Minimalist) */}
        <div className="px-4 py-2.5 bg-gray-900 text-white flex items-center justify-between gap-2 shrink-0 no-print">
          <div className="text-xs font-bold tracking-tight text-gray-200">
            Invoice #{order.invoice_number}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              disabled={isCapturing}
              onClick={handleCopyScreenshot}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              title="Copy screenshot to clipboard for customer confirmation"
            >
              <Camera className="w-3 h-3" />
              <span>{isCapturing ? '...' : 'Copy Screenshot'}</span>
            </button>

            <button
              type="button"
              disabled={isCapturing}
              onClick={handleSaveAsImage}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              title="Save invoice as PNG image file"
            >
              <ImageIcon className="w-3 h-3" />
              <span>Save Image</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-gray-700"
            >
              <Download className="w-3 h-3" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-gray-700"
            >
              <Printer className="w-3 h-3" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-md cursor-pointer ml-0.5"
              title="Close"
            >
              <span className="text-base leading-none font-bold">&times;</span>
            </button>
          </div>
        </div>

        {/* Printable Document View (Matching exactly the attached template) */}
        <div className="flex-1 overflow-y-auto bg-white p-5 sm:p-7">
          <div id="printable-invoice-document" className="w-full bg-white space-y-5">
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
                <div className="font-bold text-black">{businessName}</div>
                <div className="text-gray-800">{businessAddress}</div>
                <div className="text-gray-800">{businessPhone}</div>
                <div className="text-gray-800">{businessEmail}</div>
              </div>

              {/* BILL TO */}
              <div className="space-y-0.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                  BILL TO
                </div>
                <div className="text-gray-600 font-medium text-[10px]">Client / Customer Name</div>
                <div className="font-bold text-black">{order.customer_name || 'Walk-in Customer'}</div>
                {order.delivery_address_text && (
                  <div className="text-gray-800 leading-snug">{order.delivery_address_text}</div>
                )}
                {order.customer_phone && (
                  <div className="text-gray-800 font-mono">{order.customer_phone}</div>
                )}
              </div>

              {/* DATE & INVOICE */}
              <div className="space-y-0.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
                  DATE
                </div>
                <div className="font-medium text-black">{orderDate}</div>
                <div className="text-gray-600 text-[10px] font-mono mt-0.5">
                  Invoice: <strong className="text-black">{order.invoice_number}</strong>
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
                  {order.items.map((item, idx) => {
                    const lineTotal = (item.unit_price - (item.discount_amount || 0)) * item.quantity;
                    return (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2.5 px-2.5 font-medium text-gray-900">
                          {item.product_name}
                        </td>
                        <td className="py-2.5 px-2.5 text-center text-gray-800 font-mono">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-gray-800 whitespace-nowrap">
                          {item.unit_price.toLocaleString()} BDT
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

                {discount > 0 && (
                  <div className="flex justify-between py-0.5 text-gray-700">
                    <span className="font-sans">Discount</span>
                    <span className="font-medium">{discount.toLocaleString()} BDT</span>
                  </div>
                )}

                {deliveryCharge > 0 && (
                  <div className="flex justify-between py-0.5 text-gray-700">
                    <span className="font-sans">Delivery</span>
                    <span className="font-medium">{deliveryCharge.toLocaleString()} BDT</span>
                  </div>
                )}

                <div className="flex justify-between py-0.5 text-gray-700">
                  <span className="font-sans">Payable</span>
                  <span className="font-medium">{payable.toLocaleString()} BDT</span>
                </div>

                {advancePaid > 0 && (
                  <div className="flex justify-between py-0.5 text-gray-700">
                    <span className="font-sans">Advance</span>
                    <span className="font-medium">{advancePaid.toLocaleString()} BDT</span>
                  </div>
                )}

                <div className="flex justify-between pt-2 pb-0.5 text-[13px] font-bold text-black border-t-2 border-black mt-1">
                  <span className="font-sans font-black">Total Due</span>
                  <span className="font-black font-mono">{totalDue.toLocaleString()} BDT</span>
                </div>
              </div>
            </div>

            {/* Footer / Payment Section (Directly below Total Due, no artificial gap) */}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="space-y-0.5 text-[10px]">
                <div className="font-bold uppercase tracking-wider text-gray-600 text-[9px]">
                  PAYMENT
                </div>
                <div className="font-medium text-gray-900">{paymentMethodName}</div>
              </div>

              {order.invoice_note && (
                <div className="text-[11px] text-gray-700 bg-gray-50 p-2 rounded border border-gray-200">
                  {order.invoice_note}
                </div>
              )}

              <div className="text-[11px] font-serif italic text-gray-700 pt-0.5">
                Thank you for choosing Mirage Perfumes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
