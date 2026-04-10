const {
  aggregateInventoryUsage,
  buildInventoryAlerts,
  buildOrderRecord,
  buildPaymentReceipt,
  buildPaymentSummary,
  buildReceipt,
  canEditOrder,
  cloneValue,
  createInitialState,
  createRequestError,
  getCurrentBusinessDate,
  getCurrentClock,
  getCurrentTimestamp,
  getMenuSequenceFromId,
  getOrderSequenceFromId,
  getStockHistorySequenceFromId,
  getStockSequenceFromId,
  getTableSequenceFromId,
  isOrderOpen,
  normalizeMenuItemInput,
  normalizePaymentInput,
  normalizePriority,
  normalizePurchaseInput,
  normalizeRecipeInput,
  normalizeStockItemInput,
  normalizeTableInput,
  orderChannels,
  orderStatusFlow,
  roundQuantity,
  sumOutstandingBalances,
  sumRevenue,
  sumRevenueForDate,
  tableStatuses
} = require("./shared");
const { notifyLowStock, notifyOrderReady, notifyPaymentPending } = require("../services/notificationService");

let state = cloneValue(createInitialState());

function fireAndForget(work) {
  Promise.resolve()
    .then(work)
    .catch(function logNotificationError(error) {
      console.error(error && error.stack ? error.stack : error);
    });
}

function getMenuItemById(menuItemId) {
  return state.menuItems.find(function hasId(item) {
    return item.id === menuItemId;
  });
}

function getOrderById(orderId) {
  return state.orders.find(function hasId(order) {
    return order.id === orderId;
  });
}

function getTableById(tableId) {
  return state.tables.find(function hasId(table) {
    return table.id === tableId;
  });
}

function getStockItemById(stockItemId) {
  return state.stockItems.find(function hasId(item) {
    return item.id === stockItemId;
  });
}

function getNextOrderId() {
  const maxId = state.orders.reduce(function findMax(highest, order) {
    const numericPortion = getOrderSequenceFromId(order.id);
    return numericPortion > highest ? numericPortion : highest;
  }, 1040);

  return "ORD-" + String(maxId + 1);
}

function getNextMenuItemId() {
  const maxId = state.menuItems.reduce(function findMax(highest, item) {
    const numericPortion = getMenuSequenceFromId(item.id);
    return numericPortion > highest ? numericPortion : highest;
  }, 100);

  return "MENU-" + String(maxId + 1);
}

function getNextStockItemId() {
  const maxId = state.stockItems.reduce(function findMax(highest, item) {
    const numericPortion = getStockSequenceFromId(item.id);
    return numericPortion > highest ? numericPortion : highest;
  }, 100);

  return "STK-" + String(maxId + 1);
}

function getNextTableId() {
  const maxId = state.tables.reduce(function findMax(highest, table) {
    const numericPortion = getTableSequenceFromId(table.id);
    return numericPortion > highest ? numericPortion : highest;
  }, 0);

  return "T" + String(maxId + 1);
}

function getNextStockHistoryId() {
  const maxId = state.stockHistory.reduce(function findMax(highest, entry) {
    const numericPortion = getStockHistorySequenceFromId(entry.id);
    return numericPortion > highest ? numericPortion : highest;
  }, 200);

  return "HIS-" + String(maxId + 1);
}

function getStockLookup() {
  return state.stockItems.reduce(function indexStock(result, item) {
    result[item.id] = item;
    return result;
  }, {});
}

function refreshInventoryAlerts() {
  state.inventoryAlerts = buildInventoryAlerts(state.stockItems);
}

function refreshStockReferences(stockItem) {
  state.menuItems.forEach(function updateMenuRecipe(menuItem) {
    menuItem.recipe = (menuItem.recipe || []).map(function updateRecipeLine(line) {
      if (line.stockItemId !== stockItem.id) {
        return line;
      }

      return {
        stockItemId: line.stockItemId,
        name: stockItem.name,
        unit: stockItem.unit,
        quantity: line.quantity
      };
    });
  });
}

function normalizeMenuRecipe(recipeInput) {
  return normalizeRecipeInput(recipeInput, getStockLookup());
}

function normalizeLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createRequestError(400, "Select at least one menu item before creating an order.");
  }

  const mergedItems = items.reduce(function merge(result, item) {
    const quantity = Number(item && item.quantity);
    const menuItemId = item && item.menuItemId;

    if (!menuItemId) {
      throw createRequestError(400, "Each order line needs a menuItemId.");
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw createRequestError(400, "Each order line needs a quantity of 0 or more.");
    }

    result[menuItemId] = (result[menuItemId] || 0) + quantity;
    return result;
  }, {});

  const filteredIds = Object.keys(mergedItems).filter(function hasPositiveQuantity(menuItemId) {
    return mergedItems[menuItemId] > 0;
  });

  if (filteredIds.length === 0) {
    throw createRequestError(400, "An order must contain at least one item.");
  }

  return filteredIds.map(function toLineItem(menuItemId) {
    const menuItem = getMenuItemById(menuItemId);

    if (!menuItem) {
      throw createRequestError(404, "Menu item " + menuItemId + " was not found.");
    }

    if (menuItem.availability === "unavailable") {
      throw createRequestError(409, menuItem.name + " is unavailable right now.");
    }

    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      station: menuItem.station,
      price: menuItem.price,
      quantity: mergedItems[menuItemId],
      imageUrl: menuItem.imageUrl || "",
      recipe: cloneValue(menuItem.recipe || [])
    };
  });
}

function toUsageDelta(oldItems, newItems) {
  const oldUsage = aggregateInventoryUsage(oldItems).reduce(function indexUsage(result, line) {
    result[line.stockItemId] = line;
    return result;
  }, {});
  const newUsage = aggregateInventoryUsage(newItems).reduce(function indexUsage(result, line) {
    result[line.stockItemId] = line;
    return result;
  }, {});
  const stockItemIds = Array.from(new Set(Object.keys(oldUsage).concat(Object.keys(newUsage)))).sort();

  return stockItemIds
    .map(function toAdjustment(stockItemId) {
      const previous = oldUsage[stockItemId];
      const next = newUsage[stockItemId];
      const quantityChange = roundQuantity((previous ? previous.quantity : 0) - (next ? next.quantity : 0));
      const line = previous || next;

      return {
        stockItemId: stockItemId,
        quantityChange: quantityChange,
        name: line.name,
        unit: line.unit
      };
    })
    .filter(function hasDelta(adjustment) {
      return adjustment.quantityChange !== 0;
    });
}

function applyStockAdjustments(adjustments, definition) {
  const changeSet = (adjustments || []).filter(function hasChange(change) {
    return change.quantityChange !== 0;
  });

  if (changeSet.length === 0) {
    return [];
  }

  changeSet.forEach(function validateChange(change) {
    const stockItem = getStockItemById(change.stockItemId);

    if (!stockItem) {
      throw createRequestError(404, "Stock item " + change.stockItemId + " was not found.");
    }

    const nextOnHand = roundQuantity(stockItem.onHand + change.quantityChange);

    if (nextOnHand < 0) {
      throw createRequestError(409, stockItem.name + " does not have enough stock for that update.");
    }
  });

  const historyEntries = changeSet.map(function applyChange(change) {
    const stockItem = getStockItemById(change.stockItemId);

    stockItem.onHand = roundQuantity(stockItem.onHand + change.quantityChange);

    return {
      id: getNextStockHistoryId(),
      stockItemId: stockItem.id,
      item: stockItem.name,
      unit: stockItem.unit,
      type: definition.type,
      quantityChange: change.quantityChange,
      balanceAfter: stockItem.onHand,
      occurredAt: getCurrentTimestamp(),
      reference: definition.reference || stockItem.id,
      supplier: definition.supplier || stockItem.supplier || "",
      unitCost: definition.unitCost == null ? stockItem.lastUnitCost : definition.unitCost,
      note: definition.note || ""
    };
  });

  state.stockHistory = historyEntries.concat(state.stockHistory);
  refreshInventoryAlerts();
  const lowStockAlerts = buildInventoryAlerts(state.stockItems).filter(function keepAlert(alert) {
    return changeSet.some(function hasStockItem(change) {
      return change.stockItemId === alert.stockItemId;
    });
  });

  if (lowStockAlerts.length > 0) {
    fireAndForget(function sendLowStockNotification() {
      return notifyLowStock(state.restaurantProfile, lowStockAlerts);
    });
  }

  return historyEntries;
}

function allocateInventoryForOrder(order, note) {
  const usage = aggregateInventoryUsage(order.items).map(function toAdjustment(line) {
    return {
      stockItemId: line.stockItemId,
      quantityChange: -line.quantity,
      name: line.name,
      unit: line.unit
    };
  });

  applyStockAdjustments(usage, {
    type: "usage",
    reference: order.id,
    note: note || "Inventory allocated to order " + order.id + "."
  });
}

function clearTableAssignment(table) {
  table.currentOrderId = null;
  table.customerName = "";
  table.partySize = 0;
  table.notes = "";
  table.elapsedMinutes = 0;
}

function buildDashboard() {
  const businessDate = state.restaurantProfile.businessDate || getCurrentBusinessDate();
  const occupiedTables = state.tables.filter(function isOccupied(table) {
    return table.status === "occupied";
  }).length;
  const activeOrders = state.orders.filter(isOrderOpen);
  const billableOrders = state.orders.filter(function isBillable(order) {
    return order.status !== "cancelled" && order.placedOn === businessDate;
  });
  const revenueToday = sumRevenueForDate(state.orders, businessDate);
  const averageTicket = billableOrders.length > 0 ? Math.round(revenueToday / billableOrders.length) : 0;
  const inventoryAlerts = buildInventoryAlerts(state.stockItems);

  return {
    restaurant: cloneValue(state.restaurantProfile),
    metrics: {
      occupancyRate: state.tables.length > 0 ? Math.round((occupiedTables / state.tables.length) * 100) : 0,
      openOrders: activeOrders.length,
      activeStaff: state.restaurantProfile.activeStaff,
      lowStockItems: inventoryAlerts.length,
      revenueToday: revenueToday,
      averageTicket: averageTicket,
      outstandingBalances: sumOutstandingBalances(state.orders)
    },
    tables: cloneValue(state.tables),
    orders: cloneValue(state.orders),
    menuHighlights: cloneValue(state.menuItems),
    inventoryAlerts: cloneValue(inventoryAlerts),
    inventoryItems: cloneValue(state.stockItems),
    stockHistory: cloneValue(state.stockHistory)
  };
}

function getRestaurantProfile() {
  return cloneValue(state.restaurantProfile);
}

function getTables() {
  return cloneValue(state.tables);
}

function getOrders() {
  return cloneValue(state.orders);
}

function getMenuItems() {
  return cloneValue(state.menuItems);
}

function getInventoryAlerts() {
  return cloneValue(buildInventoryAlerts(state.stockItems));
}

function getInventoryItems() {
  return cloneValue(state.stockItems);
}

function getStockHistory() {
  return cloneValue(state.stockHistory);
}

function createOrder(input) {
  const channel = input && input.channel;

  if (!orderChannels.includes(channel)) {
    throw createRequestError(400, "Order channel must be dine-in, takeaway, or delivery.");
  }

  const tableId = channel === "dine-in" ? input.tableId : null;
  const lineItems = normalizeLineItems(input && input.items);

  if (channel === "dine-in" && !tableId) {
    throw createRequestError(400, "Select a table for dine-in orders.");
  }

  if (channel === "dine-in") {
    const table = getTableById(tableId);

    if (!table) {
      throw createRequestError(404, "Table " + tableId + " was not found.");
    }

    if (table.currentOrderId) {
      throw createRequestError(409, "Table " + tableId + " already has an active order.");
    }

    if (!["available", "reserved"].includes(table.status)) {
      throw createRequestError(409, "Table " + tableId + " is not ready for a new dine-in ticket.");
    }
  }

  const order = buildOrderRecord(
    {
      id: getNextOrderId(),
      tableId: tableId || null,
      channel: channel,
      status: "pending",
      priority: normalizePriority(input && input.priority, true),
      placedOn: getCurrentBusinessDate(),
      placedAt: getCurrentClock(),
      payments: [],
      inventoryApplied: false
    },
    lineItems
  );

  state.orders.unshift(order);

  if (order.tableId) {
    const table = getTableById(order.tableId);
    table.status = "occupied";
    table.currentOrderId = order.id;
    table.elapsedMinutes = 0;
    table.server = table.server || "Floor Team";
  }

  return cloneValue(order);
}

function updateOrderItems(orderId, input) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  if (!canEditOrder(order)) {
    throw createRequestError(409, "Only pending or preparing orders can be edited.");
  }

  const lineItems = normalizeLineItems(input && input.items);
  const updatedOrder = buildOrderRecord(
    {
      id: order.id,
      tableId: order.tableId,
      channel: order.channel,
      status: order.status,
      priority: order.priority,
      placedOn: order.placedOn,
      placedAt: order.placedAt,
      payments: order.payments,
      inventoryApplied: order.inventoryApplied
    },
    lineItems
  );

  if (order.inventoryApplied) {
    applyStockAdjustments(toUsageDelta(order.items, updatedOrder.items), {
      type: "adjustment",
      reference: order.id,
      note: "Inventory adjusted after editing " + order.id + "."
    });
  }

  order.course = updatedOrder.course;
  order.itemCount = updatedOrder.itemCount;
  order.total = updatedOrder.total;
  order.items = updatedOrder.items;
  order.summary = updatedOrder.summary;
  order.paidTotal = updatedOrder.paidTotal;
  order.balanceDue = updatedOrder.balanceDue;
  order.paymentStatus = updatedOrder.paymentStatus;

  return cloneValue(order);
}

function updateOrderStatus(orderId, nextStatus) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  if (!orderStatusFlow[order.status]) {
    throw createRequestError(409, "Order " + orderId + " cannot be updated from its current state.");
  }

  if (!orderStatusFlow[order.status].includes(nextStatus)) {
    throw createRequestError(409, "Order " + orderId + " cannot move from " + order.status + " to " + nextStatus + ".");
  }

  if (nextStatus === "preparing" && !order.inventoryApplied) {
    allocateInventoryForOrder(order, "Inventory allocated when " + order.id + " entered preparation.");
    order.inventoryApplied = true;
  }

  order.status = nextStatus;

  if (nextStatus === "served") {
    order.course = "served";

    if (Number(order.balanceDue || 0) > 0) {
      fireAndForget(function sendPaymentReminder() {
        return notifyPaymentPending(state.restaurantProfile, order);
      });
    }
  } else if (nextStatus === "ready") {
    order.course = "pass";
    fireAndForget(function sendReadyNotification() {
      return notifyOrderReady(state.restaurantProfile, order);
    });
  } else if (nextStatus === "completed") {
    order.course = "closed";

    if (order.tableId) {
      const table = getTableById(order.tableId);

      if (table) {
        clearTableAssignment(table);
        table.status = "cleaning";
      }
    }
  } else if (nextStatus === "cancelled") {
    order.course = "cancelled";

    if (order.tableId) {
      const table = getTableById(order.tableId);

      if (table) {
        clearTableAssignment(table);
        table.status = "available";
      }
    }
  }

  return cloneValue(order);
}

function updateOrderPriority(orderId, nextPriority) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  if (!isOrderOpen(order)) {
    throw createRequestError(409, "Completed or cancelled orders cannot be reprioritized.");
  }

  order.priority = normalizePriority(nextPriority, true);
  return cloneValue(order);
}

function recordPayment(orderId, input) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  if (order.status === "cancelled") {
    throw createRequestError(409, "Cancelled orders cannot accept payments.");
  }

  const payment = normalizePaymentInput(input);

  if (payment.amount > order.balanceDue) {
    throw createRequestError(409, "Payment exceeds the remaining balance for " + orderId + ".");
  }

  order.payments.push({
    id: "PAY-" + String(order.payments.length + 1),
    method: payment.method,
    amount: payment.amount,
    receivedOn: getCurrentBusinessDate(),
    receivedAt: getCurrentClock(),
    note: payment.note
  });

  Object.assign(order, buildPaymentSummary(order.total, order.payments));
  return cloneValue(order);
}

function getOrderReceipt(orderId, splitCount) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  return buildReceipt(state.restaurantProfile, order, splitCount);
}

function getPaymentReceipt(orderId) {
  const order = getOrderById(orderId);

  if (!order) {
    throw createRequestError(404, "Order " + orderId + " was not found.");
  }

  return buildPaymentReceipt(state.restaurantProfile, order);
}

function updateTableStatus(tableId, nextStatus) {
  const table = getTableById(tableId);

  if (!table) {
    throw createRequestError(404, "Table " + tableId + " was not found.");
  }

  if (!tableStatuses.includes(nextStatus)) {
    throw createRequestError(400, "Table status " + nextStatus + " is not supported.");
  }

  const currentOrder = table.currentOrderId ? getOrderById(table.currentOrderId) : null;

  if (currentOrder && isOrderOpen(currentOrder) && nextStatus !== "occupied") {
    throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
  }

  table.status = nextStatus;

  if (nextStatus === "available") {
    clearTableAssignment(table);
  }

  if (nextStatus === "cleaning") {
    clearTableAssignment(table);
  }

  return cloneValue(table);
}

function createTable(input) {
  const table = Object.assign(
    {
      id: getNextTableId(),
      currentOrderId: null,
      elapsedMinutes: 0
    },
    normalizeTableInput(input)
  );

  state.tables.push(table);
  state.tables.sort(function compareTables(left, right) {
    return getTableSequenceFromId(left.id) - getTableSequenceFromId(right.id);
  });
  return cloneValue(table);
}

function updateTable(tableId, input) {
  const table = getTableById(tableId);

  if (!table) {
    throw createRequestError(404, "Table " + tableId + " was not found.");
  }

  const updates = normalizeTableInput(input, { partial: true });
  const currentOrder = table.currentOrderId ? getOrderById(table.currentOrderId) : null;

  if (currentOrder && isOrderOpen(currentOrder) && updates.status && updates.status !== "occupied") {
    throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
  }

  Object.assign(table, updates);

  if (updates.status === "available" || updates.status === "cleaning") {
    clearTableAssignment(table);
  }

  return cloneValue(table);
}

function deleteTable(tableId) {
  const index = state.tables.findIndex(function hasId(table) {
    return table.id === tableId;
  });

  if (index === -1) {
    throw createRequestError(404, "Table " + tableId + " was not found.");
  }

  const table = state.tables[index];
  const currentOrder = table.currentOrderId ? getOrderById(table.currentOrderId) : null;

  if (currentOrder && isOrderOpen(currentOrder)) {
    throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
  }

  state.tables.splice(index, 1);
  return cloneValue(table);
}

function createMenuItem(input) {
  const menuItem = Object.assign(
    {
      id: getNextMenuItemId()
    },
    normalizeMenuItemInput(input),
    {
      recipe: normalizeMenuRecipe(input && input.recipe)
    }
  );

  state.menuItems.push(menuItem);
  return cloneValue(menuItem);
}

function updateMenuItem(menuItemId, input) {
  const menuItem = getMenuItemById(menuItemId);

  if (!menuItem) {
    throw createRequestError(404, "Menu item " + menuItemId + " was not found.");
  }

  Object.assign(menuItem, normalizeMenuItemInput(input, { partial: true }));

  if (Object.prototype.hasOwnProperty.call(input || {}, "recipe")) {
    menuItem.recipe = normalizeMenuRecipe(input.recipe);
  }

  return cloneValue(menuItem);
}

function deleteMenuItem(menuItemId) {
  const index = state.menuItems.findIndex(function hasId(item) {
    return item.id === menuItemId;
  });

  if (index === -1) {
    throw createRequestError(404, "Menu item " + menuItemId + " was not found.");
  }

  const deletedItem = state.menuItems.splice(index, 1)[0];
  return cloneValue(deletedItem);
}

function createInventoryItem(input) {
  const stockItem = Object.assign(
    {
      id: getNextStockItemId()
    },
    normalizeStockItemInput(input)
  );

  state.stockItems.push(stockItem);
  refreshInventoryAlerts();
  return cloneValue(stockItem);
}

function updateInventoryItem(stockItemId, input) {
  const stockItem = getStockItemById(stockItemId);

  if (!stockItem) {
    throw createRequestError(404, "Stock item " + stockItemId + " was not found.");
  }

  const updates = normalizeStockItemInput(input, { partial: true });
  const previousOnHand = stockItem.onHand;
  const hasOnHandUpdate = Object.prototype.hasOwnProperty.call(updates, "onHand");
  const nextOnHand = hasOnHandUpdate ? updates.onHand : previousOnHand;

  if (hasOnHandUpdate) {
    delete updates.onHand;
  }

  Object.assign(stockItem, updates);
  refreshStockReferences(stockItem);

  if (hasOnHandUpdate) {
    const quantityChange = roundQuantity(nextOnHand - previousOnHand);

    if (quantityChange !== 0) {
      applyStockAdjustments(
        [
          {
            stockItemId: stockItem.id,
            quantityChange: quantityChange
          }
        ],
        {
          type: "adjustment",
          reference: stockItem.id,
          supplier: stockItem.supplier,
          unitCost: stockItem.lastUnitCost,
          note: "Manual stock level update."
        }
      );
    } else {
      stockItem.onHand = nextOnHand;
      refreshInventoryAlerts();
    }
  } else {
    refreshInventoryAlerts();
  }

  return cloneValue(stockItem);
}

function createStockPurchase(input) {
  const purchase = normalizePurchaseInput(input);
  const stockItem = getStockItemById(purchase.stockItemId);

  if (!stockItem) {
    throw createRequestError(404, "Stock item " + purchase.stockItemId + " was not found.");
  }

  if (purchase.supplier) {
    stockItem.supplier = purchase.supplier;
  }

  if (purchase.unitCost != null) {
    stockItem.lastUnitCost = purchase.unitCost;
  }

  applyStockAdjustments(
    [
      {
        stockItemId: stockItem.id,
        quantityChange: purchase.quantity
      }
    ],
    {
      type: "purchase",
      reference: "PUR-" + String(state.stockHistory.length + 1),
      supplier: stockItem.supplier,
      unitCost: purchase.unitCost == null ? stockItem.lastUnitCost : purchase.unitCost,
      note: purchase.note || "Stock purchase received."
    }
  );

  return cloneValue(stockItem);
}

function resetStore() {
  state = cloneValue(createInitialState());
}

module.exports = {
  buildDashboard,
  createInventoryItem,
  createMenuItem,
  createOrder,
  createTable,
  createStockPurchase,
  deleteTable,
  deleteMenuItem,
  getInventoryAlerts,
  getInventoryItems,
  getMenuItems,
  getOrderReceipt,
  getOrders,
  getPaymentReceipt,
  getRestaurantProfile,
  getStockHistory,
  getTables,
  recordPayment,
  resetStore,
  updateInventoryItem,
  updateMenuItem,
  updateOrderItems,
  updateOrderPriority,
  updateOrderStatus,
  updateTable,
  updateTableStatus
};
