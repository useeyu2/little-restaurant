const { v2: cloudinary } = require("cloudinary");
const { getCloudinaryConfig } = require("../config");
const { createRequestError } = require("../data/shared");

function getConfiguredClient() {
  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw createRequestError(
      503,
      "Cloudinary is not fully configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true
  });

  return {
    client: cloudinary,
    config: config
  };
}

async function uploadMenuImage(dataUrl, filename) {
  if (!String(dataUrl || "").startsWith("data:image/")) {
    throw createRequestError(400, "Menu uploads must be provided as an image data URL.");
  }

  const configured = getConfiguredClient();
  const result = await configured.client.uploader.upload(dataUrl, {
    folder: configured.config.folder,
    public_id: filename ? String(filename).replace(/\.[^.]+$/, "") : undefined,
    resource_type: "image"
  });

  return {
    publicId: result.public_id,
    imageUrl: result.secure_url
  };
}

module.exports = {
  uploadMenuImage
};
