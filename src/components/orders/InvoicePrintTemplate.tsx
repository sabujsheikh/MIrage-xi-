import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Download, Printer, X, Check } from 'lucide-react';
import { Order } from '../../types';
import { useApp } from '../../context/AppContext';
import { generateInvoicePdf } from '../../lib/invoicePdf';
import { copyInvoiceToClipboard, saveInvoiceAsImage } from '../../lib/invoiceCapture';

interface InvoicePrintTemplateProps {
  order: Order;
  onClose?: () => void;
}

export const InvoicePrintTemplate: React.FC<InvoicePrintTemplateProps> = ({ order, onClose }) => {
  const { settings } = useApp();
  const [isCapturing, setIsCapturing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const businessName = settings?.business_name || 'Mirage Perfumes';
  const businessPhone = settings?.phone || '+880 1994 505 935';
  const businessAddress = settings?.address || 'Dhaka, Bangladesh';
  const businessEmail = 'support@mirageperfumesbd.com';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyScreenshot = async () => {
    setIsCapturing(true);
    const res = await copyInvoiceToClipboard('print-template-doc');
    setIsCapturing(false);
    if (res.success) {
      showToast(res.message || 'Invoice screenshot copied to clipboard!');
    }
  };

  const handleSaveAsImage = async () => {
    setIsCapturing(true);
    const filename = `Mirage-Invoice-${order.invoice_number || 'Order'}.png`;
    const ok = await saveInvoiceAsImage('print-template-doc', filename);
    setIsCapturing(false);
    if (ok) {
      showToast('Invoice image downloaded!');
    }
  };

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

  return (
    <div className="space-y-4">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 no-print">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Bar (No-Print) */}
      <div className="p-3 bg-gray-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="text-xs font-bold">
          Invoice #{order.invoice_number}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={isCapturing}
            onClick={handleCopyScreenshot}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="Copy screenshot to clipboard"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isCapturing ? 'Capturing...' : 'Copy Screenshot'}</span>
          </button>
          <button
            type="button"
            disabled={isCapturing}
            onClick={handleSaveAsImage}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="Save invoice as PNG image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Save Image</span>
          </button>
          <button
            type="button"
            onClick={() => generateInvoicePdf(order, { business_name: businessName, business_phone: businessPhone, business_address: businessAddress })}
            className="px-2.5 py-1 bg-white text-black hover:bg-gray-100 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div id="print-template-doc" className="bg-white text-black p-10 max-w-3xl mx-auto font-sans print:p-0 print:max-w-none print:shadow-none min-h-[900px] flex flex-col justify-between border border-gray-200 rounded-xl shadow-xs">
      <div className="space-y-8">
        {/* Top Header: Brand Name + Calligraphic Emblem */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <h1 className="text-3xl font-serif font-black tracking-[0.18em] text-black uppercase leading-tight">
              MIRAGE
            </h1>
            <p className="text-[10px] font-sans tracking-[0.42em] text-gray-700 uppercase pl-0.5">
              PERFUMES
            </p>
          </div>

          {/* Script Calligraphy Logo Emblem */}
          <div className="text-right">
            <div className="font-serif italic font-black text-2xl tracking-tighter text-black flex flex-col items-end leading-none">
              <span className="font-serif text-3xl italic tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
                Mirage
              </span>
              <span className="text-sm font-serif tracking-widest uppercase -mt-1 font-bold text-gray-900">
                Perfumes
              </span>
            </div>
          </div>
        </div>

        {/* 3-Column Metadata Block */}
        <div className="grid grid-cols-3 gap-6 text-[12px] pt-4">
          {/* FROM */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              FROM
            </div>
            <div className="font-bold text-black">{businessName}</div>
            <div className="text-gray-800">{businessAddress}</div>
            <div className="text-gray-800">{businessPhone}</div>
            <div className="text-gray-800">{businessEmail}</div>
          </div>

          {/* BILL TO */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              BILL TO
            </div>
            <div className="text-gray-600 font-medium">Client / Customer Name</div>
            <div className="font-bold text-black">{order.customer_name || 'Walk-in Customer'}</div>
            {order.delivery_address_text && (
              <div className="text-gray-800 leading-snug">{order.delivery_address_text}</div>
            )}
            {order.customer_phone && (
              <div className="text-gray-800 font-mono">{order.customer_phone}</div>
            )}
          </div>

          {/* DATE & INVOICE */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              DATE
            </div>
            <div className="font-medium text-black">{orderDate}</div>
            <div className="text-gray-600 text-[11px] font-mono mt-1">
              Invoice: <strong className="text-black">{order.invoice_number}</strong>
            </div>
          </div>
        </div>

        {/* Itemized Table with Solid Black Header */}
        <div className="pt-2">
          <table className="w-full text-left text-[12px] border-collapse">
            <thead>
              <tr className="bg-black text-white font-bold uppercase text-[11px] tracking-wider">
                <th className="py-2 px-3 text-left">ITEM</th>
                <th className="py-2 px-3 text-center w-16">QTY</th>
                <th className="py-2 px-3 text-right w-28">PRICE</th>
                <th className="py-2 px-3 text-right w-28">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((item, idx) => {
                const lineTotal = (item.unit_price - (item.discount_amount || 0)) * item.quantity;
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 px-3 font-medium text-gray-900">
                      {item.product_name}
                    </td>
                    <td className="py-3 px-3 text-center text-gray-800 font-mono">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gray-800 whitespace-nowrap">
                      {item.unit_price.toLocaleString()} BDT
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-gray-900 whitespace-nowrap">
                      {lineTotal.toLocaleString()} BDT
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Stack (Right Aligned) */}
        <div className="flex justify-end pt-4">
          <div className="w-64 space-y-1.5 text-[12px] font-mono">
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

            <div className="flex justify-between pt-3 pb-1 text-base font-bold text-black border-t-2 border-black mt-2">
              <span className="font-sans font-black">Total Due</span>
              <span className="font-black font-mono">{totalDue.toLocaleString()} BDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="pt-12 space-y-4">
        <div className="space-y-1 text-[11px]">
          <div className="font-bold uppercase tracking-wider text-gray-600 text-[10px]">
            PAYMENT
          </div>
          <div className="font-medium text-gray-900">{paymentMethodName}</div>
        </div>

        {order.invoice_note && (
          <div className="text-[11px] text-gray-700 bg-gray-50 p-2.5 rounded border border-gray-200">
            {order.invoice_note}
          </div>
        )}

        <div className="text-[12px] font-serif italic text-gray-700 pt-2">
          Thank you for choosing Mirage Perfumes.
        </div>
      </div>
    </div>
    </div>
  );
};
