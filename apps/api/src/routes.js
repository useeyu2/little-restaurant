const {
  buildDashboard,
  createInventoryItem,
  createMenuItem,
  createOrder,
  createTable,
  createStockPurchase,
  deleteTable,
  deleteMenuItem,
  getOrderReceipt,
  getPaymentReceipt,
  getStockHistory,
  recordPayment,
  updateInventoryItem,
  updateMenuItem,
  updateOrderItems,
  updateOrderPriority,
  updateOrderStatus,
  updateTable,
  updateTableStatus
} = require("./data/store");
const { buildKitchenView, buildReports } = require("./data/shared");
const { createSession, deleteSession, findUserByCredentials, getAccessToken, getSessionFromRequest, requireUser } = require("./auth");
const { uploadMenuImage } = require("./services/cloudinaryService");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendMethodNotAllowed(response) {
  sendJson(response, 405, {
    error: "Method not allowed"
  });
}

async function parseJsonBody(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    const parseError = new Error("Request body must be valid JSON.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function buildDashboardPayloadForUser(user, dashboard) {
  if (user.role === "cashier") {
    return {
      restaurant: dashboard.restaurant,
      metrics: dashboard.metrics,
      tables: dashboard.tables,
      orders: dashboard.orders,
      menuHighlights: dashboard.menuHighlights,
      inventoryAlerts: [],
      inventoryItems: [],
      stockHistory: []
    };
  }

  return dashboard;
}

async function handleApiRequest(request, response, url) {
  const pathname = url.pathname;

  try {
    if (pathname === "/api/health") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      sendJson(response, 200, {
        status: "ok",
        service: "restaurant-management-system-api"
      });
      return;
    }

    if (pathname === "/api/auth/login") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      const body = await parseJsonBody(request);
      const user = findUserByCredentials(body.username, body.password);

      if (!user) {
        sendJson(response, 401, {
          error: "Invalid username or password."
        });
        return;
      }

      const session = createSession(user);

      sendJson(response, 200, {
        token: session.token,
        user: session.user
      });
      return;
    }

    if (pathname === "/api/auth/session") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      const session = getSessionFromRequest(request);

      if (!session) {
        sendJson(response, 401, {
          error: "Login required."
        });
        return;
      }

      sendJson(response, 200, {
        user: session.user
      });
      return;
    }

    if (pathname === "/api/auth/logout") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request);
      deleteSession(getAccessToken(request));

      sendJson(response, 200, {
        ok: true
      });
      return;
    }

    if (pathname === "/api/dashboard") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      const user = requireUser(request, ["admin", "cashier"]);
      const dashboard = await buildDashboard();

      sendJson(response, 200, buildDashboardPayloadForUser(user, dashboard));
      return;
    }

    if (pathname === "/api/kitchen/dashboard") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "kitchen"]);
      const dashboard = await buildDashboard();

      sendJson(response, 200, buildKitchenView(dashboard.restaurant, dashboard.orders));
      return;
    }

    if (pathname === "/api/reports/summary") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const dashboard = await buildDashboard();

      sendJson(response, 200, {
        reports: buildReports(dashboard.restaurant, dashboard.orders, dashboard.stockHistory)
      });
      return;
    }

    if (pathname === "/api/tables") {
      if (request.method === "GET") {
        requireUser(request, ["admin", "cashier"]);
        const dashboard = await buildDashboard();

        sendJson(response, 200, {
          restaurant: dashboard.restaurant,
          tables: dashboard.tables
        });
        return;
      }

      if (request.method === "POST") {
        requireUser(request, ["admin"]);
        const body = await parseJsonBody(request);
        const table = await createTable(body);

        sendJson(response, 201, {
          table: table
        });
        return;
      }

      sendMethodNotAllowed(response);
      return;
    }

    if (pathname === "/api/orders") {
      if (request.method === "GET") {
        requireUser(request, ["admin", "cashier"]);
        const dashboard = await buildDashboard();

        sendJson(response, 200, {
          restaurant: dashboard.restaurant,
          orders: dashboard.orders
        });
        return;
      }

      if (request.method === "POST") {
        requireUser(request, ["admin", "cashier"]);
        const body = await parseJsonBody(request);
        const order = await createOrder(body);

        sendJson(response, 201, {
          order: order
        });
        return;
      }

      sendMethodNotAllowed(response);
      return;
    }

    if (pathname === "/api/menu") {
      if (request.method === "GET") {
        requireUser(request, ["admin", "cashier"]);
        const dashboard = await buildDashboard();

        sendJson(response, 200, {
          restaurant: dashboard.restaurant,
          items: dashboard.menuHighlights,
          inventoryAlerts: dashboard.inventoryAlerts,
          inventoryItems: dashboard.inventoryItems
        });
        return;
      }

      if (request.method === "POST") {
        requireUser(request, ["admin"]);
        const body = await parseJsonBody(request);
        const item = await createMenuItem(body);

        sendJson(response, 201, {
          item: item
        });
        return;
      }

      sendMethodNotAllowed(response);
      return;
    }

    if (pathname === "/api/uploads/menu-image") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const body = await parseJsonBody(request);
      const upload = await uploadMenuImage(body.dataUrl, body.filename);

      sendJson(response, 201, upload);
      return;
    }

    if (pathname === "/api/inventory") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const dashboard = await buildDashboard();

      sendJson(response, 200, {
        restaurant: dashboard.restaurant,
        items: dashboard.inventoryItems,
        alerts: dashboard.inventoryAlerts,
        history: dashboard.stockHistory
      });
      return;
    }

    if (pathname === "/api/inventory/items") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const body = await parseJsonBody(request);
      const item = await createInventoryItem(body);

      sendJson(response, 201, {
        item: item
      });
      return;
    }

    if (pathname === "/api/inventory/history") {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      sendJson(response, 200, {
        history: await getStockHistory()
      });
      return;
    }

    if (pathname === "/api/inventory/purchases") {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const body = await parseJsonBody(request);
      const item = await createStockPurchase(body);

      sendJson(response, 201, {
        item: item
      });
      return;
    }

    const orderItemsMatch = pathname.match(/^\/api\/orders\/([^/]+)\/items$/);

    if (orderItemsMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const body = await parseJsonBody(request);
      const order = await updateOrderItems(decodeURIComponent(orderItemsMatch[1]), body);

      sendJson(response, 200, {
        order: order
      });
      return;
    }

    const orderReceiptMatch = pathname.match(/^\/api\/orders\/([^/]+)\/receipt$/);

    if (orderReceiptMatch) {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const orderId = decodeURIComponent(orderReceiptMatch[1]);
      const receipt = await getOrderReceipt(orderId, url.searchParams.get("split"));

      sendJson(response, 200, {
        receipt: receipt
      });
      return;
    }

    const paymentReceiptMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-receipt$/);

    if (paymentReceiptMatch) {
      if (request.method !== "GET") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const orderId = decodeURIComponent(paymentReceiptMatch[1]);

      sendJson(response, 200, {
        receipt: await getPaymentReceipt(orderId)
      });
      return;
    }

    const orderPaymentsMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);

    if (orderPaymentsMatch) {
      if (request.method !== "POST") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const body = await parseJsonBody(request);
      const order = await recordPayment(decodeURIComponent(orderPaymentsMatch[1]), body);

      sendJson(response, 201, {
        order: order
      });
      return;
    }

    const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);

    if (orderStatusMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const body = await parseJsonBody(request);
      const order = await updateOrderStatus(decodeURIComponent(orderStatusMatch[1]), body.status);

      sendJson(response, 200, {
        order: order
      });
      return;
    }

    const kitchenOrderStatusMatch = pathname.match(/^\/api\/kitchen\/orders\/([^/]+)\/status$/);

    if (kitchenOrderStatusMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "kitchen"]);
      const body = await parseJsonBody(request);

      if (!["preparing", "ready"].includes(body.status)) {
        sendJson(response, 400, {
          error: "Kitchen can only move tickets to preparing or ready."
        });
        return;
      }

      const order = await updateOrderStatus(decodeURIComponent(kitchenOrderStatusMatch[1]), body.status);

      sendJson(response, 200, {
        order: order
      });
      return;
    }

    const kitchenOrderPriorityMatch = pathname.match(/^\/api\/kitchen\/orders\/([^/]+)\/priority$/);

    if (kitchenOrderPriorityMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "kitchen"]);
      const body = await parseJsonBody(request);
      const order = await updateOrderPriority(decodeURIComponent(kitchenOrderPriorityMatch[1]), body.priority);

      sendJson(response, 200, {
        order: order
      });
      return;
    }

    const tableStatusMatch = pathname.match(/^\/api\/tables\/([^/]+)\/status$/);

    if (tableStatusMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin", "cashier"]);
      const body = await parseJsonBody(request);
      const table = await updateTableStatus(decodeURIComponent(tableStatusMatch[1]), body.status);

      sendJson(response, 200, {
        table: table
      });
      return;
    }

    const tableMatch = pathname.match(/^\/api\/tables\/([^/]+)$/);

    if (tableMatch) {
      if (request.method === "PATCH") {
        requireUser(request, ["admin", "cashier"]);
        const body = await parseJsonBody(request);
        const table = await updateTable(decodeURIComponent(tableMatch[1]), body);

        sendJson(response, 200, {
          table: table
        });
        return;
      }

      if (request.method === "DELETE") {
        requireUser(request, ["admin"]);
        const table = await deleteTable(decodeURIComponent(tableMatch[1]));

        sendJson(response, 200, {
          table: table
        });
        return;
      }

      sendMethodNotAllowed(response);
      return;
    }

    const menuItemMatch = pathname.match(/^\/api\/menu\/([^/]+)$/);

    if (menuItemMatch) {
      if (request.method === "PATCH") {
        requireUser(request, ["admin"]);
        const body = await parseJsonBody(request);
        const item = await updateMenuItem(decodeURIComponent(menuItemMatch[1]), body);

        sendJson(response, 200, {
          item: item
        });
        return;
      }

      if (request.method === "DELETE") {
        requireUser(request, ["admin"]);
        const item = await deleteMenuItem(decodeURIComponent(menuItemMatch[1]));

        sendJson(response, 200, {
          item: item
        });
        return;
      }

      sendMethodNotAllowed(response);
      return;
    }

    const inventoryItemMatch = pathname.match(/^\/api\/inventory\/items\/([^/]+)$/);

    if (inventoryItemMatch) {
      if (request.method !== "PATCH") {
        sendMethodNotAllowed(response);
        return;
      }

      requireUser(request, ["admin"]);
      const body = await parseJsonBody(request);
      const item = await updateInventoryItem(decodeURIComponent(inventoryItemMatch[1]), body);

      sendJson(response, 200, {
        item: item
      });
      return;
    }

    sendJson(response, 404, {
      error: "Not found"
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Internal server error"
    });
  }
}

module.exports = {
  handleApiRequest
};
