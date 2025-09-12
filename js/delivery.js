import { db, auth } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

let currentUserId = null;
let currentUserStatus = 'inactivo';

// --- Autenticación y Carga Inicial ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'repartidor') {
            setupTabs();
            loadDriverProfile();
            listenToOrders();
            setupModalListeners();
        } else {
            alert("Acceso denegado. Esta cuenta no es de repartidor.");
            signOut(auth);
            window.location.href = 'index.html';
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
                view.style.display = view.id === targetViewId ? 'block' : 'none';
            });
        });
    });
    document.getElementById('view-available').style.display = 'block';
}

// --- Perfil del Repartidor ---
async function loadDriverProfile() {
    const userDocRef = doc(db, "users", currentUserId);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            document.getElementById('driver-name').textContent = userData.nombre || 'N/A';
            document.getElementById('driver-email').textContent = userData.email;
            const statusEl = document.getElementById('driver-status');
            currentUserStatus = userData.status || 'inactivo';
            statusEl.textContent = currentUserStatus.charAt(0).toUpperCase() + currentUserStatus.slice(1);
            statusEl.className = `status-label ${currentUserStatus}`;

            const toggleBtn = document.getElementById('toggle-status-btn');
            toggleBtn.textContent = currentUserStatus === 'activo' ? 'Pasar a Inactivo' : 'Activarme para Pedidos';
        }
    });

    document.getElementById('toggle-status-btn').addEventListener('click', async () => {
        const newStatus = currentUserStatus === 'activo' ? 'inactivo' : 'activo';
        await updateDoc(userDocRef, { status: newStatus });
    });
    
    document.getElementById('logoutButton').addEventListener('click', () => {
        signOut(auth);
    });
}

// --- Lógica de Pedidos ---
function listenToOrders() {
    const availableContainer = document.getElementById('available-orders-container');
    const acceptedContainer = document.getElementById('accepted-orders-container');
    
    const q = query(collection(db, "pedidos"));

    onSnapshot(q, (snapshot) => {
        let availableOrders = [];
        let acceptedOrders = [];

        snapshot.forEach(doc => {
            const order = { id: doc.id, ...doc.data() };
            
            if (['available', 'ready_for_pickup', 'Pendiente'].includes(order.estado)) {
                availableOrders.push(order);
            } 
            else if (order.repartidorID === currentUserId && ['accepted', 'en_camino', 'recogido'].includes(order.estado)) {
                acceptedOrders.push(order);
            }
        });

        renderOrders(availableOrders, availableContainer);
        renderOrders(acceptedOrders, acceptedContainer);
    });
}

function renderOrders(orderList, container) {
    container.innerHTML = '';
    if (orderList.length === 0) {
        container.innerHTML = `<p class="no-orders">${container.id.includes('available') ? 'No hay pedidos disponibles.' : 'No tienes pedidos en curso.'}</p>`;
        return;
    }
    
    orderList.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());

    orderList.forEach(order => {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <h3>Pedido de: ${order.restauranteName || 'Restaurante'}</h3>
            <p><strong>Destino:</strong> ${order.direccionCliente}</p>
            <p class="price">₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
            <button class="action-btn" data-id="${order.id}">Ver Detalles</button>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => showOrderDetails(btn.dataset.id));
    });
}

// --- Lógica de la Ventana Modal ---
const modal = document.getElementById('order-detail-modal');
const modalBody = document.getElementById('modal-body');
const modalActionBtn = document.getElementById('modal-action-btn');
const extraActionsContainer = document.getElementById('modal-extra-actions');

function setupModalListeners() {
    modal.querySelector('.close-button').onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

async function showOrderDetails(orderId) {
    const orderDoc = await getDoc(doc(db, "pedidos", orderId));
    if (!orderDoc.exists()) return;

    const order = { id: orderDoc.id, ...orderDoc.data() };
    
    let restauranteName = 'Restaurante';
    if(order.restauranteId) {
        const restDoc = await getDoc(doc(db, "users", order.restauranteId));
        if(restDoc.exists()) {
            restauranteName = restDoc.data().nombreRestaurante || 'Restaurante';
        }
    }

    modalBody.innerHTML = `
        <p><strong>Restaurante:</strong> ${restauranteName}</p>
        <p><strong>Recoger en:</strong> ${order.direccionRestaurante || 'No especificada'}</p>
        <hr>
        <p><strong>Cliente:</strong> ${order.nombreCliente}</p>
        <p><strong>Entregar en:</strong> ${order.direccionCliente}</p>
        <p><strong>Total a cobrar:</strong> ₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
        <p><strong>Método de pago:</strong> ${order.metodoPago || 'Efectivo'}</p>
    `;

    configureModalButtons(order);
    modal.style.display = 'block';
}

function configureModalButtons(order) {
    // Configurar botón principal de estado
    let mainButtonText = '';
    let mainAction = null;
    let showExtraActions = false;

    switch(order.estado) {
        case 'available':
        case 'ready_for_pickup':
        case 'Pendiente':
            mainButtonText = 'Aceptar Pedido';
            mainAction = () => updateOrderStatus(order.id, 'accepted', { repartidorID: currentUserId });
            break;
        case 'accepted':
            mainButtonText = 'Ya Recogí el Pedido';
            mainAction = () => updateOrderStatus(order.id, 'en_camino');
            showExtraActions = true;
            break;
        case 'en_camino':
            mainButtonText = 'Marcar como Entregado';
            mainAction = () => updateOrderStatus(order.id, 'Entregado');
            showExtraActions = true;
            break;
        default:
            mainButtonText = 'Cerrar';
            mainAction = () => { modal.style.display = 'none'; };
            break;
    }

    modalActionBtn.textContent = mainButtonText;
    modalActionBtn.onclick = mainAction;

    // Configurar botones secundarios (navegación y contacto)
    extraActionsContainer.style.display = showExtraActions ? 'flex' : 'none';
    
    if (showExtraActions) {
        const navRestaurantBtn = document.getElementById('navigate-restaurant-btn');
        const contactClientBtn = document.getElementById('contact-client-btn');
        const navClientBtn = document.getElementById('navigate-client-btn');

        // Navegar al restaurante
        if (order.direccionRestaurante) {
            navRestaurantBtn.onclick = () => {
                // Si es una URL de Google Maps, la abre. Si no, busca la dirección.
                const url = order.direccionRestaurante.startsWith('http') 
                    ? order.direccionRestaurante 
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.direccionRestaurante)}`;
                window.open(url, '_blank');
            };
            navRestaurantBtn.disabled = false;
        } else {
            navRestaurantBtn.disabled = true;
        }

        // Contactar al cliente
        if (order.telefonoCliente) {
            contactClientBtn.onclick = () => {
                window.location.href = `tel:${order.telefonoCliente}`;
            };
            contactClientBtn.disabled = false;
        } else {
            contactClientBtn.disabled = true;
        }

        // Navegar al cliente
        if (order.direccionCliente) {
            navClientBtn.onclick = () => {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.direccionCliente)}`;
                window.open(url, '_blank');
            };
            navClientBtn.disabled = false;
        } else {
            navClientBtn.disabled = true;
        }
    }
}

async function updateOrderStatus(orderId, newStatus, extraData = {}) {
    const orderRef = doc(db, "pedidos", orderId);
    try {
        await updateDoc(orderRef, { estado: newStatus, ...extraData });
        alert(`Pedido actualizado a: ${newStatus}`);
        modal.style.display = 'none';
    } catch (e) {
        console.error("Error al actualizar estado: ", e);
        alert("No se pudo actualizar el estado del pedido.");
    }
}