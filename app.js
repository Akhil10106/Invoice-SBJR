const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#itemsTable tbody');
  const invoiceNoInput = document.getElementById('invoiceNo');
  const invoiceDateInput = document.getElementById('invoiceDate');

  // Generate next invoice number
  function generateInvoiceNo() {
    let last = localStorage.getItem('sbjr_last_invoice') || 0;
    last = parseInt(last) + 1;
    localStorage.setItem('sbjr_last_invoice', last);
    return `SBJR-${String(last).padStart(4, '0')}`;
  }

  // Initialize
  invoiceNoInput.value = generateInvoiceNo();
  invoiceDateInput.value = new Date().toISOString().split('T')[0];

  // Add new row
  function addRow(data = {}) {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td><input type="text" class="item-name" value="${data.name || ''}" placeholder="Item name"></td>
      <td><input type="number" class="qty text-end" value="${data.qty || 1}" min="1"></td>
      <td><input type="number" class="price text-end" value="${data.price || 0}" step="0.01"></td>
      <td><input type="number" class="discount text-end" value="${data.discount || 0}" min="0" max="100" step="0.01"> %</td>
      <td class="taxable text-end fw-bold">0.00</td>
      <td>
        <select class="tax-type form-select form-select-sm">
          <option value="intra" ${data.taxType==='intra'?'selected':''}>CGST+SGST</option>
          <option value="inter" ${data.taxType==='inter'?'selected':''}>IGST</option>
          <option value="none" ${data.taxType==='none'?'selected':''}>No Tax</option>
        </select>
      </td>
      <td class="tax-amount text-end">0.00</td>
      <td class="line-total text-end fw-bold">0.00</td>
      <td><button class="btn btn-danger btn-sm remove-row"><i class="fas fa-trash"></i></button></td>
    `;

    tbody.appendChild(row);
    attachRowListeners(row);
    calculateTotals();
  }

  function attachRowListeners(row) {
    row.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', calculateTotals);
      el.addEventListener('change', calculateTotals);
    });
    row.querySelector('.remove-row').addEventListener('click', () => {
      row.remove();
      calculateTotals();
    });
  }

  function calculateTotals() {
    let subtotal = 0;
    let totalCGST = 0, totalSGST = 0, totalIGST = 0;

    document.querySelectorAll('#itemsTable tbody tr').forEach(row => {
      const qty = parseFloat(row.querySelector('.qty').value) || 0;
      const price = parseFloat(row.querySelector('.price').value) || 0;
      const discount = parseFloat(row.querySelector('.discount').value) || 0;
      const taxType = row.querySelector('.tax-type').value;

      const taxable = qty * price * (1 - discount / 100);
      const taxRate = taxType === 'none' ? 0 : 18; // 18% GST default

      let tax = 0;
      if (taxType === 'intra') {
        tax = taxable * 0.09; // 9% CGST + 9% SGST
        totalCGST += tax;
        totalSGST += tax;
      } else if (taxType === 'inter') {
        tax = taxable * 0.18;
        totalIGST += tax;
      }

      const lineTotal = taxable + tax;

      row.querySelector('.taxable').textContent = taxable.toFixed(2);
      row.querySelector('.tax-amount').textContent = tax.toFixed(2);
      row.querySelector('.line-total').textContent = lineTotal.toFixed(2);

      subtotal += taxable;
    });

    const totalTax = totalCGST + totalSGST + totalIGST;
    const preRound = subtotal + totalTax;
    const rounding = Math.round(preRound) - preRound;
    const grandTotal = preRound + rounding;

    document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('cgst').textContent = `₹${totalCGST.toFixed(2)}`;
    document.getElementById('sgst').textContent = `₹${totalSGST.toFixed(2)}`;
    document.getElementById('igst').textContent = `₹${totalIGST.toFixed(2)}`;
    document.getElementById('rounding').textContent = `₹${rounding.toFixed(2)}`;
    document.getElementById('grandTotal').textContent = `₹${grandTotal.toFixed(2)}`;
  }

  // Buttons
  document.getElementById('addRow').addEventListener('click', () => addRow());
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  document.getElementById('saveInvoice').addEventListener('click', () => {
    const data = {
      invoiceNo: invoiceNoInput.value,
      date: invoiceDateInput.value,
      client: document.getElementById('clientDetails').value,
      items: [],
      savedAt: new Date().toISOString()
    };

    document.querySelectorAll('#itemsTable tbody tr').forEach(row => {
      data.items.push({
        name: row.querySelector('.item-name').value,
        qty: row.querySelector('.qty').value,
        price: row.querySelector('.price').value,
        discount: row.querySelector('.discount').value,
        taxType: row.querySelector('.tax-type').value
      });
    });

    localStorage.setItem('sbjr_current_invoice', JSON.stringify(data));
    alert('Invoice saved to browser!');
  });

  document.getElementById('loadInvoice').addEventListener('click', () => {
    const saved = localStorage.getItem('sbjr_current_invoice');
    if (!saved) return alert('No saved invoice found.');

    if (confirm('Load last saved invoice? This will replace current data.')) {
      const data = JSON.parse(saved);
      invoiceNoInput.value = data.invoiceNo;
      invoiceDateInput.value = data.date;
      document.getElementById('clientDetails').value = data.client || '';

      tbody.innerHTML = '';
      data.items.forEach(item => addRow(item));
    }
  });

  document.getElementById('newInvoice').addEventListener('click', () => {
    if (confirm('Start a new invoice? Current data will be lost.')) {
      invoiceNoInput.value = generateInvoiceNo();
      invoiceDateInput.value = new Date().toISOString().split('T')[0];
      document.getElementById('clientDetails').value = '';
      tbody.innerHTML = '';
      addRow();
    }
  });

  // PDF Export
  document.getElementById('printBtn').addEventListener('dblclick', async () => {
    if (!confirm('Generate PDF instead of print?')) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const content = document.getElementById('invoice');
    await html2canvas(content, { scale: 2 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 10;
      doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + 10;
        doc.addPage();
        doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      doc.save(`${invoiceNoInput.value}.pdf`);
    });
  });

  // Initialize with one row
  addRow();
});
