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
    document.getElementById('view-available').style.display = 'block'; // Vista inicial
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
            
            // 👇 LA CORRECCIÓN ESTÁ AQUÍ 👇
            // Ahora también busca el estado "Pendiente"
            if (['available', 'ready_for_pickup', 'Pendiente'].includes(order.estado)) {
                availableOrders.push(order);
            } 
            // Pedidos aceptados POR ESTE repartidor
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
        container.innerHTML = `<p class="no-orders">${container.id.includes('available') ? 'No hay pedidos disponibles por el momento.' : 'No tienes pedidos en curso.'}</p>`;
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


// --- Lógica de la Ventana Modal (Detalles del Pedido) ---
const modal = document.getElementById('order-detail-modal');
const modalBody = document.getElementById('modal-body');
const modalActionBtn = document.getElementById('modal-action-btn');

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
    
    // Obtenemos el nombre del restaurante para mostrarlo
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

    configureModalButton(order);
    modal.style.display = 'block';
}

function configureModalButton(order) {
    let buttonText = '';
    let action = null;

    switch(order.estado) {
        case 'available':
        case 'ready_for_pickup':
        case 'Pendiente': // Añadido aquí también
            buttonText = 'Aceptar Pedido';
            action = () => updateOrderStatus(order.id, 'accepted', { repartidorID: currentUserId });
            break;
        case 'accepted':
            buttonText = 'En Camino a Entregar';
            action = () => updateOrderStatus(order.id, 'en_camino');
            break;
        case 'en_camino':
            buttonText = 'Ya Recogí el Pedido';
            action = () => updateOrderStatus(order.id, 'recogido');
            break;
        case 'recogido':
            buttonText = 'Marcar como Entregado'; // Cambiado para un flujo más simple
            action = () => updateOrderStatus(order.id, 'Entregado');
            break;
        default:
            buttonText = 'Ver Detalles';
            modalActionBtn.style.display = 'none'; // Ocultar botón si no hay acción
            action = () => {};
            break;
    }

    modalActionBtn.style.display = 'block';
    modalActionBtn.textContent = buttonText;
    modalActionBtn.onclick = action;
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