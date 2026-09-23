const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([expo, { ignores: ["dist/**", "dist-android/**", "node_modules/**", "qa/**", "yamone-golf-cloudflare/.wrangler/**", "yamone-golf-cloudflare/.tmp/**"] }]);
