import { jsPDF } from 'jspdf';
import { Order } from '../types';

interface InvoicePdfOptions {
  business_name?: string;
  business_phone?: string;
  business_address?: string;
}

export function generateInvoicePdf(
  order: Order,
  opts?: InvoicePdfOptions,
  fileName = `Invoice-${order.invoice_number}.pdf`
): void {
  if (order.order_type === 'merchant_fulfillment') {
    alert('Customer invoices are not generated for Dropship Fulfillment orders. Please print the 100x100mm Dropship Sticker.');
    return;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;

  const businessName = 'Mirage Perfumes';
  const businessAddress = 'Dhaka, Bangladesh';
  const businessPhone = '+880 1994 505 935';
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

  let y = margin;

  // Header: Brand Name Left
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text('MIRAGE', margin, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('P E R F U M E S', margin + 0.5, y + 10.5);

  // Header: Right script cursive logo
  doc.setFont('times', 'italic');
  doc.setFontSize(22);
  doc.text('Mirage', pageW - margin, y + 5.5, { align: 'right' });
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('PERFUMES', pageW - margin, y + 9.5, { align: 'right' });

  // 3-Column Metadata Section
  y = margin + 26;

  // Column 1: FROM
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('FROM', margin, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(businessName, margin, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(businessAddress, margin, y + 8.5);
  doc.text(businessPhone, margin, y + 12.5);
  doc.text(businessEmail, margin, y + 16.5);

  // Column 2: BILL TO
  const col2X = margin + 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('BILL TO', col2X, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Client / Customer Name', col2X, y + 4.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(order.customer_name || 'Walk-in Customer', col2X, y + 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (order.delivery_address_text) {
    const splitAddr = doc.splitTextToSize(order.delivery_address_text, 65);
    doc.text(splitAddr, col2X, y + 12.5);
  } else if (order.customer_phone) {
    doc.text(order.customer_phone, col2X, y + 12.5);
  }

  // Column 3: DATE
  const col3X = pageW - margin - 45;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('DATE', col3X, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(orderDate, col3X, y + 4.5);

  // Itemized Table with Solid Black Header
  y += 28;
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, y, contentW, 6.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ITEM', margin + 3, y + 4.5);
  doc.text('QTY', margin + contentW - 68, y + 4.5, { align: 'center' });
  doc.text('PRICE', margin + contentW - 36, y + 4.5, { align: 'right' });
  doc.text('TOTAL', margin + contentW - 3, y + 4.5, { align: 'right' });

  // Rows
  let rowY = y + 7.5;
  doc.setTextColor(0, 0, 0);

  order.items.forEach((item) => {
    const lineTotal = (item.unit_price - (item.discount_amount || 0)) * item.quantity;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(item.product_name), margin + 3, rowY + 4);
    doc.text(String(item.quantity), margin + contentW - 68, rowY + 4, { align: 'center' });
    doc.text(`${item.unit_price.toLocaleString()} BDT`, margin + contentW - 36, rowY + 4, { align: 'right' });
    doc.text(`${lineTotal.toLocaleString()} BDT`, margin + contentW - 3, rowY + 4, { align: 'right' });

    rowY += 6.5;
  });

  // Summary Stack Right
  rowY += 6;
  const summaryLabelX = pageW - margin - 50;
  const summaryValueX = pageW - margin - 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Subtotal', summaryLabelX, rowY);
  doc.setTextColor(0, 0, 0);
  doc.text(`${subtotal.toLocaleString()} BDT`, summaryValueX, rowY, { align: 'right' });
  rowY += 5;

  if (discount > 0) {
    doc.setTextColor(90, 90, 90);
    doc.text('Discount', summaryLabelX, rowY);
    doc.setTextColor(0, 0, 0);
    doc.text(`${discount.toLocaleString()} BDT`, summaryValueX, rowY, { align: 'right' });
    rowY += 5;
  }

  if (deliveryCharge > 0) {
    doc.setTextColor(90, 90, 90);
    doc.text('Delivery', summaryLabelX, rowY);
    doc.setTextColor(0, 0, 0);
    doc.text(`${deliveryCharge.toLocaleString()} BDT`, summaryValueX, rowY, { align: 'right' });
    rowY += 5;
  }

  doc.setTextColor(90, 90, 90);
  doc.text('Payable', summaryLabelX, rowY);
  doc.setTextColor(0, 0, 0);
  doc.text(`${payable.toLocaleString()} BDT`, summaryValueX, rowY, { align: 'right' });
  rowY += 5;

  if (advancePaid > 0) {
    doc.setTextColor(90, 90, 90);
    doc.text('Advance', summaryLabelX, rowY);
    doc.setTextColor(0, 0, 0);
    doc.text(`${advancePaid.toLocaleString()} BDT`, summaryValueX, rowY, { align: 'right' });
    rowY += 5;
  }

  rowY += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Total Due', summaryLabelX, rowY + 1);
  doc.text(`${totalDue.toLocaleString()} BDT`, summaryValueX, rowY + 1, { align: 'right' });

  // Footer: Payment Method and Thank You Note
  const footerY = Math.max(rowY + 22, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('PAYMENT', margin, footerY);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(paymentMethodName, margin, footerY + 4.5);

  if (order.invoice_note) {
    doc.setFontSize(7.5);
    const splitNote = doc.splitTextToSize(order.invoice_note, contentW);
    doc.text(splitNote, margin, footerY + 11);
  }

  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Thank you for choosing Mirage Perfumes.', margin, 282);

  doc.save(fileName);
}
