const esbuild = require("esbuild");
const path = require("path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "src", "app", "frontend", "index.tsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020"],
    outfile: path.join(__dirname, "..", "dist", "app-bundle.js"),
    loader: { ".css": "text" },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    jsx: "automatic",
    jsxImportSource: "react",
  })
  .then(() => {
    console.log("  Frontend bundled.");
  })
  .catch((err) => {
    console.error("Frontend build failed:", err);
    process.exit(1);
  });
