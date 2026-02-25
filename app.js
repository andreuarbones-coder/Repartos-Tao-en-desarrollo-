// Captura global de errores
window.addEventListener('error', function (e) {
    console.error('Error capturado:', e.error);
    alert('Error inesperado en la aplicación: ' + (e.error?.message || e.message));
});

(function () {
    console.log('Iniciando aplicación...');

    // --- Configuración de Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyD4iPoxUkrOWdyWkMDnOSdoDJNg96SUKTs",
        authDomain: "repartos-tao.firebaseapp.com",
        projectId: "repartos-tao",
        storageBucket: "repartos-tao.firebasestorage.app",
        messagingSenderId: "794636373269",
        appId: "1:794636373269:web:12bb9f59b8fc50fe79ad1c"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const storage = firebase.storage();

    // Persistencia offline
    db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistencia:', err));

    // Colecciones
    const refs = {
        customers: db.collection('customers'),
        products: db.collection('products'),
        orders: db.collection('orders')
    };

    // --- Estado Centralizado ---
    const state = {
        customers: [],
        products: [],
        orders: [],
        currentView: 'orders'
    };

    // --- Utilidades DOM ---
    const getEl = (id) => document.getElementById(id);
    const loader = getEl('globalLoader');

    // Wrapper para operaciones asíncronas (Evita repetir try/catch y loader)
    async function withLoader(actionMsg, asyncFunc) {
        if (loader) loader.classList.remove('hidden');
        try {
            await asyncFunc();
        } catch (e) {
            console.error(`Error en [${actionMsg}]:`, e);
            alert(`Error: ${actionMsg}. Revisá la consola.`);
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    }

    // --- Inicialización y Suscripciones (Optimizado) ---
    function subscribeAndLoad() {
        return Promise.all(['customers', 'products', 'orders'].map(collectionName => {
            return new Promise((resolve) => {
                let isFirstLoad = true;
                let query = refs[collectionName];

                if (collectionName === 'orders') query = query.orderBy('date', 'desc');
                else query = query.orderBy('name');

                query.onSnapshot(snap => {
                    state[collectionName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    if (collectionName === 'products') updateProductDatalist();

                    // Solo renderizamos si es la vista actual
                    if (state.currentView === collectionName) renderView(collectionName);

                    if (isFirstLoad) {
                        isFirstLoad = false;
                        resolve();
                    }
                }, err => console.error(`Error en suscripción de ${collectionName}:`, err));
            });
        }));
    }

    async function initApp() {
        await withLoader('Cargando datos iniciales', async () => {
            await subscribeAndLoad();
            setActiveView('orders');
        });
    }

    // --- Navegación ---
    function setActiveView(view) {
        state.currentView = view;
        document.querySelectorAll('.views-container > div').forEach(div => div.classList.remove('active-view'));
        const viewEl = getEl(`view-${view}`);
        if (viewEl) viewEl.classList.add('active-view');

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        renderView(view);
    }

    // --- Vistas ---
    function renderView(view) {
        if (view === 'orders') renderOrders();
        else if (view === 'customers') renderCustomers();
        else if (view === 'products') renderProductsList();
    }

    // --- Render Orders ---
    function renderOrders() {
        const ordersListDiv = getEl('ordersList');
        if (!ordersListDiv) return;

        const filterText = getEl('searchOrders')?.value.toLowerCase() || '';
        const filterStatus = getEl('statusFilter')?.value || 'todos';
        const from = getEl('dateFrom')?.value || '';
        const to = getEl('dateTo')?.value || '';

        const filtered = state.orders.filter(o => {
            if (filterStatus !== 'todos' && o.status !== filterStatus) return false;
            const d = o.date ? o.date.split('T')[0] : '';
            if (from && d < from) return false;
            if (to && d > to) return false;
            if (filterText) {
                const c = state.customers.find(c => c.id === o.customerId) || {};
                const txt = `${c.name} ${c.phone || ''} ${c.address || ''} ${c.email || ''} ${o.comments || ''} ${o.items.map(i => i.productName).join(' ')}`.toLowerCase();
                return txt.includes(filterText);
            }
            return true;
        });

        if (!filtered.length) {
            ordersListDiv.innerHTML = '<p class="card">No hay pedidos.</p>';
            return;
        }

        let html = '<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Productos</th><th>Comentarios</th><th>Acciones</th></tr></thead><tbody>';
        filtered.forEach(o => {
            const c = state.customers.find(c => c.id === o.customerId) || { name: '?' };
            const itemsHtml = o.items.map(i => `<li>${i.productName} x${i.quantity} ($${i.price})</li>`).join('');
            html += `<tr>
                <td data-label="Fecha">${o.date ? new Date(o.date).toLocaleString() : ''}</td>
                <td data-label="Cliente">${c.name}</td>
                <td data-label="Estado">
                    <span class="badge ${o.status}" data-action="toggle-status" data-id="${o.id}">${o.status}</span>
                    <div class="status-menu hidden" id="status-menu-${o.id}">
                        <button data-status="pendiente" data-id="${o.id}">Pendiente</button>
                        <button data-status="entregado" data-id="${o.id}">Entregado</button>
                        <button data-status="incompleto" data-id="${o.id}">Incompleto</button>
                    </div>
                </td>
                <td data-label="Productos"><ul class="product-list">${itemsHtml}</ul></td>
                <td data-label="Comentarios">${o.comments || ''}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="edit-order" data-id="${o.id}">✏️</button>
                    <button class="icon-btn" data-action="delete-order" data-id="${o.id}">🗑️</button>
                    ${o.ticketPhoto ? `<button class="icon-btn" data-action="view-photo" data-photo="${o.ticketPhoto}">📷</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        ordersListDiv.innerHTML = html;
    }

    // --- Render Customers ---
    function renderCustomers() {
        const customersListDiv = getEl('customersList');
        if (!customersListDiv) return;

        if (!state.customers.length) {
            customersListDiv.innerHTML = '<p class="card">No hay clientes.</p>';
            return;
        }
        let html = '<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Email</th><th>Acciones</th></tr></thead><tbody>';
        state.customers.forEach(c => {
            html += `<tr>
                <td data-label="Nombre">${c.name}</td>
                <td data-label="Teléfono">${c.phone || ''}</td>
                <td data-label="Dirección">${c.address || ''}</td>
                <td data-label="Email">${c.email || ''}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="edit-customer" data-id="${c.id}">✏️</button>
                    <button class="icon-btn" data-action="delete-customer" data-id="${c.id}">🗑️</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        customersListDiv.innerHTML = html;
    }

    // --- Render Products ---
    function renderProductsList() {
        const productListDiv = getEl('productList');
        if (!productListDiv) return;

        if (!state.products.length) {
            productListDiv.innerHTML = '<p>No hay productos cargados.</p>';
            return;
        }
        let html = '<table><thead><tr><th>Nombre</th><th>Precio</th><th>Acciones</th></tr></thead><tbody>';
        state.products.slice(0, 100).forEach(p => {
            html += `<tr>
                <td data-label="Nombre">${p.name}</td>
                <td data-label="Precio">${p.price ? '$' + p.price : '-'}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="delete-product" data-id="${p.id}">🗑️</button>
                </td>
            </tr>`;
        });
        if (state.products.length > 100) html += `<tr><td colspan="3">... y ${state.products.length - 100} más</td></tr>`;
        html += '</tbody></table>';
        productListDiv.innerHTML = html;
    }

    function updateProductDatalist() {
        let datalist = getEl('productDatalist');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'productDatalist';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = state.products.map(p => `<option value="${p.name}">${p.price ? '$' + p.price : ''}</option>`).join('');
    }

    // --- Delegación de Eventos Global (Mejora de Performance) ---
    document.addEventListener('click', async e => {
        const target = e.target;

        // Cerrar menús de estado si clickea afuera
        if (!target.closest('.status-menu') && !target.closest('[data-action="toggle-status"]')) {
            document.querySelectorAll('.status-menu').forEach(m => m.classList.add('hidden'));
        }

        // Acciones de UI basadas en atributos data-action
        const actionBtn = target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;

        switch (action) {
            case 'edit-order':
                openOrderModal(id); break;
            case 'delete-order':
                if (confirm('¿Eliminar pedido?')) await withLoader('Eliminando pedido', () => refs.orders.doc(id).delete());
                break;
            case 'view-photo':
                const modalImage = getEl('modalImage');
                const imageModal = getEl('imageModal');
                if (modalImage && imageModal) {
                    modalImage.src = actionBtn.dataset.photo;
                    imageModal.style.display = 'flex';
                }
                break;
            case 'toggle-status':
                const menu = getEl(`status-menu-${id}`);
                if (menu) {
                    document.querySelectorAll('.status-menu').forEach(m => m.classList.add('hidden'));
                    const rect = actionBtn.getBoundingClientRect();
                    menu.style.top = rect.bottom + window.scrollY + 'px';
                    menu.style.left = rect.left + window.scrollX + 'px';
                    menu.classList.remove('hidden');
                }
                break;
            case 'edit-customer':
                openCustomerModal(id); break;
            case 'delete-customer':
                if (state.orders.some(o => o.customerId === id)) {
                    alert('Cliente tiene pedidos, no se puede eliminar');
                    return;
                }
                if (confirm('¿Eliminar cliente?')) await withLoader('Eliminando cliente', () => refs.customers.doc(id).delete());
                break;
            case 'delete-product':
                if (confirm('¿Eliminar producto?')) await withLoader('Eliminando producto', () => refs.products.doc(id).delete());
                break;
        }

        // Cambiar estado desde el menú flotante
        if (target.matches('.status-menu button')) {
            const status = target.dataset.status;
            const orderId = target.dataset.id;
            await withLoader('Actualizando estado', () => refs.orders.doc(orderId).update({ status }));
            target.closest('.status-menu').classList.add('hidden');
        }
    });

    // --- Funciones de Formulario (Modales) ---
    function openOrderModal(id) {
        const orderForm = getEl('orderForm');
        orderForm.reset();
        getEl('orderId').value = '';
        getEl('productsContainer').innerHTML = '';
        const previewContainer = getEl('photoPreviewContainer');
        previewContainer.innerHTML = ''; // Limpiar previsualización

        const select = getEl('customerSelect');
        select.innerHTML = '<option value="">Seleccionar cliente</option>' + state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        if (id) {
            const o = state.orders.find(order => order.id === id);
            if (o) {
                getEl('orderId').value = o.id;
                select.value = o.customerId;
                getEl('orderDate').value = o.date;
                getEl('orderStatus').value = o.status;
                getEl('orderComments').value = o.comments || '';
                o.items.forEach(item => addProductRow(item));

                // Mostrar previsualización del archivo existente
                if (o.ticketPhoto) {
                    showFilePreview(o.ticketPhoto, previewContainer, true);
                }
            }
        } else {
            // Setup default date
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            getEl('orderDate').value = now.toISOString().slice(0, 16);
            addProductRow();
        }
        getEl('orderModal').style.display = 'flex';
    }

    function showFilePreview(fileUrl, container, isExisting = false) {
        container.innerHTML = ''; // Limpiar previo
        const isPdf = fileUrl.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            const pdfDiv = document.createElement('div');
            pdfDiv.className = 'pdf-preview';
            pdfDiv.innerHTML = `
                <span>📄 PDF - ${fileUrl.split('/').pop()}</span>
                <button type="button" class="remove-file-btn" data-remove-file>Eliminar</button>
            `;
            container.appendChild(pdfDiv);
        } else {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.className = 'photo-preview';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-file-btn';
            removeBtn.textContent = 'Eliminar';
            removeBtn.style.display = 'block';
            removeBtn.style.marginTop = '0.5rem';
            container.appendChild(img);
            container.appendChild(removeBtn);
        }

        // Botón de eliminar (funciona igual para ambos casos)
        container.querySelector('[data-remove-file], .remove-file-btn')?.addEventListener('click', () => {
            container.innerHTML = ''; // Eliminar previsualización
            getEl('ticketPhoto').value = ''; // Limpiar input file
        });
    }

    // Evento change del input file para previsualizar antes de guardar
    getEl('ticketPhoto')?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const container = getEl('photoPreviewContainer');
        container.innerHTML = ''; // Limpiar previsualización anterior

        if (file.type === 'application/pdf') {
            // Crear URL de objeto para el PDF
            const url = URL.createObjectURL(file);
            // Mostrar nombre y botón eliminar
            const pdfDiv = document.createElement('div');
            pdfDiv.className = 'pdf-preview';
            pdfDiv.innerHTML = `
                <span>📄 ${file.name}</span>
                <button type="button" class="remove-file-btn" data-remove-file>Eliminar</button>
            `;
            container.appendChild(pdfDiv);
            // Para poder ver el PDF, podríamos agregar un enlace "Ver PDF" que abra la URL en otra pestaña
            const viewLink = document.createElement('a');
            viewLink.href = url;
            viewLink.target = '_blank';
            viewLink.textContent = 'Ver PDF';
            viewLink.style.marginLeft = '1rem';
            pdfDiv.appendChild(viewLink);
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.className = 'photo-preview';
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-file-btn';
                removeBtn.textContent = 'Eliminar';
                removeBtn.style.display = 'block';
                removeBtn.style.marginTop = '0.5rem';
                container.appendChild(img);
                container.appendChild(removeBtn);
            };
            reader.readAsDataURL(file);
        } else {
            alert('Tipo de archivo no soportado. Seleccioná una imagen o PDF.');
            e.target.value = ''; // Limpiar input
            return;
        }

        // Evento para el botón eliminar dentro de la previsualización recién creada
        container.querySelector('[data-remove-file], .remove-file-btn')?.addEventListener('click', () => {
            container.innerHTML = '';
            getEl('ticketPhoto').value = '';
        });
    });

    function addProductRow(item) {
        const container = getEl('productsContainer');
        const div = document.createElement('div');
        div.className = 'product-item';
        div.innerHTML = `
            <input type="text" placeholder="Producto" list="productDatalist" value="${item ? item.productName : ''}" class="product-name">
            <input type="number" placeholder="Cant" value="${item ? item.quantity : 1}" min="1" style="width:80px;" class="product-qty">
            <input type="number" placeholder="Precio" value="${item ? item.price : ''}" min="0" step="0.01" style="width:100px;" class="product-price">
            <button type="button" class="remove-product">✕</button>
        `;
        div.querySelector('.remove-product').addEventListener('click', () => div.remove());
        container.appendChild(div);
    }

    // --- CRUD con Wrapper Async ---
    async function saveCustomer(cust) {
        await withLoader('Guardando cliente', async () => {
            if (cust.id) await refs.customers.doc(cust.id).set(cust);
            else await refs.customers.add(cust);
        });
    }

    async function saveOrder(order, file) {
        await withLoader('Guardando pedido', async () => {
            if (file) {
                const ref = storage.ref(`tickets/${Date.now()}_${file.name}`);
                await ref.put(file);
                order.ticketPhoto = await ref.getDownloadURL();
            } else {
                // Si no hay archivo, pero existe previsualización (porque no se tocó), mantener el existente.
                // Si no hay previsualización, entonces no hay archivo.
                const previewContainer = getEl('photoPreviewContainer');
                if (previewContainer && previewContainer.children.length === 0) {
                    order.ticketPhoto = '';
                } else {
                    // Si hay previsualización pero no es de un archivo nuevo, significa que es la existente.
                    // Ya la tenemos en order.ticketPhoto (del objeto order actual).
                    // Solo la mantenemos.
                }
            }

            const { id, ...orderData } = order;
            if (id) await refs.orders.doc(id).set(orderData);
            else await refs.orders.add(orderData);
        });
    }

    // Bindings estáticos (solo se asocian 1 vez)
    getEl('addProductBtn')?.addEventListener('click', () => addProductRow());

    // Bindear filtros
    ['searchOrders', 'statusFilter', 'dateFrom', 'dateTo'].forEach(id => {
        getEl(id)?.addEventListener('input', renderOrders);
    });

    // Cerrar modales (clic afuera)
    window.addEventListener('click', e => {
        if (e.target.matches('.modal')) e.target.style.display = 'none';
    });
    document.querySelectorAll('.close, .cancel-btn, #cancelOrderBtn, #cancelQuickBtn, #cancelCustomerBtn').forEach(btn => {
        btn.addEventListener('click', e => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    // Botón nuevo pedido
    getEl('newOrderBtn')?.addEventListener('click', () => openOrderModal());

    // Botón cliente rápido
    getEl('quickAddCustomerBtn')?.addEventListener('click', () => {
        getEl('quickCustomerModal').style.display = 'flex';
    });
    getEl('quickCustomerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const cust = {
            name: getEl('quickName').value.trim(),
            phone: getEl('quickPhone').value.trim(),
            address: getEl('quickAddress').value.trim(),
            email: getEl('quickEmail').value.trim()
        };
        if (!cust.name) return alert('Nombre obligatorio');
        await saveCustomer(cust);
        getEl('quickCustomerModal').style.display = 'none';
        // Actualizar select de clientes en el modal de pedido (se actualizará por la suscripción)
    });

    // Botón nuevo cliente normal
    getEl('newCustomerBtn')?.addEventListener('click', () => {
        getEl('customerModalTitle').textContent = '👤 Nuevo Cliente';
        getEl('customerForm').reset();
        getEl('customerId').value = '';
        getEl('customerModal').style.display = 'flex';
    });

    getEl('customerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const cust = {
            id: getEl('customerId').value || undefined,
            name: getEl('customerName').value.trim(),
            phone: getEl('customerPhone').value.trim(),
            address: getEl('customerAddress').value.trim(),
            email: getEl('customerEmail').value.trim()
        };
        if (!cust.name) return alert('Nombre obligatorio');
        await saveCustomer(cust);
        getEl('customerModal').style.display = 'none';
    });

    // Envío de formulario de pedido
    getEl('orderForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const customerId = getEl('customerSelect').value;
        if (!customerId) return alert('Seleccioná un cliente');
        const items = [];
        document.querySelectorAll('#productsContainer .product-item').forEach(row => {
            const name = row.querySelector('.product-name').value.trim();
            if (!name) return;
            items.push({
                productName: name,
                quantity: parseInt(row.querySelector('.product-qty').value) || 1,
                price: parseFloat(row.querySelector('.product-price').value) || 0
            });
        });
        if (!items.length) return alert('Agregá al menos un producto');

        const fileInput = getEl('ticketPhoto');
        const file = fileInput.files[0];

        const order = {
            id: getEl('orderId').value || undefined,
            customerId,
            date: getEl('orderDate').value,
            status: getEl('orderStatus').value,
            comments: getEl('orderComments').value,
            items,
            ticketPhoto: getEl('orderId').value ? state.orders.find(o => o.id === getEl('orderId').value)?.ticketPhoto || '' : ''
        };

        await saveOrder(order, file);
        getEl('orderModal').style.display = 'none';
    });

    // --- Inicialización de la app ---
    initApp();
})();
