const { randomUUID } = require("crypto");
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

function createSession(user) {
  const token = randomUUID();
  const session = {
    token: token,
    user: sanitizeUser(user),
    createdAt: getCurrentTimestamp()
  };

  sessions.set(token, session);
  return session;
}

function deleteSession(token) {
  if (!token) {
    return;
  }

  sessions.delete(token);
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

  return sessions.get(token) || null;
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
