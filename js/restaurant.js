import { auth, db } from './firebase-config.js'; 
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, getDoc, serverTimestamp, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

let currentUserId = null;
let products = [];
let selectedItems = [];

// --- Autenticación y Carga Inicial ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'restaurante') {
            document.getElementById('restaurant-name').textContent = userDoc.data().nombreRestaurante || "Mi Restaurante";
            setupTabs();
            loadRestaurantData();
        } else {
            alert("Acceso denegado. No tienes el rol de restaurante.");
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

function loadRestaurantData() {
    listenToProducts();
    listenToOrders();
    loadProfile();
    setupCreateOrderForm();
    setupModalListeners();
}

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
    // Forzar la visualización de la primera pestaña por defecto
    document.getElementById('view-create').style.display = 'block';
    document.getElementById('btn-create').classList.add('active');
}


// --- Gestión de Productos ---
function listenToProducts() {
    const q = query(collection(db, `users/${currentUserId}/productos`));
    onSnapshot(q, (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductsList();
        populateProductSpinners();
    });
}

function renderProductsList() {
    const container = document.getElementById('products-list-container');
    container.innerHTML = '<h3>Mis Productos</h3>';
    if (products.length === 0) {
        container.innerHTML += '<p>No tienes productos registrados.</p>';
        return;
    }
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <div class="product-info">
                <p><strong>${p.nombre}</strong></p>
                <p>₲ ${p.precio.toLocaleString('es-PY')} (${p.categoria})</p>
            </div>
            <div class="product-actions">
                <button class="action-btn-small edit" data-id="${p.id}">Editar</button>
                <button class="action-btn-small delete" data-id="${p.id}">Eliminar</button>
            </div>
        `;
        container.appendChild(card);
    });
    container.querySelectorAll('.edit').forEach(btn => btn.onclick = () => editProduct(btn.dataset.id));
    container.querySelectorAll('.delete').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.id));
}

document.getElementById('save-product-btn').addEventListener('click', async () => {
    const id = document.getElementById('product-id').value;
    const nombre = document.getElementById('product-name').value.trim();
    const precio = parseFloat(document.getElementById('product-price').value);
    const categoria = document.getElementById('product-category').value;

    if (!nombre || isNaN(precio)) {
        alert("Por favor, completa el nombre y el precio del producto.");
        return;
    }

    const productData = { nombre, precio, categoria };
    
    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/productos`, id), productData);
        } else {
            await addDoc(collection(db, `users/${currentUserId}/productos`), productData);
        }
        alert(id ? "Producto actualizado." : "Producto añadido.");
        resetProductForm();
    } catch (e) {
        console.error("Error guardando producto: ", e);
        alert("No se pudo guardar el producto.");
    }
});

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.nombre;
        document.getElementById('product-price').value = product.precio;
        document.getElementById('product-category').value = product.categoria;
        document.getElementById('cancel-edit-btn').style.display = 'inline-block';
    }
}

async function deleteProduct(id) {
    if (confirm("¿Estás seguro de que quieres eliminar este producto?")) {
        try {
            await deleteDoc(doc(db, `users/${currentUserId}/productos`, id));
            alert("Producto eliminado.");
        } catch(e) {
            alert("Error al eliminar producto.");
        }
    }
}

document.getElementById('cancel-edit-btn').addEventListener('click', resetProductForm);

function resetProductForm() {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('cancel-edit-btn').style.display = 'none';
}


// --- Creación de Pedidos ---
function populateProductSpinners() {
    const productsSpinner = document.getElementById('products-spinner');
    const drinksSpinner = document.getElementById('drinks-spinner');
    productsSpinner.innerHTML = '<option value="">Selecciona un producto...</option>';
    drinksSpinner.innerHTML = '<option value="">Selecciona una bebida...</option>';

    products.forEach(p => {
        const option = new Option(`${p.nombre} - ₲ ${p.precio.toLocaleString('es-PY')}`, p.id);
        if (p.categoria === 'Producto') {
            productsSpinner.add(option);
        } else {
            drinksSpinner.add(option);
        }
    });
}

function setupCreateOrderForm() {
    document.getElementById('add-product-btn').onclick = () => {
        const id = document.getElementById('products-spinner').value;
        const quantity = parseInt(document.getElementById('product-quantity').value);
        addItemToOrder(id, quantity);
    };
    document.getElementById('add-drink-btn').onclick = () => {
        const id = document.getElementById('drinks-spinner').value;
        const quantity = parseInt(document.getElementById('drink-quantity').value);
        addItemToOrder(id, quantity);
    };
    document.getElementById('delivery-cost').oninput = updateTotal;
    document.getElementById('createOrderButton').onclick = createOrder;
}

function addItemToOrder(productId, quantity) {
    if (!productId || isNaN(quantity) || quantity <= 0) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = selectedItems.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        selectedItems.push({ ...product, quantity });
    }
    renderSelectedItems();
    updateTotal();
}

function renderSelectedItems() {
    const container = document.getElementById('selected-items-container');
    container.innerHTML = '';
    selectedItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'selected-item';
        itemDiv.innerHTML = `
            <span>${item.quantity}x ${item.nombre}</span>
            <span>₲ ${(item.precio * item.quantity).toLocaleString('es-PY')}</span>
            <button class="remove-item-btn" data-index="${index}">&times;</button>
        `;
        container.appendChild(itemDiv);
    });
    container.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.onclick = () => {
            selectedItems.splice(btn.dataset.index, 1);
            renderSelectedItems();
            updateTotal();
        };
    });
}

function updateTotal() {
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
    const deliveryCost = parseFloat(document.getElementById('delivery-cost').value) || 0;
    const total = subtotal + deliveryCost;
    document.getElementById('total-display').textContent = `Total: ₲ ${total.toLocaleString('es-PY')}`;
}

async function createOrder() {
    const formError = document.getElementById('form-error');
    formError.textContent = '';
    const nombreCliente = document.getElementById('customer-name').value.trim();
    const direccionCliente = document.getElementById('delivery-address').value.trim();
    const costoDelivery = parseFloat(document.getElementById('delivery-cost').value);

    if (!nombreCliente || !direccionCliente || isNaN(costoDelivery) || selectedItems.length === 0) {
        formError.textContent = 'Completa todos los campos y añade al menos un producto.';
        return;
    }
    
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
    const total = subtotal + costoDelivery;
    const metodoPago = document.querySelector('input[name="payment"]:checked').value;
    
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    const restauranteLocationUrl = userDoc.data().locationUrl;
    
    const nuevoPedido = {
        nombreCliente,
        direccionCliente,
        telefonoCliente: document.getElementById('customer-phone').value.trim(),
        costoDelivery,
        total,
        restauranteId: currentUserId,
        direccionRestaurante: restauranteLocationUrl,
        estado: "Pendiente",
        timestamp: serverTimestamp(),
        metodoPago,
        items: selectedItems.map(item => ({ nombre: item.nombre, cantidad: item.quantity, precio: item.precio }))
    };

    try {
        await addDoc(collection(db, "pedidos"), nuevoPedido);
        alert("Pedido creado con éxito.");
        // Reset form
        document.getElementById('create-order-form').reset();
        selectedItems = [];
        renderSelectedItems();
        updateTotal();
    } catch (e) {
        console.error("Error al crear el pedido: ", e);
        formError.textContent = "No se pudo crear el pedido.";
    }
}


// --- Historial de Pedidos ---
function listenToOrders() {
    const container = document.getElementById('restaurant-orders-container');
    const q = query(collection(db, "pedidos"), where("restauranteId", "==", currentUserId), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p>Aún no tienes pedidos.</p>';
            return;
        }
        snapshot.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            const card = document.createElement('div');
            card.className = 'order-card';
            const orderDate = order.timestamp ? order.timestamp.toDate().toLocaleString('es-ES') : 'Fecha no disponible';
            card.innerHTML = `
                <h3>Pedido para: ${order.nombreCliente}</h3>
                <p><strong>Total:</strong> ₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
                <p><strong>Estado:</strong> <span class="status status-${(order.estado || 'pendiente').toLowerCase().replace(/ /g, '_')}">${order.estado}</span></p>
                <small>${orderDate}</small>
                <button class="action-btn" data-id="${order.id}">Ver Detalles</button>
            `;
            container.appendChild(card);
        });
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.onclick = () => showOrderDetails(btn.dataset.id);
        });
    });
}

// --- Modales (Detalles y Edición de Pedidos) ---
function setupModalListeners() {
    const detailModal = document.getElementById('order-detail-modal');
    const editModal = document.getElementById('edit-order-modal');

    detailModal.querySelector('.close-button').onclick = () => detailModal.style.display = 'none';
    editModal.querySelector('.close-button-edit').onclick = () => editModal.style.display = 'none';
    
    window.onclick = (event) => {
        if (event.target == detailModal) detailModal.style.display = 'none';
        if (event.target == editModal) editModal.style.display = 'none';
    };
}

async function showOrderDetails(orderId) {
    const detailModal = document.getElementById('order-detail-modal');
    const docSnap = await getDoc(doc(db, "pedidos", orderId));
    if (docSnap.exists()) {
        const order = {id: docSnap.id, ...docSnap.data()};
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <p><strong>Cliente:</strong> ${order.nombreCliente}</p>
            <p><strong>Teléfono:</strong> ${order.telefonoCliente || 'N/A'}</p>
            <p><strong>Dirección:</strong> ${order.direccionCliente}</p>
            <p><strong>Total:</strong> ₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
            <p><strong>Estado Actual:</strong> ${order.estado}</p>
            <h4>Items:</h4>
            <ul>${(order.items || []).map(item => `<li>${item.cantidad}x ${item.nombre}</li>`).join('')}</ul>
        `;
        detailModal.style.display = 'flex';
        
        document.getElementById('edit-order-info-btn').onclick = () => showEditOrderModal(order);
        document.getElementById('manage-status-btn').onclick = () => manageOrderStatus(order);
    }
}

function showEditOrderModal(order) {
    const editModal = document.getElementById('edit-order-modal');
    document.getElementById('edit-order-id').value = order.id;
    document.getElementById('edit-customer-name').value = order.nombreCliente;
    document.getElementById('edit-customer-phone').value = order.telefonoCliente;
    document.getElementById('edit-delivery-address').value = order.direccionCliente;
    document.getElementById('edit-delivery-cost').value = order.costoDelivery;
    editModal.style.display = 'flex';
    
    document.getElementById('save-order-changes-btn').onclick = async () => {
        const orderId = document.getElementById('edit-order-id').value;
        const subtotal = (order.total || 0) - (order.costoDelivery || 0);
        const newDeliveryCost = parseFloat(document.getElementById('edit-delivery-cost').value) || 0;
        const updates = {
            nombreCliente: document.getElementById('edit-customer-name').value,
            telefonoCliente: document.getElementById('edit-customer-phone').value,
            direccionCliente: document.getElementById('edit-delivery-address').value,
            costoDelivery: newDeliveryCost,
            total: subtotal + newDeliveryCost
        };
        await updateDoc(doc(db, 'pedidos', orderId), updates);
        alert("Pedido actualizado.");
        editModal.style.display = 'none';
        document.getElementById('order-detail-modal').style.display = 'none';
    };
}

async function manageOrderStatus(order) {
    const action = prompt("Elige una acción: 'listo', 'en camino', 'entregado', 'cancelar' o 'eliminar'");
    if (!action) return;

    const actionLower = action.toLowerCase();
    
    if (actionLower === 'eliminar') {
        if (confirm("¿Estás seguro de ELIMINAR este pedido? La acción es permanente.")) {
            await deleteDoc(doc(db, 'pedidos', order.id));
            alert("Pedido eliminado.");
            document.getElementById('order-detail-modal').style.display = 'none';
        }
        return;
    }

    let nuevoEstado = '';
    switch(actionLower) {
        case 'listo': nuevoEstado = 'available'; break; // Para que lo vea el repartidor
        case 'en camino': nuevoEstado = 'En camino'; break;
        case 'entregado': nuevoEstado = 'Entregado'; break;
        case 'cancelar': nuevoEstado = 'Cancelado'; break;
        default: alert("Acción no válida."); return;
    }
    
    await updateDoc(doc(db, 'pedidos', order.id), { estado: nuevoEstado });
    alert(`Estado del pedido actualizado a: ${nuevoEstado}`);
    document.getElementById('order-detail-modal').style.display = 'none';
}


// --- Perfil ---
async function loadProfile() {
    const docSnap = await getDoc(doc(db, "users", currentUserId));
    if (docSnap.exists()) {
        document.getElementById('profile-name').value = docSnap.data().nombreRestaurante || '';
        document.getElementById('profile-location-url').value = docSnap.data().locationUrl || '';
    }
}

document.getElementById('save-profile-btn').addEventListener('click', () => {
    const nombre = document.getElementById('profile-name').value.trim();
    const url = document.getElementById('profile-location-url').value.trim();
    if (nombre && url) {
        updateDoc(doc(db, "users", currentUserId), {
            nombreRestaurante: nombre,
            locationUrl: url
        }).then(() => alert("Perfil actualizado."));
    } else {
        alert("Por favor, completa ambos campos del perfil.");
    }
});


// --- Cierre de Sesión ---
document.getElementById('logoutButton').addEventListener('click', () => {
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});