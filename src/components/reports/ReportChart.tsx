import React, { useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

interface ReportChartProps {
  type: 'bar' | 'pie' | 'line';
  data: any;
  options?: any;
  onChartReady?: (canvas: HTMLCanvasElement) => void;
  title?: string;
}

const ReportChart: React.FC<ReportChartProps> = ({ 
  type, 
  data, 
  options = {}, 
  onChartReady,
  title 
}) => {
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (chartRef.current && onChartReady) {
      const canvas = chartRef.current.canvas;
      if (canvas) {
        // Wait a bit for the chart to fully render
        setTimeout(() => onChartReady(canvas), 100);
      }
    }
  }, [onChartReady, data]);

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: !!title,
        text: title,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
    },
    ...options,
  };

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return <Bar ref={chartRef} data={data} options={defaultOptions} />;
      case 'pie':
        return <Pie ref={chartRef} data={data} options={defaultOptions} />;
      case 'line':
        return <Line ref={chartRef} data={data} options={defaultOptions} />;
      default:
        return <Bar ref={chartRef} data={data} options={defaultOptions} />;
    }
  };

  return (
    <div className="w-full h-64 mb-4">
      {renderChart()}
    </div>
  );
};

export default ReportChart;

// Helper functions to generate chart data
export const generateSiteVisitsChartData = (visits: any[]) => {
  const statusCounts = visits.reduce((acc, visit) => {
    const status = visit.Status || visit.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    labels: Object.keys(statusCounts),
    datasets: [
      {
        label: 'Site Visits by Status',
        data: Object.values(statusCounts),
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 205, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };
};

export const generateProjectBudgetChartData = (projects: any[]) => {
  const labels = projects.slice(0, 10).map(p => p['Project Name'] || p.name || 'Unknown');
  const budgetData = projects.slice(0, 10).map(p => p['Budget Total'] || p.budget?.total || 0);
  const allocatedData = projects.slice(0, 10).map(p => p['Budget Allocated'] || p.budget?.allocated || 0);

  return {
    labels,
    datasets: [
      {
        label: 'Total Budget',
        data: budgetData,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
      {
        label: 'Allocated Budget',
        data: allocatedData,
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      },
    ],
  };
};

export const generateMMPProgressChartData = (mmpFiles: any[]) => {
  const labels = mmpFiles.slice(0, 10).map(m => m.Name || m.name || 'Unknown');
  const entriesData = mmpFiles.slice(0, 10).map(m => m.Entries || m.entries || 0);
  const processedData = mmpFiles.slice(0, 10).map(m => m['Processed Entries'] || m.processed_entries || 0);

  return {
    labels,
    datasets: [
      {
        label: 'Total Entries',
        data: entriesData,
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
      {
        label: 'Processed Entries',
        data: processedData,
        backgroundColor: 'rgba(153, 102, 255, 0.8)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1,
      },
    ],
  };
};

export const generateTeamPerformanceChartData = (teamData: any[]) => {
  const labels = teamData.map(t => t.User || t.user || 'Unknown');
  const assignedData = teamData.map(t => t['Assigned Visits'] || t.assigned || 0);
  const completedData = teamData.map(t => t['Completed Visits'] || t.completed || 0);

  return {
    labels,
    datasets: [
      {
        label: 'Assigned Visits',
        data: assignedData,
        backgroundColor: 'rgba(255, 205, 86, 0.8)',
        borderColor: 'rgba(255, 205, 86, 1)',
        borderWidth: 1,
      },
      {
        label: 'Completed Visits',
        data: completedData,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };
};
