import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WalletTransaction, WithdrawalRequest, Wallet } from '@/types/wallet';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const exportTransactionsToCSV = (
  transactions: WalletTransaction[],
  wallet: Wallet | null,
  filename?: string
) => {
  const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Balance Before', 'Balance After', 'Reference'];
  
  const rows = transactions.map(t => [
    format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
    t.type,
    t.description || '-',
    t.amount.toFixed(2),
    t.currency,
    t.balanceBefore?.toFixed(2) || '-',
    t.balanceAfter?.toFixed(2) || '-',
    t.id.substring(0, 8)
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `wallet_transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportTransactionsToPDF = (
  transactions: WalletTransaction[],
  wallet: Wallet | null,
  currency: string,
  filename?: string
) => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246);
  doc.text('PACT Wallet Statement', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 14, 28);
  
  if (wallet) {
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Current Balance: ${formatCurrency(wallet.balances[currency] || 0, currency)}`, 14, 38);
    doc.text(`Total Earned: ${formatCurrency(wallet.totalEarned, currency)}`, 14, 45);
    doc.text(`Total Withdrawn: ${formatCurrency(wallet.totalWithdrawn, currency)}`, 14, 52);
  }

  const tableData = transactions.map(t => [
    format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
    t.type,
    t.description || '-',
    formatCurrency(t.amount, t.currency),
    t.balanceBefore ? formatCurrency(t.balanceBefore, t.currency) : '-',
    t.balanceAfter ? formatCurrency(t.balanceAfter, t.currency) : '-',
  ]);

  autoTable(doc, {
    startY: wallet ? 60 : 35,
    head: [['Date', 'Type', 'Description', 'Amount', 'Before', 'After']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 25 },
      2: { cellWidth: 45 },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
    },
  });

  doc.save(filename || `wallet_statement_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const exportWithdrawalsToCSV = (
  withdrawals: WithdrawalRequest[],
  statusFilter?: string,
  filename?: string
) => {
  const headers = ['Date', 'Amount', 'Currency', 'Status', 'Reason', 'Method', 'Requested At', 'Approved At', 'Supervisor Notes'];
  
  const rows = withdrawals.map(w => [
    format(new Date(w.createdAt), 'yyyy-MM-dd HH:mm'),
    w.amount.toFixed(2),
    w.currency,
    w.status.toUpperCase(),
    w.requestReason || '-',
    w.paymentMethod || '-',
    format(new Date(w.createdAt), 'yyyy-MM-dd HH:mm'),
    w.approvedAt ? format(new Date(w.approvedAt), 'yyyy-MM-dd HH:mm') : '-',
    w.supervisorNotes || '-'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  const statusSuffix = statusFilter ? `_${statusFilter}` : '';
  link.setAttribute('download', filename || `withdrawals${statusSuffix}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportWithdrawalsToPDF = (
  withdrawals: WithdrawalRequest[],
  statusFilter?: string,
  filename?: string
) => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.setTextColor(168, 85, 247);
  doc.text('PACT Withdrawal History', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 14, 28);
  
  if (statusFilter) {
    doc.text(`Filter: ${statusFilter.toUpperCase()}`, 14, 34);
  }

  const tableData = withdrawals.map(w => [
    format(new Date(w.createdAt), 'yyyy-MM-dd'),
    formatCurrency(w.amount, w.currency),
    w.status.toUpperCase(),
    w.requestReason || '-',
    w.paymentMethod || '-',
    w.approvedAt ? format(new Date(w.approvedAt), 'yyyy-MM-dd') : '-',
  ]);

  autoTable(doc, {
    startY: statusFilter ? 40 : 35,
    head: [['Date', 'Amount', 'Status', 'Reason', 'Method', 'Approved']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [168, 85, 247], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 25 },
      3: { cellWidth: 45 },
      4: { cellWidth: 30 },
      5: { cellWidth: 28 },
    },
  });

  const statusSuffix = statusFilter ? `_${statusFilter}` : '';
  doc.save(filename || `withdrawals${statusSuffix}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};
