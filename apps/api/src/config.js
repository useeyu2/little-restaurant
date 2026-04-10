const fs = require("fs");
const path = require("path");

let envLoaded = false;

function parseLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key: key,
    value: value
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach(function applyLine(line) {
    const entry = parseLine(line);

    if (!entry || process.env[entry.key]) {
      return;
    }

    process.env[entry.key] = entry.value;
  });
}

function loadLocalEnv() {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  const rootDir = path.resolve(__dirname, "../../..");

  loadEnvFile(path.join(rootDir, ".env.local"));
  loadEnvFile(path.join(rootDir, ".env"));
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map(function trimEntry(entry) {
      return entry.trim();
    })
    .filter(Boolean);
}

function parseCloudinaryUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const match = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);

  if (!match) {
    return null;
  }

  return {
    apiKey: match[1],
    apiSecret: match[2],
    cloudName: match[3]
  };
}

function getStoreDriver() {
  loadLocalEnv();

  if (process.env.STORE_DRIVER) {
    return String(process.env.STORE_DRIVER).toLowerCase();
  }

  return process.env.MONGODB_URI ? "mongodb" : "memory";
}

function getDatabaseConfig() {
  loadLocalEnv();

  return {
    uri: process.env.MONGODB_URI || "",
    dbName: process.env.MONGODB_DB_NAME || "restaurant_management_system"
  };
}

function getCloudinaryConfig() {
  loadLocalEnv();
  const urlConfig = parseCloudinaryUrl(process.env.CLOUDINARY_URL);

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || (urlConfig ? urlConfig.cloudName : ""),
    apiKey: process.env.CLOUDINARY_API_KEY || (urlConfig ? urlConfig.apiKey : ""),
    apiSecret: process.env.CLOUDINARY_API_SECRET || (urlConfig ? urlConfig.apiSecret : ""),
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "restaurant-management-system/menu"
  };
}

function getBrevoConfig() {
  loadLocalEnv();

  return {
    apiKey: process.env.BREVO_API_KEY || "",
    senderEmail: process.env.BREVO_SENDER_EMAIL || "",
    senderName: process.env.BREVO_SENDER_NAME || "Little",
    recipients: parseCsv(process.env.BREVO_ALERT_RECIPIENTS || process.env.ALERT_EMAIL_TO || "")
  };
}

module.exports = {
  getBrevoConfig,
  getCloudinaryConfig,
  getDatabaseConfig,
  getStoreDriver,
  loadLocalEnv
};
