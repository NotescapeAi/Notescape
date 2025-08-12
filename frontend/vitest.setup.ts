import "@testing-library/jest-dom/vitest"; // wires expect.extend for Vitest
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
