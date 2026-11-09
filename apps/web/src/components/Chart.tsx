import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  LineChart,
  BarChart,
  RadarChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  PieChart,
  GaugeChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  VisualMapComponent,
  DataZoomComponent,
  BrushComponent,
  ToolboxComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([
  LineChart,
  BarChart,
  RadarChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  VisualMapComponent,
  DataZoomComponent,
  BrushComponent,
  ToolboxComponent,
  CanvasRenderer,
]);
export function Chart({
  option,
  height = 280,
  onClick,
  onBrush,
}: {
  option: echarts.EChartsCoreOption;
  height?: number;
  onClick?: (p: any) => void;
  onBrush?: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current);
    instance.current = c;
    const observer = new ResizeObserver(() => c.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      c.dispose();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    const c = instance.current;
    if (!c) return;
    c.setOption(
      {
        animationDuration: 400,
        textStyle: {
          fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
          color: "#64748b",
          fontSize: 11,
        },
        color: ["#6d91b7", "#d58c72", "#81b3a4", "#9b95be"],
        ...option,
      },
      true,
    );
    c.off("click");
    c.off("brushSelected");
    if (onClick) c.on("click", onClick);
    if (onBrush)
      c.on("brushSelected", (e: any) => {
        const ids: string[] = [];
        for (const b of e.batch ?? [])
          for (const s of b.selected ?? []) {
            const series = (option.series as any[])[s.seriesIndex];
            for (const i of s.dataIndex)
              if (series.data[i]?.sampleId) ids.push(series.data[i].sampleId);
          }
        onBrush(ids);
      });
  }, [option, onClick, onBrush]);
  return <div className="chart" ref={ref} style={{ height }} />;
}
export const grid = { left: 40, right: 20, top: 30, bottom: 35 };
export const axis = {
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: "#edf0f5" } },
};
