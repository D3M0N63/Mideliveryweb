import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- Verificación de rol y redirección ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            alert("Acceso denegado.");
            window.location.href = 'index.html';
        } else {
            // Si el usuario es admin, cargamos todos los datos necesarios.
            loadDashboardData(user);
            setupTabs();
        }
    } else {
        window.location.href = 'index.html';
    }
});

// --- Pestañas ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const targetViewId = 'view-' + tab.id.split('-')[1];
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === targetViewId) {
                    view.classList.add('active');
                }
            });
        });
    });
}


// --- Lógica del Dashboard ---
function loadDashboardData(user) {
    loadAdminProfile(user);
    handleUserCreation();
    listenToActiveDrivers();
    listenToRestaurants();
    listenToAllOrders();
}

// Perfil del admin
function loadAdminProfile(user) {
    const adminName = document.getElementById('adminName');
    const adminEmail = document.getElementById('adminEmail');
    getDoc(doc(db, "users", user.uid)).then(docSnap => {
        if (docSnap.exists()) {
            adminName.textContent = docSnap.data().nombre || 'N/A';
            adminEmail.textContent = docSnap.data().email;
        }
    });
}

// Creación de usuarios
function handleUserCreation() {
    const roleSelect = document.getElementById('userRole');
    const locationUrlGroup = document.getElementById('locationUrl-group');
    const createButton = document.getElementById('createUserButton');
    const nameInput = document.getElementById('userName');
    const emailInput = document.getElementById('userEmail');
    const passwordInput = document.getElementById('userPassword');
    const locationUrlInput = document.getElementById('userLocationUrl');
    const errorMsg = document.getElementById('createUserError');

    roleSelect.addEventListener('change', () => {
        locationUrlGroup.style.display = roleSelect.value === 'restaurante' ? 'block' : 'none';
    });

    createButton.addEventListener('click', async () => {
        const nombre = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const role = roleSelect.value;
        const locationUrl = locationUrlInput.value.trim();
        errorMsg.textContent = '';

        if (!nombre || !email || !password) {
            errorMsg.textContent = 'Todos los campos son obligatorios.';
            return;
        }
        if (role === 'restaurante' && !locationUrl) {
            errorMsg.textContent = 'La URL de Google Maps es obligatoria para restaurantes.';
            return;
        }

        try {
            // Creamos el usuario en un contexto temporal de autenticación
            const tempAuthApp = auth.app;
            const { user } = await createUserWithEmailAndPassword(auth, email, password);
            
            const userData = {
                email: email,
                role: role,
                ...(role === 'restaurante' ? { nombreRestaurante: nombre, locationUrl: locationUrl } : { nombre: nombre })
            };

            await setDoc(doc(db, "users", user.uid), userData);
            alert(`Usuario ${role} creado con éxito.`);
            // Limpiar campos
            nameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
            locationUrlInput.value = '';

        } catch (error) {
            console.error("Error al crear usuario:", error);
            errorMsg.textContent = `Error: ${error.message}`;
        }
    });
}


// Repartidores activos
function listenToActiveDrivers() {
    const container = document.getElementById('active-drivers-container');
    const q = query(collection(db, "users"), where("role", "==", "repartidor"), where("status", "==", "activo"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay repartidores activos.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const driver = doc.data();
            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `<p>${driver.nombre}</p>`;
            container.appendChild(card);
        });
    });
}

// --- Lógica de Restaurantes ---
async function listenToRestaurants() {
    const container = document.getElementById('restaurants-container');
    
    const pedidosSnapshot = await getDocs(collection(db, "pedidos"));
    const deliveryTotals = {};
    pedidosSnapshot.forEach(doc => {
        const pedido = doc.data();
        if (pedido.restauranteId && pedido.costoDelivery) {
            deliveryTotals[pedido.restauranteId] = (deliveryTotals[pedido.restauranteId] || 0) + pedido.costoDelivery;
        }
    });

    const q = query(collection(db, "users"), where("role", "==", "restaurante"));
    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay restaurantes registrados.</p>';
            return;
        }
        let restaurantDataForExcel = [];
        snapshot.forEach(doc => {
            const restaurant = doc.data();
            const totalDelivery = deliveryTotals[doc.id] || 0;
            
            restaurantDataForExcel.push({
                nombre: restaurant.nombreRestaurante || restaurant.nombre,
                email: restaurant.email,
                totalDelivery: totalDelivery
            });

            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <h3>${restaurant.nombreRestaurante || restaurant.nombre}</h3>
                <p>${restaurant.email}</p>
                <p class="price">Total Delivery: ₲ ${totalDelivery.toLocaleString('es-PY')}</p>
            `;
            container.appendChild(card);
        });
        
        setupExcelExport(restaurantDataForExcel);
    });
}

function setupExcelExport(data) {
    const exportButton = document.getElementById('exportExcelButton');
    exportButton.onclick = () => {
        const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
            'Nombre del Restaurante': item.nombre,
            'Email': item.email,
            'Total Ganado por Delivery (₲)': item.totalDelivery
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte de Delivery");
        XLSX.writeFile(workbook, `ReporteDelivery_${new Date().toISOString().slice(0,10)}.xlsx`);
    };
}


// --- Lógica de Pedidos ---
function listenToAllOrders() {
    const container = document.getElementById('all-orders-container');
    const q = query(collection(db, "pedidos"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay pedidos en el sistema.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const order = doc.data();
            const card = document.createElement('div');
            card.className = 'order-card';
            const orderDate = order.timestamp ? order.timestamp.toDate().toLocaleString('es-ES') : 'Fecha no disponible';
            card.innerHTML = `
                <h3>Pedido para: ${order.nombreCliente}</h3>
                <p><strong>Dirección:</strong> ${order.direccionCliente}</p>
                <p><strong>Total:</strong> ₲ ${(order.total || 0).toLocaleString('es-ES')}</p>
                <p><strong>Estado:</strong> <span class="status status-${(order.estado || '').toLowerCase()}">${order.estado}</span></p>
                <small>${orderDate}</small>
            `;
            container.appendChild(card);
        });
    });
}

// --- Cierre de sesión ---
document.getElementById('logoutButton').addEventListener('click', () => {
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});