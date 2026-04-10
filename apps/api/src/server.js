const { createServer } = require("./createServer");

const port = Number(process.env.PORT) || 3001;
const server = createServer();

server.on("error", function onError(error) {
  if (error && error.code === "EADDRINUSE") {
    console.error("Port " + port + " is already in use. Choose another port or stop the app using it.");
    process.exit(1);
  }

  console.error(error && error.message ? error.message : "Server failed to start.");
  process.exit(1);
});

server.listen(port, function onListen() {
  console.log("Restaurant management system running on http://localhost:" + port);
});
