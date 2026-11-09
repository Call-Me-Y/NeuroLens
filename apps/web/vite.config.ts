import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("plotly.js")) return "plotly";
          if (id.includes("echarts") || id.includes("zrender"))
            return "echarts";
          if (id.includes("/d3-")) return "d3";
        },
      },
    },
  },
});
