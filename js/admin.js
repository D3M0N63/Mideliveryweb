import { auth, db } from './firebase-config.js'; 
// Importamos las funciones necesarias para la app secundaria y writeBatch
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Configuración de Firebase para la app secundaria (evita el auto-login)
const firebaseConfig = {
  apiKey: "AIzaSyCUMoE_2vypwKDSjTgvTCf8RZ_SInbirZ4",
  authDomain: "mi-delivery-2b62c.firebaseapp.com",
  projectId: "mi-delivery-2b62c",
  storageBucket: "mi-delivery-2b62c.firebasestorage.app",
  messagingSenderId: "796070702650",
  appId: "1:796070702650:web:43977d02ec9485eb324f03"
};

// --- Verificación de rol y carga inicial ---
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
            const secondaryApp = initializeApp(firebaseConfig, `secondary-app-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const user = userCredential.user;
            
            const userData = {
                email: email,
                role: role,
                nombreRestaurante: role === 'restaurante' ? nombre : null,
                nombre: role === 'repartidor' ? nombre : null,
            };
            await setDoc(doc(db, "users", user.uid), userData);
            
            if (role === 'restaurante') {
                const restaurantData = {
                    nombreRestaurante: nombre,
                    locationUrl: locationUrl,
                    email: email,
                };
                await setDoc(doc(db, "restaurantes", user.uid), restaurantData);
            }
            
            alert(`Usuario ${role} creado con éxito.`);
            createUserForm.reset();
            toggleLocationField();

        } catch (error) {
            console.error("Error al crear usuario:", error);
            errorMsg.textContent = `Error: ${error.message}`;
        }
    });
}

// --- Lógica de Restaurantes con Botón para Liquidar ---
function listenToRestaurants() {
    const container = document.getElementById('restaurants-container');

    const qPedidos = query(collection(db, "pedidos"), where("liquidado", "==", false));
    onSnapshot(qPedidos, (pedidosSnapshot) => {
        const deliveryTotals = {};
        pedidosSnapshot.forEach(doc => {
            const pedido = doc.data();
            if (pedido.restauranteId && pedido.costoDelivery) {
                deliveryTotals[pedido.restauranteId] = (deliveryTotals[pedido.restauranteId] || 0) + pedido.costoDelivery;
            }
        });

        const qRestaurantes = query(collection(db, "restaurantes"));
        onSnapshot(qRestaurantes, (snapshot) => {
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
                    <div style="flex-grow: 1;">
                        <h3>${restaurant.nombreRestaurante || "Sin nombre"}</h3>
                        <p>${restaurant.email || "Sin email"}</p>
                        <p class="price">Total Pendiente: ₲ ${totalDelivery.toLocaleString('es-PY')}</p>
                    </div>
                    <div>
                        <button class="btn-liquidar" data-id="${doc.id}" ${totalDelivery === 0 ? 'disabled' : ''}>Cerrar Valor</button>
                    </div>
                `;
                container.appendChild(card);
            });
            
            document.querySelectorAll('.btn-liquidar').forEach(button => {
                button.addEventListener('click', (e) => {
                    const restaurantId = e.target.dataset.id;
                    if (confirm(`¿Estás seguro de liquidar el valor pendiente para este restaurante?`)) {
                        liquidarPedidos(restaurantId);
                    }
                });
            });

            setupExcelExport(restaurantDataForExcel);
        });
    });
}

// --- Función para Liquidar Pedidos ---
async function liquidarPedidos(restaurantId) {
    try {
        const q = query(
            collection(db, "pedidos"),
            where("restauranteId", "==", restaurantId),
            where("liquidado", "==", false)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            alert("No hay valores pendientes para liquidar.");
            return;
        }

        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.update(doc.ref, { liquidado: true });
        });

        await batch.commit();
        alert("Valores liquidados con éxito. La lista se actualizará.");

    } catch (error) {
        console.error("Error al liquidar pedidos:", error);
        alert("Ocurrió un error al intentar liquidar los valores.");
    }
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
            card.className = 'user-card'; // Re-usamos esta clase
            card.innerHTML = `<p>${driver.nombre}</p>`;
            container.appendChild(card);
        });
    });
}

function setupExcelExport(data) {
    const exportButton = document.getElementById('exportExcelButton');
    exportButton.onclick = () => {
        const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
            'Nombre del Restaurante': item.nombre,
            'Email': item.email,
            'Total Pendiente (₲)': item.totalDelivery
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