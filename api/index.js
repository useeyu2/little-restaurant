const { handleRequest } = require("../apps/api/src/createServer");

module.exports = function vercelHandler(request, response) {
  return handleRequest(request, response);
};
