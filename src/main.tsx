import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// 注：不 import @milkdown/theme-nord/style.css —— 它是 Tailwind v4 打包的，
// 和本项目 Tailwind 3.4 的 @layer base 语法冲突。prose 样式全在 index.css 里自写。
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
