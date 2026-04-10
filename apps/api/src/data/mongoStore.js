const { MongoClient } = require("mongodb");
const { getDatabaseConfig } = require("../config");
const {
  aggregateInventoryUsage,
  buildInventoryAlerts,
  buildOrderRecord,
  buildPaymentReceipt,
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

let initPromise = null;
let clientPromise = null;
let databasePromise = null;

function fireAndForget(work) {
  Promise.resolve()
    .then(work)
    .catch(function logNotificationError(error) {
      console.error(error && error.stack ? error.stack : error);
    });
}

function delay(milliseconds) {
  return new Promise(function onDelay(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

function isRetriableConnectionError(error) {
  const message = error && error.message ? error.message : "";

  return (
    message.includes("ECONNRESET") ||
    message.includes("ETIMEOUT") ||
    message.includes("secureConnect") ||
    message.includes("MongoServerSelectionError")
  );
}

function getCollections(database) {
  return {
    counters: database.collection("counters"),
    menuItems: database.collection("menuItems"),
    orders: database.collection("orders"),
    restaurantProfile: database.collection("restaurantProfile"),
    stockHistory: database.collection("stockHistory"),
    stockItems: database.collection("stockItems"),
    tables: database.collection("tables")
  };
}

function sanitizeDocument(document) {
  if (!document) {
    return null;
  }

  const sanitized = Object.assign({}, document);
  delete sanitized._id;
  delete sanitized.sequence;
  return sanitized;
}

function sanitizeDocuments(documents) {
  return documents.map(sanitizeDocument);
}

function clearTableAssignment(table) {
  return Object.assign({}, table, {
    currentOrderId: null,
    customerName: "",
    partySize: 0,
    notes: "",
    elapsedMinutes: 0
  });
}

function normalizeStoredLineItems(items) {
  return (items || []).map(function normalizeItem(item) {
    return {
      menuItemId: item.menuItemId,
      name: item.name,
      category: item.category,
      station: item.station,
      price: item.price,
      quantity: item.quantity,
      imageUrl: item.imageUrl || "",
      recipe: Array.isArray(item.recipe) ? cloneValue(item.recipe) : []
    };
  });
}

function hydrateStoredOrder(document) {
  if (!document) {
    return null;
  }

  const sanitized = sanitizeDocument(document);
  const lineItems = normalizeStoredLineItems(sanitized.items);

  return Object.assign(
    buildOrderRecord(
      {
        id: sanitized.id,
        tableId: sanitized.tableId,
        channel: sanitized.channel,
        status: sanitized.status,
        priority: sanitized.priority,
        course: sanitized.course,
        placedOn: sanitized.placedOn,
        placedAt: sanitized.placedAt,
        payments: Array.isArray(sanitized.payments) ? sanitized.payments : [],
        inventoryApplied: Boolean(sanitized.inventoryApplied)
      },
      lineItems
    ),
    {
      sequence: document.sequence || getOrderSequenceFromId(document.id)
    }
  );
}

async function withCollections(work) {
  const config = getDatabaseConfig();

  if (!config.uri) {
    throw createRequestError(500, "MongoDB is not configured. Set MONGODB_URI before starting the API.");
  }

  let lastError = null;

  for (const waitTime of [0, 300, 900]) {
    if (waitTime > 0) {
      await delay(waitTime);
    }

    try {
      const database = await getDatabase();
      return await work(getCollections(database));
    } catch (error) {
      lastError = error;

      if (!isRetriableConnectionError(error)) {
        throw error;
      }

      await resetDatabase();
    }
  }

  throw lastError;
}

async function getClient() {
  const config = getDatabaseConfig();

  if (!config.uri) {
    throw createRequestError(500, "MongoDB is not configured. Set MONGODB_URI before starting the API.");
  }

  if (!clientPromise) {
    clientPromise = (async function connectClient() {
      const client = new MongoClient(config.uri, {
        family: 4
      });

      try {
        await client.connect();
        return client;
      } catch (error) {
        await client.close().catch(function ignoreCloseError() {
          return undefined;
        });

        throw error;
      }
    })().catch(function onConnectionError(error) {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

async function getDatabase() {
  const config = getDatabaseConfig();

  if (!databasePromise) {
    databasePromise = getClient()
      .then(function selectDatabase(client) {
        return client.db(config.dbName);
      })
      .catch(function onDatabaseError(error) {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}

async function resetDatabase() {
  const activeClientPromise = clientPromise;

  clientPromise = null;
  databasePromise = null;

  if (!activeClientPromise) {
    return;
  }

  try {
    const client = await activeClientPromise;
    await client.close().catch(function ignoreCloseError() {
      return undefined;
    });
  } catch (error) {
    return undefined;
  }
}

async function nextCounterValue(collections, key) {
  const counter = await collections.counters.findOneAndUpdate(
    { key: key },
    {
      $inc: {
        value: 1
      }
    },
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  return counter.value;
}

async function ensureCounter(collections, key, initialValue) {
  if (!(await collections.counters.findOne({ key: key }))) {
    await collections.counters.insertOne({
      key: key,
      value: initialValue
    });
  }
}

async function refreshMenuRecipesForStock(collections, stockItem) {
  const menuItems = await collections.menuItems.find({ "recipe.stockItemId": stockItem.id }).toArray();

  for (const menuItem of menuItems) {
    const updatedRecipe = (menuItem.recipe || []).map(function updateRecipeLine(line) {
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

    await collections.menuItems.updateOne(
      {
        id: menuItem.id
      },
      {
        $set: {
          recipe: updatedRecipe
        }
      }
    );
  }
}

async function applyStockAdjustments(collections, adjustments, definition) {
  const changeSet = (adjustments || []).filter(function hasChange(change) {
    return change.quantityChange !== 0;
  });

  if (changeSet.length === 0) {
    return [];
  }

  const stockItems = await collections.stockItems
    .find({
      id: {
        $in: changeSet.map(function toId(change) {
          return change.stockItemId;
        })
      }
    })
    .toArray();
  const stockLookup = stockItems.reduce(function indexStock(result, item) {
    result[item.id] = item;
    return result;
  }, {});

  changeSet.forEach(function validateChange(change) {
    const stockItem = stockLookup[change.stockItemId];

    if (!stockItem) {
      throw createRequestError(404, "Stock item " + change.stockItemId + " was not found.");
    }

    const nextOnHand = roundQuantity(stockItem.onHand + change.quantityChange);

    if (nextOnHand < 0) {
      throw createRequestError(409, stockItem.name + " does not have enough stock for that update.");
    }
  });

  const historyEntries = [];

  for (const change of changeSet) {
    const stockItem = stockLookup[change.stockItemId];
    const nextOnHand = roundQuantity(stockItem.onHand + change.quantityChange);

    await collections.stockItems.updateOne(
      {
        id: stockItem.id
      },
      {
        $set: {
          onHand: nextOnHand
        }
      }
    );

    stockItem.onHand = nextOnHand;

    const historyId = await nextCounterValue(collections, "stockHistoryId");
    const historyEntry = {
      id: "HIS-" + String(historyId),
      stockItemId: stockItem.id,
      item: stockItem.name,
      unit: stockItem.unit,
      type: definition.type,
      quantityChange: change.quantityChange,
      balanceAfter: nextOnHand,
      occurredAt: getCurrentTimestamp(),
      reference: definition.reference || stockItem.id,
      supplier: definition.supplier || stockItem.supplier || "",
      unitCost: definition.unitCost == null ? stockItem.lastUnitCost : definition.unitCost,
      note: definition.note || ""
    };

    await collections.stockHistory.insertOne(historyEntry);
    historyEntries.push(historyEntry);
  }

  const lowStockAlerts = buildInventoryAlerts(
    Object.keys(stockLookup).map(function toStockItem(stockItemId) {
      return sanitizeDocument(stockLookup[stockItemId]);
    })
  ).filter(function keepAlert(alert) {
    return changeSet.some(function hasStockItem(change) {
      return change.stockItemId === alert.stockItemId;
    });
  });

  if (lowStockAlerts.length > 0) {
    const restaurant = sanitizeDocument(await collections.restaurantProfile.findOne({}));
    fireAndForget(function sendLowStockNotification() {
      return notifyLowStock(restaurant, lowStockAlerts);
    });
  }

  return historyEntries;
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

async function allocateInventoryForOrder(collections, order, note) {
  const usage = aggregateInventoryUsage(order.items).map(function toAdjustment(line) {
    return {
      stockItemId: line.stockItemId,
      quantityChange: -line.quantity
    };
  });

  await applyStockAdjustments(collections, usage, {
    type: "usage",
    reference: order.id,
    note: note || "Inventory allocated to order " + order.id + "."
  });
}

async function normalizeLineItems(items, collections) {
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

  const menuItems = await collections.menuItems
    .find({
      id: {
        $in: filteredIds
      }
    })
    .toArray();
  const menuLookup = menuItems.reduce(function indexMenuItems(result, item) {
    result[item.id] = item;
    return result;
  }, {});

  return filteredIds.map(function toLineItem(menuItemId) {
    const menuItem = menuLookup[menuItemId];

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

async function normalizeMenuRecipe(recipeInput, collections) {
  const stockItems = await collections.stockItems.find({}).toArray();
  const stockLookup = stockItems.reduce(function indexStock(result, item) {
    result[item.id] = item;
    return result;
  }, {});

  return normalizeRecipeInput(recipeInput, stockLookup);
}

async function migrateLegacyDocuments(collections, seed) {
  const seedMenuLookup = seed.menuItems.reduce(function indexMenuItems(result, item) {
    result[item.id] = item;
    return result;
  }, {});
  const seedStockLookup = seed.stockItems.reduce(function indexStockItems(result, item) {
    result[item.id] = item;
    return result;
  }, {});
  const seedTableLookup = seed.tables.reduce(function indexTables(result, table) {
    result[table.id] = table;
    return result;
  }, {});
  const stockItems = await collections.stockItems.find({}).toArray();

  for (const stockItem of stockItems) {
    const seedItem = seedStockLookup[stockItem.id];
    const updates = {};

    if (stockItem.unit == null && seedItem) {
      updates.unit = seedItem.unit;
    }

    if (stockItem.supplier == null && seedItem) {
      updates.supplier = seedItem.supplier;
    }

    if (stockItem.lastUnitCost == null && seedItem) {
      updates.lastUnitCost = seedItem.lastUnitCost;
    }

    if (Object.keys(updates).length > 0) {
      await collections.stockItems.updateOne(
        {
          id: stockItem.id
        },
        {
          $set: updates
        }
      );
    }
  }

  const menuItems = await collections.menuItems.find({}).toArray();

  for (const menuItem of menuItems) {
    const seedItem = seedMenuLookup[menuItem.id];
    const updates = {};

    if (!Array.isArray(menuItem.recipe)) {
      updates.recipe = seedItem ? seedItem.recipe : [];
    }

    if (menuItem.imageUrl == null) {
      updates.imageUrl = "";
    }

    if (Object.keys(updates).length > 0) {
      await collections.menuItems.updateOne(
        {
          id: menuItem.id
        },
        {
          $set: updates
        }
      );
    }
  }

  const tables = await collections.tables.find({}).toArray();

  for (const table of tables) {
    const seedTable = seedTableLookup[table.id];
    const updates = {};

    if (table.customerName == null) {
      updates.customerName = seedTable ? seedTable.customerName : "";
    }

    if (table.partySize == null) {
      updates.partySize = seedTable ? seedTable.partySize : 0;
    }

    if (table.notes == null) {
      updates.notes = seedTable ? seedTable.notes : "";
    }

    if (Object.keys(updates).length > 0) {
      await collections.tables.updateOne(
        {
          id: table.id
        },
        {
          $set: updates
        }
      );
    }
  }

  const currentMenuItems = await collections.menuItems.find({}).toArray();
  const currentMenuLookup = currentMenuItems.reduce(function indexMenuItems(result, item) {
    result[item.id] = item;
    return result;
  }, {});
  const orders = await collections.orders.find({}).toArray();

  for (const order of orders) {
    const lineItems = (order.items || []).map(function toLineItem(item) {
      const menuItem = currentMenuLookup[item.menuItemId];

      return {
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        station: item.station,
        price: item.price,
        quantity: item.quantity,
        imageUrl: item.imageUrl || (menuItem ? menuItem.imageUrl || "" : ""),
        recipe: Array.isArray(item.recipe) ? item.recipe : cloneValue(menuItem ? menuItem.recipe || [] : [])
      };
    });
    const normalizedOrder = Object.assign(
      buildOrderRecord(
        {
          id: order.id,
          tableId: order.tableId,
          channel: order.channel,
          status: order.status,
          priority: order.priority || "normal",
          course: order.course,
          placedOn: order.placedOn || seed.restaurantProfile.businessDate,
          placedAt: order.placedAt,
          payments: Array.isArray(order.payments) ? order.payments : [],
          inventoryApplied: typeof order.inventoryApplied === "boolean" ? order.inventoryApplied : order.status !== "pending" && order.status !== "cancelled"
        },
        lineItems
      ),
      {
        sequence: order.sequence || getOrderSequenceFromId(order.id)
      }
    );

    await collections.orders.updateOne(
      {
        id: order.id
      },
      {
        $set: normalizedOrder
      }
    );
  }
}

async function seedCollections(collections) {
  const seed = createInitialState();

  if (!(await collections.restaurantProfile.findOne({}))) {
    await collections.restaurantProfile.insertOne(seed.restaurantProfile);
  }

  if (!(await collections.menuItems.findOne({}))) {
    await collections.menuItems.insertMany(seed.menuItems);
  }

  if (!(await collections.tables.findOne({}))) {
    await collections.tables.insertMany(seed.tables);
  }

  if (!(await collections.orders.findOne({}))) {
    await collections.orders.insertMany(
      seed.orders.map(function toOrder(order) {
        return Object.assign({}, order, {
          sequence: getOrderSequenceFromId(order.id)
        });
      })
    );
  }

  if (!(await collections.stockItems.findOne({}))) {
    await collections.stockItems.insertMany(seed.stockItems);
  }

  if (!(await collections.stockHistory.findOne({}))) {
    await collections.stockHistory.insertMany(seed.stockHistory);
  }

  await ensureCounter(
    collections,
    "orderId",
    seed.orders.reduce(function findHighest(highest, order) {
      return Math.max(highest, getOrderSequenceFromId(order.id));
    }, 1040)
  );
  await ensureCounter(
    collections,
    "menuItemId",
    seed.menuItems.reduce(function findHighest(highest, item) {
      return Math.max(highest, getMenuSequenceFromId(item.id));
    }, 100)
  );
  await ensureCounter(
    collections,
    "stockItemId",
    seed.stockItems.reduce(function findHighest(highest, item) {
      return Math.max(highest, getStockSequenceFromId(item.id));
    }, 100)
  );
  await ensureCounter(
    collections,
    "stockHistoryId",
    seed.stockHistory.reduce(function findHighest(highest, entry) {
      return Math.max(highest, getStockHistorySequenceFromId(entry.id));
    }, 200)
  );
  await ensureCounter(
    collections,
    "tableId",
    seed.tables.reduce(function findHighest(highest, table) {
      return Math.max(highest, getTableSequenceFromId(table.id));
    }, 0)
  );

  await migrateLegacyDocuments(collections, seed);
}

async function ensureMongoState() {
  if (!initPromise) {
    initPromise = withCollections(seedCollections).catch(function onError(error) {
      initPromise = null;
      throw error;
    });
  }

  await initPromise;
}

async function getRestaurantProfile() {
  await ensureMongoState();

  return withCollections(async function readRestaurantProfile(collections) {
    return sanitizeDocument(await collections.restaurantProfile.findOne({}));
  });
}

async function getTables() {
  await ensureMongoState();

  return withCollections(async function readTables(collections) {
    return sanitizeDocuments(await collections.tables.find({}).sort({ id: 1 }).toArray());
  });
}

async function getOrders() {
  await ensureMongoState();

  return withCollections(async function readOrders(collections) {
    const orders = await collections.orders.find({}).sort({ sequence: -1 }).toArray();
    return orders.map(hydrateStoredOrder).map(sanitizeDocument);
  });
}

async function getMenuItems() {
  await ensureMongoState();

  return withCollections(async function readMenuItems(collections) {
    return sanitizeDocuments(await collections.menuItems.find({}).sort({ id: 1 }).toArray());
  });
}

async function getInventoryItems() {
  await ensureMongoState();

  return withCollections(async function readStockItems(collections) {
    return sanitizeDocuments(await collections.stockItems.find({}).sort({ id: 1 }).toArray());
  });
}

async function getStockHistory() {
  await ensureMongoState();

  return withCollections(async function readStockHistory(collections) {
    return sanitizeDocuments(await collections.stockHistory.find({}).sort({ occurredAt: -1, id: -1 }).toArray());
  });
}

async function getInventoryAlerts() {
  await ensureMongoState();

  return withCollections(async function readInventoryAlerts(collections) {
    const stockItems = await collections.stockItems.find({}).sort({ id: 1 }).toArray();
    return buildInventoryAlerts(sanitizeDocuments(stockItems));
  });
}

async function createOrder(input) {
  await ensureMongoState();

  return withCollections(async function createOrderInDatabase(collections) {
    const channel = input && input.channel;
    let table = null;

    if (!orderChannels.includes(channel)) {
      throw createRequestError(400, "Order channel must be dine-in, takeaway, or delivery.");
    }

    const tableId = channel === "dine-in" ? input.tableId : null;
    const lineItems = await normalizeLineItems(input && input.items, collections);

    if (channel === "dine-in" && !tableId) {
      throw createRequestError(400, "Select a table for dine-in orders.");
    }

    if (channel === "dine-in") {
      table = await collections.tables.findOne({
        id: tableId
      });

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

    const sequence = await nextCounterValue(collections, "orderId");
    const order = Object.assign(
      buildOrderRecord(
        {
          id: "ORD-" + String(sequence),
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
      ),
      {
        sequence: sequence
      }
    );

    await collections.orders.insertOne(order);

    if (order.tableId) {
      await collections.tables.updateOne(
        {
          id: order.tableId
        },
        {
          $set: {
            status: "occupied",
            currentOrderId: order.id,
            elapsedMinutes: 0,
            server: table.server || "Floor Team"
          }
        }
      );
    }

    return sanitizeDocument(order);
  });
}

async function updateOrderItems(orderId, input) {
  await ensureMongoState();

  return withCollections(async function updateOrderItemsInDatabase(collections) {
    const storedOrder = await collections.orders.findOne({
      id: orderId
    });
    const order = hydrateStoredOrder(storedOrder);

    if (!order) {
      throw createRequestError(404, "Order " + orderId + " was not found.");
    }

    if (!canEditOrder(order)) {
      throw createRequestError(409, "Only pending or preparing orders can be edited.");
    }

    const lineItems = await normalizeLineItems(input && input.items, collections);
    const updatedOrder = Object.assign(
      buildOrderRecord(
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
      ),
      {
        sequence: storedOrder.sequence || getOrderSequenceFromId(order.id)
      }
    );

    if (order.inventoryApplied) {
      await applyStockAdjustments(collections, toUsageDelta(order.items, updatedOrder.items), {
        type: "adjustment",
        reference: order.id,
        note: "Inventory adjusted after editing " + order.id + "."
      });
    }

    await collections.orders.updateOne(
      {
        id: orderId
      },
      {
        $set: updatedOrder
      }
    );

    return sanitizeDocument(hydrateStoredOrder(await collections.orders.findOne({ id: orderId })));
  });
}

async function updateOrderStatus(orderId, nextStatus) {
  await ensureMongoState();

  return withCollections(async function updateOrderInDatabase(collections) {
    const storedOrder = await collections.orders.findOne({
      id: orderId
    });
    const order = hydrateStoredOrder(storedOrder);

    if (!order) {
      throw createRequestError(404, "Order " + orderId + " was not found.");
    }

    if (!orderStatusFlow[order.status]) {
      throw createRequestError(409, "Order " + orderId + " cannot be updated from its current state.");
    }

    if (!orderStatusFlow[order.status].includes(nextStatus)) {
      throw createRequestError(409, "Order " + orderId + " cannot move from " + order.status + " to " + nextStatus + ".");
    }

    const updates = {
      status: nextStatus
    };

    if (nextStatus === "preparing" && !order.inventoryApplied) {
      await allocateInventoryForOrder(collections, order, "Inventory allocated when " + order.id + " entered preparation.");
      updates.inventoryApplied = true;
    }

    if (nextStatus === "ready") {
      updates.course = "pass";
    } else if (nextStatus === "served") {
      updates.course = "served";
    } else if (nextStatus === "completed") {
      updates.course = "closed";
    } else if (nextStatus === "cancelled") {
      updates.course = "cancelled";
    }

    await collections.orders.updateOne(
      {
        id: orderId
      },
      {
        $set: updates
      }
    );

    if (order.tableId && nextStatus === "completed") {
      await collections.tables.updateOne(
        {
          id: order.tableId
        },
        {
          $set: {
            currentOrderId: null,
            customerName: "",
            partySize: 0,
            notes: "",
            elapsedMinutes: 0,
            status: "cleaning"
          }
        }
      );
    }

    if (order.tableId && nextStatus === "cancelled") {
      await collections.tables.updateOne(
        {
          id: order.tableId
        },
        {
          $set: {
            currentOrderId: null,
            customerName: "",
            partySize: 0,
            notes: "",
            elapsedMinutes: 0,
            status: "available"
          }
        }
      );
    }

    const updatedOrder = sanitizeDocument(hydrateStoredOrder(await collections.orders.findOne({ id: orderId })));

    if (nextStatus === "ready" || (nextStatus === "served" && Number(updatedOrder.balanceDue || 0) > 0)) {
      const restaurant = sanitizeDocument(await collections.restaurantProfile.findOne({}));

      if (nextStatus === "ready") {
        fireAndForget(function sendReadyNotification() {
          return notifyOrderReady(restaurant, updatedOrder);
        });
      } else {
        fireAndForget(function sendPaymentReminder() {
          return notifyPaymentPending(restaurant, updatedOrder);
        });
      }
    }

    return updatedOrder;
  });
}

async function recordPayment(orderId, input) {
  await ensureMongoState();

  return withCollections(async function recordOrderPayment(collections) {
    const storedOrder = await collections.orders.findOne({
      id: orderId
    });
    const order = hydrateStoredOrder(storedOrder);

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

    const payments = order.payments.concat({
      id: "PAY-" + String(order.payments.length + 1),
      method: payment.method,
      amount: payment.amount,
      receivedOn: getCurrentBusinessDate(),
      receivedAt: getCurrentClock(),
      note: payment.note
    });
    const updatedOrder = Object.assign(
      buildOrderRecord(
        {
          id: order.id,
          tableId: order.tableId,
          channel: order.channel,
          status: order.status,
          priority: order.priority,
          course: order.course,
          placedOn: order.placedOn,
          placedAt: order.placedAt,
          payments: payments,
          inventoryApplied: order.inventoryApplied
        },
        order.items
      ),
      {
        sequence: storedOrder.sequence || getOrderSequenceFromId(order.id)
      }
    );

    await collections.orders.updateOne(
      {
        id: orderId
      },
      {
        $set: {
          payments: updatedOrder.payments,
          paidTotal: updatedOrder.paidTotal,
          balanceDue: updatedOrder.balanceDue,
          paymentStatus: updatedOrder.paymentStatus
        }
      }
    );

    return sanitizeDocument(hydrateStoredOrder(await collections.orders.findOne({ id: orderId })));
  });
}

async function updateOrderPriority(orderId, nextPriority) {
  await ensureMongoState();

  return withCollections(async function updateOrderPriorityInDatabase(collections) {
    const storedOrder = await collections.orders.findOne({
      id: orderId
    });
    const order = hydrateStoredOrder(storedOrder);

    if (!order) {
      throw createRequestError(404, "Order " + orderId + " was not found.");
    }

    if (!isOrderOpen(order)) {
      throw createRequestError(409, "Completed or cancelled orders cannot be reprioritized.");
    }

    const priority = normalizePriority(nextPriority, true);

    await collections.orders.updateOne(
      {
        id: orderId
      },
      {
        $set: {
          priority: priority
        }
      }
    );

    return sanitizeDocument(hydrateStoredOrder(await collections.orders.findOne({ id: orderId })));
  });
}

async function updateTableStatus(tableId, nextStatus) {
  await ensureMongoState();

  return withCollections(async function updateTableInDatabase(collections) {
    const table = await collections.tables.findOne({
      id: tableId
    });

    if (!table) {
      throw createRequestError(404, "Table " + tableId + " was not found.");
    }

    if (!tableStatuses.includes(nextStatus)) {
      throw createRequestError(400, "Table status " + nextStatus + " is not supported.");
    }

    const currentOrder = table.currentOrderId
      ? hydrateStoredOrder(
          await collections.orders.findOne({
            id: table.currentOrderId
          })
        )
      : null;

    if (currentOrder && isOrderOpen(currentOrder) && nextStatus !== "occupied") {
      throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
    }

    const updates = {
      status: nextStatus
    };

    if (nextStatus === "available") {
      Object.assign(updates, clearTableAssignment(table));
      updates.status = "available";
    }

    if (nextStatus === "cleaning") {
      Object.assign(updates, clearTableAssignment(table));
      updates.status = "cleaning";
    }

    await collections.tables.updateOne(
      {
        id: tableId
      },
      {
        $set: updates
      }
    );

    return sanitizeDocument(await collections.tables.findOne({ id: tableId }));
  });
}

async function createTable(input) {
  await ensureMongoState();

  return withCollections(async function createTableInDatabase(collections) {
    const sequence = await nextCounterValue(collections, "tableId");
    const table = Object.assign(
      {
        id: "T" + String(sequence),
        currentOrderId: null,
        elapsedMinutes: 0
      },
      normalizeTableInput(input)
    );

    await collections.tables.insertOne(table);
    return sanitizeDocument(table);
  });
}

async function updateTable(tableId, input) {
  await ensureMongoState();

  return withCollections(async function updateTableAssignmentInDatabase(collections) {
    const existingTable = await collections.tables.findOne({
      id: tableId
    });

    if (!existingTable) {
      throw createRequestError(404, "Table " + tableId + " was not found.");
    }

    const updates = normalizeTableInput(input, { partial: true });
    const currentOrder = existingTable.currentOrderId
      ? hydrateStoredOrder(
          await collections.orders.findOne({
            id: existingTable.currentOrderId
          })
        )
      : null;

    if (currentOrder && isOrderOpen(currentOrder) && updates.status && updates.status !== "occupied") {
      throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
    }

    if (updates.status === "available" || updates.status === "cleaning") {
      Object.assign(updates, clearTableAssignment(existingTable), {
        status: updates.status
      });
    }

    if (Object.keys(updates).length > 0) {
      await collections.tables.updateOne(
        {
          id: tableId
        },
        {
          $set: updates
        }
      );
    }

    return sanitizeDocument(await collections.tables.findOne({ id: tableId }));
  });
}

async function deleteTable(tableId) {
  await ensureMongoState();

  return withCollections(async function deleteTableFromDatabase(collections) {
    const existingTable = await collections.tables.findOne({
      id: tableId
    });

    if (!existingTable) {
      throw createRequestError(404, "Table " + tableId + " was not found.");
    }

    const currentOrder = existingTable.currentOrderId
      ? hydrateStoredOrder(
          await collections.orders.findOne({
            id: existingTable.currentOrderId
          })
        )
      : null;

    if (currentOrder && isOrderOpen(currentOrder)) {
      throw createRequestError(409, "Table " + tableId + " still has an active ticket.");
    }

    await collections.tables.deleteOne({
      id: tableId
    });

    return sanitizeDocument(existingTable);
  });
}

async function getOrderReceipt(orderId, splitCount) {
  await ensureMongoState();

  return withCollections(async function readOrderReceipt(collections) {
    const [restaurant, storedOrder] = await Promise.all([
      collections.restaurantProfile.findOne({}),
      collections.orders.findOne({
        id: orderId
      })
    ]);
    const order = hydrateStoredOrder(storedOrder);

    if (!order) {
      throw createRequestError(404, "Order " + orderId + " was not found.");
    }

    return buildReceipt(sanitizeDocument(restaurant), order, splitCount);
  });
}

async function getPaymentReceipt(orderId) {
  await ensureMongoState();

  return withCollections(async function readPaymentReceipt(collections) {
    const [restaurant, storedOrder] = await Promise.all([
      collections.restaurantProfile.findOne({}),
      collections.orders.findOne({
        id: orderId
      })
    ]);
    const order = hydrateStoredOrder(storedOrder);

    if (!order) {
      throw createRequestError(404, "Order " + orderId + " was not found.");
    }

    return buildPaymentReceipt(sanitizeDocument(restaurant), order);
  });
}

async function createMenuItem(input) {
  await ensureMongoState();

  return withCollections(async function createMenuItemInDatabase(collections) {
    const sequence = await nextCounterValue(collections, "menuItemId");
    const menuItem = Object.assign(
      {
        id: "MENU-" + String(sequence)
      },
      normalizeMenuItemInput(input),
      {
        recipe: await normalizeMenuRecipe(input && input.recipe, collections)
      }
    );

    await collections.menuItems.insertOne(menuItem);
    return sanitizeDocument(menuItem);
  });
}

async function updateMenuItem(menuItemId, input) {
  await ensureMongoState();

  return withCollections(async function updateMenuItemInDatabase(collections) {
    const existingItem = await collections.menuItems.findOne({
      id: menuItemId
    });

    if (!existingItem) {
      throw createRequestError(404, "Menu item " + menuItemId + " was not found.");
    }

    const updates = normalizeMenuItemInput(input, { partial: true });

    if (Object.prototype.hasOwnProperty.call(input || {}, "recipe")) {
      updates.recipe = await normalizeMenuRecipe(input.recipe, collections);
    }

    if (Object.keys(updates).length > 0) {
      await collections.menuItems.updateOne(
        {
          id: menuItemId
        },
        {
          $set: updates
        }
      );
    }

    return sanitizeDocument(await collections.menuItems.findOne({ id: menuItemId }));
  });
}

async function deleteMenuItem(menuItemId) {
  await ensureMongoState();

  return withCollections(async function deleteMenuItemFromDatabase(collections) {
    const existingItem = await collections.menuItems.findOne({
      id: menuItemId
    });

    if (!existingItem) {
      throw createRequestError(404, "Menu item " + menuItemId + " was not found.");
    }

    await collections.menuItems.deleteOne({
      id: menuItemId
    });

    return sanitizeDocument(existingItem);
  });
}

async function createInventoryItem(input) {
  await ensureMongoState();

  return withCollections(async function createInventoryItemInDatabase(collections) {
    const sequence = await nextCounterValue(collections, "stockItemId");
    const stockItem = Object.assign(
      {
        id: "STK-" + String(sequence)
      },
      normalizeStockItemInput(input)
    );

    await collections.stockItems.insertOne(stockItem);
    return sanitizeDocument(stockItem);
  });
}

async function updateInventoryItem(stockItemId, input) {
  await ensureMongoState();

  return withCollections(async function updateInventoryItemInDatabase(collections) {
    const existingItem = await collections.stockItems.findOne({
      id: stockItemId
    });

    if (!existingItem) {
      throw createRequestError(404, "Stock item " + stockItemId + " was not found.");
    }

    const updates = normalizeStockItemInput(input, { partial: true });
    const hasOnHandUpdate = Object.prototype.hasOwnProperty.call(updates, "onHand");
    const nextOnHand = hasOnHandUpdate ? updates.onHand : existingItem.onHand;

    if (hasOnHandUpdate) {
      delete updates.onHand;
    }

    if (Object.keys(updates).length > 0) {
      await collections.stockItems.updateOne(
        {
          id: stockItemId
        },
        {
          $set: updates
        }
      );
    }

    const mergedItem = Object.assign({}, existingItem, updates, {
      onHand: nextOnHand
    });

    if (updates.name !== undefined || updates.unit !== undefined) {
      await refreshMenuRecipesForStock(collections, mergedItem);
    }

    if (hasOnHandUpdate) {
      const quantityChange = roundQuantity(nextOnHand - existingItem.onHand);

      if (quantityChange !== 0) {
        await applyStockAdjustments(
          collections,
          [
            {
              stockItemId: stockItemId,
              quantityChange: quantityChange
            }
          ],
          {
            type: "adjustment",
            reference: stockItemId,
            supplier: mergedItem.supplier,
            unitCost: mergedItem.lastUnitCost,
            note: "Manual stock level update."
          }
        );
      }
    }

    return sanitizeDocument(await collections.stockItems.findOne({ id: stockItemId }));
  });
}

async function createStockPurchase(input) {
  await ensureMongoState();

  return withCollections(async function createStockPurchaseInDatabase(collections) {
    const purchase = normalizePurchaseInput(input);
    const existingItem = await collections.stockItems.findOne({
      id: purchase.stockItemId
    });

    if (!existingItem) {
      throw createRequestError(404, "Stock item " + purchase.stockItemId + " was not found.");
    }

    const updates = {};

    if (purchase.supplier) {
      updates.supplier = purchase.supplier;
    }

    if (purchase.unitCost != null) {
      updates.lastUnitCost = purchase.unitCost;
    }

    if (Object.keys(updates).length > 0) {
      await collections.stockItems.updateOne(
        {
          id: existingItem.id
        },
        {
          $set: updates
        }
      );
    }

    const mergedItem = Object.assign({}, existingItem, updates);

    await applyStockAdjustments(
      collections,
      [
        {
          stockItemId: existingItem.id,
          quantityChange: purchase.quantity
        }
      ],
      {
        type: "purchase",
        reference: "PUR-" + getCurrentTimestamp().replace(/[^0-9]/g, ""),
        supplier: mergedItem.supplier,
        unitCost: mergedItem.lastUnitCost,
        note: purchase.note || "Stock purchase received."
      }
    );

    return sanitizeDocument(await collections.stockItems.findOne({ id: existingItem.id }));
  });
}

async function buildDashboard() {
  await ensureMongoState();

  return withCollections(async function buildDashboardFromDatabase(collections) {
    const [restaurant, tables, orders, menuItems, stockItems, stockHistory] = await Promise.all([
      collections.restaurantProfile.findOne({}),
      collections.tables.find({}).sort({ id: 1 }).toArray(),
      collections.orders.find({}).sort({ sequence: -1 }).toArray(),
      collections.menuItems.find({}).sort({ id: 1 }).toArray(),
      collections.stockItems.find({}).sort({ id: 1 }).toArray(),
      collections.stockHistory.find({}).sort({ occurredAt: -1, id: -1 }).toArray()
    ]);

    const cleanRestaurant = sanitizeDocument(restaurant);
    const cleanTables = sanitizeDocuments(tables);
    const cleanOrders = orders.map(hydrateStoredOrder).map(sanitizeDocument);
    const cleanMenuItems = sanitizeDocuments(menuItems);
    const cleanStockItems = sanitizeDocuments(stockItems);
    const cleanStockHistory = sanitizeDocuments(stockHistory);
    const inventoryAlerts = buildInventoryAlerts(cleanStockItems);
    const businessDate = cleanRestaurant.businessDate || getCurrentBusinessDate();
    const occupiedTables = cleanTables.filter(function isOccupied(table) {
      return table.status === "occupied";
    }).length;
    const activeOrders = cleanOrders.filter(isOrderOpen);
    const billableOrders = cleanOrders.filter(function isBillable(order) {
      return order.status !== "cancelled" && order.placedOn === businessDate;
    });
    const revenueToday = sumRevenueForDate(cleanOrders, businessDate);
    const averageTicket = billableOrders.length > 0 ? Math.round(revenueToday / billableOrders.length) : 0;

    return {
      restaurant: cleanRestaurant,
      metrics: {
        occupancyRate: cleanTables.length > 0 ? Math.round((occupiedTables / cleanTables.length) * 100) : 0,
        openOrders: activeOrders.length,
        activeStaff: cleanRestaurant.activeStaff,
        lowStockItems: inventoryAlerts.length,
        revenueToday: revenueToday,
        averageTicket: averageTicket,
        outstandingBalances: sumOutstandingBalances(cleanOrders)
      },
      tables: cleanTables,
      orders: cleanOrders,
      menuHighlights: cleanMenuItems,
      inventoryAlerts: inventoryAlerts,
      inventoryItems: cleanStockItems,
      stockHistory: cleanStockHistory
    };
  });
}

async function resetStore() {
  throw createRequestError(500, "resetStore is only available for the in-memory test store.");
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
