function createDraftOrderState() {
  return {
    channel: "dine-in",
    priority: "normal",
    quantities: {},
    tableId: ""
  };
}

function createEditOrderState() {
  return {
    orderId: "",
    quantities: {}
  };
}

function createMenuFormState() {
  return {
    id: "",
    name: "",
    category: "food",
    station: "hot line",
    margin: "medium",
    price: "",
    availability: "available",
    imageUrl: ""
  };
}

function createPaymentFormState() {
  return {
    amount: "",
    method: "cash",
    note: ""
  };
}

function createInventoryFormState() {
  return {
    id: "",
    lastUnitCost: "",
    name: "",
    onHand: "",
    reorderLevel: "",
    supplier: "",
    unit: ""
  };
}

function createPurchaseFormState() {
  return {
    note: "",
    quantity: "",
    stockItemId: "",
    supplier: "",
    unitCost: ""
  };
}

function createTableFormState() {
  return {
    id: "",
    customerName: "",
    notes: "",
    partySize: "",
    seats: "",
    server: "",
    status: "available"
  };
}

function createLoginFormState() {
  return {
    username: "",
    password: ""
  };
}

const authTokenStorageKey = "restaurant-management-system-token";

const state = {
  auth: {
    loginForm: createLoginFormState(),
    token: readStoredToken(),
    user: null
  },
  busy: false,
  dashboard: null,
  draftOrder: createDraftOrderState(),
  editOrder: createEditOrderState(),
  inventoryForm: createInventoryFormState(),
  menuForm: createMenuFormState(),
  notice: "",
  noticeTone: "neutral",
  paymentForm: createPaymentFormState(),
  paymentReceipt: null,
  purchaseForm: createPurchaseFormState(),
  reports: null,
  tableForm: createTableFormState(),
  receipt: {
    orderId: "",
    splitCount: 1,
    data: null
  }
};

function currencyFormatter() {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fetchJson(url, options) {
  const requestOptions = Object.assign({}, options);
  requestOptions.headers = Object.assign({}, requestOptions.headers);

  if (state.auth.token) {
    requestOptions.headers.Authorization = "Bearer " + state.auth.token;
  }

  if (requestOptions.body && typeof requestOptions.body !== "string") {
    requestOptions.body = JSON.stringify(requestOptions.body);
    requestOptions.headers["Content-Type"] = "application/json";
  }

  return fetch(url, requestOptions).then(async function onResponse(response) {
    const payload = await response
      .text()
      .then(function parseText(text) {
        return text ? JSON.parse(text) : {};
      })
      .catch(function onParseError() {
        return {};
      });

    if (!response.ok) {
      const error = new Error(payload.error || "Request failed for " + url);
      error.statusCode = response.status;

      if (response.status === 401 && url !== "/api/auth/login" && url !== "/api/auth/session") {
        clearAuthSession();
      }

      throw error;
    }

    return payload;
  });
}

function setNotice(message, tone) {
  state.notice = message;
  state.noticeTone = tone || "neutral";
}

function clearNotice() {
  setNotice("", "neutral");
}

function resetDraftOrder() {
  state.draftOrder = createDraftOrderState();
}

function resetEditOrder() {
  state.editOrder = createEditOrderState();
}

function resetMenuForm() {
  state.menuForm = createMenuFormState();
}

function resetPaymentForm() {
  state.paymentForm = createPaymentFormState();
}

function resetInventoryForm() {
  state.inventoryForm = createInventoryFormState();
}

function resetPurchaseForm() {
  state.purchaseForm = createPurchaseFormState();
}

function resetTableForm() {
  state.tableForm = createTableFormState();
}

function clearReceipt() {
  state.receipt = {
    orderId: "",
    splitCount: 1,
    data: null
  };
  state.paymentReceipt = null;
  resetPaymentForm();
}

function readStoredToken() {
  try {
    return window.localStorage.getItem(authTokenStorageKey) || "";
  } catch (error) {
    return "";
  }
}

function writeStoredToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(authTokenStorageKey, token);
    } else {
      window.localStorage.removeItem(authTokenStorageKey);
    }
  } catch (error) {
    // Ignore storage failures and continue with in-memory sessions.
  }
}

function resetWorkspaceState() {
  resetDraftOrder();
  resetEditOrder();
  resetMenuForm();
  resetInventoryForm();
  resetPurchaseForm();
  resetTableForm();
  clearReceipt();
}

function clearAuthSession() {
  state.auth.token = "";
  state.auth.user = null;
  state.dashboard = null;
  state.reports = null;
  state.busy = false;
  writeStoredToken("");
  resetWorkspaceState();
}

function isAuthenticated() {
  return Boolean(state.auth.user);
}

function isAdminUser() {
  return state.auth.user && state.auth.user.role === "admin";
}

function isCashierUser() {
  return state.auth.user && state.auth.user.role === "cashier";
}

function isKitchenUser() {
  return state.auth.user && state.auth.user.role === "kitchen";
}

function getDashboardEndpoint() {
  return isKitchenUser() ? "/api/kitchen/dashboard" : "/api/dashboard";
}

function getSelectableTables(tables) {
  return tables.filter(function isAvailable(table) {
    return !table.currentOrderId && (table.status === "available" || table.status === "reserved");
  });
}

function getOrderById(orderId) {
  if (!state.dashboard) {
    return null;
  }

  return (
    (state.dashboard.orders || []).find(function hasId(order) {
      return order.id === orderId;
    }) || null
  );
}

function getMenuItemById(menuItemId) {
  if (!state.dashboard) {
    return null;
  }

  return (
    (state.dashboard.menuHighlights || []).find(function hasId(item) {
      return item.id === menuItemId;
    }) || null
  );
}

function getStockItemById(stockItemId) {
  if (!state.dashboard) {
    return null;
  }

  return (
    (state.dashboard.inventoryItems || []).find(function hasId(item) {
      return item.id === stockItemId;
    }) || null
  );
}

function getTableById(tableId) {
  if (!state.dashboard) {
    return null;
  }

  return (
    (state.dashboard.tables || []).find(function hasId(table) {
      return table.id === tableId;
    }) || null
  );
}

function getOrderBalanceDue(order) {
  if (!order) {
    return 0;
  }

  return order.balanceDue == null ? order.total : order.balanceDue;
}

function isOrderEditable(order) {
  return order.status === "pending" || order.status === "preparing";
}

function extractQuantitiesFromOrder(order) {
  return order.items.reduce(function toQuantities(result, item) {
    result[item.menuItemId] = item.quantity;
    return result;
  }, {});
}

function getQuantitiesTotal(menuItems, quantities) {
  return Object.keys(quantities).reduce(function sumTotal(total, menuItemId) {
    const menuItem = menuItems.find(function hasId(item) {
      return item.id === menuItemId;
    });

    if (!menuItem) {
      return total;
    }

    return total + menuItem.price * Number(quantities[menuItemId] || 0);
  }, 0);
}

function syncDraftOrder() {
  if (!state.dashboard) {
    return;
  }

  if (state.draftOrder.channel !== "dine-in") {
    state.draftOrder.tableId = "";
    return;
  }

  const selectableTables = getSelectableTables(state.dashboard.tables);
  const stillAvailable = selectableTables.some(function matchesSelection(table) {
    return table.id === state.draftOrder.tableId;
  });

  if (!stillAvailable) {
    state.draftOrder.tableId = selectableTables.length > 0 ? selectableTables[0].id : "";
  }
}

function syncPurchaseForm() {
  if (!state.dashboard) {
    return;
  }

  const inventoryItems = state.dashboard.inventoryItems || [];
  const selectedExists = inventoryItems.some(function matchesSelection(item) {
    return item.id === state.purchaseForm.stockItemId;
  });

  if (!selectedExists) {
    state.purchaseForm.stockItemId = inventoryItems.length > 0 ? inventoryItems[0].id : "";
  }
}

function syncTransientSelections() {
  if (!state.dashboard) {
    return;
  }

  if (isKitchenUser()) {
    resetWorkspaceState();
    return;
  }

  syncDraftOrder();
  syncPurchaseForm();

  if (state.editOrder.orderId) {
    const order = getOrderById(state.editOrder.orderId);

    if (!order || !isOrderEditable(order)) {
      resetEditOrder();
    } else {
      state.editOrder.quantities = extractQuantitiesFromOrder(order);
    }
  }

  if (state.receipt.orderId) {
    const order = getOrderById(state.receipt.orderId);

    if (!order) {
      clearReceipt();
    } else {
      state.receipt.data = null;
      state.paymentReceipt = null;
      if (!state.paymentForm.amount) {
        state.paymentForm.amount = String(getOrderBalanceDue(order));
      }
    }
  }

  if (state.inventoryForm.id && !getStockItemById(state.inventoryForm.id)) {
    resetInventoryForm();
  }

  if (state.tableForm.id && !getTableById(state.tableForm.id)) {
    resetTableForm();
  }
}

function setHeader(title, context) {
  document.getElementById("restaurant-name").textContent = title;
  document.getElementById("restaurant-context").textContent = context;
}

function refreshHeader(dashboard) {
  const contextParts = ["Business date " + dashboard.restaurant.businessDate];

  if (dashboard.restaurant.shift) {
    contextParts.push(dashboard.restaurant.shift);
  }

  if (state.auth.user) {
    contextParts.push(state.auth.user.name + " (" + state.auth.user.role + ")");
  }

  setHeader(dashboard.restaurant.name + " - " + dashboard.restaurant.branch, contextParts.join(" | "));
}

function renderMetricCards(metrics) {
  const formatCurrency = currencyFormatter();
  const cards = [
    {
      label: "Occupancy",
      value: metrics.occupancyRate + "%",
      accent: "warm"
    },
    {
      label: "Open Orders",
      value: String(metrics.openOrders),
      accent: "cool"
    },
    {
      label: "Revenue Today",
      value: formatCurrency.format(metrics.revenueToday),
      accent: "ink"
    },
    {
      label: "Average Ticket",
      value: formatCurrency.format(metrics.averageTicket),
      accent: "mint"
    },
    {
      label: "Unpaid Balance",
      value: formatCurrency.format(metrics.outstandingBalances || 0),
      accent: "ink"
    },
    {
      label: "Low Stock Alerts",
      value: String(metrics.lowStockItems),
      accent: "warm"
    },
    {
      label: "Staff on Shift",
      value: String(metrics.activeStaff),
      accent: "cool"
    }
  ];

  return cards
    .map(function toCard(card) {
      return (
        '<article class="metric-card metric-card-' +
        card.accent +
        '">' +
        '<p class="metric-label">' +
        escapeHtml(card.label) +
        "</p>" +
        '<h2 class="metric-value">' +
        escapeHtml(card.value) +
        "</h2>" +
        "</article>"
      );
    })
    .join("");
}

function renderNotice() {
  if (!state.notice) {
    return "";
  }

  return '<p class="notice notice-' + escapeHtml(state.noticeTone) + '">' + escapeHtml(state.notice) + "</p>";
}

function buildNotifications(dashboard) {
  const readyOrders = getKitchenOrders(dashboard.orders)
    .filter(function isReady(order) {
      return order.status === "ready";
    })
    .slice(0, 3)
    .map(function toReadyNotification(order) {
      return {
        id: "ready-" + order.id,
        label: "Ready",
        title: "Order " + order.id + " is ready",
        detail: (order.tableId || order.channel) + " | " + (order.summary || "No items"),
        tone: "ready"
      };
    });
  const stockNotifications = (dashboard.inventoryAlerts || []).slice(0, 3).map(function toStockNotification(alert) {
    return {
      id: "stock-" + alert.stockItemId,
      label: "Stock",
      title: alert.item + " is running low",
      detail: alert.remainingUnits + " " + (alert.unit || "units") + " left | reorder at " + alert.reorderLevel,
      tone: "stock"
    };
  });
  const paymentNotifications = (dashboard.orders || [])
    .filter(function hasBalance(order) {
      return order.status !== "completed" && order.status !== "cancelled" && Number(order.balanceDue || 0) > 0;
    })
    .sort(function compareBalances(left, right) {
      return Number(right.balanceDue || 0) - Number(left.balanceDue || 0);
    })
    .slice(0, 3)
    .map(function toPaymentReminder(order) {
      return {
        id: "payment-" + order.id,
        label: "Payment",
        title: "Payment pending for " + order.id,
        detail: (order.tableId || order.channel) + " | balance " + currencyFormatter().format(order.balanceDue || 0),
        tone: "payment"
      };
    });

  return readyOrders.concat(stockNotifications, paymentNotifications);
}

function renderNotificationFeed(dashboard) {
  const notifications = buildNotifications(dashboard);

  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Notifications</p><h2>Service alerts</h2></div><p class="panel-copy">Track ready tickets, low stock, and unpaid balances without leaving the shift view.</p></div>' +
    '<div class="card-grid">' +
    (notifications.length > 0
      ? notifications
          .map(function renderNotification(item) {
            return (
              '<article class="surface-card notification-card">' +
              '<div class="row-spread"><strong>' +
              escapeHtml(item.title) +
              '</strong><span class="status-pill status-' +
              escapeHtml(item.tone) +
              '">' +
              escapeHtml(item.label) +
              "</span></div>" +
              '<p class="detail-line">' +
              escapeHtml(item.detail) +
              "</p></article>"
            );
          })
          .join("")
      : '<p class="empty-state">No active alerts right now.</p>') +
    "</div></section>"
  );
}

function renderRoleChip(role) {
  return '<span class="role-chip role-chip-' + escapeHtml(role) + '">' + escapeHtml(role) + "</span>";
}

function getPriorityRank(priority) {
  return {
    rush: 0,
    normal: 1,
    low: 2
  }[priority] ?? 1;
}

function getKitchenStatusRank(status) {
  return {
    pending: 0,
    preparing: 1,
    ready: 2,
    served: 3,
    completed: 4,
    cancelled: 5
  }[status] ?? 9;
}

function getKitchenOrders(orders) {
  return (orders || [])
    .filter(function isKitchenOrder(order) {
      return order.status === "pending" || order.status === "preparing" || order.status === "ready";
    })
    .slice()
    .sort(function compareOrders(left, right) {
      const priorityDifference = getPriorityRank(left.priority) - getPriorityRank(right.priority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const statusDifference = getKitchenStatusRank(left.status) - getKitchenStatusRank(right.status);

      if (statusDifference !== 0) {
        return statusDifference;
      }

      if (left.placedOn !== right.placedOn) {
        return left.placedOn < right.placedOn ? -1 : 1;
      }

      return String(left.placedAt || "").localeCompare(String(right.placedAt || ""));
    });
}

function buildKitchenMetrics(orders) {
  return {
    openTickets: orders.length,
    rushTickets: orders.filter(function isRush(order) {
      return order.priority === "rush";
    }).length,
    readyTickets: orders.filter(function isReady(order) {
      return order.status === "ready";
    }).length
  };
}

function getKitchenViewModel() {
  const kitchenOrders = getKitchenOrders(state.dashboard ? state.dashboard.orders : []);

  if (isKitchenUser()) {
    return {
      metrics: state.dashboard.metrics,
      orders: state.dashboard.orders || [],
      restaurant: state.dashboard.restaurant
    };
  }

  return {
    metrics: buildKitchenMetrics(kitchenOrders),
    orders: kitchenOrders,
    restaurant: state.dashboard.restaurant
  };
}

function getKitchenPrimaryAction(order) {
  if (order.status === "pending") {
    return {
      label: "Start prep",
      nextStatus: "preparing"
    };
  }

  if (order.status === "preparing") {
    return {
      label: "Mark ready",
      nextStatus: "ready"
    };
  }

  return null;
}

function renderAuthBar() {
  return (
    '<section class="panel panel-wide auth-panel">' +
    '<div class="auth-bar">' +
    '<div><p class="panel-kicker">Session</p><h2>' +
    escapeHtml(state.auth.user.name) +
    '</h2><p class="panel-copy">@' +
    escapeHtml(state.auth.user.username) +
    "</p></div>" +
    '<div class="inline-actions">' +
    renderRoleChip(state.auth.user.role) +
    '<button class="ghost-action" type="button" data-auth-logout="true"' +
    (state.busy ? " disabled" : "") +
    '>Log out</button></div></div></section>'
  );
}

function renderLoginScreen() {
  setHeader("Little Operations Sign In", "Choose a staff account and continue service.");

  document.getElementById("app").innerHTML =
    '<section class="panel panel-wide login-panel">' +
    '<div class="panel-header"><div><p class="panel-kicker">Access</p><h2>Open a workstation</h2></div><p class="panel-copy">Use the role assigned to your shift.</p></div>' +
    renderNotice() +
    '<div class="login-grid">' +
    '<form id="login-form" class="form-stack">' +
    '<label class="field"><span class="field-label">Username</span><input class="input-control" type="text" data-login-field="username" value="' +
    escapeHtml(state.auth.loginForm.username) +
    '" autocomplete="username" /></label>' +
    '<label class="field"><span class="field-label">Password</span><input class="input-control" type="password" data-login-field="password" value="' +
    escapeHtml(state.auth.loginForm.password) +
    '" autocomplete="current-password" /></label>' +
    '<button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    '>Sign in</button></form>' +
    '<div class="surface-card credentials-card">' +
    '<p class="section-label">Demo accounts</p>' +
    '<div class="stack-list">' +
    '<button class="secondary-action" type="button" data-auth-preset="admin">Admin / admin123</button>' +
    '<button class="secondary-action" type="button" data-auth-preset="cashier">Cashier / cashier123</button>' +
    '<button class="secondary-action" type="button" data-auth-preset="kitchen">Kitchen / kitchen123</button>' +
    "</div></div></div></section>";
}

function renderItemPicker(menuItems, quantities, scope) {
  const formatCurrency = currencyFormatter();

  return (
    '<div class="menu-picker-grid">' +
    menuItems
      .map(function renderMenuPicker(item) {
        const quantity = Number(quantities[item.id] || 0);
        const disabled = item.availability === "unavailable" && quantity === 0;

        return (
          '<label class="surface-card menu-picker-card' +
          (disabled ? " menu-picker-card-disabled" : "") +
          '">' +
          '<div class="row-spread">' +
          "<strong>" +
          escapeHtml(item.name) +
          "</strong>" +
          '<span class="status-pill status-' +
          escapeHtml(item.availability) +
          '">' +
          escapeHtml(item.availability) +
          "</span>" +
          "</div>" +
          '<p class="detail-line">' +
          escapeHtml(item.category) +
          " | " +
          escapeHtml(item.station) +
          "</p>" +
          '<div class="quantity-row"><span class="muted-text">' +
          escapeHtml(formatCurrency.format(item.price)) +
          '</span><input class="quantity-input" type="number" min="0" max="20" step="1" value="' +
          escapeHtml(quantity) +
          '" data-quantity-scope="' +
          escapeHtml(scope) +
          '" data-quantity-input="' +
          escapeHtml(item.id) +
          '"' +
          (disabled ? " disabled" : "") +
          " /></div>" +
          "</label>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderOrderComposer(menuItems, tables) {
  const formatCurrency = currencyFormatter();
  const selectedTableId = state.draftOrder.tableId;
  const selectableTables = getSelectableTables(tables);
  const isDineIn = state.draftOrder.channel === "dine-in";
  const draftTotal = getQuantitiesTotal(menuItems, state.draftOrder.quantities);

  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">POS</p><h2>Create a new order</h2></div><p class="panel-copy">Start dine-in, takeaway, or delivery tickets and set item quantities before sending them to service.</p></div>' +
    '<form id="order-form" class="form-stack">' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">Service channel</span><select class="input-control" name="channel">' +
    ["dine-in", "takeaway", "delivery"]
      .map(function renderOption(channel) {
        const selected = channel === state.draftOrder.channel ? " selected" : "";
        return '<option value="' + escapeHtml(channel) + '"' + selected + ">" + escapeHtml(channel) + "</option>";
      })
      .join("") +
    "</select></label>" +
    '<label class="field' +
    (isDineIn ? "" : " field-hidden") +
    '"><span class="field-label">Table</span><select class="input-control" name="tableId"' +
    (isDineIn ? "" : " disabled") +
    ">" +
    (selectableTables.length > 0
      ? selectableTables
          .map(function renderTable(table) {
            const selected = table.id === selectedTableId ? " selected" : "";
            return (
              '<option value="' +
              escapeHtml(table.id) +
              '"' +
              selected +
              ">" +
              escapeHtml(table.id + " - " + table.seats + " seats - " + table.status) +
              "</option>"
            );
          })
          .join("")
      : '<option value="">No open tables</option>') +
    '</select></label><label class="field"><span class="field-label">Kitchen priority</span><select class="input-control" name="priority">' +
    ["rush", "normal", "low"]
      .map(function renderPriorityOption(priority) {
        const selected = priority === state.draftOrder.priority ? " selected" : "";
        return '<option value="' + priority + '"' + selected + ">" + priority + "</option>";
      })
      .join("") +
    "</select></label>" +
    "</div>" +
    renderItemPicker(menuItems, state.draftOrder.quantities, "draft") +
    '<div class="button-row"><div><p class="section-label">Draft total</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(draftTotal)) +
    '</p></div><button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    '>Create order</button></div>' +
    "</form>" +
    "</section>"
  );
}

function getTableAction(table) {
  if (table.status === "cleaning") {
    return {
      label: "Mark available",
      nextStatus: "available"
    };
  }

  if (table.status === "available") {
    return {
      label: "Reserve",
      nextStatus: "reserved"
    };
  }

  if (table.status === "reserved") {
    return {
      label: "Release",
      nextStatus: "available"
    };
  }

  return null;
}

function getOrderPrimaryAction(order) {
  if (order.status === "pending") {
    return {
      label: "Start prep",
      nextStatus: "preparing"
    };
  }

  if (order.status === "preparing") {
    return {
      label: "Mark ready",
      nextStatus: "ready"
    };
  }

  if (order.status === "ready") {
    return {
      label: "Mark served",
      nextStatus: "served"
    };
  }

  if (order.status === "served") {
    return {
      label: "Complete order",
      nextStatus: "completed"
    };
  }

  return null;
}

function renderOrderCards(orders) {
  const formatCurrency = currencyFormatter();

  return orders
    .map(function toOrderRow(order) {
      const tableLabel = order.tableId || order.channel;
      const primaryAction = getOrderPrimaryAction(order);
      const editDisabled = !isOrderEditable(order);

      return (
        '<article class="surface-card order-card">' +
        '<div class="row-spread">' +
        "<strong>" +
        escapeHtml(order.id) +
        "</strong>" +
        '<div class="pill-row"><span class="status-pill status-' +
        escapeHtml(order.status) +
        '">' +
        escapeHtml(order.status) +
        '</span><span class="status-pill status-' +
        escapeHtml(order.priority || "normal") +
        '">' +
        escapeHtml(order.priority || "normal") +
        "</span></div>" +
        "</div>" +
        '<p class="detail-line">Destination: ' +
        escapeHtml(tableLabel) +
        "</p>" +
        '<p class="detail-line">Stage: ' +
        escapeHtml(order.course) +
        "</p>" +
        '<p class="detail-line">Items: ' +
        escapeHtml(order.itemCount) +
        " | Total: " +
        escapeHtml(formatCurrency.format(order.total)) +
        "</p>" +
        '<p class="detail-line">Paid: ' +
        escapeHtml(formatCurrency.format(order.paidTotal || 0)) +
        " | Balance: " +
        escapeHtml(formatCurrency.format(getOrderBalanceDue(order))) +
        "</p>" +
        '<p class="detail-line">Menu: ' +
        escapeHtml(order.summary || "No items") +
        "</p>" +
        '<p class="muted-text">Placed at ' +
        escapeHtml(order.placedAt) +
        "</p>" +
        '<div class="inline-actions">' +
        (primaryAction
          ? '<button class="secondary-action" type="button" data-order-action="' +
            escapeHtml(order.id) +
            '" data-next-status="' +
            escapeHtml(primaryAction.nextStatus) +
            '"' +
            (state.busy ? " disabled" : "") +
            ">" +
            escapeHtml(primaryAction.label) +
            "</button>"
          : "") +
        '<button class="secondary-action" type="button" data-order-edit="' +
        escapeHtml(order.id) +
        '"' +
        (state.busy || editDisabled ? " disabled" : "") +
        '>Edit items</button>' +
        '<button class="secondary-action" type="button" data-order-receipt="' +
        escapeHtml(order.id) +
        '"' +
        (state.busy ? " disabled" : "") +
        '>Billing</button>' +
        (isOrderEditable(order)
          ? '<button class="danger-action" type="button" data-order-action="' +
            escapeHtml(order.id) +
            '" data-next-status="cancelled"' +
            (state.busy ? " disabled" : "") +
            ">Cancel</button>"
          : "") +
        "</div>" +
        "</article>"
      );
    })
    .join("");
}

function renderOrderEditor(menuItems) {
  const order = getOrderById(state.editOrder.orderId);
  const formatCurrency = currencyFormatter();

  if (!order || !isOrderEditable(order)) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Edit order items</h3><p class="panel-copy">Choose an active order to add items, remove items, or change quantities.</p></div>' +
      '<p class="empty-state">Select an active order from the list to edit it.</p>' +
      "</div>"
    );
  }

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>Edit ' +
    escapeHtml(order.id) +
    '</h3><p class="panel-copy">Set any line item to 0 to remove it from the order.</p></div>' +
    '<form id="order-edit-form" class="form-stack">' +
    renderItemPicker(menuItems, state.editOrder.quantities, "edit") +
    '<div class="button-row"><div><p class="section-label">Updated total</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(getQuantitiesTotal(menuItems, state.editOrder.quantities))) +
    '</p></div><div class="inline-actions"><button class="secondary-action" type="button" data-order-reset="' +
    escapeHtml(order.id) +
    '"' +
    (state.busy ? " disabled" : "") +
    '>Reset</button><button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    '>Save changes</button></div></div>' +
    "</form>" +
    "</div>"
  );
}

function renderReceiptPanel() {
  if (!state.receipt.orderId) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Receipt</h3><p class="panel-copy">Open any order to generate a bill or split preview.</p></div>' +
      '<p class="empty-state">Select an order and open its receipt.</p>' +
      "</div>"
    );
  }

  const order = getOrderById(state.receipt.orderId);

  if (!order) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Receipt</h3><p class="panel-copy">The selected order is no longer available.</p></div>' +
      "</div>"
    );
  }

  if (!state.receipt.data) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Receipt for ' +
      escapeHtml(order.id) +
      '</h3><p class="panel-copy">Generate the bill preview and optional equal split.</p></div>' +
      '<div class="inline-actions"><button class="secondary-action" type="button" data-order-receipt="' +
      escapeHtml(order.id) +
      '"' +
      (state.busy ? " disabled" : "") +
      '>Generate receipt</button><button class="ghost-action" type="button" data-receipt-clear="true">Close</button></div>' +
      "</div>"
    );
  }

  const receipt = state.receipt.data;
  const formatCurrency = currencyFormatter();

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>Receipt for ' +
    escapeHtml(receipt.orderId) +
    '</h3><p class="panel-copy">' +
    escapeHtml(receipt.restaurant.name + " - " + receipt.restaurant.branch) +
    "</p></div>" +
    '<div class="form-grid compact-grid">' +
    '<label class="field"><span class="field-label">Split bill</span><select class="input-control" data-receipt-split="true">' +
    [1, 2, 3, 4, 5, 6]
      .map(function renderSplitOption(splitCount) {
        const selected = splitCount === state.receipt.splitCount ? " selected" : "";
        return '<option value="' + splitCount + '"' + selected + ">" + splitCount + "</option>";
      })
      .join("") +
    '</select></label><div class="field"><span class="field-label">Status</span><p class="section-value">' +
    escapeHtml(receipt.status) +
    "</p></div></div>" +
    '<div class="receipt-list">' +
    receipt.items
      .map(function renderReceiptItem(item) {
        return (
          '<div class="receipt-row"><span>' +
          escapeHtml(item.name + " x" + item.quantity) +
          "</span><strong>" +
          escapeHtml(formatCurrency.format(item.lineTotal)) +
          "</strong></div>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="receipt-total-row"><span>Total</span><strong>' +
    escapeHtml(formatCurrency.format(receipt.total)) +
    "</strong></div>" +
    '<div class="receipt-row"><span>Paid</span><strong>' +
    escapeHtml(formatCurrency.format(receipt.paidTotal || 0)) +
    "</strong></div>" +
    '<div class="receipt-row"><span>Balance due</span><strong>' +
    escapeHtml(formatCurrency.format(receipt.balanceDue == null ? receipt.total : receipt.balanceDue)) +
    "</strong></div>" +
    '<div class="split-list">' +
    receipt.splitAmounts
      .map(function renderSplitAmount(splitAmount) {
        return (
          '<div class="receipt-row"><span>' +
          escapeHtml(splitAmount.label) +
          "</span><strong>" +
          escapeHtml(formatCurrency.format(splitAmount.amount)) +
          "</strong></div>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="inline-actions"><button class="secondary-action" type="button" data-order-receipt="' +
    escapeHtml(receipt.orderId) +
    '"' +
    (state.busy ? " disabled" : "") +
    '>Refresh receipt</button><button class="ghost-action" type="button" data-receipt-clear="true">Close</button></div>' +
    "</div>"
  );
}

function renderPaymentPanel() {
  if (!state.receipt.orderId) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Payments</h3><p class="panel-copy">Select an order from billing to record cash, transfer, or POS payments.</p></div>' +
      '<p class="empty-state">Open an order from billing to start collecting payment.</p>' +
      "</div>"
    );
  }

  const order = getOrderById(state.receipt.orderId);

  if (!order) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Payments</h3><p class="panel-copy">The selected order is no longer available.</p></div>' +
      "</div>"
    );
  }

  const formatCurrency = currencyFormatter();
  const payments = order.payments || [];
  const paymentDisabled = state.busy || order.status === "cancelled" || getOrderBalanceDue(order) <= 0;

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>Payments for ' +
    escapeHtml(order.id) +
    '</h3><p class="panel-copy">Record partial payments and generate a payment receipt when the balance changes.</p></div>' +
    '<div class="payment-summary-grid">' +
    '<div class="surface-card summary-card"><p class="section-label">Total</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(order.total)) +
    '</p></div><div class="surface-card summary-card"><p class="section-label">Paid</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(order.paidTotal || 0)) +
    '</p></div><div class="surface-card summary-card"><p class="section-label">Balance</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(getOrderBalanceDue(order))) +
    '</p></div></div>' +
    '<div class="stack-list">' +
    (payments.length > 0
      ? payments
          .map(function renderPayment(payment) {
            return (
              '<div class="receipt-row"><span>' +
              escapeHtml(payment.method + " at " + payment.receivedAt) +
              "</span><strong>" +
              escapeHtml(formatCurrency.format(payment.amount)) +
              "</strong></div>"
            );
          })
          .join("")
      : '<p class="empty-state">No payments recorded yet.</p>') +
    "</div>" +
    '<form id="payment-form" class="form-stack">' +
    '<div class="form-grid compact-grid">' +
    '<label class="field"><span class="field-label">Method</span><select class="input-control" data-payment-field="method">' +
    ["cash", "transfer", "pos"]
      .map(function renderPaymentOption(method) {
        const selected = method === state.paymentForm.method ? " selected" : "";
        return '<option value="' + method + '"' + selected + ">" + method + "</option>";
      })
      .join("") +
    '</select></label><label class="field"><span class="field-label">Amount</span><input class="input-control" type="number" min="0" step="1" data-payment-field="amount" value="' +
    escapeHtml(state.paymentForm.amount) +
    '" /></label></div>' +
    '<label class="field"><span class="field-label">Note</span><input class="input-control" type="text" data-payment-field="note" value="' +
    escapeHtml(state.paymentForm.note) +
    '" /></label>' +
    '<div class="inline-actions"><button class="primary-action" type="submit"' +
    (paymentDisabled ? " disabled" : "") +
    '>Record payment</button><button class="secondary-action" type="button" data-payment-receipt="' +
    escapeHtml(order.id) +
    '"' +
    (state.busy ? " disabled" : "") +
    '>Payment receipt</button></div>' +
    "</form>" +
    (state.paymentReceipt
      ? '<div class="workspace-block payment-receipt-block"><div class="workspace-header"><h3>Payment receipt</h3><p class="panel-copy">' +
        escapeHtml(state.paymentReceipt.restaurant.name + " - " + state.paymentReceipt.restaurant.branch) +
        '</p></div><div class="receipt-row"><span>Status</span><strong>' +
        escapeHtml(state.paymentReceipt.paymentStatus) +
        '</strong></div><div class="receipt-row"><span>Payments</span><strong>' +
        escapeHtml(String(state.paymentReceipt.paymentCount)) +
        '</strong></div><div class="receipt-row"><span>Balance due</span><strong>' +
        escapeHtml(formatCurrency.format(state.paymentReceipt.balanceDue)) +
        "</strong></div></div>"
      : "") +
    "</div>"
  );
}

function renderOrdersWorkspace(dashboard) {
  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Orders</p><h2>Manage tickets and receipts</h2></div><p class="panel-copy">Edit line items, move orders through service, and generate bills from one workspace.</p></div>' +
    '<div class="workspace-grid">' +
    '<div class="workspace-column"><div class="workspace-header"><h3>Recent orders</h3><p class="panel-copy">Track each order from pending to completion.</p></div><div class="stack-list">' +
    renderOrderCards(dashboard.orders) +
    "</div></div>" +
    '<div class="workspace-column">' +
    renderOrderEditor(dashboard.menuHighlights) +
    renderReceiptPanel() +
    renderPaymentPanel() +
    "</div></div></section>"
  );
}

function renderKitchenMetricCards(metrics) {
  const cards = [
    {
      label: "Open Tickets",
      value: String(metrics.openTickets || 0),
      accent: "cool"
    },
    {
      label: "Rush Priority",
      value: String(metrics.rushTickets || 0),
      accent: "warm"
    },
    {
      label: "Ready To Run",
      value: String(metrics.readyTickets || 0),
      accent: "mint"
    }
  ];

  return cards
    .map(function renderCard(card) {
      return (
        '<article class="metric-card metric-card-' +
        card.accent +
        '">' +
        '<p class="metric-label">' +
        escapeHtml(card.label) +
        "</p>" +
        '<h2 class="metric-value">' +
        escapeHtml(card.value) +
        "</h2></article>"
      );
    })
    .join("");
}

function renderKitchenBoard(viewModel, title, description) {
  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Kitchen</p><h2>' +
    escapeHtml(title) +
    '</h2></div><p class="panel-copy">' +
    escapeHtml(description) +
    "</p></div>" +
    '<div class="kitchen-grid">' +
    (viewModel.orders.length > 0
      ? viewModel.orders
          .map(function renderKitchenOrder(order) {
            const action = getKitchenPrimaryAction(order);
            const destination = order.tableId || order.channel;

            return (
              '<article class="surface-card kitchen-card">' +
              '<div class="row-spread"><strong>' +
              escapeHtml(order.id) +
              '</strong><div class="pill-row"><span class="status-pill status-' +
              escapeHtml(order.status) +
              '">' +
              escapeHtml(order.status) +
              '</span><span class="status-pill status-' +
              escapeHtml(order.priority || "normal") +
              '">' +
              escapeHtml(order.priority || "normal") +
              "</span></div></div>" +
              '<p class="detail-line">Destination: ' +
              escapeHtml(destination) +
              "</p>" +
              '<p class="detail-line">Placed: ' +
              escapeHtml(order.placedOn + " " + order.placedAt) +
              "</p>" +
              '<p class="detail-line">Items: ' +
              escapeHtml(order.summary || "No items") +
              "</p>" +
              '<label class="field"><span class="field-label">Priority</span><select class="input-control" data-kitchen-priority="' +
              escapeHtml(order.id) +
              '"' +
              (state.busy ? " disabled" : "") +
              ">" +
              ["rush", "normal", "low"]
                .map(function renderPriority(priority) {
                  const selected = priority === (order.priority || "normal") ? " selected" : "";
                  return '<option value="' + priority + '"' + selected + ">" + priority + "</option>";
                })
                .join("") +
              "</select></label>" +
              '<div class="inline-actions">' +
              (action
                ? '<button class="primary-action" type="button" data-kitchen-status="' +
                  escapeHtml(order.id) +
                  '" data-next-status="' +
                  escapeHtml(action.nextStatus) +
                  '"' +
                  (state.busy ? " disabled" : "") +
                  ">" +
                  escapeHtml(action.label) +
                  "</button>"
                : '<span class="muted-text">Ready for front-of-house handoff.</span>') +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="empty-state">No kitchen tickets are waiting right now.</p>') +
    "</div></section>"
  );
}

function renderTopItems(items) {
  const formatCurrency = currencyFormatter();

  if (!items || items.length === 0) {
    return '<p class="empty-state">No completed sales in this period yet.</p>';
  }

  return (
    '<div class="stack-list">' +
    items
      .map(function renderTopItem(item) {
        return (
          '<div class="receipt-row"><span>' +
          escapeHtml(item.name + " x" + item.quantitySold) +
          "</span><strong>" +
          escapeHtml(formatCurrency.format(item.revenue)) +
          "</strong></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderReportCard(title, report) {
  const formatCurrency = currencyFormatter();

  return (
    '<article class="surface-card report-card">' +
    '<div class="workspace-header"><h3>' +
    escapeHtml(title) +
    '</h3><p class="panel-copy">' +
    escapeHtml(report.startDate + " to " + report.endDate) +
    "</p></div>" +
    '<div class="payment-summary-grid report-summary-grid">' +
    '<div class="summary-card"><p class="section-label">Orders</p><p class="section-value">' +
    escapeHtml(String(report.orderCount || 0)) +
    '</p></div><div class="summary-card"><p class="section-label">Sales</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(report.salesTotal || 0)) +
    '</p></div><div class="summary-card"><p class="section-label">Expenses</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(report.expenseTotal || 0)) +
    '</p></div><div class="summary-card"><p class="section-label">Gross profit</p><p class="section-value">' +
    escapeHtml(formatCurrency.format(report.grossProfit || 0)) +
    "</p></div></div>" +
    '<div class="workspace-block"><div class="workspace-header"><h3>Most sold items</h3></div>' +
    renderTopItems(report.mostSoldItems) +
    "</div></article>"
  );
}

function renderReportsSection(reports) {
  if (!reports) {
    return "";
  }

  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Reports</p><h2>Sales and profit</h2></div><p class="panel-copy">Review daily, weekly, and month-to-date sales against purchasing cost.</p></div>' +
    '<p class="muted-text">Generated at ' +
    escapeHtml(reports.generatedAt) +
    "</p>" +
    '<div class="reports-grid">' +
    renderReportCard("Daily", reports.daily) +
    renderReportCard("Weekly", reports.weekly) +
    renderReportCard("Monthly", reports.monthly) +
    "</div></section>"
  );
}

function renderMenuPreview(imageUrl, name) {
  if (!imageUrl) {
    return "";
  }

  return (
    '<img class="menu-image" src="' +
    escapeHtml(imageUrl) +
    '" alt="' +
    escapeHtml(name) +
    '" />'
  );
}

function renderMenuManagement(items) {
  const formatCurrency = currencyFormatter();
  const isEditing = Boolean(state.menuForm.id);

  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Menu</p><h2>Manage menu items</h2></div><p class="panel-copy">Add items, change prices, update availability, and maintain categories and images.</p></div>' +
    '<div class="workspace-grid">' +
    '<div class="workspace-column">' +
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>' +
    (isEditing ? "Edit menu item" : "Add menu item") +
    '</h3><p class="panel-copy">Use the image upload or paste an image URL if you already have one.</p></div>' +
    '<form id="menu-form" class="form-stack">' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">Name</span><input class="input-control" type="text" data-menu-field="name" value="' +
    escapeHtml(state.menuForm.name) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Category</span><input class="input-control" type="text" data-menu-field="category" value="' +
    escapeHtml(state.menuForm.category) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Station</span><input class="input-control" type="text" data-menu-field="station" value="' +
    escapeHtml(state.menuForm.station) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Margin</span><select class="input-control" data-menu-field="margin">' +
    ["low", "medium", "high"]
      .map(function renderMarginOption(value) {
        const selected = value === state.menuForm.margin ? " selected" : "";
        return '<option value="' + value + '"' + selected + ">" + value + "</option>";
      })
      .join("") +
    "</select></label>" +
    '<label class="field"><span class="field-label">Price</span><input class="input-control" type="number" min="0" step="1" data-menu-field="price" value="' +
    escapeHtml(state.menuForm.price) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Availability</span><select class="input-control" data-menu-field="availability">' +
    ["available", "unavailable"]
      .map(function renderAvailabilityOption(value) {
        const selected = value === state.menuForm.availability ? " selected" : "";
        return '<option value="' + value + '"' + selected + ">" + value + "</option>";
      })
      .join("") +
    "</select></label>" +
    "</div>" +
    '<label class="field"><span class="field-label">Image URL</span><input class="input-control" type="text" data-menu-field="imageUrl" value="' +
    escapeHtml(state.menuForm.imageUrl) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Upload image</span><input class="input-control file-control" type="file" accept="image/*" id="menu-image-upload" /></label>' +
    (state.menuForm.imageUrl
      ? '<div class="image-preview-block">' +
        renderMenuPreview(state.menuForm.imageUrl, state.menuForm.name || "Menu item image") +
        '<button class="ghost-action" type="button" data-menu-clear-image="true">Clear image</button></div>'
      : "") +
    '<div class="button-row"><button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    ">" +
    (isEditing ? "Save item" : "Add item") +
    '</button><div class="inline-actions">' +
    (isEditing
      ? '<button class="ghost-action" type="button" data-menu-reset="true"' +
        (state.busy ? " disabled" : "") +
        ">Cancel</button>"
      : "") +
    "</div></div>" +
    "</form></div></div>" +
    '<div class="workspace-column"><div class="workspace-header"><h3>Menu items</h3><p class="panel-copy">Toggle availability or open an item to edit it.</p></div><div class="stack-list">' +
    items
      .map(function renderMenuItem(item) {
        return (
          '<article class="surface-card menu-card">' +
          '<div class="menu-card-layout">' +
          (item.imageUrl ? renderMenuPreview(item.imageUrl, item.name) : "") +
          '<div class="menu-card-copy">' +
          '<div class="row-spread"><strong>' +
          escapeHtml(item.name) +
          '</strong><span class="status-pill status-' +
          escapeHtml(item.availability) +
          '">' +
          escapeHtml(item.availability) +
          "</span></div>" +
          '<p class="detail-line">' +
          escapeHtml(item.category) +
          " | " +
          escapeHtml(item.station) +
          " | " +
          escapeHtml(item.margin) +
          " margin</p>" +
          '<p class="muted-text">' +
          escapeHtml(formatCurrency.format(item.price)) +
          "</p>" +
          '<div class="inline-actions"><button class="secondary-action" type="button" data-menu-edit="' +
          escapeHtml(item.id) +
          '"' +
          (state.busy ? " disabled" : "") +
          '>Edit</button><button class="secondary-action" type="button" data-menu-toggle="' +
          escapeHtml(item.id) +
          '" data-next-availability="' +
          escapeHtml(item.availability === "available" ? "unavailable" : "available") +
          '"' +
          (state.busy ? " disabled" : "") +
          ">" +
          escapeHtml(item.availability === "available" ? "Mark unavailable" : "Mark available") +
          '</button><button class="danger-action" type="button" data-menu-delete="' +
          escapeHtml(item.id) +
          '"' +
          (state.busy ? " disabled" : "") +
          '>Delete</button></div></div></div></article>'
        );
      })
      .join("") +
    "</div></div></div></section>"
  );
}

function renderTables(tables) {
  return tables
    .map(function toTableCard(table) {
      const server = table.server || "Unassigned";
      const orderText = table.currentOrderId || "No ticket";
      const guestLabel = table.customerName || "Walk-in";
      const action = getTableAction(table);

      return (
        '<article class="surface-card table-card">' +
        '<div class="row-spread">' +
        "<strong>" +
        escapeHtml(table.id) +
        "</strong>" +
        '<span class="status-pill status-' +
        escapeHtml(table.status) +
        '">' +
        escapeHtml(table.status) +
        "</span>" +
        "</div>" +
        '<p class="muted-text">' +
        escapeHtml(table.seats) +
        " seats</p>" +
        '<p class="detail-line">Guest: ' +
        escapeHtml(guestLabel) +
        (table.partySize ? " | party " + escapeHtml(table.partySize) : "") +
        "</p>" +
        '<p class="detail-line">Server: ' +
        escapeHtml(server) +
        "</p>" +
        '<p class="detail-line">Ticket: ' +
        escapeHtml(orderText) +
        "</p>" +
        '<p class="detail-line">Elapsed: ' +
        escapeHtml(table.elapsedMinutes) +
        " min</p>" +
        (table.notes ? '<p class="muted-text">' + escapeHtml(table.notes) + "</p>" : "") +
        '<div class="inline-actions">' +
        (action
          ? '<button class="secondary-action" type="button" data-table-action="' +
            escapeHtml(table.id) +
            '" data-next-status="' +
            escapeHtml(action.nextStatus) +
            '"' +
            (state.busy ? " disabled" : "") +
            ">" +
            escapeHtml(action.label) +
            "</button>"
          : "") +
        '<button class="ghost-action" type="button" data-table-edit="' +
        escapeHtml(table.id) +
        '"' +
        (state.busy ? " disabled" : "") +
        '>Manage</button>' +
        (isAdminUser()
          ? '<button class="danger-action" type="button" data-table-delete="' +
            escapeHtml(table.id) +
            '"' +
            (state.busy || table.currentOrderId ? " disabled" : "") +
            '>Delete</button>'
          : "") +
        "</div>" +
        "</article>"
      );
    })
    .join("");
}

function renderTableForm() {
  const isEditing = Boolean(state.tableForm.id);
  const canEditStructure = isAdminUser();

  if (!canEditStructure && !isEditing) {
    return (
      '<div class="workspace-block">' +
      '<div class="workspace-header"><h3>Table assignment</h3><p class="panel-copy">Select a table from the floor to assign guests, update notes, or hand over service.</p></div>' +
      '<p class="empty-state">Choose a table to manage its guest details.</p>' +
      "</div>"
    );
  }

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>' +
    (isEditing ? "Manage " + escapeHtml(state.tableForm.id) : "Add table") +
    '</h3><p class="panel-copy">Keep guest assignment, server handoff, and table availability current.</p></div>' +
    '<form id="table-form" class="form-stack">' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">Seats</span><input class="input-control" type="number" min="1" step="1" data-table-field="seats" value="' +
    escapeHtml(state.tableForm.seats) +
    '"' +
    (canEditStructure ? "" : " disabled") +
    ' /></label><label class="field"><span class="field-label">Status</span><select class="input-control" data-table-field="status"' +
    (canEditStructure ? "" : " disabled") +
    ">" +
    ["available", "occupied", "reserved", "cleaning"]
      .map(function renderStatusOption(status) {
        const selected = status === state.tableForm.status ? " selected" : "";
        return '<option value="' + status + '"' + selected + ">" + status + "</option>";
      })
      .join("") +
    '</select></label><label class="field"><span class="field-label">Server</span><input class="input-control" type="text" data-table-field="server" value="' +
    escapeHtml(state.tableForm.server) +
    '" /></label><label class="field"><span class="field-label">Customer</span><input class="input-control" type="text" data-table-field="customerName" value="' +
    escapeHtml(state.tableForm.customerName) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Party size</span><input class="input-control" type="number" min="0" step="1" data-table-field="partySize" value="' +
    escapeHtml(state.tableForm.partySize) +
    '" /></label>' +
    "</div>" +
    '<label class="field"><span class="field-label">Notes</span><input class="input-control" type="text" data-table-field="notes" value="' +
    escapeHtml(state.tableForm.notes) +
    '" /></label>' +
    '<div class="inline-actions"><button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    ">" +
    (isEditing ? "Save table" : "Add table") +
    "</button>" +
    (isEditing
      ? '<button class="ghost-action" type="button" data-table-reset="true"' +
        (state.busy ? " disabled" : "") +
        ">Cancel</button>"
      : "") +
    "</div></form></div>"
  );
}

function renderTableManagement(tables) {
  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Floor</p><h2>Table control</h2></div><p class="panel-copy">Manage tables, assign guests, and keep occupied and free seats accurate for dine-in service.</p></div>' +
    '<div class="workspace-grid">' +
    '<div class="workspace-column">' +
    renderTableForm() +
    "</div>" +
    '<div class="workspace-column"><div class="workspace-header"><h3>Tables</h3><p class="panel-copy">Watch occupancy, open tickets, and guest assignments across the floor.</p></div><div class="card-grid">' +
    renderTables(tables) +
    "</div></div></div></section>"
  );
}

function renderAlerts(alerts) {
  return alerts
    .map(function toAlertRow(alert) {
      return (
        '<article class="surface-card alert-card">' +
        "<strong>" +
        escapeHtml(alert.item) +
        "</strong>" +
        '<p class="detail-line">Remaining: ' +
        escapeHtml(alert.remainingUnits) +
        " " +
        escapeHtml(alert.unit || "units") +
        "</p>" +
        '<p class="detail-line">Reorder level: ' +
        escapeHtml(alert.reorderLevel) +
        "</p>" +
        '<p class="muted-text">Supplier: ' +
        escapeHtml(alert.supplier) +
        "</p>" +
        "</article>"
      );
    })
    .join("");
}

function renderInventoryItemForm() {
  const isEditing = Boolean(state.inventoryForm.id);

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>' +
    (isEditing ? "Edit stock item" : "Add stock item") +
    '</h3><p class="panel-copy">Track ingredients, units, reorder thresholds, and supplier context.</p></div>' +
    '<form id="inventory-item-form" class="form-stack">' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">Name</span><input class="input-control" type="text" data-stock-field="name" value="' +
    escapeHtml(state.inventoryForm.name) +
    '" /></label><label class="field"><span class="field-label">Unit</span><input class="input-control" type="text" data-stock-field="unit" value="' +
    escapeHtml(state.inventoryForm.unit) +
    '" /></label>' +
    '<label class="field"><span class="field-label">On hand</span><input class="input-control" type="number" min="0" step="0.01" data-stock-field="onHand" value="' +
    escapeHtml(state.inventoryForm.onHand) +
    '" /></label><label class="field"><span class="field-label">Reorder level</span><input class="input-control" type="number" min="0" step="0.01" data-stock-field="reorderLevel" value="' +
    escapeHtml(state.inventoryForm.reorderLevel) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Supplier</span><input class="input-control" type="text" data-stock-field="supplier" value="' +
    escapeHtml(state.inventoryForm.supplier) +
    '" /></label><label class="field"><span class="field-label">Last unit cost</span><input class="input-control" type="number" min="0" step="1" data-stock-field="lastUnitCost" value="' +
    escapeHtml(state.inventoryForm.lastUnitCost) +
    '" /></label>' +
    "</div>" +
    '<div class="inline-actions"><button class="primary-action" type="submit"' +
    (state.busy ? " disabled" : "") +
    ">" +
    (isEditing ? "Save stock item" : "Add stock item") +
    "</button>" +
    (isEditing
      ? '<button class="ghost-action" type="button" data-stock-reset="true"' +
        (state.busy ? " disabled" : "") +
        ">Cancel</button>"
      : "") +
    "</div></form></div>"
  );
}

function renderPurchaseForm(items) {
  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>Record purchase</h3><p class="panel-copy">Add stock purchases and keep the latest supplier cost visible.</p></div>' +
    '<form id="purchase-form" class="form-stack">' +
    '<div class="form-grid">' +
    '<label class="field"><span class="field-label">Stock item</span><select class="input-control" data-purchase-field="stockItemId">' +
    items
      .map(function renderItemOption(item) {
        const selected = item.id === state.purchaseForm.stockItemId ? " selected" : "";
        return '<option value="' + escapeHtml(item.id) + '"' + selected + ">" + escapeHtml(item.name) + "</option>";
      })
      .join("") +
    '</select></label><label class="field"><span class="field-label">Quantity</span><input class="input-control" type="number" min="0" step="0.01" data-purchase-field="quantity" value="' +
    escapeHtml(state.purchaseForm.quantity) +
    '" /></label>' +
    '<label class="field"><span class="field-label">Unit cost</span><input class="input-control" type="number" min="0" step="1" data-purchase-field="unitCost" value="' +
    escapeHtml(state.purchaseForm.unitCost) +
    '" /></label><label class="field"><span class="field-label">Supplier</span><input class="input-control" type="text" data-purchase-field="supplier" value="' +
    escapeHtml(state.purchaseForm.supplier) +
    '" /></label>' +
    "</div>" +
    '<label class="field"><span class="field-label">Note</span><input class="input-control" type="text" data-purchase-field="note" value="' +
    escapeHtml(state.purchaseForm.note) +
    '" /></label>' +
    '<button class="primary-action" type="submit"' +
    (state.busy || items.length === 0 ? " disabled" : "") +
    ">Add purchase</button></form></div>"
  );
}

function renderInventoryItems(items) {
  const formatCurrency = currencyFormatter();

  return items
    .map(function renderStockCard(item) {
      const lowStock = Number(item.onHand) <= Number(item.reorderLevel);

      return (
        '<article class="surface-card stock-card">' +
        '<div class="row-spread"><strong>' +
        escapeHtml(item.name) +
        '</strong><span class="status-pill status-' +
        escapeHtml(lowStock ? "pending" : "available") +
        '">' +
        escapeHtml(lowStock ? "low stock" : "healthy") +
        "</span></div>" +
        '<p class="detail-line">On hand: ' +
        escapeHtml(item.onHand) +
        " " +
        escapeHtml(item.unit) +
        "</p>" +
        '<p class="detail-line">Reorder level: ' +
        escapeHtml(item.reorderLevel) +
        "</p>" +
        '<p class="detail-line">Supplier: ' +
        escapeHtml(item.supplier || "Unassigned") +
        "</p>" +
        '<p class="muted-text">Last unit cost ' +
        escapeHtml(formatCurrency.format(item.lastUnitCost || 0)) +
        '</p><div class="inline-actions"><button class="secondary-action" type="button" data-stock-edit="' +
        escapeHtml(item.id) +
        '"' +
        (state.busy ? " disabled" : "") +
        '>Edit</button></div></article>'
      );
    })
    .join("");
}

function renderStockHistoryPanel(history) {
  const formatCurrency = currencyFormatter();

  return (
    '<div class="workspace-block">' +
    '<div class="workspace-header"><h3>Stock history</h3><p class="panel-copy">Recent purchases, usage deductions, and manual adjustments.</p></div>' +
    '<div class="stack-list">' +
    (history.length > 0
      ? history
          .slice(0, 10)
          .map(function renderHistoryEntry(entry) {
            return (
              '<article class="surface-card history-card">' +
              '<div class="row-spread"><strong>' +
              escapeHtml(entry.item) +
              "</strong><span>" +
              escapeHtml(entry.type) +
              "</span></div>" +
              '<p class="detail-line">Change: ' +
              escapeHtml(entry.quantityChange) +
              " " +
              escapeHtml(entry.unit) +
              " | Balance: " +
              escapeHtml(entry.balanceAfter) +
              "</p>" +
              '<p class="detail-line">Reference: ' +
              escapeHtml(entry.reference || "n/a") +
              "</p>" +
              '<p class="detail-line">Supplier: ' +
              escapeHtml(entry.supplier || "n/a") +
              " | Unit cost: " +
              escapeHtml(formatCurrency.format(entry.unitCost || 0)) +
              "</p>" +
              '<p class="muted-text">' +
              escapeHtml(entry.occurredAt) +
              (entry.note ? " | " + escapeHtml(entry.note) : "") +
              "</p></article>"
            );
          })
          .join("")
      : '<p class="empty-state">No stock history recorded yet.</p>') +
    "</div></div>"
  );
}

function renderInventoryManagement(dashboard) {
  return (
    '<section class="panel panel-wide">' +
    '<div class="panel-header"><div><p class="panel-kicker">Inventory</p><h2>Stock control</h2></div><p class="panel-copy">Track raw materials, enter purchases, and watch low-stock pressure build in real time.</p></div>' +
    '<div class="card-grid">' +
    renderAlerts(dashboard.inventoryAlerts) +
    "</div>" +
    '<div class="workspace-grid">' +
    '<div class="workspace-column">' +
    renderInventoryItemForm() +
    renderPurchaseForm(dashboard.inventoryItems) +
    "</div>" +
    '<div class="workspace-column"><div class="workspace-block"><div class="workspace-header"><h3>Inventory items</h3><p class="panel-copy">Edit stock levels and reorder thresholds for tracked ingredients.</p></div><div class="stack-list">' +
    renderInventoryItems(dashboard.inventoryItems) +
    "</div></div>" +
    renderStockHistoryPanel(dashboard.stockHistory || []) +
    "</div></div></section>"
  );
}

function renderLoading() {
  if (!state.auth.user && !state.auth.token) {
    renderLoginScreen();
    return;
  }

  if (state.auth.user) {
    setHeader(
      "Loading " + state.auth.user.role + " workspace...",
      "Pulling live floor, kitchen, payment, and stock data."
    );
  } else {
    setHeader("Restoring session...", "Checking the saved staff session.");
  }

  const app = document.getElementById("app");
  app.innerHTML =
    '<section class="panel panel-wide"><div class="panel-header"><div><p class="panel-kicker">Loading</p><h2>Preparing the control room</h2></div><p class="panel-copy">Pulling live floor, kitchen, and menu data.</p></div></section>';
}

function renderError(error) {
  if (error && error.statusCode === 401) {
    setNotice(error.message, "error");
    renderDashboard();
    return;
  }

  const app = document.getElementById("app");
  app.innerHTML =
    '<section class="panel panel-wide error-panel">' +
    "<h2>Dashboard unavailable</h2>" +
    '<p class="panel-copy">' +
    escapeHtml(error.message) +
    "</p>" +
    "</section>";
}

function renderDashboard() {
  if (!isAuthenticated()) {
    if (state.auth.token && !state.busy) {
      renderLoading();
      return;
    }

    renderLoginScreen();
    return;
  }

  if (!state.dashboard) {
    renderLoading();
    return;
  }

  const dashboard = state.dashboard;
  const kitchenView = getKitchenViewModel();
  refreshHeader(dashboard);

  const app = document.getElementById("app");

  if (isKitchenUser()) {
    app.innerHTML =
      renderAuthBar() +
      renderNotice() +
      '<section class="metrics-grid">' +
      renderKitchenMetricCards(kitchenView.metrics) +
      "</section>" +
      renderKitchenBoard(
        kitchenView,
        "Kitchen queue",
        "Keep incoming tickets moving from prep to pass and adjust priority when the rush shifts."
      );
    return;
  }

  app.innerHTML =
    renderAuthBar() +
    renderNotice() +
    '<section class="metrics-grid">' +
    renderMetricCards(dashboard.metrics) +
    "</section>" +
    renderNotificationFeed(dashboard) +
    renderOrderComposer(dashboard.menuHighlights, dashboard.tables) +
    renderOrdersWorkspace(dashboard) +
    (isAdminUser()
      ? renderKitchenBoard(
          kitchenView,
          "Kitchen board",
          "Watch the queue, reprioritize tickets, and move kitchen work from prep to ready."
        ) +
        renderMenuManagement(dashboard.menuHighlights)
      : "") +
    renderTableManagement(dashboard.tables) +
    (isAdminUser() ? renderInventoryManagement(dashboard) + renderReportsSection(state.reports) : "");
}

async function refreshDashboard() {
  state.dashboard = await fetchJson(getDashboardEndpoint());

  if (isAdminUser()) {
    state.reports = (await fetchJson("/api/reports/summary")).reports;
  } else {
    state.reports = null;
  }

  syncTransientSelections();
  renderDashboard();
}

async function withBusyState(action) {
  state.busy = true;
  renderDashboard();

  try {
    await action();
  } finally {
    state.busy = false;
  }
}

function loadEditOrder(orderId) {
  const order = getOrderById(orderId);

  if (!order || !isOrderEditable(order)) {
    return;
  }

  state.editOrder.orderId = order.id;
  state.editOrder.quantities = extractQuantitiesFromOrder(order);
}

function loadMenuForm(itemId) {
  const item = getMenuItemById(itemId);

  if (!item) {
    return;
  }

  state.menuForm = {
    id: item.id,
    name: item.name,
    category: item.category,
    station: item.station,
    margin: item.margin,
    price: String(item.price),
    availability: item.availability,
    imageUrl: item.imageUrl || ""
  };
}

function loadBilling(orderId) {
  const order = getOrderById(orderId);

  if (!order) {
    return;
  }

  state.receipt.orderId = order.id;
  state.receipt.data = null;
  state.paymentReceipt = null;
  state.paymentForm = {
    amount: String(getOrderBalanceDue(order)),
    method: "cash",
    note: ""
  };
}

function loadInventoryForm(stockItemId) {
  const item = getStockItemById(stockItemId);

  if (!item) {
    return;
  }

  state.inventoryForm = {
    id: item.id,
    lastUnitCost: String(item.lastUnitCost || 0),
    name: item.name,
    onHand: String(item.onHand),
    reorderLevel: String(item.reorderLevel),
    supplier: item.supplier || "",
    unit: item.unit
  };
}

function loadTableForm(tableId) {
  const table = getTableById(tableId);

  if (!table) {
    return;
  }

  state.tableForm = {
    id: table.id,
    customerName: table.customerName || "",
    notes: table.notes || "",
    partySize: table.partySize ? String(table.partySize) : "",
    seats: String(table.seats || ""),
    server: table.server || "",
    status: table.status
  };
}

function serializeQuantities(quantities) {
  return Object.keys(quantities)
    .map(function toItem(menuItemId) {
      return {
        menuItemId: menuItemId,
        quantity: Number(quantities[menuItemId] || 0)
      };
    })
    .filter(function hasQuantity(item) {
      return item.quantity >= 0;
    });
}

async function requestReceipt(orderId, splitCount) {
  const payload = await fetchJson(
    "/api/orders/" + encodeURIComponent(orderId) + "/receipt?split=" + encodeURIComponent(splitCount)
  );

  state.receipt = {
    orderId: orderId,
    splitCount: splitCount,
    data: payload.receipt
  };
}

async function requestPaymentReceipt(orderId) {
  const payload = await fetchJson("/api/orders/" + encodeURIComponent(orderId) + "/payment-receipt");
  state.paymentReceipt = payload.receipt;
}

function applyAuthPreset(role) {
  const credentialsByRole = {
    admin: {
      username: "admin",
      password: "admin123"
    },
    cashier: {
      username: "cashier",
      password: "cashier123"
    },
    kitchen: {
      username: "kitchen",
      password: "kitchen123"
    }
  };

  state.auth.loginForm = Object.assign({}, credentialsByRole[role] || createLoginFormState());
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitLogin() {
    clearNotice();

    try {
      const payload = await fetchJson("/api/auth/login", {
        method: "POST",
        body: state.auth.loginForm
      });

      state.auth.token = payload.token;
      state.auth.user = payload.user;
      writeStoredToken(payload.token);
      resetWorkspaceState();
      await refreshDashboard();
      setNotice("Signed in as " + payload.user.name + ".", "success");
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleLogout() {
  await withBusyState(async function submitLogout() {
    clearNotice();

    try {
      await fetchJson("/api/auth/logout", {
        method: "POST"
      });
    } catch (error) {
      if (error.statusCode !== 401) {
        setNotice(error.message, "error");
        return;
      }
    }

    clearAuthSession();
    setNotice("Signed out.", "success");
  });

  renderDashboard();
}

async function handleOrderSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitOrder() {
    clearNotice();

    try {
      const payload = await fetchJson("/api/orders", {
        method: "POST",
        body: {
          channel: state.draftOrder.channel,
          priority: state.draftOrder.priority,
          tableId: state.draftOrder.channel === "dine-in" ? state.draftOrder.tableId : null,
          items: serializeQuantities(state.draftOrder.quantities)
        }
      });

      resetDraftOrder();
      setNotice("Order " + payload.order.id + " created.", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleOrderEditSubmit(event) {
  event.preventDefault();

  await withBusyState(async function saveOrderChanges() {
    clearNotice();

    try {
      const payload = await fetchJson("/api/orders/" + encodeURIComponent(state.editOrder.orderId) + "/items", {
        method: "PATCH",
        body: {
          items: serializeQuantities(state.editOrder.quantities)
        }
      });

      setNotice("Order " + payload.order.id + " updated.", "success");
      await refreshDashboard();
      loadEditOrder(payload.order.id);
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleOrderAction(orderId, nextStatus) {
  await withBusyState(async function updateOrder() {
    clearNotice();

    try {
      await fetchJson("/api/orders/" + encodeURIComponent(orderId) + "/status", {
        method: "PATCH",
        body: {
          status: nextStatus
        }
      });

      setNotice("Order " + orderId + " moved to " + nextStatus + ".", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleKitchenStatus(orderId, nextStatus) {
  await withBusyState(async function updateKitchenStatus() {
    clearNotice();

    try {
      await fetchJson("/api/kitchen/orders/" + encodeURIComponent(orderId) + "/status", {
        method: "PATCH",
        body: {
          status: nextStatus
        }
      });

      setNotice("Kitchen moved " + orderId + " to " + nextStatus + ".", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleKitchenPriority(orderId, nextPriority) {
  await withBusyState(async function updateKitchenPriority() {
    clearNotice();

    try {
      await fetchJson("/api/kitchen/orders/" + encodeURIComponent(orderId) + "/priority", {
        method: "PATCH",
        body: {
          priority: nextPriority
        }
      });

      setNotice("Kitchen priority for " + orderId + " set to " + nextPriority + ".", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleReceiptRequest(orderId, splitCount) {
  await withBusyState(async function loadReceipt() {
    clearNotice();

    try {
      loadBilling(orderId);
      await requestReceipt(orderId, splitCount);
      setNotice("Receipt generated for " + orderId + ".", "success");
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handlePaymentSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitPayment() {
    clearNotice();

    try {
      const orderId = state.receipt.orderId;
      const body = {
        amount: Number(state.paymentForm.amount),
        method: state.paymentForm.method,
        note: state.paymentForm.note
      };

      const payload = await fetchJson("/api/orders/" + encodeURIComponent(orderId) + "/payments", {
        method: "POST",
        body: body
      });

      setNotice("Payment recorded for " + payload.order.id + ".", "success");
      resetPaymentForm();
      await refreshDashboard();
      loadBilling(payload.order.id);
      await requestReceipt(payload.order.id, state.receipt.splitCount || 1);
      await requestPaymentReceipt(payload.order.id);
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handlePaymentReceiptRequest(orderId) {
  await withBusyState(async function loadPaymentReceipt() {
    clearNotice();

    try {
      loadBilling(orderId);
      await requestPaymentReceipt(orderId);
      setNotice("Payment receipt generated for " + orderId + ".", "success");
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleTableAction(tableId, nextStatus) {
  await withBusyState(async function updateTable() {
    clearNotice();

    try {
      await fetchJson("/api/tables/" + encodeURIComponent(tableId) + "/status", {
        method: "PATCH",
        body: {
          status: nextStatus
        }
      });

      setNotice("Table " + tableId + " marked " + nextStatus + ".", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleTableSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitTable() {
    clearNotice();

    try {
      const body = {
        customerName: state.tableForm.customerName,
        notes: state.tableForm.notes,
        partySize: Number(state.tableForm.partySize || 0),
        server: state.tableForm.server,
        seats: Number(state.tableForm.seats || 0),
        status: state.tableForm.status
      };

      if (state.tableForm.id) {
        await fetchJson("/api/tables/" + encodeURIComponent(state.tableForm.id), {
          method: "PATCH",
          body: body
        });
        setNotice("Table " + state.tableForm.id + " updated.", "success");
      } else {
        const payload = await fetchJson("/api/tables", {
          method: "POST",
          body: body
        });
        setNotice("Table " + payload.table.id + " added.", "success");
      }

      resetTableForm();
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleTableDelete(tableId) {
  await withBusyState(async function deleteTable() {
    clearNotice();

    try {
      await fetchJson("/api/tables/" + encodeURIComponent(tableId), {
        method: "DELETE"
      });

      if (state.tableForm.id === tableId) {
        resetTableForm();
      }

      setNotice("Table " + tableId + " removed.", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleMenuSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitMenuItem() {
    clearNotice();

    try {
      const body = {
        name: state.menuForm.name,
        category: state.menuForm.category,
        station: state.menuForm.station,
        margin: state.menuForm.margin,
        price: Number(state.menuForm.price),
        availability: state.menuForm.availability,
        imageUrl: state.menuForm.imageUrl
      };

      if (state.menuForm.id) {
        await fetchJson("/api/menu/" + encodeURIComponent(state.menuForm.id), {
          method: "PATCH",
          body: body
        });
        setNotice("Menu item " + state.menuForm.id + " updated.", "success");
      } else {
        const payload = await fetchJson("/api/menu", {
          method: "POST",
          body: body
        });
        setNotice("Menu item " + payload.item.id + " added.", "success");
      }

      resetMenuForm();
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleMenuDelete(itemId) {
  await withBusyState(async function deleteMenuItem() {
    clearNotice();

    try {
      await fetchJson("/api/menu/" + encodeURIComponent(itemId), {
        method: "DELETE"
      });

      if (state.menuForm.id === itemId) {
        resetMenuForm();
      }

      setNotice("Menu item " + itemId + " deleted.", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleMenuAvailability(itemId, nextAvailability) {
  await withBusyState(async function updateMenuAvailability() {
    clearNotice();

    try {
      await fetchJson("/api/menu/" + encodeURIComponent(itemId), {
        method: "PATCH",
        body: {
          availability: nextAvailability
        }
      });

      setNotice("Menu item " + itemId + " marked " + nextAvailability + ".", "success");
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handleInventorySubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitInventoryItem() {
    clearNotice();

    try {
      const body = {
        lastUnitCost: Number(state.inventoryForm.lastUnitCost),
        name: state.inventoryForm.name,
        onHand: Number(state.inventoryForm.onHand),
        reorderLevel: Number(state.inventoryForm.reorderLevel),
        supplier: state.inventoryForm.supplier,
        unit: state.inventoryForm.unit
      };

      if (state.inventoryForm.id) {
        await fetchJson("/api/inventory/items/" + encodeURIComponent(state.inventoryForm.id), {
          method: "PATCH",
          body: body
        });
        setNotice("Stock item " + state.inventoryForm.id + " updated.", "success");
      } else {
        const payload = await fetchJson("/api/inventory/items", {
          method: "POST",
          body: body
        });
        setNotice("Stock item " + payload.item.id + " added.", "success");
      }

      resetInventoryForm();
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

async function handlePurchaseSubmit(event) {
  event.preventDefault();

  await withBusyState(async function submitPurchase() {
    clearNotice();

    try {
      const body = {
        note: state.purchaseForm.note,
        quantity: Number(state.purchaseForm.quantity),
        stockItemId: state.purchaseForm.stockItemId,
        supplier: state.purchaseForm.supplier
      };

      if (state.purchaseForm.unitCost !== "") {
        body.unitCost = Number(state.purchaseForm.unitCost);
      }

      const payload = await fetchJson("/api/inventory/purchases", {
        method: "POST",
        body: body
      });

      setNotice("Purchase added for " + payload.item.name + ".", "success");
      resetPurchaseForm();
      await refreshDashboard();
    } catch (error) {
      setNotice(error.message, "error");
    }
  });

  renderDashboard();
}

function readFileAsDataUrl(file) {
  return new Promise(function onFile(resolve, reject) {
    const reader = new FileReader();

    reader.onload = function onLoad() {
      resolve(String(reader.result || ""));
    };

    reader.onerror = function onError() {
      reject(new Error("Image upload failed."));
    };

    reader.readAsDataURL(file);
  });
}

async function handleMenuImageUpload(file) {
  if (!file) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const payload = await fetchJson("/api/uploads/menu-image", {
      method: "POST",
      body: {
        dataUrl: dataUrl,
        filename: file.name
      }
    });

    state.menuForm.imageUrl = payload.imageUrl;
    setNotice("Image uploaded.", "success");
    renderDashboard();
  } catch (error) {
    state.menuForm.imageUrl = await readFileAsDataUrl(file).catch(function ignoreReadError() {
      return "";
    });
    setNotice(error.message, "error");
    renderDashboard();
  }
}

const app = document.getElementById("app");

app.addEventListener("submit", function onSubmit(event) {
  if (event.target && event.target.id === "login-form") {
    handleLoginSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "order-form") {
    handleOrderSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "order-edit-form") {
    handleOrderEditSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "menu-form") {
    handleMenuSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "payment-form") {
    handlePaymentSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "table-form") {
    handleTableSubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "inventory-item-form") {
    handleInventorySubmit(event).catch(renderError);
    return;
  }

  if (event.target && event.target.id === "purchase-form") {
    handlePurchaseSubmit(event).catch(renderError);
  }
});

app.addEventListener("change", function onChange(event) {
  const target = event.target;

  if (!target) {
    return;
  }

  if (target.name === "channel") {
    state.draftOrder.channel = target.value;
    syncDraftOrder();
    renderDashboard();
    return;
  }

  if (target.name === "priority") {
    state.draftOrder.priority = target.value;
    return;
  }

  if (target.name === "tableId") {
    state.draftOrder.tableId = target.value;
    return;
  }

  if (target.hasAttribute("data-receipt-split")) {
    const splitCount = Number(target.value);

    if (state.receipt.orderId) {
      handleReceiptRequest(state.receipt.orderId, splitCount).catch(renderError);
    }

    return;
  }

  if (target.id === "menu-image-upload" && target.files && target.files[0]) {
    handleMenuImageUpload(target.files[0]).catch(renderError);
    return;
  }

  const tableField = target.getAttribute("data-table-field");

  if (tableField) {
    state.tableForm[tableField] = target.value;
    return;
  }

  const kitchenOrderId = target.getAttribute("data-kitchen-priority");

  if (kitchenOrderId) {
    handleKitchenPriority(kitchenOrderId, target.value).catch(renderError);
    return;
  }

  const paymentField = target.getAttribute("data-payment-field");

  if (paymentField) {
    state.paymentForm[paymentField] = target.value;
    return;
  }

  const purchaseField = target.getAttribute("data-purchase-field");

  if (purchaseField) {
    state.purchaseForm[purchaseField] = target.value;
  }
});

app.addEventListener("input", function onInput(event) {
  const target = event.target;

  if (!target) {
    return;
  }

  const menuItemId = target.getAttribute("data-quantity-input");
  const quantityScope = target.getAttribute("data-quantity-scope");

  if (menuItemId && quantityScope) {
    const quantity = Math.max(0, Number(target.value) || 0);
    const store = quantityScope === "edit" ? state.editOrder.quantities : state.draftOrder.quantities;

    if (quantity === 0) {
      delete store[menuItemId];
    } else {
      store[menuItemId] = quantity;
    }

    return;
  }

  const menuField = target.getAttribute("data-menu-field");

  if (menuField) {
    state.menuForm[menuField] = target.value;
    return;
  }

  const tableField = target.getAttribute("data-table-field");

  if (tableField) {
    state.tableForm[tableField] = target.value;
    return;
  }

  const loginField = target.getAttribute("data-login-field");

  if (loginField) {
    state.auth.loginForm[loginField] = target.value;
    return;
  }

  const stockField = target.getAttribute("data-stock-field");

  if (stockField) {
    state.inventoryForm[stockField] = target.value;
    return;
  }

  const paymentField = target.getAttribute("data-payment-field");

  if (paymentField) {
    state.paymentForm[paymentField] = target.value;
    return;
  }

  const purchaseField = target.getAttribute("data-purchase-field");

  if (purchaseField) {
    state.purchaseForm[purchaseField] = target.value;
  }
});

app.addEventListener("click", function onClick(event) {
  const button = event.target.closest(
    "button[data-auth-logout], button[data-auth-preset], button[data-kitchen-status], button[data-order-action], button[data-table-action], button[data-table-edit], button[data-table-delete], button[data-table-reset], button[data-order-edit], button[data-order-reset], button[data-order-receipt], button[data-payment-receipt], button[data-menu-edit], button[data-menu-delete], button[data-menu-toggle], button[data-menu-reset], button[data-menu-clear-image], button[data-receipt-clear], button[data-stock-edit], button[data-stock-reset]"
  );

  if (!button) {
    return;
  }

  if (button.hasAttribute("data-auth-logout")) {
    handleLogout().catch(renderError);
    return;
  }

  if (button.hasAttribute("data-auth-preset")) {
    applyAuthPreset(button.getAttribute("data-auth-preset"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-kitchen-status")) {
    handleKitchenStatus(button.getAttribute("data-kitchen-status"), button.getAttribute("data-next-status")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-order-action")) {
    handleOrderAction(button.getAttribute("data-order-action"), button.getAttribute("data-next-status")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-table-action")) {
    handleTableAction(button.getAttribute("data-table-action"), button.getAttribute("data-next-status")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-table-edit")) {
    loadTableForm(button.getAttribute("data-table-edit"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-table-delete")) {
    handleTableDelete(button.getAttribute("data-table-delete")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-table-reset")) {
    resetTableForm();
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-order-edit")) {
    loadEditOrder(button.getAttribute("data-order-edit"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-order-reset")) {
    loadEditOrder(button.getAttribute("data-order-reset"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-order-receipt")) {
    handleReceiptRequest(button.getAttribute("data-order-receipt"), state.receipt.splitCount || 1).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-payment-receipt")) {
    handlePaymentReceiptRequest(button.getAttribute("data-payment-receipt")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-menu-edit")) {
    loadMenuForm(button.getAttribute("data-menu-edit"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-menu-delete")) {
    handleMenuDelete(button.getAttribute("data-menu-delete")).catch(renderError);
    return;
  }

  if (button.hasAttribute("data-menu-toggle")) {
    handleMenuAvailability(button.getAttribute("data-menu-toggle"), button.getAttribute("data-next-availability")).catch(
      renderError
    );
    return;
  }

  if (button.hasAttribute("data-menu-reset")) {
    resetMenuForm();
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-menu-clear-image")) {
    state.menuForm.imageUrl = "";
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-stock-edit")) {
    loadInventoryForm(button.getAttribute("data-stock-edit"));
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-stock-reset")) {
    resetInventoryForm();
    renderDashboard();
    return;
  }

  if (button.hasAttribute("data-receipt-clear")) {
    clearReceipt();
    renderDashboard();
  }
});

async function initializeApp() {
  renderDashboard();

  if (!state.auth.token) {
    return;
  }

  try {
    const payload = await fetchJson("/api/auth/session");
    state.auth.user = payload.user;
    await refreshDashboard();
  } catch (error) {
    clearAuthSession();
    if (error.statusCode && error.statusCode !== 401) {
      setNotice(error.message, "error");
    }
    renderDashboard();
  }
}

initializeApp().catch(renderError);
