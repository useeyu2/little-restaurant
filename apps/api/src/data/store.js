const { getStoreDriver } = require("../config");

const driver = getStoreDriver();

const store =
  driver === "mongodb" ? require("./mongoStore") : require("./memoryStore");

module.exports = store;
