const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const settings = fs.readFileSync(path.join(root, "../src/lark/Settings.java"), "utf8");
const m = settings.match(/VERSION = "([^"]+)"/);
const version = m ? m[1] : "0.0.0";
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|webmanifest)$/.test(name)) {
      let text = fs.readFileSync(p, "utf8");
      if (text.includes("__LARK_V__")) {
        fs.writeFileSync(p, text.split("__LARK_V__").join(version));
      }
    }
  }
}
walk(path.join(root, "www"));
console.log("Stamped Lark", version, "into apk/www");
