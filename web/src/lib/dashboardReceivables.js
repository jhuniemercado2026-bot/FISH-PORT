const cents = (value) => Math.round(Number(value || 0) * 100);
const dateParts = (value) => {
  const [year, month] = String(value || "").slice(0, 10).split("-").map(Number);
  return { year, month };
};

// The bill, its saved penalties, and all its payments share the bill's fiscal
// year. Actual payment and assessment dates remain unchanged in their ledgers.
export const getBilledReceivables = ({ bills = [], payments = [] }, selectedYear) => {
  const year = Number(selectedYear);
  const monthlyCents = Array(12).fill(0);
  const paidByBill = new Map();
  payments.forEach((payment) => {
    const key = String(payment.bill_id);
    paidByBill.set(key, (paidByBill.get(key) || 0) + cents(payment.amount_paid));
  });
  const addOutstanding = (value, amount) => {
    const parts = dateParts(value);
    if (parts.year === year && parts.month >= 1 && parts.month <= 12) {
      monthlyCents[parts.month - 1] += Math.max(0, amount);
    }
  };
  bills.forEach((bill) => {
    const key = String(bill.bill_id);
    const paid = paidByBill.get(key) || 0;
    addOutstanding(bill.created_at || bill.billing_date, cents(bill.total_amount) - paid);
  });
  return { monthly: monthlyCents.map((amount) => amount / 100), total: monthlyCents.reduce((sum, amount) => sum + amount, 0) / 100 };
};
