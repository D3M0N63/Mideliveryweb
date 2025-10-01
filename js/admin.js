import { auth, db } from './firebase-config.js'; 
// Importamos las funciones para inicializar una segunda app
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Copiamos la configuración de Firebase para usarla en la app secundaria
const firebaseConfig = {
  apiKey: "AIzaSyCUMoE_2vypwKDSjTgvTCf8RZ_SInbirZ4",
  authDomain: "mi-delivery-2b62c.firebaseapp.com",
  projectId: "mi-delivery-2b62c",
  storageBucket: "mi-delivery-2b62c.firebasestorage.app",
  messagingSenderId: "796070702650",
  appId: "1:796070702650:web:43977d02ec9485eb324f03"
};

// --- Verificación de rol y redirección ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            alert("Acceso denegado.");
            window.location.href = 'index.html';
        } else {
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

// --- Creación de usuarios SIN INICIAR SESIÓN ---
function handleUserCreation() {
    const createUserForm = document.getElementById('createUserForm');
    const roleSelect = document.getElementById('userRole');
    const locationUrlGroup = document.getElementById('locationUrl-group');
    const nameInput = document.getElementById('userName');
    const emailInput = document.getElementById('userEmail');
    const passwordInput = document.getElementById('userPassword');
    const locationUrlInput = document.getElementById('userLocationUrl');
    const errorMsg = document.getElementById('createUserError');

    const toggleLocationField = () => {
        locationUrlGroup.style.display = roleSelect.value === 'restaurante' ? 'block' : 'none';
    };

    roleSelect.addEventListener('change', toggleLocationField);
    toggleLocationField();

    createUserForm.addEventListener('submit', async (event) => {
        event.preventDefault();

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
            // 1. Inicializamos una app secundaria y temporal de Firebase
            // Se le da un nombre único para evitar conflictos.
            const secondaryApp = initializeApp(firebaseConfig, `secondary-app-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);

            // 2. Creamos el usuario usando la instancia de autenticación secundaria
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const user = userCredential.user;
            
            // 3. Guardamos los datos en Firestore (usando la base de datos principal 'db')
            const userData = {
                email: email,
                role: role,
                nombreRestaurante: role === 'restaurante' ? nombre : null,
                nombre: role === 'repartidor' ? nombre : null
            };
            await setDoc(doc(db, "users", user.uid), userData);
            
            // Si es restaurante, creamos su perfil en la colección 'restaurantes'
            if (role === 'restaurante') {
                const restaurantData = {
                    nombreRestaurante: nombre,
                    locationUrl: locationUrl,
                    email: email
                };
                await setDoc(doc(db, "restaurantes", user.uid), restaurantData);
            }
            
            alert(`Usuario ${role} creado con éxito.`);
            createUserForm.reset();
            toggleLocationField();

        } catch (error) {
            console.error("Error al crear usuario:", error);
            if (error.code === 'auth/email-already-in-use') {
                errorMsg.textContent = 'Error: El correo electrónico ya está en uso.';
            } else {
                errorMsg.textContent = `Error: ${error.message}`;
            }
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

    // Se cambió la consulta a la colección 'restaurantes'
    const q = query(collection(db, "restaurantes"));
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
                nombre: restaurant.nombreRestaurante || "N/A",
                email: restaurant.email || "N/A",
                totalDelivery: totalDelivery
            });

            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <h3>${restaurant.nombreRestaurante || "Sin nombre"}</h3>
                <p>${restaurant.email || "Sin email"}</p>
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