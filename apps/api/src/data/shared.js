const orderStatusFlow = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: ["completed", "cancelled"],
  completed: [],
  cancelled: []
};

const tableStatuses = ["available", "occupied", "reserved", "cleaning"];
const orderChannels = ["dine-in", "takeaway", "delivery"];
const menuAvailabilityStates = ["available", "unavailable"];
const menuMarginLevels = ["low", "medium", "high"];
const paymentMethods = ["cash", "transfer", "pos"];
const priorityLevels = ["rush", "normal", "low"];

function createRequestError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundQuantity(value) {
  return Math.round(Number(value) * 100) / 100;
}

function summarizeItems(lineItems) {
  return lineItems
    .map(function toSummaryLine(item) {
      return item.quantity + "x " + item.name;
    })
    .join(", ");
}

function sumRevenue(orderList) {
  return orderList.reduce(function accumulate(total, order) {
    if (order.status === "cancelled") {
      return total;
    }

    return total + order.total;
  }, 0);
}

function sumRevenueForDate(orderList, businessDate) {
  return orderList.reduce(function accumulate(total, order) {
    if (order.status === "cancelled") {
      return total;
    }

    if (getOrderBusinessDate(order, businessDate) !== businessDate) {
      return total;
    }

    return total + order.total;
  }, 0);
}

function sumOutstandingBalances(orderList) {
  return orderList.reduce(function accumulate(total, order) {
    return total + Number(order.balanceDue || 0);
  }, 0);
}

function getCurrentClock() {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos"
  }).format(new Date());
}

function getCurrentBusinessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Lagos"
  }).format(new Date());
}

function getCurrentTimestamp() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos"
  });

  const parts = formatter.formatToParts(new Date()).reduce(function indexParts(result, part) {
    result[part.type] = part.value;
    return result;
  }, {});

  return parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute;
}

function getOrderSequenceFromId(orderId) {
  return Number(String(orderId || "").replace("ORD-", "")) || 0;
}

function getMenuSequenceFromId(menuItemId) {
  return Number(String(menuItemId || "").replace("MENU-", "")) || 0;
}

function getTableSequenceFromId(tableId) {
  return Number(String(tableId || "").replace("T", "")) || 0;
}

function getStockSequenceFromId(stockItemId) {
  return Number(String(stockItemId || "").replace("STK-", "")) || 0;
}

function getStockHistorySequenceFromId(historyId) {
  return Number(String(historyId || "").replace("HIS-", "")) || 0;
}

function calculateOrderTotals(lineItems) {
  return lineItems.reduce(
    function accumulate(result, item) {
      result.itemCount += item.quantity;
      result.total += item.price * item.quantity;
      return result;
    },
    {
      itemCount: 0,
      total: 0
    }
  );
}

function determineCourse(lineItems) {
  const stationCounts = lineItems.reduce(function countStations(result, item) {
    result[item.station] = (result[item.station] || 0) + item.quantity;
    return result;
  }, {});

  const stations = Object.keys(stationCounts);

  if (stations.length === 0) {
    return "service";
  }

  return stations.sort(function compareStations(left, right) {
    return stationCounts[right] - stationCounts[left];
  })[0];
}

function cloneRecipe(recipe) {
  return Array.isArray(recipe)
    ? recipe.map(function toRecipeLine(line) {
        return {
          stockItemId: line.stockItemId,
          name: line.name,
          unit: line.unit,
          quantity: roundQuantity(line.quantity)
        };
      })
    : [];
}

function buildPaymentSummary(total, payments) {
  const paidTotal = Array.isArray(payments)
    ? payments.reduce(function accumulate(sum, payment) {
        return sum + Number(payment.amount || 0);
      }, 0)
    : 0;
  const balanceDue = Math.max(0, total - paidTotal);
  let paymentStatus = "unpaid";

  if (paidTotal > 0 && balanceDue > 0) {
    paymentStatus = "partial";
  }

  if (balanceDue === 0) {
    paymentStatus = "paid";
  }

  return {
    paidTotal: paidTotal,
    balanceDue: balanceDue,
    paymentStatus: paymentStatus
  };
}

function buildOrderRecord(definition, lineItems) {
  const totals = calculateOrderTotals(lineItems);
  const payments = Array.isArray(definition.payments)
    ? definition.payments.map(function clonePayment(payment) {
        return {
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
          receivedOn: payment.receivedOn || definition.placedOn || getCurrentBusinessDate(),
          receivedAt: payment.receivedAt,
          note: payment.note || ""
        };
      })
    : [];
  const paymentSummary = buildPaymentSummary(totals.total, payments);

  return {
    id: definition.id,
    tableId: definition.tableId || null,
    channel: definition.channel,
    status: definition.status,
    priority: normalizePriority(definition.priority, true),
    course: definition.course || determineCourse(lineItems),
    itemCount: totals.itemCount,
    total: totals.total,
    placedOn: definition.placedOn || getCurrentBusinessDate(),
    placedAt: definition.placedAt,
    items: lineItems,
    summary: summarizeItems(lineItems),
    payments: payments,
    paidTotal: paymentSummary.paidTotal,
    balanceDue: paymentSummary.balanceDue,
    paymentStatus: paymentSummary.paymentStatus,
    inventoryApplied: Boolean(definition.inventoryApplied)
  };
}

function buildSeedOrder(definition, menuLookup) {
  const lineItems = definition.items.map(function toLineItem(item) {
    const menuItem = menuLookup[item.menuItemId];

    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      station: menuItem.station,
      price: menuItem.price,
      quantity: item.quantity,
      imageUrl: menuItem.imageUrl || "",
      recipe: cloneRecipe(menuItem.recipe)
    };
  });

  return buildOrderRecord(definition, lineItems);
}

function normalizeTextField(value, fieldName, required) {
  const text = value == null ? "" : String(value).trim();

  if (!text && required) {
    throw createRequestError(400, fieldName + " is required.");
  }

  return text;
}

function normalizePrice(value, required) {
  if (value == null || value === "") {
    if (required) {
      throw createRequestError(400, "Price is required.");
    }

    return undefined;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw createRequestError(400, "Price must be a number greater than or equal to 0.");
  }

  return Math.round(numericValue);
}

function normalizeQuantityField(value, fieldName, options) {
  const settings = options || {};
  const required = Boolean(settings.required);
  const minimum = settings.minimum == null ? 0 : Number(settings.minimum);

  if (value == null || value === "") {
    if (required) {
      throw createRequestError(400, fieldName + " is required.");
    }

    return undefined;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < minimum) {
    throw createRequestError(400, fieldName + " must be a number greater than or equal to " + minimum + ".");
  }

  return roundQuantity(numericValue);
}

function normalizeMenuAvailability(value, required) {
  if (value == null || value === "") {
    if (required) {
      throw createRequestError(400, "Availability is required.");
    }

    return undefined;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (!menuAvailabilityStates.includes(normalizedValue)) {
    throw createRequestError(400, "Availability must be available or unavailable.");
  }

  return normalizedValue;
}

function normalizeMarginLevel(value, required) {
  if (value == null || value === "") {
    if (required) {
      return "medium";
    }

    return undefined;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (!menuMarginLevels.includes(normalizedValue)) {
    throw createRequestError(400, "Margin must be low, medium, or high.");
  }

  return normalizedValue;
}

function normalizeMenuItemInput(input, options) {
  const settings = options || {};
  const partial = Boolean(settings.partial);
  const payload = input || {};
  const result = {};

  function has(fieldName) {
    return Object.prototype.hasOwnProperty.call(payload, fieldName);
  }

  if (!partial || has("name")) {
    result.name = normalizeTextField(payload.name, "Name", !partial);
  }

  if (!partial || has("category")) {
    result.category = normalizeTextField(payload.category, "Category", !partial).toLowerCase();
  }

  if (!partial || has("station")) {
    result.station = normalizeTextField(payload.station, "Station", !partial).toLowerCase();
  }

  if (!partial || has("price")) {
    result.price = normalizePrice(payload.price, !partial);
  }

  if (!partial || has("margin")) {
    result.margin = normalizeMarginLevel(payload.margin, !partial);
  }

  if (!partial || has("availability")) {
    result.availability = normalizeMenuAvailability(payload.availability, !partial);
  }

  if (!partial || has("imageUrl")) {
    result.imageUrl = normalizeTextField(payload.imageUrl, "Image URL", false);
  }

  return result;
}

function normalizeSplitCount(value) {
  if (value == null || value === "") {
    return 1;
  }

  const splitCount = Number(value);

  if (!Number.isInteger(splitCount) || splitCount < 1 || splitCount > 12) {
    throw createRequestError(400, "Split count must be a whole number between 1 and 12.");
  }

  return splitCount;
}

function normalizePaymentMethod(value, required) {
  if (value == null || value === "") {
    if (required) {
      throw createRequestError(400, "Payment method is required.");
    }

    return undefined;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (!paymentMethods.includes(normalizedValue)) {
    throw createRequestError(400, "Payment method must be cash, transfer, or pos.");
  }

  return normalizedValue;
}

function normalizePriority(value, required) {
  if (value == null || value === "") {
    if (required) {
      return "normal";
    }

    return undefined;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (!priorityLevels.includes(normalizedValue)) {
    throw createRequestError(400, "Priority must be rush, normal, or low.");
  }

  return normalizedValue;
}

function normalizeTableStatus(value, required) {
  if (value == null || value === "") {
    if (required) {
      return "available";
    }

    return undefined;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (!tableStatuses.includes(normalizedValue)) {
    throw createRequestError(400, "Table status must be available, occupied, reserved, or cleaning.");
  }

  return normalizedValue;
}

function normalizeSeatCount(value, required) {
  if (value == null || value === "") {
    if (required) {
      throw createRequestError(400, "Seats is required.");
    }

    return undefined;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw createRequestError(400, "Seats must be a whole number greater than or equal to 1.");
  }

  return numericValue;
}

function normalizePartySize(value, required) {
  if (value == null || value === "") {
    if (required) {
      return 0;
    }

    return undefined;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw createRequestError(400, "Party size must be a whole number greater than or equal to 0.");
  }

  return numericValue;
}

function normalizeTableInput(input, options) {
  const settings = options || {};
  const partial = Boolean(settings.partial);
  const payload = input || {};
  const result = {};

  function has(fieldName) {
    return Object.prototype.hasOwnProperty.call(payload, fieldName);
  }

  if (!partial || has("seats")) {
    result.seats = normalizeSeatCount(payload.seats, !partial);
  }

  if (!partial || has("status")) {
    result.status = normalizeTableStatus(payload.status, !partial);
  }

  if (!partial || has("server")) {
    result.server = normalizeTextField(payload.server, "Server", false);
  }

  if (!partial || has("customerName")) {
    result.customerName = normalizeTextField(payload.customerName, "Customer name", false);
  }

  if (!partial || has("partySize")) {
    const partySize = normalizePartySize(payload.partySize, !partial);
    result.partySize = partySize == null ? 0 : partySize;
  }

  if (!partial || has("notes")) {
    result.notes = normalizeTextField(payload.notes, "Notes", false);
  }

  return result;
}

function normalizePaymentInput(input) {
  const payload = input || {};

  return {
    method: normalizePaymentMethod(payload.method, true),
    amount: normalizePrice(payload.amount, true),
    note: normalizeTextField(payload.note, "Note", false)
  };
}

function normalizeStockItemInput(input, options) {
  const settings = options || {};
  const partial = Boolean(settings.partial);
  const payload = input || {};
  const result = {};

  function has(fieldName) {
    return Object.prototype.hasOwnProperty.call(payload, fieldName);
  }

  if (!partial || has("name")) {
    result.name = normalizeTextField(payload.name, "Stock item name", !partial);
  }

  if (!partial || has("unit")) {
    result.unit = normalizeTextField(payload.unit, "Unit", !partial).toLowerCase();
  }

  if (!partial || has("onHand")) {
    result.onHand = normalizeQuantityField(payload.onHand, "On-hand quantity", {
      required: !partial,
      minimum: 0
    });
  }

  if (!partial || has("reorderLevel")) {
    result.reorderLevel = normalizeQuantityField(payload.reorderLevel, "Reorder level", {
      required: !partial,
      minimum: 0
    });
  }

  if (!partial || has("supplier")) {
    result.supplier = normalizeTextField(payload.supplier, "Supplier", false);
  }

  if (!partial || has("lastUnitCost")) {
    result.lastUnitCost = normalizePrice(payload.lastUnitCost, !partial);
  }

  return result;
}

function normalizePurchaseInput(input) {
  const payload = input || {};
  const stockItemId = normalizeTextField(payload.stockItemId, "Stock item", true);

  return {
    stockItemId: stockItemId,
    quantity: normalizeQuantityField(payload.quantity, "Purchase quantity", {
      required: true,
      minimum: 0.01
    }),
    unitCost: normalizePrice(payload.unitCost, false),
    supplier: normalizeTextField(payload.supplier, "Supplier", false),
    note: normalizeTextField(payload.note, "Note", false)
  };
}

function normalizeRecipeInput(recipeInput, stockLookup) {
  if (recipeInput == null) {
    return [];
  }

  if (!Array.isArray(recipeInput)) {
    throw createRequestError(400, "Recipe must be provided as a list of stock items.");
  }

  const merged = recipeInput.reduce(function mergeRecipe(result, line) {
    const stockItemId = normalizeTextField(line && line.stockItemId, "Recipe stock item", true);
    const quantity = normalizeQuantityField(line && line.quantity, "Recipe quantity", {
      required: true,
      minimum: 0.01
    });
    const stockItem = stockLookup[stockItemId];

    if (!stockItem) {
      throw createRequestError(404, "Stock item " + stockItemId + " was not found.");
    }

    if (!result[stockItemId]) {
      result[stockItemId] = {
        stockItemId: stockItem.id,
        name: stockItem.name,
        unit: stockItem.unit,
        quantity: 0
      };
    }

    result[stockItemId].quantity = roundQuantity(result[stockItemId].quantity + quantity);
    return result;
  }, {});

  return Object.keys(merged)
    .sort()
    .map(function toRecipeLine(stockItemId) {
      return merged[stockItemId];
    });
}

function buildSplitAmounts(total, splitCount) {
  const baseAmount = Math.floor(total / splitCount);
  let remainder = total % splitCount;

  return Array.from({ length: splitCount }, function buildAmount(_, index) {
    const amount = baseAmount + (remainder > 0 ? 1 : 0);

    if (remainder > 0) {
      remainder -= 1;
    }

    return {
      label: "Split " + (index + 1),
      amount: amount
    };
  });
}

function buildReceipt(restaurant, order, splitCountValue) {
  const splitCount = normalizeSplitCount(splitCountValue);
  const balanceDue = order.balanceDue == null ? order.total : order.balanceDue;
  const lineItems = order.items.map(function toReceiptItem(item) {
    return {
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: item.price * item.quantity
    };
  });

  return {
    orderId: order.id,
    restaurant: {
      name: restaurant.name,
      branch: restaurant.branch,
      currency: restaurant.currency
    },
    channel: order.channel,
    tableId: order.tableId,
    status: order.status,
    placedAt: order.placedAt,
    issuedAt: getCurrentClock(),
    itemCount: order.itemCount,
    subtotal: order.total,
    total: order.total,
    paidTotal: order.paidTotal || 0,
    balanceDue: balanceDue,
    paymentStatus: order.paymentStatus || "unpaid",
    splitCount: splitCount,
    splitAmounts: buildSplitAmounts(order.total, splitCount),
    items: lineItems
  };
}

function buildPaymentReceipt(restaurant, order) {
  const balanceDue = order.balanceDue == null ? order.total : order.balanceDue;
  const payments = Array.isArray(order.payments)
    ? order.payments.map(function toPayment(payment) {
        return {
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
          receivedAt: payment.receivedAt,
          note: payment.note || ""
        };
      })
    : [];

  return {
    orderId: order.id,
    restaurant: {
      name: restaurant.name,
      branch: restaurant.branch,
      currency: restaurant.currency
    },
    channel: order.channel,
    tableId: order.tableId,
    status: order.status,
    issuedAt: getCurrentTimestamp(),
    total: order.total,
    paidTotal: order.paidTotal || 0,
    balanceDue: balanceDue,
    paymentStatus: order.paymentStatus || "unpaid",
    paymentCount: payments.length,
    latestPayment: payments.length > 0 ? payments[payments.length - 1] : null,
    payments: payments
  };
}

function aggregateInventoryUsage(lineItems) {
  const usageMap = (lineItems || []).reduce(function accumulate(result, item) {
    const recipe = Array.isArray(item.recipe) ? item.recipe : [];

    recipe.forEach(function toUsageLine(recipeLine) {
      if (!result[recipeLine.stockItemId]) {
        result[recipeLine.stockItemId] = {
          stockItemId: recipeLine.stockItemId,
          name: recipeLine.name,
          unit: recipeLine.unit,
          quantity: 0
        };
      }

      result[recipeLine.stockItemId].quantity = roundQuantity(
        result[recipeLine.stockItemId].quantity + recipeLine.quantity * item.quantity
      );
    });

    return result;
  }, {});

  return Object.keys(usageMap)
    .sort()
    .map(function toUsageLine(stockItemId) {
      return usageMap[stockItemId];
    });
}

function buildInventoryAlerts(stockItems) {
  return (stockItems || [])
    .filter(function isLowStock(item) {
      return Number(item.onHand || 0) <= Number(item.reorderLevel || 0);
    })
    .sort(function compareAlerts(left, right) {
      return Number(left.onHand || 0) - Number(right.onHand || 0);
    })
    .map(function toAlert(item) {
      return {
        id: "INV-" + item.id,
        stockItemId: item.id,
        item: item.name,
        remainingUnits: item.onHand,
        reorderLevel: item.reorderLevel,
        supplier: item.supplier || "Unassigned",
        unit: item.unit
      };
    });
}

function parseBusinessDate(dateValue) {
  const [year, month, day] = String(dateValue || getCurrentBusinessDate())
    .split("-")
    .map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatBusinessDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftBusinessDate(dateValue, offsetDays) {
  const date = parseBusinessDate(dateValue);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatBusinessDate(date);
}

function getOrderBusinessDate(order, fallbackDate) {
  return order && order.placedOn ? order.placedOn : fallbackDate || getCurrentBusinessDate();
}

function isSalesOrder(order) {
  return order.status === "completed";
}

function getPriorityRank(priority) {
  const normalizedPriority = normalizePriority(priority, true);
  const priorityIndex = priorityLevels.indexOf(normalizedPriority);
  return priorityIndex === -1 ? 1 : priorityIndex;
}

function getKitchenStatusRank(status) {
  return {
    pending: 0,
    preparing: 1,
    ready: 2,
    served: 3,
    completed: 4,
    cancelled: 5
  }[status] || 9;
}

function compareKitchenOrders(left, right) {
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

  return left.placedAt.localeCompare(right.placedAt);
}

function buildKitchenView(restaurant, orders) {
  const openOrders = (orders || []).filter(function isKitchenOrder(order) {
    return order.status === "pending" || order.status === "preparing" || order.status === "ready";
  });
  const kitchenOrders = cloneValue(openOrders).sort(compareKitchenOrders);

  return {
    restaurant: {
      name: restaurant.name,
      branch: restaurant.branch,
      businessDate: restaurant.businessDate
    },
    metrics: {
      openTickets: kitchenOrders.length,
      rushTickets: kitchenOrders.filter(function isRush(order) {
        return order.priority === "rush";
      }).length,
      readyTickets: kitchenOrders.filter(function isReady(order) {
        return order.status === "ready";
      }).length
    },
    orders: kitchenOrders
  };
}

function buildTopItems(orders) {
  const itemTotals = (orders || []).reduce(function accumulate(result, order) {
    order.items.forEach(function addItem(item) {
      if (!result[item.menuItemId]) {
        result[item.menuItemId] = {
          menuItemId: item.menuItemId,
          name: item.name,
          quantitySold: 0,
          revenue: 0
        };
      }

      result[item.menuItemId].quantitySold += item.quantity;
      result[item.menuItemId].revenue += item.price * item.quantity;
    });

    return result;
  }, {});

  return Object.keys(itemTotals)
    .map(function toItem(menuItemId) {
      return itemTotals[menuItemId];
    })
    .sort(function compareItems(left, right) {
      if (right.quantitySold !== left.quantitySold) {
        return right.quantitySold - left.quantitySold;
      }

      return right.revenue - left.revenue;
    })
    .slice(0, 5);
}

function buildPeriodReport(period, anchorDate, orders, stockHistory) {
  const startDate =
    period === "daily"
      ? anchorDate
      : period === "weekly"
        ? shiftBusinessDate(anchorDate, -6)
        : formatBusinessDate(
            new Date(Date.UTC(parseBusinessDate(anchorDate).getUTCFullYear(), parseBusinessDate(anchorDate).getUTCMonth(), 1))
          );
  const endDate = anchorDate;
  const completedOrders = (orders || []).filter(function inPeriod(order) {
    const orderDate = getOrderBusinessDate(order, anchorDate);
    return isSalesOrder(order) && orderDate >= startDate && orderDate <= endDate;
  });
  const expenseEntries = (stockHistory || []).filter(function inPeriod(entry) {
    const entryDate = String(entry.occurredAt || "").slice(0, 10);
    return entry.type === "purchase" && entryDate >= startDate && entryDate <= endDate;
  });
  const salesTotal = completedOrders.reduce(function sumTotal(total, order) {
    return total + order.total;
  }, 0);
  const expenseTotal = expenseEntries.reduce(function sumExpenses(total, entry) {
    return total + Number(entry.unitCost || 0) * Number(entry.quantityChange || 0);
  }, 0);

  return {
    period: period,
    startDate: startDate,
    endDate: endDate,
    orderCount: completedOrders.length,
    salesTotal: salesTotal,
    expenseTotal: expenseTotal,
    grossProfit: salesTotal - expenseTotal,
    mostSoldItems: buildTopItems(completedOrders)
  };
}

function buildReports(restaurant, orders, stockHistory) {
  const anchorDate = restaurant.businessDate || getCurrentBusinessDate();

  return {
    generatedAt: getCurrentTimestamp(),
    daily: buildPeriodReport("daily", anchorDate, orders, stockHistory),
    weekly: buildPeriodReport("weekly", anchorDate, orders, stockHistory),
    monthly: buildPeriodReport("monthly", anchorDate, orders, stockHistory)
  };
}

function createInitialState() {
  const restaurantProfile = {
    id: "REST-001",
    name: "Little",
    branch: "Ikeja Central",
    businessDate: "2026-04-09",
    shift: "Lunch Rush",
    activeStaff: 14,
    currency: "NGN"
  };

  const stockItems = [
    {
      id: "STK-101",
      name: "Jollof Rice Base",
      unit: "batch",
      onHand: 22,
      reorderLevel: 12,
      supplier: "Kitchen Prep",
      lastUnitCost: 2400
    },
    {
      id: "STK-102",
      name: "Croaker Fish",
      unit: "fish",
      onHand: 4,
      reorderLevel: 10,
      supplier: "Atlantic Fresh",
      lastUnitCost: 5200
    },
    {
      id: "STK-103",
      name: "Pepper Soup Base",
      unit: "pot",
      onHand: 14,
      reorderLevel: 8,
      supplier: "Market Run",
      lastUnitCost: 1800
    },
    {
      id: "STK-104",
      name: "Chapman Mix",
      unit: "pitcher mix",
      onHand: 9,
      reorderLevel: 6,
      supplier: "Bar Central",
      lastUnitCost: 1500
    },
    {
      id: "STK-105",
      name: "Plantain",
      unit: "bunch",
      onHand: 11,
      reorderLevel: 10,
      supplier: "Farm Route",
      lastUnitCost: 900
    },
    {
      id: "STK-106",
      name: "Palm Oil",
      unit: "bottle",
      onHand: 6,
      reorderLevel: 12,
      supplier: "Market Run",
      lastUnitCost: 3000
    },
    {
      id: "STK-107",
      name: "Bottled Water",
      unit: "bottle",
      onHand: 18,
      reorderLevel: 24,
      supplier: "Hydro Depot",
      lastUnitCost: 450
    }
  ];

  const stockLookup = stockItems.reduce(function indexStock(result, item) {
    result[item.id] = item;
    return result;
  }, {});

  const menuItems = [
    {
      id: "MENU-101",
      name: "Smoky Jollof Bowl",
      category: "food",
      station: "hot line",
      price: 8500,
      margin: "high",
      availability: "available",
      imageUrl: "",
      recipe: normalizeRecipeInput(
        [
          { stockItemId: "STK-101", quantity: 1 },
          { stockItemId: "STK-106", quantity: 1 }
        ],
        stockLookup
      )
    },
    {
      id: "MENU-102",
      name: "Grilled Croaker",
      category: "food",
      station: "grill",
      price: 14200,
      margin: "medium",
      availability: "available",
      imageUrl: "",
      recipe: normalizeRecipeInput(
        [
          { stockItemId: "STK-102", quantity: 1 },
          { stockItemId: "STK-105", quantity: 1 }
        ],
        stockLookup
      )
    },
    {
      id: "MENU-103",
      name: "Pepper Soup",
      category: "food",
      station: "hot line",
      price: 6200,
      margin: "high",
      availability: "available",
      imageUrl: "",
      recipe: normalizeRecipeInput(
        [
          { stockItemId: "STK-103", quantity: 1 },
          { stockItemId: "STK-106", quantity: 1 }
        ],
        stockLookup
      )
    },
    {
      id: "MENU-104",
      name: "Chapman Pitcher",
      category: "drinks",
      station: "bar",
      price: 9800,
      margin: "high",
      availability: "available",
      imageUrl: "",
      recipe: normalizeRecipeInput(
        [
          { stockItemId: "STK-104", quantity: 1 },
          { stockItemId: "STK-107", quantity: 2 }
        ],
        stockLookup
      )
    },
    {
      id: "MENU-105",
      name: "Boli and Fish",
      category: "snacks",
      station: "grill",
      price: 11700,
      margin: "medium",
      availability: "unavailable",
      imageUrl: "",
      recipe: normalizeRecipeInput(
        [
          { stockItemId: "STK-102", quantity: 1 },
          { stockItemId: "STK-105", quantity: 2 }
        ],
        stockLookup
      )
    }
  ];

  const menuLookup = menuItems.reduce(function indexMenuItems(result, item) {
    result[item.id] = item;
    return result;
  }, {});

  const orders = [
    buildSeedOrder(
      {
        id: "ORD-1040",
        tableId: null,
        channel: "takeaway",
        status: "completed",
        priority: "normal",
        course: "closed",
        placedOn: "2026-04-02",
        placedAt: "13:04",
        inventoryApplied: true,
        payments: [
          {
            id: "PAY-1",
            method: "cash",
            amount: 14700,
            receivedOn: "2026-04-02",
            receivedAt: "13:08",
            note: ""
          }
        ],
        items: [
          { menuItemId: "MENU-103", quantity: 1 },
          { menuItemId: "MENU-104", quantity: 1 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1041",
        tableId: null,
        channel: "delivery",
        status: "completed",
        priority: "rush",
        course: "closed",
        placedOn: "2026-04-08",
        placedAt: "19:12",
        inventoryApplied: true,
        payments: [
          {
            id: "PAY-1",
            method: "transfer",
            amount: 23200,
            receivedOn: "2026-04-08",
            receivedAt: "19:18",
            note: "Online dispatch"
          }
        ],
        items: [
          { menuItemId: "MENU-101", quantity: 1 },
          { menuItemId: "MENU-102", quantity: 1 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1042",
        tableId: "T1",
        channel: "dine-in",
        status: "preparing",
        priority: "rush",
        placedOn: "2026-04-09",
        placedAt: "12:10",
        inventoryApplied: true,
        items: [
          { menuItemId: "MENU-101", quantity: 2 },
          { menuItemId: "MENU-104", quantity: 1 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1043",
        tableId: null,
        channel: "delivery",
        status: "ready",
        priority: "normal",
        course: "dispatch",
        placedOn: "2026-04-09",
        placedAt: "12:03",
        inventoryApplied: true,
        payments: [
          {
            id: "PAY-1",
            method: "transfer",
            amount: 15000,
            receivedOn: "2026-04-09",
            receivedAt: "12:06",
            note: "Dispatch deposit"
          }
        ],
        items: [
          { menuItemId: "MENU-102", quantity: 1 },
          { menuItemId: "MENU-103", quantity: 1 },
          { menuItemId: "MENU-104", quantity: 2 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1044",
        tableId: "T3",
        channel: "dine-in",
        status: "pending",
        priority: "normal",
        placedOn: "2026-04-09",
        placedAt: "12:22",
        inventoryApplied: false,
        items: [
          { menuItemId: "MENU-103", quantity: 2 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1045",
        tableId: null,
        channel: "takeaway",
        status: "completed",
        priority: "low",
        course: "closed",
        placedOn: "2026-04-09",
        placedAt: "11:48",
        inventoryApplied: true,
        payments: [
          {
            id: "PAY-1",
            method: "cash",
            amount: 20000,
            receivedOn: "2026-04-09",
            receivedAt: "11:50",
            note: ""
          },
          {
            id: "PAY-2",
            method: "pos",
            amount: 21000,
            receivedOn: "2026-04-09",
            receivedAt: "11:53",
            note: "Card settlement"
          }
        ],
        items: [
          { menuItemId: "MENU-101", quantity: 2 },
          { menuItemId: "MENU-102", quantity: 1 },
          { menuItemId: "MENU-104", quantity: 1 }
        ]
      },
      menuLookup
    ),
    buildSeedOrder(
      {
        id: "ORD-1046",
        tableId: "T6",
        channel: "dine-in",
        status: "preparing",
        priority: "rush",
        placedOn: "2026-04-09",
        placedAt: "12:16",
        inventoryApplied: true,
        payments: [
          {
            id: "PAY-1",
            method: "cash",
            amount: 18000,
            receivedOn: "2026-04-09",
            receivedAt: "12:18",
            note: ""
          }
        ],
        items: [
          { menuItemId: "MENU-102", quantity: 2 },
          { menuItemId: "MENU-103", quantity: 1 },
          { menuItemId: "MENU-104", quantity: 2 }
        ]
      },
      menuLookup
    )
  ];

  const tables = [
    {
      id: "T1",
      seats: 2,
      status: "occupied",
      server: "Amara",
      customerName: "Okafor",
      partySize: 2,
      notes: "Window seat",
      currentOrderId: "ORD-1042",
      elapsedMinutes: 42
    },
    {
      id: "T2",
      seats: 4,
      status: "reserved",
      server: "Tunde",
      customerName: "Johnson Group",
      partySize: 4,
      notes: "Arriving after 13:00",
      currentOrderId: null,
      elapsedMinutes: 0
    },
    {
      id: "T3",
      seats: 4,
      status: "occupied",
      server: "Ayo",
      customerName: "Nwosu Family",
      partySize: 3,
      notes: "Birthday dessert request",
      currentOrderId: "ORD-1044",
      elapsedMinutes: 18
    },
    {
      id: "T4",
      seats: 6,
      status: "cleaning",
      server: "Support",
      customerName: "",
      partySize: 0,
      notes: "",
      currentOrderId: null,
      elapsedMinutes: 11
    },
    {
      id: "T5",
      seats: 2,
      status: "available",
      server: null,
      customerName: "",
      partySize: 0,
      notes: "",
      currentOrderId: null,
      elapsedMinutes: 0
    },
    {
      id: "T6",
      seats: 8,
      status: "occupied",
      server: "Zainab",
      customerName: "Corporate Lunch",
      partySize: 5,
      notes: "Need split bill",
      currentOrderId: "ORD-1046",
      elapsedMinutes: 27
    }
  ];

  const stockHistory = [
    {
      id: "HIS-201",
      stockItemId: "STK-101",
      item: "Jollof Rice Base",
      unit: "batch",
      type: "purchase",
      quantityChange: 10,
      balanceAfter: 22,
      occurredAt: "2026-04-09 09:10",
      reference: "PO-901",
      supplier: "Kitchen Prep",
      unitCost: 2400,
      note: "Morning kitchen prep"
    },
    {
      id: "HIS-202",
      stockItemId: "STK-106",
      item: "Palm Oil",
      unit: "bottle",
      type: "purchase",
      quantityChange: 8,
      balanceAfter: 6,
      occurredAt: "2026-04-09 09:25",
      reference: "PO-902",
      supplier: "Market Run",
      unitCost: 3000,
      note: "Emergency market run"
    },
    {
      id: "HIS-203",
      stockItemId: "STK-107",
      item: "Bottled Water",
      unit: "bottle",
      type: "purchase",
      quantityChange: 24,
      balanceAfter: 18,
      occurredAt: "2026-04-09 09:42",
      reference: "PO-903",
      supplier: "Hydro Depot",
      unitCost: 450,
      note: "Lunch shift restock"
    },
    {
      id: "HIS-204",
      stockItemId: "STK-102",
      item: "Croaker Fish",
      unit: "fish",
      type: "purchase",
      quantityChange: 12,
      balanceAfter: 4,
      occurredAt: "2026-04-08 08:34",
      reference: "PO-904",
      supplier: "Atlantic Fresh",
      unitCost: 5200,
      note: "Fresh delivery for dinner service"
    },
    {
      id: "HIS-205",
      stockItemId: "STK-103",
      item: "Pepper Soup Base",
      unit: "pot",
      type: "purchase",
      quantityChange: 6,
      balanceAfter: 14,
      occurredAt: "2026-04-02 09:05",
      reference: "PO-905",
      supplier: "Market Run",
      unitCost: 1800,
      note: "Weekly broth prep"
    }
  ];

  return {
    inventoryAlerts: buildInventoryAlerts(stockItems),
    menuItems: menuItems,
    orders: orders,
    restaurantProfile: restaurantProfile,
    stockHistory: stockHistory,
    stockItems: stockItems,
    tables: tables
  };
}

function canEditOrder(order) {
  return order.status === "pending" || order.status === "preparing";
}

function isOrderOpen(order) {
  return order.status !== "completed" && order.status !== "cancelled";
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  aggregateInventoryUsage,
  buildInventoryAlerts,
  buildKitchenView,
  buildOrderRecord,
  buildPaymentReceipt,
  buildPaymentSummary,
  buildReports,
  buildReceipt,
  calculateOrderTotals,
  canEditOrder,
  cloneValue,
  createInitialState,
  createRequestError,
  determineCourse,
  getCurrentBusinessDate,
  getCurrentClock,
  getCurrentTimestamp,
  getMenuSequenceFromId,
  getOrderSequenceFromId,
  getOrderBusinessDate,
  getStockHistorySequenceFromId,
  getStockSequenceFromId,
  getTableSequenceFromId,
  isOrderOpen,
  menuAvailabilityStates,
  menuMarginLevels,
  normalizeMenuItemInput,
  normalizePaymentInput,
  normalizePriority,
  normalizePurchaseInput,
  normalizeRecipeInput,
  normalizeSplitCount,
  normalizeStockItemInput,
  normalizeTableInput,
  orderChannels,
  orderStatusFlow,
  paymentMethods,
  priorityLevels,
  roundQuantity,
  summarizeItems,
  sumOutstandingBalances,
  sumRevenue,
  sumRevenueForDate,
  tableStatuses
};
