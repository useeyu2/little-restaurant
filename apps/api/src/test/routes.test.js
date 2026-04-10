const assert = require("node:assert/strict");
const http = require("node:http");

process.env.STORE_DRIVER = "memory";

const { createServer } = require("../createServer");
const { resetStore } = require("../data/store");

function listen(server) {
  return new Promise(function onListen(resolve) {
    server.listen(0, "127.0.0.1", function onReady() {
      resolve();
    });
  });
}

function close(server) {
  return new Promise(function onClose(resolve, reject) {
    server.close(function onClosed(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function request(server, method, path, payload, token) {
  const address = server.address();
  const body = payload ? JSON.stringify(payload) : null;
  const headers = {};

  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  return new Promise(function onRequest(resolve, reject) {
    const requestHandle = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: path,
        method: method,
        headers: Object.keys(headers).length > 0 ? headers : undefined
      },
      function onResponse(response) {
        let raw = "";

        response.setEncoding("utf8");
        response.on("data", function onData(chunk) {
          raw += chunk;
        });
        response.on("end", function onEnd() {
          resolve({
            statusCode: response.statusCode,
            body: raw ? JSON.parse(raw) : {}
          });
        });
      }
    );

    requestHandle.on("error", reject);

    if (body) {
      requestHandle.write(body);
    }

    requestHandle.end();
  });
}

async function login(server, username, password) {
  const response = await request(server, "POST", "/api/auth/login", {
    username: username,
    password: password
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.token);

  return response.body;
}

function findInventoryItem(items, stockItemId) {
  return items.find(function matchesItem(item) {
    return item.id === stockItemId;
  });
}

async function runTest(name, testCase) {
  try {
    await testCase();
    console.log("PASS " + name);
  } catch (error) {
    console.error("FAIL " + name);
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

async function testAuthenticationAndRoleAccess() {
  resetStore();

  const server = createServer();
  await listen(server);

  try {
    const unauthenticatedDashboard = await request(server, "GET", "/api/dashboard");
    assert.equal(unauthenticatedDashboard.statusCode, 401);

    const invalidLogin = await request(server, "POST", "/api/auth/login", {
      username: "admin",
      password: "wrong"
    });
    assert.equal(invalidLogin.statusCode, 401);

    const cashierSession = await login(server, "cashier", "cashier123");
    const cashierDashboard = await request(server, "GET", "/api/dashboard", null, cashierSession.token);
    assert.equal(cashierDashboard.statusCode, 200);
    assert.equal(cashierDashboard.body.inventoryItems.length, 0);

    const cashierInventoryWrite = await request(
      server,
      "POST",
      "/api/inventory/items",
      {
        name: "Unauthorized item",
        unit: "kg",
        onHand: 1,
        reorderLevel: 1,
        supplier: "Nowhere",
        lastUnitCost: 10
      },
      cashierSession.token
    );
    assert.equal(cashierInventoryWrite.statusCode, 403);

    const kitchenSession = await login(server, "kitchen", "kitchen123");
    const kitchenDashboard = await request(server, "GET", "/api/kitchen/dashboard", null, kitchenSession.token);
    assert.equal(kitchenDashboard.statusCode, 200);
    assert.ok(Array.isArray(kitchenDashboard.body.orders));

    const kitchenFrontOfHouseDashboard = await request(server, "GET", "/api/dashboard", null, kitchenSession.token);
    assert.equal(kitchenFrontOfHouseDashboard.statusCode, 403);

    const logoutResponse = await request(server, "POST", "/api/auth/logout", null, cashierSession.token);
    assert.equal(logoutResponse.statusCode, 200);

    const sessionAfterLogout = await request(server, "GET", "/api/auth/session", null, cashierSession.token);
    assert.equal(sessionAfterLogout.statusCode, 401);
  } finally {
    resetStore();
    await close(server);
  }
}

async function testOrderPaymentsInventoryAndKitchenFlow() {
  resetStore();

  const server = createServer();
  await listen(server);

  try {
    const adminSession = await login(server, "admin", "admin123");
    const cashierSession = await login(server, "cashier", "cashier123");
    const kitchenSession = await login(server, "kitchen", "kitchen123");

    const inventoryBefore = await request(server, "GET", "/api/inventory", null, adminSession.token);
    assert.equal(inventoryBefore.statusCode, 200);

    const riceBefore = findInventoryItem(inventoryBefore.body.items, "STK-101").onHand;
    const oilBefore = findInventoryItem(inventoryBefore.body.items, "STK-106").onHand;
    const mixBefore = findInventoryItem(inventoryBefore.body.items, "STK-104").onHand;
    const waterBefore = findInventoryItem(inventoryBefore.body.items, "STK-107").onHand;

    const createResponse = await request(
      server,
      "POST",
      "/api/orders",
      {
        channel: "dine-in",
        priority: "normal",
        tableId: "T5",
        items: [
          {
            menuItemId: "MENU-101",
            quantity: 2
          },
          {
            menuItemId: "MENU-104",
            quantity: 1
          }
        ]
      },
      cashierSession.token
    );

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.body.order.total, 26800);
    assert.equal(createResponse.body.order.paymentStatus, "unpaid");
    assert.equal(createResponse.body.order.priority, "normal");

    const orderId = createResponse.body.order.id;

    const priorityResponse = await request(
      server,
      "PATCH",
      "/api/kitchen/orders/" + orderId + "/priority",
      {
        priority: "rush"
      },
      kitchenSession.token
    );
    assert.equal(priorityResponse.statusCode, 200);
    assert.equal(priorityResponse.body.order.priority, "rush");

    const inventoryAfterCreate = await request(server, "GET", "/api/inventory", null, adminSession.token);
    assert.equal(findInventoryItem(inventoryAfterCreate.body.items, "STK-101").onHand, riceBefore);

    let statusResponse = await request(
      server,
      "PATCH",
      "/api/kitchen/orders/" + orderId + "/status",
      {
        status: "preparing"
      },
      kitchenSession.token
    );
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.order.status, "preparing");

    const inventoryAfterPrep = await request(server, "GET", "/api/inventory", null, adminSession.token);
    assert.equal(findInventoryItem(inventoryAfterPrep.body.items, "STK-101").onHand, riceBefore - 2);
    assert.equal(findInventoryItem(inventoryAfterPrep.body.items, "STK-106").onHand, oilBefore - 2);
    assert.equal(findInventoryItem(inventoryAfterPrep.body.items, "STK-104").onHand, mixBefore - 1);
    assert.equal(findInventoryItem(inventoryAfterPrep.body.items, "STK-107").onHand, waterBefore - 2);

    const updateItemsResponse = await request(
      server,
      "PATCH",
      "/api/orders/" + orderId + "/items",
      {
        items: [
          {
            menuItemId: "MENU-101",
            quantity: 1
          },
          {
            menuItemId: "MENU-104",
            quantity: 1
          }
        ]
      },
      cashierSession.token
    );
    assert.equal(updateItemsResponse.statusCode, 200);
    assert.equal(updateItemsResponse.body.order.total, 18300);

    const inventoryAfterEdit = await request(server, "GET", "/api/inventory", null, adminSession.token);
    assert.equal(findInventoryItem(inventoryAfterEdit.body.items, "STK-101").onHand, riceBefore - 1);
    assert.equal(findInventoryItem(inventoryAfterEdit.body.items, "STK-106").onHand, oilBefore - 1);

    let paymentResponse = await request(
      server,
      "POST",
      "/api/orders/" + orderId + "/payments",
      {
        method: "cash",
        amount: 10000,
        note: "Initial payment"
      },
      cashierSession.token
    );
    assert.equal(paymentResponse.statusCode, 201);
    assert.equal(paymentResponse.body.order.paymentStatus, "partial");
    assert.equal(paymentResponse.body.order.balanceDue, 8300);

    paymentResponse = await request(
      server,
      "POST",
      "/api/orders/" + orderId + "/payments",
      {
        method: "pos",
        amount: 8300
      },
      cashierSession.token
    );
    assert.equal(paymentResponse.statusCode, 201);
    assert.equal(paymentResponse.body.order.paymentStatus, "paid");
    assert.equal(paymentResponse.body.order.balanceDue, 0);

    const paymentReceiptResponse = await request(
      server,
      "GET",
      "/api/orders/" + orderId + "/payment-receipt",
      null,
      cashierSession.token
    );
    assert.equal(paymentReceiptResponse.statusCode, 200);
    assert.equal(paymentReceiptResponse.body.receipt.paymentCount, 2);
    assert.equal(paymentReceiptResponse.body.receipt.balanceDue, 0);

    const receiptResponse = await request(server, "GET", "/api/orders/" + orderId + "/receipt?split=2", null, cashierSession.token);
    assert.equal(receiptResponse.statusCode, 200);
    assert.equal(receiptResponse.body.receipt.total, 18300);
    assert.equal(receiptResponse.body.receipt.paidTotal, 18300);
    assert.equal(receiptResponse.body.receipt.balanceDue, 0);

    statusResponse = await request(
      server,
      "PATCH",
      "/api/kitchen/orders/" + orderId + "/status",
      {
        status: "ready"
      },
      kitchenSession.token
    );
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.order.status, "ready");

    const kitchenDashboard = await request(server, "GET", "/api/kitchen/dashboard", null, kitchenSession.token);
    const kitchenOrder = kitchenDashboard.body.orders.find(function findOrder(order) {
      return order.id === orderId;
    });
    assert.ok(kitchenOrder);
    assert.equal(kitchenOrder.priority, "rush");
    assert.equal(kitchenOrder.status, "ready");

    statusResponse = await request(
      server,
      "PATCH",
      "/api/orders/" + orderId + "/status",
      {
        status: "served"
      },
      cashierSession.token
    );
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.order.status, "served");

    statusResponse = await request(
      server,
      "PATCH",
      "/api/orders/" + orderId + "/status",
      {
        status: "completed"
      },
      cashierSession.token
    );
    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.order.status, "completed");

    const dashboardResponse = await request(server, "GET", "/api/dashboard", null, adminSession.token);
    const table = dashboardResponse.body.tables.find(function findTable(entry) {
      return entry.id === "T5";
    });
    assert.equal(table.status, "cleaning");
    assert.equal(table.currentOrderId, null);
  } finally {
    resetStore();
    await close(server);
  }
}

async function testMenuInventoryAndReports() {
  resetStore();

  const server = createServer();
  await listen(server);

  try {
    const adminSession = await login(server, "admin", "admin123");

    const createMenuResponse = await request(
      server,
      "POST",
      "/api/menu",
      {
        name: "Zobo Cooler",
        category: "drinks",
        station: "bar",
        price: 4500,
        margin: "high",
        availability: "available",
        imageUrl: "",
        recipe: [
          {
            stockItemId: "STK-107",
            quantity: 1
          }
        ]
      },
      adminSession.token
    );
    assert.equal(createMenuResponse.statusCode, 201);
    assert.equal(createMenuResponse.body.item.recipe.length, 1);

    const itemId = createMenuResponse.body.item.id;
    const updateMenuResponse = await request(
      server,
      "PATCH",
      "/api/menu/" + itemId,
      {
        price: 4800,
        availability: "unavailable",
        recipe: [
          {
            stockItemId: "STK-104",
            quantity: 1
          },
          {
            stockItemId: "STK-107",
            quantity: 1
          }
        ]
      },
      adminSession.token
    );
    assert.equal(updateMenuResponse.statusCode, 200);
    assert.equal(updateMenuResponse.body.item.availability, "unavailable");
    assert.equal(updateMenuResponse.body.item.recipe.length, 2);

    const createInventoryResponse = await request(
      server,
      "POST",
      "/api/inventory/items",
      {
        name: "Curry Powder",
        unit: "jar",
        onHand: 5,
        reorderLevel: 3,
        supplier: "Spice Route",
        lastUnitCost: 700
      },
      adminSession.token
    );
    assert.equal(createInventoryResponse.statusCode, 201);

    const stockItemId = createInventoryResponse.body.item.id;
    const updateInventoryResponse = await request(
      server,
      "PATCH",
      "/api/inventory/items/" + stockItemId,
      {
        onHand: 2,
        reorderLevel: 4
      },
      adminSession.token
    );
    assert.equal(updateInventoryResponse.statusCode, 200);
    assert.equal(updateInventoryResponse.body.item.onHand, 2);

    const inventoryResponse = await request(server, "GET", "/api/inventory", null, adminSession.token);
    const alert = inventoryResponse.body.alerts.find(function findAlert(entry) {
      return entry.stockItemId === stockItemId;
    });
    assert.ok(alert);
    assert.equal(alert.remainingUnits, 2);

    const purchaseResponse = await request(
      server,
      "POST",
      "/api/inventory/purchases",
      {
        stockItemId: stockItemId,
        quantity: 6,
        unitCost: 750,
        supplier: "Spice Route",
        note: "Restock before dinner"
      },
      adminSession.token
    );
    assert.equal(purchaseResponse.statusCode, 201);
    assert.equal(purchaseResponse.body.item.onHand, 8);

    const historyResponse = await request(server, "GET", "/api/inventory/history", null, adminSession.token);
    const purchaseEntry = historyResponse.body.history.find(function findEntry(entry) {
      return entry.stockItemId === stockItemId && entry.type === "purchase";
    });
    assert.ok(purchaseEntry);
    assert.equal(purchaseEntry.quantityChange, 6);

    const reportsResponse = await request(server, "GET", "/api/reports/summary", null, adminSession.token);
    assert.equal(reportsResponse.statusCode, 200);
    assert.equal(typeof reportsResponse.body.reports.daily.salesTotal, "number");
    assert.equal(typeof reportsResponse.body.reports.weekly.grossProfit, "number");
    assert.ok(Array.isArray(reportsResponse.body.reports.monthly.mostSoldItems));
    assert.ok(reportsResponse.body.reports.weekly.orderCount >= reportsResponse.body.reports.daily.orderCount);

    const deleteMenuResponse = await request(server, "DELETE", "/api/menu/" + itemId, null, adminSession.token);
    assert.equal(deleteMenuResponse.statusCode, 200);
    assert.equal(deleteMenuResponse.body.item.id, itemId);
  } finally {
    resetStore();
    await close(server);
  }
}

async function testTableCrudAndAssignment() {
  resetStore();

  const server = createServer();
  await listen(server);

  try {
    const adminSession = await login(server, "admin", "admin123");
    const cashierSession = await login(server, "cashier", "cashier123");

    const createResponse = await request(
      server,
      "POST",
      "/api/tables",
      {
        seats: 2,
        status: "available",
        server: "Ngozi",
        customerName: "",
        partySize: 0,
        notes: "Patio"
      },
      adminSession.token
    );
    assert.equal(createResponse.statusCode, 201);

    const tableId = createResponse.body.table.id;

    const cashierUpdateResponse = await request(
      server,
      "PATCH",
      "/api/tables/" + tableId,
      {
        customerName: "Amina",
        partySize: 2,
        notes: "Anniversary",
        status: "reserved"
      },
      cashierSession.token
    );
    assert.equal(cashierUpdateResponse.statusCode, 200);
    assert.equal(cashierUpdateResponse.body.table.customerName, "Amina");
    assert.equal(cashierUpdateResponse.body.table.partySize, 2);
    assert.equal(cashierUpdateResponse.body.table.status, "reserved");

    const tablesResponse = await request(server, "GET", "/api/tables", null, cashierSession.token);
    const createdTable = tablesResponse.body.tables.find(function findTable(table) {
      return table.id === tableId;
    });
    assert.ok(createdTable);
    assert.equal(createdTable.notes, "Anniversary");

    const deleteResponse = await request(server, "DELETE", "/api/tables/" + tableId, null, adminSession.token);
    assert.equal(deleteResponse.statusCode, 200);
    assert.equal(deleteResponse.body.table.id, tableId);
  } finally {
    resetStore();
    await close(server);
  }
}

async function testDineInRequiresTable() {
  resetStore();

  const server = createServer();
  await listen(server);

  try {
    const cashierSession = await login(server, "cashier", "cashier123");
    const response = await request(
      server,
      "POST",
      "/api/orders",
      {
        channel: "dine-in",
        items: [
          {
            menuItemId: "MENU-103",
            quantity: 1
          }
        ]
      },
      cashierSession.token
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, "Select a table for dine-in orders.");
  } finally {
    resetStore();
    await close(server);
  }
}

async function main() {
  await runTest("authentication and role access are enforced", testAuthenticationAndRoleAccess);
  await runTest("orders, payments, inventory, and kitchen workflow stay in sync", testOrderPaymentsInventoryAndKitchenFlow);
  await runTest("menu, inventory, and reports endpoints work for admin", testMenuInventoryAndReports);
  await runTest("tables can be created, assigned, and removed", testTableCrudAndAssignment);
  await runTest("dine-in orders require a free table", testDineInRequiresTable);
}

main().catch(function onError(error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
