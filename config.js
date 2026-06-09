// Supabase Configuration
const SUPABASE_URL = 'https://foxvwykyoraznbadozba.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveHZ3eWt5b3Jhem5iYWRvemJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzI3NzgsImV4cCI6MjA4NTM0ODc3OH0.jDAnMiRI7HQ6AMTOASLQptlKjrD8xxjQjUQm-4tcUWE';

// Initialize Supabase client
let supabase = null;

// Load Supabase library
function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.supabase && window.supabase.createClient) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.js';
        script.crossOrigin = 'anonymous';
        
        script.onload = () => {
            console.log('Supabase library loaded from CDN');
            // Wait a moment for the library to initialize
            setTimeout(() => {
                if (window.supabase && window.supabase.createClient) {
                    resolve();
                } else {
                    reject(new Error('Supabase library failed to initialize'));
                }
            }, 200);
        };
        
        script.onerror = (error) => {
            console.error('Failed to load Supabase library:', error);
            reject(error);
        };
        
        document.head.appendChild(script);
    });
}

// Initialize the app
async function initializeApp() {
    try {
        console.log('Starting initialization...');
        
        // Load Supabase library
        await loadSupabaseLibrary();
        
        // Create client
        if (window.supabase && window.supabase.createClient) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client created successfully');
            
            // Test connection
            const { data, error } = await supabase.from('companies').select('count');
            if (error && error.code !== 'PGRST116') {
                console.warn('Database connection issue:', error.message);
            }
            
            // Initialize data
            if (typeof window.initializeData === 'function') {
                await window.initializeData();
            }
        } else {
            throw new Error('Supabase library not available');
        }
    } catch (error) {
        console.error('❌ Initialization error:', error);
        
        // Show user-friendly error
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 9999;
            max-width: 400px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;
        notification.innerHTML = `
            <strong>⚠️ خطأ في الاتصال</strong><br>
            ${error.message}<br>
            <small>يرجى التحقق من اتصال الإنترنت وتحديث الصفحة</small>
        `;
        document.body.appendChild(notification);
        
        // Hide loading spinner
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

// Database table names
const TABLES = {
    COMPANIES: 'companies',
    INVOICES: 'invoices',
    RECEIPTS: 'receipts'
};

// Alert thresholds (in days)
const ALERT_THRESHOLDS = {
    WARNING: 40,
    DANGER: 50
};

// Status types
const STATUS = {
    PENDING: 'pending',
    RECEIVED: 'received',
    OVERDUE: 'overdue'
};

// Initialize app on page load
document.addEventListener('DOMContentLoaded', initializeApp);

// =====================================================
// Keep-Alive: منع Supabase من الإيقاف التلقائي
// =====================================================

// دالة لإبقاء قاعدة البيانات نشطة
async function keepSupabaseAlive() {
    if (!supabase) return;
    
    try {
        // استعلام بسيط جداً لإبقاء الاتصال نشط
        await supabase.from('companies').select('count', { count: 'exact', head: true });
        console.log('✅ Keep-alive ping sent');
    } catch (error) {
        console.warn('Keep-alive ping failed:', error.message);
    }
}

// تشغيل Keep-Alive كل 5 دقائق (300000 ms)
setInterval(keepSupabaseAlive, 300000);

// تشغيل أول مرة بعد دقيقة من فتح الصفحة
setTimeout(keepSupabaseAlive, 60000);
