// Global variables
let currentInvoices = [];
let currentCompanies = [];
let currentReceipts = [];
let editingInvoiceId = null;
let editingCompanyId = null;

// Load data on page load
window.addEventListener('load', async () => {
    showLoading();
    await loadCompanies();
    await loadInvoices();
    await loadReceipts();
    updateDashboardStats();
    checkAlerts();
    hideLoading();
});

// =========================
// DATA LOADING FUNCTIONS
// =========================

async function loadCompanies() {
    try {
        const { data, error } = await supabase
            .from(TABLES.COMPANIES)
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        currentCompanies = data || [];
        displayCompanies();
        populateCompanyDropdown();
    } catch (error) {
        console.error('Error loading companies:', error);
        showNotification('خطأ في تحميل بيانات الشركات', 'error');
    }
}

async function loadInvoices() {
    try {
        const { data, error } = await supabase
            .from(TABLES.INVOICES)
            .select(`
                *,
                company:companies(name)
            `)
            .order('date', { ascending: false });

        if (error) throw error;

        currentInvoices = data || [];
        displayInvoices();
    } catch (error) {
        console.error('Error loading invoices:', error);
        showNotification('خطأ في تحميل بيانات الفواتير', 'error');
    }
}

async function loadReceipts() {
    try {
        const { data, error } = await supabase
            .from(TABLES.RECEIPTS)
            .select('*');

        if (error) throw error;

        currentReceipts = data || [];
    } catch (error) {
        console.error('Error loading receipts:', error);
        showNotification('خطأ في تحميل بيانات الإيصالات', 'error');
    }
}

// =========================
// DISPLAY FUNCTIONS
// =========================

function displayInvoices() {
    const tbody = document.getElementById('invoicesTableBody');
    
    if (currentInvoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">لا توجد فواتير مسجلة</td></tr>';
        return;
    }

    tbody.innerHTML = currentInvoices.map(invoice => {
        const status = getInvoiceStatus(invoice);
        const daysRemaining = getDaysRemaining(invoice.date);
        const hasReceipt = currentReceipts.some(r => r.invoice_id === invoice.id);
        
        return `
            <tr>
                <td>${invoice.number}</td>
                <td>${formatDate(invoice.date)}</td>
                <td>${invoice.company?.name || 'غير محدد'}</td>
                <td>${formatCurrency(invoice.amount)}</td>
                <td>${formatCurrency(invoice.tax_amount)}</td>
                <td><span class="status-badge status-${status}">${getStatusText(status)}</span></td>
                <td class="days-counter ${getDaysClass(daysRemaining, status)}">${getDaysText(daysRemaining, status)}</td>
                <td>
                    ${hasReceipt ? 
                        '<button class="btn-info" onclick="viewReceipt(' + invoice.id + ')">عرض</button>' :
                        '<button class="btn-warning" onclick="openReceiptModal(' + invoice.id + ')">رفع</button>'
                    }
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-info" onclick="editInvoice(${invoice.id})">تعديل</button>
                        <button class="btn-danger" onclick="deleteInvoice(${invoice.id})">حذف</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function displayCompanies() {
    const tbody = document.getElementById('companiesTableBody');

    if (currentCompanies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">لا توجد شركات مسجلة</td></tr>';
        return;
    }

    // حساب إحصائيات كل شركة
    const rows = currentCompanies.map(company => {
        const companyInvoices  = currentInvoices.filter(inv => inv.company_id === company.id);
        const receivedInvoices = companyInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.RECEIVED);
        const pendingInvoices  = companyInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.PENDING);
        const overdueInvoices  = companyInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.OVERDUE);

        const totalTax   = companyInvoices.reduce((s, i) => s + i.tax_amount, 0);
        const pendingTax = [...pendingInvoices, ...overdueInvoices].reduce((s, i) => s + i.tax_amount, 0);

        return {
            company,
            total:    companyInvoices.length,
            received: receivedInvoices.length,
            pending:  pendingInvoices.length,
            overdue:  overdueInvoices.length,
            totalTax,
            pendingTax
        };
    });

    // فلتر حسب لوحة المتابعة
    const filter = typeof companyDashboardFilter !== 'undefined' ? companyDashboardFilter : 'all';
    const filtered = rows.filter(r => {
        if (filter === 'pending')  return r.pending > 0 || r.overdue > 0;
        if (filter === 'overdue')  return r.overdue > 0;
        if (filter === 'clean')    return r.pending === 0 && r.overdue === 0 && r.total > 0;
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">لا توجد نتائج</td></tr>';
        return;
    }

    // ترتيب: متأخرة أولاً، ثم معلقة، ثم منتهية
    filtered.sort((a, b) => {
        const scoreA = a.overdue * 2 + a.pending;
        const scoreB = b.overdue * 2 + b.pending;
        return scoreB - scoreA;
    });

    tbody.innerHTML = filtered.map(({ company, total, received, pending, overdue, totalTax, pendingTax }) => {
        // لون الصف
        const rowClass = overdue > 0 ? 'row-overdue' : pending > 0 ? 'row-pending' : 'row-clean';

        // بادج العدد المعلق
        const pendingBadge = (pending + overdue) > 0
            ? `<span class="pending-badge">${pending + overdue}</span>`
            : '';

        return `
            <tr class="${rowClass}">
                <td><strong>${company.name}</strong></td>
                <td>${company.tax_id || '-'}</td>
                <td>${company.phone || '-'}</td>
                <td style="text-align:center">${total}</td>
                <td style="text-align:center;color:#2ed573;font-weight:bold">${received}</td>
                <td style="text-align:center;color:#ffa801;font-weight:bold">${pending}</td>
                <td style="text-align:center;color:#ff4757;font-weight:bold">${overdue}</td>
                <td>${formatCurrency(totalTax)}</td>
                <td style="font-weight:bold;color:${pendingTax > 0 ? '#ff4757' : '#2ed573'}">${formatCurrency(pendingTax)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-primary" style="padding:6px 10px;font-size:0.85rem" onclick="openCompanyReport(${company.id})">${pendingBadge}📋 تقرير</button>
                        <button class="btn-info" onclick="editCompany(${company.id})">تعديل</button>
                        <button class="btn-danger" onclick="deleteCompany(${company.id})">حذف</button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function updateDashboardStats() {
    const total = currentInvoices.length;
    const received = currentInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.RECEIVED).length;
    const pending = currentInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.PENDING).length;
    const overdue = currentInvoices.filter(inv => getInvoiceStatus(inv) === STATUS.OVERDUE).length;

    document.getElementById('totalInvoices').textContent = total;
    document.getElementById('receivedCount').textContent = received;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('overdueCount').textContent = overdue;
}

// =========================
// INVOICE FUNCTIONS
// =========================

function openInvoiceModal() {
    editingInvoiceId = null;
    document.getElementById('invoiceModalTitle').textContent = 'فاتورة جديدة';
    document.getElementById('invoiceForm').reset();
    document.getElementById('invoiceId').value = '';
    document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceModal').classList.add('active');
}

function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('active');
    editingInvoiceId = null;
}

function calculateTaxAmount() {
    const amount = parseFloat(document.getElementById('invoiceAmount').value) || 0;
    const taxAmount = amount * 0.01;
    document.getElementById('taxAmount').value = taxAmount.toFixed(2);
}

async function saveInvoice(event) {
    event.preventDefault();
    showLoading();

    const invoiceData = {
        number: document.getElementById('invoiceNumber').value,
        date: document.getElementById('invoiceDate').value,
        company_id: parseInt(document.getElementById('invoiceCompany').value),
        amount: parseFloat(document.getElementById('invoiceAmount').value),
        tax_amount: parseFloat(document.getElementById('taxAmount').value),
        notes: document.getElementById('invoiceNotes').value || null
    };

    try {
        let result;
        if (editingInvoiceId) {
            result = await supabase
                .from(TABLES.INVOICES)
                .update(invoiceData)
                .eq('id', editingInvoiceId);
        } else {
            result = await supabase
                .from(TABLES.INVOICES)
                .insert([invoiceData]);
        }

        if (result.error) throw result.error;

        showNotification(editingInvoiceId ? 'تم تحديث الفاتورة بنجاح' : 'تم إضافة الفاتورة بنجاح', 'success');
        closeInvoiceModal();
        await loadInvoices();
        updateDashboardStats();
        checkAlerts();
    } catch (error) {
        console.error('Error saving invoice:', error);
        showNotification('خطأ في حفظ الفاتورة', 'error');
    } finally {
        hideLoading();
    }
}

async function editInvoice(id) {
    const invoice = currentInvoices.find(inv => inv.id === id);
    if (!invoice) return;

    editingInvoiceId = id;
    document.getElementById('invoiceModalTitle').textContent = 'تعديل الفاتورة';
    document.getElementById('invoiceId').value = id;
    document.getElementById('invoiceNumber').value = invoice.number;
    document.getElementById('invoiceDate').value = invoice.date;
    document.getElementById('invoiceCompany').value = invoice.company_id;
    document.getElementById('invoiceAmount').value = invoice.amount;
    document.getElementById('taxAmount').value = invoice.tax_amount;
    document.getElementById('invoiceNotes').value = invoice.notes || '';
    document.getElementById('invoiceModal').classList.add('active');
}

async function deleteInvoice(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;

    showLoading();
    try {
        // Delete related receipts first
        await supabase
            .from(TABLES.RECEIPTS)
            .delete()
            .eq('invoice_id', id);

        // Delete invoice
        const { error } = await supabase
            .from(TABLES.INVOICES)
            .delete()
            .eq('id', id);

        if (error) throw error;

        showNotification('تم حذف الفاتورة بنجاح', 'success');
        await loadInvoices();
        await loadReceipts();
        updateDashboardStats();
        checkAlerts();
    } catch (error) {
        console.error('Error deleting invoice:', error);
        showNotification('خطأ في حذف الفاتورة', 'error');
    } finally {
        hideLoading();
    }
}

// =========================
// COMPANY FUNCTIONS
// =========================

function openCompanyModal() {
    editingCompanyId = null;
    document.getElementById('companyModalTitle').textContent = 'شركة جديدة';
    document.getElementById('companyForm').reset();
    document.getElementById('companyId').value = '';
    document.getElementById('companyModal').classList.add('active');
}

function closeCompanyModal() {
    document.getElementById('companyModal').classList.remove('active');
    editingCompanyId = null;
}

async function saveCompany(event) {
    event.preventDefault();
    showLoading();

    const companyData = {
        name: document.getElementById('companyName').value,
        tax_id: document.getElementById('companyTaxId').value,
        phone: document.getElementById('companyPhone').value || null,
        email: document.getElementById('companyEmail').value || null,
        address: document.getElementById('companyAddress').value || null
    };

    try {
        let result;
        if (editingCompanyId) {
            result = await supabase
                .from(TABLES.COMPANIES)
                .update(companyData)
                .eq('id', editingCompanyId);
        } else {
            result = await supabase
                .from(TABLES.COMPANIES)
                .insert([companyData]);
        }

        if (result.error) throw result.error;

        showNotification(editingCompanyId ? 'تم تحديث الشركة بنجاح' : 'تم إضافة الشركة بنجاح', 'success');
        closeCompanyModal();
        await loadCompanies();
    } catch (error) {
        console.error('Error saving company:', error);
        showNotification('خطأ في حفظ الشركة', 'error');
    } finally {
        hideLoading();
    }
}

async function editCompany(id) {
    const company = currentCompanies.find(comp => comp.id === id);
    if (!company) return;

    editingCompanyId = id;
    document.getElementById('companyModalTitle').textContent = 'تعديل الشركة';
    document.getElementById('companyId').value = id;
    document.getElementById('companyName').value = company.name;
    document.getElementById('companyTaxId').value = company.tax_id || '';
    document.getElementById('companyPhone').value = company.phone || '';
    document.getElementById('companyEmail').value = company.email || '';
    document.getElementById('companyAddress').value = company.address || '';
    document.getElementById('companyModal').classList.add('active');
}

async function deleteCompany(id) {
    // Check if company has invoices
    const hasInvoices = currentInvoices.some(inv => inv.company_id === id);
    if (hasInvoices) {
        showNotification('لا يمكن حذف الشركة لوجود فواتير مرتبطة بها', 'error');
        return;
    }

    if (!confirm('هل أنت متأكد من حذف هذه الشركة؟')) return;

    showLoading();
    try {
        const { error } = await supabase
            .from(TABLES.COMPANIES)
            .delete()
            .eq('id', id);

        if (error) throw error;

        showNotification('تم حذف الشركة بنجاح', 'success');
        await loadCompanies();
    } catch (error) {
        console.error('Error deleting company:', error);
        showNotification('خطأ في حذف الشركة', 'error');
    } finally {
        hideLoading();
    }
}

// =========================
// RECEIPT FUNCTIONS
// =========================

function openReceiptModal(invoiceId) {
    document.getElementById('receiptInvoiceId').value = invoiceId;
    document.getElementById('receiptForm').reset();
    document.getElementById('receiptDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('receiptPreview').innerHTML = '';
    document.getElementById('receiptModal').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('active');
}

function previewReceipt() {
    const file = document.getElementById('receiptFile').files[0];
    const preview = document.getElementById('receiptPreview');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${e.target.result}" alt="معاينة الإيصال">`;
            } else if (file.type === 'application/pdf') {
                preview.innerHTML = `<p>📄 ملف PDF: ${file.name}</p>`;
            }
        };
        reader.readAsDataURL(file);
    }
}

async function uploadReceipt(event) {
    event.preventDefault();
    showLoading();

    const invoiceId = parseInt(document.getElementById('receiptInvoiceId').value);
    const file = document.getElementById('receiptFile').files[0];
    const receiptDate = document.getElementById('receiptDate').value;
    const notes = document.getElementById('receiptNotes').value;

    try {
        // Convert file to base64
        const base64 = await fileToBase64(file);

        const receiptData = {
            invoice_id: invoiceId,
            receipt_date: receiptDate,
            file_name: file.name,
            file_type: file.type,
            file_data: base64,
            notes: notes || null
        };

        const { error } = await supabase
            .from(TABLES.RECEIPTS)
            .insert([receiptData]);

        if (error) throw error;

        showNotification('تم رفع الإيصال بنجاح', 'success');
        closeReceiptModal();
        await loadReceipts();
        displayInvoices();
        updateDashboardStats();
        checkAlerts();
    } catch (error) {
        console.error('Error uploading receipt:', error);
        showNotification('خطأ في رفع الإيصال', 'error');
    } finally {
        hideLoading();
    }
}

async function viewReceipt(invoiceId) {
    const receipt = currentReceipts.find(r => r.invoice_id === invoiceId);
    if (!receipt) {
        showNotification('الإيصال غير موجود', 'error');
        return;
    }

    // Create a blob from base64
    const byteCharacters = atob(receipt.file_data.split(',')[1] || receipt.file_data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: receipt.file_type });
    const url = URL.createObjectURL(blob);

    // Open in new window
    window.open(url, '_blank');
}

// =========================
// FILTER FUNCTIONS
// =========================

function filterInvoices() {
    const statusFilter = document.getElementById('filterStatus').value;
    const monthFilter = document.getElementById('filterMonth').value;
    const searchTerm = document.getElementById('searchInvoice').value.toLowerCase();

    let filtered = currentInvoices;

    // Status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(inv => getInvoiceStatus(inv) === statusFilter);
    }

    // Month filter
    if (monthFilter !== 'all') {
        filtered = filtered.filter(inv => {
            const invMonth = new Date(inv.date).getMonth() + 1;
            return invMonth === parseInt(monthFilter);
        });
    }

    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(inv => 
            inv.number.toLowerCase().includes(searchTerm) ||
            (inv.company?.name || '').toLowerCase().includes(searchTerm)
        );
    }

    // Update display with filtered data
    const tbody = document.getElementById('invoicesTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">لا توجد نتائج</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(invoice => {
        const status = getInvoiceStatus(invoice);
        const daysRemaining = getDaysRemaining(invoice.date);
        const hasReceipt = currentReceipts.some(r => r.invoice_id === invoice.id);
        
        return `
            <tr>
                <td>${invoice.number}</td>
                <td>${formatDate(invoice.date)}</td>
                <td>${invoice.company?.name || 'غير محدد'}</td>
                <td>${formatCurrency(invoice.amount)}</td>
                <td>${formatCurrency(invoice.tax_amount)}</td>
                <td><span class="status-badge status-${status}">${getStatusText(status)}</span></td>
                <td class="days-counter ${getDaysClass(daysRemaining, status)}">${getDaysText(daysRemaining, status)}</td>
                <td>
                    ${hasReceipt ? 
                        '<button class="btn-info" onclick="viewReceipt(' + invoice.id + ')">عرض</button>' :
                        '<button class="btn-warning" onclick="openReceiptModal(' + invoice.id + ')">رفع</button>'
                    }
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-info" onclick="editInvoice(${invoice.id})">تعديل</button>
                        <button class="btn-danger" onclick="deleteInvoice(${invoice.id})">حذف</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterCompanies() {
    const searchTerm = document.getElementById('searchCompany').value.toLowerCase();

    if (searchTerm) {
        // فلتر مؤقت بناءً على البحث فقط
        const saved = currentCompanies;
        const tempCompanies = currentCompanies.filter(comp =>
            comp.name.toLowerCase().includes(searchTerm) ||
            (comp.tax_id || '').toLowerCase().includes(searchTerm)
        );
        currentCompanies = tempCompanies;
        displayCompanies();
        currentCompanies = saved;
    } else {
        displayCompanies();
    }
}

// =========================
// ALERT FUNCTIONS
// =========================

function checkAlerts() {
    const alertsContainer = document.getElementById('alertsContainer');
    const alerts = [];

    currentInvoices.forEach(invoice => {
        const hasReceipt = currentReceipts.some(r => r.invoice_id === invoice.id);
        if (hasReceipt) return;

        const daysRemaining = getDaysRemaining(invoice.date);
        
        if (daysRemaining <= 0) {
            alerts.push({
                type: 'danger',
                invoice: invoice,
                message: `الفاتورة رقم ${invoice.number} متأخرة ${Math.abs(daysRemaining)} يوم`
            });
        } else if (daysRemaining <= (50 - ALERT_THRESHOLDS.WARNING)) {
            alerts.push({
                type: 'warning',
                invoice: invoice,
                message: `الفاتورة رقم ${invoice.number} تحذير - باقي ${daysRemaining} يوم`
            });
        }
    });

    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<div class="no-data">لا توجد تنبيهات حالياً</div>';
        return;
    }

    alertsContainer.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.type}">
            <h4>${alert.type === 'danger' ? '⚠️ تحذير متأخر' : '⏰ تحذير'}</h4>
            <p>${alert.message}</p>
            <p><strong>الشركة:</strong> ${alert.invoice.company?.name || 'غير محدد'}</p>
            <p><strong>قيمة 1%:</strong> ${formatCurrency(alert.invoice.tax_amount)}</p>
            <div class="alert-actions">
                <button class="btn-success" onclick="openReceiptModal(${alert.invoice.id})">رفع الإيصال</button>
                <button class="btn-info" onclick="editInvoice(${alert.invoice.id})">تفاصيل</button>
            </div>
        </div>
    `).join('');
}

// =========================
// TAB FUNCTIONS
// =========================

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Refresh data if needed
    if (tabName === 'alerts') {
        checkAlerts();
    }
}

// =========================
// UTILITY FUNCTIONS
// =========================

function getInvoiceStatus(invoice) {
    const hasReceipt = currentReceipts.some(r => r.invoice_id === invoice.id);
    if (hasReceipt) return STATUS.RECEIVED;

    const daysRemaining = getDaysRemaining(invoice.date);
    if (daysRemaining <= 0) return STATUS.OVERDUE;
    
    return STATUS.PENDING;
}

function getDaysRemaining(invoiceDate) {
    const today = new Date();
    const invoiceDateObj = new Date(invoiceDate);
    const deadlineDate = new Date(invoiceDateObj);
    deadlineDate.setDate(deadlineDate.getDate() + 50);
    
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

function getDaysClass(days, status) {
    if (status === STATUS.RECEIVED) return 'safe';
    if (days <= 0) return 'danger';
    if (days <= 10) return 'danger';
    if (days <= 30) return 'warning';
    return 'safe';
}

function getDaysText(days, status) {
    if (status === STATUS.RECEIVED) return 'تم الاستلام ✓';
    if (days <= 0) return `متأخر ${Math.abs(days)} يوم`;
    return `${days} يوم`;
}

function getStatusText(status) {
    switch(status) {
        case STATUS.PENDING: return 'معلقة';
        case STATUS.RECEIVED: return 'مستلمة';
        case STATUS.OVERDUE: return 'متأخرة';
        default: return 'غير معروف';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG');
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP'
    }).format(amount);
}

function populateCompanyDropdown() {
    const select = document.getElementById('invoiceCompany');
    select.innerHTML = '<option value="">اختر الشركة</option>' +
        currentCompanies.map(company => 
            `<option value="${company.id}">${company.name}</option>`
        ).join('');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showLoading() {
    document.getElementById('loadingSpinner').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.remove('active');
}

function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#2ed573' : '#ff4757'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
