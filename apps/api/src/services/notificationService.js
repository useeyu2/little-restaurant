const { getBrevoConfig } = require("../config");

const deliveredKeys = new Set();

function isConfigured(config) {
  return Boolean(config.apiKey && config.senderEmail && config.recipients.length > 0);
}

async function sendEmail(subject, textContent) {
  const config = getBrevoConfig();

  if (!isConfigured(config)) {
    return {
      delivered: false,
      reason: "not-configured"
    };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": config.apiKey,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      sender: {
        email: config.senderEmail,
        name: config.senderName
      },
      to: config.recipients.map(function toRecipient(email) {
        return {
          email: email
        };
      }),
      subject: subject,
      textContent: textContent
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(function ignoreBodyError() {
      return "";
    });
    console.error("Brevo notification failed:", response.status, body);
    return {
      delivered: false,
      reason: "request-failed"
    };
  }

  return {
    delivered: true
  };
}

function claimDelivery(key) {
  if (deliveredKeys.has(key)) {
    return false;
  }

  deliveredKeys.add(key);
  return true;
}

async function notifyOrderReady(restaurant, order) {
  const key = "order-ready:" + order.id;

  if (!claimDelivery(key)) {
    return;
  }

  const destination = order.tableId || order.channel;

  await sendEmail(
    "Order ready: " + order.id,
    restaurant.name +
      " " +
      restaurant.branch +
      "\nOrder " +
      order.id +
      " is ready.\nDestination: " +
      destination +
      "\nItems: " +
      order.summary
  );
}

async function notifyLowStock(restaurant, alerts) {
  const freshAlerts = (alerts || []).filter(function keepFreshAlert(alert) {
    return claimDelivery("low-stock:" + restaurant.businessDate + ":" + alert.stockItemId);
  });

  if (freshAlerts.length === 0) {
    return;
  }

  await sendEmail(
    "Low stock alert",
    restaurant.name +
      " " +
      restaurant.branch +
      "\nLow stock items:\n" +
      freshAlerts
        .map(function formatAlert(alert) {
          return "- " + alert.item + ": " + alert.remainingUnits + " " + (alert.unit || "units") + " remaining";
        })
        .join("\n")
  );
}

async function notifyPaymentPending(restaurant, order) {
  const key = "payment-pending:" + order.id;

  if (!claimDelivery(key)) {
    return;
  }

  await sendEmail(
    "Payment pending: " + order.id,
    restaurant.name +
      " " +
      restaurant.branch +
      "\nOrder " +
      order.id +
      " still has an unpaid balance.\nBalance due: NGN " +
      Number(order.balanceDue || 0).toFixed(0) +
      "\nStatus: " +
      order.status
  );
}

module.exports = {
  notifyLowStock,
  notifyOrderReady,
  notifyPaymentPending
};
