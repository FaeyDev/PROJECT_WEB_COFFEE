const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const app = express();
const port = 3000;

// --- 1. KONFIGURASI ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serving Static Files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/backend', express.static(path.join(__dirname, 'backend')));
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));
// Tambahan agar file js/css di root folder adminlte bisa terbaca jika ada
app.use('/plugins', express.static(path.join(__dirname, 'plugins')));
app.use('/dist', express.static(path.join(__dirname, 'dist')));

app.use(session({
    secret: 'kunci-rahasia-kopikoe',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 * 60 } // 1 jam
}));

// DEFINE FILE PATHS
const USER_FILE = path.join(__dirname, 'users.json');
const ORDER_FILE = path.join(__dirname, 'orders.json');
const PRODUCT_FILE = path.join(__dirname, 'products.json');

// --- 2. FUNGSI BANTUAN (DATABASE MOCKUP) ---
const readJsonFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        // Jika file tidak ada, buat array kosong
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
        return [];
    }
};

// Helper: Tulis File JSON
const writeJsonFile = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Error writing ${filePath}:`, e);
    }
};

const getUsers = () => readJsonFile(USER_FILE);
const getOrders = () => readJsonFile(ORDER_FILE);
const getProducts = () => readJsonFile(PRODUCT_FILE);

// Helper: Render SweetAlert
const renderAlert = (icon, title, text, redirectUrl) => {
    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loading...</title>
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
        <style>body { font-family: sans-serif; background-color: #f4f6f9; }</style>
    </head>
    <body>
        <script>
            Swal.fire({
                icon: '${icon}',
                title: '${title}',
                text: '${text}',
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                window.location.href = '${redirectUrl}';
            });
        </script>
    </body>
    </html>
    `;
};

// --- 3. MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    if (req.session.user) { 
        next(); 
    } else { 
        // Cek jika request adalah API (JSON), jangan return HTML redirect
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        res.redirect('/login'); 
    }
};

// --- 4. ROUTE HALAMAN (FRONTEND & BACKEND) ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'register.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'invoice.html')));

// Route Customer
app.get('/customer/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'customer', 'dashboard.html')));
app.get('/customer/history.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'customer', 'history.html')));
app.get('/customer/settings', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'customer', 'settings.html')));

// Route Admin
app.get('/admin/dashboard', requireAuth, (req, res) => {
    if(req.session.user.role !== 'admin') return res.send(renderAlert('error', 'Akses Ditolak', 'Hanya admin yang boleh masuk', '/'));
    res.sendFile(path.join(__dirname, 'backend', 'admin', 'dashboard.html'));
});
app.get('/admin/profile', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'admin', 'profile.html')));
app.get('/admin/product', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'admin', 'product.html')));
app.get('/admin/settings', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'backend', 'admin', 'profile.html'))); 

// --- 5. API ENDPOINTS ---

// API: Ambil Data Produk (PERBAIKAN: Mengambil dari file JSON)
app.get('/api/products', (req, res) => {
    const products = getProducts();
    // Jika kosong, kirim data default agar frontend tidak kosong total
    if (products.length === 0) {
        const defaultProducts = [
            { id: 1, name: "Cappuccino", price: 25000, image: "/assets/ftkp1.png", description: "Coffee 50% | Milk 50%" },
            { id: 2, name: "Arabicano", price: 20000, image: "/assets/ftkp2.png", description: "Coffee 100%" },
            { id: 3, name: "Macchiato", price: 35000, image: "/assets/ftkp3.png", description: "Coffee 50% | Milk 50%" },
            { id: 4, name: "Expresso", price: 35000, image: "/assets/ftkp4.png", description: "Strong Coffee" }
        ];
        writeJsonFile(PRODUCT_FILE, defaultProducts);
        return res.json(defaultProducts);
    }
    res.json(products);
});

// [TAMBAHAN] API: Tambah Produk Baru
app.post('/api/products/add', requireAuth, (req, res) => {
    // Pastikan hanya admin yang bisa akses
    if(req.session.user.role !== 'admin') return res.status(403).json({error: 'Unauthorized'});

    const { name, price, image, description } = req.body;
    
    // Validasi sederhana
    if (!name || !price) {
        return res.status(400).json({ success: false, message: 'Nama dan Harga wajib diisi' });
    }

    const products = getProducts();

    // Buat object produk baru
    const newProduct = {
        id: Date.now(), // Generate ID unik menggunakan timestamp
        name: name,
        price: parseInt(price),
        // Gunakan gambar default jika kosong
        image: image || '/assets/logo kopikoe.png', 
        description: description || ''
    };

    products.push(newProduct);
    writeJsonFile(PRODUCT_FILE, products); // Simpan ke file JSON

    res.json({ success: true, message: 'Produk berhasil ditambahkan', product: newProduct });
});

// --- [TAMBAHAN] API: Hapus Produk ---
app.post('/api/products/delete', requireAuth, (req, res) => {
    // Pastikan hanya admin yang bisa menghapus
    if(req.session.user.role !== 'admin') return res.status(403).json({error: 'Unauthorized'});

    const { id } = req.body;
    let products = getProducts();

    // Hapus produk berdasarkan ID
    const newProducts = products.filter(p => p.id !== id);

    // Cek apakah ada yang terhapus
    if (products.length === newProducts.length) {
        return res.json({ success: false, message: 'Produk tidak ditemukan' });
    }

    // Simpan perubahan ke file JSON
    writeJsonFile(PRODUCT_FILE, newProducts);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
});

// API: Get User History (Mengambil riwayat belanja berdasarkan user yang login)
app.get('/api/user/history', requireAuth, (req, res) => {
    // 1. Ambil email user yang sedang login dari session
    const userEmail = req.session.user.email; 

    // 2. Ambil semua data order
    const allOrders = getOrders(); 

    // 3. Filter order: Hanya ambil order yang email-nya sama dengan user yang login
    const userOrders = allOrders.filter(order => order.email === userEmail);

    // 4. Urutkan dari yang terbaru (opsional, tapi disarankan)
    // Asumsi ID order menggunakan timestamp (ORD-xxxxx), jadi bisa di-sort reverse
    userOrders.reverse();

    // 5. Kirim data ke frontend
    res.json(userOrders);
});

// API: Admin Dashboard Data
app.get('/api/admin/dashboard-data', requireAuth, (req, res) => {
    if(req.session.user.role !== 'admin') return res.status(403).json({error: 'Unauthorized'});

    const orders = getOrders();
    
    const totalRevenue = orders.reduce((acc, order) => acc + (order.total || 0), 0);
    const totalDish = orders.reduce((acc, order) => {
        const itemsCount = order.items ? order.items.reduce((sum, item) => sum + item.qty, 0) : 0;
        return acc + itemsCount;
    }, 0);
    const totalCustomers = orders.length;

    const typeCounts = { 'Dine In': 0, 'To Go': 0, 'Delivery': 0 };
    orders.forEach(order => {
        if (typeCounts[order.type] !== undefined) typeCounts[order.type]++;
    });

    const menuCounts = {};
    orders.forEach(order => {
        if(order.items) {
            order.items.forEach(item => {
                if (!menuCounts[item.name]) menuCounts[item.name] = 0;
                menuCounts[item.name] += item.qty;
            });
        }
    });

    const sortedMenu = Object.entries(menuCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

    res.json({
        totalRevenue,
        totalDish,
        totalCustomers,
        typeCounts,
        mostOrdered: sortedMenu,
        recentOrders: orders 
    });
});

// API: Create Order
app.post('/api/order/create', (req, res) => {
    const { customerName, orderType, items, paymentMethod } = req.body;
    const userEmail = req.session.user ? req.session.user.email : "Guest"; 

    const orders = getOrders();
    
    let subtotal = 0;
    if(items && Array.isArray(items)) {
        items.forEach(item => {
            subtotal += (item.price * item.qty);
        });
    }
    
    const tax = subtotal * 0.11;
    const total = subtotal + tax;

    const orderId = `ORD-${Date.now()}`;
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('en-US', options);

    const newOrder = {
        id: orderId,
        customer: customerName,
        email: userEmail,
        items: items || [],
        subtotal: subtotal,
        tax: tax,
        total: total,
        paymentMethod: paymentMethod,
        type: orderType,
        status: 'pending',
        date: today
    };

    orders.push(newOrder);
    writeJsonFile(ORDER_FILE, orders); // Gunakan helper write

    res.json({ success: true, orderId: orderId });
});

// API: Get Invoice
app.get('/api/invoice/:id', (req, res) => {
    const orders = getOrders();
    const order = orders.find(o => o.id === req.params.id);
    if(order) res.json(order);
    else res.status(404).json({ error: "Order not found" });
});

// API: Current User
app.get('/api/current-user', (req, res) => {
    if (req.session.user) {
        const derivedName = req.session.user.email.split('@')[0];
        res.json({ isLoggedIn: true, ...req.session.user, name: derivedName });
    } else {
        res.json({ isLoggedIn: false });
    }
});

// API: Update Status Order (Admin)
app.post('/api/admin/update-order-status', requireAuth, (req, res) => {
    if(req.session.user.role !== 'admin') return res.status(403).json({error: 'Unauthorized'});

    const { orderId, newStatus } = req.body;
    let orders = getOrders();
    
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
        orders[orderIndex].status = newStatus;
        writeJsonFile(ORDER_FILE, orders);
        res.json({ success: true, message: 'Status updated' });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
});

// --- 6. AUTHENTICATION ---
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.email === username && u.password === password);
    
    if (user) {
        req.session.user = user;
        req.session.save(); // Pastikan session tersimpan sebelum redirect
        let targetUrl = user.role === 'admin' ? '/admin/dashboard' : '/'; 
        res.send(renderAlert('success', 'Login Berhasil!', `Selamat datang, ${username}`, targetUrl));
    } else {
        res.send(renderAlert('error', 'Login Gagal!', 'Email atau Password salah', '/login'));
    }
});

app.post('/auth/register', (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();
    
    if (users.find(u => u.email === email)) {
        return res.send(renderAlert('warning', 'Gagal', 'Email sudah terdaftar', '/register'));
    }
    
    let role = email.includes('admin') ? 'admin' : 'customer';
    const newUser = { id: Date.now(), email, password, role };
    users.push(newUser);
    writeJsonFile(USER_FILE, users);

    res.send(renderAlert('success', 'Berhasil', 'Akun berhasil dibuat. Silakan login.', '/login'));
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Jalankan Server
app.listen(port, () => console.log(`Server berjalan di http://localhost:${port}`));