import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Pricing from "./pages/Pricing";

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/pricing", element: <Pricing /> },
]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
