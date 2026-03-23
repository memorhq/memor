import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { AppData } from "./types";

const data = (window as any).__MEMOR__ as AppData;
const root = createRoot(document.getElementById("root")!);
root.render(<App data={data} />);
