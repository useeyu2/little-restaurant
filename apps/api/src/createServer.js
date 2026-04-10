const fs = require("fs");
const http = require("http");
const path = require("path");
const { handleApiRequest } = require("./routes");

const webRoot = path.resolve(__dirname, "../../web");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolveStaticPath(pathname) {
  const requestPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(requestPath);
  const absolutePath = path.resolve(webRoot, normalizedPath);

  if (!absolutePath.startsWith(webRoot)) {
    return null;
  }

  return absolutePath;
}

function serveStatic(response, pathname) {
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    response.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, function onRead(error, buffer) {
    if (error) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(buffer);
  });
}

function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    Promise.resolve(handleApiRequest(request, response, url)).catch(function onApiError(error) {
      console.error(error && error.stack ? error.stack : error);

      if (response.headersSent) {
        response.end();
        return;
      }

      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(
        JSON.stringify(
          {
            error: "Internal server error"
          },
          null,
          2
        )
      );
    });
    return;
  }

  serveStatic(response, pathname);
}

function createServer() {
  return http.createServer(handleRequest);
}

module.exports = {
  createServer,
  handleRequest
};
