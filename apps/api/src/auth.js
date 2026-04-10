const { createHmac, randomUUID, timingSafeEqual } = require("crypto");
const { loadLocalEnv } = require("./config");
const { createRequestError, getCurrentTimestamp } = require("./data/shared");

const demoUsers = [
  {
    id: "USR-001",
    username: "admin",
    password: "admin123",
    name: "Ada Admin",
    role: "admin"
  },
  {
    id: "USR-002",
    username: "cashier",
    password: "cashier123",
    name: "Casey Cashier",
    role: "cashier"
  },
  {
    id: "USR-003",
    username: "kitchen",
    password: "kitchen123",
    name: "Kemi Kitchen",
    role: "kitchen"
  }
];

const sessions = new Map();
const revokedTokens = new Set();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}

function findUserByCredentials(username, password) {
  return (
    demoUsers.find(function matchesUser(user) {
      return user.username === String(username || "").trim().toLowerCase() && user.password === String(password || "");
    }) || null
  );
}

function getSessionSecret() {
  loadLocalEnv();

  return process.env.AUTH_SESSION_SECRET || "restaurant-management-session-secret";
}

function encodeBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + "=".repeat(4 - remainder);

  return Buffer.from(padded, "base64").toString("utf8");
}

function signEncodedPayload(encodedPayload) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("hex");
}

function compareSignatures(a, b) {
  const first = Buffer.from(String(a || ""), "utf8");
  const second = Buffer.from(String(b || ""), "utf8");

  return first.length === second.length && timingSafeEqual(first, second);
}

function isExpired(expiresAt) {
  const expiresAtValue = Date.parse(String(expiresAt || ""));

  return Number.isNaN(expiresAtValue) || expiresAtValue <= Date.now();
}

function createSignedToken(user) {
  const payload = {
    jti: randomUUID(),
    user: sanitizeUser(user),
    createdAt: getCurrentTimestamp(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));

  return encodedPayload + "." + signEncodedPayload(encodedPayload);
}

function verifySignedToken(token) {
  if (!token || revokedTokens.has(token)) {
    return null;
  }

  const segments = String(token).split(".");

  if (segments.length !== 2) {
    return null;
  }

  const encodedPayload = segments[0];
  const signature = segments[1];
  const expectedSignature = signEncodedPayload(encodedPayload);

  if (!compareSignatures(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));

    if (!payload || !payload.user || isExpired(payload.expiresAt)) {
      return null;
    }

    return {
      token: token,
      user: payload.user,
      createdAt: payload.createdAt || getCurrentTimestamp(),
      expiresAt: payload.expiresAt
    };
  } catch (error) {
    return null;
  }
}

function createSession(user) {
  const token = createSignedToken(user);
  const session = verifySignedToken(token);

  if (!session) {
    throw createRequestError(500, "Could not create the staff session.");
  }

  sessions.set(token, session);
  return session;
}

function deleteSession(token) {
  if (!token) {
    return;
  }

  sessions.delete(token);
  revokedTokens.add(token);
}

function getAccessToken(request) {
  const authorization = request.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function getSessionFromRequest(request) {
  const token = getAccessToken(request);

  if (!token) {
    return null;
  }

  const cachedSession = sessions.get(token);

  if (cachedSession) {
    if (isExpired(cachedSession.expiresAt)) {
      sessions.delete(token);
      revokedTokens.delete(token);
    } else {
      return cachedSession;
    }
  }

  const session = verifySignedToken(token);

  if (session) {
    sessions.set(token, session);
  }

  return session;
}

function requireUser(request, allowedRoles) {
  const session = getSessionFromRequest(request);

  if (!session) {
    throw createRequestError(401, "Login required.");
  }

  if (!allowedRoles || allowedRoles.length === 0) {
    return session.user;
  }

  if (session.user.role === "admin" || allowedRoles.includes(session.user.role)) {
    return session.user;
  }

  throw createRequestError(403, "You do not have access to that action.");
}

module.exports = {
  createSession,
  deleteSession,
  demoUsers: demoUsers.map(sanitizeUser),
  findUserByCredentials,
  getAccessToken,
  getSessionFromRequest,
  requireUser,
  sanitizeUser
};
